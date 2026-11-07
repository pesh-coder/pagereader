# Phone payments: recovery report

**Update, 2026-11-07: the mining blocker is closed.** All four transactions below now return 701 confirmations on WhatsOnChain and `MINED` on Arcade. Mining-proof endpoints for both phone debits return HTTP 200. No new page purchase or manual rebroadcast was made by the agent. A local wallet status refresh remains to be observed. [Current checks](../spike/evidence/acceptance-check-2026-11-07.md). The report below preserves the earlier investigation; it is no longer a request to recover unmined transfers.

Prepared 2026-11-02. Not published or sent externally.

BSV Desktop 3.3.1 funded BSV Browser 1.6.3. Browser's 28-sat Pagestream purchase and 199-sat permission grant remain unproven. We recovered the original purchase proof through the receiving wallet and checked the processor records, not just explorer pages.

The processor at `https://arcade-v2-us-1.bsvblockchain.tech/tx/<txid>` reports **SEEN_MULTIPLE_NODES** for all four transactions:

| Purpose | TXID | Fee |
|---|---|---|
| Page: 5 sats to seller, 23 fee | `06b3820e7caba64aba083cfcd70342a99b7f06a6406c38b05422298ea2f74938` | 23 sats / 226 bytes |
| Its 1,000-sat funding parent | `da9e4cf1ebefc26d5df25566f352cdc62bee0fa20b1904f7db4ae8b55bec6799` | 1 sat / 226 bytes |
| Grant: 4 permission outputs, 195 fee | `6cdc5bb04e2873dc8f142719e84f55a6f43d261d7436885bd196b512c33027ab` | 195 sats / 1,946 bytes |
| Its 6,000-sat funding parent | `8047e344f66bd367eda864d1328f535ac0e961fa58e654e417f8a047a60e56b6` | 1 sat / 226 bytes |

WhatsOnChain and BananaBlocks do not find the page or its 1,000-sat parent. The receiver's stored history records page broadcast success on 29 October and subsequent automatic retries; no mining proof has arrived. Its funding chain reaches a confirmed ancestor. The page and parent scripts verify in the SDK. Arcade currently advertises 1 sat/kB in `/policy`, so we have no recorded fee-policy rejection to cite.

**Requested maintainer/provider action:** investigate why these original funding dependencies remain unmined despite `SEEN_MULTIPLE_NODES`; identify a supported recovery path for the original transaction chains. If a fee bump is needed, specify which wallet performs it, whether it preserves the existing child payments, and its maximum additional debit before execution. Please do not advise a replacement page purchase, wallet reset or releasing the original inputs.

Desktop has since been restarted after changing its fee setting to 100 sats/kB. That affects future transactions and cannot change these already-signed transfers. No new transaction or manual rebroadcast was made in this investigation.
