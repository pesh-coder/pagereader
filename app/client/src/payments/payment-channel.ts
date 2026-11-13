// Unidirectional (Spilman-style) payment channel for metered page reads.
// Shared by the reader client and the receiver; both rebuild identical states.
//
// One funding transaction locks `capacity` sats into a 2-of-2 output
// (`<reader> CHECKSIGVERIFY <server> CHECKSIG`; plain CHECKSIGs avoid relying
// on bare-multisig relay policy). Before funding is sent the
// server signs a time-locked refund, so the reader can always recover funds.
// Each paid page is one reader signature over a *final* spend that pays the
// server a larger cumulative amount. The server verifies that signature
// locally and keeps only the latest one; it broadcasts a single settlement
// when reading stops. No per-page createAction, broadcast or internalizeAction.
//
// Keys come from BRC-42 derivation via BRC-100 getPublicKey/createSignature,
// the same `createSignature({ data: sha256(preimage) })` pattern the SDK's own
// PushDrop.unlock uses, so any BRC-100 wallet can sign without new wallet APIs.
import {
  Hash, LockingScript, P2PKH, PublicKey, Signature, Spend, Transaction, TransactionSignature, UnlockingScript,
  type WalletInterface, type WalletProtocol,
} from '@bsv/sdk'

export const CHANNEL_PROTOCOL: WalletProtocol = [2, 'pagestream channel']
/** BRC-29 payment derivation, so either wallet can later internalize its output. */
export const PAYMENT_PROTOCOL: WalletProtocol = [2, '3241645161d8']
const SCOPE = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID
const FINAL = 0xffffffff
/** Only BRC-100 createSignature is needed; any BRC-100 wallet satisfies this. */
export type ChannelSigner = Pick<WalletInterface, 'createSignature'>
// A non-final sequence is required for nLockTime to apply to the refund.
const REFUND_SEQUENCE = 0xfffffffe

export interface ChannelTerms {
  /** BRC-42 keyID; unique per channel so keys are never reused. */
  channelId: string
  fundingTxid: string
  fundingVout: number
  capacity: number
  readerKey: string
  serverKey: string
  /** Hex locking scripts for the reader's change and the server's payout. */
  readerScript: string
  serverScript: string
  price: number
  /** Fixed miner fee carried by every state and the refund (reader-funded). */
  settlementFee: number
  refundLockTime: number
}

/** P2PKH to this wallet's own BRC-29 key for `prefix suffix` with `counterparty`. */
export async function selfPaymentScript(wallet: Pick<WalletInterface, 'getPublicKey'>, prefix: string, suffix: string, counterparty: string) {
  const { publicKey } = await wallet.getPublicKey({ protocolID: PAYMENT_PROTOCOL, keyID: `${prefix} ${suffix}`, counterparty, forSelf: true })
  return new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex()
}

/** This wallet's channel key and the key the counterparty will sign with. */
export async function channelKeys(wallet: Pick<WalletInterface, 'getPublicKey'>, channelId: string, counterparty: string) {
  const derive = async (forSelf: boolean) =>
    (await wallet.getPublicKey({ protocolID: CHANNEL_PROTOCOL, keyID: channelId, counterparty, forSelf })).publicKey
  return { own: await derive(true), counterparty: await derive(false) }
}

const isSats = (value: number) => Number.isSafeInteger(value) && value >= 0

export function validateTerms(terms: ChannelTerms): ChannelTerms {
  if (!/^[0-9a-f]{64}$/.test(terms.fundingTxid)) throw new Error('Invalid funding txid')
  if (!Number.isSafeInteger(terms.fundingVout) || terms.fundingVout < 0) throw new Error('Invalid funding output')
  if (!isSats(terms.price) || terms.price < 1) throw new Error('Invalid page price')
  if (!isSats(terms.settlementFee) || !isSats(terms.capacity) || terms.capacity <= terms.settlementFee + terms.price) {
    throw new Error('Channel capacity cannot pay one page and the settlement fee')
  }
  if (!Number.isSafeInteger(terms.refundLockTime) || terms.refundLockTime <= 0 || terms.refundLockTime > FINAL) {
    throw new Error('Invalid refund lock time')
  }
  if (terms.readerKey === terms.serverKey) throw new Error('Channel keys must differ')
  PublicKey.fromString(terms.readerKey); PublicKey.fromString(terms.serverKey)
  return terms
}

export const fundingScript = (readerKey: string, serverKey: string) =>
  LockingScript.fromASM(`${readerKey} OP_CHECKSIGVERIFY ${serverKey} OP_CHECKSIG`)

