import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Store } from '../src/store.js'
import { receiptCostPlan } from '../src/receipt-costs.js'

// Default is read-only. --apply adds verified costs, never replaces receipts,
// resets intents, copies keys, accesses a wallet, or spends.
const args = process.argv.slice(2), apply = args.includes('--apply')
const directory = resolve(process.env.PAGESTREAM_STATE_DIR ?? 'data')
if (!existsSync(join(directory, 'PAID_REQUESTS_PAUSED')) || existsSync(join(directory, 'LIVE_PAYMENT_PROBE.json'))) throw new Error('Purchase pause and no live permit required')
const database = join(directory, 'spike.sqlite')
if (!existsSync(database)) throw new Error('Existing ledger required')
const recorded = args.filter(arg => arg !== '--apply').map(path => JSON.parse(readFileSync(path, 'utf8')))
const db = new DatabaseSync(database, { readOnly: true })
let plan
try { plan = receiptCostPlan(db, recorded) } finally { db.close() }
let inserted = 0
if (apply) {
  const store = new Store(database)
  try {
    store.db.exec('BEGIN IMMEDIATE')
    try {
      // Re-evaluate under the write lock before applying the exact same repair.
      const current = receiptCostPlan(store.db, recorded)
      if (JSON.stringify(current) !== JSON.stringify(plan)) throw new Error('Receipt evidence changed; no repair applied')
      for (const cost of current.costs) if (store.recordFee(cost.txid, cost.feeSats, cost.source)) inserted++
      store.db.exec('COMMIT')
    } catch (error) { store.db.exec('ROLLBACK'); throw error }
  } finally { store.close() }
}
console.log(JSON.stringify({ mode: apply ? 'APPLIED_COST_METADATA_ONLY' : 'READ_ONLY_COST_PLAN', inserted, ...plan, walletCalls: 0, newPayments: 0 }, null, 2))
