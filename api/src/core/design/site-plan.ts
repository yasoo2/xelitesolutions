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

const WANTS_SITE =
    /(موقع (كامل|متكامل|من عدة صفحات|متعدد)|عدة صفحات|صفحات متعددة|كل الصفحات|متجر كامل|موقع كامل|multi[- ]page|several pages|multiple pages|full (web)?site|whole site|complete site)/i;

const WANTS_SINGLE =
    /(صفحة واحدة|صفحة فقط|single page|one page|landing only|onepager|one-pager)/i;

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

/**
 * Decide what to build.
 *
 * Single page unless the request asks for a site — N pages costs N times the
 * model calls, and quietly turning one request into twelve on a CPU-only laptop
 * is not a favour.
 */
export function planSite(kind: PageKind, request: string, isArabic: boolean): SitePlan {
    const single = (reason: string): SitePlan => ({
        multiPage: false,
        pages: [{ file: 'index.html', kind, title: isArabic ? 'الرئيسية' : 'Home', purpose: '' }],
        reason,
    });

    if (WANTS_SINGLE.test(request)) return single('the request asked for a single page');
    if (!WANTS_SITE.test(request)) return single('single page (ask for «موقع كامل» or «عدة صفحات» to get a linked site)');

    const shape = SITE_SHAPES[kind];
    if (!shape) return single(`a ${kind} is a single page by nature`);

    const pages = shape.map(p => ({ ...p, title: isArabic ? p.title : (EN_TITLES[p.title] || p.title) }));
    return { multiPage: true, pages, reason: `a ${kind} site of ${pages.length} linked pages` };
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
export function siteNav(pages: PageSpec[], currentFile: string, brand: string): string {
    const links = pages.map(p => {
        const active = p.file === currentFile;
        return `<a href="${p.file}"${active ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a>`;
    }).join('\n      ');

    return `<header class="site-header">
  <div class="wrap" style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-6)">
    <a href="index.html" class="brand" style="font-weight:800;font-size:var(--step-1);text-decoration:none;color:var(--text)">${escapeHtml(brand)}</a>
    <nav aria-label="${escapeHtml(pages[0]?.title === 'Home' ? 'Main navigation' : 'التنقل الرئيسي')}">
      ${links}
    </nav>
  </div>
</header>`;
}

/** CSS for the shared nav — active state included, so "you are here" is visible. */
export function siteNavCss(): string {
    return `
/* Site navigation (shared across pages) */
.site-header nav{display:flex;gap:var(--space-4);flex-wrap:wrap}
.site-header nav a{color:var(--text-muted);text-decoration:none;padding:var(--space-2) var(--space-3);border-radius:var(--radius);transition:color .18s ease,background .18s ease}
.site-header nav a:hover{color:var(--text);background:color-mix(in srgb,var(--brand) 10%,transparent)}
.site-header nav a[aria-current="page"]{color:var(--brand);font-weight:700;background:color-mix(in srgb,var(--brand) 12%,transparent)}
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
