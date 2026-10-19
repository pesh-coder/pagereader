# Authorized grant-only run — 2026-10-17

The user explicitly authorized one grant-only experiment after reviewing the proposed 5,000-sat monthly allowance, the approximately 5-sat synthetic setup model, and the absence of a native setup-cost quote or application-enforced cap. Authorization does not include page purchases, repeat grants, or resetting an uncertain attempt.

## Launch checkpoint

- Existing development server was listening on port 3108 and the optional metadata-only listener on 127.0.0.1:80, both owned by process 22564. No second server was started and no ngrok was used.
- Shared browser tab `tab_5` was at `http://localhost:3108/`. The persistent `pagestream-native-grant-only-v1` journal was absent. The previous display-only review remained rejected.
- The tab still had the prior display-only transport guard, which excludes `listActions`. Navigation was requested to obtain a clean page before installing the grant-only transport guard or invoking the prepared helper.
- Navigation timed out. Subsequent evaluate and open calls explicitly reported that the T3 Code browser automation host was unavailable. No grant-only helper invocation, new wallet request, or approval occurred in this launch attempt.

## Resume

### Saved allowance verified in native UI

The user supplied `screenshots/saved-localhost-monthly-5000-2026-10-17.png`, showing the **localhost** Spending entry with **Monthly spending limit: 5,000 satoshis**, **6 satoshis spent**, and a Revoke control. This verifies a saved native monthly allowance under hostname localhost. The separate localhost:3108 entry remains distinct in the UI and showed no allowance; no manual limit was entered and no second grant was requested.

The UI's 6-sat spending counter is an independently observed value. It must not be conflated with the measured 5-sat setup debit or assumed to include it. Which prior actions/fees contribute to this counter remains to be reconciled; the latest historical page payment also cost 6 sats, but matching values alone do not prove attribution. Saved allowance verification is a narrow PASS. Effective allowance consumption, silent repeated page turns, budget/reset behavior, both-wallet one-prompt cohorts and full cross-device accounting are still outstanding. C2/C4 remain FAIL and other overall criteria retain their recorded statuses. Purchases remain paused.

### Post-grant native UI inspection

The user's screenshot `screenshots/post-grant-localhost3108-no-allowance-2026-10-17.png` shows the **localhost:3108** Spending entry still saying the app must ask before spending, with an empty manual limit field. This does not verify a saved allowance. Prior inspected Desktop dependency source normalizes originators to hostname `localhost`, so the next read-only check is the separate **localhost** entry (without port), reopening it to refresh the view. Do not manually add a limit or request another grant. If that entry is also empty, retain the discrepancy between the successful grant flow/5-sat debit and the native UI; actual saved allowance remains unresolved.

### Result — 16:30:51 UTC

The user reported completing the native approval. The single `waitForAuthentication` returned HTTP 200 with `authenticated:true`. The helper completed its read-only reconciliation at `2026-10-17T16:30:51.604Z`. History contains exactly one new transaction, a **5-sat net debit**:

`0a2983d2ca4654739c8820e2559bb7ca15791f03e28c362ce2a41ee1dd3056ae`

Its immediate wallet status was `sending`, not confirmed. Public WhatsOnChain mainnet lookup found the 1,377-byte transaction. It spends 4,932 sats from output 1 of the existing page-5 transaction and returns 4,927 sats in P2PKH change plus three 1-sat nonstandard outputs. Total output value is 4,930 sats, giving an actual **2-sat miner fee**. The three token-sized outputs plus the fee reconcile with the wallet's **5-sat debit** and the prior official-manager model. The encrypted permission meanings cannot be inferred independently from the public output values. No block confirmation was supplied by this lookup.

Recorded calls were `getNetwork`, `listActions`, `waitForAuthentication`, `listActions`, following generated acquisition. Transport evidence contains no page API requests, createAction, signAction or sendWith; no blocked attempted calls. The existing localhost:3301 probe still failed before the successful HTTPS localhost:2121 transport was selected. The persistent journal is finished and retained; never rerun this grant attempt.

Evidence: `runs/grant-only-result-2026-10-17.json`, `runs/grant-only-public-tx-2026-10-17.json`, `runs/grant-only-fee-summary-2026-10-17.json`. [Public transaction](https://whatsonchain.com/tx/0a2983d2ca4654739c8820e2559bb7ca15791f03e28c362ce2a41ee1dd3056ae).

**Narrow result:** native grouped approval returned successfully and actual setup debit is measured at 5 sats (3 allocated to token-sized outputs + 2 miner fee). Saved allowance amount/period still requires native UI inspection. Silent repeated page turns, allowance consumption/reset behavior, complete prompt counts, phone parity and cross-device accounting remain unresolved. Overall C1–C11 statuses are unchanged. Page purchases remain paused. The user was asked to inspect the existing Spending entry without changing it.

### Reconnected launch at 16:22 UTC

The browser reconnected and the grant-only journal was still absent, with native fetch restored after navigation. The authorized helper was invoked once at `2026-10-17T16:22:14.378Z`. A transport guard blocks application `/api/` requests and wallet methods other than acquisition, network, read-only history and authentication. Baseline `listActions` returned four completed transactions: +88,000 funding, -239 historical grant, -62 historical page, and -6 latest page. This is a native history observation, not proof of all cross-device history.

Exactly one `waitForAuthentication` is now pending. The user reports **Select App Permissions**. They were instructed to select Grant Selected once only if the amount and protocol selection match the reviewed request, and to leave differences unapproved. No page-payment routes or application create/sign/send methods have been called. The persistent journal is now **awaiting-native-approval**; it must never be cleared or retried. Pending evidence: `runs/grant-only-pending-2026-10-17.json`. Actual debit, saved grant and acceptance remain unresolved until reconciliation.

Reconnect this thread in the T3 Code desktop app and its shared browser. Reinspect the persistent journal before invoking anything. If an attempt exists, reconcile it; do not replace it. Otherwise continue the already-authorized single run using `src/grant-only.ts`: read-only history baseline, one native request, read-only reconciliation. Keep page purchases paused. Verify the actual native selection and saved allowance and attribute history deltas before claiming any cost or acceptance result.

C1/C2/C4 remain FAIL; C3/C5/C6/C7/C8/C9/C10/C11 remain UNRESOLVED. This checkpoint grants no acceptance pass and records no new expenditure.
