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

import { normalizeIntentText } from '../orchestrator/promptNormalizer';

/** The user's words plus their canonical form — one Arabic spelling must not
 *  decide the design. */
function probeOf(request: string): string {
    try { return `${request || ''}\n${normalizeIntentText(request || '')}`; } catch { return String(request || ''); }
}

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
    /** A brand-tinted surface and text guaranteed readable on it — always a pair. */
    tint: string;
    onTint: string;
    /** The brand colour as TEXT on the page surface — a different fit from the fill. */
    brandText: string;
    darkBrandText: string;
    darkTint: string;
    onDarkTint: string;
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

/**
 * Sector BANDS, used when the user names no colour at all.
 *
 * These were single numbers, and that is why «في كل مرّة أطلب من جو بناء موقع
 * فإنه يعطي نفس اللون». Every technology company on earth got hue 218 — the
 * identical blue — every shop got 258, every restaurant got 25. The sector was
 * being treated as an answer when it is only a constraint: a consultancy should
 * not be pink, and it does not follow that it must be one exact blue.
 *
 * A band says what the sector rules OUT. Which hue inside it belongs to this
 * business is decided from the request, so two consultancies are recognisably
 * different and the same brief still rebuilds identically.
 */
const SECTOR_HUES: Array<[RegExp, [number, number]]> = [
    // `تطبيق` belongs here and its absence sent app companies to HEALTH: the
    // bare stem `طب` below matched inside «تطبيقات», so a software shop was
    // painted clinic-teal. Arabic has no \b, so every Arabic stem in these
    // tables must be long enough not to hide inside another word. `ai` gets a
    // real \b for the same reason — it lives inside "email" and "chair".
    [/تقني|تكنلوج|تكنولوج|برمج|تطبيق|software|tech|saas|\bai\b|digital|consult|استشار|\bapps?\b/i, [196, 256]],
    //  ⛔ A CONTAINER, and it is marked so — see CONTAINER_SECTORS below.
    [/متجر|تسوق|shop|store|ecommerce|commerce/i, [246, 292]],
    [/مطعم|كافيه|قهوة|طعام|food|restaurant|cafe|coffee/i, [8, 44]],
    [/صحة|صحي|طبي|طبيب|عيادة|عياد|مستشفى|health|medical|clinic|doctor|fitness|لياقة/i, [150, 192]],
    [/عقار|real ?estate|property|سكن/i, [176, 216]],
    [/تعليم|مدرس|دورة|education|course|school|academy/i, [222, 268]],
    [/محام|قانون|law|legal|مالي|finance|bank|بنك|محاسب/i, [198, 234]],
    [/سفر|سياح|travel|tour|hotel|فندق/i, [172, 206]],
    [/جمال|تجميل|أزياء|ازياء|beauty|fashion|salon|spa/i, [312, 348]],
];

function hashHue(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = text.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h) % 360;
}

/**
 *  ⛔ A CONTAINER WORD ANSWERS ONLY WHEN NOTHING ELSE DOES.
 *
 *  «متجر قهوة» came back purple while «coffee roastery» came back
 *  roasted brown — the same shop, two languages, one of them right. The
 *  table is ordered and the first match wins, and the commerce row sits
 *  above the food row, so «متجر» answered and «قهوة» was never
 *  reached. English escaped only because that sentence happens to carry no
 *  container word, which is why the defect was invisible in English and
 *  painted on every Arabic request.
 *
 *  «متجر» says what FORM the thing takes. «قهوة» says what it is
 *  ABOUT. This is the container trap already closed in the page reader,
 *  where «صفحة» and «قائمة» name the vessel and not the content —
 *  closed there, open here, because closing an instance never closes a
 *  class.
 *
 *  Demoted, not deleted: a request that names no subject at all is still a
 *  shop, and must still get the commerce colour.
 */
const CONTAINER_SECTORS = new Set([1]);

export function pickHue(request: string): number {
    const r = probeOf(request);
    // A colour the user NAMED is not a suggestion. «أزرق» means blue, exactly.
    for (const [re, hue] of NAMED_HUES) if (re.test(r)) return hue;
    //  Two passes over one table: the subject first, the vessel only after.
    const order = SECTOR_HUES.map((_, i) => i)
        .filter(i => !CONTAINER_SECTORS.has(i))
        .concat(SECTOR_HUES.map((_, i) => i).filter(i => CONTAINER_SECTORS.has(i)));
    for (const idx of order) {
        const [re, [lo, hi]] = SECTOR_HUES[idx];
        if (!re.test(r)) continue;
        // Stable per brief, spread across the band. The same request rebuilds
        // the same colour; a different business gets a different one.
        return (lo + (hashHue(r) % Math.max(1, hi - lo))) % 360;
    }
    // Nothing named: stable per request, so re-running the same brief keeps the
    // same identity instead of a different colour every time.
    return hashHue(r);
}

