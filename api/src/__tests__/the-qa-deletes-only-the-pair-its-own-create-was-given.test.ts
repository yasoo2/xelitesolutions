/**
 * ⛔ THE FIFTH REVIEW OF claude/r40-qa (1a8ef86ef, 2026-11-15).
 *
 *   B1  The QA still deleted an owner's booking 1, end to end: «Add note» POSTed /api/bookings/1/notes, the
 *       server answered the booking (or the new note, numbered 1 too), and DELETE /api/bookings/1 was let
 *       through — note 1 was booking 1. Now an allowed id is a pair (the collection the create went to, the
 *       id given there), every id-like value of the create's own address, body and page address is its
 *       context (never the QA's), and the row's text always runs unless the row carries the allowed id.
 *   S1  An answered «note-1», «ord_1» or «007» allowed record 1 or 7 of any collection: ids match exactly.
 *   S2  A sound app's DELETE /api/projects/3/tasks/41 was stopped (its project 3 «another record»), and its
 *       console.error failed the phase. The parent is neutral now; a stopped request's noise is the QA's,
 *       excused and told; an id comes from a 201's Location and from the re-read list too.
 *   S3  A delete sent over a WebSocket passed: no delete is pressed while the page holds a socket.
 *   S4  An analytics beacon or a token refresh sent during a press was stopped and counted: only writes to
 *       the page's own origins are judged (and deletes anywhere).
 *   S5  A moderated review's by-id 404 is no loss.
 *   S6  readIdsStore re-asked what the page had fetched (side effects on the live app), lost lists over
 *       400 KB, and missed a GraphQL query after large variables.
 *   S7  A delete 12 s after a press, POST …/cancel and PATCH {status: "cancelled"} passed: the guard stays
 *       until the walk ends, and cancel, archive, a deleted flag and a method override are deletes too.
 *   M1  deleteAllBookings(userId: 1) and {"where": {"booking": 1}, "id": 7} named more than the QA's record.
 *   M3  Blocked-request evidence carries no query string. M4 «but not», «لكن لم» take a success back.
 */
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import {
    probeForms, judgeBehaviour, deleteRequestVerdict, guardDeletes, startWalkWatch, endWalkWatch, causedByStoppedDelete,
    readIdsStore, listProvesLoss, saysSuccess, isVisibleFormRefusal, collectionOfCreate, collectionOfAddress, sameCollection,
    ownRowVerdict, MODERATED_WORDS, bodyAsksDelete,
} from '../core/quality/behaviour-audit';
import { auditBuiltApp, formatAudit, qaRecordsToldLine } from '../core/quality/app-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => boolean;
const json = (res: http.ServerResponse, value: unknown, status = 200, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(value));
    return true;
};
const STYLE = '<style>body{font-family:sans-serif;margin:16px} input,select,textarea,button{display:block;min-height:40px;margin:6px 0;width:280px}</style>';

/** A server: `api` first, then the page at every other address; WebSocket frames the page sends are written to `frames`. */
async function serve(page: string | ((url: string) => string), api: Handler, frames?: string[]) {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (api(req, body, res)) return;
            if (String(req.url).startsWith('/api/')) { res.writeHead(404, { 'content-type': 'text/html' }); res.end(`Cannot ${req.method} ${req.url}`); return; }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(typeof page === 'function' ? page(String(req.url)) : page);
        });
    });
    const upgraded = new Set<any>();
    server.on('upgrade', (req, sock) => {
        upgraded.add(sock);
        const key = String(req.headers['sec-websocket-key'] || '');
        const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        sock.on('data', (d: Buffer) => {
            if ((d[0] & 0x0f) !== 1) return;
            const len = d[1] & 127;
            const mask = d.slice(2, 6);
            frames?.push(Buffer.from(d.slice(6, 6 + len).map((b, i) => b ^ mask[i % 4])).toString());
        });
        sock.on('error', () => { /* the page went away */ });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return { server, base: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>(r => { for (const s of upgraded) s.destroy(); server.closeAllConnections?.(); server.close(() => r()); }) };
}

/** The real probeForms on a page, watched from its first load as app-audit watches it, with the walk's own dialog answer. */
async function walk(page: string | ((url: string) => string), api: Handler, at = '/', frames?: string[]) {
    const site = await serve(page, api, frames);
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        tab.on('dialog', (d: any) => (d.type() === 'beforeunload' ? d.dismiss() : d.accept('Joe QA')).catch(() => { }));
        const errors: string[] = [];
        tab.on('pageerror', e => errors.push(`pageerror ${String(e)}`));
        tab.on('console', m => { if (m.type() === 'error' && !/favicon|40[13]/.test(m.text())) errors.push(m.text()); });
        startWalkWatch(tab);
        await tab.goto(`${site.base}${at}`, { waitUntil: 'networkidle' });
        const result = await probeForms(tab, { budgetMs: 60_000 });
        await endWalkWatch(tab);
        const findings = judgeBehaviour([], result.metrics as any, [], result.forms as any).findings;
        return { result, codes: findings.map(f => f.code), errors };
    } finally {
        await browser.close();
        await site.close();
    }
}
const told = (m: Record<string, any>) => JSON.stringify([...(m.qaRecordsLeftEvidence || []), ...(m.qaRecordsEditedEvidence || []), ...(m.qaDeletesBlockedEvidence || [])]);

