import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withReadAhead } from '../../app/client/src/reader/read-ahead.js'
import type { Book, ReaderGateway, ReaderPage, Purchase } from '../../app/client/src/reader/gateway.js'

const book: Book = { id: 'fixture', gid: 1, title: 'Fixture', author: 'Author', mode: 'reader', editionId: 'edition', pages: 30, sourceUrl: 'https://www.gutenberg.org' }
const first: ReaderPage = { editionId: 'edition', page: 3, paragraphs: ['Current text'], purchase: { page: 3, sats: 5, feeSats: 1, txid: 'first' } }
function fixture() {
  let identity: string | null = 'reader', now = 0, calls = 0, charges = 0
  let preflight: 'clear' | 'owned' | 'existing' = 'clear'
  let notifyStarted!: () => void
  const started = new Promise<void>(resolve => { notifyStarted = resolve })
  const owned: Purchase[] = [first.purchase!], bookmarks: number[] = []
  let resolve!: () => void, reject!: (error: Error) => void
  const wait = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  const source: ReaderGateway = {
    identity: () => identity, hasIdentity: () => identity !== null,
    historyState: () => 'ready', owned: () => owned, needsPaymentCheck: () => false,
    receipts: () => [], savedPage: () => 3, walletVersion: () => 'fixture', network: () => 'mainnet',
    library: async () => ({ books: [book], purchasesPaused: false }),
    connect: async () => {}, resumePage: async () => 3,
    reconcileCosts: async () => ({ matched: 0, missing: 0 }),
    approveReadingFees: () => {}, disconnect: () => { identity = null },
    preparationStatus: async () => preflight,
    bookmark: async (_book, page) => { bookmarks.push(page) },
    page: async (selected, page, recovery) => {
      calls++
      if (page === 4 && selected.editionId === book.editionId && !owned.some(x => x.page === page)) {
        assert.equal(recovery, undefined)
        notifyStarted()
        await wait
        charges++
        owned.push({ page, txid: 'paid-once', sats: 5, feeSats: 1 })
      }
      return { editionId: selected.editionId!, page, paragraphs: ['Accepted text'], purchase: owned.find(x => x.page === page) }
    },
  }
  const gateway = withReadAhead(source, () => {}, () => now)
  return { gateway, owned, bookmarks, started, preflight: (value: typeof preflight) => { preflight = value }, counts: () => ({ calls, charges }),
    finish: () => { now = 6406; resolve() }, fail: () => reject(new Error('Fixture uncertain payment; retain original')) }
}

test('read-ahead is opt-in, buys at most one unread page and opens only accepted cached text', async () => {
  const f = fixture()
  await f.gateway.prepareNext(book, first)
  assert.deepEqual(f.counts(), { calls: 0, charges: 0 })
  f.gateway.enableReadAhead(book)
  const preparing = f.gateway.prepareNext(book, first)
  const repeated = f.gateway.prepareNext(book, first)
  await f.started
  assert.deepEqual(f.counts(), { calls: 1, charges: 0 })
  f.finish()
  await Promise.all([preparing, repeated])
  assert.equal(f.gateway.readAheadStatus().state, 'ready')
  // Remaining on the current page cannot start payment for another page.
  await f.gateway.prepareNext(book, first)
  assert.deepEqual(f.counts(), { calls: 1, charges: 1 })
  assert.deepEqual(f.bookmarks, [], 'prefetch must not move the displayed bookmark')
  const next = await f.gateway.page(book, 4)
  assert.equal(next.purchase?.txid, 'paid-once')
  assert.deepEqual(f.gateway.lastReadAheadUse(), { page: 4, readyAtClick: true, preparationMs: 6406 })
  assert.deepEqual(f.counts(), { calls: 1, charges: 1 }, 'ready turn makes no wallet or HTTP request')
  await f.gateway.bookmark(book, 4, 1)
  assert.deepEqual(f.bookmarks, [4])
})

test('a rapid Next joins the original payment and retains its wait instead of faking instant delivery', async () => {
  const f = fixture(); f.gateway.enableReadAhead(book)
  const preparing = f.gateway.prepareNext(book, first)
  const next = f.gateway.page(book, 4)
  let visible = false
  void next.then(() => { visible = true })
  await f.started
  assert.equal(visible, false)
  assert.deepEqual(f.counts(), { calls: 1, charges: 0 })
  f.finish()
  await Promise.all([preparing, next])
  assert.deepEqual(f.gateway.lastReadAheadUse(), { page: 4, readyAtClick: false, preparationMs: 6406 })
  assert.deepEqual(f.counts(), { calls: 1, charges: 1 })
})

