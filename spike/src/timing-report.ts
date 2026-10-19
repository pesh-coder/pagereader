import { config } from './config.js'

interface Call { method?: string; ok?: boolean }
interface Sample {
  page?: number; edition?: string; identityKey?: string; txid?: string
  purchased?: boolean; visible?: boolean; totalMs?: number; trigger?: string
  timingBoundary?: string; network?: string; walletCalls?: Call[]
}
interface Run {
  schema?: number; runId?: string; walletName?: string; walletVersion?: string
  origin?: string; edition?: string; identityKey?: string; network?: string
  samples?: Sample[]; ledger?: { txid: string; identityKey: string; edition?: string; page: number; sats: number; state: string }[]
  errors?: unknown[]; prompts?: unknown[]
}

// Statistical output is descriptive. Acceptance also needs a complete,
// mainnet, newly-paid cohort; a purchased flag alone is insufficient.
export function timingReport(run: Run) {
  if (![1, 2].includes(run.schema ?? 0) || !Array.isArray(run.samples)) throw new Error('Not a spike evidence export')
  const paid = run.samples.filter(sample => sample.purchased === true)
  const durations = paid.filter(sample => sample.visible === true && Number.isFinite(sample.totalMs) && sample.totalMs! >= 0).map(sample => sample.totalMs!).sort((a, b) => a - b)
  const percentile = (p: number) => durations.length ? durations[Math.ceil(p * durations.length) - 1] : null
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
    const valid = sample.visible === true && Number.isFinite(sample.totalMs) && sample.totalMs! >= 0 &&
      sample.network === 'mainnet' && sample.trigger === 'explicit' && sample.timingBoundary === 'request-to-visible-frame' &&
      Number.isInteger(sample.page) && sample.page! > config.freePages && sample.edition === run.edition && sample.identityKey === run.identityKey &&
      /^[a-f0-9]{64}$/.test(sample.txid ?? '') && !pages.has(sample.page!) && !txids.has(sample.txid!) &&
      workflows.length === 1 && workflows[0].ok === true &&
      payment.length === 1 && payment[0].identityKey === run.identityKey && payment[0].edition === run.edition && payment[0].page === sample.page && payment[0].sats === config.priceSats && payment[0].state === 'confirmed'
    if (!valid) reasons.push(`Paid sample ${index + 1} lacks a unique new transaction, matching accepted receipt, explicit visible timing or mainnet context.`)
    else eligiblePaidSamples++
    if (sample.page !== undefined) pages.add(sample.page)
    if (sample.txid) txids.add(sample.txid)
  }
  return {
    runId: run.runId, walletName: run.walletName, walletVersion: run.walletVersion, origin: run.origin,
    paidSamples: paid.length, eligiblePaidSamples, descriptiveTimedSamples: durations.length,
    p50Ms: percentile(0.5), p95Ms: percentile(0.95), qualificationIssues: reasons,
    C3: reasons.length ? 'UNRESOLVED' : percentile(0.95)! <= config.targetP95Ms ? 'PASS (this wallet run only)' : 'FAIL (this wallet run)',
    C2: 'UNRESOLVED — manual prompt completeness, clean grants, scope and reopen review required',
    C8: 'UNRESOLVED — compare both device identities and displayed-page evidence',
    promptEntries: run.prompts?.length ?? 0, failedRequestNotes: run.errors ?? [],
    limitation: 'An export cannot independently prove its provenance. Retain raw native/server evidence and review it. Both wallet cohorts are required for overall C3.',
  }
}
