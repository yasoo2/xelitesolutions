/**
 * ⛔ A RECORD WITH NOTHING OF ITS OWN TO SHOW IS PROVEN BY THE ROW IT ADDED.
 *
 * The eighth live check, 2026-11-10 (L160, a car rental dashboard): «Add booking» —
 * a car, a customer, two dates, a status, all chosen, nothing typed — was taken by
 * the server and drew its row, and «what it made never showed outside the form:
 * neither what the QA typed ("") nor a new record» refused it four times: every
 * word of the new row was already on the page. And every walk booked the same days,
 * so the QA's own earlier bookings were what made the new one look old.
 *
 * Pinned: the record is proven by the count of records, after the submit and after a
 * reload, and is never deleted (it carries no run mark); each run books its own days.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeForms } from '../core/quality/behaviour-audit';
import { fillValueFor } from '../core/quality/qa-field-cases';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

test('each run books its own days, a week or more ahead, the end after the start', () => {
    const field = (name: string) => ({ tag: 'input', type: 'date', name } as any);
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const starts = ['mwb1taz2-9nu8g', 'mwb19q9b-dkfi7', 'mwb0id0g-q03x2', 'mwb1iee0-smzz7'].map(n => fillValueFor(field('startDate Start date'), n));
    expect(new Set(starts).size).toBeGreaterThan(1);
    for (const n of ['mwb1taz2-9nu8g', 'mwb19q9b-dkfi7']) {
        const start = fillValueFor(field('startDate Start date'), n), end = fillValueFor(field('endDate End date'), n);
        expect(start > today && end > start && end < in30).toBe(true);
    }
});

test('a booking whose row shows only what the page already showed is proven by the row it added, and kept', async () => {
    //  Somebody's bookings: the same car, the same customer, the same status as the QA will choose.
    const bookings = [{ id: 1, car: 'Corolla', customer: 'Ana Ruiz', status: 'pending' }, { id: 2, car: 'Corolla', customer: 'Ana Ruiz', status: 'pending' }];
    const deleted: number[] = [];
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bookings</title>
<style>body{font-family:sans-serif;margin:16px} button,input,select{min-height:44px;margin:4px}</style></head><body>
<h1>Bookings</h1>
<form id="f"><select name="car" required><option value="">Car…</option><option>Corolla</option></select>
<select name="customer" required><option value="">Customer…</option><option>Ana Ruiz</option></select>
<input type="date" name="start" required><input type="date" name="end" required>
<select name="status"><option>pending</option></select><button>Add booking</button></form>
<table><thead><tr><th>Car</th><th>Customer</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table>
<script>
  function load() { return fetch('/api/bookings').then(function (r) { return r.json(); }).then(function (list) {
    document.getElementById('rows').innerHTML = list.map(function (b) { return '<tr><td>' + b.car + '</td><td>' + b.customer + '</td><td>' + b.status + '</td><td><button data-del="' + b.id + '">Delete</button></td></tr>'; }).join('');
  }); }
  document.addEventListener('click', function (e) { var id = e.target.getAttribute && e.target.getAttribute('data-del'); if (id) fetch('/api/bookings/' + id, { method: 'DELETE' }).then(load); });
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = {}; new FormData(this).forEach(function (v, k) { body[k] = v; });
    var form = this;
    fetch('/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function () { form.reset(); return load(); });
  });
  load();
</script></body></html>`;
    const server = http.createServer((q, r) => {
        const json = (status: number, v: unknown) => { r.writeHead(status, { 'content-type': 'application/json' }); r.end(JSON.stringify(v)); };
        if (q.method === 'GET' && q.url === '/api/bookings') return json(200, bookings);
        if (q.method === 'POST' && q.url === '/api/bookings') {
            let body = '';
            q.on('data', d => body += d);
            q.on('end', () => { const b = JSON.parse(body || '{}'); const rec = { id: bookings.length + 1, car: b.car, customer: b.customer, status: b.status }; bookings.push(rec); json(201, rec); });
            return;
        }
        const del = /^\/api\/bookings\/(\d+)$/.exec(String(q.url));
        if (q.method === 'DELETE' && del) { deleted.push(Number(del[1])); r.writeHead(204); return r.end(); }
        r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(page);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const result = await probeForms(tab, { budgetMs: 60_000 });
        expect(bookings.length).toBeGreaterThan(2);                                   // the QA booked
        expect(Number(result.metrics.formsPersistenceUnproven || 0)).toBe(0);        // and its booking is proven
        expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThan(0);
        expect(deleted).toEqual([]);                                                  // and nothing of anybody's was deleted
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});
