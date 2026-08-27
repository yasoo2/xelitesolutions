/**
 * DESIGN IS SYNTHESISED, NOT CHOSEN FROM A LIST.
 *
 * The owner, after being shown seven layout archetypes wired into the project
 * generator: «You are putting Joe inside limits and imprisoning him. It makes
 * no sense for a system as large as Joe to own seven designs while you assign
 * each design to a particular prompt.»
 *
 * He is right, and the criticism lands on the fourth law he wrote himself:
 * «Joe builds from the request, not from the catalogue.» A table of seven
 * names IS a catalogue. Connecting it was not a root fix; it moved the same
 * defect one layer up. Every request still landed on one of seven pages, and
 * the eighth business he describes tomorrow was never on the list.
 *
 * WHAT A DESIGN ACTUALLY IS
 *
 * Not a name. A set of decisions, each of which has a RANGE:
 *
 *     rhythm      how much air between things
 *     measure     how wide a line of text is allowed to run
 *     split       where the fold falls in a two-part composition
 *     align       whether the eye starts at the edge or the middle
 *     radius      how sharp the geometry is
 *     weight      how heavy the rules and borders are
 *     elevation   whether surfaces sit flat or lift
 *     accent      how emphasis is marked — a rail, an underline, a block
 *     density     how tightly the whole thing is packed
 *     texture     whether the ground has a surface at all
 *
 * Ten decisions, each derived from HIS words, is not seven pages. It is a
 * space, and two requests land in the same spot only if they are the same
 * request. That is the difference between a design system and a template
 * gallery — and it needs no model in the critical path, so the same brief
 * still rebuilds the same page exactly.
 *
 * HOW EACH DECISION IS DERIVED, AND WHY IT IS NOT A CATALOGUE
 *
 * Two inputs, in this order:
 *
 *   1. WHAT HE SAID. «بسيط» means more air and a narrower measure. «جريء»
 *      means heavier rules and sharper corners. These are not subject → style
 *      mappings; they are the words for the decisions themselves, and reading
 *      them is reading the request.
 *
 *   2. THE REQUEST'S OWN FINGERPRINT, for every decision he did not speak to.
 *      A different salt per dimension, so «coffee roastery» and «law office»
 *      differ on rhythm AND radius AND accent independently, rather than
 *      moving together as one slider. Stable, because the hash is over his
 *      own sentence: re-running a brief rebuilds it, and an edit is an edit
 *      rather than a redesign.
 *
 * ⛔ AND THE RANGES ARE THE GUARDRAIL. Synthesis without bounds produces
 * unreadable pages, which is worse than repetitive ones. Every range below is
 * a band a designer would work inside; the freedom is where in the band this
 * request falls, never whether to leave it.
 */

import { normalizeIntentText } from '../orchestrator/promptNormalizer';

export interface DesignGenome {
    /** Base spacing step in px — everything else is a multiple. */
    rhythm: number;
    /** Reading measure in ch. */
    measure: number;
    /** Where a two-part composition folds, 0..1 of the width. */
    split: number;
    align: 'start' | 'center';
    radius: number;
    /** Rule and border weight in px. */
    weight: number;
    elevation: 'flat' | 'soft' | 'lifted';
    accent: 'rail' | 'underline' | 'block' | 'bare';
    density: 'airy' | 'normal' | 'tight';
    texture: 'none' | 'grain' | 'grid';
    /** Section padding multiplier, derived from rhythm and density. */
    sectionSpace: number;
    /** What the request said out loud, for the record. */
    spoken: string[];
}

/** His words plus their canonical form — one spelling must not decide a design. */
function probe(request: string): string {
    try { return `${request || ''}\n${normalizeIntentText(request || '')}`; } catch { return String(request || ''); }
}

/**
 *  A stable number in [0,1) from his sentence and a named dimension.
 *
 *  The salt is what makes ten decisions ten decisions. Hashing the request
 *  once and reusing it would move every dimension together, and a design
 *  whose ten knobs are one knob is seven templates again with extra steps.
 */
function dial(request: string, dimension: string): number {
    const text = `${dimension}::${request}`;
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
}

/** Pick a value inside a band, at the position his request lands on. */
function within(request: string, dimension: string, lo: number, hi: number, step = 1): number {
    const raw = lo + dial(request, dimension) * (hi - lo);
    return Math.round(raw / step) * step;
}

function oneOf<T>(request: string, dimension: string, options: readonly T[]): T {
    return options[Math.floor(dial(request, dimension) * options.length) % options.length];
}

/**
 *  Words that name a DECISION, not a subject.
 *
 *  «بسيط» does not say what the business is; it says how much air the page
 *  should have. That is why reading these is reading the request and not
 *  consulting a catalogue: the list is of design vocabulary, which is finite,
 *  not of businesses, which are not.
 */
