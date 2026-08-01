/**
 * Write the page one section at a time.
 *
 * A complete store page is 25-40 KB of HTML. Groq's free tier caps a single
 * completion at ~4000 tokens — about 12 KB, less in Arabic — so the model was
 * physically unable to finish, stopped mid-element, and the build stitched the
 * rest together with blind "continue from here" prompts. Those continuations are
 * the worst text the model produces: it cannot see the design system any more,
 * only the last 2400 characters of its own output, so the second half of every
 * long page came out visibly weaker than the first.
 *
 * The fix is not a bigger context. It is to stop asking for the whole page in
 * one breath. Each section is a small, focused piece of work the model can
 * actually do well, and it gets the full design system every time — the tokens,
 * the layout classes, the primitives — plus a short note on what the earlier
 * sections already said, so the page does not repeat itself.
 *
 * The result is assembled here, deterministically. Nothing is invented in this
 * module: if a section comes back empty, it is reported as missing rather than
 * papered over.
 */

export interface SectionPlan {
    /** 1-based position. */
    index: number;
    /** The blueprint line describing what this section is. */
    spec: string;
    /** Short id used for the anchor and for progress messages. */
    id: string;
}

export interface WrittenSection extends SectionPlan {
    html: string;
    ok: boolean;
    reason?: string;
}

/** A stable, readable id from the first words of the blueprint line. */
function sectionId(spec: string, index: number): string {
    const head = spec.split(':')[0].toLowerCase();
    const words = head.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
        .filter(w => w && !['a', 'an', 'the', 'with', 'and', 'or', 'of', 'to'].includes(w));
    // Whole words only — "customer-reviews-with-na" is a broken-looking anchor in
    // a URL the visitor can see.
    const slug: string[] = [];
    for (const w of words) {
        if (slug.join('-').length + w.length + 1 > 24) break;
        slug.push(w);
    }
    return slug.join('-') || `section-${index}`;
}

export function planSections(blueprint: string[]): SectionPlan[] {
    return blueprint.map((spec, i) => ({ index: i + 1, spec, id: sectionId(spec, i + 1) }));
}

/**
 * The system prompt for ONE section. Deliberately short: everything the model
 * needs and nothing it can wander into. It never sees the rest of the page, so
 * it cannot spend its budget re-writing what is already written.
 */
export function sectionPrompt(opts: {
    plan: SectionPlan;
    total: number;
    kindLabel: string;
    request: string;
    isArabic: boolean;
    /** Palette tokens + composition + primitives, verbatim. */
    designBrief: string;
    /** Titles of the sections already written, so this one does not repeat them. */
    written: string[];
    /** How many photographs are still in the budget. */
    photosLeft: number;
    imageSubjects: string[];
}): string {
    const { plan, total, kindLabel, request, isArabic, designBrief, written, photosLeft, imageSubjects } = opts;
    return `You are writing ONE section of a ${kindLabel}. Not the page — one section.

THE BUSINESS: ${request}

SECTION ${plan.index} OF ${total}: ${plan.spec}

OUTPUT RULES — these are absolute:
- Output ONLY the markup for this one section. No <html>, no <head>, no <body>, no <style>,
  no markdown fences, no explanation before or after.
- It must be a single <section class="section" id="${plan.id}"> … </section> element
  (or <header class="site-header"> if this section IS the page header, or <footer> if it is
  the footer). Put the content inside <div class="wrap">…</div>.
- Write REAL content for this exact business: real names, real prices, real sentences.
  Never "Lorem ipsum", never "Your text here", never href="#" on a primary action.
- Any interaction you show must work; put its JavaScript in a <script> tag at the END of
  your section. It may only touch elements inside this section.
${isArabic ? '- Write in natural Arabic, as an Arabic copywriter would — not translated English.\n' : ''}${photosLeft > 0
            ? `- Photographs: write src="{{IMAGE:slot|specific english subject}}" where a real photo belongs
  (slots: hero, banner, card, gallery, thumb, avatar). Up to ${photosLeft} in this section, each with a
  different subject and a real alt.${imageSubjects.length ? ` Subjects that fit: ${imageSubjects.slice(0, 6).join('; ')}.` : ''}`
            : '- No photographs in this section: use the icon sprite, gradients and type.'}
${written.length ? `\nALREADY WRITTEN, do not repeat any of it: ${written.join(' | ')}.` : ''}

${designBrief}`;
}

/**
 * Give every section's script its own scope.
 *
 * Each section is written by a separate call that cannot see the others, so two
 * of them naturally reach for the same obvious name. A page Joe shipped had
 * `const cards = document.querySelectorAll('.card')` in both its services
 * section and its testimonials section, and the browser answered:
 *
 *     Identifier 'cards' has already been declared
 *
 * That is not a broken hover effect. A duplicate top-level declaration is a
 * SyntaxError, and the failure is not contained to the feature that caused it:
 * every script on the page stops, including the form validation, the counters
 * and the widget runtime Joe injects itself. The measured build reported
 * 40/100 on interaction and "4 of 10 buttons do nothing" — one collision.
 *
 * Telling the model to pick unique names is not enforcement; it cannot see the
 * other sections to know what is taken. An IIFE makes the collision impossible
 * instead of unlikely, and costs the section nothing: everything it does — query
 * the DOM, bind listeners, read data attributes — works identically inside one.
 *
 * A script with a `src`, or a `type` that is not JavaScript (JSON-LD, importmap,
 * a template), is left exactly as it is. Wrapping those would corrupt them.
 */
