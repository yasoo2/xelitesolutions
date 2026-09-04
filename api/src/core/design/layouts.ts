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

export type Archetype = 'split' | 'centered' | 'bento' | 'editorial' | 'showcase' | 'overlap' | 'contrast';

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
    museum: 'showcase',
    generic: 'split',
};

/**
 * Compositions a page of a given kind can wear without breaking.
 *
 * The single default per kind is why every landing page Joe ever built came out
 * as the same arrangement — «لم يستخدم التصاميم العالمية». Two different
 * companies asking for the same kind of page got a pixel-identical skeleton.
 * These are the shapes that suit each kind; which one a request gets is decided
 * below, stably, from the request itself.
 */
const KIND_ALTERNATIVES: Partial<Record<PageKind, Archetype[]>> = {
    landing: ['split', 'overlap', 'contrast', 'centered'],
    generic: ['split', 'overlap', 'centered'],
    portfolio: ['editorial', 'overlap', 'contrast'],
    store: ['showcase', 'bento'],
    restaurant: ['showcase', 'overlap'],
    event: ['centered', 'contrast'],
    blog: ['editorial'],
    docs: ['editorial'],
    museum: ['showcase', 'editorial', 'overlap'],
    dashboard: ['bento'],
    app: ['bento', 'overlap'],
};

/**
 * The request reduced to what it MEANS, for hashing.
 *
 * `probeOf` deliberately keeps the raw text alongside the canonical form, which
 * is right for the keyword tests above — a pattern should match either
 * spelling. It is wrong for a hash: «أريد موقعاً» and «اريد موقعا» are the same
 * brief, and hashing the raw text handed them two different compositions.
 * Re-typing your own request with a hamza on it is not a request for a
 * redesign.
 */
export function canonicalForHash(text: string): string {
    return String(text || '')
        .replace(/[\u064B-\u0652\u0670\u0640]/g, '')   // diacritics and tatweel
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLowerCase();
}

export function hashOf(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = text.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h);
}

export function pickArchetype(kind: PageKind, request: string): Archetype {
    // An explicit ask wins over the default for the page type.
    const r = probeOf(request);
    if (/بسيط|مينمال|minimal|clean/i.test(r)) return 'centered';
    if (/مجل|editorial|magazine|مقالات/i.test(r)) return 'editorial';
    if (/بينتو|bento|لوحات/i.test(r)) return 'bento';
    if (/متداخل|طبقات|overlap|layered|عصري|modern layout/i.test(r)) return 'overlap';
    if (/جريء|جريئ|صارخ|تباين|bold|brutal|high[- ]contrast|striking/i.test(r)) return 'contrast';

    /**
     * Nothing named: pick from the shapes this KIND can wear, stably from the
     * request. Stable matters — re-running the same brief must give the same
     * page, or an edit turns into a redesign. Different matters too: it is the
     * difference between a system and a template.
     */
    const options = KIND_ALTERNATIVES[kind];
    if (options && options.length) return options[hashOf(canonicalForHash(request)) % options.length];
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
  text-transform:uppercase;color:var(--brand-text,var(--brand));margin-bottom:12px}
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
.card{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:clamp(20px,2.4vw,30px);box-shadow:var(--shadow-sm)}
.card-media{margin:calc(-1 * clamp(20px,2.4vw,30px));margin-bottom:20px;overflow:hidden;
  border-radius:var(--radius-lg) var(--radius-lg) 0 0}
.stack{display:flex;flex-direction:column;gap:var(--space-4)}
.row{display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap}
.divider{height:1px;background:linear-gradient(90deg,transparent,var(--border),transparent);border:0}

/* Full-bleed band, used to break the rhythm between sections */
.band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand);
  padding-block:clamp(40px,6vw,90px)}
.band .lede,.band .eyebrow,.band .stat span,.band .stat-label{color:color-mix(in srgb,var(--on-brand) 82%,transparent)}
.band .stat b,.band .stat-value{color:var(--on-brand)}
/* A ghost button is the brand colour as text. On a BRAND gradient that is the
   brand on itself — measured by Joe's own audit at 1.6:1 on six of the seven
   compositions, because a band tinted its prose and left its buttons alone. */
