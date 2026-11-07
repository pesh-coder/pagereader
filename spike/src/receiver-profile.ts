import { AsyncLocalStorage } from 'node:async_hooks'
import { Beef, type ChainTracker } from '@bsv/sdk'
import type { Wallet } from '@bsv/wallet-toolbox-client'

export interface ReceiverMetrics {
  rootMs: number
  rootCalls: number
  storageMs: number
  storageCalls: number
}
const scope = new AsyncLocalStorage<ReceiverMetrics>()

export async function measureReceiver<T>(operation: () => Promise<T>, report: (metrics: ReceiverMetrics) => void): Promise<T> {
  const metrics = { rootMs: 0, rootCalls: 0, storageMs: 0, storageCalls: 0 }
  return scope.run(metrics, async () => {
    try { return await operation() }
    finally { report({ ...metrics }) }
  })
}

// Observe this server's wallet instance only. Delegate every validation/storage
// call unchanged; no root cache, provider switch, proof shortcut or retry.
export function instrumentReceiver(wallet: Wallet) {
  const services = wallet.getServices()
  const getTracker = services.getChainTracker.bind(services)
  const trackers = new WeakMap<ChainTracker, ChainTracker>()
  services.getChainTracker = async () => {
    const tracker = await getTracker()
    let observed = trackers.get(tracker)
    if (!observed) {
      observed = new Proxy(tracker, { get(target, property) {
        const value = Reflect.get(target, property, target)
        if (property === 'isValidRootForHeight') return async (...args: Parameters<ChainTracker['isValidRootForHeight']>) => {
          const metrics = scope.getStore(), start = performance.now()
          try { return await target.isValidRootForHeight(...args) }
          finally { if (metrics) { metrics.rootMs += performance.now() - start; metrics.rootCalls++ } }
        }
        return typeof value === 'function' ? value.bind(target) : value
      } })
      trackers.set(tracker, observed)
    }
    return observed
  }
  const internalize = wallet.storage.internalizeAction.bind(wallet.storage)
  wallet.storage.internalizeAction = async (...args) => {
    const metrics = scope.getStore(), start = performance.now()
    try { return await internalize(...args) }
    finally { if (metrics) { metrics.storageMs += performance.now() - start; metrics.storageCalls++ } }
  }
}

// Verify an existing saved proof and time one read-only storage lookup. This
// deliberately never calls internalizeAction, createAction, signAction or send.
export async function inspectReceiver(wallet: Wallet, tx: number[]) {
  const beef = Beef.fromBinaryStrict(tx)
  if (!beef.atomicTxid) throw new Error('Saved atomic proof required')
  const start = performance.now()
  let proofMs = 0, lookupMs = 0, metrics!: ReceiverMetrics
  let valid = false
  await measureReceiver(async () => {
    const proofStart = performance.now()
    valid = await beef.verify(await wallet.getServices().getChainTracker(), false)
    proofMs = performance.now() - proofStart
    if (!valid) throw new Error('Existing proof verification failed')
    const lookupStart = performance.now()
    await wallet.listActions({ labels: [], limit: 1, seekPermission: false })
    lookupMs = performance.now() - lookupStart
  }, result => { metrics = result })
  return { valid, proofMs, lookupMs, totalMs: performance.now() - start, ...metrics,
    limitation: 'Existing-proof verification and read-only history lookup; not payment acceptance or a paid-turn benchmark.' }
}
