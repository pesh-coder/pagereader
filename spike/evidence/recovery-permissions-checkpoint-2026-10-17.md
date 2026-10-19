# Recovery and permissions checkpoint — 2026-10-17

No native wallet calls, new payment challenges or mainnet transactions were initiated in this checkpoint. The existing server key, database, browser journals and intents were preserved. New purchases remain paused.

## Current instruction and running state

The user subsequently instructed: **use `npm run dev` and the browser; avoid ngrok**. The tunnel started during this checkpoint was stopped (port 4040 no longer listening). Current development uses `npm run dev` from `spike/`, serving http://localhost:3108/reader/. The server retains its existing ignored environment file; the startup label may still mention the old configured `PUBLIC_ORIGIN`, but no tunnel is running. Keep future work local unless the user changes this instruction. HTTPS results below are historical checks, not a current link.

### Earlier checkpoint observations

Local browser follow-up after the user's instruction: the collaborative preview loaded the library and reopened Holmes at its saved page 2. At 390×844, Previous displayed page 1 and the free Next displayed page 2; navigation completed, no horizontal overflow, no wallet resources and no authenticated API resources loaded. The displayed-page bookmark returned to page 2. Snapshot and focused click tools failed; DOM inspection and interaction through the same preview's evaluate tool succeeded. No screenshot/physical phone/native wallet pass is claimed. `npm run dev` is running (observed server PID 22252); latest local preflight `runs/recovery-preflight-1792248177458.json` passed and showed the same preserved database counts, pause present, no permit.

- Mainnet backend restarted on port 3108 with the existing key/database after the replay response fix. `/health`: ready, mainnet, purchases paused. No `LIVE_PAYMENT_PROBE.json` exists.
- HTTPS restored at **https://subrigid-chaya-unsecularized.ngrok-free.dev/reader/** using ngrok PID 15796. It forwards to 3108; the backend was restarted as PID 24552. These are observed process IDs, not permanent configuration.
- Public HTTPS reader HTML, health, catalogue, both free pages and wallet manifest returned HTTP 200. Manifest returned JSON and the configured allowance from `src/config.ts`. The ngrok skip-warning header was used for API verification; actual phone/wallet fetches and first-visit interstitial behavior still need inspection.
- The HTTPS and server processes must remain running. A successful HTTP check does not prove physical phone installation, native wallet transport, or continued availability.
- Collaborative preview opened the local reader; DOM inspection showed its heading and no wallet resources. Snapshot failed twice. HTTPS navigation failed in automation and subsequent DOM inspection was empty; no HTTPS visual/browser pass is claimed.
- Port 3110 remains the old simulated design review.

## Preserved recovery state

`npm run preflight:recovery` uses public GET routes and a read-only SQLite connection, imports neither wallet code nor `.env`, and writes only a new ignored evidence JSON file. It exports no payment proof bytes, reader identity keys, bookmarks or secrets. For HTTPS:

```powershell
# From spike/
npm run preflight:recovery -- https://subrigid-chaya-unsecularized.ngrok-free.dev
```

Latest checkpoint at 14:37:58 UTC: all preflight checks passed. Two identities appear in four preserved intents: a challenged page 3 for one identity, plus confirmed page 3, challenged page 4 and confirmed page 5 for the other. These are distinct identity-scoped rows, not duplicate charges for page 3. Two purchases (pages 3 and 5), two replay claims and one stored proof remain. The page-5 txid remains `9d39cbd7092be278ffef053bfe349d2eb8ab6fc44cc006c1572cd583e56a47fe`. Historical records have not been repaired, expired or reset.

Ignored evidence: `runs/recovery-preflight-1792247878712.json` (HTTPS), `runs/recovery-preflight-1792247759718.json` (local). No inference about native allowance or current wallet balance follows from these checks.

## Local payment checks

Added `test/payment-acceptance.test.ts` using synthetic SDK-signed transactions, an in-memory database and a stub receiver. It uses neither a native wallet nor a network provider/broadcaster.

1. A four-sat output returns **400 / ERR_INVALID_PAYMENT** before receiver internalization; no purchase/replay claim is granted. The submitted invalid attempt remains recorded and a new request cannot replace it.
2. A recorded transaction replayed under another authenticated identity, with that identity's matching legitimate intent prefix, returns **409** before receiver internalization. The original purchase survives and no second proof/transaction binding is stored. Previously this conflict was caught as malformed input (400); a typed store conflict now preserves the expected 409 response.
3. While one client's synthetic approval is blocked, an independent authenticated client using the same identity receives **409 without a challenge**. Releasing the original approval after enabling the pause completes its original submission. Exactly one synthetic action, one receiver call and one purchase result. Owned reread adds no action.

