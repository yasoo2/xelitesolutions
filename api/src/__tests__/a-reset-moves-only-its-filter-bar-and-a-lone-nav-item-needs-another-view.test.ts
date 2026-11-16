/**
 * ⛔ A RESET MOVES ONLY ITS OWN FILTER BAR AND READS ONLY ITS OWN BOX; A MEASURED DEAD PRESS IS NEVER HIDDEN BY «IDLE»;
 * A LONE NAV ITEM IS THE OPEN VIEW'S LINK ONLY WHEN THE PAGE SHOWS ANOTHER VIEW.
 *
 * The independent review of 2026-11-15 (claude/r40-qa, 68f9ad4df):
 *   7. an «idle» reset from one walk replaced a measured dead result from another in the verdict;
 *   8. `<nav><button>السلة</button></nav>` wired to nothing, on an app with one view, was «the first
 *      item of its navigation» and never dead;
 *   9. «عرض الكل» beside a list whose rows carry autosaving checkboxes made the QA tick a real record;
 *  10. a toolbar redrawn with innerHTML lost the QA's box, an empty header search was read instead,
 *      and a dead Reset «cleared» it.
 * Each with its sound twin passing.
 */
import http from 'http';
import { chromium } from 'playwright';
import { probeControls, judgeBehaviour } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(240_000);

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => boolean;

async function probe(page: string, api: Handler = () => false) {
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

const STYLE = '<style>body{font-family:sans-serif;margin:16px} button,select,input{min-height:44px;min-width:90px;margin:4px} li{min-height:36px}</style>';

/* ---- 7: «idle» never replaces a measured dead press ------------------------------------------- */

test('a reset pressed on a moved state and still quiet stays dead, whichever walk the «idle» came from (finding 7)', () => {
    const fair = { label: 'Reset', kind: 'button', worked: false, effect: '', instance: 0, fair: true } as any;
    const first = { label: 'Reset', kind: 'button', worked: false, effect: '', instance: 0 } as any;
    const idle = { label: 'Reset', kind: 'button', worked: false, effect: 'idle', instance: 0 } as any;
    const save = { label: 'Save', kind: 'button', worked: true, effect: 'dom', instance: 0 } as any;
    for (const order of [[fair, first, idle, save], [first, idle, fair, save], [first, fair, idle, save]]) {
        expect(judgeBehaviour(order, {}, []).findings.map(f => f.code)).toContain('some_dead_controls');
    }
    //  The twin: never given anything to undo, it is not judged.
    expect(judgeBehaviour([first, idle, save], {}, []).findings.map(f => f.code)).not.toContain('some_dead_controls');
});

const PERIODS = (wired: boolean) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير المبيعات</title>${STYLE}</head><body>
<h1>تقرير مبيعات المكتبة</h1>
<section class="card filters" aria-label="فلترة الفترة الزمنية">
  <label>من شهر <input type="month" id="from"></label>
  <label>إلى شهر <input type="month" id="to"></label>
  <button type="button" id="reset-filter">كل الفترات</button>
  <span id="period-label">كل الفترات</span>
</section>
<ul id="rows"></ul>
<script>
  var sales = [{ m: '2026-01', a: 40 }, { m: '2026-06', a: 15 }, { m: '2026-10', a: 22 }];
  function draw() {
    var from = document.getElementById('from').value, to = document.getElementById('to').value;
    document.getElementById('period-label').textContent = from || to ? (from || '…') + ' — ' + (to || '…') : 'كل الفترات';
    document.getElementById('rows').innerHTML = sales.filter(function (s) { return (!from || s.m >= from) && (!to || s.m <= to); }).map(function (s) { return '<li>' + s.m + ' — ' + s.a + '</li>'; }).join('');
  }
  ['from', 'to'].forEach(function (id) { document.getElementById(id).addEventListener('change', draw); });
  ${wired ? "document.getElementById('reset-filter').onclick = function () { document.getElementById('from').value = ''; document.getElementById('to').value = ''; draw(); };" : ''}
  draw();
</script></body></html>`;

test('a filter bar that is itself a card (P386) still has its month moved; wired, «كل الفترات» is credited', async () => {
    const { result, dead } = await probe(PERIODS(true));
    expect(dead).not.toContain('كل الفترات');
    expect(result.controls.some(c => c.label === 'كل الفترات' && c.worked)).toBe(true);
});

test('…and wired to nothing it is dead, its dead press marked as measured (findings 7, 9)', async () => {
    const { result, dead } = await probe(PERIODS(false));
    expect(dead).toContain('كل الفترات');
    expect(result.controls.some(c => c.label === 'كل الفترات' && !c.worked && c.fair === true)).toBe(true);
});

/* ---- 8: a lone nav item ------------------------------------------------------------------------ */

const ONE_VIEW = (checkoutWaits: boolean) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>متجر الورد</title>${STYLE}</head><body>
<header><div class="brand">متجر الورد</div><nav><button type="button" id="cart">السلة</button></nav></header>
<main><h2>الورود</h2><p>في السلة: <span id="n">0</span></p><button type="button" id="add">أضف وردة</button>
${checkoutWaits ? '<aside><button type="button" id="checkout" disabled>إتمام الطلب</button></aside>' : ''}</main>
<script>
  var n = 0;
  document.getElementById('add').onclick = function () { n++; document.getElementById('n').textContent = String(n); };
</script></body></html>`;

test('a lone nav item wired to nothing, on an app with one view, is dead (finding 8)', async () => {
    const { dead } = await probe(ONE_VIEW(false));
    expect(dead).toContain('السلة');
});

test('…and beside a way to another view the page does not open yet (P236: a disabled checkout), it is not judged', async () => {
    const { dead } = await probe(ONE_VIEW(true));
    expect(dead).not.toContain('السلة');
});

/* ---- 9: the clear probe never moves a record's own field --------------------------------------- */

const CHORES = (wired: boolean) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>المهام</title>${STYLE}</head><body>
<h1>مهام البيت</h1>
<section id="tasks">
  <div class="head"><h2>المهام</h2><button type="button" id="all">عرض الكل</button></div>
  <ul id="list"></ul>
</section>
<script>
  var tasks = [];
  function draw() {
    document.getElementById('list').innerHTML = tasks.map(function (t) { return '<li data-id="' + t.id + '"><label><input type="checkbox" data-id="' + t.id + '"' + (t.done ? ' checked' : '') + '> ' + t.title + '</label></li>'; }).join('');
    document.querySelectorAll('#list input').forEach(function (box) {
      box.onchange = function () { fetch('/api/tasks/' + box.dataset.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done: box.checked }) }); };
    });
  }
  ${wired ? "document.getElementById('all').onclick = function () { fetch('/api/tasks').then(function (r) { return r.json(); }).then(function (l) { tasks = l; draw(); }); };" : ''}
  fetch('/api/tasks').then(function (r) { return r.json(); }).then(function (l) { tasks = l; draw(); });
