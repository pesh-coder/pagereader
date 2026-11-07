# Phone page-33 pilot — 7 November 2026

The owner supplied a stopped mainnet BSV Browser 1.6.3 capture after the ancestry fix. Page 33 completed and appeared on screen. This is one successful paid turn, not the required 20-turn cohort.

## Results

| Check | Observation |
|---|---|
| Accepted purchase | Page 33, one receipt, 5 sats price + 23 sats miner fee |
| Book ledger | 31 unique accepted transactions, pages 3–33, totaling 868 sats: 155 prices + 713 fees |
| Ancestor reuse | 8 known ancestors; complete proof 3,612 bytes, HTTP payment proof 302 bytes (91.6% smaller) |
| Request to visible frame | 7,073 ms |
| Phone payment workflow | 1,447.4 ms, including preparation 694.4, signing 113.9 and sendWith 532.6 ms |
| Paid HTTP response | 3,338.2 ms |
| Receiver acceptance | 2,434.034 ms inside the paid HTTP response |
| Server authentication / database | 13.271 / 24.023 ms |

Timings overlap: do not add the receiver call to its enclosing HTTP duration, or individual wallet calls to their enclosing workflow. The original-attempt retry also retained its required status check (968.9 ms); this sample does not test removal of that check for a fresh page.

Page-33 transaction: `b025547834475ca59d43719e96ff7309b205972900127f4991cbc5d7add6ab08`.

The preceding read-only recovery sample is marked failed in the export and took 10,278.2 ms. It contains only status/authentication calls, no payment construction or broadcast. The successful explicit retry follows it. Preserve that sample; it is not evidence of another charge. The ledger's accepted state does not independently prove mining or a complete native-wallet audit.

## What this closes and what remains

The bounded page-33 recovery/purchase check passes, and the physical phone demonstrably used known ancestors and compact transport. One turn does not prove the depth limit cannot recur: mining during the pause can also shorten the dependency chain. A sustained native run remains necessary after latency work.

The 500-ms target is still missed. Receiver acceptance alone took 2.43 seconds; the phone payment workflow alone took 1.45 seconds. This single retry is not a statistically comparable improvement over the earlier 13-turn median of 6.51 seconds. The machine report remains UNRESOLVED because the cohort is incomplete and retains the recovery error note.

Next engineering work is to profile verification and remote receiving-wallet storage separately, without serving unpaid content, bypassing proof checks or modifying the installed wallet. Do not request another paid cohort merely to reproduce the known speed failure.

## Retained evidence

- Run: `cd3a78a1-8ee5-4e03-bb17-f14ce0336c75`.
- Original file SHA-256: `b54662988c087080c2d07dc278944541b685740524cdbd9550775ef5aeddc252`.
- Local raw copy: `runs/phone-timings-cd3a78a1.json`.
- Local machine report: `runs/phone-timings-cd3a78a1-report.json`.
- Raw exports remain ignored and are not published. The coding assistant created no payment or wallet grant.
