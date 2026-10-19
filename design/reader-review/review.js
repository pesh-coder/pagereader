// Design reference only. Local sample state; no wallet SDK or payment endpoints.
const data = await (await fetch('/sample.json')).json()
const settings = await (await fetch('/config.json')).json()
const $ = id => document.getElementById(id)
const app = $('app')
const owned = new Set([3])
let page = 3, spent = settings.priceSats + settings.provisional.maxPageFeeSats, fontSize = 19, pendingPage, busy = false
const costs = [{page:3,amount:spent}]
const panels = ['contents-panel','settings-panel','spend-panel','payment-panel']
function closePanels(){panels.forEach(id => $(id).hidden = true); ['contents','appearance','spend'].forEach(id => $(id).setAttribute('aria-expanded','false'))}
function toggle(id,button){const open=$(id).hidden;closePanels();$(id).hidden=!open;if(button)$(button).setAttribute('aria-expanded',String(open))}
function render(){
  $('text').replaceChildren(...data.pages[page-1].map(text=>{const p=document.createElement('p');p.textContent=text;return p}))
  $('page-count').textContent=`Page ${page} of ${data.totalPages}`
  $('position-note').textContent=page<=settings.freePages?'Free preview':'Owned'
  $('reading-state').textContent=page<=settings.freePages?'Free preview':'Owned page'
  $('page-end').textContent=`— ${page} —`
  $('spend').textContent=page<=settings.freePages?'Free preview':`Spent ${spent} sats`
  $('previous').disabled=page===1||busy;$('next').disabled=page===data.pages.length||busy
  const isPaid=page+1>settings.freePages&&!owned.has(page+1)
  $('next').classList.toggle('is-paid',isPaid)
  $('next-label').textContent=isPaid?`Next · up to ${settings.priceSats+settings.provisional.maxPageFeeSats} sats`:'Next'
  $('page-list').replaceChildren(...data.pages.map((_,i)=>{const n=i+1,b=document.createElement('button');const left=document.createElement('span'),right=document.createElement('span');left.textContent=`Page ${n}`;right.textContent=n<=settings.freePages?'Free':owned.has(n)?'Owned':`${settings.priceSats} sats + fee`;b.append(left,right);if(n===page)b.setAttribute('aria-current','page');b.onclick=()=>requestPage(n);return b}))
  $('ledger').replaceChildren(...costs.map(c=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=`Page ${c.page} · ${settings.priceSats} + ${settings.provisional.maxPageFeeSats} fee`;dd.textContent=`${c.amount} sats`;row.append(dt,dd);return row}))
}
function requestPage(n){
  if(busy||n<1||n>data.pages.length)return
  if(n<=settings.freePages||owned.has(n)){closePanels();page=n;render();window.scrollTo(0,0);return}
  pendingPage=n;closePanels();$('payment-panel').hidden=false
  $('payment-title').textContent=`Open page ${n}`
  $('payment-copy').textContent=`${settings.priceSats} sats for the page, plus up to ${settings.provisional.maxPageFeeSats} sat in network fees.`
  $('permission-copy').textContent=settings.provisional.readerPermissionCopy
  $('confirm').textContent=`Continue · up to ${settings.priceSats+settings.provisional.maxPageFeeSats} sats`
}
$('previous').onclick=()=>requestPage(page-1);$('next').onclick=()=>requestPage(page+1)
$('contents').onclick=()=>toggle('contents-panel','contents');$('page-position').onclick=()=>toggle('contents-panel','contents')
$('appearance').onclick=()=>toggle('settings-panel','appearance');$('spend').onclick=()=>{if(page>settings.freePages)toggle('spend-panel','spend')}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=closePanels)
$('smaller').onclick=()=>{fontSize=Math.max(17,fontSize-1);app.style.setProperty('--reader-size',`${fontSize}px`)}
$('larger').onclick=()=>{fontSize=Math.min(24,fontSize+1);app.style.setProperty('--reader-size',`${fontSize}px`)}
$('day').onclick=()=>document.documentElement.dataset.theme='day';$('night').onclick=()=>document.documentElement.dataset.theme='night'
$('library').onclick=()=>{closePanels();$('reader-view').hidden=true;$('library-view').hidden=false;$('pager').hidden=true;window.scrollTo(0,0)}
$('open-book').onclick=()=>{$('reader-view').hidden=false;$('library-view').hidden=true;$('pager').hidden=false;render();window.scrollTo(0,0)}
$('confirm').onclick=()=>{
  const target=pendingPage;busy=true;closePanels();$('reading-state').textContent='Confirming…';$('previous').disabled=true;$('next').disabled=true
  // Stand-in for the server response: retain current content until it arrives.
  setTimeout(()=>{owned.add(target);spent+=settings.priceSats+settings.provisional.maxPageFeeSats;costs.push({page:target,amount:settings.priceSats+settings.provisional.maxPageFeeSats});page=target;busy=false;render();window.scrollTo(0,0)},900)
}
document.querySelectorAll('[data-width]').forEach(button=>button.onclick=()=>{app.classList.toggle('is-phone',button.dataset.width==='phone');document.querySelectorAll('[data-width]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)))})
document.addEventListener('keydown',event=>{if(event.key==='Escape')closePanels();if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)||panels.some(id=>!$(id).hidden))return;if(event.key==='ArrowLeft')requestPage(page-1);if(event.key==='ArrowRight')requestPage(page+1)})
render()
