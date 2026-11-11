/**
 * ⛔ A FORM THAT ANSWERS AGAIN IN THE SAME WORDS HAS ANSWERED.
 *
 * The eleventh live check, 2026-11-11 (L171, a dental clinic's booking): the date and the
 * time slot are picked outside the form; «احجز الموعد» sent without them answers «اختر
 * التاريخ أولاً.» in its role="status" line. The QA's earlier cases had drawn the very same
 * words, so before and after the last submit the page looked the same — «filled in
 * completely and submitted, and nothing happened at all», a blocking refusal of a form that
 * told its visitor what was missing. The walk now watches what a submit writes.
 */
import http from 'http';
import { chromium } from 'playwright';
import { judgeBehaviour, probeForms } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

function page(answers: boolean): string {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عيادة الابتسامة</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;margin:4px}</style></head><body>
<h1>احجز موعدك</h1>
<label>التاريخ <input type="date" id="date"></label>
<div id="slots"><button type="button" class="slot">09:00</button><button type="button" class="slot">09:30</button></div>
<form id="booking-form">
  <label>الاسم <input id="name" name="name" required></label>
  <label>الهاتف <input id="phone" name="phone" type="tel" required></label>
  <button type="submit">احجز الموعد</button>
  <div class="msg" id="msg" role="status"></div>
</form>
<script>
  var date = '', time = '';
  document.getElementById('date').addEventListener('change', function () { date = this.value; });
  document.querySelectorAll('.slot').forEach(function (b) { b.addEventListener('click', function () { time = b.textContent; }); });
  document.getElementById('booking-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('msg');
    ${answers ? "if (!date) { msg.textContent = 'اختر التاريخ أولاً.'; msg.className = 'msg err'; return; }" : 'return;'}
  });
</script></body></html>`;
}

async function walk(html: string) {
    const server = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        return await probeForms(tab, { budgetMs: 60_000 });
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}

test('«احجز الموعد» answering «اختر التاريخ أولاً.» again, in the same words, is a refusal the visitor reads — not a dead form', async () => {
    const result = await walk(page(true));
    expect(Number(result.metrics.formsDeadSubmit || 0)).toBe(0);
    expect(result.forms.find(f => /احجز/.test(f.label))?.effect).toBe('refused');
});

test('a form that writes nothing at all is still dead', async () => {
    const result = await walk(page(false));
    expect(Number(result.metrics.formsDeadSubmit || 0)).toBe(1);
    const verdict = judgeBehaviour([], { ...result.metrics });
    expect(verdict.findings.map(f => f.code)).toContain('form_dead_submit');
});
