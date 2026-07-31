/**
 * The page's chrome: the header, the navigation, the dropdown, the mobile menu.
 *
 * The UI kit styled `nav a` and `button` and nothing else, so when a model wrote
 *
 *     <header class="site-header"><nav class="nav">
 *       <ul class="nav-links">…</ul>
 *       <button class="cta-button">تسجيل دخول</button>
 *     </nav></header>
 *
 * — which is what a model writes — NONE of those class names existed. The header
 * had no background, no sticky behaviour, no layout, no mobile menu and no
 * dropdown, on a page whose whole first impression is its header. The user's
 * words for it were "لم يستخدم التصاميم العالمية لأي موقع القوائم والأزرار
 * والقوائم المنسدلة".
 *
 * Two things follow. The class names a model reaches for are now real, so the
 * obvious markup produces a correct header. And the BEHAVIOUR — the hamburger,
 * the dropdown, the focus trap, the scroll state — ships as Joe's runtime, so it
 * cannot be half-written: a model that writes a hamburger button without the
 * script gets a working hamburger anyway.
 */

/** The markup contract handed to the model. */
export function chromeBrief(opts: { isArabic: boolean; pages?: string[]; withAuth?: boolean }): string {
    const { isArabic, pages = [], withAuth } = opts;
    const nav = pages.length ? pages : (isArabic
        ? ['الرئيسية', 'من نحن', 'خدماتنا', 'اتصل بنا']
        : ['Home', 'About', 'Services', 'Contact']);
    return `PAGE HEADER — use exactly this structure. The styling and ALL the behaviour
(sticky, scroll shadow, mobile drawer, dropdown, focus handling) are already shipped for
these class names. Do NOT write any JavaScript for the header, and do NOT invent class names:

<header class="site-header" data-joe-header>
  <div class="wrap header-inner">
    <a class="brand" href="index.html">BRAND NAME</a>
    <button class="nav-toggle" type="button" aria-label="${isArabic ? 'القائمة' : 'Menu'}"
            aria-expanded="false" aria-controls="site-nav">
      <svg class="icon"><use href="#i-menu"/></svg>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="${isArabic ? 'التنقل الرئيسي' : 'Main'}">
      <ul class="nav-links">
        <li><a href="#about">${nav[0]}</a></li>
        <li class="has-menu">
          <button type="button" class="nav-link" aria-expanded="false">${nav[1] || 'More'}
            <svg class="icon caret"><use href="#i-arrow"/></svg></button>
          <ul class="dropdown">
            <li><a href="#services">…</a></li>
            <li><a href="#pricing">…</a></li>
          </ul>
        </li>
      </ul>
      <div class="nav-actions">${withAuth ? `
        <a class="btn btn-ghost" href="#login" data-auth="login">${isArabic ? 'تسجيل الدخول' : 'Sign in'}</a>
        <a class="btn" href="#signup">${isArabic ? 'ابدأ الآن' : 'Get started'}</a>` : `
        <a class="btn" href="#contact">${isArabic ? 'تواصل معنا' : 'Contact us'}</a>`}
      </div>
    </nav>
  </div>
</header>

RULES:
- Every nav href must point at a section id that EXISTS on this page (#about, #services, …)
  or at a real page file. Never href="#" — a link that goes nowhere is a reported defect.
- A dropdown is a <ul class="dropdown"> inside <li class="has-menu">, opened by the <button>
  before it. Never a <div> that appears on hover only: it must work from the keyboard.
- Keep the .nav-toggle button even if you think the menu is short. It is hidden on desktop
  by the stylesheet and it is the only way into the menu on a phone.`;
}

/**
 * The header's stylesheet.
 *
 * Every class the brief names is here, plus the ones a model tends to invent for
 * the same job (`.nav`, `.cta-button`, `.nav-link`, `.site-header`), so the
 * common near-miss still lands on real styling instead of on nothing.
 */
