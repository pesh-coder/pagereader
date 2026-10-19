# Vercel frontend + existing Railway Hobby backend

Current target, 2026-10-19: the owner has an existing Railway Hobby plan and is testing a personal POC with their own wallet. Use that backend with a persistent volume and keep the current SQLite implementation. No Neon migration or new Render subscription is needed. Included Railway credits are shared with other usage and do not guarantee zero additional charges. No provider account setting, resource or payment is changed by these repository files.

## Railway build failure and fix

The reported dashboard command, `chmod +x bash deploy/build.sh && sh bash deploy/build.sh`, treats `bash` as a filename. The correct build command is simply:

```sh
bash deploy/build.sh
```

The repository previously had package manifests only beneath `app/` and `spike/`. Railpack detects Node from a root `package.json`; without it the build container lacked npm and failed with exit 127. The new dependency-free root manifest declares Node 22 and build/start scripts. Its separate root lockfile does not change the client/spike lockfiles or convert this project into npm workspaces. `.gitattributes` preserves LF shell scripts on Linux.

The root `railway.json` selects Railpack and records the correct build/start commands and health path. Railway [config-as-code overrides dashboard values](https://docs.railway.com/config-as-code/reference), but the dashboard should also be corrected so its displayed command is accurate. See [Railpack Node detection](https://railpack.com/languages/node/).

| Railway service setting | Value |
|---|---|
| Repository/branch | `pesh-coder/pagereader`, `main`, latest commit containing the root manifest |
| Root directory | Repository root, blank or `/` |
| Config file | `/railway.json` (default root file) |
| Builder | Railpack |
| Build command | `bash deploy/build.sh` |
| Start command | `node deploy/start.mjs` |
| Healthcheck | `/health` |
| Volume mount | `/var/data/pagestream` |
| Instances | One |
| Serverless/App Sleeping | Disabled for latency/recovery validation |

The build script installs the **locked** client and spike dependencies including build/runtime tooling, then builds both. Do not change the service root to `spike` or `app/client`: these builds need files from both directories. Attaching a persistent volume is a separate dashboard step; setting its directory variable does not create the volume. Deployment config does not create or overwrite a private ledger.

## Variables

On Railway ([copyable template](railway.env.example)):

```dotenv
RAILPACK_NODE_VERSION=22.17.1
RAILPACK_PRUNE_DEPS=false
RAILPACK_NO_SPA=1
NODE_ENV=production
BSV_NETWORK=main
PAGESTREAM_STATE_DIR=/var/data/pagestream
PAGESTREAM_REQUIRE_EXISTING_STATE=1
PAGESTREAM_MAINTENANCE=1
SPIKE_MANIFEST=1
WALLET_STORAGE_URL=https://storage.babbage.systems
PUBLIC_ORIGIN=https://YOUR-STABLE-FRONTEND.vercel.app
```

Add `SERVER_PRIVATE_KEY` only as a Railway secret with the existing ignored receiving-key value, never a reader wallet key or a new replacement. It may remain unset during maintenance. Keep development dependencies because normal startup uses `tsx`. `RAILPACK_NO_SPA=1` keeps this service a Node backend, not an auto-served frontend. Let Railway supply `PORT` and `RAILWAY_PUBLIC_DOMAIN`.

Before the Vercel URL exists, **omit** `PUBLIC_ORIGIN` for first-host maintenance; the launcher can use `https://${RAILWAY_PUBLIC_DOMAIN}` for health-only provisioning. After Railway assigns a public domain, add this on Vercel **Production**, root directory `.`, Application Preset **Other**:

```dotenv
PAGESTREAM_BACKEND_ORIGIN=https://YOUR-ACTUAL-BACKEND.up.railway.app
```

The root `vercel.mjs` reads this during configuration evaluation, before frontend build. Missing values or hostnames without `https://` reproduce the reported `PAGESTREAM_BACKEND_ORIGIN must be a public HTTPS origin` error. Enter the actual URL without quotes or `/api`/`/reader/`, save, and create a new deployment. Do not set any server private key or frontend `VITE_API_URL` on Vercel. The existing install/build/static staging configuration remains in place.

Once Vercel assigns its stable production hostname, set Railway's `PUBLIC_ORIGIN` to that origin. Normal activation requires it explicitly; a backend hostname or preview URL is not the reader's intended wallet permission scope. The original BRC-105 auth paths and private no-cache response handling remain unchanged. Vercel's personal/non-commercial Hobby terms still apply; wallet integration alone is not a blanket classification, and a POC label is not a published exception for public paid use.

## Activation is separate from build success

Keep `PAGESTREAM_MAINTENANCE=1` during initial deployment. `/health` reports `paymentReady:false`, and reading/payment routes remain unavailable. A successful build/healthcheck does not import local SQLite or prove native payment behavior.

Securely transfer the consistent paused snapshot onto the volume, preserving purchases, receipt costs, intents, replay claims, original proofs, recovery history, bookmarks and `PAID_REQUESTS_PAUSED`. Never transfer a live permit or publish the DB/key. Verify integrity/counts and the receiving public identity, and agree one authoritative writer before cutover. The existing [migration requirements](README.md#reviewed-data-migration-must-precede-activation) apply, using Railway's supported volume/file tools rather than Render's SSH instructions.

Only after those checks, set `PAGESTREAM_MAINTENANCE=0` to enable normal reading/recovery **with purchases still paused**. Startup still refuses a missing original ledger/pause marker or a copied live permit. Hosted original-proof recovery, allowance enforcement, phone identity and paid latency remain unverified; building on Railway does not authorize a new payment or native grant.