/* ---------- the palette ----------------------------------------------------- */

/**
 *  ⛔ THE TEMPERATURE HE ASKED FOR OUTRANKS THE HUE WE GUESSED.
 *
 *  Measured on the store the owner called the worst he had seen:
 *
 *      composeDesign(request)  ->  spoken: ['warm', 'elegant']
 *      buildPalette(request)   ->  hue: 183   (#187b81)
 *
 *  A honey shop described as «دافئ وفاخر» was painted in cold teal. The
 *  composer had read his words correctly; this function never asked it. Two
 *  readers of one sentence, and only one of them heard that part — the class
 *  this session has met ten times, and the one that cost the appearance.
 *
 *  The hue is still DERIVED, not chosen from a list: whatever `pickHue`
 *  produced is folded into the arc he named, so two warm briefs still differ
 *  from each other. Only the arc is his; the position inside it is still the
 *  request's own.
 *
 *  ⛔ And a colour he NAMED outranks everything — `pickHue` returns those from
 *  NAMED_HUES first, and this must not overrule a man who wrote «أزرق».
 */
const WARM_ARC: [number, number] = [18, 58];    //  amber, gold, terracotta
const COOL_ARC: [number, number] = [186, 254];  //  ice, steel, indigo

export function buildPalette(request: string): Palette {
    const base = pickHue(request);
    let hue = base;
    try {
        const { temperatureAsked } = require('./composer');
        const asked = temperatureAsked(request);
        const named = NAMED_HUES.some(([re]: any) => re.test(probeOf(request)));
        if (asked && !named) {
            const [lo, hi] = asked === 'warm' ? WARM_ARC : COOL_ARC;
            hue = (lo + (base % Math.max(1, hi - lo))) % 360;
        }
    } catch { /* the palette must never fail on a reader */ }
    return paletteForHue(hue);
}

/**
 * The palette for a hue that has already been decided — by the request, or by a
 * reference site the user pointed at. Everything below is derived, so a borrowed
 * brand colour still ships with AA-safe text instead of whatever the reference
 * happened to get away with.
 */
