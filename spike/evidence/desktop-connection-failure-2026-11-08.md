# Desktop owned-page authentication failure

**Recovery confirmed, 9 November:** after fully quitting/reopening Desktop, the owner reports the connection fixed and confirms owned-page Continue reading without a new wallet prompt in response to the 74-sat/no-new-debit recovery check. Close the immediate connection/resume blocker as owner-confirmed recovery. No permanent prevention or diagnosis of the underlying bridge stall is established; retain the reproduction below for recurrence.

The owner reports Desktop-only connection/resume failure during item 3. Phone displayed receipt totals remain 924 sats; Desktop remains 74 sats. This is a current correctness blocker, independent of the waived native session-budget requirement.

## Reproduction without a payment

- Hosted health is mainnet/payment-ready. All 16 public previews pass. BSV Desktop 3.3.1 is running, with its JSON endpoints listening on local ports 3321 and 2121.
- A first local HTTP version probe took about 1.25 seconds; subsequent version/authentication probes succeeded faster. SDK 2.8.11 discovery uses one-second fast-substrate deadlines. Cold discovery is a possible intermittent contributor, not an established explanation of the owner's original error.
- The shared production browser successfully connects to the existing Desktop identity: authentication, identity-key lookup, version and mainnet checks return successfully. No permission or payment is approved.
- Reopening the already-owned Holmes book invokes the read-only resume path. Native `createHmac` and identity lookup succeed. Hosted `/.well-known/auth` returns HTTP 200 with an initial response in about 703 ms. Native `verifyHmac` returns `valid: true` in about 15 ms.
- Native **`verifySignature` remains pending**; the page cannot finish authenticated receipt/bookmark loading. A later response is HTTP **503**, code **`WALLET_BRIDGE_UNAVAILABLE`**, after about 58.8 seconds. The page reports its saved place unavailable while retaining the 74-sat local receipt total. The response was observed during attempted normal wallet shutdown; it does not by itself establish why the bridge originally stalled.
- Wallet UI inspection shows the existing app Spending view and no visible approval dialog. No wallet settings or grants are changed. Normal File → Exit attempts did not establish a successful full process restart. The owner has been asked to fully quit/reopen the existing wallet; authentication dialogs, if any, remain for the owner.

## Next verification

After the wallet is ready, retry only Continue reading for an owned page. Confirm native signature verification returns, authenticated bookmark/receipt requests finish, owned text appears and the total remains 74 sats. Do not open an unowned page, reset/re-import a wallet, revoke a grant or create a payment. A successful restart would be recovery, not proof of permanent prevention. Keep this issue open until the owned-page resume works; retain a recurrence as a wallet bridge defect requiring further investigation.

No app source or native wallet source was changed for this investigation. Temporary browser instrumentation records operation paths, durations, statuses and verification booleans only; no key material, signatures, proofs or request payloads are exported.
