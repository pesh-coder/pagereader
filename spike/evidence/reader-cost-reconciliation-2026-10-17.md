# Reader cost reconciliation — 2026-10-17

Requirement 4 advanced without a new transaction, grant, permit or change to the wallet. Overall C4 remains FAIL: permission costs and physical cross-device accounting are not complete.

## Implemented

The reader headline now includes pending and unresolved ledger entries, once per txid, alongside server-confirmed purchases. A missing fee remains unknown and makes an unmeasured total a minimum. Server ownership and wallet/mining status remain separate.

An explicit **Check wallet costs · no payment** action reads native history with `labels: []` and `seekPermission: false`. It checks pagination, consistent totals, unique txids and integer amounts before applying any update. It matches only the current identity/edition's existing ledger txids. It does not infer app ownership from localhost labels, import unrelated payments, change purchase states, or classify a total wallet debit as a miner fee. Partial, conflicting or unavailable history preserves existing costs.

Where an original signed proof remains in the browser journal, the official SDK parses it, checks its txid against the receipt and obtains the actual fee. No proof, key or wallet-history descriptions are exported. Default library/free-page viewing and opening the costs panel do not read native history automatically.

## Browser result

The built reader on localhost:3108 resumed already-owned Holmes page 5. Before the explicit cost check, it showed a minimum 16 sats: three five-sat receipts plus the one fee recoverable from its original journal. One native `listActions` call returned HTTP 200. Matching the original page-3/5/6 txids produced **62 + 6 + 6 = 74 sats** in both header and costs panel. All three wallet actions were completed. Page 3 and page 5 still show unknown fee breakdowns in this browser; their measured total debits are known. The separately evidenced 244 sats of permission setup are explicitly excluded from this book total.

The test guard refused all create/sign/broadcast/internalize/grant operations and paid-page routes. No such operation was attempted. It also deliberately blocked the post-display bookmark PUT to preserve the existing server bookmark; that produced the expected bookmark warning, independent of payment. Only original local cost records were enriched. The browser host emitted its existing Electron preload error and a wallet-discovery connection-refused fallback, so this is not a zero-errors C1 pass.

Read-only preflight snapshots before/after are identical: three purchases, five intents, three replay claims and two proofs; pause present, no live permit. Raw private local evidence: `runs/reader-cost-review-2026-10-17.json`, `runs/reader-cost-snapshot-comparison-2026-10-17.json` and the referenced preflights. No new sats spent.

The rebuilt costs panel was checked again with the persisted reconciled records and no additional history call. All three rows fit the dialog without horizontal overflow. [Browser screenshot](screenshots/reader-cost-reconciliation-2026-10-17.png). Its background bookmark warning is the deliberate test guard described above.

## Validation and remaining work

Client build/lint and spike build PASS; **50 local tests PASS**. New regressions cover paginated history without permission seeking, unstable/incomplete/duplicate history, pending/unresolved inclusion and deduplication, txid-only matching, unknown fees, another identity's records, missing actions, and atomic refusal of inconsistent amounts.

This repairs the reader counter, not the Desktop allowance query. Native budget enforcement, grant attribution, exact fee details on a fresh phone and the full required cross-device evidence remain unresolved. The single-service HTTPS deployment is prepared for review, not running.
