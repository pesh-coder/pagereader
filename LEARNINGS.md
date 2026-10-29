# Pagestream: what we learned

Pagestream sells access to Project Gutenberg books without signup. Pages 1–2 are free; later pages cost 5 sats **plus a miner fee**. This note explains what works and what remains against the POC brief.

## Status at a glance

- Built: eight complete books, wallet-free previews, paid delivery/recovery, identity-based bookmarks and a visible page-spend counter.
- Observed: three Desktop mainnet purchases, one prompt-free paid turn, and hosted recovery of owned pages and their 74-sat total.
- Hosted: Vercel reader + Railway Express server, receiving wallet and persistent SQLite. Health checked 2026-10-27: mainnet, payment-ready, purchases enabled.
- **The POC is not complete:** phone payment/resume, session approval, paid-page speed and the timed six-step demo remain open.
- The [acceptance register and remaining work](docs/project-requirements-status.md) separates implementation gaps from live checks. Team sharing is also unconfirmed.
- The [senior review changes](docs/review-feedback-r1.md) are deployed. Phone previews and a native permission prompt have been observed; successful phone payment remains open.

## 1. Who is calling

The wallet's **identity key** is a public key used to find purchases and bookmarks. There is no account registration.

1. Browsing and free pages bypass authentication and do not load the wallet helper.
2. Explicit paid access, **Continue reading** or **Connect wallet** loads the generated helper, which connects to the BRC-100 wallet and obtains its identity public key. The menu shows that public identity; Log out clears the active app connection while retaining purchases and recovery records. Private keys stay in the wallet.
3. The SDK's `AuthFetch` performs the BRC-103 mutual-authentication handshake at `/.well-known/auth`, exchanging public identities and proving control through signed messages. Requests carry `x-bsv-auth-identity-key` plus session/signature data; the header alone is not proof. The server verifies them with `@bsv/auth-express-middleware`.
4. Routes read `req.auth.identityKey`, supplied by the verified authentication context, and use it in SQLite queries. A reader-supplied account field is not trusted.

The [actual schema](spike/src/store.ts):

| Table | Key | Other stored fields |
|---|---|---|
| `purchases` | `identity, edition, page` | unique `txid`, `sats` |
| `bookmarks` | `identity, edition` | `page`, `displayed_at` |
| `intents` | `identity, edition, page` | `request_id`, `prefix`, `txid`, `state` |
| `replay_claims` | `txid` | used-payment marker |
| `payment_proofs` | `txid` | `identity, edition, page, proof` |
| `purchase_costs` | `txid` | `fee_sats`, `source` |
| `intent_recoveries` | `identity, edition, page, request_id` | previous state and recovery reason/time |

No email, password, card or profile fields exist. `edition` identifies a fixed version of a book's pages. A purchase row means “this identity owns page 6 of this edition.”

The server has a persistent wallet-toolbox receiving wallet; the scaffold's `ProtoWallet` alone is not that receiver. **Continue reading** retrieves ownership and the last displayed bookmark without buying anything. Desktop recovery works; matching Desktop/Browser identities and phone resume are unverified.

## 2. How a page gets paid

We use **BRC-105**, the HTTP payment challenge flow. **Atomic BEEF** carries the transaction and proof data needed for verification.

1. The client requests an unowned page with a durable request ID. The server reserves the identity/edition/page and returns `402 Payment Required`, a 5-sat price and a derivation prefix.
2. `AuthFetch` asks the wallet to `createAction`, paying the server's BRC-29 derived output key. Our wrapper requests an unsigned action with `noSend` (do not broadcast).
3. The app checks the output and a default maximum 1-sat miner fee, then asks the wallet to sign, still without broadcasting. A known higher quote can be approved explicitly for that page attempt only; unknown fees remain blocked.
4. It saves the signed proof locally before broadcasting that exact transaction.
5. `AuthFetch` retries with `x-bsv-payment` carrying the Atomic BEEF and derivation data, alongside the original `x-bsv-request-id`.
6. The server validates and accepts payment, commits ownership and returns the page. The old page stays visible until then; the bookmark follows display.

**Server checks, in execution order:** authenticate; match request ID and prefix to the identity/edition/page intent; reject a changed or differently bound transaction; have payment middleware validate the transaction and required output; accept it through `internalizeAction`; atomically commit the replay claim, purchase, known fee and confirmed intent before serving text. [Implementation](spike/src/probe.ts).

| Case | Result |
|---|---|
| Underpaid valid payment | `400`, no page |
| Payment reused for another page, edition or identity | `409`, no new entitlement |
| Already owned | Owned-page delivery, no new payment |
| Response lost | Recover the original saved proof; never create a replacement charge |
| Outcome uncertain | Preserve the intent/proof and reconcile; no automatic expiry or replacement |

Wallet acceptance and SQLite commit are separate operations. Recovery now checks the saved submission and accepts a receiver merge only for that original payment, completing the missing receipt after a local restart. A fresh browser can ask the server to recover its saved proof. Local tests simulate the receiver; real-wallet crash recovery and native concurrency remain unverified.

**Real cost:** the first page payment cost **62 sats: 5 price + 57 fee**. After lowering Desktop's fee rate from 250 to 1 sat/kB and restarting, two more cost **6 sats each**. Browser 1.6.3 quoted a **23-sat fee**, making a page **28 sats total**; that attempt was cancelled by the default cap. An explicit one-page fee approval now permits testing this quote without raising the default. Three completed pages total **74 sats**; two historical permission transactions cost **244 sats**, making **318 sats known outgoing**. [Reconciliation](spike/evidence/reader-cost-reconciliation-2026-10-17.md), [phone checks](spike/evidence/hosted-readiness-2026-10-29.md).

