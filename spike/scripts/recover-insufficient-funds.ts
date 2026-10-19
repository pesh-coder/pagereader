// Not an HTTP endpoint or automatic retry. This is a bounded, audited experiment repair.
import { Store } from '../src/store.js'

if (!process.argv.includes('--confirmed-tabs-closed-and-no-wallet-payment')) {
  throw new Error('First verify the insufficient-funds failure, close all old tabs, and obtain the reader\'s wallet-history confirmation. Then supply --confirmed-tabs-closed-and-no-wallet-payment.')
}
const store = new Store('data/spike.sqlite')
try {
  const candidates = store.db.prepare("SELECT identity,edition,page,request_id FROM intents WHERE page=3 AND state='challenged' AND txid IS NULL").all() as { identity: string; edition: string; page: number; request_id: string }[]
  if (candidates.length !== 1) throw new Error('Expected exactly one original page-3 challenged attempt; inspect manually without changing purchase records')
  const attempt = candidates[0]
  store.recoverInsufficientFunds(attempt.identity, attempt.edition, attempt.page, attempt.request_id,
    'Operator recovery of 2026-10-15 insufficient-funds screenshot; reader confirms old tabs closed and no page-payment transaction in wallet history. No automatic timeout/reissue.')
  console.log('Archived the original failed page-3 challenge with its recovery reason. Purchase/replay/bookmark records unchanged. One new explicit page-3 request is now possible.')
} finally { store.close() }
