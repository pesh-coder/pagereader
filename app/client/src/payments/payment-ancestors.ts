import { Beef, BEEF_V2, Transaction } from '@bsv/sdk'

export type AncestorLookup = (txid: string) => number[] | undefined

// The server, never the client ledger, selects the eligible IDs (BRC-105 §5.3).
// Only use hints for which we can retain a complete standalone recovery proof.
export function retainedAncestors(ids: unknown, lookup?: AncestorLookup): Map<string, number[]> {
  const result = new Map<string, number[]>()
  if (!Array.isArray(ids) || !lookup) return result
  for (const id of ids.slice(0, 32)) {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/i.test(id)) continue
    const txid = id.toLowerCase()
    try {
      const raw = lookup(txid)
      if (!raw) continue
      const beef = Beef.fromBinaryStrict(raw)
      if (!beef.isValid(false) || Transaction.fromAtomicBEEF(raw).id('hex') !== txid) continue
      result.set(txid, raw)
    } catch { /* Ignore unavailable/corrupt hints; never assume an ancestor. */ }
  }
  return result
}

// Hints shorten wallet construction, not verification. Restore exact ancestors
// before checking fees, persisting proof or submitting to the receiving wallet.
export function completePaymentProof(raw: number[] | Uint8Array, ancestors: Map<string, number[]>): number[] {
  const beef = Beef.fromBinaryStrict(raw)
  const txid = beef.atomicTxid
  if (!txid || beef.findTxid(txid)?.isTxidOnly) throw new Error('Missing payment transaction')
  if (!ancestors.size) {
    if (beef.txs.some(tx => tx.isTxidOnly)) throw new Error('Payment contains an unresolved ancestor')
    return Array.from(raw)
  }
  for (const source of ancestors.values()) beef.mergeBeef(source)
  const complete = beef.toBinaryAtomic(txid)
  if (!Beef.fromBinaryStrict(complete).isValid(false)) throw new Error('Payment contains an unresolved ancestor')
  if (Transaction.fromAtomicBEEF(complete).id('hex') !== txid) throw new Error('Payment transaction changed')
  return complete
}

export function compactPaymentProof(raw: number[], ids: Iterable<string>): number[] {
  const beef = Beef.fromBinaryStrict(raw)
  const txid = beef.atomicTxid!
  beef.version = BEEF_V2
  for (const id of ids) if (id !== txid && beef.findTxid(id)) beef.makeTxidOnly(id)
  return beef.toBinaryAtomic(txid)
}
