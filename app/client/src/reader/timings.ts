import { walletDiagnostic, type WalletDiagnostic } from '../payments/wallet-diagnostic.js'
import type { HttpCall, Spend, WalletCall } from '../payments/wallet-client.js'
import type { ReadAheadUse } from './read-ahead.js'

type Context = { identityKey: string | null; network: string | null; edition: string; protocolVersion: string | null }
type Sample = {
  page: number; edition: string; identityKey: string | null; network: string | null;
  trigger: 'explicit' | 'recovery'; timingBoundary: 'request-to-visible-frame';
  purchased: boolean; visible: boolean; totalMs?: number; txid?: string;
  walletCalls: { method: string; ms: number; ok: boolean; code?: string | number; diagnostic?: WalletDiagnostic; paymentMetrics?: WalletCall['paymentMetrics'] }[];
  http: HttpCall[]; startedAt: string; failed?: boolean;
  readAhead?: ReadAheadUse;
}
export interface TimingRun {
  schema: 2; runId: string; origin: string; walletName: 'BSV Desktop' | 'BSV Browser'; walletVersion: string;
  identityKey: string; network: 'mainnet'; edition: string; walletProtocolVersion: string | null;
  openedAt: string; recording: boolean; samples: Sample[]; ledger: Spend[]; errors: string[]; prompts: unknown[];
  preparations?: { page: number; edition: string; startedAt: string; totalMs?: number; txid?: string;
    accepted?: boolean; failed?: boolean; walletCalls: Sample['walletCalls']; http: HttpCall[] }[];
}
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const latestKey = 'pagestream-timings-latest-v1'

