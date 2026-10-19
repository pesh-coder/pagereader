# Pagestream POC — Revised Initial Plan (v3: review corrections applied 2026-10-15)

> Status: **scaffold complete; BRC-105 and tier-1 spike approved. Focused reader layout approved in chat on 2026-10-17; milestone-1 implementation is in progress. Outstanding spike criteria remain unresolved/failed and new purchases remain paused.** Process: superpowers `brainstorming` (installed; loads on next
> session restart — followed manually here). Classification: **architectural** (new project). Gate order:
> this plan → approve spike → run spike → write spec + wireframes from evidence → implementation plan.
>
> Legend: **[FACT]** confirmed in a primary source · **[DRAFT]** proposed decision, can change without evidence ·
> **[EVIDENCE]** decision blocked on a spike experiment.

## 1. Problem, hypothesis, scope

**Problem.** Card rails have a fee floor that makes sub-cent, pay-as-you-read pricing impossible, and they exclude
readers without cards. Readers must sign up and subscribe even to read a few pages.

**Hypothesis.** A BRC-100 wallet plus authenticated HTTP 402 payments can charge 5 sats per page, with a single
wallet approval, page turns under 500 ms, and no account. The wallet's identity key is enough to carry a
reader's bookmark and purchases across devices.

**In scope:** a catalogue of 5–10 public-domain Gutenberg books, 2 free preview pages per book, paid pages, a running
spend counter, identity-keyed bookmarks and entitlements, a learnings note, and an optional py-sdk probe.
**Out of scope:** building wallets, accounts/logins/profiles (no Clerk), rights-managed content, author payouts, and
design polish beyond a clean reading view.

## 2. Confirmed facts (primary sources)

