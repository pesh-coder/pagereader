# Receiver latency investigation — 7 November 2026

The page-33 pilot took 7.073 seconds. Its phone payment workflow took 1.447 seconds and server wallet acceptance took 2.434 seconds. Authentication and SQLite were only 13 and 24 milliseconds. These overlapping measurements identify payment services as the priority, rather than reading-view rendering.

## Implemented

- Split receiving-wallet time into blockchain-root validation and storage acceptance. These appear as `roots` and `storage` in Server-Timing and in the response timings. They are nested inside `internalize`; do not sum them with the enclosing duration.
- Added an operator-only read-only diagnostic for a saved accepted receipt. It re-verifies its existing proof and times a one-row wallet history lookup. It never calls internalizeAction or constructs, signs or broadcasts a payment. Authentication requires the existing server identity; other callers are refused before looking up a proof. Calls are rate-limited and cannot overlap.
- Added a CLI that authenticates with the existing receiver configuration and rejects payment operations. No key, proof bytes or wallet history is printed.
- Kept the same provider, receiver identity, storage and verification rules. No root-verdict cache, early content delivery or paid prefetch was introduced.

## Validation

All 107 tests pass and server TypeScript checks pass. New tests cover concurrent profiling isolation, preservation of false/throwing root-validation results, foreign-identity rejection, submitted-but-unaccepted proof rejection, rate limits and zero payment calls. Raw test output remains local in `runs/receiver-profile-tests.txt`.

The installed wallet-toolbox-client 2.14.9 implementation first calls `Beef.verify` using its configured ChainTracker, then calls `wallet.storage.internalizeAction`. The remote storage implementation also validates the incoming proof. The new instrumentation observes these boundaries without bypassing either check. A history lookup is a comparison for read-only storage latency, not a measurement of the remote acceptance write itself.

## Hosted read-only results

Railway deployed `c7d444d` successfully. Three checks of the existing page-33 proof returned valid with zero payment calls:

| Sample | Local proof verification | Root validation (inside verification) | Read-only history lookup |
|---|---:|---:|---:|
| 1 | 123.6 ms | 120.0 ms | 201.0 ms |
| 2 | 135.7 ms | 134.4 ms | 197.1 ms |
| 3 | 92.6 ms | 92.1 ms | 133.1 ms |

These are timings inside Railway, excluding the operator client's round trip. Raw outputs remain local as `runs/receiver-latency-page33-hosted-{1,2,3}.json`. They do not reproduce or measure the acceptance write, and do not justify treating its earlier 2.434 seconds as fixed. The next actual acceptance now has separate root/storage measurements without needing another profiler deployment.

The installed 2.14.9 storage implementation's `newInternalize` also calls `shareReqsWithWorld` before persisting ownership for an unproven transaction. [The official changelog](https://github.com/bsv-blockchain/bsv-desktop/blob/master/CHANGELOG.md) explains that this posting-before-acknowledgement behavior is intentional. Pagestream also broadcasts the original transaction from the payer before submitting it. Processor posting on the receiving side is therefore a candidate contributor, rather than a SQLite or page-rendering issue. The remote storage's deployed version and the time spent inside its broadcaster have not been independently established; do not claim this is a measured attribution. Removing either broadcast path requires verifying supported wallet behavior and recovery first, not simply deleting an await or acknowledging before acceptance.

## Native page-34 result

The owner supplied run `cb448ff9-aa44-43b6-8450-30a4d5cd54a0`. It contains one successful explicit paid turn, no error notes, and one new accepted receipt for page 34. The ledger now has 32 unique accepted transactions for pages 3-34 totaling **896 sats**: 160 page prices + 736 miner fees. The new debit is 5 + 23 = 28 sats; permission costs remain excluded. Accepted does not independently prove mining.

| Stage | Time |
|---|---:|
| Request to visible frame | 6,122.1 ms |
| Initial 402 response | 1,075.6 ms |
| Phone payment workflow | 1,586.9 ms |
| Wallet prepare / sign / sendWith | 560.2 / 123.4 / 804.0 ms |
| Paid HTTP response | 2,753.0 ms |
| Server total inside paid response | 2,160.006 ms |
| Wallet acceptance inside server total | 2,103.664 ms |
| Root validation inside acceptance | 237.314 ms |
| Remote storage acceptance inside acceptance | **1,846.176 ms** |
| Server authentication / SQLite | 11.946 / 28.545 ms |

The remote storage call accounts for about 88% of wallet acceptance. That boundary includes remote communication, processing, any remote proof checks, posting and persistence; it is **not** evidence that a database write alone took 1.85 seconds. Splitting those remote internals requires storage-side tracing. The payer workflow also independently exceeds the 500-ms whole-turn target.

