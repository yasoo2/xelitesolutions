/**
 * A wordmark, drawn from the brand name and the palette.
 *
 * A page Joe built for a named company put the name in the header as plain
 * bold text. The user's words: «لم يصمم لوجو لاسم الشركة وأن يضعها في زاوية
 * الموقع». They are right that a company site has a mark in its corner, and
 * right that Joe should produce one.
 *
 * It is DRAWN here, deterministically, rather than asked for. Two reasons, both
 * learned the hard way in this codebase:
 *
 *   - A weak model asked for "a logo" returns a description of a logo, or an
 *     <img> pointing at a URL that does not exist. Every image on the page Joe
 *     shipped 404'd for exactly that class of reason.
 *   - A mark has to be right at 28px in a header and at 200px on a splash, in
 *     light and dark, in RTL and LTR. That is geometry, not taste, and geometry
 *     is what a program is good at.
 *
 * What it is NOT: an illustration, a mascot, or a claim to be a designed brand
 * identity. It is a monogram in the page's own palette, set in the page's own
 * display face — an honest wordmark, which is what most company sites actually
 * carry, and better than the name in bold.
 */

/** Letters worth putting in a monogram, per script. */
function initials(brand: string): string {
    const words = String(brand || '').trim()
        .replace(/[«»"'.,،؛;:!؟?()]/g, ' ')
        .split(/\s+/)
        .filter(w => w && !/^(the|a|an|of|and|for|شركة|مؤسسة|متجر|موقع|مطعم|ال)$/i.test(w));
    if (!words.length) return '•';

    const isArabicWord = (w: string) => /[ؠ-ٟٮ-ۓۺ-ۿ]/.test(w);

    /**
     * ARABIC TAKES ONE LETTER, from the first word with its article removed.
     *
     * Two Arabic letters in a 40px tile join into a ligature and stop reading as
     * initials. And nearly every Arabic name is definite — «الرؤية الرقمية»
     * taken naively gives «اا», two identical alifs that say nothing about the
     * business. Strip «ال» and take the letter that carries the name.
     */
    if (isArabicWord(words[0])) {
        const first = words[0].replace(/^ال(?=.{2,})/, '');
        return first.slice(0, 1);
    }

    // One Latin word: its first two letters read better than one lonely capital.
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return words.slice(0, 2).map(w => w.slice(0, 1)).join('').toUpperCase();
}

export interface LogoOptions {
    brand: string;
    /** Brand hue, so the mark belongs to the palette rather than sitting on it. */
    hue: number;
    isArabic: boolean;
}

/**
 * The mark itself: a rounded tile carrying the monogram, with a diagonal
 * gradient built from the page's own brand tokens.
 *
 * `currentColor` is deliberately not used — the tile has its own fill and the
 * monogram is always the palette's on-brand colour, which is the one colour
 * guaranteed readable against it.
 */
export function logoMark(opts: LogoOptions): string {
    const mono = initials(opts.brand);
    // An Arabic glyph needs more room in the box than two Latin capitals.
    const arabic = /[ؠ-ٟٮ-ۓۺ-ۿ]/.test(mono);
    const size = arabic ? 21 : mono.length > 1 ? 17 : 22;
    const dy = arabic ? 1.5 : 0.5;
    const id = `joe-logo-${Math.abs(opts.hue) % 360}`;
    return `<svg class="brand-mark" viewBox="0 0 40 40" width="40" height="40" role="img" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="var(--brand)"/><stop offset="100%" stop-color="var(--brand-dark)"/>
  </linearGradient></defs>
  <rect width="40" height="40" rx="11" fill="url(#${id})"/>
  <text x="20" y="${20 + dy}" text-anchor="middle" dominant-baseline="central"
        font-family="var(--font-display, system-ui), system-ui, sans-serif"
        font-size="${size}" font-weight="800" letter-spacing="${arabic ? 0 : -0.5}"
        fill="var(--on-brand)">${escapeXml(mono)}</text>
</svg>`;
}

/** The mark plus the name — what goes in the corner of the header. */
export function logoLockup(opts: LogoOptions): string {
    return `<a class="brand" href="index.html" aria-label="${escapeXml(opts.brand)}">
  ${logoMark(opts)}<span class="brand-name">${escapeXml(opts.brand)}</span>
</a>`;
}

export function logoCss(): string {
    return `
.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;
  color:var(--text);margin-inline-end:auto;white-space:nowrap}
.brand-mark{width:34px;height:34px;flex:none;border-radius:11px;
  box-shadow:0 2px 10px -3px color-mix(in srgb,var(--brand) 60%,transparent);
  transition:transform .22s cubic-bezier(.2,.8,.3,1)}
.brand:hover .brand-mark{transform:rotate(-6deg) scale(1.04)}
.brand-name{font-family:var(--font-display,inherit);font-weight:800;
  font-size:var(--step-1);letter-spacing:-.02em;line-height:1}
.brand:hover .brand-name{color:var(--brand)}
/* On a narrow phone the mark alone carries the identity and the name would
   push the hamburger off the row. */
@media (max-width:420px){.brand-name{display:none}}
`.trim();
}

/**
 * Put the mark into a header that does not have one.
 *
 * The model writes `<a class="brand">NAME</a>`; this upgrades it in place rather
 * than adding a second brand beside it. A header that already carries an <svg>
 * or an <img> in its brand link is left alone — that is someone's real logo.
 */
export function ensureLogo(html: string, opts: LogoOptions): { html: string; added: boolean } {
    const src = String(html || '');
    const link = src.match(/<a\b[^>]*class="[^"]*\bbrand\b[^"]*"[^>]*>([\s\S]*?)<\/a\s*>/i);
    if (!link) return { html: src, added: false };
    // A drawn mark is already there — done.
    if (/<svg/i.test(link[1])) return { html: src, added: false };

    /**
     * An <img> logo used to end the matter here — and a measured build shipped
     * the ugliest corner a page can have because of it: the model wrote
     * `<img src="logo.png" class="logo">`, the file never existed, the
     * missing-file repair swapped in an 800×600 GRADIENT PLACEHOLDER, and
     * this function saw "there is an img, nothing to do". The header carried
     * a giant purple rectangle reading "DineEase Logo" — the user's exact
     * complaint: «لم يظهر اللوغو». A placeholder is not a logo; only a REAL
     * picture the user supplied is. So: a data-URI gradient, or an img whose
     * name says logo but whose file is nowhere — replaced with the drawn
     * wordmark. A working remote/data photo the user chose is left alone.
     */
    const img = link[1].match(/<img\b[^>]*>/i);
    if (img) {
        const imgSrc = ((img[0].match(/\ssrc\s*=\s*["']([^"']*)["']/i) || [])[1] || '').trim();
        const isGradientPlaceholder = /^data:image\/svg\+xml/i.test(imgSrc) && /linearGradient|%3ClinearGradient/i.test(imgSrc);
        // A bare invented filename ("logo.png") — no path, no scheme — is the
        // model reaching for a file that never existed. A rooted or pathed
        // reference (/logo.svg, assets/logo.png) may be the user's real file
        // and is left exactly as they wrote it.
        const isInventedFile = /^[\w-]*logo[\w-]*\.(png|jpe?g|svg|webp|gif)$/i.test(imgSrc);
        if (!isGradientPlaceholder && !isInventedFile && imgSrc) return { html: src, added: false };
    }

    const text = link[1].replace(/<img\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const brand = text || opts.brand;
    const open = link[0].slice(0, link[0].indexOf('>') + 1);
    const withAria = /aria-label=/i.test(open) ? open : open.replace(/>$/, ` aria-label="${escapeXml(brand)}">`);
    const replaced = `${withAria}${logoMark({ ...opts, brand })}<span class="brand-name">${escapeXml(brand)}</span></a>`;
    return { html: src.replace(link[0], replaced), added: true };
}

function escapeXml(s: string): string {
    return String(s).replace(/[<>&"']/g, c =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string));
}
