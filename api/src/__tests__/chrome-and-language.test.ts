/**
 * The header, and the language the page is written in.
 *
 * Both come from the same shipped build. The user wrote entirely in Arabic; the
 * page came back marked dir="rtl" and filled with English —
 * "Transform Your Business with Xelite Solutions", "Sign up", "Get Started" —
 * and its header used `.site-header`, `.nav-links` and `.cta-button`, none of
 * which existed in the stylesheet. So the first thing on the page had no
 * background, no sticky behaviour, no mobile menu and no dropdown.
 *
 * The report also said «الزر المطلوب «تسجيل الخروج» غير موجود في الصفحة» and
 * "2 روابط لا تؤدي إلى أي مكان", and then shipped both.
 */

import {
    visibleText, scriptMix, wrongLanguage, languageRetryNote, isolateLatinRuns, bidiCss,
} from '../core/design/language';
import {
    chromeBrief, chromeCss, chromeRuntime, authCss, authRuntime,
    ensureHeaderControls, wireAuthControls, repairDeadAnchors,
} from '../core/design/chrome';
import { uiKitCss } from '../core/design/design-system';

describe('a section that came back in the wrong language is detected', () => {
    const englishSection = `<section class="section" id="hero"><div class="wrap">
<h1>Transform Your Business with Xelite Solutions</h1>
<p class="lede">We provide top-notch consulting services to help your company overcome
obstacles and achieve success in a competitive market.</p>
<a class="btn" href="#contact">Get Started</a></div></section>`;

    const arabicSection = `<section class="section" id="hero"><div class="wrap">
<h1>نطوّر أعمالك مع إكس إيليت</h1>
<p class="lede">نقدّم استشارات برمجية وإدارية تساعد شركتك على تجاوز العقبات والنمو
في سوق شديد المنافسة، بخبرة عملية لا بنصائح عامة.</p>
<a class="btn" href="#contact">ابدأ الآن</a></div></section>`;

    it('catches the exact section that shipped', () => {
        const got = wrongLanguage(englishSection, true);
        expect(got.wrong).toBe(true);
        expect(got.reason).toMatch(/came back in English/);
    });

    it('passes a section that is genuinely Arabic', () => {
        expect(wrongLanguage(arabicSection, true).wrong).toBe(false);
    });

    it('does not count class names, ids and hrefs as English prose', () => {
        // Every Arabic page is full of Latin markup. Counting it would fail
        // every page ever built.
        const text = visibleText(arabicSection);
        expect(text).not.toMatch(/section|wrap|lede|contact|href|class/);
        expect(text).toContain('نطوّر أعمالك');
    });

    it('does not count script or style contents', () => {
        const withCode = `<section id="s"><div class="wrap"><h2>الأسعار</h2>
<p>باقاتنا تناسب الشركات الناشئة والمؤسسات الكبيرة على حدّ سواء، بلا رسوم خفيّة.</p>
<style>.card{background:var(--surface);color:var(--text)}</style>
<script>var cards = document.querySelectorAll('.card'); cards.forEach(function(c){});</script>
</div></section>`;
        expect(wrongLanguage(withCode, true).wrong).toBe(false);
    });

    it('tolerates a brand and technical names inside Arabic copy', () => {
        const mixed = `<section id="s"><div class="wrap"><h2>خدماتنا التقنية</h2>
<p>نبني الأنظمة باستخدام React و Node.js و PostgreSQL، ونتولّى نشرها على AWS،
مع متابعة تشغيلية كاملة بعد الإطلاق وتدريب فريقك على إدارتها بنفسه.</p></div></section>`;
        expect(wrongLanguage(mixed, true).wrong).toBe(false);
    });

    it('does not judge a fragment too short to judge', () => {
        // A three-word heading can legitimately be a product name.
        expect(wrongLanguage('<h2>Xelite Solutions</h2>', true).wrong).toBe(false);
    });

    it('catches the reverse case too', () => {
        expect(wrongLanguage(arabicSection, false).wrong).toBe(true);
    });

    it('measures the mix rather than guessing at it', () => {
        expect(scriptMix('مرحبا hello').arabic).toBe(5);
        expect(scriptMix('مرحبا hello').latin).toBe(5);
        expect(scriptMix('').arabicShare).toBe(0);
        expect(scriptMix('١٢٣ ٤٥٦').letters).toBe(0);
    });

    it('makes the retry instruction impossible to misread', () => {
        const note = languageRetryNote(true);
        expect(note).toMatch(/ARABIC/);
        expect(note).toMatch(/Button labels are NOT technical names/);
        // The polite version was already in the prompt and was ignored.
        expect(note).toMatch(/^STOP\./);
    });
});

