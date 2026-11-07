import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { AuthFetch, PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import type { Wallet } from '@bsv/wallet-toolbox-client'
import { instrumentReceiver, measureReceiver, type ReceiverMetrics } from '../src/receiver-profile.js'
import { createProbe } from '../src/probe.js'
import { Store } from '../src/store.js'
import { loadEdition } from '../src/content.js'

test('receiver profiling preserves validation failures, arguments and concurrent request isolation', async () => {
  const failure = new Error('provider unavailable')
  let rootCalls = 0, storageCalls = 0
  const tracker = { async isValidRootForHeight(root: string, height: number) {
    rootCalls++; assert.equal(height, 123)
    await new Promise(resolve => setTimeout(resolve, 5))
    if (root === 'throw') throw failure
    return root === 'valid'
  } }
  const services = { async getChainTracker() { return tracker } }
  const storage = { async internalizeAction(args: object) { storageCalls++; return args } }
  const wallet = { getServices() { return services }, storage } as unknown as Wallet
  instrumentReceiver(wallet)
  const profiles: ReceiverMetrics[] = []
  await Promise.all(['valid', 'invalid', 'throw'].map(async root => {
    await measureReceiver(async () => {
      const observed = await wallet.getServices().getChainTracker()
      if (root === 'throw') await assert.rejects(observed.isValidRootForHeight(root, 123), e => e === failure)
      else assert.equal(await observed.isValidRootForHeight(root, 123), root === 'valid')
      const args = { tx: [1], outputs: [], description: 'Synthetic profiling fixture' }
      assert.equal(await wallet.storage.internalizeAction(args), args)
    }, m => profiles.push(m))
  }))
  assert.equal(rootCalls, 3); assert.equal(storageCalls, 3)
  for (const profile of profiles) {
    assert.equal(profile.rootCalls, 1); assert.equal(profile.storageCalls, 1)
    assert.ok(profile.rootMs >= 4)
  }
})

test('operator diagnostic rejects other identities and unaccepted proofs without running diagnostics or payment calls', async t => {
  const raw = new ProtoWallet(PrivateKey.fromRandom())
  const other = new ProtoWallet(PrivateKey.fromRandom())
  const identity = (await raw.getPublicKey({ identityKey: true })).publicKey
  const edition = loadEdition(), store = new Store(':memory:')
  let paymentCalls = 0, diagnostics = 0
  const guarded = (wallet: ProtoWallet) => new Proxy(wallet, { get(target, property) {
    if (['createAction', 'signAction', 'internalizeAction', 'abortAction'].includes(String(property)))
      return async () => { paymentCalls++; throw new Error('Forbidden') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const server = http.createServer(createProbe({ store, edition, research: false, wallet: guarded(raw), serverIdentity: identity,
    receiverDiagnostics: async tx => { diagnostics++; assert.deepEqual(tx, [1, 2, 3]); return { valid: true } } }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close(); store.close() })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const txid = 'a'.repeat(64)
  const path = base + '/api/receiver-latency/' + txid
  const foreign = new AuthFetch(guarded(other))
  assert.equal((await foreign.fetch(path)).status, 403)
  assert.equal(diagnostics, 0)
  const operator = new AuthFetch(guarded(raw))
  assert.equal((await operator.fetch(path)).status, 404)
  const request = crypto.randomUUID()
  store.reserve(identity, edition.id, 3, request)
  store.challenge(identity, edition.id, 3, 'prefix')
  store.submitted(identity, edition.id, 3, txid, JSON.stringify({ transaction: 'AQID' }))
  assert.equal((await operator.fetch(path)).status, 404)
  assert.equal(diagnostics, 0)
  store.accepted(identity, edition.id, 3, 'prefix', txid, 5, 23)
  assert.equal((await operator.fetch(path)).status, 200)
  assert.equal(diagnostics, 1)
  assert.equal((await operator.fetch(path)).status, 200)
  assert.equal((await operator.fetch(path)).status, 429)
  assert.equal(diagnostics, 2); assert.equal(paymentCalls, 0)
  assert.equal(store.purchases(identity, edition.id).length, 1)
})
