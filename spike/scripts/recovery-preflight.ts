// Public HTTP + read-only SQLite only. Deliberately imports no wallet or .env.
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { config } from '../src/config.js'
import { loadCatalogue } from '../src/content.js'

const origin = new URL(process.argv[2] ?? 'http://localhost:3108')
if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
  (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) {
  throw new Error('Supply an HTTPS origin or local HTTP origin, without credentials/path/query')
}
const publicJson = async (path: string) => {
  const response = await fetch(new URL(path, origin), { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'ngrok-skip-browser-warning': 'pagestream-spike' } })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error(`Public preflight failed at ${path}: HTTP ${response.status} or non-JSON body`)
  return response.json()
}
const [health, catalogue, manifest, free1, free2, library] = await Promise.all([
  publicJson('/health'), publicJson('/api/catalogue'), publicJson('/manifest.json'),
  publicJson('/api/public/pages/1'), publicJson('/api/public/pages/2'), publicJson('/api/library'),
])
const localEditions = new Set(loadCatalogue().map(book => book.edition.id))
const db = new DatabaseSync('data/spike.sqlite', { readOnly: true })
let snapshot
try {
  db.exec('BEGIN')
  snapshot = {
    purchases: db.prepare('SELECT edition,page,txid,sats FROM purchases ORDER BY edition,page').all(),
    intents: db.prepare('SELECT edition,page,state,txid FROM intents ORDER BY edition,page').all(),
    identityCount: db.prepare('SELECT count(DISTINCT identity) AS count FROM intents').get()!.count,
    proofCount: db.prepare('SELECT count(*) AS count FROM payment_proofs').get()!.count,
    replayClaimCount: db.prepare('SELECT count(*) AS count FROM replay_claims').get()!.count,
    // No proof bytes, request IDs, identity keys, bookmarks or private keys exported.
  }
  db.exec('COMMIT')
} finally { db.close() }
const checks = {
  mainnetReady: health.network === 'main' && health.paymentReady === true,
  pausePresent: existsSync('data/PAID_REQUESTS_PAUSED') && health.purchasesPaused === true && catalogue.purchasesPaused === true,
  noLivePermit: !existsSync('data/LIVE_PAYMENT_PROBE.json'),
  publicPages: free1.page === 1 && free2.page === 2 && [free1, free2].every(page => page.editionId === catalogue.editionId && Array.isArray(page.paragraphs) && page.paragraphs.length > 0),
  sameLocalEdition: localEditions.has(catalogue.editionId) && snapshot.purchases.every(row => localEditions.has(String(row.edition))) && snapshot.intents.every(row => localEditions.has(String(row.edition))),
  catalogueEditionsMatch: Array.isArray(library.books) && library.books.length === localEditions.size && library.books.every((book: { editionId: string }) => localEditions.has(book.editionId)),
  manifestAllowance: manifest.metanet?.groupPermissions?.spendingAuthorization?.amount === config.provisional.walletLimitSats,
  manifestIdentity: /^0[23][a-f0-9]{64}$/.test(manifest.metanet?.groupPermissions?.protocolPermissions?.find((entry: { protocolID?: unknown[] }) => entry.protocolID?.[1] === '3241645161d8')?.counterparty ?? ''),
}
const record = {
  schema: 1, at: new Date().toISOString(), origin: origin.origin, checks, snapshot,
  walletCalls: 0, paidRequests: 0,
  configuredAllowanceSats: config.provisional.walletLimitSats,
  nativePermissionEvidence: 'UNRESOLVED: manifest configuration is not an observed native grant',
  next: 'Owned-page recovery/permission inspection first; no new mainnet purchase authorized by this report.',
}
mkdirSync('evidence/runs', { recursive: true })
const path = `evidence/runs/recovery-preflight-${Date.now()}.json`
writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...record, evidenceFile: path }, null, 2))
if (Object.values(checks).some(value => !value)) process.exitCode = 1
