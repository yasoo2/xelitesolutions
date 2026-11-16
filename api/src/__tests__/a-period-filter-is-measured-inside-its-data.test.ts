/**
 * A PERIOD FILTER IS MEASURED INSIDE ITS DATA, AND A RECOMPUTED CARD IS DATA THAT CHANGED.
 *
 * The 500-prompt exam on Claude, 2026-11-12, P376: a warehouse's shipments
 * report with «من تاريخ» / «إلى تاريخ» set to its data's first and last day and
 * four period buttons (كل الفترة · 2024 · 2025 · آخر 90 يومًا) that recompute
 * three KPI cards and redraw three SVG charts. Replayed on the saved project:
 * the probe set the dates to 2099 and 1990 — an invalid range the page refused,
 * or the whole data again — and judged the buttons by the three cards, which
 * changed their numbers and kept their words; «the data shown never changed»,
 * and the delivery was refused four times. The 150 ms settle was not the cause:
 * the replay fails the same way on an idle machine.
 *
 * Here, on real pages served over http: both controls are measured as filters,
 * and pagination over the same kind of cards, or dates that change nothing,
 * stay refused.
 */
import http from 'http';
import { measureInteractions } from '../core/quality/interaction-probe';

jest.setTimeout(240_000);

const servers: http.Server[] = [];
afterAll(async () => { for (const s of servers) await new Promise<void>(r => s.close(() => r())); });

async function serve(html: string): Promise<string> {
    const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return `http://127.0.0.1:${(server.address() as any).port}/`;
}

/** Shipments over two years, as P376's data.js made them. */
const DATA = `const rows = []; for (let i = 0; i < 120; i++) { const d = new Date(Date.UTC(2024, 0, 1 + i * 6)); rows.push({ date: d.toISOString().slice(0, 10), value: 100 + (i * 37) % 400, weight: 5 + (i * 13) % 40, cat: ['أثاث', 'أجهزة', 'ملابس'][i % 3] }); }
const fmt = new Intl.NumberFormat('ar-EG');
function render(from, to) {
  const shown = rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
  document.getElementById('kCount').textContent = fmt.format(shown.length);
  document.getElementById('kValue').textContent = fmt.format(shown.reduce((a, r) => a + r.value, 0));
  document.getElementById('kWeight').textContent = fmt.format(shown.reduce((a, r) => a + r.weight, 0));
  const svg = document.getElementById('chart'); svg.replaceChildren();
  ['أثاث', 'أجهزة', 'ملابس'].forEach((c, k) => { const v = shown.filter(r => r.cat === c).reduce((a, r) => a + r.value, 0);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.setAttribute('x', 10 + k * 60); rect.setAttribute('y', 0); rect.setAttribute('width', 40); rect.setAttribute('height', Math.max(1, v / 100)); svg.appendChild(rect); });
}`;
const CARDS = `<section class="totals">
  <div class="card kpi"><span>عدد الشحنات</span><strong id="kCount">–</strong></div>
  <div class="card kpi"><span>إجمالي القيمة</span><strong id="kValue">–</strong></div>
  <div class="card kpi"><span>إجمالي الوزن</span><strong id="kWeight">–</strong></div>
</section>
<svg id="chart" width="200" height="200"></svg>`;

const page = (controls: string, script: string) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير الشحنات</title></head><body>
<h1>تقرير الشحنات</h1>${controls}${CARDS}<script>${DATA}\n${script}</script></body></html>`;

describe('a period filter that works is measured as one', () => {
    it('period buttons that recompute the cards and redraw the chart are a filter (P376)', async () => {
        const url = await serve(page(
            `<div class="presets"><button type="button" data-p="all">كل الفترة</button><button type="button" data-p="2024">2024</button><button type="button" data-p="2025">2025</button></div>`,
            `document.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { const p = b.dataset.p; p === 'all' ? render(null, null) : render(p + '-01-01', p + '-12-31'); })); render(null, null);`,
        ));
        const m = await measureInteractions(url, ['filtering'], { timeoutMs: 120_000 });
        expect(m.measured).toBe(true);
        expect(m.results[0].ok).toBe(true);
        expect(m.results[0].detail).toMatch(/pressing «2024» \(button\): the numbers in the 3 items shown changed and a chart was redrawn/);
    });

    it('dates set to the data\'s own range, which refuse a start after the end, are a filter (P376)', async () => {
        const url = await serve(page(
            `<form id="f"><label>من تاريخ <input type="date" id="from"></label><label>إلى تاريخ <input type="date" id="to"></label></form><p id="err" role="alert" hidden></p>`,
            `const from = document.getElementById('from'), to = document.getElementById('to'), err = document.getElementById('err');
             function load() { err.hidden = true; if (from.value && to.value && from.value > to.value) { err.textContent = 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية'; err.hidden = false; return; } render(from.value || null, to.value || null); }
             ['input', 'change'].forEach(ev => { from.addEventListener(ev, load); to.addEventListener(ev, load); });
             from.value = rows[0].date; to.value = rows[rows.length - 1].date; load();`,
        ));
        const m = await measureInteractions(url, ['filtering'], { timeoutMs: 120_000 });
        expect(m.measured).toBe(true);
        expect(m.results[0].ok).toBe(true);
        expect(m.results[0].detail).toMatch(/setting «من تاريخ» \(date\) to 2024-01-31/);
    });
});

describe('what is no filter stays refused', () => {
    it('page buttons over cards of the same words are pagination, not a filter', async () => {
        const url = await serve(`<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Orders</h1>
<ul id="list"></ul><div class="pager"><button type="button" data-page="0">1</button><button type="button" data-page="1">2</button><button type="button" id="next">Next</button></div>
<script>const orders = Array.from({ length: 10 }, (_, i) => ({ n: 1001 + i, total: 20 + i * 7 })); let page = 0;
function show() { document.getElementById('list').innerHTML = orders.slice(page * 5, page * 5 + 5).map(o => '<li>Order ' + o.n + ' — $' + o.total + '</li>').join(''); }
document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => { page = Number(b.dataset.page); show(); }));
document.getElementById('next').addEventListener('click', () => { page = (page + 1) % 2; show(); }); show();</script></body></html>`);
        const m = await measureInteractions(url, ['filtering'], { timeoutMs: 60_000 });
        expect(m.measured).toBe(true);
        expect(m.results[0].ok).toBe(false);
    });

    it('date fields that change nothing are still no filter, and the refusal says what was tried', async () => {
        const url = await serve(page(
            `<form><label>من تاريخ <input type="date" id="from" value="2024-01-01"></label><label>إلى تاريخ <input type="date" id="to" value="2025-12-31"></label></form>`,
            `render(null, null);`,
        ));
        const m = await measureInteractions(url, ['filtering'], { timeoutMs: 120_000 });
        expect(m.measured).toBe(true);
        expect(m.results[0].ok).toBe(false);
        expect(m.results[0].detail).toMatch(/«من تاريخ» \(date\), «إلى تاريخ» \(date\) — and the data shown never changed/);
    });
});
