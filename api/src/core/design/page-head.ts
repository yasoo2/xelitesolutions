/**
 * What goes in the <head>, decided rather than copied.
 *
 * The section-wise build used `title: request.slice(0, 60)`, so a page Joe
 * shipped carried this in its title bar and in every search result and every
 * bookmark:
 *
 *     ابني صفحة ويب لشركه تكنلوجية اسمها xelitesolutions وهي شركة
 *
 * — the user's instruction to Joe, cut off mid-sentence. A visitor is not
 * supposed to see the prompt. The title has to be composed from what the request
 * is ABOUT, and when nothing can be read out of it, from the page's own kind.
 */

/** Page kinds → a human name for the page, per language. */
const KIND_LABEL: Record<string, { ar: string; en: string }> = {
    landing: { ar: 'الرئيسية', en: 'Home' },
    store: { ar: 'المتجر', en: 'Shop' },
    restaurant: { ar: 'المطعم', en: 'Restaurant' },
    portfolio: { ar: 'أعمالنا', en: 'Portfolio' },
    blog: { ar: 'المدونة', en: 'Blog' },
    dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
    app: { ar: 'التطبيق', en: 'App' },
    about: { ar: 'من نحن', en: 'About' },
    contact: { ar: 'اتصل بنا', en: 'Contact' },
};

/**
 * Words that follow the brand-introducing phrase but are not the brand.
 * «شركة اسمها شركة كذا» happens, and so does "a company called the Acme Group".
 */
const LEAD_NOISE = /^(?:شركة|مؤسسة|متجر|موقع|مطعم|the|a|an)\s+/i;

/**
 * Where a brand name stops. Arabic requests run on — "اسمها xelitesolutions وهي
 * شركة مختصة…" — so the name ends at the first connective, not at the first
 * full stop, which may never come.
 */
const STOP_WORDS = [
    'وهي', 'وهو', 'وهم', 'تعمل', 'يعمل', 'مختصة', 'مختص', 'متخصصة', 'متخصص',
    'تقدم', 'يقدم', 'لبيع', 'للبيع', 'في', 'من', 'على', 'التي', 'الذي', 'و',
    'that', 'which', 'who', 'and', 'for', 'in', 'to', 'specialis', 'specializ', 'working',
];

function trimBrand(raw: string): string {
    let s = String(raw || '').replace(/[.,،؛;:!؟?]+\s*$/, '').trim();
    s = s.replace(LEAD_NOISE, '').trim();
    const words = s.split(/\s+/);
    const out: string[] = [];
    for (const w of words) {
        const bare = w.replace(/[«»"'.,،؛;:!؟?()]/g, '');
        if (!bare) break;
        if (out.length && STOP_WORDS.some(sw => bare.toLowerCase().startsWith(sw) && bare.length <= sw.length + 2)) break;
        out.push(bare);
        // A brand is a name, not a clause.
        if (out.length >= 4) break;
    }
    const brand = out.join(' ').trim();
    return brand.length >= 2 && brand.length <= 40 ? brand : '';
}

/**
 * Read the business name out of the request.
 *
 * Returns '' when the request does not name one. That is the honest answer, and
 * the caller falls back to the page kind — inventing a plausible-looking company
 * name and putting it in the title would be Joe making something up.
 */
export function brandFrom(request: string, _isArabic?: boolean): string {
    const req = String(request || '');

    // 1. Explicitly quoted — the strongest signal, and the one the site builder
    //    already relied on.
    const quoted = req.match(/[«"'“]([^«»"'“”]{2,40})[»"'”]/);
    if (quoted) {
        const b = trimBrand(quoted[1]);
        if (b) return b;
    }

    // 2. Introduced by name: «اسمها X» / «اسمه X» / «تسمى X» / "called X" /
    //    "named X". This is how the request that produced the broken title was
    //    written, and it was not being read at all.
    const introduced = req.match(/(?:اسمها|اسمه|إسمها|إسمه|تسمى|يسمى|باسم|called|named|by the name of)\s+(.{2,60})/i);
    if (introduced) {
        const b = trimBrand(introduced[1]);
        if (b) return b;
    }

    // 3. A bare Latin token in an Arabic request is almost always the brand —
    //    an Arabic speaker writes the company's own spelling of its name.
    if (/[؀-ۿ]/.test(req)) {
        const latin = req.match(/\b[A-Za-z][A-Za-z0-9._-]{2,30}\b/);
        if (latin && !/^(https?|www|html|css|js|api|web)$/i.test(latin[0])) return latin[0];
    }

    return '';
}

/**
 * The document title.
 *
 * Never the request. Brand first when there is one, because that is what a
 * browser tab truncates to and what a bookmark shows.
 */
export function pageTitle(opts: {
    request: string;
    isArabic: boolean;
    kindLabel: string;
    /** For a multi-page site: the name of this page. */
    pageName?: string;
    /** Pass a brand already resolved elsewhere, so a site does not drift. */
    brand?: string;
}): string {
    const { request, isArabic, kindLabel, pageName } = opts;
    const lang = isArabic ? 'ar' : 'en';
    const brand = (opts.brand ?? brandFrom(request, isArabic)).trim();
    const kind = (KIND_LABEL[kindLabel] || KIND_LABEL.landing)[lang];
    const page = (pageName || '').trim();

    const parts = brand
        ? [brand, page || (kindLabel === 'landing' ? '' : kind)]
        : [page || kind];

    const title = parts.filter(Boolean).join(' — ').trim();
    return title.length > 70 ? title.slice(0, 69).trimEnd() + '…' : title;
}
