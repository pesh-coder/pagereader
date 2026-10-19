import { Transaction, Utils } from '@bsv/sdk'
import type { DatabaseSync } from 'node:sqlite'
import { networkFee } from './payment-cost.js'

interface PublicTransaction { txid: string; transactionHex: string; parentTxid: string; parentHex: string }
export interface ReceiptCost { txid: string; page: number; sats: number; feeSats: number; source: string }

function checkedFee(transaction: Transaction, txid: string, price: number) {
  if (transaction.id('hex') !== txid || transaction.outputs[0]?.satoshis !== price) throw new Error('Cost evidence does not match the existing receipt transaction/price')
  return networkFee(transaction)
}

// Offline repair of existing cost metadata only. Never calls a wallet, creates
// an intent, accepts a payment, or guesses fees from the price/net debit.
export function receiptCostPlan(db: DatabaseSync, publicTransactions: PublicTransaction[] = []) {
  const hasCosts = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchase_costs'").get())
  const rows = db.prepare(`SELECT p.txid,p.page,p.sats,pp.proof,${hasCosts ? 'c.fee_sats' : 'NULL AS fee_sats'} FROM purchases p
    LEFT JOIN payment_proofs pp ON pp.txid=p.txid AND pp.identity=p.identity AND pp.edition=p.edition AND pp.page=p.page
    ${hasCosts ? 'LEFT JOIN purchase_costs c ON c.txid=p.txid' : ''} ORDER BY p.txid`).all()
  const costs: ReceiptCost[] = [], unknown: string[] = []
  for (const row of rows) {
    const txid = String(row.txid), sats = Number(row.sats)
    let feeSats: number | null = null, source = ''
    if (row.proof) {
      const proof = JSON.parse(String(row.proof))
      feeSats = checkedFee(Transaction.fromAtomicBEEF(Utils.toArray(proof.transaction, 'base64')), txid, sats)
      source = 'stored-payment-proof'
    }
    for (const evidence of publicTransactions.filter(item => item.txid === txid)) {
      const transaction = Transaction.fromHex(evidence.transactionHex), parent = Transaction.fromHex(evidence.parentHex)
      if (parent.id('hex') !== evidence.parentTxid || !transaction.inputs.some(input => input.sourceTXID === evidence.parentTxid)) throw new Error('Recorded parent does not match the transaction')
      for (const input of transaction.inputs) if (input.sourceTXID === evidence.parentTxid) input.sourceTransaction = parent
      const measured = checkedFee(transaction, txid, sats)
      if (feeSats !== null && measured !== null && feeSats !== measured) throw new Error('Conflicting transaction fee evidence')
      if (measured !== null && feeSats === null) { feeSats = measured; source = 'recorded-public-transaction' }
    }
    if (feeSats === null) { unknown.push(txid); continue }
    if (row.fee_sats !== null && row.fee_sats !== feeSats) throw new Error('Calculated fee conflicts with saved receipt costs')
    costs.push({ txid, page: Number(row.page), sats, feeSats, source })
  }
  return { costs, unknown }
}
