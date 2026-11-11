/**
 * «EDIT LESSON» BEFORE THE SAVE, «ADD LESSON» AFTER THE RELOAD: THE SAME VIEW.
 *
 * qa-live15, 2026-11-11, the mosque app. Its forms carry their own title
 * inside them, and the title follows the form's mode: «Edit lesson» while a
 * record is edited, «Add lesson» otherwise. A record with nothing of the QA's
 * own to look for is proven by the count of rows, counted again only on the
 * view it was made on — and the view was told by every heading on the page,
 * the form's own title among them. After the reload the title was «Add
 * lesson», the view «was another», nothing was counted, and the delivery was
 * refused with «found nowhere: not on the page, not in the browser's storage,
 * not in what the server sent back» — three times, on unchanged code, though
 * none of those had been searched.
 *
 * Reproduced on a copy of that app: the real QA said so on two walks of
 * three. With a form's own title set aside, both later walks proved the
 * records kept.
 */
import http from 'http';
import { chromium } from 'playwright';
import { judgeBehaviour, probeForms, visibleHeadings } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

/** A stock list kept by its server; the form's title shows what is being added, as it is typed. */
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pantry stock</title>
<style>body{font-family:sans-serif;margin:16px} button,input,select{min-height:44px;margin:4px}</style></head><body>
<h1>Pantry stock</h1>
<ul id="rows"></ul>
<form id="add">
  <h2 id="mode">New stock</h2>
  <label>Category <select name="category" id="category" required><option value="">Choose</option><option>Rice</option><option>Flour</option></select></label>
  <label>Quantity <input name="qty" id="qty" type="number" min="1" max="999" required></label>
  <button type="submit">Save</button>
</form>
<script>
  var rows = document.getElementById('rows'), mode = document.getElementById('mode');
  function draw(list) { rows.innerHTML = ''; list.forEach(function (r) { var li = document.createElement('li'); li.textContent = r.category + ' ' + r.qty; rows.appendChild(li); }); }
  function load() { fetch('/api/stock').then(function (r) { return r.json(); }).then(draw); }
  function title() { var c = document.getElementById('category').value, q = document.getElementById('qty').value; mode.textContent = (c || q) ? 'Adding ' + q + ' ' + c : 'New stock'; }
  document.getElementById('category').addEventListener('change', title);
  document.getElementById('qty').addEventListener('input', title);
  document.getElementById('add').addEventListener('submit', function (e) {
    e.preventDefault();
    fetch('/api/stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: this.category.value, qty: Number(this.qty.value) }) })
      .then(function (r) { if (r.ok) { document.getElementById('add').reset(); title(); load(); } });
  });
  load();
</script></body></html>`;

async function walk() {
    const stock = [{ category: 'Rice', qty: 3 }];
    const server = http.createServer((req, res) => {
        if (req.url === '/api/stock' && req.method === 'POST') {
            let body = '';
            req.on('data', c => { body += c; });
            req.on('end', () => {
                const r = JSON.parse(body || '{}');
                if (!['Rice', 'Flour'].includes(r.category) || !(r.qty >= 1 && r.qty <= 999)) { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"invalid"}'); return; }
                stock.push({ category: r.category, qty: r.qty });
                res.writeHead(201, { 'content-type': 'application/json' }); res.end('{}');
            });
            return;
        }
        if (req.url === '/api/stock') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(stock)); return; }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'networkidle' });
        const result = await probeForms(tab, { budgetMs: 90_000 });
        return { result, stock, headings: { all: await tab.evaluate(visibleHeadings), outsideForms: await tab.evaluate(visibleHeadings, true) } };
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}

test('a record proven by its row is proven kept, though the form\'s own title changed with what was typed', async () => {
    const { result, stock, headings } = await walk();
    //  The QA saved stock, and the server kept it.
    expect(stock.length).toBeGreaterThan(1);
    expect(Number(result.metrics.formsPersistenceUnproven || 0)).toBe(0);
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
    expect(judgeBehaviour([], result.metrics as any, [], result.forms as any).findings.map(f => f.code)).not.toContain('form_persistence_unproven');
    //  The page's view is its own headings; the form's title is the form's.
    expect(headings.all).toContain('New stock');
    expect(headings.outsideForms).toEqual(['Pantry stock']);
});
