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
    'that', 'which', 'who', 'and', 'for', 'in', 'to', 'not', 'without', 'but', 'rather', 'specialis', 'specializ', 'working',
];

function trimBrand(raw: string): string {
    // Markdown emphasis/code markers are presentation syntax, not part of the
    // product identity.  A request such as `called **WeatherGo**, not a mockup`
    // must resolve to `WeatherGo`; otherwise the asterisks survive into the
    // folder slug and the following clause can make the builder fall back to a
    // generic MyApp identity.
    let s = String(raw || '').replace(/[.,،؛;:!؟?]+\s*$/, '').trim();
    s = s.replace(/^[*_~`]+|[*_~`]+$/g, '').trim();
    s = s.replace(LEAD_NOISE, '').trim();
    const words = s.split(/\s+/);
    const out: string[] = [];
    const isLatin = (w: string) => /^[A-Za-z0-9._'&-]+$/.test(w);
    for (const w of words) {
        const bare = w.replace(/[«»"'.,،؛;:!؟?()]/g, '').replace(/^[*_~`]+|[*_~`]+$/g, '');
        if (!bare) break;
        if (out.length && STOP_WORDS.some(sw => bare.toLowerCase().startsWith(sw) && bare.length <= sw.length + 2)) break;
        // A NAME DOES NOT CHANGE SCRIPT MIDWAY. «اسمها xelitesolutions مع صفحة
        // من نحن» gave the brand as "xelitesolutions مع صفحة" and put it in the
        // page title, because the walk just kept taking words. A Latin brand
        // followed by an Arabic word is the sentence resuming, not more name.
        if (out.length && isLatin(out[out.length - 1]) !== isLatin(bare)) break;
        out.push(bare);
        // A word that closes a quote or ends the sentence ends the name — the
        // per-word cleaner above erases those marks, which is how «"MyBudget".»
        // once flowed into the next clause.
        if (/["»'”]\s*$|[.!?؟]$/.test(w)) break;
        // A brand is a name, not a clause.
        if (out.length >= 4) break;
    }
    const brand = out.join(' ').replace(/^[*_~`]+|[*_~`]+$/g, '').trim();
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

    // 1. An explicit introduced name is stronger than an arbitrary quoted
    //    phrase. Evaluation prompts often quote a prohibition first (for
    //    example, “DO NOT BUILD A ...”) and name the actual product later.
    //    Prefer the semantic name marker so wrapper text cannot become the app.
    /**
     * A QUOTED NAME AFTER THE MARKER IS THE WHOLE NAME.
     *
     * «called "MyBudget". Requirements: a clean…» walked into trimBrand as
     * one sixty-character span; the per-word cleaner erased the closing quote
     * AND the full stop, so the walk lost the sentence boundary and delivered
     * «MyBudget Requirements a clean» — into the title, the header and the
     * folder name of a real field build. When the author quoted the name, the
     * quotes say exactly where it ends; take that span verbatim first.
     */
    const introduced = req.match(/(?:اسمها|اسمه|إسمها|إسمه|تسمى|يسمى|باسم|called|named|by the name of)\s*:?[\s\r\n]*(?:["«“]([^"«»“”]{2,40})["»”]|(.{2,60}))/i);
    if (introduced) {
        const b = trimBrand(introduced[1] || introduced[2] || '');
        if (b) return b;
    }

    // 2. Explicitly quoted — useful when no semantic name marker exists, but
    //    deliberately lower priority than `called`/`named` above.
    // A plain apostrophe is punctuation inside contractions such as Joe's; it is
    // not a reliable quote delimiter. Only paired typographic/double quotes
    // participate in the generic product-name fallback.
    const quoted = req.match(/[«"“]([^«»"“”]{2,40})[»"”]/);
    if (quoted) {
        const b = trimBrand(quoted[1]);
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
 * AND WHEN HE NAMES NO BRAND — «MyApp» IS NOT A NAME.
 *
 * Every unnamed English request produced the same three words: «MyApp», in the
 * title, in the header, in the folder name (`api-myapp`), in the owner's email
 * (`owner@myapp.local`). It is what a placeholder looks like when it ships,
 * and it made two different builds share one folder — and one database.
 *
 * The request itself carries a subject: «an online store for coffee», «مطعم
 * للمشاوي», «e-commerce platform similar to Shopify». Take that subject and
 * say what the thing IS. Deterministic, no model, and «MyApp» stays only for a
 * request that truly says nothing.
 */
const SUBJECT_PATTERNS: RegExp[] = [
    /\bfor\s+(?:an?\s+|my\s+|the\s+)?([A-Za-z][A-Za-z' -]{2,24})\b/i,
    /\b(?:selling|sells|that sells)\s+([A-Za-z][A-Za-z' -]{2,24})\b/i,
    /\b(?:store|shop|site|website|app|platform)\s+(?:for|about)\s+([A-Za-z][A-Za-z' -]{2,24})\b/i,
    /(?:لبيع|لـ|ل)\s*(?:ال)?([\u0600-\u06FF]{3,20})/,
    /(?:متجر|مطعم|موقع|تطبيق|منصة|منصّة)\s+(?:ال)?([\u0600-\u06FF]{3,20})/,
];

/** Words that are the request's grammar, never its subject. */
const NOT_A_SUBJECT = /^(the|a|an|my|our|your|me|us|complete|production|ready|world|class|simple|modern|new|real|full|code|features?|website|site|page|app|application|platform|store|shop|business|company|project|مشروع|موقع|متجر|تطبيق|منصة|منصّة|شركة|صفحة)$/i;

const KIND_WORD: Record<string, { ar: string; en: string }> = {
    store: { ar: 'متجر', en: 'Store' },
    restaurant: { ar: 'مطعم', en: 'Kitchen' },
    portfolio: { ar: 'أعمال', en: 'Studio' },
    landing: { ar: 'منصة', en: 'Works' },
    dashboard: { ar: 'لوحة', en: 'Dashboard' },
    blog: { ar: 'مدونة', en: 'Journal' },
    generic: { ar: 'مشروع', en: 'Works' },
};

const titleCase = (s: string) => s.trim().split(/\s+/).slice(0, 2)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

export function brandFallback(request: string, isArabic: boolean, kind = 'generic'): string {
    const req = String(request || '');
    const word = KIND_WORD[kind] || KIND_WORD.generic;
    // A marketplace names itself, and it says so before any «platform X»
    // pattern can shave a word off «تجارة إلكترونية» and call it a subject.
    if (/\b(e-?commerce|marketplace)\b|تجارة إ?لكترونية|سوق إ?لكتروني/i.test(req)) {
        return isArabic ? 'سوق التجارة' : 'Commerce Hub';
    }
    let subject = '';
    for (const re of SUBJECT_PATTERNS) {
        const m = req.match(re);
        // «for my business» is grammar all the way through: every word of a
        // candidate must be tested, not the phrase as one string.
        const candidate = (m?.[1] || '').trim().split(/\s+/)
            .filter(w => !NOT_A_SUBJECT.test(w)).join(' ').trim();
        if (candidate.length >= 3) { subject = candidate; break; }
    }
    if (!subject) return isArabic ? 'مشروعي' : 'MyApp';
    if (isArabic) {
        // «للقهوة» hands back «لقهوة» unless the article is peeled off both
        // times — and «متجر القهوة» is what a signboard says, not «متجر قهوة».
        const bare = subject.replace(/^(لل|ال|ل)/, '');
        if (bare.length < 3) return 'مشروعي';
        return `${word.ar} ال${bare}`;
    }
    const titled = titleCase(subject);
    // Two words already read like a name; a third would be padding.
    return titled.includes(' ') ? titled : `${titled} ${word.en}`;
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

/** Page kinds → what this page offers, phrased for a search-result snippet. */
const KIND_DESC: Record<string, { ar: string; en: string }> = {
    landing: { ar: 'تعرّف على خدماتنا وأعمالنا وتواصل معنا مباشرة من الموقع الرسمي', en: 'Explore our services and work, and get in touch — the official site' },
    store: { ar: 'تصفّح المنتجات وأضفها إلى السلة واطلب أونلاين', en: 'Browse the products, add to cart, and order online' },
    restaurant: { ar: 'اطّلع على قائمة الطعام واحجز طاولتك وتواصل معنا', en: 'See the menu, book a table, and get in touch' },
    portfolio: { ar: 'معرض أعمالنا ومشاريعنا المنجزة', en: 'A portfolio of our completed work and projects' },
    blog: { ar: 'مقالات وأخبار محدّثة باستمرار', en: 'Articles and news, updated regularly' },
    dashboard: { ar: 'لوحة تحكم لمتابعة البيانات والمؤشرات', en: 'A dashboard for tracking data and metrics' },
    app: { ar: 'تطبيق ويب يعمل مباشرة من المتصفح', en: 'A web app that runs right in the browser' },
    about: { ar: 'قصتنا وفريقنا وما نؤمن به', en: 'Our story, our team, and what we stand for' },
    contact: { ar: 'طرق التواصل معنا وموقعنا وساعات العمل', en: 'How to reach us — location and hours' },
};

/**
 * The meta description, composed like the title: from what the page IS, never
 * by pasting the user's prompt. Search engines show ~150-160 characters; a page
 * without one gets a snippet invented by the crawler, and the visual audit now
 * flags that.
 */
export function metaDescription(opts: {
    request: string;
    isArabic: boolean;
    kindLabel: string;
    pageName?: string;
    brand?: string;
}): string {
    const { request, isArabic, kindLabel, pageName } = opts;
    const lang = isArabic ? 'ar' : 'en';
    const brand = (opts.brand ?? brandFrom(request, isArabic)).trim();
    const what = (KIND_DESC[kindLabel] || KIND_DESC.landing)[lang];
    const page = (pageName || '').trim();

    const desc = brand
        ? (isArabic ? `${brand}${page ? ` — ${page}` : ''}: ${what}.` : `${brand}${page ? ` — ${page}` : ''}: ${what}.`)
        : `${page ? `${page}: ` : ''}${what}.`;
    return desc.length > 160 ? desc.slice(0, 159).trimEnd() + '…' : desc;
}

/**
 * PUBLISH-READY <head> — what a real site carries and no model writes.
 *
 * Three things, each measured missing on every page Joe ever shipped:
 *   - a FAVICON: the browser's grey globe next to the site's name reads as
 *     unfinished before the page is even opened;
 *   - the og:/twitter: share card: a link pasted into WhatsApp or X showed a
 *     bare URL with no title, no description, no identity;
 *   - theme-color: the mobile browser chrome stayed default grey around a
 *     page whose whole identity is its palette.
 *
 * Deterministic and idempotent: everything is derived from the title,
 * description and brand already on the page; anything already present is
 * left exactly as the author (or a previous run) wrote it.
 */
export function ensurePublishHead(html: string, opts: {
    brand?: string;
    hue: number;
    isArabic: boolean;
}): { html: string; added: string[] } {
    const { faviconDataUri } = require('./logo');
    let out = String(html || '');
    const added: string[] = [];
    if (!/<\/head>/i.test(out)) return { html: out, added };

    const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const title = ((out.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1] || '').replace(/\s+/g, ' ').trim();
    const desc = ((out.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [, ''])[1] || '').trim();
    const brand = (opts.brand || title.split(/[—|–-]/)[0] || '').trim();

    const inject = (snippet: string) => { out = out.replace(/<\/head>/i, `${snippet}\n</head>`); };

    if (!/<link[^>]+rel=["'][^"']*icon/i.test(out) && brand) {
        inject(`<link rel="icon" type="image/svg+xml" href="${faviconDataUri({ brand, hue: opts.hue, isArabic: opts.isArabic })}">`);
        added.push('favicon');
    }
    if (!/<meta[^>]+name=["']theme-color/i.test(out)) {
        const h = ((Math.round(opts.hue) % 360) + 360) % 360;
        inject(`<meta name="theme-color" content="hsl(${h},62%,45%)">`);
        added.push('theme-color');
    }
    if (!/<meta[^>]+property=["']og:title/i.test(out) && title) {
        const lines = [
            `<meta property="og:title" content="${esc(title)}">`,
            desc ? `<meta property="og:description" content="${esc(desc)}">` : '',
            `<meta property="og:type" content="website">`,
            brand ? `<meta property="og:site_name" content="${esc(brand)}">` : '',
            `<meta property="og:locale" content="${opts.isArabic ? 'ar_AR' : 'en_US'}">`,
            `<meta name="twitter:card" content="summary">`,
            `<meta name="twitter:title" content="${esc(title)}">`,
            desc ? `<meta name="twitter:description" content="${esc(desc)}">` : '',
        ].filter(Boolean).join('\n');
        inject(lines);
        added.push('share-card');
    }
    return { html: out, added };
}
