import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkConnection } from '../../app/client/src/reader/connection-check.js'

test('the connection check times both routes, warms each first and never involves a wallet', async () => {
  let now = 0
  const requests: { url: string; mode?: string }[] = []
  const fetcher = (async (url: string, init?: RequestInit) => {
    requests.push({ url, mode: init?.mode })
    now += url.startsWith('/') ? 300 : 200 // through the reader 300 ms, direct 200 ms
    return new Response('ok')
  }) as typeof fetch
  const result = await checkConnection('https://backend.example', 6, fetcher, () => now)
  assert.deepEqual(result.viaReaderMs, { p50: 300, p95: 300 })
  assert.deepEqual(result.directMs, { p50: 200, p95: 200 })
  assert.equal(requests.length, 2 + 12, 'one warm-up each, then six rounds of two')
  assert.ok(requests.every(r => r.url === '/health' || r.url === 'https://backend.example/health'))
  assert.ok(requests.filter(r => r.url.startsWith('https://')).every(r => r.mode === 'no-cors'))
})
