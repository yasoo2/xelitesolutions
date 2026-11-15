/**
 * ⛔ THE FOURTH REVIEW OF claude/r40-qa (519c7ae0d, 2026-11-15).
 *
 *   B1  The QA deleted an owner's booking 1, end to end: the page read its bookings on load (before the
 *       QA watched), drew rows with no id, and a «Save note» form POSTed {bookingId, note} and answered
 *       the booking. Every guess («is this row the QA's own?») missed it. Now the QA deletes on a server
 *       only a record whose id the server answered to the QA's own marked create — enforced at the
 *       network while it presses (guardDeletes): anything else is stopped, left and told.
 *       The twin: a create answering {id: 42} whose delete is DELETE /api/x/42 deletes exactly that one.
 *   S1  «Thanks! Don't forget: …», «Booking confirmed — not refundable; …», «Order placed, not shipped
 *       yet. …», «Saved! Didn't get the email? …» are successes; «Done? Not yet — …» still is not.
 *   S2  A by-id 404 proves a loss only when it is JSON, the same route answers an id the list holds, and
 *       the write's answer did not hold the record (pending). A moderated review is not lost.
 *   S3  A row's own ids only (a link to /cars/3 is car 3's); a row pushed off a «latest N» list never
 *       makes the QA's create «an edit» when the ids the server named are new.
 *   S4  What the QA edited or left is merged into the report and told — never refusing.
 *   M1  An <aside> sidebar's view switchers are navigation. M2 multipart `id` parts and `?id=` name a
 *       record. M3 «item-12» is 12.
 */
import http from 'http';
import { chromium } from 'playwright';
import {
    probeForms, judgeBehaviour, saysSuccess, isVisibleFormRefusal, listProvesLoss, ownRowVerdict, ownRowFacts,
    shownRecordIds, formEditedRecord, recordIdOfUrl, currentLinkFacts, deleteRequestVerdict, answerHoldsRecord, formBodyPairs,
} from '../core/quality/behaviour-audit';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { qaRecordsToldLine, auditBuiltApp, formatAudit } from '../core/quality/app-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => boolean;
const json = (res: http.ServerResponse, value: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
    return true;
};

