# Pagestream: acceptance and remaining work

Updated 2026-11-08. **The POC is not complete.** The [learnings note](../LEARNINGS.md) explains the implementation; this file tracks whether it meets the brief. The original acceptance targets are retained, including where the observed wallet behavior conflicts with them.

**Latest completion work:** logout/acquisition and overlapping reader-operation races are fixed and tested. Two independent authenticated synthetic clients recover the same durable bookmark and receipt costs across a server/SQLite restart without a payment. All **123 tests**, server/client builds and client lint pass. The combined create-and-sign/no-send primitive was verified offline using the official server wallet, but its single 755.6-ms sample does not establish a native improvement. Current C2/C3/C8 and final-demo statuses remain open. No mainnet purchase, paid permission grant or wallet migration was performed. [Full completion checkpoint and four-workstream gates](../spike/evidence/completion-checkpoint-2026-11-08.md).

**Current checkpoint:** all four previously unproven phone/funding transactions now have 701 confirmations on WhatsOnChain and `MINED` on Arcade. The two phone debit proof endpoints return 200. The mining blocker is closed. All 16 hosted public previews passed wallet-free HTTP checks; the owner also confirmed both Holmes previews load on the phone after logging out of the app connection, with no error or wallet prompt (C1). Source/schema audit closes C7 (no account), and actual mainnet payments on both wallets close C9. These narrow passes do not complete session approval, paid latency, same-identity resume or the final demo. [Evidence](../spike/evidence/acceptance-check-2026-11-07.md).

**Agreed pricing:** 5 sats seller price plus the actual miner fee. The reader now asks once per open visit for a 23-sat fee ceiling per new page (28 sats maximum total), bound to the active wallet and cleared on reload/logout. Next then requests only the selected page without repeated app consent within that ceiling. Higher/unknown fees still stop; a separately approved higher quote applies to one attempt only. Historical operator/unapproved calls retain their 1-sat fallback. Use the maintainer-recommended 100 sats/kB in the wallet; Desktop's latest setting remains unconfirmed. Original spending matches Desktop 74 and phone page 3 at 28 plus a separate 199-sat grant. The new phone capture records 30 accepted pages through page 32 totaling 840 sats (150 prices + 690 fees); the screenshot matches. Broader pending/recovery accounting still needs checking.

**Approval requirement retained, 2026-11-02:** the user reiterated the original brief. Keep one wallet approval per session and a wallet-managed session limit. The observed 5,000-sat monthly allowance is not accepted as a replacement; C2 remains unmet. Closing a tab stops app purchases but does not establish expiry or revocation of a saved wallet permission. Do not substitute a server-side/sessionStorage budget or a monthly grant for native session behavior. Investigate supported wallet session controls within the install-only wallet scope; if unavailable, report the stack gap rather than modify wallets or mark acceptance complete. The independent paid-page p95 target remains 500 ms.

The [senior review R1 checklist](review-feedback-r1.md) records the reader, recovery, source-byte and production-route changes. Hosted feature checks now show the review features, but full real-wallet verification remains open. Removing repeated app confirmations does not satisfy native one-prompt acceptance. Tests of receiver merges simulate the receiving wallet; native duplicate-import behavior still needs verification.

**Hosted/device checkpoint, 2026-10-29:** the delivered reader includes the review features, production research routes return 404, and all 16 public preview pages pass from the agent environment. Health reports mainnet, payment-ready and purchases enabled. The user reports Desktop 3.3.1 and Browser 1.6.3 with different identities; independent wallet testing can proceed, while same-identity resume remains unverified. The phone screenshot exposed bottom navigation covered by browser/system bars. A responsive layout fix passes local portrait/landscape checks; physical-phone retest remains open. See [hosted readiness and device checks](../spike/evidence/hosted-readiness-2026-10-29.md). None of the full acceptance statuses below are upgraded.

## The brief's “Done when” checklist

| Requirement | Current result |
|---|---|
| Six-step story live in about 90 seconds, mainnet | Not rehearsed end to end |
| Desktop and Browser, including cross-device bookmark | Purchases and baseline debit reconciliation work on both; phone purchase is now mined. Silent subsequent phone turns pass; same-identity cross-device resume remains open |
| Wallet prompts once per session | Not met: observed saved grant is monthly, with initial separate prompts; one subsequent Desktop turn was prompt-free |
| Underpaid/replayed requests refused | Local coverage passes; existing-proof live-local replay checks pass; full native negative cases remain |
| Learnings written and shared | Rewritten for review; repository publication was authorized previously, but team delivery/receipt is not confirmed |

## Detailed acceptance register

FAIL means an observed miss remains open. UNRESOLVED means the complete acceptance evidence is missing; neither label erases a narrow implementation pass.

