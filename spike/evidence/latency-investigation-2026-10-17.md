# Latency investigation — no new spending, 2026-10-17

## Outcome

The wallet attribution issue remains diagnosed and reproduced, not repaired. This work advances requirement 3 independently while purchases stay paused. New timing instrumentation is implemented and validated. Three real **owned-page reads**, with payment/grant/bookmark methods blocked, distinguish cold client-wallet overhead from warm reads. They are not paid-page samples, a product-render benchmark, or a p95 acceptance pass.

| Owned page-6 read | Authenticated response/body | Server processing | DB | Receiving-wallet acceptance |
|---|---:|---:|---:|---:|
| First read in new auth session | 2,280.4 ms | 17.44 ms | 0.205 ms | 0 ms |
| Second read | 67.6 ms | 15.26 ms | 0.145 ms | 0 ms |
| Third read | 59.6 ms | 12.33 ms | 0.104 ms | 0 ms |

The first request includes the BRC-103 handshake (HTTP375.7 ms) and a measured native `verifyHmac` call of 1,734.3 ms, despite its owned-page HTTP response headers arriving in34.7 ms. Generated acquisition happened before those samples and took1,069.9 ms, with a separate32.3 ms getNetwork. The two subsequent samples show a warm owned-read path below100 ms here. This narrows the first-read delay to client-wallet/session processing; it does not prove why the native call was slow or predict future paid latency. No authentication was moved into the first two free pages to warm the wallet.

The earlier actual paid page6 evidence remains unchanged: wallet prepare169.3 ms, sign57 ms, same-transaction broadcast1,411.6 ms, total payment workflow1,647.6 ms; paid HTTP response9,012.6 ms; request-to-double-frame marker47,328.4 ms. The broadcast call alone exceeded500 ms in that sample. Its original server response timing fields were not retained, so we cannot retrospectively attribute the full9 seconds to receiving-wallet internalization, crypto, storage or other processing. The raw slow sample is retained; no acceptance upgrade or post-hoc exclusion is made.

An independent browser callback observation, performed without payment, saw two animation-frame callbacks at0.4/1.4 ms with document visibility visible and focus false. This is a callback observation, not a physical-display measurement. It does not explain the old long frame wait. Browser background/automation scheduling remains a possible contributor, not an established cause.

## Changes

- Server responses now carry numeric auth, total server-wallet, raw receiving internalization, atomic receipt commit, DB and total server timings. Existing internalizeMs is retained for compatibility. `Server-Timing` mirrors the relevant measurements. These spans overlap: do not add them as exclusive stages. No keys, identity or proof bytes are exposed by timing fields.
- Wallet transport evidence captures Server-Timing at the raw fetch boundary. A focused regression exposed that SDK AuthFetch reconstructs authenticated responses and filters custom headers; body timings remain available, but transport is the correct header-capture point.
- The one-page operator runner now persists response-received time, server timing and DOM-update time **before** awaiting browser frame callbacks, so a future scheduling stall cannot hide delivery evidence. It remains single-shot and cannot be reused to buy another page.
- `/latency-profile.js` has no automatic entry point. It requires the original delivered page6 journal and matching identity/receipt, reads owned page6 three times, and blocks payment creation. Browser transport additionally blocked all wallet action/grant methods, other API paths and bookmark writes. No blocked calls occurred.

Payment order is unchanged: unsigned noSend → actual fee check → sign noSend → durable original proof → broadcast same transaction → server acceptance → paid content. No delayed-broadcast relaxation, paid prefetch, replacement intent or early text reveal was introduced to reduce a benchmark.

## Running state and evidence

The old dev process22564 was verified and stopped only after purchase pause/no permit and completed journals were established. Its SQLite, wallet key and browser state were retained. PowerShell's npm wrapper stripped the optional manifest flag on the first launch; that exact process was stopped and the corrected `npm.cmd run dev -- --local-wallet-manifest` launch restored both listeners. Current node process19440 listens on3108 and127.0.0.1:80, run session3685. No ngrok process was started. The startup banner still reflects a legacy PUBLIC_ORIGIN environment setting; actual browser/profile requests use http://localhost:3108, and that legacy origin variable is only used for validation/banner in server.ts.

The fresh browser tab6 shares the existing localhost journals. Read-only profile ran18:11:18–18:11:22 UTC. Three owned responses match the page6 receipt and11 paragraphs. Browser records show only acquisition, network and authentication crypto calls, plus health/auth/owned routes; no createAction, signAction, internalizeAction, waitForAuthentication, paid-page request or bookmark write occurred. No new grant was approved. Post-work preflight confirms three existing purchases, five intents, three replay claims, two stored proofs, pause present and no live permit.

Evidence: `runs/owned-latency-profile-2026-10-17.json`, `runs/display-frame-observation-2026-10-17.json`, `runs/recovery-preflight-1792260734207.json`, `runs/latency-instrumentation-suite.log`.

Validation: spike build PASS, client build/lint PASS, **44/44 local tests PASS**. New synthetic delayed-receiver regression confirms the delay is captured separately, receipt still commits before delivery, and owned reread does not create/internalize another transaction. No mainnet acceptance is inferred from synthetic timings.

## Remaining gate

Resolve wallet grant/action/query originator attribution before trusting allowance enforcement. Paid p95 remains UNRESOLVED: no20-turn cohorts in both wallets. The next paid run, if later authorized, must retain the new stage timings and failed/cold samples, use an unowned edition/page, preserve the exact proof/intent, and have an explicit spend scope. No such run is authorized here. Cross-device requirements also remain incomplete. Overall C1/C2/C4 FAIL; C3/C5/C6/C7/C8/C9/C10/C11 UNRESOLVED.
