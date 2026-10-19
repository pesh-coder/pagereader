# Hosted activation and recovery checkpoint — 2026-10-19

## Hosting decision

Vercel serves the React static reader and proxies API/auth/manifest requests to the owner's existing Railway Hobby service. Railway runs the persistent Express BRC-105 backend with SQLite mounted at `/var/data/pagestream`. This preserves the working receiving wallet and original ledger without a database rewrite. Server secrets belong only on Railway.

Paid Render with persistent disk conflicted with the initial zero-cost requirement. Free Render did not fit durable local SQLite or reliable latency experiments. An external-database migration was proposed but became unnecessary when the owner clarified they already had Railway Hobby for this personal own-wallet POC. Railway credits/overages still apply: this is not guaranteed zero additional cost. Vercel plan terms remain applicable. Earlier Render/Neon proposals are historical; see the official references in the [current setup guide](../../deploy/vercel-railway.md).

## Steps and verification

1. Added a root Node manifest/lock for Railpack detection. Corrected build to `bash deploy/build.sh`, start to `node deploy/start.mjs`, health to `/health`, retaining repository-root builds.
2. Set Vercel backend origin to `https://pagestream-production.up.railway.app` and Railway public reader origin to `https://pagereader.vercel.app`. Configured mainnet, persistent state directory and maintenance-first startup. The existing receiving key comes from ignored local `spike/.env`, never Vercel or GitHub.
3. Initial health responses and library 503 proved maintenance routing worked. Maintenance deliberately did not load the wallet/database.
4. Owner created a passphrase-protected SSH key, registered its public key and connected. Their volume listing contained only `lost+found` before import.
5. Created a consistent SQLite backup through the backup API with source opened read-only. Integrity passed; retained 3 purchases, 5 intents, 3 replay claims, 2 proofs, 2 bookmarks and 3 purchase-cost rows. Export excluded server key and live payment permit.
6. Owner uploaded database, purchase-pause marker and manifest. A failed authentication on the manifest upload was resolved by retrying that file only; the transcript confirms all uploads succeeded.
7. Remote SHA-256 values supplied by owner exactly matched the locally verified snapshot:

| File | SHA-256 |
|---|---|
| spike.sqlite | 23b4a5d50be220c5be561fcd8d6594a7208f05acf41b31ae57d06d53d0e95bf6 |
| PAID_REQUESTS_PAUSED | 3d24fb6ba61829e267d98ff31721426d660596003bdc4865ae92c253da7c3134 |
| state-manifest.json | 1a3201711c14d09beceebe17a64aba48b1e4d7568712ded69cc7b7d331672e80 |

8. Provided SDK-only offline public identity derivation. Owner reported that it printed a key but did not supply its value or explicitly confirm equality. Exact remote receiving identity continuity therefore remains unrecorded. Successful startup alone does not prove it.
9. Owner enabled reading and reported success. Subsequent agent read-only HTTP GETs on both hosts returned library 200 and health 200 with `status:ok`, `network:main`, `paymentReady:true`, `purchasesPaused:true`. Configured payment capability is not authorization for new spending.
10. Compared imported purchase edition/page fields against the live catalogue: Holmes pages 3, 5 and 6 match the hosted immutable edition. No reader identities, private proofs or database contents were published.

## Recovering locally bought pages

Localhost browser storage does not transfer to Vercel. The free library intentionally makes no wallet calls, so purchase discovery requires explicit **Resume saved page** in Holmes with the same reader wallet identity. The gateway authenticates, retrieves edition-scoped purchases/fees, populates the hosted browser ledger and requests owned content only. Recovery cannot fall through to a new purchase. The receiving server key and reader identity have different roles.

Expected recovery: pages 3/5/6, 74 sats total (15 page prices plus 59 miner fees), excluding historical permission costs. Hosted authenticated recovery has not yet been observed. A new HTTPS-origin native permission may be requested; any setup cost needs separate review. Missing ownership requires checking identity/edition/server records, never repurchasing or copying localStorage as proof.

## Before another purchase

Keep the pause marker. Confirm receiving identity equality, one authoritative hosted ledger with local mutable backend stopped, same-reader identity, and hosted owned-page/fee/bookmark recovery. Review any native prompt before approval. Then propose one exact unowned edition/page controlled mainnet request with five-sat server price plus at most one-sat miner fee; grant costs are separate. Only explicit authorization for that run permits scoped admission through existing permit/request safeguards. Do not blanket-unpause, reset uncertain intents or replace original transactions.

No new payment or grant was initiated during this verification. Migration/public reading are narrow passes; phone, hosted authenticated recovery, allowance enforcement and paid p95 remain open. C1/C2/C4 FAIL; C3/C5/C6/C7/C8/C9/C10/C11 UNRESOLVED. Handoff remains for local review; no direct team message sent.
