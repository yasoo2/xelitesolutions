/**
 * WHAT HE ASKED FOR, AGAINST WHAT WAS BUILT.
 *
 * His request, in full:
 *
 *     «Build a world-class e-commerce platform similar to Shopify. Features:
 *      Multi-vendor marketplace · AI product generation · Inventory management
 *      · Payments · Shipping · Coupons · Loyalty program · Mobile app ·
 *      Analytics · Customer support · Marketing automation · SEO ·
 *      Multi-language · Multi-currency»
 *
 * What arrived was a single-table store: a catalogue, orders, an owner login,
 * search and sort. A good little store — and roughly a tenth of what he named.
 * The delivery message listed its files, its score, its design family and five
 * next commands, and never once mentioned the other thirteen features. Not a
 * lie; an omission the size of the request.
 *
 * This is the comparison, done deterministically. A capability counts as
 * REQUESTED when he names it, and as BUILT only when the generated code shows
 * evidence of it — a route, a column, a component. No model is asked, nothing
 * is inferred from good intentions, and when the evidence is ambiguous the
 * answer is «not built», because overstating is the failure being fixed here.
 */
import { clausesBeyondTheColumns, columnsAnywhereInHisRequest, statedRules } from '../design/app-blueprints';
import { intentProbe } from '../orchestrator/promptNormalizer';
import fs from 'fs';
import path from 'path';

export interface Capability {
    id: string;
    ar: string;
    en: string;
    /** He named it. */
    ask: RegExp;
    /** The code shows it. */
    evidence: RegExp;
    /** Optional shape-aware evidence for capabilities whose runtime form matters. */
    evidenceCheck?: (source: string, ctx?: ScopeEvidenceContext) => boolean;
}

/** What the delivered tree is, for evidence that depends on who uses the capability. */
export interface ScopeEvidenceContext {
    /**
     * The delivered tree has no interface for people — an API-only delivery —
     * so a service's own route handlers are the evidence for search, filtering
     * and sorting. With an interface, the interface must offer them.
     */
    serviceOnly?: boolean;
}

/**
 * The vocabulary of the things people actually ask a builder for. Each entry
 * carries both languages in one pattern — his prompts mix them freely.
 */
