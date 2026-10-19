import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Execute only the public upstream interceptor against a mock wallet. This does
// not install/update Desktop or acquire a wallet, key, permission or transaction.
const root = new URL('../evidence/runs/', import.meta.url)
const interceptor = new URL('pr124-RequestInterceptorWallet.ts', root)
const normalization = new URL('pr124-normalizeOriginator.ts', root)
const result = await build({ entryPoints: [fileURLToPath(interceptor)], bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'retained-public-normalizer', setup(builder) { builder.onResolve({ filter: /^\.\/utils\/normalizeOriginator$/ }, () => ({ path: fileURLToPath(normalization) })) } }] })
const output = new URL('pr124-interceptor-offline.mjs', root)
await writeFile(output, result.outputFiles[0].text)
const { RequestInterceptorWallet } = await import(output.href)
const forwarded: { originator: string }[] = [], recent: { originator: string }[] = []
const mock = { createAction: async (_args: unknown, originator: string) => { forwarded.push({ originator }); return {} } }
const wallet = new RequestInterceptorWallet(mock, 'synthetic-profile', (_profile: string, originator: string) => recent.push({ originator }))
await wallet.createAction({ description: 'Synthetic no-action capture', outputs: [] }, 'localhost:3108')
if (forwarded.length !== 1 || forwarded[0].originator !== 'localhost' || recent[0]?.originator !== 'localhost:3108') throw new Error('Upstream forwarding behavior did not match the proposed fix')
const evidence = {
  mode: 'OFFLINE_OFFICIAL_INTERCEPTOR_WITH_MOCK_WALLET', sourceCommit: '4a1af43cadfa2458a1a222aa7478daefc57d374e', sourcePR: 'https://github.com/bsv-blockchain/bsv-desktop/pull/124',
  sourceSha256: { interceptor: createHash('sha256').update(await readFile(interceptor)).digest('hex'), normalization: createHash('sha256').update(await readFile(normalization)).digest('hex') },
  forwarded, recent, nativeWalletCalls: 0, actualTransactionsCreated: 0, walletInstalledOrChanged: false,
  limitation: 'Fix forwards future createAction calls by hostname. The PR explicitly leaves earlier port-labeled actions excluded; this is not live acceptance or a migration fix.',
}
const path = new URL('official-originator-fix-offline-2026-10-17.json', root)
await writeFile(path, JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify(evidence, null, 2))
