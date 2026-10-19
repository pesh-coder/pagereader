// Local design review only. Whitelisted static assets; no wallet/payment API.
import http from 'node:http'
import { readFileSync } from 'node:fs'
const base=new URL('./',import.meta.url)
const root=new URL('../../',base)
const edition=JSON.parse(readFileSync(new URL('spike/data/edition.json',root),'utf8'))
const tokens=JSON.parse(readFileSync(new URL('design_handoff_pagestream/tokens.json',root),'utf8'))
const cssColors = colors=>Object.entries(colors).map(([key,value])=>`--${key==='paper-shade'?'shade':key}:${value}`).join(';')
const routes = {
  '/':['text/html',()=>readFileSync(new URL('index.html',base))],
  '/review.css':['text/css',()=>readFileSync(new URL('review.css',base))],
  '/review.js':['text/javascript',()=>readFileSync(new URL('review.js',base))],
  '/tokens.css':['text/css',()=>`:root{${cssColors(tokens.color.light)}}:root[data-theme=night]{${cssColors(tokens.color.night)}}`],
  '/sample.json':['application/json',()=>JSON.stringify({title:edition.title,totalPages:edition.pages.length,pages:edition.pages.slice(0,6)})],
  '/config.json':['application/json',()=>JSON.stringify(config)],
}
const {config}=await import('../../spike/src/config.ts')
http.createServer((req,res)=>{const route=routes[new URL(req.url,'http://localhost').pathname];res.setHeader('Cache-Control','no-store');if(!route){res.writeHead(404);res.end();return}res.setHeader('Content-Type',route[0]+'; charset=utf-8');res.end(route[1]())}).listen(3110,'127.0.0.1',()=>console.log('Design review: http://localhost:3110 — no wallet or payment routes'))
