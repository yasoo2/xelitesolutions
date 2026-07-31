/**
 * A dark mode the visitor can choose, and motion that respects them.
 *
 * Every page Joe builds already ships a full dark palette — `paletteCss` emits
 * the dark tokens inside `@media (prefers-color-scheme: dark)`. So the colours
 * were always there and the visitor could never reach them: a page looked light
 * on a laptop set to light, whatever the person actually wanted while reading
 * it. The tokens existed, the switch did not.
 *
 * The switch stores the choice, because a preference that resets on the next
 * page is not a preference. It follows the system until the visitor overrides
 * it, and keeps following the system afterwards if they clear the override —
 * which is what "Auto" means and what most sites get wrong.
 *
 * The reveal is here for the same reason the toggle is: the kit already animated
 * CARDS into view and left whole sections appearing instantly, so a page with
 * few cards had no life in it at all. Both honour `prefers-reduced-motion`, and
 * "honour" means the content is VISIBLE with motion off — not animated faster.
 *
 * THEME AND REVEAL ARE SEPARATE EXPORTS ON PURPOSE. A page built against a dark
 * style reference is dark unconditionally — `darkFirstCss` overwrites the light
 * tokens outright — so a light choice there would set an attribute and change
 * nothing. A button that does nothing is the defect this file exists to remove,
 * so that page gets the reveal and no toggle at all.
 */

/**
 * Dark tokens applied by ATTRIBUTE as well as by media query.
 *
 * `paletteCss` writes them into `@media (prefers-color-scheme: dark)`, which a
 * button cannot override. This mirrors the same values onto `[data-theme]`, so
 * the visitor's choice wins over the system and the system still decides when
 * they have not chosen.
 *
 * `darkTokens` is the body of the palette's own dark block, passed in rather
 * than restated, so the two paths can never drift into different colours.
 */
export function themeCss(darkTokens: string): string {
    const body = String(darkTokens || '').trim().replace(/^:root\s*\{/, '').replace(/\}\s*$/, '').trim();
    return `
/* The visitor's choice, which must beat the system preference. */
:root[data-theme="dark"]{${body}}
/* …and an explicit light choice must beat a dark SYSTEM setting, which is why
   the media query alone was never enough. See lightOverrideCss for the values
   themselves; this pins the form controls to match. */
@media (prefers-color-scheme:dark){
  :root[data-theme="light"]{color-scheme:light}
}
:root[data-theme="dark"]{color-scheme:dark}

.theme-toggle{display:inline-grid;place-items:center;width:38px;height:38px;flex:none;
  background:none;border:1px solid var(--border);border-radius:12px;color:var(--text);
  cursor:pointer;padding:0;box-shadow:none;transition:background-color .18s ease,color .18s ease}
.theme-toggle:hover{background:var(--tint);color:var(--on-tint);transform:none}
.theme-toggle .icon{width:19px;height:19px}
/* Only the icon for the mode you would SWITCH TO is shown — a sun and a moon
   side by side tell the visitor nothing about what pressing does. */
.theme-toggle .i-sun{display:none}
:root[data-theme="dark"] .theme-toggle .i-sun{display:block}
:root[data-theme="dark"] .theme-toggle .i-moon{display:none}

@media (prefers-reduced-motion:reduce){.theme-toggle{transition:none}}
`.trim();
}

/**
 * The light tokens, mirrored onto an explicit light choice.
 *
 * Without this the toggle is half a switch: on a laptop set to dark, pressing
 * "light" sets the attribute and the media query keeps every dark value, so the
 * page stays dark and the button looks broken. The attribute selector outranks
 * the media query's bare `:root`, so these win — but only because they are
 * stated. This is the failure the first draft of this file shipped with.
 */
export function lightOverrideCss(lightTokens: string): string {
    const body = String(lightTokens || '').trim().replace(/^:root\s*\{/, '').replace(/\}\s*$/, '').trim();
    if (!body) return '';
    return `:root[data-theme="light"]{${body}}`;
}

/** The reveal, kept apart from the theme so a dark-first page can take just this. */
export function revealCss(): string {
    return `
[data-reveal-section]{opacity:0;transform:translateY(26px);
  transition:opacity .7s cubic-bezier(.2,.8,.3,1),transform .7s cubic-bezier(.2,.8,.3,1)}
[data-reveal-section].is-in{opacity:1;transform:none}

@media (prefers-reduced-motion:reduce){
  /* VISIBLE, not faster. A reveal that still moves is not a concession. */
  [data-reveal-section]{opacity:1;transform:none;transition:none}
}
`.trim();
}

/** The button markup, for a header that has no theme control. */
export function themeToggleHtml(isArabic: boolean): string {
    const label = isArabic ? 'تبديل الوضع الداكن' : 'Toggle dark mode';
    return `<button type="button" class="theme-toggle" data-theme-toggle aria-label="${label}" aria-pressed="false">
  <svg class="icon i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
  <svg class="icon i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>
</button>`;
}

