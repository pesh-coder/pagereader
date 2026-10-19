import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { AuthFetch, PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { Store } from '../src/store.js'
import { createProbe } from '../src/probe.js'
import { loadCatalogue, loadEdition, segment } from '../src/content.js'
import { manifest } from '../src/manifest.js'
import { config } from '../src/config.js'

test('fixed segmentation preserves every paragraph and has no viewport input', () => {
  const paragraphs = ['a'.repeat(1800), 'second paragraph', 'third paragraph']
  const pages = segment(paragraphs.join('\n\n'))
  assert.deepEqual(pages.flat(), paragraphs)
  assert.equal(pages.length, 2)
  assert.deepEqual(segment(paragraphs.join('\n\n')), pages)
})

test('manifest allowance and provisional descriptions come from the one config', () => {
  const data = manifest('02' + 'a'.repeat(64))
  assert.equal(data.metanet.groupPermissions.spendingAuthorization.amount, config.provisional.walletLimitSats)
  assert.equal(data.metanet.groupPermissions.spendingAuthorization.description, config.provisional.permissionCopy)
  assert.ok(data.metanet.groupPermissions.protocolPermissions.some(p => p.protocolID[1] === 'auth message signature'))
})

test('public catalogue/pages never call a wallet, paid text cannot leak through public routes', async t => {
  let calls = 0
  const real = new ProtoWallet(PrivateKey.fromRandom())
  const wallet = new Proxy(real, { get(target, property) {
    if (property === 'internalizeAction') return async () => { calls++; throw new Error('Unexpected payment') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? (...args: unknown[]) => { calls++; return value.apply(target, args) } : value
  } }) as WalletInterface
  const store = new Store(':memory:')
  const app = createProbe({ store, edition: loadEdition(), catalogue: loadCatalogue(), wallet })
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close(); store.close() })
  const address = server.address() as { port: number }
  const base = `http://127.0.0.1:${address.port}`
  for (const path of ['/api/catalogue', '/api/library', '/api/public/pages/1', '/api/public/pages/2', '/']) assert.equal((await fetch(base + path)).status, 200)
  const library = await (await fetch(base + '/api/library')).json()
  assert.equal(library.books.length, 8)
  assert.equal(library.books.filter((book: { mode: string }) => book.mode === 'reader').length, 8)
  assert.ok(library.books.every((book: { pages: number; editionId: string }) => book.pages > 2 && book.editionId))
  assert.equal(calls, 0)
  assert.equal((await fetch(base + '/api/public/pages/3')).status, 403)
  assert.equal(calls, 0)
  const sourceAttempt = await fetch(base + '/data/edition.json')
  assert.notEqual(sourceAttempt.status, 200)
})

