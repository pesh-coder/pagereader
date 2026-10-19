import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { WalletPermissionsManager, type GroupedPermissionRequest, type PermissionRequest } from '@bsv/wallet-toolbox-client'
import { config } from '../src/config.js'
import { manifest } from '../src/manifest.js'
import http from 'node:http'
import { createLocalWalletManifest } from '../src/local-wallet-manifest.js'

// The official permission manager with an empty, synthetic wallet. Every
// permission request is denied by the fixture. No native wallet/grant/action.
for (const available of [false, true]) test(`hostname-scoped manifest ${available ? 'availability exposes the configured grouped allowance' : 'failure falls back to a per-action spending request'}`, async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const requests: string[] = []
  const data = manifest((await new ProtoWallet(PrivateKey.fromRandom()).getPublicKey({ identityKey: true })).publicKey)
  globalThis.fetch = async input => {
    requests.push(String(input))
    return new Response(available ? JSON.stringify(data) : '{}', { status: available ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
  }
  let actions = 0
  const wallet = new Proxy(new ProtoWallet(PrivateKey.fromRandom()), { get(target, property) {
    if (property === 'listOutputs') return async () => ({ totalOutputs: 0, outputs: [] })
    if (property === 'listActions') return async () => ({ totalActions: 0, actions: [] })
    if (['createAction', 'signAction', 'internalizeAction'].includes(String(property))) return async () => { actions++; throw new Error('Synthetic permission test must never create an action') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const manager = new WalletPermissionsManager(wallet, 'test-admin.example', { seekGroupedPermission: true, seekSpendingPermissions: true })
  const groups: GroupedPermissionRequest[] = []
  const spending: PermissionRequest[] = []
  manager.bindCallback('onGroupedPermissionRequested', async (request: GroupedPermissionRequest) => { groups.push(request); await manager.denyGroupedPermission(request.requestID) })
  manager.bindCallback('onSpendingAuthorizationRequested', async (request: PermissionRequest & { requestID: string }) => { spending.push(request); await manager.denyPermission(request.requestID) })
  await assert.rejects(manager.ensureSpendingAuthorization({ originator: 'localhost:3108', satoshis: config.priceSats + config.provisional.maxPageFeeSats }))
  assert.deepEqual(requests, ['http://localhost/manifest.json'])
  assert.equal(actions, 0)
  if (available) {
    assert.equal(groups.length, 1)
    assert.equal(groups[0].originator, 'localhost')
    assert.equal(groups[0].permissions.spendingAuthorization?.amount, config.provisional.walletLimitSats)
    assert.equal(spending.length, 0)
  } else {
    assert.equal(groups.length, 0)
    assert.equal(spending.length, 1)
    assert.equal(spending[0].originator, 'localhost')
    assert.equal(spending[0].spending?.satoshis, config.priceSats + config.provisional.maxPageFeeSats)
  }
})

test('optional localhost discovery endpoint serves the same permission declaration and exposes no payment APIs', async t => {
  const key = (await new ProtoWallet(PrivateKey.fromRandom()).getPublicKey({ identityKey: true })).publicKey
  const server = http.createServer(createLocalWalletManifest(key, 3108))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const response = await fetch(base + '/manifest.json')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  const data = await response.json()
  assert.deepEqual(data.metanet, manifest(key).metanet)
  assert.equal(data.start_url, 'http://localhost:3108/reader/')
  assert.equal((await fetch(base + '/api/pages/3')).status, 404)
  assert.equal((await fetch(base + '/api/me')).status, 404)
  assert.equal((await fetch(base + '/api/editions/anything/pages/3')).status, 404)
})
