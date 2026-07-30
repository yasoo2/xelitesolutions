/**
 * A real design system for the pages Joe builds.
 *
 * The page builder used to hand the model one line of art direction — "Modern,
 * beautiful, fully responsive" — and hope. Quality was whatever the model felt
 * like that day, colours were picked at random, and text regularly landed on a
 * background it could not be read against.
 *
 * This module decides the design BEFORE the model writes a line: a harmonious
 * palette derived with real colour theory, contrast that is guaranteed by
 * construction rather than audited afterwards, and type/spacing/radius scales.
 * The model then fills in content within that system instead of inventing one.
 */

export interface Palette {
    /** Brand hue, 0-359. */
    hue: number;
    scheme: 'analogous' | 'complementary' | 'triadic';
    primary: string;
    primaryDark: string;
    primaryLight: string;
    secondary: string;
    accent: string;
    /** Text that is guaranteed readable ON the primary colour. */
    onPrimary: string;
    bg: string;
    surface: string;
    text: string;
    textMuted: string;
    border: string;
    /** Dark-mode counterparts, so every page ships with both. */
    darkBg: string;
    darkSurface: string;
    darkText: string;
    darkTextMuted: string;
    darkBorder: string;
}

/* ---------- colour maths (WCAG 2.1) ---------------------------------------- */

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
        h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
            h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function hslCss(h: number, s: number, l: number): string {
    const [r, g, b] = hslToRgb(h, s, l);
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(rgb: [number, number, number]): number {
    const a = rgb.map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

export function contrastRatio(hexA: string, hexB: string): number {
    const parse = (hex: string): [number, number, number] => {
        const h = hex.replace('#', '');
        const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
    };
    const l1 = luminance(parse(hexA)), l2 = luminance(parse(hexB));
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Darken (or lighten) a hue until its contrast against `against` clears the WCAG
 * threshold. This is what makes the palette readable BY CONSTRUCTION — the old
 * pages needed an audit afterwards because nothing guaranteed it up front.
 */
function fitContrast(h: number, s: number, startL: number, against: string, min: number, direction: -1 | 1): string {
    let l = startL;
    for (let i = 0; i < 40; i++) {
        const c = hslCss(h, s, l);
        if (contrastRatio(c, against) >= min) return c;
        l += direction * 2;
        if (l < 0 || l > 100) break;
    }
    return hslCss(h, s, direction < 0 ? 8 : 96);
}

/* ---------- brand hue ------------------------------------------------------- */

/** Colours a user may name, in Arabic and English, mapped to a hue. */
const NAMED_HUES: Array<[RegExp, number]> = [
    [/\b(red|crimson)\b|أحمر|احمر/i, 0],
    [/\b(orange)\b|برتقالي/i, 25],
    [/\b(amber|gold|yellow)\b|ذهبي|أصفر|اصفر/i, 42],
    [/\b(green|emerald|mint)\b|أخضر|اخضر|زمرد/i, 152],
    [/\b(teal|cyan|turquoise)\b|تركواز|فيروزي/i, 182],
    [/\b(blue|azure|navy)\b|أزرق|ازرق|كحلي/i, 218],
    [/\b(indigo)\b|نيلي/i, 245],
    [/\b(purple|violet)\b|بنفسجي|أرجواني|ارجواني/i, 270],
    [/\b(pink|rose|magenta)\b|وردي|زهري/i, 330],
];

/** Sector defaults, used when the user names no colour at all. */
const SECTOR_HUES: Array<[RegExp, number]> = [
    [/تقني|تكنلوج|تكنولوج|برمج|software|tech|saas|ai|digital|consult|استشار/i, 218],
    [/متجر|تسوق|shop|store|ecommerce|commerce/i, 258],
    [/مطعم|كافيه|قهوة|طعام|food|restaurant|cafe|coffee/i, 25],
    [/صح|طب|عياد|health|medical|clinic|doctor|fitness|لياقة/i, 168],
    [/عقار|real ?estate|property|سكن/i, 200],
    [/تعليم|مدرس|دورة|education|course|school|academy/i, 235],
    [/محام|قانون|law|legal|مالي|finance|bank|بنك|محاسب/i, 212],
    [/سفر|سياح|travel|tour|hotel|فندق/i, 190],
    [/جمال|تجميل|أزياء|ازياء|beauty|fashion|salon|spa/i, 330],
];

function hashHue(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = text.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h) % 360;
}

export function pickHue(request: string): number {
    const r = String(request || '');
    for (const [re, hue] of NAMED_HUES) if (re.test(r)) return hue;
    for (const [re, hue] of SECTOR_HUES) if (re.test(r)) return hue;
    // Nothing named: stable per request, so re-running the same brief keeps the
    // same identity instead of a different colour every time.
    return hashHue(r);
}

/* ---------- the palette ----------------------------------------------------- */

export function buildPalette(request: string): Palette {
    const hue = pickHue(request);
    // Warm hues read better with an analogous partner; cool hues can carry a
    // complementary accent without clashing.
    const scheme: Palette['scheme'] = hue >= 20 && hue <= 60 ? 'analogous' : 'complementary';
    const secondaryHue = scheme === 'analogous' ? (hue + 32) % 360 : (hue + 28) % 360;
    const accentHue = scheme === 'analogous' ? (hue + 200) % 360 : (hue + 180) % 360;

    const white = '#ffffff';
    // Primary must carry white text at AA (4.5:1) — that is what makes buttons legible.
    const primary = fitContrast(hue, 68, 52, white, 4.5, -1);
    const primaryDark = fitContrast(hue, 70, 38, white, 7, -1);
    const primaryLight = hslCss(hue, 72, 92);

    const bg = hslCss(hue, 40, 98);
    const surface = white;
    const text = fitContrast(hue, 28, 20, surface, 12, -1);
    const textMuted = fitContrast(hue, 16, 42, surface, 4.5, -1);

    const darkBg = hslCss(hue, 24, 8);
    const darkSurface = hslCss(hue, 20, 12);
    const darkText = fitContrast(hue, 12, 96, darkSurface, 12, 1);
    const darkTextMuted = fitContrast(hue, 12, 74, darkSurface, 4.5, 1);

    return {
        hue, scheme, primary, primaryDark, primaryLight,
        secondary: fitContrast(secondaryHue, 62, 48, white, 4.5, -1),
        accent: fitContrast(accentHue, 70, 46, white, 4.5, -1),
        onPrimary: white,
        bg, surface, text, textMuted,
        border: hslCss(hue, 30, 88),
        darkBg, darkSurface, darkText, darkTextMuted,
        darkBorder: hslCss(hue, 18, 22),
    };
}

/** The tokens as CSS custom properties — pasted into every generated page. */
export function paletteCss(p: Palette): string {
    return `:root{
  --brand:${p.primary}; --brand-dark:${p.primaryDark}; --brand-light:${p.primaryLight};
  --secondary:${p.secondary}; --accent:${p.accent}; --on-brand:${p.onPrimary};
  --bg:${p.bg}; --surface:${p.surface}; --text:${p.text}; --text-muted:${p.textMuted}; --border:${p.border};
  --radius:14px; --radius-lg:22px; --radius-pill:999px;
  --shadow-sm:0 1px 2px rgba(15,23,42,.06),0 1px 3px rgba(15,23,42,.08);
  --shadow-md:0 8px 24px -8px rgba(15,23,42,.18);
  --shadow-lg:0 24px 60px -16px rgba(15,23,42,.24);
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px;
  --space-8:32px; --space-12:48px; --space-16:64px; --space-24:96px;
  --step--1:clamp(.83rem,.8rem + .15vw,.94rem);
  --step-0:clamp(1rem,.96rem + .2vw,1.13rem);
  --step-1:clamp(1.2rem,1.13rem + .35vw,1.4rem);
  --step-2:clamp(1.44rem,1.32rem + .6vw,1.8rem);
  --step-3:clamp(1.73rem,1.53rem + 1vw,2.3rem);
  --step-4:clamp(2.07rem,1.75rem + 1.6vw,3rem);
  --step-5:clamp(2.49rem,2rem + 2.4vw,4rem);
  --maxw:1180px;
}
@media (prefers-color-scheme:dark){:root{
  --bg:${p.darkBg}; --surface:${p.darkSurface}; --text:${p.darkText};
  --text-muted:${p.darkTextMuted}; --border:${p.darkBorder};
  --shadow-sm:0 1px 2px rgba(0,0,0,.4); --shadow-md:0 8px 24px -8px rgba(0,0,0,.55);
  --shadow-lg:0 24px 60px -16px rgba(0,0,0,.65);
}}`;
}

/** The art-direction brief handed to the model along with the tokens. */
export function designBrief(p: Palette): string {
    return `DESIGN SYSTEM — use it, do not invent your own:
- A <style> block MUST start with the exact :root token block given below. Use the tokens
  (var(--brand), var(--space-6), var(--step-3), ...) for EVERY colour, space and font size.
  Never hardcode a hex colour or a px font-size outside the token block.
- Palette is ${p.scheme} around hue ${p.hue}. Contrast is already WCAG-AA safe: put
  var(--on-brand) on var(--brand), var(--text) on var(--surface)/var(--bg).
- Type: one display font stack for headings, one for body. Headings use --step-3..--step-5,
  body --step-0, small print --step--1. Line-height 1.15 for headings, 1.65 for body.
- Layout: max-width var(--maxw), centered, generous whitespace (--space-16/--space-24 between
  sections). Real CSS grid/flex — never tables for layout. Mobile-first; every grid collapses
  to one column under 768px.
- Depth: --shadow-sm for cards at rest, --shadow-md on hover, --radius on everything square.
- Motion: subtle only — transitions of 150-250ms on hover/focus, one gentle entrance animation
  via IntersectionObserver. Respect @media (prefers-reduced-motion: reduce).
- Accessibility: visible :focus-visible ring, alt text on every image, semantic landmarks
  (header/nav/main/section/footer), aria-labels on icon-only buttons.
- Dark mode ships with the page via the token block — do not add a second colour scheme.`;
}

/**
 * The component layer — buttons, fields, cards, navigation, motion.
 *
 * The brief asked for hover transitions, focus rings and one gentle entrance
 * animation. A measured build contained ZERO transitions, ZERO :hover, ZERO
 * @keyframes, ZERO :focus and not a single rule for `button` — while the page
 * had a submit button sitting there in browser-default grey. That is what "the
 * design is primitive and the buttons are ugly" means in code.
 *
 * A weak model ignores instructions it finds tedious, so this ships as CSS.
 * It is injected as a BASE layer, immediately after <style>, which means any
 * rule the model does write still wins — this only fills what it left bare.
 */
export function uiKitCss(): string {
    return `/* Joe UI kit — base layer (the page's own rules override these) */
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth}
body{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  font-family:'Segoe UI','Noto Sans Arabic','Helvetica Neue',system-ui,-apple-system,sans-serif}
img,svg,video,iframe{max-width:100%;height:auto}
h1,h2,h3,h4{line-height:1.2;letter-spacing:-.01em;margin:0 0 var(--space-4,16px)}
p{line-height:1.75}
section{scroll-margin-top:80px}

/* Buttons: a real control, not the browser default */
button,.btn,a.btn,[type=submit],[type=button],input[type=submit]{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:12px 22px;border-radius:var(--radius-pill,999px);border:1px solid transparent;
  background:var(--brand,#2563eb);color:var(--on-brand,#fff);
  font:inherit;font-weight:650;font-size:var(--step-0,1rem);line-height:1;
  cursor:pointer;text-decoration:none;white-space:nowrap;
  box-shadow:var(--shadow-sm,0 1px 2px rgba(0,0,0,.08));
  transition:transform .18s cubic-bezier(.2,.8,.3,1),box-shadow .18s ease,background-color .18s ease,filter .18s ease}
button:hover,.btn:hover,a.btn:hover,[type=submit]:hover,[type=button]:hover{
  transform:translateY(-2px);box-shadow:var(--shadow-md,0 8px 24px -8px rgba(0,0,0,.25));filter:saturate(1.08)}
button:active,.btn:active,a.btn:active,[type=submit]:active{transform:translateY(0) scale(.985)}
.btn-ghost,button.ghost,a.ghost{background:transparent;color:var(--brand,#2563eb);border-color:var(--border,rgba(0,0,0,.15))}
.btn-ghost:hover,button.ghost:hover,a.ghost:hover{background:var(--brand-light,rgba(37,99,235,.08))}
:focus-visible{outline:3px solid var(--accent,#2563eb);outline-offset:3px;border-radius:6px}

/* Navigation: links need room to breathe and a state on hover */
nav{display:flex;align-items:center;gap:clamp(14px,2.2vw,30px);flex-wrap:wrap}
nav a{position:relative;text-decoration:none;font-weight:600;padding:6px 2px;
  transition:opacity .18s ease,color .18s ease}
nav a:hover{opacity:.82}
nav a:not(.btn)::after{content:"";position:absolute;inset-inline-start:0;bottom:0;height:2px;width:0;
  background:currentColor;transition:width .22s cubic-bezier(.2,.8,.3,1)}
nav a:not(.btn):hover::after{width:100%}

/* Fields */
input,textarea,select{width:100%;padding:12px 14px;font:inherit;
  color:var(--text,#0f1e33);background:var(--surface,#fff);
  border:1px solid var(--border,rgba(0,0,0,.15));border-radius:var(--radius,12px);
  transition:border-color .18s ease,box-shadow .18s ease}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--brand,#2563eb);
  box-shadow:0 0 0 4px color-mix(in srgb,var(--brand,#2563eb) 18%,transparent)}
textarea{min-height:130px;resize:vertical}
form{display:flex;flex-direction:column;gap:var(--space-3,12px)}
form button,form [type=submit]{align-self:flex-start}

/* Cards lift on hover — the single cheapest cue that a page is alive */
.card,.service,.step,.result,.price,.testimonial,.feature,.product{
  transition:transform .22s cubic-bezier(.2,.8,.3,1),box-shadow .22s ease,border-color .22s ease}
.card:hover,.service:hover,.step:hover,.result:hover,.price:hover,.testimonial:hover,.feature:hover,.product:hover{
  transform:translateY(-4px);box-shadow:var(--shadow-lg,0 24px 60px -16px rgba(0,0,0,.25));
  border-color:color-mix(in srgb,var(--brand,#2563eb) 35%,transparent)}

/* Photographs sit in a framed, correctly-cropped box instead of at raw size */
section img:not([class*=icon]):not([class*=logo]){
  border-radius:var(--radius-lg,20px);object-fit:cover;display:block}

/* Entrance motion — opt-out honoured */
[data-reveal]{opacity:0;transform:translateY(18px);
  transition:opacity .6s cubic-bezier(.2,.8,.3,1),transform .6s cubic-bezier(.2,.8,.3,1)}
[data-reveal].is-visible{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001ms!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
  [data-reveal]{opacity:1;transform:none}
}`;
}

/** The scroll-reveal behaviour the CSS above depends on. */
export function uiKitScript(): string {
    return `<script>
(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll('section > *, main > section, .card, .service, .step, .result, .price, .testimonial');
  if (reduce || !('IntersectionObserver' in window)) { return; }
  targets.forEach(function(el){ el.setAttribute('data-reveal',''); });
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  targets.forEach(function(el){ io.observe(el); });
  // A sticky header reads as flat until it separates from the content under it.
  var head = document.querySelector('header');
  if (head && getComputedStyle(head).position === 'sticky') {
    var onScroll = function(){ head.style.boxShadow = window.scrollY > 8 ? 'var(--shadow-md, 0 8px 24px -8px rgba(0,0,0,.25))' : 'none'; };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
})();
</script>`;
}
