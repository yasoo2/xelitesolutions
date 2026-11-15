/**
 * ⛔ THE SECOND REVIEW OF claude/r40-qa (cd4b7f111, 2026-11-15) — IN THE BROWSER.
 *
 *   B1  a prefilled «Edit movie» form that POSTs /api/items/1 had movie 1 deleted as the QA's own;
 *   B2  a create form with a prefilled field, writing to a hosted database (another origin), left the
 *       QA's own records in the owner's database, run after run;
 *   C1  a kept booking was «lost» because the page then POSTed /api/notifications, whose list is empty;
 *   C5  a lone dead nav button was exempt beside a pager's disabled «السابق» or a closed edit panel;
 *   C8  the QA's own asks excused the product's 404s at those addresses for the rest of the walk.
 * Each with its sound or broken twin.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeForms, judgeBehaviour, isExpectedRefusal, currentLinkFacts } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => boolean;

function serve(page: () => string, api: Handler): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (api(req, body, res)) return;
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(page());
        });
    });
    return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
const portOf = (s: http.Server) => (s.address() as any).port as number;
const close = (s: http.Server) => new Promise<void>(r => s.close(() => r()));

async function walk(page: string | (() => string), api: Handler = () => false, after?: (tab: any, origin: string) => void) {
    const server = await serve(typeof page === 'string' ? () => page : page, api);
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const origin = `http://127.0.0.1:${portOf(server)}`;
        await tab.goto(`${origin}/`, { waitUntil: 'networkidle' });
        const result = await probeForms(tab, { budgetMs: 60_000 });
        const findings = judgeBehaviour([], result.metrics as any, [], result.forms as any).findings;
        after?.(tab, origin);
        return { result, findings, codes: findings.map(f => f.code) };
    } finally {
        await browser.close();
        await close(server);
    }
}

const json = (res: http.ServerResponse, value: unknown, status = 200, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(value));
    return true;
};
const STYLE = '<style>body{font-family:sans-serif;margin:16px} input,select,textarea,button{display:block;min-height:40px;margin:6px 0;width:280px}</style>';

/* ---- B1: an edit that saves with POST to the record's own address ---------------------------- */

function movies(form: 'edit-by-post' | 'create-prefilled'): string {
    const forms = {
        'edit-by-post': '<form id="f"><h2>Edit movie</h2><label>Title <input name="name" required value="Seed movie"></label><button>Save changes</button></form>',
        'create-prefilled': '<form id="f"><h2>New movie</h2><label>Title <input name="name" required></label><label>Language <input name="language" value="Arabic"></label><button>Add movie</button></form>',
    };
    const send = {
        'edit-by-post': "fetch('/api/items/1', { method: 'POST', headers: h, body: JSON.stringify({ name: f.elements.name.value }) })",
        'create-prefilled': "fetch('/api/items', { method: 'POST', headers: h, body: JSON.stringify({ name: f.elements.name.value, language: f.elements.language.value }) })",
    };
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cinema admin</title>${STYLE}</head><body>
<h1>Movies</h1><ul id="list"></ul>
${forms[form]}
<script>
  var h = { 'content-type': 'application/json' };
  function load() {
    fetch('/api/items').then(function (r) { return r.json(); }).then(function (list) {
      document.getElementById('list').innerHTML = list.map(function (m) { return '<li>' + m.name + ' <button type="button" data-id="' + m.id + '">Delete</button></li>'; }).join('');
      document.querySelectorAll('#list button').forEach(function (b) { b.onclick = function () { fetch('/api/items/' + b.dataset.id, { method: 'DELETE' }).then(load); }; });
    });
  }
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = this;
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
    if (req.method === 'POST' && url === '/api/items') { const m = { id: Math.max(0, ...list.map(x => x.id)) + 1, ...JSON.parse(body || '{}') }; list.push(m); return json(res, m, 201); }
    const at = list.findIndex(x => x.id === id);
    if (at < 0) return json(res, { error: 'no such movie' }, 404);
    if (req.method === 'POST') { list[at].name = String(JSON.parse(body || '{}').name || list[at].name); return json(res, list[at]); }
    if (req.method === 'GET') return json(res, list[at]);
    if (req.method === 'DELETE') { list.splice(at, 1); res.writeHead(204); res.end(); return true; }
    return false;
};

