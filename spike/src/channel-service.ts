// Receiver side of the reading-session payment channel. One wallet-approved
// funding transaction per session; each page is one reader signature checked
// locally; one settlement is broadcast when reading stops.
import { P2PKH, PublicKey, Random, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { config } from './config.js'
import {
  CHANNEL_PROTOCOL, PAYMENT_PROTOCOL, checkTopUp, fundingScript, signChannelHash, verifyChannelHash, maxPaid, refundTransaction, selfPaymentScript, settlementBeef,
  signChannel, stateTransaction, validateTerms, verifyChannel, type ChannelTerms,
} from './payment-channel.js'
import { networkFee } from './payment-cost.js'
import type { Store } from './store.js'

export class ChannelError extends Error {
  constructor(readonly status: number, message: string, readonly code?: 'SESSION_CLOSED') { super(message) }
}
// 'rolling': a top-up is moving this balance into a new one; no page payments.
export type ChannelState = 'offered' | 'funded' | 'open' | 'rolling' | 'settling' | 'settled'
export interface ChannelRow {
  id: string; identity: string; edition: string; state: ChannelState
  offer: string; terms: string | null; payout_prefix: string; payout_suffix: string
  funding_beef: string | null; paid: number; latest_sig: string | null
  credit_page: number | null; credit_edition: string | null; forfeits: number; last_activity: number
  settlement_txid: string | null; settlement_beef: string | null; funding_fee: number | null
  reader_prefix: string | null; reader_suffix: string | null; parent: string | null
}
export type Broadcast = (atomicBeef: number[], txid: string) => Promise<void>

const ID = /^[a-f0-9]{32}$/
const pageTxid = (id: string, paid: number, price: number) => `channel:${id}:${paid / price}`

export function createChannelService(options: {
  store: Store
  /** Unwrapped receiving wallet: key derivation, signing and settlement receipt. */
  wallet: WalletInterface
  broadcast: Broadcast
  pages: (edition: string) => number | undefined
  enabled: (identity: string) => boolean
  /** Server-enforced session ceiling (pilot caps); defaults to the config maximum. */
  maxCapacity?: number
  now?: () => number
}) {
  const { store, wallet } = options
  const now = options.now ?? Date.now
  const db = store.db
  db.exec(`CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY, identity TEXT NOT NULL, edition TEXT NOT NULL,
      state TEXT NOT NULL, offer TEXT NOT NULL, terms TEXT, payout_prefix TEXT NOT NULL, payout_suffix TEXT NOT NULL,
      funding_beef TEXT, paid INTEGER NOT NULL DEFAULT 0, latest_sig TEXT, credit_page INTEGER,
      forfeits INTEGER NOT NULL DEFAULT 0, last_activity INTEGER NOT NULL, created_at INTEGER NOT NULL,
      settlement_txid TEXT, settlement_beef TEXT, funding_fee INTEGER);
    CREATE TABLE IF NOT EXISTS channel_payments(channel TEXT NOT NULL REFERENCES channels(id), paid INTEGER NOT NULL,
      page INTEGER NOT NULL, PRIMARY KEY(channel, paid));`)
  // A session pays for pages in any book: payments and credit record their book.
  // Additive migration; earlier rows keep the book the session was opened from.
  const columns = (table: string) => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name))
  if (!columns('channels').has('credit_edition')) db.exec('ALTER TABLE channels ADD COLUMN credit_edition TEXT')
  // Not secret: the BRC-29 derivation the reader's wallet needs to receive its
  // change, kept so any of the reader's devices can collect it.
  if (!columns('channels').has('reader_prefix')) db.exec('ALTER TABLE channels ADD COLUMN reader_prefix TEXT')
  if (!columns('channels').has('reader_suffix')) db.exec('ALTER TABLE channels ADD COLUMN reader_suffix TEXT')
  // A top-up's new balance names the balance it replaces.
  if (!columns('channels').has('parent')) db.exec('ALTER TABLE channels ADD COLUMN parent TEXT')
  if (!columns('channel_payments').has('edition')) {
    db.exec('ALTER TABLE channel_payments ADD COLUMN edition TEXT')
    db.exec('UPDATE channel_payments SET edition=(SELECT edition FROM channels WHERE channels.id=channel_payments.channel)')
  }
  const row = (id: string) => (ID.test(id) ? db.prepare('SELECT * FROM channels WHERE id=?').get(id) : undefined) as ChannelRow | undefined
  const termsOf = (channel: ChannelRow) => {
    if (!channel.terms) throw new ChannelError(409, 'Reading session is not funded')
    return JSON.parse(channel.terms) as ChannelTerms
  }
  const transaction = <T>(fn: () => T) => {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  // A per-page attempt that may hold a transaction keeps priority, so a page is
  // never paid twice. One that never submitted a transaction (reserved or
  // challenged, no txid) does not block a session and is superseded by it.
  const blockingIntent = (identity: string, edition: string, page: number) => {
    const intent = store.intent(identity, edition, page)
    return Boolean(intent && intent.state !== 'confirmed' &&
      (intent.txid !== null || !['reserved', 'challenged'].includes(intent.state)))
  }

  const ceiling = Math.min(options.maxCapacity ?? config.channel.capacitySats, config.channel.capacitySats)
  async function createOffer(identity: string, edition: string, capacity: number, parent?: string) {
    const id = Utils.toHex(Random(16))
    const serverIdentity = (await wallet.getPublicKey({ identityKey: true })).publicKey
    const serverKey = (await wallet.getPublicKey({ protocolID: CHANNEL_PROTOCOL, keyID: id, counterparty: identity, forSelf: true })).publicKey
    const readerKey = (await wallet.getPublicKey({ protocolID: CHANNEL_PROTOCOL, keyID: id, counterparty: identity })).publicKey
    const prefix = Utils.toBase64(Random(16)), suffix = Utils.toBase64(Random(16))
    const offer = {
      channelId: id, serverIdentity, serverKey, readerKey, capacity, price: config.priceSats,
      settlementFee: config.channel.settlementFeeSats,
      refundLockTime: Math.floor(now() / 1000) + config.channel.refundDelaySeconds,
      serverScript: await selfPaymentScript(wallet, prefix, suffix, identity),
    }
    db.prepare(`INSERT INTO channels(id,identity,edition,state,offer,payout_prefix,payout_suffix,last_activity,created_at,parent)
      VALUES(?,?,?,'offered',?,?,?,?,?,?)`).run(id, identity, edition, JSON.stringify(offer), prefix, suffix, now(), now(), parent ?? null)
    return offer
  }
  const service = {
    ceiling,
    async offer(identity: string, edition: string, requested?: number) {
      if (!options.enabled(identity)) throw new ChannelError(403, 'Reading sessions are not enabled for this wallet')
      const capacity = requested ?? ceiling
      if (!Number.isSafeInteger(capacity) || capacity < config.channel.minCapacitySats || capacity > ceiling)
        throw new ChannelError(400, `Session amount must be ${config.channel.minCapacitySats}–${ceiling} sats`)
      // One session per wallet identity, covering every book.
      const open = db.prepare("SELECT id FROM channels WHERE identity=? AND state IN ('funded','open','rolling')").get(identity)
      if (open) throw new ChannelError(409, 'A reading session is already open for this wallet')
      return createOffer(identity, edition, capacity)
    },

    /** Prepare a new balance that the current one will move into, topped up by the reader's wallet. */
    async topUpOffer(identity: string, parentId: string, requested?: number) {
      const parent = row(parentId)
      if (!parent || parent.identity !== identity) throw new ChannelError(404, 'Reading session not found')
      if (parent.state !== 'open') throw new ChannelError(409, 'Only an open reading balance can be topped up')
      const parentTerms = termsOf(parent), capacity = requested ?? ceiling
      if (!Number.isSafeInteger(capacity) || capacity < config.channel.minCapacitySats || capacity > ceiling)
        throw new ChannelError(400, `Session amount must be ${config.channel.minCapacitySats}–${ceiling} sats`)
      if (capacity <= parentTerms.capacity - parent.paid) throw new ChannelError(400, 'The balance is already at that amount')
      const offer = await createOffer(identity, parent.edition, capacity, parent.id)
      return { ...offer, parent: {
        channelId: parent.id, fundingTxid: parentTerms.fundingTxid, fundingVout: parentTerms.fundingVout,
        paid: parent.paid, payoutScript: parentTerms.serverScript, inputBeef: parent.funding_beef,
      } }
    },

    /** Check the reader's top-up transaction and countersign the current balance it spends. */
    async countersignTopUp(identity: string, childId: string, body: { tx?: unknown; readerSignature?: unknown }) {
      const child = row(childId)
      if (!child || child.identity !== identity || child.state !== 'offered' || !child.parent) throw new ChannelError(404, 'Top-up not found')
      const parent = row(child.parent)!, offer = JSON.parse(child.offer)
      if (parent.state !== 'open' && parent.state !== 'rolling') throw new ChannelError(409, 'The reading balance changed; start the top-up again')
      if (typeof body.tx !== 'string' || typeof body.readerSignature !== 'string') throw new ChannelError(400, 'Malformed top-up')
      const parentTerms = termsOf(parent)
      let checked: ReturnType<typeof checkTopUp>
      try {
        checked = checkTopUp(parentTerms, Utils.toArray(body.tx, 'base64'), { paid: parent.paid, payoutScript: parentTerms.serverScript,
          balanceScript: fundingScript(offer.readerKey, offer.serverKey).toHex(), balanceSats: offer.capacity })
      } catch (error) { throw new ChannelError(400, error instanceof Error ? error.message : 'Malformed top-up') }
      if (!verifyChannelHash(parentTerms.readerKey, checked.sighash, Utils.toArray(body.readerSignature, 'base64')))
        throw new ChannelError(400, 'Invalid top-up signature')
      // Freeze page payments on the current balance: what it paid is now fixed.
      db.prepare("UPDATE channels SET state='rolling', last_activity=? WHERE id=? AND state IN ('open','rolling')").run(now(), parent.id)
      db.prepare('UPDATE channels SET offer=? WHERE id=?').run(JSON.stringify({ ...offer, rollPaid: parent.paid }), child.id)
      const serverSignature = await signChannelHash(wallet, parentTerms, checked.sighash, identity)
      return { serverSignature: Utils.toBase64(serverSignature) }
    },

    /** Abandon an unfinished top-up (nothing was broadcast): the current balance reopens. */
    cancelTopUp(identity: string, childId: string) {
      const child = row(childId)
      if (!child || child.identity !== identity || !child.parent) throw new ChannelError(404, 'Top-up not found')
      if (child.state !== 'offered') throw new ChannelError(409, 'The top-up already went ahead')
      transaction(() => {
        db.prepare("UPDATE channels SET state='settled' WHERE id=? AND state='offered'").run(child.id)
        db.prepare("UPDATE channels SET state='open', last_activity=? WHERE id=? AND state='rolling'").run(now(), child.parent)
      })
      return { state: 'open' as const }
    },

    /** Verify the unsent funding, then sign the reader's refund before anything is broadcast. */
    async fund(identity: string, id: string, body: { fundingBeef?: unknown, readerScript?: unknown, signature?: unknown, readerPrefix?: unknown, readerSuffix?: unknown }) {
      const channel = row(id)
      if (!channel || channel.identity !== identity) throw new ChannelError(404, 'Reading session not found')
      if (channel.state !== 'offered') throw new ChannelError(409, 'Reading session was already funded')
      if (typeof body.fundingBeef !== 'string' || typeof body.readerScript !== 'string' || typeof body.signature !== 'string' ||
        !/^76a914[0-9a-f]{40}88ac$/.test(body.readerScript)) throw new ChannelError(400, 'Malformed session funding')
      const offer = JSON.parse(channel.offer)
      let funding: Transaction
      try { funding = Transaction.fromAtomicBEEF(Utils.toArray(body.fundingBeef, 'base64')) } catch { throw new ChannelError(400, 'Malformed session funding') }
      const script = fundingScript(offer.readerKey, offer.serverKey).toHex()
      const vout = funding.outputs.findIndex(output => output.lockingScript.toHex() === script)
      if (vout < 0 || funding.outputs[vout].satoshis !== offer.capacity) throw new ChannelError(400, 'Funding does not lock the agreed session amount')
      if (channel.parent) {
        const parent = row(channel.parent)!, parentTerms = termsOf(parent)
        if (parent.state !== 'rolling' || offer.rollPaid !== parent.paid) throw new ChannelError(409, 'The top-up was not countersigned')
        try {
          checkTopUp(parentTerms, Utils.toArray(body.fundingBeef, 'base64'), { paid: parent.paid, payoutScript: parentTerms.serverScript,
            balanceScript: script, balanceSats: offer.capacity })
        } catch (error) { throw new ChannelError(400, error instanceof Error ? error.message : 'Malformed top-up') }
      }
      const terms = validateTerms({
        channelId: id, fundingTxid: funding.id('hex'), fundingVout: vout, capacity: offer.capacity,
        readerKey: offer.readerKey, serverKey: offer.serverKey, readerScript: body.readerScript, serverScript: offer.serverScript,
        price: offer.price, settlementFee: offer.settlementFee, refundLockTime: offer.refundLockTime,
      })
      // Hold a reader-signed zero-payment state, so closing early returns funds at once.
      const signature = Utils.toArray(body.signature, 'base64')
      if (!verifyChannel(terms, stateTransaction(terms, 0), terms.readerKey, signature)) throw new ChannelError(400, 'Invalid session signature')
      const refund = await signChannel(wallet, terms, refundTransaction(terms), identity)
      const fundingFee = networkFee(funding)
      // The change derivation must produce exactly the reader's change script.
      const derivation = typeof body.readerPrefix === 'string' && typeof body.readerSuffix === 'string' &&
        body.readerPrefix.length <= 64 && body.readerSuffix.length <= 64 ? { prefix: body.readerPrefix, suffix: body.readerSuffix } : undefined
      if (derivation) {
        const { publicKey } = await wallet.getPublicKey({ protocolID: PAYMENT_PROTOCOL, keyID: `${derivation.prefix} ${derivation.suffix}`, counterparty: identity })
        if (new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex() !== body.readerScript)
          throw new ChannelError(400, 'Change details do not match the change address')
      }
      const changed = db.prepare(`UPDATE channels SET state='funded', terms=?, funding_beef=?, latest_sig=?, funding_fee=?,
        reader_prefix=?, reader_suffix=?, last_activity=? WHERE id=? AND state='offered'`)
        .run(JSON.stringify(terms), body.fundingBeef, body.signature, fundingFee, derivation?.prefix ?? null, derivation?.suffix ?? null, now(), id)
      if (changed.changes !== 1) throw new ChannelError(409, 'Reading session changed')
      return { terms, refundSignature: Utils.toBase64(refund) }
    },

    /**
     * Broadcast the funding (idempotent with the reader's own sendWith) and open
     * the session. The page the reader asked for is delivered on credit, so it
     * appears as soon as the session opens; its signature follows.
     */
    async activate(identity: string, id: string, firstPage?: number) {
      const channel = row(id)
      if (!channel || channel.identity !== identity) throw new ChannelError(404, 'Reading session not found')
      if (channel.state === 'open') return { state: 'open' as const, paid: channel.paid, credit: null }
      if (channel.state !== 'funded') throw new ChannelError(409, 'Reading session is not awaiting activation')
      const terms = termsOf(channel), pages = options.pages(channel.edition) ?? 0
      const parent = channel.parent ? row(channel.parent) : undefined
      if (parent && parent.paid > 0) {
        // Receive what the old balance owed as a BRC-29 payment; this also broadcasts.
        const parentTerms = termsOf(parent), beef = Utils.toArray(channel.funding_beef!, 'base64')
        const { payoutVout } = checkTopUp(parentTerms, beef, { paid: parent.paid, payoutScript: parentTerms.serverScript,
          balanceScript: fundingScript(terms.readerKey, terms.serverKey).toHex(), balanceSats: terms.capacity })
        await wallet.internalizeAction({
          tx: beef, description: 'Pagereader reading session', labels: ['pagestream channel'],
          outputs: [{ outputIndex: payoutVout, protocol: 'wallet payment', paymentRemittance: {
            derivationPrefix: parent.payout_prefix, derivationSuffix: parent.payout_suffix, senderIdentityKey: identity,
          } }],
        })
      } else await options.broadcast(Utils.toArray(channel.funding_beef!, 'base64'), terms.fundingTxid)
      if (parent) db.prepare("UPDATE channels SET state='settled', settlement_txid=?, settlement_beef=? WHERE id=? AND state='rolling'")
        .run(terms.fundingTxid, channel.funding_beef, parent.id)
      const credit = Number.isSafeInteger(firstPage) && firstPage! > config.freePages && firstPage! <= pages &&
        !store.owned(identity, channel.edition, firstPage!) && !blockingIntent(identity, channel.edition, firstPage!) ? firstPage! : null
      db.prepare("UPDATE channels SET state='open', credit_page=?, credit_edition=?, last_activity=? WHERE id=? AND state='funded'")
        .run(credit, credit === null ? null : channel.edition, now(), id)
      return { state: 'open' as const, paid: 0, credit }
    },

    /** O(1) per page: rebuild the next state, verify one signature, record ownership. */
    pay(id: string, edition: string, page: number, paid: number, signatureBase64: string) {
      const channel = row(id)
      if (!channel) throw new ChannelError(404, 'Reading session not found')
      if (channel.state === 'rolling') throw new ChannelError(409, 'A top-up is in progress; try again in a moment')
      if (channel.state !== 'open') throw new ChannelError(409, 'Reading session is closed', 'SESSION_CLOSED')
      const terms = termsOf(channel), pages = options.pages(edition) ?? 0
      if (!Number.isSafeInteger(page) || page <= config.freePages || page > pages) throw new ChannelError(404, 'Page not found')
      const priorPage = db.prepare('SELECT page, edition FROM channel_payments WHERE channel=? AND paid=?').get(id, paid) as { page: number; edition: string } | undefined
      if (paid === channel.paid && signatureBase64 === channel.latest_sig && priorPage) {
        // Lost response: replay the accepted state for the page it bought, never another.
        if (priorPage.page !== page || priorPage.edition !== edition) throw new ChannelError(409, 'This payment already bought another page')
        return { channel, terms, purchase: store.owned(channel.identity, edition, page)!,
          credit: channel.credit_edition === edition ? channel.credit_page : null, replay: true }
      }
      if (paid !== channel.paid + terms.price) throw new ChannelError(409, `Expected the next session payment after ${channel.paid} sats`)
      if (paid > maxPaid(terms)) throw new ChannelError(402, 'Reading session spent; open a new session')
      let signature: number[]
      try { signature = Utils.toArray(signatureBase64, 'base64') } catch { throw new ChannelError(400, 'Malformed session payment') }
      if (!verifyChannel(terms, stateTransaction(terms, paid), terms.readerKey, signature)) throw new ChannelError(400, 'Invalid session payment')
      return transaction(() => {
        const current = row(id)!
        if (current.state !== 'open' || current.paid !== channel.paid) throw new ChannelError(409, 'Reading session changed')
        if (store.owned(channel.identity, edition, page)) throw new ChannelError(409, 'Page already owned')
        if (blockingIntent(channel.identity, edition, page)) throw new ChannelError(409, 'An earlier payment attempt for this page needs checking first')
        const forfeits = current.forfeits +
          (current.credit_page !== null && (current.credit_page !== page || current.credit_edition !== edition) ? 1 : 0)
        const next = page + 1
        const credit = forfeits <= config.channel.maxForfeitedCredits && next <= pages && paid + terms.price <= maxPaid(terms) &&
          !store.owned(channel.identity, edition, next) && !blockingIntent(channel.identity, edition, next) ? next : null
        db.prepare('UPDATE channels SET paid=?, latest_sig=?, credit_page=?, credit_edition=?, forfeits=?, last_activity=? WHERE id=?')
          .run(paid, signatureBase64, credit, credit === null ? null : edition, forfeits, now(), id)
        db.prepare('INSERT INTO channel_payments(channel, paid, page, edition) VALUES(?,?,?,?)').run(id, paid, page, edition)
        const txid = pageTxid(id, paid, terms.price)
        db.prepare('INSERT INTO purchases VALUES(?,?,?,?,?)').run(channel.identity, edition, page, txid, terms.price)
        // A later submission for the abandoned per-page attempt is refused.
        db.prepare("UPDATE intents SET state='superseded' WHERE identity=? AND edition=? AND page=? AND txid IS NULL AND state IN ('reserved','challenged')")
          .run(channel.identity, edition, page)
        // The session's two miner fees (funding + settlement) are recorded once,
        // on its first page, so receipts total what the reader's wallet spent.
        const sessionFees = paid === terms.price && current.funding_fee !== null ? current.funding_fee + terms.settlementFee : 0
        db.prepare("INSERT INTO purchase_costs VALUES(?,?,'payment-channel-page')").run(txid, sessionFees)
        return { channel: row(id)!, terms, purchase: store.owned(channel.identity, edition, page)!, credit, replay: false }
      })
    },

    /** Countersign the latest reader state and broadcast one settlement. Idempotent. */
    async settle(id: string) {
      const channel = row(id)
      if (!channel) throw new ChannelError(404, 'Reading session not found')
      if (channel.state === 'settled') return service.publicStatus(channel)
      if (channel.state === 'offered') {
        db.prepare("UPDATE channels SET state='settled' WHERE id=? AND state='offered'").run(id)
        return service.publicStatus(row(id)!)
      }
      // Stop page payments before signing; the settled state can no longer change.
      db.prepare("UPDATE channels SET state='settling' WHERE id=? AND state IN ('funded','open','settling')").run(id)
      const current = row(id)!, terms = termsOf(current)
      const serverSignature = await signChannel(wallet, terms, stateTransaction(terms, current.paid), current.identity)
      const { beef, txid } = settlementBeef(terms, current.paid, Utils.toArray(current.latest_sig!, 'base64'),
        serverSignature, Utils.toArray(current.funding_beef!, 'base64'))
      if (current.paid > 0) {
        // Receive the payout as an ordinary BRC-29 payment; the wallet also broadcasts.
        await wallet.internalizeAction({
          tx: beef, description: 'Pagereader reading session',
          labels: ['pagestream channel'],
          outputs: [{ outputIndex: 0, protocol: 'wallet payment', paymentRemittance: {
            derivationPrefix: current.payout_prefix, derivationSuffix: current.payout_suffix, senderIdentityKey: current.identity,
          } }],
        })
      } else await options.broadcast(beef, txid)
      db.prepare("UPDATE channels SET state='settled', settlement_txid=?, settlement_beef=? WHERE id=?").run(txid, Utils.toBase64(beef), id)
      return service.publicStatus(row(id)!)
    },

    /** Settle sessions idle past the limit, and retry interrupted settlements. */
    async settleIdle() {
      const cutoff = now() - config.channel.idleSettleMs, oldest = now() - config.channel.maxSessionMs
      const due = db.prepare(`SELECT id FROM channels WHERE (state IN ('funded','open') AND (last_activity<=? OR created_at<=?))
        OR state='settling'`).all(cutoff, oldest) as { id: string }[]
      const failures: string[] = []
      // A top-up abandoned before its funding reached the server: reopen the balance.
      const stale = db.prepare(`SELECT id FROM channels WHERE state='offered' AND parent IS NOT NULL AND created_at<=?`).all(now() - 86400_000) as { id: string }[]
      for (const { id } of stale) { const child = row(id)!; try { service.cancelTopUp(child.identity, id) } catch { /* already moved on */ } }
      for (const { id } of due) await service.settle(id).catch(() => failures.push(id))
      return { settled: due.length - failures.length, failures }
    },

    status(identity: string, id: string) {
      const channel = row(id)
      if (!channel || channel.identity !== identity) throw new ChannelError(404, 'Reading session not found')
      // The reader returning to an open session counts as activity, so the idle
      // window restarts instead of settling while the reader is back.
      if (channel.state === 'open') db.prepare("UPDATE channels SET last_activity=? WHERE id=? AND state='open'").run(now(), id)
      const current = row(id)!
      return { ...service.publicStatus(current),
        ...(current.reader_prefix && current.reader_suffix ? { readerPrefix: current.reader_prefix, readerSuffix: current.reader_suffix } : {}) }
    },

    /** Settled sessions whose change the reader's wallet may still need to collect. */
    toCollect(identity: string) {
      return db.prepare(`SELECT id AS channelId, edition FROM channels WHERE identity=? AND state='settled'
        AND settlement_txid IS NOT NULL AND created_at>? ORDER BY created_at`).all(identity, now() - 30 * 86400_000) as { channelId: string; edition: string }[]
    },

    publicStatus(channel: ChannelRow) {
      return {
        channelId: channel.id, state: channel.state, paid: channel.paid, creditPage: channel.credit_page,
        ...(channel.settlement_txid ? { settlementTxid: channel.settlement_txid, settlementBeef: channel.settlement_beef } : {}),
      }
    },
    row,
  }
  return service
}
export type ChannelService = ReturnType<typeof createChannelService>