.band .btn-ghost{color:var(--on-brand);border-color:color-mix(in srgb,var(--on-brand) 45%,transparent)}
.band .btn-ghost:hover{color:var(--on-brand);border-color:var(--on-brand);
  background:color-mix(in srgb,var(--on-brand) 14%,transparent)}

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

        /**
         * OVERLAP — the studio look: a panel lifted over the image it sits on,
         * and an asymmetric grid that refuses the centred column.
         *
         * Every archetype above puts its elements side by side or one under the
         * other. None of them lets anything cross anything else, which is the
         * single move that separates a designed page from a stack of boxes —
         * and the reason «كل الصفحات تبدو متشابهة».
         *
         * The overlap is a NEGATIVE MARGIN, applied only from 900px up. On a
         * phone the panel simply follows the image, because a card pulled up
         * over a 340px-tall photo covers it entirely.
         */
        overlap: `
.hero{padding-block:clamp(40px,5vw,72px) 0}
.hero h1{font-size:var(--step-5);letter-spacing:-.035em;margin-bottom:var(--space-4)}
.hero-media img{width:100%;border-radius:var(--radius-lg);box-shadow:var(--shadow-lg)}
.hero-panel{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:clamp(24px,3vw,42px);box-shadow:var(--shadow-lg);margin-top:var(--space-6)}
@media(min-width:900px){
  .hero-panel{margin-top:clamp(-140px,-9vw,-64px);margin-inline-end:auto;width:min(560px,66%);
    position:relative;z-index:2}
}
/* Rows that step, rather than sit in a rectangle. */
.stagger{display:grid;gap:clamp(20px,3vw,40px);grid-template-columns:1fr}
@media(min-width:860px){
  .stagger{grid-template-columns:repeat(2,1fr);align-items:start}
  .stagger > *:nth-child(even){margin-top:clamp(28px,4vw,72px)}
}
.feature-row{display:grid;gap:clamp(24px,4vw,56px);align-items:center;grid-template-columns:1fr}
@media(min-width:900px){.feature-row{grid-template-columns:1fr 1fr}
  .feature-row:nth-of-type(even) .feature-media{order:-1}}`,

        /**
         * CONTRAST — hard edges, oversized type, full-bleed dark bands.
         *
         * The opposite end of the range from `centered`, and the one shape the
         * kit had nothing like: everything Joe built was soft — rounded, tinted,
         * shadowed. A brand that wants to look decisive had no composition to
         * ask for.
         *
         * The dark band uses the palette's OWN dark tokens, so a page in this
         * shape is still one palette rather than a light page with black boxes
         * dropped on it, and the text on it is the token already proven
         * readable against that surface.
         */
        contrast: `
.hero{padding-block:clamp(56px,9vw,140px);background:var(--text);color:var(--bg);
  border-radius:0}
.hero h1{font-size:clamp(2.6rem,9vw,5.5rem);letter-spacing:-.045em;line-height:.98;
  text-transform:none;max-width:16ch}
.hero .lede{color:color-mix(in srgb,var(--bg) 82%,var(--text));max-width:52ch}
.hero .btn{border-radius:0}
.hero-actions{display:flex;gap:var(--space-3);flex-wrap:wrap;margin-top:var(--space-8)}
/* Alternating bands, so the page has a rhythm you can feel while scrolling. */
.band{background:var(--text);color:var(--bg);border-radius:0}
.band .card{background:transparent;border-color:color-mix(in srgb,var(--bg) 26%,transparent);
  color:inherit;box-shadow:none}
/* The common layer tints a band's lede with --on-brand, which is WHITE. On this
   band — which is var(--text) — that is right in light mode and invisible in
   dark, where --text is the near-white one. Tied to the same pair as the band
   itself, it inverts with it instead of fighting it. */
.band .lede,.band .eyebrow,.band .stat span,.band .stat-label{color:color-mix(in srgb,var(--bg) 82%,var(--text))}
.band .stat b,.band .stat-value{color:var(--bg)}
/* A ghost button is --brand on a light page. Dropped on an inverted block it is
   a mid-blue on near-black, which is the "secondary action nobody can read"
   defect this kit keeps finding. On these two surfaces it takes the surface's
   own foreground. */
.hero .btn-ghost,.band .btn-ghost{color:var(--bg);
  border-color:color-mix(in srgb,var(--bg) 45%,transparent)}
.hero .btn-ghost:hover,.band .btn-ghost:hover{border-color:var(--bg);
  background:color-mix(in srgb,var(--bg) 14%,transparent);color:var(--bg)}
.section:nth-of-type(even) > .wrap > .section-head h2{letter-spacing:-.03em}
.card{border-radius:0;box-shadow:none;border-width:1.5px}
.btn{border-radius:0}
.rule{border:0;border-top:1.5px solid var(--text);margin-block:clamp(32px,5vw,64px)}
/* A number that is meant to be read from across the room. */
.stat-value{font-size:clamp(2.4rem,6vw,4rem);letter-spacing:-.04em}`,
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

