// Read-only inspection of existing wallet history; never creates permissions/payments.
import { connectDesktopWallet } from '../../app/client/src/bsv/walletAcquisition.js'

export async function inspectExistingAccounting() {
  const key = 'pagestream-accounting-review-v1'
  if (localStorage.getItem(key)) throw new Error('Existing accounting review must be inspected before any repeat')
  const prior = JSON.parse(localStorage.getItem('pagestream-controlled-page6-v1') ?? 'null')
  if (location.origin !== 'http://localhost:3108' || prior?.state !== 'delivered') throw new Error('Completed original page-six experiment required')
  const record: Record<string, unknown> = { startedAt: new Date().toISOString(), state: 'preflight', calls: [] }
  const save = () => localStorage.setItem(key, JSON.stringify(record))
  save()
  try {
    const health = await (await fetch('/health')).json()
    if (health.network !== 'main' || !health.purchasesPaused) throw new Error('Paused mainnet required')
    const { wallet, identityKey } = await connectDesktopWallet()
    if (identityKey !== prior.identityKey) throw new Error('Existing reader identity required')
    record.state = 'reading-existing-history'; record.calls = ['generated wallet acquisition', 'listActions includeLabels:true seekPermission:false']; save()
    const result = await wallet.listActions({ labels: [], includeLabels: true, seekPermission: false, limit: 100 })
    if (result.totalActions !== result.actions.length || new Set(result.actions.map(a => a.txid)).size !== result.actions.length || result.actions.some(a => !/^[a-f0-9]{64}$/.test(a.txid) || !Number.isSafeInteger(a.satoshis))) throw new Error('Complete valid history required')
    const month = new Date().toISOString().slice(0, 7)
    const actions = result.actions.map(a => ({ txid: a.txid, satoshis: a.satoshis, status: a.status, labels: (a.labels ?? []).filter(label => label.startsWith('admin originator ') || label.startsWith('admin month ')) }))
    const groups: Record<string, { netDebitSats: number; txids: string[] }> = {}
    for (const a of actions) if (a.labels.includes(`admin month ${month}`)) for (const label of a.labels.filter(label => label.startsWith('admin originator '))) {
      const group = groups[label] ??= { netDebitSats: 0, txids: [] }
      group.netDebitSats -= a.satoshis; group.txids.push(a.txid)
    }
    record.actions = actions; record.monthUTC = month; record.originatorGroups = groups; record.state = 'finished'
  } catch (e) { record.state = 'failed'; record.error = e instanceof Error ? e.message : 'Read-only accounting failed' }
  record.finishedAt = new Date().toISOString(); save()
  return record
}
