/**
 * ⛔ A RECORD IS CALLED LOST ONLY WHEN NOTHING OF IT WAS KEPT; WHAT THE QA COULD NOT LOOK FOR IS «NOT MEASURED».
 *
 * The 500-prompt exam on claude-haiku, 2026-11-12/13: eight sound apps (P041, P096, P179, P189,
 * P197, P280, P290, P499) were refused `form_persistence_unproven` for records they kept, and two
 * more (P094, P195) for forms the QA could not reach. Each builder proved the record in his own
 * browser after a reload, then spent his remaining rounds pleasing the checker. The mechanisms,
 * each pinned here with its sound app passing AND a broken twin still refused:
 *
 *   - the record's mark read from a card holding the role="status" line, with its full stop (P280);
 *   - a signed-in API asked after the reload without the page's Bearer token (P179, P189, P197);
 *   - «إرسال الطلب» of a contact form read as a record to find again (P041);
 *   - a booking that changes an existing row and adds none (P499);
 *   - «اختر موعدًا من القائمة» not read as the form saying no (P290);
 *   - an error already drawn before the press, so nothing NEW answered: «dead» (P230, P236…).
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeForms, judgeBehaviour, expectsPersistentRecord, isVisibleFormRefusal, semanticTypeForField, serverListsWithout } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => boolean;

async function walk(page: string, api: Handler = () => false, prepare?: (tab: any) => Promise<void>) {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (api(req, body, res)) return;
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(page);
        });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'networkidle' });
        if (prepare) await prepare(tab);
        const result = await probeForms(tab, { budgetMs: 60_000 });
        const findings = judgeBehaviour([], result.metrics as any, [], result.forms as any).findings;
        return { result, findings, codes: findings.map(f => f.code) };
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}

const json = (res: http.ServerResponse, value: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
    return true;
};

/* ---- P280: the confirmation inside the card is not the record's mark ---------------------- */

function bookingCard(kept: boolean): string {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>حجز موعد</title>
<style>body{font-family:sans-serif;margin:16px} input,button{display:block;min-height:40px;margin:6px 0;width:280px}</style></head><body>
<h1>حجز موعد مع المصمم</h1>
<section class="card">
  <h2>احجز موعدك</h2>
  <form id="f"><label>الاسم <input name="name" required></label><label>رقم الهاتف <input name="phone" type="tel" required></label><button type="submit">احجز الموعد</button></form>
  <p id="message" role="status"></p>
</section>
<script>
  var KEPT = ${kept};
  var msg = document.getElementById('message');
  try { var last = JSON.parse(localStorage.getItem('lastBooking') || 'null'); if (last) msg.textContent = 'حجزك المسجّل باسم ' + last.name; } catch (e) {}
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = this.elements.name.value.trim(), phone = this.elements.phone.value.trim();
    var done = function () { msg.textContent = 'تم حجز موعدك يا ' + name + '.'; document.getElementById('f').reset(); };
    if (!KEPT) return done();
    fetch('/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name, phone: phone }) })
      .then(function (r) { if (r.ok) { localStorage.setItem('lastBooking', JSON.stringify({ name: name })); done(); } });
  });
