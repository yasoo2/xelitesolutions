/**
 * What photograph does THIS page need, and where does it go?
 *
 * The complaint was that the pictures had nothing to do with the business. Two
 * causes, both here:
 *
 *   1. The subject was whatever generic phrase the model felt like — "business
 *      people", "office" — so the search had nothing specific to match on. The
 *      page's own vocabulary is now extracted from the brief and every query
 *      must carry a word from it.
 *   2. Every photo was fetched the same way regardless of where it would sit. A
 *      1333x2000 portrait was dropped into a testimonial card and a 2048px
 *      landscape into a 100px logo slot. A slot now states what shape it needs
 *      and candidates are RANKED against it instead of taken first-come.
 */

import { normalizeIntentText } from '../orchestrator/promptNormalizer';

/** The user's words plus their canonical form — one Arabic spelling must not
 *  decide the design. */
function probeOf(request: string): string {
    try { return `${request || ''}\n${normalizeIntentText(request || '')}`; } catch { return String(request || ''); }
}

export type ImageSlot = 'hero' | 'card' | 'avatar' | 'banner' | 'thumb' | 'gallery';

export interface SlotSpec {
    /** Ideal width/height ratio for this position. */
    ratio: number;
    /** Smallest usable width. */
    minWidth: number;
    /** How the photo should fill its box. */
    css: string;
}

export const SLOTS: Record<ImageSlot, SlotSpec> = {
    hero: { ratio: 16 / 9, minWidth: 1400, css: 'width:100%;aspect-ratio:16/9;object-fit:cover' },
    banner: { ratio: 21 / 9, minWidth: 1400, css: 'width:100%;aspect-ratio:21/9;object-fit:cover' },
    card: { ratio: 4 / 3, minWidth: 800, css: 'width:100%;aspect-ratio:4/3;object-fit:cover' },
    gallery: { ratio: 1, minWidth: 700, css: 'width:100%;aspect-ratio:1/1;object-fit:cover' },
    thumb: { ratio: 1, minWidth: 500, css: 'width:100%;aspect-ratio:1/1;object-fit:cover' },
    avatar: { ratio: 1, minWidth: 400, css: 'width:64px;height:64px;border-radius:50%;object-fit:cover' },
};

export function parseSlot(raw: string): { slot: ImageSlot; subject: string } {
    const m = String(raw || '').match(/^\s*(hero|banner|card|gallery|thumb|avatar)\s*\|\s*(.+)$/i);
    if (m) return { slot: m[1].toLowerCase() as ImageSlot, subject: m[2].trim() };
    return { slot: 'card', subject: String(raw || '').trim() };
}

/* ---------- the page's own vocabulary --------------------------------------- */

/** Arabic business terms -> the English a photo archive is actually indexed in. */
const DOMAIN_LEXICON: Array<[RegExp, string[]]> = [
    [/برمج|سوفت|software|program|code|dev/i, ['software developer', 'programming', 'source code', 'laptop coding']],
    [/استشار|consult/i, ['business consultant', 'strategy meeting', 'advisor client meeting']],
    [/توظيف|موظف|hiring|recruit|hr/i, ['job interview', 'recruitment meeting', 'hiring team']],
    [/شركات ناشئة|ستارت|startup/i, ['startup team', 'co-working space', 'young team brainstorming']],
    [/تقني|تكنلوج|تكنولوج|tech|it\b/i, ['technology team', 'server room', 'data centre engineer']],
    [/بيانات|تحليل|data|analytic/i, ['data analysis charts', 'analytics dashboard screen']],
    [/تصميم|design|ui|ux/i, ['designer sketching interface', 'design studio desk']],
    [/تسويق|marketing/i, ['marketing team meeting', 'campaign planning board']],
    [/قهوة|كافيه|coffee|cafe/i, ['barista espresso', 'coffee beans roasting', 'cafe interior']],
    [/مطعم|طعام|restaurant|food/i, ['restaurant kitchen chef', 'plated dish', 'dining room interior']],
    [/متجر|تسوق|shop|store|ecommerce/i, ['retail store shelves', 'product packaging', 'online shopping parcel']],
    [/عقار|real ?estate|property/i, ['modern apartment interior', 'house exterior architecture']],
    [/طب|صح|عياد|clinic|medical|health/i, ['doctor consulting patient', 'medical clinic interior']],
    [/تعليم|مدرس|education|course|school/i, ['classroom students', 'online learning laptop']],
    [/محام|قانون|law|legal/i, ['law office books', 'lawyer meeting client']],
    [/مالي|محاسب|finance|account|bank/i, ['financial charts desk', 'accountant working']],
    [/سفر|سياح|travel|tour|hotel|فندق/i, ['hotel lobby interior', 'traveller airport', 'city skyline']],
    [/رياض|لياقة|gym|fitness|sport/i, ['gym training', 'runner outdoors']],
    [/أزياء|ازياء|fashion|جمال|beauty|salon/i, ['fashion model studio', 'salon interior']],
];

