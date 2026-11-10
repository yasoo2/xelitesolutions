/**
 * ⛔ EVERY CONTROL IS ASKED WHETHER IT DID ITS OWN JOB (qa-control-intent.ts, probeControls).
 *
 * The owner, 2026-11-10: «بنى مثلا 100 زر، لازم بيعرف كل 100 زر هذول شو شغلهن،
 * ويجي لما يجربهن يعطي الشغل بالضبط». A press used to «work» when anything on
 * the page changed. Pinned: a control's job is read from its words in either
 * language; each job is judged on the page read before and after the press;
 * nothing measurable is no verdict; and on a real browser a shop whose «Add to
 * cart» shows a toast and leaves the cart at 0, and whose «Close» leaves its
 * dialog open, is found — while the same shop done right is not.
 */
import http from 'http';
import { chromium } from 'playwright';
import { intentOf, judgeIntent, type PageFacts } from '../core/quality/qa-control-intent';
import { judgeBehaviour, probeControls } from '../core/quality/behaviour-audit';
import { getChromiumLaunchOptions } from '../modules/browser/manager';

jest.setTimeout(150_000);

const facts = (o: Partial<PageFacts>): PageFacts => ({ url: 'http://x/', dialogs: 0, carts: [], listSize: 0, listHead: [], steppers: [], ...o });

test('a control\'s job, from its words in Arabic or English', () => {
    expect(intentOf('Add to cart').intent).toBe('add_to_cart');
    expect(intentOf('أضف إلى السلة').intent).toBe('add_to_cart');
    expect(intentOf('إغلاق').intent).toBe('close');
    expect(intentOf('×').intent).toBe('close');
    expect(intentOf('+').intent).toBe('increment');
    expect(intentOf('−').intent).toBe('decrement');
    expect(intentOf('ترتيب حسب السعر').intent).toBe('sort');
    expect(intentOf('التالي').intent).toBe('next_page');
    expect(intentOf('إعجاب').intent).toBe('toggle');
    expect(intentOf('عرض').intent).toBe('open');
    expect(intentOf('Save').intent).toBe('none');
    expect(intentOf('Add to cart', 'anchor').intent).toBe('none');
});

test('each job is judged on the page before and after, and nothing to measure is no verdict', () => {
    const cart = intentOf('Add to cart');
    expect(judgeIntent(cart, facts({ carts: [0] }), facts({ carts: [1] }))).toBe(true);
    expect(judgeIntent(cart, facts({ carts: [0] }), facts({ carts: [0] }))).toBe(false);
    expect(judgeIntent(cart, facts({}), facts({}))).toBeNull();
    //  L161: the badge rose 0 → 1 while a new line pushed ten other short numbers about (their sum fell 60 → 45).
    expect(judgeIntent(cart, facts({ carts: [0, 0, 4, 7, 6, 8, 5, 3, 12, 15], cartBadges: [0, 0] }), facts({ carts: [1, 1, 6, 4, 4, 7, 6, 8, 5, 3], cartBadges: [1, 1] }))).toBe(true);
    expect(judgeIntent(cart, facts({ carts: [3, 9], cartBadges: [3] }), facts({ carts: [3, 12], cartBadges: [3] }))).toBe(false);
    const close = intentOf('Close');
    expect(judgeIntent(close, facts({ dialogs: 1 }), facts({ dialogs: 0 }))).toBe(true);
    expect(judgeIntent(close, facts({ dialogs: 1 }), facts({ dialogs: 1 }))).toBe(false);
    expect(judgeIntent(close, facts({ dialogs: 0 }), facts({ dialogs: 0 }))).toBeNull();
    const plus = intentOf('+');
    expect(judgeIntent(plus, facts({ steppers: [2, 5] }), facts({ steppers: [3, 5] }))).toBe(true);
    expect(judgeIntent(plus, facts({ steppers: [2] }), facts({ steppers: [2] }))).toBe(false);
    //  At its floor a «−» rightly does nothing.
    expect(judgeIntent(intentOf('−'), facts({ steppers: [1] }), facts({ steppers: [1] }))).toBeNull();
    const sort = intentOf('Sort');
    expect(judgeIntent(sort, facts({ listHead: ['b', 'a'] }), facts({ listHead: ['a', 'b'] }))).toBe(true);
    expect(judgeIntent(sort, facts({ listHead: ['a', 'b'] }), facts({ listHead: ['a', 'b'] }))).toBe(false);
    const like = intentOf('Like');
    const off = { pressed: 'false', checked: '', expanded: '', active: false, text: 'Like' };
    expect(judgeIntent(like, facts({}), facts({}), { before: off, after: { ...off, pressed: 'true' } })).toBe(true);
    expect(judgeIntent(like, facts({}), facts({}), { before: off, after: off })).toBe(false);
});

