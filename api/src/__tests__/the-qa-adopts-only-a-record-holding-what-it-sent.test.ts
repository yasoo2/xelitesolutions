/**
 * ⛔ THE SIXTH REVIEW OF claude/r40-qa (815eb34eb, 2026-11-15).
 *
 *   U1  «Room notes» POSTed /api/rooms {number: 3, notes}, and the server UPSERTED: the owner's room 17,
 *       «Deluxe sea view, king bed», never shown or read before, took the QA's notes. Answered {ok: true}
 *       with the list read again, 201 Location: /api/rooms/17, or {id: 17, …}: the QA deleted room 17. Now
 *       the record an id names, as the server returned it, is the QA's own only when every text it holds is
 *       a value the QA sent (or its mark), an id, a date, a machine token or a short state word — otherwise
 *       it was there: left and told. A record that cannot be read is never adopted either.
 *   N1  A delete naming the QA's own record and a parent the create named, beside a flag that deletes more
 *       (deleteBooking: true, cascade, also), or naming more after the QA's id (/notes/1/bookings), is stopped.
 *   N2  After a press, a form submit carrying the QA's mark is a form test, never a delayed delete — on a
 *       …/cancel or …/archive address too.
 *   N3  A stopped request's noise is excused only when it names that very path, or is the failure a stopped
 *       request throws within 3 s of the stop.
 *   M4  «Saved; not really…» is no success.
 */
import http from 'http';
import { chromium } from 'playwright';
import {
    probeForms, deleteRequestVerdict, guardDeletes, startWalkWatch, endWalkWatch, causedByStoppedDelete,
    foreignTextInRecord, saysSuccess,
} from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

