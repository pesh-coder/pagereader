import { LockingScript, MerklePath, P2PKH, PrivateKey, ProtoWallet, Transaction, UnlockingScript, type WalletInterface } from '@bsv/sdk'
import type { SessionWallet } from '../../../app/client/src/payments/channel-session.js'

// Synthetic reader wallet: real BRC-42 keys and signatures (ProtoWallet), plus a
// minimal unsigned → signed → sendWith action flow over a fake proven coin.
// Supports app-supplied inputs (inputBEEF + unlockingScriptLength, unlocked in
// signAction), as BRC-100 wallets do for top-ups.
export function readerWallet(keyOrHex: PrivateKey | string = PrivateKey.fromRandom()) {
  const key = typeof keyOrHex === 'string' ? PrivateKey.fromHex(keyOrHex) : keyOrHex
  const proto = new ProtoWallet(key)
  const coin = PrivateKey.fromRandom()
  const calls: string[] = [], internalized: unknown[] = [], created: Parameters<WalletInterface['createAction']>[0][] = []
  let pending: Transaction | undefined
  let fundingSats = 0
  const FEE = 25
  const wallet = {
    getPublicKey: proto.getPublicKey.bind(proto), createSignature: proto.createSignature.bind(proto),
    async createAction(args: Parameters<WalletInterface['createAction']>[0]) {
      calls.push(args.options?.sendWith ? 'sendWith' : 'createAction')
      if (args.options?.sendWith) return { sendWithResults: args.options.sendWith.map(txid => ({ txid, status: 'unproven' as const })) }
      created.push(args)
      const funding = new Transaction(1, [{ sourceTXID: '33'.repeat(32), sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScript: new UnlockingScript() }],
        [{ satoshis: 100_000, lockingScript: new P2PKH().lock(coin.toAddress()) }])
      funding.merklePath = new MerklePath(900_000, [[{ offset: 0, hash: funding.id('hex'), txid: true }]])
      // App-supplied inputs come first, unlocked later; the wallet adds one coin.
      const appInputs = (args.inputs ?? []).map(input => {
        const [txid, vout] = input.outpoint.split('.')
        const source = Transaction.fromAtomicBEEF(Array.from(args.inputBEEF!))
        if (source.id('hex') !== txid) throw new Error('inputBEEF does not contain the input')
        return { sourceTransaction: source, sourceOutputIndex: Number(vout), sequence: 0xffffffff, unlockingScript: new UnlockingScript() }
      })
      const appIn = appInputs.reduce((sum, input) => sum + input.sourceTransaction.outputs[input.sourceOutputIndex].satoshis!, 0)
      const outputs = args.outputs!.map(output => ({ satoshis: output.satoshis, lockingScript: LockingScript.fromHex(output.lockingScript) }))
      const out = outputs.reduce((sum, output) => sum + output.satoshis, 0)
      fundingSats = out - appIn + FEE
      pending = new Transaction(1, [...appInputs, { sourceTransaction: funding, sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScriptTemplate: new P2PKH().unlock(coin) }],
        [...outputs, { satoshis: 100_000 - fundingSats, lockingScript: new P2PKH().lock(coin.toAddress()) }])
      if (!appInputs.length) await pending.sign()
      const signableTx = appInputs.length
        ? new Transaction(1, pending.inputs.map(input => ({ ...input, unlockingScript: new UnlockingScript(), unlockingScriptTemplate: undefined })), pending.outputs)
        : pending
      return { signableTransaction: { reference: 'ref-1', tx: signableTx.toAtomicBEEF() } }
    },
    async signAction(args: Parameters<WalletInterface['signAction']>[0]) {
      calls.push('signAction')
      for (const [index, spend] of Object.entries(args.spends ?? {})) pending!.inputs[Number(index)].unlockingScript = UnlockingScript.fromHex(spend.unlockingScript)
      if (Object.keys(args.spends ?? {}).length) await pending!.sign()
      return { tx: pending!.toAtomicBEEF() }
    },
    async abortAction() { calls.push('abortAction'); return { aborted: true as const } },
    async internalizeAction(args: unknown) { calls.push('internalizeAction'); internalized.push(args); return { accepted: true as const } },
  }
  return { wallet: wallet as unknown as SessionWallet, proto, calls, internalized, created, identity: key.toPublicKey().toString(),
    /** Sats the wallet itself contributed to its last action (fee included). */
    lastFundingSats: () => fundingSats }
}
