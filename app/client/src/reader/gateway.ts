import { config } from '../../../../spike/src/config.js'
import type { Spend } from '../../../../spike/src/wallet-client.js'
import { savedBookmark, saveDisplayedBookmark } from './bookmarks.js'

export { config }
export type { Spend }
export interface Book { id: string; gid: number; title: string; author: string; mode: 'reader' | 'excerpt'; editionId?: string; pages?: number; excerpt?: string; chapter?: string; sourceUrl: string }
export interface Purchase { page: number; txid: string; sats: number; feeSats?: number }
export interface ReaderPage { editionId: string; page: number; paragraphs: string[]; purchase?: Purchase }
interface Me { identityKey: string; purchases: Purchase[]; bookmark: { page: number; displayed_at: number } | null }
interface Status { purchase: Purchase | null; intent: unknown }
type OpenWallet = typeof import('../../../../spike/src/wallet-client.js')['openWallet']
export interface ReaderGateway {
  library(): Promise<{ books: Book[]; purchasesPaused: boolean }>
  page(book: Book, page: number, recoveryOnly?: boolean): Promise<ReaderPage>
  bookmark(book: Book, page: number, displayedAt: number): Promise<void>
  receipts(): Spend[]
  owned(): Purchase[]
  resumePage(book?: Book): Promise<number | null>
  hasIdentity(): boolean
  savedPage(book: Book): number | null
  reconcileCosts(): Promise<{ matched: number; missing: number }>
}
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Request failed (${response.status}). Your current page is kept; no new payment will be retried automatically.`)
  return response.json() as Promise<T>
}

// The UI sees one interface. All paid operations reuse the spike's guarded
// AuthFetch + journal, which calls the generated wallet-acquisition helper.
export function createReaderGateway(changed: () => void, walletOpener?: OpenWallet): ReaderGateway {
  let wallet: Awaited<ReturnType<typeof import('../../../../spike/src/wallet-client.js')['openWallet']>> | undefined
  let me: Me | undefined, edition = '', requested = 1, allowSpend = false
  let paused = true
  const api = (path: string, selectedEdition = edition) => `/api/editions/${encodeURIComponent(selectedEdition)}/${path}`
  const checkPage = (body: ReaderPage, book: Book, page: number) => {
    if (body.editionId !== book.editionId || body.page !== page || !Array.isArray(body.paragraphs) || !body.paragraphs.every(text => typeof text === 'string') || (body.purchase && body.purchase.page !== page)) throw new Error('Server returned a different edition or page. Your current text is kept.')
    return body
  }
  const ledgerKey = 'pagestream-spike-spends-v1' // preserve existing evidence
  const loadSpends = (): Map<string, Spend> => {
    try { return new Map(Object.entries(JSON.parse(localStorage.getItem(ledgerKey) ?? '{}'))) }
    catch { throw new Error('Saved payment history could not be read. Payments are blocked until it is recovered.') }
  }
  const saveSpend = (spend: Spend) => {
    const spends = loadSpends()
    spends.set(spend.txid, { ...spend, edition: spend.edition ?? edition })
    localStorage.setItem(ledgerKey, JSON.stringify(Object.fromEntries(spends)))
    changed()
  }
  const readOnly = async <T>(path: string, method = 'GET', body?: unknown) => {
    if (!wallet) throw new Error('Request page 3 to access your wallet identity.')
    // AuthFetch cannot create a payment on any read-only route.
    return json<T>(await wallet.auth.fetch(location.origin + path, { method, paymentRetryAttempts: 1,
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) }))
  }
  const refreshMe = async () => {
    me = await readOnly<Me>(api('me'))
    if (me.identityKey !== wallet!.identityKey) throw new Error('Wallet identity did not match server identity.')
    const spends = loadSpends()
    for (const purchase of me.purchases) {
      const known = spends.get(purchase.txid)
      // Verified receipt fees travel to another browser with ownership. Missing
      // server evidence still falls back to an original local payment proof.
      saveSpend({ ...known, ...purchase, identityKey: wallet!.identityKey, edition, feeSats: purchase.feeSats ?? known?.feeSats ?? wallet!.paymentFee?.(edition, purchase.page, purchase.txid) ?? null, state: 'confirmed' })
    }
    changed()
  }
  const acquire = async () => {
    if (wallet) { if (!me) await refreshMe(); return }
    const openWallet = walletOpener ?? (await import('../../../../spike/src/wallet-client.js')).openWallet
    wallet = await openWallet({ call: () => {}, http: () => {}, spend: saveSpend, currentPage: () => requested, canSpend: () => allowSpend })
    await refreshMe()
  }
  const paidResponse = async (response: Response, page: number): Promise<ReaderPage> => {
    if (response.ok) return json(response)
    allowSpend = false
    const status = await readOnly<Status>(api(`status/${page}`))
    if (status.purchase) return readOnly(api(`owned/${page}`))
    return json(response)
  }
  return {
    async library() {
      const result = await json<{ books: Book[]; purchasesPaused: boolean }>(await fetch('/api/library'))
      paused = result.purchasesPaused
      return result
    },
    receipts: () => wallet ? [...loadSpends().values()].filter(s => s.identityKey === wallet!.identityKey && s.edition === edition) : [],
    owned: () => me?.purchases ?? [],
    hasIdentity: () => Boolean(wallet),
    savedPage: book => savedBookmark(book)?.page ?? null,
    async reconcileCosts() {
      allowSpend = false
      if (!wallet || !edition) throw new Error('Open your saved page first to access its wallet history. No payment is needed.')
      const selectedEdition = edition, identity = wallet.identityKey
      const costs = new Map((await wallet.readActionCosts()).map(cost => [cost.txid, cost]))
      if (edition !== selectedEdition || wallet.identityKey !== identity) throw new Error('The selected book changed. Existing costs were kept.')
      const spends = loadSpends()
      let matched = 0, missing = 0
      // Validate the entire update before writing. Native net debit proves total
      // wallet cost, not necessarily the miner fee; never relabel it as a fee.
      for (const [txid, spend] of spends) {
        if (spend.identityKey !== identity || spend.edition !== selectedEdition) continue
        const cost = costs.get(txid)
        if (!cost) { missing++; continue }
        if (cost.debitSats < spend.sats + (spend.feeSats ?? 0)) throw new Error('Wallet cost conflicts with the recorded payment. Existing costs were kept.')
        spends.set(txid, { ...spend, walletDebitSats: cost.debitSats, walletStatus: cost.status })
        matched++
      }
      localStorage.setItem(ledgerKey, JSON.stringify(Object.fromEntries(spends)))
      changed()
      return { matched, missing }
    },
    async resumePage(book) {
      // Explicit resume is identity-only: a fresh device need not buy/open page
      // three first. Ordinary library/free-page browsing never calls this.
      allowSpend = false
      if (book) {
        if (book.mode !== 'reader' || !book.editionId) throw new Error('No saved reader edition is available.')
        if (edition !== book.editionId) { edition = book.editionId; me = undefined }
      } else if (!wallet) return null
      if (!wallet || !me) await acquire(); else await refreshMe()
      const page = me?.bookmark?.page ?? null
      if (page !== null && (!Number.isInteger(page) || page < 1 || (book?.pages !== undefined && page > book.pages))) throw new Error('The saved bookmark is not valid for this edition.')
      return page
    },
    async bookmark(book, page, displayedAt) {
      // Free reading still has a local bookmark without acquiring a wallet.
      saveDisplayedBookmark(book, page, displayedAt)
      if (wallet && book.mode === 'reader' && book.editionId) await readOnly(api('bookmarks', book.editionId), 'PUT', { page, displayedAt })
    },
    async page(book, page, recoveryOnly = false) {
      if (book.mode !== 'reader' || !book.editionId || !Number.isInteger(page) || page < 1 || page > (book.pages ?? 0)) throw new Error('This title currently has an opening excerpt only.')
      if (edition !== book.editionId) { edition = book.editionId; me = undefined }
      if (page <= config.freePages) return checkPage(await json<ReaderPage>(await fetch(api(`public/pages/${page}`))), book, page)
      if (!wallet && page !== config.freePages + 1 && !recoveryOnly) throw new Error('Open page 3 first to access your owned pages.')
      requested = page
      allowSpend = false
      try {
        await acquire()
        const status = await readOnly<Status>(api(`status/${page}`))
        let body: ReaderPage
        if (status.purchase) body = await readOnly(api(`owned/${page}`))
        else {
          const attempt = wallet!.getAttempt(edition, page)
          if (attempt?.proof) body = await paidResponse(await wallet!.recoverPayment(edition, page, true), page)
          else {
            const aborted = attempt?.state === 'aborted'
            if ((attempt || status.intent) && !aborted) throw new Error('A payment is pending or unresolved. Check the existing purchase without paying again.')
            if (recoveryOnly) throw new Error('No existing payment was found. No new payment was attempted.')
            if (paused) throw new Error('New purchases are paused while recovery tests finish. Already owned pages remain available.')
            const requestId = aborted ? attempt.requestId : crypto.randomUUID()
            wallet!.beginPayment(edition, page, requestId)
            allowSpend = true
            body = await paidResponse(await wallet!.auth.fetch(location.origin + api(`pages/${page}`), { headers: { 'x-bsv-request-id': requestId }, paymentRetryAttempts: 1, labels: ['pagestream reader'] }), page)
          }
        }
        checkPage(body, book, page)
        if (body.purchase) {
          wallet!.confirmPayment(edition, page, body.purchase.txid)
          const existing = loadSpends().get(body.purchase.txid)
          saveSpend({ ...existing, ...body.purchase, identityKey: wallet!.identityKey, edition, state: 'confirmed', feeSats: body.purchase.feeSats ?? existing?.feeSats ?? wallet!.paymentFee?.(edition, page, body.purchase.txid) ?? null })
          me!.purchases = [...me!.purchases.filter(p => p.page !== page), body.purchase]
        }
        return body
      } catch (error) {
        for (const spend of loadSpends().values()) if (spend.identityKey === wallet?.identityKey && spend.edition === edition && spend.page === page && spend.state === 'pending') saveSpend({ ...spend, state: 'unresolved' })
        throw error
      } finally { allowSpend = false; changed() }
    },
  }
}
