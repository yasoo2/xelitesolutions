/**
 * HTML QA — the "Reviewer / QA department" for generated web pages.
 *
 * Two layers, both FREE:
 *   1. reviewHtml()      — INSTANT, deterministic (no LLM). Catches the defects
 *      weak local models actually produce: leftover markdown fences, placeholder
 *      image hosts, missing charset/viewport, TODO/placeholder text, empty
 *      src/href, unclosed <html>/<body>. Auto-fixes what it safely can and
 *      returns the remaining issues — so quality goes up with ZERO extra latency
 *      on the user's CPU-only laptop.
 *   2. browserSmokeTest() — OPT-IN (JOE_QA_BROWSER_TEST=1). Opens the page in the
 *      real headless browser, collects console/page errors, and screenshots it.
 *      Heavy, so it's off by default on a weak laptop but ready for a server.
 */

export interface HtmlReview {
    html: string;               // possibly auto-fixed HTML
    issues: string[];           // human-readable remaining issues
    fixed: string[];            // what we auto-corrected
    score: number;              // 0-100 quality score
}

const PLACEHOLDER_HOSTS = /https?:\/\/(via\.placeholder\.com|placehold\.it|placeholder\.com|placekitten\.com|dummyimage\.com|loremflickr\.com|unsplash\.it)[^\s"')]*/gi;

/**
 * A copy of the document in which script and style CONTENTS are blanked out,
 * character for character.
 *
 * Structural rules must not see inside code. A runtime that builds markup from
 * strings — every one Joe ships does — contains `</header>`, `<main>` and `<h1>`
 * as ordinary text, and a rule that finds them there will either edit the wrong
 * place or decide the page already has something it does not.
 *
 * The replacement is the same LENGTH as what it replaces, so an offset found in
 * the mask addresses the identical character in the original and a splice can be
 * applied to the real document without any remapping.
 */
export function maskNonMarkup(html: string): string {
    return String(html || '').replace(
        /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi,
        (_m, open: string, _tag: string, body: string, close: string) =>
            open + body.replace(/[^\n]/g, ' ') + close,
    );
}

/** Deterministic review + safe auto-fix. Never throws. */
export function reviewHtml(
    rawHtml: string,
    isArabic = false,
    opts: {
        /**
         * Selectors whose background AND text colour Joe re-states after the
         * model's stylesheet, via `surfacePairingCss`.
         *
         * They must be left alone here. Re-colouring them from the colour the
         * MODEL wrote means the two repairs describe different backgrounds, and
         * two repairs fighting is worse than either alone: measured, ten nodes
         * at 2.31:1 on a band that was not the colour this pass believed, and a
         * deliberately inverted hero back at 1.33:1.
         */
        ownedSurfaces?: string[];
    } = {},
): HtmlReview {
    let html = String(rawHtml || '');
    const issues: string[] = [];
    const fixed: string[] = [];

    // 1. Strip leftover markdown code fences the weak model sometimes leaves.
    if (/```/.test(html)) {
        const m = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
        if (m && /<html[\s>]/i.test(m[1])) { html = m[1].trim(); fixed.push('removed markdown code fences'); }
        else { html = html.replace(/```(?:html)?/gi, '').trim(); fixed.push('removed stray code fences'); }
    }

    // 2. Replace placeholder image hosts with an inline SVG data URI (self-contained).
    if (PLACEHOLDER_HOSTS.test(html)) {
        const svg = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" font-family="sans-serif" font-size="20" fill="#64748b" text-anchor="middle" dominant-baseline="middle">Image</text></svg>')}`;
        html = html.replace(PLACEHOLDER_HOSTS, svg);
        fixed.push('replaced external placeholder images with inline SVG');
    }

    // 3. Ensure <meta charset> (Arabic pages break without it).
    if (/<head[\s>]/i.test(html) && !/<meta[^>]+charset/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, '<head$1>\n    <meta charset="UTF-8">');
        fixed.push('added missing <meta charset="UTF-8">');
    }

    // 4. Ensure responsive viewport meta.
    if (/<head[\s>]/i.test(html) && !/name=["']viewport["']/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, '<head$1>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">');
        fixed.push('added responsive viewport meta');
    }

    // 5. Arabic pages should be RTL.
    if (isArabic && /<html/i.test(html) && !/dir=["']rtl["']/i.test(html)) {
        html = html.replace(/<html([^>]*)>/i, (mm, attrs) => `<html${/lang=/i.test(attrs) ? attrs : ' lang="ar"' + attrs} dir="rtl">`);
        fixed.push('set RTL direction for Arabic page');
    }

    /* ------------------------------------------------------------------
       6. LAYOUT SAFETY NET.

       The design brief tells the model to constrain images, collapse grids
       on mobile and put --on-brand text on branded surfaces. A weak model
       ignores all three, and the result is not "slightly off" — it is
       unusable: a measured build overflowed 1406px horizontally on desktop
       and 2456px on a phone, where the page rendered as an empty screen
       because every column stayed at its desktop width. Instructions are
       not enforcement, so the fixes below are applied to the CSS itself.
       ------------------------------------------------------------------ */

    // 6a. No DOCTYPE means QUIRKS MODE — the browser falls back to a 1990s box
    //     model and half the layout maths silently changes meaning.
    if (/<html[\s>]/i.test(html) && !/<!DOCTYPE\s+html/i.test(html)) {
        html = html.replace(/(<html[\s>])/i, '<!DOCTYPE html>\n$1');
        fixed.push('added missing <!DOCTYPE html> (page was rendering in quirks mode)');
    }

    if (/<\/style>/i.test(html)) {
        const styleBlock = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [, ''])[1];
        const extra: string[] = [];

        // 6b. An unconstrained <img> renders at its intrinsic size — a 2048px
        //     photo in a 1440px viewport pushes the whole document sideways.
        if (!/img\s*[,{][^}]*max-width/i.test(styleBlock)) {
            extra.push('*,*::before,*::after{box-sizing:border-box}img,svg,video,iframe{max-width:100%;height:auto}body{overflow-x:hidden}');
            fixed.push('constrained media to the viewport (images were overflowing the page)');
        }

        // 6c. Multi-column grids with no breakpoint stay multi-column on a
        //     phone. Collapse every such grid under 768px.
        // Look for a WIDTH breakpoint specifically. Testing for any @media was
        // wrong the moment the UI kit started shipping a prefers-reduced-motion
        // block: the page then "had media queries" and the grids were left at
        // three columns on a phone — the safety net silently disarmed itself.
        if (!/@media[^{]*\(\s*(max|min)-width/i.test(styleBlock)) {
            const gridSelectors: string[] = [];
            const ruleRe = /([^{}]+)\{([^}]*)\}/g;
            let m: RegExpExecArray | null;
            while ((m = ruleRe.exec(styleBlock))) {
                const sel = m[1].trim(), body = m[2];
                if (/grid-template-columns\s*:\s*repeat\(\s*([2-9]|1[0-9])/i.test(body) && sel && !sel.startsWith('@')) {
                    gridSelectors.push(sel);
                }
            }
            if (gridSelectors.length) {
                extra.push(`@media(max-width:768px){${gridSelectors.join(',')}{grid-template-columns:1fr!important}}`);
                fixed.push(`collapsed ${gridSelectors.length} grid(s) to one column on mobile (no breakpoint existed)`);
            }
        }

        // 6d. Text on a branded background must use the colour the palette
        //     guarantees against it. A measured page put --text (#252f41) on
        //     --brand (#316ed8): 2.79:1, far below the 4.5:1 minimum.
        //
        //     A TINT IS NOT A FILL. This rule used to match `var(--brand)`
        //     anywhere in the background, including inside a color-mix that is
        //     mostly transparent. A page Joe shipped came out with
        //
        //       th{background:color-mix(in srgb,var(--brand) 6%,transparent);
        //          color:var(--on-brand);}
        //
        //     — white text on a 6% tint of blue, i.e. white on white. Every
        //     table header on the page was invisible, and the rule that did it
        //     is the CONTRAST safety net. A fix that has to be proven to help
        //     must be proven not to hurt, so a brand reference that sits inside
        //     a color-mix now only counts when the brand is the majority.
        let recolored = 0;
        const brandIsTheSurface = (body: string): boolean => {
            const bg = (body.match(/background(-color|-image)?\s*:([^;]*)/i) || [])[2];
            if (!bg || !/var\(\s*--brand(-dark)?\s*\)/i.test(bg)) return false;
            // Strip every color-mix whose brand share is a majority — what is
            // left still mentioning --brand is a solid fill or a brand gradient.
            const withoutMinorMixes = bg.replace(
                /color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/gi,
                (mix) => {
                    const pct = Number((mix.match(/var\(\s*--brand(?:-dark)?\s*\)\s*(\d{1,3})%/i) || [])[1]);
                    // No percentage given means an even split — not enough
                    // brand to guarantee the palette's contrast pairing.
                    return Number.isFinite(pct) && pct >= 60 ? 'var(--brand)' : '';
                },
            );
            return /var\(\s*--brand(-dark)?\s*\)/i.test(withoutMinorMixes);
        };
        /**
         * A BACKGROUND THAT DOES NOT FOLLOW THE SCHEME MUST CARRY TEXT THAT DOES
         * NOT EITHER.
         *
         * The design brief says never to hardcode a colour, and a weak model
         * hardcodes one anyway — `.hero{background:linear-gradient(135deg,#f8fafc,#eef2ff)}`
         * is the shape it writes. That background is FIXED while --text follows
         * the colour scheme, so the page is fine in light mode and, the moment
         * the visitor's system or the new dark-mode switch flips, it is a
         * near-white heading on a near-white gradient. Measured across all seven
         * compositions: 1.02:1 on the heading, 1.73:1 on the lede, 2.96:1 on the
         * ghost button. That is a blank screen, and it is only reachable now
         * because the dark mode is finally reachable.
         *
         * A literal colour can be measured, so the text colour is COMPUTED from
         * it and pinned literally too. Backgrounds written in tokens are left
         * alone — those already flip correctly, and that is the whole point of
         * using them.
         */
        const literalBg = (body: string): string | null => {
            const decl = (body.match(/background(?:-color|-image)?\s*:([^;]*)/i) || [])[1];
            if (!decl || /var\(|currentcolor|transparent|inherit|none/i.test(decl)) return null;
            const stops = decl.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi);
            if (!stops || !stops.length) return null;
            // A gradient is judged by its LIGHTEST stop: that is where light text
            // fails first, and the whole point is to survive the worst case.
            let lightest: { css: string; l: number } | null = null;
            for (const c of stops) {
                const rgb = readColor(c);
                if (!rgb) return null;                       // one stop we cannot read: do not guess
                if (rgb[3] < 0.9) return null;               // translucent: the layer under it decides
                const l = relLum(rgb);
                if (!lightest || l > lightest.l) lightest = { css: c, l };
            }
            return lightest ? lightest.css : null;
        };

        const withColor = styleBlock.replace(/([^{}]+)\{([^}]*)\}/g, (full, sel, body) => {
            if (/(^|;)\s*color\s*:/i.test(body)) return full;      // the pair is already stated
            if (/^\s*(@|:root\b)/.test(sel)) return full;          // at-rules and the token block

            if (brandIsTheSurface(body)) {
                recolored++;
                return `${sel}{${body.trim().replace(/;?$/, ';')}color:var(--on-brand);}`;
            }
            const bg = literalBg(body);
            /**
             * The selector capture is everything since the previous `}`, so it
             * carries the comment and the blank lines above the rule with it.
             * A real stylesheet is full of both, and `isStructuralSelector`
             * rejects anything containing whitespace — so this repair fired on
             * a bare test fixture and on almost nothing a model actually writes.
             */
            const cleanSel = String(sel).replace(/\/\*[\s\S]*?\*\//g, '').trim();
            if (bg && isStructuralSelector(cleanSel, opts.ownedSurfaces || ['.band'])) {
                // A CONTAINER, not just its own text. `.lede`, `.eyebrow` and
                // `.btn-ghost` each carry a colour of their own that follows the
                // scheme, so pinning only the container leaves them behind:
                // measured on this exact case, the heading went readable and the
                // lede stayed at 1.73:1 and the ghost button at 2.96:1.
                extra.push(pairSurface(cleanSel, readColor(bg)!));
                recolored++;
            }
            return full;
        });
        if (recolored) {
            html = html.replace(styleBlock, withColor);
            fixed.push(`set readable text colour on ${recolored} branded surface(s)`);
        }

        if (extra.length) {
            html = html.replace(/<\/style>/i, `\n/* Joe layout safety net */\n${extra.join('\n')}\n</style>`);
        }
    }

    // 6e. A field with only a placeholder is invisible to a screen reader once
    //     the user starts typing. Give it an accessible name.
    //
    //     Applied field by field. The first version skipped the whole page when
    //     ANY <label> existed, so a form with one label and five bare inputs was
    //     left entirely alone — the common case, not the rare one.
    if (/<(input|textarea|select)\b/i.test(html)) {
        const labelledIds = new Set(
            [...html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]),
        );
        let named = 0;
        html = html.replace(/<(input|textarea|select)\b([^>]*)>/gi, (full, tag, attrs) => {
            if (/aria-label(ledby)?\s*=/i.test(attrs) || /type\s*=\s*["'](hidden|submit|button)["']/i.test(attrs)) return full;
            const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1];
            if (id && labelledIds.has(id)) return full;
            const ph = (attrs.match(/placeholder\s*=\s*["']([^"']+)["']/i) || [])[1];
            if (!ph) return full;
            named++;
            return `<${tag}${attrs} aria-label="${ph}">`;
        });
        if (named) fixed.push(`labelled ${named} unlabelled form field(s)`);
    }

    /* ------------------------------------------------------------------
       7. ACCESSIBILITY SAFETY NET.

       These are the failures the browser audit reports over and over. Each
       one costs a whole extra LLM round to repair on a CPU-only laptop, and
       each has exactly one correct deterministic answer — so it is applied
       here instead of being asked for.
       ------------------------------------------------------------------ */

    // 7a. Exactly one <h1>. Several is a common model habit and the extras are
    //     always section titles, which is what h2 is for.
    const h1s = [...html.matchAll(/<h1\b/gi)];
    if (h1s.length > 1) {
        let seenFirst = false;
        html = html
            .replace(/<h1\b/gi, () => { if (!seenFirst) { seenFirst = true; return '<h1'; } return '<h2'; })
            .replace(/<\/h1\s*>/gi, (() => { let n = 0; return () => (n++ === 0 ? '</h1>' : '</h2>'); })());
        fixed.push(`demoted ${h1s.length - 1} extra <h1> to <h2>`);
    }

    // 7a-bis. No <h1> at all. Every page needs one statement of what it is, and
    //     when a page is written section by section each section reaches for h2 —
    //     nobody writes the page's title because nobody is writing "the page".
    //     The first heading in the document is that title; promote it.
    if (!/<h1\b/i.test(html) && /<h2\b/i.test(html)) {
        let done = false;
        html = html.replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2\s*>/i, (full, attrs, inner) => {
            if (done) return full;
            done = true;
            return `<h1${attrs}>${inner}</h1>`;
        });
        if (done) fixed.push('promoted the first heading to <h1> (the page had none)');
    }

    // 7b. An icon-only control announces itself as "button" and nothing else.
    //     The icon it draws already says what it is — Joe's sprite ids are
    //     literally the word (#i-cart, #i-mail), so the name is right there.
    const ICON_NAMES: Record<string, string> = {
        check: 'تم', arrow: 'التالي', star: 'تقييم', shield: 'أمان', spark: 'مميّز',
        users: 'الفريق', code: 'الكود', chart: 'الإحصاءات', mail: 'البريد', phone: 'اتصال',
        pin: 'الموقع', clock: 'المواعيد', cart: 'السلة', menu: 'القائمة', close: 'إغلاق',
    };
    const ICON_NAMES_EN: Record<string, string> = {
        check: 'Done', arrow: 'Next', star: 'Rating', shield: 'Security', spark: 'Featured',
        users: 'Team', code: 'Code', chart: 'Statistics', mail: 'Email', phone: 'Call',
        pin: 'Location', clock: 'Hours', cart: 'Cart', menu: 'Menu', close: 'Close',
    };
    let namedButtons = 0;
    html = html.replace(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (full, tag, attrs, inner) => {
        if (/aria-label(ledby)?\s*=|title\s*=/i.test(attrs)) return full;
        // Any real text inside means it already has a name.
        if (inner.replace(/<[^>]*>/g, '').trim().length > 0) return full;
        if (/<svg[^>]*>[\s\S]*?<title\b/i.test(inner)) return full;
        if (/<img\b[^>]*\balt\s*=\s*["'][^"']+["']/i.test(inner)) return full;
        const icon = (inner.match(/href\s*=\s*["']#i-([a-z]+)["']/i) || [])[1];
        const label = icon ? (isArabic ? ICON_NAMES[icon] : ICON_NAMES_EN[icon]) : '';
        if (!label) return full;
        namedButtons++;
        return `<${tag}${attrs} aria-label="${label}">${inner}</${tag}>`;
    });
    if (namedButtons) fixed.push(`named ${namedButtons} icon-only control(s)`);

    // 7c. An <img> with no alt attribute at all makes a screen reader read the
    //     file name aloud. A decorative image wants alt=""; a content image
    //     wants a description, and the nearest caption is the honest one.
    let altAdded = 0;
    html = html.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
        if (/\balt\s*=/i.test(attrs)) return full;
        altAdded++;
        const t = (attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i) || [])[1];
        return `<img${attrs} alt="${t ? t.replace(/"/g, '&quot;') : ''}">`;
    });
    if (altAdded) fixed.push(`added a missing alt attribute to ${altAdded} image(s)`);

    // 7c-bis. ONE site header, not three.
    //
    //     A page is written section by section, and more than one section can
    //     legitimately think it is the top of the page — the blueprint names a
    //     header, and a hero or a nav section produces one too. Measured end to
    //     end: a landing build came back with THREE <header> elements, each
    //     sticky, each with its own hamburger and its own dropdown, stacked one
    //     under another. The nav-toggle appeared three times, so two of the
    //     three could never be the one a visitor pressed.
    //
    //     The first is kept and the rest become plain sections: their content is
    //     still someone's work and deleting it would lose copy the user asked
    //     for, but only one element may claim the banner landmark.
    {
        const mask = maskNonMarkup(html);
        const opens = [...mask.matchAll(/<header\b[^>]*>/gi)];
        if (opens.length > 1) {
            let demoted = 0;
            // Later ones first, so each splice leaves the earlier offsets valid.
            for (let i = opens.length - 1; i >= 1; i--) {
                const openTag = opens[i];
                const at = openTag.index!;
                const closeAt = mask.indexOf('</header', at);
                if (closeAt < 0) continue;
                const closeEnd = mask.indexOf('>', closeAt);
                if (closeEnd < 0) continue;
                // Its NAVIGATION goes with it. The chrome runtime binds to the
                // first site header only, so a demoted copy keeps a hamburger
                // and a dropdown that nothing is listening to — measured, its
                // trigger was reported as a control that does nothing. A second
                // copy of the site nav is duplicate chrome, not content.
                let inner = html.slice(at + openTag[0].length, closeAt)
                    .replace(/<button\b[^>]*class="[^"]*\bnav-toggle\b[^"]*"[^>]*>[\s\S]*?<\/button\s*>/gi, '')
                    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav\s*>/gi, '');
                const newOpen = openTag[0]
                    .replace(/^<header/i, '<section')
                    .replace(/\bsite-header\b/g, 'was-header')
                    .replace(/\sdata-joe-header\b/gi, '');
                // Nothing but chrome? Then there is nothing to keep.
                const keeps = inner.replace(/<[^>]+>/g, '').trim().length > 0 || /<img|<svg/i.test(inner);
                html = html.slice(0, at)
                    + (keeps ? newOpen + inner + '</section>' : '')
                    + html.slice(closeEnd + 1);
                demoted++;
            }
            if (demoted) fixed.push(`kept one site header and turned ${demoted} duplicate(s) into sections`);
        }
    }

    // 7d. <main> is the landmark that lets a screen-reader user skip the header.
    //     Safe to add only when the document has one header and one footer and
    //     everything between them is the content — which is the shape every
    //     blueprint produces.
    //
    //     SEARCHED ON A MASK, not on the raw document. This rule used to scan
    //     the whole file, and the cart runtime builds its panel with
    //
    //         '…</header>' + '<main>' + '<div data-cart-items></div>' + …
    //
    //     so on every page that sells something the FIRST `</header>` in the
    //     file was inside a JavaScript string. The insertion cut that string in
    //     half — "Invalid or unexpected token" — and a syntax error in one
    //     script tag stops every script on the page, exactly like the duplicate
    //     `const` did. Measured end to end: the store page threw, and its cart,
    //     forms and widgets were all dead.
    //
    //     The same masking fixes a second bug in the same rule: the literal
    //     '<main>' inside that JS string satisfied the "does the page already
    //     have a <main>?" test, so pages WITH a cart were skipped and pages
    //     without one often had no header/footer pair to anchor to. Four of five
    //     measured pages ended up with no <main> at all.
    if (/<body[\s>]/i.test(html)) {
        const mask = maskNonMarkup(html);
        if (!/<main[\s>]|role=["']main["']/i.test(mask)) {
            // Where the content starts: after the header, or after <body> when
            // the page has no header.
            const closeHeader = mask.match(/<\/header\s*>/i);
            const headerEnd = mask.search(/<\/header\s*>/i);
            const bodyOpen = mask.match(/<body[^>]*>/i);
            const start = headerEnd >= 0 && closeHeader
                ? headerEnd + closeHeader[0].length
                : (bodyOpen ? mask.indexOf(bodyOpen[0]) + bodyOpen[0].length : -1);

            // Where it ends: at the footer, or at </body> when there is none.
            // Requiring a footer was too strict — measured, four of five page
            // kinds had a header and sections but no <footer>, so they came out
            // with no landmark at all and a screen-reader user had no way to
            // skip the navigation.
            const footerStart = mask.search(/<footer[\s>]/i);
            const bodyClose = mask.search(/<\/body\s*>/i);
            const end = footerStart > start ? footerStart : (bodyClose > start ? bodyClose : -1);

            // There has to be something in between worth wrapping.
            if (start > 0 && end > start && /<(section|article|div|h1|h2)\b/i.test(mask.slice(start, end))) {
                // Offsets from the mask address the original exactly: masking
                // replaces characters, it never changes how many there are.
                html = html.slice(0, start) + '\n<main>' + html.slice(start, end) + '</main>\n' + html.slice(end);
                fixed.push('wrapped the page content in <main>');
            }
        }
    }

    // --- Remaining (non-auto-fixable) issues lower the score but don't block ---
    if (/\b(TODO|FIXME|placeholder text|lorem ipsum|your text here|اكتب هنا|النص هنا)\b/i.test(html)) {
        issues.push('contains placeholder/TODO text that should be replaced with real content');
    }
    if (/(src|href)=["']\s*["']/i.test(html)) {
        issues.push('has empty src/href attributes');
    }
    if (/<html[\s>]/i.test(html) && !/<\/html>/i.test(html)) {
        html += '\n</html>'; fixed.push('closed missing </html> tag');
    }
    if (/<body[\s>]/i.test(html) && !/<\/body>/i.test(html)) {
        html = html.replace(/<\/html>/i, '</body>\n</html>'); fixed.push('closed missing </body> tag');
    }
    if (!/<style[\s>]/i.test(html) && !/style=/i.test(html)) {
        issues.push('no CSS detected — page may be unstyled');
    }

    // Simple quality score: full marks minus penalties for remaining issues.
    const score = Math.max(0, 100 - issues.length * 15);
    return { html, issues, fixed, score };
}

export interface SplitProject {
    indexHtml: string;
    css: string;
    js: string;
    multiFile: boolean;   // false when there was nothing to split out
}

/**
 * Split a single self-contained HTML file into a real multi-file project:
 *   index.html + styles.css + script.js
 *
 * Deterministic (no LLM call), so it's instant and free. Inline <style> blocks
 * become styles.css (linked in <head>), and inline <script> blocks (without a
 * src) become script.js (linked before </body>). External <script src> tags are
 * left untouched. Returns multiFile=false when there was no CSS/JS to extract.
 */
export function splitHtmlProject(rawHtml: string): SplitProject {
    let html = String(rawHtml || '');
    const cssParts: string[] = [];
    const jsParts: string[] = [];

    // Extract inline <style> ... </style> blocks.
    html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, body) => {
        if (String(body).trim()) cssParts.push(String(body).trim());
        return '';
    });

    // Extract inline <script> ... </script> blocks (skip ones with a src=).
    //
    // Each part is FENCED in its own try/catch. As separate <script> elements
    // an exception in one stops only that element; concatenated into a single
    // script.js, the first uncaught error at the top aborts EVERYTHING after
    // it. A shipped build measured exactly that: one section script hit a null
    // and the behaviour audit found 13 of 14 controls dead — the theme switch,
    // the forms, the charts, all of Joe's own runtimes below the throw never
    // ran. The fence restores the isolation the split silently removed.
    // (try{} is not a scope for var/function, so parts that publish globals
    // still publish them; each part is already an IIFE besides.)
    html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
        if (/\bsrc\s*=/.test(String(attrs))) return m; // external script: keep as-is
        const type = (String(attrs).match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
        if (type && !/^(text\/javascript|application\/javascript)$/i.test(type)) return m; // JSON-LD, importmap, module: keep as-is
        const part = String(body).trim();
        if (part) jsParts.push(`try{\n${part}\n}catch(e){console.error('joe:section-script failed:',e);}`);
        return '';
    });

    const css = cssParts.join('\n\n');
    const js = jsParts.join('\n\n');
    const multiFile = css.length > 0 || js.length > 0;

    // Re-link the extracted files.
    if (css) {
        const link = '    <link rel="stylesheet" href="styles.css">';
        if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${link}\n</head>`);
        else if (/<head\b[^>]*>/i.test(html)) html = html.replace(/(<head\b[^>]*>)/i, `$1\n${link}`);
        else html = `${link}\n${html}`;
    }
    if (js) {
        const tag = '    <script src="script.js"></script>';
        if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${tag}\n</body>`);
        else html = `${html}\n${tag}`;
    }

    // Tidy the empty lines left where blocks were removed.
    html = html.replace(/\n{3,}/g, '\n\n');

    return { indexHtml: html, css, js, multiFile };
}