/** Phrases so generic they return nothing related to any particular business. */
const GENERIC = /^(business|office|work|team|people|success|technology|company|meeting|professional|corporate|modern|abstract|background)([\s-]*(people|photo|image|background|concept))?$/i;

export interface ImageBrief {
    /** English subjects grounded in what this business actually does. */
    suggestions: string[];
    /** Terms any query must touch to count as on-topic. */
    vocabulary: string[];
}

export function buildImageBrief(request: string): ImageBrief {
    const r = probeOf(request);
    const suggestions: string[] = [];
    const vocabulary: string[] = [];
    for (const [re, subjects] of DOMAIN_LEXICON) {
        if (!re.test(r)) continue;
        for (const s of subjects) {
            if (!suggestions.includes(s)) suggestions.push(s);
            for (const w of s.split(/\s+/)) if (w.length > 3 && !vocabulary.includes(w)) vocabulary.push(w);
        }
    }
    // Latin words the user wrote themselves (a brand, a product) are on-topic too.
    for (const w of r.match(/[a-z]{4,}/gi) || []) {
        const lw = w.toLowerCase();
        if (!vocabulary.includes(lw)) vocabulary.push(lw);
    }
    return { suggestions: suggestions.slice(0, 12), vocabulary };
}

/**
 * Is this subject specific enough to search with? A generic phrase is the
 * reason a consultancy ended up illustrated with a military exercise.
 */
export function isSpecificEnough(subject: string, brief: ImageBrief): boolean {
    const s = String(subject || '').trim();
    if (s.length < 6) return false;
    if (GENERIC.test(s)) return false;
    if (!brief.vocabulary.length) return true;      // nothing to check against
    const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return brief.vocabulary.some(v => words.some(w => w.includes(v) || v.includes(w)));
}

/** The nearest on-topic subject, used when the model writes something generic. */
export function groundSubject(subject: string, brief: ImageBrief, index: number): string {
    if (isSpecificEnough(subject, brief)) return subject;
    if (!brief.suggestions.length) return subject;
    return brief.suggestions[index % brief.suggestions.length];
}

/* ---------- candidate ranking ------------------------------------------------ */

const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'and', 'or', 'with', 'for', 'to', 'by', 'photo', 'image', 'picture']);

/**
 * Score a candidate for THIS subject in THIS slot. Taking the first acceptable
 * result is why a portrait ended up in a wide card; ranking picks the one that
 * actually fits.
 */
export function scoreCandidate(
    subject: string,
    slot: ImageSlot,
    meta: { title?: string; tags?: any[]; description?: string },
    dim: { width: number; height: number } | null,
): number {
    let score = 0;

    const terms = subject.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));
    const tags = Array.isArray(meta?.tags) ? meta.tags.map((t: any) => String(t?.name ?? t)) : [];
    const hay = [meta?.title, meta?.description, ...tags].join(' ').toLowerCase();
    // Relevance dominates: a beautiful photo of the wrong thing is still wrong.
    let hits = 0;
    for (const t of terms) if (hay.includes(t)) hits++;
    score += terms.length ? (hits / terms.length) * 60 : 30;

    if (dim) {
        const spec = SLOTS[slot];
        const ratio = dim.width / Math.max(1, dim.height);
        // How far off the intended shape, as a proportion — cropping a 16:9 out
        // of a portrait throws most of the picture away.
        const off = Math.abs(Math.log(ratio / spec.ratio));
        score += Math.max(0, 25 - off * 25);
        score += dim.width >= spec.minWidth ? 15 : Math.max(0, (dim.width / spec.minWidth) * 15);
    } else {
        score += 12;   // unknown shape: neither rewarded nor punished
    }
    return score;
}
