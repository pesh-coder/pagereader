import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { AuthFetch, P2PKH, PrivateKey, ProtoWallet, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { Store } from '../src/store.js'
import { createProbe } from '../src/probe.js'
import { loadEdition } from '../src/content.js'

// Synthetic SDK-signed transactions and receiver fault injection, never mainnet.
test('lost delivery and interrupted acceptance recover the original proof without another payment', async t => {
  const receiver = new ProtoWallet(PrivateKey.fromRandom())
  const reader = new ProtoWallet(PrivateKey.fromRandom())
  const readerKey = (await reader.getPublicKey({ identityKey: true })).publicKey
  const store = new Store(':memory:')
  const edition = loadEdition()
  let creates = 0, internalizes = 0, merge = false, failCommit = false
  const received = new Set<string>()
  const serverWallet = new Proxy(receiver, { get(target, property) {
    if (property === 'internalizeAction') return async (args: Parameters<WalletInterface['internalizeAction']>[0]) => {
      internalizes++
      const tx = Transaction.fromAtomicBEEF(args.tx)
      const remittance = args.outputs[0].paymentRemittance!
      const { publicKey } = await receiver.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${remittance.derivationPrefix} ${remittance.derivationSuffix}`, counterparty: remittance.senderIdentityKey, forSelf: true })
      const { PublicKey } = await import('@bsv/sdk')
      assert.equal(tx.outputs[0].lockingScript.toHex(), new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex())
      assert.equal(tx.outputs[0].satoshis, 5)
      merge = received.has(tx.id('hex')); received.add(tx.id('hex'))
      return { accepted: true, isMerge: merge }
    }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as WalletInterface
  const readerWallet = new Proxy(reader, { get(target, property) {
    if (property === 'createAction') return async (args: Parameters<WalletInterface['createAction']>[0]) => {
      creates++
      const key = PrivateKey.fromRandom()
      const script = new P2PKH().lock(key.toAddress())
      const parent = new Transaction(1, [], [{ satoshis: 5000, lockingScript: script }])
      const { Script } = await import('@bsv/sdk')
      const tx = new Transaction(1, [{ sourceTransaction: parent, sourceTXID: parent.id('hex'), sourceOutputIndex: 0, sequence: 4294967295, unlockingScript: Script.fromHex(''), unlockingScriptTemplate: new P2PKH().unlock(key) }], [{ satoshis: 5, lockingScript: Script.fromHex(args.outputs![0].lockingScript) }, { satoshis: 4994, lockingScript: script }])
      await tx.sign()
      return { txid: tx.id('hex'), tx: tx.toAtomicBEEF() }
    }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  let server = http.createServer(createProbe({ store, edition, wallet: serverWallet, purchasesPaused: () => false }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  let base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  t.after(() => { server.closeAllConnections(); server.close(); store.close() })
  const saved = new Map<number, { requestId: string; proof: string }>()
  let dropResponse = true
  const transport: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers)
    const url = new URL(String(input))
    const page = Number(url.pathname.split('/').at(-1))
    if (headers.has('x-bsv-payment')) saved.set(page, { requestId: headers.get('x-bsv-request-id')!, proof: headers.get('x-bsv-payment')! })
    if (failCommit && headers.has('x-bsv-payment')) store.db.exec("CREATE TRIGGER fail_commit BEFORE INSERT ON purchases BEGIN SELECT RAISE(ABORT,'interrupted acceptance'); END;")
    const response = await fetch(input, init)
    if (dropResponse && headers.has('x-bsv-payment') && response.ok) { dropResponse = false; throw new Error('delivery lost after server accepted payment') }
    return response
  }
  const auth = new AuthFetch(readerWallet, undefined, undefined, undefined, undefined, transport)
  await assert.rejects(async () => { const response = await auth.fetch(base + '/api/pages/3', { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 }); throw new Error('HTTP ' + response.status + ' ' + await response.text()) }, /failed after 1\/1 attempts/)
  assert.equal(store.purchases(readerKey, edition.id).length, 1)
  const proof3 = saved.get(3)!
  const txid3 = Transaction.fromAtomicBEEF(Utils.toArray(JSON.parse(proof3.proof).transaction, 'base64')).id('hex')
  // Fresh auth/middleware session, same durable receipts, and fresh spending paused.
  await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })
  server = http.createServer(createProbe({ store, edition, wallet: serverWallet, purchasesPaused: () => true }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const fresh = new AuthFetch(readerWallet)
  const recovered = await fresh.fetch(base + '/api/pages/3', { headers: { 'x-bsv-request-id': proof3.requestId, 'x-bsv-payment': proof3.proof }, paymentRetryAttempts: 1 })
  assert.equal(recovered.status, 200)
  const recoveredBody = await recovered.json()
  assert.equal(recoveredBody.purchase.txid, txid3)
  assert.equal(recoveredBody.purchase.feeSats, 1)
  const account = await (await fresh.fetch(base + '/api/me')).json()
  assert.equal(account.purchases.find((purchase: { txid: string }) => purchase.txid === txid3).feeSats, 1)
  assert.equal(creates, 1); assert.equal(internalizes, 1)
  const wrongPage = await fresh.fetch(base + '/api/pages/4', { headers: { 'x-bsv-request-id': proof3.requestId, 'x-bsv-payment': proof3.proof }, paymentRetryAttempts: 1 })
  assert.equal(wrongPage.status, 409)
  assert.equal(creates, 1)
  // Make an existing challenged intent whose wallet acceptance succeeds just
  // before the app's database commit fails. A merge on retry must recover it.
  await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })
  server = http.createServer(createProbe({ store, edition, wallet: serverWallet, purchasesPaused: () => false }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  failCommit = true
  const auth2 = new AuthFetch(readerWallet, undefined, undefined, undefined, undefined, transport)
  const failed = await auth2.fetch(base + '/api/pages/4', { headers: { 'x-bsv-request-id': crypto.randomUUID() }, paymentRetryAttempts: 1 })
  assert.equal(failed.status, 400)
  assert.equal(store.owned(readerKey, edition.id, 4), undefined)
  failCommit = false; store.db.exec('DROP TRIGGER fail_commit')
  const proof4 = saved.get(4)!
  const retry = await auth2.fetch(base + '/api/pages/4', { headers: { 'x-bsv-request-id': proof4.requestId, 'x-bsv-payment': proof4.proof }, paymentRetryAttempts: 1 })
  assert.equal(retry.status, 409) // official middleware marks merge; owned route recovers
  const owned = await auth2.fetch(base + '/api/owned/4')
  assert.equal(owned.status, 200)
  assert.equal(creates, 2)
  assert.equal(store.purchases(readerKey, edition.id).length, 2)
  assert.equal(store.intent(readerKey, edition.id, 4)?.state, 'confirmed')
})



