import { walletDiagnostic, type WalletDiagnostic } from '../payments/wallet-diagnostic.js'
import type { HttpCall, Spend, WalletCall } from '../payments/wallet-client.js'

type Context = { identityKey: string | null; network: string | null; edition: string; protocolVersion: string | null }
type Sample = {
  page: number; edition: string; identityKey: string | null; network: string | null;
  trigger: 'explicit' | 'recovery'; timingBoundary: 'request-to-visible-frame';
  purchased: boolean; visible: boolean; totalMs?: number; txid?: string;
  /** How the page was paid: one on-chain payment, or a reading-session signature. */
  payment?: 'transaction' | 'session';
  /**
   * Session pages shown on credit are paid after they appear. acceptedMs is
   * Next → receiver accepted this page's payment, on the same clock as totalMs;
   * calls are the background signing/request made for it.
   */
  sessionPayment?: { acceptedMs?: number; walletCalls: Sample['walletCalls']; http: HttpCall[] };
  walletCalls: { method: string; ms: number; ok: boolean; code?: string | number; diagnostic?: WalletDiagnostic; paymentMetrics?: WalletCall['paymentMetrics'] }[];
  http: HttpCall[]; startedAt: string; failed?: boolean;
}
export interface TimingRun {
  schema: 2; runId: string; origin: string; walletName: 'BSV Desktop' | 'BSV Browser'; walletVersion: string;
  identityKey: string; network: 'mainnet'; edition: string; walletProtocolVersion: string | null;
  openedAt: string; recording: boolean; samples: Sample[]; ledger: Spend[]; errors: string[]; prompts: unknown[];
}
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const latestKey = 'pagestream-timings-latest-v1'

// Observer only: this module has no wallet methods, HTTP client or payment proof.
export class ReadingTimings {
  run: TimingRun | null = null
  storageError = false
  private current?: { token: string; start: number; sample: Sample }
  // A displayed session page whose payment is still in flight.
  private awaiting?: { txid: string; start: number; sample: Sample }
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
    if (!['BSV Desktop', 'BSV Browser'].includes(name) || !version.trim() || version.length > 40)
      throw new Error('Enter the native wallet app and its installed version.')
    if (!context.identityKey || context.network !== 'mainnet' || !context.edition)
      throw new Error('Connect the wallet and open a book page first. Starting capture cannot connect or pay.')
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
    const current = this.current ?? this.background()
    if (!current || this.clock() - call.ms < current.start) return
    // Reclassify the original error; never export arbitrary diagnostic fields.
    const diagnostic = walletDiagnostic(call.error)
    const metrics = call.paymentMetrics
    const safeMetrics = metrics && Number.isInteger(metrics.knownAncestors) && metrics.knownAncestors >= 0 && metrics.knownAncestors <= 32 &&
      [metrics.proofBytes, metrics.transportBytes].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 16 * 1024 * 1024)
      ? { knownAncestors: metrics.knownAncestors, proofBytes: metrics.proofBytes, transportBytes: metrics.transportBytes,
          ...(['serial', 'overlap'].includes(metrics.deliveryMode ?? '') ? { deliveryMode: metrics.deliveryMode } : {}) } : undefined
    const target = current.sample === this.current?.sample ? current.sample.walletCalls : current.sample.sessionPayment!.walletCalls
    target.push({ method: call.method, ms: call.ms, ok: call.ok,
      ...(call.error?.code !== undefined ? { code: call.error.code } : {}),
      ...(safeMetrics ? { paymentMetrics: safeMetrics } : {}),
      ...(diagnostic ? { diagnostic } : {}) })
  }
  http(call: HttpCall) {
    const current = this.current ?? this.background()
    if (!current || this.clock() - call.ms < current.start) return
    const target = current.sample === this.current?.sample ? current.sample.http : current.sample.sessionPayment!.http
    target.push({ path: call.path, status: call.status, ms: call.ms,
      ...(call.serverTiming ? { serverTiming: call.serverTiming } : {}) })
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
    const unique = !this.run.samples.some(s => s !== sample && s.purchased && s.txid === txid)
    // A session page shown on credit is still confirming at its visible frame;
    // its own session receipt (pending or confirmed) identifies the purchase.
    const sessionReceipt = Boolean(txid?.startsWith('channel:')) && ledger.filter(s => s.txid === txid &&
      s.identityKey === context.identityKey && s.edition === sample.edition && s.page === sample.page &&
      (s.state === 'confirmed' || s.state === 'pending')).length === 1
    if (sample.trigger === 'explicit' && unique && sessionReceipt) {
      sample.purchased = true
      sample.payment = 'session'
      const confirmed = ledger.some(s => s.txid === txid && s.state === 'confirmed')
      // Paid inside the click: acceptance happened before the visible frame.
      sample.sessionPayment = { walletCalls: [], http: [], ...(confirmed ? { acceptedMs: sample.totalMs } : {}) }
      if (!confirmed) this.awaiting = { txid: txid!, start, sample }
    } else {
      sample.purchased = sample.trigger === 'explicit' && workflow.length === 1 && workflow[0].ok && receipt.length === 1 && unique
      if (sample.purchased) sample.payment = 'transaction'
    }
    // Export selected receipt fields only; no wallet arguments, proofs or request IDs.
    this.recordLedger(ledger)
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
  /** The receiver accepted a session page's payment (possibly after display). */
  paymentAccepted(txid: string) {
    const awaiting = this.awaiting
    if (!awaiting || awaiting.txid !== txid || !this.run) return
    awaiting.sample.sessionPayment!.acceptedMs = this.clock() - awaiting.start
    this.awaiting = undefined
    this.save()
  }
  private background() { return this.awaiting ? { start: this.awaiting.start, sample: this.awaiting.sample } : undefined }
  stop(reason?: string) {
    if (!this.run?.recording) return
    if (this.current) this.fail(this.current.token, 'Capture stopped before the page was displayed.')
    if (reason) this.run.errors.push(reason)
    this.run.recording = false
    this.save()
  }
  paidCount() { return this.run?.samples.filter(s => s.purchased && s.visible).length ?? 0 }
  /** Next → payment accepted, for session pages whose acceptance was observed. */
  acceptedTimes() {
    return this.run?.samples.filter(s => s.purchased && s.visible && s.sessionPayment?.acceptedMs !== undefined)
      .map(s => s.sessionPayment!.acceptedMs!) ?? []
  }
  private recordLedger(ledger: Spend[]) {
    if (this.run) this.run.ledger = ledger.map(s => ({ txid: s.txid, identityKey: s.identityKey, edition: s.edition,
      page: s.page, sats: s.sats, feeSats: s.feeSats, state: s.state }))
  }
  export() {
    if (!this.run) throw new Error('No reading capture is available.')
    return JSON.stringify(this.run, null, 2)
  }
}
