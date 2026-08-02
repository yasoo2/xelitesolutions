/**
 * What KIND of thing is being built, and what a good one contains.
 *
 * Every request used to get the same treatment: "build a complete HTML file".
 * A shop, a dashboard and a restaurant page are not the same artefact, and a
 * model with no brief produces the same three sections for all of them. Naming
 * the type and listing the sections a competent designer would include is what
 * turns "a page" into "a store".
 */

import { normalizeIntentText } from '../orchestrator/promptNormalizer';

export type PageKind =
    | 'store' | 'landing' | 'portfolio' | 'restaurant' | 'dashboard'
    | 'blog' | 'app' | 'event' | 'docs' | 'generic';

// Order matters: the specific kinds are tested before the broad ones. A sales
// dashboard was being classified as a shop because «مبيعات» contains «بيع» and
// the store pattern came first — so it was built with a product grid and a cart.
const DETECTORS: Array<[PageKind, RegExp]> = [
    ['dashboard', /لوحة تحكم|لوحة قيادة|لوحة إدارة|لوحة ادارة|إحصائ|احصائ|تحليلات|مبيعات|dashboard|admin panel|analytics|kpi|metrics|report(ing)? ui/i],
    ['docs', /توثيق|وثائق|دليل استخدام|docs|documentation|api reference|developer guide/i],
    ['event', /فعالية|مؤتمر|حفل|زفاف|event|conference|meetup|webinar|wedding|summit/i],
    ['store', /متجر|تسوق|منتجات|سلة|شراء|shop|store|e-?commerce|cart|checkout|product page|catalog/i],
    ['restaurant', /مطعم|كافيه|قهوة|مقهى|قائمة الطعام|منيو|مخبز|حلويات|restaurant|cafe|coffee|menu|bakery|pizza|bistro/i],
    ['portfolio', /بورتفوليو|معرض أعمال|معرض اعمال|سيرة ذاتية|portfolio|resume|\bcv\b|showcase|my work|photographer/i],
    ['blog', /مدونة|مقالات|أخبار|اخبار|blog|articles|magazine|newsroom/i],
    ['app', /تطبيق ويب|واجهة تطبيق|web ?app|application ui|saas app|tool ui|admin tool/i],
    ['landing', /هبوط|صفحة تعريف|شركة|خدمات|عياد|طبيب|أسنان|اسنان|مركز|مكتب|وكالة|landing|homepage|company|agency|startup|service|clinic|studio|firm/i],
];

export function detectPageKind(request: string, probe?: string): PageKind {
    // Normalise first. «لشركه» is «لشركة» to any reader and to nobody's regex —
    // the same Arabic spelling gap that sent a build request to the generic
    // planner once already. The canonical companion is tested alongside the
    // user's own words, never instead of them.
    let canonical = '';
    try { canonical = normalizeIntentText(request || ''); } catch { /* optional */ }
    const text = `${request || ''}\n${canonical}\n${probe || ''}`;
    for (const [kind, re] of DETECTORS) if (re.test(text)) return kind;
    return 'generic';
}

