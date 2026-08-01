/**
 * Style guard — a model-written section cannot break the rest of the page.
 *
 * Sections are asked to use the page's design tokens and nothing else, but an
 * instruction in a prompt is not enforcement. Real builds came back with a
 * <style> block INSIDE a section that redeclared :root tokens, restyled `body`,
 * or set `p { color:#fff }` — and every other section paid for it. Inline
 * styles bring their own classics: `position:fixed` banners that ride over the
 * whole page, hard 1200px widths that cause the sideways scroll the visual
 * audit keeps flagging, and five-digit z-indexes.
 *
 * The guard is deterministic, like the repair engine:
 *  - rules that CANNOT be scoped to the section (:root, html, body, *) are
 *    removed — `#hero body` matches nothing, so scoping is not an option;
 *  - a bare `.section` selector (all sections!) becomes this section only;
 *  - every other selector is prefixed with the section's #id, so the model
 *    keeps its styling — confined to the section that asked for it;
 *  - @keyframes are renamed per section so two sections' `fadeIn` cannot fight;
 *  - inline position:fixed → relative, huge fixed widths → max-width:100%,
 *    runaway z-index capped.
 * Every intervention is recorded, in Arabic, for the build log.
 */

export interface StyleGuardResult {
    html: string;
    /** Machine-readable action tags, e.g. 'dropped-global:body'. */
    actions: string[];
    /** One human line per action class, for the build log. */
    notesAr: string[];
}

