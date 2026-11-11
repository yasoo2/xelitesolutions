/**
 * ⛔ A PRODUCT CATALOGUE IS WHAT THE PAGE SHOWS, NOT WHAT ITS DATA IS CALLED.
 *
 * The 500-prompt exam, 2026-11-04, P207: «ابني متجر إلكتروني لـمكتب عقارات:
 * عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، سلة…». The store
 * showed its properties as cards — a photo, a name, a price — from
 * `filtered.map(...)`, and was refused seven times with «artifact coverage 75%
 * — missing: product catalogue»: the catalogue's evidence wanted the word
 * «product» beside a .map, a ProductCard, or /api/products. The builder renamed
 * its data file to products.js, searched its own project for «catalogue», and
 * stopped, unable to find what Joe wanted.
 *
 * When the source does not show the catalogue, Joe reads the live page: a
 * group of two or more same-kind items that carry a photo or a price is the
 * catalogue, on the page as it opens or behind one of its doors. A list of
 * plain lines, a menu of links, a single card — still no catalogue.
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
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-catalogue-on-page-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

const TYPES: Record<string, string> = { '.js': 'text/javascript', '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8' };

async function serve(dir: string): Promise<string> {
    const server = http.createServer((req, res) => {
        const p = decodeURIComponent(String(req.url || '/').split('?')[0]);
        const file = path.join(dir, p.endsWith('/') ? `${p}index.html` : p);
        if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'text/html; charset=utf-8' });
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

const P207 = 'ابني متجر إلكتروني لـمكتب عقارات: عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، سلة تضيف وتحذف وتحدّث المجموع، ونموذج إتمام طلب مع التحقق من البيانات.';
const SHOWS = 'ابني متجر إلكتروني لـمكتب عقارات يعرض العقارات بالصور والأسعار.';

const PHOTO = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#8ab"/></svg>';

/** The P207 shape: listings named «listings», cards drawn from `filtered.map`, prices from Intl in dirhams. */
const STORE = (opts: { cards?: boolean; photos?: boolean; prices?: boolean; count?: number } = {}) => ({
    'images/home.svg': PHOTO,
    'index.html': `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مكتب العقارات</title>
<style>.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card img{width:100%;height:160px;object-fit:cover}</style></head><body>
<nav><a href="#">الرئيسية</a><a href="#">من نحن</a><a href="#">تواصل</a><a href="#">الأسئلة</a><a href="#">المدونة</a><a href="#">الوظائف</a><a href="#">الشروط</a><a href="#">الخصوصية</a></nav>
<h1>عقارات للبيع</h1>
<input id="q" type="search" placeholder="ابحث">
<select id="cat"><option value="">الكل</option><option>شقق</option><option>فلل</option></select>
<section class="grid" id="grid"></section>
<aside><h2>السلة</h2><ul id="cart"></ul><p>المجموع: <b id="total">0</b></p></aside>
<form id="checkout" onsubmit="return send(event)"><label>البريد <input type="email" required></label><p role="alert" id="err"></p><button>إتمام الطلب</button></form>
<script>
  var listings = [];
  var kinds = ['شقق', 'فلل', 'أراضي'];
  for (var i = 1; i <= ${opts.count ?? 6}; i++) listings.push({ id: i, name: 'عقار رقم ' + i, kind: kinds[i % 3], price: 150000 + i * 25000 });
  var money = new Intl.NumberFormat('ar-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 });
  var cart = [];
  function addToCart(id) { cart.push(id); draw(); }
  function send(e) { e.preventDefault(); document.getElementById('err').textContent = 'أدخل بريداً صحيحاً'; return false; }
  function draw() {
    var q = document.getElementById('q').value, c = document.getElementById('cat').value;
    var filtered = listings.filter(function (l) { return (!q || l.name.indexOf(q) >= 0) && (!c || l.kind === c); });
    document.getElementById('grid').innerHTML = filtered.map(function (l) {
      return ${opts.cards === false ? `'<p>' + l.name + '</p>'` : `'<article class="card">'
        + ${opts.photos === false ? `''` : `'<img src="/images/home.svg" alt="' + l.name + '">'`}
        + '<h3>' + l.name + '</h3><span class="tag">' + l.kind + '</span>'
        + ${opts.prices === false ? `''` : `'<span class="cost">' + money.format(l.price) + '</span>'`}
        + '<button onclick="addToCart(' + l.id + ')">أضف إلى السلة</button></article>'`};
    }).join('');
    document.getElementById('total').textContent = cart.length;
  }
  document.getElementById('q').addEventListener('input', draw);
  document.getElementById('cat').addEventListener('change', draw);
  draw();
</script></body></html>`,
});

describe('a catalogue is read on the live page', () => {
    it('P207: property cards with photos and prices are the catalogue, whatever their data is called', async () => {
        //  The source alone does not show it — the reason the page is read.
        expect(scopeReport(SHOWS, [tree(STORE())]).missing.map(c => c.id)).toEqual(['catalog']);
        const { scope, state, lines } = await scopeOf(SHOWS, STORE());
        expect(scope).toMatchObject({ instrument: 'scope', ok: true });
        expect(state.scopeAudit).toMatchObject({ requested: 1, built: 1, missing: [] });
        expect(lines.join('\n')).toMatch(/interaction product catalogue shown: on the live page, the page shows 6 items, 6 with a photo and 6 with a price — e\.g\. «عقار رقم 1/u);
    });

    it('the whole P207 store is delivered', async () => {
        const { scope, state } = await scopeOf(P207, STORE());
        expect(scope).toMatchObject({ instrument: 'scope', ok: true });
        expect(state.scopeAudit?.missing).toEqual([]);
    });

    it('photos alone, or prices alone, are enough', async () => {
        for (const opts of [{ prices: false }, { photos: false }]) {
            const { scope } = await scopeOf(SHOWS, STORE(opts));
            expect({ opts, ok: scope?.ok }).toEqual({ opts, ok: true });
        }
    });

    it('a catalogue behind the page\'s door is found by opening it', async () => {
        const files = STORE();
        files['index.html'] = files['index.html']
            .replace('<section class="grid" id="grid"></section>', '<button id="open" onclick="document.getElementById(\'grid\').style.display=\'\'">تصفّح العقارات</button><section class="grid" id="grid" style="display:none"></section>');
        const { scope, lines } = await scopeOf(SHOWS, files);
        expect(scope).toMatchObject({ ok: true });
        expect(lines.join('\n')).toMatch(/interaction product catalogue shown: on the live page, after pressing «تصفّح العقارات»/u);
    });
});

describe('what is not a catalogue stays refused, and says what was read', () => {
    it('a list of plain lines beside a menu of links', async () => {
        const { scope } = await scopeOf(SHOWS, STORE({ cards: false }));
        expect(scope?.ok).toBe(false);
        expect(String(scope?.error)).toMatch(/missing: product catalogue — product catalogue: on the live page \(the page as it opens.*\) no group of two or more items shows a photo or a price/u);
    });

    it('a single card', async () => {
        const { scope } = await scopeOf(SHOWS, STORE({ count: 1 }));
        expect(scope?.ok).toBe(false);
    });

    it('cards with neither a photo nor a price', async () => {
        const { scope } = await scopeOf(SHOWS, STORE({ photos: false, prices: false }));
        expect(scope?.ok).toBe(false);
    });
});
