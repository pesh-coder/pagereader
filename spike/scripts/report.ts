import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { timingReport } from '../src/timing-report.js'

const path = process.argv[2]
if (!path) throw new Error('Usage: npm run report -- evidence/runs/<export>.json')
const run = JSON.parse(await readFile(path, 'utf8'))
const report = { source: path, ...timingReport(run) }
await mkdir('evidence', { recursive: true })
await writeFile('evidence/latest-report.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
