/**
 * ⛔ THE CHOICE ALREADY ON, AND A RESET WITH NOTHING TO RESET, ARE NOT DEAD.
 *
 * The ladder exam, 2026-11-09 (L150, a kanban board, and other Arabic pages):
 * «الكل», the All filter, carried class="active" and no aria-pressed; pressing
 * it changed nothing — correctly — and the board was refused «Unresponsive
 * controls: "الكل"». «مسح الحقول» on a form as it loads clears nothing, and
 * was reported the same way. Pinned on a real browser: the choice marked
 * current by its class is not pressed as a candidate for dead; the clear
 * button is pressed after its field is filled, and credited; a button wired
 * to nothing («المفضلة») is still reported.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(150_000);

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>لوحة المهام</title>
<style>body{font-family:sans-serif;margin:16px} button{min-width:96px;min-height:44px;margin:4px} li{height:40px}</style></head><body>
<h1>لوحة المهام</h1>
<button id="fav">المفضلة</button>
<div class="filters"></div>
<ul id="list"></ul>
<div class="toolbar" role="search">
  <input id="q" type="search" aria-label="ابحث في المهام">
  <button type="button" id="clear">إعادة الضبط</button>
</div>
<script>
  var tasks = [{ t: 'تصميم', s: 'open' }, { t: 'برمجة', s: 'done' }, { t: 'اختبار', s: 'open' }];
  var only = 'all';
  function render() {
    var q = document.getElementById('q').value.trim();
    var shown = tasks.filter(function (x) { return (only === 'all' || x.s === only) && (!q || x.t.indexOf(q) >= 0); });
    document.getElementById('list').innerHTML = shown.map(function (x) { return '<li>' + x.t + '</li>'; }).join('');
    var f = document.querySelector('.filters');
    f.innerHTML = '';
    [['all', 'الكل'], ['open', 'مفتوحة'], ['done', 'منجزة']].forEach(function (p) {
      var b = document.createElement('button');
      b.textContent = p[1];
      b.className = 'chip' + (p[0] === only ? ' active' : '');
      b.onclick = function () { only = p[0]; render(); };
      f.appendChild(b);
    });
  }
  document.getElementById('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') render(); });
  document.getElementById('clear').onclick = function () { document.getElementById('q').value = ''; only = 'all'; render(); };
  render();
</script></body></html>`;

describe('a board whose All filter is on by its class, with a clear button and one dead button', () => {
    let server: http.Server;
    let url = '';
    beforeAll(async () => {
        server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

    it('never calls the choice already on dead, credits the clear button, and still reports «المفضلة»', async () => {
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await page.goto(url, { waitUntil: 'load' });
            const probe = await probeControls(page, { fillForms: false, budgetMs: 45_000, isolateBaselineControls: true, baselineViewport: { width: 1280, height: 900 } });
            const quiet = probe.controls.filter(c => c.kind !== 'anchor' && !c.worked).map(c => c.label);
            const secondLook = ((probe.metrics as any).secondLook || []).map((s: any) => s.label);
            //  The choice already on is never pressed as a quiet candidate on the page as it loads.
            expect(quiet).not.toContain('الكل');
            expect(secondLook).not.toContain('الكل');
            expect(probe.controls.some(c => c.label === 'مفتوحة' && c.worked)).toBe(true);
            //  The reset is pressed after its box has something in it, and credited.
            expect(probe.controls.some(c => c.label === 'إعادة الضبط' && c.worked)).toBe(true);
            expect(quiet).toContain('المفضلة');
        } finally {
            await browser.close();
        }
    });
});
