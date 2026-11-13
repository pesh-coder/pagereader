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


export default function App({ gatewayFactory }: { gatewayFactory?: () => ReaderGateway } = {}) {
  const [, invalidate] = useState(0)
  const [timings] = useState(() => new ReadingTimings(localStorage))
  const [gateway] = useState(() =>
    gatewayFactory?.() ?? createReaderGateway(() => invalidate((n) => n + 1), undefined, {
      wallet: call => timings.wallet(call), http: call => timings.http(call),
      paid: txid => timings.paymentAccepted(txid),
    }),
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
      if (failure instanceof ReaderError && failure.needsSession) {
        // No open session: show the one-approval offer, not a payment error.
        setError(failure.message)
        setErrorAction(null)
        setPaymentDetails([])
        setFailedPage(null)
        setTarget(number)
        setPanel('purchase')
        return
      }
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
      await gateway.openSession(book, sessionSats, target)
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
  async function topUp() {
    if (!book || busy || lock.current || !gateway.topUpSession) return
    lock.current = true
    setBusy(true)
    setSessionMessage('')
    try {
      const status = await gateway.topUpSession(sessionSats)
      setSessionMessage(status ? `Reading balance topped up: ${status.remainingSats} sats available.` : '')
    } catch (failure) {
      setSessionMessage(failure instanceof Error ? failure.message : 'The top-up could not finish. Nothing was taken from your wallet.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function endSession() {
    if (!book || busy || lock.current || !gateway.endSession) return
    lock.current = true
    setBusy(true)
    setSessionMessage('')
    try {
      const ended = await gateway.endSession()
      setSessionMessage(ended?.state === 'received'
        ? `Withdrawn: ${ended.remainingSats} sats returned to your wallet.`
        : 'Withdrawing: your unspent sats return to your wallet once confirmed.')
    } catch (failure) {
      setSessionMessage(failure instanceof Error ? failure.message : 'The balance could not be withdrawn yet. Try again in a moment.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function checkPurchase() {
    // Paused purchases: check an existing page without creating a payment.
    if (!book || busy || lock.current) return
    void turn(book, target, true)
  }
  const session = book ? gateway.sessionStatus?.() ?? null : null
  const sessionOpen = session?.state === 'open'
  // The server may set a lower session ceiling.
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
            ¶ <span className="brand-name">Pagereader</span>
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
        {timings.run?.recording && <div className="reading-tools"><button className="quiet" onClick={() => setPanel('timings')} aria-live="polite">Recording timings · {timings.paidCount()} paid page turns</button></div>}
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
        {book && session && ['open', 'closing', 'checking'].includes(session.state) && (
          <div className="reading-tools session-tools">
            <span role="status">
              {session.state === 'open'
                ? `Reading balance · ${session.remainingSats} sats`
                : session.state === 'checking'
                  ? 'Checking your reading balance…'
                  : 'Returning your reading balance to your wallet'}
            </span>
            {session.state === 'checking' && session.error && (
              <button className="quiet" disabled={busy} onClick={() => void gateway.recheckSession?.()}>Retry</button>
            )}
            {session.state === 'open' && (
              <>
                {/* Top up refills the balance to the session amount in one wallet approval. */}
                {session.remainingSats < session.capacity - config.channel.settlementFeeSats - 4 * config.priceSats && (
                  <button className="quiet" disabled={busy} onClick={() => void topUp()}>Top up</button>
                )}
                <button className="quiet" disabled={busy} onClick={() => void endSession()}>Withdraw</button>
              </>
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
              {nextPaid ? `Next · ${config.priceSats} sats` : 'Next'} ›
            </button>
          </nav>
        </>
      )}
      {panel === 'timings' && (
        <TimingPanel timings={timings} close={close} changed={() => invalidate(n => n + 1)} unavailable={busy ? 'Wait for the current page to finish loading.' : !book || !page ? 'Capture is unavailable here. Close this panel and open a book page, then return here.' : !gateway.hasIdentity() ? 'Connect your wallet first (wallet menu), then return here.' : ''} start={(name, version) => {
          // Starting a capture never pays and is independent of any reading session.
          if (busy || !book || !page) throw new Error('Open a book page and wait for it to finish loading first.')
          timings.start(name, version, timingContext(book.editionId ?? ''), location.origin)
        }} />
      )}
      {panel === 'appearance' && (
        <Panel title="Text settings" close={close}>
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
                      : `${config.priceSats} sats`}
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
          {paused ? (
            <>
              <p>
                New purchases are temporarily paused. You can check pages you
                already own.
              </p>
              <button className="wide" onClick={checkPurchase}>
                Check page {target}
              </button>
            </>
          ) : (
            <section aria-label="Reading session" className="session-offer">
              <p>
                <strong>Approve once, then read.</strong> Your wallet asks once to allow up to{' '}
                {sessionSats} sats for this reading session, miner fees included. Each page then costs{' '}
                {config.priceSats} sats, with no further prompts.
              </p>
              <p className="subtle">
                Stop reading, stop paying: you pay only for pages you open. Your reading balance stays
                available when you leave and come back, in any book. Top it up whenever you choose (one
                wallet approval), or withdraw it to return the unspent sats to your wallet at once. The
                balance's miner fees (opening and returning, about {config.channel.settlementFeeSats} sats
                each) come out of the same {sessionSats} sats. While held, these sats are not in your
                wallet's spendable balance; your wallet keeps a refund in case Pagereader ever stops.
              </p>
              <WalletGuidance />
              <button className="paid-action wide" disabled={busy} onClick={() => void startSession()}>
                Approve up to {sessionSats} sats and open page {target}
              </button>
            </section>
          )}
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