/**
 * Faces that suit any subject, so a brief the sector table does not recognise
 * still gets a considered pairing rather than the same neutral one every time.
 */
const GENERAL_PAIRS: TypePair[] = [
    DEFAULT_PAIR,
    { display: `'Georgia','Charter','Amiri','Noto Naskh Arabic',serif`, body: `'Segoe UI','Noto Sans Arabic',system-ui,sans-serif`, note: 'serif headline, sans body' },
    { display: `'Trebuchet MS','Segoe UI','Noto Kufi Arabic',system-ui,sans-serif`, body: `'Georgia','Amiri','Noto Naskh Arabic',serif`, note: 'sans headline, serif reading' },
    { display: `'Segoe UI Semibold','Segoe UI','Noto Kufi Arabic',system-ui,sans-serif`, body: `'Segoe UI','Noto Sans Arabic',system-ui,sans-serif`, note: 'quiet and even' },
    { display: `'Palatino Linotype','Book Antiqua','Amiri','Noto Naskh Arabic',serif`, body: `'Segoe UI','Noto Sans Arabic',system-ui,sans-serif`, note: 'humanist serif' },
];

/**
 * The type pairing for this brief.
 *
 * A sector match still wins — a law firm gets the serif and a clinic gets the
 * calm sans, because that is a real design decision and not a preference. What
 * changed is the fallback: it used to be ONE pairing for every brief the table
 * did not recognise, which is a third of the reason «يعطي نفس التصميم في كل
 * مرّة». Now an unrecognised brief chooses among faces that all suit it,
 * stably, so two of them do not look like the same company.
 */
