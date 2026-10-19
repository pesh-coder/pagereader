# Desktop spending attribution — read-only investigation, 2026-10-17

## Finding

The unchanged native counter is explained by an observed **originator label split**, independently of whether the UI also caches old values. The saved spending token belongs to `localhost`; the latest page-6 transaction is labeled `admin originator localhost:3108`. Desktop's declared permission-manager dependency 2.14.5 queries spending using the token's hostname label and therefore omits that page debit. The wallet's complete current history shows both transactions completed, so an unproven-only explanation does not fit this latest observation.

This is not a second Pagestream server or a fee per localhost entry. The technical probe and reader both use the same localhost:3108 application origin. A hostname-level public metadata listener was required for manifest discovery. The native grant normalizes originators, while action attribution preserves the caller's port in this path. We must not claim a reliable 5,000-sat budget until that inconsistency is resolved and validated.

## Live read-only evidence

At 17:59:14–17:59:16 UTC, `src/accounting-review.ts` used generated acquisition and exactly one `listActions({labels:[],includeLabels:true,seekPermission:false,limit:100})` call. Identity matched the completed page-6 run. All six returned actions have unique valid txids; the history count is complete. All were now marked completed. Only originator/month labels, txid, net satoshis and status were retained. A browser transport guard refused all payment/signing/grant methods and app APIs; no blocked attempted calls occurred. The purchase pause remained present and no paid test was run.

| Existing transaction | Purpose | Wallet net debit | Originator label |
|---|---|---:|---|
| `f78f5c629a375c0ac4c81a0b9e8a37e9fe8a4422efb5c8d070cdcdae5f598d6c` | Historical protocol permission | 239 | admin.com |
| `4b2e989eab3cbc6034a7826017b127bd0cba32a8719113b5953f9cbaed6ef709` | Holmes page 3 | 62 | localhost:3108 |
| `9d39cbd7092be278ffef053bfe349d2eb8ab6fc44cc006c1572cd583e56a47fe` | Holmes page 5 | 6 | localhost |
| `0a2983d2ca4654739c8820e2559bb7ca15791f03e28c362ce2a41ee1dd3056ae` | Grouped permission setup | 5 | admin.com |
| `9edee29fa6980ff0784647a0a16462f71045f050826ef032e5a1301bef9f3714` | Holmes page 6 | 6 | localhost:3108 |

The sixth action is the existing 88,000-sat incoming funding transaction with no originator label. For October, native originator buckets are **localhost: 6**, **localhost:3108: 68**, **admin.com: 244**. Combining only the two known Pagestream page-label buckets gives **74 sats**, not 12: it includes the earlier 62-sat page-3 purchase. Permission setup is separate at **244 sats**. All five recorded debits sum to **318 sats**; no additional unidentified debit appears in this complete current Desktop history. This does not conclusively identify the user's earlier unrecorded observation or establish another device's history/balance. Token values remain outputs controlled by permissions; do not label every net debit a miner fee.

Verified cost breakdown from the linked historical/new transaction evidence:

| Category | Recipient/token value | Miner fees | Net recorded debit |
|---|---:|---:|---:|
| Three pages | 15 | 59 | 74 |
| Two permission transactions | 4 | 240 | 244 |
| Total recorded outgoing costs | 19 | 299 | 318 |

The native counter's 6 matches page 5 alone. It excludes the 68 sats in port-labeled pages and also excludes the separately admin-attributed permission costs. This explains why neither the native counter nor the page-only server price is a complete wallet-debit total.

Live capture: `runs/accounting-label-review-2026-10-17.json`. Prior transaction cost sources: [recovery evidence](recovery-fix-2026-10-17.md), [grant run](grant-only-run-2026-10-17.md), [page-6 run](page6-allowance-test-2026-10-17.md).

## Source and offline reproduction

Desktop v3.1.1's [package declaration](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/package.json) declares wallet-toolbox-client 2.14.5. The separately retained exact published package was inspected; application dependencies were not replaced:

- `createAction` appends `admin originator ${originator}` using its incoming originator, before its later spending-authorization check.
- `ensureSpendingAuthorization` normalizes that originator to a hostname and obtains a spending token. Its limit check calls `querySpentSince(token)`.
- A hostname token's `originator` and `rawOriginator` are both localhost. `querySpentSince` builds exact label queries from those token values, using the current calendar month. Those values do not recover localhost:3108 action labels.
- `listSpendingAuthorizations` returns a token whose originator is the decoded hostname; the native UI calls `querySpentSince` on it. [SpendingAuthorizationList.tsx](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/src/lib/components/SpendingAuthorizationList.tsx) also caches figures; refreshing that screen cannot fix a label that the query does not include.

`scripts/originator-accounting.ts` calls the official permission manager against synthetic copies of the observed label/value pattern, with every underlying method except synthetic listActions blocked. The exact 2.14.5 reproduction returned **6** for a hostname-only token and **74** when querying both distinct hostname/port labels, reproducing the omitted **68 sats**. This is an offline model of the observed attribution mismatch, not an end-to-end live exhaustion/renewal test. It creates no native wallet calls or transactions. Evidence: `runs/originator-accounting-2.14.5-1792260032539.json`.

Reproduce from spike:

```powershell
node --import tsx scripts/review-originator-accounting.ts --desktop-reference
```

## Remediation boundary and next work

Keep purchases paused. Do not change/revoke the existing grant, relabel historical actions, impersonate a different originator in Pagestream, patch generated wallet helpers, or bypass this mismatch by spending more. The saved limit display and one silent page do not prove correct allowance enforcement: the same manager query is used for the spending check, so undercounting is a source-supported concern that needs a wallet-side fix/acceptance test.

A wallet fix should use one canonical attribution policy for grants, newly created actions and monthly queries, with explicit legacy port-label handling. Legacy totals must deduplicate by txid rather than blindly sum overlapping alias queries. Required regression cases: raw port/hostname actions under one token, legacy historical actions, noSend/sign/sendWith lifecycle, monthly boundary, simultaneous requests/reservations and renewal at the real net-spend limit. An eventual dedicated HTTPS hostname also avoids this local port split for future tests, but does not repair existing records or prove the general wallet fix. No external bug report/message has been sent.

Pagestream must continue tracking actual page spending by txid, separately from ownership and permission setup. The Desktop accounting sample is now reconciled; cross-device accounting and accurate end-to-end visible spend still remain incomplete. Next user-independent task: inspect/profile the existing slow paid delivery without another payment, then prepare a concrete fix/test. Any new paid cohort needs new scoped authorization.

Validation: spike build PASS and **43/43 local tests PASS**, including official-manager attribution reproduction and same-request preflight-resume guards. No sats were spent during this investigation. Overall C1/C2/C4 remain FAIL; C3/C5/C6/C7/C8/C9/C10/C11 remain UNRESOLVED.
