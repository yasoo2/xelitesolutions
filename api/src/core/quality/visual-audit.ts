/**
 * Joe looks at what he built.
 *
 * Everything upstream reasons about HTML as text. But the defects the user
 * actually saw — a page that scrolled 2456px sideways, a phone screen that
 * rendered empty, text at 2.79:1 on a blue band, a portrait stretched across a
 * card — only exist once a browser has laid the page out. They were found by
 * opening the file in Chromium and measuring it, and there is no reason Joe
 * cannot do exactly that himself.
 *
 * This runs the real browser at two viewport widths and returns measurements,
 * not opinions: horizontal overflow, elements wider than the viewport, WCAG
 * contrast on every visible text node, tap-target sizes, image distortion,
 * whitespace balance and console errors. Deterministic, so the same page always
 * scores the same, and cheap enough to run once per build — one browser launch,
 * two page loads.
 */

export interface VisualFinding {
    code: string;
    severity: 'critical' | 'major' | 'minor';
    ar: string;
    en: string;
    /** A CSS-ish hint at what to change, handed to the repair pass. */
    hint?: string;
}

export interface VisualAudit {
    ran: boolean;
    skipped?: string;
    score: number;                 // 0-100
    findings: VisualFinding[];
    screenshots: string[];         // absolute paths, desktop then mobile
    metrics: Record<string, any>;
}

const VIEWPORTS: Array<{ label: 'desktop' | 'mobile'; width: number; height: number }> = [
    { label: 'desktop', width: 1440, height: 950 },
    { label: 'mobile', width: 390, height: 844 },
];

