import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Transaction } from '@bsv/sdk'
import { networkFee } from '../src/payment-cost.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/page3-mainnet.json', import.meta.url), 'utf8'))
test('confirmed page-3 transaction debits 62 sats: 5 payment plus 57 miner fee', () => {
  const tx = Transaction.fromHex(fixture.transactionHex)
  const parent = Transaction.fromHex(fixture.parentHex)
  assert.equal(tx.id('hex'), fixture.txid)
  assert.equal(parent.id('hex'), fixture.parentTxid)
  tx.inputs[0].sourceTransaction = parent
  assert.equal(parent.outputs[fixture.sourceOutputIndex].satoshis, 5000)
  assert.equal(tx.outputs[0].satoshis, 5)
  assert.equal(tx.outputs[1].satoshis, 4938)
  assert.equal(networkFee(tx), 57)
  assert.equal(tx.outputs[0].satoshis! + networkFee(tx)!, 62)
})

test('missing input-source values produce unknown fees, never a zero fee', () => {
  const tx = Transaction.fromHex(fixture.transactionHex)
  assert.equal(networkFee(tx), null)
})

test('recorded permission grant has 238 sats fee plus its one-sat token output', () => {
  const grant = JSON.parse(readFileSync(new URL('./fixtures/permission-mainnet.json', import.meta.url), 'utf8'))
  const tx = Transaction.fromHex(grant.transactionHex)
  const parent = Transaction.fromHex(grant.parentHex)
  assert.equal(tx.id('hex'), grant.txid)
  assert.equal(parent.id('hex'), grant.parentTxid)
  tx.inputs[0].sourceTransaction = parent
  assert.equal(parent.outputs[grant.sourceOutputIndex].satoshis, 88000)
  assert.equal(tx.outputs[grant.permissionOutputIndex].satoshis, 1)
  assert.equal(networkFee(tx), 238)
  assert.equal(networkFee(tx)! + tx.outputs[grant.permissionOutputIndex].satoshis!, grant.walletReportedDebitSats)
})
