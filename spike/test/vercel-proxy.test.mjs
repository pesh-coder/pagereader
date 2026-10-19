import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { AuthFetch, PrivateKey, ProtoWallet } from '@bsv/sdk'
import { httpsOrigin, publicOrigin, vercelConfig } from '../../deploy/hosting-config.mjs'
import { stageFrontend } from '../../deploy/stage-frontend.mjs'
import { Store } from '../src/store.ts'
import { createProbe } from '../src/probe.ts'
import { loadEdition } from '../src/content.ts'

test('split deployment uses the frontend origin, rejects invalid origins and leaves private routes uncached', () => {
  const credentialFixture = new URL('https://api.example.com')
  credentialFixture.username = 'fixture'
  credentialFixture.password = 'fixture'
  for (const origin of [undefined, '', 'http://api.example.com', 'https://localhost', credentialFixture.href, 'https://api.example.com/path', 'https://api.example.com/?q=1', 'https://api.example.com/#part']) {
    assert.throws(() => httpsOrigin(origin, 'fixture'), /HTTPS origin/)
  }
  assert.equal(publicOrigin({ PUBLIC_ORIGIN: 'https://reader.example.com/', RENDER_EXTERNAL_URL: 'https://api.example.com' }), 'https://reader.example.com')
  assert.equal(publicOrigin({ RENDER_EXTERNAL_URL: 'https://api.example.com', PAGESTREAM_MAINTENANCE: '1' }), 'https://api.example.com')
  assert.throws(() => publicOrigin({ RENDER_EXTERNAL_URL: 'https://api.example.com' }), /before activation/)
  assert.throws(() => vercelConfig({}), /PAGESTREAM_BACKEND_ORIGIN/)
  assert.throws(() => vercelConfig({ PAGESTREAM_BACKEND_ORIGIN: 'https://reader.example.com', VERCEL_URL: 'reader.example.com' }), /not this Vercel frontend/)
  const config = vercelConfig({ PAGESTREAM_BACKEND_ORIGIN: 'https://api.example.com/' })
  assert.equal(config.outputDirectory, 'dist/vercel')
  for (const path of ['/api/:path*', '/.well-known/auth', '/manifest.json', '/icon.svg', '/health']) {
    assert.equal(config.rewrites.find(route => route.source === path)?.destination, 'https://api.example.com' + path)
    assert.deepEqual(Object.fromEntries(config.headers.find(route => route.source === path).headers.map(header => [header.key, header.value])), {
      'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
    })
  }
  assert.ok(!config.rewrites.some(route => route.source === '/:path*'))
})

test('Vercel packaging preserves /reader assets and leaves the existing local build unchanged', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pagestream-vercel-static-'))
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
    await rm(directory, { recursive: true, force: true })
  })
  const source = join(directory, 'client-dist'), output = join(directory, 'vercel')
  await mkdir(join(source, 'assets'), { recursive: true })
  await mkdir(join(source, 'icons'))
  await writeFile(join(source, 'index.html'), '<script src="/reader/assets/reader.js"></script>')
  await writeFile(join(source, 'assets', 'reader.js'), 'public reader bundle')
  await writeFile(join(source, 'icons', 'pilcrow.svg'), '<svg/>')
  await stageFrontend(source, output)
  assert.deepEqual(await readdir(output), ['reader'])
  assert.equal(await readFile(join(output, 'reader', 'index.html'), 'utf8'), await readFile(join(source, 'index.html'), 'utf8'))
  assert.equal(await readFile(join(output, 'reader', 'assets', 'reader.js'), 'utf8'), 'public reader bundle')
  assert.equal(await readFile(join(output, 'reader', 'icons', 'pilcrow.svg'), 'utf8'), '<svg/>')
  await writeFile(join(output, 'stale.html'), 'stale')
  await stageFrontend(source, output)
  assert.deepEqual(await readdir(output), ['reader'])
  await assert.rejects(stageFrontend(source, directory), /separate directories/)
  await assert.rejects(stageFrontend(source, join(source, 'nested')), /separate directories/)
})