export function chromeCss(): string {
    return `
/* ---------- site header ---------------------------------------------------- */
.site-header{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--surface) 88%,transparent);
  backdrop-filter:blur(12px) saturate(1.3);-webkit-backdrop-filter:blur(12px) saturate(1.3);
  border-bottom:1px solid transparent;transition:border-color .2s ease,box-shadow .2s ease,background-color .2s ease}
.site-header[data-scrolled]{border-bottom-color:var(--border);box-shadow:var(--shadow-sm);
  background:color-mix(in srgb,var(--surface) 96%,transparent)}
.header-inner{display:flex;align-items:center;gap:clamp(12px,2vw,28px);min-height:68px}
.brand{font-family:var(--font-display,inherit);font-weight:800;font-size:var(--step-1);
  letter-spacing:-.02em;color:var(--text);text-decoration:none;margin-inline-end:auto;white-space:nowrap}
.brand:hover{color:var(--brand)}

.site-nav{display:flex;align-items:center;gap:clamp(12px,2vw,28px);margin-inline-start:auto}
.nav-links{display:flex;align-items:center;gap:clamp(10px,1.6vw,26px);list-style:none;margin:0;padding:0}
.nav-links > li{position:relative}
.nav-links a,.nav-links .nav-link{display:inline-flex;align-items:center;gap:6px;
  background:none;border:0;padding:8px 2px;font:inherit;font-weight:600;color:var(--text);
  text-decoration:none;cursor:pointer;white-space:nowrap}
.nav-links a:hover,.nav-links .nav-link:hover{color:var(--brand)}
.nav-links a[aria-current],.nav-links a.active{color:var(--brand)}
.nav-actions{display:flex;align-items:center;gap:10px}
.nav-actions .btn{padding:9px 18px;font-size:var(--step--1)}

/* ---------- dropdown ------------------------------------------------------- */
.caret{width:.85em;height:.85em;transition:transform .2s ease}
.has-menu > [aria-expanded="true"] .caret{transform:rotate(90deg)}
.dropdown{position:absolute;inset-inline-start:0;top:calc(100% + 10px);min-width:220px;
  display:grid;gap:2px;padding:8px;margin:0;list-style:none;
  background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  box-shadow:var(--shadow-lg);opacity:0;visibility:hidden;transform:translateY(-6px);
  transition:opacity .18s ease,transform .18s ease,visibility .18s}
.has-menu > [aria-expanded="true"] + .dropdown{opacity:1;visibility:visible;transform:none}
.dropdown a{display:block;padding:10px 12px;border-radius:10px;font-weight:500;white-space:normal}
.dropdown a:hover,.dropdown a:focus-visible{background:var(--brand-light);color:var(--brand-dark)}

/* ---------- mobile ---------------------------------------------------------- */
/* z-index above the drawer, because the drawer is a CHILD of the header: inside
   the header's stacking context the drawer (45) painted over the toggle (auto),
   so with the menu open the button that closes it was underneath the menu and
   could not be tapped. Seen in a phone screenshot. The toggle now stays on top
   and doubles as the close button — its label already switches. */
.nav-toggle{display:none;position:relative;z-index:46;background:none;border:1px solid var(--border);
  color:var(--text);border-radius:12px;padding:9px;box-shadow:none}
.nav-toggle:hover{background:var(--brand-light);transform:none}
.nav-backdrop{position:fixed;inset:0;z-index:40;background:rgba(8,12,20,.45);
  opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s}
.nav-backdrop[data-open]{opacity:1;visibility:visible}

@media (max-width:880px){
  /* A fixed drawer parked off the inline edge still creates scrollable overflow
     of the viewport — measured at 320px of sideways drag on a 390px phone, into
     empty space. overflow-x:clip removes it without the side effects of
     overflow-x:hidden, which would break the sticky header above. */
  html{overflow-x:clip}
  .nav-toggle{display:inline-flex}
  /* visibility:hidden, not transform alone. A fixed drawer translated off the
     edge still occupies layout for the scroll container: measured in a browser,
     the closed drawer added 320px of horizontal scroll to a 390px phone, so the
     whole page could be dragged sideways into empty space. It also left every
     link inside the closed menu in the tab order, where focus lands on things
     nobody can see. visibility fixes both, and still animates because it is
     transitioned alongside the transform rather than switched instantly. */
  .site-nav{position:fixed;z-index:45;top:0;inset-inline-end:0;height:100dvh;width:min(84vw,340px);
    flex-direction:column;align-items:stretch;justify-content:flex-start;gap:6px;
    padding:84px 22px 28px;overflow-y:auto;
    background:var(--surface);border-inline-start:1px solid var(--border);box-shadow:var(--shadow-lg);
    visibility:hidden;
    transform:translateX(100%);transition:transform .26s cubic-bezier(.2,.8,.3,1),visibility .26s;margin:0}
  [dir="rtl"] .site-nav{transform:translateX(-100%)}
  .site-nav[data-open]{transform:none;visibility:visible}
  .nav-links{flex-direction:column;align-items:stretch;gap:2px}
  .nav-links a,.nav-links .nav-link{padding:13px 10px;border-radius:12px;width:100%;justify-content:space-between}
  .nav-links a:hover,.nav-links .nav-link:hover{background:var(--brand-light)}
  /* On a phone the dropdown is a disclosure in the flow, not an overlay. */
  .dropdown{position:static;opacity:1;visibility:visible;transform:none;box-shadow:none;
    border:0;border-inline-start:2px solid var(--border);border-radius:0;
    margin-inline-start:10px;padding:0 0 0 6px;display:none}
  .has-menu > [aria-expanded="true"] + .dropdown{display:grid}
  .nav-actions{flex-direction:column;align-items:stretch;margin-top:14px}
  .nav-actions .btn{width:100%;padding:13px 18px}
}
@media (prefers-reduced-motion:reduce){
  .site-nav,.dropdown,.nav-backdrop{transition:none}
}
`.trim();
}

