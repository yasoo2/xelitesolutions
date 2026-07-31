/**
 * "Build it in the style of <that site>."
 *
 * Joe already owned a tool that opens a page and reads its de-facto design
 * system — colours, fonts, type scale, radii (`browser_design_tokens`). Nothing
 * ever called it while building a page, so a user could point at a reference
 * and be ignored. This module is the wire: it finds the reference in the
 * request, measures it in a real browser, and converts what it measured into
 * the same Palette/brief the builder already enforces.
 *
 * Two rules it does NOT break:
 *   - Contrast is still derived, never borrowed. A reference site with 2.8:1
 *     text does not get to export its failure into the page Joe writes.
 *   - Nothing is faked. If the site cannot be reached, or the browser is not
 *     available, the caller is told exactly that and the design falls back to
 *     the request-derived palette — it never pretends it copied a style.
 */

import { Palette, paletteForHue, contrastRatio } from './design-system';
import { normalizeIntentText } from '../orchestrator/promptNormalizer';

export interface ReferenceTokens {
    url: string;
    title: string;
    /** Most-used colours, already reduced to hex. */
    brand: string | null;
    accents: string[];
    backgrounds: string[];
    textColors: string[];
    /** Font family names as the site declares them (first in each stack). */
    fonts: string[];
    /** Distinct font sizes in use, largest first. */
    typeScale: string[];
    /** Dominant border-radius in px, 0 when the site is square. */
    radius: number;
    /** Does the site lean on shadows, or on borders? */
    depth: 'shadow' | 'border' | 'flat';
    /** Widest centred content column, px. */
    contentWidth: number;
    /** Is the reference itself dark-on-light or light-on-dark? */
    mood: 'light' | 'dark';
}

export interface ReferenceResult {
    ok: boolean;
    url?: string;
    tokens?: ReferenceTokens;
    /** Honest, user-facing reason when ok === false. */
    reason?: string;
}

/* ---------- finding the reference in what the user wrote -------------------- */

