/**
 * A site is more than one page.
 *
 * Everything Joe builds today is a single HTML file. A store's header says
 * «المنتجات · من نحن · تواصل», and every one of those links is either an
 * in-page anchor or nothing at all — so the nav on a "complete store" is
 * decoration. The blueprint promises a catalogue and a contact page; the file
 * contains neither.
 *
 * This module decides WHICH pages a site of a given kind needs, builds the one
 * navigation that is shared across all of them, and — after the files exist —
 * checks that every cross-page link actually resolves. A dead link between two
 * pages Joe wrote himself is not something to discover in the browser.
 *
 * It is deliberately conservative about when to do this at all: N pages is N
 * times the model calls, which on a CPU-only laptop is the difference between a
 * minute and ten. A site is only planned when the request asks for one.
 */

import type { PageKind } from './blueprints';
import { logoLockup } from './logo';
import { hisClauses, clauseForbids } from './app-blueprints';

export interface PageSpec {
    /** Output filename, e.g. 'products.html'. The entry page is index.html. */
    file: string;
    /** What this page is, for the blueprint and the image budget. */
    kind: PageKind;
    /** Shown in <title> and as the nav label. */
    title: string;
    /** One line telling the section writer what this page is for. */
    purpose: string;
}

export interface SitePlan {
    multiPage: boolean;
    pages: PageSpec[];
    /** Why this plan was chosen, for the summary. Never silent. */
    reason: string;
}

/* ---------- does the user actually want a site? ------------------------------ */

/**
 * Written to survive real Arabic. The accusative alif — «موقعًا كاملًا» — is what
 * a fluent speaker writes and it defeats a pattern spelled «موقع كامل»; the
 * normaliser in planSite strips the tanween but the alif itself is part of the
 * word. `ا?` after each stem is the difference between reading the request and
 * ignoring it.
 */
const WANTS_SITE =
    /(موقعا?\s+(كاملا?|متكاملا?|من عدة صفحات|متعددا?)|عدة صفحات|صفحات متعددة|متعدد الصفحات|كل الصفحات|متجرا?\s+كاملا?|multi[- ]page|several pages|multiple pages|full (web)?site|whole site|complete site)/i;

const WANTS_SINGLE =
    /(صفحة واحدة|صفحة فقط|صفحه واحده|single page|one page|landing only|onepager|one-pager)/i;

/** Pages worth building for each kind, entry page first. */
const SITE_SHAPES: Partial<Record<PageKind, PageSpec[]>> = {
    store: [
        { file: 'index.html', kind: 'store', title: 'الرئيسية', purpose: 'the shop front: offer banner, categories, featured products, trust row' },
        { file: 'products.html', kind: 'store', title: 'المنتجات', purpose: 'the full catalogue with filters by category and price, and a working cart' },
        { file: 'about.html', kind: 'landing', title: 'من نحن', purpose: 'the story of the shop, its people, and why to buy from it' },
        { file: 'contact.html', kind: 'landing', title: 'تواصل معنا', purpose: 'a validated contact form, opening hours, address and support channels' },
    ],
    restaurant: [
        { file: 'index.html', kind: 'restaurant', title: 'الرئيسية', purpose: 'the welcome: hero dish, the kitchen in one paragraph, today\'s specials' },
        { file: 'menu.html', kind: 'restaurant', title: 'قائمة الطعام', purpose: 'the full menu by category with prices and photographs' },
        { file: 'reservations.html', kind: 'landing', title: 'الحجز', purpose: 'a reservation form with date, time and party size, plus the hours' },
        { file: 'contact.html', kind: 'landing', title: 'تواصل', purpose: 'address, map placeholder, phone, and how to find the place' },
    ],
    portfolio: [
        { file: 'index.html', kind: 'portfolio', title: 'الرئيسية', purpose: 'who this person is, in one strong statement, with selected work' },
        { file: 'work.html', kind: 'portfolio', title: 'الأعمال', purpose: 'the full project grid with stack tags and links' },
        { file: 'about.html', kind: 'landing', title: 'نبذة', purpose: 'the biography, skills and experience timeline' },
        { file: 'contact.html', kind: 'landing', title: 'تواصل', purpose: 'a contact form and the social links that matter' },
    ],
    blog: [
        { file: 'index.html', kind: 'blog', title: 'الرئيسية', purpose: 'the featured post and the recent grid' },
        { file: 'archive.html', kind: 'blog', title: 'الأرشيف', purpose: 'every post by category and date' },
        { file: 'about.html', kind: 'landing', title: 'عن المدونة', purpose: 'who writes it and what it is about' },
    ],
    landing: [
        { file: 'index.html', kind: 'landing', title: 'الرئيسية', purpose: 'what this company does and why to trust it' },
        { file: 'services.html', kind: 'landing', title: 'خدماتنا', purpose: 'each service in depth, with what is included and for whom' },
        { file: 'about.html', kind: 'landing', title: 'من نحن', purpose: 'the team, the history and the numbers' },
        { file: 'contact.html', kind: 'landing', title: 'تواصل', purpose: 'a validated contact form and the direct channels' },
    ],
};