/** The page served at /, the api beside it; the real probeForms with the walk's own dialog answer (app-audit.ts). */
async function walk(page: string, api: Handler) {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (api(req, body, res)) return;
            if (!String(req.url).startsWith('/api/')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); return; }
            //  An Express app's default for an api route it does not have: an HTML page, never JSON.
            res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html><body><pre>Cannot ${req.method} ${req.url}</pre></body></html>`);
        });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        tab.on('dialog', (d: any) => (d.type() === 'beforeunload' ? d.dismiss() : d.accept('Joe QA')).catch(() => { }));
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        tab.on('pageerror', e => pageErrors.push(String(e)));
        tab.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'networkidle' });
        const result = await probeForms(tab, { budgetMs: 60_000 });
        const findings = judgeBehaviour([], result.metrics as any, [], result.forms as any).findings;
        return { result, codes: findings.map(f => f.code), pageErrors, consoleErrors };
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}
const STYLE = '<style>body{font-family:sans-serif;margin:16px} input,select,textarea,button{display:block;min-height:40px;margin:6px 0;width:280px}</style>';

/* ---- B1: the owner's booking 1 survives (the review's e2e.js, as a test) ------------------------- */

const BOOKINGS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bookings admin</title>${STYLE}</head><body>
<h1>Bookings</h1>
<form id="f"><label>Booking <select name="booking" id="sel" required></select></label>
<label>Note <textarea name="note" required minlength="3"></textarea></label><button>Save note</button></form>
<p id="msg" role="status"></p>
<table><tbody id="rows"></tbody></table>
<script>
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function draw(list){
  document.getElementById('sel').innerHTML = '<option value="">Choose…</option>' + list.map(function(b){ return '<option value="'+b.id+'">'+b.car+' '+b.date+'</option>'; }).join('');
  var tb = document.getElementById('rows'); tb.innerHTML = '';
  list.forEach(function(b){
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>'+b.car+'</td><td>'+b.date+'</td><td>'+(b.note ? 'Note: '+esc(b.note) : '')+'</td><td><button type="button">Delete</button></td>';
    tr.querySelector('button').addEventListener('click', function(){ if (confirm('Delete?')) fetch('/api/bookings/'+b.id, {method:'DELETE'}).then(load); });
    tb.appendChild(tr);
  });
}
function load(){ return fetch('/api/bookings').then(function(r){return r.json();}).then(draw); }
load();
document.getElementById('f').addEventListener('submit', function(e){ e.preventDefault(); var f=this;
  fetch('/api/bookings/notes', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({bookingId: Number(f.booking.value), note: f.note.value})})
   .then(function(r){ return r.json(); }).then(function(){ document.getElementById('msg').textContent='Note saved.'; f.reset(); load(); });
});
</script></body></html>`;
const bookingsApi = (bookings: any[], deleted: any[]): Handler => (req, body, res) => {
    const url = String(req.url);
    if (url === '/api/bookings' && req.method === 'GET') return json(res, bookings);
    if (url === '/api/bookings/notes' && req.method === 'POST') {
        const b = JSON.parse(body || '{}');
        const k = bookings.find(x => x.id === b.bookingId);
        if (!k) return json(res, { error: 'no booking' }, 400);
        k.note = String(b.note || '');
        return json(res, { ok: true, booking: k });
    }
    const m = url.match(/^\/api\/bookings\/(\d+)$/);
    if (m && req.method === 'DELETE') { const i = bookings.findIndex(x => String(x.id) === m[1]); if (i >= 0) deleted.push(bookings.splice(i, 1)[0]); return json(res, { ok: true }); }
    if (m && req.method === 'GET') { const k = bookings.find(x => String(x.id) === m[1]); return k ? json(res, k) : json(res, { error: 'nf' }, 404); }
    return false;
};