The counter includes recorded page prices and fees once per transaction; unknown fees are marked. Confirmed fees persist server-side so another browser can recover the same total. Permission setup is excluded and identified separately. Complete cross-device accounting remains unverified. “5 sats per page” alone is not an accurate total-debit claim.

**Why this differs from the brief:** official BRC-105 middleware coordinates the challenge/retry instead of a hand-written payment endpoint. It still uses `createAction` and Atomic BEEF. We do not combine it with the scaffold's separate signed-proof recipe. We avoid paid prefetch so readers pay only for pages they explicitly request.

Speed remains unresolved: one paid sample took **9.01 s for paid HTTP** and **47.33 s request to frame marker**, including **1.41 s broadcast**. No paid p95 exists; the under-500-ms target needs investigation and measurements. Closing the tab starts no further purchases, but cannot undo a submitted payment. Leaving mid-chapter still needs a live check.

## 3. When the wallet prompts

**“Approve 5,000 sats this session” is not what we observed.** On Desktop 3.1.1.0:

1. Initial use showed separate protocol/spending prompts. Plain **Authorize** was one-time, so later pages prompted again.
2. A grouped **Select App Permissions** grant saved **5,000 sats per month**, with protocol permissions. Saving it cost **5 sats on-chain**, undisclosed in the reported prompt.
3. The next purchase had **zero prompts**. Moving to the hosted origin requested a new allowance; it was denied, with no new debit observed.

The app's `walletLimitSats: 5000` feeds the permission manifest. It requests a wallet-managed allowance; it does not enforce a session budget. [Manifest](spike/src/manifest.ts), [grant evidence](spike/evidence/grant-only-run-2026-10-17.md).

The reader now shows its payment explanation once per tab session. Later Next clicks use the wallet directly. This removes repeated **app** confirmations; it does not prove one native wallet prompt or a session-scoped grant.

**Allowance accounting is unreliable in the tested wallet:** the hostname allowance counted 6 sats while port-labelled page payments brought actual spending to 74. The same query affects enforcement. Offline reproduction covered toolbox 2.14.5 and 2.14.9. The recorded upstream review found Desktop PR #124 fixing future labels on an integration branch, excluding old records, outside the inspected v3.1.1 release. Its release status has not been rechecked for this rewrite. [Investigation](spike/evidence/spending-originator-accounting-2026-10-17.md), [follow-up](docs/wallet-originator-follow-up.md).

**BSV Browser 1.6.3:** phone previews, recovery of an unpaid challenge and a grouped native permission sheet have been observed. The user reports page 3 opened and the reader shows 28 sats spent; page 4 quotes another 23-sat fee. Wallet-debit reconciliation, silent subsequent purchases and allowance accounting remain unverified. Desktop and phone have different identities, so same-identity resume is still open.

The shared Browser wallet package hard-codes 100 sat/kB, including the package used by Browser 1.8.0; no fee-rate setting was found in its configuration screen. Desktop's lower rate was an explicit setting change. A [draft upstream request](docs/browser-fee-rate-upstream.md) describes the supported fee-setting change needed; it has not been submitted. Raising Pagestream's cap does not lower wallet fees.

## 4. What was awkward

- **Fees and permission costs:** defaults overwhelmed the page price; saving grants also costs sats. [Costs](spike/evidence/permission-cost-review-2026-10-17.md).
- **Monthly allowance and origin accounting:** session scope is unavailable in the observed flow; port labels undercount spending. [Investigation](spike/evidence/spending-originator-accounting-2026-10-17.md).
- **Permission discovery:** observed localhost lookup used hostname port 80, requiring an optional metadata listener beside port 3108. [Discovery](spike/evidence/allowance-discovery-2026-10-17.md).
- **Two payment recipes and a verification-only scaffold wallet:** easy to confuse with a complete receiver. [Comparison](docs/auth-payment-comparison.md).
- **Long approvals and wallet stalls:** a denied request returned after about 494 s; Desktop history needed a normal restart. [Hosted attempt](spike/evidence/hosted-page7-denial-2026-10-19.md), [Desktop recovery](spike/evidence/page6-allowance-test-2026-10-17.md).
- **Timing visibility:** `AuthFetch` filters custom response headers; timing needs capturing underneath it. Cold `verifyHmac` took 1.73 s. [Latency](spike/evidence/latency-investigation-2026-10-17.md).
- **Tooling:** scaffold typing failed with TypeScript 6, so we pinned 5.8.3; the docs MCP was unavailable. [Package findings](spike/evidence/package-facts.md).
- **Bundle size:** the deferred SDK chunk was about 518 kB before gzip. [Reader review](docs/reader-milestone-1.md).

## 5. Python (optional)

Not attempted.

## Further detail

[C1–C11 acceptance and remaining work](docs/project-requirements-status.md) · [current hosting](deploy/vercel-railway.md) · [demo runbook](docs/mainnet-demo-runbook.md) · [evidence index](spike/evidence/README.md).

The [previous note and dated checkpoints](spike/evidence/checkpoint-log.md) are preserved unchanged as historical evidence. Its original relative links are relative to the repository root; its old status statements do not describe today's state.
