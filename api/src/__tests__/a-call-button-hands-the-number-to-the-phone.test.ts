/**
 * ⛔ A CALL BUTTON HANDS THE NUMBER TO THE PHONE, AND THAT IS ITS EFFECT.
 *
 * The ladder exam through Joe's own page, 2026-11-07, L001 (a pharmacy's
 * welcome card): «Call us» opened `tel:` — exactly right — and changed not one
 * node of the page, because a browser with no dialler hands the number on and
 * stays where it is. The probe said «unresponsive», and the builder spent half
 * an hour rewriting a correct button. Chromium says what happened in its
 * console («Failed to launch 'tel:…'»); that line is the effect, and it is not
 * a console error of the app either.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls, HANDOFF_SCHEME } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(120_000);

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>صيدلية</title>
<style>button{min-width:120px;min-height:44px;margin:8px}</style></head><body>
<h1>صيدلية النهر</h1>
<button id="call" type="button">اتصل بنا</button>
<button id="mail" type="button">راسلنا</button>
<button id="dead" type="button">لا شيء</button>
<script>
  document.getElementById('call').onclick = function () { location.href = 'tel:+962791234567'; };
  document.getElementById('mail').onclick = function () { window.location.assign('mailto:info@pharmacy.example'); };
</script></body></html>`;

describe('buttons that hand the visitor to the phone or the mail app', () => {
    let server: http.Server;
    let url = '';
    beforeAll(async () => {
        server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

    it('«اتصل بنا» and «راسلنا» worked; a button wired to nothing is still dead', async () => {
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await page.goto(url, { waitUntil: 'load' });
            const probe = await probeControls(page, { fillForms: false, budgetMs: 40_000 });
            const by = (label: string) => probe.controls.find(c => c.label === label);
            expect(by('اتصل بنا')).toMatchObject({ worked: true, effect: 'handoff' });
            expect(by('راسلنا')).toMatchObject({ worked: true, effect: 'handoff' });
            expect(by('لا شيء')?.worked).toBe(false);
        } finally {
            await browser.close();
        }
    });

    it('a card whose one control is a call link is a card, not an empty page (L002)', async () => {
        const fs = require('fs'), os = require('os'), path = require('path');
        const { auditBuiltApp } = require('../core/quality/app-audit');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-card-'));
        try {
            fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عيادة بيطرية</title>
<style>a.call{display:inline-block;min-width:160px;min-height:48px;padding:12px}</style></head><body>
<h1>عيادة الرفق البيطرية</h1><p>نستقبلكم من السبت إلى الخميس، من التاسعة صباحاً حتى السابعة مساءً.</p>
<a class="call" href="tel:+966112345678">اتصل بنا الآن</a></body></html>`);
            const audit = await auditBuiltApp(dir, { timeoutMs: 60_000, request: 'اعمل صفحة ترحيب واحدة لعيادة بيطرية فيها الاسم وساعات العمل وزر اتصال' });
            expect(audit.skipped).toBeUndefined();
            expect(audit.findings.map((f: any) => f.id)).not.toContain('empty_page');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it('the line Chromium writes is recognised, and nothing else is', () => {
        expect(HANDOFF_SCHEME.test("Failed to launch 'tel:+962791234567' because the scheme does not have a registered handler.")).toBe(true);
        expect(HANDOFF_SCHEME.test("Failed to launch 'mailto:info@x.example' because the scheme does not have a registered handler.")).toBe(true);
        expect(HANDOFF_SCHEME.test('Failed to load resource: the server responded with a status of 404')).toBe(false);
        expect(HANDOFF_SCHEME.test("Failed to launch 'javascript:alert(1)'")).toBe(false);
    });
});