/** English titles for a non-Arabic build. */
const EN_TITLES: Record<string, string> = {
    'الرئيسية': 'Home', 'المنتجات': 'Products', 'من نحن': 'About', 'تواصل معنا': 'Contact',
    'قائمة الطعام': 'Menu', 'الحجز': 'Reservations', 'تواصل': 'Contact', 'الأعمال': 'Work',
    'نبذة': 'About', 'الأرشيف': 'Archive', 'عن المدونة': 'About', 'خدماتنا': 'Services',
};

//  The folding a page-intent test needs: case endings, hamza shapes and
//  alif maqsura are noise when the question is WHICH PAGES he asked for.
const DIACRITICS = new RegExp('[\\u064B-\\u0652\\u0670\\u0640]', 'g');
const HAMZAS = new RegExp('[أإآ]', 'g');
const ALIF_MAQSURA = new RegExp('ى', 'g');
/** THE PAGES HE NAMED — read from his sentence, not chosen from a list. */
export interface NamedPage { title: string; slug: string; }

const AR_STOP_TOKEN = new RegExp('^(?:مع|تحتوي|يحتوي|فيها|فيه|بها|ثم|بحيث|و|او|أو)$');
const AR_NOT_A_NAME = new RegExp('^(?:واحده|واحدة|فقط|جديده|جديدة|اخري|أخرى|كل|هذه|هذا|رئيسيه)$');
const AR_PAGE_WORD  = new RegExp('صفح[ةه]', 'g');
//  A word that says HOW MANY, or a preposition that merely stands before
//  «pages», is not the name of a page. It is tested against the LAST word
//  of the capture, because «want multiple pages» ends in the counting word.
const EN_NOT_A_NAME = new RegExp('^(?:multiple|several|linked|many|few|all|more|other|some|these|those|two|three|four|five|with|of|for|and|or|in|on|to|has|have|its|[0-9]+)$');

function arabicNames(probe: string): string[] {
    const out: string[] = [];
    AR_PAGE_WORD.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AR_PAGE_WORD.exec(probe))) {
        const after = probe.slice(m.index + m[0].length);
        const tokens = after.split(new RegExp('[\\s.,،؛:!؟()\\n]+')).filter(Boolean);
        const name: string[] = [];
        for (const raw of tokens) {
            if (name.length >= 4) break;
            //  the next page mention ends this one — «صفحة خدمات وصفحة اتصل»
            if (new RegExp('^و?صفح[ةه]').test(raw)) break;
            if (AR_STOP_TOKEN.test(raw)) break;
            //  «صفحة تواصل لشركة تنظيف»: the ل- phrase says who the site is FOR,
            //  it is not part of what he called the page. It only ends a name
            //  that has already started — «للاسئلة» as a first word is the name.
            if (name.length > 0 && raw.length >= 4 && raw.charAt(0) === 'ل') break;
            if (name.length === 0 && AR_NOT_A_NAME.test(raw)) break;
            name.push(raw);
        }
        if (name.length) out.push(name.join(' '));
    }
    return out;
}

