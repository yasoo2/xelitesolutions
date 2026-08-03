/**
 * WIRE PROOF — the design overhaul is PIXELS, not promises:
 *
 *   Two REAL builds (elegant perfume store, bold SaaS). A REAL browser then
 *   testifies to what shipped:
 *     - the BUNDLED Arabic webfonts actually LOADED (document.fonts) — the
 *       fake-serif costume this batch was born from is dead: elegant
 *       headings measure as REAL Amiri, bodies as REAL Cairo/Tajawal
 *     - the hero carries its eyebrow badge, dual CTAs and glow layers
 *     - cards reveal on scroll (data-reveal → .in) and lift on hover
 *     - feature cards carry inline SVG icons
 *     - self-QA still 100/100 WITH the new webfont check armed
 *
 *   Batch 2 adds a THIRD real build (warm restaurant, real photos from a
 *   local archive) and measures the new GEOMETRY in the same browser:
 *     - the menu zigzags (every second photo row flips sides)
 *     - the CTA band wears its family's SHAPE (warm rounded, elegant flat)
 *     - alternating sections carry the tint rhythm
 *     - the first product card is genuinely FEATURED (wider than its siblings)
 *   These are the rules the cascade used to eat: the family layer sat above
 *   the base sheet and lost every tie. This proof measures the cascade too.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_design_upgrade.ts
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

// The ONLY seam in the photo run: the archive answers from a REAL local
// server. Everything past it — download, dimension gate, copy, build — is live.
const state = { baseUrl: '', n: 0 };
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
    const out = origLoad.call(this, request, parent, isMain);
    if (/photo-sources$/.test(String(request))) {
        return {
            ...out,
            // A real archive answers with a SHELF of photographs, which is what
            // lets the engine's variant machinery hand a different one to each
            // repeat of the same subject (four gallery cells, four pictures).
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

const serve = (dist: string): Promise<{ url: string; close: () => void }> => new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(dist, rel);
        if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.png') ? 'image/png' : /\.jpe?g$/.test(file) ? 'image/jpeg' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(srv.address() as any).port}/`, close: () => srv.close() }));
});

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-design-wire-'));
    process.env.ARTIFACT_DIR = path.join(root, 'artifacts');
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.ARTIFACT_DIR, { recursive: true });
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    const { iconPng } = require('../../core/design/pwa');
    // DIFFERENT BYTES per photograph — the engine files a download under its
    // content hash, so four identical pictures would collapse into one file
    // (which is exactly what the gallery's dedupe is there to prevent).
    const HUES = ['#b45a2b', '#2b6cb4', '#2bb46c', '#b42b8f', '#8f6c2b', '#3a3a72'];
    const archive = http.createServer((req, res) => {
        const n = Number((String(req.url || '').match(/-(\d+)\.png$/) || [])[1] || 0);
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(iconPng(640, HUES[n % HUES.length]) as Buffer);
    });
    archive.listen(0, '127.0.0.1');
    await new Promise<void>(r => archive.once('listening', () => r()));
    state.baseUrl = `http://127.0.0.1:${(archive.address() as any).port}`;

    console.log('\n[1] بناءان حقيقيان — والخطوط الحقيقية سافرت مع كل تطبيق');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const fancy: any = await new ReactProjectTool().execute(
        { request: 'ابنِ متجر react فاخر للعطور', root, skipImages: true }, { sessionId: 'du-a' });
    const bold: any = await new ReactProjectTool().execute(
        { request: 'ابنِ تطبيق ويب react لإدارة المهام بتصميم جريء', root }, { sessionId: 'du-b' });
    check('both built for real', fancy.output?.built === true && bold.output?.built === true);
    const fontsA = fs.readdirSync(path.join(fancy.output.path, 'src', 'styles', 'fonts'));
    check('the elegant app ships REAL Amiri + Cairo woff2 files with the OFL notice',
        fontsA.includes('amiri-700-arabic.woff2') && fontsA.includes('cairo-400-arabic.woff2') && fontsA.includes('OFL-LICENSE.txt'), fontsA.join(','));
    check('…and each file is real font bytes, not a stub', fs.statSync(path.join(fancy.output.path, 'src', 'styles', 'fonts', 'amiri-700-arabic.woff2')).size > 20_000);
    check('self-QA (now armed with the webfont check) still passes 100/100',
        fancy.output.audit?.score === 100 && bold.output.audit?.score === 100,
        JSON.stringify({ a: fancy.output.audit, b: bold.output.audit }).slice(0, 160));

    console.log('\n[2] المتصفح يشهد: الخطوط حُمِّلت ورُسمت فعلاً');
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const sA = await serve(path.join(fancy.output.path, 'dist'));
    const pA = await browser.newPage();
    await pA.goto(sA.url, { waitUntil: 'networkidle' });
    const fontsSeen = await pA.evaluate(async () => {
        await (document as any).fonts.ready;
        return {
            bodyLoaded: (document as any).fonts.check('16px "Cairo"'),
            headLoaded: (document as any).fonts.check('16px "Amiri"'),
            h1Font: getComputedStyle(document.querySelector('h1')!).fontFamily,
        };
    });
    check('REAL Cairo loaded for the body', fontsSeen.bodyLoaded === true, JSON.stringify(fontsSeen));
    check('REAL Amiri loaded for the elegant headings (the dead costume, resurrected as fact)', fontsSeen.headLoaded === true && /Amiri/.test(fontsSeen.h1Font));

    console.log('\n[3] البطل الجديد: شارة، زران، طبقات توهج — والحركة تعمل');
    const heroSeen = await pA.evaluate(() => {
        const before = getComputedStyle(document.querySelector('.hero')!, '::before');
        return {
            eyebrow: (document.querySelector('.hero-eyebrow')?.textContent || '').length > 2,
            ctas: document.querySelectorAll('.hero-ctas .btn').length,
            ghost: !!document.querySelector('.btn-ghost'),
            glow: before.filter.includes('blur') && before.borderRadius === '50%',
        };
    });
    check('eyebrow badge + TWO CTAs (primary + ghost) on the hero', heroSeen.eyebrow && heroSeen.ctas === 2 && heroSeen.ghost, JSON.stringify(heroSeen));
    check('the glow layers are painted (blurred ::before)', heroSeen.glow);
    const reveal = await pA.evaluate(async () => {
        const card = document.querySelector('.card')!;
        card.scrollIntoView();
        await new Promise(r => setTimeout(r, 900));
        return { marked: card.hasAttribute('data-reveal'), revealed: card.classList.contains('in'), opacity: getComputedStyle(card).opacity };
    });
    check('cards are observed and REVEAL on scroll (opacity 1 after .in)', reveal.marked && reveal.revealed && parseFloat(reveal.opacity) > 0.9, JSON.stringify(reveal));

    console.log('\n[4] الطراز الجريء: Cairo أسود 900 والأيقونات على البطاقات');
    const sB = await serve(path.join(bold.output.path, 'dist'));
    const pB = await browser.newPage();
    await pB.goto(sB.url, { waitUntil: 'networkidle' });
    const boldSeen = await pB.evaluate(async () => {
        await (document as any).fonts.ready;
        return {
            heavy: (document as any).fonts.check('900 16px "Cairo"'),
            h1Weight: getComputedStyle(document.querySelector('h1')!).fontWeight,
            icons: document.querySelectorAll('.card-icon svg').length,
        };
    });
    check('the 900-weight Cairo really loaded and the h1 wears it', boldSeen.heavy === true && boldSeen.h1Weight === '900', JSON.stringify(boldSeen));
    check('feature cards carry inline SVG icons', boldSeen.icons >= 3, String(boldSeen.icons));

    console.log('\n[5] الهندسة الجديدة: نداء ختامي بشكل العائلة، منتج مميّز، وإيقاع أقسام');
    const storeGeom = await pA.evaluate(() => {
        const cards = [...document.querySelectorAll('.products-grid .product-card')] as HTMLElement[];
        const band = document.querySelector('.cta-band') as HTMLElement | null;
        const bs = band ? getComputedStyle(band) : null;
        // nth-of-type counts EVERY <section> under main — the hero and the
        // gradient bands included — so the rhythm is measured against the real
        // DOM order, not against a filtered list.
        const all = [...document.querySelectorAll('main > section')] as HTMLElement[];
        return {
            cards: cards.length,
            firstW: cards[0]?.getBoundingClientRect().width || 0,
            secondW: cards[1]?.getBoundingClientRect().width || 0,
            bandCtas: band?.querySelectorAll('.btn').length || 0,
            bandFlat: bs ? bs.backgroundImage === 'none' && bs.borderTopWidth === '1px' : false,
            bandBg: bs?.backgroundColor || '',
            rhythm: all.map((s, i) => ({
                cls: s.className,
                tinted: getComputedStyle(s).backgroundColor !== 'rgba(0, 0, 0, 0)',
                wantTint: i % 2 === 1 && /(^|\s)section(\s|$)/.test(s.className) && !/band/.test(s.className),
            })),
        };
    });
    check('the FIRST product card is genuinely featured — measurably wider than its sibling',
        storeGeom.cards >= 3 && storeGeom.firstW > storeGeom.secondW * 1.8, JSON.stringify(storeGeom));
    check('the elegant CTA band is FLAT (no gradient, hairline rules) — the family layer wins the cascade now',
        storeGeom.bandFlat && storeGeom.bandCtas >= 1, JSON.stringify(storeGeom));
    check('the sections ALTERNATE — every even-of-type block is tinted, its neighbours are not (the rhythm a flat wall of white never had)',
        storeGeom.rhythm.length >= 4 && storeGeom.rhythm.some((r: any) => r.wantTint)
        && storeGeom.rhythm.every((r: any) => r.wantTint === r.tinted || /band|hero/.test(r.cls)),
        JSON.stringify(storeGeom.rhythm));

    console.log('\n[6] بناء ثالث حقيقي: مطعم دافئ بصور حقيقية — القائمة تتعرّج والشريط مستدير');
    const warm: any = await new ReactProjectTool().execute(
        { request: 'ابنِ موقع react لمطعم شرقي دافئ', root }, { sessionId: 'du-c' });
    check('the warm restaurant built for real, with real photos', warm.output?.built === true
        && fs.readdirSync(path.join(warm.output.path, 'public', 'images')).length >= 3,
        JSON.stringify({ built: warm.output?.built }));
    check('…and self-QA passes it too', warm.output.audit?.score === 100, JSON.stringify(warm.output.audit).slice(0, 200));
    const sC = await serve(path.join(warm.output.path, 'dist'));
    const pC = await browser.newPage();
    await pC.goto(sC.url, { waitUntil: 'networkidle' });
    const warmGeom = await pC.evaluate(() => {
        const items = [...document.querySelectorAll('.menu-item')] as HTMLElement[];
        const flip = items.filter(i => i.classList.contains('flip'));
        const band = document.querySelector('.cta-band') as HTMLElement | null;
        const bs = band ? getComputedStyle(band) : null;
        const thumb = document.querySelector('.menu-thumb') as HTMLImageElement | null;
        return {
            items: items.length,
            flips: flip.length,
            flipDir: flip[0] ? getComputedStyle(flip[0]).flexDirection : '',
            plainDir: items[0] ? getComputedStyle(items[0]).flexDirection : '',
            thumbPainted: !!thumb && thumb.naturalWidth > 0,
            thumbW: thumb ? Math.round(thumb.getBoundingClientRect().width) : 0,
            bandRadius: bs?.borderTopLeftRadius || '',
            bandGradient: (bs?.backgroundImage || '').includes('gradient'),
        };
    });
    check('the menu ZIGZAGS — every second photo row flips to the other side',
        warmGeom.flips >= 1 && warmGeom.flipDir === 'row-reverse' && warmGeom.plainDir === 'row', JSON.stringify(warmGeom));
    check('the dish thumbnails painted at the new 112px size', warmGeom.thumbPainted && warmGeom.thumbW === 112, JSON.stringify(warmGeom));
    check('the warm CTA band is a ROUNDED gradient slab (28px) — its own family shape',
        warmGeom.bandRadius === '28px' && warmGeom.bandGradient, JSON.stringify(warmGeom));

    console.log('\n[7] ثلاثة أشكال للبطل، معرض صور حقيقي، شريط ثقة، وتنقّل لا يكذب');
    const heroSeen3 = await pC.evaluate(() => {
        const hero = document.querySelector('.hero') as HTMLElement;
        const bg = document.querySelector('.hero-bg') as HTMLImageElement | null;
        const copy = document.querySelector('.hero-copy') as HTMLElement | null;
        const perks = [...document.querySelectorAll('.perk')] as HTMLElement[];
        const shots = [...document.querySelectorAll('.gallery-mosaic .shot img')] as HTMLImageElement[];
        const lead = document.querySelector('.shot-lead img') as HTMLImageElement | null;
        const navA = [...document.querySelectorAll('.nav-links a')] as HTMLAnchorElement[];
        return {
            overlay: hero.classList.contains('hero-overlay'),
            bgPainted: !!bg && bg.naturalWidth > 0,
            // The copy really sits OVER the photograph, not beside it.
            copyOverPhoto: !!bg && !!copy
                && copy.getBoundingClientRect().top >= bg.getBoundingClientRect().top
                && copy.getBoundingClientRect().bottom <= bg.getBoundingClientRect().bottom + 2,
            heroRadius: getComputedStyle(hero).borderEndStartRadius,
            perks: perks.length,
            perkIcons: document.querySelectorAll('.perk svg').length,
            shots: shots.length,
            shotsPainted: shots.every(s => s.naturalWidth > 0),
            leadWider: !!lead && shots.length > 1 && lead.getBoundingClientRect().width > shots[1].getBoundingClientRect().width * 1.5,
            navHrefs: navA.map(a => a.getAttribute('href') || ''),
            navResolves: navA.every(a => {
                const id = (a.getAttribute('href') || '').slice(1);
                return !!id && !!document.getElementById(id);
            }),
            footerCols: document.querySelectorAll('.footer-cols .footer-col').length,
            footerLinks: document.querySelectorAll('.footer-links a').length,
        };
    });
    check('the restaurant wears the OVERLAY hero — a full-bleed photograph with the copy laid over it',
        heroSeen3.overlay && heroSeen3.bgPainted && heroSeen3.copyOverPhoto, JSON.stringify(heroSeen3));
    check('…and the warm family rounds its bottom edge (56px)', heroSeen3.heroRadius === '56px', heroSeen3.heroRadius);
    check('the trust strip carries THREE perks, each with its own icon', heroSeen3.perks === 3 && heroSeen3.perkIcons === 3, JSON.stringify(heroSeen3));
    check('the GALLERY mosaic painted real photographs, the lead cell twice the size',
        heroSeen3.shots >= 3 && heroSeen3.shotsPainted && heroSeen3.leadWider, JSON.stringify(heroSeen3));
    check('every navigation link points at a section that REALLY EXISTS (the restaurant used to advertise a #features it never rendered)',
        heroSeen3.navHrefs.length >= 3 && heroSeen3.navResolves, heroSeen3.navHrefs.join(','));
    check('the footer is a real three-column footer with live links', heroSeen3.footerCols >= 2 && heroSeen3.footerLinks >= 3, JSON.stringify(heroSeen3));

    const splitSeen = await pB.evaluate(() => {
        const hero = document.querySelector('.hero') as HTMLElement;
        const photo = document.querySelector('.hero-photo') as HTMLImageElement | null;
        const copy = document.querySelector('.hero-copy') as HTMLElement | null;
        return {
            split: hero.classList.contains('hero-split-layout'),
            painted: !!photo && photo.naturalWidth > 0,
            // Side by side: the copy and the photograph share a horizontal band.
            sideBySide: !!photo && !!copy && Math.abs(copy.getBoundingClientRect().top - photo.getBoundingClientRect().top) < 400
                && copy.getBoundingClientRect().right <= photo.getBoundingClientRect().left + 2
                || (!!photo && !!copy && photo.getBoundingClientRect().right <= copy.getBoundingClientRect().left + 2),
            clip: getComputedStyle(hero).clipPath,
        };
    });
    check('the tech platform wears the SPLIT hero — copy beside the photograph, not over it',
        splitSeen.split && splitSeen.painted && splitSeen.sideBySide, JSON.stringify(splitSeen));
    check('…and the bold family cuts its hero on a diagonal', /polygon/.test(splitSeen.clip), splitSeen.clip);

    const centeredSeen = await pA.evaluate(() => {
        const hero = document.querySelector('.hero') as HTMLElement;
        const copy = document.querySelector('.hero-copy') as HTMLElement | null;
        return {
            centered: hero.classList.contains('hero-centered'),
            noHoles: !document.querySelector('.hero-bg') && !document.querySelector('.hero-photo'),
            align: copy ? getComputedStyle(copy).textAlign : '',
        };
    });
    check('a build with NO photograph centres its hero on purpose — never a hole where a picture should be',
        centeredSeen.centered && centeredSeen.noHoles && centeredSeen.align === 'center', JSON.stringify(centeredSeen));

    console.log('\n[8] القصة والخطوات والمقارنة والموقع — أقسام حقيقية لا حشو');
    const storySeen = await pC.evaluate(() => {
        const media = document.querySelector('.story-media img') as HTMLImageElement | null;
        const body = document.querySelector('.story-body') as HTMLElement | null;
        const shots = [...document.querySelectorAll('.gallery-mosaic img')] as HTMLImageElement[];
        const steps = [...document.querySelectorAll('.steps .step')] as HTMLElement[];
        return {
            storyPainted: !!media && media.naturalWidth > 0,
            // The story's photograph was BORROWED from the mosaic — it must
            // not appear in both places on the same page.
            notRepeated: !!media && !shots.some(s => s.src === media.src),
            sideBySide: !!media && !!body && Math.abs(media.getBoundingClientRect().top - body.getBoundingClientRect().top) < 500
                && (media.getBoundingClientRect().left >= body.getBoundingClientRect().right - 2
                    || body.getBoundingClientRect().left >= media.getBoundingClientRect().right - 2),
            paras: document.querySelectorAll('.story-body p').length,
            steps: steps.length,
            stepNums: [...document.querySelectorAll('.step-num')].map(n => (n.textContent || '').trim()),
            // No saved business profile in this proof → no invented pin.
            location: !!document.querySelector('#location'),
        };
    });
    check('the STORY runs beside its own photograph, borrowed from the mosaic and never repeated there',
        storySeen.storyPainted && storySeen.notRepeated && storySeen.sideBySide && storySeen.paras === 2, JSON.stringify(storySeen));
    check('the HOW-IT-WORKS steps are numbered 1·2·3', storySeen.steps === 3 && storySeen.stepNums.join('') === '123', JSON.stringify(storySeen));
    check('with NO saved address the location block renders nothing — an invented pin is worse than no pin',
        storySeen.location === false, String(storySeen.location));

    const railSeen = await pC.evaluate(() => {
        const rail = document.querySelector('.quote-rail') as HTMLElement | null;
        return { snap: rail ? getComputedStyle(rail).scrollSnapType : '', flow: rail ? getComputedStyle(rail).gridAutoFlow : '' };
    });
    check('the testimonials ride a snap rail on narrow screens (row grid on the desktop)',
        !!railSeen.flow, JSON.stringify(railSeen));

    const compareSeen = await pB.evaluate(() => {
        const table = document.querySelector('table.compare') as HTMLTableElement | null;
        if (!table) return { rows: 0, cols: 0, yes: 0, no: 0, scrolls: false, featured: 0 };
        return {
            rows: table.querySelectorAll('tbody tr').length,
            cols: table.querySelectorAll('thead th').length,
            yes: table.querySelectorAll('.yes').length,
            no: table.querySelectorAll('.no').length,
            scrolls: getComputedStyle(table.parentElement as HTMLElement).overflowX === 'auto',
            featured: table.querySelectorAll('.is-featured').length,
        };
    });
    check('the tech platform ships a real COMPARISON TABLE built from its own tiers',
        compareSeen.rows >= 4 && compareSeen.cols === 4 && compareSeen.yes > 0 && compareSeen.no > 0
        && compareSeen.scrolls && compareSeen.featured > 0, JSON.stringify(compareSeen));

    await browser.close();
    sA.close(); sB.close(); sC.close(); archive.close();
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
