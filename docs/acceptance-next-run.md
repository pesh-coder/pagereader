# Pagestream: remaining acceptance and next run

Updated 2026-11-07. Seller price remains 5 sats; miner fees are additional. Original session approval and 500-ms targets remain unchanged. The owner completed phone pages 5 and 6; the coding assistant made no new payment.

**Completed today:** both phone debits and both Desktop funding transfers now show **701 confirmations** on WhatsOnChain and `MINED` on Arcade. Mining-proof endpoints for the two phone debits return 200. The existing mining blocker is closed; a wallet UI refresh may still be needed. All 16 hosted public previews passed without wallet/authentication, and the active reader's no-account audit passed (C7). Mainnet payments have been demonstrated on both wallets (C9); this does not complete the full device story. [Current evidence](../spike/evidence/acceptance-check-2026-11-07.md). The [2 November investigation](../spike/evidence/phone-transaction-status-2026-11-02.md) remains historical evidence of the funding delay.

| Order | Remaining work | Evidence needed to finish |
|---|---|---|
| 1 | Cross-device reading | Phone free previews and owned-page resume at 28 sats passed. Establish supported same-identity resume; different existing identities do not pass the original cross-device story. Local wallet proof/status refresh is still unreported. |
| 2 | Resolve one native approval per session | Establish a supported wallet session budget, correct price-plus-fee allowance consumption and silent subsequent purchases. Phone pages 5 and 6 had zero native prompts and no repeated app fee approval. The monthly grant still does not meet session scope. No wallet modification or app/server substitute for the wallet limit. |
| 3 | Diagnose and improve paid-turn latency | Fresh stage timings, a demonstrated improvement, then 20 distinct new paid turns per wallet with p95 <=500 ms. Include cold/slow/failed attempts. |
| 4 | Complete spending/recovery accounting | Baseline comparison is complete: Desktop 74 sats; phone page 28 sats plus separate grant 199 sats. Verify pending, failed/recovered and cross-device cases without duplicate or omitted costs. |
| 5 | Complete native correctness/stopping tests | Underpayment, remaining replay cases, original-proof lost-response recovery and concurrent attempts. Owner reports no new purchase after closing/resuming; hosted cross-identity proof rejection also passed. An already-submitted transaction may finish. |
| 6 | Rehearse and share | Six-step mainnet demonstration in about 90 seconds; final short learnings and confirmed team delivery. |

## Next device action

**Phone owned-page resume passed:** on 7 November the owner confirmed the same 28-sat book total after reopening/resuming. The two local wallet Activity statuses were not supplied; mining is independently confirmed, but UI proof refresh is not assumed complete.

**Phone free previews passed:** the owner logged out of the app connection and confirmed Holmes pages 1 and 2 both load without errors or a wallet prompt. C1 is closed.

**Page 4 completed:** after the 1-sat cap aborted the unsigned action, the owner approved up to 28 sats and reports page 4 opened for 28 sats in less than a second. Receiver proof confirms 5 sats to seller and 23 sats fee. Native prompt count and the expected 56-sat book total are still to be checked. This rough timing is not a qualifying p95 sample.

**Phone repeat turns and stopping check passed at the reported scope:** the owner confirmed pages 5 and 6 opened without native wallet approvals or another app fee approval. Continue reading created no new purchase after the requested stopping check. The reply did not supply a final total, resumed page or measured close duration; none is inferred. Session expiry and monthly allowance consumption are separate, still-open checks.

**Current blocker: page 20.** The first phone cohort reached owned page 19 and 476 sats, but capture had been attempted from Library and did not start. Page 20 failed during createAction with WERR_INVALID_OPERATION; its original preparing/challenged attempt must be reconciled before another purchase. Do not rerun pages 7?19: they are already owned and cannot count as new paid samples. The latest receiving-wallet payment is mined, despite stale unproven labels in the receiving wallet. The exact phone error cause and unsigned-action state remain unconfirmed. The owner now reports all Activity entries completed. A guarded unsigned-only reconciliation is implemented, pending its native check. Refresh the app, resume owned page 19 and tap Next once: the saved attempt is checked read-only before any purchase offer. Report the check result. Do not start another paid cohort or reset wallet data.

**Capture UI corrected:** Start is disabled until an owned page is open and an installed version is entered. The reader header now shows Recording and the paid sample count. Do not begin another paid cohort until the page-20 failure is resolved and this indicator is visibly active. Preserve this failed cohort as functional evidence even though no timing file was created. A fresh 20-page cohort needs a newly agreed page range/bound after recovery, not an automatic restart of the previous run. Confirm Desktop's 100 sats/kB setting before its separate native run.

## Historical device evidence, 2 November

The user confirms BSV Desktop has restarted after the fee-setting step. Desktop's reader shows page 3 at 62 sats, page 5 at 6 sats and page 6 at 6 sats: 15 sats in page prices plus 59 sats in fees, totaling 74. The supplied result explicitly says **Wallet totals checked for 3 payments**, confirming the current Desktop wallet-cost match. Individual mining statuses and a fresh Desktop reopen/no-new-debit observation were not supplied. The configured rate has not been independently read back. A rate change applies to future transactions; it does not reprice older receipts.

The phone's supplied panel shows accepted page 3 at 5 sats plus a 23-sat fee, totaling 28 sats. The user confirms reopening resumes with that same total. Subsequent native wallet screenshots now independently show a 28-sat Pagestream debit and a separate 199-sat **Grant 4 permissions** debit. Wallet activity shows incoming amounts of 1,000 and 6,000 sats and a balance of 6,773 sats: 7,000 - 28 - 199 = 6,773. This closes the baseline recorded-spend comparison, replacing the earlier missing phone-history result with direct wallet evidence. No second page-payment debit is shown in the supplied history. The entire wallet's historical completeness and all future payment/failure/race cases are not established by these screenshots.

Both outgoing detail screens are dated 29 October 2026 and display `unproven` / **Waiting for a block**. This is the wallet's reported proof state, not independent evidence that the transactions are still unmined. Public blockchain checks are pending full transaction IDs; screenshot prefixes/suffixes are insufficient. Requested the full IDs for the 28-sat page payment and 199-sat grant. No new purchase, replacement payment, rebroadcast or wallet reset is needed for this check. The user requests an updated remaining-items list after each completed item.

The IDs were subsequently supplied: WhatsOnChain and BananaBlocks both return 404 for each, with successful mainnet tip/genesis controls. See [transaction-status evidence](../spike/evidence/phone-transaction-status-2026-11-02.md). Recorded-spend comparison is closed; transaction settlement/propagation is now an active payment-correctness investigation, not a reason to buy again.

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