export function themeRuntime(isArabic: boolean): string {
    const T = isArabic
        ? { toDark: 'التبديل إلى الوضع الداكن', toLight: 'التبديل إلى الوضع الفاتح' }
        : { toDark: 'Switch to dark mode', toLight: 'Switch to light mode' };
    return `<script>
/* Joe theme — the visitor's choice, remembered. */
(function () {
  'use strict';
  var T = ${JSON.stringify(T)};
  var KEY = 'joe-theme';
  var root = document.documentElement;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function systemDark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function isDark() { var s = stored(); return s ? s === 'dark' : systemDark(); }

  function apply(dark) {
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (b) {
      b.setAttribute('aria-pressed', dark ? 'true' : 'false');
      b.setAttribute('aria-label', dark ? T.toLight : T.toDark);
    });
  }
  apply(isDark());

  /* Follow the system for as long as the visitor has not overridden it. Once
     they have, their choice stands — including across a system change. */
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSystem = function (e) { if (!stored()) apply(e.matches); };
    if (mq.addEventListener) mq.addEventListener('change', onSystem);
    else if (mq.addListener) mq.addListener(onSystem);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
    if (!btn) return;
    e.preventDefault();
    var next = !(root.getAttribute('data-theme') === 'dark');
    try { localStorage.setItem(KEY, next ? 'dark' : 'light'); } catch (err) { }
    apply(next);
  });
})();
</script>`;
}

/**
 * The section reveal.
 *
 * Deliberately NOT an IntersectionObserver, which is the obvious choice and the
 * wrong one here. An observer only reports a state CHANGE it witnessed: jump
 * from the top of the page to the bottom — which a visitor does with the End
 * key, an in-page anchor, or a restored scroll position, and which Joe's own
 * browser audit does on every single page it measures — and the sections the
 * jump flew past never intersected on any observed frame, so they stay at
 * opacity 0 for good. Invisible content is a far worse bug than a missing
 * animation.
 *
 * A rAF-throttled scroll sweep cannot miss: it asks where things are NOW, so a
 * jump reveals everything the jump passed. With a dozen sections it costs
 * nothing measurable.
 */
export function revealRuntime(): string {
    return `<script>
/* Joe reveal — motion the visitor can refuse, and content they always get. */
(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var sections = [].slice.call(document.querySelectorAll('main > section, body > section'))
    .filter(function (s) { return !s.closest('header') && !s.closest('footer') && !s.hasAttribute('data-no-reveal'); });
  if (!sections.length) return;

  /* The FIRST screenful is never animated in. A hero that fades in after the
     page has loaded reads as a slow site, not a designed one. */
  var pending = [];
  sections.forEach(function (s, i) {
    if (s.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    s.setAttribute('data-reveal-section', '');
    s.style.transitionDelay = Math.min(i % 3, 2) * 70 + 'ms';
    pending.push(s);
  });
  if (!pending.length) return;

  var ticking = false;
  function sweep() {
    ticking = false;
    var h = window.innerHeight;
    for (var i = pending.length - 1; i >= 0; i--) {
      var s = pending[i];
      /* Above the fold line OR already scrolled past — both mean "the visitor
         has arrived here", and only the second case is what an observer loses. */
      if (s.getBoundingClientRect().top < h * 0.88) {
        s.classList.add('is-in');
        pending.splice(i, 1);
      }
    }
    if (!pending.length) teardown();
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(sweep); } }
  function teardown() {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    window.removeEventListener('hashchange', onScroll);
    window.removeEventListener('pageshow', onScroll);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('hashchange', onScroll);
  window.addEventListener('pageshow', onScroll);
  /* Images finishing late move everything below them; re-measure on load. */
  window.addEventListener('load', onScroll);

  /* A short ticker for the cases that emit no scroll event at all: the browser
     jumping to a #hash on load, a restored scroll position, a web font landing
     and reflowing everything below it. Bounded to a few seconds, then gone — it
     is a safety net for the first moments of a page, not a running loop. */
  var ticks = 0;
  var tick = setInterval(function () {
    sweep();
    if (++ticks > 16 || !pending.length) clearInterval(tick);
  }, 250);

  sweep();
})();
</script>`;
}

/**
 * Put the toggle in a header that has none.
 *
 * Beside the other actions, before the sign-in button, which is where every site
 * that has one puts it.
 */
export function ensureThemeToggle(html: string, isArabic: boolean): { html: string; added: boolean } {
    const src = String(html || '');
    if (/data-theme-toggle/i.test(src)) return { html: src, added: false };
    const anchor = src.match(/<div\b[^>]*class="[^"]*\bnav-actions\b[^"]*"[^>]*>/i);
    if (!anchor) return { html: src, added: false };
    return { html: src.replace(anchor[0], `${anchor[0]}\n      ${themeToggleHtml(isArabic)}`), added: true };
}
