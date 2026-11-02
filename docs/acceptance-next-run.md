# Pagestream: remaining acceptance and next run

Updated 2026-11-02. Seller price remains 5 sats; miner fees are additional. Original session approval and 500-ms targets remain unchanged. No new page payment was made during this investigation.

| Order | Remaining work | Evidence needed to finish |
|---|---|---|
| 1 | Verify owned pages and actual spending on both wallets | Reopen an already-owned page without another debit; match its reader receipt, wallet debit and fee; identify permission costs separately. Phone page 3 is reported owned with 28 sats shown; reconcile rather than assume its native debit. |
| 2 | Resolve one native approval per session | Establish a supported wallet session budget, correct price-plus-fee allowance consumption and silent subsequent purchases. Current monthly grant and per-page app fee exceptions do not pass. No wallet modification or app/server substitute for the wallet limit. |
| 3 | Diagnose and improve paid-turn latency | Fresh stage timings, a demonstrated improvement, then 20 distinct new paid turns per wallet with p95 <=500 ms. Include cold/slow/failed attempts. |
| 4 | Finish phone/cross-device story | Final wallet-disconnected preview test; supported same-identity resume on the other device, correct bookmark and no duplicate payment. Current Desktop/Browser identities differ. |
| 5 | Complete native correctness/stopping tests | Underpayment/replay refusal, original-proof lost-response recovery, concurrent attempts and close-tab observation. An already-submitted transaction may finish. |
| 6 | Rehearse and share | Six-step mainnet demonstration in about 90 seconds; final short learnings and confirmed team delivery. |

## First device run: owned-page verification

The user is setting Desktop's custom rate to 100 sats/kB and restarting it. This is not yet confirmed complete. A rate change applies to future transactions; it does not reprice older receipts.

1. On Desktop/Chrome, open the hosted reader, connect the existing wallet if needed and use **Continue reading** to open an owned page. Record book/page and the displayed book total. Do not select an unowned page or approve a new spending grant just to inspect history.
2. Compare the existing page receipt with the wallet Activity entry: page price, miner fee, total debit and transaction status. Do not send keys, recovery words or full wallet exports. Matching public txid/status and amounts is enough.
3. Close/reopen the reader and resume that owned page. Confirm it displays and the wallet has no additional page-payment transaction.
4. Repeat on the phone for the already-owned Holmes page 3. The prior reader total is 28 sats; check the actual current receipt and wallet record rather than treating the historical counter as new evidence. Opening page 4 is outside this read-only run.
5. Record permission setup transactions separately from page payments. If the wallet requests a paid permission grant or history is unavailable, record the result and keep it unresolved rather than inventing a zero debit.

No timed paid cohort is authorized by this read-only run. New paid testing needs explicit page/fee scope and preservation of any existing uncertain attempt.

## Session-control investigation started

Inspected Desktop v3.3.1 spending/group permission handlers, the published Browser wallet UI from expo-wallet-toolbox 0.10.0 and the installed wallet-toolbox-client 2.14.9 source map:

- Desktop's spending handler passes `ephemeral: singular`; its persistent choices are labeled monthly. The group handler uses `expiry: 0`.
- The Browser's singular spending handler calls `grantPermission` with `ephemeral: true`.
- The permission manager explicitly treats ephemeral grants as one-time, non-persistent authorizations. They do not establish a reusable 5,000-sat reading-session budget.
- Grouped spending grants are created with `expiry: 0`; spending-token lookup describes them as monthly and reports no time-limited expiry. Generic expiry parameters on other permission types must not be mistaken for session expiry on spending.
- These grant methods belong to the wallet's permission manager, not a supported web-app method exposed by BRC-100. Pagestream cannot call a wallet-internal API to create its own session allowance.

Conclusion: no qualifying session-wide mechanism was found in these inspected paths. Confirm with the wallet maintainer whether another supported native control exists. This is not proof about every wallet release. Do not modify the wallet or relabel the monthly grant as a session pass.

Source references: [Desktop spending handler](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.3.1/src/lib/components/SpendingAuthorizationHandler/index.tsx), [Desktop grouped handler](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.3.1/src/lib/components/GroupPermissionHandler/index.tsx), [published Browser permission UI](https://unpkg.com/@bsv/expo-wallet-toolbox@0.10.0/ui/components/ui/PermissionSheet.tsx). Core implementation was inspected in local package source map `spike/node_modules/@bsv/wallet-toolbox-client/out/index.client.mjs.map`, source `../../src/WalletPermissionsManager.ts`, including `grantPermission`, `grantGroupedPermission`, `findSpendingToken` and `buildPushdropFields`.

Question prepared for the maintainer, not sent: "Is there a supported wallet-managed spending allowance that expires with a browser reading session, permits repeated silent page purchases up to a total budget including miner fees, and prompts again in a new session? We found monthly saved grants and one-operation ephemeral grants, but not that session behavior."

## Latency investigation started

The old paid sample records prepare 169.3 ms, sign 57 ms, broadcast 1,411.6 ms, paid HTTP 9,012.6 ms and request-to-frame marker 47,328.4 ms. Its server spans are missing, so assigning the nine seconds to internalization would be speculation. The existing instrumentation can now separate those spans. The old sample must remain in the evidence.

Fresh wallet-free hosted checks on 2026-11-02 returned HTTP 200 for three reads of public Holmes page 1: 1,512 ms, 619 ms and 1,326 ms. These are full response timings from the agent's network, not phone or paid-page measurements. They show the network/hosting path needs its own measurement; they neither establish a universal latency floor nor pass/fail the native paid cohort.

Next measurement: a cold and warm owned-page request on each real device, with wallet/auth, HTTP/server and display spans. This diagnoses the baseline without buying. Only after that should a scoped fresh paid sample identify create/sign/broadcast/acceptance overhead. Do not bypass verification, broadcast, proof durability or receipt commit to make the number smaller.
