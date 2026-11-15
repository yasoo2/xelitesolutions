/**
 * ⛔ «LOST» IS PROVEN BY THE COLLECTION THE FORM WROTE TO — AND A RECORD THE QA EDITED IS NEVER DELETED.
 *
 * The independent review of 2026-11-15 (claude/r40-qa, 68f9ad4df) and the replay of P179:
 *   1. a 201 whose collection, asked again, is empty (`[]`) was «not measured», never lost; a POST
 *      answered by a redirect was never asked; a form of choices whose 201 showed nothing was
 *      «not measured» though the server's own list could be asked;
 *   2. a parent record (/api/products/3) or a list of approved reviews only «proved» a loss;
 *   5. «تم الطلب بنجاح. يمكنك اختيار منتجات أخرى من القائمة» was read as the form saying no;
 *   6. a hint drawn from the start, read after a submit that changed the page, made it «refused»;
 *  11. one mark for every form let form A's row prove form B's lost record;
 *  12. an analytics beacon to another origin counted as the record kept;
 *  P179: the QA typed over a movie through its edit form, found its mark in that row, and deleted
 *        the movie as its own.
 * Each pinned with its broken app refused (or its visitor's record kept) and its sound twin passing.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeForms, judgeBehaviour, isVisibleFormRefusal, isExpectedRefusal, serverListsWithout, serverListVerdict } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => boolean;

async function walk(page: string, api: Handler = () => false) {
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
const STYLE = '<style>body{font-family:sans-serif;margin:16px} input,select,textarea,button{display:block;min-height:40px;margin:6px 0;width:280px}</style>';

/* ---- 1A: a 201 whose collection, asked again, lists nothing at all --------------------------- */

const NOTES = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title>${STYLE}</head><body>
<h1>Notes</h1>
<form id="f"><input name="title" required placeholder="Title"><button>Add note</button></form>
<ul id="list"></ul>
<script>
  var shown = [];
  function draw() { document.getElementById('list').innerHTML = shown.map(function (n) { return '<li>' + n.title + '</li>'; }).join(''); }
  fetch('/api/notes').then(function (r) { return r.json(); }).then(function (list) { shown = list; draw(); });
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = this.elements.title.value, form = this;
    fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title }) })
      .then(function (r) { if (r.ok) { shown.push({ title: title }); draw(); form.reset(); } });
  });
</script></body></html>`;

/*
 * The third review of 2026-11-15 (findings 3, 4): an empty list proves a loss only when the id the POST
 * answered, asked, is 404 — or, with no id, when the page read that list non-empty before. This server
 * answers its 201 with the note's id and knows no note it did not keep.
 */
const notesApi = (notes: any[], keeps: boolean, answersId = true): Handler => (req, body, res) => {
    if (String(req.url).startsWith('/api/notes/')) return json(res, { error: 'not found' }, 404);
    if (req.url !== '/api/notes') return false;
    if (req.method === 'POST') {
        const note = { id: notes.length + 1, title: String(JSON.parse(body || '{}').title || '') };
        if (keeps) notes.push(note);
        return json(res, answersId ? note : { ok: true }, 201);
    }
    return json(res, notes);
};

test('a 201 whose collection, asked again, is an empty list is lost (the review, finding 1)', async () => {
    const notes: any[] = [];
    const { codes, findings } = await walk(NOTES, notesApi(notes, false));
    expect(notes.length).toBe(0);
    expect(codes).toContain('form_persistence_unproven');
    expect(findings.find(f => f.code === 'form_persistence_unproven')!.en).toMatch(/the collection it was written to returned an empty list/);
});

test('…but a 201 that names no id, on a list that showed this visitor nothing before, is not measured: the list may be another visitor\'s (the third review, finding 4)', async () => {
    const notes: any[] = [];
    const { codes, result } = await walk(NOTES, notesApi(notes, false, false));
    expect(notes.length).toBe(0);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(Number(result.metrics.formsPersistenceUnmeasured || 0)).toBeGreaterThanOrEqual(1);
});

test('…and the same server keeping it is proven kept', async () => {
    const notes: any[] = [];
    const { codes, result } = await walk(NOTES, notesApi(notes, true));
    expect(notes.length).toBeGreaterThan(0);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
});

/* ---- 1B: a POST answered by a redirect is asked where it was written ------------------------- */

const REDIRECTED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bookings</title>${STYLE}</head><body>
<h1>Bookings</h1>
<form id="f"><input name="name" required placeholder="Your name"><button>Book a table</button></form>
<p id="msg" role="status"></p>
<ul id="list"></ul>
<script>
  function draw(list) { document.getElementById('list').innerHTML = list.map(function (b) { return '<li>' + b.name + '</li>'; }).join(''); }
  fetch('/api/bookings').then(function (r) { return r.json(); }).then(draw);
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = this;
    fetch('/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: form.elements.name.value }) })
      .then(function (r) { return r.json(); }).then(function (list) { draw(list); document.getElementById('msg').textContent = 'Booking received'; form.reset(); });
  });
</script></body></html>`;

