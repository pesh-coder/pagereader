# Reader layout proposal — approved 2026-10-17

The user approved this layout in chat. The implemented reader is at http://localhost:3108/reader/ ; this port-3110 artifact remains a separate simulated design reference. See `docs/reader-milestone-1.md` for implementation scope and validation. Approval does not turn unresolved payment experiments into passes.

This is a design reference responding to the reader's 2026-10-17 feedback. It is not product implementation and is separate from the live paid spike. Start from the repository root with:

```powershell
node --import ./spike/node_modules/tsx/dist/loader.mjs design/reader-review/server.mjs
```

Open http://localhost:3110/ . Desktop/Phone buttons let a desktop reviewer compare layouts. The prototype contains the first six real fixed segments of the imported 265-page Holmes edition and illustrative local ownership/receipts. It cannot connect to a wallet, submit payments or change real bookmarks. Its price, fee cap and provisional permission copy come from the shared spike config. The white/night colours and Literata/IM Fell typography come from the supplied handoff tokens. Reference files in the original handoff were read for appearance, not shipped as product code.

## Proposed reader

- Reading stays central. A slim header has Library, Contents, text settings, and a compact spent-on-this-book total. Diagnostics, public identity keys, permission-limit research and the page-request form belong in a separate developer probe.
- A persistent bottom page bar has Previous, current page/total, and Next. It is a pager, not an additional app tab bar. Owned/free destinations have no price. An unowned destination displays the current maximum page cost (5 + up to 1 fee in this experiment) before the action. Icon-only previous navigation on small screens has an accessible name and a 44px-or-larger target.
- Desktop: reading column capped at 35em, generous margins, optional adjacent Contents. Phone: full-width text with 24px side margins, Contents as a dismissible panel, controls above the safe area. Text-size changes make the same fixed purchased page taller; they never re-segment or trigger a payment.
- Explain payment only when needed. A short first-paid-page panel states the page cost, miner-fee ceiling and possibility of a separate wallet grant. No login/Connect wallet screen and no promise of one native prompt until demonstrated. The native wallet controls its own permission requests.
- While confirming, retain the current page and show Confirming; display new paid content only after a server response. The mock simulates that sequence with a local timer and does not establish live correctness or latency.
- Keep the spend total visible, with the receipt/fee breakdown available on demand. Payment/pending/unresolved and ownership remain separate. Unknown fees must remain visibly unknown, never counted as zero. The screenshot's partial browser ledger is a correctness problem as well as clutter: product implementation must reconcile server receipts and fee evidence across devices before claiming a complete total. This preview's 6/12-sat examples are illustrative, not the user's real spend.
- Save the bookmark after each actually displayed page, independently of payment. Product implementation still needs the approved identity/bookmark interface; this visual prototype makes no real persistence/cross-device claim.

## Design review findings

Observed at 1280px desktop and 390px phone viewport: no horizontal overflow in the main layout; 390px pager fits. Local Next opens the price panel; simulated Continue leaves the prior page visible with Confirming and then changes content and total after its stand-in response. Narrow 320px container uses a shorter wordmark and wrapping paid-action text. Browser automation intermittently times out on snapshot/resize; no screenshot/complete device certification is claimed.

There are no real wallet/payment endpoints on this server. The live spike remains at port 3108 with new purchases paused. Product code, generated BSV helpers, real ownership and payment records remain unchanged. The only shared config addition is draft reader permission copy, unused by the live spike UI.

## Inspiration and differences from the original handoff

YouVersion's book/chapter selector suggests a direct Contents picker; its reading tools remain distinct from the text. Apple Books keeps navigation, contents and typography in compact reader controls. Pagestream retains explicit priced page turns rather than automatically purchasing as the reader scrolls.

- https://help.youversion.com/l/en/article/qi1gf7u75f-bible-com-bible
- https://help.youversion.com/l/en/article/mya0fknmzo-bible-settings-android
- https://support.apple.com/en-lamr/guide/iphone/iphc1af7c57/ios

This proposes replacing the handoff's larger two-row ledger treatment and repeated bottom explanatory area with compact navigation and on-demand detail. It preserves the always-visible spend requirement, zero-wallet free pages, fixed segments, server-returned paid content, independent bookmark writes and txid-keyed ledger. The user requested simple arrow navigation; typographic chevrons are used without an icon library. A full catalogue of 5–10 books remains planned; the spike currently has one book and exposes pages 1–43 of its imported 265-page edition.

Approve/revise this layout before it is wired into the React reader. Outstanding live criteria and the milestone-1 design gate still apply.