/* ---- B1: the owner's booking 1 survives a nested note (the review's e2e-parent.js, both modes) ---------- */

function bookingSite(mode: 'parent' | 'collide') {
    const booking: any = { id: 1, car: 'Toyota Corolla', date: '2026-11-20', customer: { id: 12, name: 'Sara Haddad' }, notes: [] };
    let noteSeq = 0;
    const deleted: any[] = [];
    const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const card = () => `<article class="booking"><h2>${booking.car}</h2><p>Date ${booking.date} · Customer <a href="/customers/${booking.customer.id}">${booking.customer.name}</a></p>
<h3>Notes</h3><ul class="notes">${booking.notes.map((n: any) => `<p class="note">${esc(n.text)}</p>`).join('')}</ul>
<div class="actions"><button type="button" class="del">Delete booking</button></div></article>`;
    const page = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Booking</title>${STYLE}</head><body>
<nav><a href="/">Bookings</a> <a href="/customers">Customers</a></nav>
<main id="main">${card()}</main>
<form id="f"><label>Note <textarea name="note" required minlength="3"></textarea></label><button>Add note</button></form>
<p id="msg" role="status"></p>
<script>
function wire(){ var b = document.querySelector('.del'); if (b) b.addEventListener('click', function(){ if (confirm('Delete this booking?')) fetch('/api/bookings/1', {method:'DELETE'}).then(function(){ document.getElementById('main').innerHTML = '<p>Booking deleted.</p>'; }); }); }
wire();
document.getElementById('f').addEventListener('submit', function(e){ e.preventDefault(); var f = this;
  fetch('/api/bookings/1/notes', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({note: f.note.value})})
   .then(function(r){ return r.json(); }).then(function(){ return fetch('/fragment/booking/1').then(function(r){ return r.text(); }); })
   .then(function(html){ document.getElementById('main').innerHTML = html; wire(); document.getElementById('msg').textContent = 'Note added.'; f.reset(); });
});
</script></body></html>`;
    const api: Handler = (req, body, res) => {
        const url = String(req.url);
        if (url === '/fragment/booking/1') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(booking.deleted ? '' : card()); return true; }
        if (url === '/api/bookings/1/notes' && req.method === 'POST') {
            const note = { id: ++noteSeq, text: String(JSON.parse(body || '{}').note || '') };
            booking.notes.push(note);
            return json(res, mode === 'parent' ? booking : note, 201);
        }
        if (url === '/api/bookings/1' && req.method === 'DELETE') { deleted.push(JSON.parse(JSON.stringify(booking))); booking.deleted = true; return json(res, { ok: true }); }
        if (url === '/api/bookings/1' && req.method === 'GET') return booking.deleted ? json(res, { error: 'nf' }, 404) : json(res, booking);
        return false;
    };
    return { page, api, deleted, booking };
}

for (const mode of ['parent', 'collide'] as const) {
    for (const at of ['/bookings/1', '/']) {
        test(`(B1) «Add note» on the owner's booking (${mode}, page at ${at}): DELETE /api/bookings/1 never reaches the server, the record is left and told`, async () => {
            const site = bookingSite(mode);
            const { result } = await walk(site.page, site.api, at);
            expect(site.deleted).toEqual([]);
            expect(site.booking.deleted).toBeUndefined();
            expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
            expect(Number(result.metrics.qaRecordsLeft || 0) + Number(result.metrics.qaRecordsEdited || 0)).toBeGreaterThanOrEqual(1);
        });
    }
}