</script></body></html>`;
}

test('a booking whose only sign is the status line, kept on the server and in the browser, is not called lost (P280)', async () => {
    const bookings: any[] = [];
    const { result, codes } = await walk(bookingCard(true), (req, body, res) => {
        if (req.method === 'POST' && req.url === '/api/bookings') { bookings.push(JSON.parse(body || '{}')); return json(res, { ok: true }, 201); }
        return false;
    });
    expect(bookings.length).toBeGreaterThan(0);
    expect(Number(result.metrics.formsPersistenceUnproven || 0)).toBe(0);
    expect(codes).not.toContain('form_persistence_unproven');
    //  Found again where it was kept, by what was typed: never by the confirmation's full stop.
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
});

test('…and the same page keeping its booking nowhere is still refused', async () => {
    const { codes, findings } = await walk(bookingCard(false));
    expect(codes).toContain('form_persistence_unproven');
    expect(findings.find(f => f.code === 'form_persistence_unproven')!.en).toMatch(/nothing of it was written to any server or kept in the browser/);
});

/* ---- P179 / P189 / P197: a signed-in API is asked with the page's own token ----------------- */

function notesBehindToken(serverSaves: boolean): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Team notes</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;margin:4px}</style></head><body>
<h1>Team notes</h1>
<div role="tablist"><button role="tab" id="t-home">Overview</button><button role="tab" id="t-notes">Notes</button></div>
<div id="view"></div>
<script>
  if (!localStorage.getItem('token')) localStorage.setItem('token', 'tok-7f3a');
  var auth = { authorization: 'Bearer ' + localStorage.getItem('token') };
  var view = document.getElementById('view');
  var mine = [];
  function api(path, opts) { opts = opts || {}; opts.headers = Object.assign({ 'content-type': 'application/json' }, auth, opts.headers || {}); return fetch(path, opts); }
  function home() { api('/api/summary').then(function (r) { return r.json(); }).then(function (s) { view.innerHTML = '<h2>Overview</h2><p>' + s.count + ' notes</p>'; }); }
  function notes() {
    api('/api/notes').then(function (r) { return r.json(); }).then(function (list) {
      view.innerHTML = '<h2>Notes</h2><form id="f"><input name="title" required placeholder="Title"><button>Add note</button></form><ul>'
        + list.concat(mine).map(function (n) { return '<li>' + n.title + '</li>'; }).join('') + '</ul>';
      document.getElementById('f').addEventListener('submit', function (e) {
        e.preventDefault();
        var title = this.elements.title.value;
        api('/api/notes', { method: 'POST', body: JSON.stringify({ title: title }) }).then(function (r) {
          ${serverSaves ? '' : 'mine.push({ title: title });'}
          notes();
        });
      });
    });
  }
  document.getElementById('t-home').onclick = home;
  document.getElementById('t-notes').onclick = notes;
  home();
</script></body></html>`;
}

function tokenApi(notes: any[], saves: boolean): Handler {
    return (req, body, res) => {
        if (!String(req.url).startsWith('/api/')) return false;
        if (req.headers.authorization !== 'Bearer tok-7f3a') return json(res, { error: 'sign in' }, 401);
        if (req.method === 'GET' && req.url === '/api/summary') return json(res, { count: notes.length });
        if (req.method === 'GET' && req.url === '/api/notes') return json(res, notes);
        if (req.method === 'POST' && req.url === '/api/notes') {
            if (!saves) return json(res, { error: 'database is read-only' }, 500);
            notes.push({ title: String(JSON.parse(body || '{}').title || '') });
            return json(res, { ok: true }, 201);
        }
        return json(res, { error: 'no such route' }, 404);
    };
}

test('a note kept behind a Bearer token is found by asking its collection as the page asks (P197)', async () => {
    const notes = [{ title: 'Kick-off agenda' }];
    const { result, codes } = await walk(notesBehindToken(true), tokenApi(notes, true), async tab => {
        await tab.click('#t-notes');
        await tab.waitForSelector('#f');
    });
    expect(notes.length).toBeGreaterThan(1);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
});

test('…and a note the server refused with a 500, drawn by the page anyway, is still refused', async () => {
    const notes = [{ title: 'Kick-off agenda' }];
    const { codes } = await walk(notesBehindToken(false), tokenApi(notes, false), async tab => {
        await tab.click('#t-notes');
        await tab.waitForSelector('#f');
    });
    expect(notes.length).toBe(1);
    expect(codes).toContain('form_persistence_unproven');
});

/* ---- a 201 that keeps nothing: the server's own list, asked again, lacks the record ---------- */

const NOTES_LIST = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;margin:4px}</style></head><body>
<h1>Notes</h1>
<form id="f"><input name="title" required placeholder="Title"><button>Add note</button></form>
<ul id="list"></ul>
<script>
  var shown = [];
  function draw() { document.getElementById('list').innerHTML = shown.map(function (n) { return '<li>' + (n.title || n.slot) + '</li>'; }).join(''); }
  fetch('/api/notes').then(function (r) { return r.json(); }).then(function (list) { shown = list; draw(); });
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = this.elements.title.value, form = this;
    fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title }) })
      .then(function (r) { if (r.ok) { shown.push({ title: title }); draw(); form.reset(); } });
  });