const redirectApi = (bookings: any[], keeps: boolean): Handler => (req, body, res) => {
    if (req.url !== '/api/bookings') return false;
    if (req.method === 'POST') {
        if (keeps) bookings.push({ name: String(JSON.parse(body || '{}').name || '') });
        res.writeHead(303, { location: '/api/bookings' });
        res.end();
        return true;
    }
    return json(res, bookings);
};

test('a POST answered 303 that keeps nothing is asked of its collection, and lost (finding 1)', async () => {
    //  The list showed this visitor a booking before the submit: it would show his (the third review, finding 4).
    const bookings: any[] = [{ name: 'Seed guest' }];
    const { codes } = await walk(REDIRECTED, redirectApi(bookings, false));
    expect(bookings.length).toBe(1);
    expect(codes).toContain('form_persistence_unproven');
});

test('…and the same redirect after a kept booking is proven kept', async () => {
    const bookings: any[] = [];
    const { codes, result } = await walk(REDIRECTED, redirectApi(bookings, true));
    expect(bookings.length).toBeGreaterThan(0);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
});

/* ---- 1C: a form of choices whose 201 shows nothing is asked of the server's list ------------- */

const CHOICES = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Salon</title>${STYLE}</head><body>
<h1>Salon</h1>
<form id="f">
  <label>Service <select name="service" required><option value="haircut">Haircut</option><option value="colour">Colour</option></select></label>
  <label>Time <select name="slot" required><option value="10:00">10:00</option><option value="11:00">11:00</option></select></label>
  <button>Book</button>
</form>
<p id="msg" role="status"></p>
<h2>Bookings</h2><ul id="booked"></ul>
<script>
  fetch('/api/bookings').then(function (r) { return r.json(); }).then(function (list) { document.getElementById('booked').innerHTML = list.map(function (b) { return '<li>' + b.service + ' at ' + b.slot + '</li>'; }).join(''); });
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = this, msg = document.getElementById('msg');
    msg.textContent = 'Sending…';
    fetch('/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: form.elements.service.value, slot: form.elements.slot.value }) })
      .then(function (r) { msg.textContent = r.ok ? 'Booking received' : 'Could not save'; });
  });
