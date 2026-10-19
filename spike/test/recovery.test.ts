import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../src/store.js'

test('operator recovery preserves failed challenge evidence and unrelated purchases', () => {
  const store = new Store(':memory:')
  try {
    store.reserve('reader', 'edition', 3, 'failed-request')
    store.challenge('reader', 'edition', 3, 'old-prefix')
    store.purchase('other-reader', 'edition', 3, 'already-paid', 5)
    store.recoverInsufficientFunds('reader', 'edition', 3, 'failed-request', 'Confirmed insufficient funds, tabs closed and wallet history checked')
    assert.equal(store.intent('reader', 'edition', 3), undefined)
    const audit = store.db.prepare('SELECT prefix,previous_state,reason FROM intent_recoveries').get()
    assert.equal(audit?.prefix, 'old-prefix')
    assert.equal(audit?.previous_state, 'challenged')
    assert.ok(audit?.reason)
    assert.equal(store.owned('other-reader', 'edition', 3)?.txid, 'already-paid')
    assert.equal(store.reserve('reader', 'edition', 3, 'new-request'), true)
  } finally { store.close() }
})

test('operator recovery refuses stale requests, submitted transactions and owned pages', () => {
  const store = new Store(':memory:')
  try {
    store.reserve('reader', 'edition', 3, 'request')
    store.challenge('reader', 'edition', 3, 'prefix')
    assert.throws(() => store.recoverInsufficientFunds('reader', 'edition', 3, 'wrong-request', 'checked'))
    store.submitted('reader', 'edition', 3, 'submitted-txid')
    assert.throws(() => store.recoverInsufficientFunds('reader', 'edition', 3, 'request', 'checked'))
    store.reserve('owned-reader', 'edition', 3, 'owned-request')
    store.challenge('owned-reader', 'edition', 3, 'owned-prefix')
    store.purchase('owned-reader', 'edition', 3, 'owned-txid', 5)
    assert.throws(() => store.recoverInsufficientFunds('owned-reader', 'edition', 3, 'owned-request', 'checked'))
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM intent_recoveries').get()?.n, 0)
    assert.equal(store.intent('reader', 'edition', 3)?.txid, 'submitted-txid')
  } finally { store.close() }
})

test('accepted payment atomically commits replay claim and entitlement, including retry after a database failure', () => {
  const store = new Store(':memory:')
  try {
    store.reserve('reader', 'edition', 3, 'request')
    store.challenge('reader', 'edition', 3, 'prefix')
    store.submitted('reader', 'edition', 3, 'same-tx', 'saved-proof')
    store.db.exec("CREATE TRIGGER fail_purchase BEFORE INSERT ON purchases BEGIN SELECT RAISE(ABORT,'simulated disk error'); END;")
    assert.throws(() => store.accepted('reader', 'edition', 3, 'prefix', 'same-tx', 5), /simulated disk error/)
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM replay_claims').get()?.n, 0)
    assert.equal(store.owned('reader', 'edition', 3), undefined)
    assert.equal(store.db.prepare('SELECT proof FROM payment_proofs').get()?.proof, 'saved-proof')
    store.db.exec('DROP TRIGGER fail_purchase')
    store.accepted('reader', 'edition', 3, 'prefix', 'same-tx', 5)
    store.accepted('reader', 'edition', 3, 'prefix', 'same-tx', 5)
    assert.equal(store.purchases('reader', 'edition').length, 1)
    assert.equal(store.claim('same-tx'), false)
    assert.throws(() => store.submitted('reader', 'edition', 3, 'replacement-tx', 'replacement-proof'), /changed/)
    store.reserve('other-reader', 'edition', 4, 'other-request')
    store.challenge('other-reader', 'edition', 4, 'other-prefix')
    assert.throws(() => store.submitted('other-reader', 'edition', 4, 'same-tx', 'saved-proof'), /another purchase/)
  } finally { store.close() }
})
