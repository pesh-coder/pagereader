import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertReadOnlyPageSixResume } from '../src/single-page-state.js'

test('only settled read-only page-six preflight metadata qualifies for same-request resumption', () => {
  const record = { page: 6, requestId: 'b9b248b6-8438-41a6-9181-40dacc7ff756', state: 'preflight', spends: [], calls: [{ method: 'verifySignature' }], http: [{ path: '/.well-known/auth' }] }
  assert.doesNotThrow(() => assertReadOnlyPageSixResume(record))
  for (const state of ['ready', 'requesting', 'delivered', 'unresolved']) assert.throws(() => assertReadOnlyPageSixResume({ ...record, state }))
  assert.throws(() => assertReadOnlyPageSixResume({ ...record, spends: [{ txid: 'known-proof' }] }))
  for (const method of ['createAction', 'signAction', 'page payment workflow', 'abortAction']) assert.throws(() => assertReadOnlyPageSixResume({ ...record, calls: [{ method }] }))
  assert.throws(() => assertReadOnlyPageSixResume({ ...record, http: [{ path: '/api/editions/edition/pages/6' }] }))
  assert.throws(() => assertReadOnlyPageSixResume({ ...record, page: 7 }))
})
