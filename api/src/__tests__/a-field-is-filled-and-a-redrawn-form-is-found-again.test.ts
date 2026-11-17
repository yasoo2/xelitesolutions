/**
 * ⛔ A FIELD IS FILLED, NEVER PRESSED — AND A FORM THE PAGE DREW AGAIN IS FOUND AGAIN BEFORE ITS LAST FILL.
 *
 * The eleventh live check, 2026-11-11 (L232, a laundry service), five refusals:
 *  - «Search orders» (an input type=search) and «Filter by status» (a select) carried data-filter,
 *    were catalogued as tabs, pressed, changed nothing: «Unresponsive controls».
 *  - «Save customer», sent with letters in its phone, was refused 400; the app then reloaded the
 *    order and drew its form again with the stored values — after the walk had typed the valid
 *    ones. The last submit pressed a button that was gone, sent nothing, and a leftover redraw was
 *    read as its answer: «sent and taken, never shown», four times.
 */
import http from 'http';
import { chromium } from 'playwright';
import { judgeBehaviour, probeControls, probeForms } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

async function serve(handler: http.RequestListener) {
    const server = http.createServer(handler);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return { server, base: `http://127.0.0.1:${(server.address() as any).port}/` };
}

test('a search box and a status select marked data-filter are fields, not controls that did nothing', async () => {
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Orders</title>
<style>body{font-family:sans-serif;margin:16px} button,input,select{min-height:44px;margin:4px}</style></head><body>
<h1>Orders</h1>
<input type="search" data-filter="search" aria-label="Search orders"><select data-filter="status" aria-label="Filter by status"><option value="">All</option><option>ready</option></select>
<button id="more">Show more</button><ul id="list"><li>Order 1</li></ul>
<script>document.getElementById('more').onclick = function () { document.getElementById('list').innerHTML += '<li>Order 2</li>'; };</script>
</body></html>`;
    const { server, base } = await serve((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(page); });
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(base, { waitUntil: 'load' });
        const probe = await probeControls(tab, { fillForms: false, budgetMs: 30_000 });
        expect(probe.controls.map(c => c.label)).not.toEqual(expect.arrayContaining(['Search orders']));
        expect(probe.controls.map(c => c.label)).not.toEqual(expect.arrayContaining(['Filter by status']));
        const dead = judgeBehaviour(probe.controls, { ...probe.metrics }).findings.filter(f => /dead_controls/.test(f.code));
        expect(dead).toEqual([]);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});

test('a form refused 400 and drawn again with its stored values is found again; its last submit sends the valid values, and is kept', async () => {
    const customer = { name: 'Ana Ruiz', phone: 'call-me' };          // a value an earlier walk left, before the server checked phones
    const sent: string[] = [];
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Laundry</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;margin:4px}</style></head><body>
<div id="detail"></div><div id="toast" class="toast"></div>
<script>
  function esc(v) { return String(v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function render(c) {
    document.getElementById('detail').innerHTML = '<h2>' + esc(c.name) + '</h2><form id="f"><label>Name <input name="name" required value="' + esc(c.name) + '"></label>'
      + '<label>Phone <input name="phone" type="tel" value="' + esc(c.phone) + '"></label><button type="submit">Save customer</button></form>';
    document.getElementById('f').addEventListener('submit', save);
  }
  function load() { return fetch('/api/customer').then(function (r) { return r.json(); }).then(function (c) { return new Promise(function (ok) { setTimeout(function () { render(c); ok(); }, 600); }); }); }
  function save(e) {
    e.preventDefault();
    var form = this; form.querySelector('button').disabled = true;
    var body = { name: form.elements.name.value, phone: form.elements.phone.value };
    fetch('/api/customer', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { document.getElementById('toast').textContent = r.ok ? 'Saved' : j.error; }); })
      .then(load);
  }
  load();
</script></body></html>`;
    const { server, base } = await serve((q, r) => {
        if (q.url === '/api/customer' && q.method === 'GET') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(customer)); }
        if (q.url === '/api/customer' && q.method === 'PATCH') {
            let body = '';
            q.on('data', d => body += d);
            q.on('end', () => {
                const b = JSON.parse(body || '{}');
                sent.push(`${b.name} | ${b.phone}`);
                if (!/^[0-9 +().-]{7,}$/.test(String(b.phone || ''))) { r.writeHead(400, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ error: 'phone may only contain digits' })); }
                customer.name = b.name; customer.phone = b.phone;
                r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(customer));
            });
            return;
        }
        r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(page);
    });
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(base, { waitUntil: 'load' });
        await tab.waitForSelector('#f');
        const result = await probeForms(tab, { budgetMs: 60_000 });
        //  The last submit carried the valid phone, and the server kept it.
        expect(customer.phone).not.toBe('call-me');
        expect(Number(result.metrics.formsPersistenceUnproven || 0)).toBe(0);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});
