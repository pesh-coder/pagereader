# Missing saved allowance and local manifest discovery — 2026-10-17

Requirement 2 remains **FAIL / not demonstrated**. The user inspected native Desktop spending settings and supplied two screenshots, first for `localhost`, then the correct `localhost:3108` entry. Both show an empty allowance field and state that the app must ask before spending. No amount/scope is displayed. We instructed the user to leave it unchanged, not manually create a grant. Correct-entry evidence: [screenshot](screenshots/no-saved-spending-localhost3108-2026-10-17.png).

## Source finding and local reproduction

Desktop v3.1.1 declares wallet-toolbox/client 2.14.5 in its [official package manifest](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/package.json). We inspected the published 2.14.5 package separately under ignored `evidence/runs/`; application dependencies were not changed. Its `normalizeOriginator` strips ports, and the spending/grouped permission flow then fetches `http://localhost/manifest.json`. The installed reference 2.14.9 has the same behavior. Pagestream previously served its manifest only at port 3108; the no-port request failed. This is a source-backed compatibility explanation, not proof of a captured manifest request from the running Desktop binary.

`test/manifest-discovery.test.ts` reproduces both outcomes with the official reference manager, a synthetic empty wallet and intercepted manifest responses. Every permission request is automatically denied by the fixture; no grant token or action is created:

1. `originator: localhost:3108` with missing hostname-level manifest fetches `http://localhost/manifest.json` and falls back to a per-action spending request for the configured page-plus-fee amount.
2. With that manifest available, it requests a grouped permission containing the configured allowance from `src/config.ts` and no separate per-action spending request in that synthetic flow.