</script></body></html>`;

function notesApi(notes: any[], mode: 'keeps' | 'drops' | 'hides'): Handler {
    return (req, body, res) => {
        if (req.url !== '/api/notes') return false;
        if (req.method === 'POST') {
            if (mode !== 'drops') notes.push({ title: String(JSON.parse(body || '{}').title || ''), slot: `slot-${notes.length + 1}` });
            return json(res, { ok: true }, 201);
        }
        //  «hides»: the list shows each record's slot, never the field the QA typed into.
        return json(res, mode === 'hides' ? notes.map(n => ({ slot: n.slot })) : notes);
    };
}

test('a server that answers 201 and keeps nothing is refused: its own list, asked again, holds others and not this one', async () => {
    const notes = [{ title: 'Kick-off agenda', slot: 'slot-1' }];
    const { codes, findings } = await walk(NOTES_LIST, notesApi(notes, 'drops'));
    expect(notes.length).toBe(1);
    expect(codes).toContain('form_persistence_unproven');
    expect(findings.find(f => f.code === 'form_persistence_unproven')!.en).toMatch(/returned other records under the same field and not this one/);
});

test('…the same server keeping it is proven kept', async () => {
    const notes = [{ title: 'Kick-off agenda', slot: 'slot-1' }];
    const { codes, result } = await walk(NOTES_LIST, notesApi(notes, 'keeps'));
    expect(notes.length).toBeGreaterThan(1);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
});

test('…and a list that never shows the typed field proves nothing: told as not measured, never refused', async () => {
    const notes = [{ title: 'Kick-off agenda', slot: 'slot-1' }];
    const { codes } = await walk(NOTES_LIST, notesApi(notes, 'hides'));
    expect(notes.length).toBeGreaterThan(1);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(codes).toContain('form_persistence_unmeasured');
});

test('the server\'s list is read as lacking the record only under the field the mark was sent in, and only when short', () => {
    const posts = [{ at: 'http://x/api/notes', body: JSON.stringify({ title: 'Joe QA m1-abc', slot: 'a' }) }];
    expect(serverListsWithout(posts, [JSON.stringify([{ title: 'Kick-off' }])], 'm1-abc')).toBe(true);
    expect(serverListsWithout(posts, [JSON.stringify({ notes: [{ title: 'Kick-off' }, { title: 'Joe QA m1-abc' }] })], 'm1-abc')).toBe(false);
    expect(serverListsWithout(posts, [JSON.stringify([{ slot: 'a' }])], 'm1-abc')).toBe(false);
    expect(serverListsWithout(posts, [JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ title: `n${i}` })))], 'm1-abc')).toBe(false);
    expect(serverListsWithout(posts, ['<!doctype html><p>Kick-off</p>'], 'm1-abc')).toBe(false);
    expect(serverListsWithout([{ at: 'http://x/f', body: 'name=Joe+QA+m1-abc&phone=1' }], [JSON.stringify([{ name: 'Ana' }])], 'm1-abc')).toBe(true);
    expect(serverListsWithout([{ at: 'http://x/f', body: '{}' }], [JSON.stringify([{ name: 'Ana' }])], 'm1-abc')).toBe(false);
});

/* ---- P041: a contact form sends a message; it makes no record to find again ----------------- */

const CONTACT = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>استوديو التصميم</title>
<style>body{font-family:sans-serif;margin:16px} input,textarea,button{display:block;min-height:40px;margin:6px 0;width:280px}</style></head><body>
<h1>استوديو التصميم</h1>
<form class="card contact-form" id="contactForm" novalidate>
  <label>الاسم الكامل <input name="name" required></label>
  <label>البريد الإلكتروني <input name="email" type="email" required></label>
  <label>تفاصيل طلبك <textarea name="details" required></textarea></label>
  <button type="submit">إرسال الطلب</button>
</form>
<p id="thanks" role="status"></p>
<script>
  document.getElementById('contactForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = this;
    if (!f.elements.name.value.trim() || !f.elements.email.value.includes('@') || !f.elements.details.value.trim()) { document.getElementById('thanks').textContent = 'يرجى تعبئة كل الحقول'; return; }
    fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: f.elements.name.value }) })
      .then(function (r) { if (r.ok) { document.getElementById('thanks').textContent = 'شكراً، وصلنا طلبك وسنتواصل معك قريباً'; f.reset(); } });
  });
</script></body></html>`;