| Criterion | Status | Evidence and what remains |
|---|---|---|
| C1 Free browsing/previews, no wallet or errors on both devices | PASS | Eight books and both previews pass the 16-page wallet-free hosted checks. Desktop free reading was already observed; on 7 November the owner logged out of the app wallet connection on the physical phone and confirmed Holmes pages 1 and 2 load with no errors or wallet prompt, closing the earlier phone failure. |
| C2 One native prompt through first visit and 20 paid turns | FAIL | Grouped 5,000/month grant cost 5 sats; next page had zero prompts. Phone pages 5 and 6 now also had zero native prompts. Session scope is not met; complete allowance/clean-origin cohorts on both wallets are missing. |
| C3 Paid page p95 ?500 ms, 20 turns per wallet | FAIL (observed speed; cohort incomplete) | Native Browser capture has 13 distinct accepted paid turns, pages 20?32. Median 6.511 s; range 5.754?7.614 s. Descriptive p95 7.614 s is not a qualifying 20-turn p95; machine qualification stays UNRESOLVED. Page 33 originally hit the proof-depth limit; its post-fix retry succeeds in 7.073 s using eight known ancestors. Fresh page 34 takes 6.122 s, including 1.587 s payer workflow and 1.846 s remote storage acceptance. Pause further paid cohorts pending latency work. [Analysis](../spike/evidence/phone-paid-run-2026-11-07.md). |
| C4 Accurate always-visible spend | UNRESOLVED | Baseline comparison passes: Desktop wallet matches 3 page payments totaling 74; phone wallet debit matches the 28-sat reader total, with a separate 199-sat grant. Phone funding/debits reconcile to 6,773. The original phone export has 30 unique accepted receipts totaling 840 sats, matching its screenshot; the page-34 diagnostic now has 32 unique receipts totaling 896 sats (160 prices + 736 fees); permission setup remains excluded. Broader uncertain-payment and same-identity cross-device accounting remain open; wallet allowance accounting is tracked under C2. Neither recorded debit nor server acceptance proves mining. |
| C5 Underpay 400; wrong-page/identity replay 409 | UNRESOLVED | Local tests pass; existing-proof wrong-page/edition live-local requests returned 409. Hosted original-proof cross-identity requests returned 409 twice, no content and no caller entitlement/intent change. Native mainnet underpayment and remaining replay cases remain. |
| C6 Exactly one charge per page, including lost delivery/two tabs/two devices | UNRESOLVED | Durable proof recovery and local fault/race coverage pass. The local receiver fixture now recovers after acceptance/receipt failure and SQLite restart using the original server proof. The native capture confirms page-20 recovery followed by one accepted purchase, with no duplicate page/TXID in its ledger. Actual receiving-wallet duplicate-import behavior, newly charged live lost delivery and native races remain. |
| C7 No signup/email/password/card/profile | PASS | Active reader entry, components, wallet helper, payment routes and SQLite schema audited on 7 November; only the wallet's public identity keys purchases/bookmarks, with no account forms or fields. Both existing device purchase observations support the source audit. |
| C8 Same identity and displayed bookmark on phone | UNRESOLVED | Desktop Resume and hosted owned recovery work without purchasing. User confirms Desktop and Browser have different identities and accepts independent testing. That does not complete same-identity cross-device resume. |
| C9 Mainnet on both wallets | PASS | Three Desktop mainnet purchases previously verified; Browser page 3 opens and its matching 28-sat transaction is now independently confirmed mined. This closes mainnet use on both, not the separate prompt, timing, race or cross-device requirements. |
| C10 Six-step story in ~90 seconds | UNRESOLVED | HTTPS reading is hosted; phone wallet/shortcut checks, leave-mid-chapter observation and timed rehearsal remain. |
| C11 Learnings written/shared | UNRESOLVED | Short note now written; team sharing not confirmed. |

## Work still needed

Known-ancestor handling and complete proof restoration are implemented, alongside unsigned recovery for matched accepted unmined payments and removal of a redundant fresh-page status request. All 105 tests pass. This does not upgrade C3: the latest native median remains 6.51 seconds, and receiver acceptance latency remains open. The bounded page-33 pilot now passes: eight known ancestors, one accepted 28-sat purchase, and a book total of 868 sats. It still took 7.073 seconds, including 2.434 seconds receiver acceptance. Sustained depth-limit avoidance and both full timing cohorts remain open. [Pilot](../spike/evidence/phone-page33-pilot-2026-11-07.md). [Implementation](../spike/evidence/payment-ancestry-fix-2026-11-07.md).

**Implementation or stack gaps**

- Meet the 500-ms paid-turn target first. The scoped original-transaction overlap pilot was deployed and measured on page 35: 6.406 seconds, with no demonstrated improvement. It is now disabled. Official local receiver and combined no-send experiments have not demonstrated a qualifying faster path. Provider tracing remains unavailable. [Latest work](../spike/evidence/completion-checkpoint-2026-11-08.md).
- Meet the retained session approval requirement through supported wallet behavior. The monthly grant is a documented gap, not a session pass; no wallet modification is in scope.
- Validate supported allowance enforcement and legacy port-labelled spending. Reader accounting does not repair the wallet's limit query.
- Investigate and improve paid-page latency. The current deliberate no-paid-prefetch design avoids charging for unread pages; it has not met 500 ms.
- Finish permission-cost provenance and uncertain cross-device spend accounting, then verify the visible total on both devices.
- Address defects exposed by the remaining native recovery/race and phone tests. Do not assume missing evidence automatically requires new features.

