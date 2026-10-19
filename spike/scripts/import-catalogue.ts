import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { segment, loadEdition, type Edition } from '../src/content.js'
import { config } from '../src/config.js'

// Preserve the already entitled Holmes edition byte-for-byte. Never reimport it
// here; a different source/segmenter needs a distinct edition and retained file.
const holmes = loadEdition()
const definitions = JSON.parse(await readFile('data/library-previews.json', 'utf8')) as { id: string; gid: number; title: string; author: string }[]
const openings: Record<string, string> = {
  pride: 'It is a truth universally acknowledged',
  frankenstein: 'You will rejoice to hear that no disaster',
  dorian: 'The studio was filled',
  dracula: '3 May',
  meditations: 'I. Of my grandfather Verus',
  metamorphosis: 'One morning, when Gregor Samsa woke',
  alice: 'Alice was beginning to get very tired',
}
await mkdir('data/sources', { recursive: true })
await mkdir('data/editions', { recursive: true })
async function immutable(path: string, contents: string | Uint8Array) {
  try { await writeFile(path, contents, { flag: 'wx' }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await readFile(path)).equals(Buffer.from(contents))) throw error
  }
}
const books = [{ id: 'holmes', gid: 1661, editionId: holmes.id, editionFile: 'edition.json', sourceFile: 'gutenberg-1661.txt' }]
// One source at a time: polite to Gutenberg; no wallet/server/payment calls.
for (const book of definitions) {
  const sourceUrl = `https://www.gutenberg.org/ebooks/${book.gid}.txt.utf-8`
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`${book.id}: Gutenberg HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const sourceFile = `sources/gutenberg-${book.gid}-${checksum}.txt`
  await immutable(`data/${sourceFile}`, bytes)
  const start = text.match(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i)
  const end = text.match(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i)
  if (start?.index == null || end?.index == null) throw new Error(`${book.id}: source boundary markers missing`)
  const body = text.slice(start.index + start[0].length, end.index)
  const opening = body.indexOf(openings[book.id])
  if (opening < 0) throw new Error(`${book.id}: prose opening missing; inspect preserved source ${sourceFile}`)
  const edition: Edition = { id: `${book.gid}-${checksum}-${config.segmenterVersion}`, title: book.title, author: book.author, sourceUrl, checksum, pages: segment(body.slice(opening)) }
  if (edition.pages.length <= config.freePages) throw new Error(`${book.id}: incomplete edition`)
  const editionFile = `editions/${edition.id}.json`
  await immutable(`data/${editionFile}`, JSON.stringify(edition, null, 2) + '\n')
  books.push({ id: book.id, gid: book.gid, editionId: edition.id, editionFile, sourceFile })
  console.log(`${book.id}: ${edition.pages.length} fixed pages (${checksum})`)
}
// Publish only after every source and immutable edition has been preserved.
// Never silently replace an active entitled edition when Gutenberg changes.
// New source/edition assets are retained for an explicit migration review.
if (existsSync('data/catalogue.json')) {
  const existing = JSON.parse(await readFile('data/catalogue.json', 'utf8')) as { books: { id: string; editionId: string }[] }
  if (existing.books.some(book => books.find(next => next.id === book.id)?.editionId !== book.editionId)) throw new Error('Active edition changed: immutable assets retained, but catalogue publication refused. Review old-edition access before migration.')
}
const pendingIndex = `data/catalogue-${randomUUID()}.tmp`
await writeFile(pendingIndex, JSON.stringify({ schema: 1, books }, null, 2) + '\n', { flag: 'wx' })
await rename(pendingIndex, 'data/catalogue.json')
console.log(`Catalogue ready: ${books.length} full editions; Holmes preserved (${holmes.pages.length} pages)`)
