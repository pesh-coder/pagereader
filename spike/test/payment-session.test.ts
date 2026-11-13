import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {
  AuthFetch, MerklePath, P2PKH, PrivateKey, ProtoWallet, Transaction, UnlockingScript, Utils, type WalletInterface,
} from '@bsv/sdk'
import { Store } from '../src/store.js'
import { createProbe } from '../src/probe.js'
import { loadCatalogue } from '../src/content.js'
import { config } from '../src/config.js'
import { createChannelService, type ChannelService } from '../src/channel-service.js'
import { createSessionClient } from '../../app/client/src/payments/channel-session.js'
import { readerWallet } from './fixtures/session-wallet.js'
import { settlementValid, type ChannelTerms } from '../src/payment-channel.js'

async function harness(t: { after: (fn: () => unknown) => void }, enabled = true, now?: () => number) {
  const store = new Store(':memory:'), catalogue = loadCatalogue(), edition = catalogue[0].edition
  const serverProto = new ProtoWallet(PrivateKey.fromRandom())
  const received: { tx: number[] }[] = [], broadcasts: string[] = []
  const serverWallet = new Proxy(serverProto, { get(target, name) {
    if (name === 'internalizeAction') return async (args: { tx: number[] }) => { received.push(args); return { accepted: true } }
    const value = Reflect.get(target, name)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const app = createProbe({ store, edition, catalogue, wallet: serverWallet, purchasesPaused: () => false, research: false,
    channels: { broadcast: async (_beef, txid) => { broadcasts.push(txid) }, enabled: () => enabled, now } })
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close(); store.close() })
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const reader = readerWallet()
  const auth = new AuthFetch(reader.proto as unknown as WalletInterface)
  const posts: { path: string; ms: number }[] = []
  const storage = new Map<string, string>()
  // A reader client on its own browser storage; `tamper` can alter request bodies.
  const client = (store_ = storage, tamper: (path: string, body: unknown) => unknown = (_path, body) => body) => createSessionClient({
    wallet: reader.wallet, identityKey: reader.identity,
    authJson: async (path, method, body) => {
      const sent = body === undefined ? undefined : tamper(path, body)
      const response = await auth.fetch(origin + path, { method, ...(sent === undefined ? {} : { body: JSON.stringify(sent), headers: { 'Content-Type': 'application/json' } }) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error)
      return json
    },
    post: async (path, body) => {
      const started = performance.now()
      try { return await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
      finally { posts.push({ path, ms: performance.now() - started }) }
    },
    storage: { getItem: key => store_.get(key) ?? null, setItem: (key, value) => void store_.set(key, value) },
  })
  const session = client()
  return { store, edition, app, channels: app.locals.channels as ChannelService, reader, session, client, received, broadcasts, posts, origin, storage }
}

test('a reading session pays each page with one signature, delivers the next on credit, and settles once', async t => {
  const h = await harness(t)
  const record = await h.session.open(h.edition.id, 160)
  assert.equal(record.state, 'open')
  // The approved budget covers everything the wallet spends: locked sats + opening fee.
  assert.equal(record.terms!.capacity, 100)
  assert.ok(record.terms!.capacity + record.fundingFeeSats! <= 160)
  assert.deepEqual(h.reader.calls, ['createAction', 'signAction', 'sendWith'])
  assert.deepEqual(h.broadcasts, [record.terms!.fundingTxid])
  for (let page = 3; page <= 6; page++) {
    const credited = h.session.takeCredit(h.edition.id, page)
    if (page > 3) assert.equal(credited?.page, page, 'each page arrives on credit with the previous payment')
    const body = await h.session.pay(h.edition.id, page)
    assert.equal(body.page, page)
    assert.deepEqual(body.paragraphs, h.edition.pages[page - 1])
    assert.equal(body.purchase.sats, 5)
  }
  // Exactly one createAction/signAction/sendWith for the whole session; pages used no wallet action.
  assert.deepEqual(h.reader.calls, ['createAction', 'signAction', 'sendWith'])
  assert.deepEqual(h.store.purchases(h.reader.identity, h.edition.id).map(p => [p.page, p.sats, p.feeSats]),
    [[3, 5, 25 + config.channel.settlementFeeSats], [4, 5, 0], [5, 5, 0], [6, 5, 0]])
  assert.ok(h.posts.every(post => post.path === '/api/channel-pages'))
  await h.session.close()
  const done = await h.session.receiveChange()
  assert.equal(done?.state, 'received')
  // The server received its 20 sats as one BRC-29 payment inside one settlement.
  assert.equal(h.received.length, 1)
  const settlement = Transaction.fromAtomicBEEF(h.received[0].tx)
  const terms = JSON.parse(h.channels.row(record.channelId)!.terms!) as ChannelTerms
  assert.equal(settlementValid(terms, h.received[0].tx), true)
  assert.deepEqual(settlement.outputs.map(o => o.satoshis), [20, 100 - config.channel.settlementFeeSats - 20])
  // The reader received the change in its own wallet.
  const change = h.reader.internalized[0] as { outputs: { outputIndex: number; paymentRemittance: { senderIdentityKey: string } }[] }
  assert.equal(change.outputs[0].outputIndex, 1)
  // A closed session accepts no further payments.
  await assert.rejects(h.session.pay(h.edition.id, 7), /No open reading session/)
})

test('the page requested at approval arrives with the session, so it shows as soon as the wallet approves', async t => {
  const h = await harness(t)
  const record = await h.session.open(h.edition.id, 160, 3)
  const first = h.session.takeCredit(h.edition.id, 3)
  assert.deepEqual(first?.paragraphs, h.edition.pages[2])
  assert.equal(h.store.purchases(h.reader.identity, h.edition.id).length, 0, 'credit is not ownership')
  await h.session.pay(h.edition.id, 3)
  assert.equal(h.session.takeCredit(h.edition.id, 4)?.page, 4)
  assert.equal(h.channels.row(record.channelId)!.forfeits, 0, 'paying the credited first page forfeits nothing')
  // A free or already-owned page is never credited.
  const other = await harness(t)
  await other.session.open(other.edition.id, 160, 2)
  assert.equal(other.session.takeCredit(other.edition.id, 2), undefined)
})

test('one session per wallet pays for pages in several books and settles once', async t => {
  const h = await harness(t)
  const other = loadCatalogue()[1].edition
  const record = await h.session.open(h.edition.id, 160)
  await h.session.pay(h.edition.id, 3)
  await h.session.pay(other.id, 3)
  const body = await h.session.pay(h.edition.id, 4)
  assert.deepEqual(body.paragraphs, h.edition.pages[3])
  assert.deepEqual(h.store.purchases(h.reader.identity, h.edition.id).map(p => p.page), [3, 4])
  assert.deepEqual(h.store.purchases(h.reader.identity, other.id).map(p => p.page), [3])
  // A second session cannot open while this one is open, from any book.
  await assert.rejects(h.session.open(other.id, 160), /already open/)
  const payments = h.store.db.prepare('SELECT paid, page, edition FROM channel_payments WHERE channel=? ORDER BY paid').all(record.channelId)
  assert.deepEqual(payments.map(p => [p.paid, p.page, p.edition]), [[5, 3, h.edition.id], [10, 3, other.id], [15, 4, h.edition.id]])
  await h.session.close()
  await h.session.receiveChange()
  assert.equal(h.received.length, 1, 'one settlement for both books')
  assert.deepEqual(Transaction.fromAtomicBEEF(h.received[0].tx).outputs.map(o => o.satoshis), [15, 100 - config.channel.settlementFeeSats - 15])
})

test('a payment for one book cannot be replayed to buy a page in another book', async t => {
  const h = await harness(t)
  const other = loadCatalogue()[1].edition
  const record = await h.session.open(h.edition.id, 160)
  await h.session.pay(h.edition.id, 3)
  const latest = h.channels.row(record.channelId)!.latest_sig!
  const replay = await fetch(h.origin + '/api/channel-pages', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: record.channelId, editionId: other.id, page: 3, paid: 5, signature: latest }) })
  assert.equal(replay.status, 409)
  assert.deepEqual(h.store.purchases(h.reader.identity, other.id), [])
})

