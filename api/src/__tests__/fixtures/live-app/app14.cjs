// app14: a customer list in three server styles the v13.1 attack named (node app14.js <port> <root> <flags>):
//   sse       the page keeps an EventSource open to /events (a live dashboard) — a long-lived connection
//   debounce  the server answers a save at once and writes the file 2 s later (write-behind / autosave)
//   sqlite    the records live in data/shop.db (node:sqlite, WAL journal), not in JSON
// Every request is logged to <root>.req.log. POST /api/customers {name, email} adds a customer.
const http = require('http'), fs = require('fs'), path = require('path');
const [portS, root, flagsS] = process.argv.slice(2); const port = Number(portS); const F = new Set(String(flagsS || '').split(','));
const log = path.join(root, '..', path.basename(root) + '.req.log');
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const SEED = [{ id: 1, name: 'Huda Salem', email: 'huda@her-shop.sa' }, { id: 2, name: 'Omar Nasser', email: 'omar@his-co.sa' }, { id: 3, name: 'Lina Faris', email: 'lina@example.sa' }];
let db = null; const storeFile = path.join(root, 'data', 'store.json');
if (F.has('sqlite')) {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(root, 'data', 'shop.db')); db.exec('PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT)');
  if (!db.prepare('SELECT COUNT(*) n FROM customers').get().n) for (const c of SEED) db.prepare('INSERT INTO customers (name, email) VALUES (?, ?)').run(c.name, c.email);
} else if (!fs.existsSync(storeFile)) fs.writeFileSync(storeFile, JSON.stringify({ seq: 3, customers: SEED }, null, 2));
const list = () => db ? db.prepare('SELECT id, name, email FROM customers').all() : JSON.parse(fs.readFileSync(storeFile, 'utf8')).customers;
const add = (name, email) => {
  if (db) { db.prepare('INSERT INTO customers (name, email) VALUES (?, ?)').run(name, email); return; }
  const s = JSON.parse(fs.readFileSync(storeFile, 'utf8')); s.customers.push({ id: ++s.seq, name, email });
  if (F.has('debounce')) setTimeout(() => fs.writeFileSync(storeFile, JSON.stringify(s, null, 2)), 2000); else fs.writeFileSync(storeFile, JSON.stringify(s, null, 2));
};
const del = id => { if (db) { db.prepare('DELETE FROM customers WHERE id = ?').run(id); return; } const s = JSON.parse(fs.readFileSync(storeFile, 'utf8')); s.customers = s.customers.filter(c => c.id !== id); fs.writeFileSync(storeFile, JSON.stringify(s, null, 2)); };
const clients = new Set();
const page = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Customers</title></head><body><main><h1>Customers</h1>
<form id="f"><label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><button type="submit">Add customer</button></form>
<ul id="list">${list().map(c => `<li>${c.name} &lt;${c.email}&gt; <button type="button" data-id="${c.id}" class="del">Remove ${c.name}</button></li>`).join('')}</ul><p id="msg"></p></main>
<script>
document.getElementById('f').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); const r = await fetch('/api/customers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) }); document.getElementById('msg').textContent = r.ok ? 'Saved' : 'Check the fields'; if (r.ok) setTimeout(() => location.reload(), ${F.has('debounce') ? 2500 : 200}); };
for (const b of document.querySelectorAll('.del')) b.onclick = async () => { await fetch('/api/customers/' + b.dataset.id, { method: 'DELETE' }); location.reload(); };
${F.has('sse') ? "const es = new EventSource('/events'); es.onmessage = m => { document.getElementById('msg').dataset.live = m.data; };" : ''}
</script></body></html>`;
http.createServer((req, res) => {
  let raw = ''; req.on('data', x => raw += x); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); if (u.pathname !== '/favicon.ico') fs.appendFileSync(log, `${req.method} ${u.pathname}${raw ? '  BODY ' + raw.slice(0, 120) : ''}\n`);
    if (u.pathname === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); res.write('data: hello\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return; }
    if (u.pathname === '/api/customers' && req.method === 'POST') { let o = {}; try { o = JSON.parse(raw || '{}'); } catch { } if (!o.name || !/@/.test(String(o.email || ''))) { res.writeHead(400); return res.end('{}'); } add(String(o.name), String(o.email)); for (const c of clients) c.write(`data: ${list().length}\n\n`); res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    const m = u.pathname.match(/^\/api\/customers\/(\d+)$/); if (m && req.method === 'DELETE') { del(Number(m[1])); res.writeHead(204); return res.end(); }
    if (u.pathname === '/api/customers') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(list())); }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(page());
  });
}).listen(port, '127.0.0.1', () => console.log('up'));
setInterval(() => { for (const c of clients) c.write(': keep-alive\n\n'); }, 5000);
process.on('SIGTERM', () => { if (db) db.close(); process.exit(0); });
