import type { Spend } from '../../../../spike/src/wallet-client.js'

export function summarizeSpending(receipts: Spend[]) {
  // The ledger is keyed by txid. Defensively deduplicate at this boundary too.
  const entries = [...new Map(receipts.map(receipt => [receipt.txid, receipt])).values()]
  const total = entries.reduce((sum, entry) => sum + (entry.walletDebitSats ?? entry.sats + (entry.feeSats ?? 0)), 0)
  const pageSats = entries.reduce((sum, entry) => sum + entry.sats, 0)
  const feeSats = entries.reduce((sum, entry) => sum + (entry.feeSats ?? 0), 0)
  const minimum = entries.some(entry => entry.walletDebitSats == null && entry.feeSats == null)
  const unknownFees = entries.some(entry => entry.feeSats == null)
  const pending = entries.filter(entry => entry.state === 'pending').length
  const unresolved = entries.filter(entry => entry.state === 'unresolved').length
  const label = `Spent ${minimum ? '≥' : ''}${total} sats${minimum ? ' · fee unknown' : ''}${pending ? ` · ${pending} confirming` : ''}${unresolved ? ` · ${unresolved} unresolved` : ''}`
  return { total, pageSats, feeSats, minimum, unknownFees, pending, unresolved, label }
}
