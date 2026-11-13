# Pagereader: what we learned

Pagereader is a proof of concept (POC): a reader for Project Gutenberg books where you pay a few satoshis per page with a BSV wallet. There is no signup. Pages 1–2 of every book are free; each later page costs **5 sats**. It runs on BSV mainnet with real money, tested on BSV Browser (phone) and BSV Desktop.

This file is written for the next person who picks up the repo. It explains what we built, what worked, what didn't, and why. Read the first two sections for the short version; the rest is the detail behind them.

**Where the POC ended (13 November 2026):** readers approve one **reading balance**, then turn pages with no wallet prompts. On the owner's phone, 23 paid pages in a row appeared in **31 ms at the 95th percentile** (target: 500 ms), with no errors. The approach that got us there is a one-way payment channel, explained in [section 3](#3-paying-for-pages-the-final-design-a-reading-balance).

---

## 1. The ten things to know first

1. **Don't put a blockchain transaction inside a page turn.** Paying each page as its own transaction took about 6.5 s per page, almost all of it inside the wallets (`createAction` on the reader's side, `internalizeAction` on the server's side). No amount of code optimisation fixed that. Replacing it with *one signature per page* inside a pre-funded balance brought a page turn to about 25 ms.
2. **Show the page first, settle the payment after.** Each page response carries the *next* page "on credit", so Next is instant. The signature for it follows in the background. The server caps unpaid credit at two pages per balance.
3. **BSV has no relative timelocks, so every held balance needs a fixed end date.** Lightning-style channels that never expire are not possible on BSV (no `OP_CHECKSEQUENCEVERIFY`, and the 2026 Chronicle upgrade did not restore it). Our balance has a refund that unlocks after 60 days, and the server returns unspent sats before that.
4. **The wallet's monthly allowance counts what goes out and never subtracts what comes back.** If a balance equals the allowance, the reader can open only one balance a month. Withdrawing the unspent sats does not help. We set the balance to **2,500 sats, half the 5,000 allowance**. [Details](#the-55-more-satoshis-refusal).
5. **If a wallet error doesn't change when you change the input, it isn't about your input.** "55 more satoshis are needed" stayed exactly the same for 5,000, 4,860 and 4,790 sats. Reading the wallet's own source code found the real cause in minutes, after hours of guessing.
6. **Treat everything a wallet reads as part of the app's identity.** Renaming the app or a permission description in the manifest made BSV Browser ask for every permission again, and broke connecting until a restart. Never rename permission names, labels, storage keys or the manifest without a reason.
7. **After a reload, nothing about the wallet is known yet.** The phone doesn't stay connected across reloads. The reader must reconnect and confirm a saved balance with the server *before* deciding to ask for a new one. Getting this wrong showed "Approve 2,500 sats" to readers who already had a balance.
8. **Miner fees dwarf a 5-sat price unless you batch.** Per-page transactions cost 23 sats in fees on a 5-sat page. A reading balance pays about 72 sats in fees *once* (open + settle), whatever the number of pages.
9. **Low fee rates can strand later payments.** Funding the phone from Desktop at 1 sat/kB left those transfers unmined, and every phone payment built on them got stuck. Keep wallets at **100 sats/kB**.
10. **Wallet errors lose detail on the way to you.** The SDK replaces unrecognised codes with "Wallet operation failed", and the phone bridge drops numeric fields (only the message text survives). Always show the wallet's own words and code to the reader.

---

## 2. Results

| Run | What was measured | Result |
|---|---|---|
| Per-page transactions, phone, 7 Nov | Tap → page visible, 13 pages | median **6.51 s** (5.75–7.61 s). Target missed |
| Reading balance, phone, 13 Nov (first run) | Tap → page visible, 20 pages | p50 24 ms, **p95 32 ms** |
| Reading balance, phone, 13 Nov (final run, after reload fix) | Tap → page visible, 23 pages (4–26) | **p95 31 ms**, max 32 ms, 0 errors, 0 wallet prompts |
| Same final run | Wallet signature per page | 41–74 ms |
| Same final run | Payment confirmed by the server (background) | median 389 ms, p95 584 ms, max 619 ms |

The 500 ms target is "tap to visible page", and it is met. The background confirmation sits close to one phone-to-server round trip: the server's own work is about 8 ms, and the rest is the network (phone → Vercel → Railway). Moving the server from Railway US West to EU West cut that round trip from 390 to 261 ms. Bypassing Vercel and calling Railway directly saved only 7–10 ms, so we kept the single address.

