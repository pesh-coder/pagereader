import { config } from '../payments/config.js'
import type { WalletDiagnostic } from '../payments/wallet-diagnostic.js'
import type { Spend, WalletCall, HttpCall } from '../payments/wallet-client.js'
import { savedBookmark, saveDisplayedBookmark } from './bookmarks.js'
import type { SessionClient, SessionPage, SessionRecord } from '../payments/channel-session.js'

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
  serverIdentity?: string
  sessionsEnabled?: boolean
  sessionMaxSats?: number
  paymentAncestors?: { txid: string; transaction: string }[]
  identityKey: string
  purchases: Purchase[]
  bookmark: { page: number; displayed_at: number } | null
}
interface Status {
  purchase: Purchase | null
  intent: { request_id: string; state: string; txid: string | null } | null
}
export type HistoryState = 'idle' | 'loading' | 'ready' | 'error'
export interface PageFeeApproval {
  identityKey: string
  edition: string
  page: number
  requestId: string
  maxFeeSats: number
}
export class ReaderError extends Error {
  readonly action: 'connect' | 'retry' | 'check'
  details?: string[]
  feeApproval?: PageFeeApproval
  constructor(message: string, action: 'connect' | 'retry' | 'check') {
    super(message)
    this.action = action
  }
}
type OpenWallet = (typeof import('../payments/wallet-client.js'))['openWallet']
export interface ReaderGateway {
  library(): Promise<{ books: Book[]; purchasesPaused: boolean }>
  page(book: Book, page: number, recoveryOnly?: boolean, feeApproval?: PageFeeApproval): Promise<ReaderPage>
  bookmark(book: Book, page: number, displayedAt: number): Promise<void>
  receipts(): Spend[]
  owned(): Purchase[]
  resumePage(book?: Book): Promise<number | null>
  needsPaymentCheck(book: Book, page: number): boolean
  hasIdentity(): boolean
  identity(): string | null
  historyState(): HistoryState
  walletVersion(): string | null
  network(): string | null
  connect(book?: Book): Promise<void>
  disconnect(): void
  approveReadingFees(): void
  savedPage(book: Book): number | null
  reconcileCosts(): Promise<{ matched: number; missing: number }>
  preparationStatus?(book: Book, page: number): Promise<'clear' | 'owned' | 'existing'>
  sessionStatus?(book: Book): SessionStatus | null
  sessionsEnabled?(): boolean
  sessionMaxSats?(): number | null
  openSession?(book: Book, capacity: number, firstPage?: number): Promise<void>
  endSession?(book: Book): Promise<SessionStatus | null>
  leaveSession?(): void
}
export interface SessionStatus {
  state: SessionRecord['state']
  capacity: number
  paidSats: number
  pages: number
  remainingSats: number
  feeSats: number
  error?: string
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
  observer?: { wallet(call: WalletCall): void; http(call: HttpCall): void; paid?(txid: string): void },
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
  let sessionRevision = 0
  let readerOperationActive = false
  const exclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (readerOperationActive)
      throw new ReaderError('A reader request is still finishing. Please wait before starting another.', 'check')
    readerOperationActive = true
    try { return await operation() }
    finally { readerOperationActive = false }
  }
  const requireSession = (selectedWallet: typeof wallet, revision: number) => {
    if (!selectedWallet || wallet !== selectedWallet || sessionRevision !== revision)
      throw new ReaderError('The wallet connection changed. Reconnect to check the original payment.', 'connect')
  }
  let lastWalletFailure: { method: string; code?: number | string; diagnostic?: WalletDiagnostic } | undefined
  let lastHttp: { path: string; status: number } | undefined
  let checkedStatus: Status | undefined
  // Per-payment fee ceiling only, not a wallet spending budget. Never persisted:
  // reload, logout and another gateway require a new visible approval.
  let readingFeeConsent: { identityKey: string | null; maxFeeSats: number } | undefined
  // Reading sessions (payment channel). The client module loads with the wallet
  // bundle. Only sessions opened in this reader visit are used for payment;
  // older ones are settled and their change received.
  let session: SessionClient | undefined
  let sessionError: string | undefined
  const openedHere = new Set<string>()
  const sessionClient = async () => {
    if (!wallet) throw new ReaderError('Connect your wallet first.', 'connect')
    if (!session) {
      const { createSessionClient } = await import('../payments/channel-session.js')
      const selected = wallet
      session = createSessionClient({
        wallet: selected.sessionWallet, identityKey: selected.identityKey, storage: localStorage, post: selected.sessionPost,
        authJson: async <T>(path: string, method: string, body?: unknown) => {
          const response = await selected.auth.fetch(location.origin + path, {
            method, paymentRetryAttempts: 1,
            ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
          })
          const result = await response.json().catch(() => ({}))
          if (!response.ok) throw new ReaderError(result.error ?? 'The reading session request failed. Nothing new was paid.', 'check')
          return result as T
        },
      })
    }
    return session
  }
  const tidySession = (selectedEdition: string) => {
    const client = session, record = client?.load(selectedEdition)
    if (!client || !record || openedHere.has(record.channelId)) return
    const settle = record.state === 'open' ? client.close(selectedEdition) : Promise.resolve(record)
    if (['open', 'funded', 'closing', 'settled'].includes(record.state))
      void settle.then(() => client.receiveChange(selectedEdition)).then(changed, () => undefined)
  }
  const sessionPage = async (book: Book, page: number): Promise<ReaderPage> => {
    const client = session!, selectedWallet = wallet!, revision = sessionRevision, selectedEdition = edition
    const identityKey = selectedWallet.identityKey
    const accept = (body: SessionPage) => {
      if (wallet !== selectedWallet || sessionRevision !== revision) return
      const existing = loadSpends().get(body.purchase.txid)
      saveSpend({ ...existing, ...body.purchase, identityKey, edition: selectedEdition, feeSats: body.purchase.feeSats ?? 0, state: 'confirmed' })
      if (me && edition === selectedEdition)
        me.purchases = [...me.purchases.filter(p => p.page !== body.purchase.page), body.purchase]
      try { observer?.paid?.(body.purchase.txid) } catch { /* Diagnostics cannot interrupt payments. */ }
    }
    await client.idle()
    const record = client.load(selectedEdition)!
    const credited = record.pending ? undefined : client.takeCredit(selectedEdition, page)
    sessionError = undefined
    if (credited && record.terms) {
      // Show the page delivered with the previous payment now; pay it in the
      // background. The next page arrives with this payment's response.
      const paid = record.paid + record.terms.price
      const purchase = { page, txid: `channel:${record.channelId}:${paid / record.terms.price}`, sats: record.terms.price, feeSats: 0 }
      saveSpend({ ...purchase, identityKey, edition: selectedEdition, state: 'pending' })
      void client.pay(selectedEdition, page, accept).catch(error => {
        sessionError = error instanceof Error ? error.message : 'The page payment failed.'
        const spend = loadSpends().get(purchase.txid)
        if (spend?.state === 'pending') {
          // A definitive refusal paid nothing; a lost request is kept and resent.
          if ((error as { retryable?: boolean }).retryable) saveSpend({ ...spend, state: 'unresolved' })
          else dropSpend(purchase.txid)
        }
        changed()
      })
      return checkPage({ editionId: selectedEdition, page, paragraphs: credited.paragraphs, purchase }, book, page)
    }
    const body = await client.pay(selectedEdition, page, accept)
    return checkPage({ editionId: body.editionId, page: body.page, paragraphs: body.paragraphs, purchase: body.purchase }, book, page)
  }
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
  const dropSpend = (txid: string) => {
    const spends = loadSpends()
    spends.delete(txid)
    localStorage.setItem(ledgerKey, JSON.stringify(Object.fromEntries(spends)))
    changed()
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
    const selectedWallet = wallet, revision = sessionRevision
    const result = await json<T>(
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
    requireSession(selectedWallet, revision)
    return result
  }
  const refreshMe = async () => {
    const selectedWallet = wallet,
      selectedEdition = edition
    if (!selectedWallet || !selectedEdition) return
    history = 'loading'
    changed()
    try {
      const result = await readOnly<Me>(api('me') + '?ancestors=1')
      if (wallet !== selectedWallet || edition !== selectedEdition) return
      if (result.identityKey !== wallet!.identityKey)
        throw new Error('Wallet identity did not match server identity.')
      if (Array.isArray(result.paymentAncestors)) wallet!.retainPaymentAncestors?.(result.paymentAncestors)
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
    const revision = sessionRevision
    const openWallet =
      walletOpener ?? (await import('../payments/wallet-client.js')).openWallet
    try {
      const connected = await openWallet({
        call: (call) => {
          console.debug('Wallet timing', call)
          try { observer?.wallet(call) } catch { /* Diagnostics cannot interrupt payments. */ }
          if (!call.ok && call.method !== 'page payment workflow')
            lastWalletFailure = { method: call.method, code: call.error?.code, diagnostic: call.error?.diagnostic }
        },
        http: (http) => {
          console.debug('HTTP timing', http)
          try { observer?.http(http) } catch { /* Diagnostics cannot interrupt payments. */ }
          lastHttp = { path: http.path, status: http.status }
        },
        spend: saveSpend,
        currentPage: () => requested,
        canSpend: () => allowSpend,
      })
      if (revision !== sessionRevision)
        throw new ReaderError('The wallet connection changed. Reconnect when you are ready.', 'connect')
      wallet = connected
      await sessionClient()
      changed()
    } catch (error) {
      if (error instanceof ReaderError) throw error
      console.warn('Wallet acquisition failed', error)
      throw new ReaderError('We couldn’t connect to your wallet.', 'connect')
    }
    if (edition) {
      await refreshMe()
      tidySession(edition)
    }
  }
  const paidResponse = async (
    response: Response,
    page: number,
  ): Promise<ReaderPage> => {
    const selectedWallet = wallet, revision = sessionRevision
    requireSession(selectedWallet, revision)
    if (response.ok) {
      const body = await json<ReaderPage>(response)
      requireSession(selectedWallet, revision)
      return body
    }
    allowSpend = false
    const status = await readOnly<Status>(api(`status/${page}`))
    if (status.purchase) return readOnly(api(`owned/${page}`))
    return json(response)
  }
  const gateway: ReaderGateway = {
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
    needsPaymentCheck: (book, page) => {
      const state = book.editionId ? wallet?.getAttempt(book.editionId, page)?.state : undefined
      return Boolean(state && ['preparing', 'prepared', 'signing', 'signed'].includes(state))
    },
    network: () => wallet?.network ?? null,
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
      sessionRevision++
      readingFeeConsent = undefined
      session = undefined
      sessionError = undefined
      openedHere.clear()
      wallet = undefined
      me = undefined
      history = 'idle'
      changed()
    },
    approveReadingFees() {
      readingFeeConsent = {
        identityKey: wallet?.identityKey ?? null,
        maxFeeSats: config.provisional.readerMaxPageFeeSats,
      }
    },
    savedPage: (book) => savedBookmark(book)?.page ?? null,
    async reconcileCosts() {
      allowSpend = false
      if (!wallet || !edition)
        throw new Error(
          'Open your saved page first to access its wallet history. No payment is needed.',
        )
      const selectedEdition = edition,
        selectedWallet = wallet, revision = sessionRevision,
        identity = wallet.identityKey
      const costs = new Map(
        (await wallet.readActionCosts()).map((cost) => [cost.txid, cost]),
      )
      requireSession(selectedWallet, revision)
      if (edition !== selectedEdition)
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
      // A page shown on session credit becomes owned when its payment lands.
      await session?.idle()
      if (wallet && book.mode === 'reader' && book.editionId)
        await readOnly(api('bookmarks', book.editionId), 'PUT', {
          page,
          displayedAt,
        })
    },
    sessionsEnabled: () => Boolean(wallet && me?.sessionsEnabled),
    sessionMaxSats: () => (Number.isSafeInteger(me?.sessionMaxSats) ? me!.sessionMaxSats! : null),
    sessionStatus(book) {
      const record = book.editionId && wallet ? session?.load(book.editionId) : undefined
      if (!record?.terms || record.identityKey !== wallet?.identityKey || record.state === 'abandoned') return null
      return {
        state: record.state, capacity: record.terms.capacity, paidSats: record.paid, pages: record.paid / record.terms.price,
        remainingSats: session!.remaining(record), feeSats: (record.fundingFeeSats ?? 0) + record.terms.settlementFee,
        ...(sessionError && record.state === 'open' ? { error: sessionError } : {}),
      }
    },
    async openSession(book, capacity, firstPage) {
      allowSpend = false
      if (book.mode !== 'reader' || !book.editionId) throw new Error('This title has no paid pages.')
      if (edition !== book.editionId) {
        edition = book.editionId
        me = undefined
        history = 'idle'
      }
      if (paused) throw new ReaderError('New purchases are temporarily paused. Owned pages remain available.', 'check')
      await acquire()
      const client = await sessionClient()
      try {
        const record = await client.open(edition, capacity, firstPage)
        openedHere.add(record.channelId)
        sessionError = undefined
      } catch (error) {
        throw error instanceof ReaderError ? error
          : new ReaderError(error instanceof Error ? error.message : 'The reading session could not open.', 'check')
      } finally {
        changed()
      }
    },
    async endSession(book) {
      if (!book.editionId || !session) return null
      const client = session
      await client.idle()
      await client.close(book.editionId)
      await client.receiveChange(book.editionId)
      changed()
      return gateway.sessionStatus!(book)
    },
    leaveSession() {
      // Leaving stops spending: settle what was signed, by beacon, without waiting.
      const record = edition ? session?.load(edition) : undefined
      if (record?.state === 'open' && navigator.sendBeacon)
        void session!.close(edition, url => navigator.sendBeacon(url))
    },
    async preparationStatus(book, page) {
      allowSpend = false
      if (!wallet || !me || history !== 'ready' || edition !== book.editionId)
        throw new ReaderError('Open the owned page before preparing another page.', 'connect')
      const status = await readOnly<Status>(api(`status/${page}`, book.editionId))
      if (status.purchase || me.purchases.some(p => p.page === page)) return 'owned'
      if (status.intent || wallet.getAttempt(book.editionId!, page)) return 'existing'
      return 'clear'
    },
    async page(book, page, recoveryOnly = false, feeApproval) {
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
      const sessionRecord = !recoveryOnly && wallet ? session?.load(edition) : undefined
      if (sessionRecord?.state === 'open' && openedHere.has(sessionRecord.channelId) &&
        !me?.purchases.some(p => p.page === page) && !wallet!.getAttempt(edition, page)) {
        try { return await sessionPage(book, page) }
        catch (error) {
          throw error instanceof ReaderError ? error
            : new ReaderError(error instanceof Error ? error.message : 'The session page could not be paid.', 'retry')
        } finally { changed() }
      }
      try {
        await acquire()
        if (readingFeeConsent?.identityKey === null)
          readingFeeConsent.identityKey = wallet!.identityKey
        // The page route itself checks ownership and reserves exactly one intent
        // before issuing a challenge. A fresh local turn need not first fetch
        // status. Every existing journal/debit and every recovery keeps that check.
        const fresh = !recoveryOnly && !wallet!.getAttempt(edition, page) && !me?.purchases.some(p => p.page === page) &&
          ![...loadSpends().values()].some(s => s.identityKey === wallet!.identityKey && s.edition === edition && s.page === page)
        const status: Status = fresh ? { purchase: null, intent: null } : await readOnly<Status>(api(`status/${page}`))
        checkedStatus = fresh ? undefined : status
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
          if (recoveryOnly && attempt?.state === 'preparing' && status.intent?.state === 'challenged' && !status.intent.txid &&
            ![...loadSpends().values()].some(s => s.identityKey === wallet!.identityKey && s.edition === edition && s.page === page)) {
            const requestId = status.intent.request_id
            await wallet!.reconcileUnsignedPreparation(edition, page, requestId, async () => {
              const current = await readOnly<Status>(api(`status/${page}`))
              checkedStatus = current
              return !current.purchase && current.intent?.request_id === requestId && current.intent.state === 'challenged' && !current.intent.txid
            }, me!.purchases.filter(p => p.sats === config.priceSats).map(p => p.txid))
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
                attempt?.retryReason === 'unsigned-not-created'
                  ? 'Payment checked: the wallet has no unmatched active actions and the server still has the original unpaid request. No payment was made by this check. You may retry the same page request.'
                  : attempt?.retryReason === 'insufficient-funds'
                  ? 'Your wallet needs more funds. Your current page is still available.'
                  : attempt?.retryReason === 'not-started'
                    ? 'Payment checked: the wallet history contains only received funds, with no outgoing transaction. Try purchase again to use the original request. This check did not make a payment.'
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
            if (feeApproval && (
              recoveryOnly || !attempt || attempt.state !== 'aborted' ||
              attempt.retryReason !== 'fee-limit' ||
              feeApproval.identityKey !== wallet!.identityKey ||
              feeApproval.edition !== edition || feeApproval.page !== page ||
              feeApproval.requestId !== requestId ||
              !Number.isSafeInteger(feeApproval.maxFeeSats) ||
              feeApproval.maxFeeSats !== attempt.quotedFeeSats
            )) throw new ReaderError('The fee quote changed or belongs to another payment. Review the current page quote again.', 'check')
            const readerFeeLimit = readingFeeConsent?.identityKey === wallet!.identityKey
              ? readingFeeConsent.maxFeeSats : undefined
            wallet!.beginPayment(edition, page, requestId, feeApproval?.maxFeeSats ?? readerFeeLimit)
            allowSpend = true
            body = await paidResponse(
              await (wallet!.fetchPaidPage?.bind(wallet) ?? wallet!.auth.fetch.bind(wallet!.auth))(location.origin + api(`pages/${page}`), {
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
        // Wallet callbacks update this during awaited requests; TypeScript does
        // not model those callback side effects after the reset above.
        const http = lastHttp as { path: string; status: number } | undefined
        const details = [
          `Page ${page}; wallet stage: ${attempt?.state ?? 'no local attempt'}.`,
          `Server payment stage: ${checkedStatus?.intent?.state ?? (checkedStatus ? 'no intent' : 'status unavailable')}.`,
          ...(attempt?.broadcast ? [`Wallet broadcast result: ${attempt.broadcast.status} (${attempt.broadcast.checkedAt}). This is not a mining confirmation.`] : []),
          ...(attempt?.retryReason === 'fee-limit'
            ? [`Wallet miner-fee quote: ${attempt.quotedFeeSats == null ? 'unknown (not enough transaction data)' : `${attempt.quotedFeeSats} sats`}; attempt fee limit: ${attempt.approvedMaxFeeSats ?? config.provisional.maxPageFeeSats} sats.`]
            : []),
          ...(failure
            ? [`Wallet call: ${failure.method}; error code: ${failure.code ?? 'not supplied'}.`]
            : ['No wallet failure code was saved for this attempt.']),
          ...(failure?.diagnostic?.kind === 'proof-depth-limit'
            ? [`Wallet reported its payment-proof depth limit (${failure.diagnostic.limit}). This is a wallet proof limit, separate from page price and spending allowance.`]
            : []),
          ...(http ? [`Last HTTP result: ${http.status} (${http.path}).`] : []),
        ]
        const reported = (message: string, action: 'connect' | 'retry' | 'check') => {
          const result = new ReaderError(message, action)
          result.details = details
          if (
            attempt?.state === 'aborted' && attempt.retryReason === 'fee-limit' &&
            typeof attempt.quotedFeeSats === 'number' &&
            Number.isSafeInteger(attempt.quotedFeeSats) &&
            attempt.quotedFeeSats > config.provisional.maxPageFeeSats
          ) result.feeApproval = {
            identityKey: wallet!.identityKey, edition, page,
            requestId: attempt.requestId, maxFeeSats: attempt.quotedFeeSats,
          }
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
          throw reported(error.message, error.action)
        }
        console.warn('Page request failed', error)
        if (attempt?.state === 'aborted')
          throw reported(
            attempt.retryReason === 'insufficient-funds'
              ? 'Your wallet needs more funds. Add funds, then try purchase again.'
              : attempt.retryReason === 'fee-limit'
                ? attempt.quotedFeeSats == null
                  ? 'Pagestream could not verify the miner fee from the wallet’s transaction data. The unsigned page payment was cancelled. This needs a compatibility check; changing wallet settings may not help.'
                  : `The wallet quoted a ${attempt.quotedFeeSats}-sat miner fee, above this attempt’s ${attempt.approvedMaxFeeSats ?? config.provisional.maxPageFeeSats}-sat fee limit. The unsigned page payment was cancelled; no page payment was sent.`
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
  return {
    ...gateway,
    connect: (...args) => exclusive(() => gateway.connect(...args)),
    resumePage: (...args) => exclusive(() => gateway.resumePage(...args)),
    reconcileCosts: () => exclusive(() => gateway.reconcileCosts()),
    preparationStatus: (book, page) => exclusive(() => gateway.preparationStatus!(book, page)),
    page: (...args) => exclusive(() => gateway.page(...args)),
    openSession: (...args) => exclusive(() => gateway.openSession!(...args)),
    endSession: book => exclusive(() => gateway.endSession!(book)),
  }
}
