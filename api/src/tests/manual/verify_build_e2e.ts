/**
 * Build a real page end to end, then MEASURE it in a browser.
 *
 *   npm run verify:e2e            # every page kind
 *   npm run verify:e2e -- store   # one kind
 *
 * The unit suite checks the pieces. `verify:chrome` checks the header. Neither
 * of them runs the thing the user actually runs: intent → blueprint → sections →
 * images → content contract → QA → audits → repair → artifact.
 *
 * This does, against a stub model served over HTTP as an OpenAI-compatible
 * endpoint, so the REAL router, the REAL prompts and the REAL orchestration are
 * exercised — only the weights are substituted. The stub deliberately answers
 * the way a weak model answers, because that is the input Joe has to survive:
 *
 *   - English prose on a page that was asked for in Arabic
 *   - two sections that both declare `const cards`
 *   - href="#" on real links
 *   - class names that do not exist in the kit (.cta-button, .nav-links)
 *   - a section returned as a whole HTML document, inside a markdown fence
 *   - a section that comes back as an apology
 *
 * Then the artifact is opened in Chromium and measured. Everything asserted here
 * is a property of the finished page, not of the code that produced it.
 */

import fs from 'fs';
import http from 'http';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-e2e-secret-not-used-anywhere';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.MOCK_DB = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// The photo archives are not reachable from a test runner, and a build that
// silently depends on somebody's network is not a test. Joe must produce a
// complete page with its designed gradients instead.
process.env.JOE_IMAGE_TIMEOUT = process.env.JOE_IMAGE_TIMEOUT || '1200';

// There is no websocket in a test runner; the broadcast warning is expected and
// drowns the findings. Exactly that line is dropped, nothing else.
const realWarn = console.warn.bind(console);
console.warn = (...a: any[]) => { if (typeof a[0] === 'string' && a[0].includes('liveWssRef is null')) return; realWarn(...a); };

/* ---------- the stub model -------------------------------------------------- */

const BAD_SECTION_EN = (id: string) => `<section class="section" id="${id}"><div class="wrap">
<h2>Transform Your Business with Xelite Solutions</h2>
<p class="lede">We provide top-notch consulting services to help your company overcome
obstacles and achieve lasting success in a highly competitive market.</p>
<div class="grid-3">
  <div class="card"><h3>Software Development</h3><p>Expertly crafted solutions.</p></div>
  <div class="card"><h3>IT Consulting</h3><p>Personalised advice.</p></div>
  <div class="card"><h3>Recruitment</h3><p>We test every candidate.</p></div>
</div>
<a class="btn" href="#">Learn more</a>
<script>
const cards = document.querySelectorAll('.card');
cards.forEach(function (c) { c.addEventListener('mouseover', function () { c.dataset.hot = '1'; }); });
</script>
</div></section>`;

const GOOD_SECTION_AR = (id: string, n: number) => `<section class="section" id="${id}"><div class="wrap">
<h2>قسم رقم ${n} — خدماتنا الاستشارية</h2>
<p class="lede">نساعد الشركات الناشئة على تجاوز عقبات الإدارة والتوظيف واختيار الكفاءات
بعد اختبارها، ونحلّ مشكلات الأنظمة والبرامج والعمليات التشغيلية والتنظيمية.</p>
<div class="grid-3">
  <div class="card"><h3>الاستشارات البرمجية</h3><p>نراجع أنظمتكم ونضع خطة تطوير عملية.</p></div>
  <div class="card"><h3>التوظيف واختيار الكفاءات</h3><p>اختبار عملي قبل التعيين، لا سيرة ذاتية فقط.</p></div>
  <div class="card"><h3>الإدارة والتشغيل</h3><p>نرتّب العمليات ونقيس الأداء أسبوعيًا.</p></div>
</div>
<p>الباقة الأساسية ٢٩٩ ر.س شهريًا، والمتقدّمة ٩٩٩ ر.س شهريًا.</p>
<a class="btn" href="#contact">تواصل معنا</a>
</div></section>`;

const HEADER_WRONG_CLASSES = `<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="index.html">إكس إيليت</a>
<button class="nav-toggle" type="button" aria-controls="site-nav"><svg class="icon"><use href="#i-menu"/></svg></button>
<nav class="site-nav" id="site-nav"><ul class="nav-links">
<li><a href="#">من نحن</a></li>
<li class="has-menu"><button type="button" class="nav-link">خدماتنا</button>
<ul class="dropdown"><li><a href="#services">الاستشارات</a></li><li><a href="#pricing">الأسعار</a></li></ul></li>
</ul>
<div class="nav-actions"><a class="btn btn-ghost" href="#login">تسجيل الدخول</a></div>
</nav></div></header>`;