</script></body></html>`;

const choicesApi = (bookings: any[], keeps: boolean): Handler => (req, body, res) => {
    if (req.url !== '/api/bookings') return false;
    if (req.method === 'POST') { if (keeps) bookings.push(JSON.parse(body || '{}')); return json(res, { ok: true }, 201); }
    return json(res, bookings);
};

test('a form of choices whose 201 never shows and whose collection lacks it is lost — never silently «not measured» (finding 1)', async () => {
    //  The list the page read showed a booking before the submit (the third review, finding 4).
    const bookings: any[] = [{ service: 'colour', slot: '15:00' }];
    const { codes, findings } = await walk(CHOICES, choicesApi(bookings, false));
    expect(bookings.length).toBe(1);
    expect(codes).toContain('form_persistence_unproven');
    //  No text of the QA's to name: told as no new record, never as «what the QA typed ("")».
    expect(findings.find(f => f.code === 'form_persistence_unproven')!.en).not.toMatch(/\(""\)/);
});

test('…and the same booking kept on the server is not refused', async () => {
    const bookings: any[] = [];
    const { codes } = await walk(CHOICES, choicesApi(bookings, true));
    expect(bookings.length).toBeGreaterThan(0);
    expect(codes).not.toContain('form_persistence_unproven');
});

/* ---- 2: only the collection's own list proves a loss, and never a list that may filter ------- */

test('the server\'s list proves a loss only from the collection itself, and never when it may be filtered (finding 2)', () => {
    const posts = [{ at: 'http://x/api/products/3/reviews', body: JSON.stringify({ name: 'Joe QA m1-abc', text: 'ok' }) }];
    //  The parent record, never the collection: proves nothing, asked by its address or as a bare body.
    expect(serverListsWithout(posts, [{ at: 'http://x/api/products/3', body: JSON.stringify({ id: 3, name: 'Coffee' }) }], 'm1-abc')).toBe(false);
    expect(serverListsWithout(posts, [JSON.stringify({ id: 3, name: 'Coffee' })], 'm1-abc')).toBe(false);
    expect(serverListsWithout(posts, [{ at: 'http://x/api/products/3', body: JSON.stringify([{ name: 'Ana' }]) }], 'm1-abc')).toBe(false);
    //  A list of approved reviews only, a review the server says is pending, a page of a longer list.
    expect(serverListsWithout(posts, [JSON.stringify([{ name: 'Sara', text: 'ok', status: 'approved' }, { name: 'Omar', text: 'fine', status: 'approved' }])], 'm1-abc')).toBe(false);
    expect(serverListsWithout([{ ...posts[0], answer: JSON.stringify({ id: 9, status: 'pending' }) }], [JSON.stringify([{ name: 'Sara', text: 'ok' }])], 'm1-abc')).toBe(false);
    expect(serverListsWithout([{ ...posts[0], answer: JSON.stringify({ id: 9, approved: false }) }], [JSON.stringify([])], 'm1-abc')).toBe(false);
    expect(serverListsWithout(posts, [JSON.stringify([{ name: 'Sara' }])], 'm1-abc', 'Thanks! Your review will appear once approved.')).toBe(false);
    expect(serverListsWithout(posts, [JSON.stringify([{ name: 'Sara' }])], 'm1-abc', 'شكراً، سيظهر تقييمك بعد المراجعة')).toBe(false);
    expect(serverListsWithout(posts, [JSON.stringify({ items: Array.from({ length: 7 }, (_, i) => ({ name: `n${i}` })), total: 57 })], 'm1-abc')).toBe(false);
    expect(serverListsWithout(posts, [JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ name: `n${i}` })))], 'm1-abc')).toBe(false);
    //  The broken twins: the collection itself, empty or listing others (with mixed states), lacks the record.
    expect(serverListVerdict(posts, [{ at: 'http://x/api/products/3/reviews', body: '[]' }], 'm1-abc')).toBe('empty');
    expect(serverListVerdict(posts, [JSON.stringify({ items: [] })], 'm1-abc')).toBe('empty');
    expect(serverListVerdict(posts, [JSON.stringify([{ name: 'Sara', text: 'ok' }])], 'm1-abc')).toBe('others');
    expect(serverListVerdict(posts, [JSON.stringify([{ name: 'Sara', status: 'approved' }, { name: 'Omar', status: 'pending' }])], 'm1-abc')).toBe('others');
    //  Kept is kept, wherever it was asked.
    expect(serverListsWithout(posts, [{ at: 'http://x/api/products/3', body: JSON.stringify({ reviews: [{ name: 'Joe QA m1-abc' }] }) }], 'm1-abc')).toBe(false);
    //  A form of choices: records sharing none of the values sent prove its loss; one holding them proves nothing.
    const chose = [{ at: 'http://x/api/bookings', body: JSON.stringify({ service: 'haircut', slot: '10:00' }) }];
    expect(serverListVerdict(chose, [JSON.stringify([{ service: 'colour', slot: '15:00' }])], 'm1-abc')).toBe('others');
    expect(serverListVerdict(chose, [JSON.stringify([{ service: 'haircut', slot: '10:00' }])], 'm1-abc')).toBe('');
    //  An edit (PUT) is not a record made: its address is the record, never a collection.
    expect(serverListVerdict([{ ...chose[0], method: 'PUT' }], ['[]'], 'm1-abc')).toBe('');
});

function reviews(listsAll: boolean): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reviews</title>${STYLE}</head><body>
<h1>Guest reviews</h1>
<ul id="list"></ul>
<form id="f"><input name="name" required placeholder="Your name"><textarea name="text" required placeholder="Your review"></textarea><button>Add review</button></form>
<p id="msg" role="status"></p>
<script>
  function draw(list) { document.getElementById('list').innerHTML = list.map(function (r) { return '<li>' + r.name + ': ' + r.text + '</li>'; }).join(''); }
  fetch('/api/reviews').then(function (r) { return r.json(); }).then(draw);
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = this;
    fetch('/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: form.elements.name.value, text: form.elements.text.value }) })
      .then(function (r) { if (r.ok) { document.getElementById('msg').textContent = ${listsAll ? "'Thanks for your review!'" : "'Thanks! Your review will appear once it is approved.'"}; form.reset(); } });
  });
</script></body></html>`;
}

