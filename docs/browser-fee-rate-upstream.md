# BSV Browser: configurable transaction fee rate

Submitted 2026-10-29 as [BSV Browser issue #176](https://github.com/bsv-blockchain/bsv-browser/issues/176). Awaiting maintainer response. The installed wallet has not been modified. The [submitted issue body](browser-fee-rate-issue-body.md) excludes the local planning notes formerly in this file.

## Submitted title

Policy-appropriate micropayment fees: a 5-sat page quotes a 23-sat miner fee

## Problem and reproduction

Pagestream requests a 5-sat BRC-29 output through the BRC-100 wallet interface. BSV Browser 1.6.3 returned a known 23-sat miner fee, for a total of 28 sats per page. The user reports page 3 opened after explicitly approving that total; the reader shows 28 sats spent. Page 4 returns the same fee quote. Full wallet/receipt reconciliation remains pending.

BSV Desktop, configured to 1 sat/kB through its supported settings, previously produced a 1-sat fee for comparable page payments: 6 sats total. A lower rate is not assumed to guarantee inclusion; the wallet should validate it against its configured processor's current policy.

The Browser's wallet configuration screen does not expose a fee-rate control in the inspected package. Changing a website's fee cap only permits a more expensive transaction; it cannot change the wallet's fee model.

## Verified source

- Browser 1.6.3 uses `@bsv/expo-wallet-toolbox` ^0.10.0. The [published 0.10.0 WalletContext](https://unpkg.com/@bsv/expo-wallet-toolbox@0.10.0/core/context/WalletContext.tsx) creates local storage with `feeModel: { model: 'sat/kb', value: 100 }`.
- [Browser 1.8.0 release notes](https://github.com/bsv-blockchain/bsv-browser/releases/tag/v1.8.0) upgrade the package to 0.19.0. Its [pinned source](https://github.com/bsv-blockchain/bsv-wallet/blob/f88bad8197322bc72a68b7b5c53b743466f8a17f/packages/expo-wallet-toolbox/core/context/WalletContext.tsx) retains the same hard-coded rate. Updating Browser alone is not a verified solution.
- Published package 0.21.0, source commit `80627be4b2eefd29cf99743f082aee856e79f5a0`, also retains 100 sat/kB. This is source inspection, not an installed-device observation.
- Pagestream's pinned SDK 2.8.11 `CreateActionOptions` has no fee-rate override. The website cannot request a lower storage fee model through that interface.
- Desktop already has a useful reference: [fee settings](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.3.1/electron/feeSettings.ts), [UI](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.3.1/src/lib/pages/Dashboard/Settings/FeeSettings.tsx), and [tests](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.3.1/test/feeSettings.test.ts).

## Requested wallet change

Expose Transaction fees in the shared wallet configuration UI, so Browser can use it without a custom app build. Show the current rate in sats per 1,000 bytes and the selected processor's advertised minimum. Persist a validated override per device and network; apply it consistently to transaction storage and the monitor. Clearly state whether a restart is required. Existing transactions must not be repriced.

Keep the existing default as a fallback rather than replacing 100 with an unconditional 1. Saving a lower custom rate should require a fresh successful processor-policy check, reject invalid/non-finite values or values below the advertised floor, and fail visibly if the policy cannot be fetched. Reset-to-default should remain available. Wallet backups/identities must be preserved; no migration or key re-import should be necessary.

## Acceptance

1. The supported Browser build exposes and persists the setting without replacing the wallet identity or transaction database.
2. Policy validation, malformed responses, offline behavior, reset, network isolation, storage/monitor consistency and restart behavior have automated coverage.
3. Where the live processor advertises a 1-sat/kB floor, a small single-input page transaction can be quoted near 1 sat rather than 23 sats. Exact cost still depends on transaction size and any package requirements.
4. Test against unsigned/noSend creation first. With explicit operator approval, complete one mainnet page and reconcile the actual page price, miner fee and wallet debit.
5. Run several new paid page turns without Pagestream's higher-fee exception. Measure prompt count and allowance accounting separately; this fee fix does not prove session approval or latency acceptance.

## Tracking and next action

Issue [#176](https://github.com/bsv-blockchain/bsv-browser/issues/176) is open in `bsv-blockchain/bsv-browser`. The requested implementation belongs to the shared `bsv-blockchain/bsv-wallet/packages/expo-wallet-toolbox` package. No wallet code, custom build, key migration or installed-wallet setting was changed as part of submitting it.

Await maintainer guidance on policy-appropriate defaults or a supported fee-rate setting, then verify the recommended official build with an unsigned page quote before a new paid test. Until then, Pagestream's default cap and explicit one-page higher-fee approval remain available; neither lowers the fee. Direct maintainer outreach remains for the user to send.
