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
/* display:grid lives on EVERY grid class, not only on .grid.
   The brief reads "….grid.grid-2 / .grid-3 / .grid-4", so a model writes
   <div class="grid-3"> — which set grid-template-columns on an element that was
   never display:grid, and every card grid on every page Joe has built rendered
   as one column at every width. Found by screenshotting a dashboard. */
.grid,.grid-2,.grid-3,.grid-4{display:grid;gap:clamp(16px,2.2vw,28px)}
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
  background:var(--tint);color:var(--on-tint);font-size:var(--step--1);font-weight:700}
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
- Card grids: .grid-2, .grid-3 or .grid-4 with .card children — each is a complete
  grid on its own and already collapses to one column on mobile.
- Break the rhythm at least once with a full-bleed <section class="band">, and use .stat for figures
  and .badge for small labels.
- Typography is set for you (${t.note}); use the heading levels, never hardcode a font-family.`;
}

/**
 * The visual primitives a designer reaches for and a model never writes.
 *
 * The gap between "a page" and "a designed page" is rarely the layout — it is
 * the small stuff: an icon that is actually drawn rather than an emoji, a
 * section that ends with a shaped edge instead of a hard line, a card that has
 * a tinted corner, a number that reads as data. None of it appeared in any
 * generated page because none of it is worth a model's tokens. It ships here.
 */
export function primitivesCss(): string {
    return `
/* Icons: a real drawn mark, sized by its context */
.icon{width:1.25em;height:1.25em;flex:none;stroke:currentColor;fill:none;stroke-width:1.75;
  stroke-linecap:round;stroke-linejoin:round;vertical-align:-.2em}
.icon-box{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;flex:none;
  background:var(--tint);color:var(--on-tint)}
.icon-box .icon{width:24px;height:24px}

/* Shaped section edges — the cheapest way to stop a page reading as stacked boxes */
.edge-top{position:relative}
/* inset-inline, not left/right. Joe's OWN audit reported this one on a page it
   had just built — ".edge-top::before { left: 0 right: 0 }" — and it was right:
   the kit was telling the model to use logical properties while breaking the
   rule itself. A shaped edge anchored physically is mirrored wrongly in RTL. */
.edge-top::before{content:"";position:absolute;top:-1px;inset-inline:0;height:44px;
  background:inherit;clip-path:polygon(0 100%,100% 0,100% 100%)}
.tint{position:relative;overflow:hidden}
.tint::after{content:"";position:absolute;inset-inline-end:-60px;top:-60px;width:220px;height:220px;
  border-radius:50%;background:color-mix(in srgb,var(--brand) 12%,transparent);pointer-events:none}

/* Glass surface for overlays sitting on a photograph */
.glass{background:color-mix(in srgb,var(--surface) 72%,transparent);
  backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);
  border:1px solid color-mix(in srgb,var(--surface) 40%,transparent)}

/* A quiet ruled list for features and specs */
.ruled{list-style:none;padding:0;margin:0}
.ruled li{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--border)}
.ruled li:last-child{border-bottom:0}
.ruled li .icon{color:var(--brand);margin-top:.15em}

/* Accordion that needs no JavaScript */
details.faq{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);
  padding:0 18px;margin-bottom:10px}
details.faq summary{cursor:pointer;padding:16px 0;font-weight:650;list-style:none;
  display:flex;justify-content:space-between;align-items:center;gap:12px}
details.faq summary::-webkit-details-marker{display:none}
details.faq summary::after{content:"+";font-size:1.3em;color:var(--brand);transition:transform .2s ease}
details.faq[open] summary::after{transform:rotate(45deg)}
details.faq > *:not(summary){padding-bottom:18px;color:var(--text-muted)}

/* Timeline / numbered steps that look composed rather than listed */
.steps{counter-reset:step;display:grid;gap:clamp(18px,2.4vw,30px)}
.steps > *{counter-increment:step;position:relative;padding-inline-start:64px}
.steps > *::before{content:counter(step);position:absolute;inset-inline-start:0;top:0;
  width:44px;height:44px;display:grid;place-items:center;border-radius:50%;
  background:var(--brand);color:var(--on-brand);font-weight:700;font-size:var(--step-0)}

/* Tables that are readable on a phone */
.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)}
table{width:100%;border-collapse:collapse;font-size:var(--step-0)}
th,td{padding:12px 14px;text-align:start;border-bottom:1px solid var(--border)}
th{background:color-mix(in srgb,var(--brand) 6%,transparent);font-weight:650}
tr:last-child td{border-bottom:0}

/* Empty and loading states, so an app surface is never a blank rectangle */
.empty-state{display:grid;place-items:center;gap:10px;padding:48px 20px;text-align:center;color:var(--text-muted)}
.skeleton{background:linear-gradient(90deg,var(--border),color-mix(in srgb,var(--border) 40%,transparent),var(--border));
  background-size:200% 100%;animation:joe-shimmer 1.3s linear infinite;border-radius:8px;min-height:14px}
@keyframes joe-shimmer{to{background-position:-200% 0}}

/* Footer that reads as a footer */
footer{background:color-mix(in srgb,var(--text) 4%,var(--surface));border-top:1px solid var(--border);
  padding-block:clamp(32px,4vw,64px);margin-top:clamp(40px,6vw,90px)}
footer a{color:var(--text-muted);text-decoration:none}
footer a:hover{color:var(--brand)}`;
}

/** A drawn icon set — an emoji is not an icon, and a CDN is not an option. */
export function iconSprite(): string {
    const paths: Record<string, string> = {
        check: '<polyline points="20 6 9 17 4 12"/>',
        arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
        star: '<polygon points="12 2 15.1 8.6 22 9.6 17 14.5 18.2 21.5 12 18.2 5.8 21.5 7 14.5 2 9.6 8.9 8.6"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
        code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        chart: '<line x1="4" y1="20" x2="4" y2="10"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="14"/><line x1="22" y1="20" x2="22" y2="8"/>',
        mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/>',
        phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
        pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
        clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
        cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
        menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
        close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    };
    const symbols = Object.entries(paths)
        .map(([id, d]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${d}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols}</svg>`;
}

/** How the model is told to use the primitives. */
export function primitivesBrief(): string {
    return `COMPONENTS available to you (already styled — use them, do not re-invent):
- Icons: <svg class="icon"><use href="#i-NAME"/></svg> where NAME is one of
  check arrow star shield spark users code chart mail phone pin clock cart menu close.
  Wrap a feature icon in <span class="icon-box">…</span>. Never use an emoji as an icon.
- .ruled for feature/spec lists, .steps for numbered how-it-works, details.faq for FAQ
  (no JavaScript needed), .table-wrap around any <table>, .stat for figures, .badge for labels.
- .glass for a panel over a photograph, .tint for a card with a coloured corner,
  .empty-state and .skeleton for app surfaces.`;
}
