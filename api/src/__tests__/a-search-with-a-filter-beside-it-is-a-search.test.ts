/**
 * ⛔ A SEARCH BOX WITH A FILTER BESIDE IT IS A SEARCH, NOT A DEAD FORM.
 *
 * The seventh live check, 2026-11-10 (L160, a car rental dashboard): the bookings'
 * «Search» form held a search box and an «All statuses» select. Sent with words that
 * matched what the list already showed, it rightly changed nothing — and was «filled
 * in completely and submitted, and nothing happened at all», a blocking refusal,
 * because only a box alone counted as a search. Ten refusals in thirty minutes.
 */
import http from 'http';
import { chromium } from 'playwright';
import { isSearchForm, judgeBehaviour, probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

test('a search box with what narrows it is a search form; a form that writes is not', () => {
    expect(isSearchForm([{ tag: 'input', type: 'search', name: 'q' }, { tag: 'select', type: 'select-one', name: 'status' }])).toBe(true);
    expect(isSearchForm([{ tag: 'input', type: 'search', name: 'q' }, { tag: 'input', type: 'date', name: 'from' }, { tag: 'input', type: 'checkbox', name: 'open' }])).toBe(true);
    expect(isSearchForm([{ tag: 'input', type: 'search', name: 'q' }])).toBe(true);
    //  A select alone searches nothing; a box beside a name and an email is a form that writes.
    expect(isSearchForm([{ tag: 'select', type: 'select-one', name: 'status' }])).toBe(false);
    expect(isSearchForm([{ tag: 'input', type: 'search', name: 'q' }, { tag: 'input', type: 'text', name: 'full name' }, { tag: 'input', type: 'email', name: 'email' }])).toBe(false);
    expect(isSearchForm([])).toBe(false);
    //  The second review, 2026-11-11: «Add booking» with a «Search customer…» box beside its dates writes.
    expect(isSearchForm([{ tag: 'input', type: 'search', name: 'customer Search customer' }, { tag: 'input', type: 'date', name: 'start' }, { tag: 'select', type: 'select-one', name: 'status' }], 'Add booking')).toBe(false);
    expect(isSearchForm([{ tag: 'input', type: 'search', name: 'q' }, { tag: 'select', type: 'select-one', name: 'status' }], 'Search')).toBe(true);
});

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bookings</title>
<style>body{font-family:sans-serif;margin:16px} button,input,select{min-height:44px;margin:4px}</style></head><body>
<h1>Bookings</h1>
<form id="search"><input type="search" name="q" placeholder="Search bookings…"><select name="status"><option value="">All statuses</option><option>pending</option><option>active</option></select><button>Search</button></form>
<p id="count">0 results</p><table><tbody id="rows"></tbody></table>
<script>
  var rows = [];
  document.getElementById('search').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = this.elements.q.value.trim().toLowerCase(), s = this.elements.status.value;
    var shown = rows.filter(function (r) { return (!q || r.name.toLowerCase().indexOf(q) >= 0) && (!s || r.status === s); });
    document.getElementById('rows').innerHTML = shown.map(function (r) { return '<tr><td>' + r.name + '</td></tr>'; }).join('');
    document.getElementById('count').textContent = shown.length + ' results';
  });
</script></body></html>`;

test('a search with a status filter, over a list it leaves as it was, is not «nothing happened»', async () => {
    const server = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGE); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const probe = await probeControls(tab, { fillForms: true, budgetMs: 60_000 });
        const verdict = judgeBehaviour(probe.controls, { ...probe.metrics });
        expect(verdict.findings.map(f => f.code)).not.toContain('form_dead_submit');
        expect(Number(probe.metrics.searchesUnchanged || 0)).toBeGreaterThan(0);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});
