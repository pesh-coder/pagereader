# Single page-6 allowance experiment — 2026-10-17

## Final purchase result — narrow PASS, prompt/counter inspection pending

### Native prompt observation

### Spending-counter observation clarified

Read-only source investigation: Desktop v3.1.1 `src/lib/components/SpendingAuthorizationList.tsx` defines an in-memory cache keyed by app/profile. Its refresh function displays cached values and then calls `listSpendingAuthorizations`/`querySpentSince`; a mount effect runs refresh, while the other explicit refresh trigger observes the spending-request queue becoming empty. Source comments explicitly acknowledge stale figures from prompt-free spends. This makes a stale view a plausible explanation and justifies backing out/reopening the hostname-only Spending view once; it is not proof that this user's result is a cache issue. Reference manager 2.14.9 `querySpentSince` sums monthly originator-labeled action net satoshis, with no explicit status filter in that method; underlying storage filtering/actual Desktop 2.14.5 behavior still needs verification. Do not infer unproven status is the cause merely from the history entry.

Source: https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/src/lib/components/SpendingAuthorizationList.tsx . No external wallet request, setting change or extra spend was initiated during source review.

The user subsequently confirmed the hostname-only **localhost** Spending entry **still shows 6 sats spent**, rather than an absent counter. Thus the observed native counter stayed **6→6** while the measured wallet-history delta and public transaction show a new **6-sat** page-6 debit. No native prompt appeared and no extra grant debit occurred. This is an observed discrepancy, not proof of its cause: stale UI/cache, wallet accounting rules, unproven transaction handling or another defect have not been distinguished. Do not treat the counter as a verified allowance-consumption ledger or infer that the transaction was free. Investigate using the existing transaction and read-only source/UI evidence; no extra purchase/grant is needed or authorized. C4 remains FAIL; C2 remains FAIL overall despite this silent-payment subcase passing.

After this run the user reported **“no prompt and no counter.”** This confirms zero native approval prompts observed during the page-6 purchase. Together with the saved 5,000-sat monthly grant and the successful 6-sat purchase, this is a narrow Desktop silent-payment PASS. It does not complete one-approval cohorts across both wallets. The counter wording is ambiguous: absent UI versus an unchanged value must be clarified. No 6→12 counter change, loss of grant, or incorrect accounting is inferred. The user was asked to inspect the hostname-only localhost Spending entry and distinguish those cases without making changes. No further wallet call or payment was initiated.

After the user reported Desktop history loading normally, the previous failed preparation was confirmed settled (no context; authentication timeout; no payment calls). A guarded read-only resume reused request ID `b9b248b6-8438-41a6-9181-40dacc7ff756`, original operator journal and matching identity/edition. It refused any payment-stage record, then checked authenticated edition-scoped status: no ownership/intent/payment journal existed for page 6. This is pre-payment read-only resumption, not replacement of an uncertain transaction.

An exclusive temporary permit bound that identity, original edition, page 6 and request ID. The global pause stayed present. `run()` was invoked once. Existing staged payment code checked the unsigned noSend template, signed noSend, saved proof, and broadcast the same transaction. The two createAction calls were unsigned preparation and sendWith-only broadcast; they are not two page transactions. The exact permit was removed once server HTTP200 was observed, and is absent after completion.

- Transaction: `9edee29fa6980ff0784647a0a16462f71045f050826ef032e5a1301bef9f3714`.
- Wallet history delta: exactly one new **-6-sat** action, status **unproven**. No additional grant debit appeared.
- Actual fee: **1 sat**, checked with the SDK before signing and independently reconciled from public parent/output values: 5,139 sats input → 5-sat server output + 5,133 sats change. Page total **6 sats**.
- Edition-scoped paid response: HTTP200, page 6, matching txid/edition, 11 paragraphs. Browser DOM/screenshot shows page 6 server-returned text; original proof remains in the existing payment journal, state confirmed (application delivery, not mined confirmation).
- Post-display bookmark: HTTP200 `{saved:true}`. Unpaid owned reread: HTTP200, matching original txid and 11 paragraphs. Completed at `2026-10-17T17:17:52.681Z`.
- Operator request-to-double-animation-frame marker: **47,328.4 ms**. Paid HTTP response alone took **9,012.6 ms**; payment workflow 1,647.6 ms. A browser frame wait also delayed completion, but its exact contribution was not instrumented. Retain this slow sample; do not discard it or claim ≤500ms. This is one operator sample, not either required 20-turn product cohort or a p95 measurement.
- Native prompt count and spending-counter change await user observation. No `waitForAuthentication` was called; this alone does not prove that wallet internals displayed zero prompts. User was asked to inspect localhost Spending after the run without changing it.