test('unpaid authenticated identity and post-display bookmark roundtrip need no payment', async t => {
  const real = new ProtoWallet(PrivateKey.fromRandom())
  let receives = 0
  const wallet = new Proxy(real, { get(target, property) {
    if (property === 'internalizeAction') return async () => { receives++; throw new Error('Not a payment test') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as WalletInterface
  const store = new Store(':memory:')
  const app = createProbe({ store, edition: loadEdition(), wallet })
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close(); store.close() })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const reader = new ProtoWallet(PrivateKey.fromRandom())
  // Crypto-only fixture: unpaid routes use signing APIs; no payment methods are supplied.
  const auth = new AuthFetch(reader as unknown as WalletInterface)
  const publicKey = (await reader.getPublicKey({ identityKey: true })).publicKey
  const me = await auth.fetch(base + '/api/me')
  assert.equal(me.status, 200)
  assert.equal((await me.json()).identityKey, publicKey)
  const displayedAt = Date.now()
  const saved = await auth.fetch(base + '/api/bookmarks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 2, displayedAt }) })
  assert.equal(saved.status, 200)
  const second = await auth.fetch(base + '/api/me')
  assert.equal((await second.json()).bookmark.page, 2)
  assert.equal(receives, 0)
  assert.equal(store.purchases(publicKey, loadEdition().id).length, 0)
})

test('bookmark timestamps are last-writer-wins and reads/purchases do not move a bookmark', () => {
  const store = new Store(':memory:')
  try {
    store.saveBookmark('reader', 'edition', 2, 200)
    store.saveBookmark('reader', 'edition', 1, 100)
    store.purchase('reader', 'edition', 3, 'fixture-txid', 5)
    assert.equal(store.bookmark('reader', 'edition')?.page, 2)
  } finally { store.close() }
})

test('authenticated page-3 challenge reaches the official wallet API at 5 sats without spending', async t => {
  const serverWallet = new ProtoWallet(PrivateKey.fromRandom())
  const receiver = new Proxy(serverWallet, { get(target, property) {
    if (property === 'internalizeAction') return async () => { throw new Error('No transaction should be submitted') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as WalletInterface
  const reader = new ProtoWallet(PrivateKey.fromRandom())
  let quotedSats: number | undefined
  const readerApi = new Proxy(reader, { get(target, property) {
    if (property === 'createAction') return async (args: Parameters<WalletInterface['createAction']>[0]) => {
      quotedSats = args.outputs?.[0]?.satoshis
      throw new Error('Stop before spend: this is a challenge integration test')
    }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const store = new Store(':memory:')
  const edition = loadEdition()
  const server = http.createServer(createProbe({ store, edition, wallet: receiver, purchasesPaused: () => false }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close(); store.close() })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const auth = new AuthFetch(readerApi)
  const requestId = crypto.randomUUID()
  await assert.rejects(() => auth.fetch(base + '/api/pages/3', { headers: { 'x-bsv-request-id': requestId }, paymentRetryAttempts: 1 }), /Stop before spend/)
  assert.equal(quotedSats, 5)
  const key = (await reader.getPublicKey({ identityKey: true })).publicKey
  const intent = store.intent(key, edition.id, 3)
  assert.ok(intent?.prefix)
  assert.equal(intent.state, 'challenged')
  assert.equal(store.purchases(key, edition.id).length, 0)
  await assert.rejects(() => auth.fetch(base + '/api/pages/3', { headers: { 'x-bsv-request-id': requestId }, paymentRetryAttempts: 1 }), /Stop before spend/)
  assert.equal(store.intent(key, edition.id, 3)?.prefix, intent.prefix)
  const otherTab = await auth.fetch(base + '/api/pages/3', { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 })
  assert.equal(otherTab.status, 409)
})

test('incident pause refuses a fresh payment challenge but keeps owned content readable', async t => {
  const receiver = new ProtoWallet(PrivateKey.fromRandom())
  const wallet = new Proxy(receiver, { get(target, property) {
    if (property === 'internalizeAction') return async () => { throw new Error('No payment expected') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as WalletInterface
  const reader = new ProtoWallet(PrivateKey.fromRandom())
  const key = (await reader.getPublicKey({ identityKey: true })).publicKey
  const store = new Store(':memory:')
  const edition = loadEdition()
  store.purchase(key, edition.id, 3, 'previously-recorded-fixture', 5)
  const server = http.createServer(createProbe({ store, edition, wallet, purchasesPaused: () => true }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close(); store.close() })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const auth = new AuthFetch(reader as unknown as WalletInterface)
  const stopped = await auth.fetch(base + '/api/pages/4', { headers: { 'x-bsv-request-id': crypto.randomUUID() } })
  assert.equal(stopped.status, 503)
  assert.equal(stopped.headers.get('x-bsv-payment-derivation-prefix'), null)
  assert.equal(store.intent(key, edition.id, 4), undefined)
  const owned = await auth.fetch(base + '/api/owned/3')
  assert.equal(owned.status, 200)
  assert.equal((await owned.json()).page, 3)
})
