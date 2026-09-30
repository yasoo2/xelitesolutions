/**
 * Contract for the request-routed domain QA specialists.
 *
 * shop-qa, live-data-qa and image-semantic-qa follow the media-review-qa
 * pattern: a request classifier plus a delivery-time browser scenario that
 * proves the user-visible contract instead of trusting labels. This suite
 * pins the classifiers (English + Arabic + negatives), the finding shapes
 * against mock pages, the app-audit dispatch wiring, and the real observed
 * behavior against isolated Chromium fixtures that belong to no product
 * prompt. The live block fails closed with no browser
 * (requireChromiumOrThrow); JOE_ALLOW_NO_BROWSER=1 is the only skip.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { requireChromiumOrThrow } from './helpers/require-chromium';
import { isShopQaRequest, runShopQa } from '../core/quality/shop-qa';
import { isLiveDataQaRequest, runLiveDataQa } from '../core/quality/live-data-qa';
import { isImageSemanticQaRequest, runImageSemanticQa } from '../core/quality/image-semantic-qa';

describe('domain QA request classifiers', () => {
    test('shop matches store/checkout wording in English and Arabic', () => {
        expect(isShopQaRequest('Buy fruit from the corner store')).toBe(true);
        expect(isShopQaRequest('Build a checkout page with a cart total')).toBe(true);
        expect(isShopQaRequest('متجر صغير يبيع التمور مع سلة')).toBe(true);
        expect(isShopQaRequest('Show weather for Paris and Cairo using Celsius')).toBe(false);
        expect(isShopQaRequest('')).toBe(false);
    });

    test('live-data matches freshness/API wording in English and Arabic', () => {
        expect(isLiveDataQaRequest('Show live data from the feed')).toBe(true);
        expect(isLiveDataQaRequest('Fetch the current rows from the API')).toBe(true);
        expect(isLiveDataQaRequest('لوحة بيانات حية تعرض الأسعار')).toBe(true);
        expect(isLiveDataQaRequest('Build a photo gallery wall')).toBe(false);
        expect(isLiveDataQaRequest('')).toBe(false);
    });

    test('image-semantic matches imagery wording in English and Arabic', () => {
        expect(isImageSemanticQaRequest('Hang a photo gallery wall')).toBe(true);
        expect(isImageSemanticQaRequest('A landing page with a logo and illustrations')).toBe(true);
        expect(isImageSemanticQaRequest('معرض صور يعرض الشعار')).toBe(true);
        expect(isImageSemanticQaRequest('Open a test store and buy fruit')).toBe(false);
        expect(isImageSemanticQaRequest('')).toBe(false);
    });
});

describe('domain QA finding contracts on mock pages', () => {
    test('non-matching requests never touch the page', async () => {
        const page = { goto: jest.fn(), evaluate: jest.fn(), locator: jest.fn() };
        const shop = await runShopQa({ page, url: 'http://x/', request: 'weather', timeoutMs: 5000 });
        const live = await runLiveDataQa({ page, url: 'http://x/', request: 'weather', timeoutMs: 5000 });
        const image = await runImageSemanticQa({ page, url: 'http://x/', request: 'weather', timeoutMs: 5000 });
        expect(shop.findings).toEqual([]);
        expect(live.findings).toEqual([]);
        expect(image.findings).toEqual([]);
        expect(page.goto).not.toHaveBeenCalled();
    });

    test('shop without an add action names the missing control', async () => {
        const page = {
            goto: jest.fn(async () => {}),
            waitForTimeout: jest.fn(async () => {}),
            locator: jest.fn((selector: string) => {
                if (selector === '[data-add], button') {
                    return { filter: () => ({ first: () => ({ count: async () => 0 }) }) };
                }
                return { count: async () => 7 };
            }),
        };
        const result = await runShopQa({ page, url: 'http://x/shop', request: 'a corner store', timeoutMs: 5000 });
        expect(result.findings.map(f => f.id)).toEqual(['shop_add_to_cart_missing']);
        expect(result.findings[0].severity).toBe('high');
        expect(result.findings[0].detailEn).toMatch(/Add to cart/);
        expect(result.metrics.controlsDiscovered).toBe(7);
        expect(result.metrics.statesVisited).toBe(1);
    });

    test('live-data without requests or freshness state reports both gaps', async () => {
        const page = {
            goto: jest.fn(async () => {}),
            evaluate: jest.fn(async () => ({ requests: [], freshnessVisible: false, fallbackVisible: false })),
        };
        const result = await runLiveDataQa({ page, url: 'http://x/live', request: 'live data', timeoutMs: 5000 });
        expect(result.findings.map(f => f.id)).toEqual(['live_data_no_request', 'live_data_state_hidden']);
        expect(result.findings[0].severity).toBe('high');
        expect(result.metrics.statesVisited).toBe(1);
    });

    test('live-data with an observed request trail and freshness stays silent', async () => {
        const page = {
            goto: jest.fn(async () => {}),
            evaluate: jest.fn(async () => ({ requests: ['http://x/api/rows'], freshnessVisible: true, fallbackVisible: false })),
        };
        const result = await runLiveDataQa({ page, url: 'http://x/live', request: 'live data', timeoutMs: 5000 });
        expect(result.findings).toEqual([]);
    });

    test('image QA classifies empty, unloaded and unlabelled deliveries', async () => {
        const runWith = (images: any[]) => runImageSemanticQa({
            page: {
                goto: jest.fn(async () => {}),
                locator: jest.fn(() => ({ evaluateAll: jest.fn(async () => images) })),
            },
            url: 'http://x/gallery',
            request: 'photo gallery',
            timeoutMs: 5000,
        });
        const empty = await runWith([]);
        expect(empty.findings.map(f => f.id)).toEqual(['image_subjects_missing']);
        const unloaded = await runWith([{ src: 'http://x/a.png', alt: 'a', labelledBy: '', visible: true, loaded: false }]);
        expect(unloaded.findings.map(f => f.id)).toEqual(['image_subjects_not_loaded']);
        expect(unloaded.findings[0].evidence?.[0]).toEqual({ src: 'http://x/a.png' });
        const unlabelled = await runWith([{ src: 'http://x/b.png', alt: '', labelledBy: '', visible: true, loaded: true }]);
        expect(unlabelled.findings.map(f => f.id)).toEqual(['image_subjects_unlabelled']);
        const good = await runWith([{ src: 'http://x/c.png', alt: 'dates', labelledBy: '', visible: true, loaded: true }]);
        expect(good.findings).toEqual([]);
    });
});

describe('domain QA dispatch wiring', () => {
    test('app-audit routes matching requests through all three specialists', () => {
        const audit = fs.readFileSync(path.join(__dirname, '../core/quality/app-audit.ts'), 'utf8');
        expect(audit).toContain('runShopQa');
        expect(audit).toContain('runLiveDataQa');
        expect(audit).toContain('runImageSemanticQa');
        expect(audit).toContain('isShopQaRequest(weatherRequest)');
        expect(audit).toContain('isLiveDataQaRequest(weatherRequest)');
        expect(audit).toContain('isImageSemanticQaRequest(weatherRequest)');
        expect(audit).toContain('shopQa.metrics');
        expect(audit).toContain('liveDataQa.metrics');
        expect(audit).toContain('imageSemanticQa.metrics');
    });
});

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl6sAAAAASUVORK5CYII=';

const SHOP_PAGE = (layout: 'header' | 'addfirst' | 'textcart' | 'empty') => {
    const cartButton = layout === 'textcart'
        ? '<button type="button">View basket</button>'
        : '<button type="button" data-cart-open>Cart</button>';
    const addButton = layout === 'empty' ? '' : '<button type="button" data-add>Add to cart</button>';
    const first = layout === 'addfirst' ? addButton : cartButton;
    const second = layout === 'addfirst' ? cartButton : addButton;
    return `<!doctype html><html><head><meta charset="utf-8"><title>Corner Store</title>
<link rel="icon" href="data:,"></head><body>
<h1>Corner Store</h1>
${first}
<span data-cart-count>0</span>
${second}
<div id="joe-cart" role="dialog" hidden><p>Your cart</p><ul data-cart-items></ul><p>Total: <span id="total">0</span></p></div>
<script>
const count = document.querySelector('[data-cart-count]');
const items = document.querySelector('[data-cart-items]');
const total = document.getElementById('total');
const dialog = document.getElementById('joe-cart');
function render(n) {
    count.textContent = String(n);
    total.textContent = String(n * 5);
    items.innerHTML = n > 0 ? '<li class="joe-cart-line">Dates x' + n + '</li>' : '';
}
let n = Number(localStorage.getItem('corner-cart') || '0');
render(n);
const add = document.querySelector('[data-add]');
if (add) add.addEventListener('click', () => { n += 1; localStorage.setItem('corner-cart', String(n)); render(n); });
const opener = document.querySelector('[data-cart-open]') || Array.from(document.querySelectorAll('button')).find(b => /basket|cart/i.test(b.textContent || '') && !b.hasAttribute('data-add'));
if (opener) opener.addEventListener('click', () => { dialog.hidden = false; });
</script>
</body></html>`;
};

const GALLERY_PAGE = (images: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Gallery</title>
<link rel="icon" href="data:,"></head><body><h1>Gallery wall</h1>${images}</body></html>`;

const LIVE_PAGE = (live: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>Board</title>
<link rel="icon" href="data:,">
${live ? `<script>
var xhr = new XMLHttpRequest();
xhr.open('GET', '/api/rows', false);
xhr.send();
</script>` : ''}
</head><body><h1>Board</h1>${live ? '<p>Live data: 3 rows</p>' : '<p>Static snapshot</p>'}</body></html>`;

describe('domain QA specialists on a live engine', () => {
    jest.setTimeout(180_000);
    let browser: any = null;
    let context: any = null;
    let server: http.Server | null = null;
    let base = '';

    beforeAll(async () => {
        browser = await requireChromiumOrThrow('domain-qa-live');
        if (!browser) return;
        server = http.createServer((req, res) => {
            const send = (html: string) => {
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                res.end(html);
            };
            if (req.url === '/api/rows') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ rows: [1, 2, 3] }));
                return;
            }
            if (req.url === '/shop') return send(SHOP_PAGE('header'));
            if (req.url === '/shop-addfirst') return send(SHOP_PAGE('addfirst'));
            if (req.url === '/shop-textcart') return send(SHOP_PAGE('textcart'));
            if (req.url === '/shop-empty') return send(SHOP_PAGE('empty'));
            if (req.url === '/gallery') {
                return send(GALLERY_PAGE(
                    `<img src="data:image/png;base64,${PIXEL}" alt="fresh dates" width="100" height="100">` +
                    `<img src="data:image/png;base64,${PIXEL}" alt="packed boxes" width="100" height="100">`,
                ));
            }
            if (req.url === '/gallery-empty') return send(GALLERY_PAGE(''));
            if (req.url === '/live') return send(LIVE_PAGE(true));
            if (req.url === '/live-static') return send(LIVE_PAGE(false));
            res.writeHead(404);
            res.end('no fixture');
        });
        await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        base = `http://127.0.0.1:${port}`;
        context = await browser.newContext();
    });

    afterAll(async () => {
        await context?.close().catch(() => {});
        await browser?.close().catch(() => {});
        await new Promise<void>((resolve) => (server ? server!.close(() => resolve()) : resolve()));
    });

    async function runOn<T>(url: string, run: (page: any) => Promise<T>): Promise<T> {
        const page = await context.newPage();
        try {
            return await run(page);
        } finally {
            await page.close().catch(() => {});
        }
    }

    test('shop journey passes on three layouts and names a missing add action', async () => {
        if (!browser) return;
        for (const route of ['/shop', '/shop-addfirst', '/shop-textcart']) {
            const good = await runOn(`${base}${route}`, (page) => runShopQa({
                page, url: `${base}${route}`, request: 'Buy fruit from the corner store', timeoutMs: 10_000,
            }));
            expect(good.findings).toEqual([]);
            expect(good.metrics.pressed).toBe(2);
            expect(good.metrics.formsPersisted).toBe(1);
        }
        const bad = await runOn(`${base}/shop-empty`, (page) => runShopQa({
            page, url: `${base}/shop-empty`, request: 'Buy fruit from the corner store', timeoutMs: 10_000,
        }));
        expect(bad.findings.map(f => f.id)).toEqual(['shop_add_to_cart_missing']);
    });

    test('image QA accepts loaded labelled images and rejects an empty wall', async () => {
        if (!browser) return;
        const good = await runOn(`${base}/gallery`, (page) => runImageSemanticQa({
            page, url: `${base}/gallery`, request: 'Hang a photo gallery wall', timeoutMs: 10_000,
        }));
        expect(good.findings).toEqual([]);
        const bad = await runOn(`${base}/gallery-empty`, (page) => runImageSemanticQa({
            page, url: `${base}/gallery-empty`, request: 'Hang a photo gallery wall', timeoutMs: 10_000,
        }));
        expect(bad.findings.map(f => f.id)).toEqual(['image_subjects_missing']);
    });

    test('live-data QA accepts an observed request trail and rejects a static page', async () => {
        if (!browser) return;
        const good = await runOn(`${base}/live`, (page) => runLiveDataQa({
            page, url: `${base}/live`, request: 'Show live data from the feed', timeoutMs: 10_000,
        }));
        expect(good.findings).toEqual([]);
        const bad = await runOn(`${base}/live-static`, (page) => runLiveDataQa({
            page, url: `${base}/live-static`, request: 'Show live data from the feed', timeoutMs: 10_000,
        }));
        expect(bad.findings.map(f => f.id)).toEqual(['live_data_no_request', 'live_data_state_hidden']);
    });
});
