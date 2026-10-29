import type { Transaction } from '@bsv/sdk'

// Official SDK fee calculation. Missing parent values stay unknown, never zero.
export function networkFee(tx: Transaction): number | null {
  try {
    const fee = tx.getFee()
    return Number.isSafeInteger(fee) && fee >= 0 ? fee : null
  } catch {
    return null
  }
}
