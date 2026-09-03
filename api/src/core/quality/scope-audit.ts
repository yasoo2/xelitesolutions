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
    evidenceCheck?: (source: string) => boolean;
}

/**
 * The vocabulary of the things people actually ask a builder for. Each entry
 * carries both languages in one pattern — his prompts mix them freely.
 */
const SEARCH_INTERACTION = /<form\b[^>]*(?:onSubmit|onsubmit)\s*=|type\s*=\s*["']search["']|onKey(?:Down|Press)\s*=|event\.key\s*===?\s*["']Enter["']/i;
const SEARCH_STATE_OR_IO = /\b(?:useState|set[A-Z][A-Za-z0-9_]*|fetch|axios|XMLHttpRequest|query|searchTerm|results?|filtered|handleSearch|findCities|onSearch)\b/i;

/**
 * Search is a runtime interaction, not merely a variable name. Accept the
 * established names as a supporting alternative, or require an interaction
 * shape paired with state, a handler, or a data fetch/update.
 */
export function hasSearchEvidence(source: string): boolean {
    return /setQuery|searchTerm|onSearch|sortBy|\[query,/i.test(source)
        || (SEARCH_INTERACTION.test(source) && SEARCH_STATE_OR_IO.test(source));
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
        ask: /\bpayments?\b|\bstripe\b|\bpaypal\b|\bcheckout\b|المدفوعات|بوابة دفع/i,
        evidence: /stripe|paypal|payment_?intent|\/api\/payments?|checkout_?session/i,
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
        ask: /\breviews?\b|\b(?:customer|user|product|item|star)\s+ratings?\b|تقييمات\s*(?:العملاء|المنتجات)|مراجعات/i,
        evidence: /'reviews'|"reviews"|\/api\/reviews|\brating:\s|stars?_?count/i,
    },
    {
        id: 'search', ar: 'البحث والفرز', en: 'search and sorting',
        ask: /\bsearch\b|\bfilter\b|\bsort\b|بحث|تصفية|فرز/i,
        evidence: /setQuery|searchTerm|onSearch|sortBy|\[query,/i,
        evidenceCheck: hasSearchEvidence,
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

/** Which capabilities the request actually names. */
export function requestedCapabilities(request: string): Capability[] {
    const text = String(request || '');
    if (!text.trim()) return [];
    return CAPABILITIES.filter(c => c.ask.test(text));
}

const CODE_EXT = /\.(jsx?|tsx?|css|html|json|webmanifest)$/i;
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
export function capabilityEvidence(capability: Capability, source: string): boolean {
    return capability.evidence.test(source) || Boolean(capability.evidenceCheck?.(source));
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
    const unchecked = clausesBeyondTheColumns(request)
        .filter(clause => !CAPABILITIES.some(c => c.ask.test(clause)))
        .filter(clause => {
            const c = foldForCompare(clause);
            // A column reader has already classified this exact phrase as a
            // field. It is not an unchecked capability merely because the
            // clause splitter saw it after the list separator.
            if (namedColumns.some(label => label === c)) return false;
            return !claimed.some(r => r === c || r.includes(c) || c.includes(r));
        });
    if (!requested.length) return { requested: [], built: [], missing: [], unchecked };
    const src = readProjectSource(projectDirs);
    const built = requested.filter(c => capabilityEvidence(c, src));
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
