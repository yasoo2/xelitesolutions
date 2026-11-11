/**
 * ⛔ AN EDIT THAT LOADS ANOTHER ROW INTO THE SAME FORM IS NOT DEAD.
 *
 * The 500 exam, 2026-11-07, P076 (a warehouse dashboard in Arabic): the first
 * «تعديل» put the form in edit mode and was seen working; every later «تعديل»
 * loaded its own row into the same form — same heading, same scroll position,
 * only the fields' values changed — and the probe called five working buttons
 * «unresponsive». Joe refused his own delivery four times over 88 minutes.
 * The probe's fingerprint now reads what the visible fields hold.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>المستودع</title>
<style>button{min-width:90px;min-height:44px;margin:4px} input{min-height:40px;width:240px}</style></head><body>
<h1>الأصناف</h1>
<form id="f"><h3 id="mode">إضافة صنف</h3><input name="name" aria-label="الاسم"><input name="qty" type="number" aria-label="الكمية"></form>
<table><tbody id="rows"></tbody></table>
<script>
  var rows = [{ id: 1, name: 'حقيبة ظهر', qty: 120 }, { id: 2, name: 'قميص قطن', qty: 300 }, { id: 3, name: 'سماعة لاسلكية', qty: 45 }];
  var body = document.getElementById('rows');
  rows.forEach(function (r) {
    var tr = document.createElement('tr');
    var td = document.createElement('td'); td.textContent = r.name; tr.appendChild(td);
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'تعديل';
    b.onclick = function () {
      document.getElementById('mode').textContent = 'تعديل الصنف';
      document.querySelector('[name=name]').value = r.name;
      document.querySelector('[name=qty]').value = r.qty;
    };
    var t2 = document.createElement('td'); t2.appendChild(b); tr.appendChild(t2); body.appendChild(tr);
  });
</script></body></html>`;

describe('edit buttons that fill the same form', () => {
    let server: http.Server;
    let url = '';
    beforeAll(async () => {
        server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

    it('each «تعديل» is seen working, the later ones by the values they load', async () => {
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await page.goto(url, { waitUntil: 'load' });
            const probe = await probeControls(page, { fillForms: false, budgetMs: 60_000 });
            const edits = probe.controls.filter(c => c.label === 'تعديل');
            expect(edits).toHaveLength(3);
            expect(edits.map(c => c.worked)).toEqual([true, true, true]);
            expect(edits.slice(1).every(c => c.effect === 'fields')).toBe(true);
        } finally {
            await browser.close();
        }
    });
});
