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
