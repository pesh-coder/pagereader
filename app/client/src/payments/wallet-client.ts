// Loaded only after an explicit request beyond the public preview.
import { AuthFetch, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { connectDesktopWallet } from '../bsv/walletAcquisition.js'
import { config } from './config.js'
import { retainedAncestors } from './payment-ancestors.js'
import { networkFee } from './payment-cost.js'
import { walletDiagnostic, type WalletDiagnostic } from './wallet-diagnostic.js'
import {
  preparePayment,
  broadcastPayment,
  type PaymentAttempt,
} from './payment-action.js'
import { reconcileUnsignedPreparation } from './unsigned-preparation.js'
import { recoveryHistoryFingerprint, readActionCosts, verifyIncomingOnlyHistory } from './wallet-history.js'
import { PaymentDelivery, type DeliveryOutcome } from './payment-delivery.js'
import type { SessionWallet } from './channel-session.js'
import { releaseUnsentPreparations } from './release-preparations.js'

export interface WalletCall {
  method: string
  ms: number
  ok: boolean
  paymentMetrics?: { knownAncestors: number; proofBytes: number; transportBytes: number; deliveryMode?: 'serial' | 'overlap' }
  error?: {
    name?: string
    code?: number | string
    message?: string
    diagnostic?: WalletDiagnostic
    totalSatoshisNeeded?: number
    moreSatoshisNeeded?: number
  }
}
export interface HttpCall {
  path: string
  status: number
  ms: number
  serverTiming?: string
}
export interface Spend {
  txid: string
  identityKey: string
  edition?: string
  page: number
  sats: number
  feeSats?: number | null
  walletDebitSats?: number
  walletStatus?: string
  state: 'pending' | 'confirmed' | 'unresolved'
}
export async function openWallet(callbacks: {
  call: (call: WalletCall) => void
  http: (call: HttpCall) => void
  spend: (spend: Spend) => void
  currentPage: () => number
  canSpend: () => boolean
}, options: {
  acquireWallet?: typeof connectDesktopWallet
  paymentDeliveryTarget?: string
} = {}) {
  const start = performance.now()
  const { wallet, identityKey } = await (options.acquireWallet ?? connectDesktopWallet)().catch(
    (error) => {
      callbacks.call({
        method: 'wallet acquisition (isAuthenticated + identity key)',
        ms: performance.now() - start,
        ok: false,
        error: walletError(error),
      })
      throw error
    },
  )
  callbacks.call({
    method: 'wallet acquisition (isAuthenticated + identity key)',
    ms: performance.now() - start,
    ok: true,
  })
  const versionStarted = performance.now()
  const version = await wallet.getVersion({})
  callbacks.call({
    method: 'getVersion',
    ms: performance.now() - versionStarted,
    ok: true,
  })
  const networkStarted = performance.now()
  const network = await wallet.getNetwork({}).catch((error) => {
    callbacks.call({
      method: 'getNetwork',
      ms: performance.now() - networkStarted,
      ok: false,
      error: walletError(error),
    })
    throw error
  })
  callbacks.call({
    method: 'getNetwork',
    ms: performance.now() - networkStarted,
    ok: true,
  })
  if (network.network !== 'mainnet')
    throw new Error('Reader wallet must be on mainnet')
  const ancestorCache = new Map<string, number[]>()
  let activeAttemptKey: string | undefined
  const attemptKey = (edition: string, page: number) =>
    `pagestream-payment-v2:${identityKey}:${edition}:${page}`
  const getAttempt = (
    edition: string,
    page: number,
  ): PaymentAttempt | undefined => {
    const raw = localStorage.getItem(attemptKey(edition, page))
    return raw ? JSON.parse(raw) : undefined
  }
  const journal = {
    get: (): PaymentAttempt | undefined =>
      activeAttemptKey
        ? (JSON.parse(localStorage.getItem(activeAttemptKey) ?? 'null') ??
          undefined)
        : undefined,
    save: (attempt: PaymentAttempt) => {
      if (!activeAttemptKey) throw new Error('Payment journal is not active')
      localStorage.setItem(activeAttemptKey, JSON.stringify(attempt))
    },
  }
  const lockName = `pagestream-payment:${identityKey}`
  let activeDelivery: PaymentDelivery | undefined
  // Build-time pilot switch. Keep ordinary/native delivery serial until the
  // original-transaction overlap has been checked on the installed wallets.
  const overlapTarget = options.paymentDeliveryTarget ?? (import.meta as ImportMeta & {
    env?: { VITE_PAGESTREAM_PAYMENT_OVERLAP_TARGET?: string }
  }).env?.VITE_PAGESTREAM_PAYMENT_OVERLAP_TARGET
  const paymentWallet = new Proxy(wallet, {
    get(target, property) {
      const value = Reflect.get(target, property)
      if (typeof value !== 'function') return value
      return async (...args: unknown[]) => {
        const started = performance.now()
        try {
          const result = await value.apply(target, args)
          callbacks.call({
            method: String(property),
            ms: performance.now() - started,
            ok: true,
          })
          return result
        } catch (error) {
          // Keep a small, non-secret failure marker across reloads. Do not save
          // wallet arguments, error messages, stacks or transaction bytes here.
          try {
            const attempt = journal.get()
            if (attempt) {
              const { code, diagnostic } = walletError(error)
              journal.save({
                ...attempt,
                lastFailure: {
                  method: String(property),
                  ...(diagnostic ? { diagnostic } : {}),
                  ...(typeof code === 'number' ||
                  (typeof code === 'string' && /^[\w-]{1,80}$/.test(code))
                    ? { code }
                    : {}),
                },
              })
            }
          } catch {
            // Retain the original error if browser storage is unavailable.
          }
          callbacks.call({
            method: String(property),
            ms: performance.now() - started,
            ok: false,
            error: walletError(error),
          })
          throw error
        }
      }
    },
  })
  const observed = new Proxy(wallet, {
    get(target, property) {
      const value = Reflect.get(target, property)
      if (typeof value !== 'function') return value
      return async (...args: unknown[]) => {
        if (property === 'createAction' && !callbacks.canSpend())
          throw new Error(
            'This request is read-only; payment creation is disabled',
          )
        if (property === 'createAction') {
          const action = args[0] as Parameters<
            WalletInterface['createAction']
          >[0]
          if (
            action.outputs?.length !== 1 ||
            action.outputs[0].satoshis !== config.priceSats
          )
            throw new Error(
              'Refused a payment that differs from the configured page price',
            )
        }
        const started = performance.now()
        let ok = false
        let failure: WalletCall['error']
        let paymentMetrics: WalletCall['paymentMetrics']
        let broadcastDelivery: PaymentDelivery | undefined
        const execute = async () => {
          try {
            if (property === 'createAction' && !callbacks.canSpend())
              throw new Error('The purchase is no longer active; no payment was created')
            const result =
              property === 'createAction'
                ? await preparePayment(
                    paymentWallet,
                    args[0] as Parameters<WalletInterface['createAction']>[0],
                    journal,
                    args[1] as string | undefined,
                    txid => {
                      if (ancestorCache.has(txid)) return ancestorCache.get(txid)
                      const ledger = JSON.parse(localStorage.getItem('pagestream-spike-spends-v1') ?? '{}') as Record<string, Spend>
                      const spend = ledger[txid]
                      if (!spend || spend.identityKey !== identityKey || !spend.edition) return undefined
                      const saved = getAttempt(spend.edition, spend.page)
                      return saved?.identityKey === identityKey && saved.state === 'confirmed' && saved.txid === txid && saved.proof
                        ? Utils.toArray(saved.proof.transaction, 'base64') : undefined
                    },
                  )
                : await value.apply(target, args)
            if (property === 'createAction') {
              paymentMetrics = { knownAncestors: result.ancestorCount ?? 0,
                proofBytes: result.tx?.length ?? 0, transportBytes: result.transportTx?.length ?? result.tx?.length ?? 0,
                deliveryMode: activeDelivery ? 'overlap' : 'serial' }
              const txid =
                result.txid ??
                (result.tx
                  ? Transaction.fromAtomicBEEF(result.tx).id('hex')
                  : undefined)
              if (!txid)
                throw new Error(
                  'Wallet returned no payment txid; reconcile before continuing',
                )
              const action = args[0] as Parameters<
                WalletInterface['createAction']
              >[0]
              const feeSats = result.tx
                ? networkFee(Transaction.fromAtomicBEEF(result.tx))
                : null
              callbacks.spend({
                txid,
                identityKey,
                page: callbacks.currentPage(),
                sats: action.outputs?.[0]?.satoshis ?? 0,
                feeSats,
                state: 'pending',
              })
              const send = () => broadcastPayment(
                paymentWallet,
                journal.get()!,
                args[1] as string | undefined,
                journal,
              )
              if (activeDelivery) {
                broadcastDelivery = activeDelivery
                broadcastDelivery.startBroadcast(send)
              }
              else await send()
            }
            ok = true
            // Keep full proofs for fees/recovery; use only server-negotiated
            // compact ancestry for the BRC-105 HTTP submission.
            return property === 'createAction' && result.transportTx
              ? { ...result, tx: result.transportTx } : result
          } catch (error) {
            failure = walletError(error)
            throw error
          } finally {
            const report = (sent?: DeliveryOutcome<unknown>) => callbacks.call({
              method:
                property === 'createAction'
                  ? 'page payment workflow'
                  : String(property),
              ms: performance.now() - started,
              ok: ok && (!sent || sent.ok),
              ...(paymentMetrics ? { paymentMetrics } : {}),
              ...(failure ? { error: failure } : sent?.ok === false ? { error: walletError(sent.error) } : {}),
            })
            // Keep the workflow's real elapsed time and failure result even
            // when receiver acceptance overlaps the payer's broadcast wait.
            if (broadcastDelivery) broadcastDelivery.observeBroadcast(report)
            else report()
          }
        }
        return property === 'createAction' && navigator.locks && !activeDelivery
          ? navigator.locks.request(lockName, execute)
          : execute()
      }
    },
  })
  const instrumentedFetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    )
    if (url.origin !== location.origin)
      throw new Error('Probe transport must stay on its own origin')
    const start = performance.now()
    const headers = new Headers(init?.headers)
    const correlationId = headers.get('x-bsv-request-id')
    if (correlationId) headers.set('x-request-id', correlationId) // diagnostic only; signed authority uses x-bsv-request-id
    const response = await fetch(input, {
      ...init,
      headers,
      redirect: 'error',
      credentials: 'omit',
    })
    const serverTiming = response.headers.get('Server-Timing')
    callbacks.http({
      path: url.pathname,
      status: response.status,
      ms: performance.now() - start,
      ...(serverTiming ? { serverTiming } : {}),
    })
    if (
      response.status === 402 &&
      !/^\/api\/(?:editions\/[^/]+\/)?pages\/\d+$/.test(url.pathname)
    )
      throw new Error('Payment challenge on a read-only route refused')
    return response
  }
  const auth = new AuthFetch(
    observed,
    undefined,
    undefined,
    location.host,
    undefined,
    instrumentedFetch,
  )
  return {
    auth,
    // Reading sessions: timed wallet calls, and a plain timed same-origin POST
    // for page payments, which are authenticated by their channel signature.
    sessionWallet: paymentWallet as unknown as SessionWallet,
    // Free coins the wallet still reserves for this app's unsent page payments.
    releaseUnsentPreparations: () => releaseUnsentPreparations({ identityKey, wallet: paymentWallet, storage: localStorage, originator: location.host }),
    // No keepalive: it can route requests off the page's warm connection, and
    // leaving no longer needs a request to finish after the page closes.
    sessionPost: (path: string, body: unknown) => instrumentedFetch(location.origin + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    async fetchPaidPage(...args: Parameters<AuthFetch['fetch']>) {
      if (activeDelivery) throw new Error('Another payment delivery is still active')
      const attempt = journal.get()
      const path = new URL(args[0], location.origin).pathname
      if (!attempt || (path !== `/api/editions/${encodeURIComponent(attempt.edition)}/pages/${attempt.page}` &&
        path !== `/api/pages/${attempt.page}`))
        throw new Error('Paid request does not match the original payment attempt')
      const overlapEnabled = overlapTarget === `${identityKey}/${attempt.edition}/${attempt.page}`
      if (!overlapEnabled) return auth.fetch(...args)
      const delivery = new PaymentDelivery()
      activeDelivery = delivery
      const execute = () => delivery.run(() => auth.fetch(...args))
      try { return await (navigator.locks ? navigator.locks.request(lockName, execute) : execute()) }
      finally { activeDelivery = undefined }
    },
    identityKey,
    retainPaymentAncestors(values: { txid: string; transaction: string }[]) {
      ancestorCache.clear()
      for (const value of values.slice(0, 8)) {
        const valid = retainedAncestors([value.txid], () => Utils.toArray(value.transaction, 'base64'))
        for (const [id, raw] of valid) ancestorCache.set(id, raw)
      }
    },
    getAttempt,
    version: version.version,
    network: 'mainnet' as const,
    readActionCosts: () => readActionCosts(paymentWallet),
    async reconcileUnsignedPreparation(edition: string, page: number, requestId: string, recheck: () => Promise<boolean>, acceptedTxids: string[] = []) {
      if (!navigator.locks) throw new Error('This browser cannot coordinate unsigned recovery across tabs. The original request was kept.')
      return navigator.locks.request(lockName, () => reconcileUnsignedPreparation({
        identityKey, edition, page, requestId,
        get: () => getAttempt(edition, page),
        save: attempt => localStorage.setItem(attemptKey(edition, page), JSON.stringify(attempt)),
        historyFingerprint: () => recoveryHistoryFingerprint(wallet, acceptedTxids), recheck,
      }))
    },
    async reconcileUnpaidChallenge(
      edition: string,
      page: number,
      requestId: string,
      recheck: () => Promise<boolean>,
    ) {
      if (!navigator.locks)
        throw new Error(
          'This browser cannot safely coordinate payment recovery across tabs. The original request was kept.',
        )
      return navigator.locks.request(lockName, async () => {
        if (getAttempt(edition, page)) return false
        await verifyIncomingOnlyHistory(paymentWallet)
        if (!(await recheck()) || getAttempt(edition, page)) return false
        localStorage.setItem(
          attemptKey(edition, page),
          JSON.stringify({
            identityKey, edition, page, requestId,
            state: 'aborted', retryReason: 'not-started',
          } satisfies PaymentAttempt),
        )
        return true
      })
    },
    paymentFee(edition: string, page: number, txid: string): number | null {
      try {
        const attempt = getAttempt(edition, page)
        if (
          !attempt?.proof ||
          attempt.txid !== txid ||
          attempt.identityKey !== identityKey ||
          attempt.edition !== edition ||
          attempt.page !== page
        )
          return null
        const transaction = Transaction.fromAtomicBEEF(
          Utils.toArray(attempt.proof.transaction, 'base64'),
        )
        return transaction.id('hex') === txid ? networkFee(transaction) : null
      } catch {
        return null
      }
    },
    beginPayment(edition: string, page: number, requestId: string, approvedMaxFeeSats?: number) {
      if (activeDelivery) throw new Error('The original payment delivery is still active')
      activeAttemptKey = attemptKey(edition, page)
      const existing = journal.get()
      if (
        existing &&
        (!['aborted', 'reserved'].includes(existing.state) ||
          existing.requestId !== requestId)
      )
        throw new Error(
          'A durable payment attempt already exists; reconcile without paying again',
        )
      journal.save({
        identityKey,
        edition,
        page,
        requestId,
        state: 'reserved',
        ...(approvedMaxFeeSats === undefined ? {} : { approvedMaxFeeSats }),
      })
    },
    async cancelUnsigned(edition: string, page: number) {
      const attempt = getAttempt(edition, page)
      if (
        !attempt ||
        attempt.state !== 'prepared' ||
        !attempt.reference ||
        attempt.txid ||
        attempt.proof
      )
        return false
      const result = await paymentWallet.abortAction(
        { reference: attempt.reference },
        location.host,
      )
      if (!result.aborted) return false
      localStorage.setItem(
        attemptKey(edition, page),
        JSON.stringify({
          ...attempt,
          state: 'aborted',
          retryReason: 'cancelled',
        }),
      )
      return true
    },
    confirmPayment(edition: string, page: number, txid: string) {
      const attempt = getAttempt(edition, page)
      if (attempt?.txid === txid)
        localStorage.setItem(
          attemptKey(edition, page),
          JSON.stringify({ ...attempt, state: 'confirmed' }),
        )
    },
    async recoverPayment(edition: string, page: number, editionScoped = false) {
      if (activeDelivery) throw new Error('The original payment delivery is still active')
      const attempt = getAttempt(edition, page)
      if (!attempt?.proof || !attempt.txid || attempt.state !== 'signed')
        throw new Error(
          'No saved signed proof. This attempt needs reconciliation; no new payment will be created.',
        )
      callbacks.spend({
        txid: attempt.txid,
        identityKey,
        page,
        sats: config.priceSats,
        feeSats: attempt.feeSats,
        state: 'pending',
      })
      // Submit only the original transaction. A failed/unknown sendWith result
      // must remain visible instead of being swallowed before server acceptance.
      await broadcastPayment(paymentWallet, attempt, location.host, {
        get: () => getAttempt(edition, page),
        save: value => localStorage.setItem(attemptKey(edition, page), JSON.stringify(value)),
      })
      const path = editionScoped
        ? `/api/editions/${encodeURIComponent(edition)}/pages/${page}`
        : `/api/pages/${page}`
      return auth.fetch(location.origin + path, {
        headers: {
          'x-bsv-request-id': attempt.requestId,
          'x-bsv-payment': JSON.stringify(attempt.proof),
        },
        paymentRetryAttempts: 1,
      })
    },
  }
}

function walletError(error: unknown): NonNullable<WalletCall['error']> {
  if (!error || typeof error !== 'object')
    return { message: 'Wallet operation failed' }
  const value = error as Record<string, unknown>
  const diagnostic = walletDiagnostic(error)
  // Capture diagnostics only, never wallet arguments, key material, transaction bytes or stacks.
  return {
    ...(diagnostic ? { diagnostic } : {}),
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(typeof value.code === 'number' || typeof value.code === 'string'
      ? { code: value.code }
      : {}),
    ...(typeof value.message === 'string'
      ? { message: value.message.slice(0, 1200) }
      : {}),
    ...(typeof value.totalSatoshisNeeded === 'number'
      ? { totalSatoshisNeeded: value.totalSatoshisNeeded }
      : {}),
    ...(typeof value.moreSatoshisNeeded === 'number'
      ? { moreSatoshisNeeded: value.moreSatoshisNeeded }
      : {}),
  }
}
