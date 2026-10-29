import type { Spend } from '../payments/wallet-client.js'

export function summarizeSpending(receipts: Spend[]) {
  // The ledger is keyed by txid. Defensively deduplicate at this boundary too.
  const entries = [
    ...new Map(receipts.map((receipt) => [receipt.txid, receipt])).values(),
  ]
  const total = entries.reduce(
    (sum, entry) =>
      sum + (entry.walletDebitSats ?? entry.sats + (entry.feeSats ?? 0)),
    0,
  )
  const pageSats = entries.reduce((sum, entry) => sum + entry.sats, 0)
  const feeSats = entries.reduce((sum, entry) => sum + (entry.feeSats ?? 0), 0)
  const minimum = entries.some(
    (entry) => entry.walletDebitSats == null && entry.feeSats == null,
  )
  const unknownFees = entries.some((entry) => entry.feeSats == null)
  const pending = entries.filter((entry) => entry.state === 'pending').length
  const unresolved = entries.filter(
    (entry) => entry.state === 'unresolved',
  ).length
  const amounts = (state: Spend['state']) => {
    const selected = entries.filter((entry) => entry.state === state)
    return {
      total: selected.reduce(
        (sum, entry) =>
          sum + (entry.walletDebitSats ?? entry.sats + (entry.feeSats ?? 0)),
        0,
      ),
      minimum: selected.some(
        (entry) => entry.walletDebitSats == null && entry.feeSats == null,
      ),
    }
  }
  const label = `Spent ${minimum ? '≥' : ''}${total} sats${minimum ? ' · fee unknown' : ''}${pending ? ` · ${pending} confirming` : ''}${unresolved ? ` · ${unresolved} unresolved` : ''}`
  return {
    total,
    pageSats,
    feeSats,
    minimum,
    unknownFees,
    pending,
    unresolved,
    label,
    confirmedAmount: amounts('confirmed'),
    pendingAmount: amounts('pending'),
    unresolvedAmount: amounts('unresolved'),
  }
}

export function spendingLabel(
  summary: ReturnType<typeof summarizeSpending>,
  history: 'idle' | 'loading' | 'ready' | 'error',
  connected: boolean,
  freePreview: boolean,
) {
  const recorded = summary.total > 0 ? ` · ${summary.minimum ? '≥' : ''}${summary.total} sats recorded` : ''
  if (history === 'loading') return `Loading spending…${recorded}`
  if (history === 'error') return `Spending unavailable${recorded}`
  if (!connected || (freePreview && summary.total === 0)) return 'Free preview'
  if (history !== 'ready') return 'Spending not loaded'
  const format = (amount: { total: number; minimum: boolean }) =>
    `${amount.minimum ? '≥' : ''}${amount.total} sats`
  return `Spent on this book: ${format(summary.confirmedAmount)}${summary.pending ? ` · ${format(summary.pendingAmount)} pending` : ''}${summary.unresolved ? ` · ${format(summary.unresolvedAmount)} uncertain` : ''}`
}
