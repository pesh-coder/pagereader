# Phone paid-page capture ? 7 November 2026

Source: owner-supplied native BSV Browser 1.6.3 export, run `f37e5149-9f9d-417d-baa8-ef7f72e919b4`, opened 2026-11-07T14:37:32.373Z, mainnet at https://pagereader.vercel.app. Capture was stopped before export. SHA-256 of the unmodified input: `06c832faf8aa61c368627f41642a8885bf24bade9e7762177327ca87e2e786ec`.

Raw input, machine report and stage analysis are preserved locally under ignored `spike/evidence/runs/phone-timings-f37e5149*.json`. Raw native export is not published. The screenshot shows recording, 13 new paid turns, 840 sats and the page-33 diagnostic.

## Findings

- Page 20 recovered and was purchased once in this export. Pages 20?32 provide **13 distinct successful newly paid visible turns**, each matching one accepted 28-sat receipt.
- Page 33 failed at unsigned createAction with WERR_INVALID_OPERATION and the recognized wallet message **Maximum BEEF depth exceeded. Limit is 12**. Both the createAction and aggregate workflow entries carry the same diagnostic; they represent one failed workflow, not two payment attempts. This confirms the depth limit for page 33. The earlier page-20 failure had no specific message, so do not retrospectively label that cause confirmed.
- Page 28 had a roughly 30-second timeout with no HTTP response recorded, followed by a read-only check and one successful purchase. Its precise network/transport cause is not established.
- There are 23 samples: 13 purchases, two unsuccessful explicit turns (28 and 33), and eight unsuccessful/read-only recovery samples. Some recovery exceptions are the app offering an explicit retry, not new payment failures. There are not ten failed charges.
- The ledger contains 30 unique accepted TXIDs, pages 3?32: **150 sats seller prices + 690 sats miner fees = 840 sats**. The new capture accounts for 13 ? 28 = 364 sats; prior 476 + 364 = 840. Separate permission setup costs remain excluded. No page-33 proof or receipt is present in this export. This alone is not an independent audit of all native wallet debits or mining status.
- No duplicate accepted TXID/page appears in the exported ledger. This narrow pass does not prove all concurrency/lost-response cases.

## Measured speed

| Measurement | Median | Range |
|---|---:|---:|
| Explicit request to visible frame | 6.511 s | 5.754?7.614 s |
| Phone payment workflow (prepare, sign, send) | 1.355 s | 1.196?1.604 s |
| Status HTTP request | 0.636 s | 0.449?1.243 s |
| 402 challenge HTTP request | 0.721 s | 0.485?1.316 s |
| Paid HTTP response | 2.665 s | 2.432?4.204 s |
| Server raw wallet internalizeAction | 1.928 s | 1.762?2.104 s |
| Server authentication | 7.731 ms | 6.385?16.812 ms |
| SQLite operations | 13.820 ms | 8.021?24.319 ms |

These durations overlap: server internalization/auth/DB are inside the paid HTTP request, and individual wallet calls are inside the aggregate payment workflow. Do not add all rows. The receiving-wallet adapter times the actual target.internalizeAction call separately from receipt commit. Its implementation is in `spike/src/receiving-wallet.ts`; receiver setup uses the official toolbox client and remote storage in `spike/src/server.ts`.

Nearest-rank descriptive p95 for the 13 successful purchases is **7.614 seconds**, not a qualifying 20-turn p95. Every successful measured turn exceeds 500 ms. The machine report correctly leaves C3 UNRESOLVED because the cohort is incomplete and includes errors; the observed speed requirement is plainly missed. Do not discard failures, join unrelated cohorts, or ask for more purchases merely to reach 20 without addressing the blockers. Empty prompts[] does not prove zero native prompts; this exporter does not automatically observe native UI.

## Cause and next work

The confirmed error matches the official [wallet-toolbox proof builder](https://github.com/bsv-blockchain/wallet-toolbox/blob/master/src/storage/methods/getBeefForTransaction.ts), which throws when proof recursion reaches the configured maximum. This is a dependency/proof-depth bound, not a 12-page price cap, spending allowance or insufficient-funds diagnosis. The exact phone funding branch was not reconstructed by this export.

1. Preserve the original page-33 intent/journal. Existing unsigned-only recovery remains conditional on stable completed wallet history and the same unpaid server request. Do not automatically buy a replacement.
2. Establish a supported wallet solution for proof refresh/funding-coin selection that avoids this limit during continuous reading. Raising an internal depth constant, installing a custom wallet or weakening proof checks is outside this POC. Waiting for mining is a mitigation, not a solution to instant reading.
3. Profile the receiver wallet's ~2-second internalizeAction boundary and the phone's >1-second payment workflow. The current wallet acceptance stage alone exceeds the entire 500-ms budget. Removing one HTTP request or changing the fee does not establish compliance. Preserve payment verification and ownership commit before delivery.
4. After a supported fix or explicitly agreed design change, perform fresh native cohorts on both wallets, retaining failures. Session approval, same-identity resume, remaining fault/race cases and final rehearsal/sharing are still open.

The maintainer message is prepared locally in ignored `spike/evidence/runs/phone-proof-depth-maintainer-message.md`. Nothing was sent to the maintainer.
