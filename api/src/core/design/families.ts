/**
 * DESIGN FAMILIES — four complete visual identities, chosen DETERMINISTICALLY.
 *
 * One design system made Joe reliable; one design system also made every
 * project look like its sibling — the gap the world-class builders exploit.
 * These families keep the discipline (hand-written CSS variables, compile-by-
 * construction, AA-safe — the palette engine still owns the colours) while
 * giving each project its own character:
 *
 *   minimal «سهل»   — the classic Joe look: friendly radii, soft shadows.
 *   elegant «أصيل»  — serif headings, hairline borders, airy, quiet.
 *   bold    «جسور»  — brutalist: hard offset shadows, thick borders, square.
 *   warm    «وديع»  — deeply rounded, soft and close, generous shadows.
 *
 * The pick: an EXPLICIT wish in the request always wins («متجر فاخر» →
 * elegant, «بتصميم جريء» → bold); otherwise the business kind decides the
 * way a designer would (a restaurant feels warm, a boutique elegant, a SaaS
 * bold). No randomness — the same request always gets the same identity.
 *
 * NOTE deliberately absent: letter-spacing. Arabic script joins its letters;
 * tracking them apart breaks words (measured on a shipped build long ago).
 */
import type { PageKind } from './blueprints';

export type DesignFamily = 'minimal' | 'elegant' | 'bold' | 'warm';

export const FAMILY_LABEL_AR: Record<DesignFamily, string> = {
    minimal: 'سهل — نظيف وعملي',
    elegant: 'أصيل — فاخر وهادئ',
    bold: 'جسور — قوي وجريء',
    warm: 'وديع — دافئ وودود',
};

/** The family this request asks for — explicit wish first, kind second. */
export function familyFor(request: string, kind: PageKind): DesignFamily {
    const p = String(request || '');
    if (/(فاخر|فخم|راقي|أنيق|انيق|كلاسيكي|elegant|luxur|classy|premium look)/i.test(p)) return 'elegant';
    if (/(جريء|جرئ|داكن|قوي|صارخ|عصري جدا|bold|brutal|edgy|striking)/i.test(p)) return 'bold';
    if (/(دافئ|دافي|عائلي|مرح|ودود|لطيف|warm|cozy|friendly|playful)/i.test(p)) return 'warm';
    if (/(بسيط|نظيف|مينيمال|minimal|clean|simple look)/i.test(p)) return 'minimal';
    switch (kind) {
        case 'restaurant': return 'warm';
        case 'store': return 'elegant';
        case 'portfolio': return 'minimal';
        case 'dashboard':
        case 'app': return 'bold';
        default: return 'minimal';
    }
}

/**
 * The family's CSS: a marker-wrapped variable block plus a few family rules.
 * Everything structural stays in base.css consuming the variables — so a
 * family SWAP is one deterministic block replacement, never a rewrite.
 */
export function familyCss(f: DesignFamily): string {
    const blocks: Record<DesignFamily, string> = {
        minimal: `:root{
  --f-font:${familyFonts('minimal').body};
  --f-head:${familyFonts('minimal').head};
  --f-head-weight:700;
  --f-radius:18px;--f-radius-sm:12px;--f-btn-radius:999px;
  --f-border-w:1px;
  --f-card-shadow:none;
  --f-photo-shadow:0 24px 60px -16px rgba(0,0,0,.25);
}`,
        elegant: `:root{
  --f-font:${familyFonts('elegant').body};
  --f-head:${familyFonts('elegant').head};
  --f-head-weight:700;
  --f-radius:6px;--f-radius-sm:4px;--f-btn-radius:6px;
  --f-border-w:1px;
  --f-card-shadow:0 1px 2px rgba(0,0,0,.06);
  --f-photo-shadow:0 10px 30px -12px rgba(0,0,0,.18);
}
.section{padding-block:clamp(64px,9vw,140px)}
h1,h2{line-height:1.3}
.card{border-color:color-mix(in srgb,var(--border) 60%,transparent)}
.cta-band{background:var(--surface);color:var(--text);border-block:1px solid var(--border)}
.cta-band .btn-invert{background:var(--brand);color:var(--on-brand)}`,
        bold: `:root{
  --f-font:${familyFonts('bold').body};
  --f-head:${familyFonts('bold').head};
  --f-head-weight:900;
  --f-radius:4px;--f-radius-sm:2px;--f-btn-radius:4px;
  --f-border-w:2px;
  --f-card-shadow:6px 6px 0 color-mix(in srgb,var(--brand) 30%,transparent);
  --f-photo-shadow:8px 8px 0 color-mix(in srgb,var(--brand) 35%,transparent);
}
.card{border-color:var(--text)}
.btn{border:2px solid transparent;font-weight:800}
.hero h1{font-size:clamp(2.4rem,6vw,4rem)}
.cta-band{clip-path:polygon(0 8%,100% 0,100% 92%,0 100%);padding-block:clamp(64px,9vw,130px)}`,
        warm: `:root{
  --f-font:${familyFonts('warm').body};
  --f-head:${familyFonts('warm').head};
  --f-head-weight:700;
  --f-radius:26px;--f-radius-sm:18px;--f-btn-radius:999px;
  --f-border-w:1px;
  --f-card-shadow:0 14px 40px -18px color-mix(in srgb,var(--brand) 35%,transparent);
  --f-photo-shadow:0 24px 60px -16px rgba(0,0,0,.22);
}
.card{border-color:color-mix(in srgb,var(--brand) 18%,var(--border))}
.cta-band{border-radius:28px;width:min(100% - 2rem,1180px);margin-inline:auto}`,
    };
    return `/* joe-family:${f} */\n${blocks[f]}\n/* /joe-family */`;
}

