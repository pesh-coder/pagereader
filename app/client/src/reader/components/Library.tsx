import { config, type Book } from '../gateway'

export function Library({
  books,
  busy,
  hasError,
  openBook,
  savedPage,
}: {
  books: Book[]
  busy: boolean
  hasError: boolean
  openBook: (book: Book) => void
  savedPage: (book: Book) => number | null
}) {
  return (
    <main id="reading" className="library">
      <div className="library-intro">
        <p className="eyebrow">The reading room</p>
        <h1>
          Pay for what you read,
          <br />
          not the whole book.
        </h1>
        <p>
          Start with a free preview, then unlock pages as you go. No
          subscription or upfront book purchase. Return to pages you have
          already bought without paying again.
        </p>
        <a className="hero-action" href="#books">
          Start reading free ↓
        </a>
        <p className="subtle">
          First two pages free. Paid pages cost 5 sats each, plus transaction
          fees.
        </p>
      </div>
      {!books.length && !hasError && <p role="status">Opening the library…</p>}
      <div className="book-grid" id="books">
        {books.map((item, index) => (
          <button
            className="book-card"
            key={item.id}
            onClick={() => openBook(item)}
            disabled={busy}
          >
            <span className="cover-frame">
              <img
                className="book-cover"
                src={`${import.meta.env.BASE_URL}covers/${item.id}.jpg`}
                alt=""
                width="200"
                height="300"
                loading={index < 3 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </span>
            <span className="eyebrow">
              {item.mode === 'reader' ? 'Reader available' : 'Opening excerpt'}
            </span>
            <span className="book-title">{item.title}</span>
            <span>{item.author}</span>
            <span className="subtle">
              {item.mode === 'reader'
                ? `First ${config.freePages} pages free · ${item.pages} pages available`
                : 'Free preview · full reader being prepared'}
            </span>
            <span className="open-label">
              {item.mode === 'reader'
                ? savedPage(item)
                  ? `Continue · page ${savedPage(item)}`
                  : 'Read'
                : 'Preview'}{' '}
              →
            </span>
          </button>
        ))}
      </div>
    </main>
  )
}
