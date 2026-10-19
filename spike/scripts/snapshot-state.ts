import { backup, DatabaseSync } from 'node:sqlite'
import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// SQLite's backup API includes committed WAL state. Never raw-copy a live DB,
// copy a one-run permit/key, overwrite a snapshot, or modify the source ledger.
export async function snapshotPausedState(source: string, target: string) {
  if (!existsSync(join(source, 'PAID_REQUESTS_PAUSED')) || existsSync(join(source, 'LIVE_PAYMENT_PROBE.json'))) throw new Error('Paused state with no live permit required')
  if (!existsSync(join(source, 'spike.sqlite'))) throw new Error('Existing database required; never initialize a new ledger for export')
  await mkdir(target)
  const sourceDb = new DatabaseSync(join(source, 'spike.sqlite'), { readOnly: true })
  try { await backup(sourceDb, join(target, 'spike.sqlite')) } finally { sourceDb.close() }
  await copyFile(join(source, 'PAID_REQUESTS_PAUSED'), join(target, 'PAID_REQUESTS_PAUSED'))
  const snapshot = new DatabaseSync(join(target, 'spike.sqlite'), { readOnly: true })
  let counts: Record<string, number>
  try {
    const integrity = snapshot.prepare('PRAGMA integrity_check').get()
    if (integrity?.integrity_check !== 'ok') throw new Error('Snapshot integrity check failed')
    const tables = ['purchases', 'intents', 'replay_claims', 'payment_proofs', 'bookmarks']
    if (snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='purchase_costs'").get()) tables.push('purchase_costs')
    counts = Object.fromEntries(tables.map(table => [table, Number(snapshot.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n)]))
  } finally { snapshot.close() }
  const manifest = { schema: 1, createdAt: new Date().toISOString(), mode: 'PRIVATE_LOCAL_STATE_SNAPSHOT_NOT_UPLOADED', counts, paused: true, livePermitCopied: false, serverKeyCopied: false }
  await writeFile(join(target, 'state-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  return manifest
}
