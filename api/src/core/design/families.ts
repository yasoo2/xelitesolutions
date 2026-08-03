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
  --f-font:'Segoe UI','Noto Sans Arabic',system-ui,sans-serif;
  --f-head:inherit;
  --f-head-weight:800;
  --f-radius:18px;--f-radius-sm:12px;--f-btn-radius:999px;
  --f-border-w:1px;
  --f-card-shadow:none;
  --f-photo-shadow:0 24px 60px -16px rgba(0,0,0,.25);
}`,
        elegant: `:root{
  --f-font:'Segoe UI','Noto Sans Arabic',system-ui,sans-serif;
  --f-head:'Amiri','Georgia','Times New Roman',serif;
  --f-head-weight:600;
  --f-radius:6px;--f-radius-sm:4px;--f-btn-radius:6px;
  --f-border-w:1px;
  --f-card-shadow:0 1px 2px rgba(0,0,0,.06);
  --f-photo-shadow:0 10px 30px -12px rgba(0,0,0,.18);
}
.section{padding-block:clamp(64px,9vw,140px)}
h1,h2{line-height:1.3}
.card{border-color:color-mix(in srgb,var(--border) 60%,transparent)}`,
        bold: `:root{
  --f-font:'Segoe UI','Noto Sans Arabic',system-ui,sans-serif;
  --f-head:inherit;
  --f-head-weight:900;
  --f-radius:4px;--f-radius-sm:2px;--f-btn-radius:4px;
  --f-border-w:2px;
  --f-card-shadow:6px 6px 0 color-mix(in srgb,var(--brand) 30%,transparent);
  --f-photo-shadow:8px 8px 0 color-mix(in srgb,var(--brand) 35%,transparent);
}
.card{border-color:var(--text)}
.btn{border:2px solid transparent;font-weight:800}
.hero h1{font-size:clamp(2.4rem,6vw,4rem)}`,
        warm: `:root{
  --f-font:'Segoe UI','Noto Sans Arabic',system-ui,sans-serif;
  --f-head:inherit;
  --f-head-weight:800;
  --f-radius:26px;--f-radius-sm:18px;--f-btn-radius:999px;
  --f-border-w:1px;
  --f-card-shadow:0 14px 40px -18px color-mix(in srgb,var(--brand) 35%,transparent);
  --f-photo-shadow:0 24px 60px -16px rgba(0,0,0,.22);
}
.card{border-color:color-mix(in srgb,var(--brand) 18%,var(--border))}`,
    };
    return `/* joe-family:${f} */\n${blocks[f]}\n/* /joe-family */`;
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
