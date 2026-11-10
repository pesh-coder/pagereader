import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BigNumber, Curve, LockingScript, P2PKH, PrivateKey, ProtoWallet, Random, Signature, Transaction, UnlockingScript, Utils } from '@bsv/sdk'
import {
  CHANNEL_PROTOCOL, ChannelReceiver, fundingScript, maxPaid, channelUnlock, refundTransaction, scriptValid,
  signChannel, stateTransaction, verifyChannel, type ChannelTerms,
} from '../src/payment-channel.js'

async function openChannel(capacity = 5000) {
  const reader = new ProtoWallet(PrivateKey.fromRandom()), server = new ProtoWallet(PrivateKey.fromRandom())
  const readerId = (await reader.getPublicKey({ identityKey: true })).publicKey
  const serverId = (await server.getPublicKey({ identityKey: true })).publicKey
  const channelId = Utils.toHex(Random(16)), keyID = channelId, protocolID = CHANNEL_PROTOCOL
  const readerKey = (await reader.getPublicKey({ protocolID, keyID, counterparty: serverId, forSelf: true })).publicKey
  const serverKey = (await server.getPublicKey({ protocolID, keyID, counterparty: readerId, forSelf: true })).publicKey
  // Synthetic funding parent; only its 2-of-2 output is spent here.
  const funding = new Transaction(1, [{ sourceTXID: '11'.repeat(32), sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScript: new UnlockingScript() }],
    [{ satoshis: capacity, lockingScript: LockingScript.fromHex(fundingScript(readerKey, serverKey).toHex()) }])
  const terms: ChannelTerms = {
    channelId, fundingTxid: funding.id('hex'), fundingVout: 0, capacity, readerKey, serverKey,
    readerScript: new P2PKH().lock(PrivateKey.fromRandom().toAddress()).toHex(),
    serverScript: new P2PKH().lock(PrivateKey.fromRandom().toAddress()).toHex(),
    price: 5, settlementFee: 40, refundLockTime: 1_900_000_000,
  }
  return { reader, server, readerId, serverId, terms }
}

const pay = async (c: Awaited<ReturnType<typeof openChannel>>, paid: number) =>
  signChannel(c.reader, c.terms, stateTransaction(c.terms, paid), c.serverId)

test('server derives the reader channel key from the reader identity, binding the channel to that identity', async () => {
  const c = await openChannel()
  const derived = (await c.server.getPublicKey({ protocolID: CHANNEL_PROTOCOL, keyID: c.terms.channelId, counterparty: c.readerId })).publicKey
  assert.equal(derived, c.terms.readerKey)
})

test('50 sequential pages need one reader signature each and settle as one script-valid transaction', async () => {
  const c = await openChannel(), receiver = new ChannelReceiver(c.terms)
  for (let page = 1; page <= 50; page++) assert.equal(receiver.accept(page * 5, await pay(c, page * 5)), page)
  const settlement = await receiver.settle(c.server, c.readerId)
  assert.equal(scriptValid(c.terms, settlement), true)
  assert.equal(settlement.lockTime, 0); assert.equal(settlement.inputs[0].sequence, 0xffffffff)
  assert.deepEqual(settlement.outputs.map(o => o.satoshis), [250, 5000 - 40 - 250])
  assert.equal(settlement.outputs[0].lockingScript.toHex(), c.terms.serverScript)
  assert.equal(settlement.outputs[1].lockingScript.toHex(), c.terms.readerScript)
})

test('receiver refuses skipped, repeated-lower, wrong-amount, wrong-key, corrupted and over-capacity payments', async () => {
  const c = await openChannel(60), receiver = new ChannelReceiver(c.terms)
  receiver.accept(5, await pay(c, 5))
  await assert.rejects(async () => receiver.accept(15, await pay(c, 15)), /exactly one page/)
  await assert.rejects(async () => receiver.accept(0, await pay(c, 0)), /exactly one page/)
  // A valid signature for 10 sats cannot be claimed as a different state.
  const ten = await pay(c, 10)
  assert.equal(verifyChannel(c.terms, stateTransaction(c.terms, 15), c.terms.readerKey, ten), false)
  // The server's own key cannot pay on the reader's behalf.
  const forged = await signChannel(c.server, c.terms, stateTransaction(c.terms, 10), c.readerId)
  assert.throws(() => receiver.accept(10, forged), /Invalid channel signature/)
  const corrupt = [...ten]; corrupt[corrupt.length - 1] ^= 1
  assert.throws(() => receiver.accept(10, corrupt), /Invalid channel signature/)
  assert.equal(receiver.accept(10, ten), 2)
  // Capacity 60 - fee 40 leaves 20 sats: exactly four pages.
  assert.equal(maxPaid(c.terms), 20)
  receiver.accept(15, await pay(c, 15)); receiver.accept(20, await pay(c, 20))
  assert.throws(() => stateTransaction(c.terms, 25), /Invalid channel payment/)
  assert.throws(() => receiver.accept(25, ten), /capacity exhausted/)
})

test('replaying the latest state is idempotent and never counts a page twice', async () => {
  const c = await openChannel(), receiver = new ChannelReceiver(c.terms)
  const first = await pay(c, 5)
  receiver.accept(5, first)
  assert.equal(receiver.accept(5, first), 1)
  assert.equal(receiver.paid, 5)
})

test('malleated high-S signatures are refused so settlement stays standard', async () => {
  const c = await openChannel()
  const der = await pay(c, 5), sig = Signature.fromDER(der)
  const n = new Curve().n as BigNumber
  const high = new Signature(sig.r, n.sub(sig.s)).toDER() as number[]
  assert.equal(verifyChannel(c.terms, stateTransaction(c.terms, 5), c.terms.readerKey, der), true)
  assert.equal(verifyChannel(c.terms, stateTransaction(c.terms, 5), c.terms.readerKey, high), false)
})

test('the pre-signed refund is time-locked, non-final and script-valid once the reader adds their signature', async () => {
  const c = await openChannel(), refund = refundTransaction(c.terms)
  const serverSig = await signChannel(c.server, c.terms, refund, c.readerId)
  // Reader checks the server's refund signature before ever funding the channel.
  assert.equal(verifyChannel(c.terms, refund, c.terms.serverKey, serverSig), true)
  refund.inputs[0].unlockingScript = channelUnlock(await signChannel(c.reader, c.terms, refund, c.serverId), serverSig)
  assert.equal(scriptValid(c.terms, refund), true)
  assert.equal(refund.lockTime, 1_900_000_000)
  assert.ok(refund.inputs[0].sequence! < 0xffffffff)
  assert.deepEqual(refund.outputs.map(o => o.satoshis), [4960])
})

test('a settlement with a wrong countersignature fails the script interpreter', async () => {
  const c = await openChannel(), tx = stateTransaction(c.terms, 5)
  const reader = await pay(c, 5)
  tx.inputs[0].unlockingScript = channelUnlock(reader, reader)
  assert.equal(scriptValid(c.terms, tx), false)
})
