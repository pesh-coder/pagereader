import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Transaction, Utils } from '@bsv/sdk'
import { Store } from '../src/store.js'
import { receiptCostPlan } from '../src/receipt-costs.js'

const recorded = JSON.parse(readFileSync(new URL('./fixtures/page3-mainnet.json', import.meta.url), 'utf8'))

test('old receipts retain unknown fees until verified metadata is added, durable and scoped by identity/edition', t => {
  const directory = mkdtempSync(join(tmpdir(), 'pagestream-receipt-costs-')), file = join(directory, 'ledger.sqlite')
  t.after(() => { assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true }) })
  const old = new DatabaseSync(file)
  old.exec('CREATE TABLE purchases(identity TEXT,edition TEXT,page INTEGER,txid TEXT UNIQUE,sats INTEGER,PRIMARY KEY(identity,edition,page))')
  old.prepare('INSERT INTO purchases VALUES(?,?,?,?,?)').run('reader', 'edition', 3, recorded.txid, 5)
  old.close()
  let store = new Store(file)
  assert.deepEqual(store.owned('reader', 'edition', 3), { page: 3, txid: recorded.txid, sats: 5 })
  assert.equal(store.recordFee(recorded.txid, 57, 'recorded-public-transaction'), true)
  assert.equal(store.recordFee(recorded.txid, 57, 'recorded-public-transaction'), false)
  assert.throws(() => store.recordFee(recorded.txid, 1, 'conflict'), /conflicts/)
  assert.throws(() => store.recordFee('missing-txid', 1, 'unbound'), /existing receipt/)
  assert.throws(() => store.recordFee(recorded.txid, -1, 'invalid'), /nonnegative/)
  store.close(); store = new Store(file)
  assert.equal(store.owned('reader', 'edition', 3)?.feeSats, 57)
  assert.deepEqual(store.purchases('other-reader', 'edition'), [])
  assert.deepEqual(store.purchases('reader', 'other-edition'), [])
  store.close()
})

test('fee, receipt, replay claim and entitlement commit together; failure preserves submitted proof/intent', () => {
  const store = new Store(':memory:')
  try {
    store.reserve('reader', 'edition', 3, 'original-request')
    store.challenge('reader', 'edition', 3, 'original-prefix')
    store.submitted('reader', 'edition', 3, recorded.txid, 'original-proof')
    store.db.exec("CREATE TRIGGER reject_cost BEFORE INSERT ON purchase_costs BEGIN SELECT RAISE(ABORT,'cost write failed'); END")
    assert.throws(() => store.accepted('reader', 'edition', 3, 'original-prefix', recorded.txid, 5, 57), /cost write failed/)
    assert.equal(store.owned('reader', 'edition', 3), undefined)
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM replay_claims').get()?.n, 0)
    assert.equal(store.intent('reader', 'edition', 3)?.state, 'submitted')
    assert.equal(store.db.prepare('SELECT proof FROM payment_proofs').get()?.proof, 'original-proof')
    store.db.exec('DROP TRIGGER reject_cost')
    store.accepted('reader', 'edition', 3, 'original-prefix', recorded.txid, 5, 57)
    assert.equal(store.owned('reader', 'edition', 3)?.feeSats, 57)
    assert.equal(store.intent('reader', 'edition', 3)?.state, 'confirmed')
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM replay_claims').get()?.n, 1)
  } finally { store.close() }
})

test('offline fee repair verifies original proof/public transaction and parent; missing evidence never becomes zero', () => {
  const store = new Store(':memory:')
  try {
    store.purchase('reader', 'edition', 3, recorded.txid, 5)
    assert.deepEqual(receiptCostPlan(store.db).unknown, [recorded.txid])
    assert.equal(receiptCostPlan(store.db, [recorded]).costs[0].feeSats, 57)
    assert.throws(() => receiptCostPlan(store.db, [{ ...recorded, transactionHex: recorded.parentHex }]), /does not match/)
    assert.throws(() => receiptCostPlan(store.db, [{ ...recorded, parentTxid: '0'.repeat(64) }]), /parent/)
    const tx = Transaction.fromHex(recorded.transactionHex)
    tx.inputs[0].sourceTransaction = Transaction.fromHex(recorded.parentHex)
    store.db.prepare('INSERT INTO payment_proofs VALUES(?,?,?,?,?)').run(recorded.txid, 'reader', 'edition', 3, JSON.stringify({ transaction: Utils.toBase64(tx.toAtomicBEEF(true)) }))
    const plan = receiptCostPlan(store.db)
    assert.equal(plan.costs[0].feeSats, 57)
    assert.equal(plan.costs[0].source, 'stored-payment-proof')
    store.recordFee(recorded.txid, 1, 'conflicting-test-evidence')
    assert.throws(() => receiptCostPlan(store.db), /conflicts/)
  } finally { store.close() }
})
