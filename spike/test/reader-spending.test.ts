import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WalletInterface } from '@bsv/sdk'
import { readActionCosts } from '../src/wallet-history.js'
import { summarizeSpending } from '../../app/client/src/reader/spending.js'
import { createReaderGateway, type Book } from '../../app/client/src/reader/gateway.js'

const txid = (n: number) => n.toString(16).padStart(64, '0')
const action = (n: number, satoshis = -6) => ({ txid: txid(n), satoshis, isOutgoing: satoshis < 0, status: 'completed' })
type HistoryWallet = Pick<WalletInterface, 'listActions'>

test('cost history reads all originator buckets without seeking permissions and rejects incomplete snapshots', async () => {
  const calls: unknown[] = []
  const wallet = { listActions: async (args: { offset: number }) => {
    calls.push(args)
    return { totalActions: 102, actions: args.offset === 0 ? Array.from({ length: 100 }, (_, n) => action(n + 1)) : [action(101, 88000), action(102, -62)] }
  } } as unknown as HistoryWallet
  const costs = await readActionCosts(wallet)
  assert.equal(costs.length, 101)
  assert.deepEqual(costs.at(-1), { txid: txid(102), debitSats: 62, status: 'completed' })
  assert.deepEqual(calls, [0, 100].map(offset => ({ labels: [], seekPermission: false, limit: 100, offset })))
  for (const result of [
    { totalActions: 2, actions: [action(1)] },
    { totalActions: 2, actions: [action(1), action(1)] },
    { totalActions: 1, actions: [action(1, NaN)] },
  ]) await assert.rejects(readActionCosts({ listActions: async () => result } as unknown as HistoryWallet), /incomplete|inconsistent/)
  await assert.rejects(readActionCosts({ listActions: async (args: { offset: number }) => ({ totalActions: args.offset === 0 ? 102 : 103, actions: Array.from({ length: 100 }, (_, n) => action(args.offset + n + 1)) }) } as unknown as HistoryWallet), /changed/)
})

test('headline includes pending and unresolved debits once, preserving unknown fee breakdowns', () => {
  const base = { identityKey: 'reader', edition: 'edition', page: 3, sats: 5 }
  const pending = { ...base, txid: txid(2), feeSats: 1, state: 'pending' as const }
  const summary = summarizeSpending([
    { ...base, txid: txid(1), feeSats: null, walletDebitSats: 62, state: 'confirmed' },
    pending, pending,
    { ...base, txid: txid(3), feeSats: null, state: 'unresolved' },
  ])
  assert.equal(summary.total, 73)
  assert.equal(summary.minimum, true)
  assert.equal(summary.unknownFees, true)
  assert.equal(summary.label, 'Spent ≥73 sats · fee unknown · 1 confirming · 1 unresolved')
  assert.equal(summarizeSpending([{ ...base, txid: txid(1), walletDebitSats: 62, state: 'confirmed' }]).label, 'Spent 62 sats')
})

test('explicit reconciliation matches txids only, keeps payment states and cannot purchase or invent fee evidence', async t => {
  const ledgerKey = 'pagestream-spike-spends-v1'
  const values = new Map<string, string>()
  const previous = ['localStorage', 'location', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const response = (body: unknown) => new Response(JSON.stringify(body))
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:3108' } })
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => response({ editionId: 'edition', page: 1, paragraphs: ['free'] }) })
  t.after(() => { for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) })
  const book: Book = { id: 'book', gid: 1, title: 'Book', author: 'Author', mode: 'reader', editionId: 'edition', pages: 30, sourceUrl: 'https://www.gutenberg.org' }
  let acquisitions = 0, histories = 0, conflicting = false
  type Open = typeof import('../src/wallet-client.js')['openWallet']
  const gateway = createReaderGateway(() => {}, async callbacks => {
    acquisitions++
    assert.equal(callbacks.canSpend(), false)
    return {
      identityKey: 'reader',
      auth: { fetch: async (url: string) => { assert.ok(url.endsWith('/me')); return response({ identityKey: 'reader', purchases: [{ page: 3, txid: txid(1), sats: 5 }], bookmark: null }) } },
      paymentFee: () => 1,
      readActionCosts: async () => {
        histories++
        assert.equal(callbacks.canSpend(), false)
        return [{ txid: txid(1), debitSats: conflicting ? 5 : 6, status: 'completed' }, { txid: txid(2), debitSats: 62, status: 'unproven' }, { txid: txid(4), debitSats: 244, status: 'completed' }]
      },
      beginPayment: () => { throw new Error('No new payment is permitted') },
    } as unknown as Awaited<ReturnType<Open>>
  })
  await gateway.page(book, 1)
  await assert.rejects(gateway.reconcileCosts(), /Open your saved page/)
  assert.equal(acquisitions, 0)
  await gateway.resumePage(book)
  assert.equal(histories, 0)
  assert.equal(gateway.receipts()[0].feeSats, 1)
  const ledger = JSON.parse(values.get(ledgerKey)!)
  ledger[txid(2)] = { txid: txid(2), identityKey: 'reader', edition: 'edition', page: 4, sats: 5, feeSats: null, state: 'unresolved' }
  ledger[txid(3)] = { txid: txid(3), identityKey: 'reader', edition: 'edition', page: 5, sats: 5, feeSats: 1, state: 'pending' }
  ledger[txid(4)] = { txid: txid(4), identityKey: 'other-reader', edition: 'edition', page: 3, sats: 5, feeSats: null, state: 'confirmed' }
  values.set(ledgerKey, JSON.stringify(ledger))
  assert.deepEqual(await gateway.reconcileCosts(), { matched: 2, missing: 1 })
  const receipts = gateway.receipts()
  assert.equal(receipts.find(entry => entry.txid === txid(2))?.state, 'unresolved')
  assert.equal(receipts.find(entry => entry.txid === txid(2))?.feeSats, null)
  assert.equal(receipts.find(entry => entry.txid === txid(2))?.walletDebitSats, 62)
  assert.equal(JSON.parse(values.get(ledgerKey)!)[txid(4)].walletDebitSats, undefined)
  assert.equal(summarizeSpending(receipts).total, 74)
  const before = values.get(ledgerKey)
  conflicting = true
  await assert.rejects(gateway.reconcileCosts(), /conflicts/)
  assert.equal(values.get(ledgerKey), before)
})
