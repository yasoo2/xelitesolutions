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
/**
 * Joe's OWN visual and behaviour audits need a browser, and without this they
 * are skipped — which was silently true for every run of this script until a
 * probe printed the logs: "visual audit skipped: browser launch failed". The
 * harness was measuring the deterministic pipeline only, and reporting it as if
 * it had measured the audit-and-repair loop too.
 */
if (!process.env.BROWSER_EXECUTABLE_PATH && fs.existsSync('/opt/pw-browsers/chromium')) {
    process.env.BROWSER_EXECUTABLE_PATH = '/opt/pw-browsers/chromium';
}

// There is no websocket in a test runner; the broadcast warning is expected and
// drowns the findings. Exactly that line is dropped, nothing else.
const realWarn = console.warn.bind(console);
console.warn = (...a: any[]) => { if (typeof a[0] === 'string' && a[0].includes('liveWssRef is null')) return; realWarn(...a); };

/**
 * THE LIVE CODE STREAM IS MEASURED, not assumed.
 *
 * The Logs panel shows each file growing section by section — but only if the
 * server actually emits `file_stream` events with real content at the right
 * moments. Intercepting `broadcast` here catches the events the UI would see,
 * so a build that silently stopped streaming fails this harness instead of
 * shipping a dead panel.
 */
const fileStreamEvents: Array<{ file: string; chunk: string; done: boolean }> = [];
{
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ws = require('../../api/ws');
    const realBroadcast = ws.broadcast.bind(ws);
    ws.broadcast = (event: any) => {
        if (event?.type === 'file_stream' && event?.data) {
            fileStreamEvents.push({
                file: String(event.data.file || ''),
                chunk: String(event.data.chunk || ''),
                done: !!event.data.done,
            });
        }
        return realBroadcast(event);
    };
}

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

    // A section edit or a repair asks for a specific element back. The edit
    // must actually CHANGE something, or "the model returned no change" is
    // indistinguishable from a broken edit path.
    if (p.includes('you are editing one section') || p.includes('return the complete updated html')) {
        const id = (prompt.match(/id="([^"]+)"/) || [, 'repaired'])[1];
        return GOOD_SECTION_AR(id, 99).replace('</div></section>',
            '<a class="btn" href="#contact" data-edit-marker>احجز استشارة مجانية</a></div></section>');
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

/**
 * Serve the artifact directory the way the real server does.
 *
 * Joe audits its own page over HTTP at `http://localhost:<PORT>/artifacts/...`,
 * so without a server on that port every audit is skipped — which was silently
 * true for every run of this script until a probe printed the logs. With this,
 * the harness exercises the audit-and-repair loop, not only the deterministic
 * pipeline in front of it.
 */
function startArtifactServer(dir: string): Promise<{ port: number; close: () => void }> {
    return new Promise(resolve => {
        const types: Record<string, string> = {
            '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg',
            '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        };
        const server = http.createServer((req, res) => {
            const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/artifacts\/?/, '');
            const file = path.join(dir, rel);
            // Never serve outside the directory being served.
            if (!path.resolve(file).startsWith(path.resolve(dir))) { res.writeHead(403); res.end(); return; }
            fs.readFile(file, (err, buf) => {
                if (err) { res.writeHead(404); res.end('not found'); return; }
                res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
                res.end(buf);
            });
        });
        server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as any).port, close: () => server.close() }));
    });
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

    /* ---------- press things, the way a visitor does --------------------- */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(300);

    // A control that does nothing when clicked is the defect the behaviour
    // audit exists for, and the one a static check can never see.
    // Deduplicated: the selectors below overlap (.nav-toggle is a button, a.btn
    // matches twice), and counting one element twice reported it dead twice.
    // querySelectorAll already returns each element once however many parts of
    // the selector it matches, so one combined selector is the dedup.
    const controls = await page.$$('button:not([hidden]), a.btn, [data-add-to-cart], [data-filter]');
    let pressed = 0, dead = 0;
    const deadLabels: string[] = [];
    for (const el of controls.slice(0, 14)) {
        const label = (await el.evaluate((n: any) => (n.innerText || n.getAttribute('aria-label') || '').trim().slice(0, 24))) || '?';
        // Park the pointer away from the page first. Playwright hovers before it
        // clicks, and a hover OPENS the dropdown — so "before" was already the
        // opened state and the click that opened it read as doing nothing.
        await page.mouse.move(4, 700);
        await page.waitForTimeout(80);
        const before = await page.evaluate(() => ({
            html: document.body.innerHTML.length,
            open: document.querySelectorAll('[data-open],[aria-expanded="true"],[open]').length,
            url: location.hash,
            scroll: Math.round(window.scrollY),
        }));
        try { await el.click({ timeout: 800 }); } catch { continue; }
        pressed++;
        await page.waitForTimeout(220);
        const after = await page.evaluate(() => ({
            html: document.body.innerHTML.length,
            open: document.querySelectorAll('[data-open],[aria-expanded="true"],[open]').length,
            url: location.hash,
            scroll: Math.round(window.scrollY),
        }));
        // Scrolling counts: an in-page link that actually lands somewhere is
        // doing its job even though nothing else changed.
        if (before.html === after.html && before.open === after.open
            && before.url === after.url && Math.abs(before.scroll - after.scroll) < 8) {
            dead++; deadLabels.push(label);
        }
        // Put the page back so the next control starts from a clean state.
        await page.keyboard.press('Escape').catch(() => { });
        await page.waitForTimeout(120);
    }
    if (pressed && dead / pressed > 0.34) {
        findings.push({ severity: 'major', text: `${dead}/${pressed} controls did nothing when clicked: ${deadLabels.slice(0, 4).join(', ')}` });
    }

    // Every form must refuse to submit empty and say why, in the page's language.
    const forms = await page.$$('form');
    for (const f of forms.slice(0, 2)) {
        const submit = await f.$('[type=submit], button');
        if (!submit) continue;
        try { await submit.click({ timeout: 800 }); } catch { continue; }
        await page.waitForTimeout(260);
        const said = await page.evaluate(() =>
            !!document.querySelector('[data-form-status], .joe-field-error, [aria-invalid="true"]'));
        if (!said) findings.push({ severity: 'major', text: 'a form submitted empty without showing an error' });
    }

    await page.close();
    return { findings, facts: { ...facts, phone, pressed, dead } };
}

