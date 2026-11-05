/**
 * ⛔ A FILTER IS MEASURED ON THE PAGE, NOT BY WHAT ITS VARIABLES ARE CALLED.
 *
 * The 500-prompt exam, 2026-11-03. Three interactive reports (P352, P353,
 * P354) were refused four times each with «artifact coverage — missing:
 * filtering». Their period <select> and date inputs worked: each change
 * re-drew the totals and the charts from `records.filter(...)`. The scope
 * audit's filter evidence wanted a variable named «…Filter» (or setCategory,
 * activeRange). The builders added a filtering.js, then a README, then gave up.
 * And an admin dashboard (P053) that managed orders was refused with «missing:
 * orders» because the orders keyword wanted a cart; the records gate had
 * already measured the orders record and passed it.
 *
 * Measured on those apps: P352 — choosing «3m» in «الفترة الزمنية» changed
 * the items shown; P353 — setting «From» changed them; P354 — choosing
 * «y2024» changed the numbers. A landing page's «Grade of interest» select and
 * «Full name» box changed nothing and stayed refused.
 *
 * Here, on real pages served over http: what must pass passes, and what must
 * stay refused — an add form beside a delete-by-filter list, tabs, a sort that
 * only reorders, a clock that ticks by itself — stays refused.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { DeliveryLedger } from '../core/quality/delivery-verdict';
import { deliveryRun } from '../core/quality/delivery-run';
import { scopeReport } from '../core/quality/scope-audit';

jest.setTimeout(240_000);

const roots: string[] = [];
const servers: http.Server[] = [];
afterAll(async () => {
    for (const s of servers) await new Promise<void>(r => s.close(() => r()));
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-filter-on-page-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

async function serve(dir: string): Promise<string> {
    const server = http.createServer((req, res) => {
        const p = decodeURIComponent(String(req.url || '/').split('?')[0]);
        const file = path.join(dir, p.endsWith('/') ? `${p}index.html` : p);
        if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(file));
    });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return `http://127.0.0.1:${(server.address() as any).port}/`;
}

/** The scope verdict the delivery records for this tree, served live. */
async function scopeOf(request: string, files: Record<string, string>) {
    const root = tree(files);
    const url = await serve(root);
    const ledger = new DeliveryLedger();
    const lines: string[] = [];
    const delivery = deliveryRun({
        productRequest: request,
        ledger,
        deliveryRoles: { service: false, interface: true, program: false },
        deliveredRoots: (extra = []) => Array.from(new Set([root, ...extra].filter(r => r && fs.existsSync(r)).map(r => path.resolve(r)))),
        deliveryParts: () => [{ root, tool: 'general_agent' }],
        runTool: async () => { throw new Error('no tool expected'); },
        requireInstrument: () => { },
        log: line => lines.push(line),
    });
    await delivery.recordLiveAcceptance({ ok: true, output: { url, cwd: root, kind: 'static-site' } }, root, [root]);
    const scope = ledger.all().find(m => m.instrument === 'scope');
    return { root, scope, state: delivery.state, lines };
}

const P352 = 'اعمل صفحة تقرير تفاعلية لـمدرسة خاصة تحمّل بيانات تجريبية عن الصفوف، وتعرض ثلاث رسوم بيانية (حسب الشهر، حسب التصنيف، أعلى 5)، وتسمح بالفلترة حسب الفترة الزمنية.';

