/**
 * The dark switch and the section reveal.
 *
 * Two properties matter more than the rest and both are asserted here:
 *
 *   1. The switch works in BOTH directions. A first draft of this module only
 *      emitted the dark tokens, which means a visitor on a dark-set laptop
 *      presses "light" and the media query keeps every dark value — the page
 *      stays dark and the button looks broken. Half a switch is not a switch.
 *   2. Reduced motion leaves content VISIBLE. A reveal that still moves, only
 *      faster, is not a concession; a reveal that never fires leaves the page
 *      blank, which is worse than any animation.
 */

import {
    themeCss, lightOverrideCss, revealCss, themeToggleHtml,
    themeRuntime, revealRuntime, ensureThemeToggle, hasToggleElement,
} from '../core/design/theme';
import {
    paletteForHue, darkTokenBlock, lightTokenBlock, paletteCss, contrastRatio, darkFirstCss,
} from '../core/design/design-system';

const P = paletteForHue(214);

describe('theme tokens', () => {
    it('mirrors the dark values onto the attribute, not just the media query', () => {
        const css = themeCss(darkTokenBlock(P));
        expect(css).toContain(':root[data-theme="dark"]');
        expect(css).toContain(P.darkBg);
        expect(css).toContain(P.darkText);
    });

    it('states the LIGHT values too, so the switch works in both directions', () => {
        const css = lightOverrideCss(lightTokenBlock(P));
        expect(css).toContain(':root[data-theme="light"]');
        expect(css).toContain(P.bg);
        expect(css).toContain(P.text);
        expect(css).toContain(P.border);
    });

    it('uses the same values the palette already emits — the two cannot drift', () => {
        // Every token the attribute path sets must be a token the media query
        // path sets, or a visitor gets one palette by choice and another by
        // system setting.
        const fromPalette = paletteCss(P);
        for (const decl of darkTokenBlock(P).split(';').map(x => x.trim()).filter(Boolean)) {
            expect(fromPalette).toContain(decl);
        }
    });

    it('every token the dark block overrides has a light counterpart', () => {
        const names = (block: string) => (block.match(/--[a-z-]+(?=\s*:)/g) || []).sort();
        expect(names(lightTokenBlock(P))).toEqual(names(darkTokenBlock(P)));
    });

    it('strips a :root wrapper if one is handed in', () => {
        expect(themeCss(':root{ --bg:#000; }')).toContain(':root[data-theme="dark"]{--bg:#000;}');
        expect(lightOverrideCss('')).toBe('');
    });
});

describe('reduced motion', () => {
    it('makes revealed sections visible rather than animating them faster', () => {
        const css = revealCss();
        const block = css.slice(css.indexOf('prefers-reduced-motion'));
        expect(block).toMatch(/\[data-reveal-section\]\{[^}]*opacity:1/);
        expect(block).toMatch(/\[data-reveal-section\]\{[^}]*transform:none/);
        expect(block).toMatch(/\[data-reveal-section\]\{[^}]*transition:none/);
    });

    it('the runtime refuses to hide anything when motion is refused', () => {
        const js = revealRuntime();
        // The bail-out must come BEFORE any code that sets the hiding attribute,
        // or a reduced-motion visitor gets a blank page for one frame.
        const bail = js.indexOf("prefers-reduced-motion: reduce');\n  if");
        const guard = js.indexOf('prefers-reduced-motion: reduce');
        const hide = js.indexOf("setAttribute('data-reveal-section'");
        expect(guard).toBeGreaterThan(-1);
        expect(hide).toBeGreaterThan(guard);
        expect(bail === -1 || bail < hide).toBe(true);
    });
});

