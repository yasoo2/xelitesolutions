/**
 * Layout archetypes and typography — composition decided, not improvised.
 *
 * A model given "build a landing page" invents a layout every time, and what it
 * invents is the same stack of centred boxes: a full-width band, then a grid of
 * three identical cards, then another grid of three identical cards. That is
 * what "the design is primitive" describes. Professional pages alternate
 * rhythm — a split hero, an offset feature row, a bento grid, a full-bleed
 * band — and that alternation is a composition decision, not prose.
 *
 * So the composition is chosen HERE, deterministically, and the CSS for it
 * ships with the page. The model places content into named containers instead
 * of inventing geometry.
 */

import { normalizeIntentText } from '../orchestrator/promptNormalizer';

/** The user's words plus their canonical form — one Arabic spelling must not
 *  decide the design. */
function probeOf(request: string): string {
    try { return `${request || ''}\n${normalizeIntentText(request || '')}`; } catch { return String(request || ''); }
}

import type { PageKind } from './blueprints';

export type Archetype = 'split' | 'centered' | 'bento' | 'editorial' | 'showcase';

/** How each kind of page is composed, and which hero opens it. */
const KIND_ARCHETYPE: Record<PageKind, Archetype> = {
    landing: 'split',
    store: 'showcase',
    portfolio: 'editorial',
    restaurant: 'showcase',
    dashboard: 'bento',
    blog: 'editorial',
    app: 'bento',
    event: 'centered',
    docs: 'editorial',
    generic: 'split',
};

export function pickArchetype(kind: PageKind, request: string): Archetype {
    // An explicit ask wins over the default for the page type.
    const r = probeOf(request);
    if (/بسيط|مينمال|minimal|clean/i.test(r)) return 'centered';
    if (/مجل|editorial|magazine|مقالات/i.test(r)) return 'editorial';
    if (/بينتو|bento|لوحات/i.test(r)) return 'bento';
    return KIND_ARCHETYPE[kind] || 'split';
}

/**
 * The composition layer. Class names are the contract with the model: it uses
 * them, it does not invent geometry. Everything is written mobile-first, so a
 * missing breakpoint cannot break it the way hand-written grids did.
 */
