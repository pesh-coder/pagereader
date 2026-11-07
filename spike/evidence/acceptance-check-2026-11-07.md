# Acceptance check, 2026-11-07

Read-only checks. No wallet reset, new payment, permission grant or manual rebroadcast.

## Existing transactions: mining blocker closed

WhatsOnChain returned HTTP 200 and 701 confirmations for all four transactions below. The actual broadcast processor, Arcade, independently returned HTTP 200 and `MINED` for each.

| Transaction | TXID |
|---|---|
| Phone page payment, 28-sat debit | `06b3820e7caba64aba083cfcd70342a99b7f06a6406c38b05422298ea2f74938` |
| Its 1,000-sat funding parent | `da9e4cf1ebefc26d5df25566f352cdc62bee0fa20b1904f7db4ae8b55bec6799` |
| Phone permission grant, 199-sat debit | `6cdc5bb04e2873dc8f142719e84f55a6f43d261d7436885bd196b512c33027ab` |
| Its 6,000-sat funding parent | `8047e344f66bd367eda864d1328f535ac0e961fa58e654e417f8a047a60e56b6` |

For both phone debits, WhatsOnChain's `/tx/<txid>/proof/bump` also returned HTTP 200. Their block hash is `00000000000000001ed3ba801772a80da8b11459365bdca5148b38d6744661ce`, with block timestamp **2026-11-02T15:18:46Z**. This is the block's timestamp, not a measurement of the exact time each node observed mining. The transactions subsequently mined after the 2 November investigation; no recovery action by this agent caused that result. The cause/method of their eventual inclusion is not established by these lookups.

Sources: `https://api.whatsonchain.com/v1/bsv/main/tx/hash/<txid>` and `https://arcade-v2-us-1.bsvblockchain.tech/tx/<txid>`. These current results supersede the earlier unresolved mining status, not the historical low-fee finding. A local wallet may still need to refresh its proof. Requested that the owner refresh the two phone debit statuses and resume the existing owned page without buying.

## Hosted previews: 16/16 pass

The hosted `/api/library` returned eight books. Explicit wallet-free GETs of both public pages for each edition returned HTTP 200 and nonempty paragraphs: Holmes, Pride and Prejudice, Frankenstein, Dorian Gray, Dracula, Meditations, Metamorphosis and Alice. No authentication or payment headers were used. Response times from the agent network ranged from 389 to 973 ms; these are neither native-device tests nor paid-turn measurements. Health returned mainnet, payment-ready and purchases enabled.

The owner then logged out of Pagestream's app wallet connection on the physical phone, opened Holmes from Library and confirmed **both pages 1 and 2 load, with no errors or wallet prompt**. Together with the existing Desktop observations and hosted checks, this closes C1 and the earlier phone free-page failure. No phone paid page was requested in this preview check.

## No-account audit: pass

Reviewed the active reader entry (`app/client/src/main.tsx` → `App.tsx`), reader components/gateway, wallet acquisition helper, payment routes and SQLite schema. The active reader has no signup, email, password, card or profile form. Wallet acquisition obtains a public identity key, and the app stores purchases/bookmarks against that identity and edition. Generated scaffold features outside the active reader are not evidence of a reachable reader account flow. Existing Desktop and phone purchase observations support the source audit. This closes C7; it does not establish that the two wallets share an identity.

## Still open

### Page-4 attempt: fee cap, no new payment

After the free-preview check, the owner reported that confirming did not open the next page and native wallet Activity contained no new outgoing transaction. A read-only receiving-wallet `listActions` check still showed six historical completed incoming actions and no new page payment. The subsequent phone screenshot identifies **page 4**, a **23-sat wallet fee quote**, and an **unsigned payment cancelled because it exceeded the initial 1-sat cap**. The reader total remains 28 sats. This establishes a fee-cap abort, not another mining delay or a successful new purchase; the earlier possibility that the user merely reopened page 3 was not the cause of this screenshot.