function englishNames(probe: string): string[] {
    const out: string[] = [];
    const listed = probe.match(new RegExp('pages?\\s*:\\s*([^.\\n]+)', 'i'));
    if (listed) for (const part of listed[1].split(new RegExp(',| and ', 'i'))) {
        const t = part.trim().toLowerCase().replace(new RegExp('^(?:a|an|the) '), '').replace(new RegExp(' pages?$'), '');
        if (t && !EN_NOT_A_NAME.test(t.split(' ').pop() || '')) out.push(t);
    }
    const re = new RegExp('([a-z][a-z0-9-]{1,20}(?:\\s+[a-z][a-z0-9-]{1,20})?)\\s+pages?\\b', 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(probe))) {
        const t = m[1].toLowerCase().replace(new RegExp('^(?:a|an|the|one|another)\\s+'), '').trim();
        const last = t.split(' ').pop() || '';
        if (t && !EN_NOT_A_NAME.test(last) && !out.includes(t)) out.push(t);
    }
    return out;
}

const SLUGS: Array<[RegExp, string]> = [
    [new RegExp('^(?:ال)?(?:من نحن|نبذه|نبذة|عن المشروع|عن المدونه|عن المدونة|عنا|about|about us)$'), 'about'],
    [new RegExp('^(?:ال)?(?:تواصل|تواصل معنا|اتصل بنا|اتصال|contact|contact us|get in touch)$'), 'contact'],
    [new RegExp('^(?:ال)?(?:منتجات|متجر|products|shop|store|catalogue|catalog)$'), 'products'],
    [new RegExp('^(?:ال)?(?:خدمات|services|our services)$'), 'services'],
    [new RegExp('^(?:ال)?(?:قائمه|قائمة|قائمه الطعام|قائمة الطعام|منيو|menu)$'), 'menu'],
    [new RegExp('^(?:ال)?(?:حجز|حجوزات|booking|bookings|reservations|reservation)$'), 'reservations'],
    [new RegExp('^(?:ال)?(?:اعمال|اعمالنا|معرض الاعمال|work|works|portfolio|projects)$'), 'work'],
    [new RegExp('^(?:ال)?(?:اسعار|باقات|تسعير|pricing|plans|prices)$'), 'pricing'],
    [new RegExp('^(?:ال)?(?:شحن|توصيل|شحن والاسترجاع|الشحن والاسترجاع|shipping|delivery|returns)$'), 'shipping'],
    [new RegExp('^(?:ال)?(?:اسئله الشائعه|اسئله|الاسئله الشائعه|faq|faqs|questions)$'), 'faq'],
    [new RegExp('^(?:ال)?(?:مدونه|مدونة|اخبار|blog|news|articles)$'), 'blog'],
    [new RegExp('^(?:ال)?(?:ارشيف|archive|archives)$'), 'archive'],
    [new RegExp('^(?:ال)?(?:سله|سلة|عربة التسوق|cart|basket|checkout)$'), 'cart'],
    [new RegExp('^(?:ال)?(?:دعم|مساعده|support|help)$'), 'support'],
    [new RegExp('^(?:ال)?(?:توثيق|وثائق|docs|documentation)$'), 'docs'],
    [new RegExp('^(?:ال)?(?:رئيسيه|رئيسية|هبوط|home|landing|main|index)$'), 'index'],
];

/**
 *  A PAGE INSIDE A PROHIBITION IS NOT A PAGE HE ASKED FOR.
 *
 *      «اعمل موقع محل زهور ولا تضف صفحة تسجيل دخول»
 *
 *  read «تسجيل دخول» as a page he named — so the one page he explicitly
 *  refused was the page most likely to be built. Measured across a thousand
 *  requests: fifteen conditional requests carried a page name inside their
 *  own negation.
 *
 *  A clause that forbids is skipped whole. Both readers are the same ones the
 *  rule layer uses; a second opinion about where a clause begins is how two
 *  readers of one sentence start again.
 */
function clausesThatAsk(probe: string): string {
    return hisClauses(probe).filter(c => !clauseForbids(c)).join(' ، ');
}

