import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { AuthFetch, PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { Store } from '../src/store.js'
import { createProbe } from '../src/probe.js'
import { loadCatalogue } from '../src/content.js'
import { config } from '../src/config.js'
import { createReaderGateway, type Book } from '../../app/client/src/reader/gateway.js'
import { summarizeSpending } from '../../app/client/src/reader/spending.js'
import { readerWallet } from './fixtures/session-wallet.js'

type Open = typeof import('../src/wallet-client.js')['openWallet']

test('the reader gateway opens a session, shows the credited next page at once and pays it in the background', async t => {
  const store = new Store(':memory:'), catalogue = loadCatalogue(), edition = catalogue[0].edition
  const serverProto = new ProtoWallet(PrivateKey.fromRandom())
  const serverIdentity = (await serverProto.getPublicKey({ identityKey: true })).publicKey
  const serverWallet = new Proxy(serverProto, { get(target, name) {
    if (name === 'internalizeAction') return async () => ({ accepted: true })
    const value = Reflect.get(target, name)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const server = http.createServer(createProbe({ store, edition, catalogue, wallet: serverWallet, serverIdentity,
    purchasesPaused: () => false, research: false, channels: { broadcast: async () => {}, enabled: () => true } }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const values = new Map<string, string>()
  const descriptors = ['localStorage', 'location', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const realFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true,
    value: (input: string | URL | Request, init?: RequestInit) => realFetch(typeof input === 'string' && input.startsWith('/') ? origin + input : input, init) })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin } })
  t.after(() => {
    for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
    server.closeAllConnections(); server.close(); store.close()
  })
  const reader = readerWallet()
  let releasePayments: (() => void) | undefined
  const gateway = createReaderGateway(() => {}, async () => ({
    identityKey: reader.identity, version: 'fixture', network: 'mainnet',
    auth: new AuthFetch(reader.proto as unknown as WalletInterface),
    sessionWallet: reader.wallet,
    sessionPost: async (path: string, body: unknown) => {
      if (releasePayments) await new Promise<void>(resolve => { const release = releasePayments!; releasePayments = () => { release(); resolve() } })
      return fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    },
    getAttempt: () => undefined, confirmPayment: () => {},
    retainPaymentAncestors: () => {},
    paymentFee: () => null,
  } as unknown as Awaited<ReturnType<Open>>))
  const book: Book = { id: 'holmes', gid: 1661, title: edition.title, author: edition.author, mode: 'reader', editionId: edition.id, pages: edition.pages.length, sourceUrl: '' }
  await gateway.library()
  await gateway.connect(book)
  assert.equal(gateway.sessionsEnabled!(), true)
  await gateway.openSession!(book, 160)
  assert.equal(gateway.sessionStatus!()?.state, 'open')
  const third = await gateway.page(book, 3)
  await gateway.bookmark(book, 3, Date.now()) // as the reader does after display
  assert.deepEqual(third.paragraphs, edition.pages[2])
  assert.deepEqual(gateway.owned().map(p => p.page), [3])
  // Hold the background payment so the instant credited delivery is observable.
  releasePayments = () => {}
  const fourth = await gateway.page(book, 4)
  assert.deepEqual(fourth.paragraphs, edition.pages[3], 'the credited page is displayed before its payment lands')
  assert.equal(gateway.receipts().find(r => r.page === 4)?.state, 'pending')
  assert.deepEqual(gateway.owned().map(p => p.page), [3])
  const release = releasePayments as () => void
  releasePayments = undefined
  release()
  await gateway.bookmark(book, 4, Date.now()) // waits for the background payment
  assert.deepEqual(gateway.owned().map(p => p.page).sort(), [3, 4])
  assert.equal(gateway.receipts().find(r => r.page === 4)?.state, 'confirmed')
  assert.equal((store.bookmark(reader.identity, edition.id) as { page: number }).page, 4, 'the credited page bookmarks once paid')
  // Exactly one wallet action set opened the session; pages used signatures only.
  assert.deepEqual(reader.calls, ['createAction', 'signAction', 'sendWith'])
  // Switch books: the same session pays, with no new approval or wallet action.
  const other = catalogue[1].edition
  const second: Book = { id: 'second', gid: 2, title: other.title, author: other.author, mode: 'reader', editionId: other.id, pages: other.pages.length, sourceUrl: '' }
  assert.equal(gateway.sessionStatus!()?.state, 'open', 'the session shows in every book')
  const otherPage = await gateway.page(second, 3)
  assert.deepEqual(otherPage.paragraphs, other.pages[2])
  assert.deepEqual(store.purchases(reader.identity, other.id).map(p => p.page), [3])
  // Back in the first book, an owned page opens without paying again.
  const owned = await gateway.page(book, 4)
  assert.deepEqual(owned.paragraphs, edition.pages[3])
  assert.deepEqual(store.purchases(reader.identity, edition.id).map(p => p.page).sort(), [3, 4])
  assert.deepEqual(reader.calls, ['createAction', 'signAction', 'sendWith'])
  const ended = await gateway.endSession!()
  assert.equal(ended?.state, 'received')
  assert.equal(ended?.pages, 3, 'one session paid pages in two books')
  assert.equal(ended?.remainingSats, 100 - config.channel.settlementFeeSats - 15)
  // Receipts: first book 10 page sats plus the session's two miner fees, once.
  const spending = summarizeSpending(gateway.receipts())
  assert.equal(spending.total, 10 + 25 + config.channel.settlementFeeSats)
  assert.deepEqual(reader.calls, ['createAction', 'signAction', 'sendWith', 'internalizeAction'])
})

test('leaving keeps the session: a reload within 30 minutes continues with no approval, and an idle session returns its change', async t => {
  const store = new Store(':memory:'), catalogue = loadCatalogue(), edition = catalogue[0].edition
  const serverProto = new ProtoWallet(PrivateKey.fromRandom())
  const serverIdentity = (await serverProto.getPublicKey({ identityKey: true })).publicKey
  let received = 0
  const serverWallet = new Proxy(serverProto, { get(target, name) {
    if (name === 'internalizeAction') return async () => { received++; return { accepted: true } }
    const value = Reflect.get(target, name)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  let clock = Date.now()
  const app = createProbe({ store, edition, catalogue, wallet: serverWallet, serverIdentity, purchasesPaused: () => false,
    research: false, channels: { broadcast: async () => {}, enabled: () => true, now: () => clock } })
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const values = new Map<string, string>()
  const descriptors = ['localStorage', 'location', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const realFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true,
    value: (input: string | URL | Request, init?: RequestInit) => realFetch(typeof input === 'string' && input.startsWith('/') ? origin + input : input, init) })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin } })
  t.after(() => {
    for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
    server.closeAllConnections(); server.close(); store.close()
  })
  const reader = readerWallet()
  // Each gateway is one reader visit (page load); browser storage persists between them.
  const visit = () => createReaderGateway(() => {}, async () => ({
    identityKey: reader.identity, version: 'fixture', network: 'mainnet',
    auth: new AuthFetch(reader.proto as unknown as WalletInterface), sessionWallet: reader.wallet,
    sessionPost: (path: string, body: unknown) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    getAttempt: () => undefined, confirmPayment: () => {}, retainPaymentAncestors: () => {}, paymentFee: () => null,
  } as unknown as Awaited<ReturnType<Open>>))
  const book: Book = { id: 'holmes', gid: 1661, title: edition.title, author: edition.author, mode: 'reader', editionId: edition.id, pages: edition.pages.length, sourceUrl: '' }
  const first = visit()
  await first.library(); await first.connect(book)
  await first.openSession!(book, 160, 3)
  await first.page(book, 3)
  // Reload 20 minutes later: the same session continues, with no wallet action.
  clock += 20 * 60 * 1000
  const second = visit()
  await second.library(); await second.connect(book)
  assert.equal(second.sessionStatus!()?.state, 'open')
  await second.page(book, 4)
  assert.deepEqual(store.purchases(reader.identity, edition.id).map(p => p.page).sort(), [3, 4])
  assert.deepEqual(reader.calls, ['createAction', 'signAction', 'sendWith'])
  // Leave for more than 30 idle minutes: the server settles; the next visit receives the change.
  clock += config.channel.idleSettleMs + 1
  await (app.locals.channels as { settleIdle(): Promise<unknown> }).settleIdle()
  assert.equal(received, 1)
  const third = visit()
  await third.library(); await third.connect(book)
  for (let i = 0; i < 50 && !reader.calls.includes('internalizeAction'); i++) await new Promise(r => setTimeout(r, 10))
  assert.deepEqual(reader.calls, ['createAction', 'signAction', 'sendWith', 'internalizeAction'])
  assert.equal(third.sessionStatus!()?.state, 'received')
})
