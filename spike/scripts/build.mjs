import { build } from 'esbuild'
import { mkdir, copyFile } from 'node:fs/promises'
await mkdir('dist/public', { recursive: true })
await build({ entryPoints: ['src/client.ts', 'src/grant-only.ts', 'src/single-page-review.ts', 'src/accounting-review.ts', 'src/latency-profile.ts', 'src/existing-proof-review.ts'], outdir: 'dist/public', bundle: true, splitting: true, platform: 'browser', format: 'esm', target: 'es2022' })
await copyFile('src/index.html', 'dist/public/index.html')
