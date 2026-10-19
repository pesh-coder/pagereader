# Handoff: Pagestream reader (mobile-first, BSV pay-per-page)

## Overview
Pagestream is a web reading app for public-domain classics from Project Gutenberg. Pages 1–2 of every book are free with no wallet. From page 3 each page costs **5 sats**, paid from the reader's own BSV wallet (BSV Browser on a phone, BSV Desktop on a computer). The wallet asks for permission once; after that page turns pay silently. The wallet identity is the account — no sign-up, email, password, card or subscription. Open the same book on another device with the same wallet and you resume where you stopped.

## About the design files
The files in `reference/` are **design references built in HTML** — a working prototype that shows intended look, copy and behaviour. They are not production code to ship. Recreate them in the target codebase (the React app) with its own patterns. `tokens.css`, `tokens.json`, `pagestream.css` and `content.js` *are* meant to be ported directly.

Open `reference/Pagestream.dc.html` in a browser to click through (needs `support.js` beside it). URL hash sets state, e.g. `#v=reader&p=5&paid=3&st=confirmed`, `#v=reader&p=2&panel=permission`, `&theme=night`, `&s=no-wallet|low-funds|unconfirmed|load-fails`. `reference/Pagestream Board.dc.html` is the overview board (tokens, logo devices, counter states, every screen at 390 and 1280).

## Fidelity
**High-fidelity.** Colours, type, spacing, copy and interaction timings are final except items marked **PROVISIONAL** (permission copy, 5,000-sat wallet limit, fee value, confirming/unresolved behaviour) which depend on a pending technical spike.

## Hard rules (non-negotiable)
- Radius 0 everywhere. 1px rules. No shadows, blur, glow, gradients, `backdrop-filter`.
- Never `#000`. Ink is `#221D18`.
- **Rubric `#B4441C` only for money and the paid action**: counter numerals, prices, the price on Next, FREE PREVIEW stamp — plus chapter drop caps. Never for states or decoration.
- No icon sets (Material Symbols, Lucide etc.). Words and at most ← → ¶.
- No monospace. Figures = Literata `all-small-caps` + `tabular-nums lining-nums`.
- IM Fell English only ≥ 28px (titles, wordmark).
- Reading text left-aligned, `hyphens:auto`, **never justified**.
- Hover/selected must change fill **and** add an ink rule (paper-shade + inset ink line). Never border-only/scale-only, never rubric.
- One price everywhere: 5 sats/page. One counter: *spent on this book*. No bottom tab bar.
- Banned copy: Lightning, BTC, "stream buffer", "sats/sec", "no authentication", "leaf", "folio", "LN-stream", any invented jargon; words delve, tapestry, testify, revolutionize, beacon, nestled, elevate. Say *page, price, free preview, spent, owned*.
- Semantic HTML: `header / main / nav / article / footer`, exactly one `h1` per view, viewport meta, touch targets ≥ 44px.
- Respect `prefers-reduced-motion` (disable transitions).

## Design tokens
See `tokens.css` (Tailwind v4 `@theme` + CSS vars, light + night) and `tokens.json`.