/** Runs inside the page. Returns raw numbers only — judgement happens outside. */
function collector() {
    const de = document.documentElement;
    const vw = window.innerWidth;

    const parse = (c: string): [number, number, number, number] => {
        const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0];
        const p = m[1].split(',').map(s => parseFloat(s));
        return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] === undefined ? 1 : p[3]];
    };
    const lum = (r: number, g: number, b: number) => {
        const a = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    };
    const ratio = (f: number[], b: number[]) => {
        const L1 = lum(f[0], f[1], f[2]), L2 = lum(b[0], b[1], b[2]);
        return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    };
    const effBg = (el: Element): number[] => {
        let n: Element | null = el;
        while (n) {
            const st = getComputedStyle(n);
            const bg = parse(st.backgroundColor);
            if (bg[3] > 0.1) return bg;
            // A gradient hides the real colour; sample its darkest declared stop.
            const bi = st.backgroundImage;
            if (bi && bi !== 'none' && bi.includes('rgb')) {
                const stops = [...bi.matchAll(/rgba?\([^)]+\)/g)].map(m => parse(m[0]));
                if (stops.length) return stops.sort((a, b) => lum(a[0], a[1], a[2]) - lum(b[0], b[1], b[2]))[0];
            }
            n = n.parentElement;
        }
        return [255, 255, 255, 1];
    };
    const visible = (el: HTMLElement) => {
        const r = el.getBoundingClientRect(), st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity) > 0.1;
    };

    // ---- overflow
    const overflow = Math.max(0, de.scrollWidth - de.clientWidth);
    const wideElements: string[] = [];
    // ---- contrast
    const contrastFails: Array<{ text: string; ratio: number; need: number }> = [];
    // ---- tap targets
    const smallTargets: string[] = [];
    // ---- image distortion
    const distorted: Array<{ alt: string; box: string; natural: string }> = [];
    let imgTotal = 0, imgNoDims = 0;

    const all = Array.from(document.querySelectorAll('*')) as HTMLElement[];
    for (const el of all) {
        const b = el.getBoundingClientRect();
        if (b.width > vw + 4 && wideElements.length < 8) {
            wideElements.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} = ${Math.round(b.width)}px`);
        }
    }

    const textEls = Array.from(document.querySelectorAll('p,span,a,li,h1,h2,h3,h4,h5,button,label,td,th,figcaption,strong,em,div')) as HTMLElement[];
    let checked = 0;
    const seen = new Set<string>();
    for (const el of textEls) {
        const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim().length > 1);
        if (!own || !visible(el)) continue;
        const txt = (el.textContent || '').trim();
        if (txt.length < 2) continue;
        checked++;
        const st = getComputedStyle(el);
        const fg = parse(st.color);
        if (fg[3] === 0) continue;
        const r = ratio(fg, effBg(el));
        const size = parseFloat(st.fontSize) || 16;
        const bold = (parseInt(st.fontWeight) || 400) >= 700;
        const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
        if (r < need) {
            const key = txt.slice(0, 24);
            if (!seen.has(key) && contrastFails.length < 12) { seen.add(key); contrastFails.push({ text: txt.slice(0, 40), ratio: Math.round(r * 100) / 100, need }); }
        }
        if (checked > 500) break;
    }

    for (const el of Array.from(document.querySelectorAll('a,button,[role=button],input[type=submit]')) as HTMLElement[]) {
        if (!visible(el)) continue;
        const b = el.getBoundingClientRect();
        // Inline links inside a paragraph are exempt — only standalone controls.
        const inline = el.tagName === 'A' && el.parentElement && /^(P|LI|SPAN|TD)$/.test(el.parentElement.tagName);
        if (!inline && (b.height < 32 || b.width < 32) && smallTargets.length < 8) {
            smallTargets.push(`${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24)} = ${Math.round(b.width)}x${Math.round(b.height)}`);
        }
    }

    for (const img of Array.from(document.querySelectorAll('img')) as HTMLImageElement[]) {
        imgTotal++;
        if (!img.hasAttribute('width') && !getComputedStyle(img).aspectRatio.includes('/')) imgNoDims++;
        const b = img.getBoundingClientRect();
        if (!b.width || !b.height || !img.naturalWidth || !img.naturalHeight) continue;
        if (getComputedStyle(img).objectFit === 'cover') continue;   // cropping is intended
        const boxR = b.width / b.height, natR = img.naturalWidth / img.naturalHeight;
        const skew = Math.abs(Math.log(boxR / natR));
        if (skew > 0.2 && distorted.length < 6) {
            distorted.push({ alt: (img.alt || '(بلا وصف)').slice(0, 30), box: `${Math.round(b.width)}x${Math.round(b.height)}`, natural: `${img.naturalWidth}x${img.naturalHeight}` });
        }
    }

    // Whitespace balance: how much of the first screen is empty background.
    const sample = () => {
        let filled = 0, cells = 0;
        for (let x = 0.08; x < 1; x += 0.12) {
            for (let y = 0.08; y < 1; y += 0.12) {
                cells++;
                const el = document.elementFromPoint(x * vw, y * window.innerHeight);
                if (el && el !== document.body && el !== de) filled++;
            }
        }
        return cells ? filled / cells : 0;
    };

    return {
        overflow, wideElements, contrastFails, smallTargets, distorted,
        imgTotal, imgNoDims, textChecked: checked,
        density: sample(),
        scrollHeight: de.scrollHeight,
        sections: document.querySelectorAll('section').length,
        quirks: document.compatMode !== 'CSS1Compat',
    };
}

/**
 * Open the built page and measure it. Never throws: a missing browser or a slow
 * machine returns `ran: false` with the reason, and the build carries on.
 */
export async function auditVisually(fileUrl: string, opts?: { screenshotDir?: string; name?: string }): Promise<VisualAudit> {
    const empty: VisualAudit = { ran: false, score: 0, findings: [], screenshots: [], metrics: {} };
    if (String(process.env.JOE_VISUAL_AUDIT || '1') === '0') {
        return { ...empty, skipped: 'disabled (JOE_VISUAL_AUDIT=0)' };
    }
    let chromium: any;
    try { ({ chromium } = require('playwright')); } catch (e: any) {
        return { ...empty, skipped: `playwright unavailable: ${e?.message || e}` };
    }

    let browser: any;
    try {
        browser = await chromium.launch({
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}),
        });
    } catch (e: any) {
        return { ...empty, skipped: `browser launch failed: ${e?.message || e}` };
    }

    const findings: VisualFinding[] = [];
    const screenshots: string[] = [];
    const metrics: Record<string, any> = {};
    const consoleErrors: string[] = [];

    try {
        for (const vp of VIEWPORTS) {
            const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
            // collector() is serialised into the page; a bundler that keeps function
            // names wraps it in a `__name(...)` helper the browser has never heard
            // of. The identity shim keeps the audit working whatever compiled it.
            await page.addInitScript('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
            page.on('console', (m: any) => {
                if (m.type() !== 'error' || consoleErrors.length >= 5) return;
                const t = String(m.text());
                // A browser asks for /favicon.ico on every page and logs a 404 when
                // there is none. Reporting that as "JavaScript errors" would fail
                // every single page for something that is not a defect.
                if (/favicon\.ico/i.test(t)) return;
                consoleErrors.push(t.slice(0, 160));
            });
            page.on('pageerror', (e: any) => { if (consoleErrors.length < 5) consoleErrors.push(String(e?.message || e).slice(0, 160)); });
            await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => { });
            await page.waitForTimeout(600);
            // Scroll through so lazy images and reveal animations settle.
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => { });
            await page.waitForTimeout(500);
            await page.evaluate(() => window.scrollTo(0, 0)).catch(() => { });
            await page.waitForTimeout(300);

            const m = await page.evaluate(collector);
            metrics[vp.label] = m;

            if (opts?.screenshotDir) {
                const p = `${opts.screenshotDir}/${opts.name || 'page'}-${vp.label}.png`;
                await page.screenshot({ path: p, fullPage: false }).catch(() => { });
                screenshots.push(p);
            }
            await page.close();
        }
    } catch (e: any) {
        try { await browser.close(); } catch { }
        return { ...empty, skipped: `audit failed: ${e?.message || e}` };
    }
    try { await browser.close(); } catch { }

    // ---- judgement, on the numbers -----------------------------------------
    for (const vp of VIEWPORTS) {
        const m = metrics[vp.label];
        if (!m) continue;
        const where = vp.label === 'mobile' ? 'على الجوال' : 'على سطح المكتب';
        const whereEn = vp.label;

        if (m.quirks) findings.push({ code: 'quirks', severity: 'critical', ar: 'الصفحة تُعرض في وضع التوافق القديم (لا DOCTYPE)', en: 'Page renders in quirks mode (no DOCTYPE)', hint: 'add <!DOCTYPE html>' });
        if (m.overflow > 4) {
            findings.push({
                code: 'overflow', severity: m.overflow > 200 ? 'critical' : 'major',
                ar: `تجاوز أفقي ${m.overflow}px ${where}${m.wideElements.length ? ` — أعرض عنصر: ${m.wideElements[0]}` : ''}`,
                en: `Horizontal overflow of ${m.overflow}px on ${whereEn}${m.wideElements.length ? ` — widest: ${m.wideElements[0]}` : ''}`,
                hint: 'constrain the listed element to 100% width',
            });
        }
        if (m.contrastFails?.length) {
            const worst = m.contrastFails.sort((a: any, b: any) => a.ratio - b.ratio)[0];
            findings.push({
                code: 'contrast', severity: worst.ratio < 3 ? 'critical' : 'major',
                ar: `${m.contrastFails.length} نص بتباين ضعيف ${where} — أسوأها ${worst.ratio}:1 (المطلوب ${worst.need}) في «${worst.text}»`,
                en: `${m.contrastFails.length} low-contrast text node(s) on ${whereEn} — worst ${worst.ratio}:1 (needs ${worst.need}) at "${worst.text}"`,
                hint: 'use var(--on-brand) on branded surfaces, var(--text) on light ones',
            });
        }
        if (vp.label === 'mobile' && m.smallTargets?.length) {
            findings.push({
                code: 'tap_targets', severity: 'minor',
                ar: `${m.smallTargets.length} عنصر قابل للنقر أصغر من 32px على الجوال (${m.smallTargets[0]})`,
                en: `${m.smallTargets.length} tap target(s) under 32px on mobile (${m.smallTargets[0]})`,
                hint: 'give controls at least 44px of height on mobile',
            });
        }
        if (m.distorted?.length) {
            const d = m.distorted[0];
            findings.push({
                code: 'distorted_image', severity: 'major',
                ar: `${m.distorted.length} صورة مشوّهة النسب ${where} — «${d.alt}» في صندوق ${d.box} وأصلها ${d.natural}`,
                en: `${m.distorted.length} image(s) stretched out of ratio on ${whereEn} — "${d.alt}" in a ${d.box} box, natural ${d.natural}`,
                hint: 'add object-fit:cover and an aspect-ratio to the image',
            });
        }
        if (vp.label === 'mobile' && m.density < 0.25 && m.scrollHeight > 400) {
            findings.push({
                code: 'empty_screen', severity: 'critical',
                ar: 'الشاشة الأولى على الجوال شبه فارغة — المحتوى خارج إطار العرض',
                en: 'The first mobile screen is nearly empty — content sits outside the viewport',
                hint: 'the layout is not collapsing to one column',
            });
        }
    }
    if (metrics.desktop?.imgNoDims > 0) {
        findings.push({
            code: 'no_dimensions', severity: 'minor',
            ar: `${metrics.desktop.imgNoDims} صورة بلا أبعاد محجوزة — الصفحة تقفز أثناء التحميل`,
            en: `${metrics.desktop.imgNoDims} image(s) without reserved dimensions — the page shifts while loading`,
            hint: 'set width/height or aspect-ratio on every img',
        });
    }
    if (consoleErrors.length) {
        findings.push({ code: 'js_errors', severity: 'major', ar: `أخطاء JavaScript: ${consoleErrors[0]}`, en: `JavaScript errors: ${consoleErrors[0]}` });
    }

    // The same defect measured at two viewport widths is one defect. Keep the
    // worst wording per code so the user is not told twice about quirks mode.
    const byCode = new Map<string, VisualFinding>();
    const rank = { critical: 3, major: 2, minor: 1 } as const;
    for (const f of findings) {
        const prev = byCode.get(f.code);
        if (!prev || rank[f.severity] > rank[prev.severity]) byCode.set(f.code, f);
    }
    const deduped = [...byCode.values()].sort((a, b) => rank[b.severity] - rank[a.severity]);
    findings.length = 0;
    findings.push(...deduped);

    const penalty = findings.reduce((n, f) => n + (f.severity === 'critical' ? 30 : f.severity === 'major' ? 14 : 5), 0);
    return { ran: true, score: Math.max(0, 100 - penalty), findings, screenshots, metrics };
}

/** The findings, as a repair instruction the model can act on. */
export function visualRepairBrief(findings: VisualFinding[]): string {
    const actionable = findings.filter(f => f.severity !== 'minor' && f.hint);
    if (!actionable.length) return '';
    return `A browser rendered your page and measured these defects. Fix ONLY these in the CSS, change nothing else, and return the COMPLETE HTML file:
${actionable.map((f, i) => `${i + 1}. ${f.en} — ${f.hint}`).join('\n')}`;
}
