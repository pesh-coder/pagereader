// Existing receiver proof, synthetic unfunded caller and authenticated GETs only.
// Does not reserve an intent, create/sign/internalize a payment or broadcast.
import assert from 'node:assert/strict'
import { AuthFetch, PrivateKey, ProtoWallet, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { SetupClient } from '@bsv/wallet-toolbox-client'

const origin = new URL(process.argv[2] ?? 'https://pagereader.vercel.app')
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
  throw new Error('Supply a plain HTTPS reader origin')
const txid = process.argv[3] ?? '06b3820e7caba64aba083cfcd70342a99b7f06a6406c38b05422298ea2f74938'
if (!/^[a-f0-9]{64}$/.test(txid)) throw new Error('Existing payment TXID required')
const key = process.env.SERVER_PRIVATE_KEY
if (!key) throw new Error('Existing receiving-wallet configuration required')
const receiver = await SetupClient.createWalletClientNoEnv({ chain: 'main',
  rootKeyHex: PrivateKey.fromString(key).toHex(),
  storageUrl: process.env.WALLET_STORAGE_URL ?? 'https://storage.babbage.systems' })
try {
  const manifest = await (await fetch(new URL('/manifest.json', origin))).json()
  const advertised = manifest.metanet?.groupPermissions?.protocolPermissions?.find(
    (p: { protocolID: unknown[] }) => p.protocolID?.[1] === '3241645161d8')?.counterparty
  assert.equal((await receiver.getPublicKey({ identityKey: true })).publicKey, advertised)
  const outputs = await receiver.storage.findOutputs({ partial: { txid, vout: 0 } })
  assert.equal(outputs.length, 1)
  const output = outputs[0]
  assert.ok(output.derivationPrefix && output.derivationSuffix && output.senderIdentityKey)
  const listed = await receiver.listOutputs({ basket: 'default', include: 'entire transactions', limit: 100, seekPermission: false })
  assert.ok(listed.BEEF)
  const tx = Transaction.fromBEEF(listed.BEEF, txid)
  assert.equal(tx.id('hex'), txid)
  const proof = { derivationPrefix: output.derivationPrefix, derivationSuffix: output.derivationSuffix,
    transaction: Utils.toBase64(tx.toAtomicBEEF()) }

  const caller = new ProtoWallet(PrivateKey.fromRandom())
  assert.notEqual((await caller.getPublicKey({ identityKey: true })).publicKey, output.senderIdentityKey)
  let forbiddenPaymentCalls = 0
  const wallet = new Proxy(caller, { get(target, property) {
    if (['createAction', 'signAction', 'internalizeAction', 'abortAction'].includes(String(property)))
      return async () => { forbiddenPaymentCalls++; throw new Error('Payment operation forbidden in replay review') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.origin !== origin.origin) throw new Error('Unexpected request origin')
    if ((init?.method ?? 'GET') !== 'GET' && url.pathname !== '/.well-known/auth')
      throw new Error('Only read-only routes and the authentication handshake are allowed')
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(30000) })
  }
  const auth = new AuthFetch(wallet, undefined, undefined, origin.host, undefined, transport)
  const library = await (await fetch(new URL('/api/library', origin))).json()
  const book = library.books.find((b: { id: string }) => b.id === 'holmes')
  assert.ok(book)
  const base = `/api/editions/${encodeURIComponent(book.editionId)}`
  const status = async () => {
    const r = await auth.fetch(new URL(`${base}/status/3`, origin).href, { paymentRetryAttempts: 1 })
    assert.equal(r.status, 200)
    return r.json()
  }
  const before = await status()
  assert.deepEqual(before, { purchase: null, intent: null })
  const results = []
  for (let i = 0; i < 2; i++) {
    const r = await auth.fetch(new URL(`${base}/pages/3`, origin).href, { paymentRetryAttempts: 1,
      headers: { 'x-bsv-request-id': crypto.randomUUID(), 'x-bsv-payment': JSON.stringify(proof) } })
    const body = await r.json()
    results.push({ name: 'existing-proof-under-different-authenticated-identity', http: r.status,
      contentReturned: Array.isArray(body.paragraphs), error: body.error })
    assert.equal(r.status, 409)
    assert.equal(body.paragraphs, undefined)
  }
  const after = await status()
  assert.deepEqual(after, before)
  assert.equal(forbiddenPaymentCalls, 0)
  console.log(JSON.stringify({ at: new Date().toISOString(), origin: origin.origin, originalTxid: txid,
    caller: 'synthetic unfunded SDK identity, not the native phone wallet', results,
    callerIntentAndPurchaseUnchanged: true, forbiddenPaymentCalls,
    limitation: 'Cross-identity rejection only; not a native purchase race or underpayment test.' }, null, 2))
} finally { await receiver.destroy() }