/** Answers in the order a build asks, cycling through the failure modes. */
function stubReply(prompt: string, turn: number): string {
    const p = prompt.toLowerCase();

    // A section edit or a repair asks for a specific element back.
    if (p.includes('you are editing one section') || p.includes('return the complete updated html')) {
        return GOOD_SECTION_AR('repaired', 99);
    }
    if (p.includes('you are writing one section')) {
        const id = (prompt.match(/id="([^"]+)"/) || [, `sec-${turn}`])[1];
        // Turn 0: the header, with the class names a model reaches for.
        if (/header/i.test(prompt) && turn < 3) return HEADER_WRONG_CLASSES;
        // Every third section comes back in English, to exercise the retry.
        if (turn % 3 === 1) return BAD_SECTION_EN(id);
        // One comes back as a whole document inside a fence.
        if (turn % 7 === 4) {
            return '```html\n<!DOCTYPE html><html><head><title>x</title></head><body>'
                + GOOD_SECTION_AR(id, turn) + '</body></html>\n```';
        }
        return GOOD_SECTION_AR(id, turn);
    }
    // Anything else (single-shot build, content repair): a complete document.
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ص</title>
<style>:root{--brand:#2563eb}</style></head><body>${HEADER_WRONG_CLASSES}<main>
${GOOD_SECTION_AR('a', 1)}${GOOD_SECTION_AR('b', 2)}${BAD_SECTION_EN('c')}</main></body></html>`;
}

function startStub(): Promise<{ url: string; close: () => void; calls: number }> {
    let turn = 0;
    const state = { calls: 0 };
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', c => { body += c; });
            req.on('end', () => {
                state.calls++;
                let prompt = '';
                try {
                    const j = JSON.parse(body || '{}');
                    prompt = (j.messages || []).map((m: any) => String(m.content ?? '')).join('\n');
                } catch { /* an unparseable request still gets an answer */ }
                const content = stubReply(prompt, turn++);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    id: 'stub', object: 'chat.completion', model: 'stub',
                    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
                    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                }));
            });
        });
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as any).port;
            resolve({ url: `http://127.0.0.1:${port}/v1`, close: () => server.close(), get calls() { return state.calls; } } as any);
        });
    });
}

/* ---------- measurement ------------------------------------------------------ */

interface Finding { severity: 'critical' | 'major' | 'minor'; text: string }

