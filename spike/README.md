# Pagestream tier-1 spike — throwaway

**Catalogue requirement implemented:** the product reader now serves eight complete fixed-page editions with two public pages each and edition-specific BRC-105 delivery/ownership/bookmark/recovery routes. Holmes keeps its original edition/entitlements and exposes all 265 pages in the product; legacy probe routes retain the 43-page research window. Client build/lint and spike build PASS; 35 local tests PASS; all seven new readers pass wallet-free browser page 1→2 checks. Purchases remain paused. [Catalogue evidence](evidence/catalogue-2026-10-17.md), [nine-requirement queue](../docs/requirements-execution.md). Use `npm run dev` locally, without ngrok.

**Latest checkpoint (2026-10-17):** native page 5 previously completed for 5 sats + 1 fee sat; purchases remain paused. Spike build and **31 local tests PASS**, including underpayment, cross-identity conflict and delayed synthetic approval contention. The user requires `npm run dev` and [the local browser reader](http://localhost:3108/reader/); the temporary ngrok tunnel was stopped. Physical phone/native permission checks remain unverified. No new sats spent in this checkpoint. [Current evidence and next controlled experiment](evidence/recovery-permissions-checkpoint-2026-10-17.md) supersede historical setup statements below.

Run `npm run preflight:recovery` from this folder to check public routes and read-only local SQLite state. It makes no wallet calls, creates no purchase intent/permit, and exports no proof bytes or secrets. A configured allowance in the manifest is not evidence of a native grant.

**Local wallet discovery candidate:** the user confirmed no saved allowance for localhost:3108. To make the public manifest reachable by hostname-scoped reference wallets, the current run uses `npm run dev -- --local-wallet-manifest`. This optionally serves metadata only on 127.0.0.1:80; all reader/payment APIs remain on port 3108 and purchases stay paused. Plain `npm run dev` omits that listener. It creates no grant. Spike build and **38 tests PASS**; native grouped-request behavior is unverified. [Evidence and next display-only experiment](evidence/allowance-discovery-2026-10-17.md).

The native grouped request has subsequently been observed and rejected. Cost review: `npm run review:permission-cost` performs an **offline synthetic model only**, with no native calls/funding/signing/broadcast. The observed selection models three token sats plus a two-sat fee under the stated layouts/rate, **not a native quote or enforceable cap**. `/grant-only.js` is a separately prepared operator helper with no automatic invocation; a saved native-grant run requires explicit authorization and before/after history reconciliation. [Cost review](evidence/permission-cost-review-2026-10-17.md). Page purchases remain paused.

This is an experiment approved in chat on 2026-10-15. It is not milestone-1 product code. The product scaffold and its generated BSV helpers are unchanged. Do not promote this probe to production.

**Paid testing is currently paused following the 2026-10-16 debit/delivery incident.** Keep `data/PAID_REQUESTS_PAUSED` in place. See `evidence/payment-incident-2026-10-16.md`. The steps below document the intended experiment; do not resume paid runs until original-debit reconciliation and a reviewed cost/recovery fix are complete.

The authorized recovery/fee-cap repair is implemented and passes 21 local tests; see [2026-10-17 evidence](evidence/recovery-fix-2026-10-17.md). New payments prepare unsigned, enforce a 1-sat miner-fee cap, sign without sending, persist the original proof, then send that exact transaction. Desktop's saved mainnet preference is now 1 sat/kB and requires a restart. Native verification remains pending; the pause stays in place. These findings supersede the earlier implementation/counter descriptions below.

## Run locally

Node 22.13+ and npm are required. From `spike/`:

```powershell
npm ci
npm run build
npm test
npm run dev
```

The source import is already checked in. To deliberately import a fresh upstream source, run `npm run import:book`. Inspect checksum changes: a new source checksum makes a new edition; do not overwrite an entitled edition silently.

`spike/.env` was created locally with a fresh SDK-generated server key. It is ignored by Git and never copied into the browser bundle. Keep a private backup. Do not add a reader recovery phrase, seed words or reader private key here. A server wallet can receive without being funded. Losing its key loses access to its receipts. `.env.example` documents the nonsecret settings.

The server uses the official wallet-toolbox client with remote mainnet storage. Startup prints only readiness, never the key. Public pages can also run without a configured key; protected routes then return 503. The current mainnet receiving wallet initialized successfully. A storage service dependency may affect startup and latency.

## Historical HTTPS and wallet-run procedure (not current)

The temporary ngrok tunnel is `https://subrigid-chaya-unsecularized.ngrok-free.dev/`, forwarding to port 3108. Its availability depends on both local processes staying running. To recreate it, use `ngrok http http://localhost:3108 --log stdout --log-format json`, then update `PUBLIC_ORIGIN` in the ignored `.env` if the hostname changes. Changing hostname changes the app origin/grant scope; record this. Never put the tunnel URL into a client URL setting as a secret.

ngrok free shows a first-visit notice. Press **Visit Site** before running the experiment. API transport sends ngrok's skip-warning header outside the signed protocol. Check `/manifest.json` actually returns JSON from the wallet's fetch path; an intermediary HTML response invalidates a grouped-permission run. The full header path still needs paid-proof testing.

1. **E9**: open pages 1–2 in an ordinary browser with no reader wallet. Repeat on a physical phone. Inspect Diagnostics: zero wallet calls, no errors. The paid-wallet module must not load. Desktop browser and phone viewport smoke checks passed; real phone is pending.
2. **E1 with manifest**: use a clean origin/grant state. Record device, wallet app name and version before starting. From page 2 request page 3. Count **every native prompt**, including key, signing, peer trust and spending. Do not type recovery words into the probe. Use the prompt diary to record wording/options and your selected grant. The app does not claim the 5,000-sat limit or a single prompt works.
3. **E2/E3**: explicitly request the next unowned page 20 times, noting any additional prompts and inspecting the wallet's granted scope/expiry/fee treatment. Export evidence before closing the tab. Close/reopen, request page 3 again to reacquire the wallet, and record whether it prompts. There is no wallet call on reload or preview. Tab-local evidence persists in sessionStorage; download before the browser discards that session.
4. **E6**: in BSV Browser on the phone, open the same HTTPS origin with the same restored reader wallet. Request page 3 (owned reread). Compare the displayed public identity keys. Then choose **Read last displayed page from this wallet**. Confirm it is the last page actually displayed on the first device. Reads/purchases alone must not advance the bookmark. Record both devices' evidence.
5. **E4**: Desktop uses pages 3–22, Browser uses 23–42, or record other disjoint unowned ranges. The probe exposes through page 43 of one source/checksum/segmenter edition. This modest setup extension avoids deleting entitlements or charging twice for the same page just to gather samples. Each page is still an explicit request; there is no paid prefetch or automatic spend loop. Page 3 is the entry point for first wallet acquisition on either device.
6. **E1 without manifest**: use a separately clean origin, restart with `SPIKE_MANIFEST=0`, and revoke prior grants in the wallet before the run. A query string on the same origin is not a clean permission cohort. No wallet grant should be revoked automatically by the app. Keep the server key, edition and entitlements stable. Different reader identities or unused ranges are required for additional genuinely paid cohorts; never erase purchases to repeat payment. No-manifest UI browser requests can receive the expected manifest 404; distinguish that from a free-page application failure.

The first page-3 purchase can include permission time and cold client setup; keep that sample and annotate it. The baseline does not discard inconvenient samples. No exact fee accounting is claimed. The counter shows transferred page sats plus an explicit unknown-fee label. E8/E11 and C4 remain unproven.

## Evidence

The diary's **Download evidence JSON** includes wallet/public identity, origin, page ranges, HTTP legs, wallet-method timing, painted-page total timing, server internalization/database timing, errors, prompt entries, notes and the txid ledger. Do not include secrets in free-text notes. Put downloads in ignored `evidence/runs/`. Produce a per-wallet timing summary with:

```powershell
npm run report -- evidence/runs/<downloaded-file>.json
```

The report uses nearest-rank p50/p95. Schema-2 qualification requires at least 20 distinct newly paid pages/txids, matching accepted ledger entries, successful new-payment workflow observations, authenticated identity/edition, native mainnet context, wallet app name/version and explicit request-to-visible-frame timing. Failed requests, hidden/missing timings, duplicate transactions or incomplete evidence keep C3 unresolved; cold/slow samples remain in the statistics. Legacy schema-1 exports remain readable as descriptive evidence and cannot produce an acceptance pass. Retain native/server records: the JSON alone cannot independently prove its provenance, prompt completeness or matching phone identity. Both wallet cohorts are still required. Reports are ignored by Git; reviewed Markdown findings and screenshots can be retained. This command never starts a wallet call or payment.

The probe's edition selector keeps Holmes as its default and preserves the 43-page research window. Selecting another complete catalogue edition opens only public page 1; all reader/status/bookmark/payment routes name that edition. Use distinct, previously unowned page ranges for any later authorized cohort. Saved-page resume is recovery-only. The standing paid-request pause remains; neither selecting a title nor generating a report authorizes or starts a payment.

Timing fields overlap: an HTTP round trip includes server work; `internalizeMs` includes wallet await and its acceptance journal write. Do not add every field together and call it total. `totalMs` is measured independently from the explicit request through two animation frames and visibility. Bookmark write is launched afterward and excluded from total. This is a display-time proxy, not hardware presentation instrumentation. Warm sessions remain in memory in one long-running process. Hosting has not been selected.

## Limits and gates

Minimal durable purchase intents prevent the tier-1 harness from issuing a second spend challenge for the same identity/edition/page. They never automatically expire or get deleted. An uncertain/declined attempt can block that page for the experiment. Use read-only reconciliation; do not reset the database or pay again. This conservative behavior protects the measurement run but does **not** prove C6's recovery/usability requirements. Crash/expiry/race investigations belong to tier 2.

One bounded operator repair was performed on 2026-10-16 for the documented insufficient-funds attempt: the reader confirmed all old tabs closed and no page-payment transaction in wallet history; server records had no purchase or submitted txid. `scripts/recover-insufficient-funds.ts` archived that original challenge and reason in `intent_recoveries`, then removed only that matching challenged row. It refuses stale IDs, submitted transactions, or existing ownership. This is not exposed as an HTTP endpoint and is not an automatic recovery rule. Absence of a server txid alone never authorizes it. Do not repeat this command for an ambiguous payment; stop and reconcile instead. It does not prove C6 or close the wallet/database crash window.

Default automatic paid retries are capped at one attempt. An owned-page or status route cannot trigger spending. The SDK and middleware validate keys/transactions; the probe implements no custom key derivation, signing or crypto. It reuses the generated desktop/extension acquisition helper, which probes BRC-100 auto substrates only after page 3. Raw wallet-method errors are research diagnostics and can differ between wallet apps. The grouped manifest is a candidate to test against actual wallet prompts, not a grant the app can make for the reader.

Tier 1 must be completed or explicitly reported UNRESOLVED before tier 2. Milestone 1 requires a separate approved design and implementation plan. C2/C3/C8 failures without a credible fix and an unachievable C6 must be escalated as specified by plan §6.
