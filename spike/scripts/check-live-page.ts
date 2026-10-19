// One explicitly authorized mainnet page purchase. No retry creates new money.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { AuthFetch, HTTPWalletJSON, WalletClient, type WalletInterface } from '@bsv/sdk'
import { preparePayment, broadcastPayment, type PaymentAttempt } from '../src/payment-action.js'
import { config } from '../src/config.js'
import { desktopFetch } from './desktop-fetch.js'
import { assertUnsignedRetry, assertNoActiveWalletActions } from './unsigned-retry.js'

const originator = 'localhost:3108'
const base = `http://${originator}`
const page = 5 // Pages 3/4 have historical ownership/uncertain attempts; preserve them.
const resumePath = process.argv[2] === '--resume-unsigned' ? process.argv[3] : undefined
const previousRun = resumePath ? JSON.parse(readFileSync(resumePath, 'utf8')) : undefined
const permitPath = 'data/LIVE_PAYMENT_PROBE.json'
if (existsSync(permitPath)) throw new Error('An existing live-test permit needs reconciliation before another run')
let transportError: Record<string, unknown> | undefined
const transport: typeof fetch = async (input, init) => {
  const response = await desktopFetch()(input, init)
  if (!response.ok) {
    try {
      const data = await response.clone().json()
      transportError = { status: response.status }
      for (const key of ['code', 'message', 'description', 'error']) if (typeof data[key] === 'string') transportError[key] = data[key].slice(0, 1000)
    } catch { transportError = { status: response.status } }
  }
  return response
}
const raw = new WalletClient(new HTTPWalletJSON(originator, 'http://localhost:3321', transport), originator)
if (!(await raw.isAuthenticated({})).authenticated || (await raw.getNetwork({})).network !== 'mainnet') throw new Error('Authenticated mainnet Desktop required')
const identityKey = (await raw.getPublicKey({ identityKey: true })).publicKey
const edition = (await (await fetch(base + '/api/catalogue')).json()).editionId as string
const readWallet = new Proxy(raw, { get(target, property) {
  if (['createAction', 'signAction', 'internalizeAction'].includes(String(property))) return async () => { throw new Error('Read-only check cannot create a payment') }
  const value = Reflect.get(target, property)
  return typeof value === 'function' ? value.bind(target) : value
} })
const readAuth = new AuthFetch(readWallet, undefined, undefined, originator)
const statusResponse = await readAuth.fetch(`${base}/api/status/${page}`)
if (!statusResponse.ok) throw new Error('Could not check existing page status')
const status = await statusResponse.json()
if (status.purchase) throw new Error('Page already owned; no new payment attempted')
if (previousRun) {
  // This exception applies only before any prepared reference or signing stage.
  // Same server reservation; never replace a submitted/signed payment.
  assertUnsignedRetry(previousRun, { identityKey, edition, page, intent: status.intent })
  const actions = await raw.listActions({ labels: [], limit: 100, seekPermission: false })
  assertNoActiveWalletActions(actions)
} else if (status.intent) throw new Error('Page has an existing intent; no new payment attempted')
mkdirSync('evidence/runs', { recursive: true })
const path = `evidence/runs/live-page-${Date.now()}.json`
let attempt: PaymentAttempt = { identityKey, edition, page, requestId: previousRun?.attempt.requestId ?? crypto.randomUUID(), state: 'preparing' }
const record: Record<string, unknown> = { startedAt: new Date().toISOString(), walletCalls: [] as string[], attempt, ...(resumePath ? { unsignedRetryOf: resumePath, reconciliation: 'Prior script ended before receiving any reference/signing stage; wallet lists only completed actions. Reuse the exact server intent; preserve old run.' } : {}) }
const save = () => writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { flush: true })
const journal = { get: () => attempt, save: (next: PaymentAttempt) => { attempt = next; record.attempt = attempt; save() } }
save()
const observed = new Proxy(raw, { get(target, property) {
  const value = Reflect.get(target, property)
  if (typeof value !== 'function') return value
  return async (...args: unknown[]) => {
    (record.walletCalls as string[]).push(String(property)); save()
    if (property !== 'createAction') return value.apply(target, args)
    const result = await preparePayment(target, args[0] as Parameters<WalletInterface['createAction']>[0], journal, originator)
    console.log(JSON.stringify({ stage: 'signed-proof-saved', page, txid: attempt.txid, feeSats: attempt.feeSats, totalSats: config.priceSats + attempt.feeSats! }))
    await broadcastPayment(target, attempt, originator)
    return result
  }
} })
try {
  writeFileSync(permitPath, JSON.stringify({ identityKey, edition, page, requestId: attempt.requestId, expiresAt: Date.now() + config.provisional.liveTestPermitMs }), { flag: 'wx', flush: true })
  console.log('One live page-5 purchase starting. Only authorize the 6-sat request; leave new allowance/protocol grants unapproved.')
  const auth = new AuthFetch(observed, undefined, undefined, originator)
  const response = await auth.fetch(`${base}/api/pages/${page}`, { headers: { 'x-bsv-request-id': attempt.requestId }, paymentRetryAttempts: 1 })
  const body = await response.json()
  record.response = { status: response.status, page: body.page, purchase: body.purchase, paragraphCount: body.paragraphs?.length, error: body.error, code: body.code }
  if (!response.ok || body.purchase?.txid !== attempt.txid || body.page !== page) throw new Error('Payment delivery is unresolved; do not create a replacement payment')
  journal.save({ ...attempt, state: 'confirmed' })
  const reread = await readAuth.fetch(`${base}/api/owned/${page}`)
  const owned = await reread.json()
  record.reread = { status: reread.status, page: owned.page, txid: owned.purchase?.txid, paragraphCount: owned.paragraphs?.length }
  if (!reread.ok || owned.purchase?.txid !== attempt.txid) throw new Error('Owned reread did not match the original payment')
} catch (error) {
  record.error = error instanceof Error ? error.message : 'Live run failed'
  if (transportError) record.transportError = transportError
  process.exitCode = 1
} finally {
  if (existsSync(permitPath)) {
    const permit = JSON.parse(readFileSync(permitPath, 'utf8'))
    if (permit.requestId === attempt.requestId) rmSync(permitPath)
  }
  record.finishedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ ...record, attempt: { ...attempt, proof: attempt.proof ? '[saved locally]' : undefined, reference: undefined }, evidenceFile: path }))
}
