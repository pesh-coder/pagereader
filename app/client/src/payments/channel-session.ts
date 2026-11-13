// Reader side of a reading session (unidirectional payment channel).
// Open: one wallet-approved funding. Page: one createSignature and one plain
// request. Close: the server settles once; the reader receives the change.
import { Random, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { config } from './config.js'
import { networkFee } from './payment-cost.js'
import {
  channelKeys, fundingScript, maxPaid, refundTransaction, selfPaymentScript, signChannel, stateTransaction,
  validateTerms, verifyChannel, type ChannelTerms,
} from './payment-channel.js'

export type SessionWallet = Pick<WalletInterface,
  'getPublicKey' | 'createSignature' | 'createAction' | 'signAction' | 'abortAction' | 'internalizeAction'>
export interface SessionRecord {
  identityKey: string
  edition: string
  channelId: string
  serverIdentity: string
  state: 'funding' | 'funded' | 'open' | 'closing' | 'settled' | 'received' | 'abandoned'
  terms?: ChannelTerms
  reference?: string
  fundingFeeSats?: number
  readerPrefix: string
  readerSuffix: string
  refundSignature?: string
  /** Last cumulative payment the server accepted. */
  paid: number
  /** Signed but unconfirmed next state. Always resent before signing another. */
  pending?: { paid: number; page: number; signature: string }
  settlementTxid?: string
  openedAt: number
}
export interface SessionPage {
  editionId: string
  page: number
  paragraphs: string[]
  purchase: { page: number; txid: string; sats: number; feeSats?: number }
  credit?: { editionId: string; page: number; paragraphs: string[] }
}
export interface SessionDeps {
  wallet: SessionWallet
  identityKey: string
  /** BRC-103 authenticated JSON request (open, fund, activate, status). */
  authJson: <T>(path: string, method: string, body?: unknown) => Promise<T>
  /** Plain same-origin POST: page payments are authenticated by their signature. */
  post: (path: string, body: unknown) => Promise<Response>
  storage: Pick<Storage, 'getItem' | 'setItem'>
}
export class SessionError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) { super(message); this.retryable = retryable }
}

const MAX_FUNDING_FEE_SATS = 60
const keyFor = (identity: string, edition: string) => `pagestream-session-v1:${identity}:${edition}`
export const sessionPurchaseTxid = (record: SessionRecord, paid: number) =>
  `channel:${record.channelId}:${paid / record.terms!.price}`

