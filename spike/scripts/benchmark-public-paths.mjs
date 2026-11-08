// Wallet-free comparison of the current proxy and direct backend paths.
// Run from repository root: node spike/scripts/benchmark-public-paths.mjs
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

const path = '/api/editions/1661-922e2a12ccb43a4c9544c260b2166c6ad2097aeb5957faeee113f173bb857cd0-paragraphs-1800-v1/public/pages/1'
const origins = ['https://pagereader.vercel.app', 'https://pagestream-production.up.railway.app']
const samples = []
for (let round = 0; round < 8; round++) {
  samples.push(...await Promise.all(origins.map(async origin => {
    const start = performance.now()
    const response = await fetch(origin + path, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) })
    const headersMs = performance.now() - start
    const body = await response.json(), totalMs = performance.now() - start
    assert.equal(response.status, 200); assert.equal(body.page, 1)
    assert.ok(body.paragraphs.length > 0); assert.equal(body.purchase, undefined)
    return { origin, round, headersMs, totalMs, status: response.status,
      vercelEdge: response.headers.get('x-vercel-id'), railwayEdge: response.headers.get('x-railway-edge'),
      serverTiming: response.headers.get('server-timing'), cacheControl: response.headers.get('cache-control') }
  })))
}
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
const summary = origins.map(origin => {
  const rows = samples.filter(row => row.origin === origin)
  return { origin, coldMs: rows[0].totalMs, warmMedianMs: quantile(rows.slice(1).map(row => row.totalMs), .5),
    warmP95Ms: quantile(rows.slice(1).map(row => row.totalMs), .95) }
})
const report = { generatedAt: new Date().toISOString(), samples, summary,
  scope: '16 public GETs from the developer computer, without authentication, wallet calls or payments. Small sample; not phone latency, not paid-turn performance, and not a universal network floor.' }
await writeFile('spike/evidence/runs/public-http-path-comparison-2026-11-08.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
