export interface BookmarkBook { id: string; editionId?: string; pages?: number }
export interface DisplayedBookmark { page: number; displayedAt: number }
const key = (book: BookmarkBook) => `pagestream-free-bookmark:${book.editionId ?? book.id}`

// A local bookmark is a navigation hint, never proof that a paid page is owned.
// Keep the existing key so previously displayed pages are recovered too.
export function savedBookmark(book: BookmarkBook, storage: Pick<Storage, 'getItem'> = localStorage): DisplayedBookmark | null {
  try {
    const value = JSON.parse(storage.getItem(key(book)) ?? 'null')
    if (!value || !Number.isSafeInteger(value.page) || value.page < 1 || value.page > (book.pages ?? 1) || !Number.isSafeInteger(value.displayedAt) || value.displayedAt < 0) return null
    return { page: value.page, displayedAt: value.displayedAt }
  } catch { return null }
}
export function saveDisplayedBookmark(book: BookmarkBook, page: number, displayedAt: number, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const previous = savedBookmark(book, storage)
  if (previous && previous.displayedAt > displayedAt) return
  storage.setItem(key(book), JSON.stringify({ page, displayedAt }))
}
