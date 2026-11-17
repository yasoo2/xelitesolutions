// adv9/r39 probe: a WORKING app whose front (port) talks to its API on another origin (port+1), as design 2.1 itself names.
// Sign-in POSTs to the API origin; the token is kept in localStorage. usage: node app10.js <port> <projectDir> <flags>
// flags: visit = the signed-in page POSTs /visit on every load (same origin as the API)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const port = Number(process.argv[2]); const root = process.argv[3]; const F = new Set(String(process.argv[4] || '').split(','));
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const storeFile = path.join(root, 'data', 'store.json'); const log = path.join(root, '..', path.basename(root) + '.req.log');
const read = () => JSON.parse(fs.readFileSync(storeFile, 'utf8')); const write = s => fs.writeFileSync(storeFile, JSON.stringify(s));
if (!fs.existsSync(storeFile)) write({ seq: 2, customers: [{ id: 1, name: 'Huda Salem', email: 'huda@client.example' }, { id: 2, name: 'Omar Nasser', email: 'omar@client.example' }], visits: 0 });
const ev = t => fs.appendFileSync(log, '  ' + t + '\n'); const tokens = new Set();
const API = `http://127.0.0.1:${port + 1}`;
const CSS = 'body{font:16px system-ui;margin:0;padding:16px;max-width:760px}label{display:block;margin:8px 0}input,button{font:inherit;padding:8px;min-height:44px}li{margin:6px 0}';
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Customers</title><style>${CSS}</style></head><body><main>
<h1 id="h">Sign in</h1>
<form id="lf"><label>Email <input name="email" type="email" autocomplete="username" required></label><label>Password <input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button><p role="status" id="lm"></p></form>
<section id="app" hidden><form id="f"><label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><button type="submit">Add customer</button><p role="status" id="msg"></p></form><ul id="list"></ul><button type="button" id="out">Sign out</button></section>
<script>
const API=${JSON.stringify(API)};const $=i=>document.getElementById(i);
async function show(){const t=localStorage.getItem('tok');if(!t){$('h').textContent='Sign in';$('lf').hidden=false;$('app').hidden=true;return}
 const r=await fetch(API+'/customers',{headers:{authorization:'Bearer '+t}});if(!r.ok){localStorage.removeItem('tok');return show()}
 ${F.has('visit') ? "fetch(API+'/visit',{method:'POST',headers:{authorization:'Bearer '+t}}).catch(()=>{});" : ''}
 const j=await r.json();$('h').textContent='Customers';$('lf').hidden=true;$('app').hidden=false;$('list').innerHTML=j.map(c=>'<li><span>'+c.name+'</span> <span>'+c.email+'</span></li>').join('')}
$('lf').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{const r=await fetch(API+'/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});if(r.ok){localStorage.setItem('tok',(await r.json()).token);show()}else $('lm').textContent='Wrong e-mail or password'}catch(err){$('lm').textContent='Could not reach the server'}});
$('f').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{const r=await fetch(API+'/customers',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+localStorage.getItem('tok')},body:JSON.stringify(d)});if(r.ok){e.target.reset();show()}else $('msg').textContent='Check the fields'}catch(err){$('msg').textContent='Network error'}});
$('out').onclick=()=>{localStorage.removeItem('tok');show()};show();
</script></main></body></html>`;
const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
http.createServer((req, res) => { if (req.url !== '/favicon.ico') fs.appendFileSync(log, `FRONT ${req.method} ${req.url}\n`); if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); }).listen(port, '127.0.0.1', () => console.log('listening'));
http.createServer(async (req, res) => {
  const raw = await body(req); const u = new URL(req.url, 'http://x');
  fs.appendFileSync(log, `${req.method === 'GET' || req.method === 'OPTIONS' ? 'API-' + req.method : req.method} ${u.pathname}\n`);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let o = {}; try { o = JSON.parse(raw || '{}'); } catch { }
  if (u.pathname === '/login' && req.method === 'POST') { if (o.email === 'owner@his-company.com' && o.password === 'owner-secret-1') { const t = crypto.randomBytes(8).toString('hex'); tokens.add(t); ev('SIGN-IN owner'); return json(200, { token: t }); } ev('SIGN-IN REFUSED'); return json(401, { error: 'bad' }); }
  if (!tokens.has(String(req.headers.authorization || '').replace('Bearer ', ''))) return json(401, { error: 'sign in' });
  if (u.pathname === '/visit' && req.method === 'POST') { if (process.env.TRACE) console.error('[' + new Date().toISOString().slice(14,23) + '] SERVER GOT POST /visit ua=' + String(req.headers['user-agent']).slice(-40) + ' origin=' + req.headers.origin + ' ref=' + req.headers.referer); const s = read(); s.visits++; write(s); ev('WRITE visit counted'); return json(200, { ok: true }); }
  if (u.pathname === '/customers' && req.method === 'GET') return json(200, read().customers);
  if (u.pathname === '/customers' && req.method === 'POST') { if (!o.name || !/@/.test(String(o.email || ''))) return json(400, { error: 'check' }); const s = read(); s.customers.push({ id: ++s.seq, name: String(o.name), email: String(o.email) }); write(s); ev('WRITE customer ' + o.name); return json(200, { ok: true }); }
  json(404, { error: 'not found' });
}).listen(port + 1, '127.0.0.1');
