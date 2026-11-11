/**
 * ⛔ EVERY WALK MEETS THE PRODUCT AS A FIRST VISITOR DOES (app-audit.ts meetAsFirstVisitor).
 *
 * The hard sample, 2026-11-10 (L452, an e-learning platform «بواجهة عربية
 * وإنجليزية»): the first walk pressed «English»; the product kept the choice in
 * localStorage and its sign-in in a cookie, and the borrowed panel page — alive
 * for the whole conversation — kept both. Every later walk landed on the English
 * interface already signed in: «rtl_missing: 7 of 7 Arabic text blocks are ltr»
 * (course names and the «العربية» switch inside an English page), «auth_failed:
 * the page shows no sign-in form». Four refusals in a row, and the run stopped.
 * Pinned on a real browser: the audited origin's storage and cookies are cleared
 * before the walk lands, another origin's storage is left alone, and the
 * product greets the walk in its own first language again.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { chromium } from 'playwright';
import { meetAsFirstVisitor } from '../core/quality/app-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(120_000);

const PRODUCT = `<!doctype html><html><head><meta charset="utf-8"><title>منصة التعلم</title></head><body>
<h1 id="title"></h1><p id="who"></p><button id="lang"></button>
<script>
  var en = localStorage.getItem('lang') === 'en';
  document.documentElement.lang = en ? 'en' : 'ar';
  document.documentElement.dir = en ? 'ltr' : 'rtl';
  document.getElementById('title').textContent = en ? 'Courses' : 'الدورات';
  document.getElementById('who').textContent = /session=teacher/.test(document.cookie) ? 'signed-in' : 'visitor';
  var b = document.getElementById('lang');
  b.textContent = en ? 'العربية' : 'English';
  b.onclick = function () { localStorage.setItem('lang', en ? 'ar' : 'en'); sessionStorage.setItem('seen', '1'); document.cookie = 'session=teacher; path=/'; location.reload(); };
</script></body></html>`;

const OTHER = `<!doctype html><html><head><meta charset="utf-8"><title>other</title></head><body>other</body></html>`;

function serve(html: string): Promise<{ server: http.Server; url: string }> {
    return new Promise(resolve => {
        const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
        server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as any).port}/` }));
    });
}

describe('a walk on a page that outlives it', () => {
    let product: { server: http.Server; url: string };
    let other: { server: http.Server; url: string };
    beforeAll(async () => { product = await serve(PRODUCT); other = await serve(OTHER); });
    afterAll(async () => {
        await new Promise<void>(r => product.server.close(() => r()));
        await new Promise<void>(r => other.server.close(() => r()));
    });

    it('lands as a first visitor: the product\'s own language, signed out, and nothing else touched', async () => {
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage();
            //  Another site this browser keeps something for.
            await page.goto(other.url);
            await page.evaluate(() => localStorage.setItem('keep', 'yes'));
            //  The walk before this one pressed «English»: the product kept it, and a sign-in.
            await page.goto(product.url);
            await page.click('#lang');
            await page.waitForLoadState('load');
            expect(await page.textContent('#title')).toBe('Courses');
            expect(await page.textContent('#who')).toBe('signed-in');

            const how = await meetAsFirstVisitor(page, product.url, () => page.goto(product.url));
            expect(how).toBe('origin');
            await page.goto(product.url);
            expect(await page.textContent('#title')).toBe('الدورات');
            expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
            expect(await page.textContent('#who')).toBe('visitor');
            expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);

            await page.goto(other.url);
            expect(await page.evaluate(() => localStorage.getItem('keep'))).toBe('yes');
        } finally {
            await browser.close();
        }
    });

    it('the audit clears a borrowed page before it lands, and only a borrowed one', () => {
        const audit = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'app-audit.ts'), 'utf8');
        const clear = audit.indexOf('await meetAsFirstVisitor(page, url, () => openAuditTarget(url));');
        const land = audit.indexOf('const landing = await openAuditTarget(url);');
        expect(clear).toBeGreaterThan(0);
        expect(land).toBeGreaterThan(clear);
        expect(audit.slice(audit.lastIndexOf('if (borrowed) {', clear), clear)).toMatch(/^if \(borrowed\) \{\s*$/);
    });
});