test('(B1) a note saved on the owner\'s booking 1 never gets booking 1 deleted: left or told as edited, and the delete never reaches the server', async () => {
    const bookings = [{ id: 1, car: 'Toyota Corolla', date: '2026-11-20', note: '' }, { id: 2, car: 'Kia Rio', date: '2026-11-22', note: '' }];
    const deleted: any[] = [];
    const { result, pageErrors } = await walk(BOOKINGS, bookingsApi(bookings, deleted));
    expect(deleted).toEqual([]);
    expect(bookings.map(b => b.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
    expect(Number(result.metrics.qaRecordsEdited || 0) + Number(result.metrics.qaRecordsLeft || 0)).toBeGreaterThanOrEqual(1);
    expect(pageErrors).toEqual([]);
});

/** A create whose server answers {id}; its rows carry no id; its delete is DELETE /api/x/:id. */
const NOTES = (lead = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title>${STYLE}</head><body>
<h1>Notes</h1>
<form id="f"><label>Title <input name="title" required></label><button>Add note</button></form>
<p id="msg" role="status"></p>
<ul id="list"></ul>
<script>
function draw(list){
  var ul = document.getElementById('list'); ul.innerHTML = '';
  list.forEach(function(n){
    var li = document.createElement('li'); li.textContent = n.title + ' ';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Delete';
    b.addEventListener('click', function(){ if (confirm('Delete?')) fetch(${lead || "'/api/x/' + n.id"}, {method:'DELETE'}).then(load); });
    li.appendChild(b); ul.appendChild(li);
  });
}
function load(){ return fetch('/api/x').then(function(r){return r.json();}).then(draw); }
load();
document.getElementById('f').addEventListener('submit', function(e){ e.preventDefault(); var f=this;
  fetch('/api/x', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({title: f.title.value})})
   .then(function(r){ return r.json(); }).then(function(){ document.getElementById('msg').textContent='Note added.'; f.reset(); load(); });
});
</script></body></html>`;
const notesApi = (notes: any[], deleted: string[], answersId = true): Handler => (req, body, res) => {
    const url = String(req.url);
    if (url === '/api/x' && req.method === 'GET') return json(res, notes);
    if (url === '/api/x' && req.method === 'POST') {
        const n = { id: 42, title: String(JSON.parse(body || '{}').title || '') };
        notes.push(n);
        return json(res, answersId ? n : { ok: true }, 201);
    }
    const m = url.match(/^\/api\/x\/(\d+)$/);
    if (m && req.method === 'DELETE') { const i = notes.findIndex(x => String(x.id) === m[1]); if (i >= 0) { notes.splice(i, 1); deleted.push(m[1]); } return json(res, { ok: true }); }
    if (m && req.method === 'GET') { const k = notes.find(x => String(x.id) === m[1]); return k ? json(res, k) : json(res, { error: 'nf' }, 404); }
    return false;
};

test('(B1, twin) the QA\'s own create answered {id: 42}: its delete, DELETE /api/x/42, goes through, and only that one', async () => {
    const notes = [{ id: 1, title: 'Owner note' }, { id: 2, title: 'Second owner note' }];
    const deleted: string[] = [];
    const { result } = await walk(NOTES(), notesApi(notes, deleted));
    expect(deleted).toEqual(['42']);
    expect(notes.map(n => n.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(1);
    expect(Number(result.metrics.qaDeletesBlocked || 0)).toBe(0);
});

test('(B1) a create that answers no id is never deleted on the server: the delete is stopped, the row left and told', async () => {
    const notes = [{ id: 1, title: 'Owner note' }];
    const deleted: string[] = [];
    const { result, pageErrors, consoleErrors } = await walk(NOTES(), notesApi(notes, deleted, false));
    expect(deleted).toEqual([]);
    expect(notes.map(n => n.id)).toEqual([1, 42]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
    expect(Number(result.metrics.qaRecordsLeft || 0)).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(result.metrics.qaRecordsLeftEvidence || [])).toContain('delete request named no record the QA made');
    //  Stopped without a word in the page's console or errors: the walk must not blame the product for it.
    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter(e => /ERR_|Failed to load/.test(e))).toEqual([]);
});

test('(B1) two form passes on one page, seconds apart: the second pass\'s own delete is not stopped by the first pass\'s watch (the replay of P179)', async () => {
    const notes: any[] = [{ id: 1, title: 'Owner note' }];
    const deleted: string[] = [];
    let next = 42;
    const api: Handler = (req, body, res) => {
        const url = String(req.url);
        if (url === '/api/x' && req.method === 'GET') return json(res, notes);
        if (url === '/api/x' && req.method === 'POST') { const n = { id: next++, title: String(JSON.parse(body || '{}').title || '') }; notes.push(n); return json(res, n, 201); }
        const m = url.match(/^\/api\/x\/(\d+)$/);
        if (m && req.method === 'DELETE') { const i = notes.findIndex(x => String(x.id) === m[1]); if (i >= 0) { notes.splice(i, 1); deleted.push(m[1]); } return json(res, { ok: true }); }
        return false;
    };
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => { if (api(req, body, res)) return; res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(NOTES()); });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        tab.on('dialog', (d: any) => d.accept().catch(() => { }));
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'networkidle' });
        const first = await probeForms(tab, { budgetMs: 40_000 });
        const second = await probeForms(tab, { budgetMs: 40_000 });
        expect(deleted).toEqual(['42', '43']);
        expect(notes.map(n => n.id)).toEqual([1]);
        expect(Number(first.metrics.qaRecordsDeleted || 0) + Number(second.metrics.qaRecordsDeleted || 0)).toBe(2);
        expect(Number(second.metrics.qaRecordsNotDeleted || 0)).toBe(0);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});

test('(B1) a delete button wired to the owner\'s record (DELETE /api/x/1) next to the QA\'s row is stopped at the network', async () => {
    const notes = [{ id: 1, title: 'Owner note' }];
    const deleted: string[] = [];
    await walk(NOTES("'/api/x/1'"), notesApi(notes, deleted));
    expect(deleted).toEqual([]);
    expect(notes.some(n => n.id === 1)).toBe(true);
});

test('the network rule: only a request naming the QA\'s own ids, and no other record, is let through', () => {
    const own = ['42'];
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/x/42' }, own)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/x/1' }, own)).toBe('block');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/x/42' }, [])).toBe('block');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/x/delete', body: JSON.stringify({ id: 42 }) }, own)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/x/delete', body: JSON.stringify({ ids: [42, 1] }) }, own)).toBe('block');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/x/delete', body: 'id=42' }, own)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/x?id=42' }, own)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/rest/v1/notes?id=eq.42' }, own)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/rest/v1/notes?id=eq.1' }, own)).toBe('block');
    //  A number that is not under a record's key names nothing: «?page=42» is no record 42.
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/x/7?page=42' }, own)).toBe('block');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/graphql', body: JSON.stringify({ query: 'mutation { deleteNote(id: 42) { ok } }' }) }, own)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/graphql', body: JSON.stringify({ query: 'mutation { deleteNote(id: 1) { ok } }' }) }, own)).toBe('block');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/graphql', body: JSON.stringify({ query: 'mutation($noteId: ID!) { deleteNote(id: $noteId) { ok } }', variables: { noteId: '42' } }) }, own)).toBe('allow');
    //  An audit-log write naming nothing is no delete of the QA's record.
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/activity', body: JSON.stringify({ action: 'delete' }) }, own)).toBe('block');
    //  Prefixed ids are the same record (M3).
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/x/note-42' }, own)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/x/remove', body: '------b\r\nContent-Disposition: form-data; name="id"\r\n\r\n42\r\n------b--' }, own)).toBe('allow');
});

/* ---- S1: a success message is a success ----------------------------------------------------------- */

test('(S1) a success that goes on with «don\'t», «not» or «must» in another clause is a success; a denied one is not', () => {
    for (const t of [
        "Thanks! Don't forget: your ID must be shown at check-in.",
        "Thank you! Don't forget, payment must be made on arrival.",
        "Booked! Don't be late: guests must arrive by 3pm.",
        "Saved! Didn't get the email? It must be in your spam folder.",
        'Your booking is confirmed. Not happy? Changes must be made 24h ahead.',
        'Booking confirmed — not refundable; cancellations must be made by phone.',
        'Order placed, not shipped yet. Payment must be made within 24 hours.',
        'شكراً لك! لا تنسَ: يجب أن تحضر الهوية عند الوصول.',
        'تم الحجز. لا تنسَ أنه يجب أن تصل قبل الموعد.',
    ]) {
        expect([t, saysSuccess(t)]).toEqual([t, true]);
        expect([t, isVisibleFormRefusal(t)]).toEqual([t, false]);
    }
    for (const t of [
        'Not saved: title must be at least 3 characters',
        'Booking not confirmed: the date must be in the future',
        'تم رفض الحجز، يجب أن يكون التاريخ في المستقبل',
        'Done? Not yet — the phone must contain 10 digits',
    ]) expect([t, isVisibleFormRefusal(t)]).toEqual([t, true]);
});

/* ---- S2: a by-id 404 proves a loss only when the route is real -------------------------------------- */

test('(S2) a 404 proves a loss only as JSON, from a route that answers a listed id, for a record its answer did not hold', () => {
    const at = 'http://x/api/reviews';
    const base = { answeredIds: ['3'], byIdStatuses: [404], listsBefore: [], at: [at] };
    //  No by-id route (Express's HTML «Cannot GET»): nothing proven.
    expect(listProvesLoss('others', { ...base, byIdJson: [false], controlStatus: 404 })).toBe('');
    //  The app's JSON 404, but the route answers no record the list holds either: nothing proven.
    expect(listProvesLoss('others', { ...base, byIdJson: [true], controlStatus: 404 })).toBe('');
    expect(listProvesLoss('others', { ...base, byIdJson: [true] })).toBe('');
    //  …the route answers a listed record and says «no such record» of this one: lost.
    expect(listProvesLoss('others', { ...base, byIdJson: [true], controlStatus: 200 })).toBe('others');
    //  …unless the write's own answer held it (a review «pending»).
    expect(listProvesLoss('others', { ...base, byIdJson: [true], controlStatus: 200, answer: '{"id":3,"status":"pending"}' })).toBe('');
    expect(answerHoldsRecord('{"review":{"id":3,"status":"awaiting_approval"}}')).toBe(true);
    expect(answerHoldsRecord('{"id":3,"state":"held"}')).toBe(true);
    expect(answerHoldsRecord('{"id":3,"status":"confirmed"}')).toBe(false);
});

function reviews(message: string): string {
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
      .then(function (r) { if (r.ok) { document.getElementById('msg').textContent = ${JSON.stringify(message)}; form.reset(); } });
  });
</script></body></html>`;
}
/** A moderated site: it keeps every review, lists only approved ones, has no by-id route. */
const moderatedApi = (all: any[]): Handler => (req, body, res) => {
    if (req.url !== '/api/reviews') return false;
    if (req.method === 'POST') {
        const r = { id: all.length + 1, ...JSON.parse(body || '{}') };
        all.push({ ...r, approved: false });
        return json(res, r, 201);
    }
    return json(res, all.filter(r => r.approved).map(({ approved, ...r }) => r));
};

test('(S2) a moderated review that says only «Thanks for your review!» is never refused', async () => {
    const all = [{ id: 1, name: 'Sara', text: 'Lovely stay', approved: true }];
    const { codes } = await walk(reviews('Thanks for your review!'), moderatedApi(all));
    expect(all.length).toBeGreaterThan(1);
    expect(codes).not.toContain('form_persistence_unproven');
});

/* ---- S3: a row's own ids; a row pushed off the list ------------------------------------------------- */

test('(S3) a row\'s ids are its own — never a linked car\'s or customer\'s — and the page\'s before-set reads ids the way the row does', async () => {
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage();
        //  Served from an address, so its links are addresses (a page set with setContent has none to resolve against).
        let html = '';
        await tab.route('http://app.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
        const show = async (body: string) => { html = body; await tab.goto('http://app.test/'); };
        //  Before the QA's booking: the owner's booking 7, linking car 4 and customer 11; the nav links car 3.
        await show(`<nav><a href="/cars/3">Corolla</a><a href="/cars/4">Rio</a></nav><table><tbody id="b">
<tr><td>Booking 7</td><td><a href="/cars/4">Rio</a></td><td><a href="/customers/11">Omar</a></td><td><button onclick="del(7)">Delete</button></td></tr>
</tbody></table>`);
        const before = await tab.evaluate(shownRecordIds);
        //  …and the QA's own booking 9, linking car 3 (shown before) and its customer 12.
        await tab.evaluate(() => document.getElementById('b')!.insertAdjacentHTML('beforeend', '<tr><td>QA guest qa7xk2a</td><td><a href="/cars/3">Corolla</a></td><td><a href="/customers/12">QA</a></td><td><button class="d" onclick="del(9)">Delete</button></td></tr>'));
        await tab.evaluate(() => document.querySelector('.d')!.setAttribute('data-s', '1'));
        const f = await tab.evaluate(ownRowFacts, { sel: '[data-s="1"]', needle: 'qa7xk2a' });
        expect(f!.ids).toEqual(['9']);
        expect(ownRowVerdict({ mark: 'qa7xk2a', rowText: f!.text, rowIds: f!.ids, markedIds: ['9'], typed: ['QA guest qa7xk2a'], beforeIds: new Set(before), beforeRows: [], nowRows: f!.rows })).toEqual({ ok: true, edited: false, why: '' });
        //  The before-set: every id-like part of a link («/items/5/edit» is 5), handler arguments, button and option values, a prefixed id.
        await show(`<ul><li>Owner movie A <a href="/items/5/edit">Edit</a> <button>Delete</button></li>
<li>Owner movie B <button name="id" value="6">Remove</button></li><li data-id="row-7">Owner movie C</li></ul><select><option value="8">Car 8</option></select>`);
        const shown = await tab.evaluate(shownRecordIds);
        for (const id of ['5', '6', '7', 'row-7', '8']) expect([id, shown.includes(id)]).toEqual([id, true]);
        //  …and a handler's argument.
        await show('<ul><li>Owner movie D <button onclick="del(15)">Delete</button></li></ul>');
        expect((await tab.evaluate(shownRecordIds)).includes('15')).toBe(true);
    } finally {
        await browser.close();
    }
});

test('(S3b, B1 guard 3) the row\'s text only vetoes: a page of three pushing one row off is no edit when the server\'s ids are new; an owner\'s row gaining a label is', () => {
    const mark = 'qa7xk2a';
    //  A QA create on a «latest 3» list: the last row pushed off; the id the server named is new.
    expect(ownRowVerdict({
        mark, rowText: `qa title ${mark} delete`, rowIds: [], markedIds: ['104'], typed: [`QA title ${mark}`],
        beforeIds: ['101', '102', '103'], beforeRows: ['buy milk delete', 'walk dog delete', 'read book delete'],
        nowRows: [`qa title ${mark} delete`, 'buy milk delete', 'walk dog delete'],
    })).toEqual({ ok: true, edited: false, why: '' });
    //  An owner's edited booking that gained «notes:», with a blind before-set: vetoed.
    expect(ownRowVerdict({
        mark, rowText: `booking ali 2026-11-20 toyota corolla notes: qa note ${mark} edit delete`,
        rowIds: [], markedIds: ['5'], typed: [`QA note ${mark}`],
        beforeIds: new Set(['edit', 'delete']), beforeRows: ['booking ali 2026-11-20 toyota corolla edit delete', 'booking omar 2026-11-22 kia rio edit delete'],
        nowRows: [`booking ali 2026-11-20 toyota corolla notes: qa note ${mark} edit delete`, 'booking omar 2026-11-22 kia rio edit delete'],
    }).ok).toBe(false);
    //  …and a select the QA set to another car: what it chose is what it typed.
    expect(ownRowVerdict({
        mark, rowText: `toyota 2026-12-01 ${mark} delete`, rowIds: [], markedIds: [], typed: ['2026-12-01', `QA ${mark}`, 'toyota'],
        beforeIds: [], beforeRows: ['kia 2026-11-20 delete', 'bmw 2026-11-21 delete'],
        nowRows: [`toyota 2026-12-01 qa ${mark} delete`, 'bmw 2026-11-21 delete'],
    }).ok).toBe(false);
    //  M3: a row carrying data-id="item-12", the record 12 read before.
    expect(ownRowVerdict({ mark, rowText: `qa ${mark} delete`, rowIds: ['item-12'], markedIds: [], typed: [`QA ${mark}`], beforeIds: new Set(['12']), beforeRows: ['x delete'], nowRows: [`qa ${mark} delete`] }))
        .toMatchObject({ ok: false, edited: true });
});

/* ---- M2: a multipart id, a ?id= ------------------------------------------------------------------- */

test('(M2) a multipart `id` part and a `?id=` in the address name the record the write edited', () => {
    const mark = 'qa7xk2a';
    expect(recordIdOfUrl('http://x/api/bookings/update?id=5')).toBe('5');
    expect(formEditedRecord([{ at: 'http://x/api/bookings/update?id=5', method: 'POST', body: JSON.stringify({ notes: `QA ${mark}` }), answer: '{"ok":true}' }],
        mark, { openedFilled: false, rowsGrew: false, seenIds: new Set(['5']) }).edited).toBe(true);
    const multipart = `------b\r\nContent-Disposition: form-data; name="id"\r\n\r\n5\r\n------b\r\nContent-Disposition: form-data; name="notes"\r\n\r\nQA ${mark}\r\n------b--`;
    expect(formBodyPairs(multipart)).toEqual([['id', '5'], ['notes', `QA ${mark}`]]);
    expect(formEditedRecord([{ at: 'http://x/api/bookings', method: 'POST', body: multipart, answer: '' }], mark, { openedFilled: false, rowsGrew: true, seenIds: new Set(['5']) }).edited).toBe(true);
});

/* ---- M1: an aside sidebar is navigation ----------------------------------------------------------- */

test('(M1) views switched from an <aside> sidebar still show a lone first nav item has other views', async () => {
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const first = async (html: string) => { await tab.setContent(html); return !!(await tab.evaluate(currentLinkFacts, 'nav button'))?.first; };
        expect(await first('<nav><button>Overview</button></nav><aside><button>Reports</button></aside><main><section><h1>Overview</h1><p>x</p></section><section hidden><h2>Reports</h2></section></main>')).toBe(true);
        expect(await first('<nav><button>Overview</button></nav><div role="complementary"><button>Reports</button></div><main><section><h1>Overview</h1><p>x</p></section><section hidden><h2>Reports</h2></section></main>')).toBe(true);
        //  Nothing names the hidden view: still alone.
        expect(await first('<nav><button>Overview</button></nav><main><section><h1>Overview</h1><p>x</p></section><section hidden><h2>Reports</h2></section></main>')).toBe(false);
    } finally {
        await browser.close();
    }
});

