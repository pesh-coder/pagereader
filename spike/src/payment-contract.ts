import { P2PKH, PublicKey, Transaction, type WalletInterface } from "@bsv/sdk";
import type { Store } from "./store.js";

export interface PaymentBinding {
  identity: string;
  edition: string;
  page: number;
  txid: string;
}

// The middleware adapter calls this before invoking the receiving wallet, on
// initial submission and recovery alike. A known txid alone is insufficient.
export async function assertBoundPayment(
  wallet: WalletInterface,
  store: Store,
  binding: PaymentBinding,
  args: Parameters<WalletInterface["internalizeAction"]>[0],
) {
  const tx = Transaction.fromAtomicBEEF(args.tx);
  const remittance = args.outputs[0]?.paymentRemittance;
  const intent = store.intent(binding.identity, binding.edition, binding.page);
  const saved = store.proof(binding.txid);
  if (
    args.outputs.length !== 1 ||
    args.outputs[0].outputIndex !== 0 ||
    args.outputs[0].protocol !== "wallet payment" ||
    !remittance ||
    tx.id("hex") !== binding.txid ||
    !intent ||
    intent.txid !== binding.txid ||
    intent.prefix !== remittance.derivationPrefix ||
    remittance.senderIdentityKey !== binding.identity ||
    !saved ||
    saved.identity !== binding.identity ||
    saved.edition !== binding.edition ||
    saved.page !== binding.page
  )
    throw new Error("Payment binding mismatch");
  const proof = JSON.parse(saved.proof);
  if (
    proof.derivationPrefix !== remittance.derivationPrefix ||
    proof.derivationSuffix !== remittance.derivationSuffix
  )
    throw new Error("Payment remittance changed");
  const { publicKey } = await wallet.getPublicKey({
    protocolID: [2, "3241645161d8"],
    keyID: `${remittance.derivationPrefix} ${remittance.derivationSuffix}`,
    counterparty: binding.identity,
    forSelf: true,
  });
  const script = new P2PKH()
    .lock(PublicKey.fromString(publicKey).toAddress())
    .toHex();
  if (tx.outputs[0]?.lockingScript.toHex() !== script)
    throw new Error("Payment output does not belong to this receiver");
  return { tx, prefix: remittance.derivationPrefix };
}
