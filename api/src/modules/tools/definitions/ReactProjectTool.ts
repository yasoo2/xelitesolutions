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
import { spawn } from 'child_process';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { buildPalette, paletteCss, darkTokenBlock, lightTokenBlock } from '../../../core/design/design-system';
import { brandFrom } from '../../../core/design/page-head';
import { detectPageKind, type PageKind } from '../../../core/design/blueprints';
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
    menu: Array<{ name: string; desc: string; price: string }>;
    pricingTitle: string;
    tiers: Array<{ name: string; price: string; period: string; features: string[]; featured?: boolean }>;
    testimonialsTitle: string;
    testimonials: Array<{ name: string; role: string; quote: string }>;
    faqTitle: string;
    faq: Array<{ q: string; a: string }>;
    stats: Array<{ value: string; label: string }>;
}

/**
 * WHICH sections a kind of app carries — the same judgement the page
 * builder's blueprints encode, applied to the React component library. A
 * restaurant without its menu is a landing page wearing a restaurant's name.
 */
export function sectionsForKind(kind: PageKind): string[] {
    switch (kind) {
        case 'restaurant': return ['Hero', 'Menu', 'Testimonials', 'Contact'];
        case 'store': return ['Hero', 'Pricing', 'Testimonials', 'Faq', 'Contact'];
        case 'landing': return ['Hero', 'Features', 'Stats', 'Testimonials', 'Contact'];
        case 'portfolio': return ['Hero', 'Features', 'Stats', 'Contact'];
        case 'dashboard':
        case 'app': return ['Hero', 'Features', 'Stats', 'Faq', 'Contact'];
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
        pricingTitle: 'الباقات والأسعار',
        tiers: [
            { name: 'الأساسية', price: '49', period: 'ر.س/شهر', features: ['كل الأساسيات', 'دعم بالبريد', 'تحديثات مستمرة'] },
            { name: 'الاحترافية', price: '99', period: 'ر.س/شهر', features: ['كل ما في الأساسية', 'أولوية الدعم', 'تقارير متقدمة'], featured: true },
            { name: 'المؤسسات', price: '199', period: 'ر.س/شهر', features: ['كل ما في الاحترافية', 'مدير حساب', 'تخصيص كامل'] },
        ],
        testimonialsTitle: 'ماذا قالوا عنا',
        testimonials: [
            { name: 'سارة العتيبي', role: restaurant ? 'زبونة دائمة' : 'صاحبة مشروع', quote: restaurant ? 'أفضل نكهة جربتها — والخدمة أسرع مما توقعت.' : 'تجربة سلسة من أول ضغطة — أنصح به بلا تردد.' },
            { name: 'محمد الشهري', role: restaurant ? 'ناقد طعام' : 'مدير تسويق', quote: restaurant ? 'التفاصيل الصغيرة هنا تصنع الفرق، من التقديم إلى الطعم.' : 'رفع أداء فريقنا بشكل ملموس خلال أسابيع.' },
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
        pricingTitle: 'Plans & pricing',
        tiers: [
            { name: 'Basic', price: '19', period: '$/mo', features: ['All the essentials', 'Email support'] },
            { name: 'Pro', price: '49', period: '$/mo', features: ['Everything in Basic', 'Priority support'], featured: true },
            { name: 'Enterprise', price: '99', period: '$/mo', features: ['Everything in Pro', 'Account manager'] },
        ],
        testimonialsTitle: 'What people say',
        testimonials: [
            { name: 'Sarah M.', role: 'Founder', quote: 'Smooth from the first click — highly recommended.' },
            { name: 'Omar K.', role: 'Marketing lead', quote: 'Lifted our team\'s output within weeks.' },
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
${c.menu.map(m => `    { name: '${js(m.name)}', desc: '${js(m.desc)}', price: '${js(m.price)}' },`).join('\n')}
  ],
  pricingTitle: '${js(c.pricingTitle)}',
  tiers: [
${c.tiers.map(t => `    { name: '${js(t.name)}', price: '${js(t.price)}', period: '${js(t.period)}', featured: ${t.featured ? 'true' : 'false'}, features: [${t.features.map(f => `'${js(f)}'`).join(', ')}] },`).join('\n')}
  ],
  testimonialsTitle: '${js(c.testimonialsTitle)}',
  testimonials: [
${c.testimonials.map(t => `    { name: '${js(t.name)}', role: '${js(t.role)}', quote: '${js(t.quote)}' },`).join('\n')}
  ],
  faqTitle: '${js(c.faqTitle)}',
  faq: [
${c.faq.map(f => `    { q: '${js(f.q)}', a: '${js(f.a)}' },`).join('\n')}
  ],
  stats: [
${c.stats.map(s => `    { value: '${js(s.value)}', label: '${js(s.label)}' },`).join('\n')}
  ],
  // Joe's inbox — the previewed app really delivers its form; a published
  // copy cannot reach localhost, and the form says so honestly instead.
  inbox: '${js((c as any).inbox || '')}',
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
      <div className="wrap">
        <h1>{content.heroTitle}</h1>
        <p className="lede">{content.heroLede}</p>
        <a className="btn" href="#contact">{content.cta}</a>
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
    return `import React from 'react';

export default function Menu({ content }) {
  return (
    <section className="section" id="menu">
      <div className="wrap">
        <h2>{content.menuTitle}</h2>
        <ul className="menu-list">
          {content.menu.map((m) => (
            <li className="menu-item" key={m.name}>
              <div>
                <h3>{m.name}</h3>
                <p>{m.desc}</p>
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
              <figcaption><strong>{t.name}</strong> — {t.role}</figcaption>
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
.menu-price{color:var(--brand);white-space:nowrap;font-size:1.1rem}
.tier{display:flex;flex-direction:column;gap:10px}
.tier.featured{border-color:var(--brand);box-shadow:0 12px 34px -14px color-mix(in srgb,var(--brand) 45%,transparent)}
.tier-price{font-size:1.05rem}
.tier-price strong{font-size:2rem}
.tier ul{margin:0;padding-inline-start:20px;color:var(--text-muted)}
.tier .btn{margin-top:auto;align-self:flex-start}
.quote blockquote{margin:0 0 10px;font-size:1.05rem;line-height:1.8}
.quote figcaption{color:var(--text-muted)}
.faq-item{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:0 18px;margin-bottom:10px}
.faq-item summary{cursor:pointer;padding:14px 0;font-weight:700;min-height:44px;display:flex;align-items:center}
.faq-item p{color:var(--text-muted);padding-bottom:14px;margin:0}
.stats-band{background:linear-gradient(135deg,var(--brand),var(--brand-dark));color:var(--on-brand)}
.stats-row{display:flex;gap:34px;flex-wrap:wrap;justify-content:center;text-align:center}
.stat strong{display:block;font-size:2.2rem;line-height:1.1}
.stat span{opacity:.85}
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
        const sections = sectionsForKind(kind);
        const content = deriveContent(request, isAr, kind);
        const dirName = `react-${slug(content.brand)}`;
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

        const componentTemplates: Record<string, () => string> = {
            Navbar: fileNavbarJsx, Hero: fileHeroJsx, Features: fileFeaturesJsx,
            Menu: fileMenuJsx, Pricing: filePricingJsx, Testimonials: fileTestimonialsJsx,
            Faq: fileFaqJsx, Stats: fileStatsJsx, Contact: fileContactJsx, Footer: fileFooterJsx,
        };
        const files: Record<string, string> = {
            'package.json': filePackageJson(content.brand),
            'vite.config.js': fileViteConfig(),
            'index.html': fileIndexHtml(content),
            '.gitignore': 'node_modules\ndist\n',
            'src/main.jsx': fileMainJsx(),
            'src/App.jsx': fileAppJsx(sections),
            'src/content.js': fileContentJs(content),
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
        for (const [rel, body] of Object.entries(files)) {
            fs.writeFileSync(path.join(proj, rel), body, 'utf-8');
        }
        term(`react_project: scaffolded ${Object.keys(files).length} files in ${proj}`);

        // ── prove it compiles: npm install + vite build, streamed live ──────
        let installed = false, built = false, npmMissing = false;
        if (!input?.skipInstall) {
            const run = (cmd: string, args: string[], timeoutMs: number) => new Promise<number>((resolve) => {
                const child = spawn(cmd, args, { cwd: proj, shell: process.platform === 'win32', env: { ...process.env, NO_COLOR: '1' } });
                const t = setTimeout(() => { try { child.kill(); } catch { /* already gone */ } resolve(-2); }, timeoutMs);
                const feed = (b: Buffer) => String(b).split(/\r?\n/).filter(Boolean).forEach(l => term(`  ${l.slice(0, 200)}`));
                child.stdout?.on('data', feed);
                child.stderr?.on('data', feed);
                child.on('error', () => { clearTimeout(t); resolve(-1); });
                child.on('close', (code) => { clearTimeout(t); resolve(code ?? -1); });
            });
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
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
        projects[sessionKey] = { dir: proj, type: 'react', brand: content.brand, updatedAt: Date.now(), lastRequest: request.slice(0, 80) };
        persistJoeProjects();

        const fileList = Object.keys(files).map(f => `  • ${f}`).join('\n');
        const message = isAr
            ? `⚛️ ${built ? 'بُني مشروع React كاملاً وتُحقق من تجميعه' : installed ? 'أُنشئ مشروع React وثُبتت حزمه' : 'أُنشئ مشروع React كاملاً'} — «${content.brand}».

📂 المسار: ${proj}
${fileList}

${built ? '✅ npm install + vite build نجحا — نسخة الإنتاج جاهزة في dist/.' : npmMissing ? '⚠️ npm غير متاح هنا — المشروع جاهز، ثبّته بنفسك: npm install ثم npm run dev.' : installed ? '✅ الحزم مثبتة.' : input?.skipInstall ? 'ℹ️ تخطيت التثبيت كما طُلب.' : '⚠️ التثبيت لم يكتمل — جرّب: npm install داخل المجلد.'}

🧭 خطوات تالية — أرسل أيّ سطر كما هو:
   • «شغّل خادم التطوير» → معاينة حية بتحديث فوري
   • «عدّل المحتوى: …» → أعدّل src/content.js (كل النصوص في ملف واحد)
   • «انشر المشروع» → نسخة الإنتاج على رابط دائم`
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
