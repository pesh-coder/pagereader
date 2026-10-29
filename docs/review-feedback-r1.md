# Senior review R1: implementation and verification

Updated 2026-10-29. These changes are local and have not been deployed. The original [review](../PAGEREADER_REVIEW_FEEDBACK-R1-29-10-2026..md) remains unchanged. The POC is still incomplete.

| Review item | Change | Verification / remaining work |
|---|---|---|
| 1 Product explanation | Compact library introduction, free-reading action and explicit price plus fees. | Browser checks; no author-payment claim. |
| 2 Repeated confirmation | Show the app's explanation once per tab session. Subsequent Next clicks go directly to the guarded payment flow. Remembering the explanation grants no wallet permission. | Local implementation; consecutive real-wallet turns still need observing. |
| 3 Wallet setup | Desktop and Browser download links, device-prioritised guidance and connection retry. | Free previews do not load the wallet module. Native setup remains a device check. |
| 4 Interrupted attempts | Separate a reserved request from a wallet call that has started. Explicit permission denial or insufficient funds can retry the same request. An unsigned reference must be successfully aborted first. Generic HTTP errors/timeouts stay uncertain. | Local refusal, abort-failure, delayed-signing and lost-response tests. Actual native error formats remain to be checked. No uncertain attempt expires automatically. |
| 5 Acceptance/persistence gap | Validate the original identity/edition/page, saved proof, transaction and receiver output before acceptance. A successful receiver merge can finish the missing SQLite commit. Authenticated recovery can use the server's saved proof when a fresh browser has no local journal. | Local restart test reopens SQLite after receipt-write failure and restores ownership without creating another payment. Receiver behavior is simulated; real wallet/storage duplicate-import and crash recovery remain unverified. A duplicate error alone never grants ownership. |
| 6 Fee/proof protection | Retain prepare → absolute fee check → sign without sending → save proof → broadcast that transaction. | Unknown/excessive fees, lost signing response, changed outputs and failed proof persistence remain covered. The page fee cap does not cover permission costs. |
| 7 Wallet allowance | Capture the wallet interface version on connection and display it in the wallet menu. Keep historical findings dated. | Current native app versions, deployed-origin attribution, allowance exhaustion and legacy accounting still require Desktop/Browser checks. No wallet was modified or upgraded. |
| 8 Paid latency | Preserve the existing stage timing/reporting and expose reader wallet/HTTP timings in diagnostics. No proof data was removed and no paid prefetch was added. | Real 20-turn cohorts and paid p95 remain open. Previously owned reads do not count as paid samples. |
| 9 Continue reading | Prominent Continue reading action; opening a book while already connected attempts owned resume. Fresh-device discovery uses an explicit action. | Local identity-only resume tests. The resume route never falls through to buying a page. Physical phone continuity remains open. |
| 10 Spending labels | Label cumulative book spending clearly; show accepted, pending and uncertain amounts separately. Preserve unknown fees and deduplicate by txid. | Local reload, identity/edition isolation, receipt-fee and unknown-fee tests. Complete permission/uncertain cross-device accounting remains open. No session counter is claimed. |
| 11 Actionable failures | Connection retry, safe purchase retry, Check payment and clear unavailable states. Keep the current page visible through failures. | Local recovery tests and browser free/error-state checks; native delayed/closed-wallet behavior still needs observing. |
| 12 Visual identity | Keep the pilcrow and a quiet reading layout; use restrained controls, serif reading text and neutral spending information. | This is a focused refinement, not a new branding project. Further design exploration remains optional. |
| 13 Text/icon encoding | Render supported Gutenberg emphasis as React text/emphasis nodes; preserve literal underscores and avoid HTML injection. Repair the malformed pilcrow and page title. | Presentation tests; edition/page assets are not regenerated. |
| 14 Source checksums | Restore the original CRLF source bytes that match all eight existing edition hashes; mark sources as immutable byte assets in Git. | All eight hashes pass. Tests check Git filtering with `core.autocrlf=true`, `false` and `input`. The large source diff changes line endings only; no edition ID, paragraph or purchase changes. |
| 15 Production boundaries | Production hides research assets, legacy routes and `/api/catalogue`. Add bounded network and authenticated-identity rate limits. Keep owned delivery and submitted-proof recovery available during a purchase pause. | Production-route and rate-limit tests. Network limits use the actual peer address; a proxy can aggregate readers. Deployment-specific edge limits/trusted proxy configuration remain an operations concern. |
| 16 Code ownership | Production payment modules live in `app/client/src/payments`; research entry points re-export them for compatibility. Extract wallet menu, guidance, text, library and spending components. Isolate receiver binding/merge handling in an adapter; remove response-header interception for challenges. Pin the client SDK to the existing 2.8.11 version. | Client/server builds and local payment/recovery tests. No dependency upgrade or generated wallet-helper change. |
| 17 Current documentation | Keep the short learnings and one acceptance register; preserve the old checkpoints separately. | This checklist distinguishes code, local tests and native/device evidence. Sharing remains deferred for owner review. |
| 18 Whole journey | Extend local refusal, recovery, restart and production-route coverage. | Full mainnet/device journey, native races/negative cases, tab-close observation and the 90-second rehearsal remain open. |
| 19 Responsive/mobile | Fit header, pager and dialogs to narrow screens; add safe-area spacing, wrapping and touch targets. Font size changes only presentation. | Browser-sized layout checks; real BSV Browser portrait/landscape and wallet prompts remain open. |
| 20 Free/loading/unknown spend | Show Free preview, Loading spending… and Spending unavailable appropriately. Zero is shown as recorded spending, never a whole-book price. Known prior records stay available when refresh fails. | Local presentation/history-failure tests. A connected reader retrieves receipts for the selected edition; native Frankenstein receipt lookup still needs checking if an existing purchase is reported. |
| 21 Wallet menu | Header connection status, shortened/full public identity, copy, interface version and Log out. Disconnected readers get setup guidance. | Local logout test preserves ledger and payment journals. Logout clears the app connection/display, not wallet permissions. Real identity comparison is the next device step. |

