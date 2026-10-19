# Pagestream: design handoff for Claude Design

> Paste this whole file into Claude Design as the brief. Attach the two earlier sample screenshots as
> "what we tried; keep the discipline, fix the problems listed in section 9".
> Status: visual language and layout are ready to explore. **Provisional** parts depend on a
> pending technical spike and are marked as such. Do not treat their wording as final.

---

## 1. What the product is (one paragraph, use it as the source of truth)

Pagestream is a web reading app for public-domain classics from Project Gutenberg. You can browse
and read the first two pages of any book free, with no wallet and no account. From page 3, each
page costs **5 satoshis** (a fraction of a US cent), paid from the reader's own BSV wallet
(BSV Desktop on a laptop, BSV Browser on a phone). The wallet asks for permission once. After that,
page turns pay silently. Close the tab and spending stops. Open the same book on another device with
the same wallet and you continue where you left off, with no login. **There is nothing to sign up for,
no email, no password, no card, no subscription.**

Readers: people who want one chapter of Sherlock Holmes on a commute, a passage from Meditations,
or the whole of The Metamorphosis for roughly the price of nothing, including readers in places where
few people hold a card.

## 2. The design idea: "Rubricated"

In manuscripts and early printed books, scribes and printers marked headings, initials and important
words in **red-orange ink**. That practice is called *rubrication*, from *rubrica*, red ochre. Everything
else was black-brown iron-gall ink on laid paper.

Pagestream uses that system literally:
- **Ink** for the text you read.
- **Rubric** (one warm vermilion-orange) for exactly two things: **money** and the **one action that
  costs money**. The spend counter, the price on the Next button, and the "Free preview" stamp are
  rubricated. Nothing decorative is.
- **Paper** everywhere else.

So the colour carries meaning. A reader learns in one page that "orange = sats". This replaces the
green in the earlier samples, which read as a generic finance/fintech palette.

Mood: a well-made printed book and a printer's ledger, not a library "atmosphere" with candles and arches.
No skeuomorphic paper textures, no fake leather, no page-curl effects.

## 3. Design tokens

### Colour (light, the default)
| Token | Hex | Use | Contrast on paper |
|---|---|---|---|
| `paper` | `#F4EEE3` | Page background (laid-paper cream) | — |
| `paper-shade` | `#EAE2D3` | Ledger strip, header band, selected row | — |
| `ink` | `#221D18` | Body text, headings, 1px rules (iron-gall brown-black, never `#000`) | ≈14:1 |
| `pencil` | `#6E655B` | Secondary text: author, metadata, captions | ≈5:1 (AA) |
| `rubric` | `#B4441C` | Money, the paid action, preview stamp, drop caps | ≈4.8:1 (AA, normal text) |
| `rule` | `#221D18` at 1px, or `#CFC5B4` for quiet rules | Dividers | — |
| `error` | `#8E1F14` | Payment failed or declined (text plus icon-free label, never colour alone) | ≥7:1 |

### Colour (night reading, optional second theme)
`paper #1F1A15` · `paper-shade #2A241D` · `ink #E9E0D0` · `pencil #A89C8B` · `rubric #E0784A`.
This is warm lamplight brown, **not** black, and it has no glow.