const SEARCH_INTERACTION = /<form\b[^>]*(?:onSubmit|onsubmit)\s*=|type\s*=\s*["']search["']|onKey(?:Down|Press)\s*=|event\.key\s*===?\s*["']Enter["']/i;
const SEARCH_STATE_OR_IO = /\b(?:useState|set[A-Z][A-Za-z0-9_]*|fetch|axios|XMLHttpRequest|query|searchTerm|results?|filtered|handleSearch|findCities|onSearch)\b/i;

// Responsiveness is a cross-domain delivery capability. It must be judged
// from authored layout rules, not inferred from a page title or a model claim.
const RESPONSIVE_LAYOUT = /@media\b|clamp\s*\(|flex-wrap\s*:\s*[^;]+|grid-template-columns\s*:/i;

/** An Arabic claim needs both direction metadata and real authored Arabic copy. */
export function hasArabicRtlEvidence(source: string): boolean {
    const src = String(source || '');
    const arabicLetters = src.match(/[\u0621-\u064A]/gu)?.length || 0;
    const rtlDocument = /<html\b(?=[^>]*\blang=["']ar(?:-[^"']+)?["'])(?=[^>]*\bdir=["']rtl["'])[^>]*>/iu.test(src)
        || /document\.documentElement\.(?:dir|setAttribute\s*\(\s*["']dir["'])[^\n]{0,100}["']rtl["']/iu.test(src);
    return rtlDocument && arabicLetters >= 20;
}

/** A services section is a rendered collection, not the word "services" in copy. */
export function hasServicesSectionEvidence(source: string): boolean {
    const src = String(source || '');
    const directSection = /<(?:section|div)\b[^>]*(?:id|class(?:Name)?)=["'][^"']*services?[^"']*["'][^>]*>/iu.test(src)
        && /<(?:h[1-6]|header)\b[^>]*>[\s\S]{0,180}(?:services?|خدمات)/iu.test(src);
    const generatedCollection = /<(?:Services|Products)\b/u.test(src)
        && /(?:services?|products)Title\s*:\s*["'][^"']*(?:services?|خدمات)[^"']*["']/iu.test(src)
        && /(?:services?|products)\s*:\s*\[[\s\S]{0,5000}?\b(?:name|title)\s*:/iu.test(src)
        && /(?:services?|products|rows)\.map\s*\(/iu.test(src);
    return directSection || generatedCollection;
}

/** A contact CTA must render a visible command whose resolved destination is contact. */
export function hasContactCtaEvidence(source: string): boolean {
    const src = String(source || '');
    const direct = /<a\b(?=[^>]*\bclass(?:Name)?=["'][^"']*(?:btn|button|cta)[^"']*["'])(?=[^>]*\bhref=["'](?:#contact|tel:|mailto:)[^"']*["'])[^>]*>[\s\S]{1,160}<\/a>/iu.test(src);
    const dynamic = /contactHref\s*:\s*["'](?:#contact|tel:|mailto:)[^"']*["']/iu.test(src)
        && /\bcta\s*:\s*["'][^"']{2,80}["']/iu.test(src)
        && /<a\b(?=[^>]*\bclassName=["'][^"']*btn[^"']*["'])(?=[^>]*\bhref=\{\s*content\.contactHref)[^>]*>[\s\S]{0,100}\{\s*content\.cta\s*\}[\s\S]{0,60}<\/a>/iu.test(src);
    return direct || dynamic;
}

// “Checkout” is also a legitimate name for non-payment workflows such as
// lending equipment. Treat it as payments only when payment context is nearby.
const PAYMENT_CHECKOUT = /\bcheckout\b(?=[^,.]{0,40}\b(?:payment|card|billing|purchase|order|cart)\b)/i;
const PAYMENT_REQUEST = new RegExp(
    `\\bpayments?\\b|\\bstripe\\b|\\bpaypal\\b|المدفوعات|بوابة دفع|${PAYMENT_CHECKOUT.source}`,
    'i',
);

export function hasFormValidationEvidence(source: string): boolean {
    return /fields\s*\.filter\(\s*f\s*=>\s*f\.required|f\.required\s*&&/i.test(source)
        && /setError\(|role\s*=\s*["']alert["']|aria-live/i.test(source);
}

/**
 * Search is a runtime interaction, not merely a variable name. Accept the
 * established names as a supporting alternative, or require an interaction
 * shape paired with state, a handler, or a data fetch/update.
 */
export function hasSearchEvidence(source: string, ctx?: ScopeEvidenceContext): boolean {
    return /setQuery|searchTerm|onSearch|\[query,/i.test(source)
        || (SEARCH_INTERACTION.test(source) && SEARCH_STATE_OR_IO.test(source))
        || (ctx?.serviceOnly === true && hasServiceSearchEvidence(source));
}

/**
 * SCOPE EVIDENCE BY ROLE (round 15 review, C4) — AND PER ROUTE HANDLER (round 20).
 *
 * Search, filtering and sorting were proven only by UI state (setQuery,
 * xFilter, sortBy). An API that really searches — a route reading
 * `req.query.q` and narrowing its rows — was reported «missing: search», so
 * an API-only request asking for search could never be delivered.
 *
 * Round 20 review: the first version tested the parameter name and «some
 * .filter( somewhere» separately over the whole tree read as one string. A
 * route that logged `req.query.q` and returned every row, beside any delete
 * handler calling `.filter(`, counted as search — and it was ORed into the UI
 * checks, so a store whose interface had no search box passed. Now a
 * parameter counts only when, inside the SAME route handler, it is used by the
 * operation that narrows (a .filter/.includes callback, a WHERE/LIKE the value
 * is bound to, a comprehension's condition) or orders the rows — and only for
 * an API-only delivery (ScopeEvidenceContext.serviceOnly).
 */
const SEARCH_PARAMS = new Set(['q', 'query', 'search', 'term', 'keyword', 'keywords', 's']);
const SORT_PARAMS = new Set(['sort', 'sortby', 'sort_by', 'order', 'orderby', 'order_by', 'dir', 'direction']);
const PAGE_PARAMS = new Set(['page', 'limit', 'offset', 'per_page', 'perpage', 'pagesize', 'page_size', 'cursor', 'skip', 'take']);
/** A parameter read generically (Object.entries(req.query)): any field the client names. */
const ANY_FIELD = '*';

/** The text of the call whose «(» is at `open`, through its matching «)» — strings and comments skipped. */
function callText(src: string, open: number): string {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
            continue;
        }
        if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
        if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 1; continue; }
        if (c === '(') depth++;
        else if (c === ')' && --depth === 0) return src.slice(open, i + 1);
    }
    return src.slice(open);
}

/** The body of a function or arrow named `name` in the source, or ''. */
function namedFunctionText(src: string, name: string): string {
    const esc = name.replace(/[$]/g, '\\$');
    const decl = new RegExp(`\\bfunction\\s+${esc}\\s*\\(|\\b(?:const|let|var)\\s+${esc}\\s*=\\s*(?:async\\s*)?(?:function\\b[^(]*)?\\(`).exec(src);
    if (!decl) return '';
    const open = src.indexOf('(', decl.index + decl[0].length - 1);
    const params = callText(src, open);
    const afterParams = open + params.length;
    const brace = src.indexOf('{', afterParams);
    if (brace < 0 || brace - afterParams > 12) return src.slice(decl.index, afterParams + 200);
    let depth = 0;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(decl.index, i + 1);
    }
    return src.slice(decl.index);
}

/**
 * Every route handler in the source: an Express/Koa/Fastify-style
 * registration with its handler (and the body of a named handler it passes),
 * or a decorated Python handler (Flask/FastAPI) through the end of its def.
 */
export function routeHandlers(source: string): string[] {
    const src = String(source || '');
    const out: string[] = [];
    const reg = /\b[A-Za-z_$][\w$]*\.(?:get|post|put|patch|delete|all)\s*\(\s*['"`]/gu;
    for (let m = reg.exec(src); m; m = reg.exec(src)) {
        const open = src.indexOf('(', m.index);
        const call = callText(src, open);
        let text = call;
        const afterPath = call.replace(/^\(\s*(['"`])(?:\\.|(?!\1).)*\1\s*,?/su, '');
        for (const ref of afterPath.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=,|\)\s*$)/gu)) {
            const body = namedFunctionText(src, ref[1]);
            if (body) text += '\n' + body;
        }
        out.push(text);
        reg.lastIndex = open + Math.max(1, call.length);
    }
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (!/^\s*@[A-Za-z_][\w.]*\.(?:get|post|put|patch|delete|route|api_route)\s*\(/u.test(lines[i])) continue;
        let j = i;
        while (j < lines.length && !/^\s*(?:async\s+)?def\s/u.test(lines[j])) j++;
        if (j >= lines.length) break;
        const indent = (lines[j].match(/^\s*/) || [''])[0].length;
        let k = j + 1;
        while (k < lines.length && (lines[k].trim() === '' || (lines[k].match(/^\s*/) || [''])[0].length > indent)) k++;
        out.push(lines.slice(i, k).join('\n'));
        i = k - 1;
    }
    return out;
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The query parameters one handler reads, each with the identifiers that carry its value. */
function handlerQueryReads(handler: string): Array<{ name: string; ids: string[] }> {
    const reads = new Map<string, Set<string>>();
    const add = (name: string, id: string) => {
        const key = name.toLowerCase();
        if (!reads.has(key)) reads.set(key, new Set());
        reads.get(key)!.add(id);
    };
    const direct = [
        /\breq(?:uest)?\.query\.([A-Za-z_][\w]*)/gu,
        /\breq(?:uest)?\.query\[\s*['"]([A-Za-z_][\w]*)['"]\s*\]/gu,
        /\(\s*req(?:uest)?\.query\s*\|\|\s*\{\}\s*\)\.([A-Za-z_][\w]*)/gu,
        /\brequest\.(?:args|GET|query_params)\.get\(\s*['"]([A-Za-z_][\w]*)['"]/gu,
        /\bsearchParams\.get\(\s*['"]([A-Za-z_][\w]*)['"]/gu,
    ];
    for (const re of direct) {
        for (const m of handler.matchAll(re)) {
            add(m[1], m[0]);
            const expr = escapeRe(m[0]);
            for (const alias of handler.matchAll(new RegExp(`(?:\\b(?:const|let|var)\\s+|^[ \\t]*)([A-Za-z_$][\\w$]*)\\s*=\\s*[^;\\n]*${expr}`, 'gmu'))) add(m[1], alias[1]);
        }
    }
    for (const m of handler.matchAll(/\b(?:const|let|var)\s*\{([^}]{1,200})\}\s*=\s*\(?\s*req(?:uest)?\.query\b/gu)) {
        for (const part of m[1].split(',')) {
            const [left, right] = part.split(':').map(s => s.split('=')[0].trim());
            if (/^[A-Za-z_]\w*$/u.test(left)) add(left, right && /^[A-Za-z_$][\w$]*$/u.test(right) ? right : left);
        }
    }
    for (const m of handler.matchAll(/\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*of\s+Object\.entries\(\s*\(?\s*req(?:uest)?\.query\b/gu)) {
        add(ANY_FIELD, m[1]);
        add(ANY_FIELD, m[2]);
    }
    // FastAPI: a decorated handler's defaulted parameters are its query parameters.
    const def = handler.match(/^\s*(?:async\s+)?def\s+\w+\s*\(([^)]*)\)/mu);
    if (def && /^\s*@/mu.test(handler)) {
        for (const param of def[1].split(',')) {
            const pm = param.match(/^\s*([A-Za-z_]\w*)\s*(?::[^=]*)?=\s*(?!Depends\b|Body\b|Path\b|Header\b|File\b|Form\b)/u);
            if (pm && pm[1] !== 'self') add(pm[1], pm[1]);
        }
    }
    return Array.from(reads, ([name, ids]) => ({ name, ids: Array.from(ids) }));
}

/** Is any of these identifiers used by an operation of this kind inside the handler? */
function usedBy(handler: string, ids: string[], kind: 'narrow' | 'order'): boolean {
    const mentions = (text: string) => ids.some(id => /^[A-Za-z_$][\w$]*$/u.test(id)
        ? new RegExp(`(?<![\\w$.])${escapeRe(id)}(?![\\w$])`, 'u').test(text)
        : text.includes(id));
    const calls = kind === 'narrow'
        ? /\.(?:filter|includes|where|find|filter_by|startsWith|indexOf|some)\s*\(|\bfilter\s*\(/gu
        : /\.(?:sort|orderBy|order_by|sortBy)\s*\(|\bsorted\s*\(/gu;
    for (const m of handler.matchAll(calls)) {
        if (mentions(callText(handler, m.index! + m[0].length - 1))) return true;
    }
    const sql = kind === 'narrow' ? /\b(?:WHERE|I?LIKE)\b/gu : /\bORDER\s+BY\b/giu;
    for (const m of handler.matchAll(sql)) {
        if (mentions(handler.slice(m.index!))) return true;
    }
    if (kind === 'narrow') {
        for (const m of handler.matchAll(/\[[^\]\n]*\bfor\b[^\]\n]*\bif\b[^\]\n]*\]/gu)) if (mentions(m[0])) return true;
    }
    return false;
}

/** The query parameters a server route reads: req.query.x, req.query['x'], const { x } = req.query, request.args.get('x'). */
export function serviceQueryParams(source: string): string[] {
    return Array.from(new Set(routeHandlers(source).flatMap(h => handlerQueryReads(h).map(r => r.name)).filter(n => n !== ANY_FIELD)));
}

export function hasServiceSearchEvidence(source: string): boolean {
    return routeHandlers(source).some(h => handlerQueryReads(h)
        .some(r => SEARCH_PARAMS.has(r.name) && usedBy(h, r.ids, 'narrow')));
}

export function hasServiceFilterEvidence(source: string): boolean {
    return routeHandlers(source).some(h => handlerQueryReads(h)
        .some(r => !SEARCH_PARAMS.has(r.name) && !SORT_PARAMS.has(r.name) && !PAGE_PARAMS.has(r.name) && usedBy(h, r.ids, 'narrow')));
}

export function hasServiceSortingEvidence(source: string): boolean {
    return routeHandlers(source).some(h => handlerQueryReads(h)
        .some(r => SORT_PARAMS.has(r.name) && usedBy(h, r.ids, 'order')));
}

/** Filtering must change the rendered collection from one or more controls. */
export function hasFilterEvidence(source: string, ctx?: ScopeEvidenceContext): boolean {
    const hasFilterState = /\b[A-Za-z][A-Za-z0-9_]*Filter\b|\bset[A-Za-z0-9_]*Filter\b/i.test(source);
    const hasFilterControl = /<(?:select|input)\b[^>]*onChange\s*=/i.test(source);
    return (hasFilterState && hasFilterControl && /\.filter\s*\(/i.test(source))
        || (ctx?.serviceOnly === true && hasServiceFilterEvidence(source));
}

/** Sorting is separate from search and filtering and needs an executable order change. */
export function hasSortingEvidence(source: string, ctx?: ScopeEvidenceContext): boolean {
    return (/\.sort\s*\(/i.test(source)
        && /\bsort(?:By|Order|Direction|Key)?\b|\bsetSort[A-Za-z0-9_]*\b/i.test(source))
        || (ctx?.serviceOnly === true && hasServiceSortingEvidence(source));
}

export const CAPABILITIES: Capability[] = [
    {
        id: 'catalog', ar: 'كتالوج المنتجات', en: 'product catalogue',
        ask: /\b(?:catalog(?:ue)?|product\s+(?:catalog(?:ue)?|listing|grid)|storefront|online\s+store|e-?commerce|shopping\s+(?:app|platform))\b|منتجات\s+(?:المتجر|المنتجات)|كتالوج|متجر/i,
        evidence: /\/api\/products|products\s*\(|ProductCard|product-grid/i,
    },
    {
        id: 'orders', ar: 'الطلبات', en: 'orders',
        ask: /\b(orders?|checkout|cart|purchase)\b|طلبات|سلة|شراء|الدفع عند/i,
        evidence: /\/api\/orders|orders\s*\(|addToCart|أضف إلى السلة/i,
    },
    {
        id: 'accounts', ar: 'حسابات المستخدمين', en: 'user accounts',
        ask: /\b(?:accounts?|account\s+management|sign[- ]?in|log[- ]?in|auth(?:entication|orization)?|register|registration|login)\b|حسابات?\s+(?:المستخدمين|العملاء)|تسجيل\s+(?:الدخول|المستخدم)|المصادقة/i,
        evidence: /\/api\/auth\/login|bearer|jwt/i,
    },
    {
        id: 'multi_vendor', ar: 'سوق متعدّد البائعين', en: 'multi-vendor marketplace',
        ask: /multi[- ]?vendor|marketplace|multi[- ]?seller|متعدد(ة)? البائعين|سوق إلكتروني|تجّار/i,
        // A generated data model declares its tables — «{"key":"vendors"…}» in
        // entities.js is a real table with real CRUD, not a mention of a word.
        evidence: /vendor_?id|seller_?id|\/api\/vendors|"key":"vendors"|\bvendors\s*\(|VendorDashboard|merchant_?id/i,
    },
    {
        id: 'ai_generation', ar: 'توليد المنتجات بالذكاء الاصطناعي', en: 'AI product generation',
        ask: /\bai\b[^.]{0,24}\b(generat|product|content|writ)|توليد[^.]{0,20}(بالذكاء|ذكاء اصطناعي)/i,
        evidence: /openai|anthropic|\/api\/generate|generateProduct|completions/i,
    },
    {
        id: 'inventory', ar: 'إدارة المخزون', en: 'inventory management',
        ask: /\binventory\b|\bstock\b|المخزون|إدارة المخزون/i,
        evidence: /'stock'|"stock"|stock:\s|stock_?(quantity|level|count)|"key":"movements"|\/api\/inventory|quantity_?on_?hand/i,
    },
    {
        id: 'payments', ar: 'المدفوعات', en: 'payments',
        ask: PAYMENT_REQUEST,
        evidence: /stripe|paypal|payment_?intent|\/api\/payments?|checkout_?session/i,
    },
    {
        id: 'form_validation', ar: 'التحقق من النموذج', en: 'form validation',
        ask: /required\s+fields?|prevent(?:s|ing)?\s+submission|submission\s+prevention|clear\s+error\s+summary|form\s+validation|حقول?\s+(?:إلزامي|مطلوب)|منع\s+(?:الإرسال|التقديم)|ملخص\s+(?:واضح\s+)?للأخطاء/i,
        evidence: /fields\s*\.filter\(\s*f\s*=>\s*f\.required|f\.required\s*&&|setError\(|role\s*=\s*["']alert["']|aria-live/i,
        evidenceCheck: hasFormValidationEvidence,
    },
    {
        id: 'contact_form', ar: 'نموذج التواصل أو الزيارة', en: 'Visit contact form',
        ask: /(?:contact|enquiry|inquiry)\s+form|form\s+(?:on|for)\s+(?:the\s+)?(?:contact|visit)\s+page|نموذج\s+(?:تواصل|اتصال|زيارة)|استمارة\s+(?:تواصل|اتصال|زيارة)/iu,
        evidence: /<form\b[^>]*(?:onSubmit|onsubmit)\s*=|type\s*=\s*["']email["']/i,
        evidenceCheck: source => /<form\b/i.test(source) && /type\s*=\s*["']email["']/i.test(source),
    },
    {
        id: 'shipping', ar: 'الشحن', en: 'shipping',
        ask: /\b(?:shipping|shipments?|fulfilment|fulfillment|shipping\s+(?:options?|address|service|management)|delivery\s+(?:tracking|status|options?|address|service|management)|deliver(?:y|ies)\s+(?:orders?|packages?|products?))\b|الشحن|التوصيل/i,
        evidence: /"key":"shipments"|\/api\/shipping|tracking_?number|\bshipment_/i,
    },
    {
        id: 'coupons', ar: 'الكوبونات والخصومات', en: 'coupons and discounts',
        ask: /\bcoupons?\b|\bdiscounts?\b|\bpromo\b|كوبون|خصومات|أكواد خصم/i,
        evidence: /"key":"coupons"|promo_?code|discount_?code|\/api\/coupons/i,
    },
    {
        id: 'loyalty', ar: 'برنامج الولاء', en: 'loyalty program',
        ask: /\bloyalty\b|\brewards?\b|\bpoints\b|الولاء|نقاط المكافآت/i,
        evidence: /\bloyalty\b|reward_?points|\/api\/loyalty/i,
    },
    {
        id: 'mobile_app', ar: 'تطبيق الجوال', en: 'mobile app',
        ask: /\bmobile app\b|\bios\b|\bandroid\b|react[- ]native|تطبيق (جوال|موبايل|هاتف)/i,
        evidence: /react-native|\bexpo\b|capacitor|cordova/i,
    },
    {
        id: 'analytics', ar: 'التحليلات', en: 'analytics',
        ask: /\banalytics?\b|\breporting\b|\bkpi\b|تحليلات|إحصائيات/i,
        evidence: /\/api\/(?:stats|analytics)|<canvas|sparkline|chart\.js|(?:analytics|metrics)\s*(?:route|router|endpoint|data|series|chart|dashboard|panel)/i,
    },
    {
        id: 'support', ar: 'دعم العملاء', en: 'customer support',
        ask: /customer support|\bhelpdesk\b|\btickets?\b|live chat|دعم العملاء|تذاكر الدعم/i,
        evidence: /\/api\/tickets|helpdesk|live_?chat|support_?ticket/i,
    },
    {
        id: 'marketing', ar: 'أتمتة التسويق', en: 'marketing automation',
        ask: /marketing automation|\bcampaigns?\b|\bnewsletter\b|أتمتة التسويق|حملات تسويق|النشرة البريدية/i,
        evidence: /\/api\/campaigns|newsletter|mailchimp|email_?campaign/i,
    },
    {
        id: 'seo', ar: 'تهيئة محركات البحث', en: 'SEO',
        ask: /\bseo\b|search engine optimi|محركات البحث/i,
        evidence: /sitemap|robots\.txt|application\/ld\+json/i,
    },
    {
        id: 'i18n', ar: 'تعدّد اللغات', en: 'multi-language',
        ask: /multi[- ]?lingual|multi[- ]?language|\bi18n\b|localization|تعدد اللغات|متعدد اللغات/i,
        evidence: /\bi18n\b|translations|useTranslation|setLanguage|lang-switch/i,
    },
    {
        id: 'multi_currency', ar: 'تعدّد العملات', en: 'multi-currency',
        ask: /multi[- ]?currenc|تعدد العملات|عملات متعددة/i,
        evidence: /currencies|currency_?code|exchange_?rate|\bfx\b/i,
    },
    {
        id: 'reviews', ar: 'تقييمات العملاء', en: 'customer reviews',
        // A bare `rating` is commonly a record column, not a customer-review
        // system. Require review context before opening this capability gate.
        ask: /\breviews\b|\b(?:customer|user|product|item)\s+review\b|\b(?:customer|user|product|item|star)\s+ratings?\b|تقييمات\s*(?:العملاء|المنتجات)|مراجعات/i,
        evidence: /'reviews'|"reviews"|\/api\/reviews|\brating:\s|stars?_?count/i,
    },
    {
        id: 'search', ar: 'البحث', en: 'search',
        ask: /\bsearch(?:ing)?\b|بحث|ابحث/iu,
        evidence: /setQuery|searchTerm|onSearch|\[query,/i,
        evidenceCheck: hasSearchEvidence,
    },
    {
        id: 'filtering', ar: 'التصفية', en: 'filtering',
        ask: /\bfilters?\b|\bfiltering\b|تصفية|فلترة|فلاتر|مرشحات?/iu,
        evidence: /\b[A-Za-z][A-Za-z0-9_]*Filter\b|\bset[A-Za-z0-9_]*Filter\b/i,
        evidenceCheck: hasFilterEvidence,
    },
    {
        id: 'sorting', ar: 'الفرز', en: 'sorting',
        ask: /\bsort(?:ing)?\b|فرز|ترتيب\s+(?:حسب|وفق)/iu,
        evidence: /\bsort(?:By|Order|Direction|Key)?\b|\bsetSort[A-Za-z0-9_]*\b/i,
        evidenceCheck: hasSortingEvidence,
    },
    {
        id: 'responsive', ar: 'واجهة متجاوبة', en: 'responsive interface',
        ask: /responsive|mobile[- ]first|tablet|phone[- ]friendly|متجاوب(?:ة|ه)?|للهاتف|للجوال|الجوال|الهاتف/i,
        evidence: RESPONSIVE_LAYOUT,
    },
    {
        id: 'arabic_rtl', ar: 'واجهة عربية RTL', en: 'Arabic RTL interface',
        ask: /arabic\s+(?:rtl\s+)?interface|interface\s+in\s+arabic|واجهة\s+عربي(?:ة|ه)|واجهة\s+باللغة\s+العربية|اتجاه\s+عربي/iu,
        evidence: /<html\b(?=[^>]*\blang=["']ar(?:-[^"']+)?["'])(?=[^>]*\bdir=["']rtl["'])[^>]*>/iu,
        evidenceCheck: hasArabicRtlEvidence,
    },
    {
        id: 'services_section', ar: 'قسم خدمات', en: 'a services section',
        ask: /services?\s+(?:section|list)|section\s+(?:for|of)\s+services?|قسم\s+(?:ال)?خدمات|قائمة\s+(?:ال)?خدمات/iu,
        evidence: /<(?:section|div)\b[^>]*(?:id|class(?:Name)?)=["'][^"']*services?[^"']*["']/iu,
        evidenceCheck: hasServicesSectionEvidence,
    },
    {
        id: 'contact_cta', ar: 'زر تواصل واضح', en: 'a clear contact button',
        ask: /(?:clear\s+)?contact\s+(?:button|cta)|(?:button|cta)\s+(?:for|to)\s+contact|زر\s+(?:تواصل|اتصال)(?:\s+واضح)?/iu,
        evidence: /<a\b[^>]*href=["'](?:#contact|tel:|mailto:)[^"']*["'][^>]*>/iu,
        evidenceCheck: hasContactCtaEvidence,
    },
    {
        id: 'wishlist', ar: 'قائمة الرغبات', en: 'wishlist',
        ask: /\bwishlist\b|\bfavorites?\b|قائمة الرغبات|المفضلة/i,
        evidence: /wishlist|favou?rites/i,
    },
    {
        id: 'subscriptions', ar: 'الاشتراكات', en: 'subscriptions',
        ask: /\bsubscriptions?\b|\brecurring\b|اشتراكات|اشتراك شهري/i,
        evidence: /subscription|recurring|billing_?cycle/i,
    },
    {
        id: 'notifications', ar: 'الإشعارات', en: 'notifications',
        ask: /\bnotifications?\b|\bpush\b|إشعارات|تنبيهات/i,
        evidence: /notification|web-?push|\/api\/notifications/i,
    },
];

function capabilityIsRequested(capability: Capability, text: string): boolean {
    if (!capability.ask.test(text)) return false;
    if (capability.id !== 'accounts') return true;
    return !/\b(?:does\s+not|doesn't|do\s+not|don't|without|no)\s+(?:require(?:s|d)?\s+)?auth(?:entication|orization)?\b|\bno[- ]auth\b/iu.test(text);
}

/** Which capabilities the request actually names. */
export function requestedCapabilities(request: string): Capability[] {
    const text = intentProbe(String(request || ''));
    if (!text.trim()) return [];
    return CAPABILITIES.filter(c => capabilityIsRequested(c, text));
}

const CODE_EXT = /\.(jsx?|tsx?|css|html|json|webmanifest|py)$/i;
const PRODUCTION_CODE_EXT = /\.(jsx?|tsx?)$/i;
/**
 * A LOCKFILE IS NOT EVIDENCE OF A FEATURE. Test-only and specification-only
 * text is not runtime evidence either; the scan deliberately reads production
 * source files, not assertions that merely describe a feature.

 *
 * The first run of this reported «multi-vendor marketplace ✅ built» for a
 * single-table store — because package-lock.json mentions the word «vendor»
 * a few hundred times. A dependency inventory is a list of OTHER people's
 * code; it says nothing about what this system does.
 */
const NOT_EVIDENCE = /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/i;
const DEFAULT_MAX_SCAN_BYTES = 600 * 1024;
const CODE_ONLY_MAX_SCAN_BYTES = 512 * 1024;

export interface ProjectSourceReadOptions {
    /** Restrict the snapshot to production JavaScript/TypeScript source. */
    codeOnly?: boolean;
}

/** Read the built system's own source, bounded, so the evidence is real. */
export function readProjectSource(dirs: string[], options: ProjectSourceReadOptions = {}): string {
    const codeOnly = options.codeOnly === true;
    const extension = codeOnly ? PRODUCTION_CODE_EXT : CODE_EXT;
    const maxScanBytes = codeOnly ? CODE_ONLY_MAX_SCAN_BYTES : DEFAULT_MAX_SCAN_BYTES;
    let out = '';
    const visit = (dir: string, depth: number) => {
        if (out.length > maxScanBytes || depth > 4) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (out.length > maxScanBytes) return;
            if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'public' || (codeOnly && e.name === 'build')) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { visit(full, depth + 1); continue; }
            if (!extension.test(e.name) || NOT_EVIDENCE.test(e.name)) continue;
            const normalized = full.toLowerCase();
            if (normalized.includes('/__tests__/') || normalized.includes('/tests/') || /(?:^|[._-])(test|spec)(?:[._-]|$)/i.test(e.name)) continue;
            try { out += '\n' + fs.readFileSync(full, 'utf-8'); } catch { /* unreadable is not evidence */ }
        }
    };
    for (const d of dirs) { if (d && fs.existsSync(d)) visit(d, 0); }
    return out.slice(0, maxScanBytes);
}

export interface ScopeReport {
    requested: Capability[];
    built: Capability[];
    missing: Capability[];
    /**
     *  HIS OWN CLAUSES THAT THIS VOCABULARY CANNOT CHECK AT ALL.
     *
     *  Measured on five real requests:
     *
     *      «…، مع بحث بالاسم وترتيب بالدرجة»   → search, and NOTHING for the sort
     *      «…، وصفحة ثانية تعرض مجموع الرواتب» → counter, and NOTHING for the page
     *      «…، مع سلة مشتريات»                  → NOTHING in the acceptance catalogue
     *          (this one IS known here, and is filtered out below — the
     *           two catalogues are different, and only this one runs here)
     *      «…، ويحفظ البيانات على خادم»         → NOTHING at all
     *      «home page, projects page, contact form» → NOTHING at all
     *
     *  A capability that produces no criterion cannot fail, so Joe can
     *  report success without ever having looked at it. A criterion that
     *  fails is a fact; one that was never written is a silence, and the
     *  line «ولم أفحص بقية نص طلبك» confesses the silence without naming
     *  what is in it.
     *
     *  These are his own words, cut from his sentence by the same reader
     *  that decides a clause is not a column. Nothing is invented: the
     *  vocabulary below is not consulted to FIND them, only to remove the
     *  ones it can already check.
     */
    unchecked: string[];
}

/** Evaluate ordinary and shape-aware evidence without asking a model to infer intent. */
export function capabilityEvidence(capability: Capability, source: string, ctx?: ScopeEvidenceContext): boolean {
    return capability.evidence.test(source) || Boolean(capability.evidenceCheck?.(source, ctx));
}

const INTERFACE_FILE = /\.(?:html?|jsx|tsx|vue|svelte)$/i;

/**
 * Does the delivered tree carry an interface for people? An index.html at a
 * root, in src/, public/ or dist/, or any page/component file. Without one the
 * delivery is API-only and its route handlers are the scope evidence.
 */
export function deliveredTreeHasInterface(dirs: string[]): boolean {
    let found = false;
    const visit = (dir: string, depth: number) => {
        if (found || depth > 4) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (found) return;
            if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
            if (e.isDirectory()) { visit(path.join(dir, e.name), depth + 1); continue; }
            if (INTERFACE_FILE.test(e.name)) found = true;
        }
    };
    for (const d of dirs) { if (d && fs.existsSync(d)) visit(d, 0); }
    return found;
}

/**
 *  The two readers split a sentence differently — one on «و» before a rule,
 *  the other on every «و» — so the same clause arrives with different edges.
 *  Compared folded and by containment, never by equality.
 */
function foldForCompare(text: string): string {
    return String(text || '')
        .replace(/[ً-ْٰـ]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
}

/** The comparison itself: named against evidenced. */
export function scopeReport(request: string, projectDirs: string[]): ScopeReport {
    const requested = requestedCapabilities(request);
    //  Computed before the early return: a request that names no KNOWN
    //  capability is exactly the one most likely to be full of unknown
    //  ones, and returning early there would hide them all.
    /**
     *  ONE CLAUSE, ONE VOICE.
     *
     *  Measured in a single reply on the owner's screen, about one clause:
     *
     *      «You wrote these and I have no way to check them, so I did not
     *       — and I am not claiming I did: لا تقبل سعرًا صفرًا»
     *      «your condition: «لا تقبل سعرًا صفرًا» — the bound is in the schema»
     *
     *  «I could not check it» and «it is applied», four lines apart, about the
     *  same sentence he wrote. Both were true from where they stood: this
     *  audit lists clauses no CAPABILITY matches, and the acceptance ledger
     *  now reads those same clauses as rules and judges them.
     *
     *  The ledger is the one voice, because it says all three things a clause
     *  can be — met, unmet, or declared unprovable. A clause it has spoken
     *  about is not unchecked; it is judged, and saying otherwise beside its
     *  own verdict is how one reply contradicts itself.
     */
    const claimed = statedRules(request).map(r => foldForCompare(r.text));
    const namedColumns = (columnsAnywhereInHisRequest(request) || []).map(column => foldForCompare(column.label));
    // A colon-led page list is already represented by the page acceptance
    // ledger. Do not report one of its names as an unchecked capability just
    // because the generic clause splitter sees the final item after `and`.
    const pageListStart = String(request).toLocaleLowerCase().indexOf('website:') >= 0
        ? String(request).toLocaleLowerCase().indexOf('website:') + 'website:'.length
        : String(request).toLocaleLowerCase().indexOf('site:') >= 0
            ? String(request).toLocaleLowerCase().indexOf('site:') + 'site:'.length
            : -1;
    const pageListBody = pageListStart < 0 ? '' : String(request).slice(pageListStart).split(/\s+with\b/i)[0].toLocaleLowerCase();
    const explicitPageNames = new Set(
        clausesBeyondTheColumns(request)
            .filter(clause => pageListBody.includes(clause.toLocaleLowerCase()))
            .map(value => foldForCompare(value)),
    );
    const unchecked = clausesBeyondTheColumns(request)
        .filter(clause => !CAPABILITIES.some(c => capabilityIsRequested(c, intentProbe(clause))))
        .filter(clause => {
            const c = foldForCompare(clause);
            if (explicitPageNames.has(c)) return false;
            // A column reader has already classified this exact phrase as a
            // field. It is not an unchecked capability merely because the
            // clause splitter saw it after the list separator.
            if (namedColumns.some(label => label === c)) return false;
            return !claimed.some(r => r === c || r.includes(c) || c.includes(r));
        });
    if (!requested.length) return { requested: [], built: [], missing: [], unchecked };
    const src = readProjectSource(projectDirs);
    const ctx: ScopeEvidenceContext = { serviceOnly: !deliveredTreeHasInterface(projectDirs) };
    const built = requested.filter(c => capabilityEvidence(c, src, ctx));
    const missing = requested.filter(c => !built.includes(c));
    return { requested, built, missing, unchecked };
}

/**
 * The paragraph he was owed. Silent when the request named nothing specific
 * («ابن لي متجراً» promises nothing to compare against), and silent about the
 * obvious when everything asked for is there — except to say so in one line.
 */
export function formatScope(r: ScopeReport, isAr: boolean): string {
    // Below three named capabilities there is no meaningful gap to report:
    // a two-word request is not a specification.
    /**
     *  «ولم أفحص بقية نص طلبك» — AND WHAT IS IN IT?
     *
     *  That line was already honest and already useless: it confesses a
     *  silence without naming what is inside it. He asked for a sort, a
     *  second page, a cart, a server — and no criterion was written for any
     *  of them, so none of them could fail, so the build could be declared
     *  a success with all four missing.
     *
     *  Naming them costs nothing and changes what he can do next. A man
     *  told «I did not check the rest» has to reread his own sentence to
     *  find out what was skipped. A man told «لم أفحص: ترتيب بالدرجة»
     *  already knows.
     */
    const confess = (): string => {
        if (!r.unchecked.length) return '';
        const list = r.unchecked.slice(0, 6).join(' · ');
        return (isAr
            ? `⚠️ وهذه كتبتَها ولا أعرف كيف أتحقّق منها، فلم أفحصها ولم أدّعِ أنّي فعلت: ${list}`
            : `⚠️ You wrote these and I have no way to check them, so I did not — and I am not claiming I did: ${list}`) + '\n';
    };
    //  Below three named capabilities there is no meaningful gap to report:
    //  a two-word request is not a specification. What he wrote and nobody
    //  can check is reported anyway — no threshold covers that part.
    if (r.requested.length < 3) return confess();
    const name = (c: Capability) => (isAr ? c.ar : c.en);
    if (!r.missing.length) {
        return (isAr
            ? `📋 القدرات التي أعرف كيف أتحقق منها وسمّيتَها (${r.requested.length}) موجودة في هذا البناء — ولم أفحص بقية نص طلبك.\n`
            : `📋 The capabilities I know how to check and you named (${r.requested.length}) are in this build — I did not inspect the rest of your request.\n`) + confess();
    }
    const lines: string[] = [];
    lines.push(isAr
        ? `📋 القدرات التي أعرف كيف أتحقق منها وسمّيتَها — ${r.requested.length} في التقرير؛ ولم أفحص بقية نص طلبك:`
        : `📋 The capabilities I know how to check and you named — ${r.requested.length} in this report; I did not inspect the rest of your request:`);
    if (r.built.length) {
        lines.push(isAr
            ? `   ✅ بُنيت ${r.built.length}: ${r.built.map(name).join(' · ')}`
            : `   ✅ Built (${r.built.length}): ${r.built.map(name).join(' · ')}`);
    }
    lines.push(isAr
        ? `   ❌ لم تُبنَ ${r.missing.length}: ${r.missing.map(name).join(' · ')}`
        : `   ❌ Not built (${r.missing.length}): ${r.missing.map(name).join(' · ')}`);
    lines.push(isAr
        ? `   ↳ لا أدّعي عكس ذلك: كلٌّ منها بناء قائم بذاته. قل «ابنِ ${r.missing[0].ar}» وأبنيها فوق هذا النظام.`
        : `   ↳ I am not pretending otherwise: each is a build of its own. Say "build ${r.missing[0].en}" and I will add it on top of this system.`);
    return lines.join('\n') + '\n' + confess();
}
