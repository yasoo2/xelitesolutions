/**
 * ⛔ A WRONG VALUE THE PRODUCT KEEPS IS FOUND; A PRODUCT THAT REFUSES IT IS LEFT ALONE.
 *
 * The owner, 2026-11-10: «إذا في خيارات لازم يحطها أرقام أحرف … يجرب حالات».
 * Pinned on a real browser and a real server, two shops with the same form:
 *   - the careless one takes «abc» as a price and «-5» as a quantity, saves
 *     them, and draws the product's description with innerHTML: the QA says
 *     so (field_accepts_invalid, markup_executes) and removes what it saved;
 *   - the careful one refuses each in the page and on the server, and draws
 *     text as text: no case fails, and its refusals (400) are not errors.
 */
import http from 'http';
import { chromium } from 'playwright';
import { judgeBehaviour, probeForms } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(150_000);

function shop(careful: boolean): string {
    const price = careful ? 'type="number" min="0" step="0.01" required' : 'type="text"';
    const qty = careful ? 'type="number" min="1" step="1" required' : 'type="text"';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop admin</title></head><body>
<h1>Products</h1>
<form id="add-product"><label>Name <input name="name" required></label>
<label>Price <input name="price" ${price}></label>
<label>Quantity <input name="quantity" ${qty}></label>
<label>Description <textarea name="description"></textarea></label>
<p role="alert" id="err"></p><button>Add product</button></form>
<ul id="list"></ul>
<script>
  var CAREFUL = ${careful};
  async function load() {
    var rows = await (await fetch('/api/products')).json();
    var ul = document.getElementById('list');
    ul.innerHTML = '';
    rows.forEach(function (p) {
      var li = document.createElement('li');
      var head = document.createElement('span');
      head.textContent = p.name + ' · ' + p.price + ' · ' + p.quantity + ' ';
      li.appendChild(head);
      var d = document.createElement('span');
      if (CAREFUL) d.textContent = p.description; else d.innerHTML = p.description;
      li.appendChild(d);
      var del = document.createElement('button');
      del.textContent = 'Delete';
      del.onclick = async function () { if (!confirm('Delete?')) return; await fetch('/api/products/' + p.id, { method: 'DELETE' }); load(); };
      li.appendChild(del);
      ul.appendChild(li);
    });
  }
  document.getElementById('add-product').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target;
    var body = { name: f.name.value, price: f.price.value, quantity: f.quantity.value, description: f.description.value };
    var r = await fetch('/api/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { document.getElementById('err').textContent = (await r.json()).error; return; }
    document.getElementById('err').textContent = '';
    f.reset();
    load();
  });
  load();
</script></body></html>`;
}

function serve(careful: boolean): Promise<{ server: http.Server; url: string; rows: any[] }> {
    const rows: any[] = [];
    let next = 1;
    const page = shop(careful);
    const server = http.createServer((req, res) => {
        const url = String(req.url || '/');
        if (url === '/api/products' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(rows)); return; }
        if (url === '/api/products' && req.method === 'POST') {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                const p = JSON.parse(raw || '{}');
                const bad = careful && (!String(p.name || '').trim() || !(Number(p.price) >= 0) || p.price === '' || !(Number.isInteger(Number(p.quantity)) && Number(p.quantity) >= 1));
                if (bad) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Check the price and the quantity' })); return; }
                rows.push({ id: next++, ...p });
                res.writeHead(201, { 'content-type': 'application/json' }); res.end('{}');
            });
            return;
        }
        const del = url.match(/^\/api\/products\/(\d+)$/);
        if (del && req.method === 'DELETE') { const i = rows.findIndex(r => r.id === Number(del[1])); if (i >= 0) rows.splice(i, 1); res.writeHead(204); res.end(); return; }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as any).port}/`, rows })));
}

async function tryShop(careful: boolean) {
    const s = await serve(careful);
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const page = await browser.newPage();
        await page.goto(s.url, { waitUntil: 'load' });
        const r = await probeForms(page, { budgetMs: 60_000 });
        const verdict = judgeBehaviour([], { ...r.metrics }, [], r.forms);
        return { r, codes: verdict.findings.map(f => f.code), rows: s.rows };
    } finally {
        await browser.close();
        await new Promise<void>(res => s.server.close(() => res()));
    }
}

test('the careless shop: «abc» kept as a price is found, its script runs, and what the QA saved is removed', async () => {
    const { r, codes, rows } = await tryShop(false);
    expect(r.metrics.formsError).toBeUndefined();
    expect(r.metrics.fieldCasesTried).toBeGreaterThan(5);
    const saved = (r.metrics.fieldCaseFailures as any[]).filter(x => x.outcome === 'saved_invalid').map(x => x.case);
    expect(saved).toEqual(expect.arrayContaining(['money:letters']));
    expect(codes).toContain('field_accepts_invalid');
    expect(codes).toContain('markup_executes');
    //  Nothing the QA made is left behind: neither the wrong values nor the valid record.
    expect(rows.filter(x => /QA|abc|-5/.test(JSON.stringify(x)))).toEqual([]);
});

test('the careful shop: every case refused, no finding, and its refusals are the product doing its job', async () => {
    const { r, codes } = await tryShop(true);
    expect(r.metrics.fieldCasesTried).toBeGreaterThan(5);
    const major = (r.metrics.fieldCaseFailures as any[]).filter(x => x.weight !== 'minor');
    expect(major).toEqual([]);
    for (const code of ['field_accepts_invalid', 'field_rejects_valid', 'markup_executes', 'markup_drawn']) expect(codes).not.toContain(code);
    expect(r.metrics.formsFilled).toBe(1);
});
