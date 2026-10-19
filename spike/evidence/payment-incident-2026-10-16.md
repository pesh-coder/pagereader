# Payment-cost and delayed-approval incident — 2026-10-16

## Confirmed

The reader supplied a BSV Desktop spending prompt for **62 satoshis**, an `auth message signature` protocol-access prompt, and a page-3 success screenshot whose app counter showed `Spent: 5 sats + fees not yet measured`. The reader also reports two 62-sat debits associated with delayed approval and no delivered page. Those failed debit IDs have not yet been supplied; their exact count, target pages, recipients and fee breakdown remain to be reconciled.

Server database: one confirmed purchase, edition page 3, **5 sats** received, txid `4b2e989eab3cbc6034a7826017b127bd0cba32a8719113b5953f9cbaed6ef709`. Page 4 remains challenged, no submitted txid. The old phone page-3 challenge remains separately preserved. No incident intent/purchase was reset or deleted.

The successful transaction and its parent were fetched read-only from What's On Chain's mainnet API:

- [Page-3 transaction](https://api.whatsonchain.com/v1/bsv/main/tx/hash/4b2e989eab3cbc6034a7826017b127bd0cba32a8719113b5953f9cbaed6ef709).
- [Input-source transaction](https://api.whatsonchain.com/v1/bsv/main/tx/hash/f78f5c629a375c0ac4c81a0b9e8a37e9fe8a4422efb5c8d070cdcdae5f598d6c), output 7.

| Item | Sats |
|---|---:|
| Source output spent | 5,000 |
| Payment output 0, server receipt | 5 |
| Change output 1 | 4,938 |
| Miner fee = input minus all outputs | 57 |
| Net debit = input minus change | **62** |

This is one verified transaction, not an assumed breakdown for every reported debit. It is 226 bytes, implying approximately 0.252 sats/byte paid in this transaction; the wallet/provider fee-policy setting has not been verified. No fee setting was changed. No reader wallet call or new transaction was needed to obtain the public-chain data. SDK `Transaction.getFee()` reproduces 57 sats from the saved public serialized transaction/input-source fixture in `test/fixtures/page3-mainnet.json`.

## Application gaps

- The app counted the 5-sat recipient payment while leaving fees unknown. This fails C4's accurate-total-spend target. It did not justify describing the experience as effectively a 5-sat total debit.
- Source inspection confirms SDK AuthFetch commits a wallet action before submitting the paid HTTP request. The client retained txid/payment subtotal, but did not durably retain the complete original payment proof for recovery. A receipt never reaching the server cannot be recovered just by querying server ownership.
- Pinned SDK AuthFetch has a hardcoded 30-second authenticated-response deadline; simplified transport and server middleware also default to 30 seconds. Prompt delays can interact with authenticated signing/handshake deadlines. Exact timing and failure method for this incident are not yet available, so a timeout is a hypothesis, not the proven cause.
- The screenshots show separate protocol-access and spending prompt types for localhost, not an established one-grouped-prompt experience. Exact complete per-run prompt sequence still needs the diary. Local-origin manifest/port resolution requires investigation; changing origin from ngrok did not prove grouped permissions would work.
- The user initially reported repeated charged attempts without delivery. Later identified history contains one protocol grant and one successful page payment; the additional 62-sat debit remains unlocated. C6 is UNRESOLVED, superseding the initial user-report-only FAIL classification. There is no verified duplicate page payment and no evidence establishing correct late-approval recovery. An empty server receipt never authorizes a new payment.

## Containment and verified changes

1. Created `data/PAID_REQUESTS_PAUSED`. Server refuses new payment challenges with 503 and no spendable prefix. The marker is checked at request time and survives restarts. Public preview/status and already-owned server reads remain available; original payment submissions are not deliberately disabled. Outstanding native prompts cannot be revoked by this file; reader was told to stop approvals.
2. Restarted the server with this guard, preserving server key, source edition, database, claims and entitlements. Health confirms `purchasesPaused: true`. New client sees paused state before wallet acquisition. No fresh real-wallet test was run.
3. Added SDK-based network-fee capture for future wallet action results, including pending/unresolved states. Missing source values remain unknown. Counter now distinguishes **known spend**, page payments, recorded miner fees and unknown/separate wallet-permission costs. Historical ledgers are not silently assigned zero fees; this is not a claim that all wallet debits are now accounted for.
4. Regression tests use recorded public chain data and local official-SDK signing fixtures, not live coins: verified 5+57=62; missing parents stay unknown; paused purchase path issues no challenge; owned content remains server-readable. No C1–C11 acceptance pass follows from these tests.

## Required before resuming

- Obtain transaction IDs and failed-tab evidence; match every reported debit to its page/intent and wallet fee/permission transactions. Do not refresh/close the failed tab before exporting its existing diary/ledger if that evidence is still present. Read-only browser inspection of the agent's preview profile found no matching paid ledger; it is separate from the reader's active browser profile.
- Recover the original proof/action for charged-but-undelivered pages, then deliver against that existing payment. Do not generate replacement payments, delete intents, or clear ownership. Refund transfers have not been authorized or performed; miner fees are not coins received by the application server.
- Design a supported pre-commit fee/cost review and cap, durable original-proof handoff, late-approval handling and idempotent same-transaction recovery. Potential SDK building blocks include `signAndProcess:false`, `abortAction` and `signAction`; this is a proposal, not an implemented or approved new payment flow. Separate wallet permission costs also require disclosure/measurement.
- Verify prompt grouping and realistic fees before another mainnet run. Keep paid testing paused until this is reviewed. Product implementation remains gated.

## Wallet-history clarification and grant transaction verification

The reader now identifies two history entries: `Grant protocol permission (-239 sats)` with txid `f78f5c629a375c0ac4c81a0b9e8a37e9fe8a4422efb5c8d070cdcdae5f598d6c`, and the successful page-3 payment `4b2e98…f709 (-62 sats)`. They remain concerned another 62-sat debit occurred, but cannot currently locate that entry. Preserve that uncertainty; do not present either a duplicate debit or its absence as proved.

Public-chain verification of the grant and its [funding transaction](https://api.whatsonchain.com/v1/bsv/main/tx/hash/e97a40289820621e0eecc1138c89f7617f9f7e13aded4a814fbe8fc9ff08381c): 88,000-sat input; nine outputs totaling 87,762 sats; **238-sat miner fee**. Output 4 is a **1-sat permission token**, consistent with the pinned wallet permissions-manager implementation and the reader's transaction label. The wallet's reported 239-sat debit matches 238 fee + 1 permission output. Remaining outputs are consistent with wallet change according to that wallet-history debit; ownership of arbitrary outputs is not established by public-chain data alone.

The later page payment spends this grant transaction's output 7 (5,000 sats). These are linked transactions, not two page purchases. The two identified wallet-history debits reconcile as:

| Component | Sats |
|---|---:|
| Permission grant miner fee | 238 |
| Permission token output | 1 |
| Page-payment miner fee | 57 |
| Page payment received by server | 5 |
| **Total identified spendable-balance debit** | **301** |

Only the page's 5 sats went to the application server. The 1-sat permission output represents the grant in the wallet, not an application charge. The funding/setup cost is materially different from the advertised page price and was not accounted for in the app. C2/C4 remain FAIL; C6 reverts to UNRESOLVED because a duplicate page payment has not been verified. Paid testing remains paused. No new reader-wallet operation, reset, recovery transfer or payment was made during this verification.

Recorded permission and page transaction fixtures now have SDK fee regression checks. All 12 local tests pass; they do not verify complete live wallet cost accounting or delayed delivery. The persistent paid-request pause marker remains in place.