test('«إرسال الطلب» of a contact form is proven by its answer and the server\'s, never looked for as a record (P041)', async () => {
    const messages: any[] = [];
    const { result, codes } = await walk(CONTACT, (req, body, res) => {
        if (req.method === 'POST' && req.url === '/api/messages') { messages.push(body); return json(res, { ok: true }, 201); }
        return false;
    });
    expect(messages.length).toBeGreaterThan(0);
    expect(result.forms.some(f => f.effect === 'submitted')).toBe(true);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(codes).not.toContain('form_dead_submit');
});

test('the words: a message sent is not a record; an order, a booking or a new item is', () => {
    expect(expectsPersistentRecord('إرسال الطلب')).toBe(false);
    expect(expectsPersistentRecord('Send message')).toBe(false);
    expect(expectsPersistentRecord('Submit request contact-form')).toBe(false);
    expect(expectsPersistentRecord('Sign in')).toBe(false);
    expect(expectsPersistentRecord('تأكيد الطلب')).toBe(true);
    expect(expectsPersistentRecord('طلب جديد')).toBe(true);
    expect(expectsPersistentRecord('Place order')).toBe(true);
    expect(expectsPersistentRecord('احجز الموعد')).toBe(true);
    expect(expectsPersistentRecord('Add note')).toBe(true);
    //  A word that makes a record wins over a word of sending: «send the booking» books.
    expect(expectsPersistentRecord('إرسال الحجز')).toBe(true);
});

/* ---- P499: a booking that changes an existing row, with nothing typed ----------------------- */

function proposals(kept: boolean): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Proposals</title>
<style>body{font-family:sans-serif;margin:16px} select,button{min-height:44px;margin:4px}</style></head><body>
<h1>Proposals</h1>
<ul id="list"></ul>
<form id="book"><label>Proposal <select name="id" required></select></label><button type="submit">Book proposal</button></form>
<script>
  var KEPT = ${kept};
  var local = [{ id: 'p1', title: 'Logo refresh', by: '' }, { id: 'p2', title: 'Brand guide', by: '' }];
  function load() { return KEPT ? fetch('/api/proposals').then(function (r) { return r.json(); }) : Promise.resolve(local); }
  function draw(list) {
    document.getElementById('list').innerHTML = list.map(function (p) { return '<li data-id="' + p.id + '">' + p.title + ' — ' + (p.by ? 'booked by you' : 'open') + '</li>'; }).join('');
    var sel = document.querySelector('select[name=id]');
    sel.innerHTML = list.filter(function (p) { return !p.by; }).map(function (p) { return '<option value="' + p.id + '">' + p.title + '</option>'; }).join('');
  }
  document.getElementById('book').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = this.elements.id.value;
    if (!KEPT) { local.forEach(function (p) { if (p.id === id) p.by = 'me'; }); draw(local); return; }
    fetch('/api/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id }) }).then(function () { load().then(draw); });
  });
  load().then(draw);
</script></body></html>`;
}

test('a booking that changes a row and types nothing, taken by the server, is told — never refused (P499)', async () => {
    const list = [{ id: 'p1', title: 'Logo refresh', by: '' }, { id: 'p2', title: 'Brand guide', by: '' }];
    const { codes, result } = await walk(proposals(true), (req, body, res) => {
        if (req.method === 'GET' && req.url === '/api/proposals') return json(res, list);
        if (req.method === 'POST' && req.url === '/api/book') { const id = JSON.parse(body || '{}').id; list.forEach(p => { if (p.id === id) p.by = 'me'; }); return json(res, { ok: true }); }
        return false;
    });
    expect(list.some(p => p.by)).toBe(true);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(Number(result.metrics.formsPersistenceUnproven || 0)).toBe(0);
});

test('…and the same booking held only in the page\'s memory is still refused', async () => {
    const { codes } = await walk(proposals(false));
    expect(codes).toContain('form_persistence_unproven');
});

/* ---- P290: «اختر موعدًا من القائمة» is the form saying no ----------------------------------- */

const SLOTS = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>حجز</title>
<style>body{font-family:sans-serif;margin:16px} input,button{display:block;min-height:40px;margin:6px 0;width:280px}</style></head><body>
<h1>احجز جلسة</h1>
<section>
  <h2>اختر الموعد</h2>
  <div id="slots"><button type="button" class="slot">10:00</button><button type="button" class="slot">11:00</button></div>
  <form id="booking-form" novalidate><label>الاسم <input name="name" required></label><label>الهاتف <input name="phone" type="tel" required></label><button type="submit">احجز الموعد</button></form>
  <p id="message" class="msg" role="status"></p>
</section>
<script>
  var chosen = '';
  document.querySelectorAll('.slot').forEach(function (b) { b.onclick = function () { chosen = b.textContent; }; });
  document.getElementById('booking-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('message');
    if (!chosen) { msg.textContent = 'اختر موعدًا من القائمة'; return; }
    msg.textContent = 'تم الحجز';
  });
</script></body></html>`;

