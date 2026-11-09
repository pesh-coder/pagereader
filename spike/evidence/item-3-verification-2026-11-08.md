# Item 3: correctness, devices, accounting and delivery

The owner closed item 2 on 8 November under revised acceptance: input on the first unowned page, then explicit Next turns without repeated approval. Native 5,000-sat session scope/expiry and allowance accounting are waived. Same-identity cross-device resume was already waived. Work order is item 3, then item 1 (latency). The final timed demo depends on item 1; it cannot be honestly passed in advance.

## Checks performed without payments

| Check | Result and scope |
|---|---|
| Full automated suite | 123 passed, 0 failed; `npm test` in `spike`. Synthetic SDK wallets/local fixtures, not a native mainnet fault cohort. |
| Server type check/build | `npm run build` in `spike` passed. |
| Underpayment and replay | Existing suite rejects four-sat underpayment before import/entitlement, and cross-identity replay without changing original ownership. Wrong-page/edition tests remain covered. |
| Recovery, races and stopping | Original-proof recovery, atomic receipt/replay commit, duplicate-request exclusion, uncertain-payment protection, logout/acquisition/delivery races and durable restart coverage pass locally. Closing an app cannot cancel an already-submitted transaction. |
| Chained reading and reopen | 24 chained synthetic payments, complete durable proofs, bounded HTTP proofs, distinct receipts and exact fees. A fresh authenticated client reopens the first/last owned pages with no extra creation/import. This does not establish native proof-depth behavior. |
| Existing phone ledger | Re-audited retained export: pages 3–35, 33 distinct page receipts and txids, one identity/edition, prices 165 + miner fees 759 = **924 sats**. No duplicates or missing pages within this capture. It is not a complete-wallet-history audit or new mining verification. |
| Hosted public checks | Mainnet, payment-ready; deployed session guards present, overlap pilot disabled, original public receiver identity unchanged. Eight books and all 16 preview responses pass without wallet/auth/payment calls. Purchases are enabled on the host; these checks made no purchase. |
| Learnings/runbook | Updated to reflect owner-approved scope, separate device identities, existing approval behavior and item-3-before-latency order. Team delivery is not claimed. |

Raw local evidence is ignored under `spike/evidence/runs/`: `item-3-tests-20261108.log`, `item-3-build-20261108.log`, `item-3-receipts-20261108.json`, and `item-3-hosted-20261108.json`. Existing phone export SHA-256: `d867b46514aeffa545bc47f62389e55afc74ba8fd72de4a28437a7c0ed96ff30`.

## Owner-confirmed completion, 9 November

The owner explicitly confirms finishing phone owned-page reopening without another prompt/charge, navigation visibility on both devices, native recovery/duplicate-charge checks, and sharing the learnings note. Item 3 is COMPLETE on that basis. This is owner-reported acceptance; no additional native captures or team-delivery record were supplied, and the assistant sent no external message. The final timed mainnet demo stays with item 1 after latency improvement. Earlier pending checks below are historical and superseded by this confirmation.

## Historical pending checks

**Desktop recovery confirmed, 9 November:** the owner reports the connection fixed after restarting Desktop, then confirms owned-page Continue reading with no new wallet prompt in response to the 74-sat/no-new-debit check. The immediate resume blocker is closed. The underlying bridge stall is not proven permanently prevented; retain the HTTP 503/signature-verification evidence for recurrence. [Investigation](desktop-connection-failure-2026-11-08.md).

1. **Physical devices:** displayed totals **Desktop 74 sats and phone 924 sats** match recorded receipts. Desktop owned-page resume/no-new-prompt recovery is now owner-confirmed. Exact book/page and navigation visibility, plus the phone owned-page reopening/no-new-prompt check, remain unreported in the current physical-device run. No grant or unowned-page selection is needed for these checks.
2. **Native fault behavior:** synthetic tests do not prove receiving-wallet duplicate import or real interrupted-delivery/concurrency behavior. Reuse existing accepted proofs and read-only evidence where possible. Any test involving a new payment, paid grant, rebroadcast or wallet changes requires separate bounded scope; none was authorized or performed here.
3. **Team sharing:** the note is written in `LEARNINGS.md`; no external message was sent and team receipt remains unconfirmed.
4. **Final timed mainnet demo:** retain as a dependency after item 1. A read-only owned-page rehearsal does not establish new-payment speed or satisfy the full timed story.

Item 3 is complete by owner confirmation. Only item 1 remains active; the 500-ms target is unchanged. No native settings, permissions, wallet records or funds were changed by this verification.