const STYLE = '<style>body{font-family:sans-serif;margin:16px} input,select,textarea,button{display:block;min-height:40px;margin:6px 0;width:280px}</style>';
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The review's e2e6-typed.js CASE=upsert: room number 3 is the owner's room 17; the create upserts by number. */
async function upsert(variant: 'list' | 'location' | 'location-read' | 'answer') {
    const rooms: any[] = [{ id: 17, number: 3, kind: 'Deluxe sea view, king bed', notes: 'VIP guest Thursday' }, { id: 4, number: 4, kind: 'Twin garden view', notes: '' }];
    const deleted: any[] = [];
    let lastRoom: any = null;
    let seq = 20;
    const page = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rooms</title>${STYLE}</head><body>
<h1>Room notes</h1><p>Save a note on a room.</p>
<section id="saved">${lastRoom && !lastRoom.deleted ? `<article class="card"><p>Room ${lastRoom.number} · ${esc(lastRoom.kind)} · ${esc(lastRoom.notes)}</p><button type="button" class="del" data-at="/api/rooms/${lastRoom.id}">Delete room</button></article>` : ''}</section>
<form id="f"><label>Room number <input type="number" name="number" required></label><label>Notes <textarea name="notes" required minlength="3"></textarea></label><button>Save</button></form>
<p id="msg" role="status"></p>
<script>
window.__LOC = ${variant.startsWith('location')};
document.querySelectorAll('.del').forEach(function(b){ b.onclick = function(){ if (confirm('Delete?')) fetch(b.dataset.at, {method:'DELETE'}).then(function(){ b.parentNode.remove(); }); }; });
document.getElementById('f').addEventListener('submit', function(e){ e.preventDefault(); var f = this;
  fetch('/api/rooms', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({number: f.number.value, notes: f.notes.value})})
   .then(function(r){ return r.json(); }).then(function(x){ if (window.__LOC) { location.reload(); return new Promise(function(){}); } return x && x.id ? x : fetch('/api/rooms?recent=1').then(function(r){ return r.json(); }).then(function(l){ return l[0]; }); }).then(function(room){
     var s = document.getElementById('saved'); s.innerHTML = '';
     var a = document.createElement('article'); a.className = 'card'; var p = document.createElement('p'); p.textContent = 'Room ' + room.number + ' · ' + room.kind + ' · ' + room.notes; a.appendChild(p);
     var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Delete room'; b.onclick = function(){ if (confirm('Delete?')) fetch('/api/rooms/' + room.id, {method:'DELETE'}).then(function(){ a.remove(); }); };
     a.appendChild(b); s.appendChild(a); document.getElementById('msg').textContent = 'Saved.'; f.reset(); });
});
</script></body></html>`;
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            const json = (o: unknown, s = 200, h: Record<string, string> = {}) => { res.writeHead(s, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
            const at = String(req.url).split('?')[0];
            if (req.method === 'GET' && at === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page()); return; }
            if (req.method === 'POST' && at === '/api/rooms') {
                const b = JSON.parse(body || '{}');
                let room = rooms.find(r => String(r.number) === String(b.number) && !r.deleted);
                if (!room) { room = { id: ++seq, number: Number(b.number), kind: 'Standard', notes: '' }; rooms.push(room); }
                room.notes = String(b.notes || '');
                lastRoom = room;
                if (variant.startsWith('location')) return json({ ok: true }, 201, { location: `/api/rooms/${room.id}` });
                if (variant === 'list') return json({ ok: true }, 201);
                return json(room, 201);
            }
            if (req.method === 'GET' && at === '/api/rooms') return json(lastRoom && !lastRoom.deleted ? [lastRoom] : []);
            const one = at.match(/^\/api\/rooms\/(\d+)$/);
            if (one && req.method === 'GET' && variant === 'location-read') { const r = rooms.find(x => String(x.id) === one[1] && !x.deleted); return r ? json(r) : json({ error: 'nf' }, 404); }
            if (one && req.method === 'DELETE') { const r = rooms.find(x => String(x.id) === one[1]); if (r) { r.deleted = true; if (Number(one[1]) <= 17) deleted.push({ ...r }); } return json({ ok: true }); }
            json({ error: 'nf' }, 404);
        });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        tab.on('dialog', (d: any) => (d.type() === 'beforeunload' ? d.dismiss() : d.accept('Joe QA')).catch(() => { }));
        startWalkWatch(tab);
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'networkidle' });
        const result = await probeForms(tab, { budgetMs: 60_000 });
        await endWalkWatch(tab);
        return { result, deleted, rooms };
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}
const told = (m: Record<string, any>) => JSON.stringify([...(m.qaRecordsLeftEvidence || []), ...(m.qaRecordsEditedEvidence || []), ...(m.qaDeletesBlockedEvidence || [])]);

for (const variant of ['list', 'location', 'location-read', 'answer'] as const) {
    test(`(U1) an upsert onto the owner's room 17 (${variant}): room 17 survives, and the QA's record is left and told`, async () => {
        const { result, deleted, rooms } = await upsert(variant);
        expect(deleted).toEqual([]);
        expect(rooms.find(r => r.id === 17)?.deleted).toBeUndefined();
        expect(Number(result.metrics.qaRecordsDeleted || 0)).toBe(0);
        expect(Number(result.metrics.qaRecordsLeft || 0) + Number(result.metrics.qaRecordsEdited || 0)).toBeGreaterThanOrEqual(1);
        expect(told(result.metrics)).toMatch(variant === 'location' ? /could not be read/ : /text the QA never sent/);
    });
}

test('(U1) foreignTextInRecord: only what the QA sent, its mark, ids, dates, tokens and short state words belong to its own record', () => {
    const mark = 'qa7xk2a';
    const sent = ['Joe QA qa7xk2a', '3', 'joe.qa+qa7xk2a@example.com', 'abc'];
    expect(foreignTextInRecord({ id: 41, title: 'Joe QA qa7xk2a', projectId: 3, createdAt: '2026-11-15T10:00:00.000Z', status: 'pending' }, sent, mark)).toBe('');
    expect(foreignTextInRecord({ id: 9, email: 'JOE.QA+qa7xk2a@example.com', role: 'user', slug: 'joe-qa-qa7xk2a', password: '$2b$10$abcdefghijklmnopqrstuv', price: 'abc', currency: 'USD', lang: 'en', state: 'قيد الانتظار' }, sent, mark)).toBe('');
    expect(foreignTextInRecord({ id: 17, number: 3, kind: 'Deluxe sea view, king bed', notes: 'Joe QA qa7xk2a' }, sent, mark)).toBe('Deluxe sea view, king bed');
    expect(foreignTextInRecord({ id: 1, car: 'Toyota Corolla', notes: [{ id: 1, text: 'Joe QA qa7xk2a' }] }, sent, mark)).toBe('Toyota Corolla');
    expect(foreignTextInRecord({ id: 3, text: 'Omar asked whether the spring prices include breakfast', replies: [{ id: 10, text: 'Joe QA qa7xk2a' }] }, sent, mark)).not.toBe('');
    //  What another record lends it by a join (the replays of P179, P189, P195, P197) is not its own text; its own fields are.
    expect(foreignTextInRecord({ id: 'c4f2', name: 'Joe QA qa7xk2a', owner: 'admin@cinema.test', seat: 'Q52UI9AMWI', ownerName: 'Admin', category_name: 'Food', owner_email: 'a@b.c', article_title: 'Owner post', created_at: '2026-11-16 00:47:09', category: { id: 2, name: 'Food' } }, sent, mark)).toBe('');
    expect(foreignTextInRecord({ id: 9, first_name: 'Sara', notes: 'Joe QA qa7xk2a' }, sent, mark)).toBe('Sara');
    expect(foreignTextInRecord({ id: 9, attributes: { title: 'Owner post' } }, sent, mark)).toBe('Owner post');
});

/* ---- N1 ------------------------------------------------------------------------------------------------- */

test('(N1) the QA\'s own record beside a parent and a flag that deletes more, or more after its id, is stopped; a nested delete still passes', () => {
    const own = [{ collection: 'notes', id: '7' }];
    const v = (method: string, url: string, body = '', neutral: string[] = ['1']) => deleteRequestVerdict({ method, url: `http://h${url}`, body }, own, neutral);
    expect(v('DELETE', '/api/notes/7', JSON.stringify({ bookingId: 1, deleteBooking: true }))).toBe('block');
    expect(v('DELETE', '/api/notes/7', JSON.stringify({ bookingId: 1, cascade: true }))).toBe('block');
    expect(v('DELETE', '/api/notes/7?also=1')).toBe('block');
    expect(v('DELETE', '/api/notes/7?withParent=true&bookingId=1')).toBe('block');
    expect(v('DELETE', '/api/notes/7?cascade=booking', '', [])).toBe('block');
    expect(v('DELETE', '/api/notes/7/bookings', '', [])).toBe('block');
    expect(v('DELETE', '/api/notes/7/all', '', [])).toBe('block');
    expect(v('POST', '/api/notes/7/delete-booking', '', [])).toBe('block');
    expect(v('DELETE', '/api/notes', JSON.stringify({ id: 7, scope: 'all' }), [])).toBe('block');
    expect(v('DELETE', '/rest/v1/notes?id=eq.7&user=eq.1', '', [])).toBe('block');
    //  A parent in the path is neutral only before the QA's own collection, never as the delete's target.
    expect(v('DELETE', '/api/bookings/1?notes=7')).toBe('block');
    //  …while a sound nested delete, a parent named plainly, and a delete address after the id pass.
    expect(v('DELETE', '/api/bookings/1/notes/7')).toBe('allow');
    expect(v('DELETE', '/api/notes/7', JSON.stringify({ bookingId: 1 }))).toBe('allow');
    expect(v('POST', '/api/notes/7/delete', '', [])).toBe('allow');
    expect(v('DELETE', '/api/notes/7', JSON.stringify({ cascade: false, bookingId: 1 }))).toBe('allow');
});