test('a booking whose slot was not chosen is refused by the page, and nobody looks for a booking never made (P290)', async () => {
    const { result, codes } = await walk(SLOTS);
    expect(result.forms.find(f => f.label === 'احجز الموعد')?.effect).toBe('refused');
    expect(codes).not.toContain('form_persistence_unproven');
    expect(codes).not.toContain('form_dead_submit');
});

test('the words that tell a visitor to choose are a refusal, «أولًا» spelled either way', () => {
    expect(isVisibleFormRefusal('اختر موعدًا من القائمة')).toBe(true);
    expect(isVisibleFormRefusal('اختر التاريخ أولًا')).toBe(true);
    expect(isVisibleFormRefusal('اختر التاريخ أولاً')).toBe(true);
    expect(isVisibleFormRefusal('Please select a time slot')).toBe(true);
    expect(isVisibleFormRefusal('تم حجز موعدك بنجاح')).toBe(false);
    expect(isVisibleFormRefusal('Booking confirmed for 10:00')).toBe(false);
});

/* ---- P230 / P236: an error drawn before the press is the form refusing, not a dead form ------ */

function voucher(handled: boolean): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Checkout</title>
<style>body{font-family:sans-serif;margin:16px} input,button{display:block;min-height:40px;margin:6px 0;width:280px} .error{color:#b00020}</style></head><body>
<h1>Gift checkout</h1>
<form id="pay" novalidate>
  <label>Full name <input name="fullname" required></label>
  <label>Voucher code <input name="voucher" required aria-describedby="voucher-error"></label>
  ${handled ? '<span class="error" id="voucher-error" hidden></span>' : ''}
  <button type="submit">Redeem gift</button>
</form>
<script>
  var HANDLED = ${handled};
  var form = document.getElementById('pay');
  if (HANDLED) {
    var input = form.elements.voucher, err = document.getElementById('voucher-error');
    var check = function () { var ok = /^VCH-[0-9]{6}$/.test(input.value); input.setAttribute('aria-invalid', String(!ok)); err.hidden = ok; err.textContent = ok ? '' : 'Voucher code must look like VCH-123456'; return ok; };
    input.addEventListener('input', check);
    form.addEventListener('submit', function (e) { e.preventDefault(); if (!check()) return; });
  } else {
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  }
</script></body></html>`;
}

test('a form whose error was drawn before the press refused the QA\'s value: told, never «dead» (P230, P236)', async () => {
    const { result, codes, findings } = await walk(voucher(true));
    expect(result.forms.find(f => f.label === 'Redeem gift')?.effect).toBe('refused');
    expect(codes).not.toContain('form_dead_submit');
    const told = findings.find(f => f.code === 'field_case_minor');
    expect(told?.severity).toBe('minor');
    expect(told?.en).toMatch(/refused the QA's valid values and said: "Voucher code must look like VCH-123456"/);
});

const THANKS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Books</title>
<style>body{font-family:sans-serif;margin:16px} input,button{display:block;min-height:40px;margin:6px 0;width:280px}</style></head><body>
<h1>Page &amp; Shelf</h1>
<main id="view"><h2>Checkout</h2><form id="f" novalidate><label>Full name <input name="fullname" required></label><button type="submit">Place order</button></form></main>
<script>
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    if (this.elements.fullname.value.trim().length < 2) return;
    document.getElementById('view').innerHTML = '<h2>Thank you for your order!</h2>';
  });
</script></body></html>`;

test('a form whose page is replaced by its thank-you view was answered — its absence is no refusal and no dead form (the replay of P236)', async () => {
    const { result, codes } = await walk(THANKS);
    expect(result.forms.find(f => f.label === 'Place order')?.effect).toBe('submitted');
    expect(codes).not.toContain('form_dead_submit');
});

test('a card\'s expiry, number and code are not judged as a date, a phone or an amount', () => {
    expect(semanticTypeForField('input', 'expiry Expiry (MM/YY)')).toBe('');
    expect(semanticTypeForField('input', 'cardExpiry Card expiry date')).toBe('');
    expect(semanticTypeForField('input', 'cvc CVC')).toBe('');
    expect(semanticTypeForField('input', 'تاريخ انتهاء البطاقة')).toBe('');
    //  An expiry that is not a card's is still a date.
    expect(semanticTypeForField('input', 'Expiry date of the medicine')).toBe('date');
});

test('…and a form whose submit is wired to nothing is still dead', async () => {
    const { codes } = await walk(voucher(false));
    expect(codes).toContain('form_dead_submit');
});

/* ---- P179: a record deleted is gone from the records, whatever the message that says so names ---- */

function deletable(wired: boolean): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Staff</title>
<style>body{font-family:sans-serif;margin:16px} input,button{min-height:40px;margin:4px}</style></head><body>
<h1>Staff accounts</h1>
<form id="f"><input name="email" type="email" required placeholder="Email"><button type="submit">Add account</button></form>
<p id="notice" role="status"></p>
<ul id="list"></ul>
<script>
  function all() { return JSON.parse(localStorage.getItem('staff') || '[]'); }
  function draw() {
    document.getElementById('list').innerHTML = all().map(function (e, i) { return '<li>' + e + ' <button type="button" data-i="' + i + '">Delete</button></li>'; }).join('');
    document.querySelectorAll('#list button').forEach(function (b) {
      ${wired ? "b.onclick = function () { var list = all(); var gone = list.splice(Number(b.dataset.i), 1)[0]; localStorage.setItem('staff', JSON.stringify(list)); document.getElementById('notice').textContent = 'Account ' + gone + ' deleted.'; draw(); };" : ''}
    });
  }
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var list = all(); list.push(this.elements.email.value); localStorage.setItem('staff', JSON.stringify(list));
    document.getElementById('notice').textContent = 'Account ' + this.elements.email.value + ' added.'; this.reset(); draw();
  });
  draw();
