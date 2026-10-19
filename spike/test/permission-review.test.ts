import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WalletInterface } from '@bsv/sdk'
import { reviewPermissionPrompt, type PermissionReview } from '../src/permission-review.js'
import { config } from '../src/config.js'

test('permission-only review calls waitForAuthentication once, records denial and never requests payment APIs', async t => {
  const originalFetch = globalThis.fetch
  const oldLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:3108' } })
  t.after(() => { globalThis.fetch = originalFetch; if (oldLocation) Object.defineProperty(globalThis, 'location', oldLocation); else Reflect.deleteProperty(globalThis, 'location') })
  const requests: string[] = []
  let paused = true, acquired = 0, prompts = 0, actions = 0
  globalThis.fetch = async input => {
    const path = String(input); requests.push(path)
    assert.ok(['/health', 'http://localhost/manifest.json'].includes(path))
    return new Response(JSON.stringify(path === '/health' ? { network: 'main', purchasesPaused: paused } : { metanet: { groupPermissions: { spendingAuthorization: { amount: config.provisional.walletLimitSats } } } }), { headers: { 'Content-Type': 'application/json' } })
  }
  const wallet = {
    getNetwork: async () => ({ network: 'mainnet' }),
    waitForAuthentication: async () => { prompts++; throw new Error('Fixture user denied native request') },
    createAction: async () => { actions++; throw new Error('Unexpected payment') },
    signAction: async () => { actions++; throw new Error('Unexpected signing') },
  } as unknown as WalletInterface
  const acquire = async () => { acquired++; return { wallet, identityKey: 'fixture-reader' } }
  const records: PermissionReview[] = []
  const result = await reviewPermissionPrompt(record => records.push(record), acquire)
  assert.equal(result.state, 'rejected')
  assert.match(result.error!, /denied native request/)
  assert.equal(prompts, 1); assert.equal(actions, 0)
  assert.ok(records.some(record => record.state === 'awaiting-native-result'))
  assert.deepEqual(requests, ['/health', 'http://localhost/manifest.json'])
  paused = false
  const stopped = await reviewPermissionPrompt(() => {}, acquire)
  assert.equal(stopped.state, 'rejected')
  assert.equal(acquired, 1); assert.equal(prompts, 1); assert.equal(actions, 0)
})
