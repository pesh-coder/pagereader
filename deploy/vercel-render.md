# Vercel frontend and Render backend

Superseded budget assumption, 2026-10-19: the owner requires $0 hosting. This guide assumes paid Render storage, and Vercel Hobby's commercial/payment restriction was not accounted for. Do not follow this guide as a zero-cost live deployment. See [current feasibility findings](../spike/evidence/zero-cost-hosting-2026-10-19.md); remote persistent storage for free Render is not yet implemented.

Prepared 2026-10-19. Configuration is implemented locally; no hosting projects have been created and no state/key has been uploaded. New purchases remain paused. This updates the earlier single-service recommendation at the owner's request.

The stable Vercel production hostname serves `/reader/` and its static assets. API requests, `/.well-known/auth`, `/manifest.json`, `/icon.svg` and `/health` are externally rewritten to one Render backend with the path/query unchanged. Browser requests stay on the frontend origin; no frontend API-base or CORS variable is needed. The backend holds the existing receiving key and the only authoritative SQLite ledger. The two hosts do not synchronize separate database copies.

Vercel supports [programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts) and [external rewrites](https://vercel.com/docs/routing/rewrites). `vercel.mjs` reads the backend URL during configuration evaluation. It fails closed if that variable is missing or malformed. API/auth/manifest/health responses explicitly disable browser and CDN caching; [Vercel cache header precedence](https://vercel.com/docs/caching/cache-control-headers) explains the separate headers.

## Variables to prepare first

The URL names below are placeholders, not provisioned addresses. Choose project names during creation and replace them with the actual assigned addresses. Both values are HTTPS origins with no `/reader/`, `/api`, query or credentials.

**Vercel — Production environment only** ([copyable template](vercel.env.example)):

```dotenv
PAGESTREAM_BACKEND_ORIGIN=https://YOUR-RENDER-SERVICE.onrender.com
```

No server private key, recovery phrase, database URL, wallet allowance variable, `VITE_API_URL` or `VITE_*` secret belongs in Vercel. Keep Preview deployments disconnected from the real ledger: do not assign this production backend variable to Preview. A preview needing API access must use its own reviewed paused test backend, not a second mutable copy of real state.

**Render — initial maintenance setup** ([copyable template](render.env.example)):

```dotenv
NODE_VERSION=22.17.1
NODE_ENV=production
BSV_NETWORK=main
PAGESTREAM_STATE_DIR=/var/data/pagestream
PAGESTREAM_REQUIRE_EXISTING_STATE=1
PAGESTREAM_MAINTENANCE=1
SPIKE_MANIFEST=1
WALLET_STORAGE_URL=https://storage.babbage.systems
PUBLIC_ORIGIN=https://YOUR-VERCEL-PROJECT.vercel.app
```

Add `SERVER_PRIVATE_KEY` only in Render's secret environment UI, using the **existing** ignored local receiving-key value. Do not generate a replacement, put it into Vercel/Git/chat, or bulk-upload the `.env` file. It can remain unset during maintenance provisioning. Render supplies `PORT` and `RENDER_EXTERNAL_URL`; leave them alone. There is deliberately no environment variable that removes the purchase-pause marker or raises the wallet's native limit.

`PUBLIC_ORIGIN` now takes precedence over `RENDER_EXTERNAL_URL`. Outside maintenance it is required explicitly. Until the frontend URL exists, omit `PUBLIC_ORIGIN` entirely for maintenance only; Render's assigned URL is sufficient for that health listener. Do not deploy a literal placeholder as the final configuration.

## Project settings and creation order

1. Create the **Render Node web service first**, from `pesh-coder/pagereader`, branch `main`, repository root. Build command: `bash deploy/build.sh`. Start command: `node deploy/start.mjs`. Health path: `/health`. Attach a persistent disk at `/var/data/pagestream`, one instance, automatic deployment off. The blueprint provisions maintenance mode; it creates billable resources if applied. Check the actual account/plan/disk price before provisioning.
2. Add the initial Render variables above. `PUBLIC_ORIGIN` and the key can be omitted at this maintenance stage. The service exposes only health and reports `paymentReady:false`; it creates no wallet or ledger. Note its actual `.onrender.com` URL.
3. Import the GitHub repository into **Vercel**. Root directory: repository root (`.`), not `app/client`. Framework: Other, Node 22.x. `vercel.mjs` supplies install/build/output settings. Add `PAGESTREAM_BACKEND_ORIGIN` with the actual Render URL to **Production before deployment**. Vercel installs both dependency sets because the reader imports shared spike code, then publishes only the staged built client at `dist/vercel/reader/`.
4. Note Vercel's stable production URL. Set Render's `PUBLIC_ORIGIN` to that exact origin. Open the reader at `https://YOUR-VERCEL-PROJECT.vercel.app/reader/`. During maintenance the static shell can load but library/API requests intentionally return 503. A working shell is not a working backend.
5. Securely import the reviewed existing paused state and configure the existing receiving key using the [migration procedure](README.md#reviewed-data-migration-must-precede-activation). Retain purchase-cost metadata, intents, original proofs, bookmarks and pause marker; never copy a live permit. Agree one authoritative writer before cutover. The original local state stays preserved, but do not run independently writable local and hosted copies of this receiving ledger.
6. Change Render's `PAGESTREAM_MAINTENANCE` to `0` and manually deploy **only after import verification**. This enables normal reading/recovery with purchases still paused. It does not remove `PAID_REQUESTS_PAUSED`. Normal startup refuses absent imported state or a copied live permit.

Vercel production variable changes require a new frontend deployment. Render public-origin changes require a backend restart/deployment. Use the stable production frontend hostname on desktop and phone; preview URLs and the direct Render host are different wallet app scopes. Do not approve grants or start paid flows on the direct backend hostname.

## Checks before any payment activation

Through the Vercel hostname, verify mainnet health with `purchasesPaused:true`, two wallet-free pages of every edition, the same receiving public identity from the manifest, unchanged receipt/intent/proof/bookmark counts and authenticated owned-page resume with exact historical fees. Verify the installed phone shortcut uses the same hostname. No payment is needed for these checks; native identity/permission calls still require review if the wallet asks.

The two stored original proof headers measured 1,338 and 2,302 bytes read-only locally. These are below Vercel's documented [16 KB per-header limit](https://vercel.com/docs/errors/request_header_too_large); future BEEF sizes and the full deployed request still need validation. External rewrites also have a [120-second proxied request timeout](https://vercel.com/docs/limits). A proxy failure or timeout must preserve the existing request/transaction/proof and recover ownership; it must never trigger a replacement purchase. This split adds a network hop and is not a paid-latency pass.

**Payments are not unpaused by this setup.** The native 5,000-sat/month counter/enforcement defect remains unresolved, and the new HTTPS hostname has no inherited localhost grant. Deployment and existing-proof recovery have not been tested on these providers. Once those checks pass, the next payment should be one explicitly scoped, budgeted mainnet experiment using the existing guarded-permit flow. Broad release still requires the outstanding allowance, delayed-approval, concurrent-device and recovery evidence. Current configuration remains 5 sats page price plus an independently checked miner fee capped at 1 sat; this is not a 5-sat all-in price.

## Local verification

```powershell
cd app/client
npm run build
npm run lint
cd ../../spike
npm run build
npm test
npm run test:deployment
cd ..
node deploy/stage-frontend.mjs
```

The new local deployment tests check origin precedence/rejection, static `/reader/` packaging without changing the normal client build, and SDK BRC-103 traffic across a simulated proxy: exact paths/query/body/custom headers, free-page isolation, owned receipt fee recovery, bookmarks and refusal of new page spending while paused. They use random synthetic wallets and an in-memory database. They do not validate Vercel/Render network behavior or perform mainnet payments.
