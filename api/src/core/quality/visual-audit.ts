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

    /**
     * A computed colour, in 0-255 channels.
     *
     * `color(srgb …)` has to be handled separately and NOT with the same
     * arithmetic: its channels are 0-1, so reading them as 0-255 turns white
     * into black and every contrast number after that is fiction. Chromium
     * resolves `color-mix()` to that form, and this kit uses color-mix
     * everywhere — ledes, badges, tinted borders — so this is the common case,
     * not an exotic one. Anything still unrecognised returns alpha 0, which
     * means "keep looking", never a guessed colour.
     */
    const parse = (c: string): [number, number, number, number] => {
        const srgb = c.match(/color\(\s*srgb\s+([^)]+)\)/i);
        if (srgb) {
            const p = srgb[1].replace('/', ' ').split(/\s+/).filter(Boolean).map(parseFloat);
            return [(p[0] || 0) * 255, (p[1] || 0) * 255, (p[2] || 0) * 255, p[3] === undefined ? 1 : p[3]];
        }
        const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0];
        const p = m[1].replace('/', ' ').split(/[,\s]+/).filter(Boolean).map(s => parseFloat(s));
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
    /**
     * What is actually painted behind this element — or null when the honest
     * answer is "a photograph", and no number would mean anything.
     *
     * Returning white in that case is what this function used to do, and it is
     * how the audit reported a CRITICAL contrast failure on every single
     * showcase page — stores and restaurants, the two most common kinds Joe
     * builds. The showcase hero puts its photograph in an absolutely positioned
     * child and its dark scrim in ::after; neither is an ancestor background, so
     * the walk sailed past both, reached the white body, and called white text
     * over a dark photograph 1.05:1. A false critical is not a harmless one — it
     * drives the repair loop, which sends a correct page back to the model to
     * have its contrast "fixed".
     *
     * A gradient IS measurable, conservatively: its darkest stop is the worst
     * case a reader can land on, so that is what is compared against.
     */
    const covers = (rect: DOMRect, w: string, h: string) => {
        const pw = parseFloat(w), ph = parseFloat(h);
        // Unparseable means "cannot tell" — treated as covering, because
        // guessing that it does NOT cover is what produced the false criticals.
        if (!isFinite(pw) || !isFinite(ph)) return true;
        return pw >= rect.width * 0.9 && ph >= rect.height * 0.9;
    };
    const effBg = (el: Element): number[] | null => {
        let n: Element | null = el;
        const layers: number[][] = [];
        while (n) {
            const st = getComputedStyle(n);
            const box = n.getBoundingClientRect();

            // A ::before/::after with a background is painted between this text
            // and anything the walk would find above it.
            for (const which of ['::before', '::after']) {
                const pe = getComputedStyle(n, which);
                if (!pe || pe.content === 'none') continue;
                const hasPaint = (pe.backgroundImage && pe.backgroundImage !== 'none') || parse(pe.backgroundColor)[3] > 0.1;
                if (hasPaint && covers(box, pe.width, pe.height)) return null;
            }
            // …and so is an absolutely positioned child that covers the box,
            // which is exactly how a full-bleed hero photograph is written.
            for (const child of Array.from(n.children)) {
                const cs = getComputedStyle(child);
                if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
                if (cs.visibility === 'hidden' || cs.display === 'none') continue;
                const cb = child.getBoundingClientRect();
                if (cb.width < box.width * 0.9 || cb.height < box.height * 0.9) continue;
                if (child.querySelector('img,picture,video') || (cs.backgroundImage && cs.backgroundImage !== 'none')) return null;
            }

            /**
             * A TRANSLUCENT LAYER IS NOT A SURFACE — it is paint ON one.
             *
             * The kit tints things constantly: the current nav link sits on
             * `color-mix(in srgb, var(--brand) 12%, transparent)`. Treating
             * that 12% wash as if it were the background means comparing the
             * text against a colour nothing on the page is actually painted
             * with. Measured end to end the moment color-mix started parsing:
             * every page of every site reported its own nav link at 1.6:1 and
             * lost 30 points for a link that is perfectly readable.
             *
             * Layers are collected on the way up and composited on the way
             * down, which is what the compositor itself does.
             */
            const bg = parse(st.backgroundColor);
            if (bg[3] >= 0.995) { layers.push(bg); break; }
            if (bg[3] > 0.004) layers.push(bg);

            // A gradient hides the real colour; sample its darkest declared stop.
            const bi = st.backgroundImage;
            if (bi && bi !== 'none') {
                if (/url\(/i.test(bi)) return null;                 // a photograph: unknowable
                const stops = [...bi.matchAll(/rgba?\([^)]+\)|color\(\s*srgb[^)]+\)/gi)].map(m => parse(m[0]));
                const opaque = stops.filter(c => c[3] >= 0.995);
                if (opaque.length) {
                    layers.push(opaque.sort((a, b) => lum(a[0], a[1], a[2]) - lum(b[0], b[1], b[2]))[0]);
                    break;
                }
                return null;                                         // a gradient we cannot read
            }
            n = n.parentElement;
        }
        // Bottom-up: the deepest layer is painted last, over everything below it.
        let out = [255, 255, 255];
        for (let i = layers.length - 1; i >= 0; i--) {
            const a = layers[i][3];
            out = [0, 1, 2].map(c => layers[i][c] * a + out[c] * (1 - a));
        }
        return [out[0], out[1], out[2], 1];
    };
    const visible = (el: HTMLElement) => {
        const r = el.getBoundingClientRect(), st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity) > 0.1;
    };

    // ---- overflow
    //
    // What matters is whether the visitor can DRAG THE PAGE SIDEWAYS, not what
    // scrollWidth reports. `overflow-x: clip` removes the scrolling and leaves
    // scrollWidth alone, so a mobile drawer parked off the edge — every page Joe
    // builds has one — was measured at 320px of overflow on a 390px phone and
    // cost the page 35 points for something no visitor could ever do. The
    // repair it triggered could not fix it either, because there was nothing
    // wrong. Ask the page to scroll and see whether it moves.
    const scrollable = (() => {
        const before = window.scrollX;
        window.scrollTo(de.scrollWidth, 0);
        const moved = Math.abs(window.scrollX - before);
        window.scrollTo(before, 0);
        return moved;
    })();
    const overflow = scrollable > 1 ? Math.max(0, de.scrollWidth - de.clientWidth) : 0;
    const wideElements: string[] = [];
    // ---- contrast
    const contrastFails: Array<{ text: string; ratio: number; need: number }> = [];
    // Text sitting on a photograph, counted rather than guessed at.
    let unmeasurable = 0;
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
        const bg = effBg(el);
        if (!bg) { unmeasurable++; continue; }   // on a photograph — say so, do not invent a number
        const r = ratio(fg, bg);
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

    // ---- RTL: an Arabic page laid out with left/right instead of start/end
    //
    // The user builds Arabic pages. A stylesheet written with margin-left,
    // padding-right, text-align:left or float:left looks correct while it is
    // being written in a left-to-right editor and comes out mirrored in the
    // browser — the icon on the wrong side of the button, the section indented
    // away from the text. The browser knows which it is; ask it.
    const htmlLang = (de.getAttribute('lang') || '').toLowerCase();
    const htmlDir = (de.getAttribute('dir') || getComputedStyle(de).direction || '').toLowerCase();
    const bodyText = (document.body.innerText || '');
    const arabicChars = (bodyText.match(/[؀-ۿ]/g) || []).length;
    const isArabicPage = arabicChars > Math.max(40, bodyText.replace(/\s/g, '').length * 0.25);
    const rtlOffenders: string[] = [];
    let physicalProps = 0;
    if (isArabicPage) {
        // Read the DECLARATIONS, not the computed values. `padding-inline-start:
        // 18px` computes to padding-right in Arabic and looks exactly like a
        // hardcoded `padding-right` from the outside — a computed-style check
        // flags correct logical CSS as a bug. The source text says which it is.
        const PHYSICAL = /(^|[;{\s])(margin|padding|border)-(left|right)\s*:|(^|[;{\s])float\s*:\s*(left|right)|(^|[;{\s])text-align\s*:\s*(left|right)|(^|[;{\s])(left|right)\s*:\s*[-0-9]/gi;
        for (const sheet of Array.from(document.styleSheets)) {
            let rules: any[] = [];
            try { rules = Array.from((sheet as CSSStyleSheet).cssRules || []); } catch { continue; }
            const walk = (list: any[]) => {
                for (const rule of list) {
                    // A plain style rule now ALSO exposes an (empty) cssRules list
                    // because of CSS nesting, so "has cssRules" is not "is a group".
                    // Testing truthiness there made every rule look like a wrapper
                    // and the whole scan silently counted nothing.
                    if (rule.cssRules && rule.cssRules.length) walk(Array.from(rule.cssRules));
                    if (!rule.style) continue;
                    // Own declarations only — a parent's cssText contains its
                    // children and would count them twice.
                    const hits = String(rule.style.cssText || '').match(PHYSICAL);
                    if (!hits) continue;
                    physicalProps += hits.length;
                    if (rtlOffenders.length < 6) {
                        rtlOffenders.push(`${String(rule.selectorText || '?').slice(0, 48)} { ${hits.map(h => h.trim()).join(' ')} }`);
                    }
                }
            };
            walk(rules);
        }
    }

    // ---- accessibility beyond contrast
    //
    // Contrast was checked above; these are the failures a screen reader hits.
    const headings = (Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[])
        .filter(visible).map(h => Number(h.tagName[1]));
    let headingJumps = 0;
    for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) headingJumps++;
    const h1Count = headings.filter(n => n === 1).length;

    let unlabelledFields = 0;
    for (const f of Array.from(document.querySelectorAll('input,textarea,select')) as HTMLElement[]) {
        const t = (f as HTMLInputElement).type;
        if (t === 'hidden' || t === 'submit' || t === 'button') continue;
        const id = f.getAttribute('id');
        const labelled = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
            f.closest('label') || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby');
        if (!labelled) unlabelledFields++;
    }

    let iconOnlyUnnamed = 0;
    for (const b of Array.from(document.querySelectorAll('button,a,[role=button]')) as HTMLElement[]) {
        if (!visible(b)) continue;
        const text = (b.innerText || '').trim();
        if (text.length > 0) continue;
        if (b.getAttribute('aria-label') || b.getAttribute('title')) continue;
        // An <img alt> or an <svg><title> also names it.
        if (b.querySelector('img[alt]:not([alt=""])') || b.querySelector('svg title')) continue;
        iconOnlyUnnamed++;
    }

    let imgNoAlt = 0;
    for (const img of Array.from(document.querySelectorAll('img')) as HTMLImageElement[]) {
        if (!img.hasAttribute('alt')) imgNoAlt++;
    }

    const landmarks = {
        header: !!document.querySelector('header,[role=banner]'),
        nav: !!document.querySelector('nav,[role=navigation]'),
        main: !!document.querySelector('main,[role=main]'),
        footer: !!document.querySelector('footer,[role=contentinfo]'),
    };
    const missingLandmarks = Object.entries(landmarks).filter(([, v]) => !v).map(([k]) => k);

    // Is there ANY visible focus indicator?
    //
    // Not from computed style: a browser draws its focus ring only while an
    // element IS focused, so every element on every page reports outline:none at
    // rest and the check would fail even the pages that are correct. The question
    // is whether the stylesheet KILLS the ring without putting one back, and that
    // is a question about the source.
    let outlineKilled = 0, focusRules = 0;
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: any[] = [];
        try { rules = Array.from((sheet as CSSStyleSheet).cssRules || []); } catch { continue; }
        const scan = (list: any[]) => {
            for (const rule of list) {
                if (rule.cssRules && rule.cssRules.length) scan(Array.from(rule.cssRules));
                if (!rule.style) continue;
                const sel = String(rule.selectorText || '');
                const decl = String(rule.style.cssText || '');
                if (/outline\s*:\s*(none|0)/i.test(decl)) outlineKilled++;
                if (/:focus/.test(sel) && /(outline|box-shadow|border)\s*:/i.test(decl) && !/outline\s*:\s*(none|0)/i.test(decl)) focusRules++;
            }
        };
        scan(rules);
    }
    const focusSuppressed = outlineKilled > 0 && focusRules === 0 ? outlineKilled : 0;

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
        overflow, wideElements, contrastFails, contrastUnmeasurable: unmeasurable, smallTargets, distorted,
        imgTotal, imgNoDims, textChecked: checked,
        density: sample(),
        scrollHeight: de.scrollHeight,
        // Weight, as the browser sees it. A page can be perfectly laid out and
        // still take fifteen seconds on the connection the visitor actually has.
        domNodes: document.querySelectorAll('*').length,
        // The largest image as DISPLAYED versus its intrinsic size: a 2400px
        // photograph in a 300px card is 8x the bytes for no visible benefit.
        oversizedImages: (Array.from(document.querySelectorAll('img')) as HTMLImageElement[])
            .filter(i => i.naturalWidth > 0)
            .map(i => ({
                alt: (i.alt || '').slice(0, 30),
                natural: i.naturalWidth,
                shown: Math.round(i.getBoundingClientRect().width * (window.devicePixelRatio || 1)),
            }))
            .filter(x => x.shown > 0 && x.natural > x.shown * 2)
            .slice(0, 6),
        sections: document.querySelectorAll('section').length,
        quirks: document.compatMode !== 'CSS1Compat',
        // RTL
        isArabicPage, htmlLang, htmlDir, rtlOffenders, physicalProps,
        // accessibility
        headingJumps, h1Count, unlabelledFields, iconOnlyUnnamed, imgNoAlt,
        missingLandmarks, focusSuppressed, outlineKilled, focusRules,
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
    /** What the page actually costs to load, measured on the desktop pass. */
    const transfer = { requests: 0, bytes: 0, imageBytes: 0, images: 0, scriptBytes: 0 };

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
                //
                // The message text alone is not enough: Chrome logs it as the bare
                // "Failed to load resource: the server responded with a status of
                // 404" with the URL only in the message's LOCATION. Filtering on the
                // text was letting the favicon fail every audited page by 30 points.
                const where = (() => { try { return String(m.location()?.url || ''); } catch { return ''; } })();
                if (/favicon\.ico/i.test(t) || /favicon\.ico/i.test(where)) return;
                consoleErrors.push(t.slice(0, 160));
            });
            page.on('pageerror', (e: any) => { if (consoleErrors.length < 5) consoleErrors.push(String(e?.message || e).slice(0, 160)); });

            // Real transferred weight, counted from responses rather than
            // estimated from the markup — an inline data: URI and a 900 KB JPEG
            // look identical in the HTML and are nothing alike on a phone.
            if (vp.label === 'desktop') {
                page.on('response', async (r: any) => {
                    try {
                        const h = r.headers() || {};
                        const type = String(h['content-type'] || '').split(';')[0];
                        const len = Number(h['content-length'] || 0);
                        const size = Number.isFinite(len) && len > 0
                            ? len
                            : (await r.body().then((b: Buffer) => b.length).catch(() => 0));
                        transfer.requests++;
                        transfer.bytes += size;
                        if (/^image\//.test(type)) { transfer.imageBytes += size; transfer.images++; }
                        if (/javascript/.test(type)) transfer.scriptBytes += size;
                    } catch { /* a response we cannot measure is not a failure */ }
                });
            }
            // A failed navigation used to be swallowed, and the audit then measured
            // the BROWSER'S OWN ERROR PAGE — which has two images with no alt and a
            // "Details" button — and reported a score for it as if it were the
            // user's page. Refusing to audit is honest; scoring an error page is not.
            let resp: any = null, navError = '';
            try { resp = await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 20000 }); }
            catch (e: any) { navError = String(e?.message || e).split('\n')[0].slice(0, 120); }
            if (navError || !resp || !resp.ok()) {
                try { await page.close(); } catch { }
                try { await browser.close(); } catch { }
                return {
                    ...empty,
                    skipped: `could not load ${fileUrl} — ${navError || (resp ? `HTTP ${resp.status()}` : 'no response')}`,
                };
            }
            await page.waitForTimeout(600);
            /**
             * Scroll through so lazy images and reveal animations settle.
             *
             * `behavior:'instant'` is not a detail. Every page Joe builds ships
             * `html{scroll-behavior:smooth}`, which turns this line into an
             * ANIMATION — on a tall page it is still travelling when the wait
             * expires, so the sections it never reached are measured while they
             * are still mid-reveal and reported as invisible content. Measured:
             * a six-section page left two sections below 100% opacity after a
             * 1200 ms wait. The audit must move the viewport, not animate it.
             */
            await page.evaluate(() => {
                window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior });
            }).catch(() => { });
            await page.waitForTimeout(900);
            await page.evaluate(() => {
                window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
            }).catch(() => { });
            await page.waitForTimeout(400);

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

    // ---- weight ------------------------------------------------------------
    //
    // A page can be laid out perfectly and still take fifteen seconds on the
    // connection the visitor actually has. These are budgets, not opinions: the
    // measured number is always quoted so the user can disagree with the
    // threshold rather than with the claim.
    const KB = 1024;
    const totalKb = Math.round(transfer.bytes / KB);
    const imgKb = Math.round(transfer.imageBytes / KB);
    if (transfer.bytes > 2_500_000) {
        findings.push({
            code: 'page_weight', severity: totalKb > 5000 ? 'major' : 'minor',
            ar: `الصفحة تزن ${totalKb} ك.ب عبر ${transfer.requests} طلبًا${imgKb ? ` (منها ${imgKb} ك.ب صور)` : ''} — بطيئة على اتصال متوسط`,
            en: `The page weighs ${totalKb} KB across ${transfer.requests} requests${imgKb ? ` (${imgKb} KB of it images)` : ''} — slow on an average connection`,
            hint: 'fewer or smaller photographs; the layout is not the problem',
        });
    }
    const oversized = metrics.desktop?.oversizedImages || [];
    if (oversized.length >= 2) {
        const worst = oversized.slice().sort((a: any, b: any) => (b.natural / b.shown) - (a.natural / a.shown))[0];
        findings.push({
            code: 'oversized_images', severity: 'minor',
            ar: `${oversized.length} صورة أكبر بكثير من مساحتها المعروضة — أسوأها «${worst.alt}» بعرض ${worst.natural}px داخل ${worst.shown}px`,
            en: `${oversized.length} image(s) far larger than the box they are shown in — worst is "${worst.alt}" at ${worst.natural}px inside ${worst.shown}px`,
            hint: 'request a smaller rendition for this slot; the extra pixels are never seen',
        });
    }
    if (metrics.desktop?.domNodes > 2500) {
        findings.push({
            code: 'dom_size', severity: 'minor',
            ar: `${metrics.desktop.domNodes} عنصر في الصفحة — يبطئ التخطيط على الأجهزة الضعيفة`,
            en: `${metrics.desktop.domNodes} DOM nodes — layout gets slow on weaker devices`,
            hint: 'the markup is repeating itself; look for duplicated cards',
        });
    }

    // ---- RTL ---------------------------------------------------------------
    // Judged once, on the desktop pass: direction does not change with width.
    const d = metrics.desktop;
    if (d?.isArabicPage) {
        if (d.htmlDir !== 'rtl') {
            findings.push({
                code: 'rtl_missing', severity: 'critical',
                ar: 'الصفحة عربية لكن الاتجاه ليس rtl — كل السطور والأعمدة معكوسة',
                en: 'The page is in Arabic but its direction is not rtl — every line and column is mirrored',
                hint: 'set <html lang="ar" dir="rtl">',
            });
        }
        if (!/^ar/.test(String(d.htmlLang || ''))) {
            findings.push({
                code: 'lang_missing', severity: 'minor',
                ar: 'الصفحة عربية بلا lang="ar" — قارئ الشاشة سينطقها بلغة أخرى',
                en: 'Arabic page without lang="ar" — a screen reader will pronounce it in the wrong language',
                hint: 'set lang="ar" on <html>',
            });
        }
        if (d.physicalProps >= 4) {
            findings.push({
                code: 'rtl_physical', severity: 'major',
                ar: `${d.physicalProps} عنصر يستخدم يمين/يسار فيزيائيًا بدل start/end — يظهر معكوسًا في العربية: ${(d.rtlOffenders || [])[0] || ''}`,
                en: `${d.physicalProps} element(s) use physical left/right instead of start/end, so they mirror wrongly in Arabic: ${(d.rtlOffenders || [])[0] || ''}`,
                hint: 'use margin-inline-start/end, padding-inline-*, text-align:start, and inset-inline instead of left/right',
            });
        }
    }

    // ---- accessibility beyond contrast -------------------------------------
    if (d) {
        if (d.h1Count === 0) {
            findings.push({
                code: 'no_h1', severity: 'major',
                ar: 'لا يوجد عنوان h1 في الصفحة — لا يعرف قارئ الشاشة عمّا تتحدث',
                en: 'The page has no h1 — nothing states what it is about',
                hint: 'the hero headline should be the single <h1>',
            });
        } else if (d.h1Count > 1) {
            findings.push({
                code: 'many_h1', severity: 'minor',
                ar: `${d.h1Count} عناوين h1 — يجب أن يكون واحدًا فقط`,
                en: `${d.h1Count} h1 headings — there should be exactly one`,
                hint: 'demote the extras to h2',
            });
        }
        if (d.headingJumps > 0) {
            findings.push({
                code: 'heading_order', severity: 'minor',
                ar: `${d.headingJumps} قفزة في ترتيب العناوين (h2 ثم h4 مثلًا)`,
                en: `${d.headingJumps} skipped heading level(s) (h2 straight to h4)`,
                hint: 'headings must descend one level at a time',
            });
        }
        if (d.unlabelledFields > 0) {
            findings.push({
                code: 'unlabelled_fields', severity: 'major',
                ar: `${d.unlabelledFields} حقل إدخال بلا تسمية — placeholder ليس تسمية`,
                en: `${d.unlabelledFields} form field(s) with no label — a placeholder is not a label`,
                hint: 'add <label for="id"> or aria-label to every input',
            });
        }
        if (d.iconOnlyUnnamed > 0) {
            findings.push({
                code: 'unnamed_icon_buttons', severity: 'major',
                ar: `${d.iconOnlyUnnamed} زر بأيقونة فقط بلا اسم — قارئ الشاشة يقول «زر» فحسب`,
                en: `${d.iconOnlyUnnamed} icon-only control(s) with no accessible name — a screen reader announces only "button"`,
                hint: 'add aria-label to every icon-only button and link',
            });
        }
        if (d.imgNoAlt > 0) {
            findings.push({
                code: 'img_no_alt', severity: 'major',
                ar: `${d.imgNoAlt} صورة بلا سمة alt`,
                en: `${d.imgNoAlt} image(s) with no alt attribute`,
                hint: 'describe the photo, or alt="" if it is purely decorative',
            });
        }
        if ((d.missingLandmarks || []).length >= 2) {
            findings.push({
                code: 'landmarks', severity: 'minor',
                ar: `معالم الصفحة ناقصة: ${d.missingLandmarks.join('، ')}`,
                en: `Missing page landmarks: ${d.missingLandmarks.join(', ')}`,
                hint: 'wrap the page in header/nav/main/footer',
            });
        }
        if (d.focusSuppressed > 0) {
            findings.push({
                code: 'focus_suppressed', severity: 'major',
                ar: 'لا يوجد مؤشر تركيز ظاهر — الصفحة غير قابلة للاستخدام بلوحة المفاتيح',
                en: 'No visible focus indicator anywhere — the page cannot be used with a keyboard',
                hint: 'never outline:none without a :focus-visible replacement',
            });
        }
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
    /**
     * Say how much of the page could NOT be measured.
     *
     * "0 contrast findings" over a page where half the text sits on a
     * photograph is a green that means nothing, and this audit's whole value is
     * that its numbers are real. The count travels with the result so the build
     * log can state it rather than imply a clean sweep.
     */
    const unmeasured = Object.values(metrics)
        .reduce((n: number, m: any) => n + (Number(m?.contrastUnmeasurable) || 0), 0);

    return {
        ran: true, score: Math.max(0, 100 - penalty), findings, screenshots,
        metrics: { ...metrics, transfer, contrastUnmeasurable: unmeasured },
    };
}

/** The findings, as a repair instruction the model can act on. */
export function visualRepairBrief(findings: VisualFinding[]): string {
    const actionable = findings.filter(f => f.severity !== 'minor' && f.hint);
    if (!actionable.length) return '';
    return `A browser rendered your page and measured these defects. Fix ONLY these in the CSS, change nothing else, and return the COMPLETE HTML file:
${actionable.map((f, i) => `${i + 1}. ${f.en} — ${f.hint}`).join('\n')}`;
}