// Observer only: this module has no wallet methods, HTTP client or payment proof.
export class ReadingTimings {
  run: TimingRun | null = null
  storageError = false
  private current?: { token: string; start: number; sample: Sample }
  private preparation?: { token: string; runId: string; start: number; sample: NonNullable<TimingRun['preparations']>[number] }
  private storage: Storage
  private clock: () => number
  constructor(storage: Storage, clock = () => performance.now()) {
    this.storage = storage
    this.clock = clock
    try {
      const key = storage.getItem(latestKey)
      const saved = key ? storage.getItem(key) : null
      if (saved) {
        const run = JSON.parse(saved) as TimingRun
        if (run.schema === 2 && Array.isArray(run.samples) && Array.isArray(run.errors)) {
          this.run = run
          if (run.recording) this.stop('Reader reloaded or closed during capture; retained incomplete evidence.')
        }
      }
    } catch { this.storageError = true }
  }
  private save() {
    if (!this.run) return
    try {
      const key = `pagestream-timings-run-v1:${this.run.runId}`
      this.storage.setItem(key, JSON.stringify(this.run))
      this.storage.setItem(latestKey, key)
    } catch { this.storageError = true }
  }
  start(name: TimingRun['walletName'], version: string, context: Context, origin: string) {
    if (this.preparation) throw new Error('Wait for next-page preparation to finish before starting another capture.')
    if (!['BSV Desktop', 'BSV Browser'].includes(name) || !version.trim() || version.length > 40)
      throw new Error('Enter the native wallet app and its installed version.')
    if (!context.identityKey || context.network !== 'mainnet' || !context.edition)
      throw new Error('Connect the wallet and open an owned book page first. Starting capture cannot connect or pay.')
    if (this.run?.recording) throw new Error('Stop the current capture before starting another.')
    this.current = undefined
    this.run = { schema: 2, runId: crypto.randomUUID(), origin, walletName: name, walletVersion: version.trim(),
      identityKey: context.identityKey, network: 'mainnet', edition: context.edition,
      walletProtocolVersion: context.protocolVersion, openedAt: new Date().toISOString(), recording: true,
      samples: [], ledger: [], errors: [], prompts: [] }
    this.save()
  }
  begin(page: number, edition: string, recovery: boolean) {
    if (!this.run?.recording) return undefined
    if (this.current) this.fail(this.current.token, 'Another turn began before the prior visible-frame marker.')
    if (this.run.samples.length >= 100) {
      this.stop('Capture reached its 100-turn limit; existing evidence retained.')
      return undefined
    }
    const token = crypto.randomUUID()
    const sample: Sample = { page, edition, identityKey: this.run.identityKey, network: this.run.network,
      trigger: recovery ? 'recovery' : 'explicit', timingBoundary: 'request-to-visible-frame',
      purchased: false, visible: false, walletCalls: [], http: [], startedAt: new Date().toISOString() }
    this.run.samples.push(sample)
    this.current = { token, start: this.clock(), sample }
    this.save() // An interrupted pending turn is retained even if no response arrives.
    return token
  }
  wallet(call: WalletCall) {
    const current = this.preparation ?? this.current
    if (!current || this.clock() - call.ms < current.start) return
    // Reclassify the original error; never export arbitrary diagnostic fields.
    const diagnostic = walletDiagnostic(call.error)
    const metrics = call.paymentMetrics
    const safeMetrics = metrics && Number.isInteger(metrics.knownAncestors) && metrics.knownAncestors >= 0 && metrics.knownAncestors <= 32 &&
      [metrics.proofBytes, metrics.transportBytes].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 16 * 1024 * 1024)
      ? { knownAncestors: metrics.knownAncestors, proofBytes: metrics.proofBytes, transportBytes: metrics.transportBytes,
          ...(['serial', 'overlap'].includes(metrics.deliveryMode ?? '') ? { deliveryMode: metrics.deliveryMode } : {}) } : undefined
    current.sample.walletCalls.push({ method: call.method, ms: call.ms, ok: call.ok,
      ...(call.error?.code !== undefined ? { code: call.error.code } : {}),
      ...(safeMetrics ? { paymentMetrics: safeMetrics } : {}),
      ...(diagnostic ? { diagnostic } : {}) })
  }
  http(call: HttpCall) {
    const current = this.preparation ?? this.current
    if (!current || this.clock() - call.ms < current.start) return
    current.sample.http.push({ path: call.path, status: call.status, ms: call.ms,
      ...(call.serverTiming ? { serverTiming: call.serverTiming } : {}) })
  }
  beginPreparation(page: number, edition: string) {
    if (!this.run?.recording || this.preparation || (this.run.preparations?.length ?? 0) >= 100) return undefined
    const token = crypto.randomUUID()
    const sample: NonNullable<TimingRun['preparations']>[number] = { page, edition, startedAt: new Date().toISOString(), walletCalls: [], http: [] }
    this.run.preparations ??= []
    this.run.preparations.push(sample)
    this.preparation = { token, runId: this.run.runId, start: this.clock(), sample }
    this.save()
    return token
  }
  finishPreparation(token: string | undefined, txid: string | undefined, ledger: Spend[]) {
    if (!token || token !== this.preparation?.token) return
    const { sample, start, runId } = this.preparation
    sample.totalMs = this.clock() - start
    sample.txid = txid
    sample.accepted = Boolean(txid && ledger.some(s => s.txid === txid && s.page === sample.page &&
      s.edition === sample.edition && s.identityKey === this.run?.identityKey && s.state === 'confirmed'))
    sample.failed = !sample.accepted
    if (!sample.accepted && this.run?.runId === runId)
      this.run.errors.push(`Page ${sample.page} preparation failed or has no confirmed receipt; review the original payment.`)
    this.preparation = undefined
    if (this.run?.runId === runId) this.save()
  }
  prepared(token: string | undefined, value: ReadAheadUse | undefined) {
    if (!token || token !== this.current?.token || !value || value.page !== this.current.sample.page ||
      !Number.isFinite(value.preparationMs) || value.preparationMs < 0) return
    this.current.sample.readAhead = { page: value.page, readyAtClick: value.readyAtClick,
      preparationMs: value.preparationMs }
    // The normal purchased-sample classifier still requires a payment workflow
    // inside the click boundary. Never relabel a prepaid cache hit as that result.
  }
  finish(token: string | undefined, txid: string | undefined, context: Context, ledger: Spend[], visible: boolean) {
    if (!token || this.current?.token !== token || !this.run) return
    const { sample, start } = this.current
    sample.totalMs = this.clock() - start
    sample.visible = visible
    sample.identityKey = context.identityKey
    sample.network = context.network
    sample.txid = txid
    const workflow = sample.walletCalls.filter(c => c.method === 'page payment workflow')
    const receipt = ledger.filter(s => s.txid === txid && s.identityKey === context.identityKey &&
      s.edition === sample.edition && s.page === sample.page && s.state === 'confirmed')
    sample.purchased = sample.trigger === 'explicit' && workflow.length === 1 && workflow[0].ok && receipt.length === 1 &&
      !this.run.samples.some(s => s !== sample && s.purchased && s.txid === txid)
    // Export selected receipt fields only; no wallet arguments, proofs or request IDs.
    this.run.ledger = ledger.map(s => ({ txid: s.txid, identityKey: s.identityKey, edition: s.edition,
      page: s.page, sats: s.sats, feeSats: s.feeSats, state: s.state }))
    if (context.identityKey !== this.run.identityKey || context.edition !== this.run.edition || context.network !== 'mainnet')
      this.run.errors.push('Wallet identity, book or network changed during capture.')
    if (!visible) this.run.errors.push(`Page ${sample.page} did not reach a visible frame.`)
    this.current = undefined
    this.save()
  }
  fail(token: string | undefined, reason = 'Page turn failed; original payment state is unchanged.') {
    if (!token || this.current?.token !== token || !this.run) return
    this.current.sample.totalMs = this.clock() - this.current.start
    this.current.sample.failed = true
    this.run.errors.push(`Page ${this.current.sample.page}: ${reason}`)
    this.current = undefined
    this.save()
  }
  stop(reason?: string) {
    if (!this.run?.recording) return
    if (this.current) this.fail(this.current.token, 'Capture stopped before the page was displayed.')
    if (reason) this.run.errors.push(reason)
    this.run.recording = false
    this.save()
  }
  paidCount() { return this.run?.samples.filter(s => s.purchased && s.visible).length ?? 0 }
  export() {
    if (!this.run) throw new Error('No reading capture is available.')
    return JSON.stringify(this.run, null, 2)
  }
}
