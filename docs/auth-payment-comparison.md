# Pagestream auth/payment decision — approved for tier-1 spike

Date: 2026-10-15. Authority: `pagestream-plan.md` v3 and the user's scaffold-first gate order. The user approved BRC-105 and the proposed tier-1 probe in chat ("okay lets do tha"). Product implementation remains separately gated.

## Recommendation

Use BRC-103/104 session authentication with BRC-105 payments: `@bsv/auth-express-middleware`, `@bsv/payment-express-middleware`, and SDK `AuthFetch`. A BRC is a BSV protocol specification; these provide wallet identity on HTTP requests and wallet payments in response to HTTP 402.

This choice is approved for the throwaway spike; wallet behavior and acceptance criteria are not yet proven. The wallet-connect-only scaffold has no signed-request application routes to migrate, so it does not create an auth-model conflict. Retain the generated wallet acquisition, providers, config and identity helpers. Leave both generated `src/bsv/` directories unchanged. Implement the protocol adapter outside them, using official SDK/middleware APIs rather than custom keys or crypto. Do not layer the generated proof verifier over BRC-103 routes.

## Comparison for this reader

| Concern | BRC-103/104 + BRC-105 | Per-request proofs + plain BRC-29 route |
|---|---|---|
| Unpaid identity | Authenticated bookmark, owned-page and reconciliation requests use `req.auth.identityKey`; no payment needed. | Generated `createAuthProof`/`verifyAuthProof` can authenticate unpaid actions too. Adding `signed-requests` later supplies `signedFetch`/`verifySignedRequest`. A payment-only identity is insufficient for unpaid requests. |
| Application shape | One protected API authentication model; warm sessions may help repeated reading, subject to measurement. Default session state is process-local. | Stateless per-request identity proofs; each request involves signing. Generated `signedFetch` uses POST envelopes, so plan's PUT/GET shapes need deliberate adaptation. Prompt/latency impact is unmeasured. |
| Replay | Middleware accepts a durable atomic `replayStore.claim(txid)`; checks wallet acceptance before the claim. Request-auth replay and payment replay remain different concerns. | Generated proof nonce store is in-memory. Replace via an injected durable atomic consumer outside generated files; separately build durable txid claims. Recipe's in-memory `usedTxids` Set is insufficient across restarts/processes. |
| Underpayment | Documented 400 `ERR_INVALID_PAYMENT`, aligning with C5. | Recipe returns 402 for underpayment; must deliberately change application behavior to meet C5's 400 target. |
| Lost response | Default AuthFetch payment retries can resend the transaction and get 409. Adapter must reconcile entitlement first and prevent creating another payment for an uncertain purchase. | Explicit payment orchestration makes txid capture/reconciliation straightforward, but all retry policy is ours to implement. Reuse the original transaction when resubmission is needed. |
| Two tabs/devices | Requires durable per-identity/edition/page purchase coordination before any spending challenge. Middleware's unique txid claim alone cannot prevent two different transactions for one page. | Same requirement; signed proofs and unique purchase rows alone cannot prevent two charges. Route gives more direct control of challenge lifecycle. |
| Spend ledger | Observe wallet `createAction` results via a thin official-interface wrapper, and reconcile by txid; validate this in E11. AuthFetch action labels are another discovery mechanism. | Direct `createAction` result is accessible. Still needs pending/confirmed/unresolved ledger independent of entitlement. |
| Integration cost | More protocol/session integration, less payment validation code maintained by Pagestream. CORS must expose auth/payment headers; full proxy/header path must support AtomicBEEF proofs. | Closest to starter recipes, but more payment validation, replay, error mapping and recovery logic belongs to Pagestream. |

Both use BRC-29 wallet payment outputs. Neither establishes a one-prompt permission experience, matching identity on restored devices, or sub-500-ms turns without real-wallet tests.

## Correctness conditions that apply to either choice

