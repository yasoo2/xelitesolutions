/**
 * THE FORMS ARE SENT ON THE PAGE AS IT STARTED, NOT AS THE LAST CONTROL LEFT IT.
 *
 * qa-live17b, 2026-11-12 (L052, an event tracker): a form «Add event», then
 * three filter buttons «All», «Active», «Done», then the list. The controls
 * pass pressed each filter on the page put back as it started — and after the
 * last one, «Done», nothing put it back. The forms pass then sent «Add event»
 * on a list filtered to done events: the new event, active, was not drawn,
 * and «sent and taken, never shown outside the form» refused the delivery
 * four times in 60 minutes. Joe's own browser, on a fresh page, saw the event
 * every time, and the run ended undelivered.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

/** The tracker's shape: kept in the browser's storage, the filter only in memory (as React state is). */
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Event Tracker</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;min-width:44px;margin:4px}</style></head><body>
<main>
<h1>Event Tracker</h1>
<p id="count"></p>
<form id="add" novalidate>
  <input id="title" aria-label="Event name" placeholder="New event, e.g. Venue visit">
  <button type="submit">Add event</button>
</form>
<p id="error" role="alert" hidden></p>
<nav aria-label="Filter events">
  <button type="button" data-f="all" aria-pressed="true">All</button>
  <button type="button" data-f="active" aria-pressed="false">Active</button>
  <button type="button" data-f="done" aria-pressed="false">Done</button>
</nav>
<ul id="list"></ul>
<p id="empty"></p>
</main>
<script>
  var KEY = 'events-v1', filter = 'all';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(list) { localStorage.setItem(KEY, JSON.stringify(list)); }
  function draw() {
    var all = load(), list = document.getElementById('list'), empty = document.getElementById('empty');
    var shown = all.filter(function (e) { return filter === 'all' || (filter === 'done' ? e.done : !e.done); });
    document.getElementById('count').textContent = all.filter(function (e) { return !e.done; }).length + ' active of ' + all.length + ' total';
    list.innerHTML = '';
    shown.forEach(function (e) {
      var li = document.createElement('li');
      var box = document.createElement('input'); box.type = 'checkbox'; box.checked = e.done; box.setAttribute('aria-label', 'Done: ' + e.title);
      box.onchange = function () { var l = load(); l.forEach(function (x) { if (x.id === e.id) x.done = !x.done; }); save(l); draw(); };
      var span = document.createElement('span'); span.textContent = e.title;
      li.appendChild(box); li.appendChild(span); list.appendChild(li);
    });
    empty.textContent = shown.length ? '' : (all.length ? 'No events match this filter.' : 'No events yet. Add your first one above.');
  }
  document.querySelectorAll('nav button').forEach(function (b) {
    b.onclick = function () {
      filter = b.getAttribute('data-f');
      document.querySelectorAll('nav button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      draw();
    };
  });
  document.getElementById('add').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = document.getElementById('title').value.trim(), err = document.getElementById('error');
    if (!t) { err.textContent = 'Please enter an event name.'; err.hidden = false; return; }
    err.hidden = true;
    var l = load(); l.push({ id: Date.now() + Math.random(), title: t, done: false }); save(l);
    document.getElementById('title').value = '';
    draw();
  });
  draw();
</script></body></html>`;

describe('the forms are sent on the page as it started', () => {
    it('a filter the controls pass left on «Done» does not hide what the form made', async () => {
        const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
            //  As the desktop walk of auditBuiltApp calls it: presses kept, not isolated (app-audit probeOpts).
            const r = await probeControls(tab, { budgetMs: 150_000 });
            const m: any = r.metrics;
            //  The filters were pressed (the walk did reach them)…
            expect(r.controls.some(c => c.label === 'Done')).toBe(true);
            //  …and the event the form made was seen, and kept across the refresh.
            expect(m.formsPersistenceUnproven || 0).toBe(0);
            expect(m.formsPersisted || 0).toBeGreaterThanOrEqual(1);
        } finally {
            await browser.close();
            await new Promise<void>(r => server.close(() => r()));
        }
    });
});
