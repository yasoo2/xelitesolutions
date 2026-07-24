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