Evidence: `runs/page6-result-2026-10-17.json`, `runs/page6-public-tx-2026-10-17.json`, `runs/page6-fee-summary-2026-10-17.json`, `screenshots/page6-displayed-2026-10-17.png`; [public transaction](https://whatsonchain.com/tx/9edee29fa6980ff0784647a0a16462f71045f050826ef032e5a1301bef9f3714). Read-only post-run preflight `runs/recovery-preflight-1792257516108.json` verifies pause/no permit, three purchases, five intents, three replay claims and two proofs, with historical records retained.

Validation: spike build PASS; original 41-test suite PASS before resume changes, plus the new targeted same-request preflight-resume guard test PASS. It refuses payment-stage records/spends/payment routes and preserves the original request. No claim of a full 42-test suite run is made here. Overall C1/C2/C4 remain FAIL; C3/C5/C6/C7/C8/C9/C10/C11 remain UNRESOLVED. The one authorized purchase is consumed; no further live purchase is authorized.

The user explicitly authorized one mainnet purchase of Holmes page 6, with 5-sat server price and at most 1-sat miner fee (6-sat page debit maximum). No new grant is authorized. Keep the global pause and all existing records/journals. Reconcile uncertain outcomes without a replacement payment.

## Prepared runner

## Read-only history stall — 16:49 UTC

### Later response — inspected 16:55 UTC

The original history read eventually returned five actions, including the existing -5-sat grant now marked unproven. Preparation advanced through generated reacquisition, network/health/catalogue reads and the BRC-103 handshake. Native verifySignature then returned HTTP503 after approximately 133.6 seconds, and AuthFetch ended with `Timed out waiting for authenticated response.` No authenticated status response or prepared run context was obtained. The settled preparation promise has no context, and no createAction/signAction/broadcast, paid-page route or server permit was reached. This supersedes the earlier still-pending history description. Preserve the original request ID and journal; any resumed read-only preflight must retain its history and prove no payment stage was entered. Evidence: `runs/page6-preflight-auth-failure-2026-10-17.json`.

The user subsequently reports that Desktop's own main wallet/history view **stays loading**. The problem is therefore visible in the native app as well as the pending browser history call; its exact cause is still unknown. A normal Desktop quit/reopen is the next recovery step. The browser/request journals remain intact; no permit exists and the global pause remains. Do not force-kill processes, reset the wallet, create a new wallet/grant, or clear any payment/operator journal. After restart, first establish that the old read-only call has settled, inspect history and the existing allowance, and reconcile the same authorized experiment before any purchase. A read-only preflight failure is not an uncertain signed-payment retry; no create/sign/broadcast call was reached here.

The user confirms no native prompt is showing. The original localhost:3321 `listActions` request remained pending at 16:49:46 UTC (more than five minutes after prepare began). No duplicate history query or payment was sent. A parallel SDK auto-discovery HTTPS localhost:2121 getVersion probe also remains pending; HTTP3321 getVersion/isAuthenticated/getPublicKey succeeded earlier. Windows reports Desktop process 920 responding and both bridge ports listening; these observations do not establish underlying history/storage health. The exact failing layer remains unknown.

The Desktop v3.1.1 [HTTP bridge source](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/electron/httpServer.ts) forwards calls to its renderer and deliberately permits healthy requests to wait without a short timeout. This explains why an outstanding request alone does not prove a visible approval dialog. The installed reference manager 2.14.9 `listActions` forwards empty-label requests to underlying history and decrypts returned metadata; this reference inspection does not identify where the running Desktop 2.14.5 dependency is stalled. No private wallet files were inspected.

The user was asked to view Desktop's main wallet/history screen and report normal loading, a spinner or an error before any restart. Page-6 context remains unprepared, no scoped live permit exists, and the global pause is present. The persistent journal and original request ID are retained. No criterion status changes. Metadata: `runs/page6-history-stall-2026-10-17.json`.

`src/single-page-review.ts`, built as `/single-page-review.js`, has no automatic entry point. It uses generated acquisition and the existing `openWallet` payment workflow, including unsigned noSend fee check, signed noSend proof persistence and same-transaction broadcast. It reads baseline history and authenticated edition-scoped status before returning the exact identity/edition/page/request ID for a scoped server permit. Existing ownership, intent or payment/operator journals refuse a new attempt. `run()` can only be invoked once per prepared context; the persistent operator record prevents preparing a replacement after reload.

Paid text is inserted only after a matching server response. Display is followed by an independent bookmark attempt and unpaid owned-page reread. History is reconciled in finally. The result export excludes payment proof/reference; the original payment journal retains those for recovery. Timing is an operator request-to-display sample, not a qualifying product p95 cohort. Native prompt count and saved spending counter still require user observations.

Validation: spike build PASS; all 41 existing local tests PASS, including staged-payment fee/proof/recovery guards. The new browser operator runner has not been live exercised yet.

## Launch blocked before wallet calls

### Browser reconnection and read-only preflight

The subsequent preview_open call reconnected successfully. The grant journal remained finished, page-6 operator journal absent and fetch native. The helper's prepare stage was invoked once at `2026-10-17T16:44:30.365Z`, request ID `b9b248b6-8438-41a6-9181-40dacc7ff756`. Generated wallet acquisition succeeded through localhost:3321. Its read-only `listActions` (`seekPermission:false`) is pending. No server permit exists, no paid-page request has been made, and `run()` has not been invoked. The original page-6 operator journal now exists and must not be cleared/replaced. The user was asked whether native UI shows any prompt, with new grants left unapproved. Pending metadata: `runs/page6-preflight-2026-10-17.json`.

The shared browser initially reported tab_5 available. Navigation to refresh its old grant-only transport guard timed out; the next evaluate call explicitly reported no automation host. No page-6 helper invocation, wallet acquisition, server permit, page intent or payment was initiated. Reconnect the same thread/browser to continue the already-authorized single run. Inspect persistent journals first; do not navigate again unnecessarily. This authorization persists and does not need to be requested again merely because the browser disconnected.

Overall C1/C2/C4 remain FAIL; C3/C5/C6/C7/C8/C9/C10/C11 remain UNRESOLVED.
