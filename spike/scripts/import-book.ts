import { mkdir, writeFile } from 'node:fs/promises'
import { Hash, Utils } from '@bsv/sdk'
import { segment, type Edition } from '../src/content.js'
import { config } from '../src/config.js'

const sourceUrl = 'https://www.gutenberg.org/ebooks/1661.txt.utf-8'
const response = await fetch(sourceUrl)
if (!response.ok) throw new Error(`Gutenberg download failed: ${response.status}`)
const bytes = new Uint8Array(await response.arrayBuffer())
const text = new TextDecoder().decode(bytes)
const checksum = Utils.toHex(Hash.sha256(Array.from(bytes)))
const start = text.match(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i)
const end = text.match(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i)
if (start?.index == null || end?.index == null) throw new Error('Gutenberg boundary markers missing; inspect source before importing')
const body = text.slice(start.index + start[0].length, end.index)
// Skip front matter and contents: use the prose opening as the first billable segment.
const opening = body.indexOf('To Sherlock Holmes she is always')
if (opening < 0) throw new Error('Expected edition opening missing')
const edition: Edition = { id: `1661-${checksum}-${config.segmenterVersion}`, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', sourceUrl, checksum, pages: segment(body.slice(opening)) }
if (edition.pages.length < config.maxProbePage) throw new Error('Not enough content for the spike')
await mkdir('data', { recursive: true })
await writeFile('data/gutenberg-1661.txt', bytes) // preserve original source and notices; never serve paid text statically
await writeFile('data/edition.json', JSON.stringify(edition, null, 2) + '\n')
console.log(`Imported ${edition.pages.length} immutable pages; checksum ${checksum}`)
