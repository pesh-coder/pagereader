# Pagestream: acceptance and remaining work

Updated 2026-11-07. **The POC is not complete.** The [learnings note](../LEARNINGS.md) explains the implementation; this file tracks whether it meets the brief. The original acceptance targets are retained, including where the observed wallet behavior conflicts with them.

**Current checkpoint:** all four previously unproven phone/funding transactions now have 701 confirmations on WhatsOnChain and `MINED` on Arcade. The two phone debit proof endpoints return 200. The mining blocker is closed. All 16 hosted public previews passed wallet-free HTTP checks; the physical-phone disconnected test is still open. Source/schema audit closes C7 (no account), and actual mainnet payments on both wallets close C9. These narrow passes do not complete session approval, paid latency, same-identity resume or the final demo. [Evidence](../spike/evidence/acceptance-check-2026-11-07.md).

**Agreed pricing:** keep the seller's price at 5 sats per new page; the reader pays miner fees on top, with the total visible. Use the maintainer-recommended 100 sats/kB for this POC; a processor's lower acceptance minimum does not establish timely mining. Desktop returned to 250 after restoration and the user was advised to set 100 again and restart; that latest setting has not been observed by the agent. Baseline wallet/reader debits match: Desktop 74 sats, phone page 28 sats, plus a separate phone grant of 199. Broader pending/recovery accounting is still open. The app defaults to a 1-sat fee cap and offers an explicit higher-fee approval per page attempt; a suitable bounded fee-consent policy is still needed for seamless turns.

**Approval requirement retained, 2026-11-02:** the user reiterated the original brief. Keep one wallet approval per session and a wallet-managed session limit. The observed 5,000-sat monthly allowance is not accepted as a replacement; C2 remains unmet. Closing a tab stops app purchases but does not establish expiry or revocation of a saved wallet permission. Do not substitute a server-side/sessionStorage budget or a monthly grant for native session behavior. Investigate supported wallet session controls within the install-only wallet scope; if unavailable, report the stack gap rather than modify wallets or mark acceptance complete. The independent paid-page p95 target remains 500 ms.

The [senior review R1 checklist](review-feedback-r1.md) records the reader, recovery, source-byte and production-route changes. Hosted feature checks now show the review features, but full real-wallet verification remains open. Removing repeated app confirmations does not satisfy native one-prompt acceptance. Tests of receiver merges simulate the receiving wallet; native duplicate-import behavior still needs verification.

**Hosted/device checkpoint, 2026-10-29:** the delivered reader includes the review features, production research routes return 404, and all 16 public preview pages pass from the agent environment. Health reports mainnet, payment-ready and purchases enabled. The user reports Desktop 3.3.1 and Browser 1.6.3 with different identities; independent wallet testing can proceed, while same-identity resume remains unverified. The phone screenshot exposed bottom navigation covered by browser/system bars. A responsive layout fix passes local portrait/landscape checks; physical-phone retest remains open. See [hosted readiness and device checks](../spike/evidence/hosted-readiness-2026-10-29.md). None of the full acceptance statuses below are upgraded.

## The brief's “Done when” checklist

| Requirement | Current result |
|---|---|
| Six-step story live in about 90 seconds, mainnet | Not rehearsed end to end |
| Desktop and Browser, including cross-device bookmark | Purchases and baseline debit reconciliation work on both; phone purchase is now mined. Same-identity cross-device resume and subsequent paid turns remain open |
| Wallet prompts once per session | Not met: observed saved grant is monthly, with initial separate prompts; one subsequent Desktop turn was prompt-free |
| Underpaid/replayed requests refused | Local coverage passes; existing-proof live-local replay checks pass; full native negative cases remain |
| Learnings written and shared | Rewritten for review; repository publication was authorized previously, but team delivery/receipt is not confirmed |

## Detailed acceptance register

FAIL means an observed miss remains open. UNRESOLVED means the complete acceptance evidence is missing; neither label erases a narrow implementation pass.