test('sessions created before multi-book support keep their history after migration', () => {
  const store = new Store(':memory:')
  store.db.exec(`CREATE TABLE channels(id TEXT PRIMARY KEY, identity TEXT NOT NULL, edition TEXT NOT NULL,
      state TEXT NOT NULL, offer TEXT NOT NULL, terms TEXT, payout_prefix TEXT NOT NULL, payout_suffix TEXT NOT NULL,
      funding_beef TEXT, paid INTEGER NOT NULL DEFAULT 0, latest_sig TEXT, credit_page INTEGER,
      forfeits INTEGER NOT NULL DEFAULT 0, last_activity INTEGER NOT NULL, created_at INTEGER NOT NULL,
      settlement_txid TEXT, settlement_beef TEXT, funding_fee INTEGER);
    CREATE TABLE channel_payments(channel TEXT NOT NULL REFERENCES channels(id), paid INTEGER NOT NULL,
      page INTEGER NOT NULL, PRIMARY KEY(channel, paid));
    INSERT INTO channels VALUES('${'a'.repeat(32)}','id','old-book','settled','{}',NULL,'p','s',NULL,40,NULL,45,0,1,1,'t',NULL,42);
    INSERT INTO channel_payments VALUES('${'a'.repeat(32)}',40,44);`)
  createChannelService({ store, wallet: new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface,
    broadcast: async () => {}, pages: () => 10, enabled: () => true })
  assert.deepEqual(store.db.prepare('SELECT paid, page, edition FROM channel_payments').all().map(r => ({ ...r })), [{ paid: 40, page: 44, edition: 'old-book' }])
  assert.equal((store.db.prepare('SELECT credit_edition FROM channels').get() as { credit_edition: unknown }).credit_edition, null)
  store.close()
})

