import { LockingScript, MerklePath, P2PKH, PrivateKey, ProtoWallet, Transaction, UnlockingScript, type WalletInterface } from '@bsv/sdk'
import type { SessionWallet } from '../../../app/client/src/payments/channel-session.js'

// Synthetic reader wallet: real BRC-42 keys and signatures (ProtoWallet), plus a
// minimal unsigned → signed → sendWith action flow over a fake proven parent.
export function readerWallet(keyOrHex: PrivateKey | string = PrivateKey.fromRandom()) {
  const key = typeof keyOrHex === 'string' ? PrivateKey.fromHex(keyOrHex) : keyOrHex
  const proto = new ProtoWallet(key)
  const coin = PrivateKey.fromRandom()
  const calls: string[] = [], internalized: unknown[] = []
  let pending: Transaction | undefined
  const wallet = {
    getPublicKey: proto.getPublicKey.bind(proto), createSignature: proto.createSignature.bind(proto),
    async createAction(args: Parameters<WalletInterface['createAction']>[0]) {
      calls.push(args.options?.sendWith ? 'sendWith' : 'createAction')
      if (args.options?.sendWith) return { sendWithResults: args.options.sendWith.map(txid => ({ txid, status: 'unproven' as const })) }
      const parent = new Transaction(1, [{ sourceTXID: '33'.repeat(32), sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScript: new UnlockingScript() }],
        [{ satoshis: 100_000, lockingScript: new P2PKH().lock(coin.toAddress()) }])
      parent.merklePath = new MerklePath(900_000, [[{ offset: 0, hash: parent.id('hex'), txid: true }]])
      const output = args.outputs![0]
      pending = new Transaction(1, [{ sourceTransaction: parent, sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScriptTemplate: new P2PKH().unlock(coin) }],
        [{ satoshis: output.satoshis, lockingScript: LockingScript.fromHex(output.lockingScript) },
          { satoshis: 100_000 - output.satoshis - 25, lockingScript: new P2PKH().lock(coin.toAddress()) }])
      await pending.sign()
      return { signableTransaction: { reference: 'ref-1', tx: pending.toAtomicBEEF() } }
    },
    async signAction() { calls.push('signAction'); return { tx: pending!.toAtomicBEEF() } },
    async abortAction() { calls.push('abortAction'); return { aborted: true as const } },
    async internalizeAction(args: unknown) { calls.push('internalizeAction'); internalized.push(args); return { accepted: true as const } },
  }
  return { wallet: wallet as unknown as SessionWallet, proto, calls, internalized, identity: key.toPublicKey().toString() }
}

