/**
 * ⛔ A FORM IS SENT BY ITS OWN BUTTON, NEVER BY THE BUTTON OF A VIEW THAT IS HIDDEN.
 *
 * The seventh live check, 2026-11-10 (L160, a car rental dashboard in one document:
 * its views hidden and shown by the address): the QA stamped each form it filled and
 * the form's submit button, and cleared the form and field stamps on every pass — but
 * not the submit's. The cars view's «Save» kept «joe-form-1»; on the customers view the
 * customers' «Save» got «joe-form-1» too, and the QA filled the customers' form and
 * pressed the first «joe-form-1» in the document: the hidden cars «Save». Nothing was
 * sent. «Filled in completely and submitted, and nothing happened at all» — ten
 * refusals, and a working dashboard failed the exam after 76 minutes.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeForms } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rental admin</title>
<style>body{font-family:sans-serif;margin:16px} .view{display:none} .view.active{display:block} button,input{min-height:44px;margin:4px}</style></head><body>
<nav><a href="#cars">Cars</a> <a href="#customers">Customers</a></nav>
<p id="notice" role="status"></p>
<section id="cars" class="view"><h2>Cars</h2><form id="price"><input name="days" type="number" min="1" placeholder="Days"><input name="rate" type="number" min="1" placeholder="Daily rate"><button>Calculate</button></form><p id="total"></p></section>
<section id="customers" class="view"><h2>Customers</h2><form id="form-customers"><input name="name" required placeholder="Full name"><input name="email" type="email" required placeholder="Email"><button>Save</button></form><ul id="customers-list"></ul></section>
<script>
  function show() { var v = (location.hash || '#cars').slice(1); document.querySelectorAll('.view').forEach(function (s) { s.classList.toggle('active', s.id === v); }); }
  window.addEventListener('hashchange', show); show();
  //  A calculator answers in the page and sends nothing: the walk keeps the document, and its stamps, as it goes on.
  document.getElementById('price').addEventListener('submit', function (e) { e.preventDefault(); document.getElementById('total').textContent = 'Total: ' + (this.elements.days.value * this.elements.rate.value); });
  ['customers'].forEach(function (kind) {
    document.getElementById('form-' + kind).addEventListener('submit', function (e) {
      e.preventDefault();
      var body = {}; new FormData(this).forEach(function (v, k) { body[k] = v; });
      var form = this;
      fetch('/api/' + kind, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (rec) { var li = document.createElement('li'); li.textContent = Object.values(rec).join(' '); document.getElementById(kind + '-list').appendChild(li); form.reset(); document.getElementById('notice').textContent = 'Saved'; });
    });
  });
</script></body></html>`;

test('the customers\' form, filled after the cars\' form in the same document, is sent by the customers\' own «Save»', async () => {
    const posts: string[] = [];
    const server = http.createServer((q, r) => {
        if (q.method === 'POST') {
            let body = '';
            q.on('data', d => body += d);
            q.on('end', () => { posts.push(`${q.url} ${body}`); r.writeHead(201, { 'content-type': 'application/json' }); r.end(body); });
            return;
        }
        r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGE);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const base = `http://127.0.0.1:${(server.address() as any).port}/`;
        await tab.goto(`${base}#cars`, { waitUntil: 'load' });
        const cars = await probeForms(tab, { budgetMs: 40_000 });
        expect(cars.forms.some(f => f.effect === 'submitted')).toBe(true);
        expect(await tab.evaluate(() => document.querySelectorAll('[data-joe-sub]').length)).toBeGreaterThan(0);
        //  The same document, another view: the calculator is hidden, its «Calculate» still stamped from the pass before.
        await tab.evaluate(() => { location.hash = '#customers'; });
        await tab.waitForTimeout(300);
        const customers = await probeForms(tab, { budgetMs: 40_000 });
        expect(posts.some(p => p.startsWith('/api/customers'))).toBe(true);
        expect(customers.forms.find(f => /Save/.test(f.label))?.effect).toBe('submitted');
        expect(Number(customers.metrics.formsDeadSubmit || 0)).toBe(0);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});
