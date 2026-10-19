# Payment recovery and fee cap: implemented spike changes

The user authorized these repairs in chat. They apply only to the throwaway tier-1 probe; milestone-1 product work remains gated.

## Behavior

- Page payments use the official wallet `createAction` with `signAndProcess:false` and `noSend:true`. The unsigned transaction's fee must be known and at most **1 sat**, configured in `src/config.ts`. An excessive/unknown fee is aborted before signing. The page price remains **5 sats**: intended page total at most **6 sats**, excluding separate wallet permissions/setup costs.
- `signAction` also uses `noSend:true`. The client persists the complete signed BRC-105 payment proof, transaction ID, fee, identity, edition, page and original request ID in localStorage before a sendWith-only action can broadcast it. All key derivation/signing stays in the official wallet/SDK; generated `app/**/src/bsv/` helpers were not changed.
- Recovery checks ownership first. If necessary it rebroadcasts/submits the saved original transaction; it never creates a replacement payment for a signed or uncertain attempt. An explicitly aborted unsigned quote can be retried against the same server intent/request ID. Fresh challenges remain paused.
- The server persists submitted proofs and binds each txid to one identity/edition/page. Wallet acceptance commits the receipt/replay claim and entitlement in one SQLite transaction. Repeating the matching proof returns owned content; a different page/identity or replacement tx is refused. A wallet merge after an interrupted app commit can complete ownership; the client fetches the unpaid owned route after the official middleware's merge response.
- The counter separates confirmed page costs from pending/unresolved recorded costs. Separate permission costs remain explicitly unmeasured; C4 is not declared passed.

## Wallet preference

The mainnet Arcade policy was read before changing the nonsecret preference. It advertised 1 sat/1000 bytes. Desktop's supported preference file `C:/Users/THINKPAD/.bsv-desktop/fee-settings.json` was saved with `main:1` and read back successfully. **Desktop needs a restart** to apply it to local-storage wallets. No wallet process was forcibly restarted, no private wallet files were read, and no recovery phrase/key was requested. Remote-provider fee settings are not controlled by this preference. The running wallet's effective rate and native support for the new staged-action flow remain unverified.

## Verification

`npm run build`: PASS. `npm test`: **21/21 PASS**, using synthetic SDK-signed transactions, a fault-injected receiver and recorded public mainnet transaction fixtures. No real reader-wallet operation or new transaction was authorized/broadcast by these tests.

Checks cover proof persistence before broadcast; repeated sending of the same tx; a 57-sat quote refused before signing; unavailable fee evidence refused; delayed signing; lost signing response; storage failure; changed signed outputs; atomic receipt/replay rollback; delivery lost after acceptance; fresh auth/middleware session; replay to another page; and wallet acceptance immediately before a failed app commit followed by same-proof recovery. Public previews and unpaid bookmarks remain covered.

Local server restarted with its existing key/database. `/health` reports mainnet, receiver ready, and `purchasesPaused:true`. The persistent `data/PAID_REQUESTS_PAUSED` marker remains in place.

The collaborative browser opened the local probe and reported its title, but snapshot automation failed on both initial and explicit-tab attempts. Browser-interaction verification remains UNRESOLVED; no wallet-enabled browser was driven. The HTTP/public-isolation regression checks pass.

## Limits and next live check

These are local regression passes, not C1–C11 live acceptance passes. C1/C2/C4 remain FAIL; other outstanding criteria retain their previous UNRESOLVED status, including C6. The new staged create/sign/send flow may change native prompts and latency and requires fresh measurements.

Lost signing responses remain explicitly unresolved and unsent under the wallet's noSend contract; the client must not create another action. The pinned toolbox says out-of-session signAction reference recovery is not implemented. Browser storage loss or an origin change can also remove client-side recovery data. Submitted proofs are retained on the server, but cross-device recovery of an unconfirmed submission is not exposed as a new endpoint. Historical attempts created before this patch cannot acquire missing proofs retroactively. No existing purchase/intent was deleted or reset.

Next: restart Desktop, confirm the effective mainnet fee rate, then check the already-owned page 3 without creating a payment. New paid testing remains paused until native flow/cost checks and remaining historical-debit reconciliation are reviewed. Permission grants can still incur costs independently of the page fee cap.

## Desktop reopened: read-only verification (2026-10-17)

