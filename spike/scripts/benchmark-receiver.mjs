// Offline receiving-wallet experiment. Install dependencies only in the ignored
// scratch directory: npm install --prefix spike/evidence/runs/receiver-benchmark
//   @bsv/wallet-toolbox@2.14.9 @bsv/sdk@2.8.11 --no-audit --no-fund
// Run from repository root: node spike/scripts/benchmark-receiver.mjs
import assert from 'node:assert/strict'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { setTimeout as delay } from 'node:timers/promises'

const scratch = resolve('spike/evidence/runs/receiver-benchmark')
const require = createRequire(join(scratch, 'package.json'))
const { PrivateKey, CachedKeyDeriver, ProtoWallet, Transaction, P2PKH, MerklePath, PublicKey } = require('@bsv/sdk')
const { Wallet } = require('@bsv/wallet-toolbox/out/src/Wallet')
const { StorageKnex } = require('@bsv/wallet-toolbox/out/src/storage/StorageKnex')
const { WalletStorageManager } = require('@bsv/wallet-toolbox/out/src/storage/WalletStorageManager')
const { knex } = require('knex')
const toolboxVersion = JSON.parse(await readFile(join(scratch, 'node_modules/@bsv/wallet-toolbox/package.json'), 'utf8')).version
const sdkVersion = JSON.parse(await readFile(join(scratch, 'node_modules/@bsv/sdk/package.json'), 'utf8')).version
assert.equal(toolboxVersion, '2.14.9'); assert.equal(sdkVersion, '2.8.11')

// Fail closed even if a fixture unexpectedly reaches a real service. No .env,
// Setup, native wallet, real key, monitor or network provider is instantiated.
let blockedNetworkCalls = 0
const deny = () => { blockedNetworkCalls++; throw new Error('Offline benchmark: network prohibited') }
globalThis.fetch = deny
net.Socket.prototype.connect = deny
http.request = deny; http.get = deny
https.request = deny; https.get = deny
syncBuiltinESMExports()

const directory = await mkdtemp(join(tmpdir(), 'pagestream-receiver-'))
const results = []
const payerOnly = process.argv.includes('--payer-only')
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
const summary = rows => Object.fromEntries(['totalMs', 'storageMs', 'rootMs', 'postMs'].map(key => [key, {
  cold: rows[0][key], warmMedian: quantile(rows.slice(1).map(row => row[key]), .5),
  warmP95: quantile(rows.slice(1).map(row => row[key]), .95),
}]))

