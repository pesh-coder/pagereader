# Shared receipt fees — 2026-10-18

The user's browser showed a minimum 15 sats while the preview showed 74. The server returned only page prices; wallet-history totals and original-proof fee discoveries existed only in each browser's local ledger. Changing labels did not repair that data gap.

An additive `purchase_costs` table now stores verified miner fees and provenance by existing receipt txid. Future accepted payments calculate fees with the official SDK and commit costs atomically with receipt/replay/ownership. Missing parent values remain unknown; no fee is inferred from net debit or assumed to be one sat. Fee-write failure rolls back receipt acceptance while retaining the original submitted proof.

Authenticated me/status/owned/paid responses now include recorded `feeSats`. Both reader and probe merge that evidence. A fresh browser no longer needs the preview's local history or original proofs for confirmed receipt costs. The panel shows aggregate page prices/known miner fees and each page's price, fee and total.

| Page | Price | Miner fee | Total | Verified source |
|---|---|---|---|---|
| 3 | 5 sats | 57 sats | 62 sats | Recorded public transaction and matching parent, checked with SDK |
| 5 | 5 sats | 1 sat | 6 sats | Original stored proof, SDK txid/price/fee checks |
| 6 | 5 sats | 1 sat | 6 sats | Original stored proof, SDK txid/price/fee checks |
| Total | 15 sats | 59 sats | 74 sats | Permission setup excluded |

The offline repair defaults to read-only. The applied command was `node --import tsx scripts/backfill-receipt-fees.ts --apply test/fixtures/page3-mainnet.json`, adding exactly three cost rows. All original rows in purchases, intents, replay_claims, payment_proofs, bookmarks and intent_recoveries matched the pre-repair SQLite backup exactly. No keys, original proofs, intents or browser journals were reset/replaced. The repair made zero wallet calls and zero new payments.

The existing dev process 25656 was verified, stopped with pause/no permit, and backed up before repair. The same npm dev command restarted the original key/ledger as process 21516 on 3108 with localhost public metadata on 80. PUBLIC_ORIGIN was set locally for this process only. No wallet restart or ngrok. A new private deployment snapshot includes all three cost rows; nothing was uploaded.

Private evidence: `runs/shared-receipt-fees-repair-2026-10-18.json`; pre-repair snapshot `runs/deployment-state-1792341651864`; updated snapshot `runs/deployment-state-1792341707174`. Snapshot DBs contain private identity/proof records and must not be attached to team messages.

Spike/client builds, client lint and **59 local tests PASS**. Regressions cover old receipt migration, durable identity/edition isolation, missing/negative/conflicting fee evidence, atomic rollback, original/public proof matching, accepted fee delivery through real auth middleware, and two independent fresh ledgers recovering 15 + 59 = 74 without wallet history or local proofs.

A browser review with virtual empty cost storage and absent payment journals received Book total: 74 sats from the server. The panel showed fees 57/1/1 and totals 62/6/6 without an unknown-fee warning. A guard refused transaction creation/signing/broadcast/internalization and listActions; none were attempted. Identity/authentication crypto and normal post-display bookmark writes occurred. The final aggregate subtotal line built and passed tests; its visual refresh could not complete after the preview host disconnected, so no final aggregate screenshot is claimed.

No new sats spent or grants changed. Purchases remain paused; no permit exists. The confirmed-receipt fee gap across browsers is repaired. Native allowance attribution/enforcement, uncertain cross-device spending and physical phone acceptance remain open. C1/C2/C4 remain FAIL; other overall criteria remain UNRESOLVED.