const reviewsApi = (all: any[], keeps: boolean, listsAll: boolean): Handler => (req, body, res) => {
    //  A review asked by its id: answered when it is shown, 404 when not kept or held (the third review, finding 3).
    const one = String(req.url).match(/^\/api\/reviews\/(\d+)$/);
    if (one) { const r = all.find(x => String(x.id) === one[1]); return r && (listsAll || r.status === 'approved') ? json(res, r) : json(res, { error: 'not found' }, 404); }
    if (req.url !== '/api/reviews') return false;
    if (req.method === 'POST') {
        const r = { id: all.length + 1, ...JSON.parse(body || '{}'), status: 'pending' };
        if (keeps) all.push(r);
        return json(res, { id: r.id, status: 'pending' }, 201);
    }
    return json(res, listsAll ? all : all.filter(r => r.status === 'approved'));
};

test('a review kept as pending, on a site that lists only approved reviews, is never called lost (finding 2)', async () => {
    const all = [{ id: 1, name: 'Sara', text: 'Lovely stay', status: 'approved' }];
    const { codes } = await walk(reviews(false), reviewsApi(all, true, false));
    expect(all.length).toBeGreaterThan(1);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(codes).toContain('form_persistence_unmeasured');
});

test('…and a server that lists every review and kept none of the QA\'s is still refused', async () => {
    const all = [{ id: 1, name: 'Sara', text: 'Lovely stay', status: 'approved' }, { id: 2, name: 'Omar', text: 'Quiet room', status: 'pending' }];
    const { codes } = await walk(reviews(true), reviewsApi(all, false, true));
    expect(all.length).toBe(2);
    expect(codes).toContain('form_persistence_unproven');
});

test('a 404 the QA\'s own question got (the record a POST named, asked by its id) is never the product\'s failed request (the replay of P189)', () => {
    const page: any = { __joeQaAskedUrls: new Set(['http://x/api/users/bb74']) };
    expect(isExpectedRefusal(page, 404, 'http://x/api/users/bb74', 'GET')).toBe(true);
    expect(isExpectedRefusal(page, 404, 'http://x/api/users/bb74', '')).toBe(true);
    //  The page's own requests still count: another address, another status, a write.
    expect(isExpectedRefusal(page, 404, 'http://x/api/users', 'GET')).toBe(false);
    expect(isExpectedRefusal(page, 500, 'http://x/api/users/bb74', 'GET')).toBe(false);
    expect(isExpectedRefusal({}, 404, 'http://x/api/users/bb74', 'GET')).toBe(false);
});

/* ---- the r40 review, finding 3: a field is read with the form's own words ----------------------- */

function typedInto(form: string): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Forms</title>${STYLE}</head><body>
<h1>Your details</h1>
${form}
<p id="msg" role="status"></p>
<script>
  window.__typed = {};
  document.querySelectorAll('input').forEach(function (x) {
    x.addEventListener('input', function () { (window.__typed[x.name] = window.__typed[x.name] || []).push(x.value); });
  });
  document.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); document.getElementById('msg').textContent = 'Saved'; });