async function measure(browser: any, url: string): Promise<{ findings: Finding[]; facts: Record<string, unknown> }> {
    const findings: Finding[] = [];
    const errors: string[] = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e: Error) => errors.push(e.message));
    page.on('console', (m: any) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(700);

    const facts = await page.evaluate(() => {
        const vis = (el: Element) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        const text = (document.body.innerText || '');
        const arabic = (text.match(/[ؠ-ٟٮ-ۓۺ-ۿ]/g) || []).length;
        const latin = (text.match(/[A-Za-z]/g) || []).length;
        /**
         * Parse ANY colour Chrome hands back, as [r,g,b,a] with r,g,b in 0-255.
         *
         * `rgb(37, 47, 65)` is 0-255 and `color(srgb 1 1 1 / 0.88)` is 0-1, and
         * a parser that assumes the first form divides the second by 255. That
         * turned a white header into near-black and reported a perfectly legible
         * nav link at 1.01:1 — a defect in the measuring instrument reported as
         * a defect in the page. color() is what `color-mix()` computes to, and
         * color-mix is all over this stylesheet.
         */
        const parse = (c: string): [number, number, number, number] => {
            const s = String(c || '').trim();
            if (!s || s === 'transparent') return [0, 0, 0, 0];
            const nums = (s.match(/-?[\d.]+(?:e-?\d+)?%?/gi) || []).map(v =>
                v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));
            if (/^color\(/i.test(s)) {
                const [r = 0, g = 0, b = 0] = nums;
                const a = /\//.test(s) ? (nums[3] ?? 1) : 1;
                return [r * 255, g * 255, b * 255, a];
            }
            const [r = 0, g = 0, b = 0, a = 1] = nums;
            return [r, g, b, a];
        };
        const lum = (rgb: [number, number, number, number]) => {
            const [r, g, b] = rgb.slice(0, 3).map(v => {
                const t = v / 255; return t <= 0.03928 ? t / 12.92 : Math.pow((t + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const over = (fg: [number, number, number, number], bg: [number, number, number, number]): [number, number, number, number] => {
            const a = fg[3] + bg[3] * (1 - fg[3]);
            if (a === 0) return [0, 0, 0, 0];
            return [
                (fg[0] * fg[3] + bg[0] * bg[3] * (1 - fg[3])) / a,
                (fg[1] * fg[3] + bg[1] * bg[3] * (1 - fg[3])) / a,
                (fg[2] * fg[3] + bg[2] * bg[3] * (1 - fg[3])) / a,
                a,
            ];
        };
        /**
         * The colour actually behind the text: every semi-transparent layer
         * COMPOSITED down to the page, not the first one that is not fully
         * clear. A header at 88% white over a light page is not the same colour
         * as 100% white, and stopping at the first layer gets it wrong either
         * way.
         */
        const bgOf = (el: Element): [number, number, number, number] => {
            const stack: Array<[number, number, number, number]> = [];
            let n: Element | null = el;
            while (n) { stack.push(parse(getComputedStyle(n).backgroundColor)); n = n.parentElement; }
            let out: [number, number, number, number] = [255, 255, 255, 1];   // the canvas
            for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
            return out;
        };
        const contrast = (fgStr: string, bg: [number, number, number, number]) => {
            // Text can be semi-transparent too, and it composites over its own
            // background before it is compared with it.
            const a = lum(over(parse(fgStr), bg)), b2 = lum(bg);
            return (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05);
        };
        const lowContrast: string[] = [];
        for (const el of Array.from(document.querySelectorAll('h1,h2,h3,p,a,button,th,td,li')).slice(0, 300)) {
            if (!vis(el) || !(el as HTMLElement).innerText?.trim()) continue;
            const cs = getComputedStyle(el);
            const ratio = contrast(cs.color, bgOf(el));
            const size = parseFloat(cs.fontSize);
            const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
            if (ratio < (large ? 3 : 4.5)) lowContrast.push(`${el.tagName.toLowerCase()} "${(el as HTMLElement).innerText.slice(0, 26)}" ${ratio.toFixed(2)}:1`);
        }
        const grids = Array.from(document.querySelectorAll('.grid-2,.grid-3,.grid-4')).map(g => ({
            cls: g.className,
            cols: getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length,
            display: getComputedStyle(g).display,
        }));
        return {
            hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            title: document.title,
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            h1: document.querySelectorAll('h1').length,
            sections: document.querySelectorAll('section').length,
            deadAnchors: Array.from(document.querySelectorAll('a[href="#"]')).length,
            emptyAlt: Array.from(document.querySelectorAll('img:not([alt])')).length,
            arabicShare: arabic + latin ? arabic / (arabic + latin) : 0,
            lowContrast: lowContrast.slice(0, 6),
            grids,
            headerSticky: document.querySelector('.site-header') ? getComputedStyle(document.querySelector('.site-header')!).position : 'none',
            hasMain: !!document.querySelector('main'),
            bdi: document.querySelectorAll('bdi').length,
            iconsResolved: Array.from(document.querySelectorAll('svg use')).length,
            brokenImgs: Array.from(document.querySelectorAll('img')).filter(i => (i as HTMLImageElement).naturalWidth === 0).length,
        };
    });

    if (errors.length) findings.push({ severity: 'critical', text: `JavaScript errors: ${errors.slice(0, 2).join(' | ')}` });
    if (facts.hScroll > 2) findings.push({ severity: 'major', text: `page scrolls ${facts.hScroll}px sideways on a desktop` });
    if (facts.h1 !== 1) findings.push({ severity: 'major', text: `${facts.h1} <h1> elements (must be exactly 1)` });
    if (!facts.hasMain) findings.push({ severity: 'minor', text: 'no <main> landmark' });
    if (facts.deadAnchors > 0) findings.push({ severity: 'major', text: `${facts.deadAnchors} link(s) still href="#"` });
    if (facts.emptyAlt > 0) findings.push({ severity: 'major', text: `${facts.emptyAlt} image(s) with no alt` });
    if (facts.brokenImgs > 0) findings.push({ severity: 'major', text: `${facts.brokenImgs} image(s) failed to load` });
    if ((facts.lowContrast as string[]).length) findings.push({ severity: 'major', text: `below AA contrast: ${(facts.lowContrast as string[]).join('; ')}` });
    for (const g of facts.grids as any[]) {
        if (g.display !== 'grid') findings.push({ severity: 'critical', text: `${g.cls} is display:${g.display}, not grid` });
        else if (/grid-3|grid-4/.test(g.cls) && g.cols < 2) findings.push({ severity: 'major', text: `${g.cls} rendered in ${g.cols} column(s) on a 1280px desktop` });
    }
    if ((facts.arabicShare as number) < 0.55) findings.push({ severity: 'major', text: `only ${Math.round((facts.arabicShare as number) * 100)}% of the visible text is Arabic` });
    if (/ابن|ابني|build me|اصنع/.test(String(facts.title))) findings.push({ severity: 'major', text: `<title> is the prompt: "${facts.title}"` });

    // A phone is where the layout actually breaks.
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(400);
    const phone = await page.evaluate(() => ({
        hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        canDrag: (() => { window.scrollTo(600, 0); const x = window.scrollX; window.scrollTo(0, 0); return x; })(),
        cols: Array.from(document.querySelectorAll('.grid-2,.grid-3,.grid-4'))
            .map(g => getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length),
    }));
    if (phone.canDrag > 0) findings.push({ severity: 'major', text: `page can be dragged ${phone.canDrag}px sideways on a phone` });
    if ((phone.cols as number[]).some((c: number) => c > 1)) findings.push({ severity: 'major', text: `grid stayed at ${Math.max(...phone.cols)} columns on a 390px phone` });

    await page.close();
    return { findings, facts: { ...facts, phone } };
}

/* ---------- the run ---------------------------------------------------------- */

const REQUESTS: Record<string, string> = {
    landing: 'ابني صفحة ويب لشركه تكنلوجية اسمها xelitesolutions وهي شركة مختصة بالاستشارات البرمجية والخدماتية ومساعده الشركات الناشئة، ويجب ان يحتوي على زر تسجيل دخول وزر تسجيل خروج وزر من نحن وزر اتصل بنا وصور تجسد وظيفه الشركة',
    store: 'ابني متجرًا إلكترونيًا اسمه «نجمة الشرق» لبيع العطور الفاخرة مع سلة شراء وصفحة منتجات وأسعار بالريال',
    restaurant: 'ابني موقعًا لمطعم اسمه «بيت الطهاة» يعرض قائمة الطعام والأسعار وحجز طاولة',
    dashboard: 'ابني لوحة تحكم لمتابعة مبيعات شركة، فيها رسوم بيانية وأرقام ومؤشرات أداء',
    portfolio: 'ابني موقع أعمال لمصمّم جرافيك اسمه «سالم» يعرض مشاريعه وطريقة التواصل معه',
};

async function main() {
    const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
    const kinds = only.length ? only : Object.keys(REQUESTS);

    const stub: any = await startStub();
    const { WebPageBuilderTool } = require('../../modules/tools/definitions/WebPageBuilderTool');
    const tool = new WebPageBuilderTool();

    let chromium: any;
    try { ({ chromium } = require('playwright-core')); }
    catch { console.error('playwright-core is not installed — cannot verify.'); process.exit(2); }
    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});

    let totalCritical = 0, totalMajor = 0;
    for (const kind of kinds) {
        const request = REQUESTS[kind];
        if (!request) { console.log(`? unknown kind "${kind}"`); continue; }
        console.log(`\n══ ${kind} ${'═'.repeat(Math.max(0, 60 - kind.length))}`);

        const t0 = Date.now();
        let res: any;
        try {
            res = await tool.execute({ request }, {
                sessionId: `e2e-${kind}`,
                userId: 'e2e',
                modelConfig: { provider: 'openai', model: 'stub', apiKey: 'sk-stub', baseUrl: stub.url },
            });
        } catch (e: any) {
            console.log(`✗ the build THREW: ${e?.message || e}`);
            totalCritical++;
            continue;
        }
        if (!res?.ok) { console.log(`✗ the build failed: ${res?.error}`); totalCritical++; continue; }

        const file = String(res.output?.path || '');
        const artifactDir = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
        // Prefer the split project, which is what the preview now serves.
        const projDir = path.join(artifactDir, `joe-e2e-${kind}`);
        const target = fs.existsSync(path.join(projDir, 'index.html'))
            ? path.join(projDir, 'index.html')
            : path.join(artifactDir, file);
        if (!fs.existsSync(target)) { console.log(`✗ no artifact on disk at ${target}`); totalCritical++; continue; }

        const { findings, facts } = await measure(browser, 'file://' + target);
        const crit = findings.filter(f => f.severity === 'critical').length;
        const maj = findings.filter(f => f.severity === 'major').length;
        totalCritical += crit; totalMajor += maj;

        console.log(`  built in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${fs.statSync(target).size} bytes · title "${facts.title}"`);
        console.log(`  lang=${facts.lang} dir=${facts.dir} sections=${facts.sections} arabic=${Math.round((facts.arabicShare as number) * 100)}% bdi=${facts.bdi}`);
        if (!findings.length) console.log('  ✓ nothing found');
        for (const f of findings) console.log(`  ${f.severity === 'critical' ? '✗' : '!'} [${f.severity}] ${f.text}`);
    }

    await browser.close();
    stub.close();
    console.log(`\n${totalCritical} critical, ${totalMajor} major across ${kinds.length} page kind(s).`);
    process.exit(totalCritical ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
