# Paid timing report readiness — 2026-10-17

No new mainnet turn was authorized or run. C3 remains UNRESOLVED. The three owned-read timings and the earlier single slow paid turn are not substituted for the required 20-turn cohorts in both wallets.

## Evidence qualification repaired

The old report could accept 20 entries with `purchased: true` and a version string without checking distinct transactions, pages or mainnet context. No saved JSON report claiming a C3 PASS was found under spike/evidence; no prior acceptance status was changed.

The probe now exports schema 2 with each displayed sample's edition, authenticated public identity, receipt txid, observed wallet mainnet context, explicit/initial/recovery/resume trigger and request-to-visible-frame boundary. Original diary data remains; legacy samples are not silently upgraded. The report still reads schema-1 exports for descriptive nearest-rank statistics, but they cannot produce acceptance PASS.

Schema-2 qualification requires at least 20 unique paid pages and transactions, a matching five-sat server-confirmed ledger entry for each, exactly one successful new-payment workflow observation, correct identity/edition, visible finite timing, mainnet context, wallet app name/version and a valid origin. Missing or failed request evidence, duplicate/hidden/malformed samples and conflicting receipt evidence keep C3 unresolved. Cold and slow samples stay in p50/p95. A single-wallet result never passes the overall both-wallet criterion. Raw native/server evidence still needs review: an export cannot independently prove its own provenance.

## Probe resume safety

The technical probe's saved-bookmark action now explicitly requests recovery-only delivery, as the real reader already does. It cannot turn a stale/unowned bookmark into a fresh purchase. Server page/edition/text validation also precedes display.

A browser regression read the existing owned page 3, then supplied page 7 as a synthetic bookmark at the final JSON-consumption boundary, after normal authentication; no server response bytes/signature, database bookmark or transaction was changed. Resume checked the real page-7 status, reported no existing payment and kept page 3 visible. The outer guard saw no paid-page/action/grant attempts. It deliberately blocked the independent post-display bookmark PUT, producing the expected bookmark warning. The test then displayed existing owned page 5, preserving the last displayed local page hint. Native crypto/authentication calls were read-only; no new sats spent. Raw local evidence: `runs/probe-unowned-resume-2026-10-17.json`.

## Validation and remaining gate

Spike/client builds and client lint PASS. **53 local tests PASS**, including synthetic qualification tests for nearest-rank thresholds, cold turns, failed requests, legacy flags, repeated pages/txids, owned rereads, missing workflows, mismatched identity/edition, wrong network, incomplete receipts and invalid display/trigger evidence. Synthetic test fixtures are not mainnet acceptance runs.

The technical probe now selects any of the eight editions, defaulting to the original Holmes edition and retaining the 43-page research window. Content, ownership, bookmarks and payments use edition-scoped routes; original journal keys and controlled-run helpers remain intact. Choosing a title displays only public page 1 and does not acquire a wallet. The probe also shares the reader's cost-summary calculation, including pending/unresolved and measured native debits.

Browser checks selected Pride and Frankenstein, reading pages 1 and 2 through their scoped public routes with no wallet module, wallet calls or blocked paid requests. A synthetic wrong-edition public response was refused; the prior Pride page 2 text, title and selection remained. It then successfully selected Frankenstein. The actual free-only schema-2 export was passed through the report CLI: zero paid/eligible samples, null p50/p95 and C3 UNRESOLVED, with the deliberately injected failure retained. Raw private local evidence: `runs/public-edition-probe-review-2026-10-17.json` and `runs/public-edition-probe-export-2026-10-17.json`.

Real paid cohorts still require a reviewed working wallet attribution policy, a stable approved origin, a funded supported phone identity and explicit page/fee/grant authorization. Historical Holmes pages/uncertain intents cannot be reset or repurchased for samples. Pride pages 3–22 and 23–42 are a candidate pair of disjoint untouched ranges, subject to a fresh read-only ownership/intent check before authorization. The pause is unchanged; this preparation does not enable or authorize those purchases. A controlled run must admit each explicit requested page through a scoped permit without blanket unpausing, and retain any uncertain result for original-proof recovery. No such live cohort was started.