</script></body></html>`;
}

async function typed(page: string): Promise<Record<string, string[]>> {
    const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'networkidle' });
        await probeForms(tab, { budgetMs: 40_000 });
        return await tab.evaluate(() => (window as any).__typed || {});
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}

test('a bare «Security code» beside a «Card number» in a checkout gets a card code\'s cases; an insurance card\'s «Card number» gets no payment card\'s', async () => {
    const pay = await typed(typedInto(`<form id="pay"><h2>Checkout</h2>
  <label>Card number <input name="cardNumber" required></label>
  <label>Security code <input name="code" required></label>
  <button>Pay now</button></form>`));
    expect(pay.code || []).toContain('abc');
    expect(pay.cardNumber || []).toContain('4242424242424242');
    const insured = await typed(typedInto(`<form id="ins"><h2>Insurance card</h2>
  <label>Card number <input name="number" required></label>
  <button>Save insurance card</button></form>`));
    expect(insured.number || []).not.toContain('4242424242424242');
    expect(insured.number || []).not.toContain('abcd efgh ijkl mnop');
});

/* ---- 5: a success message that offers more choices is no refusal ----------------------------- */

test('a success that offers another choice is not the form saying no; a line telling him to choose still is (finding 5)', () => {
    expect(isVisibleFormRefusal('تم الطلب بنجاح. يمكنك اختيار منتجات أخرى من القائمة')).toBe(false);
    expect(isVisibleFormRefusal('شكراً لك\nاختر خدمة أخرى إن أردت')).toBe(false);
    expect(isVisibleFormRefusal('طلبك جاهز، ويمكنك اختيار منتج آخر من القائمة')).toBe(false);
    //  The sound twins: a line that starts by telling him to choose.
    expect(isVisibleFormRefusal('اختر موعدًا من القائمة')).toBe(true);
    expect(isVisibleFormRefusal('اختر التاريخ أولاً.')).toBe(true);
    expect(isVisibleFormRefusal('يرجى اختيار الوقت من القائمة')).toBe(true);
    expect(isVisibleFormRefusal('Please select a time slot')).toBe(true);
    expect(isVisibleFormRefusal('الرجاء اختر خدمة')).toBe(true);
});

/* ---- 6: a hint drawn from the start is no answer of a submit that changed the page ----------- */

function tasks(kept: boolean): string {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>المهام</title>${STYLE}</head><body>
<h1>مهامي</h1>
<section>
  <h2>أضف مهمة</h2>
  <p class="hint" aria-live="polite">الرجاء تعبئة الحقل المطلوب ثم الضغط على الزر</p>
  <form id="f"><input name="title" required placeholder="عنوان المهمة"><button>أضف المهمة</button></form>
  <ul id="list"></ul>
</section>
<script>
  var KEPT = ${kept};
  var mine = KEPT ? JSON.parse(localStorage.getItem('tasks') || '[]') : [];
  function draw() { document.getElementById('list').innerHTML = mine.map(function (t) { return '<li>' + t + '</li>'; }).join(''); }
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    mine.push(this.elements.title.value);
    if (KEPT) localStorage.setItem('tasks', JSON.stringify(mine));
    draw(); this.reset();
  });
  draw();
</script></body></html>`;
}

test('a page that drew the record beside a hint shown from the start was answered, not refused — and its lost record is found lost (finding 6)', async () => {
    const { result, codes } = await walk(tasks(false));
    expect(result.forms.find(f => f.label === 'أضف المهمة')?.effect).toBe('submitted');
    expect(codes).toContain('form_persistence_unproven');
});

test('…and the same page keeping it in the browser is proven kept', async () => {
    const { result, codes } = await walk(tasks(true));
    expect(codes).not.toContain('form_persistence_unproven');
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
});

/* ---- 11: form A's row never proves form B's record ------------------------------------------- */

function twoForms(): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Garden</title>${STYLE}</head><body>
<h1>Garden planner</h1>
<section><h2>Notes</h2><form id="a"><input name="title" required placeholder="Note"><button>Add note</button></form><ul id="notes"></ul></section>
<section><h2>Tasks</h2><form id="b"><input name="task" required placeholder="Task"><button>Add task</button></form><ul id="tasks"></ul></section>
<script>
  var tasks = [];
  function load() {
    fetch('/api/notes').then(function (r) { return r.json(); }).then(function (l) { document.getElementById('notes').innerHTML = l.map(function (n) { return '<li>' + n.title + '</li>'; }).join(''); });
    fetch('/api/tasks').then(function (r) { return r.json(); }).then(function (l) { tasks = l; drawTasks(); });
  }
  function drawTasks() { document.getElementById('tasks').innerHTML = tasks.map(function (t) { return '<li>' + t.task + '</li>'; }).join(''); }
  document.getElementById('a').addEventListener('submit', function (e) {
    e.preventDefault(); var f = this;
    fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: f.elements.title.value }) }).then(function () { f.reset(); load(); });
  });
  document.getElementById('b').addEventListener('submit', function (e) {
    e.preventDefault(); var f = this, task = f.elements.task.value;
    fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: task }) }).then(function () { tasks.push({ task: task }); drawTasks(); f.reset(); });
  });
  load();
