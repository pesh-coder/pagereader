// Offline algorithm comparison, not a native wallet or network benchmark.
// Run from spike: node --expose-gc --import tsx scripts/benchmark-latency-algorithms.ts
// Isolated comparison dependency (from repo root): npm install --prefix
// spike/evidence/runs/latency-algorithms/sdk4 @bsv/sdk@4.0.1 --ignore-scripts --no-audit --no-fund
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import * as installed from '@bsv/sdk'
import { completePaymentProof, compactPaymentProof } from '../../app/client/src/payments/payment-ancestors.js'

const directory = new URL('../evidence/runs/latency-algorithms/', import.meta.url)
await mkdir(directory, { recursive: true })
const require = createRequire(new URL('sdk4/package.json', directory))
const latest: typeof installed = require('@bsv/sdk')
let blockedNetworkCalls = 0
const deny = () => { blockedNetworkCalls++; throw new Error('Offline benchmark: network prohibited') }
globalThis.fetch = deny
net.Socket.prototype.connect = deny as typeof net.Socket.prototype.connect
http.request = deny as typeof http.request; http.get = deny as typeof http.get
https.request = deny as typeof https.request; https.get = deny as typeof https.get
syncBuiltinESMExports()

const percentile = (numbers: number[], p: number) => [...numbers].sort((a,b) => a-b)[Math.ceil(numbers.length*p)-1]
const summarize = (numbers: number[]) => ({ samples: numbers.length, p50Ms: percentile(numbers,.5), p95Ms: percentile(numbers,.95), maxMs: Math.max(...numbers) })

// Candidate only: load larger overlapping retained proofs first, and skip
// sources whose subject is already full. The complete result is still checked.
function frontier(sdk: typeof installed, raw: number[], ancestors: Map<string, number[]>) {
  const beef = sdk.Beef.fromBinaryStrict(raw), id = beef.atomicTxid
  if (!id || beef.findTxid(id)?.isTxidOnly) throw new Error('Missing payment transaction')
  let merged = 0, sourceBytes = 0
  const skipped: number[][] = []
  const fullSubjects=new Set(beef.txs.filter(tx=>!tx.isTxidOnly).map(tx=>tx.txid))
  const ordered=[...ancestors].sort((a,b)=>b[1].length-a[1].length)
  for (let index=0;index<ordered.length;index++) {
    const [ancestor,source]=ordered[index]
    if (fullSubjects.has(ancestor)) { skipped.push(source); continue }
    beef.mergeBeef(source); merged++; sourceBytes += source.length
    for(const tx of beef.txs)if(!tx.isTxidOnly)fullSubjects.add(tx.txid)
    if(index===0&&!ordered.slice(1).some(([next])=>fullSubjects.has(next))) {
      for(const [,remaining] of ordered.slice(1)){beef.mergeBeef(remaining);merged++;sourceBytes+=remaining.length}
      break
    }
  }
  let complete = beef.toBinaryAtomic(id)
  let valid=sdk.Beef.fromBinaryStrict(complete).isValid(false)
  if(skipped.length && !valid) {
    for(const source of skipped) {beef.mergeBeef(source);merged++;sourceBytes+=source.length}
    complete=beef.toBinaryAtomic(id);valid=sdk.Beef.fromBinaryStrict(complete).isValid(false)
  }
  if (!valid) throw new Error('Unresolved ancestor')
  if (sdk.Transaction.fromAtomicBEEF(complete).id('hex') !== id) throw new Error('Payment changed')
  return { complete, merged, sourceBytes }
}

// Frozen pre-change implementation for a same-input comparison with production.
function mergeAll(raw: number[], ancestors: Map<string, number[]>) {
  const beef=installed.Beef.fromBinaryStrict(raw),id=beef.atomicTxid!
  for(const source of ancestors.values())beef.mergeBeef(source)
  const complete=beef.toBinaryAtomic(id)
  if(!installed.Beef.fromBinaryStrict(complete).isValid(false))throw new Error('Unresolved ancestor')
  if(installed.Transaction.fromAtomicBEEF(complete).id('hex')!==id)throw new Error('Payment changed')
  return complete
}

function fixture(depth: number, hints: number, independent = false) {
  const { Transaction, Script } = installed
  if(independent) {
    const ancestors=new Map<string,number[]>(),parents:installed.Transaction[]=[]
    for(let branch=0;branch<hints;branch++) {
      let parent=new Transaction(1,[],[{satoshis:100000+branch,lockingScript:Script.fromHex('51')}])
      for(let level=1;level<depth/hints;level++)parent=new Transaction(1,[{sourceTransaction:parent,
        sourceTXID:parent.id('hex'),sourceOutputIndex:0,unlockingScript:Script.fromHex('00'),sequence:0xffffffff}],
      [{satoshis:100000+branch-level,lockingScript:Script.fromHex('51')}])
      ancestors.set(parent.id('hex'),parent.toAtomicBEEF());parents.push(parent)
    }
    const payment=new Transaction(1,parents.map(parent=>({sourceTransaction:parent,sourceTXID:parent.id('hex'),
      sourceOutputIndex:0,unlockingScript:Script.fromHex('00'),sequence:0xffffffff})),
    [{satoshis:parents.reduce((s,p)=>s+p.outputs[0].satoshis!,0)-1,lockingScript:Script.fromHex('51')}])
    const full=payment.toAtomicBEEF()
    return {full,raw:compactPaymentProof(full,ancestors.keys()),ancestors,txid:payment.id('hex'),txHex:payment.toHex(),fee:payment.getFee()}
  }
  let parent = new Transaction(1, [], [{satoshis:100000,lockingScript:Script.fromHex('51')}])
  const ancestors = new Map<string, number[]>()
  for (let index=1; index<=depth; index++) {
    if (index > depth-hints) ancestors.set(parent.id('hex'), parent.toAtomicBEEF())
    parent = new Transaction(1, [{sourceTransaction:parent, sourceTXID:parent.id('hex'),sourceOutputIndex:0,
      unlockingScript:Script.fromHex('00'),sequence:0xffffffff}],
    [{satoshis:100000-index,lockingScript:Script.fromHex('51')}])
  }
  const full = parent.toAtomicBEEF(), raw = compactPaymentProof(full, ancestors.keys())
  return { full, raw, ancestors, txid:parent.id('hex'), txHex:parent.toHex(), fee:parent.getFee() }
}