test('(B1) the pair: a note\'s id never allows a booking of the same number, and a parent the create named is neutral', () => {
    const own = [{ collection: 'notes', id: '1' }];
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/bookings/1' }, own)).toBe('block');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/bookings/1' }, own, ['1'])).toBe('block');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/bookings/1/notes/1' }, own, ['1'])).toBe('allow');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/notes/1' }, own)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/note/1' }, own)).toBe('allow');
    //  …a parent the create did not name is another record.
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/bookings/2/notes/1' }, own, ['1'])).toBe('block');
    //  …and a neutral value standing for the QA's own collection is another record of it.
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/notes/delete', body: JSON.stringify({ ids: [1, 3] }) }, own, ['3'])).toBe('block');
    //  The collection of a create: the last part that is neither an id nor an action; a GraphQL mutation's field.
    expect(collectionOfCreate('http://h/api/bookings/1/notes', '{}')).toBe('notes');
    expect(collectionOfCreate('http://h/api/notes/create', '{}')).toBe('notes');
    expect(collectionOfCreate('http://h/graphql', JSON.stringify({ query: 'mutation AddNote($t: String!) { createNote(input: {title: $t}) { id } }' }))).toBe('note');
    expect(collectionOfCreate('http://h/graphql', JSON.stringify({ query: 'mutation { insert_notes_one(object: {title: "x"}) { id } }' }))).toBe('notes');
    expect(collectionOfCreate('http://h/graphql', '{}')).toBe('');
    expect(collectionOfAddress('http://h/api/projects/3/tasks/41')).toBe('tasks');
    expect(sameCollection('category', 'categories')).toBe(true);
    expect(sameCollection('note', 'notes')).toBe(true);
    expect(sameCollection('notes', 'bookings')).toBe(false);
    //  GraphQL: deleteNote(id: 42) is note 42; deleteBooking(id: 42) is not.
    const g = [{ collection: 'notes', id: '42' }];
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/graphql', body: JSON.stringify({ query: 'mutation { deleteNote(id: 42) { ok } }' }) }, g)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/graphql', body: JSON.stringify({ query: 'mutation($noteId: ID!) { deleteNote(id: $noteId) { ok } }', variables: { noteId: '42' } }) }, g)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/graphql', body: JSON.stringify({ query: 'mutation { deleteBooking(id: 42) { ok } }' }) }, g)).toBe('block');
    //  A bare id, with no collection, allows nothing.
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/notes/42' }, [{ collection: '', id: '42' }])).toBe('block');
});

test('(B1) the row\'s text always runs unless the row itself carries the allowed id', () => {
    const mark = 'qa7xk2a';
    const card = 'toyota corolla date 2026-11-20 customer sara haddad notes delete booking';
    //  The server named «1», the page showed «12» (a customer link): the owner's card, gaining the QA's note, is vetoed.
    expect(ownRowVerdict({
        mark, rowText: `${card} qa note ${mark}`, rowIds: [], markedIds: ['1'], typed: [`QA note ${mark}`],
        beforeIds: ['12'], beforeRows: [card], nowRows: [`${card} qa note ${mark}`], allowedIds: [],
    })).toMatchObject({ ok: false, edited: true });
    //  A row carrying the very id the server gave the QA's create is the QA's own.
    expect(ownRowVerdict({
        mark, rowText: `qa title ${mark} delete`, rowIds: ['104'], markedIds: ['104'], typed: [`QA title ${mark}`],
        beforeIds: ['101', '102', '103'], beforeRows: ['buy milk delete', 'walk dog delete', 'read book delete'],
        nowRows: [`qa title ${mark} delete`, 'buy milk delete', 'walk dog delete'], allowedIds: ['104'],
    })).toEqual({ ok: true, edited: false, why: '' });
});

/* ---- S1: ids match exactly ------------------------------------------------------------------------------ */

test('(S1) an answered «note-1», «ord_1» or «007» never allows record 1 or 7; «note-1» written so still does', () => {
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/bookings/1' }, [{ collection: 'bookings', id: 'note-1' }])).toBe('block');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/users/1' }, [{ collection: 'users', id: 'ord_1' }])).toBe('block');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/x/7' }, [{ collection: 'x', id: '007' }])).toBe('block');
    expect(deleteRequestVerdict({ method: 'DELETE', url: 'http://h/api/notes/note-1' }, [{ collection: 'notes', id: 'note-1' }])).toBe('allow');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/x/delete', body: JSON.stringify({ id: 7 }) }, [{ collection: 'x', id: '7' }])).toBe('allow');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/x/delete', body: JSON.stringify({ id: '007' }) }, [{ collection: 'x', id: '7' }])).toBe('block');
});

/* ---- S2: a nested route is deleted; a create's id from Location and from the re-read list ---------------- */