/**
 *  A RULE THAT WAS WRITTEN, MEASURED, AND WITHDRAWN — the record, not the rule.
 *
 *  «اعمل صفحة بخلفية زرقاء» reads «بخلفية زرقاء» as a page name. «بخلفية» is
 *  «ب» glued to a noun — «with a background» — so rejecting a first token of
 *  the shape «ب + noun» looked like the fix, and it was written here.
 *
 *  Its own negative case killed it. «صفحة بطاقات الهدايا» is a page he named,
 *  and «بطاقات» is one word that merely begins with the same letter. Nothing
 *  short of a lexicon tells the two apart, and the rule would have silently
 *  DELETED a page he asked for in order to avoid inventing one he did not.
 *
 *  Weighed honestly: the misread produces one named page, which becomes a
 *  single-page build whose title is his own phrase — a poor title. The rule
 *  would have dropped real pages out of real plans. The trade is bad, so
 *  there is no rule, and this comment is here so nobody writes it again
 *  without measuring the other direction first.
 */
export function thePagesHeNamed(probe: string): NamedPage[] {
    const asked = clausesThatAsk(probe);
    const raw = [...arabicNames(asked), ...englishNames(asked)];
    const out: NamedPage[] = [];
    let unknown = 0;
    for (const title of raw) {
        /**
         *  THE MAP IS SPELLED IN A FOLD THE INPUT NEVER ARRIVES IN.
         *
         *  Every entry below is written with «ه» — «الاسئله الشائعه» — but the
         *  probe reaching here has only had its diacritics, hamzas and alif
         *  maqsura folded. «الأسئلة الشائعة» becomes «الاسئلة الشائعة», with
         *  its ة intact, and matches nothing.
         *
         *  Measured across a thousand requests: twenty-five real multi-page
         *  plans came back with a page called `page-a` sitting between
         *  `services` and `contact` — a page he named plainly, filed under a
         *  letter, because the two halves of one fold disagreed.
         *
         *  So the key is folded the rest of the way HERE, where the map is
         *  read, rather than asking every caller to remember.
         */
        const key = title.trim().toLowerCase()
            .replace(/ة/g, 'ه')
            .replace(/[ًٌٍَُِّْٰـ]/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/\s+/g, ' ');
        const hit = SLUGS.find(([re]) => re.test(key));
        //  A page he named that is on no list is still a page he named. It
        //  gets a file of its own and keeps HIS words as its title — the
        //  alternative is a catalogue that can only ever emit what someone
        //  wrote down in advance.
        //  AND THE NAME OF THAT FILE IS DECIDED HERE, ONCE. It used to be
        //  decided twice — `page2` by this reader and `page-b` by the spec
        //  builder — which nobody saw, because only the builder's name ever
        //  reached disk. The moment anything else asked the reader what the
        //  file was called it would have been told a name that is never
        //  written, and an acceptance criterion on it could never be met.
        const latin = title.toLowerCase()
            .replace(new RegExp('[^a-z0-9]+', 'g'), '-')
            .replace(new RegExp('^-+|-+$', 'g'), '')
            .replace(new RegExp('[0-9]', 'g'), '');
        const slug = hit ? hit[1]
            : (latin.length >= 2 ? latin
                : 'page-' + String.fromCharCode(97 + Math.min(unknown++, 24)));
        if (!out.some(p => p.slug === slug)) out.push({ title: title.trim(), slug });
    }
    return out;
}

const PAGE_KIND: Record<string, PageKind> = {
    products: 'store', cart: 'store', shipping: 'store',
    menu: 'restaurant', reservations: 'restaurant',
    work: 'portfolio', blog: 'blog', archive: 'blog',
};

const PAGE_PURPOSE: Record<string, string> = {
    about: 'the story, the people behind it, and why to trust them',
    contact: 'a validated contact form, opening hours, address and the direct channels',
    products: 'the full catalogue with filters by category and price, and a working cart',
    services: 'each service in depth, with what is included and for whom',
    menu: 'the full menu by category with prices and photographs',
    reservations: 'a reservation form with date, time and party size, plus the hours',
    work: 'the full project grid with stack tags and links',
    pricing: 'the plans side by side, what each includes, and what happens at the limits',
    shipping: 'delivery times and costs by area, and exactly how a return is made',
    faq: 'the questions buyers actually ask, answered plainly and without hedging',
    blog: 'the recent posts by date, each with its opening lines',
    archive: 'every post by category and date',
    cart: 'the basket, quantities, totals, and the way through to checkout',
    support: 'how to get help, which channel for what, and the response times',
    docs: 'the reference organised by task, with examples that can be copied',
    index: 'what this is, who it is for, and the one action it wants',
};

