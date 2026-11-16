/**
 * ⛔ THE THIRD REVIEW OF claude/r40-qa (93c56b495, 2026-11-15).
 *
 *   1  THE QA NEVER DELETES A RECORD THAT EXISTED BEFORE IT STARTED. (A) an «Edit movie» form POSTed
 *      /api/items/1, then the page POSTed /api/activity, which answered {"id":99}: movie 1 was deleted.
 *      (B) the save was POST /api/items with the id in its body, the list appeared after it: the owner's
 *      movie was left holding the QA's values and nothing was told. The create twins still delete the
 *      QA's own new record.
 *   2  «Not saved: …», «Booking not confirmed: …», «تم رفض الحجز …», «Done? Not yet …» are refusals.
 *   3+4 a list lacking the record proves it lost only when the id the POST answered, asked, is 404 — or,
 *      with no id, when the page read that same list non-empty before the submit.
 *   5  a disabled «أضف إلى السلة» on a card, or a card's «تعديل» beside a closed edit panel, does not make
 *      a lone dead «السلة» «the first item».
 *   •  recordIdOfUrl: «s3upload» and «2024slots» are no ids.
 */
import http from 'http';
import { chromium } from 'playwright';
import {
    probeForms, judgeBehaviour, currentLinkFacts, isVisibleFormRefusal, saysSuccess, recordIdOfUrl, formEditedRecord,
    ownRowVerdict, listProvesLoss, idsOfRecordsHolding, idsInJson, serverListVerdict,
} from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => boolean;

async function walk(page: string, api: Handler) {
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

/* ---- 1: the owner's record survives an edit; the QA's own new record is still deleted ----------- */

const FORMS = {
    edit: '<form id="f"><h2>Edit movie</h2><input type="hidden" name="id" value="1"><label>Title <input name="name" required value="Seed movie"></label><button>Save changes</button></form>',
    create: '<form id="f"><h2>New movie</h2><label>Title <input name="name" required></label><button>Add movie</button></form>',
};
function cinema(form: 'edit' | 'create', save: string, listHidden = false, remembersShown = false): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cinema admin</title>${STYLE}</head><body>
<h1>Movies</h1><ul id="list"${listHidden ? ' hidden' : ''}></ul>
${FORMS[form]}
<script>
  var h = { 'content-type': 'application/json' };
  function load() {
    return fetch('/api/items').then(function (r) { return r.json(); }).then(function (list) {
      document.getElementById('list').innerHTML = list.map(function (m) { return '<li>' + m.name + ' <button type="button" data-id="' + m.id + '">Delete</button></li>'; }).join('');
      document.querySelectorAll('#list button').forEach(function (b) { b.onclick = function () { fetch('/api/items/' + b.dataset.id, { method: 'DELETE' }).then(load); }; });
    });
  }
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = this;
    ${save}
  });
  ${remembersShown ? "try { if (localStorage.getItem('shown')) document.getElementById('list').hidden = false; } catch (e) { }" : ''}
  load();