The native ordinary Authorize button uses an ephemeral grant in [Desktop's spending handler](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/src/lib/components/SpendingAuthorizationHandler/index.tsx). [BRC-116](https://github.com/bsv-blockchain/BRCs/blob/master/wallet/0116.md) distinguishes ephemeral approvals from persistent monthly spending tokens. Thus earlier ordinary spending approval does not establish a saved allowance, and a persistent grant can have a separate on-chain cost. No new native scope/reset/renewal or silent-payment behavior is inferred here.

## Candidate local compatibility fix

Added an explicitly enabled local development metadata listener:

```powershell
# From spike/
npm run dev -- --local-wallet-manifest
```

The existing reader/API stays at http://localhost:3108/reader/. Only public wallet metadata is also served at `http://localhost/manifest.json`, bound to **127.0.0.1:80**. That listener exposes no auth/payment/ownership APIs; all other paths return 404. It uses the same server public identity and permission declaration as port 3108, with the reader launch URL pointing to the existing port. Public metadata allows cross-origin fetches without credentials. This does not grant anything, change wallet settings, revoke permissions or unpause purchases. It is not a new wallet origin/counterparty or a production HTTPS solution. The wallet's hostname-scoped authority may cover other localhost ports; do not treat those ports as isolated permission cohorts.

The listener is optional; plain `npm run dev` does not enable it. A port conflict reports unavailability rather than stopping the main reader. Current dev run uses this flag; root and port-3108 manifests returned matching permission declarations, with a successful HTTP 200 at the hostname-level URL. No ngrok was started. Previously cached failed manifest discovery can persist in the reference manager for five minutes; elapsed time/cache behavior alone proves no native fix.

Client build/lint PASS; spike build and **38 local tests PASS** (35 catalogue/recovery checks plus three discovery/metadata checks). Native wallet was not called for this discovery investigation. Purchase state remains: two original purchases, four intents, two replay claims, one saved proof; pause present, no live permit. Public preflight evidence: ignored `runs/recovery-preflight-1792249940267.json`; suite log: `runs/catalogue-permissions-suite.log`.

## Next controlled experiment, not run

Prepare a **display-only native grouped-permission inspection**, keeping purchases paused and explicitly blocking page create/sign/send calls. Record the native app/version, exact hostname and request options, allowance amount/scope, all prompts and any permission-token cost estimate. The user should review/cancel, **not approve**, until the grant cost and its scope are understood and explicitly authorized. A grouped request shown is not a successful grant or proof of one approval across twenty paid turns. If only an ordinary per-action prompt appears, preserve the evidence and investigate; do not ask the user to manually insert a budget to manufacture a pass.

The actual saved ~5,000-sat native allowance and one-prompt behavior still need live verification. C2 stays FAIL; C4 and the rest of C1–C11 retain their recorded statuses.

## Native display-only review initiated — 15:45 UTC

The user explicitly requested the next review. A separate operator button in the technical probe calls the generated acquisition helper, verifies mainnet and then invokes the official `waitForAuthentication({})` exactly once. It uses no AuthFetch, paid-page request or create/sign/send action. The one-run browser session record prevents another prompt on reload. The instruction shown before starting was **inspect and cancel/deny, do not approve**; no new native grant expenditure is authorized.

Browser at http://localhost:3108/ started at **15:45:05 UTC**. Paused-mainnet health and the hostname manifest both returned 200. Acquisition and getNetwork succeeded. The selected SDK substrate called `/waitForAuthentication` and is awaiting its native result. The reader/user was asked to report the prompt title, amount, scope and setup cost, then cancel. No prompt wording, native grant or one-prompt pass is inferred from an outstanding call.

Browser transport guards block application `/api/` requests and non-review methods on known wallet HTTP substrates. The review function itself exposes only getNetwork/waitForAuthentication after generated acquisition. Recorded calls contain only public metadata and auth/network review methods, plus a failed auto-substrate getVersion probe; no payment/spending method or paid-page call occurred. Ignored evidence: `runs/native-permission-review-2026-10-17.json`. Do not start a second review if the first remains unanswered or disconnects.

Added a synthetic review test verifying one waitForAuthentication call, denial recording, no payment APIs/actions and refusal before acquisition when the backend is unpaused. Native UI outcome remains pending and overall acceptance statuses remain unchanged.

## Native grouped request observed; call ended rejected

The user supplied [the top of the native request](screenshots/grouped-permission-monthly-2026-10-17.png) and [the protocol/actions section](screenshots/grouped-permission-protocols-2026-10-17.png). The title is **Select App Permissions**, app label **localhost**. The spending section explicitly says **“Let the app spend 5000 each month without asking.”** Visible protocols are `server hmac` (nonce creation) and BRC-29 `3241645161d8`, whose visible scope is **only with this app and counterparty**, with a displayed public-key prefix matching the configured server counterparty. Actions are **Deny All** and **Grant Selected**. No setup/token/miner-fee amount is shown in either supplied image. The user was again instructed to Deny All, not grant.

The browser call finished at **15:46:59 UTC**, state **rejected**, with SDK error `HTTPWalletJSON waitForAuthentication failed with HTTP status 400`. This is consistent with denial/cancellation, but the SDK error alone does not establish which native button was pressed. No retry was issued. The operator control remains disabled for this browser session. Final ignored evidence: `runs/native-permission-review-final-2026-10-17.json`; the earlier pending capture is retained.

**Narrow result: native grouped-permission request display PASS.** The actual native request combines the configured monthly allowance and protocol permissions. This advances requirement 2's evidence beyond a synthetic reproduction. It does **not** establish a saved allowance, its actual accounting/renewal, silent later payments, complete setup costs, one prompt from a clean grant state, or one prompt across twenty turns. Existing grants were not revoked to manufacture a clean cohort. C2 remains FAIL and the other C1–C11 statuses are unchanged.

Browser transport records contain only metadata/health and acquisition/network/authentication review methods, with no application paid-page requests or create/sign/send calls. Persistent purchase/intent/proof records and the global pause remain intact; there is no live-test permit. No page payment was created. Native permission fees are not asserted to be measured by the app's page-fee cap.

Spike build and **39 local tests PASS**. A pre-existing 40ms deadline fixture was corrected to allow zero first deliveries when the whole-call deadline expires before loopback delivery; it still rejects more than one delivery and requires the explicit deadline error. Production transport code is unchanged. The new permission-review test passes denial/no-payment and unpaused-backend refusal cases. Suite log: ignored `runs/permission-review-suite.log`.

Next required experiment is a separately scoped **saved-grant cost review/authorization**, followed by verification of the actual monthly grant and subsequent prompts. Do not approve the configured budget or create a page payment automatically. The displayed monthly ceiling is not a per-session promise or evidence of its full amount being debited at once; separate permission-token setup costs remain unmeasured.
