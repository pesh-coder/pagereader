import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WalletInterface } from '@bsv/sdk'
import { runGrantOnlyExperiment } from '../src/grant-only.js'
import { config } from '../src/config.js'

test('grant-only run requires explicit authorization and reconciles native failure without retrying or making page payments', async t => {
  const originalFetch = globalThis.fetch
  const oldLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:3108' } })
  t.after(() => { globalThis.fetch = originalFetch; if (oldLocation) Object.defineProperty(globalThis, 'location', oldLocation); else Reflect.deleteProperty(globalThis, 'location'); if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else Reflect.deleteProperty(globalThis, 'localStorage') })
  const paths: string[] = []
  globalThis.fetch = async input => {
    paths.push(String(input))
    return new Response(JSON.stringify(String(input) === '/health' ? { network: 'main', purchasesPaused: true } : { metanet: { groupPermissions: { spendingAuthorization: { amount: config.provisional.walletLimitSats } } } }), { headers: { 'Content-Type': 'application/json' } })
  }
  let nativeRequests = 0, historyReads = 0, payments = 0
  const before = { txid: 'a'.repeat(64), satoshis: -6, status: 'completed' }
  const additional = { txid: 'b'.repeat(64), satoshis: -5, status: 'unproven' }
  const wallet = {
    getNetwork: async () => ({ network: 'mainnet' }),
    listActions: async (args: { seekPermission: boolean }) => { assert.equal(args.seekPermission, false); historyReads++; const actions = historyReads === 1 ? [before] : [before, additional]; return { totalActions: actions.length, actions } },
    waitForAuthentication: async () => { nativeRequests++; throw new Error('Lost native response after possible debit') },
    createAction: async () => { payments++; throw new Error('Unexpected payment') },
  } as unknown as WalletInterface
  const acquire = async () => ({ wallet, identityKey: 'fixture-reader' })
  await assert.rejects(runGrantOnlyExperiment({ acceptUnquotedNativeGrantCost: false }, () => {}, acquire), /Explicit authorization/)
  assert.equal(paths.length, 0)
  const run = await runGrantOnlyExperiment({ acceptUnquotedNativeGrantCost: true }, () => {}, acquire)
  assert.equal(nativeRequests, 1); assert.equal(payments, 0); assert.equal(historyReads, 2)
  assert.match(run.error!, /Lost native response/)
  assert.equal(run.recordedNewDebitSats, 5)
  assert.deepEqual(run.historyDelta, [additional])
  assert.deepEqual(paths, ['/health', 'http://localhost/manifest.json'])
  assert.equal(run.state, 'finished')
  await assert.rejects(runGrantOnlyExperiment({ acceptUnquotedNativeGrantCost: true }, () => {}, acquire), /saved grant-only attempt already exists/)
  assert.equal(nativeRequests, 1)
  assert.equal(historyReads, 2)
})
