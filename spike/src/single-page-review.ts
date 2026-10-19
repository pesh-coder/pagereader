// Explicitly invoked operator experiment; never starts on module load.
import { connectDesktopWallet } from '../../app/client/src/bsv/walletAcquisition.js'
import { openWallet } from './wallet-client.js'
import { config } from './config.js'
import { assertReadOnlyPageSixResume } from './single-page-state.js'

export async function preparePageSix(authorized: boolean, resumeSettledReadOnlyPreflight = false) {
  if (!authorized || location.origin !== 'http://localhost:3108') throw new Error('Authorized localhost page-6 run required')
  const key = 'pagestream-controlled-page6-v1'
  const prior = localStorage.getItem(key)
  if (prior && !resumeSettledReadOnlyPreflight) throw new Error('Existing page-6 run must be reconciled without replacement')
  if (!prior && resumeSettledReadOnlyPreflight) throw new Error('Original read-only preflight journal required')
  const record: Record<string, any> = prior ? JSON.parse(prior) : { startedAt: new Date().toISOString(), page: 6, requestId: crypto.randomUUID(), state: 'preflight', calls: [], http: [], spends: [] }
  if (prior) { assertReadOnlyPageSixResume(record); record.readOnlyResumes = [...(record.readOnlyResumes ?? []), { at: new Date().toISOString(), previousHistory: record.before, previousCallCount: record.calls.length, previousHttpCount: record.http.length }] }
  const save = () => localStorage.setItem(key, JSON.stringify(record))
  save()
  let spending = false
  const { wallet: raw } = await connectDesktopWallet()
  const history = async () => {
    const r = await raw.listActions({ labels: [], seekPermission: false, limit: 100 })
    if (r.totalActions !== r.actions.length || new Set(r.actions.map(a => a.txid)).size !== r.actions.length || r.actions.some(a => !/^[a-f0-9]{64}$/.test(a.txid) || !Number.isSafeInteger(a.satoshis))) throw new Error('Complete valid history required')
    return r.actions.map(({ txid, satoshis, status }) => ({ txid, satoshis, status }))
  }
  record.before = await history(); save()
  const w = await openWallet({
    call: call => { record.calls.push(call); save() },
    http: call => { record.http.push(call); save() },
    spend: spend => { record.spends.push(spend); save() },
    currentPage: () => 6, canSpend: () => spending,
  })
  const health = await (await fetch('/health')).json()
  if (health.network !== 'main' || !health.purchasesPaused || config.provisional.maxPageFeeSats !== 1) throw new Error('Paused mainnet and one-sat fee cap required')
  const nextEdition = (await (await fetch('/api/catalogue')).json()).editionId
  if (prior && (record.edition !== nextEdition || record.identityKey !== w.identityKey)) throw new Error('Resumed preflight identity/edition changed')
  record.edition = nextEdition
  record.identityKey = w.identityKey
  const base = `/api/editions/${encodeURIComponent(record.edition)}`
  const statusResponse = await w.auth.fetch(location.origin + base + '/status/6', { paymentRetryAttempts: 1 })
  if (!statusResponse.ok) throw new Error('Read-only status failed')
  const status = await statusResponse.json()
  if (status.purchase || status.intent || w.getAttempt(record.edition, 6)) throw new Error('Existing purchase/intent/journal; no new page payment allowed')
  record.state = 'ready'; save()
  let invoked = false
  return { identityKey: w.identityKey, edition: record.edition as string, page: 6, requestId: record.requestId as string,
    async run() {
      if (invoked) throw new Error('Single invocation only')
      invoked = true
      try {
        w.beginPayment(record.edition, 6, record.requestId)
        record.state = 'requesting'; save(); spending = true
        const started = performance.now()
        const response = await w.auth.fetch(location.origin + base + '/pages/6', { headers: { 'x-bsv-request-id': record.requestId }, paymentRetryAttempts: 1 })
        spending = false
        const body = await response.json()
        record.responseReceivedMs = performance.now() - started
        record.response = { status: response.status, page: body.page, editionId: body.editionId, purchase: body.purchase, paragraphCount: body.paragraphs?.length, timing: body.timing, error: body.error }; save()
        const attempt = w.getAttempt(record.edition, 6)
        if (!response.ok || body.page !== 6 || body.editionId !== record.edition || body.purchase?.txid !== attempt?.txid || !Array.isArray(body.paragraphs) || !body.paragraphs.length) throw new Error('Delivery unresolved; preserve original proof and never replace payment')
        w.confirmPayment(record.edition, 6, body.purchase.txid)
        document.getElementById('page')!.replaceChildren(...body.paragraphs.map((text: string) => { const p = document.createElement('p'); p.textContent = text; return p }))
        document.getElementById('page-number')!.textContent = 'Page 6 · server-returned content'
        record.domUpdatedMs = performance.now() - started; save()
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        if (document.visibilityState !== 'visible') throw new Error('Visibility not established; do not claim displayed bookmark')
        record.displayedAt = Date.now(); record.requestToDisplayMs = performance.now() - started; save()
        // Bookmark happens after display, independently from the payment result.
        try {
          const bookmark = await w.auth.fetch(location.origin + base + '/bookmarks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 6, displayedAt: record.displayedAt }), paymentRetryAttempts: 1 })
          record.bookmark = { status: bookmark.status, body: await bookmark.json() }
        } catch (e) { record.bookmarkError = e instanceof Error ? e.message : 'Bookmark failed' }
        const reread = await w.auth.fetch(location.origin + base + '/owned/6', { paymentRetryAttempts: 1 })
        const owned = await reread.json()
        record.reread = { status: reread.status, txid: owned.purchase?.txid, page: owned.page, paragraphCount: owned.paragraphs?.length }
        if (!reread.ok || owned.purchase?.txid !== body.purchase.txid) throw new Error('Owned reread did not match')
        record.state = 'delivered'
      } catch (e) { record.state = 'unresolved'; record.error = e instanceof Error ? e.message : 'Run failed' }
      finally {
        spending = false
        try { record.after = await history(); const prior = new Set(record.before.map((a: { txid: string }) => a.txid)); record.delta = record.after.filter((a: { txid: string }) => !prior.has(a.txid)) } catch (e) { record.historyError = e instanceof Error ? e.message : 'History failed' }
        record.finishedAt = new Date().toISOString(); save()
      }
      // Proof stays in the existing payment journal; never export it here.
      return record
    },
  }
}
