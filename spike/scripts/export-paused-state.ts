import { resolve } from 'node:path'
import { snapshotPausedState } from './snapshot-state.js'

const source = resolve(process.env.PAGESTREAM_STATE_DIR ?? 'data')
const target = resolve(`evidence/runs/deployment-state-${Date.now()}`)
const manifest = await snapshotPausedState(source, target)
console.log(JSON.stringify({ ...manifest, directory: target, warning: 'Private proof/identity records stay inside this ignored local directory. No upload or wallet-key copy occurred.' }, null, 2))
