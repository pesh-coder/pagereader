import type { Spend, HistoryState } from '../gateway'
import { summarizeSpending } from '../spending'
import { Panel } from './Panel'

export function SpendingPanel({
  receipts,
  history,
  spendLabel,
  currentPage,
  connected,
  busy,
  checkingCosts,
  costMessage,
  checkCosts,
  close,
}: {
  receipts: Spend[]
  history: HistoryState
  spendLabel: string
  currentPage?: number
  connected: boolean
  busy: boolean
  checkingCosts: boolean
  costMessage: string
  checkCosts: () => void
  close: () => void
}) {
  const spending = summarizeSpending(receipts)
  return (
    <Panel title="Spent on this book" close={close}>
      <p>{spendLabel}</p>
      {receipts.length > 0 && (
        <p className="subtle">
          Total recorded: {spending.minimum ? 'at least ' : ''}
          {spending.total} sats, including pending and uncertain payments.
        </p>
      )}
      {history === 'error' && receipts.length > 0 && (
        <p>
          Previously recorded: {spending.total} sats. History could not be
          refreshed.
        </p>
      )}
      {!receipts.length && history === 'ready' && (
        <p className="subtle">
          Recorded spending on this book: 0 sats. This is not the price of the
          whole book.
        </p>
      )}
      {receipts.length > 0 && !spending.unknownFees && (
        <p className="subtle">
          {spending.pageSats} sats for pages + {spending.feeSats} sats in miner
          fees.
        </p>
      )}
      <p className="subtle">
        Includes confirming and unresolved page payments. Separate wallet
        permission costs are not included. Reading an owned page again adds no
        page charge.
      </p>
      {!connected && (
        <p>
          No wallet is connected. Use Continue reading to find an existing
          purchase without buying a page.
        </p>
      )}
      {spending.unknownFees && (
        <p className="subtle">
          Some fees are not recorded on this browser. Check wallet costs to look
          up the total debited for each payment; its fee breakdown may still be
          unavailable.
        </p>
      )}
      {connected && (
        <button
          disabled={busy || checkingCosts}
          onClick={() => void checkCosts()}
        >
          {checkingCosts
            ? 'Checking wallet history…'
            : 'Check wallet costs · no payment'}
        </button>
      )}
      {costMessage && <p role="status">{costMessage}</p>}
      <dl className="cost-list">
        {[...receipts]
          .sort(
            (a, b) =>
              Number(b.page === currentPage) - Number(a.page === currentPage) ||
              a.page - b.page,
          )
          .map((s) => {
            const total =
              s.walletDebitSats ??
              (s.feeSats == null ? null : s.sats + s.feeSats)
            return (
              <div key={s.txid}>
                <dt>
                  Page {s.page} ·{' '}
                  {s.state === 'confirmed'
                    ? 'Accepted'
                    : s.state === 'pending'
                      ? 'Pending'
                      : 'Needs checking'}
                  {currentPage === s.page && ' · current page'}
                </dt>
                <dd>
                  <p className="cost-line">
                    <span>Page price</span>
                    <strong>{s.sats} sats</strong>
                  </p>
                  <p className="cost-line">
                    <span>Miner fee</span>
                    <span>
                      {s.feeSats == null
                        ? 'Not recorded'
                        : `${s.feeSats} ${s.feeSats === 1 ? 'sat' : 'sats'}`}
                    </span>
                  </p>
                  <p className="cost-line cost-total">
                    <span>Page total</span>
                    <strong>
                      {total === null ? `At least ${s.sats}` : total} sats
                    </strong>
                  </p>
                  {total === null && (
                    <p className="subtle">
                      The final total is unknown here because the fee is not
                      recorded.
                    </p>
                  )}
                  {total !== null && s.feeSats == null && (
                    <p className="subtle">
                      Total debited by the wallet; fee breakdown not recorded
                      here.
                    </p>
                  )}
                  <details className="cost-transaction">
                    <summary>Transaction details</summary>
                    <small className="txid">{s.txid}</small>
                    {s.walletStatus && (
                      <small>Wallet status: {s.walletStatus}</small>
                    )}
                  </details>
                </dd>
              </div>
            )
          })}
      </dl>
      <p className="subtle">
        “Accepted” means the server accepted the page purchase; it does not mean
        mined into a block. Checking wallet history cannot create a payment or
        permission grant.
      </p>
    </Panel>
  )
}
