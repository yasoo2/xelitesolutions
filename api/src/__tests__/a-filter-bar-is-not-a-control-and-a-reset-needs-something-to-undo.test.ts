/**
 * ⛔ A BAR NAMED «filter» IS NOT A CONTROL, AND A RESET IS DEAD ONLY AFTER IT HAD SOMETHING TO UNDO.
 *
 * The 500-prompt exam on claude-haiku, 2026-11-13:
 *   - P397: <div class="filter" id="filter-bar"> — the whole bar, «From To Last 3 months Last 6
 *     months Reset range» — was pressed as a tab and called unresponsive; P236 the same of a
 *     <label class="filter"> around a <select>.
 *   - P386: «كل الفترات» reset a date filter that has no text box, on a report that opens on every
 *     period; pressed on the page as it loads it changed nothing, correctly, and was «dead».
 * And what the QA could not reach (P094, P195: `forms_not_reached`) is told, never a refusal.
 * Each with its broken twin: a real filter button wired to nothing, and a reset wired to nothing
 * beside a field the QA moved, are still dead.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls, judgeBehaviour } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

async function probe(page: string) {
    const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const result = await probeControls(tab, { fillForms: false, budgetMs: 60_000, isolateBaselineControls: true, baselineViewport: { width: 1280, height: 900 } });
        const verdict = judgeBehaviour(result.controls, result.metrics as any, []);
        const dead = verdict.findings.filter(f => f.code === 'some_dead_controls' || f.code === 'dead_controls')
            .flatMap(f => ((f as any).evidence || []).map((e: any) => String(e.label)));
        return { result, verdict, dead };
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}

const REPORT = (wired: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sales report</title>
<style>body{font-family:sans-serif;margin:16px} button,select,input{min-height:44px;min-width:90px;margin:4px} li{height:36px}</style></head><body>
<h1>Sales report</h1>
<div class="filter" id="filter-bar">
  From <input type="date" id="from" aria-label="From"> To <input type="date" id="to" aria-label="To">
  <button type="button" id="last3">Last 3 months</button>
  <button type="button" id="reset">Reset range</button>
</div>
<label class="filter">Category <select id="cat"><option value="">All</option><option value="books">Books</option><option value="toys">Toys</option></select></label>
<button type="button" class="filter" data-filter="archived" id="archived">Archived</button>
<ul id="rows"></ul>
<script>
  var sales = [{ d: '2026-01-10', c: 'books', a: 40 }, { d: '2026-06-02', c: 'toys', a: 15 }, { d: '2026-10-20', c: 'books', a: 22 }];
  function draw() {
    var from = document.getElementById('from').value, to = document.getElementById('to').value, cat = document.getElementById('cat').value;
    var shown = sales.filter(function (s) { return (!from || s.d >= from) && (!to || s.d <= to) && (!cat || s.c === cat); });
    document.getElementById('rows').innerHTML = shown.map(function (s) { return '<li>' + s.d + ' ' + s.c + ' ' + s.a + '</li>'; }).join('');
  }
  ['from', 'to', 'cat'].forEach(function (id) { document.getElementById(id).addEventListener('change', draw); });
  document.getElementById('last3').onclick = function () { document.getElementById('from').value = '2026-08-01'; document.getElementById('to').value = ''; draw(); };
  document.getElementById('reset').onclick = function () { document.getElementById('from').value = ''; document.getElementById('to').value = ''; draw(); };
  ${wired ? "document.getElementById('archived').onclick = function () { document.getElementById('rows').innerHTML = '<li>No archived sales</li>'; };" : ''}
  draw();
</script></body></html>`;

test('the bar and the label named «filter» are not pressed as controls; a filter button wired to nothing still is, and is dead (P397, P236)', async () => {
    const { result, dead } = await probe(REPORT(false));
    const labels = result.controls.map(c => c.label);
    expect(labels.some(l => /From\s+To/.test(l))).toBe(false);
    expect(labels.some(l => /^Category/.test(l))).toBe(false);
    expect(dead.some(l => /From\s+To/.test(l) || /^Category/.test(l))).toBe(false);
    //  A real control carrying the class is still a control, and still judged.
    expect(labels).toContain('Archived');
    expect(dead).toContain('Archived');
});

test('…and wired, the same filter button is not dead', async () => {
    const { dead } = await probe(REPORT(true));
    expect(dead).not.toContain('Archived');
    expect(dead).not.toContain('Reset range');
});

const PERIODS = (wired: boolean) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير المبيعات</title>
<style>body{font-family:sans-serif;margin:16px} button,input{min-height:44px;min-width:90px;margin:4px} li{height:36px}</style></head><body>
<h1>تقرير المبيعات</h1>
<div class="toolbar">
  <label>من <input type="date" id="from"></label>
  <label>إلى <input type="date" id="to"></label>
  <button type="button" id="reset-filter">كل الفترات</button>
</div>
<ul id="rows"></ul>
<script>
  var sales = [{ d: '2026-01-10', a: 40 }, { d: '2026-06-02', a: 15 }, { d: '2026-10-20', a: 22 }];
  function draw() {
    var from = document.getElementById('from').value, to = document.getElementById('to').value;
    var shown = sales.filter(function (s) { return (!from || s.d >= from) && (!to || s.d <= to); });
    document.getElementById('rows').innerHTML = shown.map(function (s) { return '<li>' + s.d + ' — ' + s.a + '</li>'; }).join('');
  }
  ['from', 'to'].forEach(function (id) { document.getElementById(id).addEventListener('change', draw); });
  ${wired ? "document.getElementById('reset-filter').onclick = function () { document.getElementById('from').value = ''; document.getElementById('to').value = ''; draw(); };" : ''}
  draw();
</script></body></html>`;

test('«كل الفترات» on a report already showing every period is pressed after its date was moved, and credited (P386)', async () => {
    const { result, dead } = await probe(PERIODS(true));
    expect(dead).not.toContain('كل الفترات');
    expect(result.controls.some(c => c.label === 'كل الفترات' && c.worked)).toBe(true);
});

test('…and «كل الفترات» wired to nothing, pressed after its date was moved, is still dead', async () => {
    const { dead, result } = await probe(PERIODS(false));
    expect(dead).toContain('كل الفترات');
    expect(((result.metrics as any).secondLook || []).some((s: any) => s.label === 'كل الفترات' && /moved/.test(String(s.after)))).toBe(true);
});

const STORE = (wired: boolean, canLeave: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Books</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;min-width:90px;margin:4px}</style></head><body>
<header><div class="brand">Page &amp; Shelf</div><nav><button type="button" id="shop">Shop</button><span id="count">Cart: 0</span></nav></header>
<main id="view"></main>
<script>
  var n = 0, view = 'shop';
  function draw() {
    document.getElementById('count').textContent = 'Cart: ' + n;
    document.getElementById('view').innerHTML = view === 'shop'
      ? '<h2>All books</h2><button type="button" id="add">Add to cart</button>' + (${canLeave} ? '<button type="button" id="cart">View cart</button>' : '')
      : '<h2>Your cart</h2><p>' + n + ' item(s)</p>';
    var add = document.getElementById('add'); if (add) add.onclick = function () { n++; draw(); };
    var cart = document.getElementById('cart'); if (cart) cart.onclick = function () { view = 'cart'; draw(); };
  }
  ${wired ? "document.getElementById('shop').onclick = function () { view = 'shop'; draw(); };" : ''}
  draw();
</script></body></html>`;

test('a lone nav item to the view the store opens on, with no other view to try it from, is not dead (the replay of P236)', async () => {
    const { dead } = await probe(STORE(true, false));
    expect(dead).not.toContain('Shop');
});

test('…and a lone nav item wired to nothing, pressed from another view, is dead', async () => {
    const { dead } = await probe(STORE(false, true));
    expect(dead).toContain('Shop');
});

test('a reset never given anything to undo is not judged; one pressed on a moved state and still quiet is', () => {
    const idle = judgeBehaviour([
        { label: 'Reset', kind: 'button', worked: false, effect: '', instance: 0 } as any,
        { label: 'Reset', kind: 'button', worked: false, effect: 'idle', instance: 0 } as any,
        { label: 'Save', kind: 'button', worked: true, effect: 'dom', instance: 0 } as any,
    ], {}, []);
    expect(idle.findings.map(f => f.code)).not.toContain('some_dead_controls');
    const quiet = judgeBehaviour([
        { label: 'Reset', kind: 'button', worked: false, effect: '', instance: 0 } as any,
        { label: 'Save', kind: 'button', worked: true, effect: 'dom', instance: 0 } as any,
    ], {}, []);
    expect(quiet.findings.map(f => f.code)).toContain('some_dead_controls');
});

test('forms the QA could not reach again are told, minor — never a refusal (P094, P195)', () => {
    const findings = judgeBehaviour([], { formsNotReached: 2, formsNotReachedEvidence: [{ label: 'إضافة مباراة', reason: 'form missing after state change' }] }).findings;
    const gap = findings.find(f => f.code === 'forms_not_reached')!;
    expect(gap.severity).toBe('minor');
    expect(findings.some(f => f.severity !== 'minor')).toBe(false);
});
