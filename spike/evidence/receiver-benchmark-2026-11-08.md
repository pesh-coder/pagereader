# Zero-payment receiver and hosting investigation

The 500-ms requirement remains unmet. This investigation used **zero real sats**, no native wallet, no production keys, no grants and no broadcasts. Production code, wallet storage, receipts and deployment configuration were unchanged.

## Official local receiving wallet

`spike/scripts/benchmark-receiver.mjs` exercises the actual official `Wallet`, `WalletStorageManager` and `StorageKnex` against fresh file-backed SQLite databases. Dependencies were installed separately under ignored `spike/evidence/runs/receiver-benchmark/`: toolbox 2.14.9, SDK 2.8.11, knex 3.3.0 and better-sqlite3 13.0.3; Windows, Node v22.17.1. The production dependency locks were not changed.

Each scenario creates 21 distinct signed BRC-29 receipts with synthetic funding transactions, synthetic parent mining roots and a controlled processor. The chain tracker accepts only those fixture roots. All outbound socket/HTTP/fetch connections are blocked; no blocked network calls occurred. The fake processor is asserted to receive every fresh unmined payment. These fixtures are not real coins or independently mined transactions.

All four scenarios passed 21 fresh acceptances, an idempotent duplicate retry with exactly one owned output and no repost, and a processor-failure refusal with no owned output. Full SQLite synchronization was retained. SQL statements are timed separately from controlled root/processor callbacks.

| Configuration | First receipt | Warm median | Warm sample p95 |
|---|---:|---:|---:|
| SQLite DELETE journal, FULL sync | 2,596.2 ms | 1,885.6 ms | 3,666.6 ms |
| SQLite WAL, FULL sync | 648.2 ms | 649.1 ms | 3,095.0 ms |
| WAL/FULL + 250-ms processor wait | 2,107.6 ms | 423.8 ms | 6,628.8 ms |
| WAL/FULL + 250-ms service-boundary wait | 427.8 ms | 396.3 ms | 626.7 ms |

The warm sample contains 20 receipts per row; p95 uses nearest rank. Cold receipts are retained. These are receiver-only elapsed times, excluding payer work, Internet, HTTP authentication and rendering. The two delay rows inject a fixed wait; they are **not remote StorageClient/RPC benchmarks**. Different run order and large SQL timing variation prevent attributing differences between rows solely to the configuration or injected delay. In particular, the apparently faster delay rows are not evidence that adding latency helps.

The slowest plain WAL receipt took 4,805.6 ms, with 4,599.3 ms attributed to INSERT query waits. The test establishes substantial local SQL write-time variability on this machine; it does not establish its hardware cause or describe the hosted provider. WAL/FULL did not demonstrate reliable sub-500-ms acceptance. SQLite documents [WAL and synchronization behavior](https://www.sqlite.org/wal.html); NORMAL/OFF synchronization was not used to obtain a faster number.

The official [storage documentation](https://github.com/bsv-blockchain/ts-stack/blob/main/packages/wallet/wallet-toolbox/docs/storage.md) supports local SQLite/MySQL and remote StorageClient. The supported local route is therefore feasible to construct, but this experiment does not justify migrating the production receiving wallet. It also cannot reconstruct the production provider's proof/posting/persistence split. Replacing the receiver with a new empty wallet would lose the existing wallet records and is not a migration plan.

Raw report: ignored `runs/receiver-benchmark/report.json`, SHA-256 `3bcfe100e45f9c4a4a3138ac89b7623ada94e8d8677b5bf4aea6b266a7de7745`. The exact isolated npm lock is adjacent, SHA-256 `4fe473470a58eddd3b04b219129a9411d5cab05827ba4e1d7578d75447db16ae`. The script header documents installation and execution; retain that lock for exact dependency replay.

## Read-only hosting evidence

`spike/scripts/benchmark-public-paths.mjs` fetched the same public Holmes page 1 eight times per host, in parallel pairs, without authentication or wallet acquisition. Every response was 200 with page content and no purchase.

| Route from developer computer | First request | Warm median (7) | Warm sample p95 |
|---|---:|---:|---:|
| Current Vercel proxy | 2,024.9 ms | 629.1 ms | 1,210.8 ms |
| Direct Railway | 936.2 ms | 594.9 ms | 622.8 ms |

This follow-up does not reproduce a consistently large warm median proxy penalty: the difference was 34.2 ms. The earlier three-pair comparison remains retained separately. Neither sample is a phone benchmark or proof that an origin/region change would meet the paid-turn target. No routing change was deployed. Raw follow-up: ignored `runs/public-http-path-comparison-2026-11-08.json`.

Railway remains one us-west2 replica. Querying the removed pilot deployment's retained HTTP logs recovered these entries for page 35 on 2026-11-07:

| Railway log timestamp (UTC) | Request | Status | Railway total / upstream duration |
|---|---|---:|---:|
| 20:43:39.705653519 | Page 35 challenge | 402 | 56 / 56 ms |
| 20:43:44.464865122 | Page 35 paid request | 200 | 3,107 / 3,107 ms |
| 20:43:45.784512763 | Bookmark | 200 | 19 / 19 ms |

These correlate with the native capture's handler measurements (48.345-ms challenge and 3,099.130-ms paid handler). The 1,041.6-ms phone challenge thus spends most of its time outside the measured app/Railway upstream span. The 3,869.3-ms paid HTTP response is dominated by its receiver acceptance. The logs do not isolate the phone network, Vercel or wallet RPC costs. Raw logs are retained privately in ignored `runs/railway-pilot-http.jsonl`; IP/user-agent fields are not reproduced here.

Runtime logs contain startup messages, without provider-internal spans. The provider's own service is separate from Railway. No available application log splits its **2,896.538 ms** into root validation, processor submission and persistence.

## Concrete follow-up

Before another paid experiment, obtain the provider trace for the existing page-35 transaction, with the logged UTC interval and original txid from the previous investigation. Required spans: ingress/authentication, BEEF/root verification, processor endpoint/attempts/acceptance wait, SQL persistence, and response formation; include service version and region. This is a request for the existing transaction's logs, not permission to resubmit or create one. No maintainer message was sent.

Independently, the phone's 1,464.1-ms payment workflow exceeds the entire target. A receiver/storage or hosting change alone cannot meet 500 ms. A supported faster payer path must preserve pre-send fee checking, the durable original signed proof, failure handling and accurate spend accounting. Paying ahead changes when money is spent and is not an implemented fix here.

The local configuration and read-only investigation are complete. End-to-end latency, provider trace attribution, sustained depth-limit prevention and native session-permission behavior remain unresolved. No additional paid cohort is justified by these results.
