# Complete catalogue and per-edition delivery — 2026-10-17

Requirement 1 now has an implemented complete eight-book catalogue. This is an implementation/local verification pass; no new native wallet approval, payment challenge to a real reader, or mainnet transaction was initiated. New purchases remain paused.

| Book | Gutenberg | Fixed pages |
|---|---|---|
| The Adventures of Sherlock Holmes | [1661](https://www.gutenberg.org/ebooks/1661) | 265 |
| Pride and Prejudice | [1342](https://www.gutenberg.org/ebooks/1342) | 316 |
| Frankenstein | [84](https://www.gutenberg.org/ebooks/84) | 188 |
| The Picture of Dorian Gray | [174](https://www.gutenberg.org/ebooks/174) | 196 |
| Dracula | [345](https://www.gutenberg.org/ebooks/345) | 362 |
| Meditations | [2680](https://www.gutenberg.org/ebooks/2680) | 152 |
| The Metamorphosis | [5200](https://www.gutenberg.org/ebooks/5200) | 44 |
| Alice’s Adventures in Wonderland | [11](https://www.gutenberg.org/ebooks/11) | 73 |

## Sources and immutable pages

`data/catalogue.json` identifies each retained edition and source file. Seven complete UTF-8 texts were fetched from the official Gutenberg `ebooks/<id>.txt.utf-8` endpoints; the exact bytes, including notices, are retained under `data/sources/`. Their SHA-256 values appear in the immutable edition IDs and source filenames. Generated server-only page files live under `data/editions/`. Neither source bodies nor paid segments enter the client bundle/static directory. The notices endpoint returns the original preamble and end/license section, with book body omitted, and fails closed if boundary markers are missing.

The original `data/edition.json` and `data/gutenberg-1661.txt` were not rewritten. Holmes retains edition `1661-922e2a12ccb43a4c9544c260b2166c6ad2097aeb5957faeee113f173bb857cd0-paragraphs-1800-v1`, all its page boundaries, purchases and bookmarks. Its product reader now exposes the full 265 pages; the unscoped technical probe retains its 43-page research window.

The existing `paragraphs-1800-v1` segmenter runs once at import time. Each new reader begins at its source's prose opening and includes subsequent text and edition backmatter through the Gutenberg end marker. Original front matter and licensing are preserved in the source file. Gutenberg 2680 uses an older English translation beginning “I. Of my grandfather Verus”; it replaces the handoff's different sample translation. Page boundaries do not depend on viewport or text size. `npm run import:catalogue` writes immutable files without overwriting different content and refuses to replace an active edition automatically if an upstream checksum changes; an edition migration/access review is required first.

## Delivery and identity boundaries

Product routes are rooted at `/api/editions/:editionId/` for public previews, `me`, status, owned reads, bookmarks and paid delivery. Public pages 1–2 bypass authentication. Every subsequent page uses the existing server five-sat price and approved BRC-105 flow, including the one-sat fee cap, persistent original-proof journal, paused challenge guard and atomic receipt/replay/ownership commit. The origin-root BRC-103 session handshake is unchanged; URLs are not rewritten before signature verification.

The reader binds its active receipts/ownership to the selected edition, checks returned edition/page before exposing text and sends independent bookmark writes to the book actually displayed. Delayed writes from a previously displayed book cannot move the current book's bookmark. Recovery uses the same original proof and edition-specific route. Existing legacy proof/journal keys remain unchanged. No generated `src/bsv/` file changed and the persistent receiving wallet was retained.

## Verification

- Client build/lint PASS; spike build PASS; **35 local tests PASS**.
- All eight source checksums match retained bytes; resegmenting normalized paragraphs gives identical fixed pages; Holmes exactly matches the existing imported edition.
- Public pages 1–2 and notices work for all eight editions with zero wallet calls. Public page 3 is refused, unknown editions return 404 and raw source/page files are inaccessible through HTTP.
- Synthetic SDK/AuthFetch tests exercise distinct page-3 purchases for two editions, cross-edition proof rejection before receiver internalization, independent scoped ownership/bookmarks, original receipt reread, pause enforcement, full last-page delivery for all eight and refusal past each edition's end. These use an in-memory DB and stub receiver, with no native wallet or broadcaster.
- Reader gateway regressions verify book switches do not reuse another edition's ownership/costs, old-book bookmark writes retain their edition, paid resume creates no new payment, and a wrong-edition response is refused.
- Local browser checked all **seven newly completed readers** through page 1 → page 2: different genuine text, HTTP 200, no alerts or overflow, no authenticated/payment/wallet calls and no wallet chunk loaded. Desktop 1280px covered Pride/Frankenstein/Dorian; 390px covered Dracula/Meditations/Metamorphosis/Alice. All eight covers loaded. This tests the new catalogue work, not a repetition of Holmes's previous paid-resume experiment.
- Preflight after restart: mainnet ready, pause present, no one-run permit, two original purchases, four original intents, two replay claims and one saved proof. Ignored logs: `runs/catalogue-suite.log`, `runs/catalogue-preflight.log`; browser JSON: `runs/catalogue-browser-2026-10-17.json`.

Serving with `npm run dev` from `spike/` at http://localhost:3108/reader/. No ngrok. Existing key/database/intents/journals remain intact. Native mainnet per-edition purchase acceptance, allowance behavior, fee accounting, required latency cohorts and actual phone/cross-device runs remain outstanding. Overall C1–C11 statuses are unchanged; see the [nine-requirement queue](../../docs/requirements-execution.md).
