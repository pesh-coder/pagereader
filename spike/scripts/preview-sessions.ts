// Offline reading-session preview: the real reader, gateway, session client and
// receiver, with a synthetic in-browser wallet. No real wallet, RPC, .env,
// broadcast or funds. Latencies mimic the owner's native BSV Browser captures
// (createAction ≈600 ms, createSignature ≈49 ms) plus a 390-ms round trip.
// node --import tsx spike/scripts/preview-sessions.ts (from the repository root)
import http from 'node:http'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { createProbe } from '../src/probe.js'
import { Store } from '../src/store.js'
import { loadCatalogue, loadEdition } from '../src/content.js'

const store = new Store(':memory:')
const serverProto = new ProtoWallet(PrivateKey.fromRandom())
const serverIdentity = (await serverProto.getPublicKey({ identityKey: true })).publicKey
const serverWallet = new Proxy(serverProto, { get(target, name) {
  if (name === 'internalizeAction') return async () => ({ accepted: true })
  const value = Reflect.get(target, name)
  return typeof value === 'function' ? value.bind(target) : value
} }) as unknown as WalletInterface
const app = createProbe({ store, edition: loadEdition(), catalogue: loadCatalogue(), wallet: serverWallet, serverIdentity,
  research: false, purchasesPaused: () => false, rateLimits: false,
  channels: { broadcast: async () => {}, enabled: () => true, maxCapacity: 5000 } })
const result = await build({
  absWorkingDir: resolve('app/client'),
  stdin: { resolveDir: resolve('app/client'), loader: 'tsx', contents: `
    import { createRoot } from 'react-dom/client';
    import { AuthFetch, PrivateKey, ProtoWallet } from '@bsv/sdk';
    import App from './src/App';
    import { createReaderGateway } from './src/reader/gateway';
    import './src/index.css';
    import { readerWallet } from '../../spike/test/fixtures/session-wallet';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const keyHex = PrivateKey.fromRandom().toHex();
    const reader = readerWallet(keyHex);
    // AuthFetch and its wallet must come from the same (client) SDK copy.
    const authWallet = new ProtoWallet(PrivateKey.fromHex(keyHex));
    const slow = (fn, ms) => async (...args) => { await sleep(ms); return fn(...args) };
    const wallet = { ...reader.wallet,
      createAction: slow(reader.wallet.createAction, 600), signAction: slow(reader.wallet.signAction, 120),
      createSignature: slow(reader.wallet.createSignature, 49), internalizeAction: slow(reader.wallet.internalizeAction, 300) };
    window.previewTimings = [];
    const open = async callbacks => ({
      identityKey: reader.identity, version: 'OFFLINE PREVIEW', network: 'mainnet',
      auth: new AuthFetch(authWallet),
      sessionWallet: wallet,
      sessionPost: async (path, body) => {
        const started = performance.now();
        await sleep(390);
        const response = await fetch(location.origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        callbacks.http({ path, status: response.status, ms: performance.now() - started });
        return response;
      },
      getAttempt: () => undefined, retainPaymentAncestors: () => {}, paymentFee: () => null,
    });
    window.walletCalls = reader.calls;

    createRoot(document.getElementById('root')).render(<App gatewayFactory={() => createReaderGateway(() => window.dispatchEvent(new Event('gateway')), open)} />);
  ` },
  bundle: true, write: false, outdir: 'preview-sessions', format: 'esm', jsx: 'automatic',
  define: {
    'import.meta.env': JSON.stringify({ BASE_URL: '/' }), 'process.env.NODE_ENV': '"development"',
  },
})
const js = result.outputFiles.find(f => f.path.endsWith('.js'))!.text
const css = result.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? ''
const server = http.createServer((req, res) => {
  if (req.url === '/preview.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(js); return }
  if (req.url === '/preview.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return }
  if (req.url === '/preview' || req.url === '/preview/') {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"><div id="root"></div><script type="module" src="/preview.js"></script>')
    return
  }
  app(req, res)
})
server.listen(3113, '127.0.0.1', () => console.log('Offline reading-session preview: http://127.0.0.1:3113/preview'))
