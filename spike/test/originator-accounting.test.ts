import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reproduceOriginatorAccounting } from '../scripts/originator-accounting.js'

test('official manager reproduces hostname allowance query omitting existing port-labeled page debits', async () => {
  const result = await reproduceOriginatorAccounting()
  assert.equal(result.nativeHostnameQuerySats, 6)
  assert.equal(result.hostnameAndPortQuerySats, 74)
  assert.equal(result.omittedPortLabelSats, 68)
  assert.equal(result.nativeWalletCalls, 0)
  assert.equal(result.transactionsCreated, 0)
  assert.equal(result.queries.length, 3)
})