/**
 * A page he named becomes a page Joe builds.
 *
 * The FILE is a slug because a filename must be; the TITLE stays his exact
 * words, so a page he called «سياسة الخصوصية» is not renamed into something off
 * a list. A page whose name is on no list is still built — that is the whole
 * difference between reading a request and matching it against a catalogue.
 */
function toSpec(named: NamedPage, siteKind: PageKind, isArabic: boolean): PageSpec {
    //  The slug came with him. Deciding it a second time here is how the two
    //  schemes drifted apart in the first place.
    const slug = named.slug;
    return {
        file: slug === 'index' ? 'index.html' : slug + '.html',
        kind: slug === 'index' ? siteKind : (PAGE_KIND[slug] || 'landing'),
        title: named.title,
        purpose: PAGE_PURPOSE[slug] || ('the page the request called «' + named.title + '», and nothing it did not ask for'),
    };
}

/**
 * Decide what to build — FROM THE REQUEST.
 *
 * This function used to hold a catalogue and nothing else: a request that
 * said «موقع كامل» got four pages someone wrote down in advance, and a
 * request that NAMED its pages got one. Measured, before this was fixed:
 *
 *   «صفحة هبوط وصفحة تواصل»                      -> 1 page
 *   «صفحة من نحن وصفحة خدمات وصفحة اتصل بنا»    -> 1 page
 *   «moqiʿan kāmilā» for a restaurant, naming nothing   -> 4 pages, one of them
 *                                                    a booking page he
 *                                                    never mentioned
 *
 * A page he names that is not on the list was UNBUILDABLE by construction.
 * So the request comes first and the shape is a declared default: when he
 * named nothing, the reason line says out loud that these pages are a
 * default for this kind and not something he asked for.
 */

export function planSite(kind: PageKind, request: string, isArabic: boolean): SitePlan {
    const entry = (): PageSpec => ({
        file: 'index.html', kind,
        title: isArabic ? 'الرئيسية' : 'Home',
        purpose: PAGE_PURPOSE.index,
    });
    const single = (reason: string): SitePlan => ({ multiPage: false, pages: [entry()], reason });

    /**
     * Read the request with its Arabic case endings removed. A user writing
     * natural Arabic says «ابني موقعًا كاملًا» — with tanween on both
     * words — and «موقع كامل» does not match that.
     */
    const probe = String(request || '')
        .replace(DIACRITICS, '')
        .replace(HAMZAS, 'ا')
        .replace(ALIF_MAQSURA, 'ي');

    //  An explicit «صفحة واحدة» outranks everything else he wrote.
    if (WANTS_SINGLE.test(probe)) return single('the request asked for a single page');

    const named = thePagesHeNamed(probe);
    const his = named.map(n => toSpec(n, kind, isArabic));
    const wantsSite = WANTS_SITE.test(probe);

    if (!wantsSite && his.length < 2) {
        //  ONE named page is still HIS page: it keeps his title and his
        //  purpose. Only the filename becomes index.html, because a
        //  single-page build has exactly one file.
        if (his.length === 1) return {
            multiPage: false,
            pages: [{ ...his[0], file: 'index.html', kind }],
            reason: 'single page — the request named one: «' + named[0].title + '»',
        };
        return single('single page (name the pages you want, or ask for «موقع كامل»)');
    }

    const shape = SITE_SHAPES[kind];
    if (!shape && his.length < 2) return single('a ' + kind + ' is a single page by nature');

    //  HIS pages first. The shape only fills what he did not name; it is
    //  never the reason a page exists when he named pages himself.
    const pages: PageSpec[] = [];
    const push = (p: PageSpec) => { if (!pages.some(x => x.file === p.file)) pages.push(p); };
    his.forEach(push);
    if (wantsSite && shape) shape
        .map(p => ({ ...p, title: isArabic ? p.title : (EN_TITLES[p.title] || p.title) }))
        .forEach(push);

    //  Whoever provided index.html, it goes first. If NOBODY did, one is
    //  made — and the reason line has to say so, because a home page Joe
    //  added is not a page the request asked for and not one the shape
    //  contributed either.
    const at = pages.findIndex(p => p.file === 'index.html');
    const homeWasMade = at < 0;
    if (homeWasMade) pages.unshift(entry()); else pages.unshift(pages.splice(at, 1)[0]);

    if (pages.length < 2) return single('single page — the request named one page only');

    const hisFiles = new Set(his.map(p => p.file));
    const fromShape = pages
        .filter(p => !hisFiles.has(p.file) && !(homeWasMade && p.file === 'index.html'))
        .map(p => p.title);
    const reason = his.length
        ? pages.length + ' linked pages — ' + his.length + ' named in the request ('
            + his.map(p => p.title).join(', ') + ')'
            + (fromShape.length ? ', and ' + fromShape.length + ' the ' + kind + ' shape adds (' + fromShape.join(', ') + ')' : '')
            + (homeWasMade ? ', plus a home page to enter from' : '')
        : 'a ' + kind + ' site of ' + pages.length + ' linked pages — the request named no pages, so this is the default shape for a ' + kind;

    return { multiPage: true, pages, reason };
}