const STYLE_CUE = /(بأسلوب|باسلوب|بنفس أسلوب|بنفس اسلوب|على غرار|مثل موقع|شبيه بـ|شبيه ب|زي موقع|كموقع|style of|styled like|like the site|inspired by|similar to)/i;
const BARE_URL = /\bhttps?:\/\/[^\s"'<>)]+/i;
// Any plausible TLD rather than a list that will always be missing one — «زي موقع
// notion.so» must work. Filenames look identical to domains, so they are excluded
// by extension instead.
const BARE_DOMAIN = /\b((?:[a-z0-9-]+\.)+[a-z]{2,10})\b(\/[^\s"'<>)]*)?/i;
const FILE_EXT = /\.(html?|css|js|mjs|cjs|ts|tsx|jsx|json|md|png|jpe?g|gif|svg|webp|pdf|zip|txt|yml|yaml|sh|ps1|py|env|lock)$/i;

/** Hosts that are never a design reference even when a user pastes one. */
const NOT_A_REFERENCE = /(^|\.)(localhost|127\.0\.0\.1|example\.(com|org)|github\.com|google\.com)$/i;

/**
 * The URL the user wants imitated, or null. A bare domain only counts when the
 * sentence actually asks for a style — otherwise "our site is acme.com" would
 * silently repaint the whole page in acme's colours.
 */
export function findReferenceUrl(request: string): string | null {
    const raw = String(request || '');
    let probe = raw;
    try { probe = `${raw}\n${normalizeIntentText(raw)}`; } catch { /* optional */ }

    const explicit = raw.match(BARE_URL);
    const domain = raw.match(BARE_DOMAIN);
    const cued = STYLE_CUE.test(probe);

    let candidate = '';
    if (explicit) candidate = explicit[0];
    else if (domain && cued && !FILE_EXT.test(domain[1])) candidate = `https://${domain[1]}${domain[2] || ''}`;
    if (!candidate) return null;

    let host = '';
    try { host = new URL(candidate).hostname; } catch { return null; }
    if (NOT_A_REFERENCE.test(host)) return null;
    // A pasted URL with no style cue is only a reference if it is the only thing
    // that could be — e.g. "اعمل صفحة مثل https://…". Without the cue, treat a
    // full URL as a reference anyway (a user who pastes a site while asking for
    // a design means it), but never a bare domain.
    return candidate.replace(/[.,؛;]+$/, '');
}

/* ---------- measuring it ---------------------------------------------------- */

/** Runs inside the page. Kept dependency-free — it is serialised to the browser. */
function tokenCollector() {
    const tally = (m: Map<string, number>, k: string, w = 1) => { if (k) m.set(k, (m.get(k) || 0) + w); };
    const top = (m: Map<string, number>, n: number) =>
        Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

    const hex = (c: string): string => {
        if (!c) return '';
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return /^#[0-9a-f]{3,8}$/i.test(c) ? c.toLowerCase() : '';
        const parts = m[1].split(',').map(x => parseFloat(x));
        const [r, g, b] = parts;
        const a = parts.length > 3 ? parts[3] : 1;
        if (a < 0.5 || [r, g, b].some(v => isNaN(v))) return '';
        return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    };
    const sat = (h: string): number => {
        const n = h.replace('#', '');
        if (n.length < 6) return 0;
        const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        return mx === 0 ? 0 : (mx - mn) / mx;
    };
    const lum = (h: string): number => {
        const n = h.replace('#', '');
        if (n.length < 6) return 1;
        const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const bg = new Map<string, number>(), text = new Map<string, number>();
    const accent = new Map<string, number>(), btn = new Map<string, number>();
    const fonts = new Map<string, number>(), sizes = new Map<string, number>(), radii = new Map<string, number>();
    let shadowed = 0, bordered = 0, boxes = 0, widest = 0;

    const els = Array.from(document.querySelectorAll('body *')).slice(0, 3500);
    for (const el of els) {
        const h = el as HTMLElement;
        const cs = getComputedStyle(h);
        const r = h.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const area = r.width * r.height;

        // Weight backgrounds by the area they actually cover — a 4px divider and
        // a full-bleed hero are not equal evidence of what the site's colour is.
        if (area > 2000) tally(bg, hex(cs.backgroundColor), Math.round(area / 1000));
        if (h.innerText && h.innerText.trim().length > 1 && h.children.length === 0) tally(text, hex(cs.color));

        const family = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
        if (family) tally(fonts, family);
        const fs = Math.round(parseFloat(cs.fontSize) || 0);
        if (fs) tally(sizes, `${fs}px`);

        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const isBtn = tag === 'button' || role === 'button' || (tag === 'input' && /submit|button/i.test((el as HTMLInputElement).type || ''));
        if (tag === 'a') tally(accent, hex(cs.color));
        if (isBtn) { tally(btn, hex(cs.backgroundColor), 3); tally(radii, String(Math.round(parseFloat(cs.borderRadius) || 0))); }

        // A component, not a layout container. Sections, wrappers and the page
        // shell are square by definition and would drown out the corner style of
        // the cards — a site of 18px cards was reading as "square" because six
        // full-width containers voted 0.
        const isComponent = r.width < window.innerWidth * 0.7;
        if (area > 20000 && r.width > 160 && r.height > 80) {
            boxes++;
            if (cs.boxShadow && cs.boxShadow !== 'none') shadowed++;
            else if (parseFloat(cs.borderTopWidth) > 0) bordered++;
            if (isComponent) tally(radii, String(Math.round(parseFloat(cs.borderRadius) || 0)));
        }
        // A centred column with symmetric gutters is the site's content width.
        if (r.width > 480 && r.width < window.innerWidth - 24) {
            const left = r.left, right = window.innerWidth - r.right;
            if (Math.abs(left - right) < 24 && r.width > widest) widest = r.width;
        }
    }

    const pageBg = hex(getComputedStyle(document.body).backgroundColor) || '#ffffff';
    const chromatic = (arr: string[]) => arr.filter(c => c && sat(c) > 0.25 && lum(c) > 0.03 && lum(c) < 0.93);

    const btnTop = chromatic(top(btn, 6));
    const accentTop = chromatic(top(accent, 6));
    const bgTop = top(bg, 8);
    const brand = btnTop[0] || accentTop[0] || chromatic(bgTop)[0] || null;

    const radiusTop = Array.from(radii.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => parseInt(k, 10)).filter(n => !isNaN(n));

    return {
        title: document.title || '',
        brand,
        accents: Array.from(new Set([...btnTop, ...accentTop])).slice(0, 4),
        backgrounds: bgTop.filter(Boolean).slice(0, 4),
        textColors: top(text, 4).filter(Boolean),
        fonts: top(fonts, 4),
        typeScale: top(sizes, 8).sort((a, b) => parseInt(b, 10) - parseInt(a, 10)),
        radius: radiusTop.length ? radiusTop[0] : 0,
        depth: (boxes === 0 ? 'flat' : shadowed >= bordered && shadowed > boxes * 0.2 ? 'shadow' : bordered > 0 ? 'border' : 'flat') as 'shadow' | 'border' | 'flat',
        contentWidth: Math.round(widest) || 0,
        mood: (lum(pageBg) < 0.4 ? 'dark' : 'light') as 'light' | 'dark',
    };
}

/**
 * Open the reference and read its design system. Returns ok:false with a reason
 * rather than throwing — the builder must be able to say "I could not reach it"
 * and carry on with its own palette.
 */
export async function extractReference(url: string, timeoutMs = 25000): Promise<ReferenceResult> {
    if (String(process.env.JOE_DESIGN_REFERENCE || '1') === '0') {
        return { ok: false, reason: 'reference lookup disabled (JOE_DESIGN_REFERENCE=0)' };
    }
    let chromium: any;
    try { ({ chromium } = require('playwright')); } catch (e: any) {
        return { ok: false, reason: `playwright unavailable: ${e?.message || e}` };
    }

    let browser: any;
    try {
        browser = await chromium.launch({
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}),
        });
    } catch (e: any) {
        return { ok: false, reason: `browser launch failed: ${e?.message || e}` };
    }

    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
        // The collector below is serialised into the page. Some bundlers (tsx,
        // esbuild --keep-names) wrap every function in a `__name(...)` helper that
        // does not exist in the browser, and the evaluate then dies with
        // "__name is not defined". Defining an identity shim costs nothing and
        // makes the measurement independent of how the API was compiled.
        await page.addInitScript('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        if (!resp || !resp.ok()) {
            const code = resp ? resp.status() : 0;
            try { await browser.close(); } catch { }
            return { ok: false, reason: code ? `the site answered HTTP ${code}` : 'the site did not answer' };
        }
        // Give webfonts and above-the-fold CSS a moment; do not wait for networkidle,
        // marketing sites keep beacons open forever.
        await page.waitForTimeout(1500);
        const raw = await page.evaluate(tokenCollector);
        const finalUrl = page.url();
        try { await browser.close(); } catch { }

        if (!raw || (!raw.brand && !raw.fonts.length)) {
            return { ok: false, reason: 'the page rendered nothing measurable (script-only or blocked)' };
        }
        return { ok: true, url: finalUrl, tokens: { url: finalUrl, ...raw } as ReferenceTokens };
    } catch (e: any) {
        try { await browser.close(); } catch { }
        const msg = String(e?.message || e);
        const short = /timeout/i.test(msg) ? `it did not load within ${Math.round(timeoutMs / 1000)}s`
            : /ERR_NAME_NOT_RESOLVED|ENOTFOUND/i.test(msg) ? 'the domain does not resolve'
                : /ERR_CONNECTION|ECONNREFUSED/i.test(msg) ? 'the connection was refused'
                    : msg.slice(0, 140);
        return { ok: false, reason: short };
    }
}

/* ---------- turning measurements into a design ------------------------------ */

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
    const n = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(n)) return null;
    const r = parseInt(n.slice(0, 2), 16) / 255, g = parseInt(n.slice(2, 4), 16) / 255, b = parseInt(n.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
        h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
    }
    const l = (mx + mn) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * The palette a reference implies. The HUE is borrowed; the lightness ladder,
 * the muted text and both colour schemes are still derived here, so the page
 * inherits the identity without inheriting the reference's contrast bugs.
 */