/* ---------- REAL bundled Arabic webfonts (OFL) --------------------------- */

const ARABIC_RANGE = 'U+0600-06FF, U+0750-077F, U+0870-088E, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF';
const LATIN_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122, U+FEFF, U+FFFD';

/**
 * Which REAL font files each family ships, and the @font-face css that
 * loads them from the project's own public/fonts. This exists because the
 * elegant family used to declare 'Amiri, Georgia, serif' while shipping NO
 * font file at all — Amiri is on nobody's machine and Georgia has no Arabic
 * glyphs, so the "luxury serif" headings rendered in the plain system font
 * (field discovery, 2026-08-04). Now the fonts travel WITH the app.
 */
export function familyFonts(f: DesignFamily): { files: string[]; faces: string; body: string; head: string } {
    const face = (family: string, weight: number, file: string, range: string) =>
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url('./fonts/${file}') format('woff2');unicode-range:${range}}`;
    const pair = (family: string, weight: number, base: string) =>
        face(family, weight, `${base}-${weight}-arabic.woff2`, ARABIC_RANGE) + '\n'
        + face(family, weight, `${base}-${weight}-latin.woff2`, LATIN_RANGE);
    const cairo = (w: number) => pair('Cairo', w, 'cairo');
    const tajawal = (w: number) => pair('Tajawal', w, 'tajawal');
    const amiri = (w: number) => pair('Amiri', w, 'amiri');
    switch (f) {
        case 'elegant': return {
            files: ['cairo-400-arabic.woff2', 'cairo-400-latin.woff2', 'cairo-700-arabic.woff2', 'cairo-700-latin.woff2', 'amiri-700-arabic.woff2', 'amiri-700-latin.woff2'],
            faces: [cairo(400), cairo(700), amiri(700)].join('\n'),
            body: "'Cairo','Noto Sans Arabic',system-ui,sans-serif",
            head: "'Amiri','Noto Naskh Arabic',serif",
        };
        case 'bold': return {
            files: ['cairo-400-arabic.woff2', 'cairo-400-latin.woff2', 'cairo-700-arabic.woff2', 'cairo-700-latin.woff2', 'cairo-900-arabic.woff2', 'cairo-900-latin.woff2'],
            faces: [cairo(400), cairo(700), cairo(900)].join('\n'),
            body: "'Cairo','Noto Sans Arabic',system-ui,sans-serif",
            head: "'Cairo','Noto Sans Arabic',system-ui,sans-serif",
        };
        case 'warm': return {
            files: ['tajawal-400-arabic.woff2', 'tajawal-400-latin.woff2', 'tajawal-700-arabic.woff2', 'tajawal-700-latin.woff2'],
            faces: [tajawal(400), tajawal(700)].join('\n'),
            body: "'Tajawal','Noto Sans Arabic',system-ui,sans-serif",
            head: "'Tajawal','Noto Sans Arabic',system-ui,sans-serif",
        };
        default: return {
            files: ['cairo-400-arabic.woff2', 'cairo-400-latin.woff2', 'cairo-700-arabic.woff2', 'cairo-700-latin.woff2'],
            faces: [cairo(400), cairo(700)].join('\n'),
            body: "'Cairo','Noto Sans Arabic',system-ui,sans-serif",
            head: "'Cairo','Noto Sans Arabic',system-ui,sans-serif",
        };
    }
}

/** Swap the family block inside a css file's contents; null when unmarked. */
export function swapFamilyCss(css: string, to: DesignFamily): string | null {
    if (!/\/\* joe-family:[a-z]+ \*\//.test(css)) return null;
    return css.replace(/\/\* joe-family:[a-z]+ \*\/[\s\S]*?\/\* \/joe-family \*\//, familyCss(to));
}

/** The family a css file currently carries, or null. */
export function familyOf(css: string): DesignFamily | null {
    const m = css.match(/\/\* joe-family:([a-z]+) \*\//);
    return (m && ['minimal', 'elegant', 'bold', 'warm'].includes(m[1])) ? m[1] as DesignFamily : null;
}
