import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Explicit operator switch. Retain the imported pause marker for rollback and
// startup verification; this changes admission only, never existing payments.
export function purchaseGate(stateDirectory: string, enabled?: string) {
  if (enabled !== undefined && enabled !== '0' && enabled !== '1') throw new Error('PAGESTREAM_PURCHASES_ENABLED must be 0 or 1')
  return () => enabled === '1' ? false : enabled === '0' ? true : existsSync(join(stateDirectory, 'PAID_REQUESTS_PAUSED'))
}
