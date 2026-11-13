# Payment-channel algorithm for sub-500-ms paid page turns

The earlier [algorithm research](latency-algorithm-research-2026-11-10.md) optimized local proof CPU (milliseconds). The native captures show the cost is elsewhere: every page is a separate on-chain transaction. The payer runs `createAction` twice (≈550–900 ms each) plus `signAction`. The receiver then runs `internalizeAction` (≈1.8–3.1 s). No faster graph algorithm can remove those calls; only an algorithm that stops doing them per page can.

**Recommendation: a unidirectional (Spilman) payment channel.** One funding transaction opens a 5,000-sat session, exactly the brief's "approve once … up to about 5,000 sats this session". Each page is then **one reader signature** that the server checks locally, and **one settlement** goes on-chain when reading stops. Paired with one page of server credit or one-page preparation, this is the only compared design that the model shows reliably under 500 ms. Prototype, tests and benchmark are offline: no wallet calls, payments, grants or deployments were made.

## How it works

1. **Open (once, at the existing "approve once" step).** Reader and server derive per-channel keys through BRC-42 (`getPublicKey`, protocol `[2,'pagestream channel']`, keyID = channel id). The server can derive the reader's channel key from the reader's identity key, so the channel is bound to that identity. The funding output is `<reader> OP_CHECKSIGVERIFY <server> OP_CHECKSIG`.
2. **Refund first.** Before funding is sent, the server signs a refund to the reader with `nLockTime` in the future and a non-final sequence. The reader verifies it locally. The server can then never hold the funds hostage.
3. **Per page.** The client rebuilds the deterministic state "server gets 5·n sats, reader gets the rest minus a fixed settlement fee". It signs via BRC-100 `createSignature({ data: sha256(preimage) })`, the same pattern as the SDK's own `PushDrop.unlock`, and sends `{channelId, paid, signature}` (171 bytes). The server rebuilds the same transaction and checks that `paid` is exactly one page more. It then verifies one low-S ECDSA signature and stores only that latest signature.
4. **Close (tab closed or idle).** The server countersigns the latest state and broadcasts it: one final transaction, script-checked by the SDK interpreter before broadcast.

Code: [`src/payment-channel.ts`](../src/payment-channel.ts) · tests: [`test/payment-channel.test.ts`](../test/payment-channel.test.ts) · benchmark: [`scripts/benchmark-payment-channel.ts`](../scripts/benchmark-payment-channel.ts).

## Sources (checked 10 Nov 2026)

