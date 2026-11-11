/**
 * ⛔ A TAB WHOSE SECTION SHOWS WHEN IT IS PRESSED IS NOT A DEAD LINK.
 *
 * The ladder, 2026-11-09 (L155, a photo studio's admin): «#sessions»,
 * «#clients» and «#albums» each showed its own section and hid the others.
 * The probe read every hidden section without a press and refused the delivery:
 * «12 navigation link(s) point at a section that is missing or not visible».
 * Pinned on a real browser: a link whose section is in the page but hidden is
 * pressed once and credited when the section shows; a link to a section that
 * does not exist is still dead; and the page is put back as it loaded.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(150_000);

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>لوحة الاستوديو</title>
<style>body{font-family:sans-serif;margin:16px} nav a{display:inline-block;min-height:44px;min-width:96px;padding:10px} section{min-height:120px} .hidden{display:none}</style></head><body>
<h1>لوحة الاستوديو</h1>
<nav><a href="#summary">الملخص</a><a href="#sessions">الجلسات</a><a href="#clients">العملاء</a><a href="#gone">الأرشيف</a></nav>
<section id="summary"><h2>الملخص</h2></section>
<section id="sessions" class="hidden"><h2>الجلسات</h2></section>
<section id="clients" class="hidden"><h2>العملاء</h2></section>
<script>
  function show() {
    var id = (location.hash || '#summary').slice(1);
    document.querySelectorAll('section').forEach(function (s) { s.classList.toggle('hidden', s.id !== id); });
  }
  window.addEventListener('hashchange', show);
  show();
</script></body></html>`;

describe('a single page whose tabs show their own sections', () => {
    let server: http.Server;
    let url = '';
    beforeAll(async () => {
        server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

    it('credits the tabs whose sections show, still reports the link to nothing, and puts the page back', async () => {
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await page.goto(url, { waitUntil: 'load' });
            const probe = await probeControls(page, { fillForms: false, budgetMs: 30_000 });
            const anchors = probe.controls.filter(c => c.kind === 'anchor');
            expect(anchors.find(c => c.label === 'الجلسات')?.worked).toBe(true);
            expect(anchors.find(c => c.label === 'العملاء')?.worked).toBe(true);
            expect(anchors.find(c => c.label === 'الأرشيف')?.worked).toBe(false);
            expect(probe.metrics.deadAnchors).toBe(1);
            expect(await page.evaluate(() => !document.getElementById('summary')!.classList.contains('hidden'))).toBe(true);
        } finally {
            await browser.close();
        }
    });
});

/*
 * And a router that renders each page into one view on hashchange (the hard
 * sample, L352, a coffee shop's ERP: «#inventory», «#sales» … and no element of
 * that name): its links are pages, not missing sections. A link the router does
 * not answer changes nothing, and is still dead.
 */
const ROUTER = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Coffee ERP</title>
<style>body{font-family:sans-serif;margin:16px} nav a{display:inline-block;min-height:44px;min-width:96px;padding:10px}</style></head><body>
<h1>Coffee ERP</h1>
<nav><a href="#dashboard">Dashboard</a><a href="#inventory">Inventory</a><a href="#sales">Sales</a><a href="#archive">Archive</a></nav>
<main id="view"></main>
<script>
  var PAGES = { dashboard: '<h2>Dashboard</h2><p>Today: 42 orders</p>', inventory: '<h2>Inventory</h2><table><tr><th>Item</th></tr><tr><td>Beans</td></tr></table>', sales: '<h2>Sales</h2><p>No sales yet</p>' };
  function render() {
    var page = (location.hash || '#dashboard').slice(1);
    if (PAGES[page]) document.getElementById('view').innerHTML = PAGES[page];
  }
  window.addEventListener('hashchange', render);
  render();
</script></body></html>`;

describe('a hash router whose pages render into one view', () => {
    let server: http.Server;
    let url = '';
    beforeAll(async () => {
        server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(ROUTER); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

    it('credits the links the router answers, and still reports the one it ignores', async () => {
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await page.goto(url, { waitUntil: 'load' });
            const probe = await probeControls(page, { fillForms: false, budgetMs: 30_000 });
            const anchors = probe.controls.filter(c => c.kind === 'anchor');
            expect(anchors.find(c => c.label === 'Inventory')?.worked).toBe(true);
            expect(anchors.find(c => c.label === 'Sales')?.worked).toBe(true);
            expect(anchors.find(c => c.label === 'Archive')?.worked).toBe(false);
            expect(probe.metrics.deadAnchors).toBe(1);
        } finally {
            await browser.close();
        }
    });
});
