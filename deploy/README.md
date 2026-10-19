# Pagestream HTTPS deployment — prepared for review, not deployed

Recommended shape: one paid Render Node web service with one persistent disk, serving both the React reader and the existing Express backend at one HTTPS hostname. Render provides an onrender.com URL, so an owned domain is optional. The current SQLite/per-process authentication architecture fits a single long-running instance. Do not split it onto Vercel Functions without changing persistence/session architecture. [Render Express](https://render.com/docs/deploy-node-express-app), [persistent disks](https://render.com/docs/disks), [Vercel SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

Localhost still works on the laptop. On a phone it points to the phone, not the laptop. The phone demo therefore needs a reachable hostname and trusted HTTPS. No ngrok is used or proposed.

## Prepared files

- `../render.yaml`: Node 22.17.1, one service, smallest listed paid compute shape and 1GB disk; automatic deployment off. Applying this blueprint would create billable resources. Confirm actual dashboard pricing and account access before applying it. [Official schema](https://render.com/schema/render.yaml.json) validates locally; this is not proof of a deployed service.
- `build.sh`: installs locked client/spike dependencies and builds both. Existing generated wallet helpers are preserved.
- `start.mjs`: the blueprint initially sets `PAGESTREAM_MAINTENANCE=1`. This launches only the maintenance listener, with no wallet, SQLite or reader/payment routes. Its health response explicitly reports maintenance, purchases paused and paymentReady false. After reviewed import and activation, normal startup requires the existing mainnet receiving-key configuration, a reachable HTTPS origin, imported SQLite/pause marker and no one-run permit. It refuses an empty replacement ledger. No localhost metadata helper runs in production.
- `PAGESTREAM_STATE_DIR`: keeps mutable SQLite/pause/permit state on `/var/data/pagestream`; immutable source/edition assets remain in the repository's spike/data tree. Default local development still uses spike/data. No existing local records are moved or reset.

## Reviewed data migration must precede activation

From spike, `node --import tsx scripts/export-paused-state.ts` creates a new **ignored private local directory** under evidence/runs. SQLite's backup API includes committed WAL records; the source DB is opened read-only. The export preserves purchase/intent/replay/proof/bookmark records and the pause marker, excludes keys and live permits, refuses to overwrite an existing snapshot, and verifies integrity/counts.

A snapshot has been prepared locally with 3 purchases, 5 intents, 3 replay claims, 2 proofs and 2 bookmarks. It has not been uploaded. Do not attach its DB or browser journals to the team handoff. The receiving key must remain the existing one and be entered only through a secure hosting secret configuration; never paste it into chat or source control.

The updated private local snapshot from 2026-10-18 also includes **3 purchase_costs rows**, preserving the verified 57/1/1-sat miner fees for the existing receipts. Use the final current snapshot for any approved cutover; the earlier 2026-10-17 snapshot predates this additive fee repair. SQLite backup preserves the entire table along with the original private records. [Repair and backup evidence](../spike/evidence/shared-receipt-fees-2026-10-18.md).

After deployment approval, the initial maintenance service can remain healthy while the existing database is imported. Use Render's supported SSH/SCP workflow to transfer only the reviewed snapshot DB, pause marker and manifest into the mounted disk; never upload the .env, browser journals or a live permit. Verify integrity/counts and receiving public identity continuity before activation. [Official file-transfer guidance](https://render.com/docs/disks#transferring-files).

Agree a single authoritative writer and a final consistent snapshot before cutover; do not run local and hosted mutable copies of the ledger independently. With the final paused snapshot imported and the original receiving key securely configured, change `PAGESTREAM_MAINTENANCE` to `0` and manually deploy the reviewed version. Keep the purchase pause in place. If import is missing, normal startup refuses before loading the wallet/backend. Maintenance health alone is not a payment-ready acceptance pass.

Local process tests verified maintenance health, refusal of reader/manifest/public/payment/bookmark routes, zero database initialization without a key, and normal-start refusal of a missing ledger. Initial Render provisioning, SSH/SCP import and actual hosted health/activation remain untested against an account. The blueprint is a proposal, not an automatic migration tool.

## Approval and device gates

No service, account, domain, credentials or billable resource has been created. A Render target/account, exact current price and explicit deployment approval are still needed. The team handoff stays local per the user.

An HTTPS hostname is a new wallet permission scope. Existing localhost permissions do not automatically become a grant for that hostname. Review and separately authorize any native grant cost; keep purchases paused. The official Desktop originator fix is in an integration branch, not the latest published v3.1.1 release, and excludes historical port-labeled actions. Do not install an unofficial wallet over funded state to force a pass. [Official PR #124](https://github.com/bsv-blockchain/bsv-desktop/pull/124).

After deployment approval and import: verify health says mainnet/paused, receiving public identity matches the existing manifest, catalogue editions and original receipts/bookmarks survive, and public pages remain wallet-free. Then perform the actual phone installation/identity/read-only resume checks. Compare public identities through supported wallet recovery/sync only; never ask for a recovery phrase, and do not copy secrets between simultaneously active wallets to manufacture a match. Payment/latency cohorts still require separately scoped authorization.
