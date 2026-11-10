import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Beef, Script, Transaction } from '@bsv/sdk'
import { compactPaymentProof, completePaymentProof, retainedAncestors } from '../../app/client/src/payments/payment-ancestors.js'

const root = (value = 1000) => new Transaction(1, [], [{satoshis:value,lockingScript:Script.fromHex('51')}])
const spend = (...parents: Transaction[]) => new Transaction(1, parents.map(parent => ({
  sourceTransaction:parent,sourceTXID:parent.id('hex'),sourceOutputIndex:0,
  unlockingScript:Script.fromHex('00'),sequence:0xffffffff,
})), [{satoshis:parents.reduce((s,p)=>s+p.outputs[0].satoshis!,0)-1,lockingScript:Script.fromHex('51')}])

test('overlapping proof restoration preserves exact transaction, fees and complete dependencies in either hint order', () => {
  const first=root(), second=spend(first), third=spend(second), payment=spend(third)
  const entries:[string,number[]][]=[first,second,third].map(tx=>[tx.id('hex'),tx.toAtomicBEEF()])
  const raw=compactPaymentProof(payment.toAtomicBEEF(),entries.map(([id])=>id))
  for (const ordered of [entries,[...entries].reverse()]) {
    const result=completePaymentProof(raw,new Map(ordered))
    assert.equal(Beef.fromBinaryStrict(result).isValid(false),true)
    const tx=Transaction.fromAtomicBEEF(result)
    assert.equal(tx.toHex(),payment.toHex()); assert.equal(tx.getFee(),1)
  }
})

test('independent input branches both survive proof selection', () => {
  const left=spend(root(1000)),right=spend(root(2000)),payment=spend(left,right)
  const ancestors=new Map([left,right].map(tx=>[tx.id('hex'),tx.toAtomicBEEF()]))
  const raw=compactPaymentProof(payment.toAtomicBEEF(),ancestors.keys())
  const tx=Transaction.fromAtomicBEEF(completePaymentProof(raw,ancestors))
  assert.equal(tx.toHex(),payment.toHex());assert.equal(tx.getFee(),1)
  assert.equal(tx.inputs.length,2)
})

test('a full retained subject with an omitted input is repaired by the validated fallback', () => {
  const first=root(),second=spend(first),payment=spend(second)
  const beef=Beef.fromBinaryStrict(payment.toAtomicBEEF())
  beef.txs=beef.txs.filter(tx=>tx.txid!==first.id('hex'))
  assert.equal(beef.isValid(false),false)
  const raw=beef.toBinaryAtomic(payment.id('hex'))
  const complete=completePaymentProof(raw,new Map([[second.id('hex'),second.toAtomicBEEF()]]))
  assert.equal(Beef.fromBinaryStrict(complete).isValid(false),true)
  assert.equal(Transaction.fromAtomicBEEF(complete).toHex(),payment.toHex())
})

test('missing ancestry still rejects and corrupt lookup proofs never become hints', () => {
  const first=root(),payment=spend(first),id=first.id('hex')
  const raw=compactPaymentProof(payment.toAtomicBEEF(),[id])
  assert.throws(()=>completePaymentProof(raw,new Map()),/unresolved ancestor/)
  const retained=retainedAncestors([id],()=>[1,2,3])
  assert.equal(retained.size,0)
  assert.throws(()=>completePaymentProof(raw,retained),/unresolved ancestor/)
})