export function createSessionClient(deps: SessionDeps) {
  const { wallet, identityKey } = deps
  const load = (edition: string): SessionRecord | undefined => {
    const raw = deps.storage.getItem(keyFor(identityKey, edition))
    return raw ? JSON.parse(raw) : undefined
  }
  const save = (record: SessionRecord) => deps.storage.setItem(keyFor(record.identityKey, record.edition), JSON.stringify(record))
  const api = (edition: string, path: string) => `/api/editions/${encodeURIComponent(edition)}/${path}`
  let credit: SessionPage['credit'] | undefined
  // Serializes page payments, including one started in the background.
  let tail: Promise<unknown> = Promise.resolve()

  async function abandon(record: SessionRecord) {
    if (record.reference) await wallet.abortAction({ reference: record.reference }).catch(() => undefined)
    save({ ...record, state: 'abandoned', pending: undefined })
  }

  const client = {
    load,
    remaining(record: SessionRecord) { return record.terms ? maxPaid(record.terms) - record.paid : 0 },
    isOpen(edition: string) { return load(edition)?.state === 'open' },

    /**
     * One wallet approval for a total `budget`, miner fees included: the session
     * locks budget − MAX_FUNDING_FEE_SATS, so the locked amount plus the opening
     * fee never exceeds the budget. The settling fee comes out of the locked sats.
     * The refund is held before anything is sent.
     */
    async open(edition: string, budget: number = config.channel.capacitySats, firstPage?: number) {
      const capacity = budget - MAX_FUNDING_FEE_SATS
      if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new SessionError('The session amount is too small to cover its fees.', false)
      const existing = load(edition)
      // An interrupted open never reached the server's refund step: cancel it.
      if (existing?.state === 'funding') await abandon(existing)
      else if (existing && ['funded', 'open', 'closing'].includes(existing.state))
        throw new SessionError('A reading session for this book is already open or closing.', false)
      const offer = await deps.authJson<{
        channelId: string; serverIdentity: string; serverKey: string; readerKey: string; capacity: number; price: number
        settlementFee: number; refundLockTime: number; serverScript: string
      }>(api(edition, 'channels'), 'POST', { capacity })
      const nowSeconds = Math.floor(Date.now() / 1000)
      if (offer.capacity !== capacity || offer.price !== config.priceSats || offer.settlementFee !== config.channel.settlementFeeSats ||
        offer.refundLockTime < nowSeconds + 3600 || offer.refundLockTime > nowSeconds + 3 * 86400 ||
        !/^76a914[0-9a-f]{40}88ac$/.test(offer.serverScript))
        throw new SessionError('The server offered different session terms. Nothing was paid.', false)
      // Both channel keys must come from BRC-42 derivation with the server identity.
      const keys = await channelKeys(wallet, offer.channelId, offer.serverIdentity)
      if (keys.own !== offer.readerKey || keys.counterparty !== offer.serverKey)
        throw new SessionError('Session keys did not match your wallet. Nothing was paid.', false)
      const readerPrefix = Utils.toBase64(Random(16)), readerSuffix = Utils.toBase64(Random(16))
      let record: SessionRecord = {
        identityKey, edition, channelId: offer.channelId, serverIdentity: offer.serverIdentity, state: 'funding',
        readerPrefix, readerSuffix, paid: 0, openedAt: Date.now(),
      }
      save(record)
      const readerScript = await selfPaymentScript(wallet, readerPrefix, readerSuffix, offer.serverIdentity)
      const lockingScript = fundingScript(offer.readerKey, offer.serverKey).toHex()
      // Same unsigned → checked → signed noSend path as page payments.
      const created = await wallet.createAction({
        description: 'Open Pagestream reading session',
        labels: ['pagestream channel'],
        outputs: [{ lockingScript, satoshis: capacity, outputDescription: 'Pagestream reading session' }],
        options: { signAndProcess: false, noSend: true, randomizeOutputs: false, returnTXIDOnly: false },
      })
      const signable = created.signableTransaction
      if (!signable) throw new SessionError('The wallet did not prepare the session payment. Nothing was sent.', true)
      record = { ...record, reference: signable.reference }
      save(record)
      try {
        const template = Transaction.fromAtomicBEEF(signable.tx)
        const fee = networkFee(template)
        if (fee == null || fee > MAX_FUNDING_FEE_SATS) throw new SessionError(`Session miner fee ${fee ?? 'unknown'} exceeds ${MAX_FUNDING_FEE_SATS} sats. Nothing was sent.`, false)
        if (template.outputs[0]?.satoshis !== capacity || template.outputs[0].lockingScript.toHex() !== lockingScript)
          throw new SessionError('The wallet changed the session payment. Nothing was sent.', false)
        const signed = await wallet.signAction({ reference: signable.reference, spends: {}, options: { noSend: true, returnTXIDOnly: false } })
        if (!signed.tx) throw new SessionError('The wallet returned no signed session payment. Nothing was sent.', false)
        const funding = Transaction.fromAtomicBEEF(signed.tx)
        if (funding.outputs[0]?.satoshis !== capacity || funding.outputs[0].lockingScript.toHex() !== lockingScript || networkFee(funding) !== fee)
          throw new SessionError('The signed session payment differs from the checked one. Nothing was sent.', false)
        const terms = validateTerms({
          channelId: offer.channelId, fundingTxid: funding.id('hex'), fundingVout: 0, capacity,
          readerKey: offer.readerKey, serverKey: offer.serverKey, readerScript, serverScript: offer.serverScript,
          price: offer.price, settlementFee: offer.settlementFee, refundLockTime: offer.refundLockTime,
        })
        const zero = await signChannel(wallet, terms, stateTransaction(terms, 0), offer.serverIdentity)
        const funded = await deps.authJson<{ terms: ChannelTerms; refundSignature: string }>(
          api(edition, `channels/${offer.channelId}/fund`), 'POST',
          { fundingBeef: Utils.toBase64(signed.tx), readerScript, signature: Utils.toBase64(zero) })
        if (JSON.stringify(funded.terms) !== JSON.stringify(terms) ||
          !verifyChannel(terms, refundTransaction(terms), terms.serverKey, Utils.toArray(funded.refundSignature, 'base64')))
          throw new SessionError('The server refund guarantee was invalid. Nothing was sent.', false)
        record = { ...record, state: 'funded', terms, fundingFeeSats: fee, refundSignature: funded.refundSignature }
        save(record)
      } catch (error) {
        await abandon(record)
        throw error
      }
      // From here the refund is held; release the exact signed funding.
      const sent = await wallet.createAction({
        description: 'Send Pagestream reading session', options: { sendWith: [record.terms!.fundingTxid], acceptDelayedBroadcast: false },
      })
      const status = sent.sendWithResults?.find(result => result.txid === record.terms!.fundingTxid)?.status
      if (status !== 'unproven' && status !== 'sending')
        throw new SessionError(`Wallet broadcast status: ${status ?? 'unknown'}. The session stays closed; your refund is held.`, false)
      const activated = await deps.authJson<{ credit?: SessionPage['credit'] }>(
        api(edition, `channels/${offer.channelId}/activate`), 'POST', firstPage === undefined ? {} : { page: firstPage })
      record = { ...record, state: 'open', reference: undefined }
      save(record)
      credit = activated.credit?.editionId === edition && activated.credit.page === firstPage &&
        Array.isArray(activated.credit.paragraphs) ? activated.credit : undefined
      return record
    },

    /** A page already delivered on credit, if it is the one requested. */
    takeCredit(edition: string, page: number) {
      if (credit?.editionId !== edition || credit.page !== page) return undefined
      const value = credit
      credit = undefined
      return value
    },
    clearCredit() { credit = undefined },
    idle() { return tail.then(() => undefined, () => undefined) },

    /** Sign the next cumulative state for `page`; resends an unconfirmed state first. */
    pay(edition: string, page: number, onAccepted?: (page: SessionPage, record: SessionRecord) => void) {
      const run = async (): Promise<SessionPage> => {
        let record = load(edition)
        if (record?.state !== 'open' || !record.terms) throw new SessionError('No open reading session.', false)
        if (record.pending && record.pending.page !== page) {
          // Finish the earlier signed page first; it may already be accepted.
          const earlier = await send(record, record.pending)
          onAccepted?.(earlier, load(edition)!)
          record = load(edition)!
        }
        const paid = record.pending?.paid ?? record.paid + record.terms!.price
        if (paid > maxPaid(record.terms!)) throw new SessionError('This reading session is spent. End it to receive your change, then open another.', false)
        const pending = record.pending ?? { paid, page, signature: Utils.toBase64(
          await signChannel(wallet, record.terms!, stateTransaction(record.terms!, paid), record.serverIdentity)) }
        save({ ...record, pending })
        const body = await send(record, pending)
        onAccepted?.(body, load(edition)!)
        return body
      }
      const result = tail.then(run, run)
      tail = result.catch(() => undefined)
      return result
    },

    /** Stop paying: the server settles the latest signed state. Safe to repeat. */
    async close(edition: string, beacon?: (url: string) => boolean) {
      const record = load(edition)
      if (!record || !['open', 'funded', 'closing'].includes(record.state)) return record
      credit = undefined
      const url = `/api/channels/${record.channelId}/close`
      save({ ...record, state: 'closing' })
      if (beacon) { beacon(url); return load(edition) }
      const response = await deps.post(url, {})
      if (!response.ok) throw new SessionError('The session could not be settled yet. It settles automatically after 10 minutes.', true)
      return load(edition)
    },

    /** Receive the change output of a settled session into the reader's wallet. */
    async receiveChange(edition: string) {
      const record = load(edition)
      if (!record?.terms || !['funded', 'closing', 'settled'].includes(record.state)) return record
      const status = await deps.authJson<{ state: string; paid: number; settlementTxid?: string; settlementBeef?: string }>(
        api(edition, `channels/${record.channelId}`), 'GET')
      if (status.state !== 'settled' || !status.settlementBeef) return record
      const settlement = Transaction.fromAtomicBEEF(Utils.toArray(status.settlementBeef, 'base64'))
      const allowed = [record.paid, record.pending?.paid].filter((value): value is number => value !== undefined)
      if (!allowed.includes(status.paid) || settlement.id('hex') !== status.settlementTxid ||
        stateTransaction(record.terms, status.paid).outputs.some((output, index) =>
          settlement.outputs[index]?.satoshis !== output.satoshis || settlement.outputs[index].lockingScript.toHex() !== output.lockingScript.toHex()))
        throw new SessionError('The settlement did not match what you signed. Your refund remains held.', false)
      const changeIndex = settlement.outputs.findIndex(output => output.lockingScript.toHex() === record.terms!.readerScript)
      if (changeIndex >= 0)
        await wallet.internalizeAction({
          tx: Utils.toArray(status.settlementBeef, 'base64'), description: 'Pagestream reading session change',
          labels: ['pagestream channel'],
          outputs: [{ outputIndex: changeIndex, protocol: 'wallet payment', paymentRemittance: {
            derivationPrefix: record.readerPrefix, derivationSuffix: record.readerSuffix, senderIdentityKey: record.serverIdentity,
          } }],
        })
      const done = { ...record, state: 'received' as const, paid: status.paid, pending: undefined, settlementTxid: status.settlementTxid }
      save(done)
      return done
    },
  }

  async function send(record: SessionRecord, pending: NonNullable<SessionRecord['pending']>): Promise<SessionPage> {
    let response: Response
    try {
      response = await deps.post('/api/channel-pages', {
        channelId: record.channelId, editionId: record.edition, page: pending.page, paid: pending.paid, signature: pending.signature,
      })
    } catch {
      throw new SessionError('The page payment did not reach the server. It is kept and will be resent; no second payment is made.', true)
    }
    const body = await response.json().catch(() => ({})) as SessionPage & { error?: string; code?: string; channel?: { paid: number } }
    if (body.code === 'SESSION_CLOSED') {
      // Settled by the server (idle or closed elsewhere); change is received next.
      credit = undefined
      save({ ...load(record.edition)!, state: 'closing', pending: undefined })
      throw new SessionError('Your reading session has ended, so this page was not paid. Your unspent sats are being returned.', false)
    }
    if (!response.ok) {
      // A definitive refusal never consumed this state; the same amount is reused.
      if (response.status === 400 || response.status === 402 || response.status === 409)
        save({ ...load(record.edition)!, pending: undefined })
      throw new SessionError(body.error ?? 'The page payment was refused.', response.status >= 500)
    }
    if (body.page !== pending.page || body.editionId !== record.edition || body.channel?.paid !== pending.paid ||
      body.purchase?.page !== pending.page || !Array.isArray(body.paragraphs))
      throw new SessionError('Server returned a different page. Your current text is kept.', false)
    const current = load(record.edition)!
    save({ ...current, paid: pending.paid, pending: undefined })
    credit = body.credit?.editionId === record.edition && body.credit.page === pending.page + 1 &&
      Array.isArray(body.credit.paragraphs) ? body.credit : undefined
    return body
  }
  return client
}
export type SessionClient = ReturnType<typeof createSessionClient>