Known ancestors remain active (8), with the complete proof of 3,838 bytes reduced to a 301-byte HTTP proof. There is no status GET in this fresh-page sample, confirming removal of the redundant request. The smaller total than page 33 is not a statistically established speed improvement: page 33 was a retry, and these are isolated samples with different network timings. The 402 response did not include server stage timings, so its 1.076 seconds cannot be assigned wholly to networking or server work.

Page-34 TXID: `fa745941cd696b8a8ca82af75ebfb8f70698c04a6fb505fceaf48fbe5a3e27d4`.

Raw capture and machine report remain local at `runs/phone-timings-cb448ff9.json` and `runs/phone-timings-cb448ff9-report.json`. Original SHA-256: `c2ac4a4925ba9516c30cf04dc0d46a1464b6d31a540d63af5946d68838924a2b`. Machine qualification remains UNRESOLVED because only one new turn was captured; the observed duration still misses 500 ms. No further paid cohort is needed to establish these bottlenecks. A short maintainer message is prepared locally in `runs/receiver-performance-message.md`; nothing was sent.

## Remaining work

Latency remains open. The latest 1.587-second phone workflow already exceeds the entire 500-ms budget, even if server work were instantaneous. Next is storage-side tracing of the 1.846-second acceptance call and a supported faster payer path that retains fee checks and proof persistence before broadcast. Removing a safety step or returning content before acceptance does not meet the brief. Full native cohorts and sustained depth-limit verification remain pending; another purchase is not needed to establish these bottlenecks.

## Follow-up in the new thread

Recovered the original thread's final result from local T3 logs and reviewed the active client and receiver paths. The client awaits `sendWith` before submitting its saved proof; the receiver awaits wallet acceptance before committing the purchase. In installed toolbox-client 2.14.9, `newInternalize` supplies an unproven transaction to `shareReqsWithWorld` as `readyToSend`; that function verifies the merged proof and awaits `attemptToPostReqsToNetwork`. This identifies specific storage-side trace points, but does not measure their individual durations on the hosted service or establish its deployed version.

The next service trace should separate proof verification, processor posting and ownership persistence. Client-side measurements cannot split a remote RPC into those stages. The existing maintainer message remains unsent.

Both initial and reused 402 challenges now include `Server-Timing` at the transport boundary, using the same app/auth/wallet/DB measurements as successful delivery. The reader already captures this header before AuthFetch filters it, so no new wallet call or payment is needed to collect it. This fills the missing attribution for the 1.076-second challenge leg on future captures; it cannot reconstruct page 34's missing measurements. Challenge integration coverage checks both paths, nonce reuse and zero purchases. All 107 tests and server TypeScript checks pass.

This is a diagnostic correction, not a latency fix or a new measured speed result. Even eliminating the entire server acceptance wait would leave the recorded 1.587-second payer workflow above the target. Eliminating only the challenge round trip would also leave both wallet bottlenecks. Reaching 500 ms therefore still needs a materially faster supported wallet/service path, or an explicit change to the pay-on-click requirement. Paid prefetch, early delivery and background broadcast success assumptions have not been introduced. No deployment or new mainnet purchase was performed in this follow-up.

## Original-transaction overlap pilot

An app-side pilot now overlaps the payer's synchronous `sendWith` wait and BRC-105 submission of the already-signed, saved original proof. It changes scheduling, not the transactions or operations: fee/template checks and complete proof persistence still precede both operations. The reader waits for both a checked payer broadcast result and the authenticated paid response before delivery. Receiver validation and ownership persistence remain unchanged. Neither delayed broadcast nor paid prefetch is enabled.

The pilot holds the wallet's cross-tab payment lock through both operations, rejects another local payment/recovery while delivery is active, and retains failures without creating a replacement. A lost HTTP response still waits for the original outstanding broadcast. A receiver success paired with a payer broadcast failure remains an error with the original signed journal; a later explicit Check payment can reconcile the existing server receipt. Timing exports identify `paymentMetrics.deliveryMode` as `serial` or `overlap`; the workflow timing still includes the payer broadcast wait. Receiver timings overlap it and must not be summed as independent work.

Ordinary delivery remains serial. The pilot requires a frontend build with `VITE_PAGESTREAM_PAYMENT_OVERLAP_TARGET` set to the exact `publicIdentity/editionId/pageNumber` from the bounded test. Only that wallet's durable attempt for that edition/page selects overlap; an empty/unset or unmatched target retains serial delivery. The public backend, receiver identity, wallet versions, price and fee policy are unchanged. Clear the target and rebuild to return to serial delivery; retain all original payment journals and server receipts through either direction.