| # | Fact | Source |
|---|------|--------|
| F1 | Standing spending authorization is a **monthly** limit **per originator (app)**, tracked by calendar month with `expiry: 0`. The user can also pick a one-time or ephemeral grant, or deny. | [BRC-116](https://github.com/bsv-blockchain/BRCs/blob/master/wallet/0116.md); reference impl `WalletPermissionsManager.ts` (`ensureSpendingAuthorization`, `querySpentSince`) in [ts-stack/packages/wallet/wallet-toolbox](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/wallet/wallet-toolbox) |
| F2 | The reference impl counts the **net satoshis of each action against the limit**, so network fees eat into the allowance too. When the limit is exceeded it triggers a **renewal prompt**. | same file, `querySpentSince` / renewal branch |
| F3 | An app can serve `/manifest.json` with `metanet.groupPermissions` (including `spendingAuthorization`) to get **one grouped prompt**. If the manifest is missing or doesn't cover a request, the wallet falls back to **individual prompts**. Each of `seekSpendingPermissions`, `seekGroupedPermission`, `seekProtocolPermissionsForSigning`, etc. is a wallet config flag. | BRC-116; [BRC-73](https://github.com/bsv-blockchain/BRCs/blob/master/wallet/0073.md); same file |
| F4 | Two **incompatible** 402 protocols exist. **BRC-105** (`@bsv/payment-express-middleware` + SDK `AuthFetch`) runs on BRC-103/104 auth, uses a server-issued derivation prefix and the `x-bsv-payment` JSON header, and **pays on output 0**. **BRC-121** (`@bsv/402-pay`) is unauthenticated, uses `x-bsv-beef/sender/nonce/time/vout` headers and a 30 s timestamp window. The middleware README says their headers and clients are not interchangeable. | [BRC-105](https://github.com/bsv-blockchain/BRCs/blob/master/payments/0105.md), [BRC-121](https://github.com/bsv-blockchain/BRCs/blob/master/payments/0121.md), [payment-express-middleware README](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/middleware/payment-express-middleware), [402-pay README](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/middleware/402-pay) |
| F5 | The ts-stack guide [HTTP 402 Payment Gating](https://github.com/bsv-blockchain/ts-stack/blob/main/docs/guides/http-402-payments.md) teaches **BRC-121**, not BRC-105. Do not mix its examples with AuthFetch/BRC-105 code. | ts-stack docs |
| F6 | The BRC-105 middleware rejects reused txids with **409 `ERR_PAYMENT_REPLAYED`**, and an underfunded output 0 with **400 `ERR_INVALID_PAYMENT`**. It needs a durable `replayStore.claim(txid)` that does an atomic insert-if-absent. The default store is in-memory and lost on restart. Wallet acceptance happens **before** the claim. | payment-express-middleware README |
| F7 | Auth middleware: requests without BRC-103 auth get a **401** unless `allowUnauthenticated`. The default `SessionManager` is **process-local**, and `AsyncSessionManager` is the option for multiple instances or serverless. The caller is `req.auth.identityKey`, a compressed public key. | [auth-express-middleware README](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/middleware/auth-express-middleware) |
| F8 | `AuthFetch` handles a 402 by calling `createAction`, then retrying. On a network-error retry it **reuses the same payment context**, so the same tx is resent. Combined with F6, a lost response followed by an automatic retry gets **409, not the page**. | `packages/sdk/src/auth/clients/AuthFetch.ts` (`handlePaymentAndRetry`) |
| F9 | `createAction` defaults to `signAndProcess: true` and `acceptDelayedBroadcast: true`: it signs and hands the tx to the wallet for (background) broadcast, so the spend is **committed when the call returns**. `signAndProcess: false` returns a `signableTransaction` (unsigned, cancellable with `abortAction`). `noSend` builds the tx without broadcasting. | [BRC-100](https://github.com/bsv-blockchain/BRCs/blob/master/wallet/0100.md) `createAction` options |
| F10 | BRC-29 payment derivation uses protocol `[2,'3241645161d8']`, keyID `"<prefix> <suffix>"`, and the counterparty is the server's identity key. | [BRC-29](https://github.com/bsv-blockchain/BRCs/blob/master/payments/0029.md); AuthFetch |

## 3. Open assumptions → experiment for each

| # | Assumption | Why it matters | Experiment (spike) |
|---|------------|----------------|--------------------|
| A1 | BSV Desktop and BSV Browser honour `manifest.json` grouped permissions, so the first paid page produces **one** prompt | "One prompt per session" | E1: count every prompt type (auth/signing, key, spending) for a clean origin with and without a manifest, on both wallets. Record wording, options shown, and chosen grant scope. |
| A2 | After approval, later 5-sat payments run silently | Story step 4 | E2: 20 consecutive paid turns, counting prompts. |
| A3 | The allowance is monthly, not per session; the user may be offered one-time vs. standing; fees count against it | The brief says "session" | E3: inspect the granted permission in the wallet UI. Run with a small limit until renewal, and note when it prompts again. Close the tab and reopen it, and note whether it prompts again. **The demo script and copy must use whatever is actually observed.** |
| A4 | A paid page turn can be under 500 ms (p95) with payment triggered **by the click** | Core UX gate | E4: time each segment (402 challenge, `createAction`, network, `internalizeAction`, DB, render). Run N=20 per wallet on mainnet, and report p50/p95. |
| A5 | Cheaper optimizations that don't spend money are enough: a warm BRC-103 session, pre-fetching the **challenge** (derivation prefix) for the next page, and keeping the server wallet hot | Avoid paid prefetch | E5: repeat E4 with each optimization toggled. Check whether a prefetched prefix is still valid at click time (it is HMAC-nonce based, so it should be stateless; verify). |
| A6 | Restoring the same wallet on laptop and phone yields the **same identity key** | Story step 6 | E6: compare `getPublicKey({identityKey:true})` across both wallets, and fetch the bookmark from the phone. |
| A7 | The page can respond after `internalizeAction` without waiting for confirmation, which is safe for a 5-sat risk | Latency | E4 measures `internalizeAction` time. Note the risk accepted. |
| A8 | A retry after a lost response can be served without a second charge (see §4.3) | Correctness | E7: kill the connection after the server records the purchase, then retry with both the AuthFetch default retry and the app-level retry. |
| A9 | The network fee for a 5-sat tx is small and computable on the client | Counter honesty | E8: compute the fee from the returned tx (inputs − outputs) and compare it with what the wallet shows. |
| A10 | Browsing and pages 1–2 work with no wallet present | "Free really free" | E9: load the free routes in a plain browser with no wallet; there must be zero wallet calls and zero errors. |
| A11 | Long-running Express is simpler than Next.js route handlers on Vercel (process-local sessions, a hot server wallet, cold starts) | Architecture | Decide **after** E4: if the measured latency and session behaviour fit, pick the hosting. No split is chosen in advance. |
| A12 | A server-side purchase intent can stop a second payment for the same page across tabs and devices | C6 "one charge per page" | E10: simultaneous requests from two tabs, then laptop + phone; count txids accepted per page |
| A13 | The client can learn the payment txid before or without the server response | Counter must never hide or double-count spend | E11: kill the response after `createAction`; check the counter shows pending/unresolved, then reconciles |

## 4. Proposed semantics [DRAFT unless marked]

### 4.1 Billable page
- **Content unit = an edition.** `editionId` = Gutenberg ebook # + source file checksum + segmenter version.
- Pages are **fixed text segments** of about 1,800 characters, split on paragraph boundaries. Segmentation runs once at
  import time and is independent of viewport, font, or device, so page 7 is the same text everywhere. If the segmenter
  changes, that is a new edition, and existing entitlements stay with the old edition.
- Pages 1–2 cost 0 and are served on a **public, unauthenticated route**. Pages 3 and up cost 5 sats. The price lives in
  server config and is echoed in the 402 challenge, never trusted from the client.

### 4.2 Billing and counter
- **Payment happens only when the reader explicitly asks for a page** (Next click). **[EVIDENCE: A4/A5]** decides
  whether that is fast enough.
- **Paid prefetch is off by default.** If E4/E5 show pay-on-click cannot meet 500 ms, we present an explicit opt-in
  trade-off ("pay for the next page in advance; at most 5 sats may be spent on a page you never open") as a separate
  decision for you. We will not ship it silently.
- **Revisiting a purchased page is free**, on any device, because the entitlement is keyed by identity (§4.4).
- **Money spent and purchases confirmed are tracked separately.** A payment leaves the wallet when `createAction`
  returns (F9), which can be *before* the server responds. So the counter keeps a ledger keyed by **txid**, with each
  entry in one of three states:
  - `pending`: the wallet created the payment, but the server's answer hasn't arrived. It is shown as "confirming…"
    and **included** in "spent".
  - `confirmed`: the server returned 2xx with `x-bsv-payment-satoshis-paid`, and the page is entitled.
  - `unresolved`: the response was lost or errored. Reconciliation asks the server for the purchases this identity
    made for this edition and matches them by txid. Matches become `confirmed`. Anything else stays visibly
    `unresolved` (money spent, no page). It is never hidden and never counted twice.
  - Keying by txid makes double-counting impossible. Getting the txid out of AuthFetch's payment (via its action
    labels/derivation prefix, or a thin wrapper) is **[EVIDENCE: E11]**.
- Display: **"Spent: X sats (N pages · Y fees)"**, plus a "confirming…" or "1 payment unresolved" badge when one
  applies. "Session" means since this tab opened. An all-time-for-this-book line is optional. **[EVIDENCE: A9]**
  decides whether Y is exact or estimated.

### 4.3 Retry, replay and concurrency
- **Purchase record (durable):** `purchases(identity_key, edition_id, page_no, txid UNIQUE, sats_paid, fee_sats?,
  created_at)` with **UNIQUE(identity_key, edition_id, page_no)**. The `replayStore.claim` is backed by the same DB
  using atomic insert-if-absent on `txid`.
- **Entitlement-first pricing:** `calculateRequestPrice` returns **0** if the caller already owns the page. That makes
  retries idempotent: a client that lost a response retries **without** a payment header and gets the page free.
- **Replay = refuse:** a txid reused for a *different* page, book, or identity → 409 (from the middleware). It never
  unlocks a second purchase.
- **Same-purchase retry:** the app client (not AuthFetch's internal retry) retries first *without* payment, so the
  entitlement serves it. Because of F8, AuthFetch's built-in retry with the same tx would hit 409. **[EVIDENCE: A8]**
  decides whether we wrap AuthFetch, disable its payment retry, or add a pre-middleware that maps "txid already recorded
  for this exact (identity, page)" → serve.
- **Request id:** the client sends `x-request-id` (UUID per page request) for log correlation and timing. The
  idempotency key itself is the natural key `(identity, edition, page)`.
- **Requirement: one page = one charge, not just one entitlement.** A second payment for a page the reader already
  owns (or is already buying) is a **correctness failure**. It must be fixed before the final demo, not just logged.
  - The client lock (one request in flight per tab) only covers double-clicks. It **cannot** prevent races between two
    tabs or two devices.
  - Server-side candidate **[EVIDENCE: E10]**: when issuing a 402 challenge for (identity, edition, page), record a
    short-lived `pending` purchase intent tied to the derivation prefix. While that intent is open, another request for
    the same page gets **409 "purchase in progress"** (no new challenge, so no second payment). A paid request carrying
    a prefix that doesn't match the open intent is refused **before** `internalizeAction`, so no money is accepted.
    The intent expires after a timeout (e.g. 30 s). Whether this can be done with the middleware's hooks or needs a
    thin wrapper is part of the experiment.
  - Any duplicate payment that still gets through is recorded as `duplicate_payment` and counts as **FAIL** for the
    duplicate-charge criterion.
- **Crash window:** the wallet accepts the payment before our purchase insert. We record the purchase in the route
  handler immediately after `next()` and log any orphaned txids found in the server wallet. This is a known residual
  risk to document.

### 4.4 Identity, bookmark, permissions
- **Identity = `req.auth.identityKey`** (BRC-103). No accounts and no Clerk. Tables are keyed by that key only. [DRAFT]
- **Bookmark = the last page the reader's client actually *displayed*** per (identity, edition). The page response
  does **not** set it, because a returned page is not proof it was shown. Instead the client sends a separate
  authenticated `PUT /bookmarks/:edition {page}` once the page has rendered (after paint and visible). Bookmark
  writes are **independent of payment**: a failed bookmark write never affects a purchase, and a purchase never moves
  the bookmark. The write is last-writer-wins with a client timestamp. Free-page reads without a wallet stay in
  localStorage and are not bookmarked on the server.
- **Cross-device:** purchases and bookmark follow the identity key, so on the phone the reader resumes at the bookmark
  and re-reads purchased pages for free. **[EVIDENCE: A6]**
- **Permissions:** serve `manifest.json` declaring the spending authorization (~5,000 sats) plus the protocols the auth
  handshake and BRC-29 need. UI copy must say what the wallet actually grants: a **monthly limit per app, fees
  included** unless E3 shows otherwise. Do **not** promise "per session". **[EVIDENCE: A1–A3]**

### 4.5 Protocol choice [APPROVED FOR SPIKE — 2026-10-15]
**BRC-105** (`@bsv/auth-express-middleware` + `@bsv/payment-express-middleware` on the server, `AuthFetch` on the
client). Reasons:
- The brief names `auth-express-middleware`.
- Bookmarks and re-reading owned pages need an authenticated identity on requests that carry **no payment**.
- The middleware gives atomic replay claims and stable error codes.

Decision: user approved the recommendation and tier-1 probe in chat. See `auth-payment-comparison.md` for the alternatives and correctness obligations. This approves the experiment, not the final product design or a claim that criteria pass.

*Correction (2026-10-15):* an earlier version said a BRC-29 payment does not prove the sender's key. That was wrong.
`internalizeAction` succeeds only if output 0 is locked to the key derived from the sender/server shared secret, so an
accepted payment does bind the payer's identity key, as the create-bsv-app docs note. The real gap is unpaid requests.

**Alternative under evaluation:** the create-bsv-app scaffold (v1.1.2) authenticates with per-request `@bsv/auth` proofs
(`signed-requests`) plus a plain BRC-29 pay route (its [accept-payments recipe](https://www.createbsvapp.com/docs/accept-payments.md)),
and states that `payment-express-middleware` needs BRC-103 sessions instead. Do not mix the two auth models. The spike
picks one, with BRC-105 as the default unless it proves to conflict with the scaffold. BRC-121 / `@bsv/402-pay` is
excluded.

### 4.6 Architecture [CANDIDATE — decided after spike]
The candidate is one long-running Express (Node 22+) process that serves the API and the static React build, uses SQLite,
and runs a server wallet (`@bsv/wallet-toolbox` or `@bsv/simple` ServerWallet with remote storage, picked in the spike).
Next.js + Tailwind v4 on Vercel remains an option for the frontend once E4 confirms latency and session behaviour. No
deployment split will be added just to match the suggested stack.

## 5. Minimal spike (gated: needs your approval before it starts)

Approval received 2026-10-15. Implementation and evidence live in `../spike/`; see its README and `../LEARNINGS.md` for measured versus pending results. Tier 2 and milestone 1 have not started.

Probe setup adjustment: the same restored wallet must not buy the same edition/page twice to generate latency samples. The harness therefore exposes up to page 43 of the **same immutable edition** so Desktop can use pages 3–22 and Browser pages 23–42 for disjoint 20-turn paid cohorts. Browser first requests page 3 to establish identity/re-read ownership and test the bookmark. No entitlements are deleted and no C1–C11 target is relaxed. Actual page ranges must be recorded with every run. The small-limit renewal experiment remains tier 3 per the priority list below; base scope/expiry inspection and tab reopen remain tier 1.

**Goal:** resolve the assumptions in priority order. All code is **throwaway**, kept in `spike/`. Time-box: 2–3 days.
**Pin exact package versions** (`@bsv/sdk`, the auth and payment middleware, the wallet toolbox, and both wallet app
versions) and re-check facts F1–F10 against *those* versions. The research above was done on ts-stack `main` and
is not yet version-verified.

**Priority tiers.** Work tier 1 to completion before tier 2. Anything not done when the time box ends is labelled
**UNRESOLVED – follow-up**. Evidence is not rushed.
- **Tier 1 (must):** E9 free pages without a wallet · E1/E2/E3 permissions: prompt count, scope, expiry ·
  E6 cross-device identity · E4 baseline pay-on-click latency.
- **Tier 2:** negative checks (underpay → 400, replay → 409) · E7 lost-response retry · E10 duplicate-payment races
  across **two tabs and two devices** · E11 counter ledger and reconciliation.
- **Tier 3 (follow-ups if time runs out):** E5 latency optimizations without paid prefetch · E8 exact fee accounting ·
  allowance renewal behaviour · hosting comparison.

**Setup:** 1 book (one Gutenberg edition, segmented), pages 1–2 free, **page 3 paid at 5 sats** (plus pages 4–23 used only
for the 20-turn latency loop). A single Express process with auth and payment middleware, SQLite (`purchases`,
`bookmarks`, replay claims), and a mainnet server wallet. One plain HTML/TS page (no React yet) using `WalletClient` +
`AuthFetch`, with a timing log per segment and a prompt diary. Public HTTPS via a tunnel so the phone can reach it.

**Runs (each on BSV Desktop *and* BSV Browser), in tier order:**
- **Tier 1:**
  1. E9: no-wallet free pages.
  2. E1: first-paid-page prompts, with and without a manifest.
  3. E2/E3: 20 paid turns, counting prompts, and inspecting the granted scope and expiry; also close and reopen the tab.
  4. E6: cross-device identity and bookmark (bookmark written after display).
  5. E4: timing table for those 20 turns.
- **Tier 2:**
  1. Underpay: 4 sats on output 0 → 400.
  2. Reuse a txid for another page → 409.
  3. Reuse a txid under a different identity → refused.
  4. E7: lost-response retry → page served, no second charge.
  5. E10: same page requested at the same moment from two tabs, then from laptop + phone → exactly one charge.
  6. E11: kill the response mid-flight → the counter shows the spend as pending/unresolved, then reconciles to
     confirmed, without double counting.
- **Tier 3:** E5, E8, renewal, hosting.

**Output:** `LEARNINGS.md` sections 1–4 from the brief (who is calling / how a page gets paid / when the wallet prompts /
what was awkward), backed by a timing table, a prompt log, and screenshots. Then: the hosting decision, the
prefetch decision, and the counter copy.

## 6. Acceptance criteria (the brief's own targets, unchanged)

Every criterion is recorded as **PASS / FAIL / UNRESOLVED** against the brief's target **as written**. A documented
gap or a workaround is **not** a pass. Any proposal to change a requirement goes in the separate table below and
needs your (and the team's) explicit agreement.

| # | Brief's target (verbatim intent) | Measured by | Spike result | Final demo result |
|---|---|---|---|---|
| C1 | Browsing and preview pages work with **no wallet connected** | E9: 0 wallet calls, 0 errors, both devices | FAIL | UNRESOLVED |
| C2 | The wallet prompts **once per session, not per page** | E1–E3: total prompts of **any** kind from first visit through 20 paid turns = **1** | FAIL | UNRESOLVED |
| C3 | Page turn **< 500 ms including payment** | E4: p95 of pay-on-click turns over 20 turns per wallet ≤ 500 ms | UNRESOLVED | UNRESOLVED |
| C4 | **Running spend counter**: accurate and always visible | Counter = sum of txids that left the wallet (pending + confirmed + unresolved); no double counts; visible on every paid page | FAIL | UNRESOLVED |
| C5 | **Underpaid or replayed requests are refused** | 400 on underpay; 409 on reuse for another page or identity | UNRESOLVED | UNRESOLVED |
| C6 | Pay for exactly what you use: **one charge per page** | E7 retry gives no second charge; E10 two tabs + two devices give exactly one charge | UNRESOLVED | UNRESOLVED |
| C7 | **No account anywhere** | DB holds only identity keys; no email, password or card field anywhere in the flow | UNRESOLVED | UNRESOLVED |
| C8 | **Bookmark follows the reader across devices** | E6: same identity key; phone resumes at the last *displayed* page | UNRESOLVED | UNRESOLVED |
| C9 | **Mainnet, BSV Desktop + BSV Browser** | All runs on mainnet in both wallets | UNRESOLVED | UNRESOLVED |
| C10 | **Six-step story in ~90 s** | Timed live run (final only) | UNRESOLVED (final only) | UNRESOLVED |
| C11 | **Learnings note written and shared** | Sections 1–4 with evidence | UNRESOLVED | UNRESOLVED |

Recorded 2026-10-17 against the unchanged targets. [Current requirement audit](project-requirements-status.md) explains each outstanding gate. [Recovery/permission checkpoint](../spike/evidence/recovery-permissions-checkpoint-2026-10-17.md): 31 local tests pass, including underpayment/cross-identity replay and delayed synthetic approval contention; these do not upgrade native/mainnet criteria. Temporary HTTPS public checks passed, then the tunnel was stopped per user instruction. Continue with `npm run dev` and the local browser; physical phone acceptance and native allowance evidence remain unverified. The four-section learnings note is written; actual team sharing is unrecorded. No new payment was initiated and purchases remain paused.

Catalogue follow-up: [eight full fixed-page editions and per-edition delivery are implemented](../spike/evidence/catalogue-2026-10-17.md). Holmes keeps its original immutable edition and product access now extends to all 265 pages; legacy probe cohorts/43-page window are unchanged. Client build/lint and spike build pass, with 35 local tests and wallet-free browser checks for the seven newly completed readers. Native scoped-payment and physical-phone acceptance remain separate; no C1–C11 status is upgraded. Track the user's full [nine-requirement queue](requirements-execution.md).

**Proposed requirement changes** (filled in only from evidence; none proposed yet):

| Criterion | Observed | Proposed change | Rationale | Agreed? |
|---|---|---|---|---|
| — | — | — | — | — |

Example of what might go here: if the wallet's approval turns out to be monthly per app, C2's "per session" wording
may need restating. That would be a **proposal**, while C2 itself is recorded as measured.

**Escalate before building** if C2, C3 or C8 is FAIL in either wallet with no credible fix, or if C6 cannot be
made to pass by any server-side design.

## 7. After the spike
1. Update this plan with the evidence and turn each [EVIDENCE] into a decision.
2. Write a short spec plus 4 low-fi wireframe states (catalogue, free preview, permission moment using real wallet copy,
   paid reading with counter), then `superpowers:writing-plans`.
3. Build in milestones: reader → identity/bookmarks → payments/entitlements → latency → demo rehearsal → optional
   py-sdk probe.

**Prerequisites from you:** BSV Desktop + BSV Browser installed and restored to the **same** wallet, a small mainnet
balance (~10k sats), and a funded server wallet key.
