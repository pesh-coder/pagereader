# Existing-payment trace request

Prepared for the operator of the configured receiving-wallet storage service, `https://storage.babbage.systems`. **Not sent.** The owner has no provider-log access or existing maintainer contact. The verified official [Project Babbage contact page](https://projectbabbage.com/contact) lists **support@projectbabbage.com** and a contact form. This is the support route for requesting retained logs; availability of the historical trace has not been confirmed. This request concerns retained logs only: do not resubmit or create a transaction.

## Message

We are investigating Pagestream paid-page latency against a 500-ms POC target. Could you retrieve your existing logs for this successful mainnet payment and identify the slow stages?

- Transaction: `bcc4abf2a2fc4d2f2d635880a65061476d886ecf7dcb193cb3b2b2e53bc2e555`
- Receiver identity: `032009e04057a50fa86c24cec4f5c43f5c2cf72f31728dbf42d239dde8d269ccdf`
- Approximate UTC search window: **2026-11-07 20:43:35–20:43:50**. Our Railway log timestamp for successful page-35 delivery is `2026-11-07T20:43:44.464865122Z`, with 3,107-ms total/upstream duration.
- Client library: `@bsv/wallet-toolbox-client` 2.14.9; SDK 2.8.11. Please confirm the service's deployed version and region rather than assuming they match.
- Our server measured receiving-wallet acceptance at 3,060.538 ms, including 154.822 ms in its own root checks and **2,896.538 ms** in `wallet.storage.internalizeAction`. Phone request-to-visible time was 6,406.2 ms; its payer workflow independently took 1,464.1 ms.
- This was a scoped pilot submitting the already-signed original payment while the payer's checked `sendWith` was outstanding. Both operations succeeded before the page was displayed. The pilot is now disabled. Known ancestors were enabled: eight ancestors, 4,065-byte complete proof, 302-byte HTTP proof.

Please separate ingress/authentication, BEEF/root verification, processor posting (provider, number of attempts, acceptance status and time), database writes/commit waits, and response formation. Were there retries, lock waits, cold connections, or duplicate publication waits? Which supported configuration or release addresses the measured stage?

We are also evaluating `createAction` with `signAndProcess: true`, `noSend: true` and `returnTXIDOnly: false`, followed by checking the complete signed proof/fee, persisting it, and sending that same transaction. Does BSV Browser 1.6.3 support this reliably, including recovering the original no-send action after a lost response and releasing an over-limit unsent action? Does its deployed storage negotiate action-batch/prepared-BEEF optimizations?

Please use the existing transaction's records; **no new payment, permission grant, funding transfer or rebroadcast is requested**. We need an explanation and a supported route, not another paid reproduction of an already captured delay.

There is also a separate acceptance gap: the POC requires one native approval for a roughly 5,000-sat reading-session budget, repeated silent payments within that budget, and a new approval for a new session. BRC-116 describes the standing spending grant as monthly and the reference bounded-session profile as non-spending. Is there a supported control in Desktop 3.3.1 / Browser 1.6.3, or a compatible released version, that provides this spending-session behavior without modifying a wallet? Please specify actual scope, fee inclusion, expiry/close behavior and application API. A monthly allowance or an app-only cap does not meet this requirement.

## Documentation findings

- [BRC-100](https://github.com/bsv-blockchain/BRCs/blob/master/wallet/0100.md) exposes combined construction/signing and `noSend`/`sendWith`. The installed SDK's default AuthFetch uses a single ordinary `createAction`. A combined **no-send** creation is a separate candidate that can preserve a fee check before broadcast, but has not been implemented or measured in this app. Signed-action cancellation, lost-result recovery and wallet support must be verified before adopting it.
- [Action-batch planning](https://github.com/bsv-blockchain/ts-stack/blob/main/packages/wallet/wallet-toolbox/docs/action-batch-planning.md) can remove storage round trips for negotiated no-send workspaces. It is wallet/provider behavior; an application cannot force unsupported capabilities, and it does not remove a fresh receiver's acceptance step.
- [SDK performance guidance](https://github.com/bsv-blockchain/ts-stack/blob/main/packages/sdk/docs/performance.md) describes key reuse and optimized BEEF assembly/serialization. Those are workload-specific optimizations, not an end-to-end latency guarantee. Browser wallet internals require a supported wallet release; changing the app's SDK does not upgrade the native wallet.
- Delayed broadcast is a supported BRC-100 option, but returning a queued result does not demonstrate checked publication. The installed receiving path still waits for processor posting. Enabling it alone is not evidence of a solved paid-turn target.
- [Storage tracing](https://github.com/bsv-blockchain/ts-stack/blob/main/packages/wallet/wallet-toolbox/docs/storage.md) is opt-in on clients/providers. The installed StorageClient interface does not expose a historical trace download. Enabling tracing now cannot reconstruct earlier unrecorded spans; retained provider logs are needed.
- The POC itself explicitly suggests paying for the next page while reading the current page. That is a legitimate separate UX option. It can hide latency only when the next page is ready, may purchase an unread page if the reader leaves, and does not by itself fix a proof-depth/payment-chain failure. The previous investigation's references to a strict pay-on-click constraint should be read as describing the current implementation, not as a prohibition in the original POC brief.

No alternative above is claimed to have met 500 ms on the deployed wallets.