export const maxPaid = (terms: ChannelTerms) =>
  Math.floor((terms.capacity - terms.settlementFee) / terms.price) * terms.price

function spendOf(terms: ChannelTerms, outputs: { satoshis: number, script: string }[], sequence: number, lockTime: number) {
  return new Transaction(1, [{
    sourceTXID: terms.fundingTxid, sourceOutputIndex: terms.fundingVout, sequence,
    unlockingScript: new UnlockingScript(),
  }], outputs.filter(o => o.satoshis > 0).map(o => ({ satoshis: o.satoshis, lockingScript: LockingScript.fromHex(o.script) })), lockTime)
}

/** Deterministic state for a cumulative payment; both sides rebuild it. */
export function stateTransaction(terms: ChannelTerms, paid: number) {
  if (!isSats(paid) || paid % terms.price !== 0 || paid > maxPaid(terms)) throw new Error('Invalid channel payment')
  return spendOf(terms, [
    { satoshis: paid, script: terms.serverScript },
    { satoshis: terms.capacity - terms.settlementFee - paid, script: terms.readerScript },
  ], FINAL, 0)
}

export function refundTransaction(terms: ChannelTerms) {
  return spendOf(terms, [{ satoshis: terms.capacity - terms.settlementFee, script: terms.readerScript }],
    REFUND_SEQUENCE, terms.refundLockTime)
}

/** sha256(preimage); the signer hashes once more, giving the Bitcoin sighash. */
/** sha256(preimage) for the channel input at `inputIndex` (other inputs, e.g. a wallet's, may follow). */
export function sighashInput(terms: ChannelTerms, tx: Transaction, inputIndex = 0) {
  return Hash.sha256(TransactionSignature.format({
    sourceTXID: terms.fundingTxid, sourceOutputIndex: terms.fundingVout, sourceSatoshis: terms.capacity,
    transactionVersion: tx.version, otherInputs: [], allInputs: tx.inputs, outputs: tx.outputs, inputIndex,
    subscript: fundingScript(terms.readerKey, terms.serverKey), inputSequence: tx.inputs[inputIndex].sequence!,
    lockTime: tx.lockTime, scope: SCOPE,
  }))
}

export async function signChannelHash(wallet: ChannelSigner, terms: ChannelTerms, hash: number[], counterparty: string) {
  const { signature } = await wallet.createSignature({ data: hash, protocolID: CHANNEL_PROTOCOL, keyID: terms.channelId, counterparty })
  return signature
}

export const signChannel = (wallet: ChannelSigner, terms: ChannelTerms, tx: Transaction, counterparty: string) =>
  signChannelHash(wallet, terms, sighashInput(terms, tx), counterparty)

export function verifyChannelHash(key: string, hash: number[], der: number[]) {
  try {
    const signature = Signature.fromDER(der)
    // Miners require low-S; a high-S signature would make settlement non-standard.
    if (signature.s.toString(16, 64) > HALF_ORDER) return false
    return PublicKey.fromString(key).verify(hash, signature)
  } catch { return false }
}

export const verifyChannel = (terms: ChannelTerms, tx: Transaction, key: string, der: number[]) =>
  verifyChannelHash(key, sighashInput(terms, tx), der)

/**
 * A top-up moves a balance into a new one in one transaction: it spends the
 * current channel output, pays the server what was already signed for, and
 * locks the new balance; the reader's wallet adds the rest and any change.
 * Checks that shape (bytes in, so either SDK copy can call it) and returns the
 * channel input's position and its sighash input.
 */
export function checkTopUp(parent: ChannelTerms, beef: number[] | Uint8Array, expect: {
  paid: number; payoutScript: string; balanceScript: string; balanceSats: number
}) {
  const tx = Transaction.fromAtomicBEEF(Array.from(beef))
  const outpoint = (input: Transaction['inputs'][number]) => input.sourceTXID ?? input.sourceTransaction?.id('hex')
  const inputIndex = tx.inputs.findIndex(input => outpoint(input) === parent.fundingTxid && input.sourceOutputIndex === parent.fundingVout)
  if (inputIndex < 0 || tx.inputs.filter(input => outpoint(input) === parent.fundingTxid && input.sourceOutputIndex === parent.fundingVout).length !== 1)
    throw new Error('Top-up does not spend the current balance exactly once')
  const balance = tx.outputs.filter(o => o.lockingScript.toHex() === expect.balanceScript)
  if (balance.length !== 1 || balance[0].satoshis !== expect.balanceSats) throw new Error('Top-up does not lock the agreed balance')
  const payout = tx.outputs.filter(o => o.lockingScript.toHex() === expect.payoutScript)
  if (expect.paid > 0 ? payout.length !== 1 || payout[0].satoshis !== expect.paid : payout.length !== 0)
    throw new Error('Top-up does not pay for the pages already read')
  return {
    inputIndex, sighash: sighashInput(parent, tx, inputIndex), txid: tx.id('hex'),
    balanceVout: tx.outputs.findIndex(o => o.lockingScript.toHex() === expect.balanceScript),
    payoutVout: tx.outputs.findIndex(o => o.lockingScript.toHex() === expect.payoutScript),
  }
}

