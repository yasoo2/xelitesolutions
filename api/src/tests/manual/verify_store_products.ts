/**
 * WIRE PROOF — the store's product cards, end to end:
 *
 *   Only the archive layer is interposed (multi-candidate, served by a REAL
 *   local HTTP server with REAL PNG bytes). The REAL scaffolder builds a
 *   store: product cards with DISTINCT photos (the variant machinery — one
 *   subject, different picture per card), prices, CTAs; a REAL npm install +
 *   vite build; a REAL browser renders the cards; then a surgical «remove
 *   the photo» on a NAMED product proves the edit loop covers products too.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_store_products.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const state = { baseUrl: '' };
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
    const out = origLoad.call(this, request, parent, isMain);
    if (/photo-sources$/.test(String(request))) {
        return {
            ...out,
            // FOUR candidates per query, like a real archive — the variant
            // machinery needs more than one hit to give each card its own photo.
            searchAllSources: async (query: string) => ({
                candidates: [0, 1, 2, 3].map(i => ({
                    url: `${state.baseUrl}/photo/${encodeURIComponent(query)}-${i}.png`,
                    title: query, tags: [],
                    creator: `Photographer ${i}`,
                    license: 'CC BY 2.0',
                    landing: `${state.baseUrl}/landing/${encodeURIComponent(query)}-${i}`,
                    provider: 'stub-archive',
                })),
                outcomes: [{ provider: 'stub-archive', ok: true, count: 4 }],
            }),
        };
    }
    return out;
};

async function main() {
    const { iconPng } = require('../../core/design/pwa');
    const png: Buffer = iconPng(640, '#7a4bb4');
    const archive = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(png);
    });
    archive.listen(0, '127.0.0.1');
    await new Promise<void>(r => archive.once('listening', () => r()));
    state.baseUrl = `http://127.0.0.1:${(archive.address() as any).port}`;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-store-wire-'));
    process.env.ARTIFACT_DIR = path.join(root, 'artifacts');
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.ARTIFACT_DIR, { recursive: true });
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] متجر كامل يُبنى فعلياً: بطاقات منتجات بصور متمايزة وأسعار');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const res: any = await new ReactProjectTool().execute(
        { request: 'build a react store for handmade perfumes', root }, { sessionId: 'store-wire' });
    check('the store built for real (npm install + vite build)', !!res.ok && res.output.built === true, JSON.stringify({ ok: res.ok, built: res.output?.built }));
    const proj = res.output.path as string;
    const logText = (res.logs || []).join('\n');
    check('the terminal reported 3/3 real product photos', logText.includes('3/3 real product photos'), logText.split('\n').filter((l: string) => /photo/.test(l)).join(' | '));
    const content = fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');
    const productSrcs = [...content.matchAll(/products: \[[\s\S]*?\n  \],/g)][0]?.[0].match(/src: '(images\/[^']+)'/g) || [];
    check('each product card carries its OWN photo (3 distinct files)', new Set(productSrcs).size === 3, productSrcs.join(','));
    check('no Pricing tiers shipped — this is a store, not a SaaS', !fs.existsSync(path.join(proj, 'src', 'components', 'Pricing.jsx')) && fs.existsSync(path.join(proj, 'src', 'components', 'Products.jsx')));

    console.log('\n[2] متصفح حقيقي يرى البطاقات مرسومة بأسعارها وأزرارها');
    const dist = path.join(proj, 'dist');
    const site = http.createServer((req, res2) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(dist, rel);
        if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res2.writeHead(404); return res2.end(); }
        res2.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream' });
        res2.end(fs.readFileSync(file));
    });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${(site.address() as any).port}/`, { waitUntil: 'networkidle' });
    const seen = await p.evaluate(() => {
        const photos = [...document.querySelectorAll('.product-photo')] as HTMLImageElement[];
        return {
            cards: document.querySelectorAll('.product-card').length,
            photosPainted: photos.length === 3 && photos.every(i => i.naturalWidth > 0),
            distinctPixels: new Set(photos.map(i => i.currentSrc)).size,
            prices: [...document.querySelectorAll('.product-price')].map(e => e.textContent || ''),
            ctas: document.querySelectorAll('.product-card .btn').length,
        };
    });
    check('THREE product cards rendered, every photo painted', seen.cards === 3 && seen.photosPainted, JSON.stringify(seen));
    check('…with three DIFFERENT pictures', seen.distinctPixels === 3, String(seen.distinctPixels));
    check('…prices visible on every card', seen.prices.length === 3 && seen.prices.every((t: string) => /\$\d+/.test(t)), seen.prices.join(','));
    check('…and a CTA on every card', seen.ctas === 3, String(seen.ctas));

    console.log('\n[3] «احذف صورة المنتج المسمّى» — حلقة التحرير تغطي المنتجات أيضاً');
    const { ProjectEditTool } = require('../../modules/tools/definitions/ProjectEditTool');
    const giftSrc = (content.match(/\{ name: 'Gift set',[^\n]*?img: \{ src: '(images\/[^']+)'/) || [])[1];
    const rm: any = await new ProjectEditTool().execute(
        { request: 'remove the photo from the Gift set product' }, { sessionId: 'store-wire' });
    check('the removal succeeded AND the real build verified it', !!rm.ok && rm.output.buildVerified === true, JSON.stringify({ ok: rm.ok, bv: rm.output?.buildVerified, msg: String(rm.output?.message).slice(0, 100) }));
    const content2 = fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');
    check('ONLY the Gift set lost its photo', /\{ name: 'Gift set',[^\n]*?img: null/.test(content2)
        && (content2.match(/products: \[[\s\S]*?\n  \],/)![0].match(/src: 'images\//g) || []).length === 2);
    // The invariant is not «always delete»: the gallery mosaic may still be
    // showing that very file. Never an orphan, never a dangling reference.
    const stillUsed = !!giftSrc && content2.includes(giftSrc);
    check(stillUsed
        ? 'its file STAYS — the gallery still shows it (no dangling reference)'
        : 'its orphaned file left public/images',
        !!giftSrc && fs.existsSync(path.join(proj, 'public', giftSrc)) === stillUsed, `stillUsed=${stillUsed}`);
    const p2 = await browser.newPage();
    await p2.goto(`http://127.0.0.1:${(site.address() as any).port}/`, { waitUntil: 'networkidle' });
    const seen2 = await p2.evaluate(() => ({
        painted: [...document.querySelectorAll('.product-photo')].filter((i: any) => i.naturalWidth > 0).length,
        gift: (() => { const c = [...document.querySelectorAll('.product-card')].find(x => /Gift set/.test(x.textContent || '')); return !!c && !c.querySelector('img'); })(),
    }));
    check('the browser sees TWO painted product photos and a clean Gift set card', seen2.painted === 2 && seen2.gift, JSON.stringify(seen2));

    console.log('\n[4] «غيّر سعر Premium edition إلى 99$» — تعديل نصي حتمي يظهر في المتصفح');
    const priceEdit: any = await new ProjectEditTool().execute(
        { request: 'change the price of the Premium edition to $99' }, { sessionId: 'store-wire' });
    check('the price edit succeeded AND the real build verified it', !!priceEdit.ok && priceEdit.output.buildVerified === true, JSON.stringify({ ok: priceEdit.ok, bv: priceEdit.output?.buildVerified, msg: String(priceEdit.output?.message).slice(0, 100) }));
    check('no model was asked — the edit was deterministic', (priceEdit.logs || []).some((l: string) => /no model call/.test(l)), (priceEdit.logs || []).join(' | ').slice(0, 150));
    const p3 = await browser.newPage();
    await p3.goto(`http://127.0.0.1:${(site.address() as any).port}/`, { waitUntil: 'networkidle' });
    const prices2 = await p3.evaluate(() => [...document.querySelectorAll('.product-price')].map(e => e.textContent || ''));
    check('the browser shows the NEW price on the named card only', prices2.includes('$99') && prices2.includes('$39') && !prices2.includes('$69'), prices2.join(','));

    console.log('\n[5] «أضف منتجاً جديداً» — صف كامل بصورة حقيقية يصل الرف ويُبنى ويظهر');
    const addRow: any = await new ProjectEditTool().execute(
        { request: 'add a product Night Rose for $120' }, { sessionId: 'store-wire' });
    check('the row add succeeded AND the real build verified it', !!addRow.ok && addRow.output.buildVerified === true, JSON.stringify({ ok: addRow.ok, bv: addRow.output?.buildVerified, msg: String(addRow.output?.message).slice(0, 120) }));
    const content3 = fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');
    const newRowM = content3.match(/\{ name: 'Night Rose', desc: '[^']+', price: '\$120', slug: 'night-rose', img: \{ src: '(images\/[^']+)'/);
    check('the new row carries name, inherited-format price AND a real fetched photo', !!newRowM, (content3.match(/\{ name: 'Night Rose'[^\n]*/) || ['(row missing)'])[0].slice(0, 140));
    check('…whose file landed in public/images', !!newRowM && fs.existsSync(path.join(proj, 'public', newRowM![1])));
    const p4 = await browser.newPage();
    await p4.goto(`http://127.0.0.1:${(site.address() as any).port}/`, { waitUntil: 'networkidle' });
    const seen4 = await p4.evaluate(() => ({
        cards: document.querySelectorAll('.product-card').length,
        night: (() => { const c = [...document.querySelectorAll('.product-card')].find(x => /Night Rose/.test(x.textContent || '')); return !!c && !!(c.querySelector('.product-photo') as HTMLImageElement | null)?.naturalWidth && /\$120/.test(c.textContent || ''); })(),
    }));
    check('the browser shows FOUR cards, the newcomer painted with its price', seen4.cards === 4 && seen4.night, JSON.stringify(seen4));

    console.log('\n[6] «احذف المنتج الجديد» — الصف يرحل بملفه والبناء يتحقق');
    const giftSrc2 = (content3.match(/\{ name: 'Night Rose',[^\n]*?img: \{ src: '(images\/[^']+)'/) || [])[1];
    const delRow: any = await new ProjectEditTool().execute(
        { request: 'delete the product Night Rose' }, { sessionId: 'store-wire' });
    check('the row delete succeeded AND the real build verified it', !!delRow.ok && delRow.output.buildVerified === true, JSON.stringify({ ok: delRow.ok, bv: delRow.output?.buildVerified }));
    const content4 = fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');
    check('the row and its orphaned file are gone; neighbours intact',
        !content4.includes('Night Rose') && content4.includes('Classic edition') && !!giftSrc2 && !fs.existsSync(path.join(proj, 'public', giftSrc2)));

    await browser.close();
    site.close(); archive.close();
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
