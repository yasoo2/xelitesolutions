/**
 * ⛔ A SCREEN A BUTTON OPENS IS WALKED, A FORM IT SHOWS IS FILLED THERE, AND WHAT A FORM MADE IS FOUND.
 *
 * The live check of the rebuilt QA, 2026-11-10, four prompts on the test Joe:
 *  - L160, a car rental admin: «Cars», «Bookings», «Customers» were buttons that
 *    set «#cars» (replaceState, read on load). The walk walked «/» only, pressed
 *    «Summary» nine times, and filled no form of the admin.
 *  - L162, an Arabic store: «تأكيد الطلب» kept each order in a «طلباتي» list by
 *    its number and date, not by the buyer's name the QA had typed; «appeared
 *    temporarily» four times, and the run ended undelivered after 32 minutes.
 *  - L161, a water store: exploration pressed «Decrease» before «Proceed to
 *    checkout», emptied the cart, and never reached the checkout; and «a cart
 *    that adds and removes items» asked it for «adding a record and removing it».
 * Pinned on a real browser and on the rules.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import { auditBuiltApp, routeOfLanding } from '../core/quality/app-audit';
import { forwardRank, judgeBehaviour, probeControls, sameDocumentUrl } from '../core/quality/behaviour-audit';
import { productProfile } from '../core/quality/qa-product-profile';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

const servers: http.Server[] = [];
afterAll(async () => {
    for (const s of servers) await new Promise<void>(r => s.close(() => r()));
});

async function serve(page: string, api?: (req: http.IncomingMessage, body: string, res: http.ServerResponse) => boolean) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-screens-'));
    fs.writeFileSync(path.join(dir, 'index.html'), page);
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            if (api && api(req, body, res)) return;
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page);
        });
    });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return { dir, url: `http://127.0.0.1:${(server.address() as any).port}/` };
}

/* ---- the rules ---------------------------------------------------------- */

test('the screen a press landed on, named as the walk names its screens', () => {
    const base = 'http://127.0.0.1:4000/';
    expect(routeOfLanding('http://127.0.0.1:4000/#cars', base)).toBe('#cars');
    expect(routeOfLanding('http://127.0.0.1:4000/#/p/1/board', base)).toBe('#/p/1/board');
    expect(routeOfLanding('http://127.0.0.1:4000/orders?page=2', base)).toBe('/orders?page=2');
    expect(routeOfLanding('http://127.0.0.1:4000/', base)).toBe('');
    expect(routeOfLanding('https://elsewhere.example/#cars', base)).toBe('');
    expect(sameDocumentUrl('http://x/#cars', 'http://x/')).toBe(true);
    expect(sameDocumentUrl('http://x/a', 'http://x/b')).toBe(false);
});

test('what goes forward is pressed before what takes away', () => {
    expect(forwardRank('Proceed to checkout')).toBe(0);
    expect(forwardRank('متابعة إتمام الطلب')).toBe(0);
    expect(forwardRank('Decrease Spring Water')).toBe(2);
    expect(forwardRank('حذف')).toBe(2);
    expect(forwardRank('−')).toBe(2);
    expect(forwardRank('Details')).toBe(1);
});

test('a cart that adds and removes items is not a record to add and remove', () => {
    const ids = (r: string) => productProfile(r).journeys.map(j => j.id);
    expect(ids('Build an online store: a cart that adds and removes items and updates the total, and a checkout form.')).not.toContain('manage');
    expect(ids('Build an admin dashboard for a car rental company to manage cars: add, edit, delete and search each one.')).toContain('manage');
    expect(ids('A notes app: add a note and delete it.')).toContain('manage');
});

/* ---- screens a button opens --------------------------------------------- */

