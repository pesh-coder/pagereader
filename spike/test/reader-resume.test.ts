import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savedBookmark, saveDisplayedBookmark } from '../../app/client/src/reader/bookmarks.js'
import { createReaderGateway, type Book } from '../../app/client/src/reader/gateway.js'
import { summarizeSpending } from '../../app/client/src/reader/spending.js'

function memory() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
const book: Book = { id: 'holmes', gid: 1661, title: 'Holmes', author: 'Doyle', mode: 'reader', editionId: 'fixed-edition', pages: 43, sourceUrl: 'https://www.gutenberg.org/ebooks/1661' }

test('two fresh browsers recover the same 74-sat total and exact fees from authenticated receipts without wallet history or local proofs', async t => {
  const descriptors = ['localStorage', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  t.after(() => { for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:3108' } })
  const purchases = [57, 1, 1].map((feeSats, index) => ({ page: [3, 5, 6][index], txid: `existing-${index}`, sats: 5, feeSats }))
  type Open = typeof import('../src/wallet-client.js')['openWallet']
  for (let browser = 0; browser < 2; browser++) {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory() })
    const gateway = createReaderGateway(() => {}, async callbacks => ({
      identityKey: 'same-reader',
      auth: { fetch: async (url: string) => {
        assert.equal(callbacks.canSpend(), false)
        assert.ok(url.endsWith('/me'))
        return new Response(JSON.stringify({ identityKey: 'same-reader', purchases, bookmark: { page: 6, displayed_at: 100 } }))
      } },
      readActionCosts: () => { throw new Error('No wallet history lookup is needed') },
      paymentFee: () => { throw new Error('No original proof exists on this fresh browser') },
    } as unknown as Awaited<ReturnType<Open>>))
    assert.equal(await gateway.resumePage(book), 6)
    assert.deepEqual(gateway.receipts().map(entry => entry.feeSats), [57, 1, 1])
    assert.equal(summarizeSpending(gateway.receipts()).total, 74)
    assert.equal(summarizeSpending(gateway.receipts()).pageSats, 15)
    assert.equal(summarizeSpending(gateway.receipts()).feeSats, 59)
    assert.equal(summarizeSpending(gateway.receipts()).minimum, false)
  }
})

test('displayed bookmark survives reopening, preserves edition boundaries and refuses stale writes', () => {
  const storage = memory()
  saveDisplayedBookmark(book, 2, 100, storage)
  assert.deepEqual(savedBookmark(book, storage), { page: 2, displayedAt: 100 })
  saveDisplayedBookmark(book, 1, 99, storage)
  assert.equal(savedBookmark(book, storage)?.page, 2)
  assert.equal(savedBookmark({ ...book, editionId: 'different-edition' }, storage), null)
  storage.setItem('pagestream-free-bookmark:fixed-edition', '{broken')
  assert.equal(savedBookmark(book, storage), null)
  storage.setItem('pagestream-free-bookmark:fixed-edition', JSON.stringify({ page: 999, displayedAt: 100 }))
  assert.equal(savedBookmark(book, storage), null)
})

test('free resume makes no wallet calls; saved paid resume rechecks ownership and cannot create another payment', async t => {
  const storage = memory()
  const previousFetch = globalThis.fetch
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:3108' } })
  t.after(() => {
    globalThis.fetch = previousFetch
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else Reflect.deleteProperty(globalThis, 'localStorage')
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation); else Reflect.deleteProperty(globalThis, 'location')
  })
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async input => {
    if (String(input) === '/api/library') return response({ books: [book], purchasesPaused: true })
    assert.equal(String(input), '/api/editions/fixed-edition/public/pages/2')
    return response({ editionId: book.editionId, page: 2, paragraphs: ['Public page two'] })
  }
  let acquisitions = 0, beginCalls = 0
  const requests: string[] = []
  const purchase = { page: 5, txid: 'fixture-owned-transaction', sats: 5 }
  type Open = typeof import('../src/wallet-client.js')['openWallet']
  const fakeWallet = {
    identityKey: 'fixture-reader',
    auth: { fetch: async (url: string) => {
      const path = new URL(url).pathname; requests.push(path)
      if (path === '/api/editions/fixed-edition/me') return response({ identityKey: 'fixture-reader', purchases: [purchase], bookmark: { page: 5, displayed_at: 200 } })
      if (path.startsWith('/api/editions/fixed-edition/status/')) return response({ purchase: path.endsWith('/5') ? purchase : null, intent: null })
      assert.equal(path, '/api/editions/fixed-edition/owned/5')
      return response({ editionId: book.editionId, page: 5, paragraphs: ['Server-owned page five'], purchase })
    } },
    getAttempt: () => undefined,
    beginPayment: () => { beginCalls++; throw new Error('A resume must never create a payment') },
    confirmPayment: () => {},
  } as unknown as Awaited<ReturnType<Open>>
  const open: Open = async () => { acquisitions++; return fakeWallet }
  const gateway = createReaderGateway(() => {}, open)
  await gateway.library()
  await gateway.bookmark(book, 2, 100)
  assert.equal(gateway.savedPage(book), 2)
  assert.equal((await gateway.page(book, gateway.savedPage(book)!)).page, 2)
  assert.equal(acquisitions, 0)
  assert.equal(requests.length, 0)
  saveDisplayedBookmark(book, 5, 200, storage)
  // Recreate the interface, as a new tab/reload would, without a wallet session.
  const reopened = createReaderGateway(() => {}, open)
  await reopened.library()
  assert.equal(reopened.savedPage(book), 5)
  const page = await reopened.page(book, reopened.savedPage(book)!, true)
  assert.equal(page.purchase?.txid, purchase.txid)
  assert.deepEqual(requests, ['/api/editions/fixed-edition/me', '/api/editions/fixed-edition/status/5', '/api/editions/fixed-edition/owned/5'])
  assert.equal(beginCalls, 0)
  assert.equal(reopened.receipts()[0].feeSats, null)
  await assert.rejects(reopened.page(book, 7, true), /No existing payment was found/)
  assert.equal(beginCalls, 0)
  assert.ok(requests.every(path => !/\/pages\//.test(path)))
})

test('fresh-device explicit resume discovers the server bookmark without a local hint or page payment', async t => {
  const storage = memory(), oldFetch = globalThis.fetch
  const descriptors = ['localStorage', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:3108' } })
  t.after(() => { globalThis.fetch = oldFetch; for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) })
  const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async input => String(input) === '/api/library' ? response({ books: [book], purchasesPaused: true }) : response({ editionId: book.editionId, page: 1, paragraphs: ['Free page one'] })
  const purchase = { page: 5, txid: 'fixture-existing-purchase', sats: 5 }
  const requests: string[] = []
  let acquisitions = 0, savedPage = 5
  type Open = typeof import('../src/wallet-client.js')['openWallet']
  const open: Open = async callbacks => {
    acquisitions++
    assert.equal(callbacks.canSpend(), false)
    return { identityKey: 'fixture-reader', auth: { fetch: async (url: string) => {
      const path = new URL(url).pathname; requests.push(path)
      assert.ok(!path.includes('/pages/') && !path.endsWith('/bookmarks'))
      if (path.endsWith('/me')) return response({ identityKey: 'fixture-reader', purchases: [purchase], bookmark: { page: savedPage, displayed_at: 200 } })
      if (path.includes('/status/')) return response({ purchase: path.endsWith('/5') ? purchase : null, intent: null })
      return response({ editionId: book.editionId, page: 5, paragraphs: ['Original owned page'], purchase })
    } }, getAttempt: () => undefined, beginPayment: () => { throw new Error('Explicit resume must never begin a payment') }, confirmPayment: () => {} } as unknown as Awaited<ReturnType<Open>>
  }
  const gateway = createReaderGateway(() => {}, open)
  await gateway.library(); await gateway.page(book, 1)
  assert.equal(acquisitions, 0)
  assert.equal(gateway.savedPage(book), null)
  const target = await gateway.resumePage(book)
  assert.equal(target, 5)
  assert.equal((await gateway.page(book, target!, true)).purchase?.txid, purchase.txid)
  assert.equal(acquisitions, 1)
  assert.deepEqual(requests, ['/api/editions/fixed-edition/me', '/api/editions/fixed-edition/status/5', '/api/editions/fixed-edition/owned/5'])
  savedPage = 7
  assert.equal(await gateway.resumePage(book), 7)
  await assert.rejects(gateway.page(book, 7, true), /No existing payment was found/)
  savedPage = 1000
  await assert.rejects(gateway.resumePage(book), /not valid for this edition/)
})

test('switching books isolates ownership, costs and delayed bookmark writes, and refuses a wrong-edition body', async t => {
  const storage = memory()
  const previousFetch = globalThis.fetch
  const descriptors = ['localStorage', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:3108' } })
  t.after(() => {
    globalThis.fetch = previousFetch
    for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
  })
  const second = { ...book, id: 'pride', gid: 1342, editionId: 'second-edition' }
  const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
  let wrongBody = false
  globalThis.fetch = async input => String(input) === '/api/library'
    ? response({ books: [book, second], purchasesPaused: true })
    : response({ editionId: wrongBody ? book.editionId : second.editionId, page: 1, paragraphs: ['Second book preview'] })
  const requests: string[] = []
  const purchase = { page: 3, txid: 'owned-first-edition', sats: 5 }
  type Open = typeof import('../src/wallet-client.js')['openWallet']
  let creates = 0
  const open: Open = async () => ({
    identityKey: 'fixture-reader',
    auth: { fetch: async (url: string) => {
      const path = new URL(url).pathname; requests.push(path)
      const firstEdition = path.includes('/fixed-edition/')
      if (path.endsWith('/me')) return response({ identityKey: 'fixture-reader', purchases: firstEdition ? [purchase] : [], bookmark: { page: firstEdition ? 3 : 2, displayed_at: 100 } })
      if (path.includes('/status/')) return response({ purchase: firstEdition ? purchase : null, intent: null })
      if (path.endsWith('/bookmarks')) return response({ saved: true })
      assert.equal(path, '/api/editions/fixed-edition/owned/3')
      return response({ editionId: book.editionId, page: 3, paragraphs: ['Owned first book'], purchase })
    } },
    getAttempt: () => undefined, confirmPayment: () => {},
    beginPayment: () => { creates++; throw new Error('Unexpected payment') },
  } as unknown as Awaited<ReturnType<Open>>)
  const gateway = createReaderGateway(() => {}, open)
  await gateway.library()
  await gateway.page(book, 3, true)
  assert.equal(gateway.owned().length, 1)
  assert.equal(gateway.receipts().length, 1)
  const beforeFree = requests.length
  await gateway.page(second, 1)
  assert.equal(requests.length, beforeFree)
  assert.equal(gateway.owned().length, 0)
  assert.equal(gateway.receipts().length, 0)
  await assert.rejects(gateway.page(second, 3, true), /No existing payment/)
  assert.equal(await gateway.resumePage(), 2)
  await gateway.bookmark(book, 3, 200) // Post-paint write from the previously displayed book.
  assert.equal(requests.at(-1), '/api/editions/fixed-edition/bookmarks')
  assert.equal(gateway.owned().length, 0)
  wrongBody = true
  await assert.rejects(gateway.page(second, 1), /different edition or page/)
  assert.equal(creates, 0)
  assert.ok(!requests.some(path => /\/pages\//.test(path)))
})
