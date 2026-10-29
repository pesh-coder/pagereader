# Pagestream: acceptance and remaining work

Updated 2026-10-29. **The POC is not complete.** The [learnings note](../LEARNINGS.md) explains the implementation; this file tracks whether it meets the brief. The original acceptance targets are retained, including where the observed wallet behavior conflicts with them.

The [senior review R1 checklist](review-feedback-r1.md) records the local reader, recovery, source-byte and production-route changes. These have not been deployed or verified with the real wallets. Removing repeated app confirmations does not satisfy native one-prompt acceptance. Tests of receiver merges simulate the receiving wallet; native duplicate-import behavior still needs verification.

## The brief's “Done when” checklist

| Requirement | Current result |
|---|---|
| Six-step story live in about 90 seconds, mainnet | Not rehearsed end to end |
| Desktop and Browser, including cross-device bookmark | Desktop purchases and hosted owned-page recovery observed; no successful phone payment or identity-match/resume check |
| Wallet prompts once per session | Not met: observed saved grant is monthly, with initial separate prompts; one subsequent Desktop turn was prompt-free |
| Underpaid/replayed requests refused | Local coverage passes; existing-proof live-local replay checks pass; full native negative cases remain |
| Learnings written and shared | Rewritten for review; repository publication was authorized previously, but team delivery/receipt is not confirmed |

## Detailed acceptance register

FAIL means an observed miss remains open. UNRESOLVED means the complete acceptance evidence is missing; neither label erases a narrow implementation pass.

| Criterion | Status | Evidence and what remains |
|---|---|---|
| C1 Free browsing/previews, no wallet or errors on both devices | FAIL | Eight books and two public pages each; desktop/local checks pass. Retest the phone's prior free-page HTTP 502 and verify no wallet calls. |
| C2 One native prompt through first visit and 20 paid turns | FAIL | Grouped 5,000/month grant cost 5 sats; next page had zero prompts. Session scope is not met; clean-origin cohorts on both wallets are missing. |
| C3 Paid page p95 ≤500 ms, 20 turns per wallet | UNRESOLVED | One paid sample: 9.01 s HTTP, 47.33 s request-to-frame marker. No qualifying cohort. Diagnose/optimize and measure; warm owned reads do not count. |
| C4 Accurate always-visible spend | FAIL | Confirmed receipt fees persist across browsers: 15 page sats + 59 fees = 74. Wallet allowance counted only 6; permission and uncertain cross-device costs remain incomplete. |
| C5 Underpay 400; wrong-page/identity replay 409 | UNRESOLVED | Local tests pass; existing-proof wrong-page/edition live-local requests returned 409. Native mainnet underpayment/cross-identity evidence remains. |
| C6 Exactly one charge per page, including lost delivery/two tabs/two devices | UNRESOLVED | Durable proof recovery and local fault/race coverage pass. The local receiver fixture now recovers after acceptance/receipt failure and SQLite restart using the original server proof. Actual receiving-wallet duplicate-import behavior, newly charged live lost delivery and native races remain. |
| C7 No signup/email/password/card/profile | UNRESOLVED | Source/schema use identity keys without account fields. Complete two-device flow audit remains. |
| C8 Same identity and displayed bookmark on phone | UNRESOLVED | Desktop Resume and hosted owned recovery work without purchasing. Actual phone identity match and resume remain. |
| C9 Mainnet on both wallets | UNRESOLVED | Three Desktop page receipts verified; no successful Browser payment. |
| C10 Six-step story in ~90 seconds | UNRESOLVED | HTTPS reading is hosted; phone wallet/shortcut checks, leave-mid-chapter observation and timed rehearsal remain. |
| C11 Learnings written/shared | UNRESOLVED | Short note now written; team sharing not confirmed. |

## Work still needed

**Implementation or stack gaps**

