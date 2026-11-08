import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuthFetch, PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { Store } from '../src/store.js'
import { createProbe } from '../src/probe.js'
import { loadCatalogue } from '../src/content.js'

test('independent authenticated devices resume the same durable bookmark and costs across restart, without paying', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pagestream-cross-device-'))
  const path = join(directory, 'state.sqlite')
  let store = new Store(path)
  const catalogue = loadCatalogue(), [first, second] = catalogue.map(book => book.edition)
  const key = PrivateKey.fromRandom(), identity = key.toPublicKey().toString()
  // Synthetic existing receipts seed the integration test, not the production ledger.
  store.purchase(identity, first.id, 3, 'a'.repeat(64), 5)
  store.recordFee('a'.repeat(64), 23, 'synthetic-receipt')
  store.purchase(identity, first.id, 4, 'b'.repeat(64), 5)
  store.recordFee('b'.repeat(64), 1, 'synthetic-receipt')
  let attemptedPayments = 0
  const noPayments = (wallet: ProtoWallet) => new Proxy(wallet, { get(target, name) {
    if (['createAction', 'signAction', 'internalizeAction', 'abortAction'].includes(String(name)))
      return async () => { attemptedPayments++; throw new Error('Read-only cross-device test cannot make a payment') }
    const value = Reflect.get(target, name)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const receiver = noPayments(new ProtoWallet(PrivateKey.fromRandom()))
  let server: http.Server
  const start = async () => {
    server = http.createServer(createProbe({ store, edition: first, catalogue, wallet: receiver, purchasesPaused: () => true }))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${(server.address() as { port: number }).port}`
  }
  const stop = async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  t.after(async () => { await stop(); store.close(); rmSync(directory, { recursive: true, force: true }) })
  let origin = await start()
  // Separate ProtoWallet and AuthFetch instances share only the synthetic root.
  const device = () => new AuthFetch(noPayments(new ProtoWallet(PrivateKey.fromString(key.toHex(), 'hex'))))
  const laptop = device(), phone = device(), stranger = new AuthFetch(noPayments(new ProtoWallet(PrivateKey.fromRandom())))
  const url = (edition: string, route: string) => `${origin}/api/editions/${edition}/${route}`
  const json = async (auth: AuthFetch, edition: string, route: string) => {
    const response = await auth.fetch(url(edition, route)); assert.equal(response.status, 200)
    return response.json()
  }
  const save = (auth: AuthFetch, edition: string, page: number, displayedAt: number) => auth.fetch(url(edition, 'bookmarks'), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page, displayedAt }),
  })
  const now = Date.now()
  assert.equal((await save(laptop, first.id, 3, now - 1000)).status, 200)
  const resumed = await json(phone, first.id, 'me')
  assert.equal(resumed.identityKey, identity)
  assert.equal(resumed.bookmark.page, 3)
  assert.equal(resumed.purchases.reduce((total: number, purchase: { sats: number; feeSats: number }) => total + purchase.sats + purchase.feeSats, 0), 34)
  assert.equal((await json(phone, first.id, 'owned/3')).purchase.txid, 'a'.repeat(64))
  await Promise.all([save(phone, first.id, 4, now), save(laptop, first.id, 3, now - 500)])
  assert.equal((await json(laptop, first.id, 'me')).bookmark.page, 4)
  assert.equal((await json(phone, second.id, 'me')).bookmark, null)
  assert.deepEqual((await json(stranger, first.id, 'me')).purchases, [])
  assert.equal((await stranger.fetch(url(first.id, 'owned/3'))).status, 404)
  assert.equal((await save(stranger, first.id, 3, now)).status, 403)
  assert.equal((await save(phone, first.id, 5, now)).status, 403)
  await stop(); store.close(); store = new Store(path); origin = await start()
  const afterRestart = await json(device(), first.id, 'me')
  assert.deepEqual(afterRestart.purchases, resumed.purchases)
  assert.equal(afterRestart.bookmark.page, 4)
  assert.equal((await device().fetch(url(first.id, 'pages/5'), { paymentRetryAttempts: 1 })).status, 503)
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM intents').get()!.count, 0)
  assert.equal(store.purchases(identity, first.id).length, 2)
  assert.equal(attemptedPayments, 0)
})