/**
 * The header's behaviour.
 *
 * Shipped by Joe rather than requested from the model, for the usual reason: a
 * model writes the hamburger BUTTON reliably and the code behind it about half
 * the time, and a menu that cannot be opened on a phone is not a small defect.
 *
 * Everything here is driven off the accessible attribute — `aria-expanded`,
 * `aria-current` — so the state a screen reader announces and the state the eye
 * sees are the same value, and neither can drift from the other.
 */
export function chromeRuntime(isArabic: boolean): string {
    const T = isArabic
        ? { open: 'افتح القائمة', close: 'أغلق القائمة' }
        : { open: 'Open menu', close: 'Close menu' };
    return `<script>
/* Joe page chrome — sticky state, mobile drawer, keyboard-operable dropdowns. */
(function () {
  'use strict';
  var T = ${JSON.stringify(T)};
  var header = document.querySelector('[data-joe-header], .site-header, header');
  if (!header) return;

  /* A sticky header reads as flat until it separates from the content under it. */
  var onScroll = function () {
    if (window.scrollY > 8) header.setAttribute('data-scrolled', '');
    else header.removeAttribute('data-scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- mobile drawer ------------------------------------------------ */
  var toggle = header.querySelector('.nav-toggle, [aria-controls][aria-expanded]');
  var nav = header.querySelector('.site-nav, nav');
  var backdrop = null;
  var lastFocus = null;

  function focusables() {
    return nav ? [].slice.call(nav.querySelectorAll('a[href],button:not([disabled]),input,select,textarea'))
      .filter(function (el) { return el.offsetParent !== null; }) : [];
  }

  function setOpen(open) {
    if (!nav || !toggle) return;
    if (open) { nav.setAttribute('data-open', ''); } else { nav.removeAttribute('data-open'); }
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? T.close : T.open);
    /* The page behind an open drawer must not scroll; a phone otherwise
       scrolls the document while the menu sits still on top of it. */
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) {
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'nav-backdrop';
        backdrop.addEventListener('click', function () { setOpen(false); });
        document.body.appendChild(backdrop);
      }
      backdrop.setAttribute('data-open', '');
      lastFocus = document.activeElement;
      var f = focusables();
      if (f.length) f[0].focus();
    } else {
      if (backdrop) backdrop.removeAttribute('data-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
  }

  if (toggle && nav) {
    toggle.setAttribute('aria-label', T.open);
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    /* Following a link inside the drawer must close it, or the destination is
       hidden behind the menu the visitor just used. */
    nav.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (a && nav.hasAttribute('data-open')) setOpen(false);
    });
    /* Trap the tab key while the drawer is open — otherwise focus walks into
       the page behind it, where nothing is visible. */
    document.addEventListener('keydown', function (e) {
      if (!nav.hasAttribute('data-open')) return;
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    /* Resizing past the breakpoint leaves a drawer open over a desktop layout. */
    window.addEventListener('resize', function () {
      if (window.innerWidth > 880 && nav.hasAttribute('data-open')) setOpen(false);
    });
  }

  /* ---------- dropdowns ---------------------------------------------------- */
  /* Selected by POSITION, not by aria-expanded. Requiring the attribute to be
     present meant the dropdown only worked if the model had already written
     aria-expanded="false" on the trigger — and when it does not, which is most
     of the time, querySelectorAll matched nothing and the menu was dead. Proven
     in a browser: the trigger's aria-expanded read null and the panel never
     opened, on desktop or in the drawer. The runtime sets the attribute itself
     below, so the CSS that keys off it works either way. */
  var menus = [].slice.call(header.querySelectorAll('.has-menu > button, .has-menu > .nav-link, .has-menu > [aria-expanded]'));
  function closeMenus(except) {
    menus.forEach(function (b) { if (b !== except) b.setAttribute('aria-expanded', 'false'); });
  }
  menus.forEach(function (btn) {
    btn.setAttribute('aria-expanded', 'false');
    if (btn.tagName === 'BUTTON' && !btn.type) btn.type = 'button';
    /* hoverOpened exists because hover and click were fighting each other.
       Pointing at the trigger opened the menu; the click that followed then read
       "already open" and closed it again, so on a desktop the dropdown could not
       be opened by clicking at all — the aria-expanded went true then false
       within the same gesture. Measured in a browser, not reasoned about. A
       click that lands on a menu hover has just opened keeps it open. */
    var hoverOpened = false;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var open = btn.getAttribute('aria-expanded') === 'true';
      closeMenus(btn);
      btn.setAttribute('aria-expanded', (open && !hoverOpened) ? 'false' : 'true');
      hoverOpened = false;
    });
    /* Hover opens it on a pointer device, which is what people expect — but the
       click handler above is what makes it work without one. */
    var li = btn.parentNode;
    if (li && window.matchMedia && window.matchMedia('(hover:hover)').matches) {
      li.addEventListener('mouseenter', function () {
        if (window.innerWidth <= 880) return;
        closeMenus(btn);
        if (btn.getAttribute('aria-expanded') !== 'true') hoverOpened = true;
        btn.setAttribute('aria-expanded', 'true');
      });
      li.addEventListener('mouseleave', function () {
        if (window.innerWidth <= 880) return;
        hoverOpened = false;
        btn.setAttribute('aria-expanded', 'false');
      });
    }
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        btn.setAttribute('aria-expanded', 'true');
        var first = li && li.querySelector('.dropdown a');
        if (first) first.focus();
      }
    });
  });
  document.addEventListener('click', function (e) {
    if (!header.contains(e.target)) closeMenus(null);
  });

  /* ---------- current section --------------------------------------------- */
  /* Marking the link for the section in view is the cue that tells a visitor
     where they are; every site has it and no model writes it. */
  var links = [].slice.call(header.querySelectorAll('a[href^="#"]'))
    .map(function (a) {
      var id = a.getAttribute('href').slice(1);
      return id ? { a: a, el: document.getElementById(id) } : null;
    })
    .filter(function (x) { return x && x.el; });
  if (links.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) {
          if (l.el === en.target) l.a.setAttribute('aria-current', 'true');
          else l.a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(function (l) { io.observe(l.el); });
  }
})();
</script>`;
}

