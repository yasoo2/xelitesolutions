/**
 * ⛔ A NAV ITEM TO THE PAGE ALREADY OPEN IS NOT DEAD, AND A CONTROL THE WALK'S OWN «−» TOOK AWAY IS NOT UNREACHED.
 *
 * The fifth live check, 2026-11-10 (L162, an Arabic store), three refusals and seventeen minutes:
 *  - «المتجر» was a nav button doing setView('shop') on the shop: pressed on the shop it changed
 *    nothing, the second look pressed it after «أضف إلى السلة» (which leaves the shop the shop),
 *    and «Unresponsive controls: "المتجر"» refused it; Joe made it focus the search box, then a link.
 *  - At phone width the walk's «إنقاص» emptied a cart line kept in the browser; the line's «زيادة
 *    كمية» went with it, and «1 of 22 controls were gone» refused the store — a finding that says
 *    of itself «not pressed, so not judged».
 */
import http from 'http';
import { chromium } from 'playwright';
import { judgeBehaviour, namesCurrentPage, probeControls } from '../core/quality/behaviour-audit';
import { refuses } from '../core/engine/browser-mend';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

test('a nav item names the page it is on', () => {
    expect(namesCurrentPage('المتجر', 'متجر مكتب شكاوى البلدية متجر مكتب شكاوى البلدية')).toBe(true);
    expect(namesCurrentPage('Shop', 'AquaFlow Shop')).toBe(true);
    expect(namesCurrentPage('Cars', 'Rental admin')).toBe(false);
    expect(namesCurrentPage('Home', 'AquaFlow', 'http://127.0.0.1:4300/')).toBe(true);
    expect(namesCurrentPage('Home', 'AquaFlow', 'http://127.0.0.1:4300/#/cart')).toBe(false);
    expect(namesCurrentPage('', 'anything')).toBe(false);
});

test('a few controls the walk could not press are told; a walk that lost much of the page refuses', () => {
    const controls = Array.from({ length: 22 }, (_, i) => ({ label: `c${i}`, kind: 'button', worked: true, effect: 'dom' }));
    const few = judgeBehaviour([...controls.slice(1), { label: 'gone', kind: 'button', worked: false, effect: 'not found' }] as any, {}).findings.find(f => f.code === 'controls_not_reached')!;
    expect(refuses({ id: few.code, severity: few.severity === 'minor' ? 'low' : few.severity })).toBe(false);
    const many = judgeBehaviour([...controls.slice(8), ...Array.from({ length: 8 }, (_, i) => ({ label: `g${i}`, kind: 'button', worked: false, effect: 'not found' }))] as any, {}).findings.find(f => f.code === 'controls_not_reached')!;
    expect(many.severity).toBe('major');
});

function store(withCartView: boolean): string {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>متجر مكتب شكاوى البلدية</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;min-width:90px;margin:4px}</style></head><body>
<header><h1>متجر مكتب شكاوى البلدية</h1><nav><button class="link" id="shop">المتجر</button>${withCartView ? '<button class="link" id="cart">السلة</button>' : ''}</nav></header>
<main id="view"></main>
<script>
  var view = 'shop', lines = [];
  function draw() {
    var v = document.getElementById('view');
    if (view === 'shop') v.innerHTML = '<h2>المنتجات</h2><div><span>دليل تقديم الشكاوى</span> <button id="add">أضف إلى السلة</button></div>';
    else v.innerHTML = '<h2>سلتك</h2>';
    v.innerHTML += '<ul>' + lines.map(function (l, i) { return '<li>دليل × <span class="qty">' + l + '</span> <button data-i="' + i + '" class="dec">إنقاص</button> <button data-i="' + i + '" class="inc">زيادة كمية</button></li>'; }).join('') + '</ul>';
    var add = document.getElementById('add'); if (add) add.onclick = function () { lines.push(1); draw(); };
    document.querySelectorAll('.dec').forEach(function (b) { b.onclick = function () { var i = +b.dataset.i; lines[i]--; if (lines[i] <= 0) lines.splice(i, 1); draw(); }; });
    document.querySelectorAll('.inc').forEach(function (b) { b.onclick = function () { lines[+b.dataset.i]++; draw(); }; });
  }
  document.getElementById('shop').onclick = function () { view = 'shop'; draw(); };
  ${withCartView ? "document.getElementById('cart').onclick = function () { view = 'cart'; draw(); };" : ''}
  lines = [1];
  draw();
</script></body></html>`;
}

async function walk(html: string) {
    const server = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const probe = await probeControls(tab, { fillForms: false, budgetMs: 60_000 });
        return { probe, verdict: judgeBehaviour(probe.controls, { ...probe.metrics }) };
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}

test('«المتجر» on the shop is pressed again after «السلة» moved the view, and works', async () => {
    const { verdict } = await walk(store(true));
    const dead = verdict.findings.filter(f => f.code === 'some_dead_controls' || f.code === 'dead_controls');
    expect(dead.map(f => f.en).join(' ')).not.toMatch(/المتجر/);
});

test('…and with no other view to leave to, the nav item naming the page is the page\'s own link', async () => {
    const { probe, verdict } = await walk(store(false));
    expect(probe.controls.some((c: any) => c.label === 'المتجر' && c.effect === 'current')).toBe(true);
    expect(verdict.findings.filter(f => /dead_controls/.test(f.code)).map(f => f.en).join(' ')).not.toMatch(/المتجر/);
});

test('a line the walk\'s own «إنقاص» removed takes its «زيادة كمية» with it: consumed, not unreached', async () => {
    const { probe, verdict } = await walk(store(true));
    const unreached = probe.controls.filter((c: any) => c.effect === 'not found').map((c: any) => c.label);
    expect(unreached).not.toContain('زيادة كمية');
    expect(verdict.findings.map(f => f.code)).not.toContain('controls_not_reached');
});
