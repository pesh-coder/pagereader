// Offline comparison of per-page payment algorithms. No wallet, network or sats.
// Run from spike: node --import tsx scripts/benchmark-payment-channel.ts
// CPU numbers are measured here. Click-latency rows are a seeded resampling
// model built from measured native wallet/server durations and warm round trips
// (evidence/payment-channel/native-and-network-samples.json); they are an
// estimate to rank algorithms, not native observations of a channel.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { performance } from 'node:perf_hooks'
import { LockingScript, P2PKH, PrivateKey, ProtoWallet, Random, Spend, Transaction, UnlockingScript, Utils } from '@bsv/sdk'
import {
  CHANNEL_PROTOCOL, ChannelReceiver, fundingScript, signChannel, stateTransaction, type ChannelTerms,
} from '../src/payment-channel.js'

let blockedNetworkCalls = 0
const deny = () => { blockedNetworkCalls++; throw new Error('Offline benchmark: network prohibited') }
globalThis.fetch = deny
net.Socket.prototype.connect = deny as typeof net.Socket.prototype.connect
http.request = deny as typeof http.request; http.get = deny as typeof http.get
https.request = deny as typeof https.request; https.get = deny as typeof https.get
syncBuiltinESMExports()

const samples = JSON.parse(await readFile(new URL('../evidence/payment-channel/native-and-network-samples.json', import.meta.url), 'utf8'))
const percentile = (numbers: number[], p: number) => [...numbers].sort((a, b) => a - b)[Math.max(0, Math.ceil(numbers.length * p) - 1)]
const summary = (numbers: number[]) => ({ p50: +percentile(numbers, .5).toFixed(2), p95: +percentile(numbers, .95).toFixed(2) })
async function time(iterations: number, fn: () => Promise<unknown> | unknown) {
  for (let i = 0; i < 30; i++) await fn()
  const out: number[] = []
  for (let i = 0; i < iterations; i++) { const start = performance.now(); await fn(); out.push(performance.now() - start) }
  return out
}

// ---- Channel fixture (identical keys/derivation to the unit tests) ----
const reader = new ProtoWallet(PrivateKey.fromRandom()), server = new ProtoWallet(PrivateKey.fromRandom())
const readerId = (await reader.getPublicKey({ identityKey: true })).publicKey
const serverId = (await server.getPublicKey({ identityKey: true })).publicKey
const channelId = Utils.toHex(Random(16))
const readerKey = (await reader.getPublicKey({ protocolID: CHANNEL_PROTOCOL, keyID: channelId, counterparty: serverId, forSelf: true })).publicKey
const serverKey = (await server.getPublicKey({ protocolID: CHANNEL_PROTOCOL, keyID: channelId, counterparty: readerId, forSelf: true })).publicKey
const fundingParent = new Transaction(1, [{ sourceTXID: '11'.repeat(32), sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScript: new UnlockingScript() }],
  [{ satoshis: 5000, lockingScript: LockingScript.fromHex(fundingScript(readerKey, serverKey).toHex()) }])
const terms: ChannelTerms = {
  channelId, fundingTxid: fundingParent.id('hex'), fundingVout: 0, capacity: 5000, readerKey, serverKey,
  readerScript: new P2PKH().lock(PrivateKey.fromRandom().toAddress()).toHex(),
  serverScript: new P2PKH().lock(PrivateKey.fromRandom().toAddress()).toHex(),
  price: 5, settlementFee: 40, refundLockTime: 1_900_000_000,
}
const PAGES = 300
const receiver = new ChannelReceiver(terms)
const signatures: number[][] = []
let page = 0
const clientCpu = await time(PAGES, async () => {
  page = page % PAGES + 1
  signatures[page] = await signChannel(reader, terms, stateTransaction(terms, page * 5), serverId)
})
page = 0
const serverCpu = await time(PAGES - 30, () => { page++; receiver.accept(page * 5, signatures[page]) })
const settlement = await receiver.settle(server, readerId)
const settlementBytes = settlement.toBinary().length
const update = JSON.stringify({ channelId, paid: receiver.paid, signature: Utils.toBase64(receiver.latest!) })

// ---- Baseline: local CPU of one on-chain P2PKH page payment and its receipt ----
// Excludes everything that dominates natively: wallet storage, broadcast,
// provider internalizeAction and chain-tracker/merkle work.
const payerKey = PrivateKey.fromRandom()
const parent = new Transaction(1, [{ sourceTXID: '22'.repeat(32), sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScript: new UnlockingScript() }],
  [{ satoshis: 100_000, lockingScript: new P2PKH().lock(payerKey.toAddress()) }])