**Cost:** 20 pages through a reading balance cost about 172 sats in total (8.6 per page). With per-page transactions they cost 28 sats per page (5 price + 23 fee).

---

## 3. Paying for pages: the final design (a reading balance)

A reading balance is a one-way payment channel between the reader and the Pagereader server.

1. **Open (one wallet approval).** The reader's wallet locks up to 2,500 sats, fees included, into an output that needs *both* the reader's and the server's signatures to spend. Before anything is broadcast, the server signs a **refund** to the reader that unlocks after 60 days. The reader checks it, and only then is the funding sent. If Pagereader vanished, the reader would get the sats back on day 60.
2. **Each page (no prompt).** The reader's wallet signs "the server may now take 5 × n sats" with `createSignature` (about 50 ms on the phone). The request is a plain POST: the signature itself proves who sent it, so no BRC-103 handshake is needed. The server checks that the amount is exactly one page more than last time, verifies the signature, records the purchase and returns the page plus the next one on credit.
3. **Top up (one approval).** One transaction spends the old balance plus new wallet sats into a new full balance, and pays the server for pages already read. Nothing is sent until the server has signed the refund for the new balance.
4. **Withdraw.** The server adds its signature to the latest signed state and broadcasts once. The reader's unspent sats come back to the wallet as a normal BRC-29 payment.
5. **Automatic return.** After 30 days without reading, or 55 days without a top-up, the server settles and returns what is left, well before the 60-day refund unlocks.
6. **Reloads, days and books.** The balance stays open across all of them. One balance per wallet pays for pages in any book.

**What the server rejects:**

| Case | Result |
|---|---|
| Wrong or forged signature | `400`, no page |
| An amount that skips or repeats a step | `409`, no page |
| The same signature resent for the same page (lost response) | The same page again, never charged twice |
| The same signature used for another page or book | `409` |
| Balance closed or settled | `409 SESSION_CLOSED`; the reader is offered a new balance |
| Credited pages never paid for | At most two per balance, then credit stops |

**Settings** (in [config.ts](app/client/src/payments/config.ts)): balance 2,500 sats, price 5 sats, settlement fee 30 sats, opening fee capped at 60 sats, refund after 60 days, idle return after 30 days, latest settlement at 55 days.

**Code:** reader side in [channel-session.ts](app/client/src/payments/channel-session.ts) and [payment-channel.ts](app/client/src/payments/payment-channel.ts); server side in [channel-service.ts](spike/src/channel-service.ts); reader logic in [gateway.ts](app/client/src/reader/gateway.ts). **Tests:** [payment-channel](spike/test/payment-channel.test.ts), [payment-session](spike/test/payment-session.test.ts), [reader-session](spike/test/reader-session.test.ts). **Design and measurements:** [research note](spike/evidence/payment-channel-research-2026-11-10.md).

---

## 4. The first design, and why it was replaced (per-page transactions)

Until 13 November each page was its own on-chain payment, using **BRC-105** (an HTTP `402 Payment Required` challenge, then a retry carrying the payment). The code is still there, but only to check and recover old payments; it can't start a new purchase.

How it worked:
1. The reader asks for a page. The server reserves it and answers `402` with the price.
2. The SDK's `AuthFetch` asks the wallet to `createAction` (build a transaction) without broadcasting. The app checks the output and the miner fee (at most 23 sats), then asks the wallet to sign.
3. The app saves the signed proof locally, then retries the request carrying the transaction (Atomic BEEF).
4. The server accepts it with `internalizeAction`, records ownership in one database transaction, and returns the page.

