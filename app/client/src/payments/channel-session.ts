// Reader side of a reading session (unidirectional payment channel).
// Open: one wallet-approved funding. Page: one createSignature and one plain
// request. Close: the server settles once; the reader receives the change.
import { Random, Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { config } from './config.js'
import { networkFee } from './payment-cost.js'
import {
  channelKeys, channelUnlock, checkTopUp, fundingScript, maxPaid, refundTransaction, selfPaymentScript, signChannel,
  signChannelHash, stateTransaction, validateTerms, verifyChannel, verifyChannelHash, type ChannelTerms,
} from './payment-channel.js'

export type SessionWallet = Pick<WalletInterface,
  'getPublicKey' | 'createSignature' | 'createAction' | 'signAction' | 'abortAction' | 'internalizeAction'>
export interface SessionRecord {
  identityKey: string
  /** Book the session was opened from; a session pays for pages in any book. */
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
  pending?: { paid: number; edition: string; page: number; signature: string }
  settlementTxid?: string
  openedAt: number
  /** A top-up whose new balance is funded on the server but not yet sent/activated. */
  topUp?: { childId: string; stage: 'funded' | 'sent'; next: SessionRecord }
}
type Offer = {
  channelId: string; serverIdentity: string; serverKey: string; readerKey: string; capacity: number; price: number
  settlementFee: number; refundLockTime: number; serverScript: string
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
  /** The wallet lacked funds; `availableSats` is what it reported free, when known. */
  insufficientFunds?: { availableSats?: number }
  constructor(message: string, retryable: boolean) { super(message); this.retryable = retryable }
}

// Wallets report a shortfall of funds as WERR_INSUFFICIENT_FUNDS (code 7),
// sometimes with totals. Anything else (e.g. a spending allowance) is not a
// shortfall of funds: keep the wallet's own words so the reader sees why.
function shortfall(error: unknown) {
  const value = (error ?? {}) as { code?: unknown; message?: unknown; totalSatoshisNeeded?: unknown; moreSatoshisNeeded?: unknown }
  const funds = value.code === 'WERR_INSUFFICIENT_FUNDS' || (value.code === 7 && /insufficient funds/i.test(String(value.message ?? ''))) ||
    (value.code === undefined && /insufficient funds/i.test(String(value.message ?? '')))
  if (!funds) return undefined
  // Over a phone bridge the totals survive only in the text, e.g. "(1245 more
  // satoshis are needed, for a total of 2045)".
  const text = String(value.message ?? '').match(/(\d+) more satoshis are needed,? for a total of (\d+)/i)
  const total = typeof value.totalSatoshisNeeded === 'number' ? value.totalSatoshisNeeded : text ? Number(text[2]) : undefined
  const more = typeof value.moreSatoshisNeeded === 'number' ? value.moreSatoshisNeeded : text ? Number(text[1]) : undefined
  return { availableSats: total !== undefined && more !== undefined && total > more ? total - more : undefined }
}
const walletWords = (error: unknown) => {
  const value = (error ?? {}) as { code?: unknown; message?: unknown }
  return `${typeof value.message === 'string' ? value.message.slice(0, 160) : 'no message'}${value.code !== undefined ? ` (code ${String(value.code)})` : ''}`
}
const notEnough = (error: unknown, message: string) => {
  const found = shortfall(error)
  if (!found) return new SessionError(`Your wallet refused: ${walletWords(error)}. Nothing was paid.`, false)
  return Object.assign(new SessionError(`${message} Wallet: ${walletWords(error)}.`, false), { insufficientFunds: found })
}

const MAX_FUNDING_FEE_SATS = 60
// One reading session per wallet identity, across every book.
const keyFor = (identity: string) => `pagestream-session-v2:${identity}`
// Sessions whose change this wallet already received (any device may collect).
const collectedKey = (identity: string) => `pagestream-collected-v1:${identity}`
export const sessionPurchaseTxid = (record: SessionRecord, paid: number) =>
  `channel:${record.channelId}:${paid / record.terms!.price}`

export function createSessionClient(deps: SessionDeps) {
  const { wallet, identityKey } = deps
  const load = (): SessionRecord | undefined => {
    const raw = deps.storage.getItem(keyFor(identityKey))
    return raw ? JSON.parse(raw) : undefined
  }
  const save = (record: SessionRecord) => deps.storage.setItem(keyFor(record.identityKey), JSON.stringify(record))
  const collected = (): string[] => { try { return JSON.parse(deps.storage.getItem(collectedKey(identityKey)) ?? '[]') } catch { return [] } }
  const markCollected = (channelId: string) =>
    deps.storage.setItem(collectedKey(identityKey), JSON.stringify([...new Set([...collected(), channelId])].slice(-200)))
  type Status = { state: string; paid: number; settlementTxid?: string; settlementBeef?: string; readerPrefix?: string; readerSuffix?: string }
  // Receive this wallet's change output from a settlement. Safe because it only
  // accepts an output locked to this wallet's own BRC-29 key for the derivation.
  async function receiveOutput(status: Status, prefix: string, suffix: string, serverIdentity: string) {
    const beef = Utils.toArray(status.settlementBeef!, 'base64')
    const settlement = Transaction.fromAtomicBEEF(beef)
    if (settlement.id('hex') !== status.settlementTxid) throw new SessionError('The settlement did not match its id.', false)
    const own = await selfPaymentScript(wallet, prefix, suffix, serverIdentity)
    const index = settlement.outputs.findIndex(output => output.lockingScript.toHex() === own)
    if (index < 0) return 0
    {
      await wallet.internalizeAction({
        tx: beef, description: 'Pagereader reading session change', labels: ['pagestream channel'],
        outputs: [{ outputIndex: index, protocol: 'wallet payment', paymentRemittance: {
          derivationPrefix: prefix, derivationSuffix: suffix, senderIdentityKey: serverIdentity,
        } }],
      })
    }
    return settlement.outputs[index].satoshis ?? 0
  }
  const api = (edition: string, path: string) => `/api/editions/${encodeURIComponent(edition)}/${path}`
  let credit: SessionPage['credit'] | undefined
  // Serializes page payments, including one started in the background.
  let tail: Promise<unknown> = Promise.resolve()

  async function checkOffer(offer: Offer, capacity: number) {
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (offer.capacity !== capacity || offer.price !== config.priceSats || offer.settlementFee !== config.channel.settlementFeeSats ||
      offer.refundLockTime < nowSeconds + 3600 || offer.refundLockTime > nowSeconds + config.channel.refundDelaySeconds + 86400 ||
      !/^76a914[0-9a-f]{40}88ac$/.test(offer.serverScript))
      throw new SessionError('The server offered different session terms. Nothing was paid.', false)
    // Both channel keys must come from BRC-42 derivation with the server identity.
    const keys = await channelKeys(wallet, offer.channelId, offer.serverIdentity)
    if (keys.own !== offer.readerKey || keys.counterparty !== offer.serverKey)
      throw new SessionError('Session keys did not match your wallet. Nothing was paid.', false)
  }

  // Release the funded new balance and switch to it. Repeatable after a reload.
  async function finishTopUp(record: SessionRecord) {
    const step = record.topUp!
    if (step.stage === 'funded') {
      const sent = await wallet.createAction({
        description: 'Send Pagereader balance top-up', options: { sendWith: [step.next.terms!.fundingTxid], acceptDelayedBroadcast: false },
      })
      const status = sent.sendWithResults?.find(result => result.txid === step.next.terms!.fundingTxid)?.status
      if (status !== 'unproven' && status !== 'sending')
        throw new SessionError(`Wallet broadcast status: ${status ?? 'unknown'}. The top-up will be retried when you reopen the reader.`, true)
      save({ ...record, topUp: { ...step, stage: 'sent' } })
    }
    await deps.authJson(api(record.edition, `channels/${step.childId}/activate`), 'POST', {})
    // The old balance is closed into the new one; it has no separate change to collect.
    markCollected(record.channelId)
    credit = undefined
    save(step.next)
    return step.next
  }

  async function abandon(record: SessionRecord) {
    if (record.reference) await wallet.abortAction({ reference: record.reference }).catch(() => undefined)
    save({ ...record, state: 'abandoned', pending: undefined })
  }

  const client = {
    load,
    remaining(record: SessionRecord) { return record.terms ? maxPaid(record.terms) - record.paid : 0 },
    isOpen() { return load()?.state === 'open' },

    /**
     * One wallet approval for a total `budget`, miner fees included: the session
     * locks budget − MAX_FUNDING_FEE_SATS, so the locked amount plus the opening
     * fee never exceeds the budget. The settling fee comes out of the locked sats.
     * The refund is held before anything is sent.
     */
    async open(edition: string, budget: number = config.channel.capacitySats, firstPage?: number) {
      const capacity = budget - MAX_FUNDING_FEE_SATS
      if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new SessionError('The session amount is too small to cover its fees.', false)
      const existing = load()
      // An interrupted open never reached the server's refund step: cancel it.
      if (existing?.state === 'funding') await abandon(existing)
      else if (existing && ['funded', 'open', 'closing'].includes(existing.state))
        throw new SessionError('A reading session is already open or closing.', false)
      const offer = await deps.authJson<Offer>(api(edition, 'channels'), 'POST', { capacity })
      await checkOffer(offer, capacity)
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
        description: 'Open Pagereader reading session',
        labels: ['pagestream channel'],
        outputs: [{ lockingScript, satoshis: capacity, outputDescription: 'Pagereader reading session' }],
        options: { signAndProcess: false, noSend: true, randomizeOutputs: false, returnTXIDOnly: false },
      }).catch(error => {
        save({ ...record, state: 'abandoned' })
        throw notEnough(error, `Your wallet does not have ${budget} sats free for a reading balance.`)
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
          { fundingBeef: Utils.toBase64(signed.tx), readerScript, signature: Utils.toBase64(zero), readerPrefix, readerSuffix })
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
        description: 'Send Pagereader reading session', options: { sendWith: [record.terms!.fundingTxid], acceptDelayedBroadcast: false },
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

    /**
     * Top up: one wallet approval moves the current balance plus new sats from
     * the wallet into a new balance of `budget` (fees included), paying for the
     * pages already read in the same transaction. Nothing is sent until the
     * server has signed the reader's refund for the new balance.
     */
    topUp(budget: number = config.channel.capacitySats) {
      const run = async (): Promise<SessionRecord> => {
        const record = load()
        if (record?.topUp) return finishTopUp(record)
        if (record?.state !== 'open' || !record.terms) throw new SessionError('There is no open reading balance to top up.', false)
        if (record.pending) throw new SessionError('A page payment is still being confirmed. Try the top-up again in a moment.', true)
        const parent = record.terms, capacity = budget - MAX_FUNDING_FEE_SATS
        const offer = await deps.authJson<Offer & { parent: { channelId: string; fundingTxid: string; fundingVout: number; paid: number; payoutScript: string; inputBeef: string } }>(
          api(record.edition, `channels/${record.channelId}/topup`), 'POST', { capacity })
        await checkOffer(offer, capacity)
        if (offer.parent.channelId !== record.channelId || offer.parent.paid !== record.paid ||
          offer.parent.fundingTxid !== parent.fundingTxid || offer.parent.fundingVout !== parent.fundingVout || offer.parent.payoutScript !== parent.serverScript)
          throw new SessionError('Your balance changed on the server. Nothing was paid; try again.', true)
        const readerPrefix = Utils.toBase64(Random(16)), readerSuffix = Utils.toBase64(Random(16))
        const readerScript = await selfPaymentScript(wallet, readerPrefix, readerSuffix, offer.serverIdentity)
        const balanceScript = fundingScript(offer.readerKey, offer.serverKey).toHex()
        const expect = { paid: record.paid, payoutScript: parent.serverScript, balanceScript, balanceSats: capacity }
        const cancel = async (reference?: string) => {
          if (reference) await wallet.abortAction({ reference }).catch(() => undefined)
          await deps.authJson(api(record.edition, `channels/${offer.channelId}/topup/cancel`), 'POST', {}).catch(() => undefined)
        }
        let created
        try {
          created = await wallet.createAction({
            description: 'Top up Pagereader reading balance', labels: ['pagestream channel'],
            inputBEEF: Utils.toArray(offer.parent.inputBeef, 'base64'),
            inputs: [{ outpoint: `${parent.fundingTxid}.${parent.fundingVout}`, unlockingScriptLength: 146, inputDescription: 'Pagereader reading balance' }],
            outputs: [
              ...(record.paid > 0 ? [{ lockingScript: parent.serverScript, satoshis: record.paid, outputDescription: 'Pages read' }] : []),
              { lockingScript: balanceScript, satoshis: capacity, outputDescription: 'Pagereader reading balance' },
            ],
            options: { signAndProcess: false, noSend: true, randomizeOutputs: false, returnTXIDOnly: false },
          })
        } catch (error) {
          await cancel()
          throw notEnough(error, `Your wallet does not have enough free sats to top up to ${budget}.`)
        }
        const signable = created.signableTransaction
        if (!signable) { await cancel(); throw new SessionError('The wallet did not prepare the top-up. Nothing was sent.', true) }
        let next: SessionRecord, fee: number
        try {
          const template = checkTopUp(parent, signable.tx, expect)
          fee = networkFee(Transaction.fromAtomicBEEF(signable.tx)) ?? -1
          if (fee < 0 || fee > MAX_FUNDING_FEE_SATS) throw new SessionError(`Top-up miner fee ${fee < 0 ? 'unknown' : fee} exceeds ${MAX_FUNDING_FEE_SATS} sats. Nothing was sent.`, false)
          const readerSignature = await signChannelHash(wallet, parent, template.sighash, record.serverIdentity)
          const { serverSignature } = await deps.authJson<{ serverSignature: string }>(api(record.edition, `channels/${offer.channelId}/topup/countersign`), 'POST',
            { tx: Utils.toBase64(signable.tx), readerSignature: Utils.toBase64(readerSignature) })
          const server = Utils.toArray(serverSignature, 'base64')
          if (!verifyChannelHash(parent.serverKey, template.sighash, server)) throw new SessionError('The server signature was invalid. Nothing was sent.', false)
          const signed = await wallet.signAction({ reference: signable.reference,
            spends: { [template.inputIndex]: { unlockingScript: channelUnlock(readerSignature, server).toHex() } },
            options: { noSend: true, returnTXIDOnly: false } })
          if (!signed.tx) throw new SessionError('The wallet returned no signed top-up. Nothing was sent.', false)
          const final = checkTopUp(parent, signed.tx, expect)
          const terms = validateTerms({
            channelId: offer.channelId, fundingTxid: final.txid, fundingVout: final.balanceVout, capacity,
            readerKey: offer.readerKey, serverKey: offer.serverKey, readerScript, serverScript: offer.serverScript,
            price: offer.price, settlementFee: offer.settlementFee, refundLockTime: offer.refundLockTime,
          })
          const zero = await signChannel(wallet, terms, stateTransaction(terms, 0), offer.serverIdentity)
          const funded = await deps.authJson<{ terms: ChannelTerms; refundSignature: string }>(api(record.edition, `channels/${offer.channelId}/fund`), 'POST',
            { fundingBeef: Utils.toBase64(signed.tx), readerScript, signature: Utils.toBase64(zero), readerPrefix, readerSuffix })
          if (JSON.stringify(funded.terms) !== JSON.stringify(terms) ||
            !verifyChannel(terms, refundTransaction(terms), terms.serverKey, Utils.toArray(funded.refundSignature, 'base64')))
            throw new SessionError('The server refund guarantee was invalid. Nothing was sent.', false)
          next = { identityKey, edition: record.edition, channelId: offer.channelId, serverIdentity: offer.serverIdentity, state: 'open',
            terms, fundingFeeSats: fee, readerPrefix, readerSuffix, refundSignature: funded.refundSignature, paid: 0, openedAt: Date.now() }
        } catch (error) { await cancel(signable.reference); throw error }
        // The refund for the new balance is held: from here the top-up only goes forward.
        const progressing = { ...record, topUp: { childId: offer.channelId, stage: 'funded' as const, next } }
        save(progressing)
        return finishTopUp(progressing)
      }
      const result = tail.then(run, run)
      tail = result.catch(() => undefined)
      return result
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
        let record = load()
        if (record?.topUp) record = await finishTopUp(record)
        if (record?.state !== 'open' || !record.terms) throw new SessionError('No open reading session.', false)
        if (record.pending && (record.pending.page !== page || record.pending.edition !== edition)) {
          // Finish the earlier signed page first (any book); it may already be accepted.
          const earlier = await send(record, record.pending)
          onAccepted?.(earlier, load()!)
          record = load()!
        }
        const paid = record.pending?.paid ?? record.paid + record.terms!.price
        if (paid > maxPaid(record.terms!)) throw new SessionError('This reading session is spent. End it to receive your change, then open another.', false)
        const pending = record.pending ?? { paid, edition, page, signature: Utils.toBase64(
          await signChannel(wallet, record.terms!, stateTransaction(record.terms!, paid), record.serverIdentity)) }
        save({ ...record, pending })
        const body = await send(record, pending)
        onAccepted?.(body, load()!)
        return body
      }
      const result = tail.then(run, run)
      tail = result.catch(() => undefined)
      return result
    },

    /**
     * Collect change from settled sessions this device has no record of (for
     * example after its saved data was cleared), using details the server kept.
     */
    async collectSettled(sessions: { channelId: string; edition: string }[], serverIdentity: string) {
      const done = new Set(collected()), local = load()
      let received = 0
      for (const { channelId, edition } of sessions) {
        if (done.has(channelId) || local?.channelId === channelId) continue
        const status = await deps.authJson<Status>(api(edition, `channels/${channelId}`), 'GET')
        if (status.state !== 'settled' || !status.settlementBeef || !status.readerPrefix || !status.readerSuffix) continue
        received += await receiveOutput(status, status.readerPrefix, status.readerSuffix, serverIdentity)
        markCollected(channelId)
      }
      return received
    },

    /**
     * Rejoin a session opened in an earlier visit (reload or return) while the
     * server still has it open: no new wallet approval. Anything else is closed
     * so its change can be received.
     */
    async resume() {
      const pendingTopUp = load()
      if (pendingTopUp?.topUp) await finishTopUp(pendingTopUp).catch(() => undefined)
      const record = load()
      if (record?.state !== 'open' || !record.terms) return record
      const status = await deps.authJson<{ state: string; paid: number }>(api(record.edition, `channels/${record.channelId}`), 'GET')
      if (status.state === 'open') {
        if (status.paid === record.paid) return record
        // A page signed just before leaving may have been accepted.
        if (record.pending?.paid === status.paid) {
          save({ ...record, paid: status.paid, pending: undefined })
          return load()
        }
      }
      if (status.state === 'open') {
        // Local and server state disagree: settle now rather than guess.
        await client.close()
        return load()
      }
      save({ ...record, state: 'closing', pending: undefined })
      return load()
    },

    /** Stop paying: the server settles the latest signed state. Safe to repeat. */
    async close(beacon?: (url: string) => boolean) {
      const record = load()
      if (!record || !['open', 'funded', 'closing'].includes(record.state)) return record
      credit = undefined
      const url = `/api/channels/${record.channelId}/close`
      save({ ...record, state: 'closing' })
      if (beacon) { beacon(url); return load() }
      const response = await deps.post(url, {})
      if (!response.ok) throw new SessionError('The session could not be settled yet. It settles automatically after 10 minutes.', true)
      return load()
    },

    /** Receive the change output of a settled session into the reader's wallet. */
    async receiveChange() {
      const record = load()
      if (!record?.terms || !['funded', 'closing', 'settled'].includes(record.state)) return record
      const status = await deps.authJson<{ state: string; paid: number; settlementTxid?: string; settlementBeef?: string }>(
        api(record.edition, `channels/${record.channelId}`), 'GET')
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
          tx: Utils.toArray(status.settlementBeef, 'base64'), description: 'Pagereader reading session change',
          labels: ['pagestream channel'],
          outputs: [{ outputIndex: changeIndex, protocol: 'wallet payment', paymentRemittance: {
            derivationPrefix: record.readerPrefix, derivationSuffix: record.readerSuffix, senderIdentityKey: record.serverIdentity,
          } }],
        })
      const done = { ...record, state: 'received' as const, paid: status.paid, pending: undefined, settlementTxid: status.settlementTxid }
      save(done)
      markCollected(record.channelId)
      return done
    },
  }

  async function send(record: SessionRecord, pending: NonNullable<SessionRecord['pending']>): Promise<SessionPage> {
    let response: Response
    try {
      response = await deps.post('/api/channel-pages', {
        channelId: record.channelId, editionId: pending.edition, page: pending.page, paid: pending.paid, signature: pending.signature,
      })
    } catch {
      throw new SessionError('The page payment did not reach the server. It is kept and will be resent; no second payment is made.', true)
    }
    const body = await response.json().catch(() => ({})) as SessionPage & { error?: string; code?: string; channel?: { paid: number } }
    if (body.code === 'SESSION_CLOSED') {
      // Settled by the server (idle or closed elsewhere); change is received next.
      credit = undefined
      save({ ...load()!, state: 'closing', pending: undefined })
      throw new SessionError('Your reading session has ended, so this page was not paid. Your unspent sats are being returned.', false)
    }
    if (!response.ok) {
      // A definitive refusal never consumed this state; the same amount is reused.
      if (response.status === 400 || response.status === 402 || response.status === 409)
        save({ ...load()!, pending: undefined })
      throw new SessionError(body.error ?? 'The page payment was refused.', response.status >= 500)
    }
    if (body.page !== pending.page || body.editionId !== pending.edition || body.channel?.paid !== pending.paid ||
      body.purchase?.page !== pending.page || !Array.isArray(body.paragraphs))
      throw new SessionError('Server returned a different page. Your current text is kept.', false)
    const current = load()!
    save({ ...current, paid: pending.paid, pending: undefined })
    credit = body.credit?.editionId === pending.edition && body.credit.page === pending.page + 1 &&
      Array.isArray(body.credit.paragraphs) ? body.credit : undefined
    return body
  }
  return client
}
export type SessionClient = ReturnType<typeof createSessionClient>
