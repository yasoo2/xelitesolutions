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
import { brandFrom } from '../../../core/design/page-head';
import { detectPageKind, type PageKind } from '../../../core/design/blueprints';
import { resolveImages } from '../../../core/design/images';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';
import { persistJoeProjects } from '../../../api/page-store';

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
    isArabic: boolean;
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
            { path: '/', title: 'الرئيسية', titleEn: 'Home', sections: ['Hero', 'Testimonials'] },
            { path: '/menu', title: 'القائمة', titleEn: 'Menu', sections: ['Menu'] },
            { path: '/contact', title: 'تواصل معنا', titleEn: 'Contact', sections: ['Contact'] },
        ];
        case 'store': return [
            { path: '/', title: 'الرئيسية', titleEn: 'Home', sections: ['Hero', 'Testimonials'] },
            { path: '/products', title: 'المنتجات', titleEn: 'Products', sections: ['Products', 'Faq'] },
            { path: '/contact', title: 'تواصل معنا', titleEn: 'Contact', sections: ['Contact'] },
        ];
        default: return [
            { path: '/', title: 'الرئيسية', titleEn: 'Home', sections: ['Hero', 'Features', 'Stats'] },
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
export function sectionsForKind(kind: PageKind): string[] {
    switch (kind) {
        case 'restaurant': return ['Hero', 'Menu', 'Testimonials', 'Contact'];
        // Real product CARDS with photos and prices — a store sells things,
        // not subscription tiers. Pricing stays for app/dashboard kinds.
        case 'store': return ['Hero', 'Products', 'Testimonials', 'Faq', 'Contact'];
        case 'landing': return ['Hero', 'Features', 'Stats', 'Testimonials', 'Contact'];
        case 'portfolio': return ['Hero', 'Features', 'Stats', 'Contact'];
        case 'dashboard':
        case 'app': return ['Hero', 'Features', 'Pricing', 'Faq', 'Contact'];
        case 'event': return ['Hero', 'Stats', 'Faq', 'Contact'];
        default: return ['Hero', 'Features', 'Faq', 'Contact'];
    }
}

/** Content derived from the request — deterministic, never blocks on a model. */
function deriveContent(request: string, isAr: boolean, kind: PageKind = 'generic'): ReactContent {
    const brand = brandFrom(request, isAr) || (isAr ? 'مشروعي' : 'MyApp');
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
        isArabic: true,
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
        isArabic: false,
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

function fileIndexHtml(c: ReactContent): string {
    return `<!DOCTYPE html>
<html lang="${c.isArabic ? 'ar' : 'en'}" dir="${c.isArabic ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${c.brand}</title>
    <meta name="description" content="${c.tagline.replace(/"/g, '&quot;')}" />
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
${comps.map(c => `import ${c} from './components/${c}.jsx';`).join('\n')}
import { usePath } from './router.jsx';
import { content } from './content.js';

export const pages = [
${pageConst}
];

export default function App() {
  const path = usePath();
  const page = pages.find((p) => p.path === path);
  return (
    <>
      <Navbar content={content} pages={pages} />
      <main>
        {page ? page.render(content) : (
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
    return `import React from 'react';
${comps.map(c => `import ${c} from './components/${c}.jsx';`).join('\n')}
import { content } from './content.js';

export default function App() {
  return (
    <>
      <Navbar content={content} />
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
  menuTitle: '${js(c.menuTitle)}',
  menu: [
${c.menu.map(m => `    { name: '${js(m.name)}', desc: '${js(m.desc)}', price: '${js(m.price)}', img: ${m.img ? `{ src: '${js(m.img.src)}', alt: '${js(m.img.alt)}' }` : 'null'} },`).join('\n')}
  ],
  productsTitle: '${js(c.productsTitle)}',
  products: [
${c.products.map(p => `    { name: '${js(p.name)}', desc: '${js(p.desc)}', price: '${js(p.price)}', img: ${p.img ? `{ src: '${js(p.img.src)}', alt: '${js(p.img.alt)}' }` : 'null'} },`).join('\n')}
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
          <a href="#features">{content.isArabic === false ? 'Features' : 'المميزات'}</a>
          <a href="#contact">{content.contactTitle}</a>
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

export default function Hero({ content }) {
  return (
    <section className="hero" id="top">
      <div className={content.heroImage ? 'wrap hero-split' : 'wrap'}>
        <div>
          <h1>{content.heroTitle}</h1>
          <p className="lede">{content.heroLede}</p>
          <a className="btn" href="#contact">{content.cta}</a>
        </div>
        {content.heroImage ? (
          <img className="hero-photo" src={content.heroImage.src} alt={content.heroImage.alt}
            loading="eager" fetchpriority="high" decoding="async" />
        ) : null}
      </div>
    </section>
  );
}
`;
}

function fileFeaturesJsx(): string {
    return `import React from 'react';

export default function Features({ content }) {
  return (
    <section className="section" id="features">
      <div className="wrap">
        <h2>{content.featuresTitle}</h2>
        <div className="grid-3">
          {content.features.map((f) => (
            <div className="card" key={f.title}>
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
          {rows.map((m) => (
            <li className="menu-item" key={m.name}>
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
      setRows(fetched.map((f) => ({
        name: f.name, desc: f.details || '', price: f.price || '',
        img: (content.products.find((p) => p.name === f.name) || {}).img || null,
      })));
      setLive(true);
    }).catch(() => { /* offline or published — the baked rows stand */ });
  }, []);
  return (
    <section className="section" id="products">
      <div className="wrap">
        <h2>{content.productsTitle}{live ? <span className="live-dot" title="بيانات حية من قاعدة البيانات">●</span> : null}</h2>
        <div className="grid-3">
          {rows.map((p) => (
            <div className="card product-card" key={p.name}>
              {p.img ? (
                <img className="product-photo" src={p.img.src} alt={p.img.alt} loading="lazy" decoding="async" />
              ) : null}
              <h3>{p.name}</h3>
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
        <div className="grid-3">
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

function fileFooterJsx(): string {
    return `import React from 'react';

export default function Footer({ content }) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <p>© {new Date().getFullYear()} {content.brand}</p>
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

function fileBaseCss(): string {
    return `*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Segoe UI','Noto Sans Arabic',system-ui,sans-serif;line-height:1.7}
.wrap{width:min(100% - 2rem,1180px);margin-inline:auto}
.section{padding-block:clamp(48px,7vw,110px)}
.site-header{position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--border);z-index:10}
.header-inner{display:flex;align-items:center;gap:20px;min-height:64px}
.brand{font-weight:800;font-size:1.2rem;color:var(--text);text-decoration:none;margin-inline-end:auto}
.nav-links{display:flex;gap:10px}
.nav-links a{color:var(--text);text-decoration:none;font-weight:600;display:inline-flex;align-items:center;min-height:44px;padding:0 8px}
.nav-links a:hover{color:var(--brand)}
.theme-toggle{background:none;border:1px solid var(--border);border-radius:10px;min-width:44px;min-height:44px;cursor:pointer;color:var(--text)}
.hero{padding-block:clamp(64px,10vw,140px);background:radial-gradient(80% 60% at 50% 0,color-mix(in srgb,var(--tint) 30%,transparent),transparent)}
.hero h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.15;margin:0 0 14px}
.lede{color:var(--text-muted);font-size:1.15rem;max-width:60ch}
.btn{display:inline-block;background:var(--brand);color:var(--on-brand);padding:12px 24px;border-radius:999px;border:0;text-decoration:none;font-weight:700;cursor:pointer;margin-top:14px}
.btn:hover{background:var(--brand-dark)}
.grid-3{display:grid;gap:22px;grid-template-columns:1fr}
@media(min-width:900px){.grid-3{grid-template-columns:repeat(3,1fr)}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:24px}
.band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand)}
.band h2{margin-top:0}
form{display:grid;gap:12px;max-width:520px}
input,textarea{padding:12px 14px;border:1px solid var(--border);border-radius:12px;font:inherit;background:var(--surface);color:var(--text)}
textarea{min-height:120px}
.form-note{background:color-mix(in srgb,#fff 18%,transparent);padding:14px;border-radius:12px}
.site-footer{border-top:1px solid var(--border);padding-block:28px;color:var(--text-muted)}
.menu-list{list-style:none;margin:0;padding:0;max-width:720px}
.menu-item{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 0;border-bottom:1px dashed var(--border)}
.menu-item h3{margin:0 0 4px}
.menu-item p{margin:0;color:var(--text-muted)}
.menu-body{flex:1}
.menu-thumb{width:84px;height:84px;object-fit:cover;border-radius:14px;flex:none}
.product-card{display:flex;flex-direction:column;gap:10px}
.product-card h3,.product-card p{margin:0}
.product-card p{color:var(--text-muted)}
.product-photo{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px}
.product-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto}
.product-foot .btn{margin-top:0;padding:9px 20px}
.product-price{color:var(--brand);font-size:1.15rem;white-space:nowrap}
.live-dot{color:#2ecc71;font-size:.65em;vertical-align:middle;margin-inline-start:10px;animation:live-pulse 2s infinite}
.order-form{display:grid;gap:8px;margin-top:10px;max-width:320px}
.order-form input{padding:9px 12px;border:1px solid var(--border);border-radius:10px;font:inherit;background:var(--surface);color:var(--text)}
.order-form .btn{margin-top:0}
.order-note{background:color-mix(in srgb,var(--tint) 40%,transparent);padding:10px 14px;border-radius:10px;margin:10px 0 0;font-size:.95rem}
@keyframes live-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.menu-price{color:var(--brand);white-space:nowrap;font-size:1.1rem}
.tier{display:flex;flex-direction:column;gap:10px}
.tier.featured{border-color:var(--brand);box-shadow:0 12px 34px -14px color-mix(in srgb,var(--brand) 45%,transparent)}
.tier-price{font-size:1.05rem}
.tier-price strong{font-size:2rem}
.tier ul{margin:0;padding-inline-start:20px;color:var(--text-muted)}
.tier .btn{margin-top:auto;align-self:flex-start}
.quote blockquote{margin:0 0 10px;font-size:1.05rem;line-height:1.8}
.quote figcaption{color:var(--text-muted);display:flex;align-items:center;gap:10px}
.quote-avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none}
.faq-item{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:0 18px;margin-bottom:10px}
.faq-item summary{cursor:pointer;padding:14px 0;font-weight:700;min-height:44px;display:flex;align-items:center}
.faq-item p{color:var(--text-muted);padding-bottom:14px;margin:0}
.stats-band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand)}
.stats-row{display:flex;gap:34px;flex-wrap:wrap;justify-content:center;text-align:center}
.stat strong{display:block;font-size:2.2rem;line-height:1.1}
.stat span{opacity:.85}
.hero-split{display:grid;gap:34px;align-items:center;grid-template-columns:1fr}
@media(min-width:900px){.hero-split{grid-template-columns:1.1fr 1fr}}
.hero-photo{width:100%;border-radius:22px;box-shadow:0 24px 60px -16px rgba(0,0,0,.25);object-fit:cover;aspect-ratio:4/3}
.credits{font-size:.85rem;opacity:.8}
.credits a{color:inherit}
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
        const isAr = /[؀-ۿ]/.test(request);
        try { broadcast({ type: 'build_started', sessionId, data: { tool: 'react_project', sessionId } } as any); } catch { /* UI optional */ }

        const term = (line: string) => {
            logs.push(line);
            try {
                [String(sessionId || ''), 'local', 'default', 'panel-terminal'].filter(Boolean)
                    .forEach(id => broadcast({ type: 'terminal_output', id, data: line + '\r\n' } as any));
            } catch { /* UI optional */ }
        };

        const palette = buildPalette(request);
        // The SAME kind judgement the page builder uses: a restaurant app
        // ships a menu, a store ships pricing — never the same generic three
        // sections for every request.
        const kind = detectPageKind(request);
        const multiPage = wantsMultiPage(request);
        const pages = pagesForKind(kind);
        const sections = multiPage ? [...new Set(pages.flatMap(p => p.sections))] : sectionsForKind(kind);
        const content = deriveContent(request, isAr, kind);
        const dirName = `react-${slug(content.brand)}`;
        const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        // THE FULL-STACK LINK: when this session's previous project is a Joe
        // API, the new frontend is born connected — content.js carries the
        // API's URL, the list components ask it for the LIVE rows at runtime,
        // and any failure (API stopped, published copy) keeps the baked rows.
        const prevEntry = ((global as any).joeProjects || {})[sessionKey];
        const apiLink = prevEntry?.type === 'api' && prevEntry?.resource
            ? `http://localhost:${prevEntry.port || 4100}/api/${prevEntry.resource}` : '';
        (content as any).api = apiLink;
        // …and WRITES into it: visitor orders post to the API's orders table.
        (content as any).ordersApi = apiLink ? apiLink.replace(/\/api\/[a-z]+$/, '/api/orders') : '';
        (content as any).orderCta = isAr ? 'اطلب الآن' : 'Order now';
        if (apiLink) term(`full-stack link: this app reads LIVE rows from ${apiLink} and writes orders to ${(content as any).ordersApi}`);
        // The app's form delivers into Joe's inbox while it runs next to Joe.
        (content as any).inbox = `http://localhost:${process.env.PORT || '5002'}/api/public/forms/${dirName.replace(/[^a-zA-Z0-9._-]/g, '')}`;

        // The project lands where the File Explorer actually looks.
        const { workspaceService } = require('../../services/WorkspaceService');
        const root = String(input?.root || workspaceService.getExplorerRoot());
        const proj = path.join(root, dirName);
        fs.mkdirSync(path.join(proj, 'src', 'components'), { recursive: true });
        fs.mkdirSync(path.join(proj, 'src', 'styles'), { recursive: true });

        if (sessionId) broadcastThinkingDetail(sessionId, isAr
            ? `⚛️ أبني مشروع React حقيقي (Vite): ${content.brand}`
            : `⚛️ Scaffolding a real Vite + React project: ${content.brand}`);

        // A REAL photograph for the hero — through the same engine, archives
        // and licence bookkeeping every page build uses. skipInstall implies
        // a fully-offline scaffold (tests, air-gapped machines), so the photo
        // step is skipped with it; any live failure ships a clean no-image app.
        if (!input?.skipInstall && !input?.skipImages) {
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

        const componentTemplates: Record<string, () => string> = {
            Navbar: fileNavbarJsx, Hero: fileHeroJsx, Features: fileFeaturesJsx,
            Menu: fileMenuJsx, Products: fileProductsJsx, Pricing: filePricingJsx, Testimonials: fileTestimonialsJsx,
            Faq: fileFaqJsx, Stats: fileStatsJsx, Contact: fileContactJsx, Footer: fileFooterJsx,
        };
        const files: Record<string, string> = {
            'package.json': filePackageJson(content.brand),
            'vite.config.js': fileViteConfig(),
            'index.html': fileIndexHtml(content),
            '.gitignore': 'node_modules\ndist\n',
            'src/main.jsx': fileMainJsx(),
            'src/App.jsx': multiPage ? fileMultiPageAppJsx(pages, isAr) : fileAppJsx(sections),
            'src/content.js': fileContentJs(content),
            ...(multiPage ? { 'src/router.jsx': fileRouterJsx() } : {}),
            // Joe's REAL palette tokens — the same engine every page uses. The
            // data-theme blocks make the Navbar toggle actually change the
            // colours (paletteCss alone only follows the OS preference).
            'src/styles/tokens.css': `${paletteCss(palette)}
:root[data-theme="dark"]{${darkTokenBlock(palette)}}
:root[data-theme="light"]{${lightTokenBlock(palette)}}
:root[data-theme="dark"]{color-scheme:dark}
:root[data-theme="light"]{color-scheme:light}`,
            'src/styles/base.css': fileBaseCss(),
        };
        // Only the components this KIND actually uses are written — a
        // restaurant carries Menu.jsx, a store carries Pricing.jsx, and no
        // project ships dead files.
        for (const c of ['Navbar', ...sections, 'Footer']) {
            const tpl = componentTemplates[c];
            if (tpl) files[`src/components/${c}.jsx`] = tpl();
        }
        // Menu/Products import OrderButton statically — ship it with them.
        // An unlinked app never renders it (ordersApi is ''), and the
        // bundler keeps the build green either way.
        if (sections.includes('Menu') || sections.includes('Products')) {
            files['src/components/OrderButton.jsx'] = fileOrderButtonJsx();
        }
        // The multi-page app swaps in a Navbar of real page Links.
        if (multiPage) files['src/components/Navbar.jsx'] = fileMultiPageNavbarJsx();
        for (const [rel, body] of Object.entries(files)) {
            fs.writeFileSync(path.join(proj, rel), body, 'utf-8');
        }
        term(`react_project: scaffolded ${Object.keys(files).length} files in ${proj}`);

        // ── prove it compiles: npm install + vite build, streamed live ──────
        let installed = false, built = false, npmMissing = false;
        if (!input?.skipInstall) {
            // Through the Single Execution Authority — a direct spawn here
            // BLOCKED STARTUP on the user's machine (ExecutionEnforcer).
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            const run = async (cmd: string, args: string[], timeoutMs: number): Promise<number> => {
                const h = executionEngine.runArgvStreaming(cmd, args, {
                    cwd: proj, timeout: timeoutMs, shell: process.platform === 'win32',
                    env: { NO_COLOR: '1' },
                    onLine: (l: string) => term(`  ${l.slice(0, 200)}`),
                });
                const r = await h.done;
                if (r.exitCode === null) return -1;                       // could not start (npm missing)
                if (r.exitCode === 124 && r.error === 'timeout') return -2;
                return r.exitCode;
            };
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '📦 أثبّت الحزم (npm install)…' : '📦 Installing packages (npm install)…');
            const inst = await run('npm', ['install', '--no-audit', '--no-fund'], 240_000);
            npmMissing = inst === -1;
            installed = inst === 0;
            term(`npm install → ${installed ? 'OK' : `exit ${inst}`}`);
            if (installed) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🏗️ أبني نسخة الإنتاج (vite build)…' : '🏗️ Building for production (vite build)…');
                const b = await run('npm', ['run', 'build'], 180_000);
                built = b === 0 && fs.existsSync(path.join(proj, 'dist', 'index.html'));
                term(`vite build → ${built ? 'OK (dist/index.html)' : `exit ${b}`}`);
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
        };
        persistJoeProjects();

        // The freshly built app opens in the preview panel on its own — the
        // same moment a page build does, through the live /project-preview
        // route that serves this session's dist.
        let previewUrl = '';
        if (built) {
            previewUrl = `http://localhost:${process.env.PORT || '5002'}/project-preview/${sessionKey}/index.html?v=${Date.now()}`;
            try { broadcast({ type: 'preview_ready', sessionId, data: { url: previewUrl, previewUrl, sessionId } } as any); } catch { /* UI optional */ }
        }

        const fileList = Object.keys(files).map(f => `  • ${f}`).join('\n');
        const message = isAr
            ? `⚛️ ${built ? 'بُني مشروع React كاملاً وتُحقق من تجميعه' : installed ? 'أُنشئ مشروع React وثُبتت حزمه' : 'أُنشئ مشروع React كاملاً'} — «${content.brand}».

📂 المسار: ${proj}
${fileList}

${built ? '✅ npm install + vite build نجحا — نسخة الإنتاج جاهزة في dist/ والمعاينة الحية فُتحت تلقائياً.' : npmMissing ? '⚠️ npm غير متاح هنا — المشروع جاهز، ثبّته بنفسك: npm install ثم npm run dev.' : installed ? '✅ الحزم مثبتة.' : input?.skipInstall ? 'ℹ️ تخطيت التثبيت كما طُلب.' : '⚠️ التثبيت لم يكتمل — جرّب: npm install داخل المجلد.'}

🧭 خطوات تالية — أرسل أيّ سطر كما هو:
   • «عدّل المحتوى: …» → تعديل جراحي متحقق بالبناء (والمعاينة تتحدث فوراً)
   • «ضف صورة لطبق …» / «غيّر صورة الواجهة إلى …» / «احذف صورة …» → صور حقيقية مرخّصة
   • «تراجع» → استرجاع آخر تعديل بايتاً ببايت
   • «شغّل خادم التطوير» → معاينة تطوير بتحديث حي
   • «انشر المشروع» → نسخة الإنتاج بصورها على رابط دائم`
            : `⚛️ ${built ? 'A full React project, scaffolded AND verified to compile' : 'A full React project scaffolded'} — "${content.brand}".

📂 Path: ${proj}
${fileList}

${built ? '✅ npm install + vite build succeeded — the production build is in dist/.' : npmMissing ? '⚠️ npm is not available here — run npm install && npm run dev yourself.' : ''}`;

        return {
            ok: true,
            output: { message, path: proj, dir: dirName, installed, built, files: Object.keys(files) },
            logs,
        } as any;
    }
}