| Criterion | Status | Evidence and what remains |
|---|---|---|
| C1 Free browsing/previews, no wallet or errors on both devices | UNRESOLVED | Eight books and two public pages each; hosted 16-page checks pass. Phone navigation was fixed and the user reached paid page 3. A clean disconnected-wallet phone preview test is still needed to close the earlier failure. |
| C2 One native prompt through first visit and 20 paid turns | FAIL | Grouped 5,000/month grant cost 5 sats; next page had zero prompts. Session scope is not met; clean-origin cohorts on both wallets are missing. |
| C3 Paid page p95 ≤500 ms, 20 turns per wallet | UNRESOLVED | One paid sample: 9.01 s HTTP, 47.33 s request-to-frame marker. No qualifying cohort. Diagnose/optimize and measure; warm owned reads do not count. |
| C4 Accurate always-visible spend | UNRESOLVED | Baseline comparison passes: Desktop wallet matches 3 page payments totaling 74; phone wallet debit matches the 28-sat reader total, with a separate 199-sat grant. Phone funding/debits reconcile to 6,773. Broader uncertain-payment and same-identity cross-device accounting remain open; wallet allowance accounting is tracked under C2. Neither recorded debit nor server acceptance proves mining. |
| C5 Underpay 400; wrong-page/identity replay 409 | UNRESOLVED | Local tests pass; existing-proof wrong-page/edition live-local requests returned 409. Native mainnet underpayment/cross-identity evidence remains. |
| C6 Exactly one charge per page, including lost delivery/two tabs/two devices | UNRESOLVED | Durable proof recovery and local fault/race coverage pass. The local receiver fixture now recovers after acceptance/receipt failure and SQLite restart using the original server proof. Actual receiving-wallet duplicate-import behavior, newly charged live lost delivery and native races remain. |
| C7 No signup/email/password/card/profile | PASS | Active reader entry, components, wallet helper, payment routes and SQLite schema audited on 7 November; only the wallet's public identity keys purchases/bookmarks, with no account forms or fields. Both existing device purchase observations support the source audit. |
| C8 Same identity and displayed bookmark on phone | UNRESOLVED | Desktop Resume and hosted owned recovery work without purchasing. User confirms Desktop and Browser have different identities and accepts independent testing. That does not complete same-identity cross-device resume. |
| C9 Mainnet on both wallets | PASS | Three Desktop mainnet purchases previously verified; Browser page 3 opens and its matching 28-sat transaction is now independently confirmed mined. This closes mainnet use on both, not the separate prompt, timing, race or cross-device requirements. |
| C10 Six-step story in ~90 seconds | UNRESOLVED | HTTPS reading is hosted; phone wallet/shortcut checks, leave-mid-chapter observation and timed rehearsal remain. |
| C11 Learnings written/shared | UNRESOLVED | Short note now written; team sharing not confirmed. |

## Work still needed

**Implementation or stack gaps**

- Meet the retained session approval requirement through supported wallet behavior. The monthly grant is a documented gap, not a session pass; no wallet modification is in scope.
- Validate supported allowance enforcement and legacy port-labelled spending. Reader accounting does not repair the wallet's limit query.
- Investigate and improve paid-page latency. The current deliberate no-paid-prefetch design avoids charging for unread pages; it has not met 500 ms.
- Finish permission-cost provenance and uncertain cross-device spend accounting, then verify the visible total on both devices.
- Address defects exposed by the remaining native recovery/race and phone tests. Do not assume missing evidence automatically requires new features.

**Live checks still needed**

- Browser's existing page purchase, debit and mining status are reconciled; same-wallet owned-page reopening was observed. Refresh the local wallet proof/status, then establish supported identity continuity for the cross-device story. Current identities differ.
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
- **Tests:** latest full `npm.cmd test` in `spike` on 2026-11-02: **84 passed, 0 failed**, including broadcast-result preservation and original-proof diagnostics. Type checks and client build/lint passed. Earlier counts are historical. No tests were rerun for this documentation/read-only update; local tests do not complete live acceptance.
- **Hosting terms/cost:** the recorded decision was a private own-wallet POC on existing Railway Hobby, not a guaranteed $0 deployment or a demonstrated Vercel policy exception. The repository does not establish plan compliance; no new provider-policy determination is claimed here. See the [setup guide](../deploy/vercel-railway.md).
- **Upstream fix:** PR #124 release/legacy behavior is described as of the recorded investigation. Current release status was not rechecked in this documentation update.

## Evidence and history

[Payment/recovery](../spike/evidence/recovery-fix-2026-10-17.md) · [grant](../spike/evidence/grant-only-run-2026-10-17.md) · [shared receipt fees](../spike/evidence/shared-receipt-fees-2026-10-18.md) · [accounting bug](../spike/evidence/spending-originator-accounting-2026-10-17.md) · [latency](../spike/evidence/latency-investigation-2026-10-17.md) · [timing readiness](../spike/evidence/timing-report-readiness-2026-10-17.md) · [demo runbook](mainnet-demo-runbook.md).

The [previous acceptance document](history/project-requirements-status-before-simplification-20261027.md) is preserved unchanged. Its relative links retain their original location assumptions. Dated evidence records describe their checkpoint, not the current operating state.