describe('Latin inside Arabic prose is isolated so the punctuation stays put', () => {
    it('wraps a technical name in <bdi>', () => {
        const out = isolateLatinRuns('<p>نستخدم Node.js في الخادم.</p>');
        expect(out).toContain('<bdi>Node.js</bdi>');
    });

    it('never touches an attribute, a url or a class name', () => {
        const src = '<a class="btn ghost" href="/about-us" data-x="Sign in"><span>اقرأ المزيد</span></a>';
        expect(isolateLatinRuns(src)).toBe(src);
    });

    it('never touches the inside of a script or a style', () => {
        const src = `<div><p>مرحبا React</p><script>var Sign = 'in';</script><style>.a{color:red}</style></div>`;
        const out = isolateLatinRuns(src);
        expect(out).toContain('<bdi>React</bdi>');
        expect(out).toContain(`var Sign = 'in';`);
        expect(out).not.toMatch(/<script>[\s\S]*<bdi>/);
        expect(out).toContain('.a{color:red}');
    });

    it('leaves a code block alone, where the run is already isolated', () => {
        const src = '<p>اكتب <code>npm install</code> ثم اضغط Enter.</p>';
        const out = isolateLatinRuns(src);
        expect(out).toContain('<code>npm install</code>');
        expect(out).toContain('<bdi>Enter</bdi>');
    });

    it('leaves an all-English page untouched, because it has no direction change', () => {
        const src = '<p>We use Node.js on the server.</p>';
        expect(isolateLatinRuns(src)).toBe(src);
    });

    it('leaves a single letter alone', () => {
        expect(isolateLatinRuns('<p>الفئة A تناسب الشركات.</p>')).not.toContain('<bdi>');
    });

    it('is idempotent — running it twice does not nest', () => {
        const once = isolateLatinRuns('<p>نستخدم React اليوم.</p>');
        expect(isolateLatinRuns(once)).toBe(once);
    });

    it('ships the stylesheet half for whole elements', () => {
        const css = bidiCss();
        expect(css).toContain('bdi{unicode-bidi:isolate}');
        expect(css).toContain('[dir="rtl"] input[type="email"]');
        expect(css).toContain('font-variant-numeric:tabular-nums');
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });
});