export function layoutCss(a: Archetype): string {
    const common = `
/* Joe layout system — composition, not improvisation */
.wrap{width:min(100% - 2rem,var(--maxw,1180px));margin-inline:auto}
.section{padding-block:clamp(48px,7vw,110px)}
.section-tight{padding-block:clamp(32px,4vw,64px)}
.section-head{max-width:62ch;margin-bottom:clamp(28px,4vw,56px)}
.section-head.center{margin-inline:auto;text-align:center}
.eyebrow{display:inline-block;font-size:var(--step--1);font-weight:700;letter-spacing:.12em;
  text-transform:uppercase;color:var(--brand);margin-bottom:12px}
.lede{font-size:var(--step-1);color:var(--text-muted);max-width:60ch}
.grid{display:grid;gap:clamp(16px,2.2vw,28px)}
.grid-2{grid-template-columns:1fr}
.grid-3{grid-template-columns:1fr}
.grid-4{grid-template-columns:1fr}
@media(min-width:640px){.grid-2{grid-template-columns:repeat(2,1fr)}.grid-4{grid-template-columns:repeat(2,1fr)}}
@media(min-width:960px){.grid-3{grid-template-columns:repeat(3,1fr)}.grid-4{grid-template-columns:repeat(4,1fr)}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:clamp(20px,2.4vw,30px);box-shadow:var(--shadow-sm)}
.card-media{margin:calc(-1 * clamp(20px,2.4vw,30px));margin-bottom:20px;overflow:hidden;
  border-radius:var(--radius-lg) var(--radius-lg) 0 0}
.stack{display:flex;flex-direction:column;gap:var(--space-4)}
.row{display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap}
.divider{height:1px;background:linear-gradient(90deg,transparent,var(--border),transparent);border:0}

/* Full-bleed band, used to break the rhythm between sections */
.band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand);
  padding-block:clamp(40px,6vw,90px)}
.band .lede,.band .eyebrow{color:color-mix(in srgb,var(--on-brand) 82%,transparent)}

/* Depth without noise: a soft aura behind the opening section */
.aura{position:relative;isolation:isolate;overflow:hidden}
.aura::before{content:"";position:absolute;inset:-30% -10% auto -10%;height:70%;z-index:-1;
  background:radial-gradient(60% 60% at 30% 30%,color-mix(in srgb,var(--brand) 26%,transparent),transparent 70%),
             radial-gradient(50% 50% at 80% 20%,color-mix(in srgb,var(--secondary) 20%,transparent),transparent 70%);
  filter:blur(10px)}

/* Stat figures read as data, not as body copy */
.stat{display:flex;flex-direction:column;gap:4px}
.stat b{font-size:var(--step-4);line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.stat span{color:var(--text-muted);font-size:var(--step--1)}
.badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:var(--radius-pill);
  background:var(--brand-light);color:var(--brand-dark);font-size:var(--step--1);font-weight:700}
`;

    const perArchetype: Record<Archetype, string> = {
        // Copy on one side, image on the other — the workhorse of company sites.
        split: `
.hero{padding-block:clamp(56px,8vw,120px)}
.hero-split{display:grid;gap:clamp(28px,4vw,60px);align-items:center;grid-template-columns:1fr}
@media(min-width:900px){.hero-split{grid-template-columns:1.05fr .95fr}}
.hero h1{font-size:var(--step-5);letter-spacing:-.03em;margin-bottom:var(--space-4)}
.hero-media img{border-radius:var(--radius-lg);box-shadow:var(--shadow-lg)}
.feature-row{display:grid;gap:clamp(24px,4vw,56px);align-items:center;grid-template-columns:1fr}
@media(min-width:900px){.feature-row{grid-template-columns:1fr 1fr}
  .feature-row:nth-of-type(even) .feature-media{order:-1}}`,

        // One strong statement, centred, with the proof underneath.
        centered: `
.hero{padding-block:clamp(64px,10vw,150px);text-align:center}
.hero h1{font-size:var(--step-5);letter-spacing:-.03em;max-width:18ch;margin-inline:auto}
.hero .lede{margin-inline:auto;text-align:center}
.hero-actions{display:flex;gap:var(--space-3);justify-content:center;flex-wrap:wrap;margin-top:var(--space-8)}
.hero-media{margin-top:clamp(32px,5vw,72px)}
.hero-media img{border-radius:var(--radius-lg);box-shadow:var(--shadow-lg)}`,

        // Tiles of different weights — dashboards and product surfaces.
        bento: `
.hero{padding-block:clamp(48px,6vw,96px)}
.hero h1{font-size:var(--step-4);letter-spacing:-.02em}
.bento{display:grid;gap:clamp(14px,1.8vw,22px);grid-template-columns:1fr}
@media(min-width:760px){.bento{grid-template-columns:repeat(6,1fr)}
  .bento > *{grid-column:span 3}
  .bento > *:nth-child(6n+1){grid-column:span 4}
  .bento > *:nth-child(6n+2){grid-column:span 2}
  .bento > *:nth-child(6n+6){grid-column:span 6}}`,

        // Long-form: a measured column with figures breaking out of it.
        editorial: `
.hero{padding-block:clamp(48px,7vw,110px)}
.hero h1{font-size:var(--step-5);letter-spacing:-.03em;max-width:20ch}
.prose{max-width:68ch}
.prose p{margin-bottom:1.15em}
.prose figure{margin:clamp(28px,4vw,48px) 0}
.prose figure img{border-radius:var(--radius-lg)}
.prose figcaption{color:var(--text-muted);font-size:var(--step--1);margin-top:10px}
.masonry{columns:1;column-gap:clamp(16px,2vw,26px)}
@media(min-width:700px){.masonry{columns:2}}
@media(min-width:1050px){.masonry{columns:3}}
.masonry > *{break-inside:avoid;margin-bottom:clamp(16px,2vw,26px)}`,

        // Product-forward: a wide banner and a dense, even grid.
        showcase: `
.hero{position:relative;min-height:clamp(380px,52vh,600px);display:grid;align-items:end;
  border-radius:0 0 var(--radius-lg) var(--radius-lg);overflow:hidden;isolation:isolate}
.hero-bg{position:absolute;inset:0;z-index:-1}
.hero-bg img{width:100%;height:100%;object-fit:cover}
.hero::after{content:"";position:absolute;inset:0;z-index:-1;
  background:linear-gradient(to top,color-mix(in srgb,#000 72%,transparent),transparent 62%)}
.hero-copy{color:#fff;padding:clamp(24px,4vw,56px)}
.hero-copy h1{font-size:var(--step-5);letter-spacing:-.03em;text-shadow:0 2px 18px rgba(0,0,0,.35)}
.showcase-grid{display:grid;gap:clamp(14px,2vw,24px);grid-template-columns:repeat(2,1fr)}
@media(min-width:760px){.showcase-grid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:1100px){.showcase-grid{grid-template-columns:repeat(4,1fr)}}`,
    };

    return common + perArchetype[a];
}

/* ---------- typography ------------------------------------------------------- */

export interface TypePair { display: string; body: string; note: string }

/**
 * Font stacks, not webfonts. Downloading a family would be a network dependency
 * on every build for a machine that often has none — and `Arial, sans-serif`,
 * which is what a model reaches for, is the single clearest signal that nobody
 * designed the page. These stacks lead with faces that ship on Windows and
 * macOS and that render Arabic properly.
 */