</script></body></html>`;
}
/** POST /api/items makes a movie, or changes the one its body names; POST /api/items/:id changes it; /api/activity is an audit log. */
const moviesApi = (list: Array<{ id: number; name: string }>): Handler => (req, body, res) => {
    const url = String(req.url);
    if (url === '/api/activity' && req.method === 'POST') return json(res, { id: 99, action: 'save' }, 201);
    if (!url.startsWith('/api/items')) return false;
    if (req.method === 'GET' && url === '/api/items') return json(res, list);
    const sent = JSON.parse(body || '{}');
    const id = Number(url.split('/')[3] || sent.id || 0);
    if (req.method === 'POST' && !id) {
        const m = { id: Math.max(0, ...list.map(x => x.id)) + 1, name: String(sent.name || '') };
        list.push(m);
        return json(res, m, 201);
    }
    const at = list.findIndex(x => x.id === id);
    if (at < 0) return json(res, { error: 'no such movie' }, 404);
    if (req.method === 'POST') { list[at].name = String(sent.name || list[at].name); return json(res, { ok: true }); }
    if (req.method === 'GET') return json(res, list[at]);
    if (req.method === 'DELETE') { list.splice(at, 1); res.writeHead(204); res.end(); return true; }
    return false;
};
const seed = () => [{ id: 1, name: 'Seed movie' }, { id: 2, name: 'Second feature' }];
const LOGGED = ".then(function () { return fetch('/api/activity', { method: 'POST', headers: h, body: JSON.stringify({ action: 'save' }) }); }).then(load);";

test('(A) an edit saved by POST /api/items/1, then an audit-log POST answering {"id":99}: movie 1 survives and the edit is told', async () => {
    const list = seed();
    const { result } = await walk(cinema('edit', `fetch('/api/items/1', { method: 'POST', headers: h, body: JSON.stringify({ name: f.elements.name.value }) })${LOGGED}`), moviesApi(list));
    expect(list.map(m => m.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
    expect(Number(result.metrics.qaRecordsEdited || 0)).toBeGreaterThanOrEqual(1);
});

test('(A, twin) a create form followed by the same audit-log POST still deletes the QA\'s own new movie, and only it', async () => {
    const list = seed();
    const { result } = await walk(cinema('create', `fetch('/api/items', { method: 'POST', headers: h, body: JSON.stringify({ name: f.elements.name.value }) })${LOGGED}`), moviesApi(list));
    expect(list.map(m => m.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBeGreaterThanOrEqual(1);
    expect(Number(result.metrics.qaRecordsEdited || 0)).toBe(0);
});

test('(B) an edit saved by POST /api/items with the id in its body, the list shown after it: movie 1 survives and the edit is told', async () => {
    const list = seed();
    const { result } = await walk(cinema('edit', `fetch('/api/items', { method: 'POST', headers: h, body: JSON.stringify({ id: Number(f.elements.id.value), name: f.elements.name.value }) })
      .then(function () { document.getElementById('list').hidden = false; return load(); });`, true), moviesApi(list));
    expect(list.map(m => m.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
    expect(Number(result.metrics.qaRecordsEdited || 0)).toBeGreaterThanOrEqual(1);
});

test('(B, twin) the same page with a create form, the list shown after it (and after a reload), deletes only the QA\'s own', async () => {
    const list = seed();
    //  The rows that were there were hidden when the QA wrote them down: still what was there before.
    const { result } = await walk(cinema('create', `fetch('/api/items', { method: 'POST', headers: h, body: JSON.stringify({ name: f.elements.name.value }) })
      .then(function () { try { localStorage.setItem('shown', '1'); } catch (e) { } document.getElementById('list').hidden = false; return load(); });`, true, true), moviesApi(list));
    expect(list.map(m => m.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBeGreaterThanOrEqual(1);
});

test('the invariant itself: an id or a row that was there before is never deletable; a new one is', () => {
    const mark = 'mhx1-abcdea';
    const base = { mark, typed: [`Joe QA ${mark}`], beforeIds: ['1', '2'], beforeRows: ['seed movie delete', 'second feature delete'] };
    //  Its id was shown before: edited, told, never deleted.
    expect(ownRowVerdict({ ...base, rowText: `joe qa ${mark} delete`, rowIds: ['1'], nowRows: [`joe qa ${mark} delete`, 'second feature delete'] })).toMatchObject({ ok: false, edited: true });
    //  …or named by the server's own list as the record holding the mark.
    expect(ownRowVerdict({ ...base, rowText: `joe qa ${mark} delete`, rowIds: [], markedIds: ['2'], nowRows: [`joe qa ${mark} delete`] })).toMatchObject({ ok: false, edited: true });
    //  No id: the row is the owner's row with the QA's values typed into it.
    expect(ownRowVerdict({ ...base, rowText: `joe qa ${mark} delete`, rowIds: [], nowRows: [`joe qa ${mark} delete`, 'second feature delete'] })).toMatchObject({ ok: false, edited: true });
    expect(ownRowVerdict({ ...base, beforeRows: ['seed movie 2010 delete', 'second feature 1999 delete'], rowText: `seed movie 2010 ${mark} delete`, rowIds: [], nowRows: [`seed movie 2010 ${mark} delete`, 'second feature 1999 delete'] })).toMatchObject({ ok: false, edited: true });
    //  A new record: a new id, every row of before still shown.
    expect(ownRowVerdict({ ...base, rowText: `joe qa ${mark} delete`, rowIds: ['3'], nowRows: ['seed movie delete', 'second feature delete', `joe qa ${mark} delete`] })).toEqual({ ok: true, edited: false, why: '' });
    expect(ownRowVerdict({ ...base, rowText: `joe qa ${mark} delete`, rowIds: [], nowRows: ['seed movie delete', 'second feature delete', `joe qa ${mark} delete`] })).toEqual({ ok: true, edited: false, why: '' });
    //  The records holding the mark in an answer: the innermost one, never its parent.
    expect(idsOfRecordsHolding(JSON.stringify({ id: 3, name: 'Coffee', reviews: [{ id: 9, text: `ok ${mark}` }] }), mark)).toEqual(['9']);
    expect(idsInJson(JSON.stringify({ items: [{ id: 1 }, { _id: 'a1' }], total: 2 }))).toEqual(['1', 'a1']);
    //  The form's own writes decide (A, B); an audit log's new id never turns an edit into a create.
    const edit = { at: 'http://x/api/items/1', body: JSON.stringify({ name: `Joe QA ${mark}` }), method: 'POST', answer: '{"id":1}' };
    const log = { at: 'http://x/api/activity', body: '{"action":"save"}', method: 'POST', answer: '{"id":99}' };
    expect(formEditedRecord([edit, log], mark, { openedFilled: true, rowsGrew: false, seenIds: ['1', '2'] }).edited).toBe(true);
    expect(formEditedRecord([{ at: 'http://x/api/items', body: `id=1&name=Joe+QA+${mark}`, method: 'POST', answer: '{"ok":true}' }], mark, { openedFilled: true, rowsGrew: true, seenIds: ['1'] }).edited).toBe(true);
    expect(formEditedRecord([{ at: 'http://x/api/items', body: JSON.stringify({ name: `Joe QA ${mark}` }), method: 'POST', answer: '{"id":3}' }, log], mark, { openedFilled: false, rowsGrew: true, seenIds: ['1', '2'] }).edited).toBe(false);
    //  A review form naming its product (product_id) is no edit of the product.
    expect(formEditedRecord([{ at: 'http://x/api/reviews', body: JSON.stringify({ product_id: 1, text: `ok ${mark}` }), method: 'POST', answer: '{"id":7}' }], mark, { openedFilled: false, rowsGrew: false, seenIds: ['1'] }).edited).toBe(false);
});

/* ---- 2: a denied success word is no success ----------------------------------------------------- */

test('a refusal that holds a denied success word is a refusal; a real success still is not (finding 2)', () => {
    for (const t of [
        'Not saved: title must be at least 3 characters',
        'Booking not confirmed: the date must be in the future',
        'تم رفض الحجز، يجب أن يكون التاريخ في المستقبل',
        'Done? Not yet — the phone must contain 10 digits',
    ]) expect([t, isVisibleFormRefusal(t)]).toEqual([t, true]);
    for (const t of [
        'تم استلام طلبك بنجاح، يرجى الاحتفاظ برقم الطلب',
        'Thank you! Your booking is confirmed. Please keep your booking number',
        'تم الحجز بنجاح، يجب الحضور قبل الموعد بعشر دقائق',
        'Order placed — you must pay at the door',
    ]) expect([t, isVisibleFormRefusal(t)]).toEqual([t, false]);
    expect(saysSuccess('Your order was not placed')).toBe(false);
    expect(saysSuccess('تم إلغاء الطلب')).toBe(false);
    expect(saysSuccess('تم الحفظ')).toBe(true);
    expect(saysSuccess('Saved.')).toBe(true);
});

/* ---- 3+4: a list proves a loss only when it could have shown the record ------------------------- */

test('a moderated review and a guest\'s order are not lost by a list never meant to show them (findings 3, 4)', () => {
    const mark = 'mhx1-abcdea';
    const at = 'http://x/api/reviews';
    const review = [{ at, body: JSON.stringify({ name: `Joe QA ${mark}`, text: `ok ${mark}` }), method: 'POST', answer: '{"id":3,"name":"Joe QA"}' }];
    const lacks = serverListVerdict(review, [{ at, body: JSON.stringify([{ id: 1, name: 'Sara', text: 'great' }, { id: 2, name: 'Ali', text: 'nice' }]) }], mark, 'Thank you for your review!', [`Joe QA ${mark}`]);
    expect(lacks).toBe('others');
    //  Its id, asked, was answered (or refused as a guest's): not measured.
    expect(listProvesLoss(lacks, { answeredIds: ['3'], byIdStatuses: [200], listsBefore: [], at: [at] })).toBe('');
    expect(listProvesLoss(lacks, { answeredIds: ['3'], byIdStatuses: [401], listsBefore: [], at: [at] })).toBe('');
    expect(listProvesLoss(lacks, { answeredIds: ['3'], byIdStatuses: [], listsBefore: [], at: [at] })).toBe('');
    //  …and a 404 for that very id is the proof — the app's own JSON 404, from a route that answers a record the list holds (the fourth review, S2).
    expect(listProvesLoss(lacks, { answeredIds: ['3'], byIdStatuses: [404], byIdJson: [true], controlStatus: 200, listsBefore: [], at: [at] })).toBe('others');
    expect(listProvesLoss(lacks, { answeredIds: ['3'], byIdStatuses: [404], listsBefore: [], at: [at] })).toBe('');
    //  No id: the page's own list, read before the submit, must have shown this visitor records.
    const orders = 'http://x/api/orders';
    expect(listProvesLoss('empty', { answeredIds: [], byIdStatuses: [], listsBefore: [{ at: orders, body: '[]' }], at: [orders] })).toBe('');
    expect(listProvesLoss('empty', { answeredIds: [], byIdStatuses: [], listsBefore: [], at: [orders] })).toBe('');
    expect(listProvesLoss('others', { answeredIds: [], byIdStatuses: [], listsBefore: [{ at: 'http://x/api/notifications', body: '[{"id":1}]' }], at: [orders] })).toBe('');
    expect(listProvesLoss('others', { answeredIds: [], byIdStatuses: [], listsBefore: [{ at: `${orders}?page=1`, body: '{"orders":[{"id":1}]}' }], at: [orders] })).toBe('others');
    //  …or read on the page's own load, before the forms started: the rows it showed hold what that list holds now.
    const now = [{ at: orders, body: JSON.stringify([{ id: 1, title: 'Kick-off agenda' }]) }];
    expect(listProvesLoss('others', { answeredIds: [], byIdStatuses: [], listsBefore: [], at: [orders], listsNow: now, rowsBefore: ['kick-off agenda delete'] })).toBe('others');
    expect(listProvesLoss('others', { answeredIds: [], byIdStatuses: [], listsBefore: [], at: [orders], listsNow: now, rowsBefore: ['another visitor row'] })).toBe('');
    expect(listProvesLoss('empty', { answeredIds: [], byIdStatuses: [], listsBefore: [], at: [orders], listsNow: [{ at: orders, body: '[]' }], rowsBefore: ['kick-off agenda'] })).toBe('');
});

function bookingPage(): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Guest house</title>${STYLE}</head><body>
<h1>Book a room</h1>
<form id="f"><label>Guest name <input name="name" required></label><button>Book</button></form>
<p id="msg" role="status"></p>
<h2>Your bookings</h2><ul id="mine"></ul>
<script>
  function load() { fetch('/api/bookings').then(function (r) { return r.json(); }).then(function (list) { document.getElementById('mine').innerHTML = list.map(function (b) { return '<li>Booking #' + b.id + '</li>'; }).join(''); }); }
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    fetch('/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.elements.name.value }) })
      .then(function (r) { return r.json(); }).then(function (b) { document.getElementById('msg').textContent = 'Thank you! Booking #' + b.id + ' received.'; });
  });
  load();
</script></body></html>`;
}
/**
 * A guest's bookings: the list is a signed-in member's ([] for a guest); a booking asked by its id answers
 * 401 when kept, 404 when not. `listed`: the list shows everyone this booking instead (a public board),
 * which its by-id route answers — the route is real, and its 404 for the QA's booking proves the loss.
 */
