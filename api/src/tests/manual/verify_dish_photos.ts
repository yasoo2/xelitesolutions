/**
 * WIRE PROOF — per-dish photos, end to end, nothing faked past the archive:
 *
 *   Only photo-sources.searchAllSources is interposed — it answers with
 *   candidates whose URLs point at a REAL local HTTP server serving REAL
 *   PNG bytes. From there everything is live: the REAL resolveImages parses
 *   the markers, downloads over REAL HTTP, checks the real dimensions,
 *   lands files in the artifact store; the REAL ReactProjectTool copies
 *   them into public/, serializes them into content.js, runs a REAL
 *   npm install + vite build; a REAL browser loads the dist and SEES two
 *   dish thumbnails render pixels, the salad ship a clean text row, and
 *   the footer carry the MERGED deduped credits (hero + dish sharing one
 *   source appear once).
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_dish_photos.ts
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

// The ONLY seam: the archive answers deterministically. A query about the
// salad finds nothing; hero + mixed grill share one landing page so the
// credit dedupe has something real to dedupe.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
    const out = origLoad.call(this, request, parent, isMain);
    if (/photo-sources$/.test(String(request))) {
        return {
            ...out,
            searchAllSources: async (query: string) => {
                // The salad's archives are empty for BOTH asks — the full
                // subject and the condensed retry («lemon dressing») the real
                // engine falls back to. The first run of this proof caught
                // that retry rescuing the dish, which is the engine working.
                if (/salad|lemon|dressing|greens|farm/i.test(query)) {
                    return { candidates: [], outcomes: [{ provider: 'stub-archive', ok: false, count: 0, reason: 'nothing for this subject' }] };
                }
                const shared = /grill/i.test(query);
                return {
                    candidates: [{
                        url: `${state.baseUrl}/photo/${encodeURIComponent(query)}.png`,
                        title: query,
                        tags: [],
                        creator: shared ? 'Shared Grill Photographer' : `Photographer ${query.split(' ').filter(Boolean)[0] || 'X'}`,
                        license: 'CC BY 2.0',
                        landing: shared ? `${state.baseUrl}/landing/shared-grill` : `${state.baseUrl}/landing/${encodeURIComponent(query)}`,
                        provider: 'stub-archive',
                    }],
                    outcomes: [{ provider: 'stub-archive', ok: true, count: 1 }],
                };
            },
        };
    }
    return out;
};

async function main() {
    const { iconPng } = require('../../core/design/pwa');
    const png: Buffer = iconPng(640, '#b45a2b');
    const archive = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(png);
    });
    archive.listen(0, '127.0.0.1');
    await new Promise<void>(r => archive.once('listening', () => r()));
    state.baseUrl = `http://127.0.0.1:${(archive.address() as any).port}`;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-dish-wire-'));
    process.env.ARTIFACT_DIR = path.join(root, 'artifacts');
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.ARTIFACT_DIR, { recursive: true });
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] البناء الكامل: صور الأطباق تُجلب وتُنسخ ويُبنى المشروع فعلياً');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const res: any = await new ReactProjectTool().execute(
        { request: 'build a react site for a grill restaurant', root }, { sessionId: 'dish-wire' });
    check('the tool succeeded AND the vite build ran for real', !!res.ok && res.output.built === true, JSON.stringify({ ok: res.ok, built: res.output?.built }));
    const proj = res.output.path as string;
    const logText = (res.logs || []).join('\n');
    check('the terminal reported 2/3 real dish photos', logText.includes('2/3 real dish photos'), logText.split('\n').filter((l: string) => /photo/.test(l)).join(' | '));
    check('…and 2/2 real testimonial portraits', logText.includes('2/2 real portrait photos'), logText.split('\n').filter((l: string) => /portrait/.test(l)).join(' | '));
    const pubImages = fs.existsSync(path.join(proj, 'public', 'images')) ? fs.readdirSync(path.join(proj, 'public', 'images')) : [];
    check('hero + 2 dishes + 2 portraits landed INSIDE the project (public/images)', pubImages.length === 5, pubImages.join(','));
    const content = fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');
    check('the salad serializes img: null while dishes AND testimonials carry photos',
        (content.match(/img: \{ src: 'images\//g) || []).length === 4 && (content.match(/img: null/g) || []).length === 1);
    check('the shared source appears ONCE in the merged credits', (content.match(/landing\/shared-grill/g) || []).length === 1);

    console.log('\n[2] متصفح حقيقي يرى الصور مرسومة بالبكسل والصف الثالث نظيفاً');
    const dist = path.join(proj, 'dist');
    const site = http.createServer((req, res2) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(dist, rel);
        if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res2.writeHead(404); return res2.end(); }
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream';
        res2.writeHead(200, { 'content-type': type });
        res2.end(fs.readFileSync(file));
    });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${(site.address() as any).port}/`, { waitUntil: 'networkidle' });
    const seen = await p.evaluate(() => {
        const thumbs = [...document.querySelectorAll('.menu-thumb')] as HTMLImageElement[];
        const items = [...document.querySelectorAll('.menu-item')];
        const salad = items.find(li => /salad/i.test(li.textContent || ''));
        const hero = document.querySelector('.hero-photo') as HTMLImageElement | null;
        const avatars = [...document.querySelectorAll('.quote-avatar')] as HTMLImageElement[];
        const credits = document.querySelector('.credits');
        return {
            thumbCount: thumbs.length,
            thumbsPainted: thumbs.every(t => t.naturalWidth > 0 && t.naturalHeight > 0),
            saladHasNoThumb: !!salad && !salad.querySelector('img'),
            heroPainted: !!hero && hero.naturalWidth > 0,
            avatarCount: avatars.length,
            avatarsPainted: avatars.every(a => a.naturalWidth > 0 && a.naturalHeight > 0),
            creditLinks: credits ? credits.querySelectorAll('a').length : -1,
            creditText: credits ? (credits.textContent || '').slice(0, 300) : '',
        };
    });
    check('TWO dish thumbnails rendered real pixels', seen.thumbCount === 2 && seen.thumbsPainted, JSON.stringify(seen));
    check('the salad row is a clean text row — no broken <img>', seen.saladHasNoThumb);
    check('the hero photo rendered too', seen.heroPainted);
    check('TWO testimonial avatars rendered real pixels', seen.avatarCount === 2 && seen.avatarsPainted, JSON.stringify(seen));
    check('the footer carries the MERGED deduped credits (4 sources: shared grill, dish, 2 portraits)', seen.creditLinks === 4, seen.creditText);
    check('…and names the shared photographer once', (seen.creditText.match(/Shared Grill Photographer/g) || []).length === 1, seen.creditText);

    console.log('\n[3] تعديل جراحي: «أضف صورة لطبق السلطة» يجلب صورة حقيقية ويعاد البناء ويتحقق');
    // The salad shipped without a photo (its archives were empty). Now the
    // owner asks for one with a subject the archives DO carry — the surgical
    // editor fetches it, edits ONLY that row, and the REAL build verifies.
    const { ProjectEditTool } = require('../../modules/tools/definitions/ProjectEditTool');
    const edit: any = await new ProjectEditTool().execute(
        { request: 'add a photo of fresh fruit bowl to the Season salad dish' }, { sessionId: 'dish-wire' });
    check('the edit succeeded AND the real vite build verified it', !!edit.ok && edit.output.buildVerified === true, JSON.stringify({ ok: edit.ok, bv: edit.output?.buildVerified, msg: String(edit.output?.message).slice(0, 120) }));
    const content2 = fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8');
    check('ONLY the salad row gained the photo (no other row rewritten)', /\{ name: 'Season salad',[^\n]*?img: \{ src: 'images\//.test(content2) && (content2.match(/img: null/g) || []).length === 0 && (content2.match(/img: \{ src: 'images\//g) || []).length === 5);
    const p2 = await browser.newPage();
    await p2.goto(`http://127.0.0.1:${(site.address() as any).port}/`, { waitUntil: 'networkidle' });
    const seen2 = await p2.evaluate(() => {
        const thumbs = [...document.querySelectorAll('.menu-thumb')] as HTMLImageElement[];
        const salad = [...document.querySelectorAll('.menu-item')].find(li => /salad/i.test(li.textContent || ''));
        return {
            thumbCount: thumbs.length,
            painted: thumbs.every(t => t.naturalWidth > 0),
            saladHasThumb: !!salad && !!salad.querySelector('.menu-thumb'),
            creditLinks: document.querySelector('.credits')?.querySelectorAll('a').length ?? -1,
        };
    });
    check('the browser now sees THREE painted dish thumbnails — the salad included', seen2.thumbCount === 3 && seen2.painted && seen2.saladHasThumb, JSON.stringify(seen2));
    check('the new licence line reached the rebuilt footer (5 sources)', seen2.creditLinks === 5, String(seen2.creditLinks));

    console.log('\n[4] «تراجع» يسترجع الملف بايتاً ببايت');
    const undo: any = await new ProjectEditTool().execute({ request: 'تراجع عن آخر تعديل' }, { sessionId: 'dish-wire' });
    check('undo restored the pre-edit content.js', /↩️/.test(String(undo.output?.message)) && /\{ name: 'Season salad',[^\n]*?img: null/.test(fs.readFileSync(path.join(proj, 'src', 'content.js'), 'utf-8')), String(undo.output?.message).slice(0, 100));

    await browser.close();
    site.close(); archive.close();
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
