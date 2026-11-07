# Acceptance check, 2026-11-07

Read-only checks. No wallet reset, new payment, permission grant or manual rebroadcast.

## Existing transactions: mining blocker closed

WhatsOnChain returned HTTP 200 and 701 confirmations for all four transactions below. The actual broadcast processor, Arcade, independently returned HTTP 200 and `MINED` for each.

| Transaction | TXID |
|---|---|
| Phone page payment, 28-sat debit | `06b3820e7caba64aba083cfcd70342a99b7f06a6406c38b05422298ea2f74938` |
| Its 1,000-sat funding parent | `da9e4cf1ebefc26d5df25566f352cdc62bee0fa20b1904f7db4ae8b55bec6799` |
| Phone permission grant, 199-sat debit | `6cdc5bb04e2873dc8f142719e84f55a6f43d261d7436885bd196b512c33027ab` |
| Its 6,000-sat funding parent | `8047e344f66bd367eda864d1328f535ac0e961fa58e654e417f8a047a60e56b6` |

For both phone debits, WhatsOnChain's `/tx/<txid>/proof/bump` also returned HTTP 200. Their block hash is `00000000000000001ed3ba801772a80da8b11459365bdca5148b38d6744661ce`, with block timestamp **2026-11-02T15:18:46Z**. This is the block's timestamp, not a measurement of the exact time each node observed mining. The transactions subsequently mined after the 2 November investigation; no recovery action by this agent caused that result. The cause/method of their eventual inclusion is not established by these lookups.

Sources: `https://api.whatsonchain.com/v1/bsv/main/tx/hash/<txid>` and `https://arcade-v2-us-1.bsvblockchain.tech/tx/<txid>`. These current results supersede the earlier unresolved mining status, not the historical low-fee finding. A local wallet may still need to refresh its proof. Requested that the owner refresh the two phone debit statuses and resume the existing owned page without buying.

## Hosted previews: 16/16 pass

The hosted `/api/library` returned eight books. Explicit wallet-free GETs of both public pages for each edition returned HTTP 200 and nonempty paragraphs: Holmes, Pride and Prejudice, Frankenstein, Dorian Gray, Dracula, Meditations, Metamorphosis and Alice. No authentication or payment headers were used. Response times from the agent network ranged from 389 to 973 ms; these are neither native-device tests nor paid-turn measurements. Health returned mainnet, payment-ready and purchases enabled. A disconnected-wallet physical-phone retest is still required for C1.

## No-account audit: pass

Reviewed the active reader entry (`app/client/src/main.tsx` → `App.tsx`), reader components/gateway, wallet acquisition helper, payment routes and SQLite schema. The active reader has no signup, email, password, card or profile form. Wallet acquisition obtains a public identity key, and the app stores purchases/bookmarks against that identity and edition. Generated scaffold features outside the active reader are not evidence of a reachable reader account flow. Existing Desktop and phone purchase observations support the source audit. This closes C7; it does not establish that the two wallets share an identity.

## Still open

The owner subsequently confirmed that phone owned-page resume still displays the same **28-sat total**. This closes that read-only resume/counter check; the reply did not state the two wallet Activity statuses, so their local proof refresh is not assumed complete.

Still open: native wallet status refresh; final disconnected-wallet phone previews; supported same-identity cross-device resume; native session approval/allowance enforcement; paid p95; remaining negative, recovery, race and stopping tests; 90-second demo and team receipt. Recorded spending already matches the supplied Desktop and phone records, but broader failure/pending accounting still needs verification.
