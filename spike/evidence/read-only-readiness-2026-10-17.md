# Recovery, bookmark and wallet-fix readiness — 2026-10-17

These are narrow local/offline or existing-proof checks. C1/C2/C4 remain FAIL; all other overall criteria remain UNRESOLVED. New purchases remain paused. No new sats were spent.

## Existing original-proof recovery

The explicit `existing-proof-review.ts` helper required the already-delivered page-6 journal and original confirmed proof. An outer transport guard blocked wallet action/grant methods. It deliberately discarded one HTTP 200 response for already-owned page 6, then resubmitted the same original proof and received the same txid with 11 paragraphs. Reusing that proof for page 3 or a different edition returned 409. Before/after SQLite snapshots are identical: three purchases, five intents, three replay claims and two saved proofs. This does not simulate a new debit, validate a new-purchase race or satisfy the full delayed-approval/device cohort.

Private local raw records are `runs/existing-proof-review-2026-10-17.json` and `runs/existing-proof-snapshot-comparison-2026-10-17.json`. No proof bytes were exported into those reports.

## Explicit saved-page discovery

The existing Pages panel now offers **Resume saved page** even without a local bookmark hint or wallet session. Only that explicit action acquires identity, reads the server bookmark and requests recovery-only delivery. A missing entitlement cannot become a purchase. Current text remains on error. Unit evidence covers fresh storage, no wallet calls on free page 1, server bookmark discovery, owned delivery, an unowned bookmark and an out-of-range bookmark.

Browser checks started with wallet-free public Pride page 1, invoked explicit resume and then resumed the server's saved Holmes page 5 through owned/status routes. The guard refused paid routes and native action/grant calls; none were attempted. Bookmark writes were deliberately blocked during this review to preserve server state, so the independent bookmark warning is expected. Physical phone identity, funding, installation and resume remain unverified.

## Official wallet fix

The latest published Desktop release inspected was [v3.1.1](https://github.com/bsv-blockchain/bsv-desktop/releases/tag/v3.1.1). Existing [issue #93](https://github.com/bsv-blockchain/bsv-desktop/issues/93) and [PR #124](https://github.com/bsv-blockchain/bsv-desktop/pull/124) cover the hostname/port attribution defect. PR #124 merged into an integration branch, outside that release. It normalizes future createAction attribution while retaining full-origin recent-app display; it explicitly does not include historical port-labeled actions in this month's total.

The offline review executes the official interceptor source at commit `4a1af43cadfa2458a1a222aa7478daefc57d374e` against a mock wallet. It forwarded localhost:3108 as localhost while retaining localhost:3108 in recent-app metadata. The saved output includes source hashes and zero real wallet calls/transactions/installations. Installed toolbox 2.14.9 and Desktop-declared 2.14.5 both reproduce the earlier 6-versus-74 undercount. No unofficial wallet was installed over funded state. See `runs/official-originator-fix-offline-2026-10-17.json` and the [local follow-up draft](../../docs/wallet-originator-follow-up.md). No report/comment was sent externally.