Spike build PASS; **31/31 local tests PASS**. Log: ignored `runs/local-acceptance-2026-10-17.log`. These establish local middleware/intent behavior, not native delayed approval, two physical devices or mainnet acceptance.

## Next controlled experiment (prepared, not run)

First collect local recovery and permission evidence using already-owned pages, without opening a spending permit. The phone/HTTPS step below is deferred by the subsequent local-only instruction:

1. Keep the pause marker. Record Desktop application version, origin and existing permission UI before doing anything that could change a grant. Do not revoke grants or switch the origin to manufacture a clean run.
2. On the existing Desktop localhost origin, use the reader's owned-page recovery path for page 5. It must check status and use `/api/owned/5`, returning the existing txid. Reload and repeat from a second tab. Keep the current text visible while the response is outstanding. Record native prompts, displayed page, server receipt and independently saved bookmark.
3. If the wallet asks to create/save a protocol grant or spending allowance, stop before approving it and record its wording/options/cost. A read-only app request can still provoke a native permission flow. No new grant expenditure is authorized by this experiment description.
4. **Deferred (user requires local testing without ngrok).** On the phone, open a future separately agreed reachable reader origin and verify pages 1–2 without wallet calls or errors. Record BSV Browser version and installation/shortcut behavior. Explicit identity acquisition/owned recovery is a separate user action: compare public identity keys locally, never recovery words. If keys differ, stop the paid-resume test; do not fund or reset anything. An owned read requires the same identity, and an origin change can affect permission scope.
5. Inspect the native grant UI and export the probe diary if used. Record origin, wallet version, prompt type, exact allowance shown, ordinary/standing/one-time choice, expiry, calendar-month accounting, fees/setup costs, and behavior after close/reopen. Leave unknown fields UNRESOLVED. The configured amount is not evidence of a native grant.

Only after that evidence is reviewed should a **separately explicitly authorized** single new-page delayed-approval run be proposed. Bind a permit to one checked unowned/unreserved page and exact identity/edition/request ID; use the existing fee cap and saved-proof flow. Record every native prompt and any separate grant cost before approving. A timeout must retain the original attempt; no replacement, reset or automatic second action. A full ~5,000-sat allowance/20-turn study requires its own scoped authorization and cost review; this checkpoint does not grant it.

## C1–C11

No overall criteria upgraded: **C1/C2/C4 FAIL**; **C3/C5/C6/C7/C8/C9/C10/C11 UNRESOLVED**. C5/C6 gained local regression evidence only. C11's note is ready, but no external team message was sent.

## Authorized browser owned-resume check — 14:48–14:50 UTC

After the user agreed to the proposed recovery check, the local browser acquired a wallet and checked existing ownership while the global pause remained active. No native approval was clicked and no one-run permit was created. This section records wallet authentication calls; it is separate from the earlier no-wallet preflight.

- Entered via the paused **Check existing purchase** action on page 3, then selected owned page 5. The original page-2 text remained visible while Confirming. `/api/status/3`, `/api/owned/3`, `/api/status/5` and `/api/owned/5` returned 200. Page 5 displayed **11 paragraphs**, marked Owned, with the original `9d39cbd7092be278ffef053bfe349d2eb8ab6fc44cc006c1572cd583e56a47fe` receipt.
- Reloaded the first tab. The library offered **Continue · page 5**. Reopening recovered the same page, paragraph count and receipt.
- Opened an independent second tab on the same local origin. It also offered Continue at page 5 and recovered the same page/receipt. Both runs completed navigation without errors or horizontal overflow (390px and 1280px widths).
- The displayed-page bookmark advanced through the displayed pages and ended at page 5; authenticated `PUT /api/bookmarks` returned 200. No purchase/intent record was reset.
- Browser fetch instrumentation logged path/method/status only, plus owned receipt metadata. Guards for the reload/second-tab checks refused spending API paths on any substrate and all `/api/pages/` routes. No guard was hit. Observed calls include auth/key/HMAC/signature verification and independent bookmark writes; **zero createAction/signAction/internalizeAction calls and zero paid-page requests**. Initial substrate negotiation probed 3321 and selected a wallet HTTP substrate at 2121; this alone does not establish the wallet application version or complete native prompt behavior.
- Local preflight still passed: two purchases, four intents, two replay claims, one stored proof, global pause present and no permit. Ignored evidence: `runs/owned-browser-resume-2026-10-17.json` and `runs/recovery-preflight-1792248572733.json`.

**Narrow result: owned-page rendering and same-browser paid resume after reload/in a second tab PASS.** No new page payment was created. Native grant UI/costs, complete prompt observation and the actual allowance remain UNRESOLVED; no general no-cost claim is inferred for wallet-internal permissions. This did not test a charged-but-lost response, simultaneous new purchases, two physical devices or cross-device bookmark discovery. Overall C1–C11 statuses remain unchanged.
