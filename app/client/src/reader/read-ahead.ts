import { config, type Book, type ReaderGateway, type ReaderPage } from './gateway.js'

export interface ReadAheadStatus {
  enabled: boolean
  page?: number
  state: 'idle' | 'preparing' | 'ready' | 'failed'
  preparationMs?: number
}
export interface ReadAheadUse { page: number; readyAtClick: boolean; preparationMs: number }

// One accepted page in memory, never a new payment implementation. Every purchase
// still goes through the gateway's durable proof, fee, broadcast and receipt checks.
export function withReadAhead(source: ReaderGateway, changed: () => void, clock = () => performance.now(),
  permitted: (identity: string, edition: string, page: number) => boolean = () => true) {
  let consent: { identity: string; edition: string } | undefined
  let lastUse: ReadAheadUse | undefined
  let slot: {
    identity: string; edition: string; page: number; promise: Promise<ReaderPage>
    state: 'preparing' | 'ready' | 'failed'; preparationMs?: number
  } | undefined
  const matches = (book: Book, page: number) => Boolean(slot && slot.identity === source.identity() &&
    slot.edition === book.editionId && slot.page === page)
  const idle = async () => { if (slot?.state === 'preparing') await slot.promise.catch(() => {}) }
  const stop = () => { consent = undefined; changed() }
  const boundary = async <T>(operation: () => Promise<T>) => { stop(); await idle(); return operation() }
  const gateway = {
    ...source,
    readAheadStatus(): ReadAheadStatus {
      return { enabled: Boolean(consent && consent.identity === source.identity()),
        state: slot?.state ?? 'idle', page: slot?.page, preparationMs: slot?.preparationMs }
    },
    enableReadAhead(book: Book) {
      const identity = source.identity()
      if (!identity || !book.editionId || source.historyState() !== 'ready')
        throw new Error('Open an owned page before enabling next-page preparation.')
      consent = { identity, edition: book.editionId }
      changed()
    },
    stopReadAhead: stop,
    lastReadAheadUse: () => lastUse,
    async prepareNext(book: Book, displayed: ReaderPage) {
      const identity = source.identity(), page = displayed.page + 1
      if (!consent || consent.identity !== identity || consent.edition !== book.editionId ||
        !identity || !book.editionId || !permitted(identity, book.editionId, page) ||
        displayed.editionId !== book.editionId || !displayed.purchase ||
        !source.owned().some(p => p.page === displayed.page && p.txid === displayed.purchase!.txid) ||
        displayed.page <= config.freePages || page > (book.pages ?? 0) ||
        source.historyState() !== 'ready') return
      if (slot) {
        // Never buy a second unread page, retry a failed preparation, or race a
        // foreground turn. Navigation consumes the one slot explicitly.
        if (matches(book, page)) return slot.promise
        return
      }
      const started = clock()
      const current = { identity: identity!, edition: book.editionId!, page,
        state: 'preparing' as 'preparing' | 'ready' | 'failed',
        promise: undefined as unknown as Promise<ReaderPage>, preparationMs: undefined as number | undefined }
      slot = current
      current.promise = Promise.resolve().then(async () => {
        // A hide/logout/disable before this microtask must not start a purchase.
        if (!consent || consent.identity !== source.identity() || consent.edition !== book.editionId)
          throw new Error('Next-page preparation stopped before payment started.')
        if (source.owned().some(p => p.page === page) || source.needsPaymentCheck(book, page))
          throw new Error('The next page is already owned or has an existing payment. Preparation stopped without a new purchase.')
        const status = await source.preparationStatus?.(book, page)
        if (status && status !== 'clear')
          throw new Error('The next page is already owned or has an existing payment. Preparation stopped without a new purchase.')
        if (!consent || consent.identity !== source.identity() || consent.edition !== book.editionId)
          throw new Error('Next-page preparation stopped before payment started.')
        return source.page(book, page)
      }).then(body => {
        if (source.identity() !== current.identity || body.editionId !== current.edition ||
          body.page !== current.page || !body.purchase ||
          !source.owned().some(p => p.page === body.page && p.txid === body.purchase!.txid))
          throw new Error('The prepared page does not match an accepted purchase.')
        current.state = 'ready'
        return body
      }).catch(error => {
        current.state = 'failed'
        consent = undefined
        throw error
      }).finally(() => { current.preparationMs = clock() - started; changed() })
      changed()
      return current.promise
    },
    async page(...args: Parameters<ReaderGateway['page']>) {
      const [book, page] = args
      lastUse = undefined
      if (matches(book, page)) {
        const selected = slot!
        const readyAtClick = selected.state === 'ready'
        try {
          const body = await selected.promise
          if (source.identity() !== selected.identity)
            throw new Error('The wallet changed while opening the prepared page.')
          lastUse = { page, readyAtClick, preparationMs: selected.preparationMs! }
          return body
        }
        finally { if (slot === selected) slot = undefined; changed() }
      }
      // Back/contents navigation must not overlap the original payment. Keep
      // its receipt/journal even when the user chooses a different page.
      await idle()
      return source.page(...args)
    },
    connect: (...args: Parameters<ReaderGateway['connect']>) => boundary(() => source.connect(...args)),
    resumePage: (...args: Parameters<ReaderGateway['resumePage']>) => boundary(() => source.resumePage(...args)),
    reconcileCosts: () => boundary(() => source.reconcileCosts()),
    async bookmark(...args: Parameters<ReaderGateway['bookmark']>) { await idle(); return source.bookmark(...args) },
    disconnect() { stop(); source.disconnect() },
  }
  return gateway
}