const SPOKEN: Array<{ says: RegExp; name: string; apply: (g: DesignGenome) => void }> = [
    {
        says: /بسيط|بساطة|مينمال|minimal|clean|uncluttered/i, name: 'minimal',
        apply: g => { g.density = 'airy'; g.rhythm = Math.max(g.rhythm, 8); g.weight = 1; g.elevation = 'flat'; g.texture = 'none'; g.measure = Math.min(g.measure, 66); },
    },
    {
        says: /جريء|جريئ|صارخ|قوي|bold|striking|brutal|loud/i, name: 'bold',
        apply: g => { g.weight = 3; g.radius = Math.min(g.radius, 4); g.accent = 'block'; g.elevation = 'flat'; g.density = 'tight'; },
    },
    {
        //  ⛔ A RULE WITH ONE SIDE IS NOT A RULE. If «warm» steers the palette,
        //  «cool» must steer it the other way — otherwise a man who asks for a
        //  cold, clinical look is answered by a hash of his own sentence.
        says: /بارد|هادئ\s*الألوان|\bcool\b|\bcrisp\b|clinical/i, name: 'cool',
        apply: () => { /* read by the palette; the dials are unaffected */ },
    },
    {
        says: /دافئ|حميم|warm|cosy|cozy|homely/i, name: 'warm',
        apply: g => { g.radius = Math.max(g.radius, 14); g.texture = 'grain'; g.elevation = 'soft'; },
    },
    {
        says: /فاخر|أنيق|انيق|راقي|luxury|elegant|premium|refined/i, name: 'elegant',
        apply: g => { g.rhythm = Math.max(g.rhythm, 9); g.measure = Math.min(g.measure, 62); g.weight = 1; g.accent = 'underline'; g.density = 'airy'; },
    },
    {
        says: /مرح|حيوي|شبابي|playful|fun|vibrant|energetic/i, name: 'playful',
        apply: g => { g.radius = Math.max(g.radius, 18); g.elevation = 'lifted'; g.accent = 'block'; },
    },
    {
        says: /رسمي|مؤسسي|جاد|formal|corporate|serious|professional/i, name: 'formal',
        apply: g => { g.align = 'start'; g.accent = 'rail'; g.radius = Math.min(g.radius, 8); g.texture = 'grid'; },
    },
    {
        says: /مركز|بالوسط|centered|symmetric|متناظر/i, name: 'centered',
        apply: g => { g.align = 'center'; g.split = 0.5; },
    },
    {
        says: /مزدحم|كثيف|dense|compact|information[- ]dense/i, name: 'dense',
        apply: g => { g.density = 'tight'; g.rhythm = Math.min(g.rhythm, 5); g.measure = Math.max(g.measure, 72); },
    },
];

export function composeDesign(request: string): DesignGenome {
    const r = probe(request);

    //  Every dimension lands where HIS sentence lands inside a band a
    //  designer would work in. The bands are the only limit.
    const g: DesignGenome = {
        rhythm: within(r, 'rhythm', 4, 10),
        measure: within(r, 'measure', 56, 76),
        split: Math.round(within(r, 'split', 34, 66) ) / 100,
        align: oneOf(r, 'align', ['start', 'start', 'center'] as const),
        radius: within(r, 'radius', 0, 22, 2),
        weight: within(r, 'weight', 1, 3),
        elevation: oneOf(r, 'elevation', ['flat', 'soft', 'lifted'] as const),
        accent: oneOf(r, 'accent', ['rail', 'underline', 'block', 'bare'] as const),
        density: oneOf(r, 'density', ['airy', 'normal', 'normal', 'tight'] as const),
        texture: oneOf(r, 'texture', ['none', 'none', 'grain', 'grid'] as const),
        sectionSpace: 1,
        spoken: [],
    };

    //  …and what he SAID overrides what the fingerprint guessed. His words are
    //  the authority; the dials only answer where he was silent.
    for (const s of SPOKEN) {
        if (s.says.test(r)) { s.apply(g); g.spoken.push(s.name); }
    }

    g.sectionSpace = g.density === 'airy' ? 1.35 : g.density === 'tight' ? 0.78 : 1;
    return g;
}

