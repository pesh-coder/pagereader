import { readFile, writeFile } from 'node:fs/promises'
import { reproduceOriginatorAccounting } from './originator-accounting.js'

const root = process.argv.includes('--desktop-reference') ? new URL('../evidence/runs/toolbox-2.14.5/package/', import.meta.url) : new URL('../node_modules/@bsv/wallet-toolbox-client/', import.meta.url)
const metadata = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const { WalletPermissionsManager } = await import(new URL('out/index.client.mjs', root).href) as typeof import('@bsv/wallet-toolbox-client')
const result = { referenceVersion: metadata.version, ...await reproduceOriginatorAccounting(WalletPermissionsManager) }
const path = `evidence/runs/originator-accounting-${metadata.version}-${Date.now()}.json`
await writeFile(path, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...result, evidenceFile: path }, null, 2))