- Resolve the session-vs-monthly approval requirement: establish supported wallet behavior or explicitly agree a changed demo requirement. A monthly grant is not a session pass. No wallet modification is in scope.
- Validate supported allowance enforcement and legacy port-labelled spending. Reader accounting does not repair the wallet's limit query.
- Investigate and improve paid-page latency. The current deliberate no-paid-prefetch design avoids charging for unread pages; it has not met 500 ms.
- Finish permission-cost provenance and uncertain cross-device spend accounting, then verify the visible total on both devices.
- Address defects exposed by the remaining native recovery/race and phone tests. Do not assume missing evidence automatically requires new features.

**Live checks still needed**

- Fund/use BSV Browser with the intended wallet identity; compare public identity keys and verify phone purchase, owned-page resume and bookmark continuity.
- Retest wallet-free previews on the phone; observe prompt count, scope, cost and allowance consumption on both wallets.
- Collect 20 distinct paid-page samples per wallet, preserving slow/failed samples; verify underpayment, replay, lost response and concurrent purchases.
- Close the tab mid-chapter and confirm no additional purchases start. An already-submitted transaction may finish after close; closing cannot cancel it.
- Rehearse the six-step mainnet story in about 90 seconds, then share the reviewed note with the team.

These are the remaining POC requirements, not a request to add accounts, wallet development, payouts or further design polish. Python remains optional and was not attempted.

## Current facts and resolved documentation conflicts

- **Hosting:** Vercel + the owner's existing Railway Hobby service/volume. Original SQLite snapshot import checksums matched; hosted owned recovery restored pages 3/5/6 and 74 sats. Render/Neon proposals are historical. [Activation](../spike/evidence/hosted-activation-2026-10-19.md), [recovery](../spike/evidence/hosted-page7-denial-2026-10-19.md).
- **Purchases:** public frontend `/health` checked 2026-10-27 returned `status:ok`, `network:main`, `paymentReady:true`, `purchasesPaused:false`. Effective admission is enabled; this does not expose the exact configured environment value. The explicit switch is `PAGESTREAM_PURCHASES_ENABLED=1` to enable, `0` to pause after redeploy. No setting was changed for this rewrite.
- **Permit:** owner-confirmed deletion of the expired permit is recorded in the [current setup guide](../deploy/vercel-railway.md). This is not a fresh remote filesystem inspection. Preserve the denied page-7 intent.
- **Receiving identity:** the hosted manifest counterparty matched the original local public identity in the hosted recovery evidence. Deployed private-key equality was not independently inspected; do not describe public metadata as that proof.
- **Costs:** 318 sats across five known debit transactions explains the recorded page/permission amounts: pages 74, grants 244. There is no separate unexplained amount in that reconciliation; it does not prove the complete wallet or cross-device history.
- **Allowance:** `walletLimitSats: 5000` requests the manifest allowance; the observed grant is wallet-managed and monthly. It is not a server-side session cap.
- **Tests:** `npm.cmd test` in `spike` on 2026-10-29: **75 passed, 0 failed**. Client build/lint and server/spike build pass. Earlier 59/62/63 counts are historical. Local tests do not complete live acceptance.
- **Hosting terms/cost:** the recorded decision was a private own-wallet POC on existing Railway Hobby, not a guaranteed $0 deployment or a demonstrated Vercel policy exception. The repository does not establish plan compliance; no new provider-policy determination is claimed here. See the [setup guide](../deploy/vercel-railway.md).
- **Upstream fix:** PR #124 release/legacy behavior is described as of the recorded investigation. Current release status was not rechecked in this documentation update.

## Evidence and history

[Payment/recovery](../spike/evidence/recovery-fix-2026-10-17.md) · [grant](../spike/evidence/grant-only-run-2026-10-17.md) · [shared receipt fees](../spike/evidence/shared-receipt-fees-2026-10-18.md) · [accounting bug](../spike/evidence/spending-originator-accounting-2026-10-17.md) · [latency](../spike/evidence/latency-investigation-2026-10-17.md) · [timing readiness](../spike/evidence/timing-report-readiness-2026-10-17.md) · [demo runbook](mainnet-demo-runbook.md).

The [previous acceptance document](history/project-requirements-status-before-simplification-20261027.md) is preserved unchanged. Its relative links retain their original location assumptions. Dated evidence records describe their checkpoint, not the current operating state.
