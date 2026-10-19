// Operator-only acceptance checks using the already paid page-six proof.
// No new challenge, wallet transaction, broadcast or bookmark is requested.
import { openWallet } from './wallet-client.js'

export async function reviewExistingProof() {
  const key = 'pagestream-existing-proof-review-v1'
  if (localStorage.getItem(key)) throw new Error('Inspect the saved review before any repeat')
  const original = JSON.parse(localStorage.getItem('pagestream-controlled-page6-v1') ?? 'null')
  if (location.origin !== 'http://localhost:3108' || original?.state !== 'delivered') throw new Error('Completed page-six experiment required')
  const attempt = JSON.parse(localStorage.getItem(`pagestream-payment-v2:${original.identityKey}:${original.edition}:6`) ?? 'null')
  if (attempt?.state !== 'confirmed' || !attempt.proof || attempt.txid !== original.response.purchase.txid || attempt.requestId !== original.requestId) throw new Error('Original confirmed proof and request required')
  const record: Record<string, any> = { startedAt: new Date().toISOString(), mode: 'EXISTING_PURCHASE_PROOF_ONLY_NOT_NEW_PURCHASE_RACE', txid: attempt.txid, state: 'preflight', calls: [], http: [], cases: [] }
  const save = () => localStorage.setItem(key, JSON.stringify(record))
  const previousFetch = globalThis.fetch
  save()
  try {
    const health = await (await fetch('/health')).json()
    if (!health.purchasesPaused || health.network !== 'main') throw new Error('Paused mainnet required')
    const library = await (await fetch('/api/library')).json()
    const otherEdition = library.books.find((book: { editionId: string }) => book.editionId !== original.edition)?.editionId
    if (!otherEdition) throw new Error('Second existing edition required')
    const w = await openWallet({ call: call => { record.calls.push(call); save() }, http: call => { record.http.push(call); save() }, spend: () => { throw new Error('Existing-proof review cannot spend') }, currentPage: () => 6, canSpend: () => false })
    if (w.identityKey !== original.identityKey) throw new Error('Original reader identity required')
    const base = `/api/editions/${encodeURIComponent(original.edition)}`
    const proofHeaders = { 'x-bsv-request-id': attempt.requestId, 'x-bsv-payment': JSON.stringify(attempt.proof) }
    record.state = 'reviewing'; save()
    globalThis.fetch = async (input, init) => {
      const response = await previousFetch(input, init)
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
      if (url.pathname === base + '/pages/6' && new Headers(init?.headers).has('x-bsv-payment') && response.status === 200 && !record.responseLossInjected) {
        record.responseLossInjected = true; record.droppedResponseStatus = response.status; save()
        // Drop exactly one already-owned response, never a new purchase response.
        await response.body?.cancel()
        throw new TypeError('INJECTED_EXISTING_OWNED_RESPONSE_LOSS')
      }
      return response
    }
    let recovered: Response
    try { recovered = await w.auth.fetch(location.origin + base + '/pages/6', { headers: proofHeaders, paymentRetryAttempts: 1 }) }
    catch { record.lossSurfacedToCaller = true; save(); recovered = await w.auth.fetch(location.origin + base + '/pages/6', { headers: proofHeaders, paymentRetryAttempts: 1 }) }
    const body = await recovered.json()
    record.cases.push({ name: 'same-original-proof-after-owned-response-loss', status: recovered.status, txid: body.purchase?.txid, paragraphCount: body.paragraphs?.length })
    if (!record.responseLossInjected || !recovered.ok || body.purchase?.txid !== attempt.txid || body.page !== 6) throw new Error('Original proof recovery did not match')
    for (const [name, path] of [['wrong-owned-page', base + '/pages/3'], ['wrong-edition', `/api/editions/${encodeURIComponent(otherEdition)}/pages/6`]]) {
      const response = await w.auth.fetch(location.origin + path, { headers: proofHeaders, paymentRetryAttempts: 1 })
      record.cases.push({ name, status: response.status }); save()
      if (response.status !== 409) throw new Error('Replay did not return the expected conflict')
    }
    record.state = 'finished'
  } catch (e) { record.state = 'failed'; record.error = e instanceof Error ? e.message : 'Existing-proof review failed' }
  finally { globalThis.fetch = previousFetch; record.finishedAt = new Date().toISOString(); save() }
  return record
}
