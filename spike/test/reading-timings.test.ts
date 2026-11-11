import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ReadingTimings } from '../../app/client/src/reader/timings.js'
import { timingReport } from '../src/timing-report.js'

function fixture() {
  const data = new Map<string, string>()
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
  let now = 0
  const capture = new ReadingTimings(storage, () => now)
  const context = { identityKey: '02' + 'a'.repeat(64), network: 'mainnet', edition: 'fixture', protocolVersion: 'protocol-test' }
  capture.start('BSV Browser', 'fixture-version', context, 'https://example.test')
  return { capture, context, storage, data, advance: (ms: number) => { now += ms } }
}

test('a reading-session page counts as paid within the click, once, and qualifies with its receipt', () => {
  const f = fixture(), txid = 'channel:' + 'c'.repeat(32) + ':1'
  const token = f.capture.begin(4, 'fixture', false)
  f.capture.wallet({ method: 'createSignature', ms: 40, ok: true })
  f.advance(25)
  // Shown on session credit: the receipt is still confirming at the visible frame.
  const pending = [{ txid, identityKey: f.context.identityKey, edition: 'fixture', page: 4, sats: 5, feeSats: 0, state: 'pending' as const }]
  f.capture.finish(token, txid, f.context, pending, true)
  assert.equal(f.capture.paidCount(), 1)
  assert.equal(f.capture.run!.samples[0].payment, 'session')
  const again = f.capture.begin(4, 'fixture', false)
  f.capture.finish(again, txid, f.context, pending, true)
  assert.equal(f.capture.paidCount(), 1, 'one session payment cannot count twice')
  f.capture.stop()
  const run = JSON.parse(f.capture.export())
  run.ledger[0].state = 'confirmed'
  run.identityKey = f.context.identityKey = '02' + 'a'.repeat(64)
  const report = timingReport(run)
  assert.equal(report.paidSamples, 1)
  assert.equal(report.eligiblePaidSamples, 1)
  assert.equal(report.p95Ms, 25)
})

test('a session page without its own receipt is not counted as paid', () => {
  const f = fixture(), token = f.capture.begin(5, 'fixture', false)
  f.advance(20)
  f.capture.finish(token, 'channel:' + 'd'.repeat(32) + ':2', f.context, [], true)
  assert.equal(f.capture.paidCount(), 0)
})

test('capture exports report-compatible new payments; owned reads and recovery cannot inflate p95 cohort', () => {
  const f = fixture()
  const ledger = []
  for (let index = 0; index < 20; index++) {
    const page = index + 3, txid = (index + 1).toString(16).padStart(64, '0')
    const token = f.capture.begin(page, 'fixture', false)
    f.advance(300)
    f.capture.wallet({ method: 'page payment workflow', ms: 250, ok: true })
    ledger.push({ txid, identityKey: f.context.identityKey, edition: 'fixture', page, sats: 5, feeSats: 23, state: 'confirmed' as const })
    f.capture.finish(token, txid, f.context, ledger, true)
  }
  const owned = f.capture.begin(3, 'fixture', false)
  f.advance(20); f.capture.finish(owned, ledger[0].txid, f.context, ledger, true)
  const recovery = f.capture.begin(23, 'fixture', true)
  f.advance(100); f.capture.wallet({ method: 'page payment workflow', ms: 80, ok: true })
  f.capture.finish(recovery, 'b'.repeat(64), f.context, ledger, true)
  f.capture.stop()
  const report = timingReport(JSON.parse(f.capture.export()))
  assert.equal(report.eligiblePaidSamples, 20)
  assert.equal(report.p95Ms, 300)
  assert.equal(report.C3, 'PASS (this wallet run only)') // Synthetic fixture, not device evidence.
})

test('failed and interrupted attempts survive reload and cannot pass acceptance', () => {
  const f = fixture()
  const token = f.capture.begin(3, 'fixture', false)
  f.advance(9000); f.capture.fail(token)
  f.capture.begin(4, 'fixture', false)
  const restored = new ReadingTimings(f.storage)
  assert.equal(restored.run?.recording, false)
  assert.equal(restored.run?.samples.length, 2)
  assert.equal(restored.run?.samples[0].totalMs, 9000)
  assert.equal(restored.run?.samples[1].visible, false)
  assert.equal(timingReport(JSON.parse(restored.export())).C3, 'UNRESOLVED')
  const oldKey = 'pagestream-timings-run-v1:' + restored.run!.runId
  restored.start('BSV Desktop', 'fixture-version', f.context, 'https://example.test')
  assert.ok(f.data.has(oldKey), 'starting another run retains the earlier evidence')
})

test('capture excludes wallet error messages and fails changed identity or invisible display', () => {
  const f = fixture(), token = f.capture.begin(3, 'fixture', false)
  f.advance(50)
  f.capture.wallet({ method: 'createAction', ms: 40, ok: false, error: { code: 42, message: 'SENSITIVE_FIXTURE_MESSAGE' } })
  f.capture.finish(token, undefined, { ...f.context, identityKey: '03' + 'b'.repeat(64) }, [], false)
  assert.equal(f.capture.run?.errors.length, 2)
  assert.ok(!f.capture.export().includes('SENSITIVE_FIXTURE_MESSAGE'))
  assert.equal(f.capture.paidCount(), 0)
  const brokenStorage = { getItem: () => null, setItem: () => { throw new Error('full') } }
  const capture = new ReadingTimings(brokenStorage)
  assert.doesNotThrow(() => capture.start('BSV Browser', 'fixture', f.context, 'https://example.test'))
  assert.equal(capture.storageError, true)
})

test('capture retains a recognized proof-depth diagnosis without retaining the wallet message', () => {
  const f = fixture(), token = f.capture.begin(20, 'fixture', false)
  f.advance(50)
  f.capture.wallet({ method: 'createAction', ms: 40, ok: false,
    paymentMetrics: { knownAncestors: 8, proofBytes: 50000, transportBytes: 500, deliveryMode: 'overlap' },
    error: { code: 'WERR_INVALID_OPERATION', message: 'Maximum BEEF depth exceeded. Limit is 12' } })
  f.capture.fail(token)
  const run = JSON.parse(f.capture.export())
  assert.deepEqual(run.samples[0].walletCalls[0].diagnostic, { kind: 'proof-depth-limit', limit: 12 })
  assert.deepEqual(run.samples[0].walletCalls[0].paymentMetrics, { knownAncestors: 8, proofBytes: 50000, transportBytes: 500, deliveryMode: 'overlap' })
  assert.ok(!f.capture.export().includes('Maximum BEEF depth exceeded'))
})