export function isolateSectionScripts(html: string): string {
    return String(html || '').replace(
        /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
        (whole, attrs: string, body: string) => {
            if (/\bsrc\s*=/i.test(attrs)) return whole;
            const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
            if (type && !/^(text\/javascript|application\/javascript|module)$/i.test(type)) return whole;
            // A module already has its own scope; wrapping it would break a
            // top-level await inside it.
            if (/^module$/i.test(type || '')) return whole;
            if (!body.trim()) return whole;
            return `<script${attrs}>\n(function(){\n${body}\n})();\n</script>`;
        },
    );
}

/** Pull a usable section out of whatever the model returned. */
export function extractSection(raw: string, id: string): { html: string; ok: boolean; reason?: string } {
    let out = String(raw || '').trim();
    const fence = out.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fence) out = fence[1].trim();
    // A model that ignored the instruction and produced a whole document: keep
    // only what is inside its body, which is the section it was asked for.
    const bodyOpen = out.search(/<body[^>]*>/i);
    if (bodyOpen >= 0) {
        out = out.slice(out.indexOf('>', bodyOpen) + 1);
        out = out.replace(/<\/body[\s\S]*$/i, '');
    }
    out = out.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?html[^>]*>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '').trim();

    if (!out) return { html: '', ok: false, reason: 'the model returned nothing' };
    // It must be a real block, not a stray sentence.
    if (!/<(section|header|footer|div|article|nav)\b/i.test(out)) {
        return { html: '', ok: false, reason: 'no section markup in the response' };
    }
    // An unterminated element would swallow every section after it.
    const opens = (out.match(/<(section|header|footer|main|article)\b/gi) || []).length;
    const closes = (out.match(/<\/(section|header|footer|main|article)\s*>/gi) || []).length;
    if (closes < opens) {
        // Close what it left open rather than discard usable work.
        const missing = opens - closes;
        out += '\n' + '</section>'.repeat(missing);
    }
    // Guarantee the anchor the navigation will point at — replacing the model's
    // own id rather than adding a second one. Two id attributes on one element is
    // invalid, and the browser keeps the FIRST, so appending would have silently
    // pointed every nav link at nothing.
    if (!new RegExp(`id\\s*=\\s*["']${id}["']`).test(out)) {
        const opener = out.match(/<(section|header|footer|div|article|nav)\b[^>]*>/i);
        if (opener) {
            const replaced = /\bid\s*=\s*["'][^"']*["']/i.test(opener[0])
                ? opener[0].replace(/\bid\s*=\s*["'][^"']*["']/i, `id="${id}"`)
                : opener[0].replace(/^<(\w+)/, `<$1 id="${id}"`);
            out = out.replace(opener[0], replaced);
        }
    }
    // Done last, so the scoping applies to whatever survived the repairs above.
    return { html: isolateSectionScripts(out), ok: true };
}

/**
 * Assemble the document. Deterministic — the head, the token block and the base
 * layer are Joe's, not the model's, so they cannot be forgotten or malformed.
 */
export function assemblePage(opts: {
    title: string;
    isArabic: boolean;
    tokenCss: string;
    baseLayer: string;
    sections: WrittenSection[];
    /** Injected once, after <body>. */
    sprite: string;
    /** Injected once, before </body>. */
    script: string;
    /** Search-result snippet; composed by page-head, never the raw request. */
    description?: string;
}): string {
    const { title, isArabic, tokenCss, baseLayer, sections, sprite, script, description } = opts;
    const body = sections.filter(s => s.ok).map(s => s.html).join('\n\n');
    const descTag = (description || '').trim()
        ? `\n<meta name="description" content="${String(description).replace(/[<>"]/g, '').trim()}">`
        : '';
    return `<!DOCTYPE html>
<html lang="${isArabic ? 'ar' : 'en'}"${isArabic ? ' dir="rtl"' : ''}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">${descTag}
<title>${title.replace(/[<>&"]/g, '')}</title>
<style>
${baseLayer}
${tokenCss}
</style>
</head>
<body>
${sprite}
${body}
${script}
</body>
</html>`;
}

/**
 * Should this page be written section by section?
 *
 * Short pages are better in one pass: one call is faster on a CPU-only laptop
 * and the model keeps the whole page coherent. Long ones cannot be written in
 * one pass at all — that is the case this exists for.
 */
export function shouldWriteSectionwise(blueprint: string[]): boolean {
    const mode = String(process.env.JOE_SECTIONWISE || 'auto').toLowerCase();
    if (mode === '0' || mode === 'off') return false;
    if (mode === '1' || mode === 'always') return true;
    return blueprint.length >= 6;
}
