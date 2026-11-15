// adv9 probe app: the owner's LIVE customers system. usage: node app9.js <port> <projectDir> <flags,comma>
// flags: dead fail500 nosave deaddelete native gql beat pageerr visit holes wall memsess search cart
// Always seeded with 3 of the owner's own customers. A second origin listens on port+1 (a partner API / mail service).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const port = Number(process.argv[2]); const root = process.argv[3]; const F = new Set(String(process.argv[4] || '').split(',').filter(Boolean));
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const storeFile = path.join(root, 'data', 'store.json');
const log = path.join(root, '..', path.basename(root) + '.req.log');
const read = () => { try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { return null; } };
const write = s => fs.writeFileSync(storeFile, JSON.stringify(s));
if (!read()) write({ seq: 3, customers: [{ id: 1, name: 'Huda Salem', email: 'huda@client.example' }, { id: 2, name: 'Omar Nasser', email: 'omar@client.example' }, { id: 3, name: 'Lina Faris', email: 'lina@client.example' }], other: [], staff: [] });
const ev = t => fs.appendFileSync(log, '  ' + t + '\n');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const sessions = new Set();
const signed = req => !F.has('wall') || [...sessions].some(t => String(req.headers.cookie || '').includes('sid=' + t) || String(req.headers.authorization || '') === 'Bearer ' + t);
const CSS = 'body{font:16px system-ui;margin:0;padding:16px;max-width:760px}label{display:block;margin:8px 0}input,button,textarea,select{font:inherit;padding:8px;min-height:44px}nav a{margin-inline-end:12px;display:inline-block;padding:12px 0}li{margin:6px 0}table{border-collapse:collapse}td,th{padding:8px;text-align:start}';
const shell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}</style></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
const rowsHtml = s => `<ul id="list">${s.customers.map(c => `<li data-id="${c.id}"><span>${esc(c.name)}</span> <span>${esc(c.email)}</span> ${F.has('getdelx') ? (c.id === 1 ? `<a href="/remove?id=1">مسح</a>` : c.id === 2 ? `<a href="/remove?id=2">Supprimer</a>` : `<a href="/customers/${c.id}/delete">🗑</a>`) : F.has('getdel') ? `<a href="/remove?id=${c.id}">Remove ${esc(c.name)}</a>` : `<button type="button" class="del" data-id="${c.id}" aria-label="Delete ${esc(c.name)}">Delete</button>`}</li>`).join('')}</ul>`;
const addForm = F.has('getform') ? `<form id="f" action="/add"><label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><button type="submit">Add customer</button></form>` : F.has('native')
  ? `<form id="f" method="post" action="/customers"><label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><button type="submit">Add customer</button></form>`
  : `<form id="f"><label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><button type="submit">Add customer</button><p role="status" id="msg"></p></form>`;