The user opened Desktop and authorized checking it. Process start times are after the saved fee preference; `fee-settings.json` still has `main:1`. Official SDK `WalletClient('json-api', 'localhost:3108')` returned authenticated true and network mainnet. `getVersion` returned wallet protocol version `wallet-brc100-1.0.0` (not the Desktop application version).

A read-only SDK/AuthFetch check, with `createAction`, `signAction`, and `internalizeAction` explicitly blocked, retrieved `/api/owned/3` with HTTP 200 and 10 paragraphs. Its purchase txid is the original `4b2e989eab3cbc6034a7826017b127bd0cba32a8719113b5953f9cbaed6ef709`, with the original 5-sat server receipt. No replacement payment, bookmark write or wallet spending action was made. Desktop identity matches this recorded entitlement. This verifies the live Desktop unpaid owned-page read, not new-payment fee measurement or interrupted-payment recovery.

Collaborative browser snapshot now works and shows the public preview with zero wallet calls. Page 2 populated the DOM, but its post-paint status/busy state did not complete in the automation surface. No completed visual page-turn/latency pass is claimed. The reader's wallet-enabled browser is a separate surface. C1 and the other live criteria retain their existing statuses. Effective native transaction fees remain unmeasured; the lower preference and restart alone are not proof of a 1-sat quote.

## Controlled native unsigned quote: PASS (2026-10-17)

The user explicitly requested the quote and confirmed Desktop's fresh **6-sat Spending Request** was authorized. `scripts/check-unsigned-fee.ts` uses the official SDK/HTTP substrate at the same localhost origin, a single 5-sat P2PKH output copied from the public prior-payment fixture, and `signAndProcess:false`, `noSend:true`. It does not create a server purchase intent, derive a new payment key, call signAction, or use sendWith.

Desktop returned an unsigned action with **1 input, 2 outputs, and a 1-sat fee** computed by SDK Transaction.getFee(). The 5-sat output and locking script matched the requested template. Total quoted page cost was **6 sats**. `abortAction` returned **aborted:true**. No page payment was signed or broadcast. Local ignored evidence: `evidence/runs/unsigned-fee-1792236999380.json`, state cancelled, 11:36:39–11:37:17 UTC. The 1-sat native quote supersedes the earlier unmeasured-fee notes, but does not prove that every future input selection has the same fee. The configured 1-sat cap still applies.

An earlier unsigned call returned HTTP 400 before supplying a reference; the user saw 6 sats and confirmed choosing Deny on that old request before the fresh attempt. That failed call remains logged as unresolved (`unsigned-fee-1792236833078.json`); no automatic replacement or historical intent reset was performed. The fresh quote records bounded wallet error fields for diagnosis. Build PASS after adding the script; no product files/generated helpers changed.

Permission semantics checked against official Desktop v3.1.1 `SpendingAuthorizationHandler/index.tsx`: ordinary Authorize calls `grantPermission` with `ephemeral:true`, while Set/Increase spending limit uses a persisted grant. Thus a spending prompt is not itself evidence of another permission-token transaction. BRC-116 says valid saved tokens are reused; protocol grants should default to non-expiring; changing origin/counterparty/capability, revocation or finite expiry can require another grant. Monthly spending limits use calendar-month accounting without expiring each month; insufficient remaining allowance can trigger a limit increase. Actual repeated-grant behavior across both devices remains unmeasured.

Sources: https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/src/lib/components/SpendingAuthorizationHandler/index.tsx ; https://github.com/bsv-blockchain/BRCs/blob/master/wallet/0116.md

The unsigned quote is a narrow native PASS, not a C1–C11 acceptance upgrade. C1/C2/C4 remain FAIL, C6 and other outstanding criteria remain UNRESOLVED. Fresh paid challenges remain paused; sign/send/delivery still require a controlled live run.

## Single paid-page attempt: delivery NOT COMPLETED (2026-10-17)

The user authorized one live test and later confirmed approving its 6-sat Spending Request. The operator script selected untouched page 5 after authenticated status checks; pages 3/4 and historical intents were preserved. A temporary permit bound only the exact identity/edition/page/request ID while the global pause remained active. The permit was removed automatically on exit and is confirmed absent.

Run `evidence/runs/live-page-1792237543236.json` began 11:45:43 UTC and ended 11:50:57 with `fetch failed` during native createAction. No signable reference, transaction ID or proof returned to the script; preparePayment never reached signAction or sendWith. The server page-5 intent is challenged, txid null, with no ownership or submitted proof. Do not clear it or start a replacement run. Native wallet completion after the disconnected call remains uncertain; no reference was returned for a safe abort.