test('local proxy preserves BRC-103 paths bodies and custom headers while recovering owned fees with purchases paused', async t => {
  // SDK protocol verification only: random synthetic wallets, in-memory DB,
  // no SetupClient, native wallet, permission request or mainnet broadcast.
  const receiver = new ProtoWallet(PrivateKey.fromRandom()), reader = new ProtoWallet(PrivateKey.fromRandom())
  const identity = (await reader.getPublicKey({ identityKey: true })).publicKey
  const serverIdentity = (await receiver.getPublicKey({ identityKey: true })).publicKey
  const store = new Store(':memory:'), edition = loadEdition()
  const txid = '1'.repeat(64)
  store.db.prepare('INSERT INTO purchases(identity,edition,page,txid,sats) VALUES(?,?,?,?,?)').run(identity, edition.id, 3, txid, 5)
  store.recordFee(txid, 1, 'synthetic-test')
  let creates = 0, walletCalls = 0
  const receiverWallet = new Proxy(receiver, { get(target, property) {
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? (...args) => { walletCalls++; return value.apply(target, args) } : value
  } })
  const readerWallet = new Proxy(reader, { get(target, property) {
    if (property === 'createAction') return () => { creates++; throw new Error('A paused deployment must never request payment') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  const backend = http.createServer(createProbe({ store, edition, wallet: receiverWallet, serverIdentity, purchasesPaused: () => true }))
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve))
  const backendOrigin = `http://127.0.0.1:${backend.address().port}`
  const routing = vercelConfig({ PAGESTREAM_BACKEND_ORIGIN: 'https://fixture.example.com' })
  const seen = []
  const proxy = http.createServer({ maxHeaderSize: 1024 * 1024 }, (request, response) => {
    const url = new URL(request.url, 'https://reader.example.com')
    const route = routing.rewrites.find(route => route.source === url.pathname || (route.source === '/api/:path*' && url.pathname.startsWith('/api/')))
    if (!route || !route.destination.startsWith('https://fixture.example.com/')) { response.writeHead(404).end(); return }
    seen.push({ path: request.url, method: request.method, payment: request.headers['x-bsv-payment'], requestId: request.headers['x-bsv-request-id'] })
    const upstream = http.request(backendOrigin + request.url, { method: request.method, headers: { ...request.headers, host: new URL(backendOrigin).host } }, result => {
      response.writeHead(result.statusCode, result.headers)
      result.pipe(response)
    })
    upstream.on('error', () => response.writeHead(502).end())
    request.pipe(upstream)
  })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  t.after(() => { proxy.closeAllConnections(); proxy.close(); backend.closeAllConnections(); backend.close(); store.close() })
  const origin = `http://127.0.0.1:${proxy.address().port}`, prefix = `/api/editions/${edition.id}`
  for (const path of ['/health', '/manifest.json', '/icon.svg', '/api/library', prefix + '/public/pages/1', prefix + '/public/pages/2']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 200)
    for (const name of ['cache-control', 'cdn-cache-control', 'vercel-cdn-cache-control']) assert.equal(response.headers.get(name), 'no-store')
    await response.arrayBuffer()
  }
  assert.equal(walletCalls, 0, 'public routes cannot acquire/authenticate a wallet')
  assert.equal((await fetch(origin + prefix + '/public/pages/3')).status, 403)
  const auth = new AuthFetch(readerWallet)
  const me = await auth.fetch(origin + prefix + '/me?review=one%20two', { paymentRetryAttempts: 1 })
  assert.equal(me.status, 200)
  assert.deepEqual((await me.json()).purchases, [{ page: 3, txid, sats: 5, feeSats: 1 }])
  const proof = JSON.stringify({ transaction: 'synthetic-transport-fixture', derivationPrefix: 'not-a-payment' })
  const requestId = crypto.randomUUID()
  const owned = await auth.fetch(origin + prefix + '/owned/3', { headers: { 'x-bsv-request-id': requestId, 'x-bsv-payment': proof }, paymentRetryAttempts: 1 })
  assert.equal(owned.status, 200)
  assert.equal((await owned.json()).purchase.feeSats, 1)
  const bookmark = await auth.fetch(origin + prefix + '/bookmarks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 3, displayedAt: Date.now() }), paymentRetryAttempts: 1 })
  assert.equal(bookmark.status, 200)
  assert.equal(store.bookmark(identity, edition.id).page, 3)
  assert.equal((await auth.fetch(origin + prefix + '/pages/4', { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 })).status, 503)
  assert.equal(creates, 0)
  assert.ok(seen.some(request => request.path === '/.well-known/auth' && request.method === 'POST'))
  assert.ok(seen.some(request => request.path.endsWith('/me?review=one%20two')))
  assert.ok(seen.some(request => request.payment === proof && request.requestId === requestId))
  assert.equal(store.purchases(identity, edition.id).length, 1)
  assert.equal(store.intent(identity, edition.id, 4), undefined)
})
