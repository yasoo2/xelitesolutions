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

import { KNOWN_CONTROLS } from './content-contract';

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
  background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);
  box-shadow:var(--shadow-lg);opacity:0;visibility:hidden;transform:translateY(-6px);
  transition:opacity .18s ease,transform .18s ease,visibility .18s}
.has-menu > [aria-expanded="true"] + .dropdown{opacity:1;visibility:visible;transform:none}
.dropdown a{display:block;padding:10px 12px;border-radius:10px;font-weight:500;white-space:normal}
.dropdown a:hover,.dropdown a:focus-visible{background:var(--tint);color:var(--on-tint)}

/* ---------- mobile ---------------------------------------------------------- */
/* z-index above the drawer, because the drawer is a CHILD of the header: inside
   the header's stacking context the drawer (45) painted over the toggle (auto),
   so with the menu open the button that closes it was underneath the menu and
   could not be tapped. Seen in a phone screenshot. The toggle now stays on top
   and doubles as the close button — its label already switches. */
.nav-toggle{display:none;position:relative;z-index:46;background:none;border:1px solid var(--border);
  color:var(--text);border-radius:12px;padding:9px;box-shadow:none}
.nav-toggle:hover{background:var(--tint);color:var(--on-tint);transform:none}
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
  .nav-links a:hover,.nav-links .nav-link:hover{background:var(--tint);color:var(--on-tint)}
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

/**
 * The sign-in panel.
 *
 * The user asked for a login button and a logout button. Joe was inserting
 * `<a href="#login">` — and nothing on the page carried that id, so all three
 * copies were dead links, which is exactly what the browser press-test reported.
 *
 * A brochure page has no server to sign in to, and that is not a reason to ship
 * a button that does nothing. It is a reason to be honest about it: the panel
 * opens, the fields validate for real, and on submit it says plainly that no
 * account service is connected yet and what to change to connect one. That is
 * the same contract the contact form already keeps — a control that works and
 * tells the truth beats a control that pretends.
 *
 * Signed-in state is remembered in localStorage so "sign out" has something to
 * do, and the header swaps which button it shows. Nothing is sent anywhere.
 */
export function authCss(): string {
    return `
.joe-auth[hidden]{display:none}
.joe-auth{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px}
.joe-auth::before{content:"";position:absolute;inset:0;background:rgba(8,12,20,.5)}
.joe-auth-card{position:relative;width:min(100%,410px);background:var(--surface);color:var(--text);
  border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);
  padding:clamp(22px,3vw,32px)}
.joe-auth-card h2{margin:0 0 4px;font-size:var(--step-2)}
.joe-auth-card p.sub{margin:0 0 18px;color:var(--text-muted);font-size:var(--step--1)}
.joe-auth-card label{display:block;font-weight:600;font-size:var(--step--1);margin-bottom:6px}
.joe-auth-card .field{margin-bottom:14px}
.joe-auth-card .row-end{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
.joe-auth-close{position:absolute;inset-inline-end:12px;top:12px;background:none;border:0;
  font-size:26px;line-height:1;color:var(--text-muted);cursor:pointer;padding:2px 8px;box-shadow:none}
.joe-auth-close:hover{color:var(--text);transform:none}
.joe-auth-note{margin-top:16px;padding:12px 14px;border-radius:var(--radius);
  background:var(--tint);color:var(--on-tint);font-size:var(--step--1);line-height:1.6}
.joe-auth-note[hidden]{display:none}
`.trim();
}