test('lost responses are resent as the same state and never charge twice', async t => {
  const h = await harness(t)
  await h.session.open(h.edition.id, 160)
  const record = h.session.load()!
  // Simulate a payment that reached the server but whose response was lost.
  const { signChannel, stateTransaction } = await import('../src/payment-channel.js')
  const signature = Utils.toBase64(await signChannel(h.reader.wallet, record.terms!, stateTransaction(record.terms!, 5), record.serverIdentity))
  h.storage.set(`pagestream-session-v2:${h.reader.identity}`, JSON.stringify({ ...record, pending: { paid: 5, edition: h.edition.id, page: 3, signature } }))
  h.channels.pay(record.channelId, h.edition.id, 3, 5, signature)
  const body = await h.session.pay(h.edition.id, 3)
  assert.equal(body.page, 3)
  assert.equal(h.session.load()!.paid, 5)
  assert.equal(h.store.purchases(h.reader.identity, h.edition.id).length, 1)
  assert.equal(h.channels.row(record.channelId)!.paid, 5)
})

test('the receiver refuses forged, skipped, replayed-for-another-page and post-close payments', async t => {
  const h = await harness(t)
  await h.session.open(h.edition.id, 160)
  const record = h.session.load()!
  const { signChannel, stateTransaction } = await import('../src/payment-channel.js')
  const sign = async (paid: number) => Utils.toBase64(await signChannel(h.reader.wallet, record.terms!, stateTransaction(record.terms!, paid), record.serverIdentity))
  const post = (body: object) => fetch(h.origin + '/api/channel-pages', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: record.channelId, editionId: h.edition.id, ...body }) })
  const stranger = new ProtoWallet(PrivateKey.fromRandom())
  const forged = Utils.toBase64(await signChannel(stranger, record.terms!, stateTransaction(record.terms!, 5), record.serverIdentity))
  assert.equal((await post({ page: 3, paid: 5, signature: forged })).status, 400)
  assert.equal((await post({ page: 3, paid: 10, signature: await sign(10) })).status, 409)
  const five = await sign(5)
  assert.equal((await post({ page: 3, paid: 5, signature: five })).status, 200)
  assert.equal((await post({ page: 3, paid: 5, signature: five })).status, 200, 'same state, same page: idempotent')
  assert.equal((await post({ page: 4, paid: 5, signature: five })).status, 409, 'one payment buys one page')
  assert.equal((await post({ page: 2, paid: 10, signature: await sign(10) })).status, 404, 'free pages are not sold')
  assert.equal(h.store.purchases(h.reader.identity, h.edition.id).length, 1)
  assert.equal((await fetch(`${h.origin}/api/channels/${record.channelId}/close`, { method: 'POST' })).status, 200)
  assert.equal((await post({ page: 4, paid: 10, signature: await sign(10) })).status, 409)
})

test('credit stops after repeated unpaid credited pages, bounding the server exposure', async t => {
  const h = await harness(t)
  await h.session.open(h.edition.id, 260)
  const pages = [3, 5, 7, 9, 11] // each payment skips its credited page
  const credits: (number | undefined)[] = []
  for (const page of pages) {
    h.session.clearCredit()
    await h.session.pay(h.edition.id, page)
    credits.push(h.session.takeCredit(h.edition.id, page + 1)?.page)
  }
  // Forfeits: page 5 skips 4, 7 skips 6, 9 skips 8 (third) → credit withdrawn.
  assert.deepEqual(credits, [4, 6, 8, undefined, undefined])
})