// secp256k1 order / 2, as 64 lowercase hex digits for equal-length comparison.
const HALF_ORDER = '7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0'

export function channelUnlock(readerDer: number[], serverDer: number[]) {
  const push = (der: number[]) => {
    const sig = Signature.fromDER(der)
    const data = new TransactionSignature(sig.r, sig.s, SCOPE).toChecksigFormat()
    return { op: data.length, data }
  }
  // The reader's signature is on top, consumed by the first CHECKSIGVERIFY.
  return new UnlockingScript([push(serverDer), push(readerDer)])
}

/** Full script-interpreter check of a fully signed channel spend. */
export function scriptValid(terms: ChannelTerms, tx: Transaction, inputIndex = 0) {
  try {
    return new Spend({
      sourceTXID: terms.fundingTxid, sourceOutputIndex: terms.fundingVout, sourceSatoshis: terms.capacity,
      lockingScript: fundingScript(terms.readerKey, terms.serverKey), transactionVersion: tx.version,
      otherInputs: tx.inputs.filter((_, index) => index !== inputIndex).map(input => ({
        sourceTXID: input.sourceTXID ?? input.sourceTransaction!.id('hex'), sourceOutputIndex: input.sourceOutputIndex, sequence: input.sequence!,
      })),
      outputs: tx.outputs, inputIndex, unlockingScript: tx.inputs[inputIndex].unlockingScript!,
      inputSequence: tx.inputs[inputIndex].sequence!, lockTime: tx.lockTime,
    }).validate()
  } catch { return false }
}

/**
 * Fully signed settlement as Atomic BEEF, with the funding transaction and its
 * proofs included, after a full script check. Bytes in and out, so callers
 * using another copy of the SDK never mix transaction objects.
 */
export function settlementBeef(terms: ChannelTerms, paid: number, readerDer: number[], serverDer: number[], fundingBeef: number[]) {
  const tx = stateTransaction(terms, paid)
  tx.inputs[0].sourceTransaction = Transaction.fromAtomicBEEF(fundingBeef)
  tx.inputs[0].unlockingScript = channelUnlock(readerDer, serverDer)
  if (!scriptValid(terms, tx)) throw new Error('Settlement failed script validation')
  return { beef: tx.toAtomicBEEF(), txid: tx.id('hex') }
}

export const settlementValid = (terms: ChannelTerms, beef: number[], inputIndex = 0) =>
  scriptValid(terms, Transaction.fromAtomicBEEF(beef), inputIndex)

/**
 * Server-side channel ledger. O(1) time and O(1) space per accepted page:
 * rebuild the deterministic state, check monotonic cumulative payment, verify
 * one ECDSA signature and keep only the latest signature.
 */
export class ChannelReceiver {
  paid = 0
  latest?: number[]
  readonly terms: ChannelTerms
  constructor(terms: ChannelTerms) { this.terms = validateTerms(terms) }

  get pages() { return this.paid / this.terms.price }

  /** Accept exactly the next page's cumulative state; replays of the latest are idempotent. */
  accept(paid: number, readerDer: number[]) {
    if (paid === this.paid && this.latest && sameBytes(readerDer, this.latest)) return this.pages
    if (paid !== this.paid + this.terms.price) throw new Error('Channel payment must add exactly one page')
    if (paid > maxPaid(this.terms)) throw new Error('Channel capacity exhausted')
    if (!verifyChannel(this.terms, stateTransaction(this.terms, paid), this.terms.readerKey, readerDer)) {
      throw new Error('Invalid channel signature')
    }
    this.paid = paid; this.latest = [...readerDer]
    return this.pages
  }

  /** Close: countersign the latest state. Returns a broadcastable transaction. */
  async settle(serverWallet: ChannelSigner, readerIdentity: string) {
    if (!this.latest) throw new Error('Nothing to settle')
    const tx = stateTransaction(this.terms, this.paid)
    tx.inputs[0].unlockingScript = channelUnlock(this.latest, await signChannel(serverWallet, this.terms, tx, readerIdentity))
    if (!scriptValid(this.terms, tx)) throw new Error('Settlement failed script validation')
    return tx
  }
}

const sameBytes = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => value === b[index])
