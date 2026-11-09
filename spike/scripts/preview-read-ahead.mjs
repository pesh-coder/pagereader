// Offline UI fixture: no wallet acquisition, credentials, RPC, .env or broadcast.
// node spike/scripts/preview-read-ahead.mjs (from the repository root)
import http from 'node:http'
import { build } from 'esbuild'
import { resolve } from 'node:path'

const identity = '02' + 'a'.repeat(64)
const result = await build({
  absWorkingDir: resolve('app/client'),
  stdin: { resolveDir: resolve('app/client'), loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import App from './src/App';
    import './src/index.css';
    const identity = ${JSON.stringify(identity)};
    const book = { id:'offline', gid:1, title:'Offline latency fixture', author:'Synthetic data - no wallet or funds', mode:'reader', editionId:'offline-edition', pages:8, sourceUrl:'https://www.gutenberg.org' };
    const owned = [{page:3, txid:'3'.repeat(64), sats:5, feeSats:23}];
    const receipts = () => owned.map(p=>({...p,identityKey:identity,edition:book.editionId,state:'confirmed'}));
    let displayed=3, allowed=false, connected=true, calls=0;
    const source = {
      library:async()=>({books:[book],purchasesPaused:false}),
      identity:()=>connected?identity:null, hasIdentity:()=>connected,
      walletVersion:()=> 'OFFLINE FIXTURE', network:()=> 'mainnet', historyState:()=> 'ready',
      owned:()=>owned, receipts, needsPaymentCheck:()=>false, savedPage:()=>displayed,
      resumePage:async()=>displayed, connect:async()=>{connected=true}, disconnect:()=>{connected=false;allowed=false},
      approveReadingFees:()=>{allowed=true}, reconcileCosts:async()=>({matched:owned.length,missing:0}),
      bookmark:async(_book,page)=>{displayed=page},
      page:async(_book,page,recovery)=>{
        if(page>2&&!owned.some(p=>p.page===page)) {
          if(!allowed||recovery)throw new Error('Fixture purchase is not authorized');
          calls++;
          await new Promise(r=>setTimeout(r,6406));
          owned.push({page,txid:String(page).repeat(64),sats:5,feeSats:23});
        }
        return {editionId:book.editionId,page,paragraphs:['Offline fixture page '+page+'. The artificial payment delay is 6.406 seconds. No wallet, money or blockchain is involved.'],purchase:owned.find(p=>p.page===page)};
      }
    };
    window.offlineFixtureStatus=()=>({calls,displayed,owned:owned.map(p=>p.page),total:receipts().reduce((s,p)=>s+p.sats+p.feeSats,0)});
    createRoot(document.getElementById('root')).render(<App gatewayFactory={()=>source}/>);
  ` },
  bundle: true, write: false, outdir: 'offline-fixture', format: 'esm', jsx: 'automatic',
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_PAGESTREAM_READ_AHEAD': '"1"',
    'import.meta.env.VITE_PAGESTREAM_READ_AHEAD_MODE': '"continuous"',
    'import.meta.env.VITE_PAGESTREAM_READ_AHEAD_TARGET': '""' },
})
const js = result.outputFiles.find(f => f.path.endsWith('.js')).text
const css = result.outputFiles.find(f => f.path.endsWith('.css')).text
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/covers/')) { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#374a46"/><text x="20" y="80" fill="white" font-size="20">Offline fixture</text></svg>'); return }
  if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(js); return }
  if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return }
  res.setHeader('Content-Type', 'text/html')
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>OFFLINE read-ahead fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><div role="note" style="padding:8px;background:#fff3c4;color:#111">OFFLINE FIXTURE: artificial 6.406-second payment; no wallet or funds.</div><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>')
})
server.listen(3114, '127.0.0.1', () => console.log('OFFLINE fixture: http://localhost:3114'))
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
