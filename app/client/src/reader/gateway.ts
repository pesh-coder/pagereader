import { config } from '../payments/config.js'
import type { Spend } from '../payments/wallet-client.js'
import { savedBookmark, saveDisplayedBookmark } from './bookmarks.js'

export { config }
export type { Spend }
export interface Book {
  id: string
  gid: number
  title: string
  author: string
  mode: 'reader' | 'excerpt'
  editionId?: string
  pages?: number
  excerpt?: string
  chapter?: string
  sourceUrl: string
}
export interface Purchase {
  page: number
  txid: string
  sats: number
  feeSats?: number
}
export interface ReaderPage {
  editionId: string
  page: number
  paragraphs: string[]
  purchase?: Purchase
}
interface Me {
  identityKey: string
  purchases: Purchase[]
  bookmark: { page: number; displayed_at: number } | null
}
interface Status {
  purchase: Purchase | null
  intent: { request_id: string; state: string; txid: string | null } | null
}
export type HistoryState = 'idle' | 'loading' | 'ready' | 'error'
export class ReaderError extends Error {
  readonly action: 'connect' | 'retry' | 'check'
  details?: string[]
  constructor(message: string, action: 'connect' | 'retry' | 'check') {
    super(message)
    this.action = action
  }
}
type OpenWallet = (typeof import('../payments/wallet-client.js'))['openWallet']
export interface ReaderGateway {
  library(): Promise<{ books: Book[]; purchasesPaused: boolean }>
  page(book: Book, page: number, recoveryOnly?: boolean): Promise<ReaderPage>
  bookmark(book: Book, page: number, displayedAt: number): Promise<void>
  receipts(): Spend[]
  owned(): Purchase[]
  resumePage(book?: Book): Promise<number | null>
  hasIdentity(): boolean
  identity(): string | null
  historyState(): HistoryState
  walletVersion(): string | null
  connect(book?: Book): Promise<void>
  disconnect(): void
  savedPage(book: Book): number | null
  reconcileCosts(): Promise<{ matched: number; missing: number }>
}
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 503)
      throw new ReaderError(
        'New purchases are temporarily unavailable. Purchased pages remain accessible.',
        'check',
      )
    if (response.status === 429)
      throw new ReaderError(
        'Too many requests. Please wait a moment, then try again.',
        'check',
      )
    throw new ReaderError(
      'We couldn’t confirm whether the payment completed. Your current page is still available.',
      'check',
    )
  }
  return response.json() as Promise<T>
}

