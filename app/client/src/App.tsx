import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { config, createReaderGateway, type Book, type ReaderPage } from './reader/gateway'
import { summarizeSpending } from './reader/spending'

function Panel({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const el = ref.current!; el.showModal(); return () => el.close() }, [])
  return <dialog ref={ref} onCancel={close} aria-label={title}><div className="panel-heading"><h2>{title}</h2><button onClick={close} aria-label={`Close ${title}`}>×</button></div>{children}</dialog>
}
export default function App() {
  const [, invalidate] = useState(0)
  const [gateway] = useState(() => createReaderGateway(() => invalidate(n => n + 1)))
  const [books, setBooks] = useState<Book[]>([])
  const [book, setBook] = useState<Book | null>(null)
  const [page, setPage] = useState<ReaderPage | null>(null)
  const [panel, setPanel] = useState<'contents' | 'appearance' | 'spent' | 'purchase' | null>(null)
  const [target, setTarget] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [failedPage, setFailedPage] = useState<number | null>(null)
  const [paused, setPaused] = useState(true)
  const [checkingCosts, setCheckingCosts] = useState(false)
  const [costMessage, setCostMessage] = useState('')
  const [fontSize, setFontSize] = useState(() => Math.max(17, Math.min(24, Number(localStorage.getItem('pagestream-font-size')) || 19)))
  const [night, setNight] = useState(() => localStorage.getItem('pagestream-theme') === 'night')
  const lock = useRef(false)
  const article = useRef<HTMLElement>(null)
  useEffect(() => {
    let cancelled = false
    gateway.library().then(result => { if (!cancelled) { setBooks(result.books); setPaused(result.purchasesPaused) } }).catch(() => { if (!cancelled) setError('The library could not load. Please refresh. No wallet was requested.') })
    return () => { cancelled = true }
  }, [gateway])
  useEffect(() => { document.documentElement.dataset.theme = night ? 'night' : 'day'; localStorage.setItem('pagestream-theme', night ? 'night' : 'day') }, [night])
  useEffect(() => { localStorage.setItem('pagestream-font-size', String(fontSize)) }, [fontSize])
  useEffect(() => {
    if (!book || !page) return
    let cancelled = false
    const displayedBook = book, displayedPage = page.page
    const save = () => {
      if (cancelled || document.visibilityState !== 'visible') return
      void gateway.bookmark(displayedBook, displayedPage, Date.now()).catch(() => setError('Page displayed. Its bookmark could not be saved; payment is unaffected.'))
    }
    const frame = requestAnimationFrame(() => requestAnimationFrame(save))
    document.addEventListener('visibilitychange', save)
    return () => { cancelled = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', save) }
  }, [book, page, gateway])
  async function turn(selected: Book, number: number, recoveryOnly = false) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setPanel(null)
    try {
      const body = await gateway.page(selected, number, recoveryOnly)
      setBook(selected); setPage(body); setFailedPage(null)
      window.scrollTo(0, 0)
      requestAnimationFrame(() => article.current?.focus({ preventScroll: true }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Page could not load. Your current page is kept.')
      setFailedPage(number)
    } finally { lock.current = false; setBusy(false) }
  }
  function openBook(selected: Book) {
    if (busy) return
    setCostMessage('')
    if (selected.mode === 'excerpt') { setBook(selected); setPage(null); setError(''); setFailedPage(null); window.scrollTo(0, 0); return }
    const saved = gateway.savedPage(selected) ?? 1
    setBook(selected); setPage(null)
    // Resuming a paid page is read-only: never turn a saved page number into
    // authorization for a new charge, even after changing wallets/reloading.
    void turn(selected, saved, saved > config.freePages)
  }
  const owns = (n: number) => gateway.owned().some(p => p.page === n)
  async function resumeSaved() {
    if (!book || busy || lock.current) return
    const selected = book
    lock.current = true; setBusy(true); setError('')
    try {
      const saved = await gateway.resumePage(selected)
      if (saved === null) { setError('No saved bookmark yet.'); return }
      const body = await gateway.page(selected, saved, true)
      setBook(selected); setPage(body); setFailedPage(null); setPanel(null)
      window.scrollTo(0, 0)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not resume the saved page. No payment was attempted.') }
    finally { lock.current = false; setBusy(false) }
  }
  function request(n: number) {
    if (!book || busy || n < 1 || n > (book.pages ?? 0)) return
    if (n <= config.freePages || owns(n)) { void turn(book, n); return }
    setTarget(n); setPanel('purchase')
  }
  async function checkCosts() {
    if (busy || lock.current || checkingCosts) return
    lock.current = true; setBusy(true); setCheckingCosts(true); setCostMessage('')
    try {
      const result = await gateway.reconcileCosts()
      setCostMessage(`Wallet totals checked for ${result.matched} payment${result.matched === 1 ? '' : 's'}.${result.missing ? ` ${result.missing} not found; previous records kept.` : ''}`)
    } catch (failure) { setCostMessage(failure instanceof Error ? failure.message : 'Wallet history could not load. Existing costs were kept.') }
    finally { lock.current = false; setBusy(false); setCheckingCosts(false) }
  }
  const receipts = book?.mode === 'reader' ? gateway.receipts() : []
  const spending = summarizeSpending(receipts)
  const spendLabel = gateway.hasIdentity() && book?.mode === 'reader' ? spending.label.replace('Spent ', 'Book total: ') : 'Free preview'
  const nextPaid = page && page.page + 1 > config.freePages && !owns(page.page + 1)
  const maxCost = config.priceSats + config.provisional.maxPageFeeSats
  const close = () => setPanel(null)
  return <div className="app" style={{ '--reader-size': `${fontSize}px` } as CSSProperties}>
    <a className="skip" href="#reading">Skip to book text</a>
    <header className="app-header"><div className="header-main">
      <button className="quiet" disabled={busy} onClick={() => { setBook(null); setPage(null); close(); setError(''); setFailedPage(null) }}>Library</button>
      <span className="wordmark">¶ <span className="brand-name">Pagestream</span></span>
      <button className="quiet" onClick={() => setPanel('appearance')} aria-label="Text settings">Aa</button></div>
      {book && <div className="reading-tools"><button className="quiet" disabled={book.mode === 'excerpt' || busy} onClick={() => setPanel('contents')}>Pages</button>
        <span role="status">{checkingCosts ? 'Checking wallet history…' : busy ? 'Confirming…' : book.mode === 'excerpt' ? 'Opening excerpt' : page && page.page <= config.freePages ? 'Free preview' : page ? 'Owned page' : 'Page unavailable'}</span>
        <button className="quiet money" onClick={() => setPanel('spent')}>{spendLabel}</button></div>}</header>
    {error && <div className="notice" role="alert"><p>{error}</p>{book && failedPage !== null && failedPage > config.freePages && gateway.hasIdentity() && <button disabled={busy} onClick={() => void turn(book, failedPage, true)}>Check existing purchase · no new payment</button>}</div>}
    {!book ? <main id="reading" className="library"><div className="library-intro"><p className="eyebrow">The reading room</p><h1>One page at a time.</h1><p>Classics to settle into. Start reading freely.</p></div>
      {!books.length && !error && <p role="status">Opening the library…</p>}
      <div className="book-grid">{books.map((item, index) => <button className="book-card" key={item.id} onClick={() => openBook(item)} disabled={busy}><span className="cover-frame"><img className="book-cover" src={`${import.meta.env.BASE_URL}covers/${item.id}.jpg`} alt="" width="200" height="300" loading={index < 3 ? 'eager' : 'lazy'} decoding="async" /></span><span className="eyebrow">{item.mode === 'reader' ? 'Reader available' : 'Opening excerpt'}</span><span className="book-title">{item.title}</span><span>{item.author}</span><span className="subtle">{item.mode === 'reader' ? `First ${config.freePages} pages free · ${item.pages} pages available` : 'Free preview · full reader being prepared'}</span><span className="open-label">{item.mode === 'reader' ? gateway.savedPage(item) ? `Continue · page ${gateway.savedPage(item)}` : 'Read' : 'Preview'} →</span></button>)}</div>
    </main> : <><main className="reader-layout"><article ref={article} tabIndex={-1} id="reading" aria-label={`${book.title}, ${page ? `page ${page.page}` : 'opening excerpt'}`}>
      <p className="eyebrow">{book.author}</p><h1>{book.title}</h1><p className="chapter">{book.mode === 'excerpt' ? book.chapter : 'Project Gutenberg edition'}</p>
      <div className="book-text">{(page?.paragraphs ?? [book.excerpt ?? '']).map((text, i) => <p key={`${page?.page}-${i}`}>{text}</p>)}</div>
      <p className="page-end">{page ? `— ${page.page} —` : book.mode === 'excerpt' ? 'End of opening excerpt' : busy ? 'Opening your page…' : 'Your saved page could not be opened.'}</p>
      {!page && book.mode === 'reader' && !busy && <button className="wide" onClick={() => void turn(book, 1)}>Read the free preview</button>}
      {book.mode === 'excerpt' && <p className="subtle">The full reader for this title is being prepared. This excerpt is free and makes no wallet calls.</p>}
      <p className="source"><a href={book.sourceUrl} target="_blank" rel="noreferrer">Project Gutenberg · source</a>{book.editionId && <> · <a href={`/api/editions/${encodeURIComponent(book.editionId)}/notices`} target="_blank" rel="noreferrer">Edition notices</a></>}</p>
    </article></main><nav className="pager" aria-label="Page navigation">
      <button className="page-arrow" disabled={!page || page.page === 1 || busy} onClick={() => request(page!.page - 1)} aria-label="Previous page">‹ <span className="previous-word">Previous</span></button>
      <button className="position" disabled={!page || busy} onClick={() => setPanel('contents')}><span>{page ? `Page ${page.page} of ${book.pages}` : book.mode === 'excerpt' ? 'Excerpt' : 'Saved page'}</span><span>{busy ? 'Confirming…' : page && page.page <= config.freePages ? 'Free' : page ? 'Owned' : book.mode === 'excerpt' ? 'Free' : 'Unavailable'}</span></button>
      <button className={`page-arrow next ${nextPaid ? 'money' : ''}`} disabled={!page || page.page === book.pages || busy} onClick={() => request(page!.page + 1)}>{nextPaid ? `Next · up to ${maxCost} sats` : 'Next'} ›</button>
    </nav></>}
    {panel === 'appearance' && <Panel title="Text settings" close={close}><div className="setting-row"><span>Text size</span><div><button aria-label="Smaller text" disabled={fontSize <= 17} onClick={() => setFontSize(n => Math.max(17, n - 1))}>A−</button> <button aria-label="Larger text" disabled={fontSize >= 24} onClick={() => setFontSize(n => Math.min(24, n + 1))}>A+</button></div></div><div className="setting-row"><span>Paper</span><div><button aria-pressed={!night} onClick={() => setNight(false)}>Day</button> <button aria-pressed={night} onClick={() => setNight(true)}>Night</button></div></div><p className="subtle">Text size changes the layout, never the purchased page.</p></Panel>}
    {panel === 'contents' && book && <Panel title="Pages" close={close}>
      {book.mode === 'reader' && <><button className="wide" disabled={busy} onClick={() => void resumeSaved()}>Resume saved page</button><p className="subtle">Find the bookmark saved with your wallet. This cannot buy a page.</p></>}
      <nav className="page-list" aria-label="Choose a page">{Array.from({ length: gateway.hasIdentity() ? book.pages ?? 0 : config.freePages + 1 }, (_, i) => i + 1).map(n => <button key={n} aria-current={page?.page === n ? 'page' : undefined} onClick={() => request(n)}><span>Page {n}</span><span>{n <= config.freePages ? 'Free' : owns(n) ? 'Owned' : `${config.priceSats} sats + fee`}</span></button>)}</nav><p className="subtle">More pages appear after your wallet identifies you at page 3.</p>
    </Panel>}
    {panel === 'purchase' && book && <Panel title={`Open page ${target}`} close={close}><p>{config.priceSats} sats for this page, plus up to {config.provisional.maxPageFeeSats} sat in miner fees.</p><p className="subtle">{config.provisional.readerPermissionCopy}</p>{paused && <p className="subtle">New purchases are temporarily paused. You can check pages you already own.</p>}<button className="paid-action wide" onClick={() => void turn(book, target, paused)}>{paused ? 'Check existing purchase' : `Continue · up to ${maxCost} sats`}</button></Panel>}
    {panel === 'spent' && <Panel title="Spent on this book" close={close}>
      <p className="money">{spendLabel}</p>
      {receipts.length > 0 && !spending.unknownFees && <p className="subtle">{spending.pageSats} sats for pages + {spending.feeSats} sats in miner fees.</p>}
      <p className="subtle">Includes confirming and unresolved page payments. Separate wallet permission costs are not included. Reading an owned page again adds no page charge.</p>
      {!gateway.hasIdentity() && <p>No wallet has been requested. Use Resume saved page to find an existing purchase without buying a page.</p>}
      {spending.unknownFees && <p className="subtle">Some fees are not recorded on this browser. Check wallet costs to look up the total debited for each payment; its fee breakdown may still be unavailable.</p>}
      {gateway.hasIdentity() && <button disabled={busy || checkingCosts} onClick={() => void checkCosts()}>{checkingCosts ? 'Checking wallet history…' : 'Check wallet costs · no payment'}</button>}
      {costMessage && <p role="status">{costMessage}</p>}
      <dl className="cost-list">{[...receipts].sort((a, b) => Number(b.page === page?.page) - Number(a.page === page?.page) || a.page - b.page).map(s => {
        const total = s.walletDebitSats ?? (s.feeSats == null ? null : s.sats + s.feeSats)
        return <div key={s.txid}>
          <dt>Page {s.page} · {s.state}{page?.page === s.page && ' · current page'}</dt>
          <dd>
            <p className="cost-line"><span>Page price</span><strong>{s.sats} sats</strong></p>
            <p className="cost-line"><span>Miner fee</span><span>{s.feeSats == null ? 'Not recorded' : `${s.feeSats} ${s.feeSats === 1 ? 'sat' : 'sats'}`}</span></p>
            <p className="cost-line cost-total"><span>Page total</span><strong>{total === null ? `At least ${s.sats}` : total} sats</strong></p>
            {total === null && <p className="subtle">The final total is unknown here because the fee is not recorded.</p>}
            {total !== null && s.feeSats == null && <p className="subtle">Total debited by the wallet; fee breakdown not recorded here.</p>}
            <details className="cost-transaction"><summary>Transaction details</summary><small className="txid">{s.txid}</small>{s.walletStatus && <small>Wallet status: {s.walletStatus}</small>}</details>
          </dd>
        </div>
      })}</dl>
      <p className="subtle">“Confirmed” means the server accepted the page purchase; it does not mean mined into a block. Checking wallet history cannot create a payment or permission grant.</p>
    </Panel>}
  </div>
}
