import { access, cp, mkdir, rm } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Keep Vite's /reader/ base and local dist layout unchanged. Vercel receives
// only the built frontend beneath /reader, never the source catalogue or DB.
export async function stageFrontend(source = fileURLToPath(new URL('../app/client/dist/', import.meta.url)), output = fileURLToPath(new URL('../dist/vercel/', import.meta.url))) {
  source = resolve(source)
  output = resolve(output)
  if (source === output || source.startsWith(output + sep) || output.startsWith(source + sep)) throw new Error('Frontend source and generated output must be separate directories')
  await access(resolve(source, 'index.html'))
  // Resolved output is the separate generated directory, never its parent.
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await cp(source, resolve(output, 'reader'), { recursive: true })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await stageFrontend()