const guestApi = (kept: any[], keeps: boolean, listed: any[] = []): Handler => (req, body, res) => {
    const url = String(req.url);
    if (url === '/api/bookings' && req.method === 'POST') {
        const b = { id: 7, name: String(JSON.parse(body || '{}').name || '') };
        if (keeps) kept.push(b);
        return json(res, b, 201);
    }
    if (url === '/api/bookings') return json(res, listed);
    const m = url.match(/^\/api\/bookings\/(\d+)$/);
    if (m && listed.some(b => String(b.id) === m[1])) return json(res, listed.find(b => String(b.id) === m[1]));
    if (m) return kept.some(b => String(b.id) === m[1]) ? json(res, { error: 'sign in' }, 401) : json(res, { error: 'not found' }, 404);
    return false;
};

test('a guest\'s booking, kept, on a list that shows a guest nothing, is not measured — never refused (finding 4)', async () => {
    const kept: any[] = [];
    const { codes, result } = await walk(bookingPage(), guestApi(kept, true));
    expect(kept.length).toBeGreaterThan(0);
    expect(codes).not.toContain('form_persistence_unproven');
    expect(Number(result.metrics.formsPersistenceUnmeasured || 0)).toBeGreaterThanOrEqual(1);
});

test('…and the same booking, its id asked and answered 404 by the route that answers the booking its list shows, is lost', async () => {
    const kept: any[] = [];
    const { codes } = await walk(bookingPage(), guestApi(kept, false, [{ id: 1, name: 'Sara' }]));
    expect(kept.length).toBe(0);
    expect(codes).toContain('form_persistence_unproven');
});

