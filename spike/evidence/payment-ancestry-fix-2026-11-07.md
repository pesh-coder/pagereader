# Payment ancestry fix — 7 November 2026

Implemented after the [native capture](phone-paid-run-2026-11-07.md) confirmed Browser's proof-depth limit of 12. No native wallet was modified and no agent-created payment, grant or broadcast was performed. Seller price remains 5 sats plus actual fees.

## Changes

- The authenticated 402 response advertises up to eight recent accepted transactions belonging to the caller, only when complete proofs remain in persistent SQLite. This uses [BRC-105 known ancestors](https://github.com/bsv-blockchain/BRCs/blob/master/payments/0105.md#53-declaring-known-ancestors-optional).
- The client previously cleared knownTxids. It now honours only server-declared hints whose exact complete proofs it retains. An authenticated, bounded me response supplies retained proofs for a fresh browser. Other identities cannot retrieve them. Missing/corrupt data falls back to a full-proof wallet request.
- Wallet construction and HTTP transport use compact ancestry. Before fee checks, signing comparison, persistence and receiver verification, the exact complete proof is reconstructed. Unknown references are rejected. Original complete proofs remain available for recovery; output, price, identity, page and replay checks remain.
- Fresh explicit turns omit a redundant status request. Existing attempts, recorded debits, owned pages and all recovery retain the check. The server still checks ownership and reserves an intent before issuing a payment challenge.
- Unsigned-only recovery permits an earlier unmined payment only when its exact TXID matches an authenticated accepted receipt. Unsigned, sending, failed, unmatched or changing actions still block. Recovery never creates a payment and preserves the original request.
- Timing exports include ancestor counts and proof/transport sizes, without exporting proof bytes or wallet arguments.

## Validation and limitations

105 tests pass, including a synthetic 25-ancestor signing case, 16 consecutive SDK/AuthFetch chained payments through the middleware, complete durable proofs, compact payload bounds, identity isolation, disabled-hint fallback, fee checks and recovery guards. Client build/lint and spike type checks pass. These fixtures do not prove native wallet performance. The published mobile toolbox 2.14.3 implementation supports the knownTxids path; the physical-phone pilot now confirms eight known ancestors and a successful page-33 purchase. Sustained reading remains unverified.

Read-only verification of an existing received proof took 544/383/375 ms with the default toolbox header provider, versus 593/288/302 ms with the SDK WhatsOnChain alternative, from the agent environment. This is not a hosted payment benchmark and does not justify a provider switch. The default remains unchanged.

The earlier 13-turn native median was 6.51 seconds. The later one-page pilot took 7.073 seconds; the 500-ms target remains missed. Receiver wallet acceptance took about two seconds and is not claimed fixed. No paid prefetch, early delivery, weakened proof checks or wallet/key/storage migration was introduced.

## Rollback and next check

Disable new hints with PAGESTREAM_KNOWN_ANCESTORS_ENABLED=0, or for comma-separated public identities with PAGESTREAM_KNOWN_ANCESTORS_DISABLED_IDENTITIES. Keep restoration deployed for in-flight payments; do not roll back to a binary unable to resolve an already-declared ancestor. Retain the persistent proof database.

The bounded page-33 pilot is complete: one accepted 28-sat purchase, eight known ancestors, transport reduced from 3,612 to 302 bytes, book total 868 sats. It took 7.073 seconds, including 2.434 seconds in receiver acceptance. This is not a qualifying 20-turn p95 or proof of sustained depth-limit avoidance. Preserve the capture and profile receiver verification/storage before another paid cohort. [Pilot evidence](phone-page33-pilot-2026-11-07.md).
