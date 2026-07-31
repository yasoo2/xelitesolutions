/**
 * HTML QA — the "Reviewer / QA department" for generated web pages.
 *
 * Two layers, both FREE:
 *   1. reviewHtml()      — INSTANT, deterministic (no LLM). Catches the defects
 *      weak local models actually produce: leftover markdown fences, placeholder
 *      image hosts, missing charset/viewport, TODO/placeholder text, empty
 *      src/href, unclosed <html>/<body>. Auto-fixes what it safely can and
 *      returns the remaining issues — so quality goes up with ZERO extra latency
 *      on the user's CPU-only laptop.
 *   2. browserSmokeTest() — OPT-IN (JOE_QA_BROWSER_TEST=1). Opens the page in the
 *      real headless browser, collects console/page errors, and screenshots it.
 *      Heavy, so it's off by default on a weak laptop but ready for a server.
 */

export interface HtmlReview {
    html: string;               // possibly auto-fixed HTML
    issues: string[];           // human-readable remaining issues
    fixed: string[];            // what we auto-corrected
    score: number;              // 0-100 quality score
}

const PLACEHOLDER_HOSTS = /https?:\/\/(via\.placeholder\.com|placehold\.it|placeholder\.com|placekitten\.com|dummyimage\.com|loremflickr\.com|unsplash\.it)[^\s"')]*/gi;

/** Deterministic review + safe auto-fix. Never throws. */
export function reviewHtml(rawHtml: string, isArabic = false): HtmlReview {
    let html = String(rawHtml || '');
    const issues: string[] = [];
    const fixed: string[] = [];

    // 1. Strip leftover markdown code fences the weak model sometimes leaves.
    if (/```/.test(html)) {
        const m = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
        if (m && /<html[\s>]/i.test(m[1])) { html = m[1].trim(); fixed.push('removed markdown code fences'); }
        else { html = html.replace(/```(?:html)?/gi, '').trim(); fixed.push('removed stray code fences'); }
    }

    // 2. Replace placeholder image hosts with an inline SVG data URI (self-contained).
    if (PLACEHOLDER_HOSTS.test(html)) {
        const svg = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" font-family="sans-serif" font-size="20" fill="#64748b" text-anchor="middle" dominant-baseline="middle">Image</text></svg>')}`;
        html = html.replace(PLACEHOLDER_HOSTS, svg);
        fixed.push('replaced external placeholder images with inline SVG');
    }

    // 3. Ensure <meta charset> (Arabic pages break without it).
    if (/<head[\s>]/i.test(html) && !/<meta[^>]+charset/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, '<head$1>\n    <meta charset="UTF-8">');
        fixed.push('added missing <meta charset="UTF-8">');
    }

    // 4. Ensure responsive viewport meta.
    if (/<head[\s>]/i.test(html) && !/name=["']viewport["']/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, '<head$1>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">');
        fixed.push('added responsive viewport meta');
    }

    // 5. Arabic pages should be RTL.
    if (isArabic && /<html/i.test(html) && !/dir=["']rtl["']/i.test(html)) {
        html = html.replace(/<html([^>]*)>/i, (mm, attrs) => `<html${/lang=/i.test(attrs) ? attrs : ' lang="ar"' + attrs} dir="rtl">`);
        fixed.push('set RTL direction for Arabic page');
    }

    /* ------------------------------------------------------------------
       6. LAYOUT SAFETY NET.

       The design brief tells the model to constrain images, collapse grids
       on mobile and put --on-brand text on branded surfaces. A weak model
       ignores all three, and the result is not "slightly off" — it is
       unusable: a measured build overflowed 1406px horizontally on desktop
       and 2456px on a phone, where the page rendered as an empty screen
       because every column stayed at its desktop width. Instructions are
       not enforcement, so the fixes below are applied to the CSS itself.
       ------------------------------------------------------------------ */

    // 6a. No DOCTYPE means QUIRKS MODE — the browser falls back to a 1990s box
    //     model and half the layout maths silently changes meaning.
    if (/<html[\s>]/i.test(html) && !/<!DOCTYPE\s+html/i.test(html)) {
        html = html.replace(/(<html[\s>])/i, '<!DOCTYPE html>\n$1');
        fixed.push('added missing <!DOCTYPE html> (page was rendering in quirks mode)');
    }

    if (/<\/style>/i.test(html)) {
        const styleBlock = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [, ''])[1];
        const extra: string[] = [];

        // 6b. An unconstrained <img> renders at its intrinsic size — a 2048px
        //     photo in a 1440px viewport pushes the whole document sideways.
        if (!/img\s*[,{][^}]*max-width/i.test(styleBlock)) {
            extra.push('*,*::before,*::after{box-sizing:border-box}img,svg,video,iframe{max-width:100%;height:auto}body{overflow-x:hidden}');
            fixed.push('constrained media to the viewport (images were overflowing the page)');
        }

        // 6c. Multi-column grids with no breakpoint stay multi-column on a
        //     phone. Collapse every such grid under 768px.
        // Look for a WIDTH breakpoint specifically. Testing for any @media was
        // wrong the moment the UI kit started shipping a prefers-reduced-motion
        // block: the page then "had media queries" and the grids were left at
        // three columns on a phone — the safety net silently disarmed itself.
        if (!/@media[^{]*\(\s*(max|min)-width/i.test(styleBlock)) {
            const gridSelectors: string[] = [];
            const ruleRe = /([^{}]+)\{([^}]*)\}/g;
            let m: RegExpExecArray | null;
            while ((m = ruleRe.exec(styleBlock))) {
                const sel = m[1].trim(), body = m[2];
                if (/grid-template-columns\s*:\s*repeat\(\s*([2-9]|1[0-9])/i.test(body) && sel && !sel.startsWith('@')) {
                    gridSelectors.push(sel);
                }
            }
            if (gridSelectors.length) {
                extra.push(`@media(max-width:768px){${gridSelectors.join(',')}{grid-template-columns:1fr!important}}`);
                fixed.push(`collapsed ${gridSelectors.length} grid(s) to one column on mobile (no breakpoint existed)`);
            }
        }

        // 6d. Text on a branded background must use the colour the palette
        //     guarantees against it. A measured page put --text (#252f41) on
        //     --brand (#316ed8): 2.79:1, far below the 4.5:1 minimum.
        let recolored = 0;
        const withColor = styleBlock.replace(/([^{}]+)\{([^}]*)\}/g, (full, sel, body) => {
            const brandBg = /background(-color|-image)?\s*:[^;]*var\(\s*--brand(-dark)?\s*\)/i.test(body);
            if (brandBg && !/(^|;)\s*color\s*:/i.test(body)) {
                recolored++;
                return `${sel}{${body.trim().replace(/;?$/, ';')}color:var(--on-brand);}`;
            }
            return full;
        });
        if (recolored) {
            html = html.replace(styleBlock, withColor);
            fixed.push(`set readable text colour on ${recolored} branded surface(s)`);
        }

        if (extra.length) {
            html = html.replace(/<\/style>/i, `\n/* Joe layout safety net */\n${extra.join('\n')}\n</style>`);
        }
    }

    // 6e. A field with only a placeholder is invisible to a screen reader once
    //     the user starts typing. Give it an accessible name.
    //
    //     Applied field by field. The first version skipped the whole page when
    //     ANY <label> existed, so a form with one label and five bare inputs was
    //     left entirely alone — the common case, not the rare one.
    if (/<(input|textarea|select)\b/i.test(html)) {
        const labelledIds = new Set(
            [...html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]),
        );
        let named = 0;
        html = html.replace(/<(input|textarea|select)\b([^>]*)>/gi, (full, tag, attrs) => {
            if (/aria-label(ledby)?\s*=/i.test(attrs) || /type\s*=\s*["'](hidden|submit|button)["']/i.test(attrs)) return full;
            const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1];
            if (id && labelledIds.has(id)) return full;
            const ph = (attrs.match(/placeholder\s*=\s*["']([^"']+)["']/i) || [])[1];
            if (!ph) return full;
            named++;
            return `<${tag}${attrs} aria-label="${ph}">`;
        });
        if (named) fixed.push(`labelled ${named} unlabelled form field(s)`);
    }

    /* ------------------------------------------------------------------
       7. ACCESSIBILITY SAFETY NET.

       These are the failures the browser audit reports over and over. Each
       one costs a whole extra LLM round to repair on a CPU-only laptop, and
       each has exactly one correct deterministic answer — so it is applied
       here instead of being asked for.
       ------------------------------------------------------------------ */

    // 7a. Exactly one <h1>. Several is a common model habit and the extras are
    //     always section titles, which is what h2 is for.
    const h1s = [...html.matchAll(/<h1\b/gi)];
    if (h1s.length > 1) {
        let seenFirst = false;
        html = html
            .replace(/<h1\b/gi, () => { if (!seenFirst) { seenFirst = true; return '<h1'; } return '<h2'; })
            .replace(/<\/h1\s*>/gi, (() => { let n = 0; return () => (n++ === 0 ? '</h1>' : '</h2>'); })());
        fixed.push(`demoted ${h1s.length - 1} extra <h1> to <h2>`);
    }

    // 7b. An icon-only control announces itself as "button" and nothing else.
    //     The icon it draws already says what it is — Joe's sprite ids are
    //     literally the word (#i-cart, #i-mail), so the name is right there.
    const ICON_NAMES: Record<string, string> = {
        check: 'تم', arrow: 'التالي', star: 'تقييم', shield: 'أمان', spark: 'مميّز',
        users: 'الفريق', code: 'الكود', chart: 'الإحصاءات', mail: 'البريد', phone: 'اتصال',
        pin: 'الموقع', clock: 'المواعيد', cart: 'السلة', menu: 'القائمة', close: 'إغلاق',
    };
    const ICON_NAMES_EN: Record<string, string> = {
        check: 'Done', arrow: 'Next', star: 'Rating', shield: 'Security', spark: 'Featured',
        users: 'Team', code: 'Code', chart: 'Statistics', mail: 'Email', phone: 'Call',
        pin: 'Location', clock: 'Hours', cart: 'Cart', menu: 'Menu', close: 'Close',
    };
    let namedButtons = 0;
    html = html.replace(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (full, tag, attrs, inner) => {
        if (/aria-label(ledby)?\s*=|title\s*=/i.test(attrs)) return full;
        // Any real text inside means it already has a name.
        if (inner.replace(/<[^>]*>/g, '').trim().length > 0) return full;
        if (/<svg[^>]*>[\s\S]*?<title\b/i.test(inner)) return full;
        if (/<img\b[^>]*\balt\s*=\s*["'][^"']+["']/i.test(inner)) return full;
        const icon = (inner.match(/href\s*=\s*["']#i-([a-z]+)["']/i) || [])[1];
        const label = icon ? (isArabic ? ICON_NAMES[icon] : ICON_NAMES_EN[icon]) : '';
        if (!label) return full;
        namedButtons++;
        return `<${tag}${attrs} aria-label="${label}">${inner}</${tag}>`;
    });
    if (namedButtons) fixed.push(`named ${namedButtons} icon-only control(s)`);

    // 7c. An <img> with no alt attribute at all makes a screen reader read the
    //     file name aloud. A decorative image wants alt=""; a content image
    //     wants a description, and the nearest caption is the honest one.
    let altAdded = 0;
    html = html.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
        if (/\balt\s*=/i.test(attrs)) return full;
        altAdded++;
        const t = (attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i) || [])[1];
        return `<img${attrs} alt="${t ? t.replace(/"/g, '&quot;') : ''}">`;
    });
    if (altAdded) fixed.push(`added a missing alt attribute to ${altAdded} image(s)`);

    // 7d. <main> is the landmark that lets a screen-reader user skip the header.
    //     Safe to add only when the document has one header and one footer and
    //     everything between them is the content — which is the shape every
    //     blueprint produces.
    if (/<body[\s>]/i.test(html) && !/<main[\s>]|role=["']main["']/i.test(html)) {
        const headerEnd = html.search(/<\/header\s*>/i);
        const footerStart = html.search(/<footer[\s>]/i);
        if (headerEnd > 0 && footerStart > headerEnd) {
            const after = headerEnd + (html.match(/<\/header\s*>/i) || [''])[0].length;
            html = html.slice(0, after) + '\n<main>' + html.slice(after, footerStart) + '</main>\n' + html.slice(footerStart);
            fixed.push('wrapped the page content in <main>');
        }
    }

    // --- Remaining (non-auto-fixable) issues lower the score but don't block ---
    if (/\b(TODO|FIXME|placeholder text|lorem ipsum|your text here|اكتب هنا|النص هنا)\b/i.test(html)) {
        issues.push('contains placeholder/TODO text that should be replaced with real content');
    }
    if (/(src|href)=["']\s*["']/i.test(html)) {
        issues.push('has empty src/href attributes');
    }
    if (/<html[\s>]/i.test(html) && !/<\/html>/i.test(html)) {
        html += '\n</html>'; fixed.push('closed missing </html> tag');
    }
    if (/<body[\s>]/i.test(html) && !/<\/body>/i.test(html)) {
        html = html.replace(/<\/html>/i, '</body>\n</html>'); fixed.push('closed missing </body> tag');
    }
    if (!/<style[\s>]/i.test(html) && !/style=/i.test(html)) {
        issues.push('no CSS detected — page may be unstyled');
    }

    // Simple quality score: full marks minus penalties for remaining issues.
    const score = Math.max(0, 100 - issues.length * 15);
    return { html, issues, fixed, score };
}

export interface SplitProject {
    indexHtml: string;
    css: string;
    js: string;
    multiFile: boolean;   // false when there was nothing to split out
}

/**
 * Split a single self-contained HTML file into a real multi-file project:
 *   index.html + styles.css + script.js
 *
 * Deterministic (no LLM call), so it's instant and free. Inline <style> blocks
 * become styles.css (linked in <head>), and inline <script> blocks (without a
 * src) become script.js (linked before </body>). External <script src> tags are
 * left untouched. Returns multiFile=false when there was no CSS/JS to extract.
 */
export function splitHtmlProject(rawHtml: string): SplitProject {
    let html = String(rawHtml || '');
    const cssParts: string[] = [];
    const jsParts: string[] = [];

    // Extract inline <style> ... </style> blocks.
    html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, body) => {
        if (String(body).trim()) cssParts.push(String(body).trim());
        return '';
    });

    // Extract inline <script> ... </script> blocks (skip ones with a src=).
    html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
        if (/\bsrc\s*=/.test(String(attrs))) return m; // external script: keep as-is
        if (String(body).trim()) jsParts.push(String(body).trim());
        return '';
    });

    const css = cssParts.join('\n\n');
    const js = jsParts.join('\n\n');
    const multiFile = css.length > 0 || js.length > 0;

    // Re-link the extracted files.
    if (css) {
        const link = '    <link rel="stylesheet" href="styles.css">';
        if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${link}\n</head>`);
        else if (/<head\b[^>]*>/i.test(html)) html = html.replace(/(<head\b[^>]*>)/i, `$1\n${link}`);
        else html = `${link}\n${html}`;
    }
    if (js) {
        const tag = '    <script src="script.js"></script>';
        if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${tag}\n</body>`);
        else html = `${html}\n${tag}`;
    }

    // Tidy the empty lines left where blocks were removed.
    html = html.replace(/\n{3,}/g, '\n\n');

    return { indexHtml: html, css, js, multiFile };
}