/* ---------- the controls the user asked for ---------------------------------- */

interface ControlSpec {
    /** How the request names it. */
    ar: string;
    en: string;
    /** Recognises it in markup that already has it. */
    match: RegExp;
    href: string;
    /** A secondary control is quieter than the page's primary action. */
    ghost: boolean;
}

const AUTH_CONTROLS: ControlSpec[] = [
    { ar: 'تسجيل الدخول', en: 'Sign in', match: /(تسجيل\s*(ال)?دخول|دخول|log\s?in|sign\s?in)/i, href: '#login', ghost: true },
    { ar: 'تسجيل الخروج', en: 'Sign out', match: /(تسجيل\s*(ال)?خروج|خروج|log\s?out|sign\s?out)/i, href: '#logout', ghost: true },
    { ar: 'من نحن', en: 'About', match: /(من\s*نحن|عن\s*(الشركة|نا)|about)/i, href: '#about', ghost: true },
    { ar: 'اتصل بنا', en: 'Contact', match: /(ات[صّ]ل\s*بنا|تواصل\s*معنا|contact)/i, href: '#contact', ghost: false },
];

/**
 * Put a control the user explicitly asked for into the header.
 *
 * The content check already NOTICED it was missing — the shipped page carried
 * «الزر المطلوب «تسجيل الخروج» غير موجود في الصفحة» in its report, and shipped
 * without the button. Noticing is not fixing. Since Joe owns the header markup,
 * the control can simply be added, which needs no model call and cannot fail.
 *
 * Returns the html unchanged when the control is already there under any of its
 * usual names, or when there is no header to put it in.
 */