export function paletteForHue(hue: number): Palette {
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
    // Fit muted copy with headroom: browser compositing and rounded CSS
    // channels can turn an exact 4.5:1 mathematical fit into 4.49:1.
    const textMuted = fitContrast(hue, 16, 42, surface, 5, -1);

    const darkBg = hslCss(hue, 24, 8);
    const darkSurface = hslCss(hue, 20, 12);
    const darkText = fitContrast(hue, 12, 96, darkSurface, 12, 1);
    const darkTextMuted = fitContrast(hue, 12, 74, darkSurface, 5, 1);

    /**
     * A BRAND-TINTED SURFACE AND THE TEXT THAT SITS ON IT — as a pair.
     *
     * Seven rules across the kit paired `background:var(--brand-light)` with
     * `color:var(--brand-dark)`. Both are LIGHT-MODE colours and neither was in
     * the dark token block, so in dark mode every dropdown row, nav hover, badge
     * and pill on the page was a near-white patch — which a render made obvious
     * and no amount of reading the CSS ever would. Flipping --brand-light alone
     * (which darkFirstCss does) is worse, not better: it makes the tile dark and
     * leaves the deep-blue text on it, which is genuinely unreadable.
     *
     * A tinted surface is only ever safe as a PAIR, so it is defined as one and
     * both halves flip together.
     */
    const tint = primaryLight;
    const darkTint = hslCss(hue, 40, 22);

    /**
     * THE BRAND COLOUR USED AS TEXT, which is not the same colour as the brand
     * used as a fill.
     *
     * --brand is fitted to 4.5:1 against WHITE, because its job is to be a
     * button that carries white text. Two rules then borrowed it as a FOREGROUND
     * — the eyebrow label above every section heading, and every ghost button —
     * and in dark mode that lands a mid-tone on a near-black surface. Measured
     * in a browser across all seven compositions: 3.85:1, below AA, on every
     * dark-mode page Joe has ever built. Nothing caught it because the palette
     * guarantees contrast for the pairs it defines, and this was not one of
     * them.
     */
    const brandText = fitContrast(hue, 68, 52, surface, 4.5, -1);
    const darkBrandText = fitContrast(hue, 68, 62, darkSurface, 4.5, 1);

    return {
        hue, scheme, primary, primaryDark, primaryLight,
        tint, onTint: fitContrast(hue, 70, 34, tint, 4.5, -1),
        brandText, darkBrandText,
        darkTint, onDarkTint: fitContrast(hue, 70, 72, darkTint, 4.5, 1),
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
/**
 *  A hex colour at a given alpha, as `rgb(r g b / a)`.
 *
 *  Written rather than borrowed because the shadow has to carry the BRAND
 *  hue -- a neutral drop shadow under a branded button is the same grey
 *  default this change exists to remove.
 */
function hexAlpha(hex: string, alpha: number): string {
    const h = String(hex || '').replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full || '000000', 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/**
 *  The faces a subject was paired with. Declared structurally rather than
 *  imported, so the token layer never depends on the layout layer -- and so
 *  a caller that has no pairing still ships a defined --font-body instead of
 *  a token the app reads and nobody writes.
 */
export interface TypeTokens { display: string; body: string; note?: string }

const NEUTRAL_TYPE: TypeTokens = {
    display: `'Segoe UI Variable Display','Segoe UI','Noto Kufi Arabic',system-ui,sans-serif`,
    body: `'Segoe UI','Noto Sans Arabic',system-ui,-apple-system,sans-serif`,
    note: 'neutral modern',
};

/**
 *  A SURFACE THE EYE READS THE SAME WHATEVER THE SUBJECT.
 *
 *  HSL lightness is a number, not a perception: two hues at the same L
 *  are nowhere near the same brightness. Measured on the hues Joe's own
 *  sector table lands on, cards built with hsl(hue, 44%, 97%):
 *
 *      perceived-lightness spread across five subjects   0.0093
 *      the same cards built in OKLCH                     0.0017
 *
 *  Five and a half times tighter, and visibly the subject's own paper
 *  rather than a wash of near-white. Contrast is not paid for it: text
 *  measures above 15:1 on either.
 *
 *  Law six, and its warning. Three tools were measured before one was
 *  adopted, and the best known of them -- Google's own colour utilities
 *  -- could not be imported at all: its dynamiccolor module requires a
 *  path with no extension and Node's ESM resolver refuses it. culori
 *  imports, carries zero dependencies, and produced the numbers above.
 *
 *  It falls back to the HSL value rather than throwing: a page that
 *  cannot be tinted must still be a page.
 */
function paperAt(hue: number, lightness: number, chroma: number, fallback: string): string {
    try {
        const { formatHex } = require('culori');
        const hex = formatHex({ mode: 'oklch', l: lightness, c: chroma, h: ((hue % 360) + 360) % 360 });
        return typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
    } catch {
        return fallback;
    }
}

export function paletteCss(p: Palette, type: TypeTokens = NEUTRAL_TYPE): string {
    return `:root{
  --brand:${p.primary}; --brand-dark:${p.primaryDark}; --brand-light:${p.primaryLight};
  --secondary:${p.secondary}; --accent:${p.accent}; --on-brand:${p.onPrimary};
  --tint:${p.tint}; --on-tint:${p.onTint}; --brand-text:${p.brandText};
  --bg:${p.bg}; --surface:${p.surface}; --text:${p.text}; --text-muted:${p.textMuted}; --border:${p.border};
  /*  THE SURFACES THAT CARRY THE MOST AREA, AND THEY FOLLOW THE SUBJECT.
   *
   *  These eight were read by the app generator and defined by nobody, so
   *  every card fell back to #fff, every chip to #f5f5f5, every rule to
   *  #e5e5e5 and every secondary line to #667085 -- the same greys for a
   *  coffee roastery and a dental clinic. The palette reached the buttons
   *  and almost nothing else, which is the whole answer to «why does every
   *  app Joe builds look the same».
   *
   *  The ring and the two shadows were worse than grey: read with no
   *  fallback and defined nowhere, so the browser dropped those whole
   *  declarations and the focus rings simply never rendered -- silently,
   *  and with no error anywhere.
   *
   *  (And this comment carries no backtick, because it lives INSIDE the
   *   template literal it documents. That has cost four builds tonight.)  */
  /*  And the card is not pure white. p.surface is the constant the contrast
   *  maths is fitted against, so it must stay #ffffff -- but painting the
   *  largest surface in the app with it is what made a coffee roastery and a
   *  dental clinic identical on screen. A card carries the subject's own hue
   *  at a whisper: enough that two subjects are never the same paper, far too
   *  little to move any pair off AA.
   *
   *  And the tint is a real one, not a rumour of one. At 99% lightness the
   *  card was still clinically white next to the reference the owner showed,
   *  whose paper sits near 91%: warm enough to read as paper rather than as
   *  the absence of colour. 97 and 94 are the compromise -- visibly the
   *  subject's own ground, and every pair still measured AA by the guard
   *  beside this file rather than by assurance.  */
  --card:${paperAt(p.hue, 0.962, 0.019, hslCss(p.hue, 44, 97))}; --panel:${paperAt(p.hue, 0.935, 0.028, hslCss(p.hue, 40, 94))}; --chip:${p.tint}; --line:${p.border};
  --muted:${p.textMuted};
  --ring:${p.primary};
  --shadow-xs:0 1px 1px rgba(15,23,42,.05);
  --shadow-brand:0 10px 30px -12px ${hexAlpha(p.primary, 0.45)};
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
  /*  The type pairing lives in the SAME stylesheet as the colours, because
   *  the app generator reads --font-body and a token read by one file and
   *  written by another is exactly the seam this whole change closes. It was
   *  written here only after a guard caught me opening it again, one minute
   *  after closing it for the colours.  */
  --font-display:${type.display}; --font-body:${type.body};
}
@media (prefers-color-scheme:dark){:root{${darkTokenBlock(p)}}}`;
}

/**
 * The tokens the dark scheme overrides, and the light values of those same
 * tokens — one pair, one list, so they cannot diverge.
 *
 * Both are needed because a theme SWITCH has to state each direction: the
 * media query alone cannot be beaten by a button, and a button that only
 * knows how to go dark leaves a dark-system visitor unable to come back.
 */
export function darkTokenBlock(p: Palette): string {
    return `
  --bg:${p.darkBg}; --surface:${p.darkSurface}; --text:${p.darkText};
  --text-muted:${p.darkTextMuted}; --border:${p.darkBorder};
  --tint:${p.darkTint}; --on-tint:${p.onDarkTint}; --brand-text:${p.darkBrandText};
  --card:${p.darkSurface}; --panel:${p.darkBg}; --chip:${p.darkTint}; --line:${p.darkBorder};
  --muted:${p.darkTextMuted};
  --shadow-xs:0 1px 1px rgba(0,0,0,.5);
  --shadow-brand:0 10px 30px -12px ${hexAlpha(p.primary, 0.55)};
  --shadow-sm:0 1px 2px rgba(0,0,0,.4); --shadow-md:0 8px 24px -8px rgba(0,0,0,.55);
  --shadow-lg:0 24px 60px -16px rgba(0,0,0,.65);
`;
}

export function lightTokenBlock(p: Palette): string {
    return `
  --bg:${p.bg}; --surface:${p.surface}; --text:${p.text};
  --text-muted:${p.textMuted}; --border:${p.border};
  --tint:${p.tint}; --on-tint:${p.onTint}; --brand-text:${p.brandText};
  --card:${hslCss(p.hue, 44, 97)}; --panel:${hslCss(p.hue, 40, 94)}; --chip:${p.tint};
  --line:${p.border}; --muted:${p.textMuted};
  --shadow-sm:0 1px 2px rgba(15,23,42,.06),0 1px 3px rgba(15,23,42,.08);
  --shadow-md:0 8px 24px -8px rgba(15,23,42,.18);
  --shadow-lg:0 24px 60px -16px rgba(15,23,42,.24);
  --shadow-xs:0 1px 1px rgba(15,23,42,.05);
  --shadow-brand:0 10px 30px -12px ${hexAlpha(p.primary, 0.45)};
`;
}

/**
 * Make the page dark for everyone.
 *
 * Every page ships light with a dark @media block, which means a user who asked
 * for the feel of a dark site gets a white page on a light-mode laptop — the one
 * thing they did not ask for. A dark reference is dark at noon, unconditionally,
 * so this drops the preference query entirely: the identity is the design, not a
 * user setting. The tokens are the same ones the palette already derived, so the
 * contrast guarantees carry over untouched.
 *
 * It must be appended AFTER the model's own token block to win the cascade —
 * including after that block's own prefers-color-scheme rule.
 */
export function darkFirstCss(p: Palette): string {
    return `/* dark by design: the style reference is a dark interface */
:root,:root:where(*){
  --bg:${p.darkBg}; --surface:${p.darkSurface}; --text:${p.darkText};
  --text-muted:${p.darkTextMuted}; --border:${p.darkBorder};
  --tint:${p.darkTint}; --on-tint:${p.onDarkTint}; --brand-text:${p.darkBrandText};
  --shadow-sm:0 1px 2px rgba(0,0,0,.5); --shadow-md:0 10px 30px -8px rgba(0,0,0,.6);
  --shadow-lg:0 28px 70px -16px rgba(0,0,0,.72);
  color-scheme:dark;
}
@media (prefers-color-scheme:light){:root{
  --bg:${p.darkBg}; --surface:${p.darkSurface}; --text:${p.darkText};
  --text-muted:${p.darkTextMuted}; --border:${p.darkBorder};
  --tint:${p.darkTint}; --on-tint:${p.onDarkTint}; --brand-text:${p.darkBrandText};
  color-scheme:dark;
}}
body{background:var(--bg);color:var(--text)}`;
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
/* The hidden ATTRIBUTE is display:none in the user-agent stylesheet, which any
   author rule with a class beats. .btn{display:inline-flex} therefore un-hid
   every button the runtime tried to hide — measured in a browser: the sign-out
   button was visible before anyone had signed in, and the sign-in button stayed
   visible after. Anything that hides an element by attribute in this kit depends
   on this line. */
[hidden]{display:none!important}
html{scroll-behavior:smooth}
/* THE PAGE MUST PAINT ITSELF FROM THE TOKENS.
   This line was missing and nothing noticed for months, because the model
   usually writes the same rule itself and the page looked right. When it did
   not, the whole dark scheme was inert: --bg and --text flipped and
   the body kept the browser's white, so the dark text token — a near-white —
   was painted on white and the page went blank. Measured in a browser the
   moment a theme switch was put on the page and pressed: the background did not
   change at all. Base layer, so anything the model DID write still wins. */
body{background:var(--bg);color:var(--text)}
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
/* a.btn-ghost, not .btn-ghost. The filled rule above is written as a.btn,
   which is one element more specific than a bare .btn-ghost — so EVERY
   secondary button on every page Joe has built rendered as a solid primary
   button. Seen in a screenshot: "تسجيل الدخول" and "ابدأ الآن" sat side by side
   in the header as two identical filled buttons, and the page had no visual
   hierarchy at all. The selectors now match the specificity of what they
   override. */
a.btn-ghost,button.btn-ghost,.btn.btn-ghost,button.ghost,a.ghost{
  background:transparent;color:var(--brand-text,var(--brand,#2563eb));border-color:var(--border,rgba(0,0,0,.15));
  box-shadow:none}
a.btn-ghost:hover,button.btn-ghost:hover,.btn.btn-ghost:hover,button.ghost:hover,a.ghost:hover{
  background:var(--brand-light,rgba(37,99,235,.08));border-color:var(--brand,#2563eb)}
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
/* Joe details-guard — an FAQ must open when its question is pressed.
   A model likes to "wire" a native <details class="faq-item"> itself:
     question.addEventListener('click', () => item.hasAttribute('open')
       ? item.removeAttribute('open') : item.setAttribute('open',''))
   The browser toggles open on the summary click, THEN that handler toggles it
   back — net nothing. Measured on a shipped landing page: 5 of 9 controls
   "did nothing when clicked", every one an FAQ question. The guard watches the
   click in the capture phase and, once every handler and the native action
   have run, restores the visitor's intent: a summary click that ended with the
   state it started with is flipped. A working accordion is left alone —
   its state DID change — and so is a handler that preventDefault()s and
   toggles correctly. */
(function(){
  if (window.__joeDetailsGuard) return; window.__joeDetailsGuard = true;
  document.addEventListener('click', function(ev){
    var t = ev.target, s = t && t.closest ? t.closest('summary') : null;
    if (!s) return;
    var d = s.closest('details');
    if (!d) return;
    var before = d.open;
    setTimeout(function(){ if (d.open === before) d.open = !before; }, 0);
  }, true);
})();
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
