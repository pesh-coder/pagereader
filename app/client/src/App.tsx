import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  config,
  createReaderGateway,
  ReaderError,
  type Book,
  type ReaderPage,
  type PageFeeApproval,
  type ReaderGateway,
} from './reader/gateway'
import { spendingLabel, summarizeSpending } from './reader/spending'
import { ReadingTimings } from './reader/timings'
import { TimingPanel } from './reader/components/TimingPanel'
import { Panel } from './reader/components/Panel'
import { WalletGuidance } from './reader/components/WalletGuidance'
import { WalletMenu } from './reader/components/WalletMenu'
import { BookText } from './reader/components/BookText'
import { Library } from './reader/components/Library'
import { SpendingPanel } from './reader/components/SpendingPanel'
import { withReadAhead } from './reader/read-ahead'
import { readAheadPermitted } from './reader/read-ahead-policy'

// Reviewable opt-in experiment. Ordinary production builds keep it unavailable.
const readAheadAvailable = import.meta.env.VITE_PAGESTREAM_READ_AHEAD === '1'
const readAheadTarget = import.meta.env.VITE_PAGESTREAM_READ_AHEAD_TARGET ?? ''
const readAheadMode = import.meta.env.VITE_PAGESTREAM_READ_AHEAD_MODE ?? 'scoped'
// Reading sessions (payment channel): build-time switch; the server separately
// limits which wallets may open one.
const sessionsAvailable = import.meta.env.VITE_PAGESTREAM_SESSIONS === '1'
const permitReadAhead = (identity: string, edition: string, page: number) =>
  readAheadPermitted(readAheadAvailable, readAheadMode, readAheadTarget, identity, edition, page)

