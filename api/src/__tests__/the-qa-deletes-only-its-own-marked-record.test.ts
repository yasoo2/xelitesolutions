/**
 * ⛔ THE QA DELETES ONLY WHAT CARRIES ITS OWN MARK — NEVER SOMEBODY'S RECORD THAT LOOKS LIKE ITS OWN.
 *
 * The seventh live check, 2026-11-10 (L160, a car rental dashboard): a booking form has
 * no text to type — a car, a customer, two dates, a status — so what the submit made was
 * found by what newly showed: its date. An earlier booking on the same dates was the first
 * row holding it, and the QA pressed that row's «Delete»: booking 1, not its own, gone —
 * then reported «a record created by the QA run itself could not be deleted». On a real
 * system that is a visitor's data. The QA deletes a record only by its own run mark, and
 * only when exactly one record carries it; one it made without a mark is left, and said so.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeForms } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

function inDays(n: number): string {
    const d = new Date(Date.now() + n * 86_400_000);
    return d.toISOString().slice(0, 10);
}

test('a booking with no text of its own is never deleted by its date: the earlier booking on the same dates stays', async () => {
    //  Somebody's booking, on the very dates the QA picks (a week from today, and two days after).
    const bookings = [{ id: 1, car: 'Corolla', start: inDays(7), end: inDays(9) }];
    const deleted: number[] = [];
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bookings</title>
<style>body{font-family:sans-serif;margin:16px} button,input,select{min-height:44px;margin:4px} .hidden{display:none}</style></head><body>
<h1>Bookings</h1><p id="count"></p>
<form id="f"><select name="car" required><option value="">Car…</option><option>Corolla</option></select>
<input type="date" name="start" required><input type="date" name="end" required><button>Save</button></form>
<table id="list" class="hidden"><tbody id="rows"></tbody></table>
<script>
  function draw(list) {
    document.getElementById('count').textContent = list.length + ' booking(s)';
    document.getElementById('rows').innerHTML = list.map(function (b) { return '<tr><td>' + b.car + '</td><td>' + b.start + ' → ' + b.end + '</td><td><button data-del="' + b.id + '">Delete</button></td></tr>'; }).join('');
  }
  function load() { return fetch('/api/bookings').then(function (r) { return r.json(); }).then(draw); }
  document.addEventListener('click', function (e) {
    var id = e.target.getAttribute && e.target.getAttribute('data-del');
    if (id) fetch('/api/bookings/' + id, { method: 'DELETE' }).then(load);
  });
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = {}; new FormData(this).forEach(function (v, k) { body[k] = v; });
    //  The list opens once something was booked.
    fetch('/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function () { localStorage.setItem('listOpen', '1'); document.getElementById('list').classList.remove('hidden'); return load(); });
  });
  //  …and stays open, as a dashboard keeps the list it showed.
  if (localStorage.getItem('listOpen')) document.getElementById('list').classList.remove('hidden');
  load();
</script></body></html>`;
    const server = http.createServer((q, r) => {
        const json = (status: number, v: unknown) => { r.writeHead(status, { 'content-type': 'application/json' }); r.end(JSON.stringify(v)); };
        if (q.method === 'GET' && q.url === '/api/bookings') return json(200, bookings);
        if (q.method === 'POST' && q.url === '/api/bookings') {
            let body = '';
            q.on('data', d => body += d);
            q.on('end', () => { const b = JSON.parse(body || '{}'); const rec = { id: bookings.length + 1, ...b }; bookings.push(rec); json(201, rec); });
            return;
        }
        const del = /^\/api\/bookings\/(\d+)$/.exec(String(q.url));
        if (q.method === 'DELETE' && del) {
            const id = Number(del[1]);
            deleted.push(id);
            const i = bookings.findIndex(b => b.id === id);
            if (i >= 0) bookings.splice(i, 1);
            r.writeHead(204); return r.end();
        }
        r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(page);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const result = await probeForms(tab, { budgetMs: 60_000 });
        expect(bookings.length).toBeGreaterThan(1);            // the QA did book
        expect(deleted).not.toContain(1);                       // and never deleted somebody's booking
        expect(bookings.some(b => b.id === 1)).toBe(true);
        expect(Number(result.metrics.qaRecordsNotDeleted || 0)).toBe(0);   // no «could not delete its own» from a wrong delete
        expect(Number(result.metrics.qaRecordsLeft || 0)).toBeGreaterThan(0);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});