/* ---------- the run ---------------------------------------------------------- */

/** Requests that ask for a linked SITE rather than one page. */
const SITE_REQUESTS: Record<string, string> = {
    'site-store': 'ابني متجرًا إلكترونيًا كاملًا من عدة صفحات اسمه «نجمة الشرق» لبيع العطور، مع صفحة منتجات وصفحة عن المتجر وصفحة تواصل وسلة شراء',
    'site-landing': 'ابني موقعًا كاملًا متعدد الصفحات لشركة استشارات اسمها xelitesolutions مع صفحة من نحن وصفحة خدمات وصفحة اتصل بنا',
};

const REQUESTS: Record<string, string> = {
    landing: 'ابني صفحة ويب لشركه تكنلوجية اسمها xelitesolutions وهي شركة مختصة بالاستشارات البرمجية والخدماتية ومساعده الشركات الناشئة، ويجب ان يحتوي على زر تسجيل دخول وزر تسجيل خروج وزر من نحن وزر اتصل بنا وصور تجسد وظيفه الشركة',
    store: 'ابني متجرًا إلكترونيًا اسمه «نجمة الشرق» لبيع العطور الفاخرة مع سلة شراء وصفحة منتجات وأسعار بالريال',
    restaurant: 'ابني موقعًا لمطعم اسمه «بيت الطهاة» يعرض قائمة الطعام والأسعار وحجز طاولة',
    dashboard: 'ابني لوحة تحكم لمتابعة مبيعات شركة، فيها رسوم بيانية وأرقام ومؤشرات أداء',
    portfolio: 'ابني موقع أعمال لمصمّم جرافيك اسمه «سالم» يعرض مشاريعه وطريقة التواصل معه',
};