</script></body></html>`;

const choresApi = (tasks: any[], patched: string[]): Handler => (req, body, res) => {
    if (!String(req.url).startsWith('/api/tasks')) return false;
    if (req.method === 'PATCH') {
        patched.push(`${req.url} ${body}`);
        const t = tasks.find(x => `/api/tasks/${x.id}` === req.url);
        if (t) t.done = !!JSON.parse(body || '{}').done;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(tasks));
    return true;
};

test('«عرض الكل» beside a list of autosaving checkboxes never makes the QA tick a real task (finding 9)', async () => {
    const tasks = [{ id: 1, title: 'شراء الحليب', done: false }, { id: 2, title: 'سقي الورد', done: false }];
    const patched: string[] = [];
    await probe(CHORES(false), choresApi(tasks, patched));
    expect(patched).toEqual([]);
    expect(tasks.every(t => !t.done)).toBe(true);
});

/* ---- 10: the clear probe reads its own box, found again after a redraw ----------------------- */

const REDRAWN = (wired: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Products</title>${STYLE}</head><body>
<header><input type="search" aria-label="Search the site" placeholder="Search the site"></header>
<h1>Products</h1>
<div class="toolbar" id="bar"></div>
<ul id="list"></ul>
<script>
  var q = '', items = ['Blue mug', 'Green teapot', 'Red kettle'];
  function draw() { document.getElementById('list').innerHTML = items.filter(function (i) { return !q || i.toLowerCase().indexOf(q.toLowerCase()) >= 0; }).map(function (i) { return '<li>' + i + '</li>'; }).join('') || '<li>No products match</li>'; }
  function bar() {
    document.getElementById('bar').innerHTML = '<input type="search" name="q" placeholder="Filter products" value="' + q + '"><button type="button" id="reset">Reset</button>';
    var box = document.querySelector('#bar input');
    box.addEventListener('keydown', function (e) { if (e.key === 'Enter') { q = box.value; bar(); draw(); } });
    ${wired ? "document.getElementById('reset').onclick = function () { q = ''; bar(); draw(); };" : ''}
  }
  bar(); draw();
</script></body></html>`;

test('a dead Reset beside a box the page drew again is dead — never «cleared» by an empty search box elsewhere (finding 10)', async () => {
    const { dead, result } = await probe(REDRAWN(false));
    expect(result.controls.some(c => c.label === 'Reset' && c.worked)).toBe(false);
    expect(dead).toContain('Reset');
});

test('…and a wired Reset beside the same redrawn box is credited', async () => {
    const { dead, result } = await probe(REDRAWN(true));
    expect(dead).not.toContain('Reset');
    expect(result.controls.some(c => c.label === 'Reset' && c.worked)).toBe(true);
});
