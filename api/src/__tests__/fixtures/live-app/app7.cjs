// adv7 probe app. usage: node app7.js <port> <projectDir> <flags,comma>
// flags: owner register setup chpw textpw native formattr noform magic username root mem defects pin
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const port = Number(process.argv[2]); const root = process.argv[3]; const F = new Set(String(process.argv[4] || '').split(',').filter(Boolean));
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const storeFile = F.has('root') ? path.join(root, 'users.json') : path.join(root, 'data', 'users.json');
const log = path.join(root, '..', path.basename(root) + '.req.log');
let mem = null;
const read = () => { if (F.has('mem')) return mem || (mem = { users: [], notes: [] }); try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { return { users: [], notes: [] }; } };
const write = s => { if (F.has('mem')) { mem = s; return; } fs.writeFileSync(storeFile, JSON.stringify(s)); };
const hash = p => crypto.scryptSync(String(p || ''), 's', 16).toString('hex');
if (F.has('owner') && !read().users.length) write({ users: [{ email: 'owner@his-company.com', name: 'Owner', hash: hash('owner-secret-1'), role: 'admin' }], notes: [{ by: 'owner@his-company.com', text: 'the owner\'s own note' }] });
const tokenFile = path.join(root, 'data', 'setup-token.txt');
const isOpen = () => read().users.length === 0;
if (F.has('setup') && isOpen() && !fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(16).toString('hex'));
const sessions = new Map();
const page = (t, b, signed) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t}</title><style>body{font:16px system-ui;margin:0;padding:16px;max-width:720px}label{display:block;margin:8px 0}input,button,textarea{font:inherit;padding:8px;min-height:44px}nav a{margin-inline-end:12px;display:inline-block;padding:12px 0}</style></head><body><header><nav>${signed ? '<a href="/">Dashboard</a><a href="/account">Account</a>' + (F.has('pin') ? '<a href="/staff">Staff</a>' : '') : '<a href="/">Sign in</a>' + (F.has('register') ? '<a href="/register">Create an account</a>' : '')}</nav></header><main><h1>${t}</h1>${b}</main></body></html>`;
const parse = (req) => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { let o = {}; try { o = /json/.test(req.headers['content-type'] || '') ? JSON.parse(b || '{}') : Object.fromEntries(new URLSearchParams(b)); } catch { } r({ raw: b, o }); }); });
// a form: native urlencoded post, or fetch JSON
const form = (id, action, inner, submit, okGo) => F.has('native')
  ? `<form id="${id}" method="post" action="${action}">${inner}<button type="submit">${submit}</button></form>`
  : `<form id="${id}">${inner}<button type="submit">${submit}</button><p role="status" id="${id}-msg"></p></form><script>document.getElementById('${id}').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const r=await fetch('${action}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const j=await r.json().catch(()=>({}));if(r.ok&&'${okGo || ''}')location.href='${okGo || ''}';else document.getElementById('${id}-msg').textContent=r.ok?'Saved':(j.error||'Refused');});</script>`;
const pwType = F.has('textpw') ? 'text' : 'password';
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const html = (c, h) => { res.writeHead(c, { 'content-type': 'text/html; charset=utf-8' }); res.end(h); };
  const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const go = (to, cookie) => { res.writeHead(302, { location: to, ...(cookie ? { 'set-cookie': cookie } : {}) }); res.end(); };
  const sid = (/sid=([a-f0-9]+)/.exec(req.headers.cookie || '') || [])[1]; const me = sessions.get(sid);
  let body = { raw: '', o: {} }; if (req.method !== 'GET') body = await parse(req);
  if (u.pathname !== '/favicon.ico') fs.appendFileSync(log, `${req.method} ${u.pathname}${u.search}${body.raw ? '  BODY ' + body.raw.slice(0, 300) : ''}\n`);
  const done = (ok, to, err, cookie) => F.has('native') ? (ok ? go(to, cookie) : html(400, page('Refused', `<p role="alert">${err}</p><a href="javascript:history.back()">Back</a>`, !!me))) : (res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json', ...(cookie ? { 'set-cookie': cookie } : {}) }), res.end(JSON.stringify(ok ? { ok: true } : { error: err })));
  const s = read();
  if (u.pathname === '/favicon.ico') return html(404, '');
  if (u.pathname === '/api/setup' && F.has('setup')) return json(200, { open: isOpen(), tokenRequired: true });
  // --- JSON API doors (the isolation probe's)
  if (u.pathname === '/api/auth/register' && req.method === 'POST') { if (s.users.find(x => x.email === body.o.email)) return json(409, { error: 'exists' }); s.users.push({ email: body.o.email, name: body.o.name, hash: hash(body.o.password), role: s.users.length ? 'member' : 'admin' }); write(s); fs.appendFileSync(log, `  ACCOUNT CREATED (api) ${body.o.email} pw=${body.o.password}\n`); return json(200, { ok: true }); }
  if (u.pathname === '/api/auth/login' && req.method === 'POST') { const x = s.users.find(a => a.email === body.o.email && a.hash === hash(body.o.password)); fs.appendFileSync(log, `  LOGIN TRY (api) ${body.o.email} pw=${body.o.password} ${x ? 'ok' : 'refused'}\n`); if (!x) return json(401, { error: 'wrong' }); const id = crypto.randomBytes(8).toString('hex'); sessions.set(id, x.email); return json(200, { token: id }); }
  const bearer = sessions.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
  if (u.pathname === '/api/notes') { const who = bearer || me; if (!who) return json(401, { error: 'sign in' }); if (req.method === 'POST') { const n = { id: crypto.randomBytes(4).toString('hex'), by: who, text: String(body.o.text || '') }; s.notes.push(n); write(s); return json(200, n); } return json(200, s.notes.filter(n => n.by === who)); }
  // --- setup
  if (F.has('setup') && u.pathname === '/setup' && req.method === 'POST') { if (!isOpen()) return done(false, '', 'closed'); let t = ''; try { t = fs.readFileSync(tokenFile, 'utf8').trim(); } catch { } if (body.o.token !== t) { fs.appendFileSync(log, `  SETUP REFUSED token=${String(body.o.token).slice(0, 20)} pw=${body.o.password}\n`); return done(false, '', 'Wrong setup token'); } s.users.push({ email: body.o.email, name: body.o.name, hash: hash(body.o.password), role: 'admin' }); write(s); fs.rmSync(tokenFile, { force: true }); fs.appendFileSync(log, `  ADMIN CREATED ${body.o.email} pw=${body.o.password}\n`); return done(true, '/'); }
  if (F.has('setup') && isOpen()) { if (u.pathname !== '/setup') return go('/setup'); return html(200, page('Create the admin account', form('setup', '/setup', '<label>Setup token <input name="token" required></label><label>Name <input name="name"></label><label>Email <input name="email" type="email" required></label><label>Password <input name="password" type="password" required minlength="8"></label>', 'Create admin', '/'))); }
  // --- register
  if (F.has('register') && u.pathname === '/register' && req.method === 'POST') {
    const o = body.o; const pw = o.password;
    if (F.has('defects') && String(o.name || '').length > 0 && String(pw || '').length >= 8) { fs.appendFileSync(log, '  REGISTER 500 (seeded defect D3)\n'); res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":"TypeError: cannot read properties of undefined"}'); }
    if (!o.email || (!F.has('magic') && !pw) || (!F.has('defects') && !F.has('magic') && String(pw).length < 8)) return done(false, '', 'Check the fields');
    if (s.users.find(x => x.email === o.email)) return done(false, '', 'exists');
    s.users.push({ email: o.email, name: o.name, hash: hash(pw), role: 'member' }); write(s); fs.appendFileSync(log, `  ACCOUNT CREATED ${o.email} pw=${pw}\n`); return done(true, '/');
  }
  if (F.has('register') && u.pathname === '/register') {
    const pwField = `<label>Password <input name="password" type="${pwType}" required minlength="8"></label>`;
    if (F.has('magic')) return html(200, page('Create your account', form('reg', '/register', '<label>Name <input name="name"></label><label>Email <input name="email" type="email" required></label>', 'Send me a sign-in link', '/')));
    if (F.has('formattr')) return html(200, page('Create your account', `<form id="reg" method="post" action="/register"><label>Name <input name="name"></label><label>Email <input name="email" type="email" required></label></form><div class="pw"><label>Password <input name="password" type="password" form="reg" minlength="8"></label></div><div class="actions"><button type="submit" form="reg">Register</button></div>`));
    if (F.has('noform')) return html(200, page('Create your account', `<div class="card"><label>Name <input id="n"></label><label>Email <input id="e" type="email"></label><div class="field"><label for="p">Password</label><input id="p" type="password"><button type="button" id="eye" aria-label="Show password" onclick="p.type=p.type=='password'?'text':'password'">Show</button></div><div class="actions"><button type="button" id="go">Register</button><p role="status" id="m"></p></div></div><script>go.onclick=async()=>{const r=await fetch('/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:n.value,email:e.value||('anon'+Date.now()+'@x.test'),password:p.value||'default-pass-1'})});m.textContent=r.ok?'Registered':'Refused'}</script>`));
    return html(200, page('Create your account', form('reg', '/register', '<label>Name <input name="name"></label><label>Email <input name="email" type="email" required></label>' + pwField, 'Register', '/')));
  }
  // --- sign in / out
  if (u.pathname === '/login' && req.method === 'POST') { const id0 = body.o.email || body.o.username; const x = s.users.find(a => a.email === id0 && a.hash === hash(body.o.password)); fs.appendFileSync(log, `  LOGIN TRY ${id0} pw=${body.o.password} ${x ? 'ok' : 'refused'}\n`); if (!x) return done(false, '', 'Wrong e-mail or password'); const id = crypto.randomBytes(8).toString('hex'); sessions.set(id, x.email); return done(true, '/', '', `sid=${id}; HttpOnly; Path=/`); }
  if (u.pathname === '/logout') { sessions.delete(sid); return go('/'); }
  if (!me) return html(200, page('Sign in', form('login', '/login', (F.has('username') ? '<label>Username <input name="username" type="text"></label>' : '<label>Email <input name="email" type="email" required></label>') + `<label>Password <input name="password" type="password"${F.has('username') ? '' : ' required'}></label>`, 'Sign in', '/')));
  // --- signed in
  if (u.pathname === '/account/password' && req.method === 'POST') { if (F.has('defects')) { res.writeHead(204); return res.end(); } const x = s.users.find(a => a.email === me); if (!x || x.hash !== hash(body.o.current)) return done(false, '', 'Current password is wrong'); if (String(body.o.next || '').length < 8) return done(false, '', 'Too short'); x.hash = hash(body.o.next); write(s); fs.appendFileSync(log, `  PASSWORD CHANGED ${me} to=${body.o.next}\n`); return done(true, '/account'); }
  if (u.pathname === '/account') return html(200, page('Account', (F.has('chpw') ? (F.has('defects')
    ? `<form id="chpw"><label>Current password <input name="current" type="password" required></label><label>New password <input name="next" type="password" required minlength="8"></label><button type="submit">Change password</button></form><script>document.getElementById('chpw').addEventListener('submit',e=>{e.preventDefault()})</script>`
    : form('chpw', '/account/password', '<label>Current password <input name="current" type="password" required></label><label>New password <input name="next" type="password" required minlength="8"></label>', 'Change password', '')) : '<p>Signed in as ' + me + '</p>') + '<p><a href="/logout">Sign out</a></p>', true));
  if (F.has('pin') && u.pathname === '/staff' && req.method === 'POST') { s.users.push({ email: (body.o.name || 'staff') + '@staff', name: body.o.name, hash: hash(body.o.pin), role: 'staff' }); write(s); fs.appendFileSync(log, `  STAFF ACCOUNT CREATED ${body.o.name} pin=${body.o.pin}\n`); return done(true, '/staff'); }
  if (F.has('pin') && u.pathname === '/staff') return html(200, page('Staff', `<ul>${s.users.map(x => `<li>${x.name} (${x.role})</li>`).join('')}</ul>` + form('staff', '/staff', '<label>Staff name <input name="name" required></label><label>Sign-in PIN <input name="pin" inputmode="numeric" required></label>', 'Add staff', '/staff'), true));
  if (u.pathname === '/notes' && req.method === 'POST') { if (F.has('defects') && false) return; s.notes.push({ id: crypto.randomBytes(4).toString('hex'), by: me, text: String(body.o.text || '') }); write(s); return done(true, '/'); }
  html(200, page('Dashboard', `<p>Welcome ${me}</p><ul>${s.notes.filter(n => n.by === me).map(n => `<li>${String(n.text).replace(/</g, '&lt;')}</li>`).join('')}</ul>` + (F.has('deadnote') ? '<form id="note"><label>Note <input name="text" required></label><button type="submit">Add note</button></form><script>document.getElementById("note").addEventListener("submit",e=>e.preventDefault())</script>' : form('note', '/notes', '<label>Note <input name="text" required></label>', 'Add note', '/')) + '<p><a href="/logout">Sign out</a></p>', true));
}).listen(port, '127.0.0.1', () => console.log('listening'));
