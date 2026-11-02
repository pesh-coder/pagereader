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

## Original proof and processor history recovered

At approximately 07:53–07:58 UTC, the existing receiving wallet's read-only `listOutputs` returned the original page transaction and its embedded ancestors. Its identity was first compared with the hosted manifest and matched. No phone export, private-key transfer, new transaction or manual rebroadcast was needed. Original proof bytes and raw provider history remain in ignored `evidence/runs/`; they are not committed.

The 226-byte page transaction's original fee is **23 sats**, and its payment plus parent scripts verify with the SDK. It spends output 0 of the **1,000-sat Desktop funding transfer** below. The separate grant's extended-format transaction was retrieved through the actual broadcast processor and its TXID checked before calculating its fee.

| Transaction | Input dependency | Original fee | Arcade status |
|---|---|---|---|
| Page `06b3820e…2f74938` | Funding `da9e4cf1…bec6799`, output 0 | 23 sats / 226 bytes | `SEEN_MULTIPLE_NODES` |
| 1,000-sat funding `da9e4cf1ebefc26d5df25566f352cdc62bee0fa20b1904f7db4ae8b55bec6799` | Confirmed `bfadf011df9520bd96365b819ebd15b04b853de36f54a2cbfe6a6c9ea0f64814`, output 1 | **1 sat / 226 bytes** | `SEEN_MULTIPLE_NODES` |
| Grant `6cdc5bb0…33027ab` | Funding `8047e344…0e56b6`, output 0 | 195 sats / 1,946 bytes; 4 additional sats in permission outputs make the 199-sat debit | `SEEN_MULTIPLE_NODES` |
| 6,000-sat funding `8047e344f66bd367eda864d1328f535ac0e961fa58e654e417f8a047a60e56b6` | `f78f5c629a375c0ac4c81a0b9e8a37e9fe8a4422efb5c8d070cdcdae5f598d6c`, output 3 | **1 sat / 226 bytes** | `SEEN_MULTIPLE_NODES` |

The receiver's stored processing history explicitly records initial page broadcast success at **2026-10-29T16:39:45Z**, followed by `SEEN_MULTIPLE_NODES` on later automatic retries. Its status remains `unmined`, `wasBroadcast:true`. A proof check on 2 November still reports no mining proof. Those are existing provider records; this investigation did not initiate their retries.

Direct GETs to the actual processor, `https://arcade-v2-us-1.bsvblockchain.tech/tx/<txid>`, return HTTP 200 and `SEEN_MULTIPLE_NODES` for all four transactions. Thus the earlier explorer/other-processor 404s **did not mean the original payments were never broadcast**. Both phone debits depend on existing, unconfirmed, 1-sat-fee Desktop funding. Neither dependency can be fixed by changing the fee setting for future transactions. The exact reason they have not been mined remains a miner/provider question; low fees alone are not a proven rejection reason. Arcade's current `/policy` advertises 1 sat/1,000 bytes, and the records do not report a fee rejection.

WhatsOnChain reports the confirmed funding ancestor `bfadf011…` as mined and its output 1 as having no indexed spender (spent lookup 404); it does not know `da9e4cf1…` output 0 (400). This is another difference between processor and explorer views, not independent proof of a double spend.

## Implemented correction and recovery boundary

The client now matches `sendWithResults` to the original TXID, saves `unproven`/`sending`/`failed`/`unknown` with a timestamp, and refuses to continue a fresh paid delivery on failed, pending, missing, mismatched or duplicate results. Recovery no longer swallows that failure. It retains the exact signed proof/request/TXID and cannot create a replacement. `unproven` remains wallet broadcast acknowledgment, never a mining claim. This closes a real reporting/handling gap, **not the outstanding mining dependencies**.

Read-only inspector: `node --import tsx scripts/inspect-payment.ts <existing.sqlite> <txid>`, or `--proof <saved-proof.json> <txid>`. It traces embedded parents, checks fees/TXID consistency and reads both explorers plus Arcade. It prints no raw transaction, remittance or key material. Tested against an older, confirmed Desktop receipt and the recovered phone proof.

Any fee bump would change or add a financial transaction and requires a supported wallet/miner recovery method and an explicit cost before execution. Replacing the page purchase, resetting the wallet or marking its inputs reusable is not a repair. A maintainer handoff with the exact funding dependencies is prepared in [the recovery report](../../docs/phone-payment-recovery-report.md).

## Maintainer explanation and restored setting

The user subsequently supplied the maintainer's confirmation: the Browser payments pay approximately 100 sats/kB, but spend the two Desktop funding transfers that paid 1 sat each (approximately 4 sats/kB). Arcade accepts the lower rate while miners currently taking approximately 100 sats/kB have not mined the Desktop parents, holding up the dependent Browser transactions. This is the maintainer's explanation, supplementing the direct processor records above; the private conversation was not published upstream.

Desktop's original configured rate of 1 sat/kB rounded to an absolute 1-sat fee on each 226-byte transfer. Browser retained its own approximately 100-sat/kB rate; it inherited the unconfirmed input dependency, not Desktop's rate. The user now reports that restoring Desktop reset the setting to 250 sats/kB. Advised setting the custom rate back to **100 sats/kB**, saving and restarting BSV Desktop, then verifying it persists. This rate change is not yet confirmed and cannot alter the original signed transfers. The earlier low-fee recommendation confused processor acceptance with reliable mining and should not be repeated as the POC's working configuration.

## Acceptance impact

The baseline recorded-spend comparison is complete for the supplied Desktop and Browser records, and phone owned-page resume preserves its recorded total. Broader payment reliability and settlement are not complete. Prioritize this under native payment correctness before another paid timing cohort. Session approval, paid latency, same-identity cross-device resume, native failure/race/stopping tests and the final demo/sharing remain open.
