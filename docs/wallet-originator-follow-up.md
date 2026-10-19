# Draft follow-up for BSV Desktop issue #93 / PR #124

Draft only. No external issue, PR or comment has been created or sent.

The existing [issue #93](https://github.com/bsv-blockchain/bsv-desktop/issues/93) and [PR #124](https://github.com/bsv-blockchain/bsv-desktop/pull/124) describe the same hostname/port spending-attribution mismatch observed in Pagestream. A duplicate bug report is unnecessary.

## Additional reproduction

Desktop observed version 3.1.1.0, declared toolbox-client 2.14.5, mainnet. An existing hostname-only monthly grant is visible. A subsequent 5-sat page plus 1-sat fee completes without another prompt, while the UI remains at 6 sats used.

Read-only `listActions` with `includeLabels:true` shows these completed page debits for the same calendar month:

| Label | Net debit |
|---|---:|
| admin originator localhost | 6 |
| admin originator localhost:3108 | 62 + 6 |

The token's hostname-only query reports 6; both distinct labels total 74. Synthetic official-manager reproductions show the same behavior in 2.14.5 and latest stable 2.14.9. Separate wallet-admin permission setup transactions are not page payments and should not be folded into a page-only total.

## Release and migration questions

PR #124 is merged into an integration branch after the current v3.1.1 release. Which signed Desktop release will contain it? Its behavior note explicitly says earlier port-labeled spending is not counted. What is the supported migration/reconciliation policy for existing monthly transactions and saved grants?

Suggested acceptance coverage: future create/sign/sendWith action lifecycle uses consistent authority; legacy raw hostname/port histories reconcile without duplicate txids; effective remaining allowance and renewal use the same totals as the UI; concurrent actions cannot overcommit the budget; stored permissions and wallet identity survive an update.

No private keys, wallet database, identities or full payment proof are included in this draft. Native fixes should be applied through a supported wallet update, not by impersonating an originator in a reader app or editing encrypted permission records.

Local evidence: [accounting investigation](../spike/evidence/spending-originator-accounting-2026-10-17.md). The public upstream interceptor can be tested offline against a mock wallet with `node --import tsx scripts/review-official-originator-fix.ts` from spike after the inspected public files are retained under ignored evidence/runs. No live action is created.
