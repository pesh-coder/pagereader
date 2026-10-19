# Tier-1 evidence — 2026-10-15

## Completed checks

- Exact package install: SDK 2.8.11, auth middleware 2.2.9, payment middleware 2.1.9, wallet-toolbox-client 2.14.9. `package-lock.json` records artifact integrity and transitive resolution. Install audit: zero reported vulnerabilities at this run.
- `npm run build`: PASS. `npm test`: PASS, six tests. The additional signed page-3 integration check reaches the official wallet `createAction` API with a 5-sat output, then deliberately stops before creating a transaction. It verifies that the server journals the challenged prefix and creates no entitlement. No real reader payment was substituted with mocked money for an acceptance result.
- Official SDK-generated server key stored only in ignored `.env`; wallet-toolbox mainnet receiving wallet initialized successfully. Local and HTTPS health both report `paymentReady: true`, `network: main` (HTTPS check uses ngrok's skip-warning header).
- Imported Gutenberg #1661, checksum `922e2a12ccb43a4c9544c260b2166c6ad2097aeb5957faeee113f173bb857cd0`, segmenter `paragraphs-1800-v1`, 265 fixed pages. Full source and notices preserved.
- E9 local desktop browser at 1280×800: pages 1 and 2 displayed; diagnostics walletCalls=0, errors=[]; network resources were client/common JS, catalogue, pages 1–2; lazy wallet-client module was not loaded.
- E9 local phone viewport at 390×844: same result. This was desktop browser emulation, **not** BSV Browser or a physical phone.
- Screenshots: `screenshots/e9-desktop-page2.png` and `screenshots/e9-phone-viewport-page2.png`.
- Public HTTP routes with an instrumented server wallet: zero wallet calls for catalogue, preview and static app. Public page 3 denied; source/edition file was not served. Separate integration test authenticated unpaid identity/bookmark requests with official SDK throwaway signing keys and made no payment.
- Generated product BSV helpers remain unchanged. No product UI was implemented.

## Live runs not yet measured

| Experiment | Desktop | Browser / phone | Result |
|---|---|---|---|
| E9 public preview on actual devices | Ordinary desktop browser observed | User screenshot: page-2 HTTP 502, then page 2 displayed | FAIL for this run; stable retest required |
| E1 clean-origin prompts with manifest | Pending | Pending | UNRESOLVED |
| E1 clean-origin prompts without manifest | Pending | Pending | UNRESOLVED |
| E2/E3 prompts over 20 turns, scope/expiry, reopen | Pending | Pending | UNRESOLVED |
| E6 identical identity and last-displayed bookmark | Pending | Pending | UNRESOLVED |
| E4 paid click-through-display p50/p95, N=20 each | 0 samples | 0 samples | UNRESOLVED |

Prompt diary has no live entries. Both wallet app versions remain unrecorded. No server purchases or pending intents existed at the last database check. No mainnet page payment has been observed.

## Subsequent physical-phone report

The user provided three screenshots: `screenshots/phone-preview-502.png`, `screenshots/phone-page2-before-payment.png`, and `screenshots/phone-insufficient-funds.png`. Page 2 initially failed with HTTP 502, then displayed. Page 3 remained hidden after a wallet insufficient-funds error (10 more sats reported at that step, plus additional fees). Wallet app/version and all native prompt counts are still unknown. No successful paid-turn timing is available.

A read-only database check after this report found zero purchases and one page-3 challenged intent without a txid. Live HTTPS health reports mainnet/payment-ready and public page 2 currently returns 200. C1 is recorded FAIL for the observed zero-error-target breach, pending a clean retest. The earlier 502 cause is not established. Funding the reader alone will not clear the conservative pending-intent guard. Preserve the intent and reconcile/recover before another payment attempt; no database reset or automatic reissue was performed.

## Live resumption — 2026-10-16

The reader reports acquiring sats, closing every old Pagestream tab, and checking wallet history: no page-payment transaction. Server state still showed zero purchases and one challenged page-3 intent with no txid. An operator-only repair archived this exact failed challenge and recovery reason in `intent_recoveries`, then removed only that row. Purchases, replay claims and bookmarks were preserved. This relies on the documented insufficient-funds failure plus the reader's closed-tab/history confirmation, not merely the absence of a server receipt. No ambiguous transaction was retried or timed out.

Build PASS; tests PASS (eight), including refusal to recover submitted/owned/stale attempts and preservation of the archived challenge/unrelated purchases. This bounded repair is not the general retry/race experiment and provides no C6 pass.

The stopped receiving server and ngrok tunnel were restarted at the same HTTPS origin, preserving the server key, edition and grant origin. Request inspection is disabled on the tunnel. Health reports mainnet/payment-ready and free page 2 returns HTTP 200. Reader was asked to request page 3 once and stop, reporting all wallet prompts and any error. Paid outcome and wallet versions remain pending.

The resumed run subsequently created a new page-3 challenge. At the latest check, it remains `challenged`, with no submitted txid or purchase. This is an in-progress wallet step, not a successful payment or a latency/prompt-count measurement. The automated HTTPS browser also displayed page 1 with zero recorded wallet calls, no application errors, and no loaded wallet module. Live server/tunnel remain running for the reader's next observation.

The reader subsequently reported the same insufficient-funds message despite adding sats (10 more sats needed, total 10, plus input-spending fees). Server state is still challenged/no txid, with zero purchases. Do not infer zero total reader-wallet spending from server records; permission transactions may be separate. The exact wallet app, displayed balance and incoming-transfer state were requested before further payment attempts. No second operator recovery or purchase reissue was performed.

The diagnostic client now records the failed wallet method, error code/name and funding shortfall when exposed by the wallet; acquisition/network failures are also recorded. The visible diary diagnostics include `lastFailedWalletCall` and recent method results, including history already saved in this tab. This requires refreshing the static client, not another paid attempt. No extra wallet probes or balance calls were added to free pages. Pinned reference implementation can mint one-satoshi permission outputs using its underlying wallet; this makes permission setup a possible failure stage, not a confirmed explanation for the reported 10-sat error.

Reader funding clarification: BSV Browser on the phone displays 0 sats; **BSV Desktop** on the computer holds the sats. Phone and desktop public identities have not been compared, so C8 remains UNRESOLVED. The next paid probe is Desktop. Same-server check: mainnet/payment-ready, zero purchases, one challenged phone intent with no txid. No additional recovery was performed.

## Payment incident — paid runs now stopped

Later Desktop evidence supersedes the earlier zero-purchase/pending outcome above: page 3 successfully displayed after a confirmed 5-sat receipt. Its on-chain input/output data verifies a 57-sat miner fee and a 62-sat net debit. Reader additionally reports two 62-sat debits after delayed approval without content. Page 4 has a challenged intent without a server-submitted txid; the failed transactions still require reader evidence. Separate protocol/spending prompts are visible in supplied screenshots. Full findings, sources, containment, limitations and required next actions are in `payment-incident-2026-10-16.md`.

New real-money purchase challenges are blocked by a persistent server pause marker and client paused state. Existing records were preserved; no new reader wallet call/payment was made during diagnosis. Build PASS; tests PASS (11), including real recorded transaction fee calculation, unknown-fee behavior and pause/owned-read isolation. This does not establish live retry correctness. C2 and C4 are FAIL on current evidence; C6 is FAIL for user-reported repeated charged/undelivered behavior, pending transaction reconciliation. Do not resume the earlier run instructions or clear another intent.

Subsequent wallet-history clarification supersedes the C6 classification above: reader identified a 239-sat protocol grant and the one confirmed 62-sat page payment; another 62-sat debit remains unlocated. Public chain data verifies 238 fee + 1 permission output for the grant, and 57 fee + 5 recipient payment for the page. Total identified wallet-history debit is 301 sats; only 5 went to Pagestream. C6 is **UNRESOLVED**, since a duplicate page payment is not established and controlled retry/race tests remain undone. C2/C4 remain FAIL. The pause stays active.

## Setup and tooling observations

ngrok 3.39.9 provides the temporary HTTPS origin documented in README. Its free first-visit interstitial must be passed in a browser; wallet manifest fetches must be checked for JSON rather than intermediary HTML. The first preview navigation ran before the local server was ready and returned connection refused; subsequent localhost browser runs succeeded. Later the T3 preview host disconnected and explicitly reported unavailable, so no live native wallet prompts have been observed through automation.

The plan's 23-page setup cannot provide two disjoint 20-new-purchase cohorts with the same restored identity. The harness exposes through page 43 of the same edition; planned cohorts are 3–22 and 23–42. Existing entitlements are preserved. No acceptance threshold is changed.

## Reader milestone checkpoint — 2026-10-17

Reader design approved and implemented at `/reader/` on the same localhost:3108 origin. Library now includes eight handoff titles, of which only Holmes has the existing paged/payment backend; seven are explicitly opening excerpts. New purchases remain paused and no new live payment was made. Local production builds, lint and 26 tests PASS; public-browser pages 1–2 and delayed-response retention PASS. Overall criteria remain C1/C2/C4 FAIL and C3/C5/C6/C7/C8/C9/C10/C11 UNRESOLVED. See [the current criterion ledger](../../docs/reader-milestone-1.md). Earlier setup-state statements above are historical and superseded by the later recovery evidence.
