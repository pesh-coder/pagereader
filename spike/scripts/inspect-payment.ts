// Existing proof + public HTTP GETs only. No .env, wallet, broadcast or DB writes.
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { Transaction, Utils } from '@bsv/sdk'
import { networkFee } from '../src/payment-cost.js'

export function paymentGraph(transaction: Transaction, expectedTxid: string) {
  if (transaction.id('hex') !== expectedTxid) throw new Error('Stored proof TXID mismatch')
  const pending = [transaction], seen = new Set<string>()
  const transactions: {
    txid: string; bytes: number; feeSats: number | null;
    embeddedProofHeight: number | null;
    inputs: { txid: string; output: number; embedded: boolean }[]
  }[] = []
  while (pending.length) {
    const tx = pending.shift()!, txid = tx.id('hex')
    if (seen.has(txid)) continue
    if (seen.size >= 100) throw new Error('Proof exceeds 100-transaction diagnostic limit')
    seen.add(txid)
    const inputs = tx.inputs.map(input => {
      const parent = input.sourceTransaction
      const id = input.sourceTXID ?? parent?.id('hex')
      if (!id || (parent && parent.id('hex') !== id)) throw new Error('Missing or mismatched parent TXID')
      if (parent) pending.push(parent)
      return { txid: id, output: input.sourceOutputIndex, embedded: Boolean(parent) }
    })
    transactions.push({ txid, bytes: tx.toBinary().length, feeSats: networkFee(tx),
      embeddedProofHeight: tx.merklePath?.blockHeight ?? null, inputs })
  }
  return transactions
}

export async function inspectPayment(dbPath: string, txid: string) {
  if (!/^[a-f0-9]{64}$/.test(txid)) throw new Error('Supply an existing public TXID')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  let row
  try {
    row = db.prepare('SELECT proof FROM payment_proofs WHERE txid=?').get(txid)
  } finally { db.close() }
  if (!row) throw new Error('Original payment proof is absent from this database; do not replace the payment')
  return inspectProof(String(row.proof), txid)
}

export async function inspectProof(savedProof: string, txid: string) {
  if (!/^[a-f0-9]{64}$/.test(txid)) throw new Error('Supply an existing public TXID')
  const proof = JSON.parse(savedProof)
  const graph = paymentGraph(Transaction.fromAtomicBEEF(Utils.toArray(proof.transaction, 'base64')), txid)
  const ids = [...new Set(graph.flatMap(tx => [tx.txid, ...tx.inputs.map(input => input.txid)]))]
  if (ids.length > 100) throw new Error('Too many parents for a bounded diagnostic run')
  const get = async (url: string) => {
    try {
      const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
      const body = res.ok ? await res.json() as Record<string, unknown> : undefined
      return { http: res.status, ...(body ? {
        // Selected public fields only: no raw tx, addresses, keys or remittance.
        ...(typeof body.confirmations === 'number' ? { confirmations: body.confirmations } : {}),
        ...(typeof body.blockhash === 'string' ? { blockhash: body.blockhash } : {}),
        ...(typeof body.blocks === 'number' ? { tipHeight: body.blocks } : {}),
        ...(typeof body.txStatus === 'string' ? { processorStatus: body.txStatus } : {}),
      } : {}) }
    } catch { return { error: 'Lookup unavailable; absence is not established' } }
  }
  const base = 'https://api.whatsonchain.com/v1/bsv/main'
  const control = await get(`${base}/chain/info`)
  const lookups = []
  for (const id of ids) {
    const [whatsonchain, bananaBlocks, arcade] = await Promise.all([
      get(`${base}/tx/hash/${id}`),
      get(`https://bananablocks.com/api/v1/bsv/main/tx/hash/${id}`),
      get(`https://arcade-v2-us-1.bsvblockchain.tech/tx/${id}`),
    ])
    lookups.push({ txid: id, whatsonchain, bananaBlocks, arcade })
  }
  const processor = await get(`https://arc.gorillapool.io/v1/tx/${txid}`)
  return { at: new Date().toISOString(), txid, mode: 'read-only', control, graph, lookups, processor,
    note: 'Embedded proofs are not independently verified here. A lookup 404 does not prove global absence. No transaction was submitted.' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const fromProof = args[0] === '--proof'
  const [path, txid] = fromProof ? args.slice(1) : args
  if (!path || !txid) throw new Error('Usage: node --import tsx scripts/inspect-payment.ts [--proof] <existing.sqlite|saved-proof.json> <txid>')
  console.log(JSON.stringify(await (fromProof
    ? inspectProof(readFileSync(path, 'utf8'), txid)
    : inspectPayment(path, txid)), null, 2))
}