describe('the header the stylesheet never had', () => {
    const css = chromeCss();

    it('styles every class name the brief asks for', () => {
        for (const cls of ['.site-header', '.header-inner', '.brand', '.site-nav',
            '.nav-links', '.nav-actions', '.nav-toggle', '.dropdown', '.has-menu']) {
            expect(css).toContain(cls);
        }
    });

    it('is sticky and separates from the content under it', () => {
        expect(css).toContain('.site-header{position:sticky');
        expect(css).toContain('.site-header[data-scrolled]');
    });

    it('hides the hamburger on desktop and the desktop nav on a phone', () => {
        expect(css).toContain('.nav-toggle{display:none');
        expect(css).toMatch(/@media \(max-width:880px\)\{[\s\S]*\.nav-toggle\{display:inline-flex\}/);
    });

    it('opens the drawer from the correct side in Arabic', () => {
        expect(css).toContain('[dir="rtl"] .site-nav{transform:translateX(-100%)}');
    });

    it('turns the dropdown into a disclosure on a phone, not a floating overlay', () => {
        // A 220px overlay anchored to a full-width row runs off a phone screen.
        expect(css).toMatch(/@media \(max-width:880px\)[\s\S]*\.dropdown\{position:static/);
    });

    it('drives the dropdown from aria-expanded, not from a class nobody can hear', () => {
        expect(css).toContain('.has-menu > [aria-expanded="true"] + .dropdown');
        expect(css).not.toMatch(/\.dropdown\.(is-)?open/);
    });

    it('uses logical properties, so nothing is mirrored by hand', () => {
        expect(css).toContain('inset-inline-start');
        expect(css).toContain('margin-inline-end:auto');
        expect(css).not.toMatch(/(margin|padding)-(left|right)\s*:/);
    });

    it('has balanced braces', () => {
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });

    it('honours reduced motion', () => {
        expect(css).toContain('@media (prefers-reduced-motion:reduce)');
    });
});

describe('the header behaves without the model writing any of it', () => {
    const rt = chromeRuntime(true);

    it('opens and closes the mobile drawer', () => {
        expect(rt).toContain("toggle.setAttribute('aria-expanded'");
        expect(rt).toContain("nav.setAttribute('data-open', '')");
    });

    it('stops the page scrolling behind an open drawer', () => {
        expect(rt).toContain("document.documentElement.style.overflow = open ? 'hidden' : ''");
    });

    it('closes the drawer when a link inside it is followed', () => {
        // Otherwise the destination is hidden behind the menu just used.
        expect(rt).toContain("a && nav.hasAttribute('data-open')");
    });

    it('traps tab inside the drawer and closes on Escape', () => {
        expect(rt).toContain("e.key === 'Escape'");
        expect(rt).toContain('e.shiftKey && document.activeElement === first');
    });

    it('closes a drawer left open when the window grows past the breakpoint', () => {
        expect(rt).toContain('window.innerWidth > 880');
    });

    it('makes the dropdown work from the keyboard, not only on hover', () => {
        expect(rt).toContain("btn.addEventListener('click'");
        expect(rt).toContain("e.key === 'ArrowDown'");
        expect(rt).toContain("window.matchMedia('(hover:hover)')");
    });

    it('marks the nav link for the section in view', () => {
        expect(rt).toContain('IntersectionObserver');
        expect(rt).toContain("setAttribute('aria-current', 'true')");
    });

    it('is self-contained: no dependency, no network', () => {
        expect(rt.startsWith('<script>')).toBe(true);
        expect(rt).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|\bimport\s|\brequire\s*\(/);
        expect(rt).not.toMatch(/https?:\/\//);
    });

    it('speaks the language of the page', () => {
        expect(rt).toContain('افتح القائمة');
        expect(chromeRuntime(false)).toContain('Open menu');
    });
});

describe('the markup contract handed to the model', () => {
    const brief = chromeBrief({ isArabic: true, withAuth: true });

    it('names the classes the stylesheet actually has', () => {
        for (const cls of ['site-header', 'header-inner', 'brand', 'nav-toggle', 'site-nav',
            'nav-links', 'has-menu', 'dropdown', 'nav-actions']) {
            expect(brief).toContain(cls);
        }
    });

    it('forbids the model writing the header JavaScript', () => {
        expect(brief).toMatch(/Do NOT write any JavaScript for the header/);
        expect(brief).toMatch(/do NOT invent class names/);
    });

    it('forbids href="#"', () => {
        expect(brief).toMatch(/Never href="#"/);
    });

    it('insists on keeping the hamburger', () => {
        expect(brief).toMatch(/Keep the \.nav-toggle button/);
    });
});

describe('a control the user asked for is added, not merely reported missing', () => {
    const header = `<header class="site-header" data-joe-header><div class="wrap header-inner">
<a class="brand" href="index.html">Xelite</a>
<nav class="site-nav" id="site-nav"><ul class="nav-links"><li><a href="#about">من نحن</a></li></ul>
<div class="nav-actions"><a class="btn btn-ghost" href="#login">تسجيل الدخول</a></div></nav>
</div></header><main><section id="about"><h2>من نحن</h2></section></main>`;

    it('adds the logout button the shipped page was missing', () => {
        // The build reported «الزر المطلوب «تسجيل الخروج» غير موجود» and shipped.
        const got = ensureHeaderControls(header, { wanted: ['تسجيل الخروج'], isArabic: true });
        expect(got.added).toEqual(['تسجيل الخروج']);
        expect(got.html).toContain('تسجيل الخروج');
        expect(got.html).toMatch(/nav-actions[\s\S]*تسجيل الخروج/);
    });

    it('does not add one that is already there under another wording', () => {
        const got = ensureHeaderControls(header, { wanted: ['تسجيل الدخول'], isArabic: true });
        expect(got.added).toEqual([]);
        expect(got.html).toBe(header);
    });

    it('adds nothing when nothing was asked for', () => {
        expect(ensureHeaderControls(header, { wanted: [], isArabic: true }).html).toBe(header);
    });

    it('leaves a page with no header untouched rather than inventing one', () => {
        const bare = '<main><section id="a"><h1>x</h1></section></main>';
        const got = ensureHeaderControls(bare, { wanted: ['تسجيل الخروج'], isArabic: true });
        expect(got.html).toBe(bare);
        expect(got.added).toEqual([]);
    });
});

describe('a link that goes nowhere is repaired or stops pretending to be a link', () => {
    const page = `<main><section id="pricing"><h2>الأسعار</h2></section>
<section id="contact"><h2>اتصل بنا</h2></section>
<footer><ul><li><a href="#">الأسعار</a></li><li><a href="#">Terms of Service</a></li>
<li><a href="#contact">اتصل بنا</a></li></ul></footer></main>`;

    it('points a dead link at the section its own text names', () => {
        const got = repairDeadAnchors(page, { isArabic: true });
        expect(got.html).toContain('<a href="#pricing">الأسعار</a>');
    });

    it('turns a link with no destination into plain text rather than inventing one', () => {
        const got = repairDeadAnchors(page, { isArabic: true });
        expect(got.html).toContain('<span>Terms of Service</span>');
        expect(got.html).not.toMatch(/href="#"/);
    });

    it('counts what it changed', () => {
        expect(repairDeadAnchors(page, { isArabic: true }).fixed).toBe(2);
    });

    it('leaves a working link exactly as it was', () => {
        const got = repairDeadAnchors(page, { isArabic: true });
        expect(got.html).toContain('<a href="#contact">اتصل بنا</a>');
    });

    it('does nothing to a page whose links all land somewhere', () => {
        const clean = '<main id="top"><a href="/about">About</a><a href="#top">Top</a></main>';
        const got = repairDeadAnchors(clean, { isArabic: false });
        expect(got.html).toBe(clean);
        expect(got.fixed).toBe(0);
    });

    it('treats #anchor-that-does-not-exist as dead, because it is', () => {
        // Joe was inserting `<a href="#login">` for the login button the user
        // asked for, and nothing on the page carried that id. Measured in a
        // browser: three of them, all reported as controls that do nothing. A
        // dead link that looks deliberate is still a dead link.
        const page = '<main><section id="contact"><h2>اتصل بنا</h2></section>'
            + '<a href="#login">تسجيل الدخول</a><a href="#contact">اتصل بنا</a></main>';
        const got = repairDeadAnchors(page, { isArabic: true });

        expect(got.html).not.toContain('href="#login"');
        expect(got.fixed).toBe(1);
        // The one that lands is untouched.
        expect(got.html).toContain('<a href="#contact">اتصل بنا</a>');
    });

    it('keeps an off-page link alone — it is not this page\'s business', () => {
        const page = '<main><a href="/login">Sign in</a><a href="https://x.test/a">External</a></main>';
        expect(repairDeadAnchors(page).html).toBe(page);
    });
});

describe('the four defects a real browser found that reading the code did not', () => {
    const css = chromeCss();
    const rt = chromeRuntime(true);

    it('selects a dropdown trigger by position, not by an attribute it may not have', () => {
        // `.has-menu > [aria-expanded]` only matched a trigger the model had
        // already written the attribute onto. Measured: aria-expanded read null
        // and the panel never opened, on desktop or in the drawer.
        expect(rt).toContain('.has-menu > button, .has-menu > .nav-link, .has-menu > [aria-expanded]');
        expect(rt).not.toContain("querySelectorAll('.has-menu > [aria-expanded]')");
    });

    it('does not let hover and click close what the other just opened', () => {
        // Pointing at the trigger opened the menu; the click that followed read
        // "already open" and closed it, so a desktop click never worked.
        expect(rt).toContain('var hoverOpened = false;');
        expect(rt).toContain("(open && !hoverOpened) ? 'false' : 'true'");
    });

    it('takes the closed drawer out of the layout and the tab order', () => {
        // Transform alone left 320px of horizontal scroll on a 390px phone, and
        // every link in the closed menu still focusable.
        expect(css).toMatch(/\.site-nav\{[^}]*visibility:hidden/);
        expect(css).toContain('.site-nav[data-open]{transform:none;visibility:visible}');
        expect(css).toMatch(/@media \(max-width:880px\)\{[\s\S]*html\{overflow-x:clip\}/);
        // clip, not hidden: hidden on the root breaks the sticky header above.
        expect(css).not.toMatch(/html\{overflow-x:hidden\}/);
    });

    it('keeps the close button above the drawer it closes', () => {
        // The drawer is a CHILD of the header, so inside the header's stacking
        // context its z-index of 45 painted over the toggle. With the menu open
        // there was no way to close it by tapping.
        expect(css).toMatch(/\.nav-toggle\{[^}]*position:relative;z-index:46/);
        const drawerZ = Number((css.match(/\.site-nav\{[^}]*z-index:(\d+)/) || [])[1]);
        const toggleZ = Number((css.match(/\.nav-toggle\{[^}]*z-index:(\d+)/) || [])[1]);
        expect(toggleZ).toBeGreaterThan(drawerZ);
    });
});

describe('a secondary button must not render as a second primary one', () => {
    it('matches the specificity of the filled rule it overrides', () => {
        // The filled rule is written `a.btn` (0,1,1); a bare `.btn-ghost` is
        // (0,1,0) and lost every time — so EVERY secondary button on every page
        // Joe ever built rendered solid. Seen in a screenshot: "تسجيل الدخول"
        // and "ابدأ الآن" side by side as two identical filled buttons.
        const kit = uiKitCss();
        expect(kit).toContain('a.btn-ghost');
        expect(kit).toContain('button.btn-ghost');
        expect(kit).toContain('.btn.btn-ghost');
        // The losing selector must not be the only one.
        expect(kit).not.toMatch(/(^|\n)\.btn-ghost,button\.ghost,a\.ghost\{/);
    });

    it('drops the filled button\'s shadow too, or the outline still reads as raised', () => {
        expect(uiKitCss()).toMatch(/a\.btn-ghost[^{]*\{[^}]*box-shadow:none/);
    });
});

describe('the sign-in panel — a control that works and tells the truth', () => {
    const rt = authRuntime(true);
    const css = authCss();

    it('never claims a sign-in succeeded, because there is no server', () => {
        // The alternative — flashing "welcome back" — is the exact kind of
        // simulated behaviour this codebase refuses everywhere else.
        expect(rt).toContain('T.noBackend');
        expect(rt).toMatch(/لا يوجد خادم حسابات موصول/);
        expect(authRuntime(false)).toMatch(/No account service is connected/);
        expect(rt).not.toMatch(/مرحبا بعودتك|welcome back|تم تسجيل الدخول بنجاح/i);
    });

    it('says what to change to make it real', () => {
        expect(rt).toMatch(/api\/login/);
    });

    it('validates for real rather than accepting anything', () => {
        expect(rt).toContain('el.checkValidity()');
        expect(rt).toContain("setAttribute('aria-invalid'");
        // novalidate hands the reporting to us; the constraints are unchanged.
        expect(rt).toContain('novalidate');
        expect(rt).toContain('type="email" required');
        expect(rt).toContain('minlength="6"');
    });

    it('shows only the button that makes sense right now', () => {
        expect(rt).toContain('function reflect()');
        expect(rt).toContain(`querySelectorAll('[data-auth="login"]')`);
        expect(rt).toContain(`querySelectorAll('[data-auth="logout"]')`);
    });

    it('sends nothing anywhere', () => {
        expect(rt.startsWith('<script>')).toBe(true);
        expect(rt).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
        expect(rt).not.toMatch(/https?:\/\//);
    });

    it('is a real dialog a keyboard can leave', () => {
        expect(rt).toContain(`role="dialog"`);
        expect(rt).toContain('aria-modal="true"');
        expect(rt).toContain("e.key === 'Escape'");
    });

    it('has balanced braces in its stylesheet', () => {
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });
});

describe('the hidden attribute actually hides', () => {
    it('is forced in the kit, because a class beats the user-agent rule', () => {
        // `.btn{display:inline-flex}` out-specifies the UA's `[hidden]`, so every
        // button the runtime hid stayed visible. Measured in a browser: the
        // sign-out button showed before anyone had signed in, and sign-in stayed
        // visible after. Anything that hides by attribute depends on this line.
        expect(uiKitCss()).toContain('[hidden]{display:none!important}');
    });
});

describe('a sign-in link the model wrote is wired, not deleted', () => {
    it('turns an href="#login" anchor into the control that opens the panel', () => {
        const got = wireAuthControls('<nav><a class="btn btn-ghost" href="#login">تسجيل الدخول</a></nav>');
        expect(got.wired).toBe(1);
        expect(got.html).toContain('data-auth="login"');
        expect(got.html).toContain('<button type="button"');
        expect(got.html).toContain('class="btn btn-ghost"');
        expect(got.html).not.toContain('href="#login"');
    });

    it.each([
        ['تسجيل الخروج', 'logout'],
        ['Sign out', 'logout'],
        ['Log in', 'login'],
        ['دخول', 'login'],
    ])('recognises "%s" as %s', (label, action) => {
        const got = wireAuthControls(`<a href="#">${label}</a>`);
        expect(got.html).toContain(`data-auth="${action}"`);
    });

    it('leaves a link to a REAL login page alone — that is a deliberate choice', () => {
        const src = '<a class="btn" href="/login">تسجيل الدخول</a>';
        expect(wireAuthControls(src).html).toBe(src);
        const ext = '<a href="https://accounts.example.test/signin">Sign in</a>';
        expect(wireAuthControls(ext).html).toBe(ext);
    });

    it('leaves ordinary links alone', () => {
        const src = '<a href="#contact">اتصل بنا</a><a href="#">الأسعار</a>';
        expect(wireAuthControls(src).wired).toBe(0);
    });
});
