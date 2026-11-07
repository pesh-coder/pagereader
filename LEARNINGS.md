# Pagestream: what we learned

Pagestream sells access to Project Gutenberg books without signup. Pages 1–2 are free; later pages cost 5 sats **plus a miner fee**. This note explains what works and what remains against the POC brief.

## Status at a glance

- Built: eight complete books, wallet-free previews, paid delivery/recovery, identity-based bookmarks and a visible page-spend counter.
- Observed: three Desktop mainnet purchases totaling 74 sats and phone purchases through page 33, with 868 sats recorded (155 page prices + 713 miner fees). Pages 3 and 4 cost 28 sats each; the owner confirmed pages 5 and 6 opened without native wallet prompts or repeated app fee approval. Page 4 was reported almost instant; this is not an instrumented speed result. The original phone page/grant and their funding transfers are mined; the earlier mining blocker is closed.
- Hosted: Vercel reader + Railway Express server, receiving wallet and persistent SQLite. Health checked 2026-11-07: mainnet, payment-ready, purchases enabled. All 16 public previews passed wallet-free HTTP checks; the owner also confirmed both Holmes previews on the phone after app logout, with no errors or wallet prompt. Free-preview acceptance passes.
- **The POC is not complete:** same-identity cross-device resume, session approval, paid-page speed, remaining live fault/concurrency tests and the timed six-step demo remain open.
- The [acceptance register and remaining work](docs/project-requirements-status.md) separates implementation gaps from live checks. Team sharing is also unconfirmed.
- The [senior review changes](docs/review-feedback-r1.md) are deployed. Phone page 3 opened and resumes at 28 sats; repeat paid turns now work; broader pending/recovery accounting remains open.

**Pricing decision, updated 2026-11-07:** the seller receives 5 sats per page and the reader pays actual miner fees on top. One app approval now permits fees up to **23 sats per new page**, at most **28 sats total**, while this reader remains open. Each Next click requests one page without repeating the app approval. Lower fees cost less; higher or unknown fees stop for review. Reload/logout clears this app consent. Use the maintainer-recommended **100 sats/kB** for the wallet; Desktop returned to 250 after restoration and still needs its latest setting confirmed. This app fee ceiling is separate from the wallet's monthly allowance: it does not satisfy the original wallet-managed session requirement or prove 500-ms turns.

**Acceptance stays as briefed:** one wallet approval per session remains required. The monthly allowance is a stack gap; closing the tab stops new purchases but does not prove the wallet grant expires. We must use supported wallet session behavior or leave this criterion unmet. Wallet modification and replacing the wallet limit with an app/server limit remain outside scope.

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

The server has a persistent wallet-toolbox receiving wallet; the scaffold's `ProtoWallet` alone is not that receiver. **Continue reading** retrieves ownership and the last displayed bookmark without buying anything. Desktop recovery and same-wallet phone resume work; matching Desktop/Browser identities for cross-device resume is unverified. The active reader's no-account audit passed on 7 November.

## 2. How a page gets paid

We use **BRC-105**, the HTTP payment challenge flow. **Atomic BEEF** carries the transaction and proof data needed for verification.

1. The client requests an unowned page with a durable request ID. The server reserves the identity/edition/page and returns `402 Payment Required`, a 5-sat price and a derivation prefix.
2. `AuthFetch` asks the wallet to `createAction`, paying the server's BRC-29 derived output key. Our wrapper requests an unsigned action with `noSend` (do not broadcast).
3. After the reader approves the fee ceiling, the app checks the output and actual miner fee against **23 sats per page**, then asks the wallet to sign, still without broadcasting. A higher quote needs a separate approval for that page only; unknown fees remain blocked. Unapproved/legacy calls retain their 1-sat fallback.
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

**Real cost:** the first Desktop page cost **62 sats: 5 price + 57 fee**. After lowering its rate to 1 sat/kB, two more cost **6 sats each**. Those historical Desktop pages total **74 sats**, with another **244 sats** in permission costs. Browser pages 3 and 4 each cost **28 sats: 5 price + 23 fee**. The earlier 1-sat app cap cancelled the unsigned page-4 attempt; explicit approval then completed it. The new reader consent avoids that repeated failure/retry for fees within 23 sats. [Desktop reconciliation](spike/evidence/reader-cost-reconciliation-2026-10-17.md), [phone checks](spike/evidence/acceptance-check-2026-11-07.md).

The counter includes recorded page prices and fees once per transaction; unknown fees are marked. Confirmed fees persist server-side so another browser can recover the same total. Permission setup is excluded and identified separately. Complete cross-device accounting remains unverified. “5 sats per page” alone is not an accurate total-debit claim.

**Why the phone payments became stuck:** we lowered Desktop to 1 sat/kB to reduce page costs. That was a mistake for the working setup: we treated the processor's minimum accepted rate as suitable for reliable mining. Desktop then funded the phone with two transfers paying only 1 sat each (about 4 sats/kB for their actual size). The phone's **28-sat page debit** and **199-sat permission grant** paid around 100 sats/kB themselves, but spend those unmined funding transfers. The maintainer confirmed that the Desktop parents are holding up the Browser payments; Browser does not inherit Desktop's fee setting, it inherits the dependency on those funds.

Arcade is the wallet's broadcast processor, separate from the WhatsOnChain explorer. Its `SEEN_MULTIPLE_NODES` status means the transactions were seen on the network, not mined. **Update, 7 November:** both phone debits and both funding transfers now show 701 confirmations on WhatsOnChain and `MINED` on Arcade; the mining blocker is closed without another page purchase or a manual rebroadcast by the agent. Changing the fee setting affects future transfers, not existing signed transactions. The client also checks and saves broadcast results instead of ignoring failures. [Original investigation](spike/evidence/phone-transaction-status-2026-11-02.md), [confirmation and acceptance checks](spike/evidence/acceptance-check-2026-11-07.md).

