import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertUnsignedRetry, assertNoActiveWalletActions } from '../scripts/unsigned-retry.js'
import type { PaymentAttempt } from '../src/payment-action.js'

const prior = { attempt: { identityKey: 'reader', edition: 'edition', page: 5, requestId: 'original-request', state: 'preparing' as const }, finishedAt: 'finished', error: 'fetch failed' }
const current = { identityKey: 'reader', edition: 'edition', page: 5, intent: { request_id: 'original-request', state: 'challenged', txid: null } }

test('unsigned-only reconciliation reuses the original request and refuses every signing/receipt stage', () => {
  assert.equal(assertUnsignedRetry(prior, current), 'original-request')
  for (const state of ['prepared', 'signing', 'signed', 'confirmed', 'aborted'] as PaymentAttempt['state'][]) assert.throws(() => assertUnsignedRetry({ ...prior, attempt: { ...prior.attempt, state } }, current))
  for (const extra of [{ reference: 'existing-ref' }, { txid: 'existing-tx' }, { proof: { derivationPrefix: 'prefix', derivationSuffix: 'suffix', transaction: 'proof' } }]) assert.throws(() => assertUnsignedRetry({ ...prior, attempt: { ...prior.attempt, ...extra } }, current))
  assert.throws(() => assertUnsignedRetry({ ...prior, finishedAt: undefined }, current))
})

test('unsigned retry refuses another wallet/page/edition/intent or a submitted server transaction', () => {
  for (const extra of [{ identityKey: 'other' }, { page: 6 }, { edition: 'other' }, { intent: { ...current.intent, request_id: 'other' } }, { intent: { ...current.intent, state: 'submitted', txid: 'existing' } }]) assert.throws(() => assertUnsignedRetry(prior, { ...current, ...extra }))
})

test('wallet listing must be complete and contain no active or uncertain action', () => {
  assertNoActiveWalletActions({ totalActions: 1, actions: [{ status: 'completed' }] })
  assert.throws(() => assertNoActiveWalletActions({ totalActions: 2, actions: [{ status: 'completed' }] }))
  for (const status of ['unsigned', 'nosend', 'sending', 'unproven', 'failed']) assert.throws(() => assertNoActiveWalletActions({ totalActions: 1, actions: [{ status }] }))
})