**Live checks still needed**

- Browser's existing page purchase, debit and mining status are reconciled; same-wallet owned-page reopening was observed. Refresh the local wallet proof/status, then establish supported identity continuity for the cross-device story. Current identities differ.
- Wallet-free phone previews passed. Phone pages 5 and 6 had zero native prompts; still verify scope, cost and allowance consumption across complete cohorts on both wallets.
- Collect 20 distinct paid-page samples per wallet, preserving slow/failed samples; verify underpayment, replay, lost response and concurrent purchases.
- Owner reports no additional purchase after the requested close/resume check. Retain this observed pass; actual in-flight interruption and concurrency remain to test. An already-submitted transaction may finish after close; closing cannot cancel it.
- Rehearse the six-step mainnet story in about 90 seconds, then share the reviewed note with the team.

These are the remaining POC requirements, not a request to add accounts, wallet development, payouts or further design polish. Python remains optional and was not attempted.

## Current facts and resolved documentation conflicts

- **Hosting:** Vercel + the owner's existing Railway Hobby service/volume. Original SQLite snapshot import checksums matched; hosted owned recovery restored pages 3/5/6 and 74 sats. Render/Neon proposals are historical. [Activation](../spike/evidence/hosted-activation-2026-10-19.md), [recovery](../spike/evidence/hosted-page7-denial-2026-10-19.md).
- **Purchases:** public frontend `/health` checked 2026-10-27 returned `status:ok`, `network:main`, `paymentReady:true`, `purchasesPaused:false`. Effective admission is enabled; this does not expose the exact configured environment value. The explicit switch is `PAGESTREAM_PURCHASES_ENABLED=1` to enable, `0` to pause after redeploy. No setting was changed for this rewrite.
- **Permit:** owner-confirmed deletion of the expired permit is recorded in the [current setup guide](../deploy/vercel-railway.md). This is not a fresh remote filesystem inspection. Preserve the denied page-7 intent.
- **Receiving identity:** the hosted manifest counterparty matched the original local public identity in the hosted recovery evidence. Deployed private-key equality was not independently inspected; do not describe public metadata as that proof.
- **Costs:** 318 sats across five known debit transactions explains the recorded page/permission amounts: pages 74, grants 244. There is no separate unexplained amount in that reconciliation; it does not prove the complete wallet or cross-device history.
- **Allowance:** `walletLimitSats: 5000` requests the manifest allowance; the observed grant is wallet-managed and monthly. It is not a server-side session cap.
- **Tests:** latest full `npm test` in `spike` on 2026-11-08: **123 passed, 0 failed**, including connection/logout races, same-identity authenticated resume across restart, original-transaction delivery overlap, reader fee consent, uncertain/read-only protection and recovery. Server/client builds and client lint passed. The overlap pilot remains disabled by default; local tests do not complete live acceptance.
- **Hosting terms/cost:** the recorded decision was a private own-wallet POC on existing Railway Hobby, not a guaranteed $0 deployment or a demonstrated Vercel policy exception. The repository does not establish plan compliance; no new provider-policy determination is claimed here. See the [setup guide](../deploy/vercel-railway.md).
- **Upstream fix:** PR #124 release/legacy behavior is described as of the recorded investigation. Current release status was not rechecked in this documentation update.

## Evidence and history

[Payment/recovery](../spike/evidence/recovery-fix-2026-10-17.md) · [grant](../spike/evidence/grant-only-run-2026-10-17.md) · [shared receipt fees](../spike/evidence/shared-receipt-fees-2026-10-18.md) · [accounting bug](../spike/evidence/spending-originator-accounting-2026-10-17.md) · [latency](../spike/evidence/latency-investigation-2026-10-17.md) · [timing readiness](../spike/evidence/timing-report-readiness-2026-10-17.md) · [demo runbook](mainnet-demo-runbook.md).

The [previous acceptance document](history/project-requirements-status-before-simplification-20261027.md) is preserved unchanged. Its relative links retain their original location assumptions. Dated evidence records describe their checkpoint, not the current operating state.

Latest native pilot: page 35 succeeds in overlap mode without errors for one recorded 28-sat purchase, bringing the ledger to 924 sats. It takes **6.406 seconds**, including 2.897 seconds in remote storage acceptance and 1.464 seconds in the overlapping payer workflow. The 1.042-second 402 HTTP leg contains only 48 ms of measured app-handler work. This single pilot has not demonstrated a speed improvement; the temporary pilot target is removed in the cleanup build. C3 remains open and the next work is service-side acceptance tracing and transport/hosting investigation, not another paid cohort. [Measured breakdown](../spike/evidence/receiver-latency-investigation-2026-11-07.md#native-page-35-overlap-result).
