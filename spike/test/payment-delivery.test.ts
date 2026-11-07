import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { PrivateKey, ProtoWallet, P2PKH, Script, Transaction, type WalletInterface } from '@bsv/sdk'
import { PaymentDelivery } from '../../app/client/src/payments/payment-delivery.js'
import { openWallet, type WalletCall } from '../../app/client/src/payments/wallet-client.js'
import { createProbe } from '../src/probe.js'
import { Store } from '../src/store.js'
import { loadEdition } from '../src/content.js'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

// Real SDK/AuthFetch and Express payment middleware, isolated synthetic wallets
// and in-memory ownership only. No service client, native wallet or broadcasting.
async function fixture(t: TestContext, overlap: boolean, failBroadcast = false, mismatch?: 'identity' | 'edition' | 'page') {
  const receiver = new ProtoWallet(PrivateKey.fromRandom())
  const reader = new ProtoWallet(PrivateKey.fromRandom())
  const identityKey = (await reader.getPublicKey({ identityKey: true })).publicKey
  const store = new Store(':memory:'), edition = loadEdition()
  const sending = deferred(), send = deferred(), accepting = deferred(), accept = deferred(), httpAccepted = deferred()
  let creates = 0, sends = 0, internalizes = 0
  let lockHeld = false, lockCalls = 0
  let transaction: Transaction | undefined
  const storage = new Map<string, string>(), calls: WalletCall[] = []
  const serverWallet = new Proxy(receiver, { get(target, property) {
    if (property === 'internalizeAction') return async (args: { tx: number[] }) => {
      internalizes++
      assert.equal(Transaction.fromAtomicBEEF(args.tx).id('hex'), transaction!.id('hex'))
      accepting.resolve()
      await accept.promise
      return { accepted: true }
    }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const server = http.createServer(createProbe({ store, edition, wallet: serverWallet, purchasesPaused: () => false }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const originals = ['localStorage', 'location', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin, host: new URL(origin).host } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    async request<T>(_name: string, operation: () => Promise<T>) {
      assert.equal(lockHeld, false, 'The payment must not request its own lock recursively')
      lockCalls++; lockHeld = true
      try { return await operation() }
      finally { lockHeld = false }
    },
  } } })
  t.after(() => {
    send.resolve(); accept.resolve()
    server.closeAllConnections(); server.close(); store.close()
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  const key = PrivateKey.fromRandom(), script = new P2PKH().lock(key.toAddress())
  const parent = new Transaction(1, [], [{ satoshis: 100, lockingScript: script }])
  const wallet = new Proxy(reader, { get(target, property) {
    if (property === 'getVersion') return async () => ({ version: 'synthetic' })
    if (property === 'getNetwork') return async () => ({ network: 'mainnet' })
    if (property === 'createAction') return async (args: Parameters<WalletInterface['createAction']>[0]) => {
      if (args.options?.sendWith) {
        sends++
        const attempt = session.getAttempt(edition.id, 3)!
        assert.equal(attempt.state, 'signed')
        assert.ok(attempt.proof)
        assert.equal(attempt.txid, transaction!.id('hex'))
        assert.deepEqual(args.options.sendWith, [attempt.txid])
        assert.equal(args.options.acceptDelayedBroadcast, false)
        assert.equal(args.outputs, undefined)
        sending.resolve()
        await send.promise
        return { sendWithResults: [{ txid: attempt.txid, status: failBroadcast ? 'failed' : 'unproven' }] }
      }
      creates++
      assert.equal(args.options?.noSend, true)
      assert.equal(args.options?.signAndProcess, false)
      transaction = new Transaction(1, [{ sourceTransaction: parent, sourceTXID: parent.id('hex'),
        sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScript: Script.fromHex(''),
        unlockingScriptTemplate: new P2PKH().unlock(key) }],
      [{ satoshis: 5, lockingScript: Script.fromHex(args.outputs![0].lockingScript) }, { satoshis: 94, lockingScript: script }])
      return { signableTransaction: { reference: 'cmVmZXJlbmNl', tx: transaction.toAtomicBEEF() } }
    }
    if (property === 'signAction') return async (args: Parameters<WalletInterface['signAction']>[0]) => {
      assert.equal(args.options?.noSend, true)
      await transaction!.sign()
      return { txid: transaction!.id('hex'), tx: transaction!.toAtomicBEEF() }
    }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const session = await openWallet({
    call: call => calls.push(call),
    http: call => { if (call.status === 200 && call.path.endsWith('/pages/3')) httpAccepted.resolve() },
    spend: () => {}, currentPage: () => 3, canSpend: () => true,
  }, { acquireWallet: async () => ({ wallet, identityKey }), paymentDeliveryTarget: overlap
    ? `${mismatch === 'identity' ? 'other-reader' : identityKey}/${mismatch === 'edition' ? 'other-edition' : edition.id}/${mismatch === 'page' ? 4 : 3}`
    : undefined })
  const requestId = crypto.randomUUID()
  session.beginPayment(edition.id, 3, requestId, 1)
  return { session, edition, store, identityKey, origin, sending, send, accepting, accept, httpAccepted, calls,
    counts: () => ({ creates, sends, internalizes }),
    lock: () => ({ held: lockHeld, calls: lockCalls }),
    fetch: () => session.fetchPaidPage(origin + '/api/pages/3', { headers: { 'x-bsv-request-id': requestId }, paymentRetryAttempts: 1 }),
  }
}

test('pilot overlaps original-transaction submission and broadcast but withholds delivery until both succeed', { timeout: 15000 }, async t => {
  const f = await fixture(t, true)
  let delivered = false
  const pending = f.fetch().then(response => { delivered = true; return response })
  await Promise.all([f.sending.promise, f.accepting.promise])
  assert.equal(delivered, false)
  assert.deepEqual(f.lock(), { held: true, calls: 1 })
  assert.throws(() => f.session.beginPayment(f.edition.id, 4, crypto.randomUUID()), /still active/)
  f.accept.resolve()
  await f.httpAccepted.promise
  assert.equal(delivered, false, 'An accepted HTTP response cannot skip the payer broadcast check')
  f.send.resolve()
  assert.equal((await pending).status, 200)
  assert.equal(f.session.getAttempt(f.edition.id, 3)?.broadcast?.status, 'unproven')
  assert.deepEqual(f.counts(), { creates: 1, sends: 1, internalizes: 1 })
  assert.equal(f.calls.find(call => call.method === 'page payment workflow')?.ok, true)
  assert.equal(f.calls.find(call => call.method === 'page payment workflow')?.paymentMetrics?.deliveryMode, 'overlap')
  assert.deepEqual(f.lock(), { held: false, calls: 1 })
})

test('successful payer broadcast cannot release a page before receiver acceptance', { timeout: 15000 }, async t => {
  const f = await fixture(t, true)
  let delivered = false
  const pending = f.fetch().then(response => { delivered = true; return response })
  await Promise.all([f.sending.promise, f.accepting.promise])
  f.send.resolve()
  // Allow the broadcast result and its workflow observation to settle.
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(f.calls.find(call => call.method === 'page payment workflow')?.ok, true)
  assert.equal(delivered, false)
  assert.deepEqual(f.lock(), { held: true, calls: 1 })
  assert.equal(f.store.purchases(f.identityKey, f.edition.id).length, 0)
  f.accept.resolve()
  assert.equal((await pending).status, 200)
})

test('accepted receiver response with failed broadcast preserves the original payment and blocks delivery', { timeout: 15000 }, async t => {
  const f = await fixture(t, true, true)
  const pending = assert.rejects(f.fetch(), /Wallet broadcast status: failed/)
  await Promise.all([f.sending.promise, f.accepting.promise])
  f.accept.resolve()
  await f.httpAccepted.promise
  f.send.resolve()
  await pending
  assert.equal(f.session.getAttempt(f.edition.id, 3)?.state, 'signed')
  assert.equal(f.session.getAttempt(f.edition.id, 3)?.broadcast?.status, 'failed')
  assert.equal(f.store.purchases(f.identityKey, f.edition.id).length, 1)
  assert.deepEqual(f.counts(), { creates: 1, sends: 1, internalizes: 1 })
  assert.equal(f.calls.find(call => call.method === 'page payment workflow')?.ok, false)
})

test('ordinary delivery retains serial broadcast-before-submission behavior', { timeout: 15000 }, async t => {
  const f = await fixture(t, false)
  const pending = f.fetch()
  await f.sending.promise
  assert.equal(f.counts().internalizes, 0)
  f.send.resolve()
  await f.accepting.promise
  f.accept.resolve()
  assert.equal((await pending).status, 200)
})

test('paid delivery refuses a page or edition that differs from the durable attempt before creating money movement', { timeout: 15000 }, async t => {
  const f = await fixture(t, true)
  for (const path of ['/api/pages/4', '/api/editions/other-edition/pages/3'])
    await assert.rejects(f.session.fetchPaidPage(f.origin + path), /does not match the original payment attempt/)
  assert.deepEqual(f.counts(), { creates: 0, sends: 0, internalizes: 0 })
})

test('pilot target cannot enable overlap for another identity, edition or page', { timeout: 15000 }, async t => {
  for (const mismatch of ['identity', 'edition', 'page'] as const) {
    await t.test(mismatch, async t => {
      const f = await fixture(t, true, false, mismatch)
      const pending = f.fetch()
      await f.sending.promise
      assert.equal(f.counts().internalizes, 0)
      f.send.resolve()
      await f.accepting.promise
      f.accept.resolve()
      assert.equal((await pending).status, 200)
      assert.equal(f.calls.find(call => call.method === 'page payment workflow')?.paymentMetrics?.deliveryMode, 'serial')
    })
  }
})

test('HTTP failure waits for the outstanding broadcast and never replaces it', async () => {
  const delivery = new PaymentDelivery(), send = deferred()
  const failure = new Error('Lost delivery')
  let finished = false, broadcasts = 0
  const pending = assert.rejects(delivery.run(async () => {
    delivery.startBroadcast(async () => { broadcasts++; await send.promise })
    assert.throws(() => delivery.startBroadcast(async () => {}), /another broadcast/)
    throw failure
  }), error => error === failure).then(() => { finished = true })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(finished, false)
  send.resolve()
  await pending
  assert.equal(broadcasts, 1)
  assert.throws(() => delivery.startBroadcast(async () => {}), /another broadcast/)
  await assert.rejects(delivery.run(async () => {}), /cannot be reused/)
})

test('preparation failure starts no broadcast and dual failures retain the submission error', async () => {
  const preparation = new Error('Fee refused'), submission = new Error('Response lost'), broadcast = new Error('Send failed')
  const delivery = new PaymentDelivery()
  await assert.rejects(delivery.run(async () => { throw preparation }), error => error === preparation)
  const failed = new PaymentDelivery()
  await assert.rejects(failed.run(async () => {
    failed.startBroadcast(async () => { throw broadcast })
    throw submission
  }), error => error === submission)
})