/* ---------- the shared navigation -------------------------------------------- */

/**
 * The one navigation every page carries.
 *
 * Built here rather than asked for, because the model has no way to know which
 * files will exist — that is what produced href="#" on a "complete store" in the
 * first place. `aria-current` marks the page you are on, which is both correct
 * markup and the hook the stylesheet uses.
 */
export function siteNav(
    pages: PageSpec[],
    currentFile: string,
    brand: string,
    opts?: { withCart?: boolean; isArabic?: boolean; hue?: number },
): string {
    const links = pages.map(p => {
        const active = p.file === currentFile;
        return `<a href="${p.file}"${active ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a>`;
    }).join('\n      ');

    // The cart button belongs to the shared header for the same reason the nav
    // does: it has to be on every page, identical, with a badge the shared
    // runtime can find. A per-page cart button is how a basket disappears when
    // the visitor clicks through.
    const cart = opts?.withCart
        ? `\n      <button type="button" class="btn" data-cart-open aria-label="${opts.isArabic === false ? 'Cart' : 'السلة'}">`
        + `<svg width="18" height="18" aria-hidden="true"><use href="#i-cart"/></svg> <span data-cart-count data-count="0">0</span></button>`
        : '';

    /**
     * The mark, not the name in bold.
     *
     * A single page gets one from `ensureLogo`, which runs on the model's own
     * header. THIS header is Joe's, written here, so it was the one place a
     * multi-page site could never receive a wordmark — every page of every site
     * carried the company name as plain text while a one-page build got a mark.
     * Drawn from the same palette hue the page uses, so it belongs to the page.
     */
    const brandLink = typeof opts?.hue === 'number'
        ? logoLockup({ brand, hue: opts.hue, isArabic: opts.isArabic !== false })
        : `<a href="index.html" class="brand" style="font-weight:800;font-size:var(--step-1);text-decoration:none;color:var(--text)">${escapeHtml(brand)}</a>`;

    return `<header class="site-header">
  <div class="wrap" style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-6)">
    ${brandLink}
    <nav aria-label="${escapeHtml(opts?.isArabic === false ? 'Main navigation' : 'التنقل الرئيسي')}">
      ${links}
    </nav>
    <div class="nav-actions">${cart}</div>
  </div>
</header>`;
}

