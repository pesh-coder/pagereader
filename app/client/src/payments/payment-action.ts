import { Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { config } from './config.js'
import { networkFee } from './payment-cost.js'

export interface PaymentAttempt {
  identityKey: string
  edition: string
  page: number
  requestId: string
  state:
    | 'reserved'
    | 'preparing'
    | 'prepared'
    | 'signing'
    | 'signed'
    | 'confirmed'
    | 'aborted'
  retryReason?: 'cancelled' | 'insufficient-funds' | 'fee-limit'
  walletRequestStarted?: boolean
  lastFailure?: { method: string; code?: number | string }
  reference?: string
  txid?: string
  feeSats?: number
  proof?: {
    derivationPrefix: string
    derivationSuffix: string
    transaction: string
  }
}
export interface AttemptJournal {
  get(): PaymentAttempt | undefined
  save(attempt: PaymentAttempt): void
}

// The wallet signs without broadcasting. Persist the complete BRC-105 proof before
// sendWith can release this exact transaction. Never substitute a fresh action.
export async function preparePayment(
  wallet: WalletInterface,
  args: Parameters<WalletInterface['createAction']>[0],
  journal: AttemptJournal,
  originator?: string,
) {
  const attempt = journal.get()
  if (
    !attempt ||
    !['reserved', 'preparing'].includes(attempt.state) ||
    attempt.walletRequestStarted
  )
    throw new Error(
      'No fresh durable payment attempt; reconcile the existing payment',
    )
  if (
    args.outputs?.length !== 1 ||
    args.outputs[0].satoshis !== config.priceSats
  )
    throw new Error('Unexpected page price')
  const remittance = JSON.parse(args.outputs[0].customInstructions ?? '{}')
  if (
    typeof remittance.derivationPrefix !== 'string' ||
    typeof remittance.derivationSuffix !== 'string'
  )
    throw new Error('Missing payment remittance')
  journal.save({ ...attempt, state: 'preparing', walletRequestStarted: true })
  let result
  try {
    result = await wallet.createAction(
      {
        ...args,
        options: {
          ...args.options,
          knownTxids: [],
          signAndProcess: false,
          noSend: true,
          returnTXIDOnly: false,
        },
      },
      originator,
    )
  } catch (error) {
    // Only explicit wallet refusals qualify. HTTP 400, timeouts and generic
    // transport errors do not establish that no wallet action was created.
    const code =
      error && typeof error === 'object'
        ? (error as { code?: unknown }).code
        : undefined
    if (code === 7 || code === 'WERR_INSUFFICIENT_FUNDS') {
      journal.save({
        ...attempt,
        state: 'aborted',
        retryReason: 'insufficient-funds',
      })
    } else if (code === 'ERR_PERMISSION_DENIED') {
      journal.save({ ...attempt, state: 'aborted', retryReason: 'cancelled' })
    }
    throw error
  }
  const signable = result.signableTransaction
  if (!signable || result.txid || result.tx)
    throw new Error(
      'Wallet did not return an unsigned action; reconcile before continuing',
    )
  const prepared = {
    ...attempt,
    reference: signable.reference,
    state: 'prepared' as const,
  }
  let feeRejected = false
  try {
    journal.save(prepared)
    const template = Transaction.fromAtomicBEEF(signable.tx)
    const fee = networkFee(template)
    if (fee == null || fee > config.provisional.maxPageFeeSats) {
      feeRejected = true
      throw new Error(
        `Page miner fee ${fee ?? 'unknown'} exceeds the ${config.provisional.maxPageFeeSats}-sat limit. Lower the wallet fee rate before retrying.`,
      )
    }
    if (
      template.outputs[0]?.satoshis !== config.priceSats ||
      template.outputs[0]?.lockingScript.toHex() !==
        args.outputs[0].lockingScript
    )
      throw new Error('Wallet changed the payment output')
    journal.save({ ...prepared, feeSats: fee, state: 'signing' })
    // A lost result here is unresolved, but noSend prevents an unseen broadcast.
    const signed = await wallet.signAction(
      {
        reference: signable.reference,
        spends: {},
        options: { noSend: true, returnTXIDOnly: false },
      },
      originator,
    )
    if (!signed.tx)
      throw new Error(
        'Signed payment proof missing; do not create another payment',
      )
    const tx = Transaction.fromAtomicBEEF(signed.tx)
    if (networkFee(tx) !== fee || !sameTemplate(template, tx))
      throw new Error(
        'Signed transaction differs from the checked fee/template; payment remains unsent',
      )
    const txid = tx.id('hex')
    journal.save({
      ...prepared,
      state: 'signed',
      feeSats: fee,
      txid,
      proof: {
        derivationPrefix: remittance.derivationPrefix,
        derivationSuffix: remittance.derivationSuffix,
        transaction: Utils.toBase64(signed.tx),
      },
    })
    return { txid, tx: signed.tx }
  } catch (error) {
    // Only abort before signing begins. An uncertain signed action is retained.
    if (journal.get()?.state === 'prepared') {
      const aborted = await wallet.abortAction(
        { reference: signable.reference },
        originator,
      )
      if (aborted.aborted)
        journal.save({
          ...prepared,
          state: 'aborted',
          retryReason: feeRejected ? 'fee-limit' : 'cancelled',
        })
    }
    throw error
  }
}

export async function broadcastPayment(
  wallet: WalletInterface,
  attempt: PaymentAttempt,
  originator?: string,
) {
  if (attempt.state !== 'signed' || !attempt.proof || !attempt.txid)
    throw new Error('No durable signed payment to send')
  // Official sendWith-only form: no inputs/outputs, so no new transaction or fee.
  return wallet.createAction(
    {
      description: 'Send saved Pagestream payment',
      options: { sendWith: [attempt.txid], acceptDelayedBroadcast: false },
    },
    originator,
  )
}

function sameTemplate(a: Transaction, b: Transaction) {
  return (
    a.version === b.version &&
    a.lockTime === b.lockTime &&
    a.inputs.length === b.inputs.length &&
    a.outputs.length === b.outputs.length &&
    a.inputs.every(
      (input, i) =>
        input.sourceTXID === b.inputs[i].sourceTXID &&
        input.sourceOutputIndex === b.inputs[i].sourceOutputIndex &&
        input.sequence === b.inputs[i].sequence,
    ) &&
    a.outputs.every(
      (output, i) =>
        output.satoshis === b.outputs[i].satoshis &&
        output.lockingScript.toHex() === b.outputs[i].lockingScript.toHex(),
    )
  )
}
