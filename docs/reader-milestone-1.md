# Approved reader implementation — 2026-10-17

The user approved the focused reader layout and requested other library books. This authorizes implementing the reviewed interface; it does not waive the outstanding live payment criteria or authorize additional mainnet transactions.

Latest recovery follow-up: use `npm run dev` and [the local reader](http://localhost:3108/reader/) for browser testing, per user instruction. The temporary ngrok tunnel was stopped after its public HTTP/API checks. Spike build and 31 local tests pass, with purchases paused and no native wallet calls/new sats spent. Physical phone, home-screen wallet transport and native allowance/recovery acceptance remain unverified. [Checkpoint and next controlled experiment](../spike/evidence/recovery-permissions-checkpoint-2026-10-17.md).

Implemented in `app/client`, served at **http://localhost:3108/reader/** by the existing persistent mainnet spike backend. Port 3110 remains a simulated design reference. The original technical probe remains at http://localhost:3108/ . The old ngrok URL was offline at the previous check and is not a current phone testing link.

## Scope and implementation

1. Library now has eight complete imported Gutenberg editions with real fixed page counts and two public pages each. Holmes preserves its entitled immutable edition and exposes all 265 pages in the product; the technical probe retains its 43-page window. Seven former excerpts are replaced with full server-side editions. Product content/payment/ownership/bookmark routes name the edition explicitly; raw paid text is not bundled or statically exposed. Native mainnet scoped-payment acceptance is still gated. [Catalogue implementation and evidence](../spike/evidence/catalogue-2026-10-17.md).
2. Focused reader, persistent Previous/page/Next controls, accessible modal page picker, text size 17–24, day/night mode, narrow layouts and a compact visible spend counter. Technical probe controls do not appear in the reader.
3. One `ReaderGateway` interface isolates the UI from auth/payment details. It lazily reuses the spike's official AuthFetch, generated `connectDesktopWallet`, staged fee-cap/payment journal and original-proof recovery. No generated BSV files changed. Generated eager provider composition is omitted from the reader entry because this interface acquires the wallet only after a page-3 action; relay UI is not implemented by this adapter.
4. Keep the same origin, server key, SQLite ownership and browser journal keys. Public catalogue and pages 1–2 do not import the wallet module or invoke wallet APIs. No login/Connect wallet button. A short page-3 panel appears before wallet acquisition. New purchases remain paused; owned reads and original-payment recovery remain available. No keys or purchase records were reset.
5. Keep current text while requesting; render paid content only from server responses. Bookmark writes follow paint/visibility and are independent of payment. Txid ledger merges server purchase history with locally known fees; missing fee evidence is explicitly unknown, never zero. Pending/unresolved entries stay separate from accepted purchases and ownership. Separate wallet grants are not falsely included as measured page costs. Complete cross-device spend accounting is still outstanding.
6. Prices, fee ceiling and provisional wallet permission copy come from `spike/src/config.ts`. No additional live payment was made during implementation.

## Validation

- Client production build and lint PASS; scaffold server build PASS; spike build and 26 local tests PASS. Public-route regression now includes the eight-title library, checks seven entries are excerpt-only, and retains zero server-wallet calls and refusal to expose paid text.
- Collaborative browser at 390×844: library and actual Holmes pages 1–2 rendered, no horizontal overflow. Network resource inspection found no wallet chunk or authenticated routes. The displayed-page bookmark advanced 1→2 after rendering.
- Delayed the actual public page-2 response in the browser: page 1 remained visible with Confirming and disabled navigation. Releasing that original response displayed page 2. This is a public-delivery UI check, not a paid latency/recovery pass.
- At 1280×800: no horizontal overflow; centered 595px text column. Page-3 information modal rendered the shared 5+up-to-1 price and pause notice without loading the wallet. No Continue/Authorize action was taken.
- Native dialog settings opened; text size and night selection responded. Browser screenshot capture failed in this session; layout checks used DOM geometry and resource inspection. Actual phone, assistive technology, paid rendering, prolonged approval and two-device tests remain outstanding.
- SDK wallet chunk remains large (~734kB minified), but is deferred until identity is requested. This is a performance limitation, not a failed build.

## Plan acceptance ledger

Subsequent authorized local browser acceptance: owned page 5 displayed 11 paragraphs with its original receipt, resumed after reload and in a second tab, and saved the displayed-page bookmark at page 5. No spending APIs or paid-page routes were called. This verifies real same-browser paid resume narrowly; native grants/costs, fresh-device discovery, lost-paid-response recovery and simultaneous purchases remain unverified. [Browser evidence](../spike/evidence/recovery-permissions-checkpoint-2026-10-17.md).

These are overall plan criteria, not claims that local regression tests establish live wallet behavior. Historical failures remain until their required retests pass.

| Criterion | Status | Evidence / remaining work |
|---|---|---|
| C1 wallet-free browsing | FAIL | New local reader preview PASS; earlier physical-phone 502 still needs stable actual-device retest. |
| C2 one prompt/session | FAIL | Separate protocol/spending prompts observed; 20-turn total not demonstrated. |
| C3 p95 ≤500ms paid turns | UNRESOLVED | Required paid cohorts not measured. |
| C4 complete visible spend | FAIL | Counter and unknown fees improved; complete fees/permission costs and cross-device reconciliation unverified. |
| C5 underpay/replay rejection | UNRESOLVED | Local regression coverage; complete live experiment outstanding. |
| C6 exactly one charge/page | UNRESOLVED | Saved-proof/local recovery tests pass; delayed native approval, two-tab/two-device races outstanding. |
| C7 no account | UNRESOLVED | Implemented without login/email/password; complete live acceptance review outstanding. |
| C8 cross-device bookmark | UNRESOLVED | Local post-display bookmark verified; matching wallet identity and phone resume not established. |
| C9 both wallets on mainnet | UNRESOLVED | Desktop mainnet payment verified previously; Browser cohort outstanding. |
| C10 final 90s story | UNRESOLVED | Final timed demo not run. |
| C11 learnings shared | UNRESOLVED | Current four-section LEARNINGS write-up is ready; external team handoff not recorded. |

## Covers, resume and home-screen follow-up

Requested and implemented on 2026-10-17: eight locally served Project Gutenberg covers above the library titles, the original Pagestream icon in the header/favicon/home-screen assets, and read-only reopening at the locally saved last displayed page. Existing bookmark keys are migrated by reuse, so the original displayed-page hint is retained. Corrupt/out-of-range hints fall back to page 1; stale timestamp writes cannot overwrite a newer hint. Public resumes make no wallet calls. A saved paid hint may acquire identity to check the existing purchase, but cannot create a fresh page payment; another wallet lacking ownership gets an error with a free-preview escape. This fixes same-browser return/reload; it does not prove automatic fresh-phone discovery.

Client build/lint and spike build PASS; **28 local tests PASS**, including the new bookmark and paid-resume regressions. Browser checks at 1280px found eight successfully loaded covers; 390px and 320px layouts had no horizontal overflow. Holmes reopened at page 2 through the library and after reload without loading the wallet chunk. Manifest/icon HTTP requests returned the expected 192/512 PNG dimensions and the Apple touch icon. Actual phone installation and native paid resume remain untested. Screenshot capture still failed; no screenshot-based device pass is claimed. No new sats were spent and the pause remains enabled.

See [asset provenance and icon rebuild instructions](visual-assets.md) and the [full project requirement audit](project-requirements-status.md).
