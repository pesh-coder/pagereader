import { connectDesktopWallet } from '../../app/client/src/bsv/walletAcquisition.js'
import { config } from './config.js'
import type { WalletInterface } from '@bsv/sdk'

export interface PermissionReview {
  startedAt: string; origin: string; state: 'checking' | 'awaiting-native-result' | 'returned' | 'rejected'
  configuredAllowanceSats: number; calls: string[]; authenticated?: boolean; error?: string; finishedAt?: string
}

// A separate operator action. Never use AuthFetch, request a paid page, prepare
// an action or approve a grant. The human must review and cancel the native UI.
export async function reviewPermissionPrompt(report: (record: PermissionReview) => void, acquire = connectDesktopWallet) {
  const record: PermissionReview = { startedAt: new Date().toISOString(), origin: location.origin, state: 'checking', configuredAllowanceSats: config.provisional.walletLimitSats, calls: [] }
  const save = () => report({ ...record, calls: [...record.calls] })
  save()
  try {
    if (location.origin !== 'http://localhost:3108') throw new Error('This controlled review is restricted to the existing localhost:3108 origin')
    const [health, declaration] = await Promise.all([fetch('/health'), fetch('http://localhost/manifest.json')])
    if (!health.ok || !declaration.ok) throw new Error('Paused mainnet backend and hostname manifest must be available')
    const status = await health.json(), metadata = await declaration.json()
    if (status.network !== 'main' || status.purchasesPaused !== true || metadata.metanet?.groupPermissions?.spendingAuthorization?.amount !== config.provisional.walletLimitSats) throw new Error('Paused mainnet/allowance preflight does not match the controlled review')
    record.calls.push('generated wallet acquisition (authentication + identity only)'); save()
    const { wallet } = await acquire()
    // Only these methods can be used by this review, on any SDK substrate.
    const safe = new Proxy(wallet, { get(target, property) {
      if (!['getNetwork', 'waitForAuthentication'].includes(String(property))) throw new Error('Wallet method unavailable during permission-only review')
      return async (...args: unknown[]) => {
        record.calls.push(String(property)); save()
        return (target[property as keyof WalletInterface] as (...args: unknown[]) => Promise<unknown>).apply(target, args)
      }
    } })
    if ((await safe.getNetwork({})).network !== 'mainnet') throw new Error('Mainnet wallet required')
    record.state = 'awaiting-native-result'; save()
    const result = await safe.waitForAuthentication({})
    record.state = 'returned'; record.authenticated = result.authenticated
  } catch (error) {
    record.state = 'rejected'
    record.error = error instanceof Error ? error.message.slice(0, 1000) : 'Native review failed or was declined'
  } finally { record.finishedAt = new Date().toISOString(); save() }
  return record
}
