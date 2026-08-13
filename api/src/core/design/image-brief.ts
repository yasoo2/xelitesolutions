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
/**
 * A named brand is stricter than a business domain. A photo of any beverage may
 * fit a drinks company, but it is wrong for a page explicitly about Coca-Cola.
 * These terms are carried all the way into the archive subject gate.
 */
const BRAND_LEXICON: Array<{ re: RegExp; terms: string[]; subjects: string[] }> = [
    {
        re: /كوكا\s*كولا|coca[\s-]*cola/i,
        terms: ['coca', 'cola'],
        subjects: ['Coca-Cola bottle', 'Coca-Cola cans', 'Coca-Cola products'],
    },
    {
        re: /بيبسي|pepsi/i,
        terms: ['pepsi'],
        subjects: ['Pepsi bottle', 'Pepsi cans', 'Pepsi products'],
    },
];

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

/**
 * THE FACE FOR EACH TRADE.
 *
 * An avatar slot is a person — a testimonial, a team member, an author. Ranking
 * by shape cannot fix a subject that names no person at all, so a testimonial
 * card asking for "espresso machine" got exactly that: a coffee machine in a
 * circle where a customer's face belongs. The subject itself has to be a person
 * before the search runs.
 */
const PORTRAITS: Array<[RegExp, string]> = [
    [/برمج|سوفت|software|program|code|dev|تقني|تكنولوج|tech/i, 'software engineer portrait'],
    [/استشار|consult|إدارة|ادارة|management/i, 'business consultant portrait'],
    [/قهوة|كافيه|coffee|cafe/i, 'barista portrait'],
    [/مطعم|طعام|restaurant|food|طاه|شيف|chef/i, 'chef portrait'],
    [/طب|صح|عياد|clinic|medical|health|ممرض|nurse/i, 'doctor portrait'],
    [/تعليم|مدرس|معلم|education|teacher|school/i, 'teacher portrait'],
    [/محام|قانون|law|legal/i, 'lawyer portrait'],
    [/مالي|محاسب|finance|account|bank/i, 'accountant portrait'],
    [/هندس|معمار|engineer|architect/i, 'engineer portrait'],
    [/رياض|لياقة|gym|fitness|مدرب|coach|trainer/i, 'fitness trainer portrait'],
    [/أزياء|ازياء|fashion|جمال|beauty|salon|حلاق/i, 'stylist portrait'],
    [/مزرع|زراع|farm|agricultur/i, 'farmer portrait'],
];

/** Words that name a person, so an avatar subject can be checked for one. */
const PERSON = /\b(portrait|person|man|woman|people|face|smiling|team member|founder|customer|client|employee|worker|staff|headshot|owner|doctor|nurse|chef|barista|teacher|student|lawyer|engineer|developer|designer|trainer|coach|stylist|farmer|consultant|accountant|manager)\b/i;

/**
 * NOUNS THE LEXICON ABOVE DOES NOT COVER.
 *
 * The domain table only fires for the sectors it happens to list. A request for
 * «مكتب هندسة معمارية» or «مشتل نباتات» matched nothing, which left `vocabulary`
 * holding only the Latin words the user typed — and for a request written
 * entirely in Arabic, that is NOTHING. `isSpecificEnough` then returned true for
 * every subject on the "nothing to check against" branch, so the whole grounding
 * pass was inert for exactly the requests that needed it most.
 *
 * This is the translation layer: a real Arabic noun mapped to the English a
 * photo archive is actually indexed in. Not a translator — a lookup table, which
 * is honest about being finite and is right about what it does contain.
 */
