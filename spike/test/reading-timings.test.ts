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