</script></body></html>`;
}

test('a QA record deleted, named in the line that says it was deleted, was deleted (the replay of P179)', async () => {
    const { result, codes } = await walk(deletable(true));
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBeGreaterThanOrEqual(1);
    expect(codes).not.toContain('qa_created_record_not_deletable');
});

test('…and a Delete wired to nothing still leaves a record the QA could not delete', async () => {
    const { codes } = await walk(deletable(false));
    expect(codes).toContain('qa_created_record_not_deletable');
});

/* ---- the verdict: what was not measured is told, minor; what was measured lost refuses ------ */

test('the verdict tells a record kept somewhere and not found again as not measured, and refuses only what kept nothing', () => {
    const told = judgeBehaviour([], {
        formsPersistenceUnproven: 0,
        formsPersistenceEvidence: [{ form: 'Save changes', anchor: 'Joe QA x1', where: 'not searched', unmeasured: true, kept: 'server' },
            { form: 'Add comment', anchor: 'Joe QA x2', where: 'after reload', unmeasured: true, kept: 'server', asked: [401] }],
    }).findings;
    expect(told.map(f => f.code)).not.toContain('form_persistence_unproven');
    const minor = told.find(f => f.code === 'form_persistence_unmeasured')!;
    expect(minor.severity).toBe('minor');
    expect(minor.en).toMatch(/time ran out before the refreshed page was searched/);
    expect(minor.en).toMatch(/the server answered 401 when asked/);
    expect(minor.en).not.toMatch(/found nowhere/);

    const refused = judgeBehaviour([], {
        formsPersistenceUnproven: 1,
        formsPersistenceEvidence: [{ form: 'Add note', anchor: 'Joe QA x3', where: 'after reload', kept: 'nothing' }],
    }).findings;
    const major = refused.find(f => f.code === 'form_persistence_unproven')!;
    expect(major.severity).toBe('major');
    expect(major.en).toMatch(/found nowhere/);
    expect(major.en).toMatch(/nothing of it was written to any server or kept in the browser/);
});
