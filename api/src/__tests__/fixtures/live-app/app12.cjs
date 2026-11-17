// A WORKING app with the commonest JWT shape: a short access token in memory and a refresh cookie; every page
// load POSTs /api/auth/refresh (no body) to get its access token back. usage: node app12.js <port> <projectDir> <flags>
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const port = Number(process.argv[2]); const root = process.argv[3];
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const storeFile = path.join(root, 'data', 'store.json'); const log = path.join(root, '..', path.basename(root) + '.req.log');
const read = () => JSON.parse(fs.readFileSync(storeFile, 'utf8')); const write = s => fs.writeFileSync(storeFile, JSON.stringify(s));
if (!fs.existsSync(storeFile)) write({ seq: 2, customers: [{ id: 1, name: 'Huda Salem', email: 'huda@client.example' }, { id: 2, name: 'Omar Nasser', email: 'omar@client.example' }] });
const ev = t => fs.appendFileSync(log, '  ' + t + '\n');
const refresh = new Set(), access = new Set();
const CSS = 'body{font:16px system-ui;margin:0;padding:16px;max-width:760px}label{display:block;margin:8px 0}input,button{font:inherit;padding:8px;min-height:44px}li{margin:6px 0}';
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Customers</title><style>${CSS}</style></head><body><main>
<h1 id="h">Customers</h1>
<form id="lf" hidden><label>Email <input name="email" type="email" autocomplete="username" required></label><label>Password <input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button><p role="status" id="lm"></p></form>
<section id="app" hidden><form id="f"><label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><button type="submit">Add customer</button><p role="status" id="msg"></p></form><ul id="list"></ul></section>
<script>
let tok='';const $=i=>document.getElementById(i);
async function show(){if(!tok){try{const r=await fetch('/api/auth/refresh',{method:'POST'});if(r.ok)tok=(await r.json()).token}catch{}}
 if(!tok){$('h').textContent='Sign in';$('lf').hidden=false;$('app').hidden=true;return}
 const r=await fetch('/api/customers',{headers:{authorization:'Bearer '+tok}});if(!r.ok){tok='';$('lf').hidden=false;$('app').hidden=true;return}
 const j=await r.json();$('h').textContent='Customers';$('lf').hidden=true;$('app').hidden=false;$('list').innerHTML=j.map(c=>'<li><span>'+c.name+'</span> <span>'+c.email+'</span></li>').join('')}
$('lf').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});if(r.ok){tok=(await r.json()).token;show()}else $('lm').textContent='Wrong e-mail or password'});
$('f').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const r=await fetch('/api/customers',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+tok},body:JSON.stringify(d)});if(r.ok){e.target.reset();show()}else $('msg').textContent='Check the fields'});
show();
</script></main></body></html>`;
const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
http.createServer(async (req, res) => {
  const raw = await body(req); const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/favicon.ico') fs.appendFileSync(log, `${req.method} ${u.pathname}${raw ? '  BODY ' + raw.slice(0, 120) : ''}\n`);
  const json = (c, o, h = {}) => { res.writeHead(c, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  let o = {}; try { o = JSON.parse(raw || '{}'); } catch { }
  const cookie = (String(req.headers.cookie || '').match(/rt=([a-f0-9]+)/) || [])[1];
  if (u.pathname === '/api/auth/login' && req.method === 'POST') { if (o.email === 'owner@his-company.com' && o.password === 'owner-secret-1') { const rt = crypto.randomBytes(8).toString('hex'), at = crypto.randomBytes(8).toString('hex'); refresh.add(rt); access.add(at); ev('SIGN-IN owner'); return json(200, { token: at }, { 'set-cookie': `rt=${rt}; Path=/; HttpOnly; SameSite=Strict` }); } return json(401, { error: 'bad' }); }
  if (u.pathname === '/api/auth/refresh' && req.method === 'POST') { if (cookie && refresh.has(cookie)) { const at = crypto.randomBytes(8).toString('hex'); access.add(at); return json(200, { token: at }); } return json(401, { error: 'no session' }); }
  if (u.pathname.startsWith('/api/')) {
    if (!access.has(String(req.headers.authorization || '').replace('Bearer ', ''))) return json(401, { error: 'sign in' });
    if (u.pathname === '/api/customers' && req.method === 'GET') return json(200, read().customers);
    if (u.pathname === '/api/customers' && req.method === 'POST') { if (!o.name || !/@/.test(String(o.email || ''))) return json(400, { error: 'check' }); const s = read(); s.customers.push({ id: ++s.seq, name: String(o.name), email: String(o.email) }); write(s); ev('WRITE customer ' + o.name); return json(200, { ok: true }); }
    return json(404, { error: 'not found' });
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page);
}).listen(port, '127.0.0.1', () => console.log('listening'));