const TASKS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Project 3</title>${STYLE}</head><body>
<h1>Project 3 tasks</h1>
<form id="f"><label>Task <input name="title" required minlength="3"></label><button>Add task</button></form>
<p id="msg" role="status"></p><ul id="rows"></ul>
<script>
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function draw(list){ var ul = document.getElementById('rows'); ul.innerHTML = '';
  list.forEach(function(t){ var li = document.createElement('li'); li.innerHTML = '<span>'+esc(t.title)+'</span> <button type="button">Delete</button>';
    li.querySelector('button').addEventListener('click', function(){
      fetch('/api/projects/3/tasks/'+t.id, {method:'DELETE'}).then(function(r){ if (!r.ok) throw new Error('HTTP '+r.status); return load(); })
        .catch(function(e){ console.error('Could not delete task', e); document.getElementById('msg').textContent = 'Could not delete the task.'; });
    }); ul.appendChild(li); }); }
function load(){ return fetch('/api/projects/3/tasks').then(function(r){ return r.json(); }).then(draw); }
load();
document.getElementById('f').addEventListener('submit', function(e){ e.preventDefault(); var f = this;
  fetch('/api/projects/3/tasks', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({title: f.title.value})})
    .then(function(r){ return r.json(); }).then(function(){ document.getElementById('msg').textContent = 'Task added.'; f.reset(); return load(); });
});
</script></body></html>`;
function tasksApi(tasks: any[], deleted: string[], answer: (t: any) => unknown = t => t): Handler {
    let seq = 40;
    return (req, body, res) => {
        const url = String(req.url);
        if (url === '/api/projects/3/tasks' && req.method === 'GET') return json(res, tasks);
        if (url === '/api/projects/3/tasks' && req.method === 'POST') { const t = { id: ++seq, title: String(JSON.parse(body || '{}').title || ''), projectId: 3 }; tasks.push(t); return json(res, answer(t), 201); }
        const m = url.match(/^\/api\/projects\/3\/tasks\/(\d+)$/);
        if (m && req.method === 'DELETE') { const i = tasks.findIndex(t => String(t.id) === m[1]); if (i >= 0) { tasks.splice(i, 1); deleted.push(m[1]); } return json(res, { ok: true }); }
        if (m && req.method === 'GET') { const t = tasks.find(x => String(x.id) === m[1]); return t ? json(res, t) : json(res, { error: 'nf' }, 404); }
        return false;
    };
}

test('(S2) a sound nested-route app (the review\'s e2e-nested.js): the QA\'s own task 41 is deleted, nothing is stopped, nothing is refused', async () => {
    const tasks = [{ id: 1, title: 'Order parts', projectId: 3 }, { id: 2, title: 'Call the supplier', projectId: 3 }];
    const deleted: string[] = [];
    const { result, codes, errors } = await walk(TASKS, tasksApi(tasks, deleted));
    expect(deleted).toEqual(['41']);
    expect(tasks.map(t => t.id)).toEqual([1, 2]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(1);
    expect(Number(result.metrics.qaDeletesBlocked || 0)).toBe(0);
    expect(errors).toEqual([]);
    expect(codes.filter(c => /persistence|not_deleted|dead|refus/i.test(c))).toEqual([]);
});

test('(S2) a create answering {ok: true}: its id is read from the one new row holding the mark in the list it read again — deleted, only it', async () => {
    const tasks = [{ id: 1, title: 'Order parts', projectId: 3 }];
    const deleted: string[] = [];
    const { result, errors } = await walk(TASKS, tasksApi(tasks, deleted, () => ({ ok: true })));
    expect(deleted).toEqual(['41']);
    expect(tasks.map(t => t.id)).toEqual([1]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(1);
    expect(errors).toEqual([]);
});

const LOCATED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Items</title>${STYLE}</head><body>
<h1>Items</h1>
<form id="f"><label>Name <input name="name" required minlength="3"></label><button>Add item</button></form>
<p id="msg" role="status"></p><ul id="rows"></ul>
<script>
function draw(list){ var ul = document.getElementById('rows'); ul.innerHTML = '';
  list.forEach(function(x){ var li = document.createElement('li'); li.textContent = x.name + ' ';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Delete';
    b.addEventListener('click', function(){ fetch(x.url, {method:'DELETE'}).then(load); });
    li.appendChild(b); ul.appendChild(li); }); }
function load(){ return fetch('/api/items').then(function(r){ return r.json(); }).then(draw); }
load();
document.getElementById('f').addEventListener('submit', function(e){ e.preventDefault(); var f = this;
  fetch('/api/items', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name: f.name.value})})
    .then(function(){ document.getElementById('msg').textContent = 'Item added.'; f.reset(); return load(); });
});
</script></body></html>`;