export function paletteFromReference(tokens: ReferenceTokens, fallback: Palette): { palette: Palette; borrowed: boolean } {
    const hsl = tokens.brand ? hexToHsl(tokens.brand) : null;
    if (!hsl || hsl.s < 12) return { palette: fallback, borrowed: false };
    const p = paletteForHue(hsl.h);
    // Sanity: everything paletteForHue returns is already AA by construction, but
    // assert it rather than assume — this is the one place a foreign number enters.
    if (contrastRatio(p.primary, p.onPrimary) < 4.5 || contrastRatio(p.text, p.surface) < 7) {
        return { palette: fallback, borrowed: false };
    }
    return { palette: p, borrowed: true };
}

/** Radius and depth are safe to copy verbatim — they cannot make a page unreadable. */
export function referenceOverridesCss(tokens: ReferenceTokens): string {
    const r = Math.max(0, Math.min(28, Math.round(tokens.radius || 0)));
    const lines: string[] = [];
    lines.push(`:root{--radius:${r}px;--radius-lg:${Math.min(32, r + 8)}px}`);
    if (tokens.depth === 'border') {
        // A bordered reference is flat by choice; cards must not float.
        lines.push(`.card,.panel{box-shadow:none;border:1px solid var(--border)}`);
        lines.push(`.card:hover{box-shadow:var(--shadow-sm)}`);
    }
    if (tokens.contentWidth >= 900 && tokens.contentWidth <= 1600) {
        lines.push(`:root{--maxw:${Math.round(tokens.contentWidth)}px}`);
    }
    return `/* borrowed from ${tokens.url} */\n${lines.join('\n')}`;
}