The screenshot offers a separate approval of **up to 28 sats for page 4** (5 price + up to 23 fee), within the prepared one-page test bound. The ordinary 1-sat retry cannot accept that fee. Prompt count after a signed purchase, the new total and timing are still pending; this aborted attempt is retained as diagnostic evidence, not a qualifying paid latency sample.

The introductory panel was clarified to show its target page number, explain that already-owned pages are free, and distinguish the initial fee limit from a wallet quote. This is a copy correction, not an increase to the cap or a claim that the payment failure was fixed. Client build/lint pass; the local wallet-free preview confirms the revised panel wording without initiating wallet calls.

### Page 4 completed, then reader fee consent implemented

The owner then approved the 28-sat page-4 offer and reported success, a 28-sat debit and an almost-instant turn (estimated under one second). This is an observation, not an instrumented p95 sample. The reply does not distinguish native wallet approvals from the app approval; native prompt count remains unverified.

Read-only receiving-wallet queries show one new incoming action, TXID `3f197a718fba71d4322da280b3217351d9301f17b2db6e6560969b8bb355fb51`, currently `unproven` at the check. Its saved transaction is 225 bytes, pays 5 sats in output 0 and has an independently calculated 23-sat fee. Its input spends the original phone page-3 transaction. The expected recorded book total is 56 sats; the user has not yet reported that counter value. No agent-created payment was involved.

The owner explicitly requested automatic Next turns using the observed fee instead of repeating the 1-sat failure/approval flow. Implemented **one app consent per open reader** for at most 23 sats in miner fees per new page, plus the 5-sat seller price. Only the actual fee is charged. Consent is held in memory, bound to the acquired wallet identity and cleared on logout/reload; the old sessionStorage explanation flag cannot authorize the higher ceiling. Existing operator/unapproved defaults remain 1 sat. Fees above 23 and unknown fees remain blocked before signing; a separate higher approval is still bound to one original attempt and does not raise the ongoing ceiling. No paid prefetch or wallet permission change was introduced. This per-payment safety ceiling is not a substitute for the brief's wallet-managed session spending budget.

Full suite: **87 passed, 0 failed**. Added gateway tests for consecutive turns, logout/identity change, read-only/uncertain attempts and a non-persistent higher override; existing payment-action tests reject 24-sat and unknown fees under a 23-sat approval. Type checks and client build/lint pass. Local UI inspection confirms the new maximum, actual-fee wording, reload/logout expiry and unchanged wallet-free preview flow. The physical-phone automatic-Next run after deployment is still pending.

The owner subsequently confirmed that phone owned-page resume still displays the same **28-sat total**. This closes that read-only resume/counter check; the reply did not state the two wallet Activity statuses, so their local proof refresh is not assumed complete.

Still open: native wallet status refresh; supported same-identity cross-device resume; native session approval/allowance enforcement; paid p95; remaining negative, recovery, race and stopping tests; 90-second demo and team receipt. Recorded spending already matches the supplied Desktop and phone records, but broader failure/pending accounting still needs verification.

## Phone repeat turns and stopping: owner confirmation

The owner confirmed the pages 5/6 test succeeded with only the app fee consent, no native wallet approval on either page. They also reported no new purchase when Continue reading was used after the requested stopping check. This closes the narrow silent-repeat and resume/no-new-purchase observations. No final counter, resumed page number, exact close duration or wallet allowance readback was supplied; these are not invented. This does not turn the monthly wallet grant into session scope.

## Hosted cross-identity rejection: pass

At 2026-11-07T12:54:51.530Z, `scripts/check-hosted-replay.ts` used the original phone page-3 proof against the hosted reader under a synthetic unfunded SDK identity. Both submissions returned 409 with no paragraphs. That caller's page-3 status before/after remained `{purchase:null,intent:null}`. Payment methods were guarded and forbidden-call count was zero. The original receiver identity was checked against the hosted manifest before reading its proof. No new transaction, grant or broadcast was created. This establishes cross-identity refusal only; it does not establish native concurrency, valid underpayment refusal or global database immutability.