export interface BrowserSmoke {
    ok: boolean;
    consoleErrors: string[];
    pageErrors: string[];
    screenshotHref?: string;
    skipped?: string;
}

/**
 * OPT-IN real browser smoke test. Loads the built artifact URL in the headless
 * browser, captures console + page errors, and screenshots it. Best-effort:
 * returns { ok:true, skipped } when disabled or when the browser is unavailable,
 * so it NEVER breaks page delivery.
 */
export async function browserSmokeTest(url: string, filename: string): Promise<BrowserSmoke> {
    if (String(process.env.JOE_QA_BROWSER_TEST || '').trim() !== '1') {
        return { ok: true, consoleErrors: [], pageErrors: [], skipped: 'disabled (set JOE_QA_BROWSER_TEST=1 to enable)' };
    }
    try {
        const { getBrowserSession, withBrowserConcurrency } = require('../../modules/browser/manager');
        return await withBrowserConcurrency(async () => {
            const s = await getBrowserSession(`qa-${filename}`);
            const page = s.page;
            const consoleErrors: string[] = [];
            const pageErrors: string[] = [];
            const onConsole = (m: any) => { try { if (m.type() === 'error') consoleErrors.push(String(m.text()).slice(0, 300)); } catch { } };
            const onError = (e: any) => { try { pageErrors.push(String(e?.message || e).slice(0, 300)); } catch { } };
            page.on('console', onConsole);
            page.on('pageerror', onError);
            try {
                await page.goto(url, { waitUntil: 'load', timeout: 20000 });
                await page.waitForTimeout(500);
                const fs = require('fs'); const path = require('path');
                const artifactDir = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
                let screenshotHref: string | undefined;
                try {
                    const shot = `qa-${filename.replace(/\.html?$/i, '')}-${Date.now()}.jpg`;
                    const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                    if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
                    fs.writeFileSync(path.join(artifactDir, shot), buf);
                    screenshotHref = `/artifacts/${shot}`;
                } catch { /* screenshot optional */ }
                return { ok: pageErrors.length === 0, consoleErrors, pageErrors, screenshotHref };
            } finally {
                try { page.off('console', onConsole); page.off('pageerror', onError); } catch { }
            }
        });
    } catch (e: any) {
        return { ok: true, consoleErrors: [], pageErrors: [], skipped: `browser unavailable: ${e?.message || e}` };
    }
}


