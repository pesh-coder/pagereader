import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelPermissionCost } from '../scripts/permission-cost-model.js'
import { config } from '../src/config.js'

test('official synthetic grouped grant allocates three token sats, not its allowance amount; fee examples are explicitly not native quotes', async () => {
  const result = await modelPermissionCost()
  assert.equal(result.allowanceSats, config.provisional.walletLimitSats)
  assert.equal(result.outputCount, 3)
  assert.equal(result.tokenSats, 3)
  assert.deepEqual(result.outputs.map(output => output.permission), ['monthly spending allowance', 'server hmac', '3241645161d8'])
  assert.ok(result.outputs.every(output => output.satoshis === 1 && output.scriptBytes > 100))
  assert.deepEqual(result.scenarios.map(scenario => scenario.changeOutputs), [1, 8])
  for (const scenario of result.scenarios) {
    assert.ok(scenario.modeledBytes > 1000 && scenario.modeledBytes < 2000)
    assert.equal(scenario.modeledFeeSats, 2)
    assert.equal(scenario.modeledTokenAndFeeSats, 5)
  }
  assert.equal(result.mode, 'OFFLINE_SYNTHETIC_NOT_A_NATIVE_QUOTE')
  assert.deepEqual(result.manifestRequests, ['http://localhost/manifest.json'])
  assert.equal(result.interceptedActions, 1)
  assert.equal(result.nativeWalletCalls + result.fundedActions + result.signedActions + result.broadcasts, 0)
  assert.match(result.limitation, /neither a quote nor an enforceable/)
})
