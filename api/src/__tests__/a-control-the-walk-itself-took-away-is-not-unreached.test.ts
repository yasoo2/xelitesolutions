/**
 * ⛔ A CONTROL THE WALK'S OWN PRESSES TOOK AWAY IS NOT ONE IT COULD NOT REACH.
 *
 * The hard sample, 2026-11-09 (L451, a project management suite): each card of
 * the board offers the moves its workflow allows. The walk pressed one move,
 * the server kept it, and the baseline the walk restored was another board —
 * the card's other move was gone, or (once the builder drew every move on every
 * card) disabled. «2 of 58 controls were gone before I could press them»
 * refused a working board six times. Pinned on a real browser:
 *   - a move the product now disables is «declined», not unreached;
 *   - a move gone after the walk's own write is «consumed», not unreached;
 *   - a control gone with no write at all is still «not found», and still told.
 *
 * And the requested items (L451's other refusal, ten times): «issues with
 * custom fields» is read by the requirement «Custom fields on issues» the judge
 * found met — the same words in another order; a negation is never set aside.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { chromium } from 'playwright';
import { judgeBehaviour, probeControls } from '../core/quality/behaviour-audit';
import { readAsRequirements } from '../core/quality/delivery-verdict';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(180_000);

const MOVES: Record<string, string[]> = { 'To Do': ['In Progress', 'Cancelled'], 'In Progress': ['Done'], Done: [], Cancelled: [] };
const STATUSES = Object.keys(MOVES);

function board(drawEveryMove: boolean): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Board</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;min-width:120px;margin:4px}</style></head><body>
<h1>Board</h1><main id="board"></main>
<script>
  var MOVES = ${JSON.stringify(MOVES)}, STATUSES = ${JSON.stringify(STATUSES)}, EVERY = ${drawEveryMove};
  async function load() {
    var cards = await (await fetch('/api/cards')).json();
    document.getElementById('board').innerHTML = cards.map(function (c) {
      var shown = EVERY ? STATUSES.filter(function (s) { return s !== c.status; }) : MOVES[c.status];
      return '<div class="card"><h2>' + c.title + ' — ' + c.status + '</h2>' + shown.map(function (s) {
        var ok = MOVES[c.status].indexOf(s) >= 0;
        return '<button data-id="' + c.id + '" data-to="' + s + '"' + (ok ? '' : ' disabled title="not allowed from ' + c.status + '"') + '>→ ' + s + '</button>';
      }).join('') + '</div>';
    }).join('');
  }
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-to]');
    if (!b) return;
    await fetch('/api/cards/' + b.dataset.id + '/move', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: b.dataset.to }) });
    await load();
  });
  load();
</script></body></html>`;
}

/** A control a press removes in the page itself, kept across a reload, with no write to any server. */
const LOCAL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;min-width:120px;margin:4px}</style></head><body>
<h1>Local</h1><div id="row"></div>
<script>
  function draw() {
    var hidden = localStorage.getItem('hide') === '1';
    document.getElementById('row').innerHTML = '<button id="hide">Hide extras</button>' + (hidden ? '' : '<button id="extra">Extra</button>');
  }
  document.addEventListener('click', function (e) {
    if (e.target.id === 'hide') { localStorage.setItem('hide', '1'); draw(); }
    if (e.target.id === 'extra') { document.querySelector('h1').textContent = 'Extra pressed'; }
  });
  draw();
