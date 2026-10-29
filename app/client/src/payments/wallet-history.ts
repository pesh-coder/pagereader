import type { WalletInterface } from '@bsv/sdk'

export interface ActionCost {
  txid: string
  debitSats: number
  status: string
}
interface ActionSummary {
  txid: string
  satoshis: number
  isOutgoing: boolean
  status: string
}

// No label filter: old wallets attribute the same app to hostname and host:port.
// Return costs only, not unrelated descriptions, labels, inputs or key material.
// A partial/unstable history must never silently replace a complete cost view.
async function readHistory(
  wallet: Pick<WalletInterface, 'listActions'>,
  seekPermission = false,
): Promise<ActionSummary[]> {
  const actions: ActionSummary[] = []
  const seen = new Set<string>()
  let expected: number | undefined
  for (let offset = 0; ; offset += 100) {
    const result = await wallet.listActions({
      labels: [],
      seekPermission,
      limit: 100,
      offset,
    })
    if (
      !Number.isSafeInteger(result.totalActions) ||
      result.totalActions < 0 ||
      result.totalActions > 10000 ||
      (expected !== undefined && expected !== result.totalActions) ||
      !Array.isArray(result.actions) ||
      result.actions.length > 100
    )
      throw new Error(
        'Wallet history changed or is incomplete. Existing costs were kept; try the read-only check again.',
      )
    expected = result.totalActions
    for (const action of result.actions) {
      if (
        !/^[a-f0-9]{64}$/.test(action.txid) ||
        seen.has(action.txid) ||
        !Number.isSafeInteger(action.satoshis) ||
        typeof action.isOutgoing !== 'boolean' ||
        typeof action.status !== 'string'
      )
        throw new Error(
          'Wallet returned inconsistent history. Existing costs were kept.',
        )
      seen.add(action.txid)
      actions.push({
        txid: action.txid,
        satoshis: action.satoshis,
        isOutgoing: action.isOutgoing,
        status: action.status,
      })
    }
    if (seen.size === expected) return actions
    if (seen.size > expected || result.actions.length !== 100)
      throw new Error(
        'Wallet history was incomplete. Existing costs were kept.',
      )
  }
}

export async function readActionCosts(
  wallet: Pick<WalletInterface, 'listActions'>,
): Promise<ActionCost[]> {
  return (await readHistory(wallet))
    .filter((action) => action.isOutgoing && action.satoshis < 0)
    .map((action) => ({
      txid: action.txid,
      debitSats: -action.satoshis,
      status: action.status,
    }))
}

// Narrow reconciliation for a funded wallet that has never spent. Do not use
// absence of a server receipt, an empty/partial history, or a label filter as
// evidence that an older wallet payment is safe to replace.
export async function verifyIncomingOnlyHistory(
  wallet: Pick<WalletInterface, 'listActions'>,
): Promise<void> {
  const actions = await readHistory(wallet, true)
  if (
    actions.length === 0 ||
    !actions.some((action) => action.satoshis > 0) ||
    actions.some((action) =>
      action.isOutgoing || action.satoshis < 0 || action.status !== 'completed',
    )
  )
    throw new Error(
      'The wallet history could not confirm a received-funds-only wallet. The original payment remains blocked; no new payment was created.',
    )
}