### Type
| Role | Typeface (Google Fonts, free) | Notes |
|---|---|---|
| Display (book titles, wordmark only) | **IM Fell English** (roman and italic) | A digitisation of 17th-century Fell types: genuinely period, not "AI editorial". Use only at ≥28px, sparingly. |
| Reading body and UI | **Literata** | Designed for long-form screen reading (it is Google Play Books' face). 18–20px, line-height 1.6, measure 60–68 characters. Left-aligned with `hyphens: auto`. **Not justified on mobile.** |
| Labels, prices, counter | **Literata small caps + tabular lining figures** (`font-variant-caps: all-small-caps; font-variant-numeric: tabular-nums lining-nums`) | Replaces the monospace in the samples. Mono makes it look like a crypto terminal, while small caps make it look like a ledger. |

### Shape and space
- Corner radius **0** everywhere. 1px rules for structure. No shadows, no blur, no glow.
- Spacing scale is 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Vertical rhythm comes from the 1.6 body line height.
- Touch targets are at least 44×44px.

## 4. Logo direction

**Recommendation: a wordmark plus a printer's device. No mascot, no initials.**
- **Not a mascot.** It pulls the brand toward playful or children's apps and competes with the typography,
  and a good mascot is a large, separate illustration job.
- **Not "PS" initials.** They collide with PlayStation, and two-letter monograms are the most generic option.
- **Do: a printer's device (colophon mark).** Historic printers signed their books with a small device:
  Aldus Manutius's dolphin and anchor, Caxton's mark. Pagestream's device should be one simple
  geometric idea that works at 16px, for example a **pilcrow (¶) whose stem runs into a small rubric
  dot or coin-tick**, or a **page corner with one rubric mark**. It should be one colour, ink or rubric.
- Wordmark: "Pagestream" in IM Fell English, ink colour, with the device to its left. The favicon is the
  device alone.
- Ask Claude Design for **3 device candidates** shown at 16px, 32px and 128px on paper and on night.

## 5. Screens to design (mobile 390px first, then desktop 1280px)

1. **Catalogue** (story step 1)
   - Wordmark, then one plain sentence: *"Classic books, paid by the page. First two pages of every book are free.
     5 sats a page after that. No account."*
   - A **ruled list** (not cards, not a grid of giant covers) of 8 books. Each row shows the title (IM Fell), the
     author (pencil), a small-caps line like `≈ 330 PAGES · WHOLE BOOK ≈ 1,640 SATS`, and a rubric `FREE PREVIEW`
     stamp. A thin cloth-colour spine swatch per book is allowed. No cover art is required.
   - Desktop: the list on the left, a selected-book panel on the right with its opening lines.
2. **Reader, free page** (story step 2)
   - Page header: book, chapter, `PAGE 1 OF ≈330`. A rubric drop cap on page 1 of a chapter.
   - Footer: `← Previous` and `Next page →`. On pages 1–2 the counter strip reads `FREE PREVIEW · PAGE 1 OF 2`.
   - **No wallet is needed. Nothing asks for one here.**
3. **The permission moment** (story step 3, **PROVISIONAL COPY**)
   - The reader taps Next on page 2. An inline panel replaces the footer. It is not a modal over the text and has
     no blur. It says what happens next in plain words, and then the *wallet's own* prompt appears.
   - Draft copy: *"Page 3 onward costs 5 sats a page. Your wallet will ask you once to let Pagestream spend
     up to 5,000 sats. You only pay for pages you open."* Action: `Continue to page 3 · 5 sats`.
   - Mark this panel clearly as **provisional**: whether the wallet's limit is per session or monthly, and
     whether fees count toward it, is being measured now.
4. **Reader, paid page** (story step 4: the hero screen)
   - The **counter** is the most important element in the product. It sits in a full-width ruled ledger strip
     pinned to the top of the reading view: it is part of the layout, not floating, and has no glass.
     - Spent: `SPENT 45 SATS` (rubric numerals, tabular), and under it in pencil:
       `8 PAGES × 5 · FEES 5`.
     - State badges (**PROVISIONAL**): `CONFIRMING…` while a payment awaits the server, and
       `1 PAYMENT UNRESOLVED` if a response was lost (the money left the wallet, the page did not arrive).
       Each needs a calm, specific treatment, and neither is shown as an error toast.
     - On each confirmed page the number ticks up once. Show a 150ms underline sweep in rubric. No green flash,
       no confetti.
   - The Next button carries its price: `Next page · 5 sats`. Re-reading an already-bought page
     shows `Next page · owned` with no charge.
   - Text-size control (A− / A+). A page is a fixed amount of text, so a larger font makes the page **scroll**.
     It does not split into more pages. The design must not imply that one screen equals one page.
   - Page turn: an instant swap with a ≤120ms crossfade. No 3D book flip and no page curl. Respect
     `prefers-reduced-motion`.
5. **Continue on another device** (story step 6)
   - The catalogue row or book opening shows: *"Continue at page 14, saved by your wallet, not an account."*
   - Pages already bought are marked `owned` in a small page index (optional sheet).
6. **Edge states** (must exist, plain copy):
   - No wallet installed at page 3: *"To read past page 2 you need a BSV wallet: BSV Desktop on a computer,
     BSV Browser on a phone."* Show two links and keep the free pages readable.
   - Wallet declined: *"No payment was made. You can keep reading pages 1–2, or try again."*
   - Not enough funds: *"Your wallet doesn't have enough to pay 5 sats."*
   - Page failed to load after payment: *"Your payment went through; fetching the page again (no extra charge)."*
7. **Terms** and **Privacy** pages (short and real):
   - Privacy: *"We store your wallet's public identity key, the pages you bought, and your bookmark. Nothing else.
     No cookies for tracking, no email, no name."*
   - Terms: public-domain texts from Project Gutenberg, the 5-sat price, payments are final, no refunds in this demo.
   - Linked in a plain footer.

## 6. Real content to use (no lorem ipsum)
| Book | Gutenberg # | Est. pages* |
|---|---|---|
| The Adventures of Sherlock Holmes, Arthur Conan Doyle | 1661 | ≈330 |
| Pride and Prejudice, Jane Austen | 1342 | ≈385 |
| Frankenstein, Mary Shelley | 84 | ≈235 |
| The Picture of Dorian Gray, Oscar Wilde | 174 | ≈245 |
| Dracula, Bram Stoker | 345 | ≈505 |
| Meditations, Marcus Aurelius | 2680 | ≈205 |
| The Metamorphosis, Franz Kafka | 5200 | ≈70 |
| Alice's Adventures in Wonderland, Lewis Carroll | 11 | ≈85 |

\*Estimates assume a fixed page of about 1,800 characters. Label them `≈` until real counts exist.
Whole-book cost = (pages − 2) × 5 sats. The demo book is Sherlock Holmes: use the real opening of
"A Scandal in Bohemia".

## 7. Inspiration (study, don't copy)
- **Standard Ebooks** (standardebooks.org): public-domain classics with excellent typography; the closest relative.
- **Rubricated incunabula** (the Gutenberg Bible, Aldine editions): the colour logic.
- **Folio Society / Everyman's Library spines**: cloth colours for the per-book swatch.
- **iA Writer**: how much a reading surface can leave out.
- **A double-entry ledger page**: rules, small caps, right-aligned tabular figures for the counter.
- Avoid copying **Penguin Classics** orange-band covers. The colour is near, so the layout must not be.

## 8. Hard bans (non-negotiable)
**Colour and light**
- No `#000` and neon-purple dark mode.
- No radial orbs, ambient glows, or light streaks.
- No rainbow or neon text in headers.
- No saturated gradients on text or containers.

**Components and icons**
- No bento grids or uneven rounded cards for lists.
- No Lucide or sparkle icons for abstract ideas, and no Material Symbols icon set. Use words; at most a few
  custom glyphs (←, →, ¶).
- No 3-tier pricing with a "Most Popular" badge.
- No floating or detached navigation, and no `backdrop-filter: blur`.
- No checkmark or emoji bullets.

**Copy**
- No abstract headlines ("Revolutionize…", "Supercharge…", "powered by AI").
- None of these words: *delve, tapestry, testify, revolutionize, beacon, nestled, elevate*.
- No subheading without a concrete fact (a price, a page count, what is stored).

**Structure**
- Use real product screens with real text, not abstract shapes.
- Selection and hover states must change more than a border or a scale. Use paper-shade fill plus an ink rule,
  or rubric text for the selected price.
- No testimonials, stock photos, or fake names.
- Include a viewport meta tag, semantic HTML (`header/main/nav/article/footer`, a single `h1`), and Terms and
  Privacy pages.

## 9. What to fix from the earlier samples (screenshots attached)
**Keep:**
- Zero radius, hairline rules, and the cream paper.
- The free-preview stamp.
- The price on the Next button (`NEXT LEAF (+5 SATS)` is honest; reword it to `Next page · 5 sats`).
- The drop cap.

**Fix:**
1. **Wrong network.** "Lightning peer connected" and "0.00002500 BTC" are Bitcoin/Lightning terms. Pagestream runs
   on **BSV**. These must not appear anywhere.
2. **False claims.** There is no "stream buffer", "sats/sec", "unsettled balance in browser memory", or "no
   authentication". The wallet holds the money, each page is paid individually, and the wallet identity *is* the
   authentication. Remove them all.
3. **Invented jargon breaks the "direct copy" rule.** Remove "leaf-synced", "LN-stream", "3D matrix active",
   "sanctuary translation engine", "tariff zero-rated", "folio I/II", "archival compendium", and "continuous ledger
   protocol". Say *page*, *price*, *free preview*, and *spent*.
4. **One price.** Every book costs 5 sats per page. The samples showed 2, 3, 4 and 5.
5. **One counter.** The samples showed `1,420 SATS`, `15 SATS SPENT`, and `BUFFER 485` at the same time. There is
   exactly one number, what this reader has spent, plus its breakdown and status.
6. **Remove the Material Symbols icons**, which are banned.
7. **Swap the forest green for the rubric system** described above.
8. **Don't justify text on mobile**, because of the rivers ("was     to").
9. **Use a ruled list instead of giant templated cover cards.** Five covers made a very long scroll that all
   looked alike.
10. **Drop the three-tab bottom bar** (Archive / Reader / Ledger). The counter lives in the reader. The catalogue
    is one tap back.

## 10. Deliverables requested from Claude Design
- A token sheet: colour (light and night), type scale, spacing, rules.
- Three logo device candidates at 16/32/128px.
- Screens 1–7 at 390px, and screens 1, 2 and 4 at 1280px.
- The counter component in all its states: free, first paid, confirming, confirmed tick, unresolved, owned page.
- Static HTML/CSS (Tailwind v4 classes welcome) with semantic markup, ready to port into the React app.
