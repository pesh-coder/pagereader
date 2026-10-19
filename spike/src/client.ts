import { config } from './config.js'
import type { HttpCall, Spend, WalletCall } from './wallet-client.js'
import { summarizeSpending } from '../../app/client/src/reader/spending.js'

interface Page { editionId: string; page: number; paragraphs: string[]; purchase?: { txid: string; sats: number; feeSats?: number }; timing?: Record<string, number> }
interface Me { identityKey: string; purchases: { page: number; txid: string; sats: number; feeSats?: number }[]; bookmark: { page: number; displayed_at: number } | null }
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const json = async <T>(response: Response): Promise<T> => { if (!response.ok) throw new Error(`Request returned ${response.status}; no new payment will be attempted automatically`); return response.json() as Promise<T> }
const diaryKey = 'pagestream-spike-diary-v1'
const saved = JSON.parse(sessionStorage.getItem(diaryKey) ?? '{}')
const evidence = {
  schema: 2, runId: saved.runId ?? crypto.randomUUID(), openedAt: saved.openedAt ?? new Date().toISOString(), origin: location.origin,
  walletCalls: (saved.walletCalls ?? []) as WalletCall[], http: (saved.http ?? []) as HttpCall[], samples: (saved.samples ?? []) as Record<string, unknown>[],
  prompts: (saved.prompts ?? []) as { at: string; page: number; note: string }[], errors: (saved.errors ?? []) as string[],
}
const persistEvidence = () => sessionStorage.setItem(diaryKey, JSON.stringify(evidence))
const spends = new Map<string, Spend>(Object.entries(JSON.parse(localStorage.getItem('pagestream-spike-spends-v1') ?? '{}')))
let edition = '', shown = 1, requested = 1, busy = false, allowSpend = false
let wallet: Awaited<ReturnType<typeof import('./wallet-client.js')['openWallet']>> | undefined
let currentMe: Me | undefined
let failedPage: number | undefined
let purchasesPaused = false
const editionApi = (path: string) => `/api/editions/${encodeURIComponent(edition)}/${path}`
const runEditions = new Map<string, { title: string; pages: number }>()
let probePageLimit = config.maxProbePage as number
const updateSpent = () => {
  if (!wallet) { el('spent').textContent = 'Free preview · no wallet calls'; return }
  const entries = [...spends.values()].filter(s => s.edition === edition && s.identityKey === wallet?.identityKey)
  const confirmed = entries.filter(s => s.state === 'confirmed')
  const summary = summarizeSpending(entries)
  el('spent').textContent = `${summary.label} · ${confirmed.length} accepted page purchases${summary.unknownFees ? ' · miner-fee breakdown incomplete' : ''} · separate wallet/permission costs not included`
}
const saveSpend = (spend: Spend) => { spends.set(spend.txid, { ...spend, edition }); localStorage.setItem('pagestream-spike-spends-v1', JSON.stringify(Object.fromEntries(spends))); updateSpent() }
const readOnly = async <T>(path: string, method = 'GET', body?: unknown) => {
  if (!wallet) throw new Error('Wallet not acquired')
  return await json<T>(await wallet.auth.fetch(location.origin + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), paymentRetryAttempts: 1 }))
}
async function acquire() {
  if (wallet && currentMe) return
  if (!wallet) {
    const module = await import('./wallet-client.js')
    wallet = await module.openWallet({ call: call => evidence.walletCalls.push(call), http: call => evidence.http.push(call), spend: saveSpend, currentPage: () => requested, canSpend: () => allowSpend })
  }
  el('identity').textContent = `Reader public identity: ${wallet.identityKey}`
  currentMe = await readOnly<Me>(editionApi('me'))
  if (currentMe.identityKey !== wallet.identityKey) throw new Error('Server authenticated a different wallet identity')
  for (const purchase of currentMe.purchases) {
    const known = spends.get(purchase.txid)
    saveSpend({ ...known, ...purchase, identityKey: wallet.identityKey, edition, feeSats: purchase.feeSats ?? known?.feeSats ?? null, state: 'confirmed' })
  }
  el('resume').hidden = false
}
async function display(page: Page) {
  el('page').replaceChildren(...page.paragraphs.map(text => { const p = document.createElement('p'); p.textContent = text; return p }))
  shown = page.page
  el('page-number').textContent = `Page ${shown} · ${shown <= config.freePages ? 'free preview' : 'server-returned content'}`
  el<HTMLButtonElement>('previous').disabled = shown === 1
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  if (document.visibilityState !== 'visible') await new Promise<void>(resolve => document.addEventListener('visibilitychange', function check() { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', check); resolve() } }))
  const displayedAt = Date.now()
  // Bookmark is independent: launch after paint/visibility, exclude write from page-turn latency.
  localStorage.setItem(`pagestream-free-bookmark:${edition}`, JSON.stringify({ page: shown, displayedAt }))
  if (wallet && currentMe) void readOnly(editionApi('bookmarks'), 'PUT', { page: shown, displayedAt }).catch(() => { evidence.errors.push(`Bookmark for displayed page ${page.page} was not saved`); el('error').textContent = 'Page displayed; bookmark save failed independently.' })
}
async function paidResponse(response: Response, page: number): Promise<Page> {
  if (response.ok) return json<Page>(response)
  // A merge after a server restart can return 409 even though the wallet
  // accepted this exact proof and ownership was durably committed.
  allowSpend = false
  const status = await readOnly<{ purchase: Page['purchase'] | null }>(editionApi(`status/${page}`))
  if (status.purchase) return readOnly<Page>(editionApi(`owned/${page}`))
  return json<Page>(response)
}
async function turn(page: number, recoveryOnly = false, trigger = 'explicit') {
  if (busy || !Number.isInteger(page) || page < 1 || page > probePageLimit) return
  if (purchasesPaused && page > config.freePages && !wallet && !recoveryOnly) { el('error').textContent = 'New payments paused. Use Check existing purchase to request recovery only.'; failedPage = page; el('reconcile').hidden = false; return }
  if (!wallet && page > 3) { el('error').textContent = 'Request page 3 first to start the wallet flow.'; return }
  busy = true; requested = page; allowSpend = false
  el<HTMLButtonElement>('next').disabled = true
  el<HTMLSelectElement>('edition-select').disabled = true
  el('error').textContent = ''
  const started = performance.now(), callStart = evidence.walletCalls.length, httpStart = evidence.http.length
  try {
    let body: Page
    let purchased = false
    if (page <= config.freePages) body = await json<Page>(await fetch(editionApi(`public/pages/${page}`)))
    else {
      el('status').textContent = 'Confirming… Current page stays visible.'
      await acquire()
      const status = await readOnly<{ purchase: Page['purchase'] | null; intent: unknown }>(editionApi(`status/${page}`))
      if (status.purchase) body = await readOnly<Page>(editionApi(`owned/${page}`))
      else {
        const savedAttempt = wallet!.getAttempt(edition, page)
        if (savedAttempt?.proof) {
          body = await paidResponse(await wallet!.recoverPayment(edition, page, true), page)
        } else {
          const aborted = savedAttempt?.state === 'aborted'
          if (savedAttempt && !aborted) throw new Error('Existing local payment attempt needs reconciliation. No new payment will be created.')
          if (status.intent && !aborted) throw new Error('Existing purchase is pending or unresolved. Check it without paying again.')
          if (recoveryOnly) throw new Error('No existing payment found. This check cannot create a new payment.')
          if (purchasesPaused) throw new Error('New paid requests remain paused. Only existing payments can be recovered.')
          // Only an explicit wallet abort before signing permits another quote,
          // and it retains the existing server intent/request ID.
          const requestId = aborted ? savedAttempt.requestId : crypto.randomUUID()
          wallet!.beginPayment(edition, page, requestId)
          allowSpend = true
          try { body = await paidResponse(await wallet!.auth.fetch(location.origin + editionApi(`pages/${page}`), { headers: { 'x-bsv-request-id': requestId }, paymentRetryAttempts: 1, labels: ['pagestream spike'] }), page) }
          finally { allowSpend = false }
          purchased = true
        }
      }
      if (body.purchase) {
        wallet!.confirmPayment(edition, page, body.purchase.txid)
        const spend = spends.get(body.purchase.txid)
        if (spend) saveSpend({ ...spend, feeSats: body.purchase.feeSats ?? spend.feeSats, state: 'confirmed' })
      }
    }
    if (body.editionId !== edition || body.page !== page || !Array.isArray(body.paragraphs) || !body.paragraphs.every(text => typeof text === 'string')) throw new Error('Server returned a different page or edition; current text is kept.')
    await display(body)
    const totalMs = performance.now() - started
    evidence.samples.push({ page, edition, identityKey: wallet?.identityKey ?? null, txid: body.purchase?.txid ?? null, network: wallet?.network ?? null, trigger, timingBoundary: 'request-to-visible-frame', purchased, totalMs, timing: body.timing ?? null, walletCalls: evidence.walletCalls.slice(callStart), http: evidence.http.slice(httpStart), visible: true, timestamp: new Date().toISOString() })
    el('status').textContent = page <= config.freePages ? `Free preview · page ${page} of 2` : `Page ${page} displayed${purchased ? ' after payment' : ' · owned'}`
    failedPage = undefined; el('reconcile').hidden = true
  } catch (error) {
    for (const spend of spends.values()) if (spend.edition === edition && spend.identityKey === wallet?.identityKey && spend.page === page && spend.state === 'pending') saveSpend({ ...spend, state: 'unresolved' })
    const message = error instanceof Error ? error.message : 'Probe request failed'
    evidence.errors.push(message); el('error').textContent = message
    el('status').textContent = `Still showing page ${shown}; request for page ${page} did not complete`
    failedPage = page; el('reconcile').hidden = !wallet
  } finally {
    busy = false; allowSpend = false; el<HTMLButtonElement>('next').disabled = shown >= probePageLimit
    el<HTMLSelectElement>('edition-select').disabled = false
    el('next').textContent = shown + 1 <= config.freePages ? 'Next page →' : `Next page · ${config.priceSats} sats if unowned`
    updateSpent(); persistEvidence(); el('diagnostics').textContent = JSON.stringify({ paidSamples: evidence.samples.filter(s => s.purchased).length, walletCalls: evidence.walletCalls.length, lastFailedWalletCall: evidence.walletCalls.findLast(call => !call.ok) ?? null, recentWalletCalls: evidence.walletCalls.slice(-8), recordedPrompts: evidence.prompts.length, errors: evidence.errors }, null, 2)
  }
}
el('previous').onclick = () => void turn(shown - 1)
el('edition-select').onchange = async () => {
  const select = el<HTMLSelectElement>('edition-select'), selected = select.value, book = runEditions.get(selected)
  if (busy || !book) { select.value = edition; return }
  const previous = { edition, title: el('title').textContent, me: currentMe, limit: probePageLimit }
  edition = selected; currentMe = undefined; probePageLimit = Math.min(config.maxProbePage, book.pages)
  el('title').textContent = book.title
  el<HTMLInputElement>('jump-page').max = String(probePageLimit)
  // Selection displays only the new edition's public page one. It never warms
  // a wallet or interprets its bookmark as a new payment authorization.
  await turn(1, false, 'initial')
  if (failedPage !== undefined) {
    edition = previous.edition; currentMe = previous.me; probePageLimit = previous.limit
    select.value = edition; el('title').textContent = previous.title
    el<HTMLInputElement>('jump-page').max = String(probePageLimit)
  }
}
const reviewKey = 'pagestream-native-permission-review-v1'
const priorReview = sessionStorage.getItem(reviewKey)
if (priorReview) {
  el('permission-review-result').textContent = priorReview
  el<HTMLButtonElement>('permission-review').disabled = true
}
el('permission-review').onclick = async () => {
  // One request in this tab, including reload. No automatic repeated prompt.
  el<HTMLButtonElement>('permission-review').disabled = true
  el('permission-review-result').textContent = 'Preparing a permission-only review. Do not approve; inspect and cancel.'
  const module = await import('./permission-review.js')
  await module.reviewPermissionPrompt(record => {
    const value = JSON.stringify(record, null, 2)
    sessionStorage.setItem(reviewKey, value)
    el('permission-review-result').textContent = value
  })
}
el('next').onclick = () => void turn(shown + 1)
el('jump').onclick = () => void turn(Number(el<HTMLInputElement>('jump-page').value))
el('reconcile').onclick = () => { if (failedPage) void turn(failedPage, true, 'recovery') }
el('resume').onclick = async () => {
  try { currentMe = await readOnly<Me>(editionApi('me')); if (currentMe.bookmark) await turn(currentMe.bookmark.page, true, 'resume') }
  catch { el('error').textContent = 'Could not fetch saved bookmark; no payment attempted.' }
}
el('add-prompt').onclick = () => {
  const note = el<HTMLTextAreaElement>('prompt-note').value.trim()
  if (!note) return
  evidence.prompts.push({ at: new Date().toISOString(), page: requested, note })
  persistEvidence()
  el('prompt-count').textContent = `${evidence.prompts.length} observed prompts recorded`
  el<HTMLTextAreaElement>('prompt-note').value = ''
}
el('export').onclick = () => {
  const data = { ...evidence, exportedAt: new Date().toISOString(), edition, identityKey: wallet?.identityKey ?? null, network: wallet?.network ?? null, walletName: el<HTMLSelectElement>('wallet-name').value, walletVersion: el<HTMLInputElement>('wallet-version').value, deviceNote: el<HTMLInputElement>('device-note').value, grantNote: el<HTMLTextAreaElement>('grant-note').value, ledger: [...spends.values()], config }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = `pagestream-${evidence.runId}-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url)
}
async function start() {
  const catalogue = await json<{ editionId: string; title: string; manifestEnabled: boolean; purchasesPaused?: boolean }>(await fetch('/api/catalogue'))
  purchasesPaused = catalogue.purchasesPaused === true
  edition = catalogue.editionId; el('title').textContent = catalogue.title
  const library = await json<{ books: { mode: string; editionId?: string; title: string; pages?: number }[] }>(await fetch('/api/library'))
  const select = el<HTMLSelectElement>('edition-select')
  for (const book of library.books) if (book.mode === 'reader' && book.editionId && Number.isInteger(book.pages) && book.pages! > config.freePages) {
    runEditions.set(book.editionId, { title: book.title, pages: book.pages! })
    const option = document.createElement('option'); option.value = book.editionId; option.textContent = book.title; select.append(option)
  }
  if (!runEditions.has(edition)) throw new Error('Original edition is missing from the catalogue')
  select.value = edition
  if (!catalogue.manifestEnabled) document.querySelector('link[rel=manifest]')?.remove()
  el('permission-copy').textContent = config.provisional.permissionCopy
  el<HTMLInputElement>('jump-page').max = String(config.maxProbePage)
  await turn(1, false, 'initial')
  if (purchasesPaused) el('error').textContent = 'Paid testing paused. Free pages remain available; do not authorize further wallet prompts.'
}
void start().catch(() => { el('error').textContent = 'Could not load public catalogue. No wallet requested.' })