test('closing an unused session returns everything but the fee, and idle sessions settle automatically', async t => {
  let clock = Date.now()
  const h = await harness(t, true, () => clock)
  await h.session.open(h.edition.id, 160)
  await h.session.close()
  await h.session.receiveChange()
  assert.equal(h.received.length, 0, 'no server payout without a paid page')
  assert.equal(h.broadcasts.length, 2, 'funding, then the zero-payment settlement')
  assert.equal((h.reader.internalized[0] as { outputs: { outputIndex: number }[] }).outputs[0].outputIndex, 0)
  // A second session idles past the limit and is settled by the sweep.
  const second = await h.session.open(h.edition.id, 160)
  await h.session.pay(h.edition.id, 3)
  assert.deepEqual(await h.channels.settleIdle(), { settled: 0, failures: [] }, 'active sessions are left open')
  clock += config.channel.idleSettleMs + 1
  assert.deepEqual(await h.channels.settleIdle(), { settled: 1, failures: [] })
  assert.equal(h.channels.row(second.channelId)!.state, 'settled')
  assert.equal(h.received.length, 1, 'the idle session paid 5 sats and settled once')
  // The reader receives its change later from the settled status, without closing.
  assert.equal((await h.session.receiveChange())?.state, 'open', 'an open local record is not touched')
})

test('even a session in constant use settles before the reader refund could unlock', async t => {
  let clock = Date.now()
  const h = await harness(t, true, () => clock)
  const record = await h.session.open(h.edition.id, 160)
  clock += config.channel.maxSessionMs + 1
  await h.session.pay(h.edition.id, 3) // still active, so not idle
  assert.deepEqual(await h.channels.settleIdle(), { settled: 1, failures: [] })
  assert.equal(h.channels.row(record.channelId)!.state, 'settled')
  assert.ok(config.channel.maxSessionMs < config.channel.refundDelaySeconds * 1000)
})

test('an abandoned per-page attempt with no transaction does not block a session; one with a transaction does', async t => {
  const h = await harness(t)
  // Page 4: challenged but never submitted (the reader rejected the wallet prompt).
  h.store.reserve(h.reader.identity, h.edition.id, 4, '11111111-1111-4111-8111-111111111111')
  h.store.challenge(h.reader.identity, h.edition.id, 4, 'prefix-4')
  // Page 5: a transaction was submitted, so it may have been paid.
  h.store.reserve(h.reader.identity, h.edition.id, 5, '22222222-2222-4222-8222-222222222222')
  h.store.challenge(h.reader.identity, h.edition.id, 5, 'prefix-5')
  h.store.submitted(h.reader.identity, h.edition.id, 5, 'f'.repeat(64))
  await h.session.open(h.edition.id, 160)
  await h.session.pay(h.edition.id, 4)
  assert.deepEqual(h.store.purchases(h.reader.identity, h.edition.id).map(p => p.page), [4])
  assert.equal(h.store.intent(h.reader.identity, h.edition.id, 4)?.state, 'superseded', 'a late per-page submission is refused')
  await assert.rejects(h.session.pay(h.edition.id, 5), /needs checking first/)
  assert.deepEqual(h.store.purchases(h.reader.identity, h.edition.id).map(p => p.page), [4])
})

test('returning to an open session restarts its idle window', async t => {
  let clock = Date.now()
  const h = await harness(t, true, () => clock)
  const record = await h.session.open(h.edition.id, 160)
  await h.session.pay(h.edition.id, 3)
  clock += 25 * 60 * 1000
  assert.equal((await h.session.resume())?.state, 'open', 'the reader came back after 25 minutes')
  clock += 25 * 60 * 1000
  assert.deepEqual(await h.channels.settleIdle(), { settled: 0, failures: [] }, '50 minutes after the last page, but 25 after returning')
  assert.equal(h.channels.row(record.channelId)!.state, 'open')
})

