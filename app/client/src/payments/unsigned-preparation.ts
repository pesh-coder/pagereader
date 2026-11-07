import type { PaymentAttempt } from './payment-action.js'

export function eligibleUnsignedPreparation(attempt: PaymentAttempt | undefined, identityKey: string, edition: string, page: number, requestId: string) {
  return Boolean(attempt && attempt.identityKey === identityKey && attempt.edition === edition && attempt.page === page &&
    attempt.requestId === requestId && attempt.state === 'preparing' && attempt.walletRequestStarted === true &&
    attempt.lastFailure?.method === 'createAction' && attempt.lastFailure.code === 'WERR_INVALID_OPERATION' &&
    !attempt.reference && !attempt.txid && !attempt.proof && !attempt.broadcast)
}

// The only failed call was unsigned createAction(noSend, signAndProcess:false).
// No signing, abort, input release, broadcast, or new action is performed here.
export async function reconcileUnsignedPreparation(options: {
  identityKey: string; edition: string; page: number; requestId: string;
  get(): PaymentAttempt | undefined; save(attempt: PaymentAttempt): void;
  historyFingerprint(): Promise<string>; recheck(): Promise<boolean>;
}) {
  const { identityKey, edition, page, requestId } = options
  const prior = options.get()
  if (!eligibleUnsignedPreparation(prior, identityKey, edition, page, requestId)) return false
  const snapshot = JSON.stringify(prior)
  const before = await options.historyFingerprint()
  if (!(await options.recheck())) return false
  const after = await options.historyFingerprint()
  if (before !== after || snapshot !== JSON.stringify(options.get())) return false
  options.save({ ...prior!, state: 'aborted', retryReason: 'unsigned-not-created' })
  return true
}
