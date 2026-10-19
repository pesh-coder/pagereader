import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const startFile = fileURLToPath(new URL('../../deploy/start.mjs', import.meta.url))
const env = { BSV_NETWORK: 'main', PUBLIC_ORIGIN: 'https://fixture.invalid', PORT: '0' }

test('first-host maintenance needs no key/database and exposes no reader or payment routes', async t => {
  const state = await mkdtemp(join(tmpdir(), 'pagestream-maintenance-'))
  const child = spawn(process.execPath, [startFile], { env: { ...env, PAGESTREAM_MAINTENANCE: '1', PAGESTREAM_STATE_DIR: state }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(async () => {
    child.kill()
    assert.ok(resolve(state).startsWith(resolve(tmpdir()) + '\\') || resolve(state).startsWith(resolve(tmpdir()) + '/'))
    await rm(state, { recursive: true, force: true })
  })
  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Maintenance did not start')) }, 10000)
    let output = ''
    child.stdout.on('data', chunk => {
      output += String(chunk)
      const match = output.match(/maintenance listener on port (\d+)/)
      if (match) { clearTimeout(timeout); resolve(Number(match[1])) }
    })
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Maintenance exited: ${code}`)) })
  })
  const base = `http://127.0.0.1:${port}`
  const health = await fetch(base + '/health')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { mode: 'maintenance', network: 'main', purchasesPaused: true, paymentReady: false })
  for (const [path, method] of [['/reader/', 'GET'], ['/manifest.json', 'GET'], ['/api/public/pages/1', 'GET'], ['/api/pages/3', 'GET'], ['/api/bookmarks', 'PUT'], ['/health', 'POST']]) {
    assert.equal((await fetch(base + path, { method })).status, 503)
  }
  assert.deepEqual(await readdir(state), [])
})

test('normal production startup refuses absent imported ledger before loading wallet/backend', async t => {
  const state = await mkdtemp(join(tmpdir(), 'pagestream-no-ledger-'))
  t.after(async () => {
    assert.ok(resolve(state).startsWith(resolve(tmpdir()) + '\\') || resolve(state).startsWith(resolve(tmpdir()) + '/'))
    await rm(state, { recursive: true, force: true })
  })
  const result = await new Promise<{ code: number | null; error: string }>((resolve, reject) => {
    // Non-key sentinel is never parsed: missing database must reject first.
    const child = spawn(process.execPath, [startFile], { env: { ...env, SERVER_PRIVATE_KEY: 'TEST_SENTINEL_NOT_A_KEY', PAGESTREAM_STATE_DIR: state }, windowsHide: true })
    let error = ''
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Normal startup failed to refuse an empty ledger')) }, 10000)
    child.stderr.on('data', chunk => { error += String(chunk) })
    child.once('error', failure => { clearTimeout(timeout); reject(failure) })
    child.once('exit', code => { clearTimeout(timeout); resolve({ code, error }) })
  })
  assert.equal(result.code, 1)
  assert.match(result.error, /Import the reviewed paused state snapshot/)
  assert.deepEqual(await readdir(state), [])
})
