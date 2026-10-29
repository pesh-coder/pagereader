import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  config,
  createReaderGateway,
  ReaderError,
  type Book,
  type ReaderPage,
} from './reader/gateway'
import { spendingLabel, summarizeSpending } from './reader/spending'
import { Panel } from './reader/components/Panel'
import { WalletGuidance } from './reader/components/WalletGuidance'
import { WalletMenu } from './reader/components/WalletMenu'
import { BookText } from './reader/components/BookText'
import { Library } from './reader/components/Library'
import { SpendingPanel } from './reader/components/SpendingPanel'

export default function App() {
  const [, invalidate] = useState(0)
  const [gateway] = useState(() =>
    createReaderGateway(() => invalidate((n) => n + 1)),
  )
  const [books, setBooks] = useState<Book[]>([])
  const [book, setBook] = useState<Book | null>(null)
  const [page, setPage] = useState<ReaderPage | null>(null)
  const [panel, setPanel] = useState<
    'contents' | 'appearance' | 'spent' | 'purchase' | 'wallet' | null
  >(null)
  const [target, setTarget] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paymentDetails, setPaymentDetails] = useState<string[]>([])
  const [errorAction, setErrorAction] = useState<
    'connect' | 'retry' | 'check' | null
  >(null)
  const [explained, setExplained] = useState(
    () => sessionStorage.getItem('pagestream-payment-explained') === '1',
  )
  const [failedPage, setFailedPage] = useState<number | null>(null)
  const [paused, setPaused] = useState(true)
  const [checkingCosts, setCheckingCosts] = useState(false)
  const [costMessage, setCostMessage] = useState('')
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
  async function turn(selected: Book, number: number, recoveryOnly = false) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    if (!recoveryOnly) {
      setError('')
      setPaymentDetails([])
      setErrorAction(null)
    }
    setPanel(null)
    try {
      const body = await gateway.page(selected, number, recoveryOnly)
      setError('')
      setPaymentDetails([])
      setErrorAction(null)
      setBook(selected)
      setPage(body)
      setFailedPage(null)
      window.scrollTo(0, 0)
      requestAnimationFrame(() =>
        article.current?.focus({ preventScroll: true }),
      )
    } catch (failure) {
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
    if (n <= config.freePages || owns(n)) {
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
  function continuePurchase() {
    if (!book) return
    sessionStorage.setItem('pagestream-payment-explained', '1')
    setExplained(true)
    void turn(book, target, paused)
  }
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
  const maxCost = config.priceSats + config.provisional.maxPageFeeSats
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
              identity={gateway.identity()}
              version={gateway.walletVersion()}
              busy={busy}
              connect={() => setPanel('wallet')}
              disconnect={() => {
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
                : 'Try purchase again'}
            </button>
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
              {nextPaid ? `Next · ${config.priceSats} sats + fee` : 'Next'} ›
            </button>
          </nav>
        </>
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
        <Panel title="Reading beyond the preview" close={close}>
          <p>
            {config.priceSats} sats for this page, plus up to{' '}
            {config.provisional.maxPageFeeSats} sat in miner fees.
          </p>
          <p className="subtle">
            {config.provisional.readerPermissionCopy} Your wallet controls when
            approval is needed; its allowance may be monthly. Each Next click
            requests one page. We never buy ahead.
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
              ? 'Check existing purchase'
              : `Continue · up to ${maxCost} sats`}
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