// The UI sees one interface. All paid operations use the reader's guarded
// AuthFetch + journal, which calls the generated wallet-acquisition helper.
export function createReaderGateway(
  changed: () => void,
  walletOpener?: OpenWallet,
): ReaderGateway {
  let wallet:
    | Awaited<
        ReturnType<
          (typeof import('../payments/wallet-client.js'))['openWallet']
        >
      >
    | undefined
  let me: Me | undefined,
    edition = '',
    requested = 1,
    allowSpend = false
  let paused = true
  let history: HistoryState = 'idle'
  let lastWalletFailure: { method: string; code?: number | string } | undefined
  let lastHttp: { path: string; status: number } | undefined
  let checkedStatus: Status | undefined
  const api = (path: string, selectedEdition = edition) =>
    `/api/editions/${encodeURIComponent(selectedEdition)}/${path}`
  const checkPage = (body: ReaderPage, book: Book, page: number) => {
    if (
      body.editionId !== book.editionId ||
      body.page !== page ||
      !Array.isArray(body.paragraphs) ||
      !body.paragraphs.every((text) => typeof text === 'string') ||
      (body.purchase && body.purchase.page !== page)
    )
      throw new Error(
        'Server returned a different edition or page. Your current text is kept.',
      )
    return body
  }
  const ledgerKey = 'pagestream-spike-spends-v1' // preserve existing evidence
  const loadSpends = (): Map<string, Spend> => {
    try {
      return new Map(
        Object.entries(JSON.parse(localStorage.getItem(ledgerKey) ?? '{}')),
      )
    } catch {
      throw new Error(
        'Saved payment history could not be read. Payments are blocked until it is recovered.',
      )
    }
  }
  const saveSpend = (spend: Spend) => {
    const spends = loadSpends()
    spends.set(spend.txid, { ...spend, edition: spend.edition ?? edition })
    localStorage.setItem(ledgerKey, JSON.stringify(Object.fromEntries(spends)))
    changed()
  }
  const readOnly = async <T>(path: string, method = 'GET', body?: unknown) => {
    if (!wallet)
      throw new Error('Request page 3 to access your wallet identity.')
    // AuthFetch cannot create a payment on any read-only route.
    return json<T>(
      await wallet.auth.fetch(location.origin + path, {
        method,
        paymentRetryAttempts: 1,
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
              headers: { 'Content-Type': 'application/json' },
            }),
      }),
    )
  }
  const refreshMe = async () => {
    const selectedWallet = wallet,
      selectedEdition = edition
    if (!selectedWallet || !selectedEdition) return
    history = 'loading'
    changed()
    try {
      const result = await readOnly<Me>(api('me'))
      if (wallet !== selectedWallet || edition !== selectedEdition) return
      if (result.identityKey !== wallet!.identityKey)
        throw new Error('Wallet identity did not match server identity.')
      me = result
      const spends = loadSpends()
      for (const purchase of me.purchases) {
        const known = spends.get(purchase.txid)
        // Verified receipt fees travel to another browser with ownership. Missing
        // server evidence still falls back to an original local payment proof.
        saveSpend({
          ...known,
          ...purchase,
          identityKey: wallet!.identityKey,
          edition,
          feeSats:
            purchase.feeSats ??
            known?.feeSats ??
            wallet!.paymentFee?.(edition, purchase.page, purchase.txid) ??
            null,
          state: 'confirmed',
        })
      }
      history = 'ready'
    } catch (error) {
      if (wallet === selectedWallet && edition === selectedEdition)
        history = 'error'
      throw error
    } finally {
      changed()
    }
  }
  const acquire = async () => {
    if (wallet) {
      if (!me && edition) await refreshMe()
      return
    }
    const openWallet =
      walletOpener ?? (await import('../payments/wallet-client.js')).openWallet
    try {
      wallet = await openWallet({
        call: (call) => {
          console.debug('Wallet timing', call)
          if (!call.ok && call.method !== 'page payment workflow')
            lastWalletFailure = { method: call.method, code: call.error?.code }
        },
        http: (http) => {
          console.debug('HTTP timing', http)
          lastHttp = { path: http.path, status: http.status }
        },
        spend: saveSpend,
        currentPage: () => requested,
        canSpend: () => allowSpend,
      })
      changed()
    } catch (error) {
      console.warn('Wallet acquisition failed', error)
      throw new ReaderError('We couldn’t connect to your wallet.', 'connect')
    }
    if (edition) await refreshMe()
  }
  const paidResponse = async (
    response: Response,
    page: number,
  ): Promise<ReaderPage> => {
    if (response.ok) return json(response)
    allowSpend = false
    const status = await readOnly<Status>(api(`status/${page}`))
    if (status.purchase) return readOnly(api(`owned/${page}`))
    return json(response)
  }
  return {
    async library() {
      const result = await json<{ books: Book[]; purchasesPaused: boolean }>(
        await fetch('/api/library'),
      )
      paused = result.purchasesPaused
      return result
    },
    receipts: () =>
      wallet
        ? [...loadSpends().values()].filter(
            (s) =>
              s.identityKey === wallet!.identityKey && s.edition === edition,
          )
        : [],
    owned: () => me?.purchases ?? [],
    hasIdentity: () => Boolean(wallet),
    identity: () => wallet?.identityKey ?? null,
    walletVersion: () => wallet?.version ?? null,
    historyState: () => history,
    async connect(book) {
      allowSpend = false
      if (book?.editionId && edition !== book.editionId) {
        edition = book.editionId
        me = undefined
        history = 'idle'
      }
      await acquire()
    },
    disconnect() {
      // Drop only this app's active connection. Durable proofs, ownership and
      // wallet-side grants are never deleted or revoked by logging out.
      allowSpend = false
      wallet = undefined
      me = undefined
      history = 'idle'
      changed()
    },
    savedPage: (book) => savedBookmark(book)?.page ?? null,
    async reconcileCosts() {
      allowSpend = false
      if (!wallet || !edition)
        throw new Error(
          'Open your saved page first to access its wallet history. No payment is needed.',
        )
      const selectedEdition = edition,
        identity = wallet.identityKey
      const costs = new Map(
        (await wallet.readActionCosts()).map((cost) => [cost.txid, cost]),
      )
      if (edition !== selectedEdition || wallet.identityKey !== identity)
        throw new Error('The selected book changed. Existing costs were kept.')
      const spends = loadSpends()
      let matched = 0,
        missing = 0
      // Validate the entire update before writing. Native net debit proves total
      // wallet cost, not necessarily the miner fee; never relabel it as a fee.
      for (const [txid, spend] of spends) {
        if (spend.identityKey !== identity || spend.edition !== selectedEdition)
          continue
        const cost = costs.get(txid)
        if (!cost) {
          missing++
          continue
        }
        if (cost.debitSats < spend.sats + (spend.feeSats ?? 0))
          throw new Error(
            'Wallet cost conflicts with the recorded payment. Existing costs were kept.',
          )
        spends.set(txid, {
          ...spend,
          walletDebitSats: cost.debitSats,
          walletStatus: cost.status,
        })
        matched++
      }
      localStorage.setItem(
        ledgerKey,
        JSON.stringify(Object.fromEntries(spends)),
      )
      changed()
      return { matched, missing }
    },
    async resumePage(book) {
      // Explicit resume is identity-only: a fresh device need not buy/open page
      // three first. Ordinary library/free-page browsing never calls this.
      allowSpend = false
      if (book) {
        if (book.mode !== 'reader' || !book.editionId)
          throw new Error('No saved reader edition is available.')
        if (edition !== book.editionId) {
          edition = book.editionId
          me = undefined
          history = 'idle'
        }
      } else if (!wallet) return null
      if (!wallet || !me) await acquire()
      else await refreshMe()
      const page = me?.bookmark?.page ?? null
      if (
        page !== null &&
        (!Number.isInteger(page) ||
          page < 1 ||
          (book?.pages !== undefined && page > book.pages))
      )
        throw new Error('The saved bookmark is not valid for this edition.')
      return page
    },
    async bookmark(book, page, displayedAt) {
      // Free reading still has a local bookmark without acquiring a wallet.
      saveDisplayedBookmark(book, page, displayedAt)
      if (wallet && book.mode === 'reader' && book.editionId)
        await readOnly(api('bookmarks', book.editionId), 'PUT', {
          page,
          displayedAt,
        })
    },
    async page(book, page, recoveryOnly = false) {
      if (
        book.mode !== 'reader' ||
        !book.editionId ||
        !Number.isInteger(page) ||
        page < 1 ||
        page > (book.pages ?? 0)
      )
        throw new Error('This title currently has an opening excerpt only.')
      if (edition !== book.editionId) {
        edition = book.editionId
        me = undefined
        history = 'idle'
      }
      if (page <= config.freePages) {
        let response: Response
        try {
          response = await fetch(api(`public/pages/${page}`))
        } catch {
          throw new ReaderError(
            'The free preview couldn’t load. Please try again.',
            'retry',
          )
        }
        if (!response.ok)
          throw new ReaderError(
            'The free preview couldn’t load. Please try again.',
            'retry',
          )
        return checkPage((await response.json()) as ReaderPage, book, page)
      }
      if (!wallet && page !== config.freePages + 1 && !recoveryOnly)
        throw new Error('Open page 3 first to access your owned pages.')
      requested = page
      allowSpend = false
      checkedStatus = undefined
      lastHttp = undefined
      lastWalletFailure = undefined
      try {
        await acquire()
        const status = await readOnly<Status>(api(`status/${page}`))
        checkedStatus = status
        let body: ReaderPage
        if (status.purchase) body = await readOnly(api(`owned/${page}`))
        else {
          let attempt = wallet!.getAttempt(edition, page)
          if (
            recoveryOnly && !attempt && status.intent?.state === 'challenged' &&
            !status.intent.txid
          ) {
            const requestId = status.intent.request_id
            await wallet!.reconcileUnpaidChallenge(edition, page, requestId, async () => {
              const current = await readOnly<Status>(api(`status/${page}`))
              checkedStatus = current
              return !current.purchase && current.intent?.request_id === requestId &&
                current.intent.state === 'challenged' && !current.intent.txid
            })
            attempt = wallet!.getAttempt(edition, page)
          }
          if (attempt?.proof)
            body = await paidResponse(
              await wallet!.recoverPayment(edition, page, true),
              page,
            )
          else if (status.intent?.txid)
            body = await readOnly(api(`recover/${page}`), 'POST')
          else {
            let retryable =
              attempt?.state === 'aborted' || attempt?.state === 'reserved'
            if (attempt?.state === 'prepared')
              retryable = await wallet!.cancelUnsigned(edition, page)
            if (
              retryable &&
              status.intent &&
              (status.intent.request_id !== attempt!.requestId ||
                status.intent.txid ||
                !['reserved', 'challenged'].includes(status.intent.state))
            )
              retryable = false
            if ((attempt || status.intent) && !retryable)
              throw new ReaderError(
                recoveryOnly
                  ? 'Payment checked: no completed page purchase was found. The earlier request is still unresolved, so a new payment remains blocked. See Payment details below.'
                  : 'We couldn’t confirm whether the payment completed. Check payment before trying another purchase.',
                'check',
              )
            if (retryable && recoveryOnly)
              throw new ReaderError(
                attempt?.retryReason === 'insufficient-funds'
                  ? 'Your wallet needs more funds. Your current page is still available.'
                  : attempt?.retryReason === 'not-started'
                    ? 'Payment checked: the wallet history contains only received funds, with no outgoing or pending transaction. Try purchase again to use the original request. This check did not make a payment.'
                  : 'Payment cancelled. Your current page is still available.',
                'retry',
              )
            if (recoveryOnly)
              throw new Error(
                'No existing payment was found. No new payment was attempted.',
              )
            if (paused)
              throw new Error(
                'New purchases are paused while recovery tests finish. Already owned pages remain available.',
              )
            const requestId = retryable
              ? attempt!.requestId
              : crypto.randomUUID()
            wallet!.beginPayment(edition, page, requestId)
            allowSpend = true
            body = await paidResponse(
              await wallet!.auth.fetch(location.origin + api(`pages/${page}`), {
                headers: { 'x-bsv-request-id': requestId },
                paymentRetryAttempts: 1,
                labels: ['pagestream reader'],
              }),
              page,
            )
          }
        }
        checkPage(body, book, page)
        if (body.purchase) {
          wallet!.confirmPayment(edition, page, body.purchase.txid)
          const existing = loadSpends().get(body.purchase.txid)
          saveSpend({
            ...existing,
            ...body.purchase,
            identityKey: wallet!.identityKey,
            edition,
            state: 'confirmed',
            feeSats:
              body.purchase.feeSats ??
              existing?.feeSats ??
              wallet!.paymentFee?.(edition, page, body.purchase.txid) ??
              null,
          })
          me!.purchases = [
            ...me!.purchases.filter((p) => p.page !== page),
            body.purchase,
          ]
        }
        return body
      } catch (error) {
        const attempt = wallet?.getAttempt(edition, page)
        const failure = attempt?.lastFailure ?? lastWalletFailure
        const details = [
          `Page ${page}; wallet stage: ${attempt?.state ?? 'no local attempt'}.`,
          `Server payment stage: ${checkedStatus?.intent?.state ?? (checkedStatus ? 'no intent' : 'status unavailable')}.`,
          ...(failure
            ? [`Wallet call: ${failure.method}; error code: ${failure.code ?? 'not supplied'}.`]
            : ['No wallet failure code was saved for this attempt.']),
          ...(lastHttp ? [`Last HTTP result: ${lastHttp.status} (${lastHttp.path}).`] : []),
        ]
        const reported = (message: string, action: 'connect' | 'retry' | 'check') => {
          const result = new ReaderError(message, action)
          result.details = details
          return result
        }
        for (const spend of loadSpends().values())
          if (
            spend.identityKey === wallet?.identityKey &&
            spend.edition === edition &&
            spend.page === page &&
            spend.state === 'pending'
          )
            saveSpend({ ...spend, state: 'unresolved' })
        if (error instanceof ReaderError) {
          error.details = details
          throw error
        }
        console.warn('Page request failed', error)
        if (attempt?.state === 'aborted')
          throw reported(
            attempt.retryReason === 'insufficient-funds'
              ? 'Your wallet needs more funds. Add funds, then try purchase again.'
              : attempt.retryReason === 'fee-limit'
                ? 'The transaction fee is unknown or above the 1-sat page limit. Check your wallet’s fee setting, then try again.'
                : 'Payment cancelled. Your current page is still available.',
            'retry',
          )
        if (attempt?.state === 'prepared')
          throw reported(
            'The unsigned payment needs to be cancelled before you try again. Choose Check payment.',
            'check',
          )
        if (attempt && attempt.state !== 'reserved')
          throw reported(
            'We couldn’t confirm whether the payment completed. Your current page is still available.',
            'check',
          )
        if (attempt?.state === 'reserved')
          throw reported(
            'The payment request could not start. Your current page is still available.',
            'retry',
          )
        throw reported(
          error instanceof Error ? error.message : 'The page request failed.',
          'check',
        )
      } finally {
        allowSpend = false
        changed()
      }
    },
  }
}