test('failed preparation disables further buying and explicit Next reports the original failure', async () => {
  const f = fixture(); f.gateway.enableReadAhead(book)
  const preparing = f.gateway.prepareNext(book, first)
  await f.started; f.fail()
  await assert.rejects(preparing, /retain original/)
  assert.equal(f.gateway.readAheadStatus().enabled, false)
  await f.gateway.prepareNext(book, first)
  await assert.rejects(f.gateway.page(book, 4), /retain original/)
  assert.deepEqual(f.counts(), { calls: 1, charges: 0 })
  assert.deepEqual(f.owned, [first.purchase])
})

test('hide/disable before dispatch starts no payment; disabling in flight retains the original accepted receipt', async () => {
  const stopped = fixture(); stopped.gateway.enableReadAhead(book)
  const cancelled = stopped.gateway.prepareNext(book, first)
  stopped.gateway.stopReadAhead()
  await assert.rejects(cancelled, /before payment started/)
  assert.deepEqual(stopped.counts(), { calls: 0, charges: 0 })

  const f = fixture(); f.gateway.enableReadAhead(book)
  const preparing = f.gateway.prepareNext(book, first)
  await f.started; f.gateway.stopReadAhead(); f.finish()
  await preparing
  assert.equal(f.gateway.readAheadStatus().enabled, false)
  assert.equal((await f.gateway.page(book, 4)).purchase?.txid, 'paid-once')
  assert.deepEqual(f.counts(), { calls: 1, charges: 1 })
})

test('logout cannot deliver a late prepared page or start another preparation', async () => {
  const f = fixture(); f.gateway.enableReadAhead(book)
  const preparing = f.gateway.prepareNext(book, first)
  await f.started; f.gateway.disconnect(); f.finish()
  await assert.rejects(preparing, /accepted purchase/)
  await f.gateway.prepareNext(book, first)
  assert.equal(f.gateway.readAheadStatus().enabled, false)
  assert.equal(f.counts().calls, 1)
})

test('back navigation and bookmarks wait for the original payment without moving the displayed page early', async () => {
  const f = fixture(); f.gateway.enableReadAhead(book)
  const preparing = f.gateway.prepareNext(book, first)
  const bookmark = f.gateway.bookmark(book, 3, 100)
  const back = f.gateway.page(book, 3)
  await f.started
  assert.deepEqual(f.bookmarks, [])
  assert.equal(f.counts().calls, 1)
  f.finish()
  await Promise.all([preparing, bookmark])
  assert.equal((await back).page, 3)
  assert.deepEqual(f.bookmarks, [3])
  assert.deepEqual(f.counts(), { calls: 2, charges: 1 })
})

test('a preview, unowned current page, wrong edition and final page cannot trigger automatic purchase', async () => {
  const f = fixture(); f.gateway.enableReadAhead(book)
  await f.gateway.prepareNext(book, { ...first, page: 2, purchase: undefined })
  await f.gateway.prepareNext(book, { ...first, purchase: { ...first.purchase!, txid: 'stranger' } })
  await f.gateway.prepareNext({ ...book, editionId: 'other' }, first)
  await f.gateway.prepareNext({ ...book, pages: 3 }, first)
  assert.deepEqual(f.counts(), { calls: 0, charges: 0 })
})

test('a scoped pilot cannot purchase an unapproved wallet, edition or page', async () => {
  const f = fixture()
  const blocked = withReadAhead(f.gateway, () => {}, () => 0,
    (identity, edition, page) => `${identity}/${edition}/${page}` === 'other/edition/4')
  blocked.enableReadAhead(book)
  await blocked.prepareNext(book, first)
  assert.deepEqual(f.counts(), { calls: 0, charges: 0 })
})

for (const state of ['owned', 'existing'] as const) test(`server preflight ${state} stops the pilot without choosing another page`, async () => {
  const f = fixture(); f.preflight(state); f.gateway.enableReadAhead(book)
  await assert.rejects(f.gateway.prepareNext(book, first), /stopped without a new purchase/)
  assert.deepEqual(f.counts(), { calls: 0, charges: 0 })
  assert.equal(f.gateway.readAheadStatus().enabled, false)
})
