import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walletDiagnostic } from '../../app/client/src/payments/wallet-diagnostic.js'

test('proof-depth diagnosis requires the specific wallet code and message, not a guessed page count', () => {
  assert.deepEqual(walletDiagnostic({ code: 'WERR_INVALID_OPERATION', message: 'Maximum BEEF depth exceeded. Limit is 12' }),
    { kind: 'proof-depth-limit', limit: 12 })
  for (const error of [undefined, 'WERR_INVALID_OPERATION', { code: 'WERR_INVALID_OPERATION' },
    { code: 'WERR_INVALID_OPERATION', message: 'An invalid operation was requested.' },
    { code: 'OTHER', message: 'Maximum BEEF depth exceeded. Limit is 12' }])
    assert.equal(walletDiagnostic(error), undefined)
})

test('stored diagnostic never includes arbitrary wallet message content or malformed limits', () => {
  for (const message of ['Maximum BEEF depth exceeded. Limit is 12 secret_fixture',
    'Maximum BEEF depth exceeded. Limit is 0', 'Maximum BEEF depth exceeded. Limit is 999999999',
    'secret_fixture Maximum BEEF depth exceeded. Limit is 12'])
    assert.equal(walletDiagnostic({ code: 'WERR_INVALID_OPERATION', message }), undefined)
})
