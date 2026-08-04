/**
 * WIRE PROOF — the edit that failed in the field, fixed and measured.
 *
 * The report: «طلبت تعديل وفشل التعديل بالشكل الصحيح». The log showed three
 * separate defects behind it, and this proof reproduces all three:
 *
 *   1. «تعديل على المنتجات قم بزياده عطر اسمه البوس مع صوره له» matched NO
 *      deterministic branch (the verb was «زيادة», the noun «عطر»), so it fell
 *      to the model — which wrote `img: { src: 'images/boss.jpg' }`, a file
 *      that never existed. The build was green; the page 404'd.
 *   2. The user then ATTACHED the real photograph and said «قم باضافه هذه
 *      الصوره الى منتج البوس» — and Joe DESCRIBED the picture back instead of
 *      putting it in the project.
 *   3. Nothing checked the result in a browser, so the dead image shipped.
 *
 * Everything past the archive seam is real: a real scaffold, a real npm
 * install + vite build, a real Chromium.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_field_edit_failure.ts
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
            searchAllSources: async (query: string) => ({
                candidates: [0, 1, 2, 3, 4, 5].map(i => ({
                    url: `${state.baseUrl}/photo/${encodeURIComponent(query)}-${i}.png`,
                    title: query, tags: [], creator: 'Archive Photographer',
                    license: 'CC BY 2.0', landing: `${state.baseUrl}/landing/${encodeURIComponent(query)}`,
                    provider: 'stub-archive',
                })),
                outcomes: [{ provider: 'stub-archive', ok: true, count: 6 }],
            }),
        };
    }
    return out;
};

async function main() {
    const { iconPng } = require('../../core/design/pwa');
    const HUES = ['#b45a2b', '#2b6cb4', '#2bb46c', '#b42b8f', '#8f6c2b', '#3a3a72'];
    const archive = http.createServer((req, res) => {
        const n = Number((String(req.url || '').match(/-(\d+)\.png$/) || [])[1] || 0);
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(iconPng(640, HUES[n % HUES.length]) as Buffer);
    });
    archive.listen(0, '127.0.0.1');
    await new Promise<void>(r => archive.once('listening', () => r()));
    state.baseUrl = `http://127.0.0.1:${(archive.address() as any).port}`;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-field-edit-'));
    process.env.ARTIFACT_DIR = path.join(root, 'artifacts');
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.ARTIFACT_DIR, { recursive: true });
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] متجر حقيقي — نفس بروميت الميدان');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const built: any = await new ReactProjectTool().execute(
        { request: 'ابنِ موقع react لمتجر عطور فاخر اسمه دار العود', root }, { sessionId: 'field-edit' });
    check('the store built and passed its own audit', built.output?.built === true && built.output.audit?.score === 100,
        JSON.stringify(built.output?.audit).slice(0, 140));
    const proj = built.output.path as string;
    const contentOf = () => fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');

    console.log('\n[2] الطلب الذي فشل حرفياً: «تعديل على المنتجات قم بزياده عطر اسمه البوس مع صوره له»');
    const { ProjectEditTool } = require('../../modules/tools/definitions/ProjectEditTool');
    const add: any = await new ProjectEditTool().execute(
        { request: 'تعديل على المنتجات قم بزياده عطر اسمه البوس مع صوره له' }, { sessionId: 'field-edit' });
    check('the edit succeeded and the real build verified it', !!add.ok && add.output.buildVerified === true,
        JSON.stringify({ ok: add.ok, bv: add.output?.buildVerified, msg: String(add.output?.message).slice(0, 140) }));
    const c1 = contentOf();
    const row = c1.match(/\{ name: 'البوس',[^\n]*\},/)?.[0] || '';
    check('the row landed in the PRODUCTS list by the deterministic path (name read from «اسمه»)',
        !!row && /products: \[[\s\S]*?name: 'البوس'/.test(c1), row.slice(0, 140));
    check('…carrying a slug, so it has a page of its own', /slug: '[^']+'/.test(row), row.slice(0, 140));
    const srcM = row.match(/img: \{ src: '(images\/[^']+)'/);
    check('…and a photo file that REALLY EXISTS (the boss.jpg ghost is dead)',
        !!srcM && fs.existsSync(path.join(proj, 'public', srcM[1])), srcM?.[1] || 'no img');
    check('the answer carries the browser audit, not just a green build',
        !!add.output.audit && add.output.audit.score === 100, JSON.stringify(add.output?.audit).slice(0, 140));

    console.log('\n[3] الحارس ضد الاختلاق: مسار صورة وهمي يُنزع ولا يُشحن أبداً');
    // The exact patch the model wrote in the field, applied by hand.
    const poisoned = contentOf().replace(/(\{ name: 'البوس',[^\n]*?img: )\{[^}]*\}/, "$1{ src: 'images/boss.jpg', alt: 'البوس' }");
    fs.writeFileSync(path.join(proj, 'src', 'content.js'), poisoned, 'utf-8');
    const fix: any = await new ProjectEditTool().execute(
        { request: 'غيّر سعر البوس إلى 340 ر.س' }, { sessionId: 'field-edit' });
    check('an edit that finds an invented path strips it back to null', !!fix.ok
        && !contentOf().includes('images/boss.jpg'), String(fix.output?.message).slice(0, 160));
    check('…and says so out loud', /مُختلَق|invented/.test(String(fix.output?.message)) || (fix.output?.invented || []).includes('images/boss.jpg'),
        JSON.stringify(fix.output?.invented));

    console.log('\n[4] الصورة المرفقة تُستخدم فعلاً — لا توصف فقط');
    const attachedPath = path.join(root, 'boss-real.png');
    fs.writeFileSync(attachedPath, iconPng(720, '#101820') as Buffer);
    const withFile = `قم باضافه هذه الصوره الى منتج البوس

[ATTACHED FILES — the user attached 1 file(s) to this message.]
--- (1) boss-real.png — image/png, 12 KB
(raw file on disk at: ${attachedPath})`;
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const plan = await PlanningEngine.generatePlan({ intent: { goal: withFile, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any });
    check('the planner routes «أضف هذه الصورة إلى …» to project_edit, not to a chat about the file',
        plan.steps[0].tool === 'project_edit', plan.steps[0]?.tool);
    const useIt: any = await new ProjectEditTool().execute({ request: withFile }, { sessionId: 'field-edit' });
    const c2 = contentOf();
    const bossSrc = (c2.match(/\{ name: 'البوس',[^\n]*?img: \{ src: '(images\/[^']+)'/) || [])[1];
    const adopted = bossSrc ? fs.readFileSync(path.join(proj, 'public', bossSrc)) : Buffer.alloc(0);
    check('the ATTACHED file itself is what landed on the product — byte for byte',
        !!bossSrc && adopted.equals(fs.readFileSync(attachedPath)), `${bossSrc} (${adopted.length}B) logs=${(useIt.logs || []).filter((l: string) => /image|adopt|attach/i.test(l)).join(' | ')}`);
    check('…and the answer says the owner\'s own photo was used', /أرفقتها|attached/.test(String(useIt.output?.message)),
        String(useIt.output?.message).slice(0, 160));
    check('no licence line was invented for a photo the owner owns',
        !c2.includes('Archive Photographer') || (c2.match(/Archive Photographer/g) || []).length === (contentOf().match(/Archive Photographer/g) || []).length);

    console.log('\n[5] متصفح حقيقي: صفحة المنتج تعرض صورته — وصفر طلبات فاشلة');
    const dist = path.join(proj, 'dist');
    const site = http.createServer((req, res) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(dist, rel);
        if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css'
            : file.endsWith('.png') ? 'image/png' : /\.jpe?g$/.test(file) ? 'image/jpeg' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        res.end(fs.readFileSync(file));
    });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const p = await browser.newPage();
    const failed: string[] = [];
    p.on('response', (r: any) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(-40)}`); });
    await p.goto(`http://127.0.0.1:${(site.address() as any).port}/`, { waitUntil: 'networkidle' });
    await p.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 25)); }
        await new Promise(r => setTimeout(r, 300));
    });
    const seen = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('.products-grid .product-card')] as HTMLElement[];
        const boss = cards.find(c => /البوس/.test(c.textContent || ''));
        const img = boss?.querySelector('img') as HTMLImageElement | null;
        return {
            found: !!boss,
            painted: !!img && img.naturalWidth > 0,
            href: boss?.querySelector('.product-link')?.getAttribute('href') || '',
            dead: [...document.images].filter((i: any) => i.currentSrc && i.naturalWidth === 0).length,
        };
    });
    check('the browser SEES the new product with its photograph painted', seen.found && seen.painted && seen.dead === 0, JSON.stringify(seen));
    check('zero failed requests — no 404 for a photo that does not exist', failed.length === 0, failed.join(' | '));
    await p.goto(`http://127.0.0.1:${(site.address() as any).port}/${seen.href}`, { waitUntil: 'networkidle' });
    const view = await p.evaluate(() => ({
        open: !!document.querySelector('.product-view'),
        title: (document.querySelector('.product-view h1')?.textContent || '').trim(),
        photo: ((document.querySelector('.product-view-photo') as HTMLImageElement | null)?.naturalWidth || 0) > 0,
    }));
    check('…and its OWN page opens on that url with the same photo', view.open && view.title === 'البوس' && view.photo, JSON.stringify(view));

    await browser.close();
    site.close(); archive.close();
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
