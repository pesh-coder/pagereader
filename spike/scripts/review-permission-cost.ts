import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { modelPermissionCost } from './permission-cost-model.js'

// Optional exact published dependency declared by Desktop v3.1.1; inspected
// package is local public source evidence, never installed over app packages.
const desktopReference = process.argv.includes('--desktop-reference')
const packageRoot = desktopReference ? new URL('../evidence/runs/toolbox-2.14.5/package/', import.meta.url) : new URL('../node_modules/@bsv/wallet-toolbox-client/', import.meta.url)
const metadata = JSON.parse(await readFile(new URL('package.json', packageRoot), 'utf8'))
const { WalletPermissionsManager } = await import(new URL('out/index.client.mjs', packageRoot).href) as typeof import('@bsv/wallet-toolbox-client')
const result = { referencePackage: metadata.name, referenceVersion: metadata.version, ...await modelPermissionCost(WalletPermissionsManager) }
await mkdir('evidence/runs', { recursive: true })
const path = `evidence/runs/permission-cost-model-${Date.now()}.json`
await writeFile(path, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ ...result, evidenceFile: path }, null, 2))