const holes = () => F.has('holes') ? `<section><h2>Integrations</h2>
<form id="pf" method="post" action="/api/popup" target="_blank"><label>Partner note <input name="note" required></label><button type="submit">Send to partner</button></form>
<button type="button" id="bpop">Open sync window</button>
<button type="button" id="bbeacon">Record visit</button>
<button type="button" id="bws">Notify team</button>
<button type="button" id="bworker">Recalculate totals</button>
<button type="button" id="bsw">Sync offline</button>
<button type="button" id="bx">Email report</button>
<button type="button" id="bget">Archive oldest</button>
<iframe title="Feedback" src="/frame" style="width:100%;height:170px;border:1px solid #999"></iframe>
<p role="status" id="hmsg"></p></section>
<script>
const hm=t=>document.getElementById('hmsg').textContent=t;
bpop.onclick=()=>{window.open('/pop','_blank');hm('Sync window opened')};
bbeacon.onclick=()=>{navigator.sendBeacon('/api/beacon','visit');hm('Visit recorded')};
bws.onclick=()=>{const w=new WebSocket('ws://'+location.host+'/ws');w.onopen=()=>{w.send('notify-team');hm('Team notified')}};
bworker.onclick=()=>{const w=new Worker('/worker.js');w.onmessage=()=>hm('Totals recalculated');w.postMessage('go')};
bsw.onclick=async()=>{await navigator.serviceWorker.register('/sw.js');const r=await navigator.serviceWorker.ready;r.active.postMessage('go');hm('Offline sync started')};
bx.onclick=async()=>{try{await fetch('http://127.0.0.1:${port + 1}/send',{method:'POST',body:'report'});hm('Report e-mailed')}catch(e){hm('Could not e-mail the report')}};
bget.onclick=async()=>{await fetch('/api/archive-oldest?confirm=1');hm('Archived');};
</script>` : '';
const script = () => `<script>
${F.has('memsess') ? "const tok=sessionStorage.getItem('__never')||window.__tok||'';" : ''}
const list=document.getElementById('list');
${F.has('gql') ? `(async()=>{try{const r=await fetch('/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'{customers{id name email}}'})});const j=await r.json();list.innerHTML=j.data.customers.map(c=>'<li><span>'+c.name+'</span> <span>'+c.email+'</span></li>').join('')}catch(e){console.error('could not load customers',e);list.innerHTML='<li>Could not load customers</li>'}})();` : ''}
${F.has('track') ? "document.addEventListener('click',e=>{navigator.sendBeacon('/api/track',JSON.stringify({el:String(e.target&&e.target.tagName)}))},true);" : ''}
${F.has('latebeat') ? "setTimeout(()=>setInterval(()=>fetch('/api/ping',{method:'POST'}).catch(()=>{}),1000),6000);" : ''}
${F.has('latebeat2') ? "setTimeout(()=>setInterval(()=>fetch('/api/ping',{method:'POST'}).catch(()=>{}),700),1200);" : ''}
${F.has('wshello') ? "(()=>{let heard=false;const w=new WebSocket('ws://'+location.host+'/ws');w.onopen=()=>w.send(JSON.stringify({type:'subscribe',topic:'customers'}));w.onmessage=e=>{heard=true;const j=JSON.parse(e.data);list.innerHTML=j.map(c=>'<li><span>'+c.name+'</span> <span>'+c.email+'</span></li>').join('')};setTimeout(()=>{if(!heard){console.error('live updates: the server did not answer the subscription');list.innerHTML='<li>Could not load customers</li>'}},3000)})();" : ''}
${F.has('rpc') ? "const rpc=(method,params)=>fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(r=>r.json());rpc('customers.list').then(j=>{list.innerHTML=j.result.map(c=>'<li><span>'+c.name+'</span> <span>'+c.email+'</span></li>').join('')}).catch(e=>{list.innerHTML='<li>Could not load customers</li>'});document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{const j=await rpc('customers.add',d);if(j.result)location.reload();else document.getElementById('msg').textContent=(j.error&&j.error.message)||'Refused'}catch(err){document.getElementById('msg').textContent='Network error'}});" : ''}
${F.has('checkmail') ? "{let t;const em=document.querySelector('#f input[name=email]');em.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(async()=>{try{const r=await fetch('/api/check-email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em.value})});const j=await r.json();document.getElementById('msg').textContent=j.free?'This e-mail is free':'Already a customer'}catch{}},300)})}" : ''}
${F.has('checkname') ? "{let t;const em=document.querySelector('#f input[name=name]');em.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(async()=>{try{const r=await fetch('/api/check-email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:em.value,name:em.value})});const j=await r.json();document.getElementById('msg').textContent=j.free?'New customer':'This name is already a customer'}catch{}},300)})}" : ''}
${F.has('debsearch') ? "{let t;document.getElementById('q').addEventListener('input',e=>{clearTimeout(t);t=setTimeout(async()=>{const r=await fetch('/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q:e.target.value})});const j=await r.json();list.innerHTML=j.map(c=>'<li><span>'+c.name+'</span> <span>'+c.email+'</span></li>').join('')},900)})}" : ''}
${F.has('beat') ? "setInterval(()=>fetch('/api/ping',{method:'POST'}).catch(()=>{}),1000);" : ''}
${F.has('visit') ? "fetch('/api/visit',{method:'POST'}).catch(()=>{});" : ''}
${F.has('native') || F.has('getform') || F.has('rpc') ? '' : `document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();${F.has('dead') ? 'return;' : ''}const d=Object.fromEntries(new FormData(e.target));${F.has('stuck') ? "const ov=document.createElement('div');ov.id='saving';ov.setAttribute('role','status');ov.textContent='Saving…';ov.style.cssText='position:fixed;inset:0;background:rgba(255,255,255,.92);display:grid;place-items:center;z-index:9';document.body.appendChild(ov);const r0=await fetch('/api/customers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});ov.remove();if(r0.ok)location.reload();return;" : ''}try{const r=await fetch('/api/customers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const j=await r.json().catch(()=>({}));if(r.ok){${F.has('nosave') ? "document.getElementById('msg').textContent='Saved';e.target.reset();" : 'location.reload()'}}else document.getElementById('msg').textContent=${F.has('fail500') ? "''" : "j.error||'Refused'"};}catch(err){console.error('request failed',err);document.getElementById('msg').textContent='Network error';}});`}
for(const b of document.querySelectorAll('.del'))b.addEventListener('click',async()=>{${F.has('deaddelete') ? 'return;' : ''}try{const r=await fetch('/api/customers/'+b.dataset.id,{method:'DELETE'});if(r.ok)location.reload();}catch(err){console.error('request failed',err)}});
${F.has('pageerr') ? "document.getElementById('rep').addEventListener('click',()=>{document.getElementById('nope').textContent='x'});" : ''}
${F.has('search') ? "document.getElementById('q').addEventListener('input',async e=>{const r=await fetch('/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q:e.target.value})});const j=await r.json();list.innerHTML=j.map(c=>'<li><span>'+c.name+'</span> <span>'+c.email+'</span></li>').join('')});" : ''}
</script>`;
const home = () => { const s = read(); return shell('Customers', `${F.has('wall') ? `<nav><a href="/">Customers</a>${F.has('staff') ? '<a href="/staff">Staff</a>' : ''}<a href="/logout">Sign out</a></nav>` : ''}${F.has('search') || F.has('debsearch') ? '<label>Search customers <input id="q" type="search" placeholder="Search"></label>' : ''}${addForm}${F.has('pageerr') ? '<button type="button" id="rep">Monthly report</button>' : ''}${F.has('gql') || F.has('wshello') || F.has('rpc') ? '<ul id="list"><li>Loading…</li></ul>' : rowsHtml(s)}${holes()}${script()}`); };
const loginPage = () => shell('Sign in', `<form id="lf"><label>Email <input name="email" type="email" autocomplete="username" required></label><label>Password <input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button><p role="status" id="lm"></p></form><script>document.getElementById('lf').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const r=await fetch('/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});if(r.ok)location.href='/';else document.getElementById('lm').textContent='Wrong e-mail or password';});</script>`);
const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
const obj = (req, raw) => { try { return /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw)); } catch { return {}; } };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const raw = await body(req);
  if (u.pathname !== '/favicon.ico') fs.appendFileSync(log, `${req.method} ${u.pathname}${u.search}${raw ? '  BODY ' + raw.slice(0, 200) : ''}\n`);
  const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const html = (t, c = 200, h = {}) => { res.writeHead(c, { 'content-type': 'text/html; charset=utf-8', ...h }); res.end(t); };
  const js = t => { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end(t); };
  const other = what => { const s = read(); s.other.push(what); write(s); ev('WRITE ' + what); };
  if (u.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (u.pathname === '/login' && req.method === 'POST') { const o = obj(req, raw); if ((o.email === 'owner@his-company.com' && o.password === 'owner-secret-1') || (o.email === 'staff@his-company.com' && o.password === 'staff-secret-1')) { const t = crypto.randomBytes(8).toString('hex'); sessions.add(t); ev('SIGN-IN owner'); res.writeHead(200, { 'content-type': 'application/json', ...(F.has('memsess') ? {} : { 'set-cookie': `sid=${t}; Path=/; HttpOnly` }) }); return res.end(JSON.stringify({ ok: true, token: t })); } ev('SIGN-IN REFUSED ' + o.email); return json(401, { error: 'bad' }); }
  if (u.pathname === '/logout') { ev('SIGN-OUT'); return html('', 302, { location: '/', 'set-cookie': 'sid=; Path=/; Max-Age=0' }); }
  if (u.pathname === '/worker.js') return js("onmessage=async()=>{await fetch('/api/worker',{method:'POST',body:'totals'}).catch(()=>{});postMessage('done')}");
  if (u.pathname === '/sw.js') return js("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',()=>{fetch('/api/sw',{method:'POST',body:'offline-sync'}).catch(()=>{})})");
  if (u.pathname === '/pop') return html(shell('Sync', `<p id="s">Syncing…</p><script>fetch('/api/popup-sync',{method:'POST',body:'sync'}).then(()=>s.textContent='Synced')</script>`));
  if (u.pathname === '/frame') return html(shell('Feedback', `<form method="post" action="/api/frame"><label>Feedback <input name="fb" required></label><button type="submit">Send feedback</button></form>`));
  if (!signed(req)) { if (u.pathname.startsWith('/api/') || u.pathname === '/graphql') return json(401, { error: 'sign in' }); return html(loginPage()); }
  if (u.pathname === '/staff' && req.method === 'GET') return html(shell('Staff', '<nav><a href="/">Customers</a><a href="/staff">Staff</a></nav><h2>Add staff member</h2><form id="sf"><label>Email <input name="email" type="email"></label><label>Password <input name="password" type="password"></label><label>Role <select name="role"><option>cashier</option><option>manager</option></select></label><button type="submit">Add staff member</button><p role="status" id="sm"></p></form><ul>' + (read().staff || []).map(x => '<li>' + esc(x.email) + ' (' + esc(x.role) + ')</li>').join('') + '</ul><script>document.getElementById("sf").addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const r=await fetch("/api/staff",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)});document.getElementById("sm").textContent=r.ok?"Staff member added":"Refused";});</script>'));
  if (u.pathname === '/api/staff' && req.method === 'POST') { const o = obj(req, raw); const s = read(); s.staff = s.staff || []; s.staff.push({ email: String(o.email || ''), password: String(o.password || ''), role: String(o.role || '') }); write(s); ev('ACCOUNT staff ' + o.email + ' / ' + o.password + ' role ' + o.role); return json(200, { ok: true }); }
  if (u.pathname === '/api/track' && req.method === 'POST') return json(200, { ok: true });
  if (u.pathname === '/api/check-email' && req.method === 'POST') { const e = String(obj(req, raw).email || ''); return json(200, { free: !read().customers.some(c => c.email === e) }); }
  if (u.pathname === '/rpc' && req.method === 'POST') { const o = obj(req, raw); if (o.method === 'customers.list') return json(200, { id: 1, result: read().customers }); if (o.method === 'customers.add') { const p = o.params || {}; if (!p.name || !/@/.test(String(p.email || ''))) return json(200, { id: 1, error: { message: 'Check the fields' } }); const s = read(); s.customers.push({ id: ++s.seq, name: String(p.name), email: String(p.email) }); write(s); ev('WRITE customer ' + p.name); return json(200, { id: 1, result: { ok: true } }); } return json(200, { id: 1, error: { message: 'no method' } }); }
  if (u.pathname === '/add' && req.method === 'GET') { const o = Object.fromEntries(u.searchParams); if (o.name && /@/.test(String(o.email || ''))) { const s = read(); s.customers.push({ id: ++s.seq, name: String(o.name), email: String(o.email) }); write(s); ev('WRITE (GET) customer ' + String(o.name).slice(0, 40) + ' ' + o.email); } return html('', 303, { location: '/' }); }
  const gdel = u.pathname.match(/^[/]customers[/](\d+)[/]delete$/);
  if (gdel) { const s = read(); s.customers = s.customers.filter(c => c.id !== Number(gdel[1])); write(s); ev('WRITE (GET) delete customer ' + gdel[1]); return html('', 302, { location: '/' }); }
  if (req.method === 'POST' && (u.pathname === '/api/customers' || u.pathname === '/customers')) {
    const o = obj(req, raw);
    if (!o.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email || ''))) return u.pathname === '/customers' ? html(home(), 400) : json(400, { error: 'Check the fields' });
    if (F.has('fail500')) { ev('SAVE FAILED (500)'); return json(500, { error: 'database is read-only' }); }
    if (!F.has('nosave')) { const s = read(); s.customers.push({ id: ++s.seq, name: String(o.name), email: String(o.email) }); write(s); }
    ev(`WRITE customer ${String(o.name).slice(0, 40)} ${o.email}`);
    return u.pathname === '/customers' ? html('', 303, { location: '/' }) : json(200, { ok: true });
  }
  const del = u.pathname.match(/^\/api\/customers\/(\d+)$/);
  if (del && req.method === 'DELETE') { const s = read(); s.customers = s.customers.filter(c => c.id !== Number(del[1])); write(s); ev('WRITE delete customer ' + del[1]); return json(200, { ok: true }); }
  if (u.pathname === '/remove') { const s = read(); s.customers = s.customers.filter(c => c.id !== Number(u.searchParams.get('id'))); write(s); ev('WRITE (GET) delete customer ' + u.searchParams.get('id')); return html('', 302, { location: '/' }); }
  if (u.pathname === '/api/archive-oldest') { const s = read(); const gone = s.customers.shift(); write(s); ev('WRITE (GET) archived ' + (gone && gone.name)); return json(200, { ok: true }); }
  if (u.pathname === '/graphql' && req.method === 'POST') return json(200, { data: { customers: read().customers } });
  if (u.pathname === '/api/search' && req.method === 'POST') { const q = String(obj(req, raw).q || '').toLowerCase(); return json(200, read().customers.filter(c => (c.name + c.email).toLowerCase().includes(q))); }
  if (u.pathname === '/api/ping' && req.method === 'POST') return json(200, { ok: true });
  if (req.method === 'POST' && /^\/api\/(visit|popup|popup-sync|beacon|worker|sw|frame)$/.test(u.pathname)) { other(u.pathname.slice(5) + ' ' + raw.slice(0, 40)); return u.pathname === '/api/popup' || u.pathname === '/api/frame' ? html(shell('Sent', '<p>Sent.</p>')) : json(200, { ok: true }); }
  if (u.pathname === '/' || u.pathname === '/index.html') return html(home());
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
});
// a dependency-free WebSocket endpoint: one text frame = one write
server.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  fs.appendFileSync(log, 'WS-UPGRADE /ws\n');
  socket.on('data', d => { if ((d[0] & 0x0f) !== 1) return; const len = d[1] & 0x7f; const mask = d.slice(2, 6); const p = Buffer.alloc(len); for (let i = 0; i < len; i++) p[i] = d[6 + i] ^ mask[i % 4]; if (/subscribe/.test(p.toString())) { ev('WS subscription (a read)'); const out = Buffer.from(JSON.stringify(read().customers)); socket.write(Buffer.concat([out.length < 126 ? Buffer.from([0x81, out.length]) : Buffer.from([0x81, 126, out.length >> 8, out.length & 255]), out])); return; } const s = read(); s.other.push('ws ' + p.toString()); write(s); ev('WRITE (WebSocket frame) ' + p.toString()); });
  socket.on('error', () => { });
});
// the other origin: a partner / mail service
http.createServer(async (req, res) => { const raw = await body(req); fs.appendFileSync(log, `X-ORIGIN ${req.method} ${req.url}\n`); if (req.method !== 'OPTIONS' && req.method !== 'GET') ev('WRITE (other origin) mail sent ' + raw.slice(0, 30)); res.writeHead(200, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); res.end('ok'); }).listen(port + 1, '127.0.0.1');
server.listen(port, '127.0.0.1', () => console.log('listening'));
