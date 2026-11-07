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

The hosted `/api/library` returned eight books. Explicit wallet-free GETs of both public pages for each edition returned HTTP 200 and nonempty paragraphs: Holmes, Pride and Prejudice, Frankenstein, Dorian Gray, Dracula, Meditations, Metamorphosis and Alice. No authentication or payment headers were used. Response times from the agent network ranged from 389 to 973 ms; these are neither native-device tests nor paid-turn measurements. Health returned mainnet, payment-ready and purchases enabled.

The owner then logged out of Pagestream's app wallet connection on the physical phone, opened Holmes from Library and confirmed **both pages 1 and 2 load, with no errors or wallet prompt**. Together with the existing Desktop observations and hosted checks, this closes C1 and the earlier phone free-page failure. No phone paid page was requested in this preview check.

## No-account audit: pass

Reviewed the active reader entry (`app/client/src/main.tsx` → `App.tsx`), reader components/gateway, wallet acquisition helper, payment routes and SQLite schema. The active reader has no signup, email, password, card or profile form. Wallet acquisition obtains a public identity key, and the app stores purchases/bookmarks against that identity and edition. Generated scaffold features outside the active reader are not evidence of a reachable reader account flow. Existing Desktop and phone purchase observations support the source audit. This closes C7; it does not establish that the two wallets share an identity.

## Still open

### Page-4 attempt: fee cap, no new payment

After the free-preview check, the owner reported that confirming did not open the next page and native wallet Activity contained no new outgoing transaction. A read-only receiving-wallet `listActions` check still showed six historical completed incoming actions and no new page payment. The subsequent phone screenshot identifies **page 4**, a **23-sat wallet fee quote**, and an **unsigned payment cancelled because it exceeded the initial 1-sat cap**. The reader total remains 28 sats. This establishes a fee-cap abort, not another mining delay or a successful new purchase; the earlier possibility that the user merely reopened page 3 was not the cause of this screenshot.

The screenshot offers a separate approval of **up to 28 sats for page 4** (5 price + up to 23 fee), within the prepared one-page test bound. The ordinary 1-sat retry cannot accept that fee. Prompt count after a signed purchase, the new total and timing are still pending; this aborted attempt is retained as diagnostic evidence, not a qualifying paid latency sample.

The introductory panel was clarified to show its target page number, explain that already-owned pages are free, and distinguish the initial fee limit from a wallet quote. This is a copy correction, not an increase to the cap or a claim that the payment failure was fixed. Client build/lint pass; the local wallet-free preview confirms the revised panel wording without initiating wallet calls.

The owner subsequently confirmed that phone owned-page resume still displays the same **28-sat total**. This closes that read-only resume/counter check; the reply did not state the two wallet Activity statuses, so their local proof refresh is not assumed complete.

Still open: native wallet status refresh; supported same-identity cross-device resume; native session approval/allowance enforcement; paid p95; remaining negative, recovery, race and stopping tests; 90-second demo and team receipt. Recorded spending already matches the supplied Desktop and phone records, but broader failure/pending accounting still needs verification.
