import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Transaction, Script, Utils, Beef, BEEF_V2 } from '@bsv/sdk'
import { Store } from '../src/store.js'
import { knownPaymentAncestors, restorePaymentAncestors } from '../src/known-payment-ancestors.js'

test('only durable accepted caller proofs are advertised; corrupt or other-identity records cannot leak', () => {
  const store = new Store(':memory:')
  try {
    const tx = new Transaction(1, [], [{ satoshis: 5, lockingScript: Script.fromHex('51') }])
    const id = tx.id('hex'), proof = JSON.stringify({ transaction: Utils.toBase64(tx.toAtomicBEEF()) })
    store.db.prepare('INSERT INTO purchases VALUES(?,?,?,?,?)').run('reader', 'book', 3, id, 5)
    assert.equal(knownPaymentAncestors(store, 'reader'), undefined, 'receipt alone is not enough')
    store.db.prepare('INSERT INTO payment_proofs VALUES(?,?,?,?,?)').run(id, 'reader', 'book', 3, proof)
    assert.equal(knownPaymentAncestors(store, 'reader'), id)
    assert.equal(knownPaymentAncestors(store, 'other'), undefined)
    store.db.prepare('UPDATE payment_proofs SET proof=?').run('{broken')
    assert.equal(knownPaymentAncestors(store, 'reader'), undefined)
    store.db.prepare('UPDATE payment_proofs SET proof=?, identity=?').run(proof, 'other')
    assert.equal(knownPaymentAncestors(store, 'reader'), undefined)
  } finally { store.close() }
})

test('compact payment expansion is identity scoped and preserves exact subject bytes and fees', () => {
  const store = new Store(':memory:')
  try {
    const parent = new Transaction(1, [], [{ satoshis: 100, lockingScript: Script.fromHex('51') }])
    const id = parent.id('hex'), raw = parent.toAtomicBEEF()
    store.db.prepare('INSERT INTO purchases VALUES(?,?,?,?,?)').run('reader', 'book', 3, id, 5)
    store.db.prepare('INSERT INTO payment_proofs VALUES(?,?,?,?,?)').run(id, 'reader', 'book', 3, JSON.stringify({ transaction: Utils.toBase64(raw) }))
    const child = new Transaction(1, [{ sourceTransaction: parent, sourceTXID: id, sourceOutputIndex: 0,
      unlockingScript: Script.fromHex('00'), sequence: 0xffffffff }], [{ satoshis: 99, lockingScript: Script.fromHex('51') }])
    const beef = Beef.fromBinaryStrict(child.toAtomicBEEF()); beef.version = BEEF_V2; beef.makeTxidOnly(id)
    const header = JSON.stringify({ transaction: Utils.toBase64(beef.toBinaryAtomic(child.id('hex'))), derivationPrefix: 'original', derivationSuffix: 'suffix' })
    const restored = JSON.parse(restorePaymentAncestors(store, 'reader', header))
    const tx = Transaction.fromAtomicBEEF(Utils.toArray(restored.transaction, 'base64'))
    assert.equal(tx.id('hex'), child.id('hex'))
    assert.equal(tx.getFee(), 1)
    assert.equal(restored.derivationPrefix, 'original')
    assert.throws(() => restorePaymentAncestors(store, 'other', header), /Unresolvable/)
    store.db.prepare('DELETE FROM payment_proofs').run()
    assert.throws(() => restorePaymentAncestors(store, 'reader', header), /Unresolvable/)
  } finally { store.close() }
})