All 118 local tests pass, including real SDK/AuthFetch/middleware tests with isolated synthetic wallets. New cases verify both completion orders, the held payment lock without recursive acquisition, accepted receiver response plus failed payer broadcast, the unchanged serial path, preparation failure, lost response, dual failures, single-use delivery, scoped pilot selection and request/journal page binding. Client production build/lint and spike TypeScript checks pass. Raw test output is in ignored `runs/payment-delivery-full-tests.txt`.

Native benefit is unmeasured. A wallet may serialize concurrent calls, and concurrent payer/receiver posting may expose service-side races that synthetic receivers cannot reproduce. Do not enable this for general purchases or claim a 500-ms result from these tests. The next check is a single bounded native pilot, preserving the original attempt, actual wallet debit and both operation outcomes; no further paid cohort is warranted until it shows improvement without correctness regressions. No deployment, wallet change, new grant, purchase or external message was performed here. The 500-ms requirement remains open.

The owner subsequently approved deployment and one phone purchase of Holmes page 35, capped at 28 sats (5 price + up to 23 fee), without a new paid permission grant. `vercel.mjs` now supplies the exact public wallet/edition/page target through its build command; this avoids changing account-wide hosting variables. Remove that temporary build prefix after the pilot. All 119 predeployment tests pass, including a check of the exact deployment scope; the targeted frontend build, static packaging and backend build pass. Before deployment, mainnet health and the receiver public identity match the prior setup, and all 16 public previews return 200. Deployment verification and the actual native result are still pending at this commit.

## Native page-35 overlap result

Both hosts deployed `4d17c78` successfully. The hosted frontend contained the exact scoped target; mainnet health, receiver identity, eight books and all 16 public previews passed. The owner supplied native capture `abfb30cb-0459-4f23-b72a-cf0e09e3d469`, Browser 1.6.3, for one new explicit page-35 purchase. It confirms `deliveryMode: overlap`, successful payer workflow and visible delivery, with no error notes. Eight known ancestors reduced the complete 4,065-byte proof to 302 HTTP bytes.

| Stage | Page 35 |
|---|---:|
| Request to visible frame | **6,406.2 ms** |
| Payer workflow, including broadcast | 1,464.1 ms |
| Wallet prepare / sign / sendWith | 547.0 / 117.1 / 686.2 ms |
| Initial 402 HTTP | 1,041.6 ms |
| Measured app handler inside 402 | 48.345 ms |
| Paid HTTP | 3,869.3 ms |
| Measured app handler inside paid HTTP | 3,099.130 ms |
| Receiver acceptance inside app | 3,060.538 ms |
| Root validation inside acceptance | 154.822 ms |
| Remote storage inside acceptance | **2,896.538 ms** |
| Paid request authentication / SQLite | 10.660 / 18.371 ms |

The 402 has about 993 ms outside the measured app-handler span. This includes the frontend/proxy/network path and unmeasured response processing; the export cannot isolate those contributors. It is not proof of a universal network floor. Server stages are nested in HTTP and payer broadcast overlaps submission; do not sum all rows.

Compared descriptively with page 34's serial 6,122.1 ms, this pilot is 284.1 ms (4.64%) slower overall; remote storage increased from 1,846.176 to 2,896.538 ms. These are two different single-page samples, not a controlled comparison: they do not establish that overlap causes the increase. The pilot has not demonstrated an improvement and misses 500 ms. Do not enable it generally or buy another cohort to manufacture acceptance. The temporary Vercel build target is removed by the follow-up cleanup; the tested implementation remains available but disabled by default.

The exported ledger has 33 distinct page/transaction entries for pages 3-35, totaling **924 sats** (165 prices + 759 fees). The only new receipt compared with page 34 is one 28-sat page-35 purchase, TXID `bcc4abf2a2fc4d2f2d635880a65061476d886ecf7dcb193cb3b2b2e53bc2e555`. This is recorded application accounting, not an independent audit of native wallet debits or proof of mining. Empty `prompts` does not establish zero native prompts or grant costs.

The original attachment is preserved unchanged in ignored `runs/phone-timings-abfb30cb.json`, SHA-256 `d867b46514aeffa545bc47f62389e55afc74ba8fd72de4a28437a7c0ed96ff30`. Machine report and stage/ledger comparison are in the adjacent `-report.json` and `-analysis.json`. C3 remains machine-UNRESOLVED (one paid sample), with observed speed failing the target. Next work is service-side acceptance tracing and the hosting/transport path; no further paid purchase is needed to establish these bottlenecks. Native repeated depth-limit prevention, wallet-managed session spending and the other acceptance requirements remain open.
