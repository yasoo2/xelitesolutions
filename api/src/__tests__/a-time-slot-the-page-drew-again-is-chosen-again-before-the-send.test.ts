/**
 * A TIME SLOT THE PAGE DREW AGAIN IS CHOSEN AGAIN BEFORE THE SEND.
 *
 * run500 on Claude, P298 (a booking page, 2026-11-13), replayed on a copy of
 * the saved project 2026-11-15: the slots are radios the page draws again
 * each time the date changes, and drawing them clears the choice. The QA
 * checked a slot, then set the date: the slots were drawn again, nothing was
 * chosen, the page said «اختر الوقت» and sent nothing — no POST reached the
 * server — and the delivery was refused with «what احجز الموعد made showed,
 * and after a refresh it was found nowhere». A tester looks at the form
 * before he presses the button: a group with nothing chosen is chosen again.
 * And twelve slots are one question, not twelve fields: taken one by one they
 * filled the form's fourteen before its phone, and it was sent without one.
 *
 * `posts` counts the booking sent: a POST the keeping app's server takes, or
 * the read the memory-only app makes as it shows the booking.
 */
import http from 'http';
import { chromium } from 'playwright';
import { judgeBehaviour, probeForms } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

/** P298's shape: date → slots fetched and drawn as radios; name, phone; the booking shown again after a reload. */
function page(keeps: boolean): string {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>حجز موعد</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;margin:4px} .slot{display:inline-block;margin:4px}</style></head><body>
<h1>حجز موعد</h1>
<p id="mine" role="status"></p>
<form id="book" novalidate>
  <label>التاريخ <input type="date" id="date" name="date"></label>
  <fieldset><legend>الوقت</legend><div id="slots"></div><p id="err-time"></p></fieldset>
  <label>الاسم <input id="name" name="name" required></label>
  <label>الهاتف <input id="phone" name="phone" type="tel" required></label>
  <button type="submit">احجز الموعد</button>
</form>
<script>
  var selected = '';
  var dateInput = document.getElementById('date');
  function today() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function draw(data) {
    var box = document.getElementById('slots'); box.textContent = ''; selected = '';
    data.slots.forEach(function (t) {
      var l = document.createElement('label'); l.className = 'slot';
      var i = document.createElement('input'); i.type = 'radio'; i.name = 'time'; i.value = t; i.disabled = data.booked.indexOf(t) !== -1;
      i.addEventListener('change', function () { selected = t; document.getElementById('err-time').textContent = ''; });
      var s = document.createElement('span'); s.textContent = t;
      l.appendChild(i); l.appendChild(s); box.appendChild(l);
    });
  }
  function load() { fetch('/api/availability?date=' + encodeURIComponent(dateInput.value)).then(function (r) { return r.json(); }).then(draw); }
  dateInput.addEventListener('change', load);
  var last = null; try { last = JSON.parse(localStorage.getItem('last')); } catch (e) { }
  if (last && last.id) fetch('/api/bookings/' + last.id).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j) document.getElementById('mine').textContent = 'حجزك: ' + j.date + ' ' + j.time + ' باسم ' + j.name;
  });
  dateInput.value = today(); load();
  document.getElementById('book').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = this.name.value.trim(), phone = this.phone.value.trim();
    if (!selected) { document.getElementById('err-time').textContent = 'اختر الوقت'; return; }
    if (!name || !phone) return;
    ${keeps ? `    fetch('/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name, phone: phone, date: dateInput.value, time: selected }) })
      .then(function (r) { return r.json(); }).then(function (b) {
        try { localStorage.setItem('last', JSON.stringify(b)); } catch (e) { }
        document.getElementById('mine').textContent = 'تم الحجز. حجزك: ' + b.date + ' ' + b.time + ' باسم ' + b.name;
        document.getElementById('book').reset(); dateInput.value = b.date; load();
      });
` : `    fetch('/api/sent?time=' + encodeURIComponent(selected));
    document.getElementById('mine').textContent = 'تم الحجز. حجزك: ' + dateInput.value + ' ' + selected + ' باسم ' + name;
    document.getElementById('book').reset(); load();
`}  });
</script></body></html>`;
}

/** Twelve slots, as P298 had: each taken as a field filled the form's fourteen before its phone. */
const SLOTS = Array.from({ length: 12 }, (_, i) => `${String(9 + i).padStart(2, '0')}:00`);

async function walk(keeps: boolean) {
    const bookings: any[] = [];
    let posts = 0;
    const html = page(keeps);
    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://x');
        const json = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (url.pathname === '/api/availability') { json(200, { slots: SLOTS, booked: bookings.filter(b => b.date === url.searchParams.get('date')).map(b => b.time) }); return; }
        if (url.pathname === '/api/bookings' && req.method === 'POST') {
            let body = '';
            req.on('data', c => { body += c; });
            req.on('end', () => {
                posts++;
                const b = { id: 'b' + (posts + 100), ...JSON.parse(body || '{}') };
                if (keeps) bookings.push(b);
                json(201, b);
            });
            return;
        }
        //  The page that keeps nothing tells the test it sent the booking, with a read that is no write.
        if (url.pathname === '/api/sent') { posts++; json(200, {}); return; }
        const one = url.pathname.match(/^\/api\/bookings\/(\w+)$/);
        if (one) { const b = bookings.find(x => x.id === one[1]); if (b) json(200, b); else json(404, { error: 'not found' }); return; }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'networkidle' });
        const result = await probeForms(tab, { budgetMs: 120_000 });
        return { result, posts, codes: judgeBehaviour([], result.metrics as any, [], result.forms as any).findings.map(f => f.code) };
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}

test('a slot cleared when the page drew the slots again is chosen again: the booking is sent, and proven kept', async () => {
    const { result, posts, codes } = await walk(true);
    expect(posts).toBeGreaterThanOrEqual(1);
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
    expect(codes).not.toContain('form_persistence_unproven');
});

test('a booking page that keeps the booking only in its memory is still told: the booking is gone after a refresh', async () => {
    const { posts, codes } = await walk(false);
    expect(posts).toBeGreaterThanOrEqual(1);
    expect(codes).toContain('form_persistence_unproven');
});