export function authRuntime(isArabic: boolean): string {
    const T = isArabic ? {
        title: 'تسجيل الدخول', sub: 'أدخل بريدك وكلمة المرور.',
        email: 'البريد الإلكتروني', pass: 'كلمة المرور',
        submit: 'دخول', cancel: 'إلغاء', close: 'إغلاق',
        noBackend: 'لا يوجد خادم حسابات موصول بهذه الصفحة بعد، فلم تُرسَل بياناتك إلى أي جهة ولم يُنشأ أي حساب. اربط خدمة مصادقة (مثل مسار /api/login في خادمك) لتفعيل هذا الزر فعليًا.',
        signedIn: 'أنت مسجّل الدخول محليًا في هذا المتصفح فقط.',
        signedOut: 'تم تسجيل الخروج.',
    } : {
        title: 'Sign in', sub: 'Enter your email and password.',
        email: 'Email', pass: 'Password',
        submit: 'Sign in', cancel: 'Cancel', close: 'Close',
        noBackend: 'No account service is connected to this page yet, so nothing was sent anywhere and no account was created. Point this at a real endpoint (e.g. /api/login on your server) to make this button do something.',
        signedIn: 'You are signed in locally, in this browser only.',
        signedOut: 'Signed out.',
    };
    return `<script>
/* Joe sign-in — a real panel, real validation, and an honest ending. */
(function () {
  'use strict';
  var T = ${JSON.stringify(T)};
  var KEY = 'joe-signed-in';
  var panel = null;

  function build() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'joe-auth';
    panel.hidden = true;
    panel.innerHTML =
      '<div class="joe-auth-card" role="dialog" aria-modal="true" aria-labelledby="joe-auth-h">' +
        '<button type="button" class="joe-auth-close" aria-label="' + T.close + '">&times;</button>' +
        '<h2 id="joe-auth-h">' + T.title + '</h2>' +
        '<p class="sub">' + T.sub + '</p>' +
        '<form novalidate>' +
          '<div class="field"><label for="joe-auth-email">' + T.email + '</label>' +
            '<input id="joe-auth-email" name="email" type="email" required autocomplete="email"></div>' +
          '<div class="field"><label for="joe-auth-pass">' + T.pass + '</label>' +
            '<input id="joe-auth-pass" name="password" type="password" required minlength="6" autocomplete="current-password"></div>' +
          '<div class="row-end"><button type="button" class="btn btn-ghost" data-auth-cancel>' + T.cancel + '</button>' +
            '<button type="submit" class="btn">' + T.submit + '</button></div>' +
        '</form>' +
        '<p class="joe-auth-note" role="status" hidden></p>' +
      '</div>';
    document.body.appendChild(panel);

    var form = panel.querySelector('form');
    var note = panel.querySelector('.joe-auth-note');
    panel.querySelector('.joe-auth-close').addEventListener('click', close);
    panel.querySelector('[data-auth-cancel]').addEventListener('click', close);
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      /* Real validation. novalidate hands the reporting to us so the message is
         one a screen reader can reach, but checkValidity applies exactly the
         same constraints — nothing is loosened. */
      var bad = null;
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || typeof el.checkValidity !== 'function') return;
        var ok = el.checkValidity();
        el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok && !bad) bad = el;
      });
      if (bad) { bad.focus(); return; }
      /* There is no server. Say so, rather than flashing a fake success. */
      note.hidden = false;
      note.textContent = T.noBackend;
      try { localStorage.setItem(KEY, '1'); } catch (err) { }
      reflect();
    });
    return panel;
  }

  function open() {
    build();
    panel.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    var f = panel.querySelector('input');
    if (f) f.focus();
  }
  function close() {
    if (!panel) return;
    panel.hidden = true;
    document.documentElement.style.overflow = '';
  }
  function signedIn() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }

  /* Only one of the two buttons makes sense at a time. */
  function reflect() {
    var inNow = signedIn();
    Array.prototype.forEach.call(document.querySelectorAll('[data-auth="login"]'), function (b) { b.hidden = inNow; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-auth="logout"]'), function (b) { b.hidden = !inNow; });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-auth]') : null;
    if (!btn) return;
    e.preventDefault();
    var what = btn.getAttribute('data-auth');
    if (what === 'login') { open(); return; }
    if (what === 'logout') {
      try { localStorage.removeItem(KEY); } catch (err) { }
      reflect();
      var say = document.createElement('p');
      say.className = 'joe-auth-note';
      say.setAttribute('role', 'status');
      say.textContent = T.signedOut;
      say.style.position = 'fixed'; say.style.insetInlineEnd = '16px'; say.style.top = '80px'; say.style.zIndex = '90';
      document.body.appendChild(say);
      setTimeout(function () { say.remove(); }, 3000);
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reflect);
  else reflect();
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

/**
 * Derived from the ONE list in content-contract, not a second copy of it.
 *
 * There were two, with different patterns, and they disagreed: this file
 * accepted «تواصل معنا» as the contact control and therefore added nothing,
 * while the content check required «…بنا» and reported the button missing. Joe
 * told the user a control was missing from a page Joe had decided already had
 * it. Only the presentation — where it points, how loud it is — belongs here.
 */
const PRESENTATION: Record<string, { href: string; ghost: boolean }> = {
    'تسجيل الدخول': { href: '', ghost: true },     // opens the sign-in panel
    'تسجيل الخروج': { href: '', ghost: true },
    'من نحن': { href: '#about', ghost: true },
    'اتصل بنا': { href: '#contact', ghost: false },
};

const AUTH_CONTROLS: ControlSpec[] = KNOWN_CONTROLS
    .filter(c => PRESENTATION[c.ar])
    .map(c => ({ ar: c.ar, en: c.en, match: c.match, ...PRESENTATION[c.ar] }));

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
        const action = spec.ar === 'تسجيل الدخول' ? 'login' : spec.ar === 'تسجيل الخروج' ? 'logout' : '';
        toAdd.push(action
            ? `<button type="button" class="btn${spec.ghost ? ' btn-ghost' : ''}" data-auth="${action}">${label}</button>`
            : `<a class="btn${spec.ghost ? ' btn-ghost' : ''}" href="${spec.href}">${label}</a>`);
        added.push(label);
    }
    if (!toAdd.length) return { html: out, added };

    out = out.replace(anchor[0], `${anchor[0]}\n      ${toAdd.join('\n      ')}`);
    return { html: out, added };
}

/**
 * Wire up whatever the model called a sign-in or sign-out control.
 *
 * A model writes `<a class="btn" href="#login">تسجيل الدخول</a>`, which points
 * at nothing. The dead-anchor repair below would then demote it to a <span> —
 * technically honest, and it silently deletes the button the user asked for.
 *
 * Since Joe ships a real sign-in panel, the better answer is available: turn it
 * into the control that opens it. Runs BEFORE the dead-anchor repair so an auth
 * link is wired rather than demoted.
 */
export function wireAuthControls(html: string): { html: string; wired: number } {
    const LOGIN = /(تسجيل\s*(ال)?دخول|^\s*دخول\s*$|log\s?in|sign\s?in|signin)/i;
    const LOGOUT = /(تسجيل\s*(ال)?خروج|^\s*خروج\s*$|log\s?out|sign\s?out|signout)/i;
    let wired = 0;

    const out = String(html || '').replace(
        /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi,
        (whole, attrs: string, inner: string) => {
            const label = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            const href = (attrs.match(/href\s*=\s*["']([^"']*)["']/i) || [, ''])[1];
            // Only in-page or empty destinations. A link to a real /login page
            // is someone's deliberate choice and is left alone.
            if (href && !/^#/.test(href)) return whole;
            if (/data-auth\s*=/.test(attrs)) return whole;
            const action = LOGIN.test(label) || /#login/i.test(href) ? 'login'
                : LOGOUT.test(label) || /#logout/i.test(href) ? 'logout' : '';
            if (!action) return whole;
            wired++;
            const keep = attrs
                .replace(/\s*href\s*=\s*["'][^"']*["']/i, '')
                .replace(/\s+/g, ' ').trim();
            return `<button type="button" ${keep ? keep + ' ' : ''}data-auth="${action}">${inner}</button>`;
        },
    );
    return { html: out, wired };
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
    // The body is captured in a LOOKAHEAD so it is not consumed. With a normal
    // capture, matchAll resumes after each match's 4000-character window and
    // every id inside that window is skipped — measured, only the first few
    // sections of a nine-section page became targets, and `contact-section`
    // (the last one) was never seen. A «تواصل معنا» link that had a section to
    // land on was demoted to a <span> because the scan never offered it.
    for (const m of src.matchAll(/<(section|header|footer|article|div)\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>(?=([\s\S]{0,4000}))/gi)) {
        const id = m[2];
        const heading = (m[3].match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]\s*>/i) || [, ''])[1]
            .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const words = [
            ...id.toLowerCase().split(/[-_]/).filter(w => w.length > 2),
            ...heading.toLowerCase().split(/\s+/).filter(w => w.length > 2),
        ];
        if (words.length) targets.push({ id, words });
    }

    /**
     * Every id the document actually has. An anchor pointing at `#login` when
     * nothing on the page carries that id is exactly as dead as `href="#"` — it
     * just looks intentional. Measured end to end: three `href="#login"` links
     * and no `id="login"` anywhere, and the browser press-test reported all
     * three as controls that do nothing.
     */
    const existingIds = new Set([...src.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));

    let fixed = 0;
    let src2 = src.replace(/<a\b([^>]*?)href\s*=\s*["']#([A-Za-z][\w:.-]*)["']([^>]*)>/gi,
        (whole, before: string, id: string, after: string) => {
            if (existingIds.has(id)) return whole;
            // Rewriting it to "#" hands it to the repair below, which either
            // finds a real destination from the link's own text or demotes it.
            return `<a${before}href="#"${after}>`;
        });

    /**
     * What a nav label MEANS, so an Arabic label can find an English id.
     *
     * Section ids are English slugs from the blueprint — `contact-section`,
     * `about-us` — and the links a visitor reads are Arabic. Word-against-word
     * matching cannot bridge that, so «اتصل بنا» found nothing and this repair
     * DELETED the button the user had explicitly asked for. Joe's own content
     * check then reported it missing, on the page Joe had just removed it from.
     * Measured end to end: two requested controls, both gone.
     */
    const INTENTS: Array<[RegExp, RegExp]> = [
        [/ات[صّ]ل\s*بنا|تواصل\s*معنا|راسلنا|contact|reach\s*us|get\s*in\s*touch/i, /contact|reach|touch|enquir|inquir/i],
        [/من\s*نحن|عن\s*(نا|الشركة)|قصتنا|about|who\s*we/i, /about|who|story|team|company/i],
        [/خدمات|services|what\s*we\s*do/i, /service|offer|what-we|how-it/i],
        [/الأسعار|الاسعار|الباقات|الحزم|pricing|plans|packages/i, /pric|plan|package|tier/i],
        [/آراء|شهادات|testimonial|review/i, /testimonial|review|client|customer/i],
        [/الأسئلة|اسئلة|faq|questions/i, /faq|question/i],
        [/المدونة|أخبار|blog|news/i, /blog|news|article|post/i],
        [/المنتجات|المتجر|products|shop|store/i, /product|shop|store|catalog/i],
    ];

    /**
     * The Arabic definite article, normalised away for matching. «المشاريع»
     * and «مشاريعنا» share their root but not a substring, so the footer's
     * «المشاريع» was demoted to a <span> on a page whose top nav carried a
     * perfectly good «المشاريع» link three sections up.
     */
    const deArticle = (s: string) => s.replace(/(^|\s)ال(?=\S)/g, '$1');

    /**
     * Living twins: a dead link whose LABEL already appears on a working link
     * is not an unknown — it is the same button in a second place. Adopt the
     * working link's destination before ever considering a demotion.
     */
    const liveByLabel = new Map<string, string>();
    for (const m of src2.matchAll(/<a\b[^>]*?href\s*=\s*["']#([A-Za-z][\w:.-]*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
        if (!existingIds.has(m[1])) continue;
        const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!label) continue;
        if (!liveByLabel.has(label)) liveByLabel.set(label, m[1]);
        const bare = deArticle(label);
        if (bare !== label && !liveByLabel.has(bare)) liveByLabel.set(bare, m[1]);
    }

    const out = src2.replace(/<a\b([^>]*?)href\s*=\s*["']#["']([^>]*)>([\s\S]*?)<\/a\s*>/gi,
        (whole, before: string, after: string, inner: string) => {
            const raw = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            const label = raw.toLowerCase();
            if (!label) return whole;
            const bare = deArticle(label);
            let hit = targets.find(t => t.words.some(w => {
                const bw = deArticle(w);
                return label.includes(w) || w.includes(label) || bare.includes(bw) || bw.includes(bare);
            }));
            if (!hit) {
                const twin = liveByLabel.get(label) || liveByLabel.get(bare);
                if (twin) hit = { id: twin, words: [] };
            }
            if (!hit) {
                // Nothing matched literally — try what the label MEANS.
                const intent = INTENTS.find(([lab]) => lab.test(raw));
                if (intent) hit = targets.find(t => intent[1].test(t.id));
            }
            fixed++;
            const attrs = `${before}${after}`.replace(/\s+/g, ' ').trim();
            if (hit) return `<a ${attrs ? attrs + ' ' : ''}href="#${hit.id}">${inner}</a>`.replace(/<a\s+href/, '<a href');
            // No destination exists on this page. Do not invent one: text that
            // is honestly not a link beats a link that lies.
            return `<span${attrs ? ' ' + attrs : ''}>${inner}</span>`;
        });

    return { html: out, fixed };
}
