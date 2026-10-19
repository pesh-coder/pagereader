import { readFileSync } from 'node:fs'
import { config } from './config.js'

export interface Edition { id: string; title: string; author: string; sourceUrl: string; checksum: string; pages: string[][] }
export interface CatalogueBook { id: string; gid: number; edition: Edition; sourceFile: string }
export function segment(text: string): string[][] {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const pages: string[][] = []
  let current: string[] = []
  let size = 0
  for (const paragraph of paragraphs) {
    if (size >= config.targetCharacters && current.length) { pages.push(current); current = []; size = 0 }
    current.push(paragraph); size += paragraph.length
  }
  if (current.length) pages.push(current)
  return pages
}
export function loadEdition(): Edition {
  return JSON.parse(readFileSync(new URL('../data/edition.json', import.meta.url), 'utf8')) as Edition
}

export function loadCatalogue(): CatalogueBook[] {
  const index = JSON.parse(readFileSync(new URL('../data/catalogue.json', import.meta.url), 'utf8')) as {
    schema: number; books: { id: string; gid: number; editionId: string; editionFile: string; sourceFile: string }[]
  }
  if (index.schema !== 1 || index.books.length < 5 || index.books.length > 10) throw new Error('Invalid catalogue index')
  const ids = new Set<string>(), editions = new Set<string>()
  return index.books.map(book => {
    if (ids.has(book.id) || editions.has(book.editionId) || !/^(edition\.json|editions\/[\w-]+\.json)$/.test(book.editionFile) || !/^(gutenberg-1661\.txt|sources\/[\w-]+\.txt)$/.test(book.sourceFile)) throw new Error('Invalid or duplicate catalogue entry')
    const edition = JSON.parse(readFileSync(new URL(`../data/${book.editionFile}`, import.meta.url), 'utf8')) as Edition
    if (edition.id !== book.editionId || edition.pages.length <= config.freePages) throw new Error('Catalogue edition mismatch or incomplete source')
    ids.add(book.id); editions.add(edition.id)
    return { id: book.id, gid: book.gid, edition, sourceFile: book.sourceFile }
  })
}
