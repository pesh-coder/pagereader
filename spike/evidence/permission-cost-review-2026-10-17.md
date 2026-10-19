# Saved-permission setup cost review — 2026-10-17

Scope authorized by the user: review grant costs before approving a saved native allowance. **No new native request, saved grant or mainnet transaction was initiated for this review.** Page purchases remain paused. The earlier grouped prompt was rejected; its screenshots show no setup fee.

## What can be established

| Item | Evidence | Meaning |
|---|---|---|
| Monthly authorization | Native screenshot: 5,000 each month | A spending ceiling, not a 5,000-sat setup output/payment. |
| Expected new token allocation for the observed selection | Official-manager offline reproduction: three outputs, 1 sat each | One spending-authorization token, one `server hmac` token and one BRC-29 token. **3 sats allocated to tokens**, assuming these are new rather than renewed grants. |
| Saved Desktop mainnet fee preference | Supported nonsecret `fee-settings.json` currently reads `main:1` | A saved 1 sat/kB preference; not a fresh native grant quote or proof of every storage provider's effective rate. |
| Illustrative new-token transaction | Official SDK fee model at 1 sat/kB, one conventional P2PKH input, either one or eight P2PKH change outputs | About 1.38–1.62 kB and **2 sats modeled miner fee**, so **5 sats modeled token allocation plus fee**. These scenarios are not an upper bound. |
| Exact native setup debit | Not supplied by the native grouped UI; no live grant made | **UNRESOLVED**. Actual input/change selection, renewals, provider fee settings and other transaction details may differ. |

The older real grant cost 239 sats (1 token sat + 238 miner-fee sats) under the earlier fee conditions. The latest paid page cost 6 sats (5 + 1). Neither is an exact quote for the new grouped grant. The application's one-sat page-fee cap is enforced on page actions and **does not cap wallet-internal grant transactions**.

## Reproduction and source boundary

Desktop v3.1.1's [published dependency declaration](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/package.json) pins wallet-toolbox/client 2.14.5. Its inspected `grantGroupedPermission` collects new and renewed requests; `createPermissionTokensBestEffort` batches new tokens (up to 25) into one action, with one 1-sat PushDrop output per permission. The spending amount is an encrypted token field, not the output's satoshi amount. Renewal paths can consume old tokens and use a separate batch; we do not assume the all-new case covers them. [BRC-116](https://github.com/bsv-blockchain/BRCs/blob/master/wallet/0116.md) defines persisted encrypted permission tokens, monthly spending limits and ephemeral versus saved grants.

`scripts/permission-cost-model.ts` uses the official permission manager and SDK crypto with synthetic wallets. It recreates only the three permissions visible in the native screenshots; already-granted auth-message signing is not invented as a fourth item. The underlying createAction is intercepted and throws **before funding/signing/broadcast**. The SDK fee model then sizes synthetic layouts using the captured output scripts. No reader keys, wallet files, native calls or `.env` are involved. All illustrative fee-rate/scenario values live in `src/config.ts`.

Run the installed pinned reference model:

```powershell
# From spike/
npm run review:permission-cost
```

For the separately retained published 2.14.5 source used by Desktop (requires that ignored public-source package inspection to exist):

```powershell
node --import tsx scripts/review-permission-cost.ts --desktop-reference
```

Both 2.14.9 and 2.14.5 produced three 1-sat outputs and a modeled 2-sat fee for both scenarios. The exact 2.14.5 run recorded 1,378 / 1,616 bytes. Synthetic ECDSA length can vary slightly, so byte sizes are not promised for a native action. Ignored evidence: `runs/permission-cost-model-1792252830857.json` (2.14.5) and `runs/permission-cost-model-1792252756089.json` (2.14.9). These are explicitly labeled **OFFLINE_SYNTHETIC_NOT_A_NATIVE_QUOTE**.

## Prepared next experiment — NOT RUN

`src/grant-only.ts` is built as `/grant-only.js` for an explicitly invoked browser experiment. It has no automatic entry point or user-facing grant button. It requires an explicit acknowledgment of **unquoted, app-uncapped native grant costs** before doing anything. This is an operator intent check, not a security replacement for native consent.

A separate persistent `pagestream-native-grant-only-v1` browser journal is written before wallet acquisition. If any attempt is already saved, the helper refuses another request, including after failure/reload; reconcile that attempt instead. Existing payment/review journals are not reset or reused.

The concrete proposed run is:

1. Keep `PAID_REQUESTS_PAUSED`, receiving identity, database, intents and original journals unchanged; do not issue a page permit.
2. At the existing localhost:3108 origin, verify mainnet, pause and the configured declaration. Use generated wallet acquisition. Read a complete baseline of native wallet history with `seekPermission:false`; abort before prompting if that cannot be read without permission.
3. Call `waitForAuthentication({})` once. The user may select **Grant Selected only after explicitly authorizing this grant-only experiment**. Expected request: 5,000 per calendar month plus the shown protocols. The reference wallet normalizes authority to **localhost**, potentially shared across localhost ports, not a separate 3108-only spending budget.
4. Do not call application createAction/signAction, use sendWith, AuthFetch or any paid-page route. The wallet itself may create the on-chain permission transaction(s); their fees are not bounded by the page cap or this model.
5. Read wallet history once afterward, even if the native result fails, and retain the new txids/status/net debits for attribution. A history delta is not automatically labeled a grant fee or a pass. Confirm the actual saved allowance in native UI and inspect the actual transaction(s) before concluding C2/C4 evidence.
6. Never retry an uncertain grant automatically, revoke/recreate permissions to manufacture a fresh cohort, or buy a page in this run.

The helper records all stages and refuses arbitrary wallet methods; its local test injects a failure after a possible debit and confirms exactly one native request, read-only reconciliation, no page calls and no retry. No real grant-only run has been authorized or invoked yet. Further mainnet expenditure requires the user's explicit authorization for this exact scope, with the lack of a native prequote/cap understood.

Overall C1–C11 statuses are unchanged. This review improves fee/setup evidence; it does not complete actual grant accounting, one approval across paid turns or the cross-device spend criterion.

Validation: spike build and **41 local tests PASS**, including synthetic grant shape/fee-model and authorization/no-retry/history-reconciliation guards. Browser confirms the grant-only journal is absent, the prior review remains rejected and no paid-page routes have been requested. Read-only public/SQLite preflight still passes with original records intact (ignored `runs/recovery-preflight-1792253064059.json`). Suite log: `runs/permission-cost-suite.log`. No live grant-only helper invocation has occurred.
