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
import { judgeBehaviour, probeControls, probeForms } from '../core/quality/behaviour-audit';
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

//  The same clinic as first delivered: «احجز الموعد» disabled until a date and a slot are chosen (both outside the form).
/*
 * The third review, 2026-11-11: told only «declined», a submit a bug keeps disabled forever
 * passed unseen. What the page asks for outside its form is chosen as a person would — the
 * date beside it, the first slot it offers — and the booking is then sent and proven; a submit
 * no choice enables is told to the builder.
 */
function disabledUntilChosen(enabledBy: string): string {
    return page(true)
        .replace('<button type="submit">احجز الموعد</button>', '<button type="submit" id="go" disabled>احجز الموعد</button>')
        .replace("var date = '', time = '';", `var date = '', time = ''; function ready() { document.getElementById('go').disabled = !(${enabledBy}); }`)
        .replace("date = this.value; });", "date = this.value; ready(); });")
        .replace("time = b.textContent; });", "time = b.textContent; ready(); });")
        .replace("if (!date) { msg.textContent = 'اختر التاريخ أولاً.'; msg.className = 'msg err'; return; }",
            "if (!date) { msg.textContent = 'اختر التاريخ أولاً.'; msg.className = 'msg err'; return; } msg.textContent = 'تم الحجز: ' + date + ' ' + time; msg.className = 'msg ok';");
}

test('a submit kept disabled until its date and slot are chosen has them chosen, and the booking is sent', async () => {
    const html = disabledUntilChosen('date && time');
    expect(html).toContain('id="go" disabled');
    expect(html).toContain('تم الحجز');
    const result = await walk(html);
    expect(Number(result.metrics.formsDeadSubmit || 0)).toBe(0);
    expect(Number(result.metrics.formsDeclined || 0)).toBe(0);
    expect(Number(result.metrics.formsPrerequisitesChosen || 0)).toBeGreaterThanOrEqual(1);
    expect(result.forms.find(f => /احجز/.test(f.label))?.effect).toBe('submitted');
});

test('a submit no choice enables is declined, and told to the builder', async () => {
    const result = await walk(disabledUntilChosen('false'));
    expect(Number(result.metrics.formsDeadSubmit || 0)).toBe(0);
    expect(Number(result.metrics.formsDeclined || 0)).toBe(1);
    const told = judgeBehaviour([], { ...result.metrics }).findings.find(f => f.code === 'form_submit_disabled');
    expect(told?.severity).toBe('minor');
    expect(told?.ar).toContain('احجز');
});

test('a clock ticking in a status line beside a dead form is not its answer', async () => {
    const html = page(false).replace('<h1>احجز موعدك</h1>',
        '<h1>احجز موعدك</h1><div role="status" id="clock"></div><script>setInterval(function () { document.getElementById("clock").textContent = "الوقت الآن " + new Date().toISOString(); }, 120);</script>');
    expect(html).toContain('id="clock"');
    const result = await walk(html);
    expect(Number(result.metrics.formsAnsweredAgain || 0)).toBe(0);
    expect(Number(result.metrics.formsDeadSubmit || 0)).toBe(1);
});

test('a dead button beside a ticking clock is dead; the counter a button raises still answers it', async () => {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Desk</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;margin:4px}</style></head><body>
<h1>Front desk</h1><p>Local time: <span id="clock"></span></p>
<button id="dead">Export report</button><button id="up">Add visitor</button><p>Visitors: <b id="n">0</b></p>
<script>
  setInterval(function () { document.getElementById('clock').textContent = new Date().toISOString(); }, 120);
  document.getElementById('up').onclick = function () { var n = document.getElementById('n'); n.textContent = String(Number(n.textContent) + 1); };
</script></body></html>`;
    const server = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const probe = await probeControls(tab, { fillForms: false, budgetMs: 30_000 });
        const byLabel = (l: string) => probe.controls.find(c => c.label === l);
        expect(byLabel('Export report')?.effect || '').toBe('');
        expect(byLabel('Add visitor')?.effect || '').not.toBe('');
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});

/*
 * The fourth review, 2026-11-11: what the walk chose for a disabled submit was read as the submit's
 * own effect (a filled date is a changed field); a clock ticking once a second slipped past the
 * 400 ms watch; a refusal said again in the same words was logged as «told nothing»; and a reload
 * wiped every stamp of what changes by itself.
 */
test('a submit with no type that stays disabled is declined even after its date and slot were chosen', async () => {
    const html = disabledUntilChosen('false').replace('<button type="submit" id="go" disabled>', '<button id="go" disabled>');
    expect(html).toContain('<button id="go" disabled>');
    const result = await walk(html);
    expect(Number(result.metrics.formsDeclined || 0)).toBe(1);
    expect(result.forms.find(f => /احجز/.test(f.label))?.effect).toBe('declined');
});

test('a clock ticking once a second in a status line is no form\'s answer', async () => {
    const html = page(false).replace('<h1>احجز موعدك</h1>',
        '<h1>احجز موعدك</h1><div role="status" id="clock"></div><script>function tick() { document.getElementById("clock").textContent = "الوقت الآن " + new Date().toLocaleTimeString("en-GB"); } tick(); setInterval(tick, 1000);</script>');
    const result = await walk(html);
    expect(Number(result.metrics.formsAnsweredAgain || 0)).toBe(0);
    expect(Number(result.metrics.formsDeadSubmit || 0)).toBe(1);
});

test('a refusal the server says and the page writes again in the same words is no silent refusal', async () => {
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>حجز</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;margin:4px}</style></head><body>
<h1>احجز موعدك</h1>
<form id="f"><label>الاسم <input name="name" required></label><label>الهاتف <input name="phone" type="tel" required></label>
<button type="submit">احجز الموعد</button><div class="msg" role="status" id="msg"></div></form>
<script>
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('msg'); msg.textContent = '';
    fetch('/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.elements.name.value }) })
      .then(function (r) { return r.json(); }).then(function (j) { msg.textContent = j.error; msg.className = 'msg err'; });
  });
</script></body></html>`;
    const server = http.createServer((q, r) => {
        if (q.url === '/api/bookings' && q.method === 'POST') { q.resume(); r.writeHead(400, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ error: 'اختر التاريخ أولاً.' })); }
        r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const result = await probeForms(tab, { budgetMs: 60_000 });
        expect(result.forms.find(f => /احجز/.test(f.label))?.effect).toBe('refused');
        expect((result.metrics.fieldCaseFailures || []).filter((x: any) => x.outcome === 'refused_silently')).toEqual([]);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});

test('a clock is no button\'s answer after the start is restored either', async () => {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Desk</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;margin:4px}</style></head><body>
<h1>Front desk</h1><p>Local time: <span id="clock"></span></p>
<button>Export report</button><button>Print badges</button><button>Archive day</button>
<script>function tick() { document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-GB'); } tick(); setInterval(tick, 1000);</script>
</body></html>`;
    const server = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const probe = await probeControls(tab, { fillForms: false, budgetMs: 40_000, isolateBaselineControls: true });
        for (const label of ['Export report', 'Print badges', 'Archive day']) {
            expect(probe.controls.find(c => c.label === label)?.effect || '').toBe('');
        }
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});

test('a form that writes nothing at all is still dead', async () => {
    const result = await walk(page(false));
    expect(Number(result.metrics.formsDeadSubmit || 0)).toBe(1);
    const verdict = judgeBehaviour([], { ...result.metrics });
    expect(verdict.findings.map(f => f.code)).toContain('form_dead_submit');
});