const ADMIN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rental admin</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;min-width:90px;margin:4px} .hidden{display:none} input{display:block;margin:6px 0;min-height:36px}</style></head><body>
<header><h1>Rental admin</h1><nav>
<button class="nav-btn" data-view="summary">Summary</button><button class="nav-btn" data-view="cars">Cars</button><button class="nav-btn" data-view="customers">Customers</button>
</nav></header>
<main>
<section id="view-summary" class="view"><h2>Summary</h2><p id="totals">Cars: 0 · Customers: 0</p></section>
<section id="view-cars" class="view hidden"><h2>Cars</h2><button id="add-cars" type="button">Add car</button><div id="cars-form"></div><ul id="cars-list"></ul></section>
<section id="view-customers" class="view hidden"><h2>Customers</h2><button id="add-customers" type="button">Add customer</button><div id="customers-form"></div><ul id="customers-list"></ul></section>
</main>
<script>
  var FIELDS = { cars: [['model', 'Model', 'text'], ['rate', 'Daily rate', 'number']], customers: [['name', 'Full name', 'text'], ['email', 'Email', 'email']] };
  function load(kind) { return fetch('/api/' + kind).then(function (r) { return r.json(); }).then(function (rows) {
    document.getElementById(kind + '-list').innerHTML = rows.map(function (row) { return '<li>' + Object.values(row).map(function (v) { return String(v).replace(/</g, '&lt;'); }).join(' — ') + '</li>'; }).join('');
  }); }
  function openForm(kind) {
    var wrap = document.getElementById(kind + '-form');
    wrap.innerHTML = '<form id="' + kind + '-f"><h3>New</h3>' + FIELDS[kind].map(function (f) { return '<label>' + f[1] + '<input name="' + f[0] + '" type="' + f[2] + '" required></label>'; }).join('') + '<button type="submit">Create</button></form>';
    document.getElementById(kind + '-f').onsubmit = function (e) {
      e.preventDefault();
      var body = {}; FIELDS[kind].forEach(function (f) { body[f[0]] = e.target.elements[f[0]].value; });
      fetch('/api/' + kind, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { if (!r.ok) throw new Error('refused'); wrap.innerHTML = ''; return load(kind); }).catch(function () {});
    };
  }
  function show(view) {
    if (['summary', 'cars', 'customers'].indexOf(view) < 0) view = 'summary';
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    document.querySelectorAll('.view').forEach(function (v) { v.classList.add('hidden'); });
    document.getElementById('view-' + view).classList.remove('hidden');
    if (view !== 'summary') load(view);
  }
  document.querySelectorAll('.nav-btn').forEach(function (b) { b.onclick = function () { show(b.dataset.view); }; });
  document.getElementById('add-cars').onclick = function () { openForm('cars'); };
  document.getElementById('add-customers').onclick = function () { openForm('customers'); };
  show(location.hash.slice(1));