describe('the reveal survives a scroll JUMP', () => {
    /**
     * The bug this guards: an IntersectionObserver only reports a change it
     * witnessed. Jump from the top of the page to the bottom — the End key, an
     * in-page anchor, a restored position, and Joe's own browser audit, which
     * does exactly this on every page it measures — and the sections the jump
     * flew past never intersected on any observed frame. They stay at opacity 0
     * for good. Invisible content is far worse than a missing animation.
     */
    it('measures position on scroll instead of trusting an observer', () => {
        const js = revealRuntime();
        expect(js).not.toContain('IntersectionObserver');
        expect(js).toContain('getBoundingClientRect');
        expect(js).toContain("addEventListener('scroll'");
    });

    it('reveals a section that is already ABOVE the viewport, not only inside it', () => {
        // A `top > 0 && top < h` test is the natural one to write and it is the
        // bug: after a jump the passed sections have a NEGATIVE top.
        const js = revealRuntime();
        expect(js).toMatch(/getBoundingClientRect\(\)\.top\s*<\s*h\s*\*/);
        expect(js).not.toMatch(/top\s*>\s*0\s*&&/);
    });

    it('stops listening once everything is revealed', () => {
        expect(revealRuntime()).toContain('removeEventListener');
    });

    it('re-measures after images land, which move everything below them', () => {
        expect(revealRuntime()).toContain("addEventListener('load'");
    });
});

describe('the toggle', () => {
    it('shows only the icon for the mode you would switch TO', () => {
        const css = themeCss(darkTokenBlock(P));
        expect(css).toContain('.theme-toggle .i-sun{display:none}');
        expect(css).toContain(':root[data-theme="dark"] .theme-toggle .i-moon{display:none}');
    });

    it('is a real button with a label in the page language', () => {
        const ar = themeToggleHtml(true);
        expect(ar).toContain('type="button"');
        expect(ar).toContain('aria-label="تبديل الوضع الداكن"');
        expect(themeToggleHtml(false)).toContain('aria-label="Toggle dark mode"');
        // Icon-only: the label is the only thing a screen reader has.
        expect(ar).toContain('aria-hidden="true"');
    });

    it('remembers the choice and follows the system until one is made', () => {
        const js = themeRuntime(true);
        expect(js).toContain('localStorage.setItem');
        expect(js).toContain('prefers-color-scheme: dark');
        // The system listener must be a no-op once a choice is stored.
        expect(js).toMatch(/if \(!stored\(\)\) apply\(e\.matches\)/);
    });

    it('survives localStorage being unavailable', () => {
        // Private mode and a file:// page with a strict policy both throw here,
        // and a throw at this point takes the whole script down with it.
        const js = themeRuntime(false);
        expect(js).toMatch(/try \{ return localStorage\.getItem\(KEY\); \} catch/);
        expect(js).toMatch(/try \{ localStorage\.setItem\(KEY[^)]*\); \} catch/);
    });

    it('keeps aria-pressed truthful', () => {
        expect(themeRuntime(false)).toContain("setAttribute('aria-pressed'");
    });
});

describe('ensureThemeToggle', () => {
    const header = '<header><div class="nav-actions"><a class="btn">دخول</a></div></header>';

    it('puts one into a header that has none', () => {
        const r = ensureThemeToggle(header, true);
        expect(r.added).toBe(true);
        expect(r.html).toContain('data-theme-toggle');
    });

    it('never adds a second one', () => {
        const once = ensureThemeToggle(header, true).html;
        const twice = ensureThemeToggle(once, true);
        expect(twice.added).toBe(false);
        expect(twice.html).toBe(once);
    });

    it('falls back to the nav when there is no actions container', () => {
        // This used to assert `added === false`, which is what the code did and
        // was the wrong thing to want: a restaurant page Joe built had exactly
        // this header and shipped with no dark-mode switch at all. Declining is
        // only right when there is nowhere sensible to put it.
        const r = ensureThemeToggle('<header><nav><a href="a.html">A</a></nav></header>', true);
        expect(r.added).toBe(true);
        expect(r.html).toMatch(/<nav[^>]*>\s*<button[^>]*data-theme-toggle/i);
    });

    it('declines when the page has no header and no nav at all', () => {
        const r = ensureThemeToggle('<main><p>نص</p></main>', true);
        expect(r.added).toBe(false);
    });
});

