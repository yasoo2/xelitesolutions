/**
 * ⛔ A RESET IS PRESSED WHERE THERE IS SOMETHING TO RESET, AND A CONTROL UNDER
 * A STICKY HEADER IS SCROLLED INTO VIEW BEFORE IT IS CALLED UNREACHABLE.
 *
 * The 500-prompt exam, 2026-11-03, P204: a gym store was refused six times at
 * tablet width. «Shop» clears the category and the search; on the page as it
 * loads there is nothing to clear, so its one press changed nothing and it was
 * reported «Unresponsive». The exploration re-presses a header menu in other
 * states only when its budget reaches that far, and a plain button — the
 * «Clear filters» below — never. And after a category press left the page 120px
 * down, the reload meant to restore the baseline kept that scroll, the other
 * chips sat under the sticky header, and they were «gone before I could press
 * them». Measured on that app against its dev server: 97 and 97 before, 100,
 * 100 and 100 after.
 *
 * A button wired to nothing must still be reported: «Wishlist» below has no
 * handler, and it stays dead after the fair second press.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(120_000);

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Gym store</title>
<style>
  body{margin:0;font-family:sans-serif}
  header{position:sticky;top:0;height:64px;background:#111;z-index:10;display:flex;gap:12px;align-items:center;padding:0 16px}
  header button{min-width:96px;min-height:44px}
  .hero{height:40px}.hero h1{margin:0;font-size:24px}
  .chips button{min-width:120px;min-height:44px;margin:4px}
  li{height:80px}
</style></head><body>
<header><button id="wish">Wishlist</button></header>
<div class="hero"><h1>Iron Gym</h1></div>
<div class="chips" role="group" aria-label="Filter by category"></div>
<button id="clear">Clear filters</button><p id="count"></p><ul id="list"></ul>
<script>
  var items = [];
  ['Equipment', 'Apparel', 'Supplements'].forEach(function (c) { for (var i = 1; i <= 30; i++) items.push({ name: c + ' ' + i, cat: c }); });
  var cat = 'All';
  function render() {
    var shown = items.filter(function (p) { return cat === 'All' || p.cat === cat; });
    document.getElementById('count').textContent = 'Showing ' + shown.length + ' of ' + items.length;
    document.getElementById('list').innerHTML = shown.map(function (p) { return '<li>' + p.name + '</li>'; }).join('');
    var chips = document.querySelector('.chips');
    chips.innerHTML = '';
    ['All', 'Equipment', 'Apparel', 'Supplements'].forEach(function (c) {
      var b = document.createElement('button');
      b.textContent = c;
      b.setAttribute('aria-pressed', String(c === cat));
      // A category press takes the visitor to the results, under the header.
      b.onclick = function () { cat = c; render(); window.scrollTo(0, 120); };
      chips.appendChild(b);
    });
  }
  document.getElementById('clear').onclick = function () { cat = 'All'; render(); window.scrollTo(0, 0); };
  render();
</script></body></html>`;

describe('a store whose reset needs a changed page and whose chips sit under a sticky header', () => {
    let server: http.Server;
    let url = '';
    beforeAll(async () => {
        server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

    const probeAtTablet = async () => {
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
            await page.goto(url, { waitUntil: 'load' });
            return await probeControls(page, {
                fillForms: false, budgetMs: 40_000, isolateBaselineControls: true, baselineViewport: { width: 820, height: 1180 },
            });
        } finally {
            await browser.close();
        }
    };

    it('reaches every chip the restored page left under the sticky header', async () => {
        const probe = await probeAtTablet();
        const notFound = probe.controls.filter(c => c.kind !== 'anchor' && c.effect === 'not found').map(c => c.label);
        expect(notFound).toEqual([]);
        for (const label of ['Equipment', 'Apparel', 'Supplements']) {
            expect(probe.controls.some(c => c.label === label && c.worked)).toBe(true);
        }
    });

    it('credits the reset on a changed page, and still reports the button wired to nothing', async () => {
        const probe = await probeAtTablet();
        expect(probe.controls.some(c => c.label === 'Clear filters' && c.worked)).toBe(true);
        expect(probe.controls.some(c => c.label === 'Wishlist' && c.worked)).toBe(false);
        expect(probe.controls.some(c => c.label === 'Wishlist' && !c.worked && c.effect === '')).toBe(true);
    });
});