/** What the model is told about the reference it is imitating. */
export function referenceBrief(tokens: ReferenceTokens): string {
    const fonts = tokens.fonts.filter(f => !/^(-apple-system|BlinkMacSystemFont|system-ui|inherit|initial)$/i.test(f)).slice(0, 3);
    const scale = tokens.typeScale.slice(0, 5).join(', ');
    return `STYLE REFERENCE — the user asked for the feel of ${tokens.url}${tokens.title ? ` ("${tokens.title}")` : ''}.
Measured from the live site, not guessed:
- Brand colour ${tokens.brand || 'not detectable'}; the tokens below already carry its hue at
  accessible lightness. Use the tokens, never the raw hex from the reference.
- The reference is a ${tokens.mood} interface with ${tokens.depth === 'shadow' ? 'soft shadows under its cards' : tokens.depth === 'border' ? 'hairline borders instead of shadows' : 'flat, undecorated surfaces'},
  ${tokens.radius > 14 ? 'generously rounded' : tokens.radius > 4 ? 'gently rounded' : 'square'} corners (${tokens.radius}px)${tokens.contentWidth ? `, a ${Math.round(tokens.contentWidth)}px content column` : ''}.
- Its type${fonts.length ? ` is set in ${fonts.join(' / ')} — match the CHARACTER (${/serif|georgia|times|playfair|merriweather/i.test(fonts[0]) ? 'serif, editorial' : /mono|courier|consol/i.test(fonts[0]) ? 'monospace, technical' : 'geometric sans, modern'}), not the exact file; do not load a webfont` : ' uses system fonts'}.
  Its scale runs ${scale || 'unremarkably'} — mirror that rhythm with the --step-* tokens.
${tokens.mood === 'dark'
            ? '- THE PAGE IS DARK-FIRST. var(--bg) and var(--surface) are already dark and var(--text) light;\n  write for a dark canvas — no white boxes, no light-only imagery, and let the brand colour glow.'
            : '- The page is light-first; keep large calm light surfaces and use colour sparingly for emphasis.'}
IMITATE the composition, density and tone. Do NOT copy its text, its logo, its images or its
brand name — this is a different business and must read as its own.`;
}

/** One line for the user: what was borrowed, or honestly why nothing was. */
export function referenceSummary(url: string, res: ReferenceResult, borrowed: boolean): string {
    if (!res.ok) return `🎨 المرجع ${url}: تعذّرت قراءته (${res.reason}) — صُمّمت الصفحة بلوحة جو الخاصة.`;
    const t = res.tokens!;
    const bits = [
        t.brand ? `اللون ${t.brand}` : '',
        `الحواف ${t.radius}px`,
        t.depth === 'shadow' ? 'ظلال ناعمة' : t.depth === 'border' ? 'حدود رفيعة بلا ظلال' : 'أسطح مسطّحة',
        t.contentWidth ? `عمود ${Math.round(t.contentWidth)}px` : '',
        t.fonts[0] ? `طابع خط ${t.fonts[0]}` : '',
        t.mood === 'dark' ? 'واجهة داكنة — فبُنيت الصفحة داكنة للجميع لا حسب إعداد الجهاز' : '',
    ].filter(Boolean);
    return `🎨 قرأتُ أسلوب ${t.url} فعليًا: ${bits.join('، ')}${borrowed ? '' : ' (اللون لم يُستعر لأنه رمادي/غير محدد)'} — والتباين أُعيد اشتقاقه ليبقى مطابقًا لـ AA.`;
}