**Why this differs from the brief:** official BRC-105 middleware coordinates the challenge/retry instead of a hand-written payment endpoint. It still uses `createAction` and Atomic BEEF. We do not combine it with the scaffold's separate signed-proof recipe. We avoid paid prefetch so readers pay only for pages they explicitly request.

Speed remains unresolved: one paid sample took **9.01 s for paid HTTP** and **47.33 s request to frame marker**, including **1.41 s broadcast**. No paid p95 exists; the under-500-ms target needs investigation and measurements. Closing the tab starts no further purchases, but cannot undo a submitted payment. Leaving mid-chapter still needs a live check.

The native Browser capture now contains **13 new paid turns, pages 20?32**. Median request-to-visible-frame time is **6.51 s**, with a range of **5.75?7.61 s**: the 500-ms target is missed. Phone payment work takes 1.20?1.60 s; the server's wallet acceptance call takes 1.76?2.10 s. Server auth and SQLite are small contributors. This is an incomplete cohort, not a qualifying 20-turn p95. [Measured report](spike/evidence/phone-paid-run-2026-11-07.md).

Page 20 recovered, but page 33 then failed with the specific wallet error **Maximum BEEF depth exceeded. Limit is 12**. The new diagnostics confirm that cause for page 33; page 20 originally saved only a general code. The wallet is reaching a payment-proof dependency limit, separate from page price and allowance. The run also contains a 30-second timeout at page 28, which later succeeded. All failures and recovery checks are retained; they are not additional accepted charges. The later bounded pilot recovered the original page-33 attempt successfully. Further paid cohorts remain paused while receiver acceptance latency is investigated. Waiting for mining would not satisfy seamless 500-ms reading.

**Fix active on the phone:** page 33 now completes, using eight known ancestors and reducing the payment proof sent over HTTP from 3,612 to 302 bytes. Its one 28-sat purchase brings the book total to **868 sats**. The app still retains complete proofs and the server restores and verifies them. The turn took **7.07 s**, including **2.43 s** receiver acceptance, so speed remains unmet. One successful retry does not prove sustained reading avoids the depth limit. All 105 implementation tests pass. [Pilot results](spike/evidence/phone-page33-pilot-2026-11-07.md).

## 3. When the wallet prompts

**“Approve 5,000 sats this session” is not what we observed.** On Desktop 3.1.1.0:

1. Initial use showed separate protocol/spending prompts. Plain **Authorize** was one-time, so later pages prompted again.
2. A grouped **Select App Permissions** grant saved **5,000 sats per month**, with protocol permissions. Saving it cost **5 sats on-chain**, undisclosed in the reported prompt.
3. The next purchase had **zero prompts**. Moving to the hosted origin requested a new allowance; it was denied, with no new debit observed.

The app's `walletLimitSats: 5000` feeds the permission manifest. It requests a wallet-managed allowance; it does not enforce a session budget. [Manifest](spike/src/manifest.ts), [grant evidence](spike/evidence/grant-only-run-2026-10-17.md).

The reader now asks once per open reader to allow **5 sats plus up to 23 sats fee per page**. Later Next clicks use that ceiling with the same wallet identity. Reload/logout requires fresh app consent; the old 1-sat explanation flag is ignored. This removes repeated **app** confirmations within the ceiling; it does not prove one native wallet prompt or a session-scoped wallet grant.

**Allowance accounting is unreliable in the tested wallet:** the hostname allowance counted 6 sats while port-labelled page payments brought actual spending to 74. The same query affects enforcement. Offline reproduction covered toolbox 2.14.5 and 2.14.9. The recorded upstream review found Desktop PR #124 fixing future labels on an integration branch, excluding old records, outside the inspected v3.1.1 release. Its release status has not been rechecked for this rewrite. [Investigation](spike/evidence/spending-originator-accounting-2026-10-17.md), [follow-up](docs/wallet-originator-follow-up.md).

**BSV Browser 1.6.3:** free previews and owned-page resume pass. Page 3's 28 sats matches the native debit; its separate permission grant cost 199 sats. After a page-bound approval, page 4 also opened for 28 sats, reported as almost instant; the receiver independently shows its 5-sat output and 23-sat fee. A later capture confirms successful page-20 recovery and purchases through page 32, with an 840-sat ledger total; page 33 then hit the confirmed proof-depth limit. After the fix, the page-33 pilot succeeded and the ledger reached 868 sats. The owner reports all earlier native transactions are completed. The owner then confirmed pages 5 and 6 worked under the new app ceiling with no native wallet approvals, and Continue reading created no new purchase after the stopping check. The later book total is supplied above; wallet allowance consumption remains unverified. Desktop and phone have different identities, so same-identity resume is still open.

The shared Browser wallet package hard-codes 100 sat/kB, including the package used by Browser 1.8.0; no fee-rate setting was found in its configuration screen. Desktop's lower rate was an explicit setting change. [BSV Browser issue #176](https://github.com/bsv-blockchain/bsv-browser/issues/176) requests suitable fees for ordinary micropayment users; submitted 2026-10-29. The maintainer subsequently recommended keeping 100 sats/kB for mining acceptance and identified low-fee Desktop funding parents as the earlier phone mining blocker. Raising Pagestream's cap does not lower wallet fees.

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
