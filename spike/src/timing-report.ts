import { config } from './config.js'

interface Call { method?: string; ok?: boolean }
interface Sample {
  page?: number; edition?: string; identityKey?: string; txid?: string
  purchased?: boolean; visible?: boolean; totalMs?: number; trigger?: string
  timingBoundary?: string; network?: string; walletCalls?: Call[]
  payment?: 'transaction' | 'session'; sessionPayment?: { acceptedMs?: number }
  readAhead?: { page: number; readyAtClick: boolean; preparationMs: number }
}
interface Run {
  schema?: number; runId?: string; walletName?: string; walletVersion?: string
  origin?: string; edition?: string; identityKey?: string; network?: string
  samples?: Sample[]; ledger?: { txid: string; identityKey: string; edition?: string; page: number; sats: number; state: string }[]
  errors?: unknown[]; prompts?: unknown[]
  preparations?: { page: number; edition: string; totalMs?: number; txid?: string;
    accepted?: boolean; failed?: boolean; walletCalls: Call[] }[]
}

// Statistical output is descriptive. Acceptance also needs a complete,
// mainnet, newly-paid cohort; a purchased flag alone is insufficient.
export function timingReport(run: Run) {
  if (![1, 2].includes(run.schema ?? 0) || !Array.isArray(run.samples)) throw new Error('Not a spike evidence export')
  const paid = run.samples.filter(sample => sample.purchased === true)
  const durations = paid.filter(sample => sample.visible === true && Number.isFinite(sample.totalMs) && sample.totalMs! >= 0).map(sample => sample.totalMs!).sort((a, b) => a - b)
  const percentile = (p: number) => durations.length ? durations[Math.ceil(p * durations.length) - 1] : null
  const aheadPayments = new Set((run.preparations ?? []).filter(prep => prep.accepted && !prep.failed && prep.txid &&
    prep.edition === run.edition && prep.walletCalls.filter(c => c.method === 'page payment workflow' && c.ok).length === 1 &&
    run.ledger?.some(s => s.txid === prep.txid && s.page === prep.page && s.edition === prep.edition &&
      s.identityKey === run.identityKey && s.sats === config.priceSats && s.state === 'confirmed')).map(prep => prep.txid))
  const preparedTurns = run.samples.filter(s => s.readAhead && s.readAhead.page === s.page && s.visible === true &&
    s.edition === run.edition && s.identityKey === run.identityKey && Number.isFinite(s.totalMs) && s.totalMs! >= 0 &&
    Number.isFinite(s.readAhead.preparationMs) && s.readAhead.preparationMs >= 0 &&
    run.ledger?.some(p => p.txid === s.txid && p.page === s.page && p.edition === s.edition &&
      p.identityKey === s.identityKey && p.state === 'confirmed'))
  const readyMs = preparedTurns.filter(s => s.readAhead!.readyAtClick).map(s => s.totalMs!).sort((a,b) => a-b)
  const reasons: string[] = []
  if (run.schema !== 2) reasons.push('Legacy export lacks per-payment provenance; statistics are descriptive only.')
  if (!['BSV Desktop', 'BSV Browser'].includes(run.walletName ?? '') || !run.walletVersion?.trim()) reasons.push('Wallet app name/version is missing.')
  if (run.network !== 'mainnet') reasons.push('Native wallet mainnet observation is missing.')
  if (!run.edition || !/^0[23][a-f0-9]{64}$/.test(run.identityKey ?? '')) reasons.push('Edition or authenticated public identity is missing.')
  try {
    const origin = new URL(run.origin ?? '')
    if (origin.origin !== run.origin || origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) throw new Error()
  } catch { reasons.push('A valid HTTPS or local development origin is missing.') }
  if (paid.length < config.timingSampleCount) reasons.push(`At least ${config.timingSampleCount} newly paid turns are required.`)
  if (!Array.isArray(run.errors) || run.errors.length) reasons.push('Failed-request evidence is missing or contains failures; review the complete run.')
  const pages = new Set<number>(), txids = new Set<string>()
  let eligiblePaidSamples = 0
  for (const [index, sample] of paid.entries()) {
    const payment = run.ledger?.filter(entry => entry.txid === sample.txid) ?? []
    const workflows = sample.walletCalls?.filter(call => call.method === 'page payment workflow') ?? []
    // Either one new on-chain page payment inside the click, or one reading-session
    // payment (a channel state) whose receipt the receiver accepted.
    const session = /^channel:[a-f0-9]{32}:\d+$/.test(sample.txid ?? '')
    const valid = sample.visible === true && Number.isFinite(sample.totalMs) && sample.totalMs! >= 0 &&
      sample.network === 'mainnet' && sample.trigger === 'explicit' && sample.timingBoundary === 'request-to-visible-frame' &&
      Number.isInteger(sample.page) && sample.page! > config.freePages && sample.edition === run.edition && sample.identityKey === run.identityKey &&
      !pages.has(sample.page!) && !txids.has(sample.txid!) &&
      (session || (/^[a-f0-9]{64}$/.test(sample.txid ?? '') && workflows.length === 1 && workflows[0].ok === true)) &&
      payment.length === 1 && payment[0].identityKey === run.identityKey && payment[0].edition === run.edition && payment[0].page === sample.page && payment[0].sats === config.priceSats && payment[0].state === 'confirmed'
    if (!valid) reasons.push(`Paid sample ${index + 1} lacks a unique new payment, matching accepted receipt, explicit visible timing or mainnet context.`)
    else eligiblePaidSamples++
    if (sample.page !== undefined) pages.add(sample.page)
    if (sample.txid) txids.add(sample.txid)
  }
  return {
    runId: run.runId, walletName: run.walletName, walletVersion: run.walletVersion, origin: run.origin,
    paidSamples: paid.length, eligiblePaidSamples, descriptiveTimedSamples: durations.length,
    p50Ms: percentile(0.5), p95Ms: percentile(0.95), qualificationIssues: reasons,
    // Both numbers matter: what the reader sees, and when the page was actually paid.
    paymentAccepted: (() => {
      const accepted = paid.filter(s => s.visible === true && Number.isFinite(s.sessionPayment?.acceptedMs))
        .map(s => s.sessionPayment!.acceptedMs!).sort((a, b) => a - b)
      const at = (p: number) => accepted.length ? accepted[Math.ceil(p * accepted.length) - 1] : null
      return { samples: accepted.length, missing: paid.filter(s => s.payment === 'session').length - accepted.length,
        p50Ms: at(0.5), p95Ms: at(0.95),
        limitation: 'Next → receiver acceptance of that page\'s session payment. Transaction-paid pages are already paid within p50/p95 above.' }
    })(),
    readAhead: { paymentsAhead: aheadPayments.size, preparedTurns: preparedTurns.length,
      readyTurns: readyMs.length, readyClickP95Ms: readyMs.length ? readyMs[Math.ceil(readyMs.length * .95) - 1] : null,
      preparationMs: preparedTurns.map(s => s.readAhead!.preparationMs),
      limitation: 'Descriptive preparation/Next timings. A prepaid hit does not prove payment completed within the click; retain rapid/failed turns and both native cohorts.' },
    C3: reasons.length ? 'UNRESOLVED' : percentile(0.95)! <= config.targetP95Ms ? 'PASS (this wallet run only)' : 'FAIL (this wallet run)',
    C2: 'UNRESOLVED — manual prompt completeness, clean grants, scope and reopen review required',
    C8: 'UNRESOLVED — compare both device identities and displayed-page evidence',
    promptEntries: run.prompts?.length ?? 0, failedRequestNotes: run.errors ?? [],
    limitation: 'An export cannot independently prove its provenance. Retain raw native/server evidence and review it. Both wallet cohorts are required for overall C3.',
  }
}
