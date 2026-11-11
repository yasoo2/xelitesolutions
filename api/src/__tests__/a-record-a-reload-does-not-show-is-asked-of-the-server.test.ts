/**
 * ⛔ WHAT A RELOAD DOES NOT SHOW IS ASKED OF THE SERVER WHERE IT WAS WRITTEN.
 *
 * The tenth live check, 2026-11-11 (L160, a React dashboard): a customer was saved and
 * shown; after a reload the app opened on its summary — its tabs are state, not
 * addresses — and fetched only the totals. «What "Save" made showed, and after a
 * refresh it was found nowhere: not on the page, not in the browser's storage, not in
 * what the server sent back», twice, for a record the server kept. A tester asks the
 * collection it was written to, as the page itself would on its Customers tab.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeForms } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rental admin</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;margin:4px}</style></head><body>
<h1>Rental admin</h1>
<div role="tablist"><button role="tab" id="t-sum">Summary</button><button role="tab" id="t-cus">Customers</button></div>
<div id="view"></div>
<script>
  var view = document.getElementById('view');
  function summary() { fetch('/api/summary').then(function (r) { return r.json(); }).then(function (s) { view.innerHTML = '<h2>Summary</h2><p>' + s.customers + ' customers</p>'; }); }
  function customers() {
    fetch('/api/customers').then(function (r) { return r.json(); }).then(function (list) {
      view.innerHTML = '<h2>Customers</h2><form id="f"><input name="name" required placeholder="Full name"><button>Save</button></form>'
        + '<ul>' + list.map(function (c) { return '<li>' + c.name + '</li>'; }).join('') + '</ul>';
      document.getElementById('f').addEventListener('submit', function (e) {
        e.preventDefault();
        fetch('/api/customers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.elements.name.value }) }).then(customers);
      });
    });
  }
  document.getElementById('t-sum').onclick = summary;
  document.getElementById('t-cus').onclick = customers;
  summary();
</script></body></html>`;

test('a customer the reload\'s summary does not list is found in the collection it was written to', async () => {
    const customers: Array<{ id: number; name: string }> = [{ id: 1, name: 'Ana Ruiz' }];
    const server = http.createServer((q, r) => {
        const json = (v: unknown, status = 200) => { r.writeHead(status, { 'content-type': 'application/json' }); r.end(JSON.stringify(v)); };
        if (q.method === 'GET' && q.url === '/api/summary') return json({ customers: customers.length });
        if (q.method === 'GET' && q.url === '/api/customers') return json(customers);
        if (q.method === 'POST' && q.url === '/api/customers') {
            let body = '';
            q.on('data', d => body += d);
            q.on('end', () => { const c = { id: customers.length + 1, name: String(JSON.parse(body || '{}').name || '') }; customers.push(c); json(c, 201); });
            return;
        }
        r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGE);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        await tab.click('#t-cus');
        await tab.waitForSelector('#f');
        const result = await probeForms(tab, { budgetMs: 60_000 });
        expect(customers.length).toBeGreaterThan(1);                                // the QA saved a customer
        expect(Number(result.metrics.formsPersistenceUnproven || 0)).toBe(0);      // and found it kept
        expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThan(0);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});
