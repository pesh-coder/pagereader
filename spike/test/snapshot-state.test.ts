import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, rmSync, unlinkSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import http from 'node:http'
import { Store } from '../src/store.js'
import { snapshotPausedState } from '../scripts/snapshot-state.js'
import { createProbe } from '../src/probe.js'
import { loadEdition } from '../src/content.js'
import { purchaseGate } from '../src/purchase-gate.js'

test('paused SQLite snapshot preserves WAL intents/proofs, never overwrites, and excludes keys/permits', async t => {
  const root = mkdtempSync(join(tmpdir(), 'pagestream-snapshot-'))
  const source = join(root, 'source'), target = join(root, 'snapshot')
  mkdirSync(source)
  const store = new Store(join(source, 'spike.sqlite'))
  t.after(() => { store.close(); if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe test cleanup path'); rmSync(root, { recursive: true, force: true }) })
  store.reserve('synthetic-reader', 'edition', 4, 'original-uncertain-request')
  store.challenge('synthetic-reader', 'edition', 4, 'original-prefix')
  store.submitted('synthetic-reader', 'edition', 4, 'synthetic-txid', 'original-proof')
  writeFileSync(join(source, '.env'), 'SYNTHETIC_KEY_DO_NOT_COPY=true')
  await assert.rejects(snapshotPausedState(source, target), /Paused state/)
  writeFileSync(join(source, 'PAID_REQUESTS_PAUSED'), 'synthetic pause')
  writeFileSync(join(source, 'LIVE_PAYMENT_PROBE.json'), '{}')
  await assert.rejects(snapshotPausedState(source, target), /no live permit/)
  unlinkSync(join(source, 'LIVE_PAYMENT_PROBE.json'))
  const manifest = await snapshotPausedState(source, target)
  assert.equal(manifest.counts.intents, 1)
  assert.equal(manifest.counts.payment_proofs, 1)
  assert.equal(manifest.serverKeyCopied, false)
  assert.equal(existsSync(join(target, '.env')), false)
  assert.equal(existsSync(join(target, 'LIVE_PAYMENT_PROBE.json')), false)
  const copy = new DatabaseSync(join(target, 'spike.sqlite'), { readOnly: true })
  try {
    assert.equal(copy.prepare('SELECT request_id FROM intents').get()?.request_id, 'original-uncertain-request')
    assert.equal(copy.prepare('SELECT proof FROM payment_proofs').get()?.proof, 'original-proof')
  } finally { copy.close() }
  assert.equal(store.intent('synthetic-reader', 'edition', 4)?.request_id, 'original-uncertain-request')
  await assert.rejects(snapshotPausedState(source, target), /EEXIST/)
})

test('configured state directory controls the pause independently of immutable catalogue data', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pagestream-state-'))
  writeFileSync(join(directory, 'PAID_REQUESTS_PAUSED'), 'synthetic')
  const store = new Store(':memory:')
  const server = http.createServer(createProbe({ store, edition: loadEdition(), stateDirectory: directory }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close(); store.close(); if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe test cleanup path'); rmSync(directory, { recursive: true, force: true }) })
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/health`
  assert.equal((await (await fetch(url)).json()).purchasesPaused, true)
  unlinkSync(join(directory, 'PAID_REQUESTS_PAUSED'))
  assert.equal((await (await fetch(url)).json()).purchasesPaused, false)
})

test('manual admission switch preserves imported pause state and exposes matching health/library status', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pagestream-manual-admission-'))
  const marker = join(directory, 'PAID_REQUESTS_PAUSED')
  writeFileSync(marker, 'original pause')
  t.after(() => { if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe cleanup'); rmSync(directory, { recursive: true, force: true }) })
  for (const [setting, expected] of [[undefined, true], ['0', true], ['1', false]] as const) {
    const store = new Store(':memory:')
    store.reserve('reader', 'edition', 7, 'original-request')
    const server = http.createServer(createProbe({ store, edition: loadEdition(), stateDirectory: directory, purchasesPaused: purchaseGate(directory, setting) }))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      for (const path of ['/health', '/api/library']) assert.equal((await (await fetch(base + path)).json()).purchasesPaused, expected)
      assert.equal(store.intent('reader', 'edition', 7)?.request_id, 'original-request')
      assert.equal(existsSync(marker), true)
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close() }
  }
  assert.throws(() => purchaseGate(directory, 'true'), /must be 0 or 1/)
  unlinkSync(marker)
  assert.equal(purchaseGate(directory, '0')(), true)
})