test('(S2) a create answering 201 {ok: true} with Location: /api/items/7 — the id is the Location\'s, and only item 7 is deleted', async () => {
    const items: any[] = [{ id: 1, name: 'Owner item' }];
    const deleted: string[] = [];
    const api: Handler = (req, body, res) => {
        const url = String(req.url);
        if (url === '/api/items' && req.method === 'POST') { items.push({ id: 7, name: String(JSON.parse(body || '{}').name || '') }); return json(res, { ok: true }, 201, { location: '/api/items/7' }); }
        const m = url.match(/^\/api\/items\/(\d+)$/);
        if (m && req.method === 'DELETE') { const i = items.findIndex(x => String(x.id) === m[1]); if (i >= 0) { items.splice(i, 1); deleted.push(m[1]); } return json(res, { ok: true }); }
        if (m && req.method === 'GET') { const k = items.find(x => String(x.id) === m[1]); return k ? json(res, k) : json(res, { error: 'nf' }, 404); }
        //  Its list names each record by its address, never by an id: only the 201's Location gives the QA its id.
        if (url === '/api/items' && req.method === 'GET') return json(res, items.map(x => ({ name: x.name, url: `/api/items/${x.id}` })));
        return false;
    };
    const { result } = await walk(LOCATED, api);
    expect(deleted).toEqual(['7']);
    expect(items.map(x => x.id)).toEqual([1]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(1);
});

/* ---- S2: a stopped request's noise is the QA's — excused, told, never a finding ------------------------------ */

test('(S2) causedByStoppedDelete: within 15 s of a stop, a stopped request\'s failure and its address are the QA\'s; before any stop, nothing is', async () => {
    const site = await serve('<!doctype html><html><body><p>x</p></body></html>', (req, _b, res) => (req.method === 'DELETE' ? json(res, {}) : false));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage();
        startWalkWatch(tab);
        await tab.goto(`${site.base}/`);
        expect(causedByStoppedDelete(tab, 'Could not delete task TypeError: Failed to fetch')).toBe(false);
        const guard = guardDeletes(tab);
        await guard.press([]);
        await tab.evaluate(() => fetch('/api/x/1?token=secret123', { method: 'DELETE' }).catch(() => { }));
        const net = await guard.release();
        //  M3: the evidence carries the path, never the query.
        expect(net.blocked).toEqual([{ method: 'DELETE', at: '/api/x/1' }]);
        for (const t of ['Could not delete task TypeError: Failed to fetch', "NetworkError: Failed to execute 'send' on 'XMLHttpRequest'", 'AxiosError: Network Error', 'Delete failed /api/x/1', 'تعذّر الحذف'])
            expect([t, causedByStoppedDelete(tab, t)]).toEqual([t, true]);
        expect(causedByStoppedDelete(tab, 'TypeError: Cannot read properties of undefined (reading \'map\')')).toBe(false);
        await endWalkWatch(tab);
    } finally {
        await browser.close();
        await site.close();
    }
});