/** The genome as CSS custom properties and the rules that read them. */
/**
 *  ⛔ THE TEMPERATURE HE ASKED FOR, READ BY THE ONE READER THAT ALREADY
 *  READS HIS DESIGN WORDS.
 *
 *  Measured on the store the owner called the worst he had seen:
 *
 *      composeDesign(request)  ->  spoken: ['warm', 'elegant']
 *      buildPalette(request)   ->  hue: 183   (#187b81)
 *
 *  A honey shop described as «دافئ وفاخر» was painted in cold teal. The
 *  composer read his words correctly; the palette picked a hue without ever
 *  asking it. Two readers of the same sentence, and only one of them heard
 *  that part — the class this session has met ten times.
 *
 *  Exported rather than reimplemented: a second warmth reader in the palette
 *  would BE the defect, one layer down. The vocabulary lives in SPOKEN and
 *  nowhere else.
 */
export function temperatureAsked(request: string): 'warm' | 'cool' | null {
    const spoken = composeDesign(request).spoken;
    if (spoken.includes('warm')) return 'warm';
    if (spoken.includes('cool')) return 'cool';
    return null;
}

export function composedCss(g: DesignGenome): string {
    const pad = Math.round(g.rhythm * 6 * g.sectionSpace);
    const gap = Math.round(g.rhythm * 2.5);
    const shadow = g.elevation === 'flat'
        ? 'none'
        : g.elevation === 'soft'
            ? '0 1px 2px rgb(15 23 42 / .05), 0 8px 24px -12px rgb(15 23 42 / .12)'
            : '0 2px 4px rgb(15 23 42 / .06), 0 18px 40px -16px rgb(15 23 42 / .22)';

    /**
     *  ⛔ EVERY SELECTOR HERE IS ONE THE GENERATOR ACTUALLY WRITES.
     *
     *  The first version of this stylesheet styled `.section`, `.section-head`,
     *  `.split` and `.stack`. Counted in the file that writes the markup:
     *  wrap 11, panel 32, product 3, eyebrow 1 -- and section 0, section-head
     *  0, split 0, stack 0.
     *
     *  So a design composed from ten decisions had half of it landing on
     *  selectors nothing wears. Every measurement of the genome would still
     *  have said a hundred distinct designs, because the genome IS distinct --
     *  it simply never reached the screen. That is this session's most common
     *  class, committed while closing it: a capability that exists and a
     *  reader that never asks.
     *
     *  The guard beside this file reads both sides and refuses a rule written
     *  for something that does not exist.
     */
    const accentRule =
        g.accent === 'rail'
            ? `.panel > h2,.panel > h3{border-inline-start:${g.weight + 2}px solid var(--brand);padding-inline-start:${gap}px}`
            : g.accent === 'underline'
                ? `.panel > h2,.panel > h3{padding-bottom:${Math.round(g.rhythm * 0.8)}px;border-bottom:${g.weight}px solid var(--brand)}`
                : g.accent === 'block'
                    ? `.eyebrow{background:var(--brand);color:var(--on-brand);padding:${Math.round(g.rhythm * 0.5)}px ${gap}px;border-radius:${Math.max(0, g.radius - 6)}px}`
                    : `.eyebrow{color:var(--brand-text,var(--brand))}`;

    const textureRule =
        g.texture === 'grain'
            ? `body::after{content:"";position:fixed;inset:0;z-index:60;pointer-events:none;opacity:.045;mix-blend-mode:multiply;background-image:url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}`
            : g.texture === 'grid'
                ? `body::after{content:"";position:fixed;inset:0;z-index:60;pointer-events:none;opacity:.05;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:${g.rhythm * 8}px ${g.rhythm * 8}px}`
                : '';

    return `
/*  Joe composed this page. It was not chosen from a list.
 *  spoken: ${g.spoken.length ? g.spoken.join(' ') : '(nothing — every dial from his own sentence)'}
 *  rhythm ${g.rhythm} · measure ${g.measure}ch · split ${g.split} · align ${g.align}
 *  radius ${g.radius}px · weight ${g.weight}px · ${g.elevation} · ${g.accent} · ${g.density} · ${g.texture}  */
:root{
  --rhythm:${g.rhythm}px; --measure:${g.measure}ch; --split:${g.split};
  --radius-composed:${g.radius}px; --rule:${g.weight}px; --gap:${gap}px;
  --section-space:${pad}px; --elevation:${shadow};
}
.wrap{width:min(100% - 2rem,var(--maxw,1180px));margin-inline:auto}
main > section{padding-block:calc(var(--section-space) * .5)}
main > section > h2,.panel > h2{max-width:var(--measure);${g.align === 'center' ? 'margin-inline:auto;text-align:center' : ''}}
p,li{max-width:var(--measure)}
.panel,.product{border-radius:var(--radius-composed);border:var(--rule) solid var(--line,#e5e5e5);box-shadow:var(--elevation)}
.products{display:grid;gap:var(--gap)}
@media (min-width:900px){.products{grid-template-columns:repeat(auto-fill,minmax(calc(var(--split) * 520px),1fr))}}
${accentRule}
${textureRule}`.trim();
}