/** The sections a good example of each kind actually has. */
const BLUEPRINTS: Record<PageKind, string[]> = {
    store: [
        'sticky header: logo, category nav, search field, cart button with an item count badge',
        'hero banner: current offer, one strong CTA, a large product image',
        'category strip: 4-6 tiles with icon/image and label',
        'product grid: 8+ cards — image, name, short description, price (with strike-through old price where on sale), rating stars, "add to cart" button',
        'a working cart: clicking add updates the badge and a slide-over panel with line items, quantity steppers and a running total (localStorage, real JS — not a mockup)',
        'trust row: shipping, returns, secure payment, support',
        'customer reviews with names and star ratings',
        'newsletter + footer with real links, payment icons (inline SVG) and social icons',
    ],
    landing: [
        'sticky header with nav links and a primary CTA',
        'hero: headline, sub-headline, two CTAs, supporting image',
        'logo/trust strip',
        'services or features: 3-6 cards, each with an icon, title and one-line benefit',
        'how it works: 3-4 numbered steps',
        'results/metrics band with animated counters',
        'testimonials with avatar, name, role',
        'pricing or packages if relevant',
        'FAQ as accessible accordions (details/summary or ARIA)',
        'contact section with a validated form, then footer',
    ],
    portfolio: [
        'hero with name, role, one-line pitch, portrait',
        'about with a short bio and skill chips',
        'project grid: image, title, stack tags, links',
        'experience timeline',
        'testimonials or references',
        'contact with form and social links',
    ],
    restaurant: [
        'hero with an appetising full-width image and a "reserve a table" CTA',
        'about the kitchen, short and warm',
        'menu by category (starters/mains/desserts/drinks) with prices and photos',
        "chef's specials highlighted",
        'gallery grid',
        'reservation form with date, time and party size',
        'hours, map placeholder, contact, footer',
    ],
    dashboard: [
        'top bar with title, search, user chip; collapsible sidebar with icon nav',
        'KPI row: 4 stat cards with value, label, delta and a sparkline (inline SVG)',
        'main chart area: two charts drawn with inline SVG or canvas from real in-page data',
        'data table with sortable headers, status pills and pagination',
        'activity feed',
        'responsive: sidebar collapses to a bottom bar under 768px',
    ],
    blog: [
        'header with nav and search',
        'featured post: large image, title, excerpt, author, date, read time',
        'post grid with category tags',
        'sidebar: categories, popular posts, newsletter',
        'pagination and footer',
    ],
    app: [
        'app shell: top bar + sidebar/tab bar',
        'the primary working surface (list/board/editor) with real interactive state in JS',
        'empty state, loading state and an error state that are actually reachable',
        'settings or profile panel',
        'keyboard focus states throughout',
    ],
    event: [
        'hero with event name, date, venue and a register CTA',
        'countdown timer that actually counts',
        'agenda/schedule by track and time',
        'speakers grid with photos and bios',
        'ticket tiers with prices and a highlighted recommended tier',
        'venue and travel info, FAQ, footer',
    ],
    docs: [
        'sidebar navigation with sections and active-state highlighting',
        'main article column with anchored headings',
        'on-page table of contents that highlights while scrolling',
        'code blocks with a copy button that works',
        'previous/next navigation, search field',
    ],
    generic: [
        'clear header with navigation',
        'hero that states what this is in one sentence',
        '3-6 content sections appropriate to the request',
        'a call to action',
        'footer with contact details',
    ],
};

const KIND_LABEL: Record<PageKind, string> = {
    store: 'online store', landing: 'company/landing page', portfolio: 'portfolio',
    restaurant: 'restaurant/cafe site', dashboard: 'admin dashboard', blog: 'blog/magazine',
    app: 'web application UI', event: 'event page', docs: 'documentation site', generic: 'web page',
};

/**
 * How many real photographs this kind of page should carry.
 *
 * dashboard/app were 0 — "an admin screen is all data" — and the user's own
 * verdict on the result was «ظهر بدون صور فقط خلفيات ملونة»: a store's admin
 * dashboard with no product thumbnails and no user avatars does not read as
 * an admin screen, it reads as a wireframe. Real ones (Shopify, Stripe) are
 * full of small photographs: the products in the orders table, the avatars in
 * the activity feed. The budget is small and the slots (thumb/avatar) tell
 * the archive to fetch small square crops, so the page stays light.
 */
const IMAGE_BUDGET: Record<PageKind, number> = {
    store: 9, landing: 4, portfolio: 6, restaurant: 7, dashboard: 4,
    blog: 6, app: 2, event: 5, docs: 0, generic: 3,
};

export function blueprintBrief(kind: PageKind): string {
    return `PAGE TYPE: ${KIND_LABEL[kind]}.
A good one contains, in order:
${BLUEPRINTS[kind].map((s, i) => `${i + 1}. ${s}`).join('\n')}
Write REAL content for the subject — real product/section names, plausible prices, real-sounding
copy. Never "Lorem ipsum", never "Your text here", never an empty href="#" on a primary action.
Any interaction you show (cart, tabs, accordion, filter, counter, form validation) must actually
work in the page's own JavaScript.`;
}

export function imageBudget(kind: PageKind): number {
    return IMAGE_BUDGET[kind];
}

/** The sections themselves, for writing the page one section at a time. */
export function blueprintSections(kind: PageKind): string[] {
    return BLUEPRINTS[kind].slice();
}

export function kindLabel(kind: PageKind): string {
    return KIND_LABEL[kind];
}