</script></body></html>`;
}

const gardenApi = (notes: any[], tasks: any[], keepsTasks: boolean): Handler => (req, body, res) => {
    if (req.url === '/api/notes') {
        if (req.method === 'POST') { notes.push({ title: String(JSON.parse(body || '{}').title || '') }); return json(res, { ok: true }, 201); }
        return json(res, notes);
    }
    if (req.url === '/api/tasks') {
        if (req.method === 'POST') { if (keepsTasks) tasks.push({ task: String(JSON.parse(body || '{}').task || '') }); return json(res, { ok: true }, 201); }
        return json(res, tasks);
    }
    return false;
};

test('a lost task is never «found» by the note another form made in the same walk (finding 11)', async () => {
    const notes: any[] = [], tasks = [{ task: 'Water the roses' }];
    const { codes } = await walk(twoForms(), gardenApi(notes, tasks, false));
    expect(notes.length).toBeGreaterThan(0);
    expect(tasks.length).toBe(1);
    expect(codes).toContain('form_persistence_unproven');
});

test('…and both kept are both proven kept, each by its own mark', async () => {
    const notes: any[] = [], tasks = [{ task: 'Water the roses' }];
    const { codes, result } = await walk(twoForms(), gardenApi(notes, tasks, true));
    expect(codes).not.toContain('form_persistence_unproven');
    expect(Number(result.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(2);
    //  Each form's mark is its own: neither is part of the other.
    const a = String(notes[notes.length - 1].title), b = String(tasks[tasks.length - 1].task);
    const markOf = (s: string) => s.split(' ').pop()!;
    expect(markOf(a)).not.toBe(markOf(b));
    expect(markOf(a).includes(markOf(b)) || markOf(b).includes(markOf(a))).toBe(false);
});

/* ---- 12: an analytics beacon to another origin is not where a record is kept ----------------- */

function beacon(hostedDb: boolean): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Wishlist</title>${STYLE}</head><body>
<h1>Wishlist</h1>
<form id="f"><input name="wish" required placeholder="What would you like?"><button>Add item</button></form>
<ul id="list"></ul>
<script>
  var mine = [];
  var other = 'http://localhost:' + location.port;
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var item = this.elements.wish.value;
    ${hostedDb
        ? "fetch(other + '/db/items', { method: 'POST', mode: 'no-cors', body: JSON.stringify({ item: item }) });"
        : "fetch(other + '/collect', { method: 'POST', mode: 'no-cors', body: JSON.stringify({ event: 'submit', page: location.pathname }) });"}
    mine.push(item);
    document.getElementById('list').innerHTML = mine.map(function (x) { return '<li>' + x + '</li>'; }).join('');
    this.reset();
  });
</script></body></html>`;
}

const beaconApi = (seen: string[]): Handler => (req, body, res) => {
    if (req.url !== '/collect' && req.url !== '/db/items') return false;
    seen.push(`${req.url} ${body}`);
    res.writeHead(req.url === '/collect' ? 204 : 201);
    res.end();
    return true;
};

test('a record kept nowhere, with an analytics beacon sent to another origin, is lost (finding 12)', async () => {
    const seen: string[] = [];
    const { codes } = await walk(beacon(false), beaconApi(seen));
    expect(seen.some(s => s.startsWith('/collect'))).toBe(true);
    expect(codes).toContain('form_persistence_unproven');
});

test('…and one written to another origin with what was typed is kept there: told, never refused', async () => {
    const seen: string[] = [];
    const { codes } = await walk(beacon(true), beaconApi(seen));
    expect(seen.some(s => s.startsWith('/db/items'))).toBe(true);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(codes).toContain('form_persistence_unmeasured');
});

/* ---- P179: a record the QA edited is never deleted as its own -------------------------------- */