export function ensureHeaderControls(
    html: string,
    opts: { wanted: string[]; isArabic: boolean },
): { html: string; added: string[] } {
    let out = String(html || '');
    const added: string[] = [];
    const { wanted, isArabic } = opts;
    if (!wanted.length) return { html: out, added };

    // The insertion point: the actions group, or the nav, or the header itself.
    const anchor =
        out.match(/<div\b[^>]*class="[^"]*\bnav-actions\b[^"]*"[^>]*>/i)
        || out.match(/<nav\b[^>]*class="[^"]*\bsite-nav\b[^"]*"[^>]*>/i)
        || out.match(/<nav\b[^>]*>/i);
    if (!anchor) return { html: out, added };

    const clickables = out.match(/<(a|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi) || [];
    const visible = (frag: string) => frag.replace(/<[^>]+>/g, ' ');

    const toAdd: string[] = [];
    for (const name of wanted) {
        const spec = AUTH_CONTROLS.find(c => c.ar === name || c.en.toLowerCase() === name.toLowerCase());
        if (!spec) continue;
        if (clickables.some(c => spec.match.test(visible(c)))) continue;
        const label = isArabic ? spec.ar : spec.en;
        toAdd.push(`<a class="btn${spec.ghost ? ' btn-ghost' : ''}" href="${spec.href}">${label}</a>`);
        added.push(label);
    }
    if (!toAdd.length) return { html: out, added };

    out = out.replace(anchor[0], `${anchor[0]}\n      ${toAdd.join('\n      ')}`);
    return { html: out, added };
}

/**
 * Repair links that go nowhere.
 *
 * `href="#"` is the model's placeholder for "a link belongs here and I do not
 * know where it points". The browser audit reports each one as a dead anchor,
 * and the shipped page had two.
 *
 * Where the link's own text names a section that exists on the page, it is
 * pointed at it. Where nothing matches, the anchor becomes a <span> — a piece of
 * text that is honestly not a link is better than a link that lies.
 */
export function repairDeadAnchors(html: string, opts?: { isArabic?: boolean }): { html: string; fixed: number } {
    const src = String(html || '');
    void opts;

    /**
     * Each landable section, with the words a visitor would use for it.
     *
     * Matching the link's text against the section ID alone does not work on the
     * page this exists for: the ids are English (`#pricing`) and the link text is
     * Arabic («الأسعار»). The HEADING is what the two have in common, because the
     * heading is what the link is named after.
     */
    const targets: Array<{ id: string; words: string[] }> = [];
    for (const m of src.matchAll(/<(section|header|footer|article|div)\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,4000})/gi)) {
        const id = m[2];
        const heading = (m[3].match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]\s*>/i) || [, ''])[1]
            .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const words = [
            ...id.toLowerCase().split(/[-_]/).filter(w => w.length > 2),
            ...heading.toLowerCase().split(/\s+/).filter(w => w.length > 2),
        ];
        if (words.length) targets.push({ id, words });
    }

    let fixed = 0;
    const out = src.replace(/<a\b([^>]*?)href\s*=\s*["']#["']([^>]*)>([\s\S]*?)<\/a\s*>/gi,
        (whole, before: string, after: string, inner: string) => {
            const label = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            if (!label) return whole;
            const hit = targets.find(t => t.words.some(w => label.includes(w) || w.includes(label)));
            fixed++;
            const attrs = `${before}${after}`.replace(/\s+/g, ' ').trim();
            if (hit) return `<a ${attrs ? attrs + ' ' : ''}href="#${hit.id}">${inner}</a>`.replace(/<a\s+href/, '<a href');
            // No destination exists on this page. Do not invent one: text that
            // is honestly not a link beats a link that lies.
            return `<span${attrs ? ' ' + attrs : ''}>${inner}</span>`;
        });

    return { html: out, fixed };
}
