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
}

/**
 * The vocabulary of the things people actually ask a builder for. Each entry
 * carries both languages in one pattern — his prompts mix them freely.
 */
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
        ask: /\breviews?\b|\bratings?\b|تقييمات|مراجعات/i,
        evidence: /'reviews'|"reviews"|\/api\/reviews|\brating:\s|stars?_?count/i,
    },
    {
        id: 'search', ar: 'البحث والفرز', en: 'search and sorting',
        ask: /\bsearch\b|\bfilter\b|\bsort\b|بحث|تصفية|فرز/i,
        evidence: /setQuery|searchTerm|onSearch|sortBy|\[query,/i,
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
}

/** The comparison itself: named against evidenced. */
export function scopeReport(request: string, projectDirs: string[]): ScopeReport {
    const requested = requestedCapabilities(request);
    if (!requested.length) return { requested: [], built: [], missing: [] };
    const src = readProjectSource(projectDirs);
    const built = requested.filter(c => c.evidence.test(src));
    const missing = requested.filter(c => !built.includes(c));
    return { requested, built, missing };
}

/**
 * The paragraph he was owed. Silent when the request named nothing specific
 * («ابن لي متجراً» promises nothing to compare against), and silent about the
 * obvious when everything asked for is there — except to say so in one line.
 */
export function formatScope(r: ScopeReport, isAr: boolean): string {
    // Below three named capabilities there is no meaningful gap to report:
    // a two-word request is not a specification.
    if (r.requested.length < 3) return '';
    const name = (c: Capability) => (isAr ? c.ar : c.en);
    if (!r.missing.length) {
        return isAr
            ? `📋 كل ما سمّيتَه في طلبك (${r.requested.length}) موجود في هذا البناء.\n`
            : `📋 Everything you named (${r.requested.length}) is in this build.\n`;
    }
    const lines: string[] = [];
    lines.push(isAr
        ? `📋 ما طلبتَه مقابل ما بُني — سمّيتَ ${r.requested.length} قدرة:`
        : `📋 What you asked for vs what was built — you named ${r.requested.length} capabilities:`);
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
    return lines.join('\n') + '\n';
}