## Production timing export

Added an optional connected-wallet menu capture for request-to-visible-frame timing, sanitized wallet/HTTP stages and accepted receipts. Native app name/version are entered explicitly rather than inferred from the wallet protocol version. Reload/close retains incomplete evidence and stops recording. New paid samples require a successful payment workflow and a unique matching accepted receipt; free pages, owned reads and recovery cannot inflate the cohort. Export contains public identity/transaction IDs, not keys or BEEF. Start/stop/export cannot call a payment method. Three capture tests plus the prior suite pass: 90 total. These tests use synthetic data and are not native latency evidence.

## Page-20 interruption and capture-start correction

The owner reached owned page 19; the supplied screenshot records 476 sats for the book. Page 20 shows local `preparing`, server `challenged`, and `createAction` / `WERR_INVALID_OPERATION`; Check payment found no completed purchase. The original attempt remains blocked. This is not evidence of a page-20 charge or of a qualifying latency run.

The owner confirmed Reading timings says **No capture yet** and that they attempted to start it from Library, before opening an owned page. Capture was refused by the required owned-page precondition; no timing file exists for this cohort. The successful purchases remain owned and must not be bought again to reconstruct timings. Corrected the UI to disable Start capture while unavailable or the version is blank, show the prerequisite and start result above the controls, and display Recording/stopped plus the paid-turn count in the reader header. Start/stop/display remain observational; no payment guards were relaxed. Client build and lint pass.

Read-only receiver checks show 13 new incoming actions since the earlier four phone purchases, consistent with pages 7?19. The most recent incoming TXID is `0d72603c1b4b410956e4298c65172d47a06a7d62ce3cae83cb7a1151a19d0e6b`. At this check Arcade returns MINED and WhatsOnChain returns 1 confirmation in block `00000000000000000fbc58db2434933a765104e9a1f8b6412a5eca1a9b0f4daa`, although the receiver wallet still labels the recent actions unproven. Saved transaction inputs reveal chained change spending, including a 12-transaction branch among the recent payments. The installed toolbox client contains a default proof recursion depth of 12 and can throw WERR_INVALID_OPERATION when exceeded. This is a candidate explanation, not a confirmed diagnosis of the phone's error: its full wallet error message and local unsigned-action state are not available. No transaction was rebroadcast, replaced, cancelled or reset.

## Completed-wallet history and unsigned preparation recovery

The owner reports all phone Activity entries changed from unproven to completed. This confirms their observed wallet display, not the precise cause of WERR_INVALID_OPERATION. The proof-depth explanation remains a hypothesis because the saved error contains only the general code.

Implemented a narrow, read-only reconciliation for an original preparing attempt with walletRequestStarted:true, createAction/WERR_INVALID_OPERATION, and no reference, TXID, signed proof or broadcast marker. This stage was created exclusively for unsigned noSend/signAndProcess:false preparation. Under the same identity-wide Web Lock used by purchases, the reader requires two identical complete, unfiltered wallet-history snapshots with every returned action completed, plus the same server challenged/unpaid request and an unchanged local journal. Existing recorded page debits also block this path. An empty, partial, malformed, active, changing or unavailable history refuses recovery. No wallet signing/creation, abort, broadcast, reset or input-release method is used by the check. The original request ID is retained in a retryable record; only a subsequent explicit purchase may create an unsigned transaction. Signed/uncertain-payment recovery is unchanged.

Next on a locally unresolved page now performs the read-only check before asking for app fee consent. An eligible check reports that no payment was made and offers Try purchase again. Native page-20 recovery remains to be observed after deployment; successful unit tests do not close it. Full suite: 95 passed, including failure-stage, history, intent and concurrency refusal cases and gateway no-payment/reused-request validation. Client build/lint and spike type checks pass.
