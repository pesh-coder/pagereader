// Release coins a wallet still reserves for Pagereader's own unfinished page
// payments. The old per-page flow prepared each payment unsent (noSend); if the
// reader rejected a prompt or the page closed mid-way, the wallet could keep
// those inputs reserved, showing a balance it would not spend. Only journal
// entries this app wrote, holding a wallet reference and never sent anywhere,
// are cancelled; a signed proof, a txid or a broadcast record is never touched.
import type { WalletInterface } from '@bsv/sdk'
import type { PaymentAttempt } from './payment-action.js'

const UNSENT = new Set<PaymentAttempt['state']>(['prepared', 'signing'])

export async function releaseUnsentPreparations(options: {
  identityKey: string
  wallet: Pick<WalletInterface, 'abortAction'>
  storage: Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>
  originator?: string
}) {
  const prefix = `pagestream-payment-v2:${options.identityKey}:`
  const keys: string[] = []
  for (let index = 0; index < options.storage.length; index++) {
    const key = options.storage.key(index)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  let released = 0
  for (const key of keys) {
    let attempt: PaymentAttempt
    try { attempt = JSON.parse(options.storage.getItem(key) ?? 'null') } catch { continue }
    if (!attempt || attempt.identityKey !== options.identityKey || !UNSENT.has(attempt.state) || !attempt.reference ||
      attempt.proof || attempt.txid || attempt.broadcast) continue
    try {
      const result = await options.wallet.abortAction({ reference: attempt.reference }, options.originator)
      if (!result.aborted) continue
    } catch { continue } // Unknown to the wallet or already gone: leave the record for review.
    options.storage.setItem(key, JSON.stringify({ ...attempt, state: 'aborted', retryReason: 'cancelled' } satisfies PaymentAttempt))
    released++
  }
  return released
}