let beefBytes = 0
const onChainCpu = await time(PAGES, async () => {
  const tx = new Transaction(1, [{ sourceTransaction: parent, sourceOutputIndex: 0, sequence: 0xffffffff,
    unlockingScriptTemplate: new P2PKH().unlock(payerKey) }],
  [{ satoshis: 5, lockingScript: LockingScript.fromHex(terms.serverScript) }, { satoshis: 99_972, lockingScript: new P2PKH().lock(payerKey.toAddress()) }])
  await tx.sign()
  const beef = tx.toAtomicBEEF(); beefBytes = beef.length
  const received = Transaction.fromAtomicBEEF(beef)
  const input = received.inputs[0]
  assert.equal(new Spend({ sourceTXID: input.sourceTXID ?? parent.id('hex'), sourceOutputIndex: 0, sourceSatoshis: 100_000,
    lockingScript: parent.outputs[0].lockingScript, transactionVersion: 1, otherInputs: [], outputs: received.outputs, inputIndex: 0,
    unlockingScript: input.unlockingScript!, inputSequence: 0xffffffff, lockTime: 0 }).validate(), true)
})

// ---- Seeded resampling latency model ----
let seed = 20261110
const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = (values: number[]) => values[Math.floor(rand() * values.length)]
const w = samples.wallet, DRAWS = 20_000, render = samples.readyDisplayMs as number
const paid = samples.paidTurnTotalMs as number[], internalize = samples.serverInternalizeMs as number[]
const channelPay = (auth: boolean) => pick(w.createSignature) + pick(clientCpu) + pick(samples.roundTripMs) + pick(serverCpu) + pick(samples.serverDbMs)
  + (auth ? pick(w.createSignature) + pick(w.verifySignature) + pick(w.createHmac) + pick(w.verifyHmac) : 0)
const prepared = (prepare: () => number, dwell: number) => Math.max(0, prepare() + 1000 - dwell) + render // existing 1-s scheduler delay
const prepareOnChain = () => pick(paid)
const models: Record<string, (dwell: number) => number> = {
  'A. On-chain payment per page, pay on click (current baseline)': () => pick(paid),
  'B. A + one-page preparation (deployed)': d => prepared(prepareOnChain, d),
  'C. A + deferred receiver acceptance (credit until internalize)': () => { const i = Math.floor(rand() * paid.length); return paid[i] - internalize[i] + pick(serverCpu) },
  'D. Channel, pay on click, over AuthFetch': () => channelPay(true) + render,
  'E. Channel, pay on click, signature-authenticated request': () => channelPay(false) + render,
  'F. E + one-page preparation': d => prepared(() => channelPay(false), d),
  // Next reveals the credited page locally; the following page arrives once the
  // background signature for this one is accepted, so rapid clicks still wait.
  'G. E + one-page server credit (pay after reveal)': d => Math.max(0, channelPay(false) - d) + render,
}
const dwells = [0, 500, 1000, 2000, 5000, 10_000]
const latency = Object.fromEntries(Object.entries(models).map(([name, model]) => [name, Object.fromEntries(dwells.map(dwell => {
  const draws = Array.from({ length: DRAWS }, () => model(dwell))
  return [dwell, { ...summary(draws), under500: +(draws.filter(v => v < 500).length / DRAWS).toFixed(3) }]
}))]))

assert.equal(blockedNetworkCalls, 0)
const report = {
  node: process.version, platform: process.platform, pagesMeasured: PAGES,
  cpuMs: { channelClientSign: summary(clientCpu), channelServerAccept: summary(serverCpu), onChainPaymentAndReceipt: summary(onChainCpu) },
  bytes: { channelUpdateJson: update.length, onChainAtomicBeefOneParent: beefBytes, nativeProofBytes: 4065, settlementTx: settlementBytes },
  settlementFeeAt100SatPerKb: Math.ceil(settlementBytes * 0.1), channelServerStateBytes: 8 + receiver.latest!.length,
  roundTrip: summary(samples.roundTripMs), nativeCreateSignature: summary(w.createSignature),
  latencyModelMs: latency, blockedNetworkCalls,
}
const out = new URL('../evidence/runs/payment-channel/', import.meta.url)
await mkdir(out, { recursive: true })
await writeFile(new URL('report.json', out), JSON.stringify(report, null, 1))
console.log(JSON.stringify({ ...report, latencyModelMs: undefined }, null, 1))
console.log('\n| Algorithm | ' + dwells.map(d => `dwell ${d / 1000}s p50/p95 (<500)`).join(' | ') + ' |')
for (const [name, rows] of Object.entries(latency)) console.log(`| ${name} | ` + dwells.map(d => `${Math.round(rows[d].p50)}/${Math.round(rows[d].p95)} (${Math.round(rows[d].under500 * 100)}%)`).join(' | ') + ' |')
