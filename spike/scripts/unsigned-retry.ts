import type { PaymentAttempt } from '../src/payment-action.js'

export function assertUnsignedRetry(previous: { attempt?: PaymentAttempt; finishedAt?: unknown; error?: unknown }, current: { identityKey: string; edition: string; page: number; intent?: { request_id: string; state: string; txid?: string | null } }) {
  const prior = previous.attempt
  if (!previous.finishedAt || !previous.error || prior?.identityKey !== current.identityKey || prior.edition !== current.edition || prior.page !== current.page || prior.state !== 'preparing' || prior.reference || prior.txid || prior.proof || current.intent?.request_id !== prior.requestId || current.intent.state !== 'challenged' || current.intent.txid) throw new Error('Not an eligible unsigned-only interrupted run')
  return prior.requestId
}

export function assertNoActiveWalletActions(result: { totalActions: number; actions: { status: string }[] }) {
  if (result.totalActions > result.actions.length || result.actions.some(action => action.status !== 'completed')) throw new Error('Wallet has active/unknown actions; unsigned retry refused')
}
