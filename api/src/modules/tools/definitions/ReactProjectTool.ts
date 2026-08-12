/**
 * STAGE 2 OF THE WORLD-CLASS ROADMAP — real Vite + React projects.
 *
 * Bolt and Lovable generate framework projects, not pages. Joe now does too —
 * with the discipline that makes his pages reliable applied to React: the
 * PROJECT SHAPE is deterministic (hand-written, parameterized templates that
 * compile by construction — a weak model is never asked to write JSX it might
 * break), the DESIGN comes from Joe's own palette engine (same tokens, same
 * AA guarantees, RTL first), and the CONTENT is derived from the request.
 *
 * The scaffold is a complete runnable project: package.json, vite.config,
 * React 18 components, router-free single-page App, tokens.css from the
 * palette. When npm is available the tool INSTALLS and BUILDS it on the spot
 * — streamed live to the terminal — so what is reported as working compiled
 * for real. `dev_server_start` (already in Joe) then serves it live.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { buildPalette, paletteCss, darkTokenBlock, lightTokenBlock } from '../../../core/design/design-system';
import { brandFrom, brandFallback } from '../../../core/design/page-head';
import { detectPageKind, type PageKind } from '../../../core/design/blueprints';
import { detectAppKind, blueprintFor, type AppBlueprint } from '../../../core/design/app-blueprints';
import { buildAppFiles, fileAppCss } from './react-app-templates';
import { familyFor, familyCss, familyFonts, FAMILY_LABEL_AR, type DesignFamily } from '../../../core/design/families';
import { resolveImages, sanitizeContentImages } from '../../../core/design/images';
import { broadcast, broadcastThinkingDetail, broadcastTerminalLine } from '../../../api/ws';
import { persistJoeProjects } from '../../../api/page-store';
import { publicUrlFor } from '../../../shared/utils/publicUrl';
import { repairAndRebuild, worthRepairing } from '../../../core/quality/self-repair';

const slug = (s: string) => (String(s || '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32)) || 'app';

/** Escape a string for safe embedding inside a JS single-quoted literal. */
const js = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');

interface ReactContent {
    brand: string;
    tagline: string;
    heroTitle: string;
    heroLede: string;
    cta: string;
    featuresTitle: string;
    features: Array<{ title: string; text: string }>;
    contactTitle: string;
    ctaBandTitle: string;
    ctaBandText: string;
    isArabic: boolean;
    /** Which hero ARCHETYPE this build wears — the component falls back to
     *  'centered' whenever no photograph arrived, so it is never a promise. */
    heroLayout: 'overlay' | 'split' | 'centered';
    /** The trust strip under the hero — short, kind-specific, three of them. */
    perks: string[];
    /** A real photo mosaic. Empty until the archives answer; an empty gallery
     *  renders NOTHING rather than an empty section. */
    galleryTitle: string;
    gallery: Array<{ src: string; alt: string }>;
    /** The story block — copy beside one photograph BORROWED from the mosaic
     *  (a story worth telling costs no extra download). */
    storyTitle: string;
    storyBody: string[];
    storyImage?: { src: string; alt: string } | null;
    /** How it works, numbered — the section every service page needs. */
    stepsTitle: string;
    steps: Array<{ title: string; text: string }>;
    /** The tier comparison matrix — built from `tiers`, never authored twice. */
    compareTitle: string;
    /** The faces behind the work — real portraits through the avatar slot. */
    teamTitle: string;
    team: Array<{ name: string; role: string; photoSubject?: string; img?: { src: string; alt: string } | null }>;
    /** The location block. Renders ONLY from real business memory. */
    locationTitle: string;
    /** Kind-specific blocks — only the ones the kind's section list uses are rendered. */
    menuTitle: string;
    menu: Array<{ name: string; desc: string; price: string; img?: { src: string; alt: string } | null }>;
    /** Store product cards — real merchandise with photos, not abstract tiers. */
    productsTitle: string;
    products: Array<{ name: string; desc: string; price: string; img?: { src: string; alt: string } | null }>;
    pricingTitle: string;
    tiers: Array<{ name: string; price: string; period: string; features: string[]; featured?: boolean }>;
    testimonialsTitle: string;
    /** photoSubject: an authored English portrait subject for the avatar slot —
     *  the archives title their photographs in English, so asking in Arabic
     *  would refuse every candidate. Never serialized into the app. */
    testimonials: Array<{ name: string; role: string; quote: string; photoSubject?: string; img?: { src: string; alt: string } | null }>;
    faqTitle: string;
    faq: Array<{ q: string; a: string }>;
    stats: Array<{ value: string; label: string }>;
    /** A real licensed photograph, or null — never a broken <img>. */
    heroImage?: { src: string; alt: string } | null;
    /** CC attribution for the photos the app carries — a licence obligation. */
    credits?: Array<{ creator: string; license: string; source: string }>;
}

/**
 * One REAL hero photograph through Joe's existing image engine — the same
 * archives, subject-grounding and licence bookkeeping every page build uses.
 * The file is COPIED INTO the project's public/ so the dev server and the
 * published dist both carry it. Best-effort by contract: no network, no
 * result, any error → { image: null } and the app ships clean without one.
 */
export async function fetchHeroImage(opts: {
    subject: string; projDir: string; hue: number; artifactDir: string;
}): Promise<{ image: { src: string; alt: string } | null; credits: Array<{ creator: string; license: string; source: string }>; note: string }> {
    try {
        // The engine replaces a marker with a BARE local URL and then hardens
        // the surrounding <img> — so the marker must live inside a src
        // attribute. A marker floating in a <div> comes back as loose text
        // with no src= to parse, and the app would never get its photo.
        const probe = `<img src="{{IMAGE:hero|${opts.subject.replace(/["|{}]/g, ' ').trim().slice(0, 90)}}}" alt="">`;
        const r = await resolveImages(probe, opts.artifactDir, opts.hue, { max: 1, timeoutMs: 20_000 });
        const m = r.html.match(/src="\/artifacts\/images\/([^"]+)"[^>]*/);
        if (!r.real || !m) return { image: null, credits: [], note: `no photo (${r.sourceErrors[0] || 'archives returned nothing'})` };
        const file = m[1];
        const from = path.join(opts.artifactDir, 'images', file);
        if (!fs.existsSync(from)) return { image: null, credits: [], note: 'resolved photo missing on disk' };
        fs.mkdirSync(path.join(opts.projDir, 'public', 'images'), { recursive: true });
        fs.copyFileSync(from, path.join(opts.projDir, 'public', 'images', file));
        const alt = (r.html.match(/alt="([^"]*)"/) || [, opts.subject])[1] || opts.subject;
        return { image: { src: `images/${file}`, alt }, credits: r.credits, note: `1 real licensed photo (${Object.keys(r.sources).join(',')})` };
    } catch (e: any) {
        return { image: null, credits: [], note: `photo step skipped (${String(e?.message || e).slice(0, 80)})` };
    }
}

/**
 * REAL photographs for a list of subjects — ONE batched resolveImages call
 * for all of them (the engine fetches distinct subjects sequentially and caps
 * the total itself). Each marker is wrapped in an indexed <figure> so a
 * subject whose archives came back empty maps to null while its neighbours
 * keep their photos — never a shifted-by-one gallery. Files are copied into
 * public/ like the hero; best-effort by contract. The slot rides the engine's
 * own sizing judgement: 'card' for dishes, 'avatar' for portraits.
 */
export async function fetchCardImages(opts: {
    subjects: string[]; projDir: string; hue: number; artifactDir: string;
    slot?: 'card' | 'avatar' | 'hero'; label?: string;
}): Promise<{ images: Array<{ src: string; alt: string } | null>; credits: Array<{ creator: string; license: string; source: string }>; note: string }> {
    const slot = opts.slot || 'card';
    const label = opts.label || 'dish';
    try {
        if (!opts.subjects.length) return { images: [], credits: [], note: 'no subjects' };
        const probe = opts.subjects.map((s, i) =>
            `<figure data-card="${i}"><img src="{{IMAGE:${slot}|${s.replace(/["|{}]/g, ' ').trim().slice(0, 90)}}}" alt=""></figure>`).join('\n');
        const r = await resolveImages(probe, opts.artifactDir, opts.hue, { max: opts.subjects.length, timeoutMs: 30_000 });
        const images = opts.subjects.map((s, i): { src: string; alt: string } | null => {
            const seg = r.html.match(new RegExp(`<figure data-card="${i}">([\\s\\S]*?)</figure>`))?.[1] || '';
            const m = seg.match(/src="\/artifacts\/images\/([^"]+)"/);
            if (!m) return null;                          // gradient fallback → this dish ships clean
            const from = path.join(opts.artifactDir, 'images', m[1]);
            if (!fs.existsSync(from)) return null;
            fs.mkdirSync(path.join(opts.projDir, 'public', 'images'), { recursive: true });
            fs.copyFileSync(from, path.join(opts.projDir, 'public', 'images', m[1]));
            const alt = (seg.match(/alt="([^"]*)"/) || [, s])[1] || s;
            return { src: `images/${m[1]}`, alt };
        });
        const real = images.filter(Boolean).length;
        return { images, credits: r.credits, note: `${real}/${opts.subjects.length} real ${label} photos (${Object.keys(r.sources).join(',') || r.sourceErrors[0] || 'archives returned nothing'})` };
    } catch (e: any) {
        return { images: opts.subjects.map(() => null), credits: [], note: `${label} photos skipped (${String(e?.message || e).slice(0, 80)})` };
    }
}

/** Union of credit lists, deduped by source — a licence line appears once. */
export function mergeCredits(
    a?: Array<{ creator: string; license: string; source: string }>,
    b?: Array<{ creator: string; license: string; source: string }>,
): Array<{ creator: string; license: string; source: string }> {
    const out = [...(a || [])];
    for (const c of (b || [])) if (!out.some(x => x.source === c.source)) out.push(c);
    return out;
}

/** A multi-page app: pages composed from the SAME section components. */
export interface AppPage { path: string; title: string; titleEn: string; sections: string[] }

/**
 * The page plan per kind. The home page keeps the hero and the social
 * proof; the kind's core content gets its own page; contact is always its
 * own destination — the shape every real business site uses.
 */
export function pagesForKind(kind: PageKind): AppPage[] {
    switch (kind) {
        case 'restaurant': return [
            { path: '/', title: 'الرئيسية', titleEn: 'Home', sections: ['Hero', 'Testimonials', 'Cta'] },
            { path: '/menu', title: 'القائمة', titleEn: 'Menu', sections: ['Menu', 'Gallery'] },
            { path: '/contact', title: 'تواصل معنا', titleEn: 'Contact', sections: ['Contact'] },
        ];
        case 'store': return [
            { path: '/', title: 'الرئيسية', titleEn: 'Home', sections: ['Hero', 'Testimonials', 'Cta'] },
            { path: '/products', title: 'المنتجات', titleEn: 'Products', sections: ['Products', 'Gallery', 'Faq'] },
            { path: '/contact', title: 'تواصل معنا', titleEn: 'Contact', sections: ['Contact'] },
        ];
        default: return [
            { path: '/', title: 'الرئيسية', titleEn: 'Home', sections: ['Hero', 'Features', 'Stats', 'Cta'] },
            { path: '/about', title: 'عن المشروع', titleEn: 'About', sections: ['Testimonials', 'Faq'] },
            { path: '/contact', title: 'تواصل معنا', titleEn: 'Contact', sections: ['Contact'] },
        ];
    }
}

/** Does the request ask for a MULTI-PAGE app? Single-page stays the default. */
export function wantsMultiPage(text: string): boolean {
    return /(متعدد\s*الصفحات|متعدده?\s*الصفحات|صفحات\s*(مترابطة|متعددة|متعدده)|عدة\s*صفحات|multi\s*-?\s*page|multiple\s*pages|with\s*pages)/i.test(String(text || ''));
}

/**
 * WHICH sections a kind of app carries — the same judgement the page
 * builder's blueprints encode, applied to the React component library. A
 * restaurant without its menu is a landing page wearing a restaurant's name.
 */
/**
 * The hero ARCHETYPE — the single biggest reason two sites look alike is one
 * hero shape for all of them. A restaurant deserves a full-bleed photograph
 * with the copy laid over it; a SaaS page reads better split; a page with no
 * photograph at all is centred on purpose rather than by accident.
 */
export function heroLayoutFor(kind: PageKind, family: DesignFamily): 'overlay' | 'split' | 'centered' {
    if (kind === 'restaurant' || kind === 'event') return 'overlay';
    if (kind === 'store') return family === 'elegant' ? 'overlay' : 'split';
    // Everything else is SPLIT — a photograph beside the copy. 'centered' is
    // never wished for: it is what the component falls back to when no
    // photograph arrived, so a downloaded photo is never left unrendered.
    return 'split';
}

export function sectionsForKind(kind: PageKind): string[] {
    switch (kind) {
        case 'restaurant': return ['Hero', 'Menu', 'Gallery', 'Story', 'Steps', 'Team', 'Testimonials', 'Cta', 'Location', 'Contact'];
        // Real product CARDS with photos and prices — a store sells things,
        // not subscription tiers. Pricing stays for app/dashboard kinds.
        case 'store': return ['Hero', 'Products', 'Gallery', 'Story', 'Steps', 'Testimonials', 'Cta', 'Faq', 'Location', 'Contact'];
        case 'landing': return ['Hero', 'Features', 'Steps', 'Stats', 'Team', 'Testimonials', 'Cta', 'Contact'];
        case 'portfolio': return ['Hero', 'Features', 'Gallery', 'Story', 'Team', 'Stats', 'Cta', 'Contact'];
        case 'dashboard':
        case 'app': return ['Hero', 'Features', 'Steps', 'Pricing', 'Compare', 'Cta', 'Faq', 'Contact'];
        case 'event': return ['Hero', 'Steps', 'Stats', 'Cta', 'Faq', 'Contact'];
        default: return ['Hero', 'Features', 'Steps', 'Cta', 'Faq', 'Contact'];
    }
}

