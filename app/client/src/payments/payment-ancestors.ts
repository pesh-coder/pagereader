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
  // Recent page proofs usually overlap. A larger retained proof often supplies
  // several earlier subjects, so avoid parsing/merging each full chain again.
  // This is a greedy heuristic, not a minimum-proof-cover guarantee. Keep the
  // same complete-proof validation and repair incomplete legacy graphs below.
  const skipped: number[][] = []
  const fullSubjects = new Set(beef.txs.filter(tx => !tx.isTxidOnly).map(tx => tx.txid))
  const ordered = [...ancestors].sort((a, b) => b[1].length - a[1].length)
  for (let index = 0; index < ordered.length; index++) {
    const [id, source] = ordered[index]
    if (fullSubjects.has(id)) skipped.push(source)
    else {
      beef.mergeBeef(source)
      // This call-local index avoids repeated public findTxid mutation scans.
      for (const tx of beef.txs) if (!tx.isTxidOnly) fullSubjects.add(tx.txid)
      if (index === 0 && !ordered.slice(1).some(([next]) => fullSubjects.has(next))) {
        // Disjoint funding branches gain nothing from repeated coverage scans.
        for (const [, remaining] of ordered.slice(1)) beef.mergeBeef(remaining)
        break
      }
    }
  }
  let complete = beef.toBinaryAtomic(txid)
  let valid = Beef.fromBinaryStrict(complete).isValid(false)
  if (skipped.length && !valid) {
    // A full transaction can still lack an input/proof. Restore skipped sources
    // before rejecting rather than assuming a full subject means a full graph.
    for (const source of skipped) beef.mergeBeef(source)
    complete = beef.toBinaryAtomic(txid)
    valid = Beef.fromBinaryStrict(complete).isValid(false)
  }
  if (!valid) throw new Error('Payment contains an unresolved ancestor')
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