/* ---- N2, N3 --------------------------------------------------------------------------------------------- */

test('(N2, N3) after a press, a submit carrying the QA\'s mark passes even to …/cancel; noise is excused only for the stopped path itself, or within 3 s', async () => {
    const hits: string[] = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (String(req.url).startsWith('/api/')) { hits.push(`${req.method} ${req.url}`); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
            res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html><body><p>app</p></body></html>');
        });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    const browser = await chromium.launch(getChromiumLaunchOptions());
    const send = (tab: any, url: string, init: any) => tab.evaluate(({ u, i }: any) => fetch(u, i).then(() => 'ok', () => 'failed'), { u: url, i: init });
    try {
        const tab = await browser.newPage();
        startWalkWatch(tab);
        await tab.goto(`${base}/`);
        const guard = guardDeletes(tab);
        guard.noteMark('qa7xk2a');
        await guard.press([{ collection: 'notes', id: '7' }]);
        expect(await send(tab, `${base}/api/bookings/1`, { method: 'DELETE' })).toBe('failed');
        await guard.release();
        //  N2: the QA's own «Cancel my trip» form, carrying its mark, reaches the server; an unmarked cancel is still held.
        expect(await send(tab, `${base}/api/trips/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Joe QA qa7xk2a' }) })).toBe('ok');
        expect(await send(tab, `${base}/api/trips/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'no' }) })).toBe('failed');
        expect(hits).toContain('POST /api/trips/cancel');
        //  N3: the stopped path itself, never one it begins; generic network words only within 3 s of a stop.
        expect(causedByStoppedDelete(tab, 'DELETE /api/bookings/1 failed')).toBe(true);
        expect(causedByStoppedDelete(tab, 'GET /api/bookings/12 500 (Internal Server Error)')).toBe(false);
        expect(causedByStoppedDelete(tab, 'Could not save TypeError: Failed to fetch')).toBe(true);
        await tab.waitForTimeout(3_300);
        expect(causedByStoppedDelete(tab, 'Could not save TypeError: Failed to fetch')).toBe(false);
        expect(causedByStoppedDelete(tab, 'DELETE /api/bookings/1 net::ERR_FAILED')).toBe(true);
        await endWalkWatch(tab);
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
});

/* ---- M4 ------------------------------------------------------------------------------------------------- */

test('(M4) «Saved; not really…» is no success; «Saved; we will email you» still is', () => {
    expect(saysSuccess('Saved; not really, the server is offline.')).toBe(false);
    expect(saysSuccess('تم الحفظ؛ لم يصل إلى الخادم بعد')).toBe(false);
    expect(saysSuccess('Saved; we will email you a copy.')).toBe(true);
    expect(saysSuccess('Order placed, not shipped yet. Payment must be made within 24 hours.')).toBe(true);
});