/* ---- 5: a lone dead nav item --------------------------------------------------------------------- */

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

test('a card\'s «تعديل» beside a closed edit panel, or an out-of-stock add-to-cart, does not make a lone dead «السلة» «the first item» (finding 5, probe2)', async () => {
    const got = await facts({
        panel: '<nav><button>السلة</button></nav><main><section><h1>متجر</h1><ul><li>قهوة <button>تعديل</button></li></ul></section><section hidden><h2>تعديل المنتج</h2><button>حفظ</button></section></main>',
        stockAr: '<nav><button>السلة</button></nav><main><h1>متجر</h1><ul><li>قهوة <button disabled>أضف إلى السلة</button></li></ul></main>',
        stockEn: '<nav><button>Cart</button></nav><main><h1>Shop</h1><ul><li>Coffee <button disabled>Add to cart</button></li></ul></main>',
        alone: '<nav><button>السلة</button></nav><main><h1>متجر</h1><ul><li>قهوة</li></ul></main>',
        //  Still another view: a disabled checkout outside the records, a hidden view a header control names.
        checkout: '<nav><button>السلة</button></nav><main><h1>متجر</h1><ul><li>قهوة</li></ul><aside><button disabled>إتمام الطلب</button></aside></main>',
        view: '<header><button>السلة (0)</button></header><nav><button>العروض</button></nav><main><h1>العروض</h1><ul><li>قهوة</li></ul></main><section hidden><h2>السلة</h2><ul></ul></section>',
    });
    expect(got).toEqual({ panel: false, stockAr: false, stockEn: false, alone: false, checkout: true, view: true });
});

/* ---- recordIdOfUrl ------------------------------------------------------------------------------- */

test('only digits, a UUID or eight hex digits or more are a record\'s id in an address', () => {
    expect(recordIdOfUrl('http://h/api/s3upload')).toBe('');
    expect(recordIdOfUrl('http://h/api/bookings/2024slots')).toBe('');
    expect(recordIdOfUrl('http://h/api/items/latest2')).toBe('');
    expect(recordIdOfUrl('http://h/api/items/abc123def')).toBe('abc123def');
    expect(recordIdOfUrl('http://h/api/items/42')).toBe('42');
    expect(recordIdOfUrl('http://h/api/items/42/update')).toBe('42');
    expect(recordIdOfUrl('http://h/api/items/3f2a9c1e-7b4d-4e8a-9c0d-1a2b3c4d5e6f')).toBe('3f2a9c1e-7b4d-4e8a-9c0d-1a2b3c4d5e6f');
    expect(recordIdOfUrl('http://h/api/items/65f1c2a9e4b0a1b2c3d4e5f6')).toBe('65f1c2a9e4b0a1b2c3d4e5f6');
});