/** Content derived from the request — deterministic, never blocks on a model. */
function deriveContent(request: string, isAr: boolean, kind: PageKind = 'generic'): ReactContent {
    const brand = brandFrom(request, isAr) || brandFallback(request, isAr, kind);
    const subject = request.replace(/(ابنِ|ابني|انشئ|أنشئ|اصنع|اعمل|سوي|مشروع|تطبيق|موقع|react|ريأكت|رياكت|vite|فيت|لي|جديد|build|create|make|app|project|site)/gi, ' ')
        .replace(/\s+/g, ' ').trim();
    const restaurant = kind === 'restaurant';
    const store = kind === 'store';
    const base: ReactContent = isAr ? {
        brand,
        tagline: subject || 'منصة حديثة سريعة',
        heroTitle: subject ? `${brand} — ${subject}` : `${brand} يبدأ من هنا`,
        heroLede: restaurant
            ? 'نكهات تُطبخ بشغف وتصل طازجة — تصفح القائمة واحجز طاولتك.'
            : store
                ? 'منتجات مختارة بعناية وتجربة شراء سريعة وواضحة الأسعار.'
                : 'تطبيق React حقيقي بأداء فوري، مبني بهوية بصرية متسقة وجاهز للنشر.',
        cta: restaurant ? 'احجز طاولة' : store ? 'تسوق الآن' : 'ابدأ الآن',
        featuresTitle: 'لماذا نحن؟',
        features: [
            { title: 'سرعة فورية', text: 'بناء Vite حديث — تحميل فوري وتحديث حي أثناء التطوير.' },
            { title: 'هوية متسقة', text: 'ألوان ومقاسات من نظام تصميم واحد، بوضعين ليلي ونهاري.' },
            { title: 'جاهز للتوسع', text: 'مكوّنات React نظيفة قابلة لإضافة صفحات وميزات جديدة.' },
        ],
        contactTitle: 'تواصل معنا',
        ctaBandTitle: restaurant ? 'طاولتك جاهزة الليلة' : store ? 'وصّلنا لك الأفضل' : 'جاهز تبدأ؟',
        ctaBandText: restaurant ? 'احجز الآن ودع المطبخ يتكفل بالباقي.' : store ? 'اطلب اليوم ويصلك بسرعة وبتغليف يليق.' : 'خطوتك الأولى تبعد ضغطة زر واحدة.',
        isArabic: true,
        heroLayout: 'centered',
        perks: restaurant
            ? ['مكونات طازجة يومياً', 'حجز فوري بلا انتظار', 'مواقف متاحة للعملاء']
            : store
                ? ['شحن سريع', 'دفع آمن', 'استرجاع خلال 14 يوماً']
                : ['إطلاق خلال دقائق', 'يعمل على كل الأجهزة', 'دعم عربي كامل'],
        galleryTitle: restaurant ? 'من داخل المطعم' : store ? 'من المعرض' : 'أعمالنا',
        gallery: [],
        storyTitle: restaurant ? 'حكايتنا' : store ? 'عن علامتنا' : 'قصتنا',
        storyBody: restaurant
            ? ['بدأنا بمطبخ صغير ووصفة واحدة، والباقي كتبه الزبائن الذين عادوا في اليوم التالي.',
                'اليوم نطبخ بالمكونات نفسها والمعيار نفسه: لو ما يعجبنا نحن، لا يخرج من المطبخ.']
            : store
                ? ['اخترنا أن نبيع أقل ونختار أفضل — كل قطعة تمر بفحص قبل أن تصل إليك.',
                    'التغليف والشحن جزء من المنتج عندنا، لأن التجربة تبدأ من لحظة الفتح.']
                : ['بدأ المشروع بحاجة حقيقية لم نجد لها حلاً مريحاً، فبنينا الحل الذي كنا نبحث عنه.',
                    'نطوّره كل أسبوع بملاحظات المستخدمين، والأولوية دائماً لما يوفّر وقتك.'],
        storyImage: null,
        stepsTitle: restaurant ? 'كيف تحجز؟' : store ? 'كيف تطلب؟' : 'كيف يعمل؟',
        steps: restaurant
            ? [{ title: 'اختر الوقت', text: 'حدد اليوم وعدد الأشخاص من نموذج التواصل.' },
                { title: 'نؤكد لك', text: 'نرد بتأكيد الحجز خلال دقائق في أوقات العمل.' },
                { title: 'تفضّل', text: 'طاولتك جاهزة عند وصولك — بلا انتظار.' }]
            : store
                ? [{ title: 'اختر منتجك', text: 'تصفح المنتجات واختر ما يناسبك.' },
                    { title: 'أكّد الطلب', text: 'اطلب مباشرة من صفحة المنتج بخطوة واحدة.' },
                    { title: 'يصلك', text: 'نجهّز الطلب ونشحنه بتغليف يليق به.' }]
                : [{ title: 'أنشئ حسابك', text: 'دقيقتان وأنت جاهز — بلا إعدادات معقدة.' },
                    { title: 'اربط بياناتك', text: 'استورد ما لديك وابدأ من حيث توقفت.' },
                    { title: 'انطلق', text: 'تابع النتائج من لوحة واحدة واضحة.' }],
        compareTitle: 'مقارنة الباقات',
        teamTitle: restaurant ? 'من يقف خلف المطبخ' : 'الفريق',
        team: [
            { name: 'ليان القحطاني', role: restaurant ? 'رئيسة الطهاة' : 'المؤسِّسة', photoSubject: 'professional woman portrait smiling' },
            { name: 'فهد الدوسري', role: restaurant ? 'مدير الصالة' : 'قائد المنتج', photoSubject: 'professional man portrait' },
            { name: 'ريم العنزي', role: restaurant ? 'مسؤولة الضيافة' : 'مسؤولة تجربة العملاء', photoSubject: 'young professional woman portrait' },
        ],
        locationTitle: restaurant ? 'موقعنا وأوقات العمل' : 'أين تجدنا',
        menuTitle: 'قائمة الطعام',
        menu: [
            { name: 'طبق اليوم', desc: 'وصفة الشيف الموسمية بمكونات طازجة', price: '48 ر.س' },
            { name: 'مشاوي مشكلة', desc: 'تشكيلة مشاوي على الفحم مع الأرز', price: '65 ر.س' },
            { name: 'سلطة الموسم', desc: 'خضار المزرعة مع صلصة الليمون', price: '24 ر.س' },
            { name: 'حلو البيت', desc: 'حلوى اليوم من مطبخنا', price: '18 ر.س' },
        ],
        productsTitle: 'منتجاتنا',
        products: [
            { name: 'الإصدار الكلاسيكي', desc: 'الخيار الأقرب لقلوب عملائنا', price: '120 ر.س' },
            { name: 'الإصدار الفاخر', desc: 'خامات أرقى ولمسة نهائية مميزة', price: '220 ر.س' },
            { name: 'طقم الهدية', desc: 'تغليف أنيق جاهز للإهداء', price: '180 ر.س' },
            { name: 'الأكثر مبيعاً', desc: 'اختيار عملائنا هذا الموسم', price: '150 ر.س' },
        ],
        pricingTitle: 'الباقات والأسعار',
        tiers: [
            { name: 'الأساسية', price: '49', period: 'ر.س/شهر', features: ['كل الأساسيات', 'دعم بالبريد', 'تحديثات مستمرة'] },
            { name: 'الاحترافية', price: '99', period: 'ر.س/شهر', features: ['كل ما في الأساسية', 'أولوية الدعم', 'تقارير متقدمة'], featured: true },
            { name: 'المؤسسات', price: '199', period: 'ر.س/شهر', features: ['كل ما في الاحترافية', 'مدير حساب', 'تخصيص كامل'] },
        ],
        testimonialsTitle: 'ماذا قالوا عنا',
        testimonials: [
            { name: 'سارة العتيبي', role: restaurant ? 'زبونة دائمة' : 'صاحبة مشروع', quote: restaurant ? 'أفضل نكهة جربتها — والخدمة أسرع مما توقعت.' : 'تجربة سلسة من أول ضغطة — أنصح به بلا تردد.', photoSubject: 'smiling woman customer portrait' },
            { name: 'محمد الشهري', role: restaurant ? 'ناقد طعام' : 'مدير تسويق', quote: restaurant ? 'التفاصيل الصغيرة هنا تصنع الفرق، من التقديم إلى الطعم.' : 'رفع أداء فريقنا بشكل ملموس خلال أسابيع.', photoSubject: 'smiling man portrait' },
        ],
        faqTitle: 'أسئلة شائعة',
        faq: [
            { q: restaurant ? 'هل يلزم حجز مسبق؟' : 'كيف أبدأ؟', a: restaurant ? 'نهاية الأسبوع يفضَّل الحجز؛ بقية الأيام تسع الصالة الجميع.' : 'أنشئ حسابك وستكون جاهزاً خلال دقيقتين.' },
            { q: store ? 'ما سياسة الاسترجاع؟' : 'هل يمكن الإلغاء في أي وقت؟', a: store ? 'استرجاع مجاني خلال 14 يوماً بحالة المنتج الأصلية.' : 'نعم — بلا رسوم وبلا أسئلة.' },
            { q: 'كيف أتواصل معكم؟', a: 'من نموذج التواصل أدناه، ونرد خلال يوم عمل.' },
        ],
        stats: [
            { value: '+500', label: restaurant ? 'طبق يقدَّم يومياً' : 'عميل نشط' },
            { value: '4.9', label: 'تقييم العملاء' },
            { value: '24/7', label: 'دعم متواصل' },
        ],
    } : {
        brand,
        tagline: subject || 'A fast modern platform',
        heroTitle: subject ? `${brand} — ${subject}` : `${brand} starts here`,
        heroLede: 'A real React app with instant performance, a consistent design system, ready to ship.',
        cta: restaurant ? 'Book a table' : store ? 'Shop now' : 'Get started',
        featuresTitle: 'Why us?',
        features: [
            { title: 'Instant speed', text: 'A modern Vite build — instant loads and live reload in development.' },
            { title: 'One identity', text: 'Colours and rhythm from a single token system, light and dark.' },
            { title: 'Built to grow', text: 'Clean React components ready for new pages and features.' },
        ],
        contactTitle: 'Contact us',
        ctaBandTitle: restaurant ? 'Your table is ready tonight' : store ? 'The best, delivered' : 'Ready to start?',
        ctaBandText: restaurant ? 'Book now — the kitchen handles the rest.' : store ? 'Order today, arrive fast, wrapped right.' : 'Your first step is one click away.',
        isArabic: false,
        heroLayout: 'centered',
        perks: restaurant
            ? ['Fresh every morning', 'Instant booking', 'Parking on site']
            : store
                ? ['Fast shipping', 'Secure checkout', '14-day returns']
                : ['Live in minutes', 'Works on every device', 'Real human support'],
        galleryTitle: restaurant ? 'Inside the room' : store ? 'The gallery' : 'Selected work',
        gallery: [],
        storyTitle: restaurant ? 'Our story' : store ? 'About the brand' : 'How we got here',
        storyBody: restaurant
            ? ['We started with a small kitchen and one recipe; the rest was written by the guests who came back the next day.',
                'The standard has not moved since: if we would not eat it, it does not leave the kitchen.']
            : store
                ? ['We chose to sell less and choose better — every piece is checked before it reaches you.',
                    'Packaging and shipping are part of the product here, because the experience starts at the unboxing.']
                : ['The project began as a real need with no comfortable answer, so we built the answer we were looking for.',
                    'It ships every week on user feedback, and whatever saves your time goes first.'],
        storyImage: null,
        stepsTitle: restaurant ? 'How to book' : store ? 'How to order' : 'How it works',
        steps: restaurant
            ? [{ title: 'Pick a time', text: 'Choose the day and the party size in the contact form.' },
                { title: 'We confirm', text: 'You get a confirmation within minutes during opening hours.' },
                { title: 'Just arrive', text: 'Your table is ready — no waiting.' }]
            : store
                ? [{ title: 'Choose', text: 'Browse the products and pick what fits.' },
                    { title: 'Order', text: 'One step, straight from the product card.' },
                    { title: 'Delivered', text: 'We pack it properly and ship it out.' }]
                : [{ title: 'Create an account', text: 'Two minutes, no complicated setup.' },
                    { title: 'Bring your data', text: 'Import what you have and pick up where you left off.' },
                    { title: 'Go', text: 'Follow the results from one clear dashboard.' }],
        compareTitle: 'Compare the plans',
        teamTitle: restaurant ? 'Behind the kitchen' : 'The team',
        team: [
            { name: 'Layan Q.', role: restaurant ? 'Head chef' : 'Founder', photoSubject: 'professional woman portrait smiling' },
            { name: 'Fahad D.', role: restaurant ? 'Floor manager' : 'Product lead', photoSubject: 'professional man portrait' },
            { name: 'Reem A.', role: restaurant ? 'Host' : 'Customer experience', photoSubject: 'young professional woman portrait' },
        ],
        locationTitle: restaurant ? 'Find us & opening hours' : 'Where to find us',
        menuTitle: 'The menu',
        menu: [
            { name: 'Dish of the day', desc: 'The chef\'s seasonal recipe', price: '$18' },
            { name: 'Mixed grill', desc: 'Charcoal grill selection with rice', price: '$24' },
            { name: 'Season salad', desc: 'Farm greens, lemon dressing', price: '$9' },
        ],
        productsTitle: 'Our products',
        products: [
            { name: 'Classic edition', desc: 'The customer favourite', price: '$39' },
            { name: 'Premium edition', desc: 'Finer materials, finished by hand', price: '$69' },
            { name: 'Gift set', desc: 'Elegant packaging, ready to give', price: '$59' },
        ],
        pricingTitle: 'Plans & pricing',
        tiers: [
            { name: 'Basic', price: '19', period: '$/mo', features: ['All the essentials', 'Email support'] },
            { name: 'Pro', price: '49', period: '$/mo', features: ['Everything in Basic', 'Priority support'], featured: true },
            { name: 'Enterprise', price: '99', period: '$/mo', features: ['Everything in Pro', 'Account manager'] },
        ],
        testimonialsTitle: 'What people say',
        testimonials: [
            { name: 'Sarah M.', role: 'Founder', quote: 'Smooth from the first click — highly recommended.', photoSubject: 'smiling woman customer portrait' },
            { name: 'Omar K.', role: 'Marketing lead', quote: 'Lifted our team\'s output within weeks.', photoSubject: 'smiling man portrait' },
        ],
        faqTitle: 'FAQ',
        faq: [
            { q: 'How do I start?', a: 'Create your account — you are live in two minutes.' },
            { q: 'Can I cancel anytime?', a: 'Yes — no fees, no questions.' },
        ],
        stats: [
            { value: '+500', label: 'active customers' },
            { value: '4.9', label: 'customer rating' },
            { value: '24/7', label: 'support' },
        ],
    };
    return base;
}

/* ---------- the templates — compile-safe by construction -------------------- */

function filePackageJson(name: string): string {
    return JSON.stringify({
        name: slug(name), private: true, version: '0.1.0', type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^5.4.11' },
    }, null, 2);
}

function fileViteConfig(): string {
    return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the production build also works from a subpath (GitHub Pages).
export default defineConfig({
  plugins: [react()],
  base: './',
});
`;
}

/**
 * THE HEAD A REACT BUILD WAS SHIPPING WITHOUT.
 *
 * Plain HTML pages have carried a favicon, a theme-colour and share cards
 * since the publish-ready pass; the React path never got them. Two costs,
 * both silent:
 *
 *   • a page with no icon makes the browser probe /favicon.ico, which 404s —
 *     and Joe's own self-QA then reported «1 خطأ كونسول» and docked 15 points
 *     from EVERY React build the user ever received. He saw 85/100 on clean
 *     work with no way to know why;
 *   • shared on WhatsApp or X, the link came up blank.
 */
function fileIndexHtml(c: ReactContent, hue = 260): string {
    const { faviconDataUri } = require('../../../core/design/logo');
    const esc = (s: string) => String(s || '').replace(/"/g, '&quot;');
    const h = ((Math.round(hue) % 360) + 360) % 360;
    return `<!DOCTYPE html>
<html lang="${c.isArabic ? 'ar' : 'en'}" dir="${c.isArabic ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${c.brand}</title>
    <meta name="description" content="${esc(c.tagline)}" />
    <link rel="icon" type="image/svg+xml" href="${faviconDataUri({ brand: c.brand, hue: h, isArabic: c.isArabic })}" />
    <meta name="theme-color" content="hsl(${h},62%,50%)" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(c.brand)}" />
    <meta property="og:description" content="${esc(c.tagline)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(c.brand)}" />
    <meta name="twitter:description" content="${esc(c.tagline)}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
}

