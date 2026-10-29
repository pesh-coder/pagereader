import type { WalletInterface } from "@bsv/sdk";
import { assertBoundPayment, type PaymentBinding } from "./payment-contract.js";
import { networkFee } from "./payment-cost.js";
import type { Store } from "./store.js";

export interface RequestTiming {
  start: number;
  internalizeMs: number;
  dbMs: number;
  authStart?: number;
  authMs: number;
  serverWalletMs: number;
  serverWalletCalls: number;
  walletInternalizeMs: number;
  receiptCommitMs: number;
  payment?: PaymentBinding;
  acceptedTxid?: string;
}

// Adapter contract for BRC-105: middleware validates the payment envelope and
// nonce; the receiver verifies BEEF; this adapter binds ownership and reconciles
// an accepted duplicate only to the original durable submission.
export function receivingWallet(
  raw: WalletInterface,
  store: Store,
  context: () => RequestTiming,
  db: <T>(fn: () => T) => T,
): WalletInterface {
  return new Proxy(raw, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (property === "internalizeAction")
        return async (
          ...args: Parameters<WalletInterface["internalizeAction"]>
        ) => {
          const started = performance.now(),
            current = context();
          try {
            if (!current.payment) throw new Error("No bound payment");
            const bound = await assertBoundPayment(
              target,
              store,
              current.payment,
              args[0],
            );
            const callStarted = performance.now();
            let result;
            try {
              result = await target.internalizeAction(...args);
            } finally {
              const ms = performance.now() - callStarted;
              current.serverWalletMs += ms;
              current.walletInternalizeMs += ms;
              current.serverWalletCalls++;
            }
            const accepted = Object.getOwnPropertyDescriptor(
              result,
              "accepted",
            );
            const merge = Object.getOwnPropertyDescriptor(result, "isMerge");
            if (
              accepted?.value !== true ||
              (merge &&
                (!Object.hasOwn(merge, "value") ||
                  typeof merge.value !== "boolean"))
            )
              return result;
            const txid = bound.tx.id("hex");
            const binding = current.payment;
            const commitStarted = performance.now();
            try {
              db(() =>
                store.accepted(
                  binding.identity,
                  binding.edition,
                  binding.page,
                  bound.prefix,
                  txid,
                  bound.tx.outputs[0].satoshis!,
                  networkFee(bound.tx),
                ),
              );
            } finally {
              current.receiptCommitMs += performance.now() - commitStarted;
            }
            current.acceptedTxid = txid;
            // A receiver merge after interrupted persistence is legitimate only
            // after the exact proof/output binding and local commit above succeed.
            return { ...result, isMerge: false };
          } finally {
            current.internalizeMs += performance.now() - started;
          }
        };
      return typeof value === "function"
        ? async (...args: unknown[]) => {
            const started = performance.now();
            try {
              return await value.apply(target, args);
            } finally {
              const current = context();
              current.serverWalletMs += performance.now() - started;
              current.serverWalletCalls++;
            }
          }
        : value;
    },
  });
}