export default function App({ gatewayFactory }: { gatewayFactory?: () => ReaderGateway } = {}) {
  const [, invalidate] = useState(0)
  const [timings] = useState(() => new ReadingTimings(localStorage))
  const [gateway] = useState(() =>
    withReadAhead(gatewayFactory?.() ?? createReaderGateway(() => invalidate((n) => n + 1), undefined, {
      wallet: call => timings.wallet(call), http: call => timings.http(call),
    }), () => invalidate((n) => n + 1), () => performance.now(),
    permitReadAhead, readAheadMode !== 'continuous'),
  )
  const [books, setBooks] = useState<Book[]>([])
  const [book, setBook] = useState<Book | null>(null)
  const [page, setPage] = useState<ReaderPage | null>(null)
  const [panel, setPanel] = useState<
    'contents' | 'appearance' | 'spent' | 'purchase' | 'wallet' | 'timings' | null
  >(null)
  const [target, setTarget] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paymentDetails, setPaymentDetails] = useState<string[]>([])
  const [feeApproval, setFeeApproval] = useState<PageFeeApproval | null>(null)
  const [errorAction, setErrorAction] = useState<
    'connect' | 'retry' | 'check' | null
  >(null)
  // Do not reuse the old sessionStorage flag: it only explained a 1-sat fee cap.
  // The higher reader ceiling requires fresh consent after reload or logout.
  const [explained, setExplained] = useState(false)
  const [failedPage, setFailedPage] = useState<number | null>(null)
  const [paused, setPaused] = useState(true)
  const [checkingCosts, setCheckingCosts] = useState(false)
  const [costMessage, setCostMessage] = useState('')
  const [sessionMessage, setSessionMessage] = useState('')
  const [fontSize, setFontSize] = useState(() =>
    Math.max(
      17,
      Math.min(24, Number(localStorage.getItem('pagestream-font-size')) || 19),
    ),
  )
  const [night, setNight] = useState(
    () => localStorage.getItem('pagestream-theme') === 'night',
  )
  const lock = useRef(false)
  const viewRevision = useRef(0)
  const article = useRef<HTMLElement>(null)
  const readAhead = gateway.readAheadStatus()
  useEffect(() => {
    if (!readAheadAvailable || !readAhead.enabled || !book || !page || busy || paused ||
      document.visibilityState !== 'visible' || readAhead.state !== 'idle' ||
      !permitReadAhead(gateway.identity() ?? '', book.editionId ?? '', page.page + 1)) return
    const timer = window.setTimeout(() => {
      const revision = viewRevision.current
      const preparationToken = timings.beginPreparation(page.page + 1, book.editionId ?? '')
      void gateway.prepareNext(book, page).then(prepared => {
        timings.finishPreparation(preparationToken, prepared?.purchase?.txid, gateway.receipts())
      }).catch(failure => {
        timings.finishPreparation(preparationToken, undefined, gateway.receipts())
        if (revision !== viewRevision.current) return
        setError(failure instanceof Error ? failure.message : 'Next-page preparation stopped.')
        setErrorAction(failure instanceof ReaderError ? failure.action : 'check')
        setPaymentDetails(failure instanceof ReaderError ? failure.details ?? [] : [])
        setFailedPage(page.page + 1)
      })
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [book, page, busy, paused, gateway, readAhead.enabled, readAhead.state, timings])
  useEffect(() => {
    const stop = () => {
      if (document.visibilityState !== 'visible') gateway.stopReadAhead()
    }
    const leave = () => { gateway.stopReadAhead(); gateway.leaveSession?.() }
    document.addEventListener('visibilitychange', stop)
    window.addEventListener('pagehide', leave)
    return () => { document.removeEventListener('visibilitychange', stop); window.removeEventListener('pagehide', leave) }
  }, [gateway])
  useEffect(() => {
    let cancelled = false
    gateway
      .library()
      .then((result) => {
        if (!cancelled) {
          setBooks(result.books)
          setPaused(result.purchasesPaused)
        }
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'The library could not load. Please refresh. No wallet was requested.',
          )
      })
    return () => {
      cancelled = true
    }
  }, [gateway])
  useEffect(() => {
    document.documentElement.dataset.theme = night ? 'night' : 'day'
    localStorage.setItem('pagestream-theme', night ? 'night' : 'day')
  }, [night])
  useEffect(() => {
    localStorage.setItem('pagestream-font-size', String(fontSize))
  }, [fontSize])
  useEffect(() => {
    if (!book || !page) return
    let cancelled = false
    const displayedBook = book,
      displayedPage = page.page
    const save = () => {
      if (cancelled || document.visibilityState !== 'visible') return
      void gateway
        .bookmark(displayedBook, displayedPage, Date.now())
        .catch(() =>
          setError(
            'Page displayed. Its bookmark could not be saved; payment is unaffected.',
          ),
        )
    }
    const frame = requestAnimationFrame(() => requestAnimationFrame(save))
    document.addEventListener('visibilitychange', save)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', save)
    }
  }, [book, page, gateway])
  useEffect(() => {
    const stop = () => timings.stop('Reader closed or reloaded during capture.')
    window.addEventListener('pagehide', stop)
    return () => window.removeEventListener('pagehide', stop)
  }, [timings])
  function timingContext(edition: string) {
    return { identityKey: gateway.identity(), network: gateway.network(), edition, protocolVersion: gateway.walletVersion() }
  }
  async function turn(selected: Book, number: number, recoveryOnly = false, approval?: PageFeeApproval) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    if (!recoveryOnly) {
      setError('')
      setPaymentDetails([])
      setFeeApproval(null)
      setErrorAction(null)
    }
    setPanel(null)
    const timingToken = timings.begin(number, selected.editionId ?? '', recoveryOnly)
    try {
      const body = await gateway.page(selected, number, recoveryOnly, approval)
      timings.prepared(timingToken, gateway.lastReadAheadUse())
      setError('')
      setPaymentDetails([])
      setErrorAction(null)
      setFeeApproval(null)
      setBook(selected)
      setPage(body)
      setFailedPage(null)
      window.scrollTo(0, 0)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        article.current?.focus({ preventScroll: true })
        timings.finish(timingToken, body.purchase?.txid, timingContext(selected.editionId ?? ''), gateway.receipts(),
          document.visibilityState === 'visible' && article.current?.getAttribute('aria-label') === `${selected.title}, page ${body.page}`)
        invalidate(n => n + 1)
      }))
    } catch (failure) {
      timings.fail(timingToken)
      setFeeApproval(failure instanceof ReaderError ? failure.feeApproval ?? null : null)
      setPaymentDetails(
        failure instanceof ReaderError ? failure.details ?? [] : [],
      )
      setError(
        failure instanceof Error
          ? failure.message
          : 'Page could not load. Your current page is kept.',
      )
      setErrorAction(failure instanceof ReaderError ? failure.action : 'check')
      setFailedPage(number)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function openBook(selected: Book) {
    if (busy) return
    viewRevision.current++
    gateway.stopReadAhead(true)
    setCostMessage('')
    if (selected.mode === 'excerpt') {
      setBook(selected)
      setPage(null)
      setError('')
      setFailedPage(null)
      window.scrollTo(0, 0)
      return
    }
    const saved = gateway.savedPage(selected) ?? 1
    setBook(selected)
    setPage(null)
    if (gateway.hasIdentity()) {
      void resumeSaved(selected, true)
      return
    }
    // Resuming a paid page is read-only: never turn a saved page number into
    // authorization for a new charge, even after changing wallets/reloading.
    void turn(selected, saved, saved > config.freePages)
  }
  const owns = (n: number) => gateway.owned().some((p) => p.page === n)
  async function resumeSaved(selected = book, previewIfMissing = false) {
    if (!selected || busy || lock.current) return
    viewRevision.current++
    lock.current = true
    setBusy(true)
    setError('')
    setErrorAction(null)
    setFailedPage(null)
    try {
      const saved = await gateway.resumePage(selected)
      if (saved === null && !previewIfMissing) {
        setError('No saved bookmark yet. You can start with the free preview.')
        setPanel(null)
        return
      }
      const body = await gateway.page(selected, saved ?? 1, true)
      setBook(selected)
      setPage(body)
      setFailedPage(null)
      setPanel(null)
      window.scrollTo(0, 0)
    } catch (failure) {
      setPanel(null)
      setError(
        failure instanceof ReaderError
          ? failure.message
          : 'We couldn’t open your saved place. Your current page is still available.',
      )
      setErrorAction(failure instanceof ReaderError ? failure.action : 'check')
      setFailedPage(null)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function request(n: number) {
    if (!book || busy || n < 1 || n > (book.pages ?? 0)) return
    if (page && n !== page.page + 1) {
      viewRevision.current++
      gateway.stopReadAhead(true)
    }
    if (n <= config.freePages || owns(n)) {
      void turn(book, n)
      return
    }
    if (gateway.needsPaymentCheck(book, n)) {
      void turn(book, n, true)
      return
    }
    if (sessionOpen) {
      void turn(book, n)
      return
    }
    if (explained) {
      void turn(book, n, paused)
      return
    }
    setTarget(n)
    setPanel('purchase')
  }
  async function checkCosts() {
    if (busy || lock.current || checkingCosts) return
    lock.current = true
    setBusy(true)
    setCheckingCosts(true)
    setCostMessage('')
    try {
      const result = await gateway.reconcileCosts()
      setCostMessage(
        `Wallet totals checked for ${result.matched} payment${result.matched === 1 ? '' : 's'}.${result.missing ? ` ${result.missing} not found; previous records kept.` : ''}`,
      )
    } catch (failure) {
      setCostMessage(
        failure instanceof Error
          ? failure.message
          : 'Wallet history could not load. Existing costs were kept.',
      )
    } finally {
      lock.current = false
      setBusy(false)
      setCheckingCosts(false)
    }
  }
  async function connectWallet() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setErrorAction(null)
    try {
      await gateway.connect(book ?? undefined)
      setPanel(null)
    } catch (failure) {
      setError(
        failure instanceof ReaderError
          ? failure.message
          : 'We couldn’t load your purchases. Try again.',
      )
      setErrorAction(gateway.hasIdentity() ? 'check' : 'connect')
    } finally {
      setPanel(null)
      lock.current = false
      setBusy(false)
    }
  }
  async function startSession() {
    if (!book || busy || lock.current || !gateway.openSession) return
    lock.current = true
    setBusy(true)
    setError('')
    setErrorAction(null)
    setSessionMessage('')
    try {
      await gateway.openSession(book, sessionSats)
      setPanel(null)
    } catch (failure) {
      setPanel(null)
      setError(failure instanceof Error ? failure.message : 'The reading session could not open. Nothing was paid.')
      return
    } finally {
      lock.current = false
      setBusy(false)
    }
    void turn(book, target)
  }
  async function endSession() {
    if (!book || busy || lock.current || !gateway.endSession) return
    lock.current = true
    setBusy(true)
    setSessionMessage('')
    try {
      const ended = await gateway.endSession(book)
      setSessionMessage(ended?.state === 'received'
        ? `Session ended: ${ended.pages} ${ended.pages === 1 ? 'page' : 'pages'} paid; ${ended.remainingSats} sats returned to your wallet.`
        : 'Session ended. Your unspent sats return once the settlement is confirmed.')
    } catch (failure) {
      setSessionMessage(failure instanceof Error ? failure.message : 'The session could not be ended yet. It ends automatically after 10 minutes.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function checkSigning() {
    if (busy || lock.current || !gateway.checkSessionSigning) return
    lock.current = true
    setBusy(true)
    setSessionMessage('Signing five test pages. Approve any wallet prompt, and note whether more appear.')
    try {
      const times = await gateway.checkSessionSigning()
      setSessionMessage(`Signed 5 test pages: ${times.join(', ')} ms. Nothing was paid. Report how many wallet prompts you saw.`)
    } catch (failure) {
      setSessionMessage(failure instanceof Error ? failure.message : 'The signing check stopped. Nothing was paid.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function continuePurchase() {
    if (!book || busy || lock.current) return
    if (!paused) {
      gateway.approveReadingFees()
      setExplained(true)
    }
    void turn(book, target, paused)
  }
  const session = book && sessionsAvailable ? gateway.sessionStatus?.(book) ?? null : null
  const sessionOpen = session?.state === 'open'
  // The server sets the session ceiling (smaller during pilots).
  const sessionSats = Math.min(gateway.sessionMaxSats?.() ?? config.channel.capacitySats, config.channel.capacitySats)
  const receipts = book?.mode === 'reader' ? gateway.receipts() : []
  const spending = summarizeSpending(receipts)
  const history = gateway.historyState()
  const spendLabel = spendingLabel(
    spending,
    history,
    gateway.hasIdentity(),
    Boolean(page && page.page <= config.freePages),
  )
  const nextPaid =
    page && page.page + 1 > config.freePages && !owns(page.page + 1)
  const maxCost = config.priceSats + config.provisional.readerMaxPageFeeSats
  const close = () => setPanel(null)
  return (
    <div
      className="app"
      style={{ '--reader-size': `${fontSize}px` } as CSSProperties}
    >
      <a className="skip" href="#reading">
        Skip to book text
      </a>
      <header className="app-header">
        <div className="header-main">
          <button
            className="quiet"
            disabled={busy}
            onClick={() => {
              viewRevision.current++
              gateway.stopReadAhead(true)
              setBook(null)
              setPage(null)
              close()
              setError('')
              setFailedPage(null)
            }}
          >
            Library
          </button>
          <span className="wordmark">
            ¶ <span className="brand-name">Pagestream</span>
          </span>
          <div className="header-actions">
            <button
              className="quiet"
              onClick={() => setPanel('appearance')}
              aria-label="Text settings"
            >
              Aa
            </button>
            <WalletMenu
              timings={() => setPanel('timings')}
              identity={gateway.identity()}
              version={gateway.walletVersion()}
              busy={busy}
              connect={() => setPanel('wallet')}
              disconnect={() => {
                viewRevision.current++
                timings.stop('Wallet disconnected during capture.')
                gateway.disconnect()
                setExplained(false)
                setPage((current) =>
                  current && current.page > config.freePages ? null : current,
                )
                setError('')
                setErrorAction(null)
                setFailedPage(null)
              }}
            />
          </div>
        </div>
        {timings.run && <div className="reading-tools"><button className="quiet" onClick={() => setPanel('timings')} aria-live="polite">{timings.run.recording ? 'Recording' : 'Capture stopped'} · {timings.paidCount()} paid during Next · {timings.prepaidCount()} paid ahead</button></div>}
        {book && (
          <div className="reading-tools">
            <button
              className="quiet"
              disabled={book.mode === 'excerpt' || busy}
              onClick={() => setPanel('contents')}
            >
              Pages
            </button>
            <span role="status">
              {checkingCosts
                ? 'Checking wallet history…'
                : busy
                  ? 'Confirming…'
                  : book.mode === 'excerpt'
                    ? 'Opening excerpt'
                    : page && page.page <= config.freePages
                      ? 'Free preview'
                      : page
                        ? 'Owned page'
                        : 'Page unavailable'}
            </span>
            <button className="quiet money" onClick={() => setPanel('spent')}>
              {spendLabel}
            </button>
          </div>
        )}
        {book && session && ['open', 'closing'].includes(session.state) && (
          <div className="reading-tools session-tools">
            <span role="status">
              {session.state === 'open'
                ? `Reading session · ${session.pages} ${session.pages === 1 ? 'page' : 'pages'} · ${session.remainingSats} sats left`
                : 'Reading session ending · returning unspent sats'}
            </span>
            {session.state === 'open' && (
              <button className="quiet" disabled={busy} onClick={() => void endSession()}>End session</button>
            )}
          </div>
        )}
        {book && (session?.error || sessionMessage) && (
          <p className="subtle session-message" role="status">{session?.error ?? sessionMessage}</p>
        )}
      </header>
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          {paymentDetails.length > 0 && (
            <details className="payment-details">
              <summary>Payment details</summary>
              <ul>
                {paymentDetails.map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
            </details>
          )}
          {errorAction === 'connect' && (
            <>
              <WalletGuidance />
              <button disabled={busy} onClick={() => void connectWallet()}>
                Try again
              </button>
            </>
          )}
          {errorAction === 'retry' && book && failedPage !== null && (
            <button disabled={busy} onClick={() => request(failedPage)}>
              {failedPage <= config.freePages
                ? 'Try again'
                : feeApproval
                  ? 'Retry within the approved fee limit'
                : 'Try purchase again'}
            </button>
          )}
          {feeApproval && book?.editionId === feeApproval.edition && failedPage === feeApproval.page && (
            <div className="page-fee-approval">
              <p>
                Page {feeApproval.page}: {config.priceSats} sats + up to {feeApproval.maxFeeSats} sats miner fee.
                Maximum total: <strong>{config.priceSats + feeApproval.maxFeeSats} sats</strong>.
                {' '}This approval covers this page attempt only. Wallet permission setup costs are separate.
              </p>
              <button disabled={busy} onClick={() => void turn(book, feeApproval.page, false, feeApproval)}>
                Approve up to {config.priceSats + feeApproval.maxFeeSats} sats for this page
              </button>
            </div>
          )}
          {errorAction === 'check' && book && failedPage !== null && (
            <button
              disabled={busy}
              onClick={() => void turn(book, failedPage, true)}
            >
              {busy ? 'Checking payment…' : 'Check payment'}
            </button>
          )}
          {errorAction === 'check' &&
            failedPage === null &&
            gateway.hasIdentity() && (
              <button disabled={busy} onClick={() => void connectWallet()}>
                Try again
              </button>
            )}
        </div>
      )}
      {!book ? (
        <Library
          books={books}
          busy={busy}
          hasError={Boolean(error)}
          openBook={openBook}
          savedPage={gateway.savedPage}
        />
      ) : (
        <>
          <main className="reader-layout">
            <article
              ref={article}
              tabIndex={-1}
              id="reading"
              aria-label={`${book.title}, ${page ? `page ${page.page}` : 'opening excerpt'}`}
            >
              <p className="eyebrow">{book.author}</p>
              <h1>{book.title}</h1>
              <p className="chapter">
                {book.mode === 'excerpt'
                  ? book.chapter
                  : 'Project Gutenberg edition'}
              </p>
              {book.mode === 'reader' && (
                <div className="continue-reading">
                  <button disabled={busy} onClick={() => void resumeSaved()}>
                    Continue reading
                  </button>
                  <span className="subtle">
                    Find your wallet’s saved place. No new purchase.
                  </span>
                </div>
              )}
              <BookText
                paragraphs={page?.paragraphs ?? [book.excerpt ?? '']}
                page={page?.page}
              />
              <p className="page-end">
                {page
                  ? `— ${page.page} —`
                  : book.mode === 'excerpt'
                    ? 'End of opening excerpt'
                    : busy
                      ? 'Opening your page…'
                      : 'Your saved page could not be opened.'}
              </p>
              {!page && book.mode === 'reader' && !busy && (
                <button className="wide" onClick={() => void turn(book, 1)}>
                  Read the free preview
                </button>
              )}
              {book.mode === 'excerpt' && (
                <p className="subtle">
                  The full reader for this title is being prepared. This excerpt
                  is free and makes no wallet calls.
                </p>
              )}
              <p className="source">
                <a href={book.sourceUrl} target="_blank" rel="noreferrer">
                  Project Gutenberg · source
                </a>
                {book.editionId && (
                  <>
                    {' '}
                    ·{' '}
                    <a
                      href={`/api/editions/${encodeURIComponent(book.editionId)}/notices`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Edition notices
                    </a>
                  </>
                )}
              </p>
            </article>
          </main>
          <nav className="pager" aria-label="Page navigation">
            <button
              className="page-arrow"
              disabled={!page || page.page === 1 || busy}
              onClick={() => request(page!.page - 1)}
              aria-label="Previous page"
            >
              ‹ <span className="previous-word">Previous</span>
            </button>
            <button
              className="position"
              disabled={!page || busy}
              onClick={() => setPanel('contents')}
            >
              <span>
                {page
                  ? `Page ${page.page} of ${book.pages}`
                  : book.mode === 'excerpt'
                    ? 'Excerpt'
                    : 'Saved page'}
              </span>
              <span>
                {busy
                  ? 'Confirming…'
                  : page && page.page <= config.freePages
                    ? 'Free'
                    : page
                      ? 'Owned'
                      : book.mode === 'excerpt'
                        ? 'Free'
                        : 'Unavailable'}
              </span>
            </button>
            <button
              className="page-arrow next"
              disabled={!page || page.page === book.pages || busy}
              onClick={() => request(page!.page + 1)}
            >
              {readAhead.page === (page?.page ?? 0) + 1 && readAhead.state === 'ready'
                ? 'Next · ready'
                : readAhead.page === (page?.page ?? 0) + 1 && readAhead.state === 'preparing'
                  ? 'Next · preparing…'
                  : nextPaid ? sessionOpen ? `Next · ${config.priceSats} sats` : `Next · ${config.priceSats} sats + fee` : 'Next'} ›
            </button>
          </nav>
        </>
      )}
      {panel === 'timings' && (
        <TimingPanel timings={timings} close={close} changed={() => invalidate(n => n + 1)} unavailable={busy ? 'Wait for the current page to finish loading.' : !book || !page || !owns(page.page) ? 'Capture is unavailable here. Close this panel, open a book and use Continue reading to display an owned page, then return here.' : ''} start={(name, version) => {
          if (busy || !book || !page || !owns(page.page)) throw new Error('Open an owned page and wait for it to finish loading first.')
          timings.start(name, version, timingContext(book.editionId ?? ''), location.origin)
        }} />
      )}
      {panel === 'appearance' && (
        <Panel title="Text settings" close={close}>
          {readAheadAvailable && book && page?.purchase && (
            <section aria-label="Faster page turns">
              <label>
                <input type="checkbox" checked={readAhead.enabled} disabled={busy || paused}
                  onChange={event => {
                    if (event.target.checked) {
                      gateway.approveReadingFees()
                      setExplained(true)
                      gateway.enableReadAhead(book)
                    } else gateway.stopReadAhead()
                  }} /> Pay for one next page ahead
              </label>
              <p className="subtle">While you read, buy and load one next page for 5 sats plus its miner fee, at most {maxCost} sats total per page. That page may remain unread if you leave or jump elsewhere. After Next, one following page is prepared. A jump pauses preparation and never buys the skipped pages; already-bought pages remain yours. Hiding the reader stops new preparation; an already-started payment may finish. This choice clears when you leave, jump, change books, reload or log out.</p>
              <p role="status">{readAhead.state === 'ready' ? `Page ${readAhead.page} ready and paid.` : readAhead.state === 'preparing' ? `Preparing page ${readAhead.page}…` : readAhead.state === 'failed' ? 'Preparation stopped. Check the original payment before trying again.' : readAhead.enabled ? readAheadMode === 'continuous' ? 'The next page will be prepared while you read.' : 'Waiting for the approved test page.' : 'Preparation is off until you choose it.'}</p>
            </section>
          )}
          {sessionsAvailable && gateway.checkSessionSigning &&
            (gateway.sessionsEnabled?.() || new URLSearchParams(location.search).has('sessioncheck')) && (
            <section aria-label="Reading session signing check">
              <button disabled={busy || !page?.purchase} onClick={() => void checkSigning()}>
                Check session signing (free)
              </button>
              <p className="subtle">
                Signs five test pages with your wallet. Nothing is paid or sent. Open an owned page first.
              </p>
            </section>
          )}
          <div className="setting-row">
            <span>Text size</span>
            <div>
              <button
                aria-label="Smaller text"
                disabled={fontSize <= 17}
                onClick={() => setFontSize((n) => Math.max(17, n - 1))}
              >
                A−
              </button>{' '}
              <button
                aria-label="Larger text"
                disabled={fontSize >= 24}
                onClick={() => setFontSize((n) => Math.min(24, n + 1))}
              >
                A+
              </button>
            </div>
          </div>
          <div className="setting-row">
            <span>Paper</span>
            <div>
              <button aria-pressed={!night} onClick={() => setNight(false)}>
                Day
              </button>{' '}
              <button aria-pressed={night} onClick={() => setNight(true)}>
                Night
              </button>
            </div>
          </div>
          <p className="subtle">
            Text size changes the layout, never the purchased page.
          </p>
        </Panel>
      )}
      {panel === 'contents' && book && (
        <Panel title="Pages" close={close}>
          {book.mode === 'reader' && (
            <>
              <button
                className="wide"
                disabled={busy}
                onClick={() => void resumeSaved()}
              >
                Resume saved page
              </button>
              <p className="subtle">
                Find the bookmark saved with your wallet. This cannot buy a
                page.
              </p>
            </>
          )}
          <nav className="page-list" aria-label="Choose a page">
            {Array.from(
              {
                length: gateway.hasIdentity()
                  ? (book.pages ?? 0)
                  : config.freePages + 1,
              },
              (_, i) => i + 1,
            ).map((n) => (
              <button
                key={n}
                aria-current={page?.page === n ? 'page' : undefined}
                onClick={() => request(n)}
              >
                <span>Page {n}</span>
                <span>
                  {n <= config.freePages
                    ? 'Free'
                    : owns(n)
                      ? 'Owned'
                      : `${config.priceSats} sats + fee`}
                </span>
              </button>
            ))}
          </nav>
          <p className="subtle">
            More pages appear after your wallet identifies you at page 3.
          </p>
        </Panel>
      )}
      {panel === 'wallet' && (
        <Panel title="Connect your wallet" close={close}>
          <p>
            Your public wallet identity finds your purchases and saved place. No
            account needed.
          </p>
          <WalletGuidance />
          <button
            className="wide"
            disabled={busy}
            onClick={() => void connectWallet()}
          >
            Connect wallet
          </button>
        </Panel>
      )}
      {panel === 'purchase' && book && (
        <Panel title={`Open page ${target}`} close={close}>
          {sessionsAvailable && !paused && gateway.openSession && gateway.sessionsEnabled?.() && (
            <section aria-label="Reading session" className="session-offer">
              <p>
                <strong>Approve once, then read.</strong> Your wallet sets aside up to {sessionSats} sats
                for this session. Each page then costs {config.priceSats} sats with no further prompts
                and no per-page miner fee.
              </p>
              <p className="subtle">
                When you end the session or leave, Pagestream settles once and your unspent sats return
                to your wallet. Two miner fees apply per session: opening and settling (about{' '}
                {config.channel.settlementFeeSats} sats each). Your wallet holds a refund that unlocks
                after 24 hours if Pagestream never settles. The next page may load before you pay for it;
                you pay only when you open it.
              </p>
              <button className="paid-action wide" disabled={busy} onClick={() => void startSession()}>
                Approve up to {sessionSats} sats and open page {target}
              </button>
              <p className="subtle">Or pay page by page:</p>
            </section>
          )}
          <p>
            A new page costs {config.priceSats} sats plus the wallet’s miner fee.
            If you already own page {target}, it opens without another charge.
          </p>
          <p className="subtle">
            Allow up to {config.provisional.readerMaxPageFeeSats} sats in miner fees
            per new page: at most {maxCost} sats total. We charge the actual fee,
            so a lower fee costs less. Higher or unknown fees stop for review.
          </p>
          <p className="subtle">
            This app approval lasts until you reload or log out.{' '}
            {readAheadAvailable
              ? 'Next buys only the page you request unless you separately enable one-page preparation in Text settings.'
              : 'Each Next click buys only the page you request; we never buy ahead.'}
          </p>
          <p className="subtle">
            {config.provisional.readerPermissionCopy} Your wallet controls when
            approval is needed; its allowance may be monthly.
          </p>
          <WalletGuidance />
          {paused && (
            <p className="subtle">
              New purchases are temporarily paused. You can check pages you
              already own.
            </p>
          )}
          <button className="paid-action wide" onClick={continuePurchase}>
            {paused
              ? `Check page ${target}`
              : `Allow up to ${maxCost} sats per page and open page ${target}`}
          </button>
        </Panel>
      )}
      {panel === 'spent' && (
        <SpendingPanel
          receipts={receipts}
          history={history}
          spendLabel={spendLabel}
          currentPage={page?.page}
          connected={gateway.hasIdentity()}
          busy={busy}
          checkingCosts={checkingCosts}
          costMessage={costMessage}
          checkCosts={() => void checkCosts()}
          close={close}
        />
      )}
    </div>
  )
}