const NOUN_LEXICON: Array<[RegExp, string]> = [
    [/معمار|عمارة|architect/i, 'architecture building facade'],
    [/هندس|engineer/i, 'engineering site'],
    [/بناء|إنشاء|انشاء|مقاول|construction|contractor/i, 'construction site workers'],
    [/أثاث|اثاث|furniture/i, 'furniture showroom'],
    [/ديكور|interior/i, 'interior design room'],
    [/سيار|مركب|car|auto|vehicle/i, 'car showroom'],
    [/ملابس|أزياء|ازياء|clothing|apparel/i, 'clothing rack boutique'],
    [/مجوهرات|ذهب|jewel|gold/i, 'jewellery close up'],
    [/زهور|ورود|نبات|مشتل|flower|plant|nursery/i, 'flower shop arrangement'],
    [/كتب|مكتبة|نشر|book|library|publish/i, 'bookshelf library'],
    [/طباعة|print/i, 'printing press workshop'],
    [/تصوير|photograph|camera/i, 'photographer camera'],
    [/موسيق|music|studio/i, 'music studio microphone'],
    [/مزرع|زراع|farm|agricultur/i, 'farm field crops'],
    [/شحن|نقل|لوجست|توصيل|logistic|shipping|delivery/i, 'delivery van warehouse'],
    [/مستودع|warehouse/i, 'warehouse shelves'],
    [/تنظيف|نظافة|clean/i, 'cleaning service'],
    [/أمن|امن|حراس|security|guard/i, 'security control room'],
    [/تأمين|تامين|insurance/i, 'insurance paperwork desk'],
    [/طاقة|شمس|solar|energy/i, 'solar panels field'],
    [/بيطر|حيوان|vet|pet|animal/i, 'veterinary clinic pet'],
    [/أطفال|اطفال|حضانة|روضة|kids|children|nursery/i, 'children playing classroom'],
    [/زفاف|أعراس|اعراس|مناسبات|wedding|event/i, 'wedding event hall'],
    [/ألعاب|العاب|gaming|game/i, 'gaming setup screens'],
    [/رحلات|سياح|travel|tour/i, 'travel landscape'],
    [/مصنع|صناع|factory|manufactur|industr/i, 'factory production line'],
    [/مختبر|معمل|lab|research/i, 'laboratory research'],
    [/خياط|نسيج|textile|tailor/i, 'tailor workshop fabric'],
    [/حلويات|مخبز|bakery|pastry|dessert/i, 'bakery pastries'],
    [/عسل|honey|نحل/i, 'honey jars beekeeper'],
];

/**
 * Phrases so generic they return nothing related to any particular business.
 *
 * The whole-string form missed the phrase models actually write. "professional
 * business people in a modern office" is five words of pure stock filler and
 * sailed through, because it is not one of the listed single words. What makes
 * a subject useless is not its length — it is having no content word in it at
 * all, which is what the second test below measures.
 */
const GENERIC = /^(business|office|work|team|people|success|technology|company|meeting|professional|corporate|modern|abstract|background)([\s-]*(people|photo|image|background|concept))?$/i;

/** Words that carry no subject on their own. A phrase made only of these names nothing. */
const FILLER = new Set([
    'business', 'office', 'work', 'working', 'team', 'people', 'person', 'success', 'successful',
    'technology', 'tech', 'company', 'meeting', 'professional', 'professionals', 'corporate',
    'modern', 'abstract', 'background', 'concept', 'photo', 'image', 'picture', 'stock',
    'group', 'happy', 'smiling', 'young', 'beautiful', 'nice', 'good', 'great', 'best',
    'man', 'woman', 'men', 'women', 'guy', 'lady', 'colleagues', 'workplace', 'desk', 'laptop',
]);

export interface ImageBrief {
    /** English subjects grounded in what this business actually does. */
    suggestions: string[];
    /** Terms any query must touch to count as on-topic. */
    vocabulary: string[];
    /** Subjects that name a PERSON, for slots where a face belongs. */
    portraits: string[];
    /** A named brand requested by the user; generic stock must not satisfy it. */
    brandTerms?: string[];
}

