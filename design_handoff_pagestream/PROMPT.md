# Prompt for Claude Code

Paste everything below the line into Claude Code, run from the root of the Pagestream React app, with this `design_handoff_pagestream/` folder copied into the repo.

---

You are implementing the Pagestream reader UI from a high-fidelity design handoff in `design_handoff_pagestream/`. Read these first, in order, and treat them as the spec:

1. `design_handoff_pagestream/README.md` — screens, exact copy, hard rules.
2. `design_handoff_pagestream/STATE.md` — state machine and counter/button copy.
3. `design_handoff_pagestream/tokens.css` and `tokens.json` — design tokens.
4. `design_handoff_pagestream/pagestream.css` — component styles with exact values.
5. `design_handoff_pagestream/content.js` — books, Holmes pages 1–6, pricing constants.
6. `design_handoff_pagestream/reference/Pagestream.dc.html` — interactive reference. Open it in a browser to compare; hash params set states (see README). Do not ship or import it.

## Tasks
1. **Inspect the repo** (framework, router, styling setup, existing wallet/payment code). Report what you find in 5 lines before changing anything. Reuse existing wallet and API modules; do not invent payment logic.
2. **Tokens.** Add `tokens.css` to the global stylesheet after `@import "tailwindcss";` (Tailwind v4). If the app isn't on Tailwind v4, keep the `:root` CSS variables and drop the `@theme` block. Load IM Fell English + Literata from Google Fonts. Night theme = `data-theme="night"` on `<html>`.
3. **Styles.** Port `pagestream.css` either as a global/CSS-module stylesheet or into Tailwind utilities — match the values exactly. Radius 0, no shadows except the inset ink rules specified, no blur.
4. **Content.** Move `content.js` into the app's data layer (typed if TS). Keep "≈" on page counts.
5. **Routes / views** (one `h1` each, semantic `header/main/nav/article/footer`):
   - `/` Catalogue · `/read/:bookId/:page` Reader · `/continue` Continue on another device · `/terms` · `/privacy`.
6. **Components** to build:
   - `SiteHeader` (wordmark; `h1` only on catalogue), `SiteFooter`.
   - `CatalogueRow` (spine, number, title, author, FREE PREVIEW stamp, pages + whole-book cost, resume line; hover + `aria-current` selected state).
   - `SelectedBookPanel` (desktop ≥ 960px).
   - `LedgerStrip` with `SpendCounter` (states: free, first, confirming, confirmed, unresolved, owned, refetch) and `TextSizeControl` (A−/A+, 17–24px, persisted locally).
   - `ReaderPage` (title, meta, drop cap on page 1 of a chapter, paragraphs; opacity crossfade ≤120ms).
   - `Pager` (Previous / Next with price label per STATE.md).
   - `InlinePanel` variants: permission (PROVISIONAL), noWallet, declined, lowFunds — each replaces the Pager, never a modal.
   - `PageIndex` (desktop reader aside + continue screen).
   - `TermsPage`, `PrivacyPage` with the exact copy in README.
7. **State.** Implement the state machine in STATE.md with the app's state library (or a reducer). Paid pages and bookmarks come from the server keyed by wallet identity. Guard async confirmations against the reader having turned away. Never double-charge on retry.
8. **Wallet.** Use the wallet's native permission prompt (BSV Browser / BSV Desktop). There is **no** "Connect wallet" button. Wallet detection decides between `permission` and `noWallet` panels. Mark permission copy, the 5,000-sat limit and the fee value as provisional constants in one config file.
9. **Accessibility.** Viewport meta; touch targets ≥ 44px; `aria-live="polite"` on the counter row; drop cap `aria-hidden` with a visually-hidden duplicate letter; focus-visible = 2px ink outline offset 2px; honour `prefers-reduced-motion`.
10. **Verify.** Run the app at 390px and 1280px and compare each screen to the reference (`#v=catalogue&last=6&paid=4`, `#v=reader&p=1`, `#v=reader&p=2&panel=permission`, `#v=reader&p=5&paid=3&st=confirmed`, `#v=continue&paid=4&last=6`, the `noWallet/declined/lowFunds/refetch/unresolved` states, terms, privacy, and `&theme=night`).

## Hard rules — fail the task if any are broken
- Rubric `#B4441C` only on money (counter numerals, prices, Next price, FREE PREVIEW stamp) and drop caps.
- One price (5 sats/page) and one counter (spent on this book). No bottom tab bar.
- No icon libraries, no monospace, no justified text, no `#000`, no radius, no blur/glow/gradient.
- IM Fell English only at ≥ 28px.
- Hover/selected = paper-shade fill + ink rule, never border-only or scale.
- Never use the words: Lightning, BTC, buffer, sats/sec, leaf, folio, LN-stream, delve, tapestry, testify, revolutionize, beacon, nestled, elevate. Grep the codebase for them when done.

When finished, list: files changed, any spec item you couldn't match and why, and every value still marked PROVISIONAL.
