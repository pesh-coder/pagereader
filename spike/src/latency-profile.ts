// Operator-only profile of an already owned page: no payment or bookmark write.
import { openWallet, type HttpCall, type WalletCall } from './wallet-client.js'

export async function profileOwnedPageSix() {
  const key = 'pagestream-owned-latency-profile-v1'
  if (localStorage.getItem(key)) throw new Error('Inspect the existing profile before repeating')
  const purchase = JSON.parse(localStorage.getItem('pagestream-controlled-page6-v1') ?? 'null')
  if (location.origin !== 'http://localhost:3108' || purchase?.state !== 'delivered' || !purchase.response?.purchase?.txid) throw new Error('Existing delivered page-six purchase required')
  const record: Record<string, any> = { startedAt: new Date().toISOString(), mode: 'OWNED_READ_ONLY_NOT_PAID_P95', state: 'starting', calls: [] as WalletCall[], http: [] as HttpCall[], samples: [] }
  const save = () => localStorage.setItem(key, JSON.stringify(record))
  save()
  try {
    const health = await (await fetch('/health')).json()
    if (!health.purchasesPaused || health.network !== 'main') throw new Error('Paused mainnet required')
    const w = await openWallet({ call: call => { record.calls.push(call); save() }, http: call => { record.http.push(call); save() }, spend: () => { throw new Error('Read-only profile cannot spend') }, currentPage: () => 6, canSpend: () => false })
    if (w.identityKey !== purchase.identityKey) throw new Error('Original reader identity required')
    record.state = 'reading-owned'; save()
    for (let i = 0; i < 3; i++) {
      const started = performance.now(), callStart = record.calls.length
      const response = await w.auth.fetch(location.origin + `/api/editions/${encodeURIComponent(purchase.edition)}/owned/6`, { paymentRetryAttempts: 1 })
      const headersMs = performance.now() - started
      const body = await response.json()
      if (!response.ok || body.page !== 6 || body.editionId !== purchase.edition || body.purchase?.txid !== purchase.response.purchase.txid || !Array.isArray(body.paragraphs) || !body.paragraphs.length) throw new Error('Original owned content/receipt did not match')
      record.samples.push({ index: i, authenticatedResponseMs: headersMs, bodyReceivedMs: performance.now() - started, paragraphs: body.paragraphs.length, server: body.timing, serverTiming: record.http.at(-1)?.serverTiming ?? null, calls: record.calls.slice(callStart) }); save()
    }
    record.state = 'finished'
  } catch (e) { record.state = 'failed'; record.error = e instanceof Error ? e.message : 'Owned profile failed' }
  record.finishedAt = new Date().toISOString(); save()
  return record
}