/* ---- S4: told in the report ------------------------------------------------------------------------ */

test('(S4) what the QA edited or left in his app is a told line of the report, in Arabic and English', () => {
    const a = { qaRecordsEdited: 1, qaRecordsLeft: 2, qaDeletesBlocked: 1, formsListUnprovenLoss: 0, qaRecordsTold: [{ form: 'Save note', why: 'x', kind: 'edited' as const }, { form: 'Add note', why: 'y', kind: 'left' as const }] };
    const ar = qaRecordsToldLine(a, true);
    expect(ar).toContain('عدّل الفحص 1');
    expect(ar).toContain('ترك 2 سجل اختبار');
    expect(ar).toContain('«Add note»');
    expect(ar).toContain('لا يمنع التسليم');
    expect(qaRecordsToldLine(a, false)).toContain('left 2 test record(s)');
    expect(qaRecordsToldLine({}, true)).toBe('');
});

test('(S4) through the whole walk: the test record the QA left is counted in the audit (mergeProbe) and told in its Arabic report', async () => {
    const notes = [{ id: 1, title: 'Owner note' }];
    const deleted: string[] = [];
    const api = notesApi(notes, deleted, false);
    const page = NOTES();
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-s4-'));
    try {
        fs.writeFileSync(path.join(dir, 'index.html'), page);
        const audit: any = await auditBuiltApp(dir, { timeoutMs: 60_000, serveUrl: `http://127.0.0.1:${(server.address() as any).port}/`, request: 'a notes app: add a note, list the notes, delete a note' });
        expect(deleted).toEqual([]);
        expect(notes.some(n => n.id === 1)).toBe(true);
        expect(Number(audit.qaRecordsLeft || 0)).toBeGreaterThanOrEqual(1);
        expect(formatAudit(audit, true)).toContain('سجل اختبار أنشأه في تطبيقك دون حذف');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        await new Promise<void>(r => server.close(() => r()));
    }
});
