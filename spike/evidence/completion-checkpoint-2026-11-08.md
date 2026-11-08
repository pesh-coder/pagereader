# Completion work: 8 November 2026

The POC remains incomplete. This checkpoint records work actually performed and the remaining dependencies; it does not treat estimated effort as a guaranteed completion date.

## Changes and checks completed

- Fixed a reader connection race: a wallet acquisition resolving after logout no longer reconnects the app. Capture the connection revision before the lazy wallet-module import as well as native acquisition.
- Serialize page requests, explicit connection/resume and cost reconciliation within each gateway. A competing operation cannot change the selected edition or payment authorization while an original operation is outstanding. The wallet's existing cross-tab lock remains independently enforced. Logout immediately disables spending consent and invalidates asynchronous authenticated responses; an already-submitted transaction may still finish.
- Ignore stale authenticated/history results after logout. In particular, an outstanding native cost lookup cannot overwrite the ledger after the connection changes. Durable wallet proofs, pending debit callbacks and server receipts are retained; logout is not a transaction cancellation or native grant revocation.
- Added regressions for logout during acquisition, logout during paid delivery, competing page/book/session operations, request-lock release after failure, and logout during native cost reconciliation.
- Added a real SDK/AuthFetch/BRC-103 middleware integration test with two independently instantiated clients sharing one synthetic key. They discover the same server bookmark and 34-sat receipt total, retrieve owned content without paying, reject stale bookmark overwrites and isolate strangers/editions/unowned pages. SQLite close/reopen and a fresh server/auth session preserve the bookmark and receipts. Every payment-capable wallet method is prohibited in this test; zero payment calls occurred.
- Ran the official local Wallet's combined no-send creation path and the existing unsigned-then-sign path in isolated file SQLite. Both return complete signed proofs without publication, expose one identifiable `nosend` history record, and permit unsent cancellation by TXID in this installed server-wallet implementation. Full synchronization and the network prohibition remain in place.
- Browser smoke check of the locally built reader: eight books, Pride and Prejudice pages 1 and 2, 390×844 portrait and 844×390 landscape; no horizontal overflow and no wallet-client bundle loaded. Only the library and two public-page API paths were requested. This is browser viewport emulation, not a physical BSV Browser retest. The preview backend has only in-memory state, purchases paused and no receiving wallet.

The full suite passes **123 tests**. Server TypeScript/build, client TypeScript/production build and client ESLint pass. Raw outputs are ignored under `spike/evidence/runs/completion-*`; targeted regression and cross-device integration outputs are adjacent. No real wallet, paid grant, mainnet purchase, production wallet-record change or external message was used for these checks.

## Combined no-send experiment

Run `node spike/scripts/benchmark-receiver.mjs --payer-only` with the isolated dependencies documented in that script. The processor and root/status answers are controlled fixtures; all external network access is prohibited. This uses the full official server Wallet 2.14.9 / SDK 2.8.11 in legacy storage mode, not the installed native wallets.

| Path | Construction call | Separate signing call | Wallet creation/signing calls |
|---|---:|---:|---:|
| Unsigned then sign | 326.7 ms | 563.9 ms | 2 |
| Combined signed no-send | 755.6 ms | none | 1 |

There is only one sample per path, with different synthetic wallets. It is not a controlled speed comparison or a qualifying p95. The combined sample alone exceeds the entire target, before broadcasting, receiver acceptance or rendering. Synthetic wallet change selection produced a 47-sat fee in both cases; that is not a new accepted production fee ceiling. The reader's existing 23-sat ceiling was not changed.

The experiment establishes usable server-wallet primitives, not complete native recovery. `listActions` discovery does not itself reconstruct a lost complete Atomic BEEF, and the observed server cancellation behavior is not proof of Browser/Desktop support. The production payment path is therefore not switched to this candidate. Raw results are ignored `runs/receiver-benchmark/payer-report.json`.

## What is still required to finish

| Workstream | Completed here | Remaining gate |
|---|---|---|
| 500-ms latency | Captured stage attribution, supported local-receiver benchmark, combined no-send experiment, public hosting comparison | A demonstrated faster supported payer **and** receiver path. Existing native page 35 remains 6,406.2 ms. Provider trace still unavailable; no further paid cohort until a candidate has evidence of improvement. |
| Session approval / uninterrupted reading | Session lifecycle races fixed; current BRC-116 scope rechecked; retained original proofs and cross-tab protection | Supported native spending-session budget and allowance accounting, plus sustained reading without proof-depth interruptions. Monthly approval is not a pass. |
| Cross-device / spending | Independent authenticated clients, durable bookmark, exact fee totals, stranger isolation and restart verified locally | Supported same-identity setup on actual Desktop and Browser, then no-purchase owned-page resume and native debit reconciliation. Current real devices have different identities. |
| Faults / phones / demo / learnings | 123-test suite, logout races, physical-device worklist, emulated free reading and updated notes | Physical phone/desktop verification, remaining native original-payment/race cases, qualifying timing cohorts, the ~90-second mainnet story and confirmed team receipt of learnings. |

The original 2–4 / 1–2 / 1–2 / 1–2 day estimates are planning estimates, totaling 5–10 workdays if sequential. They do not bound a wallet/provider fix or delivery of native-device evidence. No completion date is supported while those gates remain unresolved.

The original POC explicitly permits considering next-page prepayment. It is a possible UX latency strategy, not a ban in the brief. It must disclose that leaving can strand an already bought unread page, cannot guarantee readiness under rapid turns and does not repair a payment-chain limit. It is not enabled by this checkpoint.

## Next dependency without more spending

The [provider request](receiver-trace-request-2026-11-08.md) now includes both the existing-payment timing trace and the native spending-session question. The verified official contact is [Project Babbage support](https://projectbabbage.com/contact), `support@projectbabbage.com`. No message has been sent and no reply is claimed. Until a provider-supported path exists, keep latency/session criteria open; do not spend more sats merely to repeat the captured failure.