// The P352 shape: helpers named filterRecords / filterRows, a period select and
// date inputs, totals and a canvas chart redrawn on every change.
const REPORT = {
    'index.html': `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير الصفوف</title></head><body>
<h1>تقرير الصفوف</h1>
<section id="filtering" aria-label="فلترة التقرير">
  <label for="period">الفترة الزمنية</label>
  <select id="period"><option value="all">كل الفترة</option><option value="3m">آخر 3 أشهر</option><option value="6m">آخر 6 أشهر</option></select>
  <label for="from">من</label><input type="date" id="from">
  <label for="to">إلى</label><input type="date" id="to">
</section>
<div class="kpis"><div class="kpi">عدد الصفوف: <b id="rows"></b></div><div class="kpi">عدد الطلاب: <b id="students"></b></div></div>
<canvas id="chart" width="360" height="120"></canvas>
<script src="filtering.js"></script>
<script>
  var classes = [];
  for (var m = 1; m <= 12; m++) classes.push({ date: '2026-' + String(m).padStart(2, '0') + '-15', students: 10 + m * 3, category: m % 2 ? 'علمي' : 'أدبي' });
  function $(id) { return document.getElementById(id); }
  function filterRows() { return window.ReportFiltering.filterRecords(classes, { period: $('period').value, from: $('from').value, to: $('to').value }); }
  function render() {
    var rows = filterRows();
    $('rows').textContent = rows.length;
    $('students').textContent = rows.reduce(function (a, r) { return a + r.students; }, 0);
    var g = $('chart').getContext('2d'); g.clearRect(0, 0, 360, 120); g.fillStyle = '#2a6';
    rows.forEach(function (r, i) { g.fillRect(i * 28, 120 - r.students, 20, r.students); });
  }
  $('period').addEventListener('change', render);
  $('from').addEventListener('change', render);
  $('to').addEventListener('change', render);
  render();
</script></body></html>`,
    'filtering.js': `(function () {
  function filterRecords(records, opts) {
    var last = records.length ? records[records.length - 1].date : '';
    var months = opts.period === '3m' ? 3 : opts.period === '6m' ? 6 : 0;
    var start = months ? records[Math.max(0, records.length - months)].date : '';
    return records.filter(function (c) {
      return (!start || c.date >= start) && (!opts.from || c.date >= opts.from) && (!opts.to || c.date <= opts.to) && c.date <= last;
    });
  }
  window.ReportFiltering = { filterRecords: filterRecords };
})();`,
};