function items(form: 'edit' | 'rename' | 'create' | 'shared'): string {
    const forms = {
        edit: '<form id="f"><h2>Edit movie</h2><label>Title <input name="name" required value="Seed movie"></label><button>Save changes</button></form>',
        rename: '<form id="f"><h2>Rename the first movie</h2><label>New title <input name="name" required></label><button>Save title</button></form>',
        create: '<form id="f"><h2>New movie</h2><label>Title <input name="name" required></label><button>Add movie</button></form>',
        shared: '<form id="f"><h2>Movie</h2><label>Title <input name="name" required value="Seed movie"></label><button>Save movie</button></form>',
    };
    const send = {
        edit: "fetch('/api/items/1', { method: 'PUT', headers: h, body: JSON.stringify({ name: name }) })",
        rename: "fetch('/api/items/1', { method: 'PATCH', headers: h, body: JSON.stringify({ name: name }) })",
        create: "fetch('/api/items', { method: 'POST', headers: h, body: JSON.stringify({ name: name }) })",
        //  P179's own: opened editing the first movie, saved once, then the same form makes new movies.
        shared: "(editing ? fetch('/api/items/1', { method: 'PUT', headers: h, body: JSON.stringify({ name: name }) }) : fetch('/api/items', { method: 'POST', headers: h, body: JSON.stringify({ name: name }) })).then(function (r) { editing = false; return r; })",
    };
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cinema admin</title>${STYLE}</head><body>
<h1>Movies</h1>
<ul id="list"></ul>
${forms[form]}
<script>
  var h = { 'content-type': 'application/json' }, editing = true;
  function load() {
    fetch('/api/items').then(function (r) { return r.json(); }).then(function (list) {
      document.getElementById('list').innerHTML = list.map(function (m) { return '<li>' + m.name + ' <button type="button" data-id="' + m.id + '">Delete</button></li>'; }).join('');
      document.querySelectorAll('#list button').forEach(function (b) { b.onclick = function () { fetch('/api/items/' + b.dataset.id, { method: 'DELETE' }).then(load); }; });
    });
  }
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = this.elements.name.value;
    ${send[form]}.then(load);
  });
  load();
</script></body></html>`;
}

const itemsApi = (list: any[]): Handler => (req, body, res) => {
    const url = String(req.url);
    if (!url.startsWith('/api/items')) return false;
    const id = Number(url.split('/')[3] || 0);
    if (req.method === 'GET' && url === '/api/items') return json(res, list);
    if (req.method === 'POST' && url === '/api/items') { const m = { id: Math.max(0, ...list.map(x => x.id)) + 1, name: String(JSON.parse(body || '{}').name || '') }; list.push(m); return json(res, m, 201); }
    const at = list.findIndex(x => x.id === id);
    if (at < 0) return json(res, { error: 'no such movie' }, 404);
    if (req.method === 'PUT' || req.method === 'PATCH') { list[at].name = String(JSON.parse(body || '{}').name || list[at].name); return json(res, list[at]); }
    if (req.method === 'DELETE') { list.splice(at, 1); res.writeHead(204); res.end(); return true; }
    return false;
};

test('a movie the QA edited through its prefilled edit form is never deleted as the QA\'s own (the replay of P179)', async () => {
    const list = [{ id: 1, name: 'Seed movie' }, { id: 2, name: 'Second feature' }];
    const { result } = await walk(items('edit'), itemsApi(list));
    expect(list.some(m => m.id === 1)).toBe(true);
    expect(Number(result.metrics.qaRecordsEdited || 0)).toBeGreaterThanOrEqual(1);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
});

test('…nor one renamed by a form that only PATCHes it', async () => {
    const list = [{ id: 1, name: 'Seed movie' }, { id: 2, name: 'Second feature' }];
    const { result } = await walk(items('rename'), itemsApi(list));
    expect(list.some(m => m.id === 1)).toBe(true);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
});

test('…and a create-or-edit form that saved the movie unchanged, then made the QA\'s own, deletes only the QA\'s own (the replay of P179)', async () => {
    const list = [{ id: 1, name: 'Seed movie' }, { id: 2, name: 'Second feature' }];
    const { result } = await walk(items('shared'), itemsApi(list));
    expect(list.find(m => m.id === 1)?.name).toBe('Seed movie');
    expect(list.some(m => m.id === 2)).toBe(true);
    expect(list.some(m => /Joe QA/.test(m.name))).toBe(false);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBeGreaterThanOrEqual(1);
});

test('…while the movie the QA itself created is still deleted, and the visitor\'s survive', async () => {
    const list = [{ id: 1, name: 'Seed movie' }, { id: 2, name: 'Second feature' }];
    const { result } = await walk(items('create'), itemsApi(list));
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBeGreaterThanOrEqual(1);
    expect(list.map(m => m.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsEdited || 0)).toBe(0);
});