What it taught us:
- **It was slow, and not fixably so.** About 1.5 s in the reader's wallet and 2–3 s in the server's wallet per page (the server's wallet used remote storage). Smaller proofs (3,612 → 302 bytes) and faster proof merging (19–61% faster) saved milliseconds, not seconds. [Latency investigation](spike/evidence/receiver-latency-investigation-2026-11-07.md), [algorithm research](spike/evidence/latency-algorithm-research-2026-11-10.md).
- **It was expensive.** 5 sats price + 23 sats fee per page at 100 sats/kB.
- **Chains of unconfirmed payments hit a wallet limit.** After about 30 quick purchases the phone failed with "Maximum BEEF depth exceeded. Limit is 12", because each payment's proof carried its unmined ancestors. Passing known ancestors fixed it. [Pilot](spike/evidence/phone-page33-pilot-2026-11-07.md).
- **Recovery is the hard part.** A payment can be signed, sent or accepted with the response lost. Every state had to be saved and reconciled without ever creating a second charge. [Recovery fix](spike/evidence/recovery-fix-2026-10-17.md).
- **"Paying the next page in advance" only hid the delay** and bought pages the reader might never open, so it was dropped.

---

## 5. Wallet permissions and prompts

The app publishes a **manifest** ([manifest.ts](spike/src/manifest.ts)) listing the permissions it needs and a **monthly spending allowance** of 5,000 sats. The wallet stores each grant as a small on-chain "permission token", which costs a few sats to create or renew.

What the reader sees on BSV Browser 1.6.3:
- **Opening a balance:** one spending approval. The first time, also a grouped prompt for the `pagestream channel` signing permission ("Sign each page of an approved reading session").
- **Pages:** no prompts.
- **The signing permission came back** after about 35 minutes (apparently a time-limited grant), and again after the manifest's display text changed.

### The "55 more satoshis" refusal

On 13 November BSV Browser refused every new balance with "Insufficient funds … (55 more satoshis are needed, for a total of 55)" (code 7), for any amount, while showing 5,565 sats.

**Cause** (confirmed in the wallet's source, `WalletPermissionsManager` in `@bsv/wallet-toolbox`): when an app asks to spend, the wallet:
1. builds the payment and **reserves the coins** that will fund it;
2. checks the app's monthly allowance, adding up everything the app sent out this month. **Sats that came back are not subtracted**, so the earlier 5,000-sat balance had used the whole month even though 4,810 sats had been withdrawn;
3. finds the allowance exceeded, so it **renews the permission on-chain**: a small separate transaction with about a 55-sat fee;
4. finds no free coin for that renewal, because step 1 reserved them all, and fails.

The 55 never changed because it was the renewal's cost, not the balance. That's why offering smaller balances never helped.

**Fixes:**
- Default balance lowered to **2,500 sats**, half the allowance. A reader can open or top up twice a month before any renewal is needed.
- When it does happen, a **separate small coin** (about 300 sats) in the phone wallet lets the renewal pay its fee. The month rolling over (1st, UTC) also resets the count.
- With both changes, the owner's next 2,500-sat balance opened the same evening (opening fee 72 sats).

### Older permission findings (per-page era)
- On Desktop 3.1.1.0, plain **Authorize** was one-time, so every page prompted. A grouped **Select App Permissions** grant saved a 5,000-sat monthly allowance and then pages ran with no prompts. Saving that grant cost 5 sats on Desktop and 199 sats on the phone. [Grant evidence](spike/evidence/grant-only-run-2026-10-17.md), [permission costs](spike/evidence/permission-cost-review-2026-10-17.md).
- The allowance was undercounted on Desktop: spending labelled with a port (`localhost:3108`) wasn't counted against the hostname allowance (6 sats counted against 74 spent). [Investigation](spike/evidence/spending-originator-accounting-2026-10-17.md), [follow-up](docs/wallet-originator-follow-up.md).
- On localhost the wallet looked for the manifest on port 80, so the dev server can serve it there too. [Discovery](spike/evidence/allowance-discovery-2026-10-17.md).

---

## 6. Identity without accounts

There is no registration. The wallet's **identity key** (a public key) is the account.

1. Browsing and free pages never load the wallet code.
2. Paying, **Continue reading** or **Connect wallet** connects to the BRC-100 wallet and gets its identity key. Private keys never leave the wallet.
3. `AuthFetch` performs the BRC-103 mutual-authentication handshake; the server verifies it with `@bsv/auth-express-middleware`. Routes use `req.auth.identityKey` from that verified context, never a field the client sends.
4. Purchases, bookmarks and balances are stored against that key in SQLite ([store.ts](spike/src/store.ts), [channel-service.ts](spike/src/channel-service.ts)): `purchases`, `bookmarks`, `channels` (one row per reading balance) and `channel_payments` (one row per signed page), plus the per-page-era `intents`, `payment_proofs` and recovery tables.

No email, password, card or profile is stored. A purchase row means "this identity owns page 6 of this edition of this book". Desktop and phone have different identities, so a purchase on one does not appear on the other. The owner waived same-identity cross-device resume for this POC.

---

## 7. Mistakes worth not repeating

These cost real time or the owner's money during the POC:

- **Guessing at a wallet error instead of reading the wallet's code.** Several wrong explanations (unconfirmed funds, half-made payments, an exhausted allowance) shipped changes that made things worse before the source code gave the real answer.
- **Changing wallet-facing settings "while we're here".** Renaming manifest text caused permission re-prompts. Raising the monthly limit to 10,000 was unnecessary and was reverted. Ask before touching the manifest, permission names, labels, storage keys or server settings.
- **Shrinking offers after a refusal** ("open a 4,930-sat balance instead"). The shortfall didn't depend on the amount, so each smaller offer failed the same way.
- **Lowering the fee rate to 1 sat/kB** to save sats. It left funding transfers unmined and stuck every payment built on them. [Investigation](spike/evidence/phone-transaction-status-2026-11-02.md).
- **Deciding from "not yet known" as if it were "no".** The reader treated "wallet not reconnected yet" as "no balance" and asked for a new one.

**What we tried and removed:**

| Tried | Why it went |
|---|---|
| Paying for the next page ahead | Hid the delay but bought pages the reader might not open |
| Settling a balance 30 minutes after the last page, or on leaving | The owner wants approve-once; leaving now keeps the balance |
| Falling back to a per-page purchase when a balance had closed | Paid outside the balance; new pages now always need a balance |
| `keepalive` on page payments | Only needed for settle-on-leave |
| A "check signing" button and an always-visible timing bar | Test-only |
| Sending page payments straight to Railway, bypassing Vercel | Saved only 7–10 ms |

**Other bugs the owner's testing found, all fixed:** a closed balance shown as usable after reload (now confirmed with the server first, with Retry); the idle timer counting from the last page instead of the return; a half-started old-style payment blocking a page; the timing capture missing background payments.

---

## 8. Practical notes for working on this repo

- **Two copies of the SDK** (client and server bundles) must only exchange bytes, never objects. Mixing them fails with errors like `script[serializedBytes] is not a function`.
- **Returned sats must be internalized.** Change from a settled balance sits at the reader's address until the wallet is told about it (`internalizeAction`). The server keeps the details, so any device can collect it.
- **BSV Browser can take longer than the SDK's 1-second wallet discovery.** Inside BSV Browser the reader talks to the React Native bridge directly and waits up to 20 s.
- **`AuthFetch` hides custom response headers**, so timing must be captured underneath it.
- **TypeScript 6 broke the scaffold's typing**; it is pinned to 5.8.3. [Package findings](spike/evidence/package-facts.md).
- **Hosting:** Vercel serves the reader and forwards `/api` to the Express + SQLite server on Railway (EU West), so the wallet sees one address (`pagereader.vercel.app`) for all permissions. [Hosting guide](deploy/vercel-railway.md).
- **Tests:** `cd spike && npm test` (156 tests). Builds: `npm run build` in `spike` and `app/client`.
- **The in-app timing capture** (Start capture → read 20+ pages → Stop → Download JSON) records every page's visible time, signature time and server confirmation time.

---

## 9. Still open

- A first full run on **BSV Desktop** with reading balances.
- A real **top-up** on a device.
- **Server confirmation under 500 ms** on every page (p95 is 584 ms on the phone's network). Not part of the target, since the page is visible long before.
- The 90-second demo recording.
- Python: not attempted.

---

## Further reading

[Acceptance register and remaining work](docs/project-requirements-status.md) · [Senior review changes](docs/review-feedback-r1.md) · [Demo runbook](docs/mainnet-demo-runbook.md) · [Evidence index](spike/evidence/README.md) · [Dated checkpoint log](spike/evidence/checkpoint-log.md) (historical; its status lines describe their own dates, not today).

Earlier research worth knowing about: [receiver benchmark with local wallet storage](spike/evidence/receiver-benchmark-2026-11-08.md), [completion checkpoint](spike/evidence/completion-checkpoint-2026-11-08.md), [identity policy review](spike/evidence/identity-policy-and-session-review-2026-11-08.md), [Desktop cost reconciliation](spike/evidence/reader-cost-reconciliation-2026-10-17.md), [phone acceptance checks](spike/evidence/acceptance-check-2026-11-07.md), [7 November phone run](spike/evidence/phone-paid-run-2026-11-07.md).