function shop(careful: boolean): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;min-width:100px;margin:4px} .modal{position:fixed;inset:20% 20%;background:#fff;border:1px solid #333;padding:16px}</style></head><body>
<header><h1>Shop</h1><span class="cart-count" aria-label="cart">0</span></header>
<main><div class="product"><h2>Mug</h2><button id="add">Add to cart</button><button id="info">Details</button></div>
<p id="toast" role="status"></p></main>
<div class="modal" role="dialog" id="dlg" hidden><p>A white mug.</p><button id="close">Close</button></div>
<script>
  var CAREFUL = ${careful};
  document.getElementById('add').onclick = function () {
    document.getElementById('toast').textContent = 'Added!';
    if (CAREFUL) { var c = document.querySelector('.cart-count'); c.textContent = String(Number(c.textContent) + 1); }
  };
  document.getElementById('info').onclick = function () { document.getElementById('dlg').hidden = false; };
  document.getElementById('close').onclick = function () {
    if (CAREFUL) document.getElementById('dlg').hidden = true;
    else document.getElementById('dlg').style.borderColor = 'red';
  };
</script></body></html>`;
}

async function walk(careful: boolean) {
    return walkPage(shop(careful));
}

async function walkPage(page: string) {
    const server = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(page); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const browser = await chromium.launch(getChromiumLaunchOptions());
    try {
        const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await tab.goto(`http://127.0.0.1:${(server.address() as any).port}/`, { waitUntil: 'load' });
        const probe = await probeControls(tab, { fillForms: false, budgetMs: 40_000 });
        return { probe, verdict: judgeBehaviour(probe.controls, { ...probe.metrics }) };
    } finally {
        await browser.close();
        await new Promise<void>(r => server.close(() => r()));
    }
}

test('the careless shop: a cart that never counts and a Close that never closes are found', async () => {
    const { probe, verdict } = await walk(false);
    const missed = (probe.metrics.intentFailures || []).map((x: any) => `${x.label}:${x.intent}`);
    expect(missed).toEqual(expect.arrayContaining(['Add to cart:add_to_cart', 'Close:close']));
    expect(verdict.findings.map(f => f.code)).toContain('control_missed_its_job');
});

test('the careful shop: every job done, nothing said', async () => {
    const { probe, verdict } = await walk(true);
    expect(probe.metrics.intentFailures || []).toEqual([]);
    expect(probe.metrics.intentsMet).toBeGreaterThanOrEqual(2);
    expect(verdict.findings.map(f => f.code)).not.toContain('control_missed_its_job');
});

/*
 * L161 (2026-11-10, a water store): the count was «Cart (<span>1</span>)» in a
 * link to #cart, named only by data-testid; every product was already in the
 * cart, whose long section began with the «6» of «Spring Water 6-Pack». Four
 * working «Add to cart» were refused three times, on numbers no shopper reads.
 */
function waterStore(counts: boolean): string {
    const products = ['Spring Water 6-Pack (0.5L)', 'Mineral Water 1.5L', 'Lemon Sparkling 1L'];
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AquaFlow</title>
<style>body{font-family:sans-serif;margin:16px} button{min-height:44px;min-width:110px;margin:4px} nav a{display:inline-block;padding:12px}</style></head><body>
<header><h1>AquaFlow</h1><nav><a href="#shop">Shop</a> <a href="#cart" data-testid="cart-link">Cart (<span data-testid="cart-count">3</span>)</a></nav></header>
<main><section id="shop">${products.map((p, i) => `<article class="product-card"><span class="badge">Water</span><h3>${p}</h3><button type="button" data-i="${i}" class="add">Add to cart</button></article>`).join('')}
<p id="toast" role="status"></p></section>
<section id="cart" class="cart-section"><h2>Your cart</h2><ul class="cart-list">${products.map((p, i) => `<li class="cart-line">${p} — $4.99 each — qty <input type="number" id="q${i}" value="1" aria-label="Quantity of ${p}"></li>`).join('')}</ul></section></main>
<script>
  var COUNTS = ${counts};
  document.querySelectorAll('button.add').forEach(function (b) {
    b.onclick = function () {
      document.getElementById('toast').textContent = 'Added to cart: ' + b.parentElement.querySelector('h3').textContent;
      if (!COUNTS) return;
      var q = document.getElementById('q' + b.dataset.i); q.value = String(Number(q.value) + 1);
      var c = document.querySelector('[data-testid="cart-count"]'); c.textContent = String(Number(c.textContent) + 1);
    };
  });
</script></body></html>`;
}

test('a count in a link to the cart, named only by its test id, is the count that is read', async () => {
    const { probe, verdict } = await walkPage(waterStore(true));
    expect(probe.metrics.intentFailures || []).toEqual([]);
    expect(Number(probe.metrics.intentsMetBy?.add_to_cart || 0)).toBe(3);
    expect(verdict.findings.map(f => f.code)).not.toContain('control_missed_its_job');
});

test('…and a toast that says «Added to cart» over a count that never moved is not a count', async () => {
    const { probe, verdict } = await walkPage(waterStore(false));
    const missed = (probe.metrics.intentFailures || []).filter((x: any) => x.intent === 'add_to_cart');
    expect(missed.length).toBe(3);
    expect(verdict.findings.map(f => f.code)).toContain('control_missed_its_job');
});