A subsequent read-only SDK listActions query (`seekPermission:false`) returned exactly three completed history entries: the 88,000-sat incoming transfer, the old 239-sat protocol grant, and the old 62-sat page-3 payment. There is no new completed debit or page-5 purchase in the returned history. Thus this attempt did not demonstrate paid delivery, and there is no evidence of a new spent page payment. An unsigned abandoned wallet action may still need reconciliation; absence of a history entry is not permission to repeat it.

The approximately five-minute failure is consistent with Node fetch's header deadline while Desktop was awaiting authorization; the original error omitted its cause, so this is an inference rather than a proven error code. Added a local-only node:http adapter for operator scripts with a configured 15-minute whole-call deadline, bounded responses, explicit deadline error and no automatic retry. All cryptographic/wallet processing still uses the official SDK. The browser/product transport was not changed. Native checks were not rerun against new money.

Build PASS and all **23/23 local tests PASS**, including delayed native responses and deadline handling without another request. No live C1–C11 acceptance upgrades. New paid testing remains paused, page 5 stays unresolved, and historical entitlements remain intact.

## Reconciliation and same-intent live completion: PASS, narrow scope (2026-10-17)

The user requested reconciliation. Supported normal listActions returned exactly the three completed historical transactions, with no unsigned/active action; noSend-actions selector returned zero. Failed-actions diagnostics returned one old unsigned failed record, with blank txid and planned net -62 sats. Its BRC-105 prefix exactly matches the historical **page-4** intent, not page 5. That is not a new completed debit. The current SDK rejects its blank txid during result validation, so response metadata was inspected read-only via the SDK's fetch adapter; no invalid result was used for signing/cancellation, and no failed action was revived.

Official Desktop v3.1.1 HTTP bridge and PermissionQueueManager sources show that a disconnected app request cancels/denies associated permission prompts. Observations are consistent with automatic cleanup; no page-5 reference remained available for an explicit abort. No raw wallet database/private files were read or modified. A no-permission listOutputs check returned 400, so no spendable-balance total was claimed.

Because the old operator script had definitively ended in `preparing` before receiving any reference or entering signing, and the complete normal wallet listing had only completed actions, a guarded `--resume-unsigned` path reused **the exact original page-5 server request ID/reservation**. This path rejects prepared/signing/signed/confirmed runs, any stored reference/txid/proof, an incomplete/active wallet listing, a different identity/page/edition/request ID, or any submitted server transaction. It preserves the failed run and existing intent; it does not erase ownership or issue a second reservation. This is distinct from retrying an uncertain signed payment.

Live run: `evidence/runs/live-page-1792240272783.json`, 12:31:12–12:31:26 UTC. Native staged payment returned **1-sat fee**, persisted signed proof before sending, and used sendWith for that same tx. Server returned **HTTP 200, page 5, 11 paragraphs**, with the matching original-intent receipt. Unpaid `/api/owned/5` then returned HTTP 200 with the same txid and 11 paragraphs.

- Txid: `9d39cbd7092be278ffef053bfe349d2eb8ab6fc44cc006c1572cd583e56a47fe`.
- Official SDK fee from returned AtomicBEEF: **1 sat**. Server output: **5 sats**.
- Read-only wallet history now has exactly one additional action, **-6 sats**, status `unproven`; no additional permission-grant entry.
- What'sOnChain mainnet lookup sees the 226-byte transaction: outputs 5 and 4,932 sats, spending the original page-3 change of 4,938 sats. At verification it had no block confirmation. App receipt `confirmed` means accepted ownership, not mined confirmation.
- The temporary permit is absent; the persistent global pause remains. No further live purchase was attempted. Historical page-4 failed intent and original page-3 entitlement remain untouched.

This supersedes page 5's unresolved status above: its paid API delivery and unpaid reread are now verified at **6 sats total**. It does not verify visual reader rendering, paid-page p95, a charged-but-lost-proof recovery, both-wallet behavior, or prompt completeness. C1/C2/C4 remain FAIL and other outstanding C1–C11 criteria remain UNRESOLVED. Local build and 26 tests cover the updated guards/transport and previous recovery cases.

Sources: https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/electron/httpServer.ts ; https://github.com/bsv-blockchain/bsv-desktop/blob/v3.1.1/src/lib/services/PermissionQueueManager.ts ; https://whatsonchain.com/tx/9d39cbd7092be278ffef053bfe349d2eb8ab6fc44cc006c1572cd583e56a47fe