describe('filtering, search and sorting are measured on the live page', () => {
    it('a period filter that works is delivered although no variable is named «…Filter»', async () => {
        //  The source alone does not show it — the reason the page is operated.
        expect(scopeReport(P352, [tree(REPORT)]).missing.map(c => c.id)).toEqual(['filtering']);
        const { scope, state, lines } = await scopeOf(P352, REPORT);
        expect(scope).toMatchObject({ instrument: 'scope', ok: true });
        expect(state.scopeAudit).toMatchObject({ requested: 1, built: 1, missing: [] });
        expect(lines.join('\n')).toMatch(/interaction filtering shown: on the live page, choosing «(3m|6m)» in «الفترة الزمنية» \(select\)/u);
    });

    it('a filter whose fields sit in identical boxes is still operated (P352, the re-run)', async () => {
        //  Three div.field boxes — a period select and two dates — were taken
        //  for the shown items, and only the two buttons beside them were
        //  pressed: «I operated 2 control(s) — «resetBtn», «loadSampleBtn»».
        const boxed = REPORT['index.html']
            .replace(/(<label for="period">[\s\S]*?<\/select>)/u, '<div class="field">$1</div>')
            .replace('<label for="from">من</label><input type="date" id="from">', '<div class="field"><label for="from">من</label><input type="date" id="from"></div>')
            .replace('<label for="to">إلى</label><input type="date" id="to">', '<div class="field"><label for="to">إلى</label><input type="date" id="to"></div>\n  <button id="resetBtn" type="button">إعادة ضبط الفلتر</button>');
        expect(boxed.match(/class="field"/g)?.length).toBe(3);
        const { scope, lines } = await scopeOf(P352, { ...REPORT, 'index.html': boxed });
        expect(scope).toMatchObject({ instrument: 'scope', ok: true });
        expect(lines.join('\n')).toMatch(/interaction filtering shown: on the live page, (choosing «(3m|6m)» in «الفترة الزمنية» \(select\)|setting «(من|إلى)» \(date\))/u);
    });

    it('a filter that appears once the sample data is loaded is found behind that button (P354)', async () => {
        //  The page opens empty; «تحميل بيانات تجريبية» loads the rows and only
        //  then shows the date filter. Measured on the first view alone, that
        //  was «the live page has no control that filters».
        const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير الاشتراكات</title></head><body>
<h1>تقرير اشتراكات النادي</h1>
<div class="actions"><button id="load">تحميل بيانات تجريبية</button></div>
<div id="app"></div>
<script>
  var subscriptions = [];
  var from = '';
  function render() {
    var app = document.getElementById('app');
    if (!subscriptions.length) { app.innerHTML = '<p>لا توجد بيانات بعد</p>'; return; }
    var shown = subscriptions.filter(function (s) { return !from || s.date >= from; });
    app.innerHTML = '<label for="from">من تاريخ</label><input type="date" id="from" value="' + from + '">'
      + '<ul>' + shown.map(function (s) { return '<li>' + s.name + ' — ' + s.date + '</li>'; }).join('') + '</ul>';
    document.getElementById('from').addEventListener('change', function (e) { from = e.target.value; render(); });
  }
  document.getElementById('load').addEventListener('click', function () {
    subscriptions = [{ name: 'سالم', date: '2025-01-10' }, { name: 'منى', date: '2025-06-02' }, { name: 'عادل', date: '2025-11-20' }];
    render();
  });
  render();
</script></body></html>`;
        const { scope, lines } = await scopeOf('اعمل صفحة تقرير تفاعلية لنادي رياضي تحمّل بيانات تجريبية عن الاشتراكات، وتسمح بالفلترة حسب الفترة الزمنية.', { 'index.html': page });
        expect(scope).toMatchObject({ instrument: 'scope', ok: true });
        expect(lines.join('\n')).toMatch(/interaction filtering shown: on the live page, after pressing «تحميل بيانات تجريبية», setting «من تاريخ» \(date\)/u);
    });

    it('a search inside another tab is found by opening that tab, and a tab alone is still no search', async () => {
        const dashboard = (withSearch: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Admin</title></head><body>
<nav><a href="#/summary">Summary</a> <a href="#/orders">Orders</a></nav>
<main id="view"></main>
<script>
  var orders = ['Ali — 3 pizzas', 'Mona — 2 salads', 'Sami — 1 soup', 'Rana — 4 pizzas'];
  function show() {
    var v = document.getElementById('view');
    if (location.hash !== '#/orders') { v.innerHTML = '<h2>Summary</h2><p>Total orders: ' + orders.length + '</p>'; return; }
    v.innerHTML = '<h2>Orders</h2>' + (${withSearch} ? '<label for="q">Find an order</label><input id="q" type="text">' : '') + '<ul id="list"></ul>';
    var draw = function () {
      var q = ((document.getElementById('q') || {}).value || '').toLowerCase();
      document.getElementById('list').innerHTML = orders.filter(function (o) { return o.toLowerCase().indexOf(q) >= 0; }).map(function (o) { return '<li>' + o + '</li>'; }).join('');
    };
    if (document.getElementById('q')) document.getElementById('q').addEventListener('input', draw);
    draw();
  }
  window.addEventListener('hashchange', show);
  show();
</script></body></html>`;
        const request = 'Build an admin dashboard for a restaurant with a summary page and an orders page where staff can search the orders.';
        const found = await scopeOf(request, { 'index.html': dashboard(true) });
        expect(found.lines.join('\n')).toMatch(/interaction search shown: on the live page, after pressing «Orders», typing «[^»]+» into «Find an order» \(text\)/u);
        const none = await scopeOf(request, { 'index.html': dashboard(false) });
        expect(none.state.scopeAudit?.missing).toContain('search');
    });

    it('an add form beside a list that deletes with .filter is not a filter, and the refusal says what was tried', async () => {
        const request = 'Build a page for a library that lists books and lets the user filter them by genre.';
        const page = `<!doctype html><html><head><meta charset="utf-8"><title>Books</title></head><body>
<h1>Library</h1>
<form id="add"><label for="title">Title</label><input id="title" type="text">
<label for="genre">Genre</label><select id="genre"><option>Novel</option><option>History</option><option>Science</option></select>
<button>Add book</button></form>
<ul id="list"></ul>
<script>
  var books = [{ id: 1, title: 'Dune', genre: 'Novel' }, { id: 2, title: 'SPQR', genre: 'History' }, { id: 3, title: 'Cosmos', genre: 'Science' }];
  function render() {
    var ul = document.getElementById('list'); ul.innerHTML = '';
    books.forEach(function (b) {
      var li = document.createElement('li'); li.textContent = b.title + ' — ' + b.genre + ' ';
      var del = document.createElement('button'); del.textContent = 'Delete';
      del.onclick = function () { books = books.filter(function (x) { return x.id !== b.id; }); render(); };
      li.appendChild(del); ul.appendChild(li);
    });
  }
  document.getElementById('add').addEventListener('submit', function (e) {
    e.preventDefault();
    books.push({ id: Date.now(), title: document.getElementById('title').value || 'Untitled', genre: document.getElementById('genre').value });
    render();
  });
  document.getElementById('genre').addEventListener('change', function () { });
  render();
</script></body></html>`;
        const { scope, state } = await scopeOf(request, { 'index.html': page });
        expect(scope?.ok).toBe(false);
        expect(state.scopeAudit?.missing).toEqual(['filtering']);
        expect(scope?.error).toMatch(/^artifact coverage 0% — missing: filtering — filtering: on the live page I operated \d+ control\(s\) — .*«Genre» \(select\).* — and the data shown never changed$/u);
    });

    it('a category filter over cards is delivered; tabs that swap the view are not a filter', async () => {
        const request = 'Build a gym shop page with a category filter for its products.';
        const shop = `<!doctype html><html><head><meta charset="utf-8"><title>Shop</title></head><body>
<h1>Gym shop</h1>
<div class="chips"><button data-c="all">All</button><button data-c="Apparel">Apparel</button><button data-c="Supplements">Supplements</button></div>
<div id="grid"></div>
<script>
  var products = [{ n: 'Shorts', c: 'Apparel' }, { n: 'Tee', c: 'Apparel' }, { n: 'Whey', c: 'Supplements' }, { n: 'Creatine', c: 'Supplements' }];
  var showing = 'all';
  function render() {
    document.getElementById('grid').innerHTML = products.filter(function (p) { return showing === 'all' || p.c === showing; })
      .map(function (p) { return '<div class="card">' + p.n + ' · ' + p.c + '</div>'; }).join('');
  }
  document.querySelectorAll('.chips button').forEach(function (b) { b.onclick = function () { showing = b.getAttribute('data-c'); render(); }; });
  render();
</script></body></html>`;
        const shown = await scopeOf(request, { 'index.html': shop });
        expect(shown.scope?.ok).toBe(true);
        expect(shown.lines.join('\n')).toMatch(/interaction filtering shown: on the live page, pressing «(Apparel|Supplements)» \(button\): the items shown went from 4 to 2/u);

        const tabs = `<!doctype html><html><head><meta charset="utf-8"><title>Gym</title></head><body>
<nav><button id="a">Classes</button><button id="b">Trainers</button></nav>
<main id="view"></main>
<script>
  function show(which) {
    document.getElementById('view').innerHTML = which === 'a'
      ? '<h2>Classes</h2><ul><li>Yoga</li><li>Spin</li><li>Boxing</li></ul>'
      : '<h2>Trainers</h2><ul><li>Sam</li><li>Rio</li></ul>';
  }
  document.getElementById('a').onclick = function () { show('a'); };
  document.getElementById('b').onclick = function () { show('b'); };
  show('a');
</script></body></html>`;
        const swapped = await scopeOf(request, { 'index.html': tabs });
        expect(swapped.scope?.ok).toBe(false);
        expect(swapped.state.scopeAudit?.missing).toContain('filtering');
    });

    it('a sort that only reorders is sorting, never filtering; a search box that narrows is search', async () => {
        const page = `<!doctype html><html><head><meta charset="utf-8"><title>Menu</title></head><body>
<h1>Menu</h1>
<label for="q">Search dishes</label><input id="q" type="search">
<label for="order-by">Order by</label><select id="order-by"><option value="name">Name</option><option value="price">Price</option></select>
<table><thead><tr><th>Dish</th><th>Price</th></tr></thead><tbody id="rows"></tbody></table>
<script>
  // Both orders written out: the source shows no ordering call, so the page is what proves it.
  var byName = [{ n: 'Baklava', p: 5 }, { n: 'Falafel', p: 4 }, { n: 'Hummus', p: 3 }, { n: 'Kebab', p: 9 }];
  var byPrice = [{ n: 'Hummus', p: 3 }, { n: 'Falafel', p: 4 }, { n: 'Baklava', p: 5 }, { n: 'Kebab', p: 9 }];
  function render() {
    var q = document.getElementById('q').value.toLowerCase();
    var key = document.getElementById('order-by').value;
    var shown = key === 'price' ? byPrice : byName;
    document.getElementById('rows').innerHTML = shown.map(function (d) { return '<tr><td>' + d.n + '</td><td>' + d.p + '</td></tr>'; }).join('');
    Array.from(document.getElementById('rows').children).forEach(function (tr) { if (q && tr.textContent.toLowerCase().indexOf(q) < 0) tr.remove(); });
  }
  document.getElementById('q').addEventListener('input', render);
  document.getElementById('order-by').addEventListener('change', render);
  render();
</script></body></html>`;
        const sorted = await scopeOf('Build a restaurant menu page where guests can sort dishes and search them.', { 'index.html': page });
        expect(sorted.scope?.ok).toBe(true);
        expect(sorted.lines.join('\n')).toMatch(/interaction sorting shown: on the live page, choosing «price» in «Order by» \(select\): the same 4 items were reordered/u);
        expect(sorted.lines.join('\n')).toMatch(/interaction search shown: on the live page, typing «[^»]+» into «Search dishes» \(text\): the items shown went from 4 to [0-3]/u);

        // The same page, asked for a FILTER and offering only the reordering
        // select: the reorder is not counted as filtering.
        const noSearch = page.replace('<label for="q">Search dishes</label><input id="q" type="search">', '<input id="q" type="hidden">');
        const filtered = await scopeOf('Build a restaurant menu page with a filter for dishes.', { 'index.html': noSearch });
        expect(filtered.scope?.ok).toBe(false);
        expect(filtered.state.scopeAudit?.missing).toEqual(['filtering']);
    });

    it('a search whose results sit beside a longer list is measured on the results (H11)', async () => {
        //  The hard exam, 2026-11-05, H11: a blog's search worked — «No posts
        //  match your search.» — and was refused four times with «the data
        //  shown never changed». The probe watched the largest list on the
        //  page, the tag cloud (four tags), not the two posts beside it.
        const blog = (searches: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Blog</title></head><body>
<nav><a href="/">Home</a> <a href="/admin">Admin</a> <a href="/rss.xml">RSS</a></nav>
<main id="app"></main>
<script>
  var posts = [
    { title: 'Testing preview and search', body: 'How the live preview works', tags: ['testing', 'search'] },
    { title: 'Welcome to your blog', body: 'Written in markdown', tags: ['intro', 'markdown'] }];
  var recent = ['css', 'rss'];
  function chip(t, n) { return '<a class="tag-chip" href="/?tag=' + t + '">' + t + (n ? ' (1)' : '') + '</a>'; }
  function route() {
    var q = ${searches} ? (new URLSearchParams(location.search).get('q') || '') : '';
    var shown = posts.filter(function (p) { return !q || (p.title + ' ' + p.body + ' ' + p.tags.join(' ')).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    document.getElementById('app').innerHTML =
      '<form id="search-form" role="search"><input type="text" id="search-input" aria-label="Search posts"><button type="submit">Search</button></form>'
      + '<div class="layout"><section><h2>' + (q ? 'Found posts' : 'Latest posts') + '</h2><div id="post-list">'
      + (shown.length ? shown.map(function (p) { return '<article class="card"><h3>' + p.title + '</h3><p>' + p.body + '</p><div class="tags">' + p.tags.map(function (t) { return chip(t); }).join('') + '</div></article>'; }).join('') : '<p>No posts match your search.</p>')
      + '</div></section><aside><h2>Tags</h2><div class="tag-cloud">' + ['intro', 'markdown', 'search', 'testing'].map(function (t) { return chip(t, 1); }).join('') + '</div>'
      + '<h2>Recent searches</h2><ul class="recent">' + recent.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul></aside></div>';
    document.getElementById('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = document.getElementById('search-input').value.trim();
      if (v) recent.push(v);
      history.pushState({}, '', v ? '/?q=' + encodeURIComponent(v) : '/');
      route();
    });
  }
  route();
</script></body></html>`;
        const request = 'Build a blog that lists its posts with a search.';
        const found = await scopeOf(request, { 'index.html': blog(true) });
        expect(found.scope?.ok).toBe(true);
        expect(found.lines.join('\n')).toMatch(/interaction search shown: on the live page, typing «[^»]+» into «Search posts» \(text\): the items shown went from \d+ to \d+ in the list «[^»]+»/u);
        //  A list that only grew (the recent searches) and a tag cloud that
        //  never moves are not a search.
        const none = await scopeOf(request, { 'index.html': blog(false) });
        expect(none.scope?.ok).toBe(false);
        expect(none.state.scopeAudit?.missing).toEqual(['search']);
    });

    it('a counter that follows the typing is not a search', async () => {
        //  A message box with «0/120» beside it: every key changes a number on
        //  the page, and the list never narrows.
        const page = `<!doctype html><html><head><meta charset="utf-8"><title>Clinic</title></head><body>
<h1>Our doctors</h1>
<ul><li>Dr. Salem — teeth</li><li>Dr. Mona — braces</li><li>Dr. Adel — implants</li></ul>
<label for="msg">Your message</label><input id="msg" type="text" maxlength="120"><span id="count">0/120</span>
<script>
  document.getElementById('msg').addEventListener('input', function (e) { document.getElementById('count').textContent = e.target.value.length + '/120'; });
</script></body></html>`;
        const { scope } = await scopeOf('Build a clinic page that lists its doctors with a search.', { 'index.html': page });
        expect(scope?.ok).toBe(false);
    });

    it('a number that changes by itself is noise, not a filter', async () => {
        const page = `<!doctype html><html><head><meta charset="utf-8"><title>Report</title></head><body>
<h1>Sales report</h1>
<label for="range">Period</label><select id="range"><option>This month</option><option>Last month</option></select>
<p>Live visitors: <b id="live">100</b></p>
<ul><li>North 12</li><li>South 9</li></ul>
<script>
  var n = 100; setInterval(function () { document.getElementById('live').textContent = ++n; }, 120);
  document.getElementById('range').addEventListener('change', function () { });
</script></body></html>`;
        const { scope } = await scopeOf('Build a sales report page with a filter by period.', { 'index.html': page });
        expect(scope?.ok).toBe(false);
    });
});

describe('a capability that is a record he manages is judged by the records gate', () => {
    const P053 = 'Build an admin dashboard for a restaurant to manage menu items, orders, tables: add, edit, delete and search each one, with a summary page showing totals and a chart.';
    const dashboard = {
        'src/pages/OrdersPage.jsx': `import { useState } from 'react';
export default function OrdersPage({ store }) {
  const [query, setQuery] = useState('');
  const rows = store.orders.filter(o => o.customer.toLowerCase().includes(query.toLowerCase()));
  return <section><h2>Orders</h2><input value={query} onChange={e => setQuery(e.target.value)} />
    {rows.map(o => <div key={o.id}>{o.customer} {o.total}<button onClick={() => store.remove('orders', o.id)}>Delete</button></div>)}</section>;
}`,
        'index.html': '<!doctype html><div id="root"></div><script type="module" src="/src/main.jsx"></script>',
    };

    it('«manage … orders» is the orders record, not a cart', () => {
        const report = scopeReport(P053, [tree(dashboard)]);
        expect(report.missing.map(c => c.id)).not.toContain('orders');
        expect((report.asRecords || []).map(c => c.id)).toEqual(['orders']);
    });

    it('a store that asks for a cart and checkout still has to show one', () => {
        const report = scopeReport('Build an online store with a product catalogue, a cart and checkout.', [tree({ 'index.html': '<!doctype html><h1>Store</h1><ul><li>Shoe</li></ul>' })]);
        expect(report.missing.map(c => c.id)).toContain('orders');
        expect(report.asRecords || []).toEqual([]);
    });
});