function fileMainJsx(): string {
    return `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/base.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
}

/**
 * A ~40-line hash router instead of a react-router dependency, on purpose:
 * the production build publishes to STATIC hosting (GitHub Pages), where a
 * history router 404s on refresh at any subpath. Hash navigation survives
 * refresh anywhere, adds zero install weight, and cannot drift versions.
 */
function fileRouterJsx(): string {
    return `import React, { useEffect, useState } from 'react';

const readPath = () => {
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : '/' + raw;
};

export function usePath() {
  const [path, setPath] = useState(readPath);
  useEffect(() => {
    const onChange = () => {
      setPath(readPath());
      // A new page starts at its top, the way real navigation does.
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function Link({ to, children, className }) {
  const current = usePath() === to;
  return (
    <a className={className} href={'#' + to} aria-current={current ? 'page' : undefined}>
      {children}
    </a>
  );
}
`;
}

/** The multi-page App: pages composed from the SAME section components. */
function fileMultiPageAppJsx(pages: AppPage[], isAr: boolean): string {
    const comps = [...new Set(pages.flatMap(p => p.sections))];
    const pageConst = pages.map(p => {
        const title = isAr ? p.title : p.titleEn;
        return `  { path: '${p.path}', title: '${js(title)}', render: (content) => (<>\n${p.sections.map(s => `    <${s} content={content} />`).join('\n')}\n  </>) },`;
    }).join('\n');
    return `import React from 'react';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import ProductView from './components/ProductView.jsx';
import AdminPanel from './components/AdminPanel.jsx';
${comps.map(c => `import ${c} from './components/${c}.jsx';`).join('\n')}
import { usePath } from './router.jsx';
import { content } from './content.js';
import { useReveal } from './reveal.js';

export const pages = [
${pageConst}
];

export default function App() {
  const path = usePath();
  useReveal();
  const page = pages.find((p) => p.path === path);
  return (
    <>
      <AdminPanel content={content} />
      <ProductView content={content} />
      <Navbar content={content} pages={pages} />
      <main>
        {path.startsWith('/product/') ? null : page ? page.render(content) : (
          <section className="section"><div className="wrap">
            <h1>404</h1>
            <p>${isAr ? 'هذه الصفحة غير موجودة — عد إلى الرئيسية من القائمة.' : 'This page does not exist — head back home from the menu.'}</p>
          </div></section>
        )}
      </main>
      <Footer content={content} />
    </>
  );
}
`;
}

/** Navbar for the multi-page app: real page Links with aria-current. */
function fileMultiPageNavbarJsx(): string {
    return `import React, { useEffect, useState } from 'react';
import { Link } from '../router.jsx';

export default function Navbar({ content, pages }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
  }, [dark]);
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link className="brand" to="/">{content.brand}</Link>
        <nav className="nav-links">
          {pages.map((p) => <Link key={p.path} to={p.path}>{p.title}</Link>)}
        </nav>
        <button type="button" className="theme-toggle" aria-pressed={dark} onClick={() => setDark(d => !d)}>
          {dark ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
}
`;
}

/** App.jsx assembled from the KIND's section list — only what is used is imported. */
function fileAppJsx(sections: string[]): string {
    const comps = ['Navbar', ...sections, 'Footer'];
    const shop = sections.includes('Products');
    return `import React from 'react';
${comps.map(c => `import ${c} from './components/${c}.jsx';`).join('\n')}
${shop ? "import ProductView from './components/ProductView.jsx';\n" : ''}import AdminPanel from './components/AdminPanel.jsx';
import { content } from './content.js';
import { useReveal } from './reveal.js';

export default function App() {
  useReveal();
  return (
    <>
      <AdminPanel content={content} />
${shop ? '      <ProductView content={content} />\n' : ''}      <Navbar content={content} />
      <main>
${sections.map(c => `        <${c} content={content} />`).join('\n')}
      </main>
      <Footer content={content} />
    </>
  );
}
`;
}

function fileContentJs(c: ReactContent): string {
    return `// The words of the app, in one place — edit here, every component follows.
export const content = {
  brand: '${js(c.brand)}',
  isArabic: ${c.isArabic},
  tagline: '${js(c.tagline)}',
  heroTitle: '${js(c.heroTitle)}',
  heroLede: '${js(c.heroLede)}',
  cta: '${js(c.cta)}',
  featuresTitle: '${js(c.featuresTitle)}',
  features: [
${c.features.map(f => `    { title: '${js(f.title)}', text: '${js(f.text)}' },`).join('\n')}
  ],
  contactTitle: '${js(c.contactTitle)}',
  ctaBandTitle: '${js(c.ctaBandTitle)}',
  ctaBandText: '${js(c.ctaBandText)}',
  // The hero ARCHETYPE this build wears — 'overlay' lays the copy over a
  // full-bleed photograph, 'split' sets it beside one, 'centered' needs none.
  heroLayout: '${js(c.heroLayout)}',
  perks: [${c.perks.map(p => `'${js(p)}'`).join(', ')}],
  galleryTitle: '${js(c.galleryTitle)}',
  storyTitle: '${js(c.storyTitle)}',
  storyBody: [${c.storyBody.map(p => `'${js(p)}'`).join(', ')}],
  // BORROWED from the mosaic below — a story never costs another download.
  storyImage: ${c.storyImage ? `{ src: '${js(c.storyImage.src)}', alt: '${js(c.storyImage.alt)}' }` : 'null'},
  stepsTitle: '${js(c.stepsTitle)}',
  steps: [
${c.steps.map(t => `    { title: '${js(t.title)}', text: '${js(t.text)}' },`).join('\n')}
  ],
  compareTitle: '${js(c.compareTitle)}',
  teamTitle: '${js(c.teamTitle)}',
  team: [
${c.team.map(t => `    { name: '${js(t.name)}', role: '${js(t.role)}', img: ${t.img ? `{ src: '${js(t.img.src)}', alt: '${js(t.img.alt)}' }` : 'null'} },`).join('\n')}
  ],
  locationTitle: '${js(c.locationTitle)}',
  gallery: [
${c.gallery.map(g => `    { src: '${js(g.src)}', alt: '${js(g.alt)}' },`).join('\n')}
  ],
  // '' on a single page, '/' when the hash router owns the address bar —
  // the product URLs follow whichever this build uses.
  routeBase: '${js((c as any).routeBase || '')}',
  // The navigation is built from the sections this app ACTUALLY has — a
  // restaurant's menu used to link to a #features anchor that never existed.
  navLinks: [
${((c as any).navLinks || []).map((n: any) => `    { href: '${js(n.href)}', label: '${js(n.label)}' },`).join('\n')}
  ],
  menuTitle: '${js(c.menuTitle)}',
  menu: [
${c.menu.map(m => `    { name: '${js(m.name)}', desc: '${js(m.desc)}', price: '${js(m.price)}', img: ${m.img ? `{ src: '${js(m.img.src)}', alt: '${js(m.img.alt)}' }` : 'null'} },`).join('\n')}
  ],
  productsTitle: '${js(c.productsTitle)}',
  products: [
${c.products.map(p => `    { name: '${js(p.name)}', desc: '${js(p.desc)}', price: '${js(p.price)}', slug: '${js(slug(p.name))}', img: ${p.img ? `{ src: '${js(p.img.src)}', alt: '${js(p.img.alt)}' }` : 'null'} },`).join('\n')}
  ],
  pricingTitle: '${js(c.pricingTitle)}',
  tiers: [
${c.tiers.map(t => `    { name: '${js(t.name)}', price: '${js(t.price)}', period: '${js(t.period)}', featured: ${t.featured ? 'true' : 'false'}, features: [${t.features.map(f => `'${js(f)}'`).join(', ')}] },`).join('\n')}
  ],
  testimonialsTitle: '${js(c.testimonialsTitle)}',
  testimonials: [
${c.testimonials.map(t => `    { name: '${js(t.name)}', role: '${js(t.role)}', quote: '${js(t.quote)}', img: ${t.img ? `{ src: '${js(t.img.src)}', alt: '${js(t.img.alt)}' }` : 'null'} },`).join('\n')}
  ],
  faqTitle: '${js(c.faqTitle)}',
  faq: [
${c.faq.map(f => `    { q: '${js(f.q)}', a: '${js(f.a)}' },`).join('\n')}
  ],
  stats: [
${c.stats.map(s => `    { value: '${js(s.value)}', label: '${js(s.label)}' },`).join('\n')}
  ],
  // A real licensed photograph, or null — the Hero renders cleanly either way.
  heroImage: ${c.heroImage ? `{ src: '${js(c.heroImage.src)}', alt: '${js(c.heroImage.alt)}' }` : 'null'},
  credits: [
${(c.credits || []).map(cr => `    { creator: '${js(cr.creator)}', license: '${js(cr.license)}', source: '${js(cr.source)}' },`).join('\n')}
  ],
  // Joe's inbox — the previewed app really delivers its form; a published
  // copy cannot reach localhost, and the form says so honestly instead.
  inbox: '${js((c as any).inbox || '')}',
  // The session's Joe API, when one was built first — the list sections
  // read their LIVE rows from it and fall back to the rows above, and the
  // order buttons WRITE visitor orders into its orders table.
  api: '${js((c as any).api || '')}',
  ordersApi: '${js((c as any).ordersApi || '')}',
  orderCta: '${js((c as any).orderCta || 'اطلب الآن')}',
  // The owner's REAL details from Joe's business memory — or null, never a
  // fabricated placeholder.
  heroSecondary: ${(c as any).heroSecondary ? `{ label: '${js((c as any).heroSecondary.label)}', href: '${js((c as any).heroSecondary.href)}' }` : 'null'},
  contact: ${(c as any).contact ? `{ phone: '${js((c as any).contact.phone)}', wa: '${js((c as any).contact.wa)}', email: '${js((c as any).contact.email)}', instagram: '${js((c as any).contact.instagram)}', twitter: '${js((c as any).contact.twitter)}', address: '${js((c as any).contact.address)}', hours: '${js((c as any).contact.hours)}' }` : 'null'},
};
`;
}

function fileNavbarJsx(): string {
    return `import React, { useEffect, useState } from 'react';

export default function Navbar({ content }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
  }, [dark]);
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <a className="brand" href="#top">{content.brand}</a>
        <nav className="nav-links">
          {(content.navLinks || []).map((l) => (
            <a href={l.href} key={l.href}>{l.label}</a>
          ))}
        </nav>
        <button type="button" className="theme-toggle" aria-pressed={dark} onClick={() => setDark(d => !d)}>
          {dark ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
}
`;
}

function fileHeroJsx(): string {
    return `import React from 'react';

// Three archetypes, one component. The layout the build ASKED for only
// happens when a real photograph arrived — otherwise the hero centres itself
// on purpose instead of leaving a hole where a picture should have been.
export default function Hero({ content }) {
  const layout = content.heroImage ? (content.heroLayout || 'split') : 'centered';
  const copy = (
    <div className="hero-copy">
      <span className="hero-eyebrow">✦ {content.tagline}</span>
      <h1>{content.heroTitle}</h1>
      <p className="lede">{content.heroLede}</p>
      <div className="hero-ctas">
        <a className="btn" href="#contact">{content.cta}</a>
        {content.heroSecondary ? (
          <a className="btn btn-ghost" href={content.heroSecondary.href}>{content.heroSecondary.label}</a>
        ) : null}
      </div>
    </div>
  );
  const perks = (content.perks && content.perks.length) ? (
    <div className="perks-band">
      <ul className="wrap perks">
        {content.perks.map((p) => (
          <li className="perk" key={p}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
  if (layout === 'overlay') {
    return (
      <section className="hero hero-overlay" id="top">
        <img className="hero-bg" src={content.heroImage.src} alt={content.heroImage.alt}
          loading="eager" fetchpriority="high" decoding="async" />
        <div className="hero-scrim" aria-hidden="true" />
        <div className="wrap">{copy}</div>
        {perks}
      </section>
    );
  }
  if (layout === 'split') {
    return (
      <section className="hero hero-split-layout" id="top">
        <div className="wrap hero-split">
          {copy}
          <img className="hero-photo" src={content.heroImage.src} alt={content.heroImage.alt}
            loading="eager" fetchpriority="high" decoding="async" />
        </div>
        {perks}
      </section>
    );
  }
  return (
    <section className="hero hero-centered" id="top">
      <div className="wrap">{copy}</div>
      {perks}
    </section>
  );
}
`;
}

/** A real photo mosaic — the first cell twice the size, the rest a grid.
 *  With no photographs it renders NOTHING: an empty gallery is worse than
 *  no gallery, and this build refuses to ship a section made of holes. */
function fileGalleryJsx(): string {
    return `import React from 'react';

export default function Gallery({ content }) {
  const shots = content.gallery || [];
  if (!shots.length) return null;
  return (
    <section className="section" id="gallery">
      <div className="wrap">
        <h2>{content.galleryTitle}</h2>
        <div className="gallery-mosaic">
          {shots.map((g, i) => (
            <figure className={i === 0 ? 'shot shot-lead' : 'shot'} key={g.src}>
              <img src={g.src} alt={g.alt} loading="lazy" decoding="async" />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

function fileFeaturesJsx(): string {
    return `import React from 'react';

const ICONS = [
  <svg key="a" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>,
  <svg key="b" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10z"/></svg>,
  <svg key="c" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-5"/></svg>,
];

export default function Features({ content }) {
  return (
    <section className="section" id="features">
      <div className="wrap">
        <h2>{content.featuresTitle}</h2>
        <div className="grid-3">
          {content.features.map((f, i) => (
            <div className="card" key={f.title}>
              <div className="card-icon" aria-hidden="true">{ICONS[i % ICONS.length]}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

function fileContactJsx(): string {
    return `import React, { useState } from 'react';

export default function Contact({ content }) {
  const [sent, setSent] = useState(false);       // 'delivered' | 'kept' | false
  const [form, setForm] = useState({ name: '', email: '', msg: '' });
  const onSubmit = async (e) => {
    e.preventDefault();
    // Joe's inbox first — real delivery when the app runs next to Joe.
    // Anywhere else the fetch fails and the message is kept ON SCREEN for
    // the visitor instead of pretending it was delivered.
    if (content.inbox) {
      try {
        const r = await fetch(content.inbox, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: form, page: document.title }),
        });
        if (r.ok) { setSent('delivered'); return; }
      } catch { /* unreachable — fall through to the honest path */ }
    }
    setSent('kept');
  };
  return (
    <section className="section band" id="contact">
      <div className="wrap">
        <h2>{content.contactTitle}</h2>
        {content.contact ? (
          <ul className="contact-info">
            {content.contact.phone ? <li><a href={'tel:' + content.contact.phone}>📞 {content.contact.phone}</a></li> : null}
            {content.contact.wa ? <li><a href={content.contact.wa} target="_blank" rel="noopener noreferrer">💬 {content.isArabic === false ? 'WhatsApp' : 'واتساب'}</a></li> : null}
            {content.contact.email ? <li><a href={'mailto:' + content.contact.email}>✉️ {content.contact.email}</a></li> : null}
            {content.contact.address ? <li>📍 {content.contact.address}</li> : null}
            {content.contact.hours ? <li>🕐 {content.contact.hours}</li> : null}
          </ul>
        ) : null}
        {sent === 'delivered' ? (
          <p className="form-note">✅ وصلت رسالتك — ستظهر في صندوق رسائل الموقع.</p>
        ) : sent ? (
          <p className="form-note">📝 {form.name ? form.name + ' — ' : ''}{form.msg || '…'}</p>
        ) : (
          <form onSubmit={onSubmit}>
            <input required aria-label="الاسم" placeholder="الاسم" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input required type="email" aria-label="البريد الإلكتروني" placeholder="email@example.com" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <textarea required aria-label="رسالتك" placeholder="رسالتك" value={form.msg}
              onChange={(e) => setForm({ ...form, msg: e.target.value })} />
            <button type="submit" className="btn">{content.cta}</button>
          </form>
        )}
      </div>
    </section>
  );
}
`;
}

function fileMenuJsx(): string {
    return `import React, { useEffect, useState } from 'react';
import OrderButton from './OrderButton.jsx';

export default function Menu({ content }) {
  // The baked rows are the honest default. Built next to a Joe API, the
  // menu asks it for the LIVE rows and swaps them in — photos kept by
  // name — and ANY failure (API stopped, published copy, no link at all)
  // keeps the baked rows without a flicker of breakage.
  const [rows, setRows] = useState(content.menu);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!content.api) return;
    fetch(content.api).then((r) => r.json()).then((d) => {
      const fetched = d.dishes || d.products || d.items;
      if (!Array.isArray(fetched) || !fetched.length) return;
      setRows(fetched.map((f) => ({
        name: f.name, desc: f.details || '', price: f.price || '',
        img: (content.menu.find((m) => m.name === f.name) || {}).img || null,
      })));
      setLive(true);
    }).catch(() => { /* offline or published — the baked rows stand */ });
  }, []);
  return (
    <section className="section" id="menu">
      <div className="wrap">
        <h2>{content.menuTitle}{live ? <span className="live-dot" title="بيانات حية من قاعدة البيانات">●</span> : null}</h2>
        <ul className="menu-list">
          {rows.map((m, i) => (
            <li className={m.img && i % 2 === 1 ? 'menu-item flip' : 'menu-item'} key={m.name}>
              {m.img ? (
                <img className="menu-thumb" src={m.img.src} alt={m.img.alt} loading="lazy" decoding="async" />
              ) : null}
              <div className="menu-body">
                <h3>{m.name}</h3>
                <p>{m.desc}</p>
                {content.ordersApi ? <OrderButton item={m.name} content={content} /> : null}
              </div>
              <strong className="menu-price">{m.price}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
`;
}

function fileProductsJsx(): string {
    return `import React, { useEffect, useState } from 'react';
import OrderButton from './OrderButton.jsx';

export default function Products({ content }) {
  // Baked rows by default; LIVE rows from the session's Joe API when the
  // app was born linked — photos kept by name, failures keep the shelf.
  const [rows, setRows] = useState(content.products);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!content.api) return;
    fetch(content.api).then((r) => r.json()).then((d) => {
      const fetched = d.products || d.dishes || d.items;
      if (!Array.isArray(fetched) || !fetched.length) return;
      setRows(fetched.map((f) => {
        const baked = content.products.find((p) => p.name === f.name) || {};
        return {
          name: f.name, desc: f.details || '', price: f.price || '',
          // A live row still needs a URL of its own; the baked slug when the
          // names match, a derived one otherwise.
          slug: baked.slug || String(f.name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''),
          img: baked.img || null,
        };
      }));
      setLive(true);
    }).catch(() => { /* offline or published — the baked rows stand */ });
  }, []);
  return (
    <section className="section" id="products">
      <div className="wrap">
        <h2>{content.productsTitle}{live ? <span className="live-dot" title="بيانات حية من قاعدة البيانات">●</span> : null}</h2>
        <div className="grid-3 products-grid">
          {rows.map((p) => (
            <div className="card product-card" key={p.name}>
              {p.img ? (
                <img className="product-photo" src={p.img.src} alt={p.img.alt} loading="lazy" decoding="async" />
              ) : null}
              <h3><a className="product-link" href={'#' + (content.routeBase || '') + 'product/' + p.slug}>{p.name}</a></h3>
              <p>{p.desc}</p>
              <div className="product-foot">
                <strong className="product-price">{p.price}</strong>
                {content.ordersApi
                  ? <OrderButton item={p.name} content={content} />
                  : <a className="btn" href="#contact">{content.cta}</a>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

/**
 * The write half of the full-stack link: an inline order form that POSTS a
 * REAL row into the API's orders table. Success shows the order's OWN id
 * (the database assigned it); any failure keeps the visitor's intent on
 * screen honestly and points at the contact form — never a fake "sent".
 */
function fileOrderButtonJsx(): string {
    return `import React, { useState } from 'react';

export default function OrderButton({ item, content }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle');   // idle | sending | done | kept
  const [orderId, setOrderId] = useState(0);
  const [form, setForm] = useState({ customer: '', phone: '', qty: 1 });
  const ar = content.isArabic !== false;
  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    try {
      const r = await fetch(content.ordersApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, qty: Number(form.qty) || 1, customer: form.customer, phone: form.phone }),
      });
      const d = await r.json();
      if (r.ok && d.ok) { setOrderId(d.order.id); setState('done'); return; }
      setState('kept');
    } catch { setState('kept'); }
  };
  if (state === 'done') {
    return <p className="order-note">✅ {ar ? \`استلمنا طلبك رقم #\${orderId} — \${item}\` : \`Order #\${orderId} received — \${item}\`}</p>;
  }
  if (state === 'kept') {
    return <p className="order-note">⚠️ {ar ? \`تعذر الوصول للخادم الآن — اطلب «\${item}» عبر نموذج التواصل.\` : \`The server is unreachable — order "\${item}" via the contact form.\`}</p>;
  }
  if (!open) {
    return <button type="button" className="btn" onClick={() => setOpen(true)}>{content.orderCta}</button>;
  }
  return (
    <form className="order-form" onSubmit={submit}>
      <input required aria-label={ar ? 'الاسم' : 'Name'} placeholder={ar ? 'الاسم' : 'Name'} value={form.customer}
        onChange={(e) => setForm({ ...form, customer: e.target.value })} />
      <input aria-label={ar ? 'الجوال' : 'Phone'} placeholder={ar ? 'الجوال (اختياري)' : 'Phone (optional)'} value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <input type="number" min="1" max="99" aria-label={ar ? 'الكمية' : 'Quantity'} value={form.qty}
        onChange={(e) => setForm({ ...form, qty: e.target.value })} />
      <button type="submit" className="btn" disabled={state === 'sending'}>
        {state === 'sending' ? '…' : ar ? 'أرسل الطلب' : 'Send order'}
      </button>
    </form>
  );
}
`;
}

function filePricingJsx(): string {
    return `import React from 'react';

export default function Pricing({ content }) {
  return (
    <section className="section" id="pricing">
      <div className="wrap">
        <h2>{content.pricingTitle}</h2>
        <div className="grid-3">
          {content.tiers.map((t) => (
            <div className={t.featured ? 'card tier featured' : 'card tier'} key={t.name}>
              <h3>{t.name}</h3>
              <p className="tier-price"><strong>{t.price}</strong> <span>{t.period}</span></p>
              <ul>
                {t.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <a className="btn" href="#contact">{content.cta}</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

function fileTestimonialsJsx(): string {
    return `import React from 'react';

export default function Testimonials({ content }) {
  return (
    <section className="section" id="testimonials">
      <div className="wrap">
        <h2>{content.testimonialsTitle}</h2>
        <div className="grid-3 quote-rail">
          {content.testimonials.map((t) => (
            <figure className="card quote" key={t.name}>
              <blockquote>“{t.quote}”</blockquote>
              <figcaption>
                {t.img ? (
                  <img className="quote-avatar" src={t.img.src} alt={t.img.alt} loading="lazy" decoding="async" />
                ) : null}
                <span><strong>{t.name}</strong> — {t.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

/**
 * A REAL product page at its own URL — «#product/<slug>». Shareable, the
 * back button works, a reload lands on the same product, and it carries the
 * live order button. It is a view, not a modal pretending to be one: the
 * page beneath is inert while it is open, and Escape closes it.
 */

/**
 * THE OWNER'S DASHBOARD — the other half of the lock.
 *
 * The generated API grew real accounts: the catalogue can only be changed
 * with a token, and the orders — which carry customers' names and phone
 * numbers — can only be read with one. That closed the door and left the
 * owner outside it: the credentials Joe prints in the chat had nowhere to be
 * typed except `curl`. A feature is not finished when it exists; it is
 * finished when the system REACHES it.
 *
 * So every app linked to an API ships a `#/admin` screen: sign in, read the
 * orders, add / edit / delete rows, change the password. It is the same
 * overlay pattern the product view uses, so it works on the single-page and
 * multi-page builds alike, and an UNLINKED app never renders it at all.
 *
 * The token lives in localStorage under a per-brand key, so two Joe apps open
 * in one browser do not overwrite each other's session.
 */
function fileAdminPanelJsx(): string {
    return `import React, { useEffect, useState, useCallback } from 'react';

const isAdminHash = () => /^#\\/?admin$/.test(String(window.location.hash || ''));
const apiRoot = (content) => String(content.api || '').replace(/\\/api\\/[a-z]+$/, '/api');
const resourceOf = (content) => String(content.api || '').split('/').filter(Boolean).pop() || 'items';

export default function AdminPanel({ content }) {
  const ar = content.isArabic !== false;
  const root = apiRoot(content);
  const resource = resourceOf(content);
  const tokenKey = 'joe-admin-token:' + (content.brand || 'app');

  const [open, setOpen] = useState(isAdminHash);
  const [token, setToken] = useState(() => { try { return localStorage.getItem(tokenKey) || ''; } catch { return ''; } });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({ name: '', details: '', price: '' });
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const onHash = () => setOpen(isAdminHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const authed = useCallback(async (path, init) => {
    const res = await fetch(root + path, {
      ...(init || {}),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...((init || {}).headers || {}) },
    });
    // An expired or rejected token means «sign in again», not «an error happened».
    if (res.status === 401) { setToken(''); try { localStorage.removeItem(tokenKey); } catch {} }
    return res;
  }, [root, token, tokenKey]);

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const [o, r] = await Promise.all([
        authed('/orders'),
        fetch(root + '/' + resource),
      ]);
      if (o.ok) { const d = await o.json(); setOrders(d.orders || []); }
      const d2 = await r.json().catch(() => null);
      setRows((d2 && d2[resource]) || []);
    } catch (e) {
      setError(ar ? 'تعذّر الاتصال بالخادم — تأكّد أنه يعمل.' : 'Could not reach the server.');
    }
  }, [authed, root, resource, token, ar]);

  useEffect(() => { if (open && token) load(); }, [open, token, load]);

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch(root + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.token) {
        setToken(data.token);
        try { localStorage.setItem(tokenKey, data.token); } catch {}
        setPassword('');
      } else if (res.status === 429) {
        setError(ar ? 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة.' : 'Too many attempts — wait a moment.');
      } else {
        setError(ar ? 'البريد أو كلمة المرور غير صحيحة.' : 'Wrong email or password.');
      }
    } catch (err) {
      setError(ar ? 'تعذّر الاتصال بالخادم — هل هو يعمل؟' : 'Could not reach the server — is it running?');
    }
    setBusy(false);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setBusy(true); setError(''); setNotice('');
    const res = editing
      ? await authed('/' + resource + '/' + editing, { method: 'PUT', body: JSON.stringify(draft) })
      : await authed('/' + resource, { method: 'POST', body: JSON.stringify(draft) });
    if (res.ok) {
      setDraft({ name: '', details: '', price: '' });
      setEditing(null);
      setNotice(ar ? 'حُفظ.' : 'Saved.');
      await load();
    } else {
      setError(ar ? 'لم يُحفظ — راجع الحقول.' : 'Not saved — check the fields.');
    }
    setBusy(false);
  };

  const remove = async (row) => {
    if (!window.confirm((ar ? 'حذف: ' : 'Delete: ') + row.name + '?')) return;
    const res = await authed('/' + resource + '/' + row.id, { method: 'DELETE' });
    if (res.ok) await load();
  };

  const changePassword = async () => {
    const current = window.prompt(ar ? 'كلمة المرور الحالية:' : 'Current password:');
    if (!current) return;
    const next = window.prompt(ar ? 'كلمة المرور الجديدة (8 محارف فأكثر):' : 'New password (8+ characters):');
    if (!next) return;
    const res = await authed('/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) });
    setNotice(res.ok
      ? (ar ? 'تغيّرت كلمة المرور.' : 'Password changed.')
      : (ar ? 'لم تتغيّر — تأكّد من كلمة المرور الحالية وطول الجديدة.' : 'Not changed — check the current password and the new length.'));
  };

  if (!content.api || !open) return null;

  return (
    <div className="admin-panel" role="dialog" aria-modal="true" aria-label={ar ? 'لوحة المالك' : 'Owner dashboard'}>
      <div className="wrap admin-wrap">
        <div className="admin-head">
          <h1>{ar ? 'لوحة المالك' : 'Owner dashboard'}</h1>
          <a className="btn btn-ghost" href={(content.routeBase || '') === '/' ? '#/' : '#'}>
            {ar ? 'إغلاق' : 'Close'}
          </a>
        </div>

        {!token ? (
          <form className="admin-login" onSubmit={signIn}>
            <p className="lede">
              {ar ? 'ادخل ببيانات الحساب الذي أنشأه جو حين بنى الواجهة الخلفية.' : 'Sign in with the account Joe created when it built the backend.'}
            </p>
            <input type="email" dir="ltr" placeholder={ar ? 'البريد' : 'Email'} value={email}
              onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            <input type="password" dir="ltr" placeholder={ar ? 'كلمة المرور' : 'Password'} value={password}
              onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            <button className="btn" type="submit" disabled={busy}>
              {busy ? (ar ? 'جارٍ الدخول…' : 'Signing in…') : (ar ? 'دخول' : 'Sign in')}
            </button>
            {error ? <p className="admin-error">{error}</p> : null}
          </form>
        ) : (
          <>
            <div className="admin-tabs">
              <button className={'btn btn-ghost' + (tab === 'orders' ? ' is-on' : '')} onClick={() => setTab('orders')}>
                {ar ? 'الطلبات' : 'Orders'} ({orders.length})
              </button>
              <button className={'btn btn-ghost' + (tab === 'catalog' ? ' is-on' : '')} onClick={() => setTab('catalog')}>
                {ar ? 'المحتوى' : 'Catalogue'} ({rows.length})
              </button>
              <button className="btn btn-ghost" onClick={changePassword}>{ar ? 'كلمة المرور' : 'Password'}</button>
              <button className="btn btn-ghost admin-out" onClick={() => {
                setToken(''); try { localStorage.removeItem(tokenKey); } catch {}
              }}>{ar ? 'خروج' : 'Sign out'}</button>
            </div>
            {notice ? <p className="admin-notice">{notice}</p> : null}
            {error ? <p className="admin-error">{error}</p> : null}

            {tab === 'orders' ? (
              orders.length ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{ar ? 'الطلب' : 'Item'}</th><th>{ar ? 'العدد' : 'Qty'}</th>
                      <th>{ar ? 'العميل' : 'Customer'}</th><th>{ar ? 'الجوال' : 'Phone'}</th>
                      <th>{ar ? 'الوقت' : 'When'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td>{o.item}</td><td>{o.qty}</td><td>{o.customer}</td>
                        <td dir="ltr">{o.phone || '—'}</td>
                        <td className="admin-when">{String(o.created_at || '').replace('T', ' ').slice(0, 16)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="lede">{ar ? 'لا طلبات بعد.' : 'No orders yet.'}</p>
            ) : (
              <>
                <form className="admin-row-form" onSubmit={save}>
                  <input placeholder={ar ? 'الاسم' : 'Name'} value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
                  <input placeholder={ar ? 'الوصف' : 'Details'} value={draft.details}
                    onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
                  <input placeholder={ar ? 'السعر' : 'Price'} value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
                  <button className="btn" type="submit" disabled={busy}>
                    {editing ? (ar ? 'تحديث' : 'Update') : (ar ? 'إضافة' : 'Add')}
                  </button>
                  {editing ? (
                    <button className="btn btn-ghost" type="button"
                      onClick={() => { setEditing(null); setDraft({ name: '', details: '', price: '' }); }}>
                      {ar ? 'إلغاء' : 'Cancel'}
                    </button>
                  ) : null}
                </form>
                <table className="admin-table">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td className="admin-when">{r.details}</td>
                        <td>{r.price}</td>
                        <td>
                          <button className="btn btn-ghost" onClick={() => {
                            setEditing(r.id);
                            setDraft({ name: r.name || '', details: r.details || '', price: r.price || '' });
                          }}>{ar ? 'تعديل' : 'Edit'}</button>
                          <button className="btn btn-ghost admin-out" onClick={() => remove(r)}>{ar ? 'حذف' : 'Delete'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
`;
}

function fileProductViewJsx(): string {
    return `import React, { useEffect, useState } from 'react';
import OrderButton from './OrderButton.jsx';

// Both shapes are real: «#product/x» on a single-page app, «#/product/x»
// when the hash router owns the address bar.
const slugFromHash = () => {
  const m = String(window.location.hash || '').match(/^#\\/?product\\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : '';
};

export default function ProductView({ content }) {
  const [slug, setSlug] = useState(slugFromHash);
  useEffect(() => {
    const onHash = () => setSlug(slugFromHash());
    const onKey = (e) => { if (e.key === 'Escape' && slugFromHash()) window.history.back(); };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('keydown', onKey); };
  }, []);
  // The page under it must not scroll while the product view is open.
  useEffect(() => {
    document.body.style.overflow = slug ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [slug]);
  if (!slug) return null;
  const p = (content.products || []).find((x) => x.slug === slug);
  const ar = content.isArabic !== false;
  return (
    <div className="product-view" role="dialog" aria-modal="true" aria-label={p ? p.name : ''}>
      <div className="wrap">
        <a className="btn btn-ghost product-back" href={(content.routeBase || '') === '/' ? '#/products' : '#products'}>← {ar ? 'رجوع للمنتجات' : 'Back to products'}</a>
        {!p ? (
          <p className="lede">{ar ? 'لم نجد هذا المنتج.' : 'That product does not exist.'}</p>
        ) : (
          <div className="product-view-grid">
            {p.img ? <img className="product-view-photo" src={p.img.src} alt={p.img.alt} /> : null}
            <div>
              <h1>{p.name}</h1>
              <p className="lede">{p.desc}</p>
              <p className="product-price product-view-price">{p.price}</p>
              {content.ordersApi
                ? <OrderButton item={p.name} content={content} />
                : <a className="btn" href="#contact">{content.cta}</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
`;
}

/** The story — copy beside one photograph, or a typographic panel when the
 *  archives gave nothing. The photo is BORROWED from the mosaic, so a story
 *  never costs another download and never repeats a picture on the page. */
function fileStoryJsx(): string {
    return `import React from 'react';

export default function Story({ content }) {
  const img = content.storyImage;
  return (
    <section className={img ? 'section story' : 'section story story-plain'} id="story">
      <div className="wrap story-grid">
        <div className="story-body">
          <h2>{content.storyTitle}</h2>
          {(content.storyBody || []).map((p) => <p key={p}>{p}</p>)}
        </div>
        {img ? (
          <figure className="story-media">
            <img src={img.src} alt={img.alt} loading="lazy" decoding="async" />
          </figure>
        ) : null}
      </div>
    </section>
  );
}
`;
}

/** How it works — numbered, connected, and readable at a glance. */
function fileStepsJsx(): string {
    return `import React from 'react';

export default function Steps({ content }) {
  return (
    <section className="section" id="steps">
      <div className="wrap">
        <h2>{content.stepsTitle}</h2>
        <ol className="steps">
          {content.steps.map((s, i) => (
            <li className="step card" key={s.title}>
              <span className="step-num" aria-hidden="true">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
`;
}

/** The comparison matrix — assembled from the SAME tiers the cards render,
 *  so a plan can never say one thing in the cards and another in the table. */
function fileCompareJsx(): string {
    return `import React from 'react';

export default function Compare({ content }) {
  const tiers = content.tiers || [];
  if (tiers.length < 2) return null;
  const rows = [];
  for (const t of tiers) for (const f of t.features) if (!rows.includes(f)) rows.push(f);
  const ar = content.isArabic !== false;
  return (
    <section className="section" id="compare">
      <div className="wrap">
        <h2>{content.compareTitle}</h2>
        <div className="table-scroll">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">{ar ? 'الميزة' : 'Feature'}</th>
                {tiers.map((t) => (
                  <th scope="col" key={t.name} className={t.featured ? 'is-featured' : undefined}>{t.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f}>
                  <th scope="row">{f}</th>
                  {tiers.map((t) => (
                    <td key={t.name} className={t.featured ? 'is-featured' : undefined}>
                      {t.features.includes(f)
                        ? <span className="yes" role="img" aria-label={ar ? 'متوفر' : 'included'}>✓</span>
                        : <span className="no" role="img" aria-label={ar ? 'غير متوفر' : 'not included'}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
`;
}

/** The location block — REAL address and hours from Joe's business memory,
 *  with directions links that open the visitor's own map app. With no saved
 *  address it renders NOTHING: an invented pin is worse than no pin. */
function fileLocationJsx(): string {
    return `import React from 'react';

export default function Location({ content }) {
  const c = content.contact;
  if (!c || !c.address) return null;
  const q = encodeURIComponent(c.address);
  const ar = content.isArabic !== false;
  return (
    <section className="section" id="location">
      <div className="wrap">
        <h2>{content.locationTitle}</h2>
        <div className="location-grid">
          <div>
            <p className="location-address">📍 {c.address}</p>
            {c.hours ? <p className="location-hours">🕒 {c.hours}</p> : null}
            {c.phone ? <p><a href={'tel:' + c.phone}>{c.phone}</a></p> : null}
            <div className="hero-ctas">
              <a className="btn" href={'https://www.google.com/maps/search/?api=1&query=' + q}
                target="_blank" rel="noopener noreferrer">{ar ? 'الاتجاهات على الخريطة' : 'Directions'}</a>
              {c.wa ? <a className="btn btn-ghost" href={c.wa} target="_blank" rel="noopener noreferrer">{ar ? 'واتساب' : 'WhatsApp'}</a> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
`;
}

/** The faces behind the work — portraits when the archives answered, clean
 *  monogram circles when they did not. Never a broken avatar. */
function fileTeamJsx(): string {
    return `import React from 'react';

export default function Team({ content }) {
  return (
    <section className="section" id="team">
      <div className="wrap">
        <h2>{content.teamTitle}</h2>
        <div className="grid-3">
          {content.team.map((m) => (
            <figure className="card person" key={m.name}>
              {m.img
                ? <img className="person-photo" src={m.img.src} alt={m.img.alt} loading="lazy" decoding="async" />
                : <span className="person-monogram" aria-hidden="true">{String(m.name || '?').trim().charAt(0)}</span>}
              <figcaption>
                <strong>{m.name}</strong>
                <span>{m.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

function fileFaqJsx(): string {
    return `import React from 'react';

export default function Faq({ content }) {
  return (
    <section className="section" id="faq">
      <div className="wrap">
        <h2>{content.faqTitle}</h2>
        {content.faq.map((f) => (
          <details className="faq-item" key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
`;
}

function fileStatsJsx(): string {
    return `import React from 'react';

export default function Stats({ content }) {
  return (
    <section className="section stats-band" id="stats">
      <div className="wrap stats-row">
        {content.stats.map((s) => (
          <div className="stat" key={s.label}>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
`;
}

function fileCtaJsx(): string {
    return `import React from 'react';

export default function Cta({ content }) {
  return (
    <section className="section cta-band" id="cta">
      <div className="wrap cta-inner">
        <div>
          <h2>{content.ctaBandTitle}</h2>
          <p className="cta-text">{content.ctaBandText}</p>
        </div>
        <a className="btn btn-invert" href="#contact">{content.cta}</a>
      </div>
    </section>
  );
}
`;
}

function fileFooterJsx(): string {
    return `import React from 'react';

export default function Footer({ content }) {
  const c = content.contact;
  return (
    <footer className="site-footer">
      <div className="wrap footer-cols">
        <div className="footer-col">
          <p className="footer-brand">{content.brand}</p>
          <p className="footer-blurb">{content.tagline}</p>
        </div>
        {(content.navLinks || []).length ? (
          <nav className="footer-col">
            <h3>{content.isArabic === false ? 'Sections' : 'الأقسام'}</h3>
            <ul className="footer-links">
              {content.navLinks.map((l) => (
                <li key={l.href}><a href={l.href}>{l.label}</a></li>
              ))}
            </ul>
          </nav>
        ) : null}
        {c && (c.phone || c.email || c.address || c.hours) ? (
          <div className="footer-col">
            <h3>{content.contactTitle}</h3>
            <ul className="footer-links">
              {c.phone ? <li><a href={'tel:' + c.phone}>{c.phone}</a></li> : null}
              {c.email ? <li><a href={'mailto:' + c.email}>{c.email}</a></li> : null}
              {c.address ? <li>{c.address}</li> : null}
              {c.hours ? <li>{c.hours}</li> : null}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="wrap footer-bottom">
        <p>© {new Date().getFullYear()} {content.brand}</p>
        {content.api ? (
          <p className="owner-link">
            <a href={(content.routeBase || '') === '/' ? '#/admin' : '#/admin'}>
              {content.isArabic === false ? 'Owner' : 'دخول المالك'}
            </a>
          </p>
        ) : null}
        {content.contact && (content.contact.instagram || content.contact.twitter) ? (
          <p className="socials">
            {content.contact.instagram ? <a href={'https://instagram.com/' + content.contact.instagram} target="_blank" rel="noopener noreferrer">Instagram</a> : null}
            {content.contact.instagram && content.contact.twitter ? ' · ' : ''}
            {content.contact.twitter ? <a href={'https://x.com/' + content.contact.twitter} target="_blank" rel="noopener noreferrer">X</a> : null}
          </p>
        ) : null}
        {content.credits && content.credits.length ? (
          <p className="credits">
            {content.isArabic === false ? 'Image credits: ' : 'مصادر الصور: '}
            {content.credits.map((c, i) => (
              <span key={c.source || c.creator}>
                {i > 0 ? ' · ' : ''}
                {c.source ? <a href={c.source} target="_blank" rel="noopener noreferrer nofollow">{c.creator}</a> : c.creator}
                {' (' + c.license + ')'}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
`;
}

/** Scroll-reveal: cards drift in as they enter the viewport. Respects
 *  prefers-reduced-motion (the CSS disables it there) and observes only —
 *  content is never hidden from crawlers or reader modes. */
function fileRevealJs(): string {
    return `import { useEffect } from 'react';

export function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('.card, .menu-item, .stat, .faq-item');
    if (!('IntersectionObserver' in window) || !items.length) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }
    }, { threshold: 0.12 });
    items.forEach((el) => { el.setAttribute('data-reveal', ''); io.observe(el); });
    return () => io.disconnect();
  }, []);
}
`;
}

function fileBaseCss(family: DesignFamily): string {
    return `${familyFonts(family).faces}
*,*::before,*::after{box-sizing:border-box}
/* Prices are small bold text on a TINTED band now, and plain --brand measured
   4.43:1 there — a hair under AA. Pulling the brand toward the text colour
   darkens it on light themes and lightens it on dark ones, so it clears 4.5
   in both without ever leaving the palette. */
:root{--price:color-mix(in srgb,var(--brand) 78%,var(--text));--accent:var(--brand-dark)}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--f-font);line-height:1.7}
h1,h2,h3{font-family:var(--f-head);font-weight:var(--f-head-weight)}
.wrap{width:min(100% - 2rem,1180px);margin-inline:auto}
.section{padding-block:clamp(48px,7vw,110px)}
.section h2{font-size:clamp(1.6rem,3vw,2.3rem);margin:0 0 26px;position:relative;padding-bottom:14px}
.section h2::after{content:'';position:absolute;bottom:0;inset-inline-start:0;width:56px;height:4px;border-radius:4px;background:linear-gradient(90deg,var(--brand),var(--brand-dark))}
.band h2::after,.stats-band h2::after{background:color-mix(in srgb,#fff 80%,transparent)}
.site-header{position:sticky;top:0;background:color-mix(in srgb,var(--surface) 84%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--border);z-index:10}
.header-inner{display:flex;align-items:center;gap:20px;min-height:64px}
.brand{font-weight:800;font-size:1.2rem;color:var(--text);text-decoration:none;margin-inline-end:auto;display:inline-flex;align-items:center;min-height:44px;min-width:44px}
/* Wrap, never overflow. Measured by the deep self-QA at 390px: the un-wrapped
   strip pushed the whole page into horizontal scroll (mobile_overflow), which
   is the one layout defect a visitor feels immediately on a phone. */
.header-inner{flex-wrap:wrap}
.nav-links{display:flex;gap:10px;flex-wrap:wrap;min-width:0}
.nav-links a{color:var(--text);text-decoration:none;font-weight:600;display:inline-flex;align-items:center;min-height:44px;padding:0 8px}
.nav-links a:hover{color:var(--brand)}
.theme-toggle{background:none;border:1px solid var(--border);border-radius:10px;min-width:44px;min-height:44px;cursor:pointer;color:var(--text)}
.hero{padding-block:clamp(72px,11vw,150px);background:radial-gradient(80% 60% at 50% 0,color-mix(in srgb,var(--tint) 30%,transparent),transparent);position:relative;overflow:hidden}
.hero::before,.hero::after{content:'';position:absolute;border-radius:50%;filter:blur(70px);pointer-events:none}
.hero::before{width:440px;height:440px;background:color-mix(in srgb,var(--brand) 55%,transparent);top:-150px;inset-inline-end:-130px;opacity:.5}
.hero::after{width:360px;height:360px;background:color-mix(in srgb,var(--brand-dark) 55%,transparent);bottom:-170px;inset-inline-start:-110px;opacity:.35}
.hero .wrap{position:relative;z-index:1}
.hero-eyebrow{display:inline-flex;align-items:center;gap:8px;background:color-mix(in srgb,var(--brand) 12%,transparent);color:color-mix(in srgb,var(--brand) 42%,var(--text));border:1px solid color-mix(in srgb,var(--brand) 30%,transparent);padding:6px 16px;border-radius:999px;font-weight:700;font-size:.92rem;margin-bottom:18px}
.hero h1{font-size:clamp(2.2rem,5.5vw,3.8rem);line-height:1.18;margin:0 0 14px}
.hero-ctas{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.btn-ghost{background:transparent;color:var(--brand);border:2px solid color-mix(in srgb,var(--brand) 45%,transparent)}
.btn-ghost:hover{background:color-mix(in srgb,var(--brand) 10%,transparent)}
.lede{color:var(--text-muted);font-size:1.15rem;max-width:60ch}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;background:var(--brand);color:var(--on-brand);padding:12px 24px;border-radius:var(--f-btn-radius);border:0;text-decoration:none;font:inherit;font-weight:700;cursor:pointer;margin-top:14px}
.btn{transition:transform .25s ease,box-shadow .25s ease,background .25s ease}
.btn:hover{background:var(--brand-dark);transform:translateY(-2px);box-shadow:0 10px 24px -10px color-mix(in srgb,var(--brand) 55%,transparent)}
.grid-3{display:grid;gap:22px;grid-template-columns:1fr}
@media(min-width:900px){.grid-3{grid-template-columns:repeat(3,1fr)}
.products-grid .product-card:first-child{grid-column:span 2}
.products-grid .product-card:first-child .product-photo{aspect-ratio:16/8}}
.card{background:var(--surface);border:var(--f-border-w) solid var(--border);border-radius:var(--f-radius);padding:24px;box-shadow:var(--f-card-shadow);position:relative;overflow:hidden;transition:transform .35s ease,box-shadow .35s ease}
.card::before{content:'';position:absolute;inset-inline:0;top:0;height:3px;background:linear-gradient(90deg,var(--brand),var(--brand-dark));opacity:0;transition:opacity .35s}
.card:hover{transform:translateY(-6px);box-shadow:0 18px 44px -16px color-mix(in srgb,var(--brand) 35%,rgba(0,0,0,.25))}
.card:hover::before{opacity:1}
.card-icon{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--brand) 14%,transparent);color:var(--brand);margin-bottom:14px}
.card-icon svg{width:24px;height:24px}
.band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand)}
.band h2{margin-top:0}
form{display:grid;gap:12px;max-width:520px}
/* A thumb needs 44px. Measured at 390px by the deep self-QA: these fields
   came out at 39px and were six of the six mobile_tap_targets findings —
   the tables screen had already learned this; the site form had not. */
input,textarea,select{padding:12px 14px;min-height:44px;border:var(--f-border-w) solid var(--border);border-radius:var(--f-radius-sm);font:inherit;background:var(--surface);color:var(--text)}
textarea{min-height:120px}
.form-note{background:color-mix(in srgb,#fff 18%,transparent);padding:14px;border-radius:12px}
.site-footer{border-top:1px solid var(--border);padding-block:28px;color:var(--text-muted)}
.menu-list{list-style:none;margin:0;padding:0;max-width:720px}
.menu-item{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 0;border-bottom:1px dashed var(--border)}
.menu-item h3{margin:0 0 4px}
.menu-item p{margin:0;color:var(--text-muted)}
.menu-body{flex:1}
.menu-thumb{width:112px;height:112px;object-fit:cover;border-radius:var(--f-radius-sm);flex:none}
.menu-item.flip{flex-direction:row-reverse}
.product-card{display:flex;flex-direction:column;gap:10px}
.product-card h3,.product-card p{margin:0}
.product-card p{color:var(--text-muted)}
.product-photo{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--f-radius-sm)}
.product-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto}
.product-foot .btn{margin-top:0;padding:9px 20px}
.product-price{color:var(--price);font-size:1.15rem;white-space:nowrap}
.live-dot{color:#2ecc71;font-size:.65em;vertical-align:middle;margin-inline-start:10px;animation:live-pulse 2s infinite}
.order-form{display:grid;gap:8px;margin-top:10px;max-width:320px}
.order-form input{padding:9px 12px;border:var(--f-border-w) solid var(--border);border-radius:var(--f-radius-sm);font:inherit;background:var(--surface);color:var(--text)}
.order-form .btn{margin-top:0}
.order-note{background:color-mix(in srgb,var(--tint) 40%,transparent);padding:10px 14px;border-radius:10px;margin:10px 0 0;font-size:.95rem}
.contact-info{list-style:none;margin:0 0 18px;padding:0;display:flex;flex-wrap:wrap;gap:10px 22px}
.contact-info a{color:inherit;text-decoration:none;font-weight:600}
.contact-info a:hover{text-decoration:underline}
.socials a{color:inherit;font-weight:600}
@keyframes live-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.menu-price{color:var(--price);white-space:nowrap;font-size:1.1rem}
.tier{display:flex;flex-direction:column;gap:10px}
.tier.featured{border-color:var(--brand);box-shadow:0 12px 34px -14px color-mix(in srgb,var(--brand) 45%,transparent)}
.tier-price{font-size:1.05rem}
.tier-price strong{font-size:2rem}
.tier ul{margin:0;padding-inline-start:20px;color:var(--text-muted)}
.tier .btn{margin-top:auto;align-self:flex-start}
.quote-rail{grid-auto-flow:column;grid-auto-columns:minmax(280px,1fr);overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px;scrollbar-width:thin}
.quote-rail > .quote{scroll-snap-align:start}
@media(min-width:900px){.quote-rail{grid-auto-flow:row;overflow-x:visible;scroll-snap-type:none}}
.quote blockquote{margin:0 0 10px;font-size:1.05rem;line-height:1.8}
.quote figcaption{color:var(--text-muted);display:flex;align-items:center;gap:10px}
.quote-avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none}
.faq-item{border:var(--f-border-w) solid var(--border);border-radius:var(--f-radius-sm);background:var(--surface);padding:0 18px;margin-bottom:10px}
.faq-item summary{cursor:pointer;padding:14px 0;font-weight:700;min-height:44px;display:flex;align-items:center}
.faq-item p{color:var(--text-muted);padding-bottom:14px;margin:0}
.cta-band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand)}
.cta-inner{display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap}
.cta-band h2{margin:0 0 6px;padding-bottom:0}
.cta-band h2::after{content:none}
.cta-text{margin:0;opacity:.92;max-width:52ch}
.btn-invert{background:var(--on-brand);color:var(--brand);margin-top:0}
.btn-invert:hover{background:color-mix(in srgb,var(--on-brand) 88%,var(--brand))}
main > .section:nth-of-type(even):not(.band):not(.stats-band):not(.cta-band){background:color-mix(in srgb,var(--tint) 16%,transparent)}
.stats-band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand)}
.stats-row{display:flex;gap:34px;flex-wrap:wrap;justify-content:center;text-align:center}
.stat strong{display:block;font-size:2.2rem;line-height:1.1}
.stat span{opacity:.85}
.hero-split{display:grid;gap:34px;align-items:center;grid-template-columns:1fr}
@media(min-width:900px){.hero-split{grid-template-columns:1.1fr 1fr}}
.hero-photo{width:100%;border-radius:var(--f-radius);box-shadow:var(--f-photo-shadow);object-fit:cover;aspect-ratio:4/3}
[data-reveal]{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s ease}
[data-reveal].in{opacity:1;transform:none}
@media (prefers-reduced-motion: reduce){[data-reveal]{opacity:1;transform:none;transition:none}.card,.btn{transition:none}}
.credits{font-size:.85rem;opacity:.8}
.credits a{color:inherit}
.hero-overlay{padding:0;display:grid;isolation:isolate}
.hero-overlay > *{grid-area:1/1}
.hero-overlay .hero-bg{width:100%;height:100%;min-height:clamp(420px,60vh,640px);object-fit:cover}
.hero-overlay .hero-scrim{background:linear-gradient(to top,color-mix(in srgb,var(--bg) 92%,transparent),color-mix(in srgb,var(--bg) 55%,transparent) 55%,color-mix(in srgb,var(--bg) 20%,transparent))}
.hero-overlay .wrap{align-self:end;padding-block:clamp(40px,7vw,90px);z-index:1}
.hero-overlay .perks-band{align-self:end;z-index:2}
.hero-centered .hero-copy{max-width:44rem;margin-inline:auto;text-align:center}
.hero-centered .lede{margin-inline:auto}
.hero-centered .hero-ctas{justify-content:center}
.perks-band{border-top:1px solid color-mix(in srgb,var(--border) 70%,transparent);background:color-mix(in srgb,var(--surface) 70%,transparent);backdrop-filter:blur(6px);margin-top:clamp(30px,5vw,56px)}
.perks{list-style:none;margin:0;padding:14px 1rem;display:flex;flex-wrap:wrap;gap:12px 30px;justify-content:center}
.perk{display:inline-flex;align-items:center;gap:8px;font-weight:600;color:var(--text)}
.perk svg{width:18px;height:18px;color:var(--brand);flex:none}
.gallery-mosaic{display:grid;gap:14px;grid-template-columns:repeat(2,1fr)}
@media(min-width:900px){.gallery-mosaic{grid-template-columns:repeat(4,1fr)}
.gallery-mosaic .shot-lead{grid-column:span 2;grid-row:span 2}}
.shot{margin:0;overflow:hidden;border-radius:var(--f-radius);background:color-mix(in srgb,var(--tint) 40%,transparent)}
.shot img{width:100%;height:100%;aspect-ratio:1/1;object-fit:cover;display:block;transition:transform .6s ease}
.shot:hover img{transform:scale(1.06)}
.footer-cols{display:grid;gap:26px;grid-template-columns:1fr;padding-bottom:22px}
@media(min-width:760px){.footer-cols{grid-template-columns:1.6fr 1fr 1fr}}
.footer-col h3{margin:0 0 10px;font-size:1rem;color:var(--text)}
.footer-brand{font-weight:800;font-size:1.15rem;color:var(--text);margin:0 0 6px}
.footer-blurb{margin:0;max-width:38ch}
.footer-links{list-style:none;margin:0;padding:0;display:grid;gap:8px}
/* 44px, not 32. Measured at 390px: «القائمة» 45x32, «حكايتنا» 42x32 — six
   footer links a thumb keeps missing, and the only place in the build
   still shipping a 32px target. */
.footer-links a{color:inherit;text-decoration:none;display:inline-flex;align-items:center;min-height:44px}
.footer-links a:hover{color:var(--brand)}
.footer-bottom{border-top:1px solid var(--border);padding-top:16px;display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center}
/* The owner's way in: present, quiet, and never mistaken for a visitor CTA. */
.owner-link a{color:var(--muted);font-size:13px;text-decoration:none;border-bottom:1px dashed var(--border)}
.owner-link a:hover{color:var(--accent)}
.admin-panel{position:fixed;inset:0;z-index:80;background:var(--bg);overflow-y:auto;padding:32px 0}
.admin-wrap{max-width:1000px}
.admin-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}
.admin-head h1{margin:0;font-size:clamp(24px,4vw,34px)}
.admin-login{display:grid;gap:12px;max-width:420px}
.admin-login input,.admin-row-form input{padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--fg);font:inherit;font-size:15px;min-height:44px}
.admin-login input:focus,.admin-row-form input:focus{outline:2px solid var(--accent);outline-offset:1px}
.admin-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.admin-tabs .btn{min-height:44px}
.admin-tabs .is-on{border-color:var(--accent);color:var(--accent)}
.admin-out{color:#c0392b}
.admin-error{color:#c0392b;font-size:14px;margin:8px 0 0}
.admin-notice{color:var(--accent);font-size:14px;margin:0 0 12px}
.admin-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:15px}
.admin-table th,.admin-table td{padding:12px 10px;border-bottom:1px solid var(--border);text-align:start;vertical-align:middle}
.admin-table th{font-size:13px;color:var(--muted);font-weight:600}
.admin-when{color:var(--muted);font-size:13px}
.admin-row-form{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 20px}
.admin-row-form input{flex:1 1 180px;min-width:0}
@media(max-width:640px){.admin-table th:nth-child(5),.admin-table td:nth-child(5){display:none}}
.footer-bottom p{margin:0}
.footer-bottom .credits{margin-inline-start:auto}
.story-grid{display:grid;gap:clamp(24px,4vw,52px);align-items:center;grid-template-columns:1fr}
@media(min-width:900px){.story-grid{grid-template-columns:1fr 1fr}
.story:nth-of-type(even) .story-media{order:-1}}
.story-body p{color:var(--text-muted);max-width:56ch}
.story-media{margin:0;overflow:hidden;border-radius:var(--f-radius);box-shadow:var(--f-photo-shadow)}
.story-media img{width:100%;display:block;aspect-ratio:4/5;object-fit:cover}
.story-plain .story-body{max-width:70ch;margin-inline:auto;text-align:center}
.story-plain .story-body p{margin-inline:auto}
.steps{list-style:none;margin:0;padding:0;display:grid;gap:20px;grid-template-columns:1fr;counter-reset:step}
@media(min-width:900px){.steps{grid-template-columns:repeat(3,1fr)}}
.step{padding-top:34px}
.step h3{margin:0 0 6px}
.step p{margin:0;color:var(--text-muted)}
.step-num{position:absolute;top:16px;inset-inline-start:24px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--brand);color:var(--on-brand);font-weight:800}
.table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.compare{width:100%;border-collapse:collapse;min-width:520px}
.compare th,.compare td{padding:14px 16px;text-align:start;border-bottom:1px solid var(--border)}
.compare thead th{background:color-mix(in srgb,var(--tint) 35%,transparent);font-weight:800}
.compare tbody th{font-weight:600;color:var(--text-muted)}
.compare td{text-align:center}
.compare .is-featured{background:color-mix(in srgb,var(--brand) 10%,transparent)}
.compare .yes{color:var(--price);font-weight:800}
.compare .no{color:var(--text-muted)}
.location-address{font-size:1.15rem;font-weight:700;margin:0 0 6px}
.location-hours{margin:0 0 6px;color:var(--text-muted)}
.location-grid a{color:inherit}
.product-link{color:inherit;text-decoration:none}
.product-link:hover{color:var(--brand);text-decoration:underline}
.product-view{position:fixed;inset:0;z-index:50;overflow:auto;background:var(--bg);padding-block:clamp(24px,5vw,60px);animation:productIn .25s ease}
@keyframes productIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.product-view{animation:none}}
.product-back{margin-bottom:22px}
.product-view-grid{display:grid;gap:clamp(20px,4vw,46px);grid-template-columns:1fr;align-items:start}
@media(min-width:900px){.product-view-grid{grid-template-columns:1.1fr 1fr}}
.product-view-photo{width:100%;border-radius:var(--f-radius);box-shadow:var(--f-photo-shadow);object-fit:cover;aspect-ratio:4/3}
.product-view h1{font-size:clamp(1.8rem,4vw,2.8rem);margin:0 0 10px}
.product-view-price{font-size:1.6rem;margin:0 0 16px}
.person{align-items:center;text-align:center;display:flex;flex-direction:column;gap:12px}
.person-photo{width:96px;height:96px;border-radius:50%;object-fit:cover}
.person-monogram{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;font-size:2.2rem;font-weight:800;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}
.person figcaption{display:grid;gap:2px}
.person figcaption span{color:var(--text-muted)}

/* The family layer rides LAST on purpose. It used to sit at the top, where
   every rule it wrote below :root — the elegant flat band, the bold diagonal,
   the brutalist card border, the roomier sections — was silently cancelled by
   the equal-specificity base rules that followed it. Only the variables
   survived, which is precisely why every project looked like its sibling.
   Last wins; the identity is now real below the token line too. */
${familyCss(family)}
`;
}

export class ReactProjectTool extends BaseTool {
    name = 'react_project';
    description = 'Scaffold a complete runnable Vite + React project (RTL-aware, Joe design tokens), then install and build it to prove it compiles.';
    version = '1.0.0';
    tags = ['build', 'react', 'vite', 'project'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'What the app is about, in the user\'s words' },
            skipInstall: { type: 'boolean', description: 'Scaffold only — do not run npm install/build' },
        },
        required: ['request'],
    };
    permissions: ToolPermission[] = ['execute', 'write'];
    sideEffects: ToolPermission[] = ['execute', 'write'];
    rateLimitPerMinute = 6;
    auditFields = ['request'];

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const request = String(input?.request || '').trim()
            .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '').trim();
        if (!request) return { ok: false, error: 'no_request', logs };
        const sessionId = context?.sessionId;
        /**
         * THE INTERFACE'S LANGUAGE IS THE USER'S, NOT THE PROMPT'S.
         *
         * He types Arabic all day and reads nothing else. He wrote ONE request
         * in English — «Build a world-class e-commerce platform» — and Joe
         * delivered him a store whose every word is English: «Owner sign-in»,
         * «Add to cart», «All categories». Unusable, from a request he made in
         * good faith.
         *
         * The script of one sentence is a weak signal about a PERSON. The
         * session already carries the language he actually uses; it decides,
         * and the prompt's own script only breaks a tie when it does not.
         */
        const uiLang = String(context?.language || '').toLowerCase();
        const isAr = uiLang ? uiLang.startsWith('ar') : /[؀-ۿ]/.test(request);
        try { broadcast({ type: 'build_started', sessionId, data: { tool: 'react_project', sessionId } } as any); } catch { /* UI optional */ }

        const term = (line: string) => {
            logs.push(line);
            try {
                broadcastTerminalLine(sessionId, line + '\r\n');
            } catch { /* UI optional */ }
        };

        const palette = buildPalette(request);
        // The SAME kind judgement the page builder uses: a restaurant app
        // ships a menu, a store ships pricing — never the same generic three
        // sections for every request.
        const kind = detectPageKind(request);
        // AND THE OTHER QUESTION, the one that was never asked: is this a site
        // about something, or a PROGRAM? «تطبيق خرائط» used to come back as
        // Hero + Features + FAQ with a restaurant menu attached and no map at
        // all. When the request names an application, the section library is
        // skipped entirely and a working app is generated instead.
        const appKind = detectAppKind(request);
        const appBp: AppBlueprint | null = appKind ? blueprintFor(appKind, request, isAr) : null;
        const family = familyFor(request, kind);
        const multiPage = wantsMultiPage(request);
        const pages = pagesForKind(kind);
        const sections = multiPage ? [...new Set(pages.flatMap(p => p.sections))] : sectionsForKind(kind);
        const content = deriveContent(request, isAr, kind);
        // BUSINESS MEMORY: the saved real details flow into the build — the
        // brand when the request named none, and a REAL contact block (tel:,
        // wa.me, mailto, socials). Absent profile → the old honest silence.
        const { getProfile } = require('../../../core/profile/business-profile');
        const profile = input?.skipProfile ? null : getProfile(sessionId);
        // The saved brand steps in whenever derivation produced a GENERIC
        // token («ابنِ موقع react لمطعمي» derives 'react') — an explicit
        // real name in the request still wins.
        if (profile?.brand && /^(مشروعي|myapp|react|vite|رياكت|ريأكت|سبا|spa|app|api)$/i.test(content.brand.trim())) {
            content.heroTitle = content.heroTitle.split(content.brand).join(profile.brand);
            content.brand = profile.brand;
        }
        if (profile) {
            const wa = String(profile.whatsapp || profile.phone || '').replace(/[^0-9+]/g, '').replace(/^\+/, '').replace(/^0/, '966');
            const ig = String(profile.instagram || '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/$/, '');
            const tw = String(profile.twitter || '').replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '').replace(/^@/, '').replace(/\/$/, '');
            (content as any).contact = {
                phone: profile.phone || '', wa: (profile.whatsapp || profile.phone) ? `https://wa.me/${wa}` : '',
                email: profile.email || '', instagram: ig, twitter: tw,
                address: profile.address || '', hours: profile.hours || '',
            };
            term(`business memory: real contact details injected (${Object.keys(profile).filter(k => k !== 'updatedAt').join(', ')})`);
        } else {
            (content as any).contact = null;
        }
        const dirName = `react-${slug(content.brand)}`;
        const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        // THE FULL-STACK LINK: when this session's previous project is a Joe
        // API, the new frontend is born connected — content.js carries the
        // API's URL, the list components ask it for the LIVE rows at runtime,
        // and any failure (API stopped, published copy) keeps the baked rows.
        const prevEntry = ((global as any).joeProjects || {})[sessionKey];
        /** The tables this system really declares — the terminal asks for each by name. */
        let systemTables: string[] = [];
        const apiLink = prevEntry?.type === 'api' && prevEntry?.resource
            ? `http://localhost:${prevEntry.port || 4100}/api/${prevEntry.resource}` : '';
        // The hero's second CTA points at the kind's main content — an
        // anchor on a single page, a real route on a multi-page app.
        (content as any).heroSecondary = (() => {
            const target = kind === 'restaurant' ? 'menu' : kind === 'store' ? 'products' : 'features';
            const label = isAr
                ? (kind === 'restaurant' ? 'استعرض القائمة' : kind === 'store' ? 'تصفح المنتجات' : 'اكتشف المميزات')
                : (kind === 'restaurant' ? 'See the menu' : kind === 'store' ? 'Browse products' : 'Explore features');
            const onHome = !multiPage || pages[0].sections.includes(target === 'menu' ? 'Menu' : target === 'products' ? 'Products' : 'Features');
            return { label, href: multiPage && !onHome ? `#/${target}` : `#${target}` };
        })();
        // The hero ARCHETYPE comes from the kind and the family; the
        // navigation is built LATER, once it is known which sections will
        // actually render (see buildNavLinks below).
        content.heroLayout = heroLayoutFor(kind, family);
        (content as any).routeBase = multiPage ? '/' : '';
        const SECTION_ANCHOR: Record<string, string> = {
            Features: 'features', Menu: 'menu', Products: 'products', Gallery: 'gallery', Story: 'story',
            Steps: 'steps', Pricing: 'pricing', Compare: 'compare', Team: 'team', Testimonials: 'testimonials',
            Faq: 'faq', Stats: 'stats', Location: 'location', Contact: 'contact',
        };
        const SECTION_LABEL: Record<string, [string, string]> = {
            Features: ['المميزات', 'Features'], Menu: ['القائمة', 'Menu'], Products: ['المنتجات', 'Products'],
            Gallery: ['المعرض', 'Gallery'], Story: [content.storyTitle, content.storyTitle],
            Steps: [content.stepsTitle, content.stepsTitle], Pricing: ['الأسعار', 'Pricing'],
            Compare: ['المقارنة', 'Compare'], Team: [content.teamTitle, content.teamTitle], Testimonials: ['آراء العملاء', 'Reviews'],
            Faq: ['أسئلة شائعة', 'FAQ'], Stats: ['بالأرقام', 'Numbers'],
            Location: ['الموقع', 'Find us'], Contact: [content.contactTitle, content.contactTitle],
        };
        // A section that renders NOTHING must never appear in the navigation:
        // the gallery with no photographs, the location with no saved address,
        // the comparison with a single tier. Called after the photo step so
        // the answers are facts, not guesses.
        const willRender = (sec: string): boolean => {
            if (sec === 'Gallery') return content.gallery.length > 0;
            if (sec === 'Location') return !!(content as any).contact?.address;
            if (sec === 'Compare') return content.tiers.length >= 2;
            return true;
        };
        // On a multi-page app the anchors are ROUTES — «#menu» would drive the
        // hash router straight into its own 404 page.
        const buildNavLinks = () => {
            (content as any).navLinks = multiPage
                ? pages.map(p => ({ href: `#${p.path}`, label: isAr ? p.title : p.titleEn }))
                : sections
                    .filter(s => SECTION_ANCHOR[s] && willRender(s))
                    .map(s => ({ href: `#${SECTION_ANCHOR[s]}`, label: SECTION_LABEL[s][isAr ? 0 : 1] }));
        };
        buildNavLinks();
        (content as any).api = apiLink;
        /**
         * …and WRITES into it: visitor orders post to the API's orders table.
         *
         * A FEED HAS NO ORDERS. The old line derived «/api/orders» from any
         * resource and announced it for every build — so the social project's
         * log promised a table its own server does not have. Nothing failed
         * out loud; it was simply untrue, which is worse. The claim is now
         * made only where the endpoint exists.
         */
        const feedApi = /\/api\/posts$/.test(apiLink);
        (content as any).ordersApi = apiLink && !feedApi ? apiLink.replace(/\/api\/[a-z]+$/, '/api/orders') : '';
        (content as any).orderCta = isAr ? 'اطلب الآن' : 'Order now';
        if (apiLink) {
            term(feedApi
                ? `full-stack link: this app reads and writes the LIVE feed at ${apiLink} — posts, likes, comments and follows are shared between everyone using it`
                : `full-stack link: this app reads LIVE rows from ${apiLink} and writes orders to ${(content as any).ordersApi}`);
        }
        // The app's form delivers into Joe's inbox while it runs next to Joe.


        // The project lands where the File Explorer actually looks.
        const { workspaceService } = require('../../services/WorkspaceService');
        const root = String(input?.root || workspaceService.getExplorerRoot());
        let proj = path.join(root, dirName);
        // Two sessions with generic brands must NEVER share a directory —
        // the second build silently overwrote the first app (caught by the
        // families wire proof: two different stores landed in react-react).
        // The session that OWNS the directory may rebuild in place.
        if (fs.existsSync(proj) && ((global as any).joeProjects || {})[sessionKey]?.dir !== proj) {
            const suffix = sessionKey.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase() || Date.now().toString(36).slice(-4);
            proj = path.join(root, `${dirName}-${suffix}`);
        }
        // The app's form delivers into Joe's inbox while it runs next to Joe.
        (content as any).inbox = publicUrlFor(`/api/public/forms/${path.basename(proj).replace(/[^a-zA-Z0-9._-]/g, '')}`);
        fs.mkdirSync(path.join(proj, 'src', 'components'), { recursive: true });
        fs.mkdirSync(path.join(proj, 'src', 'styles'), { recursive: true });

        if (sessionId) broadcastThinkingDetail(sessionId, isAr
            ? `⚛️ أبني مشروع React حقيقي (Vite): ${content.brand}`
            : `⚛️ Scaffolding a real Vite + React project: ${content.brand}`);

        // A REAL photograph for the hero — through the same engine, archives
        // and licence bookkeeping every page build uses. skipInstall implies
        // a fully-offline scaffold (tests, air-gapped machines), so the photo
        // step is skipped with it; any live failure ships a clean no-image app.
        // An APPLICATION downloads no hero photograph: a map app needs tiles,
        // not a stock picture of a road.
        if (!appBp && !input?.skipInstall && !input?.skipImages) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🖼️ أبحث عن صورة حقيقية مرخّصة للبطل…' : '🖼️ Finding a real licensed hero photo…');
            const hero = await fetchHeroImage({
                subject: `${content.tagline || content.brand}`,
                projDir: proj, hue: (palette as any).hue ?? 260, artifactDir: ARTIFACT_DIR,
            });
            content.heroImage = hero.image;
            content.credits = hero.credits;
            term(`hero photo: ${hero.note}`);

            // The dishes too — a restaurant menu with photographs sells; one
            // batched engine call for all of them, each dish falling back to a
            // clean text row when the archives had nothing for it.
            if (sections.includes('Menu') && content.menu.length) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🍽️ أجلب صوراً حقيقية مرخّصة لأطباق القائمة…' : '🍽️ Finding real licensed photos for the menu dishes…');
                const cards = await fetchCardImages({
                    subjects: content.menu.map(m => `${m.name} ${m.desc}`),
                    projDir: proj, hue: (palette as any).hue ?? 260, artifactDir: ARTIFACT_DIR,
                });
                content.menu.forEach((m, i) => { m.img = cards.images[i] || null; });
                content.credits = mergeCredits(content.credits, cards.credits);
                term(`dish photos: ${cards.note}`);
            }

            // The store's merchandise — the SAME subject asked once per card:
            // the engine's variant machinery returns a DIFFERENT photograph
            // for each repeat, so four cards never share one picture.
            if (sections.includes('Products') && content.products.length) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🛍️ أجلب صوراً حقيقية للمنتجات…' : '🛍️ Finding real product photos…');
                const prods = await fetchCardImages({
                    subjects: content.products.map(() => `${content.tagline || content.brand}`),
                    projDir: proj, hue: (palette as any).hue ?? 260, artifactDir: ARTIFACT_DIR,
                    slot: 'card', label: 'product',
                });
                content.products.forEach((p, i) => { p.img = prods.images[i] || null; });
                content.credits = mergeCredits(content.credits, prods.credits);
                term(`product photos: ${prods.note}`);
            }

            // The GALLERY — a real photo mosaic of the place or the work.
            // Four asks of the same subject: the engine's variant machinery
            // returns a different photograph each time, and whatever the
            // archives could not answer simply shrinks the mosaic.
            if (sections.includes('Gallery')) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🖼️ أجلب صور المعرض…' : '🖼️ Finding gallery photos…');
                const shots = await fetchCardImages({
                    subjects: [0, 1, 2, 3].map(() => `${content.tagline || content.brand}`),
                    projDir: proj, hue: (palette as any).hue ?? 260, artifactDir: ARTIFACT_DIR,
                    slot: 'card', label: 'gallery',
                });
                // A mosaic of the same picture four times is not a mosaic:
                // identical files are collapsed before anything is borrowed.
                const seenSrc = new Set<string>();
                const got = (shots.images.filter(Boolean) as Array<{ src: string; alt: string }>)
                    .filter(g => !seenSrc.has(g.src) && seenSrc.add(g.src));
                // The story borrows the LAST shot rather than downloading its
                // own — and the mosaic drops it, so no photo appears twice.
                if (got.length >= 3) content.storyImage = got.pop() || null;
                content.gallery = got;
                content.credits = mergeCredits(content.credits, shots.credits);
                term(`gallery photos: ${shots.note}`);
            }

            // The team's faces — the same avatar slot, a clean monogram when
            // the archives had nobody.
            if (sections.includes('Team') && content.team.length) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '👥 أجلب صور الفريق…' : '👥 Finding team portraits…');
                const faces = await fetchCardImages({
                    subjects: content.team.map(m => m.photoSubject || 'professional headshot portrait'),
                    projDir: proj, hue: (palette as any).hue ?? 260, artifactDir: ARTIFACT_DIR,
                    slot: 'avatar', label: 'team portrait',
                });
                content.team.forEach((m, i) => { m.img = faces.images[i] || null; });
                content.credits = mergeCredits(content.credits, faces.credits);
                term(`team portraits: ${faces.note}`);
            }

            // Faces for the testimonials — the engine's avatar slot, whose
            // sizing and grounding were built for exactly this position.
            if (sections.includes('Testimonials') && content.testimonials.length) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🙂 أجلب صوراً رمزية حقيقية للشهادات…' : '🙂 Finding real portrait photos for the testimonials…');
                const avatars = await fetchCardImages({
                    subjects: content.testimonials.map(t => t.photoSubject || 'professional headshot portrait'),
                    projDir: proj, hue: (palette as any).hue ?? 260, artifactDir: ARTIFACT_DIR,
                    slot: 'avatar', label: 'portrait',
                });
                content.testimonials.forEach((t, i) => { t.img = avatars.images[i] || null; });
                content.credits = mergeCredits(content.credits, avatars.credits);
                term(`testimonial avatars: ${avatars.note}`);
            }
        }

        // The photographs have answered — the navigation is recomputed so a
        // gallery that stayed empty never gets advertised in the menu.
        buildNavLinks();

        /**
         * AND NO ADDRESS THAT ONLY EXISTS ON THIS LAPTOP GOES INTO THE APP.
         *
         * His preview server, answering his own build:
         *
         *     GET /project-preview/…/%22C:/Users/home/OneDrive/Pictures/
         *         Screenshots/rMdx….jpg%22   404
         *
         * A path on his machine, quotation marks still attached, written into
         * an application meant to be opened by anyone. Pages have been guarded
         * by groundImageSrcs for months; React projects were not, and every
         * image here is a string in `content` right up to this point — which is
         * the last moment it can be checked as a value rather than as JSX.
         */
        const badSrcs = sanitizeContentImages(content, (palette as any).hue ?? 260);
        if (badSrcs.length) {
            term(`self-repair: ${badSrcs.length} image address(es) could not be served to a visitor — replaced`);
            for (const why of badSrcs.slice(0, 4)) term(`  • ${why}`);
            term(isAr
                ? `🖼️ ${badSrcs.length} عنوان صورة كان يشير إلى ملف على جهازك لا إلى الويب — استبدلته بتدرّج لوني بدل صورة مكسورة.`
                : `🖼️ ${badSrcs.length} image address pointed at a file on your machine, not the web — replaced with a gradient instead of a broken image.`);
        }

        const componentTemplates: Record<string, () => string> = {
            Navbar: fileNavbarJsx, Hero: fileHeroJsx, Features: fileFeaturesJsx,
            Menu: fileMenuJsx, Products: fileProductsJsx, Gallery: fileGalleryJsx, Story: fileStoryJsx, Steps: fileStepsJsx,
            Pricing: filePricingJsx, Compare: fileCompareJsx, Team: fileTeamJsx, Testimonials: fileTestimonialsJsx, Location: fileLocationJsx,
            Faq: fileFaqJsx, Stats: fileStatsJsx, Cta: fileCtaJsx, Contact: fileContactJsx, Footer: fileFooterJsx,
        };
        const files: Record<string, string> = {
            'package.json': filePackageJson(content.brand),
            'vite.config.js': fileViteConfig(),
            'index.html': fileIndexHtml(content, (palette as any).hue ?? 260),
            '.gitignore': 'node_modules\ndist\n',
            'src/main.jsx': fileMainJsx(),
            'src/App.jsx': multiPage ? fileMultiPageAppJsx(pages, isAr) : fileAppJsx(sections),
            'src/content.js': fileContentJs(content),
            'src/reveal.js': fileRevealJs(),
            ...(multiPage ? { 'src/router.jsx': fileRouterJsx() } : {}),
            // Joe's REAL palette tokens — the same engine every page uses. The
            // data-theme blocks make the Navbar toggle actually change the
            // colours (paletteCss alone only follows the OS preference).
            'src/styles/tokens.css': `${paletteCss(palette)}
:root[data-theme="dark"]{${darkTokenBlock(palette)}}
:root[data-theme="light"]{${lightTokenBlock(palette)}}
:root[data-theme="dark"]{color-scheme:dark}
:root[data-theme="light"]{color-scheme:light}`,
            'src/styles/base.css': fileBaseCss(family),
        };
        // AN APPLICATION REPLACES ALL OF IT. Not one marketing section, not
        // one fabricated customer, not one restaurant dish: the program, its
        // storage, its schema and the engine its domain really needs. The
        // palette, the fonts and the vite config above are kept — they are
        // the parts a real app wants too.
        if (appBp) {
            for (const k of Object.keys(files)) {
                if (k !== 'vite.config.js' && k !== 'src/styles/tokens.css') delete files[k];
            }
            /**
             * AND THE SYSTEM'S OTHER TABLES BECOME SCREENS.
             *
             * The backend carries vendors, customers, coupons and shipments
             * now; without this they are reachable only by `curl`, which is a
             * database with a URL, not a system anyone can run. The screens are
             * generated from the SAME model the server was — the two halves
             * cannot drift apart — and only when this session really has that
             * server to talk to.
             */
            /**
             * The model the SERVER was built from, not a second guess at it.
             * When a request falls outside the known domains the design comes
             * from the LLM — asking it again here would be slower and free to
             * disagree with the tables that actually exist.
             */
            const tableModel = apiLink
                ? (Array.isArray(prevEntry?.model) && prevEntry.model.length
                    ? prevEntry.model
                    // …and the same fallback the server uses: a known domain,
                    // then the tables he listed in his own sentence.
                    : (require('../../../core/design/data-model').deriveDataModel(request).length
                        ? require('../../../core/design/data-model').deriveDataModel(request)
                        : require('../../../core/design/named-entities').namedEntities(request)))
                : [];
            /**
             * AND THE APP MANAGES THE FIRST TABLE, NOT A GENERIC «سجلّ».
             *
             * Measured on his own build: «إضافة سجلّ — العنوان · التفاصيل ·
             * قيمة» sat on top, and his real النباتات/الموردون were a second
             * screen underneath. The generic schema is what the blueprint falls
             * back to when it cannot tell WHAT is being managed — and by this
             * line the system's tables are already known, because the server
             * was generated from them a minute ago.
             *
             * Only for the fallback kind: a maps app, a chat, a shop already
             * know exactly what they manage and must not be overwritten.
             */
            let runBp = appBp;
            let appApi = apiLink;
            let adminModel = tableModel;
            if (tableModel.length && appBp.kind === 'generic' && appBp.engine === 'records') {
                const { blueprintFromEntity, apiFor } = require('../../../core/design/entity-app');
                const lead = tableModel[0];
                const derived = blueprintFromEntity(appBp, lead, isAr);
                if (derived !== appBp) {
                    runBp = derived;
                    appApi = apiFor(apiLink, lead.key) || apiLink;
                    adminModel = tableModel.slice(1);          // never the same table twice
                    term(`application: managing «${lead.key}» itself — ${derived.fields.map((f: any) => f.key).join(', ')}`);
                }
            }
            if (adminModel.length) term(`admin screens: ${adminModel.map((e: any) => e.key).join(', ')}`);
            // Carried out of this block so the terminal audit can ask the
            // running server for every one of them by name.
            systemTables = (tableModel || []).map((e: any) => String(e?.key || '')).filter(Boolean);
            const appFiles = buildAppFiles(runBp, {
                brand: content.brand, isArabic: isAr, api: appApi, storeKey: `${slug(content.brand)}-${runBp.kind}`,
                brandColor: (palette as any).primary,
                model: adminModel,
            }, slug(content.brand));
            for (const [rel, body] of Object.entries(appFiles)) files[rel] = body;
            /**
             * The real Arabic webfaces travel with the app too — the faces are
             * declared here because an app ships no base.css.
             *
             * They are PREPENDED, not substituted. This line used to rebuild the
             * stylesheet from `fileAppCss()` alone and threw away everything the
             * engine had added to it: the shop's product grid, and — measured in
             * a real browser — the whole system-tables screen, which rendered
             * edge-to-edge with unstyled inputs while the page above it was
             * centred.
             */
            files['src/styles/app.css'] = `${familyFonts(family).faces}\nbody{font-family:${familyFonts(family).body}}\n`
                + (appFiles['src/styles/app.css'] || fileAppCss());
            fs.mkdirSync(path.join(proj, 'src', 'app'), { recursive: true });
            term(`application build: ${appBp.kind} — engine «${appBp.engine}»${Object.keys(appBp.deps).length ? `, real dependencies: ${Object.keys(appBp.deps).join(', ')}` : ''}`);
        }
        // Only the components this KIND actually uses are written — a
        // restaurant carries Menu.jsx, a store carries Pricing.jsx, and no
        // project ships dead files.
        for (const c of appBp ? [] : ['Navbar', ...sections, 'Footer']) {
            const tpl = componentTemplates[c];
            if (tpl) files[`src/components/${c}.jsx`] = tpl();
        }
        // Menu/Products import OrderButton statically — ship it with them.
        // An unlinked app never renders it (ordersApi is ''), and the
        // bundler keeps the build green either way.
        if (!appBp && (sections.includes('Menu') || sections.includes('Products') || multiPage)) {
            files['src/components/OrderButton.jsx'] = fileOrderButtonJsx();
        }
        // A shop ships REAL product pages — one URL per product, mounted
        // above everything so «#product/<slug>» works from a cold reload.
        if (!appBp && (sections.includes('Products') || multiPage)) {
            files['src/components/ProductView.jsx'] = fileProductViewJsx();
        }
        // The owner's dashboard: only an app WIRED to an API can have one, and
        // App.jsx imports it unconditionally, so the file must always exist —
        // it simply renders nothing when `content.api` is empty.
        if (!appBp) files['src/components/AdminPanel.jsx'] = fileAdminPanelJsx();
        // The multi-page app swaps in a Navbar of real page Links.
        if (!appBp && multiPage) files['src/components/Navbar.jsx'] = fileMultiPageNavbarJsx();
        // THE FILES, LIVE. Every file this build writes is streamed to the
        // Logs panel the moment it exists on disk — the same `file_stream`
        // event the page builder emits. Without it the panel opened on a
        // React build and showed nothing being built at all.
        for (const [rel, body] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
            fs.writeFileSync(path.join(proj, rel), body, 'utf-8');
            try {
                broadcast({
                    type: 'file_stream', sessionId,
                    data: { file: rel, chunk: body, done: true, bytes: Buffer.byteLength(body), at: Date.now(), label: 'مكتوب' },
                } as any);
            } catch { /* UI optional — the file is already on disk */ }
        }
        // The REAL font files travel WITH the app (public/fonts + OFL
        // notice) — a declared family that ships no file is a costume, not
        // typography (the Amiri/Georgia discovery).
        {
            const fontCandidates = [
                path.resolve(__dirname, '..', '..', '..', '..', 'assets', 'fonts'),
                path.resolve(process.cwd(), 'assets', 'fonts'),
                path.resolve(process.cwd(), 'api', 'assets', 'fonts'),
            ];
            const fontsDir = fontCandidates.find(d => fs.existsSync(path.join(d, 'cairo-400-arabic.woff2')));
            if (fontsDir) {
                // Inside src/styles so Vite RESOLVES the url() and emits
                // hashed assets — public/ references 404'd in production
                // (measured by the new webfont audit check, score 62).
                fs.mkdirSync(path.join(proj, 'src', 'styles', 'fonts'), { recursive: true });
                let copied = 0;
                for (const f of familyFonts(family).files) {
                    try { fs.copyFileSync(path.join(fontsDir, f), path.join(proj, 'src', 'styles', 'fonts', f)); copied++; }
                    catch { /* a missing weight falls back per @font-face */ }
                }
                try { fs.copyFileSync(path.join(fontsDir, 'OFL-LICENSE.txt'), path.join(proj, 'src', 'styles', 'fonts', 'OFL-LICENSE.txt')); } catch { /* notice best-effort */ }
                term(`fonts: bundled ${copied} real Arabic webfont files (OFL) for the ${family} identity`);
            } else {
                term('fonts: bundle not found — system font stacks will serve (honest fallback)');
            }
        }
        term(`react_project: scaffolded ${Object.keys(files).length} files in ${proj} — design family: ${family}`);

        // ── prove it compiles: npm install + vite build, streamed live ──────
        let installed = false, built = false, npmMissing = false;
        let buildDiagnosis: any = null;
        if (!input?.skipInstall) {
            // Through the Single Execution Authority — a direct spawn here
            // BLOCKED STARTUP on the user's machine (ExecutionEnforcer).
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            // The build's own words are kept — they are what names the missing
            // package when a build stops one `npm install` short of finishing.
            let lastLog = '';
            const run = async (cmd: string, args: string[], timeoutMs: number): Promise<number> => {
                lastLog = '';
                const h = executionEngine.runArgvStreaming(cmd, args, {
                    cwd: proj, timeout: timeoutMs,
                    env: { NO_COLOR: '1' },
                    onLine: (l: string) => { lastLog += l + '\n'; term(`  ${l.slice(0, 200)}`); },
                });
                const r = await h.done;
                if (r.exitCode === null) return -1;                       // could not start (npm missing)
                if (r.exitCode === 124 && r.error === 'timeout') return -2;
                return r.exitCode;
            };
            /**
             * WAKE THE BROWSER NOW, NOT WHEN HE IS WATCHING IT.
             *
             * This build ends in a self-QA that needs Chromium. Launching it
             * only when the audit starts is what he photographed: an open
             * Browser panel, «No page loaded», a white viewport — the browser
             * was starting, and the first seconds of the check he was invited
             * to watch had nothing to show. `npm install` takes ~19s here;
             * the launch costs nothing inside it.
             */
            if (!input?.skipAudit) {
                try {
                    const { PANEL_BROWSER_SID } = require('./BrowserSmartTools');
                    const { warmBrowserSession } = require('../../browser/manager');
                    warmBrowserSession(PANEL_BROWSER_SID);
                    term('self-QA: warming the browser now so the audit has something to show from its first second');
                } catch { /* the audit launches its own — exactly as before */ }
            }
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '📦 أثبّت الحزم (npm install)…' : '📦 Installing packages (npm install)…');
            const inst = await run('npm', ['install', '--no-audit', '--no-fund'], 240_000);
            npmMissing = inst === -1;
            installed = inst === 0;
            term(`npm install → ${installed ? 'OK' : `exit ${inst}`}`);
            if (installed) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🏗️ أبني نسخة الإنتاج (vite build)…' : '🏗️ Building for production (vite build)…');
                let b = await run('npm', ['run', 'build'], 180_000);
                built = b === 0 && fs.existsSync(path.join(proj, 'dist', 'index.html'));
                term(`vite build → ${built ? 'OK (dist/index.html)' : `exit ${b}`}`);

                /**
                 * A BUILD THAT NAMES ITS MISSING TOOL IS NOT A FAILED BUILD.
                 *
                 * «واذا لم يستطع بناء اي جزء منه ان يذهب الى الانترنت وينزل اي
                 * اداة تساعده في البناء ويكمل البناء».
                 *
                 * Vite says «Failed to resolve import "recharts"» and stops.
                 * That is a shopping list, not a verdict: fetch what it named,
                 * build once more, and the system is delivered instead of
                 * abandoned. Bounded on purpose — only names the bundler itself
                 * reported, never one already declared, and exactly one retry,
                 * so a genuinely broken project cannot loop.
                 */
                if (!built) {
                    // The diagnosis is no longer limited to missing packages:
                    // the log doctor reads the build's own words, names what is
                    // wrong, applies the one remedy that fits, and retries once.
                    // A cause it cannot fix safely comes back NAMED — in Arabic
                    // — instead of as a wall of English for him to decode.
                    const { diagnose, applyRemedy } = require('../../../core/quality/log-doctor');
                    const d = diagnose({ exitCode: b, log: lastLog, cwd: proj, timedOut: b === -2 });
                    if (d) {
                        term(`build diagnosis: ${d.id} (${d.fixable ? 'fixable' : 'needs a human'})`);
                        if (sessionId) broadcastThinkingDetail(sessionId, `🩺 ${d.ar}`);
                        buildDiagnosis = d;
                    }
                    if (d?.fixable) {
                        const remedy = await applyRemedy(d, proj, async (c: string, a: string[], t: number) => ({
                            exitCode: await run(c, a, t),
                        }));
                        term(`build remedy: ${remedy.note}`);
                        if (remedy.applied) {
                            b = await run('npm', ['run', 'build'], 180_000);
                            built = b === 0 && fs.existsSync(path.join(proj, 'dist', 'index.html'));
                            term(`vite build (after: ${remedy.note}) → ${built ? 'OK' : `exit ${b}`}`);
                            if (built) buildDiagnosis = { ...d, healed: true, note: remedy.note };
                        } else if (sessionId) {
                            broadcastThinkingDetail(sessionId, `⚠️ ${remedy.note}`);
                        }
                    }
                }
            }
        }

        /**
         * ONE FOLDER, ONE PROCESS, ONE ORIGIN — ready for a domain.
         *
         * «حتى يتم نقله الى دومين والعمل مباشره». A built interface on one port
         * and its API on another is not something anyone can deploy: it needs
         * CORS, two processes and an address baked into the bundle. When this
         * session already built the API, the compiled interface is copied into
         * the server's public/ — which that server now serves — so the whole
         * system is a single folder you upload and start.
         */
        const apiDir = (prevEntry?.type === 'api' && prevEntry?.dir && fs.existsSync(prevEntry.dir)) ? String(prevEntry.dir) : '';
        /** Copy the freshly built interface into the API server's public/. */
        const packageIntoApi = (announce: boolean) => {
            if (!apiDir) return false;
            try {
                const target = path.join(apiDir, 'public');
                fs.rmSync(target, { recursive: true, force: true });
                fs.cpSync(path.join(proj, 'dist'), target, { recursive: true });
                term(`packaged: the built interface now lives in ${path.basename(apiDir)}/public — one origin, one «npm start»`);
                if (announce && sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? '📦 حزمتُ الواجهة داخل الخادم — مجلد واحد جاهز للرفع على دومين'
                    : '📦 Packaged the interface inside the server — one folder, ready for a domain');
                return true;
            } catch (e: any) {
                term(`packaging skipped: ${e?.message || e}`);
                return false;
            }
        };
        const packaged = built ? packageIntoApi(true) : false;

        /**
         * AND THE AUDIT GOES WHERE THE SYSTEM LIVES.
         *
         * His delivery said «⛔ it does NOT work properly — 2 blocking
         * findings», and both of them were one 404 on `/api/health`. Nothing
         * was broken: the app asks its own origin, once, whether it serves the
         * API — and the audit was serving a FOLDER, which cannot answer. The
         * interface had already been packaged into its API server two lines
         * above; that server answers the question, serves the catalogue from
         * the real database, and is what he will actually deploy.
         *
         * So it is started for the measurement and stopped after it. If it
         * will not start, the static folder still gets audited — a build is
         * never blocked on its own audit.
         */
        let liveServer: { url: string; port: number; pid?: number; stop: () => void } | null = null;
        const bootPackagedServer = async (): Promise<typeof liveServer> => {
            if (!packaged || !apiDir || !fs.existsSync(path.join(apiDir, 'node_modules'))) return null;
            const port = 4600 + Math.floor(Math.random() * 300);
            try {
                const { executionEngine } = require('../../../kernel/ExecutionEngine');
                let up: (v: boolean) => void = () => { /* set below */ };
                const listening = new Promise<boolean>(r => { up = r; });
                const timer = setTimeout(() => up(false), 15_000);
                const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
                    cwd: apiDir, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
                    onLine: (l: string) => { term(`  ${l.slice(0, 160)}`); if (/listening on/.test(l)) up(true); },
                });
                child.done.then(() => up(false));
                const ok = await listening;
                clearTimeout(timer);
                if (!ok) { try { child.kill(); } catch { /* already gone */ } return null; }
                /**
                 * «LISTENING» IS NOT «SERVING» — and the difference cost a
                 * whole audit.
                 *
                 * A feed server printed «listening on», answered its API
                 * perfectly, and returned 404 for «/» because it served no
                 * public/ at all. The audit was handed that address and spent
                 * thirty seconds grading Express's 404 page: 41/100, six
                 * findings, zero of them about the product.
                 *
                 * So the front door is KNOCKED ON before the address is handed
                 * over. A server that does not answer its own root is not the
                 * place to measure an interface.
                 */
                const url = `http://127.0.0.1:${port}/`;
                let door = 0;
                for (let i = 0; i < 12 && door !== 200; i++) {
                    try { door = (await fetch(url, { redirect: 'follow' })).status; }
                    catch { await new Promise(r => setTimeout(r, 250)); }
                }
                if (door !== 200) {
                    term(`self-QA: the server listens but answered ${door || 'nothing'} at «/» — it serves no interface, so the audit measures the built folder instead`);
                    try { child.kill(); } catch { /* already gone */ }
                    return null;
                }
                return { url, port, pid: child.pid, stop: () => { try { child.kill(); } catch { /* already gone */ } } };
            } catch (e: any) {
                term(`self-QA: could not start the packaged server (${String(e?.message || e).slice(0, 120)}) — auditing the folder instead`);
                return null;
            }
        };

        // ── SELF-QA: a REAL browser measures the build before delivery ──────
        let audit: any = null;
        let selfRepair: { before: number; after: number; files: string[]; repairs: any[]; fixed: string[] } | null = null;
        /** The terminal's own verdict — the browser's number has a twin now. */
        let terminalAudit: any = null;
        /** Every round of the improvement loop, kept for the delivery report. */
        let loop: any = null;
        if (built && !input?.skipAudit) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🔎 أفحص البناء في متصفح حقيقي قبل التسليم…' : '🔎 Self-QA in a real browser…');
            const { auditBuiltApp } = require('../../../core/quality/app-audit');
            /**
             * THE CHECK HAPPENS IN THE PANEL HE IS WATCHING — «كيف بدنا نصلح
             * المتصفح». It used to run in a private headless browser: real,
             * measured, and completely invisible, so «self-QA: 62/100» was a
             * verdict with nothing behind it he could look at. It now borrows
             * Joe's own browser session, which already streams to the Browser
             * tab, and the tab is opened for him when the audit starts.
             */
            const { PANEL_BROWSER_SID } = require('./BrowserSmartTools');
            try {
                broadcast({ type: 'panel_focus', sessionId, data: { panel: 'browser', reason: 'self_qa' } } as any);
            } catch { /* UI optional */ }
            /**
             * …AND THEN WAIT FOR HIM TO ACTUALLY BE LOOKING.
             *
             * Focusing the panel and starting the audit in the same tick is a
             * promise the interface cannot keep: the browser tab is a lazily
             * loaded chunk that must download, mount and open a socket first.
             * From his own timestamps the panel attached TWENTY-THREE seconds
             * into a twenty-nine second audit — he was shown the last six.
             *
             * Four seconds at most, and not one millisecond if nobody is there.
             */
            try {
                const { waitForPanelWatcher } = require('../../browser/wsHub');
                const watching = await waitForPanelWatcher(PANEL_BROWSER_SID, 4000);
                term(watching
                    ? 'self-QA: the Browser panel is attached — the audit runs where you can see it'
                    : 'self-QA: no Browser panel attached — running anyway, the findings are in the message');
            } catch { /* the hub is optional — never block a build on it */ }
            let auditVisible = false;
            liveServer = await bootPackagedServer();
            if (liveServer) {
                term(`self-QA: measuring the RUNNING system at ${liveServer.url} — its API answers, so the catalogue is real`);
                if (sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? '🔌 أفحص النظام وهو يعمل — الواجهة داخل خادمها، والبيانات من قاعدتها الحقيقية'
                    : '🔌 Measuring the system while it RUNS — the interface inside its server, the data from its real database');
            }
            audit = await auditBuiltApp(path.join(proj, 'dist'), {
                timeoutMs: 30_000,
                watchSessionId: PANEL_BROWSER_SID,
                ...(liveServer ? { serveUrl: liveServer.url } : {}),
                /**
                 * And the invitation matches reality. When the audit cannot
                 * borrow the panel it runs in a private browser — and telling
                 * him to «watch it happen» in front of a white rectangle is
                 * how «مازال يفتح المتصفح دون عمل شيء» gets written twice.
                 */
                onProgress: (where: string) => {
                    if (!sessionId) return;
                    if (where.startsWith('private')) {
                        /**
                         * WITH THE REASON. «لم يتحرك متصفح جو … كل شي وهمي»:
                         * knowing the panel was not used is worth little if the
                         * cause stays inside a swallowed exception on his
                         * machine — a rejected saved cookie, a locked profile,
                         * a headed mode Chromium will not give.
                         */
                        auditVisible = false;
                        const why = where.slice('private'.length).replace(/^:/, '').trim();
                        broadcastThinkingDetail(sessionId, (isAr
                            ? '🔒 تعذّر استعمال لوحة المتصفّح — الفحص يجري في متصفّح خاصّ، والنتيجة كاملة في الرسالة (لا شيء لتشاهده الآن)'
                            : '🔒 The Browser panel could not be used — the audit is running in a private browser; the full result is in the message (nothing to watch)')
                            + (why ? (isAr ? `\n   السبب: ${why}` : `\n   Reason: ${why}`) : ''));
                        term(`self-QA: panel not borrowed — running in a private browser${why ? `: ${why}` : ''}`);
                        return;
                    }
                    if (where === 'watching') {
                        auditVisible = true;
                        broadcastThinkingDetail(sessionId, isAr
                            ? '👁️ الفحص يجري الآن أمامك في لوحة المتصفح — كل ملاحظة مُعلَّمة بإطار أحمر على الصفحة'
                            : '👁️ Watch it happen in the Browser panel — every finding is outlined on the page');
                        return;
                    }
                    // …and the later steps only speak when there is really
                    // something on screen. Telling him to look at a private
                    // browser is the same white rectangle with a caption.
                    if (where === 'pressing' && auditVisible) {
                        broadcastThinkingDetail(sessionId, isAr
                            ? '🖱️ أضغط الآن كل زرّ وقائمة ورابط أمامك — والمؤشّر يتحرّك والعنصر المفحوص محدَّد بالأحمر'
                            : '🖱️ Pressing every button, menu and link in front of you — the pointer moves and the element under test is outlined in red');
                    }
                    if (where === 'inspecting' && auditVisible) {
                        broadcastThinkingDetail(sessionId, isAr
                            ? '📐 والآن فحص الواجهة نفسها: تباين الألوان، بنية الوصولية، وإعادة قياس الصفحة على مقاس الجوّال واللوحي'
                            : '📐 Now the interface itself: colour contrast, accessibility structure, and the page re-measured at phone and tablet width');
                    }
                },
            });
            term(audit.skipped
                ? `self-QA: skipped (${audit.skipped})`
                : `self-QA: ${audit.score}/100${audit.findings.length ? ` — ${audit.findings.map((f: any) => f.id).join(', ')}` : ' — clean'}`);

            /**
             * AND WHAT IT FINDS, IT FIXES — before delivery, not on request.
             *
             * Until now this measured the build and handed it over exactly as
             * measured: «self-QA: 62/100 — dead_links, small_targets», with the
             * repair machinery sitting one function away, reachable only if the
             * user happened to know to say «أصلح الواجهة». Reading a defect
             * report was being treated as his job.
             *
             * Only findings a deterministic edit can actually answer trigger
             * this — a rebuild costs him half a minute, and spending it on
             * console errors nobody can auto-fix would be theatre. And the
             * second score is measured, never assumed: if the repair did not
             * help, the first number stands and says so.
             */
            if (!audit.skipped && worthRepairing(audit.findings)) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? '🛠️ وجدتُ ما أستطيع إصلاحه بنفسي — أصلحه وأعيد البناء وأقيس مرّة أخرى…'
                    : '🛠️ Repairing what I can fix myself, rebuilding, and measuring again…');

                /**
                 * THE LOOP HE ASKED FOR — «يرجع يحلل ويفكر ومن ثم يكمل».
                 *
                 * What stood here was one pass: repair once, rebuild once,
                 * measure once, done. There was no point in it where Joe
                 * looked at what SURVIVED the repair and decided what to do
                 * about that — the intelligence was all in the instruments
                 * and none of it after them.
                 *
                 * Now every round is handed the findings that are still open
                 * and its own round NUMBER, and the fixes escalate with it:
                 * 44px → 48 → 56, contrast 4.5 → 5.5 → 7. A round that cannot
                 * write one different byte does not run. A round that runs and
                 * does not raise the measured score is rolled back to the
                 * snapshot it started from, and the loop stops there.
                 *
                 * So the time it takes is decided by how much it is still
                 * winning, and every minute of it is answerable in a number.
                 */
                const { improveUntilItStops, repairRound, improveSummary } = require('../../../core/quality/improve-loop');
                const { restoreVersion, snapshotProject } = require('../../../core/project/versions');
                const { runDoctored } = require('../../../core/quality/log-doctor');

                const measureNow = async () => {
                    const a = await auditBuiltApp(path.join(proj, 'dist'), {
                        timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID,
                        ...(liveServer ? { serveUrl: liveServer.url } : {}),
                    });
                    if (a?.skipped) return { score: 0, findingIds: [], skipped: true };
                    lastAudit = a;
                    return { score: Number(a.score || 0), findingIds: (a.findings || []).map((f: any) => f.id) };
                };
                let lastAudit: any = audit;

                loop = await improveUntilItStops(
                    { score: Number(audit.score || 0), findingIds: (audit.findings || []).map((f: any) => f.id) },
                    {
                        say: term,
                        maxRounds: Math.max(1, Number(process.env.JOE_IMPROVE_ROUNDS || 4)),
                        target: Math.max(1, Number(process.env.JOE_IMPROVE_TARGET || 95)),
                        snapshot: (label: string) => String(snapshotProject(proj, label)?.id || ''),
                        rollback: async (id: string) => {
                            const back = restoreVersion(proj, id);
                            if (!back?.ok) return false;
                            const rb = await runDoctored('npm', ['run', 'build'], {
                                cwd: proj, timeoutMs: 240_000,
                                onLine: (l: string) => term(`  ${l.slice(0, 200)}`), onNote: term,
                            });
                            if (rb.ok === true && packaged) packageIntoApi(false);
                            return rb.ok === true;
                        },
                        repair: async (round: number) => (await repairRound(proj, round, { isArabic: isAr })).changed,
                        rebuild: async () => {
                            const rb = await runDoctored('npm', ['run', 'build'], {
                                cwd: proj, timeoutMs: 240_000,
                                onLine: (l: string) => term(`  ${l.slice(0, 200)}`), onNote: term,
                            });
                            if (rb.ok !== true) return false;
                            // The packaged copy is the OLD interface until this
                            // runs — measuring it would credit the round with a
                            // page it did not produce.
                            if (packaged) packageIntoApi(false);
                            return true;
                        },
                    },
                );
                term(improveSummary(loop, false));
                if (sessionId) broadcastThinkingDetail(sessionId, improveSummary(loop, isAr));

                // The verdict the report publishes is the LAST measurement the
                // loop actually kept — never the best number it ever saw.
                if (loop.final && !loop.final.skipped && loop.final.score !== audit.score) audit = lastAudit;
                const paid = loop.rounds.filter((r: any) => r.verdict === 'improved');
                if (paid.length) {
                    selfRepair = {
                        before: loop.first.score, after: loop.final.score,
                        files: Array.from(new Set(paid.flatMap((r: any) => r.changed))),
                        repairs: [], fixed: loop.fixed,
                    };
                }
            }
            /**
             * AND NOW THE OTHER HALF OF THE MEASUREMENT — IN THE TERMINAL.
             *
             * «ما زلت لم ارى شاشة الثيرمال يفتح مثل شاشة المتصفح ويجري اختبارات
             *  امامي … ويرى جو نتائج الاختبارات التي يجريها الثيرمال مثل ما
             *  ياخذ نتائج الجودة التي يجريها المتصفح»
             *
             * He named a real asymmetry. The browser half opens its own panel,
             * presses every control in front of him, and returns a score with
             * named findings that Joe repairs against. The terminal half was a
             * PIPE: build output scrolled past, the panel never opened, and
             * nothing that appeared there was ever measured. A stream is not a
             * test, and output nobody scores is not a result.
             *
             * So the terminal gets its own instrument, to the same contract:
             * the panel is asked for by name, every check is a real process
             * with a real exit code, and it answers with a score Joe reads,
             * reports, and can be held to.
             */
            if (apiDir && fs.existsSync(path.join(apiDir, 'package.json'))) {
                try {
                    broadcast({ type: 'panel_focus', sessionId, data: { panel: 'terminal', reason: 'terminal_qa' } } as any);
                } catch { /* UI optional */ }
                if (sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? '⌨️ الآن الطرفية — أُشغّل اختبارات حقيقية على الخادم أمامك وأقرأ نتائجها'
                    : '⌨️ Now the terminal — running real checks against the server in front of you, and reading their results');
                const { auditInTerminal, failingIds } = require('../../../core/quality/terminal-audit');
                terminalAudit = await auditInTerminal(apiDir, {
                    onLine: term,
                    serveUrl: liveServer ? liveServer.url : '',
                    tables: systemTables,
                    timeoutMs: 25_000,
                });
                if (terminalAudit && !terminalAudit.skipped) {
                    const bad = failingIds(terminalAudit);
                    term(`terminal-QA: ${terminalAudit.score}/100 (${terminalAudit.passed}/${terminalAudit.total} checks)`
                        + (bad.length ? ` — ${bad.join(', ')}` : ' — every check passed'));
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr
                        ? `⌨️ فحص الطرفية: ${terminalAudit.score}/100 — ${terminalAudit.passed} من ${terminalAudit.total} اختباراً`
                            + (bad.length ? ` · تعثّر: ${bad.join('، ')}` : ' · كلها نجحت')
                        : `⌨️ Terminal QA: ${terminalAudit.score}/100 — ${terminalAudit.passed} of ${terminalAudit.total} checks`
                            + (bad.length ? ` · failed: ${bad.join(', ')}` : ' · all passed'));
                } else {
                    term(`terminal-QA: skipped (${terminalAudit?.skipped || 'no_project'}) — nothing was measured, so nothing is claimed`);
                }
            }
            /**
             * ORDER MATTERS, AND HIS SCREEN PROVED IT.
             *
             * «المفروض ان شاشة الثيرمال … ظهرت واجرت الاختبارات … ولكنها لم
             *  تظهر». The terminal panel WAS asked for by name — and eight
             * seconds later `preview_ready` fired and pulled the workspace to
             * the Preview tab, so the checks ran on a tab nobody was looking
             * at and the run ended somewhere else entirely.
             *
             * Handing over the live system is the LAST thing that happens, not
             * the second to last. Measure in the terminal while the terminal is
             * the tab in front of him; open the preview when there is nothing
             * left to watch.
             */
            /**
             * AND THE SYSTEM THAT JUST PROVED IT WORKS STAYS UP.
             *
             * «لكن لم ارى النظام». He is right, and this line is why. Joe
             * started the packaged server, opened a real browser on it,
             * measured it, repaired it, measured it again — and then killed
             * it, with the comment «the system he deploys is his to start».
             * Then it tried to start something else on another port, failed,
             * and handed him a dead link. He never once saw the thing he
             * asked for, and Joe had it running in its hands the whole time.
             *
             * A server that has just answered a real browser and its own API
             * IS the live preview. It is handed over, not thrown away: the
             * preview panel opens it, the delivery message carries its
             * address, and `project_run` adopts it instead of racing it.
             */
            if (liveServer) {
                try {
                    const prevPid = Number(prevEntry?.live?.pid || 0);
                    if (prevPid && prevPid !== liveServer.pid) process.kill(prevPid);
                } catch { /* an old server that is already gone needs no killing */ }
                term(`self-QA: the system stays UP at ${liveServer.url} — this is your live system, not a test rig`);
                if (sessionId) {
                    broadcastThinkingDetail(sessionId, isAr
                        ? `🌐 نظامك يعمل الآن على ${liveServer.url} — الواجهة وقاعدة بياناتها على نفس العنوان`
                        : `🌐 Your system is live at ${liveServer.url} — the interface and its database on one address`);
                    try {
                        broadcast({
                            type: 'preview_ready', sessionId,
                            data: { url: liveServer.url, previewUrl: liveServer.url, port: liveServer.port, live: true },
                        } as any);
                    } catch { /* the panel is optional, the server is not */ }
                }
            }

        }

        // Remember the project so «عدل …» routes to the SURGICAL editor and
        // survives restarts like everything else Joe remembers.
        const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
        projects[sessionKey] = {
            dir: proj, type: 'react', brand: content.brand, updatedAt: Date.now(), lastRequest: request.slice(0, 80),
            // The API's url AND dir ride along: «اعرض الطلبات» reads the
            // database from disk, and the inbox bridge resolves the owner,
            // even after this react build took the session's project slot.
            ...(apiLink ? { linkedApi: apiLink, linkedApiDir: prevEntry.dir } : {}),
            // WHICH FOLDER IS THE SYSTEM. When the compiled interface was
            // copied into the server's public/, that server serves the whole
            // thing from one origin — so `project_run` must start IT, not run
            // `vite` over the source. Without this the pipeline opened a
            // hot-reload dev server with no backend behind it.
            ...(packaged && apiDir ? { packagedInto: apiDir } : {}),
            // …and WHERE it is answering right now, so «شغّل المشروع» adopts
            // the running system instead of starting a second copy of it.
            ...(liveServer ? { live: { url: liveServer.url, port: liveServer.port, pid: liveServer.pid, at: Date.now() } } : {}),
            // The findings ride along, not just the number: the Quality phase
            // reports THIS audit instead of opening a second browser over the
            // same page, and a score with no findings would be a worse report
            // than the one it replaces.
            ...(audit && !audit.skipped ? {
                lastAudit: {
                    score: audit.score, at: Date.now(),
                    findings: (audit.findings || []).slice(0, 12)
                        .map((f: any) => ({ severity: f.severity, message: String(f.message || f.what || '').slice(0, 200) })),
                },
            } : {}),
        };
        persistJoeProjects();

        // The freshly built app opens in the preview panel on its own — the
        // same moment a page build does, through the live /project-preview
        // route that serves this session's dist.
        let previewUrl = '';
        if (built) {
            previewUrl = publicUrlFor(`/project-preview/${sessionKey}/index.html?v=${Date.now()}`);
            try { broadcast({ type: 'preview_ready', sessionId, data: { url: previewUrl, previewUrl, sessionId } } as any); } catch { /* UI optional */ }
        }

        const fileList = Object.keys(files).map(f => `  • ${f}`).join('\n');
        // What the app can actually DO — stated as capabilities, because the
        // last delivery described a maps app that contained no map.
        const ABILITIES: Record<string, [string[], string[]]> = {
            map: [
                ['خريطة حقيقية (Leaflet + OpenStreetMap) بتكبير وتحريك', 'بحث عن أي مكان بالاسم (Nominatim)', 'زر «موقعي» بتحديد GPS', 'النقر على الخريطة يثبّت علامة باسمها', 'أماكن محفوظة تبقى بعد إغلاق المتصفح + المسافة عنك'],
                ['a real Leaflet + OpenStreetMap map', 'place search by name (Nominatim)', 'a working "my location" button', 'click the map to drop a named pin', 'saved places that survive a reload, with distance from you'],
            ],
            chat: [
                ['غرف محادثة تُنشأ وتُحذف', 'رسائل محفوظة دائمة مع بحث', 'اسم المستخدم محفوظ على الجهاز', 'مزامنة حيّة مع الخادم إن وُجد — وإلا يقول بصراحة إنه محلي'],
                ['rooms you create and remove', 'durable messages with search', 'a display name kept on the device', 'live sync with the server when one exists — and an honest "local only" badge when not'],
            ],
            weather: [
                ['طقس حيّ من open-meteo بلا مفتاح ولا حساب', 'بحث عن المدن + تحديد الموقع', 'توقّعات سبعة أيام', 'تبديل مئوي/فهرنهايت ومدن محفوظة'],
                ['live weather from open-meteo — no key, no account', 'city search and geolocation', 'a seven-day forecast', 'a °C/°F switch and saved cities'],
            ],
            social: [
                ['خيط منشورات حقيقي: نشر نصّ وصورة', 'إعجاب وتعليقات تُحفظ', 'متابعة تُصفّي الخيط', 'ملف شخصي بمنشوراتك', 'حفظ دائم + مزامنة مع الخادم إن وُجد'],
                ['a real feed: post text and a photo', 'likes and comments that persist', 'following that filters the feed', 'a profile with your own posts', 'durable storage and server sync when one exists'],
            ],
            records: [
                ['إضافة وتعديل وحذف السجلات فعلياً', 'تحقّق من الحقول المطلوبة قبل الحفظ', 'بحث وتصفية وترتيب فوري', 'أرقام محسوبة من بياناتك أنت', 'حفظ دائم + تصدير CSV + قراءة من خادم المشروع إن وُجد'],
                ['create, edit and delete records for real', 'required-field validation before saving', 'instant search, filter and sort', 'numbers computed from YOUR rows', 'durable storage, CSV export, and reads from the project API when one exists'],
            ],
        };
        const appAbilities = appBp ? (ABILITIES[appBp.engine] || ABILITIES.records)[isAr ? 0 : 1] : [];
        /**
         * WHAT WAS ASKED FOR AND NOT BUILT — said out loud.
         *
         * A user handed Joe a full platform specification — Next.js, FastAPI,
         * PostGIS, a business portal, a developer portal, offline maps, an AI
         * assistant — and Joe scaffolded its small Leaflet app and reported
         * plain success. Silence about the other ninety percent is a lie told
         * by omission, and it is the fastest way to lose someone's trust.
         */
        const UNMET: Array<[RegExp, string, string]> = [
            [/next\.?js|nuxt|remix|astro/i, 'Next.js', 'Next.js'],
            [/typescript|\bts\b/i, 'TypeScript', 'TypeScript'],
            [/tailwind|shadcn|chakra|material\s*ui/i, 'Tailwind/shadcn', 'Tailwind/shadcn'],
            [/maplibre|mapbox|vector\s*tiles?|pmtiles|3d\s*buildings?|terrain|hillshade|satellite|قمر\s*صناعي|ثلاثي\s*الأبعاد/i, 'MapLibre/بلاطات متجهة/3D/أقمار صناعية', 'MapLibre / vector tiles / 3D / satellite'],
            [/fastapi|django|flask|spring|laravel|\.net\b/i, 'خادم Python/Java/.NET', 'a Python/Java/.NET backend'],
            [/postgres|postgis|mysql|mongo|redis|elasticsearch|opensearch/i, 'قاعدة بيانات خارجية (Postgres/PostGIS/Redis…)', 'an external database (Postgres/PostGIS/Redis…)'],
            [/\bgraphql\b|websockets?|celery|kafka|rabbitmq/i, 'GraphQL/WebSockets/طوابير المهام', 'GraphQL / WebSockets / task queues'],
            [/\boauth2?\b|two[-\s]?factor|\b2fa\b|apple\s*login|google\s*login|jwt/i, 'تسجيل دخول ومصادقة', 'authentication (OAuth/2FA)'],
            [/docker|kubernetes|helm|nginx|ci\/?cd|github\s*actions|terraform/i, 'Docker/Kubernetes/CI-CD', 'Docker / Kubernetes / CI-CD'],
            [/prometheus|grafana|monitoring|observability/i, 'المراقبة (Prometheus/Grafana)', 'monitoring (Prometheus/Grafana)'],
            [/admin\s*panel|business\s*portal|developer\s*portal|api\s*keys?|لوحة\s*(تحكم|إدارة)|بوابة\s*(المطوّ?رين|الأعمال)/i, 'لوحات الإدارة وبوابات المطوّرين/الأعمال', 'admin / business / developer portals'],
            [/traffic|road\s*closures?|transit|public\s*transport|حركة\s*المرور|إغلاق\s*الطرق|النقل\s*العام/i, 'بيانات المرور الحيّة والنقل العام', 'live traffic and public transport'],
            [/offline\s*(maps?|mode)|خرائط\s*بلا\s*إنترنت|بدون\s*إنترنت/i, 'الخرائط بلا إنترنت', 'offline maps'],
            [/ai\s*assistant|مساعد\s*ذكي|recommendations?|توصيات/i, 'مساعد ذكي داخل التطبيق', 'an in-app AI assistant'],
            [/reviews?|ratings?|تقييمات|مراجعات/i, 'التقييمات والمراجعات', 'reviews and ratings'],
            [/unit\s*tests?|e2e|integration\s*tests?|اختبارات/i, 'حزمة الاختبارات', 'a test suite'],
        ];
        // THE USER'S OWN LIST FIRST. The table above knows only the words I
        // thought to write down; measured in the field, a request naming twelve
        // features got ONE of them reported because «AI assistant» happened to
        // be in my table and «Stories», «Reels», «Live streaming», «Groups»,
        // «Ads platform» were not. The features are now read out of the request
        // and reported verbatim; the table stays as a second source for the
        // technology stack, which is rarely written as a bullet list.
        const { uncoveredFeatures } = require('../../../core/design/app-blueprints');
        const askedButMissing: string[] = appBp
            ? uncoveredFeatures(request, appBp.engine, !!apiLink)
            : [];
        const unmet = appBp
            ? [...askedButMissing, ...UNMET.filter(([re]) => re.test(request)).map(u => (isAr ? u[1] : u[2]))]
                .filter((v, i, a) => a.indexOf(v) === i).slice(0, 24)
            : [];
        const unmetBlock = unmet.length
            ? (isAr
                ? `\n⚠️ وطلبتَ أيضاً ما لم أبنِه في هذه الخطوة — أقولها بصراحة بدل ادّعاء الاكتمال:\n${unmet.map(u => `   • ${u}`).join('\n')}\nأستطيع بناء الخادم وقاعدة البيانات كخطوة مستقلة: قل «ابنِ الباك إند لهذا التطبيق».\n`
                : `\n⚠️ You also asked for things this step did NOT build — stated plainly rather than claimed:\n${unmet.map(u => `   • ${u}`).join('\n')}\n`)
            : '';
        const appBlock = appBp
            ? (isAr
                ? `\n🧠 هذا تطبيق يعمل، لا صفحة تتحدث عنه — «${appBp.title}»:\n${appAbilities.map(a => `   • ${a}`).join('\n')}\n${unmetBlock}`
                : `\n🧠 A working application, not a page about one — "${appBp.title}":\n${appAbilities.map(a => `   • ${a}`).join('\n')}\n${unmetBlock}`)
            : '';
        /**
         * «ولكن جو لم يصنع أي شيء ظاهر من هذه الخطوات نهائياً».
         *
         * Sixty-two seconds of his run went into three steps:
         *
         *     🔎 Self-QA in a real browser…                              29s
         *     👁️ Watch it happen in the Browser panel…                    9s
         *     🛠️ Repairing what I can fix myself, then rebuilding…       24s
         *
         * …and the message he received never mentioned any of it. Not because
         * the work was lost — the ARABIC branch of this message reports the
         * score, every finding in words, and every repair. The ENGLISH branch
         * went straight from the file list to «npm install + vite build
         * succeeded». Two branches of one message that were never the same
         * message, and his request happened to take the silent one.
         *
         * The section is built ONCE now, in his language, and both branches
         * carry it — including what SURVIVED the repair, because a score of
         * 67/100 means findings are still there and he is entitled to know
         * which.
         */
        /**
         * A DELIVERY THAT KNOWS IT IS BROKEN MUST SAY SO FIRST.
         *
         * His build was handed over at 67/100 with `failed_requests` still
         * open — the `%22C:/Users/…jpg%22 404` he was looking at on screen —
         * under a headline that read «A full React project, scaffolded AND
         * verified to compile». Verified to COMPILE, yes. Nobody claimed it
         * worked, and nobody said it did not.
         *
         * A score is a poor gate: 67 is not meaningfully different from 71.
         * What is not a matter of degree is a HIGH-severity finding — a page
         * error, a console error, a file that never arrived, an image that
         * never drew. Any one of those surviving the self-repair means the
         * thing does not work, and the message leads with that instead of
         * burying it under a list of filenames.
         */
        const blockers = ((audit?.findings || []) as any[]).filter(f => f.severity === 'high');
        if (blockers.length) {
            term(`self-QA: DELIVERED WITH ${blockers.length} BLOCKING FINDING(S) — ${blockers.map(f => f.id).join(', ')}`);
        }

        const qaBlock = (() => {
            if (!audit) return '';
            const lines: string[] = [];
            // «• 3 خطأ كونسول» inside an English delivery. The findings carry
            // both languages now; the message must pick the reader's.
            const say = (f: any) => require('../../../core/quality/app-audit').findingText(f, isAr);
            if (blockers.length) {
                lines.push(isAr
                    ? `⛔ سلّمتُه وهو **لا يعمل كما ينبغي** — ${blockers.length} عطل جوهري باقٍ:`
                    : `⛔ Delivered, but it does NOT work properly — ${blockers.length} blocking finding(s) remain:`);
                for (const f of blockers) lines.push(`   • ${say(f)}`);
                lines.push(isAr
                    ? `   ↳ قل «أصلح ما تبقّى» وسأفتح المتصفّح على هذه بالذات.`
                    : `   ↳ Say «أصلح ما تبقّى» / "fix what is left" and I will open the browser on exactly these.`);
            }
            lines.push(require('../../../core/quality/app-audit').formatAudit(audit, isAr));
            if (selfRepair) {
                /**
                 * A REPAIR IS WHAT THE SECOND MEASUREMENT SAYS IT IS.
                 *
                 * Editing five files and announcing six fixes while the score
                 * and every finding stay exactly where they were is not a
                 * report — it is a press release. What moved is claimed; what
                 * was merely tried is named as an attempt.
                 */
                const moved = selfRepair.after > selfRepair.before || selfRepair.fixed.length > 0;
                lines.push(moved
                    ? (isAr
                        ? `🛠️ وأصلحتُ ما وجدتُه بنفسي قبل التسليم: ${selfRepair.before}/100 ← ${selfRepair.after}/100 (${selfRepair.files.length} ملف)`
                        : `🛠️ Repaired before delivery: ${selfRepair.before}/100 → ${selfRepair.after}/100 (${selfRepair.files.length} file(s))`)
                    : (isAr
                        ? `🛠️ جرّبتُ الإصلاح الذاتي على ${selfRepair.files.length} ملف — **ولم تتغيّر النتيجة** (${selfRepair.before}/100)، ولم تزُل أيّ ملاحظة. لن أعدّ محاولةً إنجازاً:`
                        : `🛠️ Self-repair touched ${selfRepair.files.length} file(s) — **and changed nothing** (${selfRepair.before}/100): not one finding went away. An attempt is not an achievement:`));
                const { repairText } = require('../../../core/quality/ui-repair');
                for (const r of selfRepair.repairs) {
                    lines.push(`   • ${moved ? '' : (isAr ? 'حاولتُ: ' : 'tried: ')}${repairText(r, isAr)}${r.count > 1 ? ` (${r.count})` : ''}`);
                }
                if (moved && selfRepair.fixed.length) {
                    lines.push(isAr
                        ? `   ✅ وزالت فعلاً: ${selfRepair.fixed.join('، ')}`
                        : `   ✅ Actually gone: ${selfRepair.fixed.join(', ')}`);
                }
                for (const f of selfRepair.files) lines.push(`   • ${isAr ? 'عُدّل' : 'edited'}: ${f}`);
                const left = (audit.findings || []);
                if (left.length) {
                    lines.push(isAr
                        ? `⚠️ وما زال قائماً بعد الإصلاح — لم أُخفِه:`
                        : `⚠️ Still there after the repair — not hidden:`);
                    for (const f of left) lines.push(`   • ${say(f)}`);
                } else {
                    lines.push(isAr ? '✅ ولم يبقَ شيء من الملاحظات.' : '✅ Nothing left from the findings.');
                }
            }
            /**
             * AND THE TERMINAL'S NUMBER, BESIDE THE BROWSER'S.
             *
             * «ويرى جو نتائج الاختبارات التي يجريها الثيرمال مثل ما ياخذ نتائج
             *  الجودة التي يجريها المتصفح». Two instruments, two scores, one
             * report — and a failed check is named, never a scroll position.
             */
            /**
             * THE LOOP'S OWN STORY — every round, and why it stopped.
             *
             * «ومن ثم يرجع يحلل ما بناه ومن ثم يرجع يطور عليه». A number that
             * moved is only half of it; the reader is owed the path it took
             * and the reason it stopped, so he can disagree with the decision.
             */
            if (loop && Array.isArray(loop.rounds) && loop.rounds.length) {
                const { improveSummary } = require('../../../core/quality/improve-loop');
                lines.push(improveSummary(loop, isAr));
                for (const r of loop.rounds) {
                    const mark = r.verdict === 'improved' ? '✅' : r.rolledBack ? '↩️' : '⏹️';
                    const move = r.after === undefined ? `${r.before}/100` : `${r.before} → ${r.after}/100`;
                    const why: string = ({
                        improved: isAr ? 'مكسب مقيس' : 'measured gain',
                        no_measured_gain: isAr ? 'بلا مكسب — تراجعتُ عنها' : 'no gain — rolled back',
                        no_change_possible: isAr ? 'لا شيء مختلف أستطيع كتابته' : 'nothing different left to write',
                        build_failed: isAr ? 'كسرت البناء — تراجعتُ عنها' : 'broke the build — rolled back',
                        target_reached: isAr ? 'بلغتُ الحدّ' : 'reached the bar',
                    } as Record<string, string>)[String(r.verdict)] || String(r.verdict);
                    lines.push(`   ${mark} ${isAr ? 'جولة' : 'round'} ${r.round}: ${move} — ${why}`
                        + (r.changed.length ? ` (${r.changed.length} ${isAr ? 'ملف' : 'file(s)'})` : '')
                        + (r.fixed.length ? ` · ${isAr ? 'زالت' : 'gone'}: ${r.fixed.join(', ')}` : ''));
                }
            }
            if (terminalAudit && !terminalAudit.skipped) {
                const bad = terminalAudit.checks.filter((c: any) => !c.ok && !c.skipped);
                lines.push(isAr
                    ? `⌨️ فحص الطرفية: **${terminalAudit.score}/100** — ${terminalAudit.passed} من ${terminalAudit.total} اختباراً حقيقياً (عمليات فعلية، لا ادّعاء)`
                    : `⌨️ Terminal QA: **${terminalAudit.score}/100** — ${terminalAudit.passed} of ${terminalAudit.total} real checks (actual processes, not claims)`);
                for (const c of terminalAudit.checks) {
                    const mark = c.skipped ? '⏭️' : c.ok ? '✅' : '❌';
                    lines.push(`   ${mark} ${c.id} — ${c.detail}`);
                }
                if (bad.length) {
                    lines.push(isAr
                        ? `   ↳ هذه فحوص خادم، لا تصميم — قل «أصلح ${bad[0].id}» وسأفتح الطرفية عليها.`
                        : `   ↳ These are server checks, not design — say "fix ${bad[0].id}" and I will open the terminal on them.`);
                }
            }
            return lines.join('\n') + '\n';
        })();

        /**
         * AND THE SIZE OF WHAT WAS NOT BUILT.
         *
         * «Build a world-class e-commerce platform similar to Shopify.
         * Features: Multi-vendor marketplace · AI product generation ·
         * Inventory · Payments · Shipping · Coupons · Loyalty · Mobile app ·
         * Analytics · Support · Marketing automation · SEO · Multi-language ·
         * Multi-currency» — answered with a single-table store, and a message
         * that listed its files, its score, its design family and five next
         * commands without mentioning the other thirteen features once.
         *
         * Not a lie. An omission the size of the request.
         */
        const scopeBlock = (() => {
            try {
                const { scopeReport, formatScope } = require('../../../core/quality/scope-audit');
                const dirs = [proj, ...(apiDir ? [apiDir] : [])];
                const r = scopeReport(request, dirs);
                if (r.missing.length) {
                    term(`scope: ${r.built.length}/${r.requested.length} named capabilities are in the build — missing: ${r.missing.map((c: any) => c.id).join(', ')}`);
                }
                return formatScope(r, isAr);
            } catch { return ''; }
        })();

        const message = isAr
            ? `⚛️ ${blockers.length ? 'بُني مشروع React وتجمّع — لكنه سُلّم بعيوب باقية' : built ? 'بُني مشروع React كاملاً وتُحقق من تجميعه' : installed ? 'أُنشئ مشروع React وثُبتت حزمه' : 'أُنشئ مشروع React كاملاً'} — «${content.brand}».
${scopeBlock}${appBlock}
${qaBlock}🎨 الطراز: ${FAMILY_LABEL_AR[family]} — قل «غيّر الطراز إلى فاخر/جريء/دافئ/بسيط» لتبديله.
📂 المسار: ${proj}
${fileList}

${buildDiagnosis ? (buildDiagnosis.healed
                ? `🩺 تعثّر البناء أول مرة، فشخّصتُه وعالجتُه: ${buildDiagnosis.note} — ثم اكتمل.\n`
                : `🩺 البناء تعثّر، والسبب بالضبط: ${buildDiagnosis.ar}\n`) : ''}${built ? '✅ npm install + vite build نجحا — نسخة الإنتاج جاهزة في dist/ والمعاينة الحية فُتحت تلقائياً.' : npmMissing ? '⚠️ npm غير متاح هنا — المشروع جاهز، ثبّته بنفسك: npm install ثم npm run dev.' : installed ? '✅ الحزم مثبتة.' : input?.skipInstall ? 'ℹ️ تخطيت التثبيت كما طُلب.' : '⚠️ التثبيت لم يكتمل — جرّب: npm install داخل المجلد.'}

🧭 خطوات تالية — أرسل أيّ سطر كما هو:
   • «عدّل المحتوى: …» → تعديل جراحي متحقق بالبناء (والمعاينة تتحدث فوراً)
   • «ضف صورة لطبق …» / «غيّر صورة الواجهة إلى …» / «احذف صورة …» → صور حقيقية مرخّصة
   • «تراجع» → استرجاع آخر تعديل بايتاً ببايت
   • «شغّل خادم التطوير» → معاينة تطوير بتحديث حي
   • «انشر المشروع» → نسخة الإنتاج بصورها على رابط دائم`
            : `⚛️ ${blockers.length ? 'A React project that compiles — delivered WITH open defects' : built ? 'A full React project, scaffolded AND verified to compile' : 'A full React project scaffolded'} — "${content.brand}".
${scopeBlock}${appBlock}
${qaBlock}📂 Path: ${proj}
${fileList}

${built ? '✅ npm install + vite build succeeded — the production build is in dist/.' : npmMissing ? '⚠️ npm is not available here — run npm install && npm run dev yourself.' : ''}`;

        return {
            ok: true,
            output: { message, path: proj, dir: dirName, installed, built, audit, files: Object.keys(files) },
            logs,
        } as any;
    }
}