test('a prefilled edit form that saves with POST /api/items/1 never has movie 1 deleted (B1, probe3 case 1)', async () => {
    const list = [{ id: 1, name: 'Seed movie' }, { id: 2, name: 'Second feature' }];
    const { result } = await walk(movies('edit-by-post'), itemsApi(list));
    expect(list.map(m => m.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
    expect(Number(result.metrics.qaRecordsEdited || 0)).toBeGreaterThanOrEqual(1);
});

test('…while a create form with a prefilled field that POSTs its collection still deletes the QA\'s own, and only it', async () => {
    const list = [{ id: 1, name: 'Seed movie' }, { id: 2, name: 'Second feature' }];
    const { result } = await walk(movies('create-prefilled'), itemsApi(list));
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBeGreaterThanOrEqual(1);
    expect(list.map(m => m.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsEdited || 0)).toBe(0);
});

/* ---- B2: a hosted database on another origin ------------------------------------------------- */

function hosted(api: string, form: 'create' | 'edit'): string {
    const forms = {
        create: '<form id="f"><h2>New booking</h2><label>Guest name <input name="name" required></label><label>City <input name="city" value="Riyadh"></label><button>Add booking</button></form>',
        edit: '<form id="f"><h2>Edit booking 1</h2><label>Guest name <input name="name" required value="Seed guest"></label><label>City <input name="city" value="Riyadh"></label><button>Save booking</button></form>',
    };
    const send = {
        create: "fetch(API + '/rest/v1/bookings', { method: 'POST', headers: h, body: JSON.stringify({ name: f.elements.name.value, city: f.elements.city.value }) })",
        edit: "fetch(API + '/rest/v1/bookings?id=eq.1', { method: 'PATCH', headers: h, body: JSON.stringify({ name: f.elements.name.value, city: f.elements.city.value }) })",
    };
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Guest house</title>${STYLE}</head><body>
<h1>Bookings</h1><ul id="list"></ul>
${forms[form]}
<script>
  var API = '${api}', h = { 'content-type': 'application/json', prefer: 'return=representation' };
  function load() {
    fetch(API + '/rest/v1/bookings').then(function (r) { return r.json(); }).then(function (list) {
      document.getElementById('list').innerHTML = list.map(function (b) { return '<li>' + b.name + ' — ' + b.city + ' <button type="button" data-id="' + b.id + '">Delete</button></li>'; }).join('');
      document.querySelectorAll('#list button').forEach(function (b) { b.onclick = function () { fetch(API + '/rest/v1/bookings?id=eq.' + b.dataset.id, { method: 'DELETE' }).then(load); }; });
    });
  }
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = this;
    ${send[form]}.then(load);
  });
  load();
</script></body></html>`;
}

/** A hosted database's REST face (Supabase's shape), on its own origin, answering with CORS. */
const hostedApi = (rows: any[]): Handler => (req, body, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,prefer' };
    const url = new URL(String(req.url), 'http://db');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
    if (url.pathname !== '/rest/v1/bookings') return json(res, { error: 'no such table' }, 404, cors);
    const id = Number(String(url.searchParams.get('id') || '').replace(/^eq\./, '') || 0);
    if (req.method === 'GET') return json(res, rows, 200, cors);
    if (req.method === 'POST') { const r = { id: Math.max(0, ...rows.map(x => x.id)) + 1, ...JSON.parse(body || '{}') }; rows.push(r); return json(res, [r], 201, cors); }
    const at = rows.findIndex(x => x.id === id);
    if (at < 0) return json(res, [], 200, cors);
    if (req.method === 'PATCH') { Object.assign(rows[at], JSON.parse(body || '{}')); return json(res, [rows[at]], 200, cors); }
    if (req.method === 'DELETE') { rows.splice(at, 1); res.writeHead(204, cors); res.end(); return true; }
    return false;
};

async function walkHosted(form: 'create' | 'edit', rows: any[]) {
    const db = await serve(() => '', hostedApi(rows));
    try {
        return await walk(hosted(`http://127.0.0.1:${portOf(db)}`, form));
    } finally {
        await close(db);
    }
}

test('a create form with a prefilled field writing to a hosted database still deletes the QA\'s own (B2)', async () => {
    const rows = [{ id: 1, name: 'Seed guest', city: 'Jeddah' }];
    const { result } = await walkHosted('create', rows);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBeGreaterThanOrEqual(1);
    expect(rows.some(r => /Joe QA/i.test(String(r.name)))).toBe(false);
    expect(rows.find(r => r.id === 1)?.name).toBe('Seed guest');
});

test('…while an edit of the owner\'s booking in that database is never deleted', async () => {
    const rows = [{ id: 1, name: 'Seed guest', city: 'Jeddah' }, { id: 2, name: 'Second guest', city: 'Dammam' }];
    const { result } = await walkHosted('edit', rows);
    expect(rows.map(r => r.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
});

/* ---- C1: a loss is judged on the form's own POST --------------------------------------------- */

const BOOK = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Barber</title>${STYLE}</head><body>
<h1>Book a chair</h1>
<form id="f"><label>Service <select name="service" required><option value="">Choose</option><option value="cut">Cut</option><option value="shave">Shave</option></select></label>
<label>Slot <select name="slot" required><option value="">Choose</option><option value="10:00">10:00</option><option value="11:00">11:00</option></select></label>
<button>Book</button></form><p id="msg" aria-live="polite"></p>
<script>
  var h = { 'content-type': 'application/json' };
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = this;
    fetch('/api/bookings', { method: 'POST', headers: h, body: JSON.stringify({ service: f.elements.service.value, slot: f.elements.slot.value }) })
      .then(function (r) { return r.json(); })
      .then(function (b) { return fetch('/api/notifications', { method: 'POST', headers: h, body: JSON.stringify({ kind: 'booking', bookingId: b.id }) }); })
      .then(function () { document.getElementById('msg').textContent = 'Thanks! We will see you soon.'; f.reset(); });
  });
