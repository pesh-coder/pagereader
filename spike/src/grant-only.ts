import { connectDesktopWallet } from '../../app/client/src/bsv/walletAcquisition.js'
import { config } from './config.js'
import type { WalletInterface } from '@bsv/sdk'

interface Action { txid: string; satoshis: number; status: string }
export interface GrantRun {
  startedAt: string; state: 'preflight' | 'awaiting-native-approval' | 'reconciling' | 'finished'
  configuredMonthlyAllowance: number; calls: string[]; before?: Action[]; after?: Action[]
  historyDelta?: Action[]; recordedNewDebitSats?: number; grantFlowReturned?: boolean
  error?: string; historyError?: string; finishedAt?: string
}

// Explicitly authorized operator experiment only. The caller must acknowledge
// that native grant fees are not quoted/capped by this app. No automatic run.
export async function runGrantOnlyExperiment(authorization: { acceptUnquotedNativeGrantCost: boolean }, report: (record: GrantRun) => void, acquire = connectDesktopWallet) {
  if (authorization.acceptUnquotedNativeGrantCost !== true) throw new Error('Explicit authorization for one unquoted native grant-only attempt is required')
  const journalKey = 'pagestream-native-grant-only-v1'
  if (localStorage.getItem(journalKey) !== null) throw new Error('A saved grant-only attempt already exists. Reconcile it without requesting another grant.')
  const run: GrantRun = { startedAt: new Date().toISOString(), state: 'preflight', configuredMonthlyAllowance: config.provisional.walletLimitSats, calls: [] }
  const save = () => {
    localStorage.setItem(journalKey, JSON.stringify(run))
    report({ ...run, calls: [...run.calls] })
  }
  let safe: WalletInterface | undefined
  const snapshot = async () => {
    const result = await safe!.listActions({ labels: [], seekPermission: false, limit: 100 })
    // Fail before native approval if we cannot establish a complete baseline.
    if (result.totalActions !== result.actions.length || new Set(result.actions.map(action => action.txid)).size !== result.actions.length || result.actions.some(action => !/^[a-f0-9]{64}$/.test(action.txid) || !Number.isSafeInteger(action.satoshis))) throw new Error('Complete valid wallet history required; do not retry the grant')
    return result.actions.map(({ txid, satoshis, status }) => ({ txid, satoshis, status }))
  }
  save()
  try {
    if (location.origin !== 'http://localhost:3108') throw new Error('Existing localhost:3108 origin required')
    const [healthResponse, manifestResponse] = await Promise.all([fetch('/health'), fetch('http://localhost/manifest.json')])
    if (!healthResponse.ok || !manifestResponse.ok) throw new Error('Local preflight unavailable')
    const health = await healthResponse.json(), manifest = await manifestResponse.json()
    if (health.network !== 'main' || health.purchasesPaused !== true || manifest.metanet?.groupPermissions?.spendingAuthorization?.amount !== config.provisional.walletLimitSats) throw new Error('Paused mainnet and expected declaration required')
    const { wallet } = await acquire()
    safe = new Proxy(wallet, { get(target, property) {
      if (!['getNetwork', 'listActions', 'waitForAuthentication'].includes(String(property))) throw new Error('Page payments and other wallet methods are unavailable in a grant-only run')
      return async (...args: unknown[]) => {
        run.calls.push(String(property)); save()
        return (target[property as keyof WalletInterface] as (...args: unknown[]) => Promise<unknown>).apply(target, args)
      }
    } })
    if ((await safe.getNetwork({})).network !== 'mainnet') throw new Error('Mainnet wallet required')
    run.before = await snapshot(); save()
    run.state = 'awaiting-native-approval'; save()
    run.grantFlowReturned = (await safe.waitForAuthentication({})).authenticated
  } catch (error) { run.error = error instanceof Error ? error.message.slice(0, 1000) : 'Grant attempt failed' }
  finally {
    // A failed native response can still follow an internal debit. Reconcile
    // once with read-only history, never grant again or replace the attempt.
    if (safe && run.before) {
      run.state = 'reconciling'; save()
      try {
        run.after = await snapshot()
        const prior = new Set(run.before.map(action => action.txid))
        run.historyDelta = run.after.filter(action => !prior.has(action.txid))
        run.recordedNewDebitSats = run.historyDelta.reduce((sum, action) => sum + Math.max(0, -action.satoshis), 0)
      } catch (error) { run.historyError = error instanceof Error ? error.message.slice(0, 1000) : 'History reconciliation failed' }
    }
    run.state = 'finished'; run.finishedAt = new Date().toISOString(); save()
  }
  // History deltas require attribution/fee verification; no C2/C4 auto-pass.
  return run
}