test('a reader whose saved data was cleared still collects its change from the server-kept details', async t => {
  const h = await harness(t)
  const serverIdentity = (await h.session.open(h.edition.id, 160)).serverIdentity
  await h.session.pay(h.edition.id, 3)
  await h.session.close()
  // This device lost its saved data before collecting: a fresh client on empty storage.
  const fresh = h.client(new Map())
  const owed = h.channels.toCollect(h.reader.identity)
  assert.equal(owed.length, 1)
  assert.equal(await fresh.collectSettled(owed, serverIdentity), 100 - config.channel.settlementFeeSats - 5, 'reports the sats returned')
  const change = h.reader.internalized.at(-1) as { outputs: { outputIndex: number }[] }
  assert.equal(change.outputs[0].outputIndex, 1, 'the reader receives its own change output only')
  assert.equal(await fresh.collectSettled(owed, serverIdentity), 0, 'never collected twice on the same device')
})

test('the server refuses change details that do not match the change address', async t => {
  const h = await harness(t)
  const tampered = h.client(new Map(), (path, body) =>
    path.endsWith('/fund') ? { ...(body as object), readerSuffix: 'not-the-real-suffix' } : body)
  await assert.rejects(tampered.open(h.edition.id, 160), /Change details do not match/)
})

test('top-up: one approval moves the balance and new sats into a full new balance and pays for pages read', async t => {
  const h = await harness(t)
  const parent = await h.session.open(h.edition.id, 160)          // locks 100
  for (const page of [3, 4, 5, 6]) await h.session.pay(h.edition.id, page) // 20 paid, 80 left in the balance
  const before = h.reader.calls.length
  const next = await h.session.topUp(260)                          // new balance locks 200
  // One wallet approval: one createAction + signAction, then the send.
  assert.deepEqual(h.reader.calls.slice(before), ['createAction', 'signAction', 'sendWith'])
  // The wallet added only the difference plus the miner fee: 200 + 20 owed - 100 moved + 25 fee.
  assert.equal(h.reader.lastFundingSats(), 200 + 20 - 100 + 25)
  assert.equal(next.state, 'open'); assert.equal(next.paid, 0); assert.equal(next.terms!.capacity, 200)
  // The old balance closed into the top-up; the server received the 20 sats it was owed.
  const old = h.channels.row(parent.channelId)!
  assert.equal(old.state, 'settled'); assert.equal(old.settlement_txid, next.terms!.fundingTxid)
  assert.equal(h.received.length, 1)
  const topUp = Transaction.fromAtomicBEEF(h.received[0].tx)
  assert.deepEqual(topUp.outputs.slice(0, 2).map(o => o.satoshis), [20, 200])
  assert.equal(settlementValid(JSON.parse(old.terms!) as ChannelTerms, h.received[0].tx, 0), true, 'both signatures unlock the old balance')
  // Reading continues on the new balance.
  await h.session.pay(h.edition.id, 7)
  assert.deepEqual(h.store.purchases(h.reader.identity, h.edition.id).map(p => p.page), [3, 4, 5, 6, 7])
  assert.equal(h.channels.row(next.channelId)!.paid, 5)
})

test('top-up the wallet refuses changes nothing: the balance reopens for reading', async t => {
  const h = await harness(t)
  const parent = await h.session.open(h.edition.id, 160)
  await h.session.pay(h.edition.id, 3)
  const refuse = h.reader.wallet.createAction
  ;(h.reader.wallet as { createAction: unknown }).createAction = async (args: { options?: { sendWith?: unknown } }) => {
    if (!args.options?.sendWith) throw Object.assign(new Error('User denied'), { code: 'ERR_PERMISSION_DENIED' })
    return refuse(args as never)
  }
  await assert.rejects(h.session.topUp(260), /User denied/)
  assert.equal(h.channels.row(parent.channelId)!.state, 'open')
  ;(h.reader.wallet as { createAction: unknown }).createAction = refuse
  await h.session.pay(h.edition.id, 4)
  assert.equal(h.channels.row(parent.channelId)!.paid, 10)
})

test('the server refuses a top-up that underpays for pages already read', async t => {
  const h = await harness(t)
  await h.session.open(h.edition.id, 160)
  await h.session.pay(h.edition.id, 3)
  const record = h.session.load()!
  // Pretend locally that nothing was read: the transaction would pay the server 0.
  h.storage.set(`pagestream-session-v2:${h.reader.identity}`, JSON.stringify({ ...record, paid: 0 }))
  await assert.rejects(h.session.topUp(260), /changed on the server|does not pay/)
  assert.equal(h.channels.row(record.channelId)!.state, 'open')
})