</script></body></html>`;

const bookApi = (bookings: any[], keeps: boolean): Handler => (req, body, res) => {
    const url = String(req.url);
    if (url === '/api/bookings' && req.method === 'POST') { const b = { id: bookings.length + 1, ...JSON.parse(body || '{}') }; if (keeps) bookings.push(b); return json(res, b, 201); }
    if (url === '/api/bookings' && req.method === 'GET') return json(res, bookings);
    if (url === '/api/notifications' && req.method === 'POST') return json(res, { ok: true }, 201);
    //  The owner's inbox: a visitor sees none.
    if (url === '/api/notifications' && req.method === 'GET') return json(res, []);
    if (url.startsWith('/api/')) return json(res, { error: 'not found' }, 404);
    return false;
};

test('a kept booking followed by a notification POST whose list is empty is never «lost» (C1, probe3 case 2)', async () => {
    const bookings = [{ id: 1, service: 'cut', slot: '11:00' }];
    const { codes } = await walk(BOOK, bookApi(bookings, true));
    expect(bookings.length).toBeGreaterThan(1);
    expect(codes).not.toContain('form_persistence_unproven');
});

test('…and the same booking never kept, its own list empty, is still lost', async () => {
    const bookings: any[] = [];
    const { codes } = await walk(BOOK, bookApi(bookings, false));
    expect(bookings.length).toBe(0);
    expect(codes).toContain('form_persistence_unproven');
});

/* ---- C8: the QA's own asks excuse nothing of the product's ----------------------------------- */

const NOTES = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title>${STYLE}</head><body>
<h1>Notes</h1>
<form id="f"><input name="title" required placeholder="Title"><button>Add note</button></form>
<ul id="list"></ul>
<script>
  fetch('/api/notes').then(function (r) { return r.json(); }).then(function (l) { document.getElementById('list').innerHTML = l.map(function (n) { return '<li>' + n.title + '</li>'; }).join(''); });
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: this.elements.title.value }) });
  });
</script></body></html>`;

test('a 404 at an address the QA asked beside the page is never excused when the product asks it (C8)', async () => {
    let excused: boolean[] = [];
    await walk(NOTES, (req, _body, res) => {
        const url = String(req.url);
        if (url === '/api/notes' && req.method === 'POST') return json(res, { id: 9 }, 201);
        if (url === '/api/notes') return json(res, []);
        if (url.startsWith('/api/')) return json(res, { error: 'not found' }, 404);
        return false;
    }, (tab, origin) => {
        excused = [`${origin}/api/notes/9`, `${origin}/api`].map(u => isExpectedRefusal(tab, 404, u, 'GET'));
    });
    expect(excused).toEqual([false, false]);
});

/* ---- C5: a lone dead nav button is exempt only when another view is really reachable --------- */

async function facts(cases: Record<string, string>): Promise<Record<string, boolean>> {
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const out: Record<string, boolean> = {};
        for (const [k, html] of Object.entries(cases)) {
            await tab.setContent(html);
            out[k] = !!(await tab.evaluate(currentLinkFacts, 'nav button'))?.first;
        }
        return out;
    } finally {
        await browser.close();
    }
}

test('a lone dead «السلة» beside a pager\'s disabled «السابق» or a closed edit panel is not «the first item» (C5, probe2)', async () => {
    const shop = '<main><h1>متجر</h1><ul><li>قهوة</li></ul>';
    const got = await facts({
        alone: `<nav><button>السلة</button></nav>${shop}</main>`,
        pager: `<nav><button>السلة</button></nav>${shop}<div class="pager"><button disabled>السابق</button><button>التالي</button></div></main>`,
        link: `<nav><button>السلة</button></nav>${shop}<a href="#" aria-disabled="true">السابق</a></main>`,
        panel: `<nav><button>السلة</button></nav>${shop}</main><section hidden><h2>تعديل المنتج</h2><button>حفظ</button></section>`,
    });
    expect(got).toEqual({ alone: false, pager: false, link: false, panel: false });
});

test('…while a disabled checkout, or a hidden view another control opens, still says the page has other views', async () => {
    const got = await facts({
        checkout: '<nav><button>السلة</button></nav><main><h1>متجر</h1><ul><li>قهوة</li></ul><aside><button disabled>إتمام الطلب</button></aside></main>',
        view: '<header><button>السلة (0)</button></header><nav><button>العروض</button></nav><main><h1>العروض</h1><ul><li>قهوة</li></ul></main><section hidden><h2>السلة</h2><ul></ul></section>',
    });
    expect(got).toEqual({ checkout: true, view: true });
});