export function pickTypePair(request: string): TypePair {
    const r = probeOf(request);
    for (const p of PAIRS) if (p.re.test(r)) return p.pair;
    return GENERAL_PAIRS[hashOf(canonicalForHash(request)) % GENERAL_PAIRS.length];
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
/**
 * The surfaces Joe INVERTS, re-stated after the model's own stylesheet.
 *
 * The base layer is injected at the top of the style block on purpose, so
 * anything the model wrote still wins. That is right for almost everything and
 * catastrophic for the two surfaces whose background and text colour are a
 * SINGLE decision:
 *
 *   `.band` is a full-bleed contrasting block — a brand gradient carrying
 *   var(--on-brand), which is white. A model that writes `.band{background:#f1f5f9}`
 *   keeps the white text and every word on that band disappears. Measured in a
 *   browser: 1.04:1. It is not archetype-specific; it is every page with a band
 *   on it, which is every page the layout brief asks for one.
 *
 *   `.hero` in the `contrast` composition is the same shape of problem, and
 *   worse, because inversion IS that composition. A model hero gradient over it
 *   measured 1.0:1 — literally white on white, a blank screen.
 *
 * So these are re-stated last, at doubled-class specificity so a plausible
 * `section.band` cannot outrank them. This is the same exception `darkFirstCss`
 * already makes and it is made for the same reason: invisible text is never a
 * creative choice, and a class the kit defines has to keep meaning what the kit
 * says it means. A model that wants a differently coloured block has every
 * other selector in the document to do it with.
 */
export function ownedSurfaces(a: Archetype): string[] {
    // `.band` always: a contrasting block whose contrast has been painted out is
    // not a band. `.hero` only where the composition IS the inversion.
    return a === 'contrast' ? ['.band', '.hero'] : ['.band'];
}

export function surfacePairingCss(a: Archetype): string {
    const inverted = a === 'contrast';
    const band = inverted
        ? 'background:var(--text);color:var(--bg)'
        : 'background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand)';
    /**
     * The hero rules carry DOUBLED specificity on every descendant, not only on
     * the container. When a model hardcodes a hero background, the HTML repair
     * re-pairs that surface's subtree — `.hero h1`, `.hero .lede` and so on — and
     * those rules would otherwise outrank plain inheritance from `.hero.hero`,
     * painting dark text back onto this deliberately dark hero.
     */
    const heroBlock = inverted ? `
.hero.hero{background:var(--text);color:var(--bg)}
.hero.hero h1,.hero.hero h2,.hero.hero h3,.hero.hero p,.hero.hero li{color:var(--bg)}
.hero.hero .lede,.hero.hero .eyebrow{color:color-mix(in srgb,var(--bg) 82%,var(--text))}
.hero.hero .btn-ghost{color:var(--bg);border-color:color-mix(in srgb,var(--bg) 45%,transparent)}` : '';

    return `/* Joe surface pairing — a background and its text colour are one decision */
.band.band{${band}}${heroBlock}`.trim();
}

/**
 * Injects the pairing as ONE addressable, idempotent block.
 *
 * It used to be appended into "the last </style>" on every write. Two measured
 * failures came out of that: (1) after the first contrast repair, the last
 * style block IS <style id="joe-contrast-fix"> — a block that repair rebuilds
 * from scratch, so the pairing landed inside it and was WIPED on the next
 * repair round, taking the band's readability with it; (2) nothing removed the
 * previous copy, so every edit appended another — a shipped styles.css carried the
 * same .band.band rule three times. One named block, rebuilt in place, ends
 * both.
 */
export function applySurfacePairing(html: string, a: Archetype): string {
    let out = String(html || '');
    out = out.replace(/<style id="joe-surface-pairing">[\s\S]*?<\/style>\n?/g, '');
    // …and sweep the legacy inline copies this bug already planted in pages
    // built before the block existed (including inside joe-contrast-fix).
    out = out.replace(/\/\* Joe surface pairing[^*]*\*\/\s*\.band\.band\{[^}]*\}(?:\s*\.hero\.hero[^{]*\{[^}]*\})*\n?/g, '');
    const block = `<style id="joe-surface-pairing">\n${surfacePairingCss(a)}\n</style>`;
    if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${block}\n</head>`);
    const last = out.lastIndexOf('</style>');
    if (last >= 0) return out.slice(0, last + '</style>'.length) + `\n${block}` + out.slice(last + '</style>'.length);
    return `${block}\n${out}`;
}

export function layoutBrief(a: Archetype, t: TypePair): string {
    const shape: Record<Archetype, string> = {
        split: 'The hero is SPLIT: copy on one side, a photograph on the other. Use <section class="hero aura"><div class="wrap hero-split"><div>…copy…</div><div class="hero-media"><img …></div></div></section>. Feature sections use .feature-row, which alternates image side automatically.',
        centered: 'The hero is CENTERED: one strong statement, a lede, then the actions, then one wide image below. Use <section class="hero aura"><div class="wrap"><h1>…</h1><p class="lede">…</p><div class="hero-actions">…</div><div class="hero-media"><img …></div></div></section>.',
        bento: 'The page is a BENTO of tiles of different weights. Use <div class="bento"> with .card children; the widths vary automatically, so do not set your own column spans.',
        editorial: 'The page is EDITORIAL: a measured reading column (.prose, max 68ch) with figures breaking the rhythm, and .masonry for any gallery.',
        showcase: 'The hero is a full-bleed SHOWCASE banner with the photograph behind the copy. Use <section class="hero"><div class="hero-bg"><img …></div><div class="wrap hero-copy"><h1>…</h1>…</div></section>. Product/menu grids use .showcase-grid.',
        overlap: 'The hero OVERLAPS: a wide photograph, then a panel lifted over its lower edge. Use <section class="hero"><div class="wrap"><h1>…</h1><p class="lede">…</p></div><div class="wrap hero-media"><img …></div><div class="wrap"><div class="hero-panel">…the key points or the form…</div></div></section>. Use .stagger instead of .grid-2 where two columns should step past each other. Do NOT add your own negative margins.',
        contrast: 'The page is HIGH CONTRAST: the hero is a solid dark block with oversized type, and full-bleed <section class="section band"> blocks alternate with plain ones down the page. Use <section class="hero"><div class="wrap"><h1>…</h1><p class="lede">…</p><div class="hero-actions">…</div></div></section>. Corners are square by design — never add a border-radius.',
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
details.faq{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);
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
        /**
         * The vocabulary of an admin screen. A real dashboard build shipped
         * `<use href="#i-search"/>` in its header — the model reached for the
         * obvious name and the sprite did not have it, so the search button
         * rendered as an empty square. These are the names models actually
         * write on dashboards, stores and app UIs, measured from real builds.
         */
        search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.3" y2="16.3"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
        heart: '<path d="M12 21s-7.5-4.8-9.5-9A5.4 5.4 0 0 1 12 6.6 5.4 5.4 0 0 1 21.5 12c-2 4.2-9.5 9-9.5 9z"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
        home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
        plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
        trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
        eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
        lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        filter: '<polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
        globe: '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
        box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><polyline points="3 8 12 13 21 8"/><line x1="12" y1="13" x2="12" y2="21"/>',
        truck: '<rect x="1" y="5" width="14" height="11" rx="1"/><path d="M15 8h4l3 3v5h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
        wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="15" r="1"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
        refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2-9.4L23 10"/>',
        warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17.01"/>',
        info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="8.01"/>',
        /**
         * Social marks. Every footer the model writes carries facebook/twitter/
         * linkedin/instagram <use> refs, and the sprite had none of them — four
         * invisible links per page, on every page. Seen in a real build.
         */
        facebook: '<path d="M15 8h2V5h-2a4 4 0 0 0-4 4v2H9v3h2v7h3v-7h2.2l.8-3H14V9a1 1 0 0 1 1-1z"/>',
        twitter: '<path d="M4 4l16 16M20 4L4 20"/>',
        x: '<path d="M4 4l16 16M20 4L4 20"/>',
        linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 11v5M8 8v.01M12 16v-3a2 2 0 0 1 4 0v3"/>',
        instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M16.8 7.2v.01"/>',
        whatsapp: '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M9 8.5c0 4 2.5 6.5 6.5 6.5l.5-2-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z"/>',
        youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><polygon points="10 9 16 12 10 15"/>',
    };
    const symbols = Object.entries(paths)
        .map(([id, d]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${d}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols}</svg>`;
}