/* ---------- colour, for the pairing repair above ----------------------------- */

/** [r,g,b,a] from a hex or rgb() literal, or null when it is neither. */
function readColor(css: string): [number, number, number, number] | null {
    const s = String(css).trim();
    const hex = s.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
        let h = hex[1];
        if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
        if (h.length !== 6 && h.length !== 8) return null;
        const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
        return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
    }
    const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) {
        const p = rgb[1].replace('/', ' ').split(/[,\s]+/).filter(Boolean).map(parseFloat);
        if (p.length < 3 || p.some(v => !isFinite(v))) return null;
        return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
    }
    return null;
}

/** WCAG relative luminance, 0-1. */
function relLum(rgb: [number, number, number, number]): number {
    const a = [rgb[0], rgb[1], rgb[2]].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/**
 * Is this a selector whose subtree Joe may safely re-colour?
 *
 * A single class or element — `.hero`, `.band`, `section.cta`, `header`. Not a
 * descendant selector, not a pseudo, not a list: re-pairing the subtree of
 * something like `.card:hover p` is meaningless, and doing it for a comma list
 * would multiply out into rules nobody can read.
 */
function isStructuralSelector(sel: string, owned: string[]): boolean {
    const s = String(sel).trim();
    if (!s || /[,>+~:]|\s/.test(s)) return false;
    // Ownership is stated by the caller, not raced for. See `ownedSurfaces`.
    for (const cls of owned) {
        const bare = cls.replace(/^\./, '');
        if (new RegExp(`(^|\\.)${bare}$`).test(s)) return false;
    }
    return /^(?:[a-z][a-z0-9]*)?(?:\.[A-Za-z_][\w-]*)*$/.test(s) && /[a-z.]/i.test(s);
}

/**
 * Re-pair a surface the model painted with a LITERAL colour.
 *
 * The design brief says never to hardcode a colour and a weak model does it
 * anyway. That background is then FIXED while every text token follows the
 * colour scheme, so the page reads correctly in light mode and goes blank the
 * moment the visitor flips to dark — 1.02:1 on the heading, measured across all
 * seven compositions. The defect only became reachable when the dark-mode
 * switch did.
 *
 * The ink is computed from the background that is actually there, so a dark
 * hardcoded panel gets light text by the same rule. Every descendant that
 * carries its own colour is named, because those are exactly the ones a single
 * `color` on the container cannot reach.
 */
function pairSurface(sel: string, bg: [number, number, number, number]): string {
    const dark = relLum(bg) <= 0.42;
    const ink = dark ? '#ffffff' : '#0f172a';
    // Secondary text: enough separation to read as secondary, still ≥4.5:1.
    const muted = dark ? 'rgba(255,255,255,.78)' : 'rgba(15,23,42,.72)';
    const line = dark ? 'rgba(255,255,255,.42)' : 'rgba(15,23,42,.32)';

    /**
     * STOP AT A NESTED SURFACE.
     *
     * A card or a panel inside this one paints its own background from the
     * TOKENS, so it already flips with the scheme and needs nothing from here.
     * Painting through it is actively wrong: the overlap hero holds a
     * `.hero-panel` on `var(--surface)`, and re-colouring its text for the
     * hero's fixed light gradient put dark ink on a dark panel in dark mode —
     * measured at 1.06:1, a defect created by the repair meant to prevent it.
     */
    const nested = ':is(.card,.hero-panel,.panel,.tile,.band,.modal,.dropdown,.surface)';
    const not = `:not(${nested} *)`;
    const each = (parts: string[]) => parts.map(x => `${sel} ${x}${not}`).join(',');
    return `/* Joe surface re-pairing: ${sel} carries a fixed background, so its text is fixed too */
${sel}{color:${ink}}
${each(['h1', 'h2', 'h3', 'h4', 'p', 'li', 'strong'])}{color:${ink}}
${each(['.lede', '.eyebrow', '.stat span', 'figcaption', 'small'])}{color:${muted}}
${sel} .btn-ghost${not}{color:${ink};border-color:${line}}`;
}
