## Problem

In a pay-per-page reader POC (Pagestream), BSV Browser 1.6.3 quotes a **23-sat miner fee for a 5-sat BRC-29 page payment: 28 sats total**. The same app previously paid **5 + 1 = 6 sats** through BSV Desktop after its fee rate was explicitly lowered to 1 sat/kB.

The reader should be able to approve a clear wallet spending allowance and continue reading without learning fee-rate settings. A suitable micropayment default is preferable to requiring every reader to tune their wallet. An advanced fee-rate override, similar to Desktop's, would also be useful.

## Observed behavior

1. Open the reader in BSV Browser 1.6.3 on Android and read the free previews.
2. Request page 3, requiring a 5-sat BRC-29 output through the BRC-100 wallet interface.
3. The unsigned/noSend transaction has a calculated miner fee of 23 sats. Pagestream's initial 1-sat fee cap cancels that unsigned action before signing or broadcasting.
4. With an explicit one-page approval for up to 28 sats, the user reports page 3 opens and the reader shows 28 sats spent.
5. Page 4 quotes another 23-sat fee. This is a per-transaction cost, not a one-time setup cost.

Wallet-debit/receipt reconciliation remains pending. Permission-grant costs are separate. We have not tested Browser 1.8.0 on the phone, and this report does not claim the two wallets build byte-identical transactions.

## Source investigation

- Browser 1.6.3 depends on `@bsv/expo-wallet-toolbox` ^0.10.0. The [published 0.10.0 WalletContext](https://unpkg.com/@bsv/expo-wallet-toolbox@0.10.0/core/context/WalletContext.tsx) initializes local storage with `feeModel: { model: 'sat/kb', value: 100 }`.
- [Browser 1.8.0](https://github.com/bsv-blockchain/bsv-browser/releases/tag/v1.8.0) upgrades the package to 0.19.0, whose [pinned source](https://github.com/bsv-blockchain/bsv-wallet/blob/f88bad8197322bc72a68b7b5c53b743466f8a17f/packages/expo-wallet-toolbox/core/context/WalletContext.tsx) retains that rate. Published 0.21.0 also retains it. These newer versions were inspected in source, not tested on the device.
- No adjustable fee-rate control was found in the inspected wallet configuration screen. Pagestream uses SDK 2.8.11; its `CreateActionOptions` exposes no fee-rate override.
- Desktop has an existing reference for [policy-validated fee settings](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.3.1/electron/feeSettings.ts) and a [settings UI](https://github.com/bsv-blockchain/bsv-desktop/blob/v3.3.1/src/lib/pages/Dashboard/Settings/FeeSettings.tsx).

## Requested behavior / question

What is the supported way for Browser users to obtain policy-appropriate micropayment fees without a custom wallet build or per-reader configuration?

Could the shared wallet package provide a suitable policy-aware default and/or expose a validated fee-rate setting? An override should respect the selected processor's current advertised minimum, persist per device/network, apply consistently to storage and the monitor, and preserve wallet identity/data. Already-created transactions should not be repriced.

We are **not** requesting an unconditional hard-coded 1 sat/kB rate: the permitted rate depends on current processor policy, transaction size and any package requirements. The desired outcome is transparent, suitable fees for ordinary micropayment users, with the actual debit shown accurately.
