# Zero-cost hosting constraint — 2026-10-19

The owner requires **$0 hosting** and prefers to retain Render if feasible. This supersedes the assumption that a paid Render instance/disk or Railway Hobby subscription is acceptable. No hosting resource has been created. Do not apply the current paid `render.yaml` as a zero-cost solution.

Official provider checks:

- [Render Free](https://render.com/docs/free): a free web service sleeps after 15 idle minutes, loses local filesystem changes at spin-down/restart/redeploy and cannot attach a persistent disk. Free Render Postgres expires after 30 days. Neither ephemeral SQLite nor the expiring database is an appropriate durable purchase ledger.
- [Neon Free](https://neon.com/pricing): currently advertises a $0 plan without a time limit or credit card, with metered free compute/storage allowances and scale-to-zero. This is a candidate persistent external Postgres store, subject to quotas; no Neon project or credentials exist in this workspace.
- [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines): Hobby is restricted to non-commercial personal use and lists requesting/processing visitor payments as commercial usage. Do not assume the paid reader qualifies for Vercel Hobby merely because the transaction values are small. The earlier frontend recommendation did not account for this restriction.

Recommended zero-subscription-cost architecture to evaluate: one free Render web service serves the already-built reader and Express API at one origin; Neon Free stores the durable ledger. Stay within free quotas, accept service suspension/unavailability when limits are reached, and do not enable paid upgrades. Actual free-account availability/limits must be checked during creation.

**This is not implemented or deployment-ready.** The current Store uses synchronous SQLite transactions, the startup/import guards require the private paused SQLite snapshot, and the purchase pause/one-run permits use local files. A remote database implementation must preserve atomic receipt/replay/entitlement acceptance, request/tx binding, original proofs, fees, bookmarks, recovery history and a durable fail-closed pause. Existing state must be migrated consistently and compared before cutover, never recreated or reset. All receiving secrets remain backend-only.

Free Render's cold startup takes about a minute according to its documentation. A sleeping free deployment cannot meet a universal sub-500ms first paid-turn target; warm paid p95 still needs honest measurement. Keep the original acceptance target and record this deployment limitation rather than silently relaxing C3.

No code, mainnet state, key, grant or payment was changed by this feasibility review. The 62-test result belongs to the preceding implementation, not a Postgres migration. C1/C2/C4 remain FAIL; C3/C5/C6/C7/C8/C9/C10/C11 remain UNRESOLVED. Purchases stay paused. The next implementation decision is durable remote storage/migration for the $0 deployment; setting the current blueprint to `free` alone is insufficient.
