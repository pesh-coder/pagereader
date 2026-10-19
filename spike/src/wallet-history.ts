import type { WalletInterface } from '@bsv/sdk'

export interface ActionCost { txid: string; debitSats: number; status: string }

// No label filter: old wallets attribute the same app to hostname and host:port.
// Return costs only, not unrelated descriptions, labels, inputs or key material.
// A partial/unstable history must never silently replace a complete cost view.
export async function readActionCosts(wallet: Pick<WalletInterface, 'listActions'>): Promise<ActionCost[]> {
  const actions = new Map<string, ActionCost>()
  const seen = new Set<string>()
  let expected: number | undefined
  for (let offset = 0; ; offset += 100) {
    const result = await wallet.listActions({ labels: [], seekPermission: false, limit: 100, offset })
    if (!Number.isSafeInteger(result.totalActions) || result.totalActions < 0 || result.totalActions > 10000 ||
      (expected !== undefined && expected !== result.totalActions) || !Array.isArray(result.actions) || result.actions.length > 100) throw new Error('Wallet history changed or is incomplete. Existing costs were kept; try the read-only check again.')
    expected = result.totalActions
    for (const action of result.actions) {
      if (!/^[a-f0-9]{64}$/.test(action.txid) || seen.has(action.txid) || !Number.isSafeInteger(action.satoshis) || typeof action.isOutgoing !== 'boolean' || typeof action.status !== 'string') throw new Error('Wallet returned inconsistent history. Existing costs were kept.')
      seen.add(action.txid)
      if (action.isOutgoing && action.satoshis < 0) actions.set(action.txid, { txid: action.txid, debitSats: -action.satoshis, status: action.status })
    }
    if (seen.size === expected) return [...actions.values()]
    if (seen.size > expected || result.actions.length !== 100) throw new Error('Wallet history was incomplete. Existing costs were kept.')
  }
}
