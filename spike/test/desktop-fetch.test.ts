import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { desktopFetch } from '../scripts/desktop-fetch.js'

test('native transport waits for a delayed approval response and preserves SDK JSON and origin', async t => {
  let calls = 0
  const server = http.createServer((req, res) => {
    calls++
    assert.equal(req.headers.origin, 'http://localhost:3108')
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      assert.deepEqual(JSON.parse(body), { signAndProcess: false })
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ delayed: true })) }, 30)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const response = await desktopFetch(1000)(`http://127.0.0.1:${(server.address() as { port: number }).port}/createAction`, { method: 'POST', headers: { Origin: 'http://localhost:3108' }, body: JSON.stringify({ signAndProcess: false }) })
  assert.deepEqual(await response.json(), { delayed: true })
  assert.equal(calls, 1)
})

test('native approval deadline reports an explicit error without retrying the wallet call', async t => {
  let calls = 0
  const server = http.createServer(() => { calls++ })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  await assert.rejects(() => desktopFetch(40)(`http://127.0.0.1:${(server.address() as { port: number }).port}/createAction`), /approval deadline exceeded/)
  // The whole-call deadline can expire before the loopback server receives the
  // first request on a busy test runner. Zero deliveries is valid; a retry is not.
  assert.ok(calls <= 1, `Deadline must not send another request (received ${calls})`)
  await assert.rejects(() => desktopFetch()('https://example.com/createAction'), /restricted to local/)
})