async function scenario(name, storageDelayMs, processorDelayMs, wal = false, payerMode) {
  const db = knex({ client: 'better-sqlite3', connection: { filename: join(directory, `${name}.sqlite`) }, useNullAsDefault: true })
  if (wal) await db.raw('PRAGMA journal_mode = WAL')
  await db.raw('PRAGMA synchronous = FULL')
  const journalMode = await db.raw('PRAGMA journal_mode')
  const queryStarts = new Map()
  let sql = {}
  db.on('query', query => queryStarts.set(query.__knexQueryUid ?? query.sql, performance.now()))
  db.on('query-response', (_response, query) => {
    const key = query.__knexQueryUid ?? query.sql, start = queryStarts.get(key)
    if (start == null) return
    queryStarts.delete(key)
    const operation = query.sql.split(/\s+/)[0].toUpperCase()
    const entry = sql[operation] ??= { count: 0, ms: 0 }
    entry.count++; entry.ms += performance.now() - start
  })
  const receiverKey = PrivateKey.fromRandom(), keyDeriver = new CachedKeyDeriver(receiverKey)
  const provider = new StorageKnex({ ...StorageKnex.createStorageBaseOptions('test'), knex: db })
  let wallet
  const roots = new Set(), expected = new Set(), calls = { roots: 0, posts: 0 }
  let rootMs = 0, postMs = 0, storageMs = 0, failPost = false
  const tracker = { async isValidRootForHeight(root, height) {
    const start = performance.now(); calls.roots++
    try { return height === 1 && roots.has(root) } finally { rootMs += performance.now() - start }
  } }
  const services = new Proxy({
    async getChainTracker() { return tracker },
    async nLockTimeIsFinal(tx) {
      assert.equal(tx.lockTime, 0, 'Only final fixture transactions are allowed')
      return true
    },
    async getStatusForTxids(txids) {
      for (const txid of txids) assert.ok(expected.has(txid))
      return { name: 'OFFLINE SYNTHETIC STATUS', status: 'success', results: txids.map(txid => ({ txid, status: 'unknown' })) }
    },
    async postBeef(beef, txids) {
      const start = performance.now(); calls.posts++
      try {
        assert.ok(txids.length > 0)
        for (const txid of txids) { assert.ok(expected.has(txid)); assert.ok(beef.findTxid(txid)) }
        if (processorDelayMs) await delay(processorDelayMs)
        if (failPost) throw new Error('synthetic processor unavailable')
        return [{ name: 'OFFLINE SYNTHETIC PROCESSOR', status: 'success', txidResults: txids.map(txid => ({ txid, status: 'success' })) }]
      } finally { postMs += performance.now() - start }
    },
  }, { get(target, name) {
    if (name in target) return target[name]
    throw new Error(`Unexpected service access: ${String(name)}`)
  } })
  try {
    await provider.migrate(`offline-${name}`, PrivateKey.fromRandom().toPublicKey().toString())
    await provider.makeAvailable()
    const manager = new WalletStorageManager(keyDeriver.identityKey, provider)
    wallet = new Wallet({ chain: 'test', keyDeriver, storage: manager, services, actionBatchMode: 'legacy' })
    await manager.makeAvailable()
    const original = provider.internalizeAction.bind(provider)
    provider.internalizeAction = async (...args) => {
      const start = performance.now()
      try {
        // Controlled remote-service wait, NOT an actual StorageClient/RPC model.
        if (storageDelayMs) await delay(storageDelayMs)
        return await original(...args)
      } finally { storageMs += performance.now() - start }
    }
    const sender = new ProtoWallet(PrivateKey.fromRandom())
    const senderIdentityKey = (await sender.getPublicKey({ identityKey: true })).publicKey
    async function payment(index, satoshis = 5) {
      const derivationPrefix = Buffer.from(`prefix-${name}`).toString('base64')
      const derivationSuffix = Buffer.from(`suffix-${index}`).toString('base64')
      const { publicKey } = await sender.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${derivationPrefix} ${derivationSuffix}`, counterparty: keyDeriver.identityKey })
      const fundingKey = PrivateKey.fromRandom(), fundingScript = new P2PKH().lock(fundingKey.toAddress())
      const parent = new Transaction(1, [], [{ satoshis: satoshis + 95, lockingScript: fundingScript }], index)
      parent.merklePath = new MerklePath(1, [[{ offset: 0, hash: parent.id('hex'), txid: true }]])
      roots.add(parent.merklePath.computeRoot())
      const tx = new Transaction(1, [{ sourceTransaction: parent, sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScriptTemplate: new P2PKH().unlock(fundingKey) }], [
        { satoshis, lockingScript: new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()) },
        { satoshis: 94, lockingScript: fundingScript },
      ])
      await tx.sign(); expected.add(tx.id('hex'))
      return { txid: tx.id('hex'), args: { tx: tx.toAtomicBEEF(), description: 'Offline synthetic page payment', outputs: [{ outputIndex: 0, protocol: 'wallet payment', paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey } }] } }
    }
    if (payerMode) {
      const funding = await payment(0, 100000)
      assert.equal((await wallet.internalizeAction(funding.args)).accepted, true)
      const beforePosts = calls.posts
      const label = `offline payer ${name}`
      const outputScript = new P2PKH().lock(PrivateKey.fromRandom().toAddress()).toHex()
      const start = performance.now()
      const created = await wallet.createAction({ description: 'Offline synthetic paid page', labels: [label],
        outputs: [{ satoshis: 5, lockingScript: outputScript, outputDescription: 'Offline five sat page' }],
        options: { noSend: true, signAndProcess: payerMode === 'combined', returnTXIDOnly: false, randomizeOutputs: false } })
      const createMs = performance.now() - start
      let signed = created, signMs = 0
      if (payerMode === 'unsigned') {
        assert.ok(created.signableTransaction)
        const signingStart = performance.now()
        signed = await wallet.signAction({ reference: created.signableTransaction.reference, spends: {}, options: { noSend: true, returnTXIDOnly: false } })
        signMs = performance.now() - signingStart
      } else assert.equal(created.signableTransaction, undefined)
      assert.ok(signed.tx); assert.ok(signed.txid)
      expected.add(signed.txid)
      const tx = Transaction.fromAtomicBEEF(signed.tx)
      assert.equal(tx.id('hex'), signed.txid)
      assert.equal(tx.outputs[0].satoshis, 5); assert.equal(tx.outputs[0].lockingScript.toHex(), outputScript)
      assert.ok(Number.isSafeInteger(tx.getFee()) && tx.getFee() >= 0)
      assert.equal(calls.posts, beforePosts, 'Construction and signing must not publish')
      // Simulate a lost create/sign response: discover only through wallet history.
      // This proves discovery, not portable reconstruction of the full signed proof.
      const history = await wallet.listActions({ labels: [label], includeLabels: true, seekPermission: false })
      assert.equal(history.totalActions, 1); assert.equal(history.actions[0].txid, signed.txid)
      assert.equal(history.actions[0].status, 'nosend')
      assert.equal((await wallet.abortAction({ reference: signed.txid })).aborted, true)
      assert.equal(calls.posts, beforePosts, 'Unsent cancellation must not publish')
      const after = await wallet.listActions({ labels: [label], seekPermission: false })
      assert.ok(after.actions.every(action => action.status !== 'nosend'))
      const result = { name, payerMode, createMs, signMs, creationCalls: payerMode === 'combined' ? 1 : 2,
        feeSats: tx.getFee(), checks: { completeSignedProof: true, noPublication: true, historyDiscovery: true, unsentAbortByTxid: true },
        limitation: 'One synthetic sample per mode, test chain, real local Wallet in legacy storage mode; not native-wallet compatibility or an end-to-end latency comparison.' }
      results.push(result); console.log(JSON.stringify(result))
      return
    }
    const rows = []
    for (let index = 0; index < 21; index++) {
      const fixture = await payment(index)
      rootMs = 0; postMs = 0; storageMs = 0; sql = {}
      const before = { ...calls }, start = performance.now()
      const response = await wallet.internalizeAction(fixture.args)
      const totalMs = performance.now() - start
      const measuredSql = structuredClone(sql)
      assert.equal(response.accepted, true)
      assert.equal(calls.posts - before.posts, 1, 'Each fresh unmined receipt must reach the synthetic processor')
      const owned = await provider.findOutputs({ partial: { txid: fixture.txid, vout: 0 } })
      assert.equal(owned.length, 1); assert.equal(owned[0].satoshis, 5); assert.equal(owned[0].spendable, true)
      rows.push({ totalMs, storageMs, rootMs, postMs, rootCalls: calls.roots - before.roots, postCalls: calls.posts - before.posts, sql: measuredSql })
      if (index === 0) {
        const postsBefore = calls.posts
        assert.equal((await wallet.internalizeAction(fixture.args)).accepted, true)
        assert.equal((await provider.findOutputs({ partial: { txid: fixture.txid, vout: 0 } })).length, 1)
        assert.equal(calls.posts, postsBefore, 'Retry must not repost or duplicate ownership')
      }
    }
    const rejected = await payment(999)
    failPost = true
    await assert.rejects(wallet.internalizeAction(rejected.args))
    assert.equal((await provider.findOutputs({ partial: { txid: rejected.txid, vout: 0 } })).length, 0, 'Processor failure must not acquire the paid output')
    results.push({ name, storageDelayMs, processorDelayMs, journalMode, synchronous: 'FULL', samples: rows, summary: summary(rows), checks: { freshAcceptance: 21, duplicateOwnershipPrevented: true, processorFailureRefused: true } })
    console.log(JSON.stringify({ name, summary: summary(rows) }))
  } finally {
    if (wallet) await wallet.destroy()
    else await db.destroy()
  }
}

try {
  if (payerOnly) {
    await scenario('payer-unsigned', 0, 0, true, 'unsigned')
    await scenario('payer-combined', 0, 0, true, 'combined')
  } else {
    await scenario('local-sqlite', 0, 0)
    await scenario('local-sqlite-wal-full', 0, 0, true)
    await scenario('local-sqlite-processor-wait', 0, 250, true)
    await scenario('local-sqlite-service-wait', 250, 0, true)
  }
  assert.equal(blockedNetworkCalls, 0)
  const report = { generatedAt: new Date().toISOString(), node: process.version, platform: process.platform,
    toolbox: toolboxVersion, sdk: sdkVersion,
    scope: 'Synthetic proof root and processor; real Wallet/StorageKnex/file SQLite. Delay scenarios are sensitivity experiments, not remote-storage benchmarks. No production data, network, native wallets or actual sats.',
    blockedNetworkCalls, results }
  await writeFile(join(scratch, payerOnly ? 'payer-report.json' : 'report.json'), JSON.stringify(report, null, 2) + '\n')
} finally {
  assert.ok(directory.startsWith(join(tmpdir(), 'pagestream-receiver-')))
  await rm(directory, { recursive: true, force: true })
}
