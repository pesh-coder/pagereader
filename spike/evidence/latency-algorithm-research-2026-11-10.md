# Latency algorithm research and offline comparison

The best supported approach for fast sequential reading remains **one-page asynchronous preparation with a single shared in-flight operation**, plus BRC-96 known-ancestor transport. A new adaptive proof-merging optimization reduces local work further. Neither establishes a fresh payment within 500 ms: the retained native trace includes seconds in wallet/provider operations. No real sats, wallet calls, grants, broadcasts, provider migrations or dependency upgrades were used for this investigation.

## Sources and compatibility

Research was checked on 10 November 2026. Public npm metadata reports SDK **4.0.1** and Toolbox/Toolbox Client **2.15.3**; the app remains on SDK **2.8.11** and Toolbox Client **2.14.9**. Source publication, package publication and deployment to a native wallet or its remote provider are different events.

Pinned ts-stack revision: `52d36a5ab1ae7cb9e3243ff4147558bcccde3c07`; BRC revision: `99ee33ea5980313a5c2b01a02a1e42569d981fd6`. Eight source files plus their SHA-256 inventory are retained locally under ignored `runs/latency-algorithms/source-index.json`.

| Official source | Finding for this app |
|---|---|
| [BRC-100](https://github.com/bsv-blockchain/BRCs/blob/99ee33ea5980313a5c2b01a02a1e42569d981fd6/wallet/0100.md) | Existing create/sign/noSend/sendWith calls are the supported app contract. Additive capabilities require explicit support; do not probe compatibility by replaying financial operations. |
| [BRC-96](https://github.com/bsv-blockchain/BRCs/blob/99ee33ea5980313a5c2b01a02a1e42569d981fd6/transactions/0096.md) | Shared known transactions can travel as TXIDs. This reduces repeated ancestry bytes; it does not eliminate receiver validation. |
| [BRC-105](https://github.com/bsv-blockchain/BRCs/blob/99ee33ea5980313a5c2b01a02a1e42569d981fd6/payments/0105.md) | Retain request/payment binding and receiver acceptance before fulfillment. A queued or attempted payment is not an accepted page. |
| [SDK BEEF implementation](https://github.com/bsv-blockchain/ts-stack/blob/52d36a5ab1ae7cb9e3243ff4147558bcccde3c07/packages/sdk/src/transaction/Beef.ts) | Already has indexed lookups, graph sorting and byte caches. Public `findTxid` also synchronizes nested mutation state; repeated public calls must not be assumed constant time. |
| [SDK performance work](https://github.com/bsv-blockchain/ts-stack/blob/52d36a5ab1ae7cb9e3243ff4147558bcccde3c07/packages/sdk/docs/performance.md) | Batched proof assembly, cached graph work and byte representations address CPU/allocation costs. Published large/fragmented workload numbers are not native payment RPC measurements. |
| [Action-batch planning](https://github.com/bsv-blockchain/ts-stack/blob/52d36a5ab1ae7cb9e3243ff4147558bcccde3c07/packages/wallet/wallet-toolbox/docs/action-batch-planning.md) | Wallet/provider capability negotiation can replace repeated storage trips with local planning and atomic commit. The app cannot turn this on in an installed wallet/provider by changing SDK alone. Unrelated graphs do not join automatically. |
| [Receiver implementation](https://github.com/bsv-blockchain/ts-stack/blob/52d36a5ab1ae7cb9e3243ff4147558bcccde3c07/packages/wallet/wallet-toolbox/src/storage/methods/internalizeActionCore.ts) | Receiver validates BEEF, uses its own chain tracker, and awaits publication results for fresh unmined imports before persisting new ownership. These are meaningful service boundaries, not redundant UI tasks to delete. |
| [VeriFast](https://github.com/bsv-blockchain/ts-stack/blob/52d36a5ab1ae7cb9e3243ff4147558bcccde3c07/packages/verifast/README.md) | Optional warmed WASM can accelerate script/cryptographic CPU work. Remote provider configuration is separate. No evidence attributes the recorded remote wait to script CPU, so this was reviewed, not installed or presented as a measured fix. |

## Time and space comparison

Notation: `N` newly bought pages, `P` page-body bytes, `B` complete proof bytes, `H` retained hints (server advertises at most 8; client bounds at 32), `V/E` graph transactions/dependencies, `T` one complete preparation duration, `D` reading dwell, `F` display time. Let `C_i` be the SDK cost of parsing/merging source proof `i`, and `Q` final serialization, validation and subject reconstruction. Keeping these SDK costs explicit avoids claiming all graph operations or public lookups are O(1).

| Approach | Time / click behavior | Extra working space | Assessment |
|---|---|---|---|
| Serial payment on Next | N payments; each click waits approximately `T + F` | `O(P+B+V+E)` per active purchase | Correct baseline; measured native duration exceeds target. |
| Existing single-slot preparation | Same N payments; click wait approximately `max(0,T+1000-D)+F` under the current 1-second scheduler | One extra page `O(P)`; active proof work remains `O(B+V+E)` | Best tested sequential-reading approach. No faster payment throughput; rapid Next still waits. |
| Prepare k paid pages ahead | Up to k pending/unread pages; more future clicks can be cached | `O(kP)` plus in-flight proofs | More unread purchases, funding contention and chain depth. Not justified by this POC. Not implemented or paid-tested. |
| Known-ancestor transport | Exchanges only agreed TXIDs for shared history; restoration still needed | Retained ancestor map `O(S)`, where `S` is sum of retained proof sizes | Already implemented. Native pilot retained 4,291 proof bytes but only 301 payment HTTP bytes. Small wire payload did not remove remote acceptance latency. |
| Previous merge-all restoration | `O(H) + sum(C_i) + Q`; overlapping chain sources can repeat roughly `H*B` source-byte work | `O(S+B+V+E)` | Repeated parsing/merging is avoidable when hints overlap. |
| New adaptive largest-first restoration | Wrapper `O(H log H + (M+1)V)`, plus merges of M selected sources and `Q`; exceptional repair can merge skipped sources too | Same asymptotic bound, plus call-local `O(V+H)` index/order | For nested chains M can be 1. For independent branches M=H and first-source coverage detection falls back to ordinary merging. Worst case is not asymptotically eliminated. |
| Wallet-side action batching | Can amortize storage round trips over related actions; per-action cryptography/validation remains | Workspace graph, proofs and reservations grow with batch | Supported upstream route for processing improvements, contingent on wallet/provider support. No native compatibility or 500-ms result established here. |
| Broadcast/receiver overlap | Theoretical `max(broadcast,receiver)` instead of their sum after signing | One original proof plus two operation results | Existing page-35 pilot did not show an improvement. Do not replace measured failure with theoretical parallel speedup. |

The greedy proof selection is not guaranteed to find a minimum proof cover. Larger byte size is a useful heuristic for the observed nested chains; it can also reflect unrelated data. Full result validation remains mandatory. Both implementations retain the same ancestor map, so reading fewer source bytes does **not** mean total memory becomes O(1). Durable purchase journals/receipts still grow with purchases and are not included in the one-slot cache bound.

## Implemented algorithm

1. Strictly decode the original payment and preserve its subject TXID.
2. Order the already-retained, caller-scoped ancestor sources by descending byte length.
3. Merge a source only when its subject is not already full. Maintain a call-local set of full subjects rather than repeatedly triggering SDK public mutation scans.
4. If the first source supplies none of the remaining hint subjects, use ordinary remaining merges. Disjoint funding branches do not benefit from repeated coverage scans.
5. Serialize and validate the full result. If skipped subjects still hid missing inputs, merge those retained sources and validate again. Never infer complete ancestry just from a full subject transaction.
6. Reconstruct the original subject and check its TXID. Existing unsigned fee/template checks, signed-byte comparison, durable proof saving and checked sendWith are unchanged.

Code: [payment-ancestors.ts](../../app/client/src/payments/payment-ancestors.ts). No global validity cache, TTL-based financial verdict, new payment protocol or provider setting was introduced.

## Reproduction and limitations

From repository root, install only the isolated comparison package:

```powershell
npm install --prefix spike/evidence/runs/latency-algorithms/sdk4 @bsv/sdk@4.0.1 --ignore-scripts --no-audit --no-fund
cd spike
node --expose-gc --import tsx scripts/benchmark-latency-algorithms.ts
```

The script blocks outbound sockets, HTTP and fetch; no blocked attempts are expected. It compares the frozen previous implementation, actual new app function and the equivalent algorithm on SDK 4.0.1. It uses two warmup rounds then 31 measured samples per case, rotating execution order. Inputs are identical generated structural fixtures; exact subject bytes, fees and complete dependency graphs are checked on every result. Synthetic roots/scripts do not establish mined or script validity. CPU timings exclude wallet RPC, authentication, storage, broadcast and rendering. Four adversarial unit tests additionally cover overlapping order, independent branches, legacy missing-input repair and unresolved/corrupt ancestry refusal.

The scheduling comparison executes the actual one-slot controller with a virtual clock for 24 turns per reading interval. It replays the one native 7,459-ms preparation and 17-ms display observation, including the current 1-second scheduling delay. It is a sensitivity test, **not** 144 new native observations or a qualifying cohort. It asserts exactly one synthetic payment per requested new page.

The default replay embeds only those two documented timing numbers, so reproduction does not require the owner's export. An existing raw export can be selected with `--capture=<path>`; it is read locally and never uploaded.

Local heap deltas are retained diagnostically. They are not peak memory: GC during a function can make a larger allocation workload appear to grow less. Prefer the space bounds and bytes/merge counts over those deltas.

## Measured results

Windows / Node v22.17.1. 31 measured samples per algorithm per case (558 measured proof operations total). Raw report SHA-256: `b8e93ff6c32beb141815b0d7ba91b4beb9d114bc91e8d44b287ef73a16fe3232`. The report records **zero network calls** and all correctness assertions pass.

| Synthetic workload | Previous p50 / p95 | Adaptive p50 / p95 | SDK 4 adaptive p50 | Adaptive median change |
|---|---:|---:|---:|---:|
| overlapping-chain, 16 ancestors / 8 hints, 1,071 bytes | 4.70 / 6.62 ms | 3.55 / 6.07 ms | 4.51 ms | 24.4% faster |
| overlapping-chain, 64 ancestors / 8 hints, 4,095 bytes | 14.14 / 19.51 ms | 11.46 / 16.51 ms | 13.28 ms | 19.0% faster |
| overlapping-chain, 256 ancestors / 8 hints, 16,193 bytes | 54.47 / 122.44 ms | 39.18 / 85.36 ms | 47.88 ms | 28.1% faster |
| overlapping-chain, 256 ancestors / 32 hints, 16,193 bytes | 128.29 / 180.57 ms | 49.94 / 77.76 ms | 59.33 ms | 61.1% faster |
| independent-branches, 64 ancestors / 8 hints, 4,095 bytes | 15.89 / 21.61 ms | 18.27 / 26.18 ms | 21.83 ms | 15.0% slower |
| independent-branches, 256 ancestors / 32 hints, 16,193 bytes | 40.35 / 66.39 ms | 44.96 / 69.40 ms | 53.75 ms | 11.4% slower |

These are local CPU measurements. A roughly 4-KB synthetic proof is size-matched, not transaction-shape-matched to the 4,291-byte native proof. No end-to-end speedup is inferred. In the overlapping 256-ancestor/32-hint case, restoration merges one 16,130-byte source instead of 32 sources totaling 484,856 bytes. Existing 32-hint bounds remain; the server currently advertises only eight. Independent-branch cases are included rather than hidden. This heuristic need not win every timing statistic; a small absolute regression is not a payment-path improvement.

| Reading time before Next | Replayed click p95 | Ready before click / 24 |
|---|---:|---:|
| 0 s | 7476 ms | 0 |
| 2 s | 6476 ms | 0 |
| 5 s | 3476 ms | 0 |
| 8 s | 476 ms | 0 |
| 10 s | 17 ms | 24 |
| 30 s | 17 ms | 24 |

At 8 seconds reading time, the replay still waits about 459 ms for preparation plus its 17-ms display marker. At 10 seconds it is already ready. These thresholds come from one duration, not a native tail-latency guarantee.

## Decision

Verification after the adaptive change: **146 tests pass**, server build, continuous-mode client build and client lint pass. The benchmark's adversarial checks and six 24-turn replays pass with zero network attempts. Native payment latency and both qualifying cohorts remain open.

Keep the deployed single-slot preparation behavior for ordinary sequential reading, and retain its explicit unread-page consent and jump pause. Use the adaptive merge improvement to reduce repeated local proof work. Do not upgrade the app to SDK 4.0.1 solely for latency on the evidence from this workload.

The native page-36 observation remains **7.459 seconds preparation, then 17 ms Next**. Its 1.583-second payer workflow and 2.640-second remote storage span independently exceed 500 ms; those spans are nested within the overall preparation and must not be double-counted. Even eliminating all app proof CPU cannot make that captured critical path fit 500 ms.

For lower first-purchase and rapid-turn latency, the next supported work is a wallet/provider deployment that actually reduces those foreground service waits: confirm negotiated action-batch support, profile proof/root checks versus processor wait versus durable SQL, and measure the original workflow after such a change. Switching SDK, speculative concurrency, skipping acceptance or a faster graph algorithm alone is not evidence of that outcome. No new paid cohort is authorized by this research.
