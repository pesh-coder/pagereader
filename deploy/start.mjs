import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

// Deployment wrapper only. Local development continues to use npm run dev.
const origin = process.env.RENDER_EXTERNAL_URL ?? process.env.PUBLIC_ORIGIN
if (!origin || new URL(origin).protocol !== 'https:') throw new Error('A reachable HTTPS origin is required')
if (process.env.BSV_NETWORK !== 'main') throw new Error('Mainnet configuration required')
if (process.env.PAGESTREAM_MAINTENANCE === '1') {
  const { startMaintenance } = await import('./maintenance.mjs')
  startMaintenance(Number(process.env.PORT ?? 3108))
} else {
  if (!process.env.SERVER_PRIVATE_KEY) throw new Error('Existing mainnet receiving-wallet configuration required')
  const stateDirectory = process.env.PAGESTREAM_STATE_DIR
  if (!stateDirectory || !existsSync(join(stateDirectory, 'spike.sqlite')) || !existsSync(join(stateDirectory, 'PAID_REQUESTS_PAUSED'))) throw new Error('Import the reviewed paused state snapshot before launch; refusing an empty replacement ledger')
  if (existsSync(join(stateDirectory, 'LIVE_PAYMENT_PROBE.json'))) throw new Error('A one-run payment permit must not be imported into deployment')
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { cwd: fileURLToPath(new URL('../spike/', import.meta.url)), env: { ...process.env, PUBLIC_ORIGIN: origin, PAGESTREAM_REQUIRE_EXISTING_STATE: '1' }, stdio: 'inherit' })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
  child.on('error', () => { console.error('Deployment process failed to start'); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
}