async function main() {
    const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
    const kinds = only.length ? only : [...Object.keys(REQUESTS), ...Object.keys(SITE_REQUESTS)];

    const artifactDirEnv = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
    fs.mkdirSync(artifactDirEnv, { recursive: true });
    const files = await startArtifactServer(artifactDirEnv);
    process.env.PORT = String(files.port);   // read when Joe builds its audit URL

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
        const request = REQUESTS[kind] || SITE_REQUESTS[kind];
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
        // A SITE is written to its own directory; the split single-page project
        // sits beside it. Measuring the wrong one reports a site as one page.
        const siteDir = path.join(artifactDir, `site-e2e-${kind}`);
        const projDir = path.join(artifactDir, `joe-e2e-${kind}`);
        const target = fs.existsSync(path.join(siteDir, 'index.html'))
            ? path.join(siteDir, 'index.html')
            : fs.existsSync(path.join(projDir, 'index.html'))
                ? path.join(projDir, 'index.html')
                : path.join(artifactDir, file);
        if (!fs.existsSync(target)) { console.log(`✗ no artifact on disk at ${target}`); totalCritical++; continue; }

        const { findings, facts } = await measure(browser, 'file://' + target);
        const crit = findings.filter(f => f.severity === 'critical').length;
        const maj = findings.filter(f => f.severity === 'major').length;
        totalCritical += crit; totalMajor += maj;

        // A site logs its audits per page ("audit about.html: visual 95/100, …"),
        // a single page logs them once. Matching only the single-page wording
        // reported a fully audited site as unaudited.
        const auditLog = (res.logs || []).filter((l: string) => /visual audit|behaviour audit|^audit \S+:/.test(l));
        const auditsRan = auditLog.some((l: string) => !/skipped/.test(l));
        if (!auditsRan) {
            console.log(`  ! [minor] Joe's own audits did not run: ${(auditLog[0] || 'no audit log line').slice(0, 90)}`);
        }
        console.log(`  built in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${fs.statSync(target).size} bytes · title "${facts.title}"`);
        for (const l of auditLog) console.log(`  · ${l.slice(0, 110)}`);
        // Joe's own findings, verbatim — the counts alone hide what is wrong.
        for (const line of String(res.output?.message || '').split('\n')) {
            if (/^\s*•/.test(line)) console.log(`    ${line.trim().slice(0, 120)}`);
        }
        console.log(`  lang=${facts.lang} dir=${facts.dir} sections=${facts.sections} arabic=${Math.round((facts.arabicShare as number) * 100)}% bdi=${facts.bdi}`);
        if (!findings.length) console.log('  ✓ nothing found');
        for (const f of findings) console.log(`  ${f.severity === 'critical' ? '✗' : '!'} [${f.severity}] ${f.text}`);

        /* ---------- a SITE is more than its entry page --------------------- */
        // Its promise is that the pages LINK to each other. A nav pointing at a
        // file that was never written is the defect this has to catch, and it
        // cannot be seen from one page.
        const dir = path.dirname(target);
        const siteFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
        if (siteFiles.length > 1) {
            console.log(`  site: ${siteFiles.length} pages — ${siteFiles.join(', ')}`);
            const broken: string[] = [];
            for (const f of siteFiles) {
                const html = fs.readFileSync(path.join(dir, f), 'utf-8');
                for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#][^"']*\.html)["']/gi)) {
                    if (!fs.existsSync(path.join(dir, m[1]))) broken.push(`${f} → ${m[1]}`);
                }
            }
            if (broken.length) {
                console.log(`  ! [major] ${broken.length} link(s) to a page that was never written: ${broken.slice(0, 3).join('; ')}`);
                totalMajor++;
            }
            // Every page must be as sound as the entry page.
            for (const f of siteFiles.filter(x => x !== path.basename(target)).slice(0, 4)) {
                const m = await measure(browser, 'file://' + path.join(dir, f));
                const c = m.findings.filter(x => x.severity === 'critical').length;
                const j = m.findings.filter(x => x.severity === 'major').length;
                totalCritical += c; totalMajor += j;
                if (!m.findings.length) console.log(`  ✓ ${f} clean`);
                for (const x of m.findings) console.log(`  ${x.severity === 'critical' ? '✗' : '!'} [${f}][${x.severity}] ${x.text}`);
            }
        }

        /* ---------- the EDIT path, on the page just built ------------------ */
        // Half of real use is "now change this". It shares a tool with the build
        // but almost none of its code, and nothing had ever measured it.
        const before = fs.readFileSync(target, 'utf-8');
        const edit = await tool.execute(
            { request: 'أضف زرًا في قسم التواصل مكتوب عليه «احجز استشارة مجانية»' },
            {
                sessionId: `e2e-${kind}`, userId: 'e2e',
                modelConfig: { provider: 'openai', model: 'stub', apiKey: 'sk-stub', baseUrl: stub.url },
            });
        if (!edit?.ok) {
            console.log(`  ✗ [critical] the edit failed: ${edit?.error}`);
            totalCritical++;
        } else {
            const after = fs.readFileSync(target, 'utf-8');
            const refused = /رفضتُ|Refused this edit|Refused the edit/.test(String(edit.output?.message || ''));
            if (after === before && !refused) {
                console.log('  ! [major] the edit reported success and changed nothing on disk');
                totalMajor++;
            } else if (refused) {
                // Keeping the page and saying so is the CORRECT outcome when the
                // model's reply would have deleted content.
                console.log('  · edit refused on purpose (the reply would have lost content) — page kept');
            }
            const m2 = await measure(browser, 'file://' + target);
            const c2 = m2.findings.filter(f => f.severity === 'critical').length;
            const j2 = m2.findings.filter(f => f.severity === 'major').length;
            totalCritical += c2; totalMajor += j2;
            const grew = after.length >= before.length * 0.8;
            if (!grew) { console.log(`  ! [major] the edit shrank the page ${before.length} → ${after.length} bytes`); totalMajor++; }
            console.log(`  edit: ${before.length} → ${after.length} bytes${m2.findings.length ? '' : ' · ✓ still clean'}`);
            for (const f of m2.findings) console.log(`  ${f.severity === 'critical' ? '✗' : '!'} [after edit][${f.severity}] ${f.text}`);
        }
    }

    await browser.close();
    stub.close();
    files.close();

    /**
     * Did the builds STREAM? Every page above was produced section by section,
     * so the Logs panel should have received: chunks that are real HTML, and a
     * closing `done` per written file whose content is the complete document.
     */
    {
        const chunks = fileStreamEvents.filter(e => !e.done);
        const dones = fileStreamEvents.filter(e => e.done);
        const realHtml = chunks.filter(e => /<(section|header|footer|div|main)\b/i.test(e.chunk));
        const completeDocs = dones.filter(e => /<!DOCTYPE html/i.test(e.chunk) || /<html/i.test(e.chunk));
        const files = new Set(fileStreamEvents.map(e => e.file));
        console.log(`\nlive stream: ${chunks.length} section chunk(s), ${dones.length} file completion(s) across ${files.size} file(s)`);
        if (!chunks.length) { console.log('  ✗ [critical] no live section chunks were broadcast — the Logs panel would stay empty'); totalCritical++; }
        else if (realHtml.length < chunks.length * 0.9) { console.log(`  ! [major] only ${realHtml.length}/${chunks.length} chunks contain real markup`); totalMajor++; }
        if (!dones.length) { console.log('  ✗ [critical] no file was announced as written — the panel never closes a file'); totalCritical++; }
        else if (!completeDocs.length) { console.log('  ! [major] no completion event carried a complete document'); totalMajor++; }
    }

    console.log(`\n${totalCritical} critical, ${totalMajor} major across ${kinds.length} page kind(s).`);
    process.exit(totalCritical ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