describe('the tinted surface is only ever safe as a PAIR', () => {
    /**
     * What this guards: seven rules across the kit painted
     * background:var(--brand-light) with color:var(--brand-dark). Both are
     * LIGHT-mode colours and neither was in the dark token block, so in dark
     * mode every dropdown row, nav hover, badge and pill was a near-white patch
     * on a near-black page. Flipping only the background — which darkFirstCss
     * used to do — is worse: a deep-blue on a dark tile is unreadable.
     */
    it('passes AA in both schemes, at every hue', () => {
        for (let hue = 0; hue < 360; hue += 7) {
            const p = paletteForHue(hue);
            expect(contrastRatio(p.onTint, p.tint)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(p.onDarkTint, p.darkTint)).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('the dark tint is actually dark and the light tint actually light', () => {
        const p = paletteForHue(214);
        // Against the scheme's own page background, a tint must read as a
        // surface — close to it — not as a block of the opposite scheme.
        expect(contrastRatio(p.tint, p.surface)).toBeLessThan(2);
        expect(contrastRatio(p.darkTint, p.darkSurface)).toBeLessThan(2);
    });

    it('ships in the light block, the dark block and the dark-first override', () => {
        const p = paletteForHue(300);
        for (const block of [lightTokenBlock(p), darkTokenBlock(p)]) {
            expect(block).toMatch(/--tint:/);
            expect(block).toMatch(/--on-tint:/);
        }
        expect(paletteCss(p)).toMatch(/--tint:/);
        // A dark-first page overrides the tokens outright; it must carry the
        // pair too or it inherits the light tint it just painted over.
        const df = darkFirstCss(p);
        expect(df).toContain(`--tint:${p.darkTint}`);
        expect(df).toContain(`--on-tint:${p.onDarkTint}`);
    });
});

describe('the toggle reaches a WHOLE page, not just a header fragment', () => {
    /**
     * This is the test that was missing, and its absence shipped a dead feature.
     *
     * Every case above handed `ensureThemeToggle` a bare header. A real page has
     * the RUNTIME in it by the time this runs — and the runtime contains
     * `querySelectorAll('[data-theme-toggle]')`. The duplicate guard was a plain
     * search for that attribute across the whole document, so it matched its own
     * selector string and declined every time. Measured on the pages Joe had
     * actually built: the stylesheet was there, the runtime was there, and every
     * site page carried an empty `<div class="nav-actions"></div>`.
     *
     * A fixture that does not look like the thing being fixed proves nothing.
     */
    const fullPage = (header: string) =>
        `<!DOCTYPE html><html lang="ar" dir="rtl"><head><style>.a{}</style></head>`
        + `<body>${header}<main><section><h1>عنوان</h1></section></main>`
        + `${themeRuntime(true)}${revealRuntime()}</body></html>`;

    it('adds the button even though the runtime mentions the selector', () => {
        const page = fullPage('<header><div class="nav-actions"><a class="btn">دخول</a></div></header>');
        expect(/<button[^>]*data-theme-toggle/i.test(page)).toBe(false);   // not there yet
        const r = ensureThemeToggle(page, true);
        expect(r.added).toBe(true);
        expect(r.html).toMatch(/<button[^>]*data-theme-toggle/i);
    });

    it('still adds only ONE when run twice', () => {
        const once = ensureThemeToggle(fullPage('<header><div class="nav-actions"></div></header>'), true).html;
        const twice = ensureThemeToggle(once, true);
        expect(twice.added).toBe(false);
        expect((twice.html.match(/<button[^>]*data-theme-toggle/gi) || []).length).toBe(1);
    });

    it('falls back to the nav when the header has no actions container', () => {
        // A restaurant page Joe built had exactly this header and got no toggle.
        const page = fullPage('<header class="site-header"><nav class="site-nav"><a href="#a">القائمة</a></nav></header>');
        const r = ensureThemeToggle(page, true);
        expect(r.added).toBe(true);
        expect(r.html).toMatch(/<nav[^>]*class="[^"]*site-nav[^"]*"[^>]*>\s*<button[^>]*data-theme-toggle/i);
    });

    it('puts the button in the HEADER, not inside a script', () => {
        const page = fullPage('<header><div class="nav-actions"></div></header>');
        const out = ensureThemeToggle(page, true).html;
        const btn = out.search(/<button[^>]*data-theme-toggle/i);
        const script = out.indexOf('<script>');
        expect(btn).toBeGreaterThan(-1);
        expect(btn).toBeLessThan(script);
        // And the runtime must survive intact — a mask that shifted offsets
        // would have spliced the button into the middle of the JavaScript.
        expect(out).toContain("localStorage.setItem(KEY, next ? 'dark' : 'light')");
    });

    it('does not mistake a selector in a script for a button', () => {
        expect(hasToggleElement(`<body><script>x('[data-theme-toggle]')</script></body>`)).toBe(false);
        expect(hasToggleElement(`<body><button data-theme-toggle></button></body>`)).toBe(true);
    });
});
