import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timingReport } from '../src/timing-report.js'

// Synthetic data for testing report qualification only; no wallet is called.
function fixture() {
  const identityKey = '02' + 'a'.repeat(64), edition = 'fixture-edition'
  const samples = Array.from({ length: 20 }, (_, index) => ({
    page: index + 3, edition, identityKey, txid: (index + 1).toString(16).padStart(64, '0'),
    purchased: true, visible: true, totalMs: (index + 1) * 25, trigger: 'explicit',
    timingBoundary: 'request-to-visible-frame', network: 'mainnet',
    walletCalls: [{ method: 'page payment workflow', ok: true }],
  }))
  return { schema: 2, runId: 'SYNTHETIC_REPORT_TEST_ONLY', walletName: 'BSV Desktop', walletVersion: 'fixture-version', origin: 'http://localhost:3108', edition, identityKey, network: 'mainnet', samples,
    ledger: samples.map(sample => ({ txid: sample.txid, identityKey, edition, page: sample.page, sats: 5, state: 'confirmed' })), errors: [] as string[] }
}

test('nearest-rank metrics require a complete cohort and retain cold/slow turns', () => {
  const run = fixture(), report = timingReport(run)
  assert.equal(report.eligiblePaidSamples, 20)
  assert.equal(report.p50Ms, 250)
  assert.equal(report.p95Ms, 475)
  assert.equal(report.C3, 'PASS (this wallet run only)')
  run.samples[0].totalMs = 9000
  run.samples[1].totalMs = 8000
  assert.equal(timingReport(run).p95Ms, 8000)
  assert.equal(timingReport(run).C3, 'FAIL (this wallet run)')
  run.errors.push('One failed paid request must remain in the run')
  assert.equal(timingReport(run).C3, 'UNRESOLVED')
})

test('legacy flags, repeated pages/transactions and owned reads cannot manufacture a paid p95 pass', () => {
  const legacy = fixture(); legacy.schema = 1
  assert.equal(timingReport(legacy).p95Ms, 475)
  assert.equal(timingReport(legacy).C3, 'UNRESOLVED')
  const repeated = fixture(); repeated.samples[1] = { ...repeated.samples[0] }
  assert.equal(timingReport(repeated).eligiblePaidSamples, 19)
  assert.equal(timingReport(repeated).C3, 'UNRESOLVED')
  const owned = fixture(); owned.samples.forEach(sample => { sample.purchased = false })
  assert.equal(timingReport(owned).paidSamples, 0)
  assert.equal(timingReport(owned).p95Ms, null)
  assert.equal(timingReport(owned).C3, 'UNRESOLVED')
  const mislabeled = fixture(); mislabeled.samples[0].walletCalls = []
  assert.equal(timingReport(mislabeled).C3, 'UNRESOLVED')
})

test('missing or mismatched payment, wallet, identity, network and display evidence keep acceptance unresolved', () => {
  const changes: ((run: ReturnType<typeof fixture>) => void)[] = [
    run => { run.samples.pop() },
    run => { run.walletVersion = '' },
    run => { run.walletName = 'Unrecorded' },
    run => { run.network = 'testnet' },
    run => { run.samples[0].network = 'testnet' },
    run => { run.samples[0].identityKey = '03' + 'b'.repeat(64) },
    run => { run.samples[0].edition = 'different-edition' },
    run => { run.samples[0].visible = false },
    run => { run.samples[0].totalMs = NaN },
    run => { run.samples[0].trigger = 'resume' },
    run => { run.samples[0].timingBoundary = 'response-headers-only' },
    run => { run.samples[0].walletCalls[0].ok = false },
    run => { run.ledger[0].state = 'unresolved' },
    run => { run.ledger[0].sats = 4 },
    run => { run.ledger[0].identityKey = 'other-reader' },
    run => { run.origin = 'http://public.example' },
  ]
  for (const change of changes) {
    const run = fixture(); change(run)
    assert.equal(timingReport(run).C3, 'UNRESOLVED')
    assert.ok(timingReport(run).qualificationIssues.length)
  }
})