1. Public catalogue and free-page routes terminate outside auth/payment middleware. No wallet probing, identity acquisition or calls on these screens; wallet acquisition starts only when page 3 is requested. The generated demo Connect button will be replaced only after product design approval.
2. Persist unique `(identity_key, edition_id, page_no)` entitlements, globally unique payment txids, and atomic replay claims. Authenticate identity before looking up ownership or issuing a payment challenge.
3. Acquire a durable purchase intent before returning any spendable challenge. Other callers for the same identity/page receive an in-progress response without another payment challenge. Bind intent, verified identity, edition/page, and prefix together; recheck before wallet internalization. Never hold a database transaction open during wallet/network calls.
4. **An intent timeout is not proof that no money left the wallet.** A delayed first client may already have paid when its lease expires. Refusing its transaction before internalization does not undo its broadcast. Do not automatically release an ambiguous purchase for another charge; reconcile or keep it visibly unresolved. A plain 30-second lease with automatic reissue is not an adequate C6 design. E10 must include delayed clients, expiry, and crash/restart races as well as simultaneous tabs/devices.
5. After loss of a paid response, query ownership/payment status using an authenticated route that cannot create payments. Serve owned content with no payment header. If not recorded, resolve the original intent/txid; do not automatically purchase again. A fresh AuthFetch fetch to a route that returns 402 can spend again, so simply removing the payment header is insufficient in an uncertain state.
6. Capture txid as soon as wallet payment creation returns; show pending spend while retaining current page and `Confirming…`. Display new paid text only after the server returns it. Reconciliation never silently deletes spend or counts a txid twice. Unknown fees remain unknown/estimated, never a claimed measured 1 sat.
7. Bookmark only after a page has rendered and is visible, via an independent authenticated write; keep anonymous free-page progress local. Bookmark failure does not roll back payment or ownership.
8. Wallet acceptance, replay claim, and purchase insert are not one atomic database transaction. Journal purchase stages and reconcile server-wallet receipts after failures; do not call a database unique constraint a solution to the external-wallet crash window.

These are design obligations and spike questions, not guarantees already proven. If C6 cannot be achieved with the official integration, escalate before the final demo. Do not relax the criterion silently.

## Proposed next approved step: tier-1 throwaway spike

Keep all probe code in `spike/`, separate from the product app. Pin compatible published SDK, auth middleware, payment middleware and server-wallet packages; record wallet app versions. Recheck F1–F10 against those exact packages, not just repository main. Use one Gutenberg edition, fixed segments, public pages 1–2, and paid pages 3–23. Use a persistent mainnet server wallet, SQLite, plain HTML/TypeScript and public HTTPS.

Run E9 with no wallet, E1 with/without manifest, E2/E3 over 20 paid turns and tab reopen, E6 across restored laptop/phone wallets, then E4 p50/p95 including render for 20 turns per wallet. Record all prompt types and actual scope/expiry; do not promise a session grant. Keep payment-triggering on explicit page requests, with paid prefetch off. Put every provisional permission string, allowance and fee estimate in one configuration source shared with generated manifest/copy consumers. Collect segment timing, prompt diary and screenshots. Hosting and copy remain undecided until evidence.

This proposal does not start tier 2, product UI, deployment, or real payments. After the user's protocol/probe approval, implement and run tier 1, reporting unavailable wallet/device evidence as UNRESOLVED. The next product design must use the handoff and the plan's three state corrections, then receive its own approval before product code.

## Sources inspected

- [CLI reference](https://www.createbsvapp.com/docs/cli.md), [capabilities](https://www.createbsvapp.com/docs/capabilities.md), [payment recipe](https://www.createbsvapp.com/docs/accept-payments.md), [security](https://www.createbsvapp.com/docs/security.md), [testing](https://www.createbsvapp.com/docs/testing.md), [troubleshooting](https://www.createbsvapp.com/docs/troubleshooting.md).
- [Auth middleware README](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/middleware/auth-express-middleware), [payment middleware README](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/middleware/payment-express-middleware), [AuthFetch source](https://github.com/bsv-blockchain/ts-stack/blob/main/packages/sdk/src/auth/clients/AuthFetch.ts). Repository-main inspection is provisional until exact package verification in the spike.
- [MarsCast reference commit c5f720f](https://github.com/p2ppsr/mars-cast/tree/c5f720f32c9c6141e525a2fa231557fb75312119): inspected README, server and browser client only. Its auth-before-payment ordering and click-created AuthFetch are relevant. Certificates, global payment gating, demo key and permissive CORS are not proposed for this reader. No example app was used as the scaffold.
- Local `app/AGENTS.md`, manifest, entry points and wallet helpers: only wallet-connect is selected; generated wiring is automatic, with no manual section to apply.