const PAIRS: Array<{ re: RegExp; pair: TypePair }> = [
    [/تقني|برمج|software|tech|saas|ai\b|data/i, { display: `'Segoe UI Variable Display','Segoe UI','Inter','Noto Kufi Arabic','Helvetica Neue',system-ui,sans-serif`, body: `'Segoe UI','Inter','Noto Sans Arabic',system-ui,-apple-system,sans-serif`, note: 'geometric, engineered' }],
    [/محام|قانون|law|legal|مالي|finance|bank|استشار|consult/i, { display: `'Georgia','Times New Roman','Amiri','Noto Naskh Arabic',serif`, body: `'Segoe UI','Noto Sans Arabic',system-ui,sans-serif`, note: 'serif authority' }],
    [/مطعم|كافيه|قهوة|restaurant|cafe|food|حلوي|bakery/i, { display: `'Georgia','Playfair Display','Amiri','Noto Naskh Arabic',serif`, body: `'Segoe UI','Noto Sans Arabic',system-ui,sans-serif`, note: 'warm editorial' }],
    [/أزياء|ازياء|fashion|جمال|beauty|فن|art|gallery/i, { display: `'Didot','Bodoni MT','Georgia','Amiri',serif`, body: `'Segoe UI','Noto Sans Arabic',system-ui,sans-serif`, note: 'high-contrast fashion' }],
    [/طب|صح|عياد|clinic|medical|health/i, { display: `'Segoe UI','Noto Kufi Arabic',system-ui,sans-serif`, body: `'Segoe UI','Noto Sans Arabic',system-ui,sans-serif`, note: 'calm and clinical' }],
].map(([re, pair]) => ({ re: re as RegExp, pair: pair as TypePair }));

const DEFAULT_PAIR: TypePair = {
    display: `'Segoe UI Variable Display','Segoe UI','Noto Kufi Arabic',system-ui,-apple-system,sans-serif`,
    body: `'Segoe UI','Noto Sans Arabic',system-ui,-apple-system,'Helvetica Neue',sans-serif`,
    note: 'neutral modern',
};

export function pickTypePair(request: string): TypePair {
    const r = probeOf(request);
    for (const p of PAIRS) if (p.re.test(r)) return p.pair;
    return DEFAULT_PAIR;
}

export function typographyCss(t: TypePair): string {
    return `
/* Type pairing — ${t.note} */
:root{--font-display:${t.display};--font-body:${t.body}}
body{font-family:var(--font-body);font-size:var(--step-0);line-height:1.7}
h1,h2,h3,h4,.display{font-family:var(--font-display);font-weight:700;line-height:1.14;letter-spacing:-.02em}
h1{font-size:var(--step-5)}h2{font-size:var(--step-4)}h3{font-size:var(--step-2)}h4{font-size:var(--step-1)}
p,li{max-width:72ch}
strong{font-weight:700}
::selection{background:color-mix(in srgb,var(--brand) 30%,transparent)}`;
}

/** What the model is told about the composition it must build into. */
export function layoutBrief(a: Archetype, t: TypePair): string {
    const shape: Record<Archetype, string> = {
        split: 'The hero is SPLIT: copy on one side, a photograph on the other. Use <section class="hero aura"><div class="wrap hero-split"><div>…copy…</div><div class="hero-media"><img …></div></div></section>. Feature sections use .feature-row, which alternates image side automatically.',
        centered: 'The hero is CENTERED: one strong statement, a lede, then the actions, then one wide image below. Use <section class="hero aura"><div class="wrap"><h1>…</h1><p class="lede">…</p><div class="hero-actions">…</div><div class="hero-media"><img …></div></div></section>.',
        bento: 'The page is a BENTO of tiles of different weights. Use <div class="bento"> with .card children; the widths vary automatically, so do not set your own column spans.',
        editorial: 'The page is EDITORIAL: a measured reading column (.prose, max 68ch) with figures breaking the rhythm, and .masonry for any gallery.',
        showcase: 'The hero is a full-bleed SHOWCASE banner with the photograph behind the copy. Use <section class="hero"><div class="hero-bg"><img …></div><div class="wrap hero-copy"><h1>…</h1>…</div></section>. Product/menu grids use .showcase-grid.',
    };
    return `COMPOSITION — build into these classes, do not invent your own geometry:
${shape[a]}
- Every section: <section class="section"><div class="wrap">…</div></section>. Never set your own
  max-width or page padding; .wrap and .section already carry the rhythm and the breakpoints.
- Section openings use .section-head with an .eyebrow label above the heading and a .lede under it.
- Card grids: .grid.grid-2 / .grid-3 / .grid-4 with .card children — these already collapse on mobile.
- Break the rhythm at least once with a full-bleed <section class="band">, and use .stat for figures
  and .badge for small labels.
- Typography is set for you (${t.note}); use the heading levels, never hardcode a font-family.`;
}