| Source | Relevance |
|---|---|
| SDK 2.8.11 `PushDrop.unlock` (installed `node_modules/@bsv/sdk`) | Official precedent: app-defined script spends signed through BRC-100 `createSignature` over `sha256(preimage)`. No new wallet API needed. |
| [BRC-100](https://github.com/bitcoin-sv/BRCs/blob/master/wallet/0100.md) | `createSignature` accepts `data` or `hashToDirectlySign`, plus `protocolID`/`keyID`/`counterparty`. |
| [BRC-116](https://hub.bsvblockchain.org/brc/wallet/0116), [BRC-73](https://github.com/bitcoin-sv/BRCs/blob/master/wallet/0073.md) | Level-2 protocol grants are per app and counterparty; wallets SHOULD issue them non-expiring and may pre-declare them in the manifest. Expect one prompt, then silent signatures. **Not yet verified on BSV Browser/Desktop.** |
| [BSV Academy: payment channels](https://docs.bsvblockchain.org/bsv-academy/bsv-infrastructure/transactions-payment-channels-and-mempools/payment-channels) | Funding transaction, off-chain updates, one on-chain settlement; streaming is a named use case. No BRC standardizes channels. |
| [Protocol upgrade history](https://hub.bsvblockchain.org/bitcoin-protocol-documentation/specification/upgrade-history), [sequence & locktime](https://hub.bsvblockchain.org/bitcoin-protocol-documentation/concepts/sequence-and-locktime) | `nLockTime` applies only with a non-final sequence. `OP_CHECKLOCKTIMEVERIFY`/`OP_CHECKSEQUENCEVERIFY` are no-ops after Genesis, so the refund is a pre-signed time-locked transaction, not a CLTV script. |
| [SV Node v1.2.0 (Chronicle)](https://github.com/bitcoin-sv/bitcoin-sv/releases/tag/v1.2.0) | No change to locktime/sequence. Malleability relaxations apply only to version > 1, so keep funding at **version 1** because the refund signature commits to its txid. |
| [Teranode validator](https://github.com/bsv-blockchain/teranode/blob/main/docs/topics/services/validator.md) | Rejects non-final transactions. The design never broadcasts intermediate states: every state is final and held privately, and the refund is broadcast only after its lock time passes. |
| [ARC](https://github.com/bitcoin-sv/arc) | `SEEN_ON_NETWORK` / `DOUBLE_SPEND_ATTEMPTED` callbacks. Accept the funding once it is seen with no double spend. |
| [Code Academy channel example](https://hub.bsvblockchain.org/bsv-code-academy/code-features/code-features/payment-channels) | **Not followed**: it relies on CLTV (a no-op on BSV) and is not a real 2-of-2. |

Bare `OP_CHECKMULTISIG` relays on SV Node, but ARC/Teranode policy for it is unverified, so the prototype uses two plain `OP_CHECKSIG`s.

## Time and space comparison

`N` = paid pages in a session, `P` = page bytes, `B` = proof bytes, `V+E` = proof graph size.

| Algorithm | Per-page work on the critical path | Per-page space / wire | On-chain txs, fees for 100 pages @100 sat/kB | Risk |
|---|---|---|---|---|
| A. On-chain payment per page (current) | 2×`createAction` + `signAction` + receiver `internalizeAction` (proof validation `O(V+E)`, broadcast, storage) | `O(B)` proof, ≈4 KB; receipts `O(N)` | N txs; ≈2,300 sats fees | Chain depth grows (the earlier "BEEF depth 12" failure) |
| B. A + one-page preparation (deployed) | Same work, moved off the click when dwell ≥ ≈7.5 s | + `O(P)` | Same as A | One prepaid unread page |
| C. A + deferred receiver acceptance | Removes `internalizeAction` only; payer `createAction` remains | + queue `O(k)` | Same as A | Unaccepted payments served |
| D. Channel over AuthFetch | `O(1)`: one ECDSA sign + one verify + 4 auth wallet calls | `O(1)`: 171-byte update; server keeps 79 bytes per channel | **2 txs** (funding + 265-byte settlement); ≈50 sats fees | Settle before refund lock time |
| **E. Channel, signature-authenticated request** | `O(1)`: one `createSignature` + one round trip + one verify + one durable write | `O(1)` | 2 txs; ≈50 sats | as D |
| F. E + one-page preparation | E, moved off the click when dwell ≥ ≈1.5 s | + `O(P)` | 2 txs | One prepaid unread page (5 sats) |
| **G. E + one page of server credit** | Click reveals the already-delivered page; its signature is sent in the background | + `O(P)` | 2 txs | **Server** exposure ≤ 5 sats; reader never pays for an unread page |
| H. Wallet action batching (upstream) | Fewer storage trips; per-action crypto/acceptance remains | grows with batch | N txs | Needs wallet/provider support |

## Measured and modelled results

Windows / Node v22.17.1, SDK 2.8.11, offline (zero blocked network attempts). **Measured CPU** over 300 pages: channel client build+sign p50 **5.7 ms**; server accept p50 **4.7 ms**; local CPU of one on-chain P2PKH payment and receipt p50 19.8 ms. The on-chain figure excludes every wallet/provider I/O cost that dominates natively. The settlement is 265 bytes (27 sats at 100 sat/kB).

**Modelled click-to-visible latency** (ms, p50/p95, share under 500 ms) comes from 20,000 seeded resamples per cell. It combines the owner's native BSV Browser 1.6.3 durations (60 `createSignature`, 16 paid turns with server timings) with 60 warm round trips to the Railway backend (p50 390 ms, p95 430 ms). The inputs are in [`payment-channel/native-and-network-samples.json`](payment-channel/native-and-network-samples.json), durations only.

| Algorithm | dwell 0 s | 0.5 s | 1 s | 2 s | 5 s | 10 s |
|---|---|---|---|---|---|---|
| A. Current, pay on click | 6449/7614 (0%) | 6511/7614 (0%) | 6449/7614 (0%) | 6511/7614 (0%) | 6449/7614 (0%) | 6449/7614 (0%) |
| B. A + one-page preparation | 7466/8631 (0%) | 7028/8131 (0%) | 6528/7631 (0%) | 5466/6631 (0%) | 2528/3631 (0%) | 17/17 (100%) |
| C. A + deferred acceptance | 4462/5514 (0%) | 4462/5514 (0%) | 4462/5514 (0%) | 4462/5514 (0%) | 4593/5514 (0%) | 4593/5514 (0%) |
| D. Channel over AuthFetch | 773/867 (0%) | 772/866 (0%) | 772/861 (0%) | 773/862 (0%) | 772/860 (0%) | 772/863 (0%) |
| E. Channel, signed request | 486/535 (78%) | 486/536 (78%) | 486/535 (78%) | 486/536 (78%) | 486/535 (78%) | 486/536 (78%) |
| F. E + one-page preparation | 1486/1536 (0%) | 986/1036 (0%) | 486/537 (78%) | 17/17 (100%) | 17/17 (100%) | 17/17 (100%) |
| **G. E + one-page credit** | 486/535 (78%) | **17/36 (100%)** | 17/17 (100%) | 17/17 (100%) | 17/17 (100%) | 17/17 (100%) |

What the numbers say:

- **The channel cuts the cost of a paid turn ≈13× (6.45 s → 0.49 s p50).** The remaining cost is almost entirely one network round trip (≈390 ms), not payment work.
- **Strict pay-before-reveal (E) is borderline at 500 ms.** That limit is server distance; no payment algorithm removes it. Moving the backend closer to readers or adding edge acceptance would help E. AuthFetch's four extra wallet calls (D) push it over.
- **G is the best fit.** It is under 500 ms for every dwell ≥ 0.5 s, and only rapid double-clicks wait the ≈0.5 s remainder. "Stop reading, stop paying" holds literally, because the reader signs only for pages they reveal. The server risks at most one 5-sat page per channel. F reaches 100% only from a 2 s dwell and makes the reader prepay one page.
- **Fees fall ≈46×** (≈2,300 → ≈50 sats per 100 pages), addressing the learning that fees overwhelmed the 5-sat price. Page payments no longer chain, which removes the BEEF-depth failure mode.

## Limitations

- Model, not native measurement: no native channel exists yet. Round trips were measured from the development machine, not the phone's mobile network.
- One permission prompt for the new protocol, followed by silent signatures, is what BRC-116 recommends; BSV Browser/Desktop behaviour is unverified.
- Opening still costs one ordinary funding payment (≈4–6 s, once). Accept funding at ARC `SEEN_ON_NETWORK`; the 0-conf double-spend risk is the same as today's per-page acceptance, now once per session.
- The server must durably store the latest signature and settle before the refund lock time (e.g. 24 h); a crashed server forfeits only to the reader's refund. The reader's change output should be a BRC-29-derived key so the reader's wallet can `internalizeAction` the settlement.
- Funding needs its txid before broadcast so the refund can be signed: create with `noSend`, then `sendWith`. The app already uses this pair.

## Integration (10 Nov, owner-approved)

Implemented as "reading sessions" alongside the unchanged per-page payment, which remains the fallback.

| Part | Where | Behaviour |
|---|---|---|
| Shared core | [`payment-channel.ts`](../../app/client/src/payments/payment-channel.ts) | States, refund, sighash, verification and settlement; bytes in/out so client and server SDK copies never mix objects. |
| Reader | [`channel-session.ts`](../../app/client/src/payments/channel-session.ts), [`gateway.ts`](../../app/client/src/reader/gateway.ts), [`App.tsx`](../../app/client/src/App.tsx) | Open: BRC-42 key cross-check → unsigned `createAction` (noSend) → fee/template check → `signAction` → server refund signature verified → `sendWith` → activate. Page: one `createSignature` + one plain POST; the response carries the next page on credit, shown at once on Next while its payment runs in the background. Unconfirmed states are journalled and resent, never re-signed differently. End session / leave (beacon) → one settlement → change `internalizeAction`ed into the reader's wallet. Sessions opened in an earlier visit are settled, never reused. |
| Receiver | [`channel-service.ts`](../src/channel-service.ts), [`probe.ts`](../src/probe.ts), [`server.ts`](../src/server.ts) | Offer (BRC-29 payout script), fund (verifies funding output, signs refund), activate (broadcast via wallet services), pay (O(1) verify, ownership + receipt, credit with ≤2 forfeits), settle (countersign, receive payout as BRC-29 payment; zero-payment settlements broadcast). Idle sessions settle after 10 min. Session fees (funding + settlement) are recorded once on the first page. |
| Switches | `PAGESTREAM_CHANNELS_ENABLED=1`, `PAGESTREAM_CHANNEL_IDENTITIES=<keys>\|all`, `PAGESTREAM_CHANNEL_MAX_SATS` (backend); `VITE_PAGESTREAM_SESSIONS=1` (frontend build) | With the backend switches unset, the routes do not exist, the wallet manifest is unchanged, and no reader sees the session offer. |

Verification: 161 tests pass (7 channel core, 7 receiver/session end-to-end, 1 gateway, plus all existing), both builds and lint pass. An offline browser preview ([`preview-sessions.ts`](../scripts/preview-sessions.ts)) runs the real reader, gateway and receiver with a synthetic wallet delayed to the native timings (createAction 600 ms, createSignature 49 ms, 390-ms round trip). It measured opening + first page at 2.2 s once, then Next in **8–23 ms** after 0.5–1.5 s of reading and 175 ms after 0.3 s. Ending the session returned 45 of 100 sats (5 pages, 30-sat settlement fee) to the synthetic wallet. These are offline measurements, not native observations.

## Native pilot, 11 Nov (BSV Browser 1.6.3, owner phone, mainnet)

Owner-approved, capped at 100 sats per session, enabled for one identity only.

| Observation | Result |
|---|---|
| Free signing check (5 channel signatures) | 39, 35, 34, 33, 33 ms |
| First page after approval (page 37) | 621 ms (46-ms signature + one 529-ms request) |
| Next, pages 38–44 | **19–31 ms** each, shown from session credit |
| Wallet actions during pages | none beyond one `createSignature` per page; one funding approval |
| Receipts | 8 pages × 5 sats + 72 sats session fees (42 opening + 30 settling), recorded once on page 37; book total 952 → 1,064 sats |

The capture's "0 paid during Next" was a classifier gap: it only recognised on-chain page payments. Session payments are now classified (`payment: 'session'`) and qualify in the timing report with their accepted receipt.

## Changes after the pilot, 11 Nov (owner direction)

- **Sessions are the payment flow.** The purchase panel offers only "Approve up to 5,000 sats and open page N", matching the POC's "approve once … about 5,000 sats this session". Earlier per-page attempts can still be checked and recovered; the per-page fee consent UI is gone.
- **First page also instant.** Activation delivers the requested page on credit, so it appears as soon as the wallet approves (the pilot's 621-ms first turn becomes a credited display); its signature follows in the background.
- **Removed test-only features:** "Pay for one next page ahead" (module, tests, preview, build flags), the signing-check button, and the always-visible capture bar. The timing capture stays in the wallet menu for the final timed demo and records only while running.
- **Backend:** `PAGESTREAM_CHANNEL_IDENTITIES=all`, `PAGESTREAM_CHANNEL_MAX_SATS=5000`.

Verification: 145 tests pass (fewer than before only because read-ahead tests were removed), server/client builds and lint pass. The page-turn latency target still needs the final timed run on both Desktop and phone.

**Budget includes fees (13 Nov, owner direction).** "Up to 5,000 sats per session" now bounds everything the wallet spends: the session locks 5,000 − 60 = 4,940 sats (60 = the app's opening-fee cap), so locked sats + opening fee ≤ 5,000, and the 30-sat settling fee comes out of the locked sats. Up to 982 pages per session.

**Server moved to Railway EU West (13 Nov, owner-approved).** Measured from the development machine in Kenya, regions near Railway's had TCP round trips of ~170 ms (EU West), ~230 (US East), ~300 (US West) and ~320 (Southeast Asia). No session was open; the ledger was snapshotted (`VACUUM INTO`, integrity ok, 47 purchases, 3 bookmarks, 1 session, 42 intents; kept locally, git-ignored), then the service and its volume moved with `railway scale eu-west=1 us-west=0`. After the move the same counts and integrity check passed. Warm `/health` through the reader's Vercel path: **p50 390 → 261 ms, p95 430 → 296 ms**. Expected Next → payment accepted ≈ 40-ms signature + one ~260-ms round trip, to be confirmed by the native timed runs.

**One session per wallet, across books (13 Nov, owner direction).** A session now belongs to the wallet identity, not a book: one approval and one set of fees covers every book until the reader ends it or leaves. Each payment names its book and page (`channel_payments.edition`), credit is per book, a payment for one book cannot be replayed for another, and a second session cannot open while one is open. Existing rows migrate additively. After switching books the reader loads that book's purchases before paying, so owned pages never trigger a payment. The timing capture is independent of sessions and can start on any page once the wallet is connected.

