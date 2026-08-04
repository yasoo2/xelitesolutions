/**
 * WIRE PROOF — THE FULL-STACK CHAIN, nothing faked:
 *
 *   [API]  The REAL ApiProjectTool builds a products backend; the REAL
 *          server boots on port 4100; a UNIQUE product is written into the
 *          REAL database over REAL HTTP.
 *   [WEB]  The REAL ReactProjectTool builds a store IN THE SAME SESSION —
 *          it is born linked (content.api) — real npm install + vite build,
 *          photos through the stub archive.
 *   [LIVE] A REAL browser opens the built store and SEES the row that only
 *          exists in the database — plus the live dot — while name-matched
 *          baked photos stay painted.
 *   [HONEST] The API is killed; a reload falls back to the baked rows with
 *          no live dot and no crash — exactly what a published copy does.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_fullstack_link.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// Only the photo archive is interposed — candidates served by a REAL local
// HTTP server carrying REAL PNG bytes (the same seam as every photo proof).
const state = { baseUrl: '' };
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
    const out = origLoad.call(this, request, parent, isMain);
    if (/photo-sources$/.test(String(request))) {
        return {
            ...out,
            searchAllSources: async (query: string) => ({
                candidates: [0, 1, 2, 3].map(i => ({
                    url: `${state.baseUrl}/photo/${encodeURIComponent(query)}-${i}.png`,
                    title: query, tags: [], creator: `Photographer ${i}`, license: 'CC BY 2.0',
                    landing: `${state.baseUrl}/landing/${encodeURIComponent(query)}-${i}`, provider: 'stub-archive',
                })),
                outcomes: [{ provider: 'stub-archive', ok: true, count: 4 }],
            }),
        };
    }
    return out;
};

async function main() {
    const { iconPng } = require('../../core/design/pwa');
    const png: Buffer = iconPng(640, '#2b8a5c');
    const archive = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); });
    archive.listen(0, '127.0.0.1');
    await new Promise<void>(r => archive.once('listening', () => r()));
    state.baseUrl = `http://127.0.0.1:${(archive.address() as any).port}`;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-fullstack-'));
    process.env.ARTIFACT_DIR = path.join(root, 'artifacts');
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.ARTIFACT_DIR, { recursive: true });
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] الواجهة الخلفية أولاً: API منتجات حقيقي على المنفذ 4100');
    const { ApiProjectTool } = require('../../modules/tools/definitions/ApiProjectTool');
    const apiRes: any = await new ApiProjectTool().execute(
        { request: 'ابنِ لي API لمنتجات متجر العطور', root }, { sessionId: 'fs-link' });
    check('the API built and PROVED a live write/read', !!apiRes.ok && apiRes.output.proven === true && apiRes.output.resource === 'products', JSON.stringify({ proven: apiRes.output?.proven, resource: apiRes.output?.resource }));
    const apiProj = apiRes.output.path as string;

    // The REAL Joe app — the orders bridge will announce into it live.
    process.env.PERSISTENCE_MODE = 'JSON';
    const { createApp } = await import('../../api/app');
    const joeSrv = createApp().listen(0, '127.0.0.1');
    await new Promise<void>(r => joeSrv.once('listening', () => r()));
    const joePort = (joeSrv.address() as any).port;
    (global as any).mockMessages = [];

    const apiSrv: ChildProcess | null = await new Promise((resolve) => {
        const child = spawn(process.execPath, ['server.js'], {
            cwd: apiProj,
            env: {
                ...process.env, PORT: '4100', NODE_NO_WARNINGS: '1',
                JOE_INBOX_URL: `http://127.0.0.1:${joePort}/api/public/forms/${path.basename(apiProj)}`,
            },
        });
        const t = setTimeout(() => resolve(null), 15_000);
        child.stdout?.on('data', (b: Buffer) => { if (/listening on/.test(String(b))) { clearTimeout(t); resolve(child); } });
        child.on('exit', () => { clearTimeout(t); resolve(null); });
    });
    check('the REAL server is up on 4100', !!apiSrv);
    /**
     * THE CATALOGUE IS LOCKED — and this proof had not noticed.
     *
     * It wrote the row anonymously, which was right before owner accounts
     * landed and has answered 401 ever since. Four checks went red and stayed
     * red, and a proof that lives red proves nothing. The write now goes
     * through the SAME door the owner uses: the password the tool printed in
     * chat, exchanged for a token at /api/auth/login. That also proves the
     * credential in that message is real and usable.
     */
    const creds = String(apiRes.output?.message || '').match(/كلمة المرور:\s*(\S+)/);
    const ownerEmail = String(apiRes.output?.ownerEmail || '');
    const login: any = await fetch('http://127.0.0.1:4100/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ownerEmail, password: creds?.[1] || '' }),
    }).then(r => r.json()).catch(() => null);
    const token = String(login?.token || '');
    check('the password Joe printed in chat really opens the API', token.split('.').length === 3, JSON.stringify(login).slice(0, 120));

    const anon = await fetch('http://127.0.0.1:4100/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'anonymous-must-be-refused' }),
    });
    check('…and an anonymous write is still refused', anon.status === 401, String(anon.status));

    const unique = await fetch('http://127.0.0.1:4100/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'عطر البرهان الحي', details: 'هذا الصف لا يوجد إلا في قاعدة البيانات', price: '77 ر.س' }),
    }).then(r => r.json());
    check('a UNIQUE row exists ONLY in the database', unique?.ok === true && unique.item.id > 0, JSON.stringify(unique).slice(0, 120));

    console.log('\n[2] الواجهة الأمامية تولد موصولة: متجر React في نفس الجلسة');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const webRes: any = await new ReactProjectTool().execute(
        { request: 'ابنِ متجر react لعطور فاخرة واربطه بالـ API', root }, { sessionId: 'fs-link' });
    check('the store built for real', !!webRes.ok && webRes.output.built === true);
    const proj = webRes.output.path as string;
    const content = fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');
    check('content.js carries the link to the session\'s API', content.includes("api: 'http://localhost:4100/api/products'"), (content.match(/api: '[^']*'/) || [''])[0]);
    check('the tool announced the link in its terminal log', (webRes.logs || []).some((l: string) => /full-stack link/.test(l)));

    console.log('\n[3] متصفح حقيقي يرى الصف الذي لا يوجد إلا في القاعدة — والنقطة الحية');
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
    const seen = await p.evaluate(() => ({
        liveRow: [...document.querySelectorAll('.product-card')].some(c => /عطر البرهان الحي/.test(c.textContent || '') && /77 ر\.س/.test(c.textContent || '')),
        liveDot: !!document.querySelector('.live-dot'),
        cards: document.querySelectorAll('.product-card').length,
        paintedByName: (() => {
            const c = [...document.querySelectorAll('.product-card')].find(x => /طقم الهدية/.test(x.textContent || ''));
            return !!c && ((c.querySelector('.product-photo') as HTMLImageElement | null)?.naturalWidth || 0) > 0;
        })(),
    }));
    check('the browser SEES the database-only row with its price', seen.liveRow, JSON.stringify(seen));
    check('…and the LIVE dot', seen.liveDot);
    // 3 seeds + the tool's own live-proof row + the unique row = 5.
    check('…and the API rows replaced the baked ones (5 cards from the database)', seen.cards === 5, String(seen.cards));
    check('…while the name-matched baked photo stays painted', seen.paintedByName);

    console.log('\n[3ب] زائر حقيقي يضغط «اطلب الآن» ويملأ النموذج — والطلب صف حقيقي في القاعدة');
    const card = p.locator('.product-card', { hasText: 'طقم الهدية' });
    await card.locator('button.btn').click();
    await card.locator('input[aria-label="الاسم"]').fill('خالد التجريبي');
    await card.locator('input[aria-label="الجوال"]').fill('0500000000');
    await card.locator('input[aria-label="الكمية"]').fill('2');
    await card.locator('button[type="submit"]').click();
    await p.waitForSelector('.order-note');
    const note = await p.evaluate(() => document.querySelector('.order-note')?.textContent || '');
    check('the page announced the order WITH its database id', /استلمنا طلبك رقم #\d+/.test(note) && note.includes('طقم الهدية'), note.slice(0, 90));
    // Anyone may ORDER; only the owner may READ the orders — they carry
    // customers' names and phone numbers. Both halves are checked here.
    const ordersAnon = await fetch('http://127.0.0.1:4100/api/orders');
    check('a stranger cannot read the customer list', ordersAnon.status === 401, String(ordersAnon.status));
    const orders = await fetch('http://127.0.0.1:4100/api/orders', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    check('the order is READABLE from the database over HTTP (item, customer, qty)',
        orders?.ok === true && orders.orders.some((o: any) => o.item === 'طقم الهدية' && o.customer === 'خالد التجريبي' && o.qty === 2),
        JSON.stringify(orders?.orders?.[0] || {}).slice(0, 140));

    console.log('\n[3ج] الجسر الحي: الطلب وصل محادثة المالك 📬 و«اعرض الطلبات» تقرأه من القرص');
    await new Promise(r => setTimeout(r, 700));
    const inboxRaw = fs.readFileSync(path.join(process.env.JOE_CHAT_STORE_DIR!, 'form-inbox.json'), 'utf-8');
    check('the order landed in Joe\'s inbox store (fire-and-forget bridge)', inboxRaw.includes('طقم الهدية') && inboxRaw.includes('خالد التجريبي'), inboxRaw.slice(0, 120));
    const notif = ((global as any).mockMessages || []).find((m: any) => m.sessionId === 'fs-link' && /📬/.test(m.content));
    check('…and the owner got the LIVE 📬 chat notification (linkedApiDir resolution)', !!notif && /طقم الهدية/.test(notif.content), JSON.stringify(((global as any).mockMessages || []).slice(-1)).slice(0, 140));
    const { OrdersReadTool } = require('../../modules/tools/definitions/OrdersReadTool');
    const readBack: any = await new OrdersReadTool().execute({ request: 'اعرض الطلبات' }, { sessionId: 'fs-link' });
    check('«اعرض الطلبات» lists it straight from the DATABASE FILE (server not needed)',
        readBack.output.total >= 1 && String(readBack.output.message).includes('طقم الهدية ×2 — خالد التجريبي'),
        String(readBack.output?.message).slice(0, 140));

    console.log('\n[4] الصدق: يُقتل الخادم — والصفحة تسقط للبيانات المخبوزة بلا انهيار');
    try { apiSrv?.kill(); } catch { /* gone */ }
    await new Promise(r => setTimeout(r, 400));
    const p2 = await browser.newPage();
    const errors: string[] = [];
    p2.on('pageerror', (e: any) => errors.push(String(e)));
    await p2.goto(`http://127.0.0.1:${(site.address() as any).port}/`, { waitUntil: 'networkidle' });
    const seen2 = await p2.evaluate(() => ({
        liveRow: /عطر البرهان الحي/.test(document.body.textContent || ''),
        liveDot: !!document.querySelector('.live-dot'),
        cards: document.querySelectorAll('.product-card').length,
        painted: [...document.querySelectorAll('.product-photo')].filter((i: any) => i.naturalWidth > 0).length,
    }));
    check('no live row, no live dot — the baked shelf stands (4 baked cards, photos painted)',
        !seen2.liveRow && !seen2.liveDot && seen2.cards === 4 && seen2.painted === 4, JSON.stringify(seen2));
    check('…and ZERO page errors during the fallback', errors.length === 0, errors.join(' | ').slice(0, 120));
    // Ordering with the API dead: the visitor's intent is KEPT, honestly.
    const deadCard = p2.locator('.product-card', { hasText: 'الإصدار الفاخر' });
    await deadCard.locator('button.btn').click();
    await deadCard.locator('input[aria-label="الاسم"]').fill('زائر');
    await deadCard.locator('button[type="submit"]').click();
    await p2.waitForSelector('.order-note');
    const deadNote = await p2.evaluate(() => document.querySelector('.order-note')?.textContent || '');
    check('a dead-server order answers honestly and points at the contact form',
        deadNote.includes('تعذر الوصول') && deadNote.includes('الإصدار الفاخر'), deadNote.slice(0, 90));

    await browser.close();
    site.close(); archive.close(); joeSrv.close();
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