test('(S2) through the whole walk: a delete the guard stopped, and the page\'s console.error about it, are told — never console_errors', async () => {
    const notes: any[] = [{ id: 1, title: 'Owner note' }];
    const deleted: string[] = [];
    //  Every row's Delete sends the owner's note 1 (a wired-wrong button): the QA's press is stopped.
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title>${STYLE}</head><body>
<h1>Notes</h1>
<form id="f"><label>Title <input name="title" required></label><button>Add note</button></form>
<p id="msg" role="status"></p><ul id="list"></ul>
<script>
function draw(list){ var ul = document.getElementById('list'); ul.innerHTML = '';
  list.forEach(function(n){ var li = document.createElement('li'); li.textContent = n.title + ' ';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Delete';
    b.addEventListener('click', function(){ fetch('/api/x/1', {method:'DELETE'}).then(load).catch(function(e){ console.error('Could not delete the note', e); }); });
    li.appendChild(b); ul.appendChild(li); }); }
function load(){ return fetch('/api/x').then(function(r){ return r.json(); }).then(draw); }
load();
document.getElementById('f').addEventListener('submit', function(e){ e.preventDefault(); var f = this;
  fetch('/api/x', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({title: f.title.value})})
   .then(function(r){ return r.json(); }).then(function(){ document.getElementById('msg').textContent = 'Note added.'; f.reset(); load(); });
});
</script></body></html>`;
    let next = 42;
    const api: Handler = (req, body, res) => {
        const url = String(req.url);
        if (url === '/api/x' && req.method === 'GET') return json(res, notes);
        if (url === '/api/x' && req.method === 'POST') { const n = { id: next++, title: String(JSON.parse(body || '{}').title || '') }; notes.push(n); return json(res, n, 201); }
        const m = url.match(/^\/api\/x\/(\d+)$/);
        if (m && req.method === 'DELETE') { const i = notes.findIndex(x => String(x.id) === m[1]); if (i >= 0) { notes.splice(i, 1); deleted.push(m[1]); } return json(res, { ok: true }); }
        return false;
    };
    const site = await serve(page, api);
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r5-s2-'));
    try {
        fs.writeFileSync(path.join(dir, 'index.html'), page);
        const audit: any = await auditBuiltApp(dir, { timeoutMs: 60_000, serveUrl: `${site.base}/`, request: 'a notes app: add a note, list the notes, delete a note' });
        expect(deleted).toEqual([]);
        expect(notes.some(n => n.id === 1)).toBe(true);
        expect(Number(audit.qaDeletesBlocked || 0)).toBeGreaterThanOrEqual(1);
        expect((audit.findings || []).map((f: any) => f.id)).not.toContain('console_errors');
        expect((audit.findings || []).map((f: any) => f.id)).not.toContain('page_errors');
        expect(Number(audit.qaDeleteNoiseExcused || 0)).toBeGreaterThanOrEqual(1);
        expect(formatAudit(audit, true)).toContain('لأن الفحص أوقف طلب حذف');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        await site.close();
    }
});

test('(S2) the told line names the excused noise, in Arabic and English', () => {
    expect(qaRecordsToldLine({ qaDeleteNoiseExcused: 2 }, true)).toContain('2 خطأ كتبته الصفحة لأن الفحص أوقف طلب حذف');
    expect(qaRecordsToldLine({ qaDeleteNoiseExcused: 2 }, false)).toContain('2 error(s) the page wrote because the QA stopped a delete request');
});

/* ---- S3: a page that talks over a socket ------------------------------------------------------------------ */

test('(S3) a page whose delete goes over its WebSocket: the QA never presses it — its record is left and told, and no frame deletes anything', async () => {
    const notes: any[] = [{ id: 1, title: 'Owner note' }];
    const frames: string[] = [];
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Live notes</title>${STYLE}</head><body>
<h1>Live notes</h1>
<form id="f"><label>Title <input name="title" required></label><button>Add note</button></form>
<p id="msg" role="status"></p><ul id="list"></ul>
<script>
var ws = new WebSocket('ws://' + location.host + '/live');
function draw(list){ var ul = document.getElementById('list'); ul.innerHTML = '';
  list.forEach(function(n){ var li = document.createElement('li'); li.textContent = n.title + ' ';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Delete';
    b.addEventListener('click', function(){ ws.send(JSON.stringify({type:'delete', id: n.id})); li.remove(); });
    li.appendChild(b); ul.appendChild(li); }); }
function load(){ return fetch('/api/x').then(function(r){ return r.json(); }).then(draw); }
load();
document.getElementById('f').addEventListener('submit', function(e){ e.preventDefault(); var f = this;
  fetch('/api/x', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({title: f.title.value})})
   .then(function(r){ return r.json(); }).then(function(){ document.getElementById('msg').textContent = 'Note added.'; f.reset(); load(); });
});
</script></body></html>`;
    const api: Handler = (req, body, res) => {
        if (req.url === '/api/x' && req.method === 'GET') return json(res, notes);
        if (req.url === '/api/x' && req.method === 'POST') { const n = { id: 42, title: String(JSON.parse(body || '{}').title || '') }; notes.push(n); return json(res, n, 201); }
        return false;
    };
    const { result } = await walk(page, api, '/', frames);
    expect(frames.filter(f => /delete/.test(f))).toEqual([]);
    expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
    expect(told(result.metrics)).toContain('the page talks over a live socket the QA cannot hold');
});

/* ---- S4 and S7: what the guard judges, and for how long ------------------------------------------------------ */