test('a top-up abandoned after countersigning reopens the balance after a day', async t => {
  let clock = Date.now()
  const h = await harness(t, true, () => clock)
  // A phone that vanishes mid-top-up: signing fails and its cancel never arrives.
  const vanishing = h.client(h.storage, (path, body) => { if (path.endsWith('/cancel')) throw new Error('offline'); return body })
  const parent = await vanishing.open(h.edition.id, 160)
  const original = h.reader.wallet.signAction
  ;(h.reader.wallet as { signAction: unknown }).signAction = async () => { throw new Error('Phone closed') }
  await assert.rejects(vanishing.topUp(260), /Phone closed/)
  ;(h.reader.wallet as { signAction: unknown }).signAction = original
  assert.equal(h.channels.row(parent.channelId)!.state, 'rolling', 'page payments wait while a top-up is in flight')
  clock += 86400_000 + 1
  await h.channels.settleIdle()
  assert.equal(h.channels.row(parent.channelId)!.state, 'open', 'the sweep reopened the balance; nothing was broadcast')
})

test('a wallet without enough free sats gets an offer of what it can afford, and nothing is paid', async t => {
  const h = await harness(t)
  const real = h.reader.wallet.createAction
  const short = Object.assign(new Error('Insufficient funds'), { code: 'WERR_INSUFFICIENT_FUNDS', totalSatoshisNeeded: 5000, moreSatoshisNeeded: 4215 })
  ;(h.reader.wallet as { createAction: unknown }).createAction = async () => { throw short }
  await assert.rejects(h.session.open(h.edition.id, 5000), (error: { insufficientFunds?: { availableSats?: number } }) =>
    error.insufficientFunds?.availableSats === 785)
  assert.equal(h.session.load()?.state, 'abandoned')
  // The reader then opens what the wallet can afford.
  ;(h.reader.wallet as { createAction: unknown }).createAction = real
  const smaller = await h.session.open(h.edition.id, 780)
  assert.equal(smaller.state, 'open'); assert.equal(smaller.terms!.capacity, 720)
  // Over a phone bridge only the wallet's text survives; its numbers still give the spendable amount.
  ;(h.reader.wallet as { createAction: unknown }).createAction = async () => { throw Object.assign(new Error(
    'Insufficient funds in the available inputs to cover the cost of the required outputs and the transaction fee (1245 more satoshis are needed, for a total of 2045), plus whatever would be required in order to pay the fee to unlock and spend the outputs used to provide the additional satoshis.'), { code: 7 }) }
  await h.session.close(); await h.session.receiveChange()
  await assert.rejects(h.session.open(h.edition.id, 2000), (error: { insufficientFunds?: { availableSats?: number }; message: string }) =>
    error.insufficientFunds?.availableSats === 800 && /1245 more satoshis/.test(error.message))
  // A refusal that is not a lack of funds keeps the wallet's own words and offers no smaller amount.
  ;(h.reader.wallet as { createAction: unknown }).createAction = async () => { throw Object.assign(new Error('Spending authorization exceeded'), { code: 1 }) }
  await assert.rejects(h.session.open(h.edition.id, 2000), (error: { insufficientFunds?: object; message: string }) =>
    !error.insufficientFunds && /Spending authorization exceeded \(code 1\)/.test(error.message))
  ;(h.reader.wallet as { createAction: unknown }).createAction = real
  const again = await h.session.open(h.edition.id, 780)
  void again
  // A top-up beyond the wallet is cancelled cleanly and reports the shortfall too.
  ;(h.reader.wallet as { createAction: unknown }).createAction = async (args: { options?: { sendWith?: unknown } }) => {
    if (!args.options?.sendWith) throw Object.assign(new Error('Insufficient funds'), { code: 'WERR_INSUFFICIENT_FUNDS' })
    return real(args as never)
  }
  await assert.rejects(h.session.topUp(5000), (error: { insufficientFunds?: object }) => Boolean(error.insufficientFunds))
  assert.equal(h.channels.row(again.channelId)!.state, 'open')
})

test('the server-enforced ceiling refuses a larger session before any wallet action', async t => {
  const h = await harness(t)
  await assert.rejects(h.session.open(h.edition.id, config.channel.capacitySats + 61), /Session amount must be/)
  assert.deepEqual(h.reader.calls, [])
})

test('reading sessions are refused for wallets that are not enabled, without any wallet action', async t => {
  const h = await harness(t, false)
  await assert.rejects(h.session.open(h.edition.id, 160), /not enabled/)
  assert.deepEqual(h.reader.calls, [])
})
