import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { AuthFetch, Beef, BEEF_V2, P2PKH, PrivateKey, ProtoWallet, Script, Transaction, type WalletInterface } from '@bsv/sdk'
import { Store } from '../src/store.js'
import { createProbe } from '../src/probe.js'
import { loadEdition } from '../src/content.js'

// Isolated SDK fixtures only: no native wallet, network provider or broadcast.
async function fixture(t: TestContext, options: { amount?: number; delayed?: boolean; internalizeDelayMs?: number; chainPayments?: boolean; hintsDisabled?: boolean } = {}) {
  const receiver = new ProtoWallet(PrivateKey.fromRandom())
  const reader = new ProtoWallet(PrivateKey.fromRandom())
  const store = new Store(':memory:')
  const edition = loadEdition()
  const identity = (await reader.getPublicKey({ identityKey: true })).publicKey
  let last: Transaction | undefined
  const chainKey = PrivateKey.fromRandom(), hintCounts: number[] = [], paymentSizes: number[] = []
  let creates = 0, internalizes = 0, paused = false
  let release!: () => void
  let started!: () => void
  const approvalStarted = new Promise<void>(resolve => { started = resolve })
  const approval = new Promise<void>(resolve => { release = resolve })
  const serverWallet = new Proxy(receiver, { get(target, property) {
    if (property === 'internalizeAction') return async (args: Parameters<WalletInterface['internalizeAction']>[0]) => { if (options.chainPayments) { assert.ok(!Beef.fromBinaryStrict(args.tx).txs.some(tx => tx.isTxidOnly)); assert.equal(Transaction.fromAtomicBEEF(args.tx).getFee(), 1) } internalizes++; if (options.internalizeDelayMs) await new Promise(resolve => setTimeout(resolve, options.internalizeDelayMs)); return { accepted: true } }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as WalletInterface
  const wallet = new Proxy(reader, { get(target, property) {
    if (property === 'createAction') return async (args: Parameters<WalletInterface['createAction']>[0]) => {
      creates++; started()
      if (options.delayed) await approval
      const key = options.chainPayments ? chainKey : PrivateKey.fromRandom()
      const script = new P2PKH().lock(key.toAddress())
      const parent = options.chainPayments && last ? last : new Transaction(1, [], [{ satoshis: 5000, lockingScript: script }])
      const outputIndex = options.chainPayments && last ? 1 : 0
      hintCounts.push(args.options?.knownTxids?.length ?? 0)
      const amount = options.amount ?? args.outputs![0].satoshis
      const tx = new Transaction(1, [{ sourceTransaction: parent, sourceTXID: parent.id('hex'), sourceOutputIndex: outputIndex, sequence: 4294967295, unlockingScript: Script.fromHex(''), unlockingScriptTemplate: new P2PKH().unlock(key) }], [
        { satoshis: amount, lockingScript: Script.fromHex(args.outputs![0].lockingScript) },
        { satoshis: parent.outputs[outputIndex].satoshis! - 1 - amount, lockingScript: script },
      ])
      await tx.sign()
      last = tx
      const beef = Beef.fromBinaryStrict(tx.toAtomicBEEF()); beef.version = BEEF_V2
      if (options.chainPayments) for (const id of args.options?.knownTxids ?? []) if (beef.findTxid(id)) beef.makeTxidOnly(id)
      const raw = beef.toBinaryAtomic(tx.id('hex')); paymentSizes.push(raw.length)
      return { txid: tx.id('hex'), tx: raw }
    }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const server = http.createServer(createProbe({ store, edition, wallet: serverWallet, purchasesPaused: () => paused, knownAncestorsEnabled: () => !options.hintsDisabled }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { release(); server.closeAllConnections(); server.close(); store.close() })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  let proof: string | undefined
  const serverTimings: string[] = []
  const transport: typeof fetch = async (input, init) => {
    const header = new Headers(init?.headers).get('x-bsv-payment')
    if (header) proof = header
    const response = await fetch(input, init)
    const timing = response.headers.get('Server-Timing')
    if (timing) serverTimings.push(timing)
    return response
  }
  const auth = () => new AuthFetch(wallet, undefined, undefined, undefined, undefined, transport)
  return { store, edition, identity, base, auth, approvalStarted, release,
    pause: () => { paused = true },
    counts: () => ({ creates, internalizes }), proof: () => proof!, serverTimings, hintCounts, paymentSizes,
  }
}

test('response timings expose receiving-wallet delay separately from receipt commit and owned rereads', async t => {
  const f = await fixture(t, { internalizeDelayMs: 25 })
  const auth = f.auth()
  const paid = await auth.fetch(f.base + '/api/pages/3', { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 })
  assert.equal(paid.status, 200)
  const body = await paid.json()
  assert.ok(body.timing.walletInternalizeMs >= 20)
  assert.ok(body.timing.serverWalletMs >= body.timing.walletInternalizeMs)
  assert.ok(body.timing.internalizeMs >= body.timing.walletInternalizeMs)
  assert.ok(body.timing.dbMs >= 0 && body.timing.receiptCommitMs >= 0)
  // AuthFetch reconstructs authenticated responses and filters custom headers;
  // collect the diagnostic header at its transport boundary instead.
  assert.ok(f.serverTimings.some(value => /internalize;dur=/.test(value)))
  assert.equal(f.store.owned(f.identity, f.edition.id, 3)?.txid, body.purchase.txid)
  const owned = await auth.fetch(f.base + '/api/owned/3', { paymentRetryAttempts: 1 })
  assert.equal(owned.status, 200)
  const reread = await owned.json()
  assert.equal(reread.timing.walletInternalizeMs, 0)
  assert.equal(reread.timing.receiptCommitMs, 0)
  assert.equal(reread.purchase.txid, body.purchase.txid)
  assert.deepEqual(f.counts(), { creates: 1, internalizes: 1 })
})

test('four-sat underpayment is rejected before receiving money or granting ownership', async t => {
  const f = await fixture(t, { amount: 4 })
  const response = await f.auth().fetch(f.base + '/api/pages/3', { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'ERR_INVALID_PAYMENT')
  assert.deepEqual(f.counts(), { creates: 1, internalizes: 0 })
  assert.equal(f.store.owned(f.identity, f.edition.id, 3), undefined)
  assert.equal(f.store.intent(f.identity, f.edition.id, 3)?.state, 'submitted')
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM replay_claims').get()?.n, 0)
  // An invalid submitted transaction stays visible; it cannot be silently replaced.
  const retry = await f.auth().fetch(f.base + '/api/pages/3', { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 })
  assert.equal(retry.status, 409)
  assert.deepEqual(f.counts(), { creates: 1, internalizes: 0 })
})

test('cross-identity replay is a conflict even with a matching second intent; original ownership survives', async t => {
  const f = await fixture(t)
  const requestId = crypto.randomUUID()
  const paid = await f.auth().fetch(f.base + '/api/pages/3', { headers: { 'x-bsv-request-id': requestId }, paymentRetryAttempts: 1 })
  assert.equal(paid.status, 200)
  const txid = (await paid.json()).purchase.txid
  const other = new ProtoWallet(PrivateKey.fromRandom())
  const otherIdentity = (await other.getPublicKey({ identityKey: true })).publicKey
  const otherAuth = new AuthFetch(other as unknown as WalletInterface)
  // A no-spend challenge obtains the second identity's legitimate prefix.
  const capture = new Proxy(other, { get(target, property) {
    if (property === 'createAction') return async () => { throw new Error('fixture stops before creating a payment') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const otherRequest = crypto.randomUUID()
  await assert.rejects(() => new AuthFetch(capture).fetch(f.base + '/api/pages/3', { headers: { 'x-bsv-request-id': otherRequest }, paymentRetryAttempts: 1 }), /fixture stops/)
  const proof = JSON.parse(f.proof())
  proof.derivationPrefix = f.store.intent(otherIdentity, f.edition.id, 3)!.prefix
  f.pause()
  const replay = await otherAuth.fetch(f.base + '/api/pages/3', { headers: { 'x-bsv-request-id': otherRequest, 'x-bsv-payment': JSON.stringify(proof) }, paymentRetryAttempts: 1 })
  assert.equal(replay.status, 409)
  assert.deepEqual(f.counts(), { creates: 1, internalizes: 1 })
  assert.equal(f.store.owned(otherIdentity, f.edition.id, 3), undefined)
  assert.equal(f.store.intent(otherIdentity, f.edition.id, 3)?.txid, null)
  assert.equal(f.store.owned(f.identity, f.edition.id, 3)?.txid, txid)
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM payment_proofs').get()?.n, 1)
  const reread = await f.auth().fetch(f.base + '/api/owned/3')
  assert.equal((await reread.json()).purchase.txid, txid)
})

test('independent clients cannot create a second payment while the original approval waits; original completes through pause', async t => {
  const f = await fixture(t, { delayed: true })
  const originalRequest = crypto.randomUUID()
  const original = f.auth().fetch(f.base + '/api/pages/3', { headers: { 'x-bsv-request-id': originalRequest }, paymentRetryAttempts: 1 })
  await f.approvalStarted
  const originalIntent = f.store.intent(f.identity, f.edition.id, 3)
  const competing = await f.auth().fetch(f.base + '/api/pages/3', { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 })
  assert.equal(competing.status, 409)
  assert.equal(competing.headers.get('x-bsv-payment-derivation-prefix'), null)
  assert.deepEqual(f.store.intent(f.identity, f.edition.id, 3), originalIntent)
  assert.deepEqual(f.counts(), { creates: 1, internalizes: 0 })
  assert.equal(f.store.owned(f.identity, f.edition.id, 3), undefined)
  f.pause()
  f.release()
  const delivered = await original
  assert.equal(delivered.status, 200)
  const txid = (await delivered.json()).purchase.txid
  assert.deepEqual(f.counts(), { creates: 1, internalizes: 1 })
  assert.deepEqual(f.store.purchases(f.identity, f.edition.id).map(row => ({ ...row })), [{ page: 3, sats: 5, txid, feeSats: 1 }])
  assert.equal(f.store.intent(f.identity, f.edition.id, 3)?.request_id, originalRequest)
  const reread = await f.auth().fetch(f.base + '/api/owned/3')
  assert.equal((await reread.json()).purchase.txid, txid)
  assert.deepEqual(f.counts(), { creates: 1, internalizes: 1 })
})


test('BRC-105 hints sustain 16 chained payments while the receiver and durable proof remain complete', async t => {
  const f = await fixture(t, { chainPayments: true })
  const auth = f.auth()
  for (let page = 3; page <= 18; page++) {
    const response = await auth.fetch(f.base + '/api/pages/' + page, { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 })
    assert.equal(response.status, 200)
    const body = await response.json(), saved = JSON.parse(f.store.proof(body.purchase.txid)!.proof)
    assert.ok(!Beef.fromBinaryStrict(Buffer.from(saved.transaction, 'base64')).txs.some(tx => tx.isTxidOnly))
    assert.equal(Transaction.fromAtomicBEEF(Buffer.from(saved.transaction, 'base64')).getFee(), 1)
  }
  assert.equal(f.hintCounts[0], 0)
  assert.ok(f.hintCounts.slice(1).every(count => count > 0 && count <= 8))
  assert.ok(f.paymentSizes.at(-1)! < 1000, 'HTTP proof stays bounded instead of resending the whole chain')
  assert.deepEqual(f.counts(), { creates: 16, internalizes: 16 })
  const history = await auth.fetch(f.base + '/api/me?ancestors=1')
  assert.equal(history.status, 200)
  const pool = (await history.json()).paymentAncestors
  assert.ok(pool.length > 0 && pool.length <= 8)
  for (const item of pool) assert.equal(Transaction.fromAtomicBEEF(Buffer.from(item.transaction, 'base64')).id('hex'), item.txid)
  const other = new AuthFetch(new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface)
  assert.deepEqual((await (await other.fetch(f.base + '/api/me?ancestors=1')).json()).paymentAncestors, [])
})

test('known-ancestor kill switch keeps legacy full-proof payments available', async t => {
  const f = await fixture(t, { chainPayments: true, hintsDisabled: true }), auth = f.auth()
  for (const page of [3, 4]) assert.equal((await auth.fetch(f.base + '/api/pages/' + page,
    { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 })).status, 200)
  assert.deepEqual(f.hintCounts, [0, 0])
})
