/**
 * ⛔ A DEAD BUTTON BESIDE AN ID THE PAGE HOLDS TWICE IS TOLD WHERE ITS HANDLER WENT.
 *
 * The ninth live check, 2026-11-11 (L160, a car rental dashboard in one document): each
 * screen drew its own «+ Add …» with id="addBtn" into its own section and wired it with
 * getElementById — which finds the first, the hidden Cars screen's. Opened at its address,
 * Customers worked; after Cars, «+ Add customer» did nothing for anybody. The walk was right
 * to call it dead; told only «Unresponsive controls», the builder changed the form's
 * validation twice. The finding now names the id the page holds twice.
 */
import http from 'http';
import { chromium } from 'playwright';
import { judgeBehaviour, probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rental admin</title>
<style>body{font-family:sans-serif;margin:16px} button,a{display:inline-block;min-height:44px;min-width:90px;margin:4px}</style></head><body>
<nav><a href="#cars">Cars</a> <a href="#customers">Customers</a></nav>
<section id="cars" hidden></section><section id="customers" hidden></section>
<p id="msg" role="status"></p>
<script>
  function render(view) {
    document.querySelectorAll('section').forEach(function (s) { s.hidden = s.id !== view; });
    var el = document.getElementById(view);
    el.innerHTML = '<h2>' + view + '</h2><button id="addBtn">+ Add ' + view.slice(0, -1) + '</button>';
    //  The bug: the FIRST #addBtn in the document — the hidden screen's, once another screen was drawn.
    document.getElementById('addBtn').addEventListener('click', function () { document.getElementById('msg').textContent = 'Adding a ' + view.slice(0, -1); });
  }
  function show() { render((location.hash || '#cars').slice(1)); }
  window.addEventListener('hashchange', show); show();
</script></body></html>`;

test('«+ Add customer» after Cars is dead, and the finding names the id the page holds twice', async () => {
    const server = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGE); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const base = `http://127.0.0.1:${(server.address() as any).port}/`;
        await tab.goto(`${base}#cars`, { waitUntil: 'load' });
        await probeControls(tab, { fillForms: false, budgetMs: 30_000 });
        //  The same document, the next screen — as a person goes from Cars to Customers.
        await tab.evaluate(() => { location.hash = '#customers'; });
        await tab.waitForTimeout(300);
        const probe = await probeControls(tab, { fillForms: false, budgetMs: 30_000 });
        expect(probe.metrics.duplicateIds).toEqual([{ id: 'addBtn', count: 2 }]);
        const verdict = judgeBehaviour(probe.controls, { ...probe.metrics });
        const dead = verdict.findings.filter(f => /dead_controls/.test(f.code));
        expect(dead.map(f => f.en).join(' ')).toMatch(/\+ Add customer/);
        expect(dead.map(f => f.en).join(' ')).toMatch(/id="addBtn" 2 times: code that finds an element by its id gets the first/);
        expect(dead.map(f => f.ar).join(' ')).toMatch(/المعرّف «addBtn» 2 مرات/);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});

test('with no id held twice, a dead button is told as before', () => {
    const controls = [{ label: 'Save', kind: 'button', worked: false, effect: '' }, { label: 'Open', kind: 'button', worked: true, effect: 'dom' }, { label: 'Next', kind: 'button', worked: true, effect: 'dom' }];
    const f = judgeBehaviour(controls as any, { duplicateIds: [] }).findings.find(x => /dead_controls/.test(x.code))!;
    expect(f.en).toBe('Unresponsive controls: "Save"');
});