/** Selectors that target the whole document — unscopable, must be dropped. */
const GLOBAL_SELECTOR = /^(?::root|html|body|\*)\s*(?:$|[\s>+~[:.,])/i;

function scopeSelectorList(selectors: string, sid: string, dropped: Set<string>): string | null {
    const scoped: string[] = [];
    for (const raw of selectors.split(',')) {
        const sel = raw.trim();
        if (!sel) continue;
        if (GLOBAL_SELECTOR.test(sel)) { dropped.add(sel.split(/[\s>+~[.:,]/)[0] || sel); continue; }
        // `.section` alone means EVERY section — retarget to this one.
        if (/^\.section$/i.test(sel)) { scoped.push(`#${sid}`); continue; }
        if (sel.includes(`#${sid}`)) { scoped.push(sel); continue; }
        scoped.push(`#${sid} ${sel}`);
    }
    return scoped.length ? scoped.join(', ') : null;
}

/** Scope a flat CSS body (no nested at-rules inside). */
function scopeFlatCss(css: string, sid: string, dropped: Set<string>): string {
    return css.replace(/([^{}]+)\{([^{}]*)\}/g, (whole, selectors: string, body: string) => {
        const s = selectors.trim();
        if (s.startsWith('@')) return whole; // @font-face, @page — leave as-is
        const scoped = scopeSelectorList(s, sid, dropped);
        return scoped ? `${scoped}{${body}}` : '';
    });
}

/** Scope one <style> block: handles @media/@supports one level deep. */
function scopeStyleBlock(css: string, sid: string, dropped: Set<string>): string {
    // Rename @keyframes so two sections' identically-named animations never fight.
    const kfNames: string[] = [];
    let out = css.replace(/@keyframes\s+([A-Za-z_][\w-]*)/g, (_w, name: string) => {
        kfNames.push(name);
        return `@keyframes ${name}-${sid}`;
    });
    for (const name of kfNames) {
        out = out.replace(
            new RegExp(`(animation(?:-name)?\\s*:\\s*[^;}]*)\\b${name}\\b`, 'g'),
            (_w, head: string) => `${head}${name}-${sid}`,
        );
    }
    // At-rule wrappers keep their prelude; their INNER rules get scoped.
    out = out.replace(/@(media|supports)([^{]*)\{([\s\S]*?)\}\s*\}/g,
        (_w, at: string, cond: string, inner: string) =>
            `@${at}${cond}{${scopeFlatCss(inner + '}', sid, dropped)}}`.replace(/\}\}$/, '}'));
    // Everything outside at-rules.
    const parts: string[] = [];
    let last = 0;
    const atRe = /@(?:media|supports)[^{]*\{/g;
    let m: RegExpExecArray | null;
    while ((m = atRe.exec(out))) {
        parts.push(scopeFlatCss(out.slice(last, m.index), sid, dropped));
        // Skip the balanced at-block (already handled above).
        let depth = 1, i = atRe.lastIndex;
        while (i < out.length && depth > 0) {
            if (out[i] === '{') depth++;
            else if (out[i] === '}') depth--;
            i++;
        }
        parts.push(out.slice(m.index, i));
        last = i;
        atRe.lastIndex = i;
    }
    parts.push(scopeFlatCss(out.slice(last), sid, dropped));
    return parts.join('');
}

export function guardSectionStyles(html: string, sectionId?: string): StyleGuardResult {
    const actions: string[] = [];
    const notesAr: string[] = [];
    let out = html;
    const sid = String(sectionId || '').trim();

    // ── <style> blocks inside the section ───────────────────────────────
    out = out.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_whole, css: string) => {
        const dropped = new Set<string>();
        // Token hijack: a section redeclaring :root variables changes EVERY
        // section's colours. Always removed (also caught by GLOBAL_SELECTOR,
        // but named separately because it is the worst offender).
        const hadRoot = /:root\s*\{/i.test(css);
        const scoped = sid ? scopeStyleBlock(css, sid, dropped) : css.replace(/([^{}]+)\{([^{}]*)\}/g,
            (whole: string, selectors: string) =>
                GLOBAL_SELECTOR.test(selectors.trim()) ? (dropped.add(selectors.trim().split(/\s/)[0]), '') : whole);
        if (hadRoot) {
            actions.push('dropped-root-redeclaration');
            notesAr.push('أزلت إعادة تعريف ألوان الصفحة (:root) من داخل قسم — كانت ستعيد تلوين الصفحة كلها');
        }
        for (const d of dropped) {
            if (d.toLowerCase() === ':root') continue; // already reported
            actions.push(`dropped-global:${d}`);
            notesAr.push(`أزلت قاعدة تنسيق عامة (${d}) من داخل قسم — كانت ستتسرب لكل الأقسام`);
        }
        if (sid && scoped !== css && !dropped.size) {
            actions.push('scoped-styles');
            notesAr.push('حصرت تنسيقات القسم داخل حدوده حتى لا تلمس بقية الصفحة');
        } else if (sid && dropped.size && scoped.replace(/\s/g, '') !== css.replace(/\s/g, '')) {
            if (!actions.includes('scoped-styles')) actions.push('scoped-styles');
        }
        const cleaned = scoped.trim();
        return cleaned ? `<style>${cleaned}</style>` : '';
    });

    // ── inline style attributes ──────────────────────────────────────────
    let fixedPos = 0, hugeWidth = 0, zTamed = 0;
    out = out.replace(/style\s*=\s*(["'])([^"']*)\1/gi, (_whole, q: string, body: string) => {
        let s = body;
        if (/position\s*:\s*fixed/i.test(s)) { s = s.replace(/position\s*:\s*fixed/gi, 'position:relative'); fixedPos++; }
        s = s.replace(/(?:^|;)\s*width\s*:\s*(\d{3,})px/gi, (w, px: string) =>
            Number(px) >= 900 ? (hugeWidth++, `${w.startsWith(';') ? ';' : ''}max-width:100%`) : w);
        s = s.replace(/z-index\s*:\s*(\d{4,})/gi, () => (zTamed++, 'z-index:10'));
        return `style=${q}${s}${q}`;
    });
    if (fixedPos) { actions.push('inline-fixed-position'); notesAr.push(`حوّلت ${fixedPos} عنصراً مثبتاً فوق الصفحة (position:fixed) إلى وضع طبيعي`); }
    if (hugeWidth) { actions.push('inline-huge-width'); notesAr.push(`عالجت ${hugeWidth} عرضاً ثابتاً عملاقاً كان سيسبب تمريراً جانبياً`); }
    if (zTamed) { actions.push('inline-zindex'); notesAr.push(`خفضت ${zTamed} طبقة z-index شاردة كانت ستعلو واجهة الصفحة`); }

    return { html: out, actions, notesAr };
}
