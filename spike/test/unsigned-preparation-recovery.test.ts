import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WalletInterface } from '@bsv/sdk'
import type { PaymentAttempt } from '../src/payment-action.js'
import { reconcileUnsignedPreparation } from '../../app/client/src/payments/unsigned-preparation.js'
import { completedHistoryFingerprint } from '../../app/client/src/payments/wallet-history.js'

function fixture() {
  let attempt: PaymentAttempt = { identityKey: 'reader', edition: 'edition', page: 20, requestId: 'original',
    state: 'preparing', walletRequestStarted: true, lastFailure: { method: 'createAction', code: 'WERR_INVALID_OPERATION' } }
  let writes = 0, historyReads = 0
  const options = { identityKey: 'reader', edition: 'edition', page: 20, requestId: 'original',
    get: () => attempt, save: (next: PaymentAttempt) => { writes++; attempt = next },
    completedHistory: async () => { historyReads++; return 'stable-completed-history' }, recheck: async () => true }
  return { options, set: (next: Partial<PaymentAttempt>) => { attempt = { ...attempt, ...next } },
    state: () => ({ attempt, writes, historyReads }) }
}

test('completed-history recovery preserves the original unsigned request and makes no wallet payment calls', async () => {
  const f = fixture()
  assert.equal(await reconcileUnsignedPreparation(f.options), true)
  assert.equal(f.state().attempt.state, 'aborted')
  assert.equal(f.state().attempt.retryReason, 'unsigned-not-created')
  assert.equal(f.state().attempt.requestId, 'original')
  assert.equal(f.state().historyReads, 2)
  assert.equal(f.state().writes, 1)
})

test('recovery refuses missing/other errors, every signing stage and any returned action or broadcast evidence', async () => {
  const changes: Partial<PaymentAttempt>[] = [
    { walletRequestStarted: false }, { lastFailure: undefined },
    { lastFailure: { method: 'createAction', code: 'TIMEOUT' } },
    { lastFailure: { method: 'signAction', code: 'WERR_INVALID_OPERATION' } },
    { reference: 'unsigned-reference' }, { txid: 'existing' },
    { proof: { transaction: 'proof', derivationPrefix: 'p', derivationSuffix: 's' } },
    { broadcast: { status: 'unknown', checkedAt: 'fixture' } },
    ...['reserved', 'prepared', 'signing', 'signed', 'confirmed', 'aborted'].map(state => ({ state } as Partial<PaymentAttempt>)),
    { identityKey: 'other' }, { edition: 'other' }, { page: 21 }, { requestId: 'replacement' },
  ]
  for (const change of changes) {
    const f = fixture(); f.set(change)
    assert.equal(await reconcileUnsignedPreparation(f.options), false)
    assert.equal(f.state().writes, 0)
    assert.equal(f.state().historyReads, 0)
  }
})

test('changed intent, history, journal or failed history checks leave the original attempt intact', async () => {
  for (const scenario of ['intent', 'history', 'journal', 'unavailable']) {
    const f = fixture(); let reads = 0
    f.options.recheck = async () => {
      if (scenario === 'journal') f.set({ reference: 'other-tab-prepared' })
      return scenario !== 'intent'
    }
    f.options.completedHistory = async () => {
      if (scenario === 'unavailable') throw new Error('history unavailable')
      return scenario === 'history' ? String(reads++) : 'stable'
    }
    if (scenario === 'unavailable') await assert.rejects(reconcileUnsignedPreparation(f.options))
    else assert.equal(await reconcileUnsignedPreparation(f.options), false)
    assert.equal(f.state().writes, 0)
  }
})

test('wallet history recovery requires complete, consistent, completed transactions, including unsigned actions', async () => {
  const action = { txid: 'a'.repeat(64), status: 'completed', satoshis: -28, isOutgoing: true }
  let result = { totalActions: 1, actions: [action] }
  const wallet = { listActions: async (args: { labels: string[]; seekPermission: boolean }) => {
    assert.deepEqual(args.labels, []); assert.equal(args.seekPermission, false); return result
  } } as unknown as Pick<WalletInterface, 'listActions'>
  assert.ok(await completedHistoryFingerprint(wallet))
  for (const status of ['unsigned', 'unprocessed', 'nosend', 'sending', 'unproven', 'failed', 'unknown']) {
    result = { totalActions: 1, actions: [{ ...action, status }] }
    await assert.rejects(completedHistoryFingerprint(wallet))
  }
  result = { totalActions: 1, actions: [{ ...action, txid: '', status: 'unsigned' }] }
  await assert.rejects(completedHistoryFingerprint(wallet))
  result = { totalActions: 2, actions: [action] }
  await assert.rejects(completedHistoryFingerprint(wallet))
  result = { totalActions: 0, actions: [] }
  await assert.rejects(completedHistoryFingerprint(wallet))
})
