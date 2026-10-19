import { createServer } from 'node:http'

// Provisioning only: no wallet, SQLite, static files, grants or payment routes.
export function startMaintenance(port) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid maintenance port')
  const server = createServer((request, response) => {
    const health = request.method === 'GET' && request.url === '/health'
    response.writeHead(health ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(health
      ? { mode: 'maintenance', network: 'main', purchasesPaused: true, paymentReady: false }
      : { error: 'Pagestream is being prepared. Reading and payments are unavailable.' }))
  })
  server.listen(port, '0.0.0.0', () => {
    console.log(`Pagestream maintenance listener on port ${server.address().port}; payments unavailable`)
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
  return server
}
