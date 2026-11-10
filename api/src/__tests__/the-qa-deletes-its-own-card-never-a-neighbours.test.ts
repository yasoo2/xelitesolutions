/**
 * ⛔ IN A GRID OF CARDS, THE QA DELETES ITS OWN CARD — NEVER THE FIRST CARD IN THE GRID.
 *
 * The second review, 2026-11-11: «exactly one record holds the mark» counted the containers
 * the delete buttons sat in, and clicked the first button. In a card grid (.row > .col >
 * .card), every «Delete» resolved to the one .row: the count was 1, and the first card — a
 * visitor's — was the one pressed. Each delete is now tied to the smallest part of the page
 * that holds the QA's mark, and that part must hold no other delete.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeForms } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

test('the QA\'s own card is deleted by its own button; the visitors\' cards before it stay', async () => {
    const people = [{ id: 1, name: 'Ana Ruiz' }, { id: 2, name: 'Bilal Haddad' }];
    const deleted: number[] = [];
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Customers</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;margin:4px} .row{display:flex;flex-wrap:wrap} .col{width:30%}</style></head><body>
<h1>Customers</h1>
<form id="f"><input name="name" required placeholder="Full name"><button>Add customer</button></form>
<div class="row" id="grid"></div>
<script>
  function load() { return fetch('/api/people').then(function (r) { return r.json(); }).then(function (list) {
    document.getElementById('grid').innerHTML = list.map(function (p) {
      return '<div class="col"><div class="card"><h3>' + p.name + '</h3><button data-del="' + p.id + '">Delete</button></div></div>';
    }).join('');
  }); }
  document.addEventListener('click', function (e) { var id = e.target.getAttribute && e.target.getAttribute('data-del'); if (id) fetch('/api/people/' + id, { method: 'DELETE' }).then(load); });
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = this;
    fetch('/api/people', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.elements.name.value }) }).then(function () { form.reset(); return load(); });
  });
  load();
</script></body></html>`;
    const server = http.createServer((q, r) => {
        const json = (v: unknown, status = 200) => { r.writeHead(status, { 'content-type': 'application/json' }); r.end(JSON.stringify(v)); };
        if (q.method === 'GET' && q.url === '/api/people') return json(people);
        if (q.method === 'POST' && q.url === '/api/people') {
            let body = '';
            q.on('data', d => body += d);
            q.on('end', () => { const p = { id: Math.max(0, ...people.map(x => x.id)) + 1, name: String(JSON.parse(body || '{}').name || '') }; people.push(p); json(p, 201); });
            return;
        }
        const del = /^\/api\/people\/(\d+)$/.exec(String(q.url));
        if (q.method === 'DELETE' && del) {
            const id = Number(del[1]);
            deleted.push(id);
            const i = people.findIndex(p => p.id === id);
            if (i >= 0) people.splice(i, 1);
            r.writeHead(204); return r.end();
        }
        r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(page);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        await probeForms(tab, { budgetMs: 60_000 });
        expect(deleted).not.toContain(1);
        expect(deleted).not.toContain(2);
        expect(people.map(p => p.id)).toEqual(expect.arrayContaining([1, 2]));
        //  …and what the QA made, it removed.
        expect(deleted.length).toBeGreaterThan(0);
        expect(people.some(p => /Joe QA|qa/i.test(p.name))).toBe(false);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});
