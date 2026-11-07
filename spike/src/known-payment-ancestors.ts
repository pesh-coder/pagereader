import { Beef, Transaction, Utils } from '@bsv/sdk'
import type { Store } from './store.js'

export function retainedPaymentAncestors(store: Store, identity: string): { txid: string; transaction: string }[] {
  const rows = store.db.prepare(`SELECT p.txid, f.proof FROM purchases p
    JOIN payment_proofs f ON f.txid=p.txid AND f.identity=p.identity
    WHERE p.identity=? ORDER BY p.rowid DESC LIMIT 8`).all(identity)
  const retained: { txid: string; transaction: string }[] = []
  let bytes = 0
  for (const row of rows) {
    try {
      const proof = JSON.parse(String(row.proof))
      const raw = Utils.toArray(proof.transaction, 'base64')
      if (!/^[a-f0-9]{64}$/.test(String(row.txid)) || !Beef.fromBinaryStrict(raw).isValid(false)) continue
      if (Transaction.fromAtomicBEEF(raw).id('hex') === row.txid && bytes + proof.transaction.length <= 512 * 1024) {
        retained.push({ txid: String(row.txid), transaction: proof.transaction }); bytes += proof.transaction.length
      }
    } catch { /* A receipt without resolvable proof must never become a hint. */ }
  }
  return retained
}

export function knownPaymentAncestors(store: Store, identity: string): string | undefined {
  const ids = retainedPaymentAncestors(store, identity).map(tx => tx.txid)
  return ids.length ? ids.join(',') : undefined
}

// Resolve BRC-96 references solely from this caller's durable accepted proofs.
// The wallet still receives and validates a complete Atomic BEEF.
export function restorePaymentAncestors(store: Store, identity: string, header: string): string {
  const payment = JSON.parse(header)
  const beef = Beef.fromBinaryStrict(Utils.toArray(payment.transaction, 'base64'))
  const txid = beef.atomicTxid
  if (!txid || beef.findTxid(txid)?.isTxidOnly || !beef.isAtomic(txid)) throw new Error('Invalid atomic payment')
  const missing = beef.txs.filter(tx => tx.isTxidOnly).map(tx => tx.txid)
  if (!missing.length) return header
  if (missing.length > 32) throw new Error('Too many omitted ancestors')
  for (const id of missing) {
    const row = store.db.prepare(`SELECT f.proof FROM purchases p JOIN payment_proofs f
      ON f.txid=p.txid AND f.identity=p.identity WHERE p.identity=? AND p.txid=?`).get(identity, id)
    if (!row) throw new Error('Unresolvable payment ancestor')
    const source = Utils.toArray(JSON.parse(String(row.proof)).transaction, 'base64')
    if (!Beef.fromBinaryStrict(source).isValid(false) || Transaction.fromAtomicBEEF(source).id('hex') !== id)
      throw new Error('Invalid retained payment ancestor')
    beef.mergeBeef(source)
  }
  const raw = beef.toBinaryAtomic(txid)
  if (raw.length > 16 * 1024 * 1024 || !Beef.fromBinaryStrict(raw).isValid(false) || Transaction.fromAtomicBEEF(raw).id('hex') !== txid)
    throw new Error('Unresolved payment ancestry')
  return JSON.stringify({ ...payment, transaction: Utils.toBase64(raw) })
}