export function buildImageBrief(request: string): ImageBrief {
    const r = probeOf(request);
    const suggestions: string[] = [];
    const vocabulary: string[] = [];
    const portraits: string[] = [];
    const brandTerms: string[] = [];

    const learn = (subject: string) => {
        if (!suggestions.includes(subject)) suggestions.push(subject);
        for (const w of subject.split(/\s+/)) {
            const lw = w.toLowerCase();
            if (lw.length > 3 && !vocabulary.includes(lw)) vocabulary.push(lw);
        }
    };

    for (const brand of BRAND_LEXICON) {
        if (!brand.re.test(r)) continue;
        for (const term of brand.terms) if (!brandTerms.includes(term)) brandTerms.push(term);
        for (const subject of brand.subjects) learn(subject);
    }

    for (const [re, subjects] of DOMAIN_LEXICON) {
        if (!re.test(r)) continue;
        for (const s of subjects) learn(s);
    }
    // The nouns the sector table does not cover — without these a request
    // written entirely in Arabic produced an EMPTY vocabulary, and an empty
    // vocabulary means every subject passes unchecked.
    for (const [re, subject] of NOUN_LEXICON) if (re.test(r)) learn(subject);

    for (const [re, face] of PORTRAITS) {
        if (re.test(r) && !portraits.includes(face)) portraits.push(face);
    }

    // Latin words the user wrote themselves (a brand, a product) are on-topic too.
    for (const w of r.match(/[a-z]{4,}/gi) || []) {
        const lw = w.toLowerCase();
        if (!vocabulary.includes(lw)) vocabulary.push(lw);
    }
    return { suggestions: suggestions.slice(0, 12), vocabulary, portraits, brandTerms };
}

/**
 * Is this subject specific enough to search with? A generic phrase is the
 * reason a consultancy ended up illustrated with a military exercise.
 */
export function isSpecificEnough(subject: string, brief: ImageBrief): boolean {
    const s = String(subject || '').trim();
    if (s.length < 6) return false;
    if (GENERIC.test(s)) return false;

    const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

    /**
     * A phrase built ENTIRELY out of filler names nothing, at any length.
     * "professional business people in a modern office" is five words that tell
     * an archive precisely as much as "office" does, and the whole-string test
     * above waves it through because it is not one of the listed single words.
     * This runs before the vocabulary check on purpose: it is true regardless
     * of what the business happens to be.
     */
    if (words.length && words.every(w => FILLER.has(w) || w.length <= 2)) return false;

    // A named brand is non-negotiable: a generic bottle or a construction
    // scene is not an acceptable fallback for a Coca-Cola page.
    // Ignore connectors such as "a" and "in": `cola`.includes('a') must
    // never count as evidence that a construction photograph is Coca-Cola.
    const meaningfulWords = words.filter(w => w.length > 2);
    if (brief.brandTerms?.length && !brief.brandTerms.some(v => meaningfulWords.some(w => w.includes(v) || v.includes(w)))) return false;
    if (!brief.vocabulary.length) return true;      // nothing to check against
    return brief.vocabulary.some(v => words.some(w => w.includes(v) || v.includes(w)));
}

/** Does this subject name a person? An avatar slot that does not is a defect. */
export function namesAPerson(subject: string): boolean {
    return PERSON.test(String(subject || ''));
}

/**
 * The nearest on-topic subject, used when the model writes something generic.
 *
 * SLOT-AWARE, because shape ranking cannot rescue the wrong kind of thing. An
 * avatar is a face — a testimonial, a team member, an author — and a subject
 * that names no person puts a coffee machine in the circle where a customer's
 * portrait belongs. Ranking by aspect ratio happily calls that a perfect
 * square. The subject has to name a person BEFORE the search runs.
 */
export function groundSubject(subject: string, brief: ImageBrief, index: number, slot?: ImageSlot): string {
    if (slot === 'avatar') {
        if (namesAPerson(subject) && isSpecificEnough(subject, brief)) return subject;
        if (brief.portraits.length) return brief.portraits[index % brief.portraits.length];
        // No trade to draw a face from: say "a person", which at least searches
        // for the right KIND of thing, rather than keeping a subject we know is
        // wrong for this slot.
        return namesAPerson(subject) ? subject : 'professional headshot portrait';
    }
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