## Payment acceptance policy

Validation on 2026-10-29: **75 local tests passed, 0 failed**, client build/lint passed, and server/spike build passed. A browser frame checked 375px portrait and 812×375 landscape: no horizontal overflow, free pages 1–2 without a wallet module, a scrollable first-use dialog, and 24px text/night mode without changing page 2's text. This is browser layout evidence, not a physical BSV Browser pass. The preview's resize operation was unreliable, so the narrow checks used same-origin browser frames with their own CSS viewport.

The app unlocks a page after the receiver accepts the payment and SQLite records ownership. It does not wait for mining confirmation. “Accepted” in the reader refers to this application receipt. Receiving-wallet acceptance does not prove mining or successful network broadcast by itself.

Recovery resubmits the original proof/transaction. Only a successful receiver acceptance/merge with a matching stored binding completes ownership. Unknown errors, unrelated known transactions and missing proofs remain blocked rather than starting another charge.

## Development and production

- Normal server startup exposes the reader; research routes require `PAGESTREAM_RESEARCH=1` during development. Production ignores that opt-in.
- The isolated UI preview is `node --import tsx scripts/preview-reader.ts` from `spike`, at `http://localhost:3112/reader/`. It uses memory only, no `.env`, receiving wallet or real ledger.
- Keep the existing receiving identity, authoritative SQLite volume, original pause marker and payment journals during deployment. `PAGESTREAM_PURCHASES_ENABLED=1` enables new purchases; `0` pauses them. Do not delete the marker to change admission.

## Next practical steps

1. Review/deploy this build using the existing identity and ledger. Deployment has not been performed by this change.
2. Open the same HTTPS origin on Desktop and inside BSV Browser. Record native app versions and the interface versions shown in the wallet menu. Compare public identity keys only.
3. Use Continue reading to restore an already-owned page and bookmark without buying anything. Compare the recovered book total with the existing receipts. Retest free previews on the phone.
4. Observe the actual origin's permissions and allowance rules before planning paid runs. Check both normal consumption and exhaustion; do not treat the historical monthly/port findings as current results.
5. Run controlled paid, failure/recovery and timing checks on exact unowned pages, then rehearse the six-step demo. The [acceptance register](project-requirements-status.md) remains authoritative for unfinished POC gates.