/**
 * Point <use> refs at symbols that exist. Models write href="#check" and
 * href="#facebook" — the sprite's ids are #i-check and #i-facebook, so every
 * such icon rendered as nothing. Only KNOWN names are rewritten; an anchor to
 * a page section is untouched because <use> is the only element rewritten.
 */
export function normalizeIconRefs(html: string): { html: string; fixed: number } {
    const known = new Set(['check', 'arrow', 'star', 'shield', 'spark', 'users', 'code', 'chart', 'mail', 'phone',
        'pin', 'clock', 'cart', 'menu', 'close', 'facebook', 'twitter', 'x', 'linkedin', 'instagram', 'whatsapp', 'youtube',
        'search', 'user', 'heart', 'settings', 'home', 'plus', 'minus', 'trash', 'edit', 'eye', 'lock', 'bell',
        'calendar', 'filter', 'download', 'upload', 'globe', 'box', 'truck', 'wallet', 'logout', 'refresh', 'warning', 'info']);
    let fixed = 0;
    let out = String(html).replace(/(<use\b[^>]*?href=")#(?!i-)([a-z-]+)(")/gi, (full, pre, name, post) => {
        if (!known.has(String(name).toLowerCase())) return full;
        fixed++;
        return `${pre}#i-${String(name).toLowerCase()}${post}`;
    });
    // A bare <use> outside an <svg> renders NOTHING — the model writes
    // <span class="icon"><use …></use></span> and the browser ignores it.
    out = out.replace(/(<span class="icon">)\s*(<use\b[^>]*>\s*<\/use>)\s*(<\/span>)/gi, (_full, _pre, use) => {
        fixed++;
        return `<svg class="icon">${use}</svg>`;
    });
    return { html: out, fixed };
}

/** How the model is told to use the primitives. */
export function primitivesBrief(): string {
    return `COMPONENTS available to you (already styled — use them, do not re-invent):
- Icons: <svg class="icon"><use href="#i-NAME"/></svg> where NAME is one of
  check arrow star shield spark users code chart mail phone pin clock cart menu close
  search user heart settings home plus minus trash edit eye lock bell calendar filter
  download upload globe box truck wallet logout refresh warning info.
  Every icon-only <button> or <a> MUST carry an aria-label naming its action.
  Wrap a feature icon in <span class="icon-box">…</span>. Never use an emoji as an icon.
- .ruled for feature/spec lists, .steps for numbered how-it-works, details.faq for FAQ
  (no JavaScript needed), .table-wrap around any <table>, .stat for figures, .badge for labels.
- .glass for a panel over a photograph, .tint for a card with a coloured corner,
  .empty-state and .skeleton for app surfaces.`;
}