</script></body></html>`;

test('screens its buttons open are walked, and the forms they show are filled where they appear', async () => {
    const rows: Record<string, any[]> = { cars: [], customers: [] };
    const { dir, url } = await serve(ADMIN, (req, body, res) => {
        const m = /^\/api\/(cars|customers)$/.exec(String(req.url || ''));
        if (!m) return false;
        if (req.method === 'POST') {
            let row: any = {};
            try { row = JSON.parse(body); } catch { /* refused below */ }
            const bad = Object.values(row).some(v => String(v).trim() === '')
                || (m[1] === 'cars' && !(Number(row.rate) > 0))
                || (m[1] === 'customers' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(row.email || '')));
            if (bad) { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"invalid"}'); return true; }
            rows[m[1]].push({ id: rows[m[1]].length + 1, ...row });
            res.writeHead(201, { 'content-type': 'application/json' }); res.end('{}'); return true;
        }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(rows[m[1]])); return true;
    });
    const audit: any = await auditBuiltApp(dir, { serveUrl: url, timeoutMs: 120_000, request: 'An admin dashboard for a car rental company to manage cars and customers.' } as any);
    expect(audit.routes).toEqual(expect.arrayContaining(['#cars', '#customers']));
    expect(Number(audit.formsFilled || 0)).toBeGreaterThanOrEqual(2);
    expect(Number(audit.formsPersisted || 0)).toBeGreaterThanOrEqual(2);
    const ids = (audit.findings || []).map((f: any) => f.id);
    expect(ids).not.toContain('form_persistence_unproven');
    expect(ids).not.toContain('forms_not_reached');
    //  A nav button that took the walk to its screen is not pressed again on every other screen:
    //  pressed where it was met (its own screen, where it rightly does nothing) and where it first travelled — reached on the rest.
    const pressedOn = new Set((audit.controls || [])
        .filter((c: any) => (c.bare || c.label) === 'Summary' && c.effect !== 'reached' && String(c.context || '').startsWith('desktop:'))
        .map((c: any) => c.context));
    expect(pressedOn.size).toBeLessThanOrEqual(2);
    expect((audit.controls || []).some((c: any) => (c.bare || c.label) === 'Summary' && c.context === 'desktop:#customers' && c.effect === 'reached')).toBe(true);
});

/* ---- what a form made --------------------------------------------------- */

function tickets(keeps: boolean): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Help desk</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;min-width:100px} input,textarea{display:block;margin:6px 0;min-height:36px;width:300px}</style></head><body>
<h1>Help desk</h1>
<form id="f"><h2>New ticket</h2><label>Subject<input name="subject" required></label><label>Details<textarea name="details" required></textarea></label><button type="submit">Create ticket</button></form>
<p id="toast" role="status"></p>
<h2>Tickets</h2><ul id="list"></ul>
<script>
  var KEEPS = ${keeps};
  function draw() { var all = JSON.parse(localStorage.getItem('tickets') || '[]');
    document.getElementById('list').innerHTML = all.map(function (t) { return '<li>' + t.id + ' — opened ' + t.at + ' — open</li>'; }).join(''); }
  document.getElementById('f').onsubmit = function (e) {
    e.preventDefault();
    var id = 'TCK-' + Math.random().toString(36).slice(2, 7).toUpperCase() + '7';
    document.getElementById('toast').textContent = 'Ticket ' + id + ' created';
    if (KEEPS) { var all = JSON.parse(localStorage.getItem('tickets') || '[]'); all.unshift({ id: id, at: new Date().toISOString().slice(11, 19) }); localStorage.setItem('tickets', JSON.stringify(all)); draw(); }
    e.target.reset();
  };
  draw();
</script></body></html>`;
}

const CHECKOUT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;min-width:100px} input{display:block;margin:6px 0;min-height:36px;width:300px}</style></head><body>
<h1>Shop</h1><p>Cart: 1 item, $4.99</p>
<form id="f"><h2>Checkout</h2><label>Full name<input name="name" required></label><label>Address<input name="address" required></label><button type="submit">Place order</button></form>
<p id="toast" role="status"></p>
<script>
  document.getElementById('f').onsubmit = function (e) { e.preventDefault(); document.getElementById('toast').textContent = 'Order ORD-' + Date.now().toString(36).toUpperCase() + ' confirmed'; e.target.reset(); };
</script></body></html>`;

async function probePage(html: string) {
    const { url } = await serve(html);
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(url, { waitUntil: 'load' });
        const probe = await probeControls(tab, { budgetMs: 60_000 });
        return { probe, verdict: judgeBehaviour(probe.controls, { ...probe.metrics }) };
    } finally {
        await browser.close();
    }
}

test('a record kept by a mark of its own, not by what was typed, is a record kept', async () => {
    const { probe, verdict } = await probePage(tickets(true));
    expect(Number(probe.metrics.formsPersisted || 0)).toBeGreaterThanOrEqual(1);
    expect(verdict.findings.map(f => f.code)).not.toContain('form_persistence_unproven');
});

test('…and a form that only says «created» is told what never showed, not that it «appeared temporarily»', async () => {
    const { verdict } = await probePage(tickets(false));
    const finding = verdict.findings.find(f => f.code === 'form_persistence_unproven');
    expect(finding).toBeDefined();
    expect(finding!.en).toMatch(/never showed outside the form/);
    expect(finding!.en).not.toMatch(/appeared temporarily/);
    expect(finding!.ar).toMatch(/لم يظهر خارج النموذج/);
});

test('an order confirmed and kept nowhere is told with the delivery, never refused', async () => {
    const { verdict } = await probePage(CHECKOUT);
    const codes = verdict.findings.map(f => f.code);
    expect(codes).not.toContain('form_persistence_unproven');
    const told = verdict.findings.find(f => f.code === 'order_not_kept');
    expect(told).toBeDefined();
    expect(told!.severity).toBe('minor');
});
