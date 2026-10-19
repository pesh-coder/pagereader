// Operator-invoked native-wallet quote only. Never signs or broadcasts a payment.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { HTTPWalletJSON, Transaction, WalletClient } from '@bsv/sdk'
import { config } from '../src/config.js'
import { networkFee } from '../src/payment-cost.js'
import { desktopFetch } from './desktop-fetch.js'

let transportError: Record<string, unknown> | undefined
const transport: typeof fetch = async (input, init) => {
  const response = await desktopFetch()(input, init)
  if (!response.ok) {
    try {
      const data = await response.clone().json()
      transportError = { status: response.status }
      for (const key of ['code', 'message', 'description', 'name', 'error']) if (typeof data[key] === 'string') transportError[key] = data[key].slice(0, 1000)
    } catch { transportError = { status: response.status } }
  }
  return response
}
const wallet = new WalletClient(new HTTPWalletJSON('localhost:3108', 'http://localhost:3321', transport), 'localhost:3108')
if (!(await wallet.isAuthenticated({})).authenticated) throw new Error('Open/unlock Desktop first')
if ((await wallet.getNetwork({})).network !== 'mainnet') throw new Error('Expected mainnet')
// Reuse a public, already-received P2PKH output for its page-payment shape.
// No key derivation, new protocol permission or server purchase intent is needed.
// This output will never be signed or sent and does not buy a page.
const fixture = JSON.parse(await readFile(new URL('../test/fixtures/page3-mainnet.json', import.meta.url), 'utf8'))
const lockingScript = Transaction.fromHex(fixture.transactionHex).outputs[0].lockingScript.toHex()
await mkdir('evidence/runs', { recursive: true })
const path = `evidence/runs/unsigned-fee-${Date.now()}.json`
const record: Record<string, unknown> = { startedAt: new Date().toISOString(), originator: 'localhost:3108', network: 'mainnet', pageSats: config.priceSats, signed: false, broadcast: false, state: 'preparing' }
const save = () => writeFile(path, JSON.stringify(record, null, 2) + '\n')
await save()
console.log('Preparing unsigned quote; no signAction or sendWith will be called.')
let reference: string | undefined
try {
  const result = await wallet.createAction({
    description: 'Pagestream unsigned fee check - cancel',
    outputs: [{ satoshis: config.priceSats, lockingScript, outputDescription: 'Unsigned page-price quote only' }],
    options: { signAndProcess: false, noSend: true, returnTXIDOnly: false, randomizeOutputs: false, knownTxids: [] },
  })
  reference = result.signableTransaction?.reference
  record.reference = reference
  record.state = 'prepared'
  await save()
  if (!reference || !result.signableTransaction || result.txid || result.tx) throw new Error('Expected an unsigned signable action; reconcile before another quote')
  const tx = Transaction.fromAtomicBEEF(result.signableTransaction.tx)
  if (tx.outputs[0].satoshis !== config.priceSats || tx.outputs[0].lockingScript.toHex() !== lockingScript) throw new Error('Wallet changed requested output')
  const feeSats = networkFee(tx)
  Object.assign(record, { feeSats, pageTotalSats: feeSats == null ? null : config.priceSats + feeSats, inputs: tx.inputs.length, outputs: tx.outputs.length, feeCapPass: feeSats != null && feeSats <= config.provisional.maxPageFeeSats })
} catch (error) {
  record.error = error instanceof Error ? error.message : 'Quote failed'
  if (transportError) record.transportError = transportError
  record.state = 'unresolved'
  process.exitCode = 1
} finally {
  if (reference) {
    try {
      const result = await wallet.abortAction({ reference })
      record.aborted = result.aborted
      record.state = result.aborted ? 'cancelled' : 'unresolved'
      if (!result.aborted) process.exitCode = 1
    } catch (error) {
      record.abortError = error instanceof Error ? error.message : 'Cancellation failed'
      record.state = 'unresolved'; process.exitCode = 1
    }
  }
  record.finishedAt = new Date().toISOString()
  await save()
  // Do not print reference, transaction bytes or wallet internals.
  const { reference: _reference, ...summary } = record
  console.log(JSON.stringify({ ...summary, evidenceFile: path }))
}
