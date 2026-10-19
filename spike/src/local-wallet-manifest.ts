import express from 'express'
import { manifest } from './manifest.js'

// Optional local-development compatibility endpoint for hostname-scoped wallet
// discovery. It exposes public metadata only: no auth, wallet or payment API.
export function createLocalWalletManifest(serverIdentity: string | undefined, readerPort: number) {
  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); next() })
  app.get('/manifest.json', (_req, res) => {
    if (!serverIdentity) { res.sendStatus(503); return }
    res.json({ ...manifest(serverIdentity), start_url: `http://localhost:${readerPort}/reader/`,
      icons: [{ src: `http://localhost:${readerPort}/icon.svg`, sizes: 'any', type: 'image/svg+xml' }],
    })
  })
  app.use((_req, res) => res.sendStatus(404))
  return app
}