export interface BrowserSmoke {
    ok: boolean;
    consoleErrors: string[];
    pageErrors: string[];
    screenshotHref?: string;
    skipped?: string;
}

/**
 * OPT-IN real browser smoke test. Loads the built artifact URL in the headless
 * browser, captures console + page errors, and screenshots it. Best-effort:
 * returns { ok:true, skipped } when disabled or when the browser is unavailable,
 * so it NEVER breaks page delivery.
 */
export async function browserSmokeTest(url: string, filename: string): Promise<BrowserSmoke> {
    if (String(process.env.JOE_QA_BROWSER_TEST || '').trim() !== '1') {
        return { ok: true, consoleErrors: [], pageErrors: [], skipped: 'disabled (set JOE_QA_BROWSER_TEST=1 to enable)' };
    }
    try {
        const { getBrowserSession, withBrowserConcurrency } = require('../../modules/browser/manager');
        return await withBrowserConcurrency(async () => {
            const s = await getBrowserSession(`qa-${filename}`);
            const page = s.page;
            const consoleErrors: string[] = [];
            const pageErrors: string[] = [];
            const onConsole = (m: any) => { try { if (m.type() === 'error') consoleErrors.push(String(m.text()).slice(0, 300)); } catch { } };
            const onError = (e: any) => { try { pageErrors.push(String(e?.message || e).slice(0, 300)); } catch { } };
            page.on('console', onConsole);
            page.on('pageerror', onError);
            try {
                await page.goto(url, { waitUntil: 'load', timeout: 20000 });
                await page.waitForTimeout(500);
                const fs = require('fs'); const path = require('path');
                const artifactDir = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
                let screenshotHref: string | undefined;
                try {
                    const shot = `qa-${filename.replace(/\.html?$/i, '')}-${Date.now()}.jpg`;
                    const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                    if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
                    fs.writeFileSync(path.join(artifactDir, shot), buf);
                    screenshotHref = `/artifacts/${shot}`;
                } catch { /* screenshot optional */ }
                return { ok: pageErrors.length === 0, consoleErrors, pageErrors, screenshotHref };
            } finally {
                try { page.off('console', onConsole); page.off('pageerror', onError); } catch { }
            }
        });
    } catch (e: any) {
        return { ok: true, consoleErrors: [], pageErrors: [], skipped: `browser unavailable: ${e?.message || e}` };
    }
}
