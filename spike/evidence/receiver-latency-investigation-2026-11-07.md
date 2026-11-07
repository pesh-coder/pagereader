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

## Remaining acceptance

Latency remains open. The existing 1.447-second phone workflow already exceeds the entire 500-ms budget, even if server work were instantaneous. A successful server-only change cannot establish compliance. Full native cohorts and sustained depth-limit verification remain pending; another purchase is not needed to run this diagnostic.
