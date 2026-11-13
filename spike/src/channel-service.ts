// Receiver side of the reading-session payment channel. One wallet-approved
// funding transaction per session; each page is one reader signature checked
// locally; one settlement is broadcast when reading stops.
import { Random, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { config } from './config.js'
import {
  CHANNEL_PROTOCOL, fundingScript, maxPaid, refundTransaction, selfPaymentScript, settlementBeef,
  signChannel, stateTransaction, validateTerms, verifyChannel, type ChannelTerms,
} from './payment-channel.js'
import { networkFee } from './payment-cost.js'
import type { Store } from './store.js'

export class ChannelError extends Error {
  constructor(readonly status: number, message: string, readonly code?: 'SESSION_CLOSED') { super(message) }
}
export type ChannelState = 'offered' | 'funded' | 'open' | 'settling' | 'settled'
export interface ChannelRow {
  id: string; identity: string; edition: string; state: ChannelState
  offer: string; terms: string | null; payout_prefix: string; payout_suffix: string
  funding_beef: string | null; paid: number; latest_sig: string | null
  credit_page: number | null; credit_edition: string | null; forfeits: number; last_activity: number
  settlement_txid: string | null; settlement_beef: string | null; funding_fee: number | null
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
  const service = {
    ceiling,
    async offer(identity: string, edition: string, requested?: number) {
      if (!options.enabled(identity)) throw new ChannelError(403, 'Reading sessions are not enabled for this wallet')
      const capacity = requested ?? ceiling
      if (!Number.isSafeInteger(capacity) || capacity < config.channel.minCapacitySats || capacity > ceiling)
        throw new ChannelError(400, `Session amount must be ${config.channel.minCapacitySats}–${ceiling} sats`)
      // One session per wallet identity, covering every book.
      const open = db.prepare("SELECT id FROM channels WHERE identity=? AND state IN ('funded','open')").get(identity)
      if (open) throw new ChannelError(409, 'A reading session is already open for this wallet')
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
      db.prepare(`INSERT INTO channels(id,identity,edition,state,offer,payout_prefix,payout_suffix,last_activity,created_at)
        VALUES(?,?,?,'offered',?,?,?,?,?)`).run(id, identity, edition, JSON.stringify(offer), prefix, suffix, now(), now())
      return offer
    },

    /** Verify the unsent funding, then sign the reader's refund before anything is broadcast. */
    async fund(identity: string, id: string, body: { fundingBeef?: unknown, readerScript?: unknown, signature?: unknown }) {
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
      const changed = db.prepare(`UPDATE channels SET state='funded', terms=?, funding_beef=?, latest_sig=?, funding_fee=?, last_activity=?
        WHERE id=? AND state='offered'`).run(JSON.stringify(terms), body.fundingBeef, body.signature, fundingFee, now(), id)
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
      await options.broadcast(Utils.toArray(channel.funding_beef!, 'base64'), terms.fundingTxid)
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
      for (const { id } of due) await service.settle(id).catch(() => failures.push(id))
      return { settled: due.length - failures.length, failures }
    },

    status(identity: string, id: string) {
      const channel = row(id)
      if (!channel || channel.identity !== identity) throw new ChannelError(404, 'Reading session not found')
      // The reader returning to an open session counts as activity, so the idle
      // window restarts instead of settling while the reader is back.
      if (channel.state === 'open') db.prepare("UPDATE channels SET last_activity=? WHERE id=? AND state='open'").run(now(), id)
      return service.publicStatus(row(id)!)
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
