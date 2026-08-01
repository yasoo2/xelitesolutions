/**
 * Flourish — the shaped edges and drawn accents that make a page look designed
 * rather than assembled.
 *
 * The design system up to here is rigorous but rectangular: surfaces, grids,
 * type, buttons. What it never had is the layer a human designer adds last —
 * a wave cut into the hero's bottom edge, a hand-drawn underline beneath the
 * headings, a soft wash of the brand colour behind the opening screen. This
 * module owns that layer, with the same rules as every other design decision:
 *
 *   - chosen deterministically from the brief (same request → same page;
 *     different briefs → different shapes), like archetypes and motion;
 *   - executed in CSS the model cannot get wrong — the model is TOLD the
 *     edges are handled and forbidden from pasting its own divider SVGs;
 *   - colour comes from the palette tokens (var(--tint)), so a shape is
 *     always in the page's own colours, in both light and dark schemes.
 *
 * Technique notes, learned the careful way:
 *   - The wavy hero edge is a CSS MASK, not an absolutely-positioned SVG.
 *     A mask cannot overlap the next section, cannot 404, and shows whatever
 *     is genuinely underneath. The mask stack is a full-height gradient plus
 *     a bottom wave strip, so only the last 56px are shaped.
 *   - The heading underline is a masked block painted with var(--tint):
 *     the SVG bakes no colour, so the same squiggle is right on every
 *     surface and theme.
 *   - Tools (dashboard/app) default to 'none' — a analytics screen with a
 *     wavy header is decoration fighting the data.
 */

import { PageKind } from './blueprints';
import { canonicalForHash, hashOf } from './layouts';

export type FlourishStyle = 'wave' | 'curve' | 'tilt' | 'none';

const svgUrl = (svg: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

/** Keeps everything above a smooth two-crest wave; the strip below falls away. */
const WAVE_EDGE = svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 60" preserveAspectRatio="none"><path fill="black" d="M0,0 H1200 V26 C1000,54 820,4 600,28 C380,52 200,6 0,32 Z"/></svg>`
);

/** A hand-drawn four-crest squiggle, used as a mask under headings. */
const SQUIGGLE = svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 10" preserveAspectRatio="none"><path d="M2,7 C12,1 22,9 32,5 C42,1 52,9 62,5 C72,1 82,9 92,5 C102,1 112,8 118,4" fill="none" stroke="black" stroke-width="3" stroke-linecap="round"/></svg>`
);

/**
 * Which flourish this brief gets. An explicit ask always wins; tools default
 * to none; everything else draws stably from the canonical brief, with the
 * wave weighted — it is the shape people mean when they say "beautiful
 * header".
 */
export function pickFlourish(kind: PageKind | string, request: string): FlourishStyle {
    const r = `${request} ${canonicalForHash(request)}`;
    if (/مموج|موجه|موجة|موجي|أمواج|امواج|wav(e|y)/i.test(r)) return 'wave';
    if (/منحني|منحنى|قوس|مقوس|curve|arc(h|ed)?/i.test(r)) return 'curve';
    if (/مائل|قطري|diagonal|slant|tilt/i.test(r)) return 'tilt';
    if (/بدون زخرف|بدون زخارف|حواف مستقيم|no decoration|flat edges|straight edges/i.test(r)) return 'none';
    if (kind === 'dashboard' || kind === 'app') return 'none';
    const options: FlourishStyle[] = ['wave', 'curve', 'tilt', 'wave'];
    return options[hashOf(canonicalForHash(request)) % options.length];
}

/**
 * The CSS layer. `centered` mirrors the archetype: a centered composition gets
 * its heading accents centered too, everything else aligns to the text start.
 */
export function flourishCss(style: FlourishStyle, opts?: { centered?: boolean }): string {
    if (style === 'none') return '';
    const centered = !!opts?.centered;

    /* The soft brand wash behind the opening screen — a few percent of the
     * page's own tint, fading out before the fold, flipped for RTL. */
    const glow = `
section:first-of-type{background-image:radial-gradient(120% 90% at 82% -20%,color-mix(in srgb,var(--tint) 13%,transparent),transparent 62%)}
[dir=rtl] section:first-of-type{background-image:radial-gradient(120% 90% at 18% -20%,color-mix(in srgb,var(--tint) 13%,transparent),transparent 62%)}`;

    /* The heading accent. Wave and curve get the squiggle; tilt is a sharper
     * personality and gets a straight tinted bar. */
    const accent = style === 'tilt'
        ? `
section h2::after{content:"";display:block;width:64px;height:6px;margin-block-start:12px;border-radius:3px;background:var(--tint,#888)${centered ? ';margin-inline:auto' : ''}}`
        : `
section h2::after{content:"";display:block;width:112px;height:10px;margin-block-start:12px;background:var(--tint,#888);
-webkit-mask:${SQUIGGLE} no-repeat center / 100% 100%;mask:${SQUIGGLE} no-repeat center / 100% 100%${centered ? ';margin-inline:auto' : ''}}`;

    const edge = style === 'wave'
        ? `
section:first-of-type{
-webkit-mask-image:linear-gradient(#000,#000),${WAVE_EDGE};
-webkit-mask-size:100% calc(100% - 55px),100% 56px;
-webkit-mask-position:top,bottom;
-webkit-mask-repeat:no-repeat;
mask-image:linear-gradient(#000,#000),${WAVE_EDGE};
mask-size:100% calc(100% - 55px),100% 56px;
mask-position:top,bottom;
mask-repeat:no-repeat;
padding-bottom:clamp(96px,10vh,140px)}`
        : style === 'curve'
            ? `
section:first-of-type{clip-path:ellipse(150% 100% at 50% 0);padding-bottom:clamp(104px,11vh,150px)}`
            : `
section:first-of-type{clip-path:polygon(0 0,100% 0,100% calc(100% - 44px),0 100%);padding-bottom:clamp(96px,10vh,140px)}
[dir=rtl] section:first-of-type{clip-path:polygon(0 0,100% 0,100% 100%,0 calc(100% - 44px))}`;

    return `
/* Joe flourish layer — ${style}. Shaped edges and drawn accents; colours come
   from the palette tokens so they are right in both schemes. */${glow}${accent}${edge}`;
}

/**
 * What the model needs to know so it works WITH the flourish instead of
 * fighting it: the edges are already shaped, the headings already accented.
 */
export function flourishBrief(style: FlourishStyle): string {
    if (style === 'none') return '';
    const edgeName = style === 'wave' ? 'a soft wave' : style === 'curve' ? 'a smooth convex curve' : 'a diagonal cut';
    return `DECORATIVE LAYER (already in the page — do not rebuild it):
- The FIRST section's bottom edge is shaped by the system into ${edgeName}. Do NOT paste divider SVGs or shape-divider markup; it is handled.
- Keep the first section's own bottom padding modest — the system already adds room for the shaped edge.
- Every h2 automatically receives a small tinted accent under it. Do not draw your own underlines or accent bars beneath headings.
- A soft tinted glow already sits behind the opening screen; do not add another.`;
}