| Token | Light | Night | Use |
|---|---|---|---|
| paper | `#FFFFFF` | `#1F1A15` | Background (client chose white over brief's `#F4EEE3`) |
| paper-shade | `#EAE2D3` | `#2A241D` | Ledger strip, panels, selected row, hover fill |
| ink | `#221D18` | `#E9E0D0` | Text, headings, structural 1px rules |
| pencil | `#6E655B` | `#A89C8B` | Author, metadata, captions |
| rubric | `#B4441C` | `#E0784A` | Money + paid action + stamp + drop caps |
| rule | `#CFC5B4` | `#3B342B` | Quiet 1px dividers |
| error | `#8E1F14` | `#E58A7C` | Declined / not enough funds heading (always text) |

Type (Google Fonts): **IM Fell English** (display) and **Literata** (opsz 7–72, 400/600, italic).
Display 36/1.08 · h1 34/1.1 · reader h1 32/1.1 · row title 28/1.12 · wordmark 30/1 · reading 19/1.6 (A−/A+ range 17–24, step 1) · UI 17/1.5 · panel head 20/600/1.35 · label 15–16 small caps · counter 28 small caps rubric · drop cap 4em/0.82 rubric floated.
Spacing 4/8/12/16/24/32/48/64. Container 1200px, gutter 20px. Reading measure 35em. Wide breakpoint 960px. Buttons 48px tall.

## Screens

### 1 · Catalogue (`h1` = wordmark)
- Header: `¶ Pagestream` wordmark (Fell 30px; device glyph 32px) inside `h1`, 1px ink bottom rule, padding 18/20/14.
- Intro `p` 18/1.55, max 36em: **"Classic books, paid by the page. First two pages of every book are free. 5 sats a page after that. No account."** ("5 sats" in rubric).
- Ruled list `ol` (top rule ink, row separators rule). Row = grid `6px | 1.8em | 1fr`, gap 12, padding 16/10/16/0:
  - 6px cloth spine (book.cloth), number `01`–`08` small caps pencil 16.
  - Title Fell 28 · author pencil 16 · meta line: rubric stamp **FREE PREVIEW** (1px rubric border, rotate −2deg, nowrap) + `≈ 330 PAGES · WHOLE BOOK ≈ 1,640 SATS` (small caps 15, cost in rubric).
  - If bookmarked: "Continue at page 6, saved by your wallet, not an account."
  - Hover: shade fill + inset 0 −1px ink. Selected (desktop): shade + ink rules top and bottom, `aria-current="true"`.
- Mobile: tap row → reader at bookmark or page 1.
- Desktop ≥960: list left (flex 1) + sticky 440px aside: `AUTHOR · YEAR · GUTENBERG #1661`, title Fell 36 (`h2`), `CHAPTER · OPENING LINES`, opening paragraph 18/1.6, price `dl` (Pages 1–2 free / Each page after 5 sats / Whole book ≈ N pages ≈ X sats), button **"Read page 1 · free"** or **"Continue at page N"**.
- Footer (all views): Terms · Privacy · Continue on another device, then pencil "Texts from Project Gutenberg · 5 sats a page · paid in BSV".

### 2 · Reader, free page
- **Ledger strip** (sticky top, shade bg, 1px ink bottom):
  - Row 1: "← Catalogue" link (44px) · text-size group A− / A+ (44×44 each, `role=group aria-label="Text size"`).
  - Row 2 (rule top, `aria-live=polite`): pages 1–2 show only **FREE PREVIEW · PAGE 1 OF 2** (small caps 19, rubric). No number, no wallet prompt.
- Article (max 35em, padding 24/0/36): `h1` book title Fell 32 · meta `CHAPTER · PAGE 1 OF ≈ 330` small caps pencil with ink bottom rule · text 19/1.6. Page 1 of a chapter: rubric Fell drop cap (first letter, `aria-hidden`, with a visually hidden copy for screen readers).
- Pager (ink top rule): "← Previous" (text button; hidden on page 1) · **Next page →** on page 1, **Next page · 5 sats** on page 2 (price in rubric).

### 3 · Permission moment (PROVISIONAL)
Tapping Next on page 2 (wallet present, not yet approved) **replaces the pager** with an inline shade panel (no modal, no blur):
- Kicker: `PROVISIONAL COPY · WALLET LIMIT UNDER TEST`
- `h2`: "Page 3 onward costs **5 sats** a page."
- "Your wallet will ask you once to let Pagestream spend up to **5,000 sats**. You only pay for pages you open."
- Buttons: **"Continue to page 3 · 5 sats"** (primary) → triggers the wallet's own prompt · "← Stay on page 2".
- The wallet prompt in the prototype is a stand-in; in production it's the wallet's native UI. There is no "Connect wallet" button anywhere.

### 4 · Reader, paid page (hero)
Ledger strip row 2 becomes the counter:
- Left: `SPENT` (16) + **`24 SATS`** (28, rubric, tabular) and under it pencil `4 PAGES × 5 · FEES 4`.
- Right: one status badge (small caps 15) — see Counter states.
- On each confirmed page: 1px rubric underline under the number sweeps 0→100% width in 150ms ease-out, cleared after 700ms.
- Pager: "← Previous" · **Next page · 5 sats** (unpaid next) or **Next page · owned** (already bought; ink, no charge).
- Desktop ≥960: sticky 280px aside "PAGES IN THIS BOOK" — list Page N / `FREE` | `OWNED` | `5 SATS`; current page shade + 3px ink left rule; note "Owned pages open free with the same wallet, on any device."
- Page turn: opacity 1→0 60ms, swap, 0→1 60ms; scroll to top. Larger text makes the page scroll — it never re-paginates.

### Counter states (one number + breakdown + one badge)
| State | Number | Badge | Notes |
|---|---|---|---|
| free | — | strip reads FREE PREVIEW · PAGE n OF 2 | pages 1–2 |
| first paid | 6 | First paid page | page 3 after approval |
| confirming *(prov.)* | incl. this page | Confirming… + `provisional` tag | page already showing |
| confirmed tick | +6 | Page n confirmed | 150ms underline sweep |
| unresolved *(prov.)* | unchanged | **1 payment unresolved** (1px ink border) + `provisional` | extra strip row: "5 sats left your wallet for page n, but the page didn't arrive. You won't pay for it twice." + button "Fetch page n again" |
| owned | unchanged | Page n · owned | revisiting / other device |
Spent = paidPages × (5 + fee). Fee = **1 sat placeholder**.

### 5 · Continue on another device (`h1`)
- "Open Pagestream in BSV Browser or BSV Desktop with the same wallet. Your place is saved by your wallet, not an account, so there is nothing to log in to."
- Book block (ink top rule): title Fell 28 + "Continue at page 6, saved by your wallet, not an account."
- `PAGE INDEX · 4 OWNED` grid of cells (min 88px): number + `FREE` / `OWNED` (shade fill) / `5 SATS`.
- "Link to this page" + `pagestream.app/read/holmes/6` + button Copy link → "Copied".

### 6 · Edge states (inline panels replacing the pager)
- **No wallet** at page 3: `h2` "To read past page 2 you need a BSV wallet" · "BSV Desktop on a computer, BSV Browser on a phone. Pages 1 and 2 stay free here." · two ruled link rows (BSV Desktop → / BSV Browser →) · "← Back to page 2".
- **Declined**: `h2` (error colour) "Wallet declined" · "No payment was made. You can keep reading pages 1–2, or try again." · "Try again · 5 sats" · "← Back to page 1".
- **Not enough funds**: `h2` (error) "Not enough funds" · "Your wallet doesn't have enough to pay 5 sats. No payment was made." · "Try again · 5 sats" · "← Stay on page 2".
- **Page failed to load after payment**: text area replaced by "Your payment went through; fetching the page again (no extra charge)." Badge "Fetching page n". Auto-retries.
- **Unresolved**: see counter states.

### 7 · Terms and Privacy (`h1` each, max 34em, 17/1.6, `h2` with rule above)
Terms (kicker `DEMO TERMS · 4 SECTIONS`): The texts — public-domain from Project Gutenberg · The price — pages 1–2 free, then 5 sats each, same for every book, paid from your wallet when opened · Payments are final — no refunds in this demo; paid pages stay yours · Your wallet is your account — no sign-up, email, password, card or subscription.
Privacy (kicker `3 THINGS STORED · NOTHING ELSE`): "We store your wallet's public identity key, the pages you bought, and your bookmark. Nothing else." + `dl` of the three + "No cookies for tracking, no email, no name."

## Interactions & state
See `STATE.md` for the full state machine. Summary:
```
view: 'catalogue' | 'reader' | 'continue' | 'terms' | 'privacy'
bookId, selectedBookId (desktop), page, textSize (17–24)
paid: Record<bookId, number[]>        // server truth, keyed by wallet identity
bookmark: Record<bookId, number>
approved: boolean                      // wallet permission granted this session
status: 'free'|'first'|'confirming'|'confirmed'|'unresolved'|'owned'|'refetch'
panel: null|'permission'|'prompt'|'noWallet'|'declined'|'lowFunds'
```
Guard async confirm callbacks with the page they were for (ignore if the reader has turned away).

## Assets
- Fonts: Google Fonts IM Fell English, Literata.
- Logo device: three candidates on the board (2a pilcrow + coin dot, 2b page corner with rubric mark, 2c typeset ¶). The prototype uses 2c (`¶` glyph) as a stand-in; final device should be exported as single-colour SVG once chosen. Favicon = device alone.
- No images, icons, cover art or photos.

## Files
- `PROMPT.md` — paste into Claude Code to execute the build.
- `STATE.md` — state machine and copy table.
- `tokens.css` — Tailwind v4 `@theme` + light/night CSS variables.
- `tokens.json` — same tokens, machine-readable.
- `pagestream.css` — component stylesheet with exact values.
- `content.js` — 8 books + Holmes pages 1–6 + pricing constants.
- `reference/Pagestream.dc.html` — interactive prototype (open in browser).
- `reference/Pagestream Board.dc.html` — overview board.
- `reference/support.js` — runtime for the two reference files.
- `screenshots/390-*.png` — every mobile screen and edge state at 390px (top of viewport; panel states scrolled to the panel). For 1280px views open the reference with the hash URLs above in a ≥1280px window, or see the board.