test('(S4, S7) a press judges the page\'s own writes and deletes anywhere, never a third party\'s beacon; after it, cancel, archive and a method override stay held until the walk ends', async () => {
    const hits: string[] = [];
    const api: Handler = (req, body, res) => {
        if (String(req.url).startsWith('/api/')) { hits.push(`${req.method} ${req.url} ${body}`.trim()); return json(res, { ok: true }, 200, { 'access-control-allow-origin': '*' }); }
        if (String(req.url).startsWith('/archive')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<p>archive page</p>'); return true; }
        return false;
    };
    const site = await serve('<!doctype html><html><body><p>app</p></body></html>', api);
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE', 'access-control-allow-headers': '*' };
    const other = await serve('<p>other</p>', (req, _b, res) => { if (req.method !== 'OPTIONS') hits.push(`OTHER ${req.method} ${req.url}`); return json(res, {}, 200, cors); });
    const browser = await chromium.launch(getChromiumLaunchOptions());
    const send = (tab: any, url: string, init: any) => tab.evaluate(({ u, i }: any) => fetch(u, i).then(() => 'ok', () => 'failed'), { u: url, i: init });
    try {
        const tab = await browser.newPage();
        startWalkWatch(tab);
        await tab.goto(`${site.base}/`);
        const guard = guardDeletes(tab);
        await guard.press([{ collection: 'bookings', id: '9' }]);
        //  A third party's beacon (an origin the page never wrote to) passes untouched and is never counted.
        expect(await send(tab, `${other.base}/collect`, { method: 'POST', body: 'e=click' })).toBe('ok');
        const net = await guard.release();
        expect(net.attempted).toBe(0);
        expect(net.blocked).toEqual([]);
        expect(hits).toContain('OTHER POST /collect');
        //  …but a delete to another origin is judged.
        await guard.press([{ collection: 'bookings', id: '9' }]);
        expect(await send(tab, `${other.base}/api/bookings/1`, { method: 'DELETE' })).toBe('failed');
        expect((await guard.release()).blocked.length).toBe(1);
        //  Past the old 10.5 s: still held.
        await tab.waitForTimeout(11_000);
        const before = hits.length;
        expect(await send(tab, `${site.base}/api/bookings/3`, { method: 'DELETE' })).toBe('failed');
        expect(await send(tab, `${site.base}/api/bookings/1/cancel`, { method: 'POST' })).toBe('failed');
        expect(await send(tab, `${site.base}/api/bookings/1`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) })).toBe('failed');
        expect(await send(tab, `${site.base}/api/bookings/1`, { method: 'POST', headers: { 'x-http-method-override': 'DELETE' } })).toBe('failed');
        expect(await send(tab, `${site.base}/api/bookings/1?_method=DELETE`, { method: 'POST' })).toBe('failed');
        //  …while what is no delete passes: a todo saved with «archived: false», an «Archive» page.
        expect(await send(tab, `${site.base}/api/todos/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'x', archived: false }) })).toBe('ok');
        expect(await send(tab, `${site.base}/archive`, { method: 'GET' })).toBe('ok');
        expect(hits.slice(before)).toEqual(['PUT /api/todos/1 {"title":"x","archived":false}']);
        //  The walk is over: what it stopped is handed back, and nothing is held any more.
        const late = await endWalkWatch(tab);
        expect(late.length).toBe(5);
        expect(await send(tab, `${site.base}/api/bookings/3`, { method: 'DELETE' })).toBe('ok');
        expect(hits).toContain('DELETE /api/bookings/3');
    } finally {
        await browser.close();
        await site.close();
        await other.close();
    }
});

test('(S7) what asks for a delete in a body: an action word, a deleted flag set, a state set to cancelled — never a flag set to false', () => {
    expect(bodyAsksDelete(JSON.stringify({ status: 'cancelled' }))).toBe(true);
    expect(bodyAsksDelete(JSON.stringify({ archived: true }))).toBe(true);
    expect(bodyAsksDelete(JSON.stringify({ deletedAt: '2026-11-15T10:00:00Z' }))).toBe(true);
    expect(bodyAsksDelete(JSON.stringify({ action: 'soft-delete', id: 3 }))).toBe(true);
    expect(bodyAsksDelete('_method=DELETE&id=3')).toBe(true);
    expect(bodyAsksDelete(JSON.stringify({ query: 'mutation { cancelBooking(id: 3) { ok } }' }))).toBe(true);
    expect(bodyAsksDelete(JSON.stringify({ title: 'x', archived: false, deletedAt: null }))).toBe(false);
    expect(bodyAsksDelete(JSON.stringify({ note: 'please remove the onions' }))).toBe(false);
});

/* ---- S5: a moderated review ---------------------------------------------------------------------------------- */

test('(S5) a review, a rating, a comment: a by-id JSON 404 beside a 200 control proves nothing', () => {
    const facts = { answeredIds: ['3'], byIdStatuses: [404], byIdJson: [true], controlStatus: 200, listsBefore: [], at: ['http://x/api/reviews'] };
    expect(listProvesLoss('others', { ...facts, moderated: true })).toBe('');
    expect(listProvesLoss('others', facts)).toBe('others');
    for (const t of ['Write a review', 'Rating', 'Leave a comment', 'Feedback', 'testimonials', 'أضف تقييمك', 'مراجعة', 'تعليق', 'شاركنا رأيك']) expect([t, MODERATED_WORDS.test(t)]).toEqual([t, true]);
    expect(MODERATED_WORDS.test('Book a table')).toBe(false);
});

/* ---- S6: what the page read ----------------------------------------------------------------------------------- */

test('(S6) readIdsStore asks nothing again, reads a list over 400 KB, and a GraphQL query whose «query» comes after large variables', async () => {
    const hits: string[] = [];
    const big = Array.from({ length: 4500 }, (_, i) => ({ id: 100_000 + i, title: `Owner row ${i} `.padEnd(130, '.') }));
    const api: Handler = (req, body, res) => {
        const url = String(req.url);
        if (url.startsWith('/api/')) hits.push(`${req.method} ${url}`);
        if (url === '/api/track?event=view') return json(res, { ok: true });
        if (url === '/api/big') return json(res, big);
        if (url === '/graphql') return json(res, /"query"\s*:\s*"query/.test(body) ? { data: { items: [{ id: '555' }] } } : {});
        return false;
    };
    const page = `<!doctype html><html><body><p>app</p><script>
fetch('/api/track?event=view');
window.later = function(){ return Promise.all([
  fetch('/api/big').then(function(r){ return r.json(); }),
  fetch('/graphql', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({operationName:'Items', variables:{filter:'${'x'.repeat(400)}'}, query:'query Items { items { id } }'})}).then(function(r){ return r.json(); }),
]); };
</script></body></html>`;
    const site = await serve(page, api);
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage();
        await tab.goto(`${site.base}/`, { waitUntil: 'networkidle' });
        const store = readIdsStore(tab);
        await store.ready;
        await tab.waitForTimeout(300);
        expect(hits.filter(h => /track/.test(h))).toEqual(['GET /api/track?event=view']);
        await tab.evaluate(() => (window as any).later());
        await tab.waitForTimeout(800);
        const ids = store.before(store.seq());
        expect(ids.has('104499')).toBe(true);
        expect(ids.has('555')).toBe(true);
    } finally {
        await browser.close();
        await site.close();
    }
});

/* ---- M1, M4 ---------------------------------------------------------------------------------------------------- */

test('(M1) a mutation deleting all by one id, and a body naming another record under any key, are blocked; a parent the create named is not', () => {
    const own = [{ collection: 'notes', id: '7' }];
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/graphql', body: JSON.stringify({ query: 'mutation { deleteAllNotes(id: 7) }' }) }, own)).toBe('block');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/graphql', body: JSON.stringify({ query: 'mutation { delete_many_notes(id: 7) }' }) }, own)).toBe('block');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/notes/delete', body: JSON.stringify({ where: { booking: 1 }, id: 7 }) }, own)).toBe('block');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/notes/delete', body: JSON.stringify({ id: 7, booking: '1' }) }, own)).toBe('block');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/notes/delete', body: JSON.stringify({ id: 7, booking: '1' }) }, own, ['1'])).toBe('allow');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/notes/delete', body: JSON.stringify({ note: { id: 7 } }) }, own)).toBe('allow');
    expect(deleteRequestVerdict({ method: 'POST', url: 'http://h/api/notes/delete', body: JSON.stringify({ booking: { id: 7 } }) }, own)).toBe('block');
});

test('(M4) «but not», «لكن لم», «ولكن لم» after a success word take it back; a plain success still is one', () => {
    for (const t of ['Saved, but not to the server', 'Booking confirmed, but not paid — pay at the desk', 'تم الحفظ، لكن لم يُرسل البريد', 'تم الحجز ولكن لم يُدفع']) {
        expect([t, saysSuccess(t)]).toEqual([t, false]);
    }
    for (const t of ['Saved!', 'Thanks! Don\'t forget: your ID must be shown at check-in.', 'تم الحفظ بنجاح', 'Order placed, not shipped yet. Payment must be made within 24 hours.']) {
        expect([t, saysSuccess(t)]).toEqual([t, true]);
        expect([t, isVisibleFormRefusal(t)]).toEqual([t, false]);
    }
});
