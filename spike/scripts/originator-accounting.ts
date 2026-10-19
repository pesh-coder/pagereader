import { WalletPermissionsManager } from '@bsv/wallet-toolbox-client'
import type { WalletInterface } from '@bsv/sdk'

// Offline reproduction of the measured label shape; no wallet acquisition/crypto.
export async function reproduceOriginatorAccounting(Manager = WalletPermissionsManager) {
  const month = new Date().toISOString().slice(0, 7)
  const actions = [
    { txid: 'a'.repeat(64), satoshis: -62, labels: ['admin originator localhost:3108', `admin month ${month}`] },
    { txid: 'b'.repeat(64), satoshis: -6, labels: ['admin originator localhost', `admin month ${month}`] },
    { txid: 'c'.repeat(64), satoshis: -6, labels: ['admin originator localhost:3108', `admin month ${month}`] },
  ]
  const queries: string[][] = []
  const underlying = new Proxy({}, { get(_target, property) {
    if (property !== 'listActions') throw new Error('Offline accounting permits only synthetic history queries')
    return async ({ labels }: { labels: string[] }) => {
      queries.push(labels)
      const selected = actions.filter(a => labels.every(label => a.labels.includes(label)))
      return { totalActions: selected.length, actions: selected }
    }
  } }) as WalletInterface
  const manager = new Manager(underlying, 'synthetic-admin.example', { seekSpendingPermissions: true })
  const query = manager as unknown as { querySpentSince(token: { originator: string; rawOriginator?: string }): Promise<number> }
  const nativeHostnameQuerySats = await query.querySpentSince({ originator: 'localhost' })
  const hostnameAndPortQuerySats = await query.querySpentSince({ originator: 'localhost', rawOriginator: 'localhost:3108' })
  return { mode: 'OFFLINE_SYNTHETIC_LABEL_REPRODUCTION', nativeHostnameQuerySats, hostnameAndPortQuerySats, omittedPortLabelSats: hostnameAndPortQuerySats - nativeHostnameQuerySats, queries, nativeWalletCalls: 0, transactionsCreated: 0 }
}
