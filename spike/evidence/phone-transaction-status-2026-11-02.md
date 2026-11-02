# Phone transaction-status check, 2026-11-02

Read-only investigation; no new payment, replacement, rebroadcast, grant or wallet reset.

## Wallet and reader evidence

The user supplied native Browser Activity/details screenshots. The page debit is 28 sats, matching the reader's 5-sat page price plus 23-sat miner fee. A separate **Grant 4 permissions** entry debits 199 sats. Incoming funding is shown as 1,000 and 6,000 sats, and the balance is 6,773 sats, reconciling as 7,000 - 28 - 199. Both outgoing details are dated 29 October and show `unproven` / Waiting for a block.

Full public transaction IDs supplied by the user:

- Permission grant, 199 sats: `6cdc5bb04e2873dc8f142719e84f55a6f43d261d7436885bd196b512c33027ab`.
- Page payment, 28 sats: `06b3820e7caba64aba083cfcd70342a99b7f06a6406c38b05422298ea2f74938`.

## Public lookup results

Both IDs are valid 64-character hex strings. At the check around 07:22 UTC:

| Source | Permission grant | Page payment | Control |
|---|---|---|---|
| WhatsOnChain mainnet `/v1/bsv/main/tx/hash/<txid>` | HTTP 404 | HTTP 404 | Mainnet chain info HTTP 200 at height 973722; genesis transaction lookup HTTP 200 |
| BananaBlocks mainnet WoC-compatible `/api/v1/bsv/main/tx/hash/<txid>` | HTTP 404, Transaction not found | HTTP 404, Transaction not found | Tip HTTP 200 at height 973722; genesis transaction lookup HTTP 200 |
| GorillaPool ARC `/v1/tx/<txid>` | Not queried | HTTP 404, transaction not found | This reports that ARC instance's knowledge, not a global blockchain result |

Bitails also returned 404 for the page and the genesis control, so its response is not used as independent evidence about these payments.

WhatsOnChain transaction pages could not be opened through the web tool; the successful API control requests and parsed API results above are the evidence. Neither 404 nor a local wallet debit proves the transaction's global fate. Mining, rejection, propagation and parent-chain status remain unresolved; do not label the funds lost or the payments mined.

## Next investigation

Requested the options in the native payment-detail three-dot menu to obtain the original transaction/BEEF or broadcast diagnostics without requesting keys or a full wallet database. Inspect original transaction and parent transaction status, then reconcile the same proof/txid. Do not make a replacement payment to test whether the original succeeded.

Code review also found that the client forwards `sendWith` broadcast results without explicitly interpreting individual result statuses. This is a diagnostic/correctness review item, not an established explanation of these two records. The server's `accepted` receipt represents receiving-wallet acceptance; it is not independent proof of mining.

## Acceptance impact

The baseline recorded-spend comparison is complete for the supplied Desktop and Browser records, and phone owned-page resume preserves its recorded total. Broader payment reliability and settlement are not complete. Prioritize this under native payment correctness before another paid timing cohort. Session approval, paid latency, same-identity cross-device resume, native failure/race/stopping tests and the final demo/sharing remain open.
