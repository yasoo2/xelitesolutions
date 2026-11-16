/**
 * ⛔ THE INSPECTION RUNS ON A REAL PAGE (design 2026-11-15 ui-inspection-revival-v3 §1, §3.2).
 *
 * `ui-inspection.ts` called `.catch` on Playwright's `page.url()` — a STRING —
 * and the throw was swallowed by app-audit, so contrast, structure, the three
 * widths and the viewport meta measured nothing in any real walk since at
 * least 2026-10-22. The one end-to-end test mocked `url` as async, which is
 * the only shape under which the line worked. This file drives a real
 * Chromium page, and both shapes of `url`.
 *
 * And what the revival needs beside it: Chrome's own error page is not the
 * app (R2), and the inspection is bounded by a deadline inside every step,
 * with the viewport put back whatever happened.
 */
import http from 'http';
import { chromium, type Browser } from 'playwright';
import { inspectUi } from '../core/quality/ui-inspection';
import { getChromiumLaunchOptions } from '../modules/browser/manager';
import { serveFixtures } from './fixtures/ui-told/checks';

jest.setTimeout(120_000);

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clinic</title><style>body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#1f2937;background:#fff}main{padding:24px}
.pale{color:#c7c7c7}button{min-width:120px;min-height:44px}</style></head><body><main>
<h1>Clinic bookings</h1><p>Choose a time that suits you.</p><p class="pale">Opening hours may change on holidays</p>
<button type="button">Book</button></main></body></html>`;

describe('the inspection on a real page', () => {
    let browser: Browser;
    let server: http.Server;
    let url = '';
    let fixtures: http.Server;
    let fixturesUrl = '';
    beforeAll(async () => {
        browser = await chromium.launch(getChromiumLaunchOptions());
        server = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGE); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
        fixtures = await serveFixtures();
        fixturesUrl = `http://127.0.0.1:${(fixtures.address() as any).port}`;
    });
    afterAll(async () => {
        await browser?.close();
        await new Promise<void>(r => server.close(() => r()));
        await new Promise<void>(r => fixtures.close(() => r()));
    });

    it('⛔ POSITIVE — Playwright\'s own page: three widths measured, colour checked, a true contrast line', async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        try {
            await page.goto(url, { waitUntil: 'load' });
            const r = await inspectUi(page, { restore: { width: 1280, height: 900 } });
            expect(r.status).toBe('complete');
            expect(r.metrics.viewports).toEqual(['1280x900', '820x1180', '390x844']);
            expect(r.metrics.contrastChecked).toBeGreaterThan(0);
            const pale = r.findings.find(f => f.code === 'low_contrast');
            //  #c7c7c7 on white is about 1.7:1 — painted, not guessed from the styles.
            expect(pale?.en).toMatch(/Opening hours may change/);
            expect((pale?.evidence as any[])[0]).toMatchObject({ url, text: 'Opening hours may change on holidays' });
            expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([1280, 900]);
        } finally { await page.close(); }
    });

    /**
     *  ⛔ FOUND ON THE REAL APPS (run500 P041, 2026-11-15): `html { scroll-behavior: smooth }` turns
     *  every `window.scrollTo` into an animation. The paint read the button's words mid-scroll and
     *  photographed the dark page where the gold button was going to be: «1.02:1» for #15120a on
     *  #e8b04b, which is about 10:1. Every scroll the inspector makes is instant now, and words that
     *  cannot be told from their background in the photograph are not judged.
     */
    it('⛔ NEGATIVE — a smooth-scrolling page: the button far down is read where it is, and a pale line far down is still found', async () => {
        const smooth = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Studio</title><style>html{scroll-behavior:smooth}body{margin:0;background:#0f0f12;color:#f3f3f3;font:16px/1.5 system-ui,sans-serif}
main{padding:24px}.gap{height:2600px}.btn{display:inline-block;padding:13px 26px;border-radius:999px;font-weight:700;background:#e8b04b;color:#15120a;text-decoration:none}
.dim{color:#3a3a40}</style></head><body><main><h1>Light studio</h1><div class="gap"></div>
<p><a class="btn" href="#book">Book your session now</a></p><div class="gap"></div><p class="dim">Prices exclude travel outside the city</p></main></body></html>`;
        const srv = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(smooth); });
        await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        try {
            await page.goto(`http://127.0.0.1:${(srv.address() as any).port}/`, { waitUntil: 'load' });
            //  the walk leaves the page scrolled somewhere, as app-audit does
            await page.evaluate(() => window.scrollTo({ top: 1800, behavior: 'instant' as any }));
            const r = await inspectUi(page, { restore: { width: 1280, height: 900 } });
            const lc = r.findings.find(f => f.code === 'low_contrast');
            const named = ((lc?.evidence as any[]) || []).map(e => e.text);
            expect(named).not.toContain('Book your session now');
            expect(named).toContain('Prices exclude travel outside the city');
        } finally {
            await page.close();
            await new Promise<void>(r => srv.close(() => r()));
        }
    });

    it('⛔ POSITIVE — the URL is a string whether page.url() returns one or a promise', async () => {
        for (const url of [jest.fn(() => 'https://example.test/a'), jest.fn(async () => 'https://example.test/a')]) {
            let viewport = { width: 1280, height: 900 };
            const page = {
                url,
                setViewportSize: jest.fn(async (size: { width: number; height: number }) => { viewport = size; }),
                waitForTimeout: jest.fn(async () => { }),
                evaluate: jest.fn(async (fn: Function) => {
                    if (fn.name === 'measureContrast') return { checked: 0, skipped: 0, samples: [] };
                    if (fn.name === 'measureA11y') return { focusables: 1, hasNav: true, issues: [{ code: 'no_main', severity: 'minor' }] };
                    if (fn.name === 'measureContentComposition') return { hasImageWorkflow: false };
                    if (fn.name === 'measureResponsive') return { actualVw: viewport.width, overflowX: false, wide: [], wideEvidence: [], tiny: 0, smallFonts: 0, clipped: 0, unreachable: [], hasViewportMeta: true };
                    return viewport;
                }),
            };
            const r = await inspectUi(page);
            expect(r.status).toBe('complete');
            expect((r.findings.find(f => f.code === 'a11y_no_main')?.evidence as any[])[0].url).toBe('https://example.test/a');
        }
    });

    it('⛔ NEGATIVE — Chrome\'s own error page is not the app: nothing is told about it', async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        try {
            //  a port nothing answers on: the browser shows chrome-error://chromewebdata/
            const dead = http.createServer();
            await new Promise<void>(r => dead.listen(0, '127.0.0.1', () => r()));
            const port = (dead.address() as any).port;
            await new Promise<void>(r => dead.close(() => r()));
            await page.goto(`http://127.0.0.1:${port}/`).catch(() => { /* refused, as intended */ });
            const r = await inspectUi(page, { restore: { width: 1280, height: 900 } });
            expect(r.findings).toEqual([]);
            expect(r.status).toBe('skipped: the browser shows its own error page');
        } finally { await page.close(); }
    });

    it('⛔ NEGATIVE — a 2 s deadline on a 3000-row page: partial, and the viewport is back', async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        try {
            await page.goto(`${fixturesUrl}/review2/en-heavy-admin-3000/`, { waitUntil: 'load' });
            const t0 = Date.now();
            const r = await inspectUi(page, { restore: { width: 1280, height: 900 }, deadline: Date.now() + 2000 });
            const took = Date.now() - t0;
            expect(r.status).toMatch(/^partial: /);
            //  the overrun is one step in flight, then the restore — never the whole walk
            expect(took).toBeLessThan(8000);
            await page.waitForTimeout(1000);
            expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([1280, 900]);
        } finally { await page.close(); }
    });
});