/** CSS for the shared nav — active state included, so "you are here" is visible. */
export function siteNavCss(): string {
    return `
/* Site navigation (shared across pages) */
.site-header nav{display:flex;gap:var(--space-4);flex-wrap:wrap}
/* --text is fitted to 12:1 on the surface; --text-muted only to 4.5:1, and the
   site header is a TINTED surface, not the plain one — measured in a browser at
   4.12:1, below AA, on every page of every site Joe builds. Nav links are the
   primary way around a site; they take the colour that has headroom. */
.site-header nav a{color:var(--text);text-decoration:none;padding:var(--space-2) var(--space-3);border-radius:var(--radius);transition:color .18s ease,background .18s ease}
/* --tint and --on-tint, which are DEFINED as a pair and fitted to 4.5:1
   against each other in both schemes at every hue.
   The two rules below used to hand-pick a colour and a wash: --brand on a 12%
   brand tint measured 4.12:1 in a browser, so it was changed to --brand-dark,
   which is fitted to 7:1 against WHITE and leaves headroom — in LIGHT mode. In
   dark mode --brand-dark is a deep blue on a near-black header and measured
   1.97:1, on every page of every site. A tinted surface is only ever safe as a
   pair, which is why the pair exists; picking the two halves separately is how
   this went wrong twice. */
.site-header nav a:hover{color:var(--on-tint);background:var(--tint)}
.site-header nav a[aria-current="page"]{color:var(--on-tint);font-weight:700;background:var(--tint)}
@media (max-width:640px){.site-header .wrap{flex-direction:column;align-items:flex-start}}`;
}

function escapeHtml(s: string): string {
    return String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
}

/* ---------- which page does a follow-up mean? -------------------------------- */

/** What a user calls each page, beyond its own title. */
const PAGE_WORDS: Array<[RegExp, RegExp]> = [
    [/^index\.html$/i, /الرئيسية|الصفحة الأولى|الواجهة|home ?page|the home|landing/i],
    [/^products?\.html$/i, /المنتجات|منتجات|الكتالوج|البضائع|products?|catalog/i],
    [/^menu\.html$/i, /المنيو|قائمة الطعام|الأطباق|menu|dishes/i],
    [/^reservations?\.html$/i, /الحجز|الحجوزات|حجز طاولة|reservations?|booking/i],
    [/^about\.html$/i, /من نحن|عنّا|عنا|نبذة|من ?نحن|about/i],
    [/^contact\.html$/i, /تواصل|اتصل|التواصل|contact/i],
    [/^services?\.html$/i, /الخدمات|خدماتنا|services?/i],
    [/^work\.html$/i, /الأعمال|اعمال|المشاريع|portfolio|work|projects/i],
    [/^archive\.html$/i, /الأرشيف|المقالات|archive|posts/i],
];

/**
 * The page a follow-up edit is about, or null.
 *
 * Conservative on purpose, exactly like section targeting: editing a page the
 * user did not mention is worse than asking the whole site. A request that names
 * no page returns null and the caller edits the entry page, which is what
 * «غيّر اللون» means on a site.
 */
export function targetPage(request: string, pages: PageSpec[]): PageSpec | null {
    const r = String(request || '');
    const scored = pages.map(p => {
        let score = 0;
        if (p.title && r.includes(p.title)) score += 60;
        if (r.includes(p.file)) score += 60;
        for (const [fileRe, wordRe] of PAGE_WORDS) {
            if (fileRe.test(p.file) && wordRe.test(r)) score += 40;
        }
        return { p, score };
    }).filter(x => x.score >= 40).sort((a, b) => b.score - a.score);

    if (!scored.length) return null;
    // Two pages matching equally means the request is ambiguous, not that we
    // should pick one — «عدّل من نحن وتواصل» is a whole-site edit.
    if (scored.length > 1 && scored[1].score >= scored[0].score) return null;
    return scored[0].p;
}

/* ---------- did the links actually land? ------------------------------------- */

export interface LinkReport {
    checked: number;
    dead: Array<{ from: string; href: string }>;
}

/**
 * Every internal link on every page, checked against the files that exist.
 *
 * A site whose own pages do not link to each other is the failure this whole
 * module exists to prevent, so it is verified rather than assumed. External
 * links, anchors and mailto/tel are not this function's business.
 */
export function verifyInternalLinks(files: Map<string, string>): LinkReport {
    const dead: Array<{ from: string; href: string }> = [];
    let checked = 0;

    for (const [name, html] of files) {
        for (const m of String(html).matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
            const href = m[1].trim();
            if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(href)) continue;
            checked++;
            const target = href.split('#')[0].split('?')[0];
            if (!target) continue;
            if (!files.has(target)) dead.push({ from: name, href });
        }
    }
    return { checked, dead };
}
