// adv8 probe app: one scenario per run. usage: node app8.js <port> <projectDir> <scenario>
// No sign-in wall: each scenario is one page with one form (and a list), served by the project's own server.
const http = require('http'), fs = require('fs'), path = require('path');
const port = Number(process.argv[2]); const root = process.argv[3]; const S = String(process.argv[4] || '');
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const storeFile = path.join(root, 'data', 'users.json');
const log = path.join(root, '..', path.basename(root) + '.req.log');
const read = () => { try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { return { users: [], rows: [] }; } };
const write = s => fs.writeFileSync(storeFile, JSON.stringify(s));
const ev = t => fs.appendFileSync(log, '  ' + t + '\n');
const esc = s => String(s == null ? '' : s).replace(/</g, '&lt;');
// scenario -> { lang, dir, path, h1, fields(html), submit, api, kind: 'account'|'record', list title }
const SC = {
  // --- gaps: account-creating forms the word rule does not name
  people:   { h1: 'Team', fields: '<label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label>', submit: 'Add', api: '/api/people', kind: 'account' },
  peopleusers: { h1: 'Team', fields: '<label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label>', submit: 'Add', api: '/api/users', kind: 'account' },
  onboard:  { h1: 'Get started', fields: '<label>Email <input name="email" type="email" required></label><label>Choose a secret word <input name="pass" type="text" required></label>', submit: 'Continue', api: '/api/onboard', kind: 'account' },
  arabic:   { lang: 'ar', h1: 'انضم إلينا', fields: '<label>البريد الإلكتروني <input name="mail" type="email" required></label><label>كلمه السر <input name="sirr" type="text" required></label>', submit: 'اشترك الآن', api: '/api/subscribers', kind: 'account' },
  nick:     { h1: 'Chat room', fields: '<label>Your nickname <input name="nickname" required></label>', submit: 'Enter chat', api: '/api/enter', kind: 'account' },
  otp:      { lang: 'ar', h1: 'الدخول برقم الجوال', fields: '<label>رقم الجوال <input name="phone" type="tel" required></label>', submit: 'إرسال رمز التحقق', api: '/api/auth/otp', kind: 'sms' },
  // --- no account at all: a record form the word rule takes for an account form
  employees: { h1: 'Employees', fields: '<label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><label>Salary <input name="salary" type="number" min="0" required></label>', submit: 'Add employee', api: '/api/employees', kind: 'record' },
  employeesdead: { h1: 'Employees', fields: '<label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><label>Salary <input name="salary" type="number" min="0" required></label>', submit: 'Add employee', api: '/api/employees', kind: 'record', dead: true },
  members:  { lang: 'ar', h1: 'أعضاء النادي', fields: '<label>الاسم <input name="name" required></label><label>البريد الإلكتروني <input name="email" type="email" required></label>', submit: 'إضافة عضو', api: '/api/members', kind: 'record' },
  newsletter: { h1: 'Bakery news', fields: '<label>Email <input name="email" type="email" required></label>', submit: 'Join the newsletter', api: '/api/newsletter', kind: 'record' },
  contact:  { path: '/account/help', h1: 'Contact us', fields: '<label>Email <input name="email" type="email" required></label><label>Message <textarea name="message" required></textarea></label>', submit: 'Send', api: '/api/contact', kind: 'record' },
  pincode:  { h1: 'Delivery address', fields: '<label>Name <input name="name" required></label><label>Street <input name="street" required></label><label>PIN code <input name="pincode" inputmode="numeric" required></label>', submit: 'Save address', api: '/api/addresses', kind: 'record' },
  customers: { h1: 'Customers', fields: '<label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label>', submit: 'Add customer', api: '/api/customers', kind: 'record' },
  // --- a formless sign-up whose Show/Hide toggle is wrapped (not the field's sibling)
  wrapped:  { h1: 'Create your profile', formless: true, api: '/register', kind: 'account' },
};
const sc = SC[S]; if (!sc) { console.error('unknown scenario ' + S); process.exit(2); }
const home = sc.path || '/';
const page = () => {
  const s = read(); const lang = sc.lang || 'en';
  const list = `<ul id="list">${(sc.kind === 'record' ? s.rows : s.users).map(r => `<li>${esc(r.name || r.email || r.nickname || r.phone)} ${esc(r.email || '')}</li>`).join('')}</ul>`;
  const form = sc.formless
    ? `<div class="card"><label>Name <input id="n"></label><label>Email <input id="e" type="email"></label><div class="field"><label for="p">Password</label><input id="p" type="password"><span class="suffix"><button type="button" id="eye" aria-label="Show password" onclick="p.type=p.type=='password'?'text':'password'">Show</button></span></div><div class="actions"><button type="button" id="go">Create profile</button><p role="status" id="m"></p></div></div><script>go.onclick=async()=>{const r=await fetch('${sc.api}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:n.value,email:e.value,password:p.value})});m.textContent=r.ok?'Created':'Please fill every field'}</script>`
    : `<form id="f">${sc.fields}<button type="submit">${sc.submit}</button><p role="status" id="msg"></p></form><script>document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();${sc.dead ? 'return;' : ''}const d=Object.fromEntries(new FormData(e.target));try{const r=await fetch('${sc.api}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const j=await r.json().catch(()=>({}));if(r.ok){location.reload()}else document.getElementById('msg').textContent=j.error||'Refused';}catch(err){console.error('request failed',err);document.getElementById('msg').textContent='Network error';}});</script>`;
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${sc.h1}</title><style>body{font:16px system-ui;margin:0;padding:16px;max-width:720px}label{display:block;margin:8px 0}input,button,textarea{font:inherit;padding:8px;min-height:44px}</style></head><body><main><h1>${sc.h1}</h1>${form}${list}</main></body></html>`;
};
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
    if (u.pathname !== '/favicon.ico') fs.appendFileSync(log, `${req.method} ${u.pathname}${u.search}${raw ? '  BODY ' + raw.slice(0, 300) : ''}\n`);
    const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (u.pathname === '/favicon.ico') { res.writeHead(404); return res.end(); }
    if (req.method === 'POST' && (u.pathname === sc.api || u.pathname === '/register')) {
      let o = {}; try { o = JSON.parse(raw || '{}'); } catch { try { o = Object.fromEntries(new URLSearchParams(raw)); } catch { } }
      const s = read();
      if (sc.kind === 'sms') { if (!/^\+?\d{7,15}$/.test(String(o.phone || ''))) return json(400, { error: 'رقم غير صالح' }); ev(`SMS SENT (paid) to ${o.phone}`); s.users.push({ phone: o.phone }); write(s); return json(200, { ok: true }); }
      if (sc.kind === 'record') { if (!o.name && !o.email) return json(400, { error: 'Check the fields' }); if (o.email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email))) return json(400, { error: 'Check the e-mail' }); s.rows.push(o); write(s); ev(`RECORD CREATED ${JSON.stringify(o).slice(0, 120)}`); return json(200, { ok: true }); }
      const id = o.email || o.mail || o.nickname;
      if (!id || (S === 'wrapped' && !o.password) || ((o.email !== undefined || o.mail !== undefined) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(id)))) return json(400, { error: 'Check the fields' });
      s.users.push({ email: id, name: o.name, secret: o.pass || o.sirr || o.password || '' }); write(s);
      ev(`ACCOUNT CREATED ${id} secret=${o.pass || o.sirr || o.password || '(none: sign-in link)'}`); return json(200, { ok: true });
    }
    if (u.pathname === home || (home === '/' && u.pathname === '/index.html')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page()); }
    if (u.pathname === '/' && home !== '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shop</title></head><body><main><h1>Shop</h1><nav><a href="${home}">Help</a></nav><p>Welcome.</p></main></body></html>`); }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  });
}).listen(port, '127.0.0.1', () => console.log('listening'));