</script></body></html>`;

describe('controls gone from the restored baseline', () => {
    let server: http.Server;
    let base = '';
    let cards: Array<{ id: number; title: string; status: string }> = [];
    let page = '';
    beforeAll(async () => {
        server = http.createServer((req, res) => {
            const url = String(req.url || '/');
            if (url === '/api/cards' && req.method === 'GET') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(cards));
                return;
            }
            const move = url.match(/^\/api\/cards\/(\d+)\/move$/);
            if (move && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    const card = cards.find(c => c.id === Number(move[1]));
                    const to = (() => { try { return String(JSON.parse(body).to || ''); } catch { return ''; } })();
                    if (!card || !MOVES[card.status].includes(to)) { res.writeHead(409); res.end('{}'); return; }
                    card.status = to;
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify(card));
                });
                return;
            }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(page);
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        base = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

    async function walk(html: string) {
        page = html;
        cards = [{ id: 1, title: 'DEMO-1', status: 'To Do' }];
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await tab.goto(base, { waitUntil: 'load' });
            await tab.waitForSelector('button', { timeout: 5000 }).catch(() => undefined);
            const probe = await probeControls(tab, { fillForms: false, budgetMs: 30_000 });
            return { probe, verdict: judgeBehaviour(probe.controls, { ...probe.metrics }) };
        } finally {
            await browser.close();
        }
    }

    it('a move the product now disables is declined, not «gone before I could press it»', async () => {
        const { probe, verdict } = await walk(board(true));
        expect(probe.controls.find(c => c.label === '→ In Progress')?.worked).toBe(true);
        //  The server kept the move (and the walk's exploration may press «→ Done» after it).
        expect(cards[0].status).not.toBe('To Do');
        expect(probe.controls.find(c => c.label === '→ Cancelled')?.effect).toBe('declined');
        expect(verdict.findings.map(f => f.code)).not.toContain('controls_not_reached');
        expect(verdict.findings.map(f => f.code)).not.toContain('dead_controls');
    });

    it('a move gone after the walk\'s own write is consumed, not «gone before I could press it»', async () => {
        const { probe, verdict } = await walk(board(false));
        expect(probe.controls.find(c => c.label === '→ In Progress')?.worked).toBe(true);
        expect(probe.controls.find(c => c.label === '→ Cancelled')?.effect).toBe('consumed');
        expect(verdict.findings.map(f => f.code)).not.toContain('controls_not_reached');
    });

    it('a control gone with no write to the product is still not reached, and still told', async () => {
        const { probe, verdict } = await walk(LOCAL);
        expect(probe.controls.find(c => c.label === 'Hide extras')?.worked).toBe(true);
        expect(probe.controls.find(c => c.label === 'Extra')?.effect).toBe('not found');
        expect(verdict.findings.map(f => f.code)).toContain('controls_not_reached');
    });
});

describe('a requested item in other words of a requirement found met', () => {
    it('L451: «issues with custom fields» and «wiki with rich text» are read by their requirements, in another order', () => {
        const met = ['custom fields', 'Custom fields on issues', 'rich text', 'Rich text in the wiki', 'a wiki', 'A wiki'];
        expect(readAsRequirements(['issues with custom fields', 'wiki with rich text'], met)).toEqual(['issues with custom fields', 'wiki with rich text']);
    });

    it('one requirement holds every word of it — two requirements that each hold a part do not', () => {
        expect(readAsRequirements(['issues with custom fields'], ['Issues', 'Custom fields'])).toEqual([]);
        expect(readAsRequirements(['issues with custom fields'], ['Issues'])).toEqual([]);
    });

    it('a plural, the joining words and the Arabic article are set aside; a negation never is', () => {
        expect(readAsRequirements(['categories of products'], ['Product category'])).toEqual(['categories of products']);
        expect(readAsRequirements(['ملاحظات الأطباء'], ['أطباء مع ملاحظات'])).toEqual(['ملاحظات الأطباء']);
        expect(readAsRequirements(['جدول حصص بلا تعارض'], ['جدول حصص'])).toEqual([]);
        expect(readAsRequirements(['timetable without conflicts'], ['Conflicts in the timetable'])).toEqual([]);
    });

    it('the builder is told what reads an item, and what does not', () => {
        const verify = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine', 'verify.ts'), 'utf-8');
        expect(verify).toMatch(/an item is read when the server serves a route named for it, or when a requirement read from his request that holds every word of it is judged met on the source; a requirement added with plan_update, a test named after it, or an evidence line does not read it/);
    });
});