const proofRows: unknown[] = []
for (const [depth, hints, independent] of [[16,8,false],[64,8,false],[256,8,false],[256,32,false],[64,8,true],[256,32,true]] as const) {
  const f = fixture(depth,hints,independent)
  const productionWork=frontier(installed,f.raw,f.ancestors)
  const candidates = [
    {name:'installed-merge-all', run:()=>({complete:mergeAll(f.raw,f.ancestors),merged:f.ancestors.size,sourceBytes:[...f.ancestors.values()].reduce((s,p)=>s+p.length,0)})},
    {name:'installed-production-frontier',run:()=>({complete:completePaymentProof(f.raw,f.ancestors),merged:productionWork.merged,sourceBytes:productionWork.sourceBytes})},
    {name:'sdk4-adaptive-frontier',run:()=>frontier(latest,f.raw,f.ancestors)},
  ]
  const times = candidates.map(()=>[] as number[])
  const heaps = candidates.map(()=>[] as number[])
  const work: unknown[] = []
  // Rotate measurement order to reduce warmup/order bias. All generated inputs
  // stay identical; every result must preserve exact subject bytes and fees.
  for(let round=0;round<33;round++) for(let offset=0;offset<candidates.length;offset++) {
    const index=(round+offset)%candidates.length
    if (round>=2) global.gc?.()
    const heap=process.memoryUsage().heapUsed, start=performance.now()
    const result=candidates[index].run(), ms=performance.now()-start
    const heapDelta=process.memoryUsage().heapUsed-heap
    const tx=installed.Transaction.fromAtomicBEEF(result.complete)
    assert.equal(tx.id('hex'),f.txid); assert.equal(tx.toHex(),f.txHex); assert.equal(tx.getFee(),f.fee)
    assert.equal(installed.Beef.fromBinaryStrict(result.complete).isValid(false),true)
    if(round>=2) {times[index].push(ms);heaps[index].push(heapDelta)}
    work[index]={merged:result.merged,sourceBytes:result.sourceBytes,outputBytes:result.complete.length}
  }
  proofRows.push({shape:independent?'independent-branches':'overlapping-chain',depth,hints,fullBytes:f.full.length,compactBytes:f.raw.length,
    candidates:candidates.map((c,i)=>({name:c.name,...summarize(times[i]),
      heapGrowthP50Bytes:percentile(heaps[i],.5),work:work[i]}))})
  console.log(JSON.stringify(proofRows.at(-1)))
}

// Correctness adversaries: missing ancestors, incomplete subject, unrelated
// full proof, and output/template preservation are never bypassed for speed.
const adversary=fixture(16,8)
assert.throws(()=>frontier(installed,adversary.raw,new Map()),/Unresolved/)
assert.throws(()=>completePaymentProof(adversary.raw,new Map()),/unresolved ancestor/)
const unrelated=fixture(2,1)
assert.throws(()=>frontier(installed,adversary.raw,unrelated.ancestors),/Unresolved/)
assert.throws(()=>completePaymentProof(adversary.raw,unrelated.ancestors),/unresolved ancestor/)
const missingSubject=installed.Beef.fromBinaryStrict(adversary.raw)
missingSubject.makeTxidOnly(adversary.txid)
assert.throws(()=>frontier(installed,missingSubject.toBinaryAtomic(adversary.txid),adversary.ancestors),/Missing/)
assert.throws(()=>completePaymentProof(missingSubject.toBinaryAtomic(adversary.txid),adversary.ancestors),/Missing/)

// The one-page preparation replay was removed with that feature on 11 Nov;
// its results remain in evidence/latency-algorithm-research-2026-11-10.md.
assert.equal(blockedNetworkCalls,0)
const report={generatedAt:new Date().toISOString(),node:process.version,platform:process.platform,
  installedSdk:'2.8.11',isolatedSdk:'4.0.1',blockedNetworkCalls,
  scope:'Generated structural BEEF fixtures; no mined validity claim, native wallet, keys, broadcast, provider call or sats. Heap deltas are allocation observations, not peak-memory bounds.',
  proofRows,checks:{exactSubjectAndFees:true,completeProofs:true,missingAncestorsRejected:true,missingSubjectRejected:true}}
await writeFile(new URL('benchmark.json',directory),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({proofRows,checks:report.checks},null,2))
