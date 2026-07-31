/**
 * Edit ONE section of a page, not the whole page.
 *
 * A follow-up edit used to send the entire document to the model and ask for the
 * complete file back. That worked while pages were small. It stops working the
 * moment a page is a real page: a 25 KB store does not fit in one completion, so
 * the model returns a truncated document, the builder detects it is not HTML,
 * restores the previous page — and the user is told the edit was applied when
 * nothing changed. "التعديلات اللاحقة تفشل" is that mechanism, exactly.
 *
 * The request almost always names a section. «غيّر ألوان الأزرار في قسم الأسعار»
 * needs the pricing section and nothing else. So the page is split, the target is
 * found, and only that piece makes the round trip — a small edit the model can
 * actually complete, spliced back into a document that was never at risk.
 *
 * When the request is genuinely global («اجعل كل الصفحة أغمق») no target is
 * returned and the caller falls back to the whole-page edit. This module never
 * guesses: an ambiguous request produces no target rather than the wrong one.
 */

import { normalizeIntentText } from '../orchestrator/promptNormalizer';

export interface PageSection {
    /** Position in the document, 0-based. */
    index: number;
    id: string;
    tag: string;
    html: string;
    /** Character range in the source document. */
    start: number;
    end: number;
    /** Visible headings, used to match what the user called it. */
    headings: string[];
}

/** Every top-level <section>/<header>/<footer> block, in document order. */
export function splitIntoSections(html: string): PageSection[] {
    const src = String(html || '');
    const out: PageSection[] = [];
    const opener = /<(section|header|footer|article)\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    let cursor = 0;

    while ((m = opener.exec(src))) {
        if (m.index < cursor) continue;                 // inside a block already taken
        const tag = m[1].toLowerCase();
        // Walk forward counting same-tag nesting to find the matching close.
        const openRe = new RegExp(`<${tag}\\b`, 'gi');
        const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
        openRe.lastIndex = m.index + m[0].length;
        closeRe.lastIndex = m.index + m[0].length;
        let depth = 1, pos = m.index + m[0].length, end = -1;
        while (depth > 0) {
            openRe.lastIndex = pos; closeRe.lastIndex = pos;
            const nextOpen = openRe.exec(src);
            const nextClose = closeRe.exec(src);
            if (!nextClose) break;
            if (nextOpen && nextOpen.index < nextClose.index) { depth++; pos = nextOpen.index + nextOpen[0].length; continue; }
            depth--; pos = nextClose.index + nextClose[0].length;
            if (depth === 0) end = pos;
        }
        if (end < 0) continue;                          // unterminated: leave it alone
        const block = src.slice(m.index, end);
        const id = (m[0].match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
        const headings = [...block.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]\s*>/gi)]
            .map(h => h[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
            .filter(Boolean).slice(0, 4);
        out.push({ index: out.length, id, tag, html: block, start: m.index, end, headings });
        cursor = end;
        opener.lastIndex = end;
    }
    return out;
}

/* ---------- which section does the request mean? ---------------------------- */

/** Words that make a request GLOBAL — no single section can satisfy them. */
const GLOBAL_CUE = /(كل الصفحة|الصفحة كلها|جميع الأقسام|كامل الموقع|الموقع كله|في كل مكان|بالكامل|whole page|entire page|everywhere|all sections|the whole site|site-wide|global)/i;

/** What the user is likely to call each kind of section, in both languages. */
const SECTION_WORDS: Array<[RegExp, RegExp]> = [
    [/header|nav|top-?bar/i, /رأس|هيدر|شريط علوي|القائمة العلوية|التنقل|navigation|header|navbar|menu bar/i],
    [/hero|banner/i, /هيرو|البانر|الواجهة|أعلى الصفحة|الغلاف|hero|banner|masthead/i],
    [/product|shop|catalog|grid/i, /منتج|المنتجات|البضائع|الكتالوج|شبكة|product|catalog/i],
    [/price|pricing|plan|package/i, /سعر|الأسعار|الباقات|الخطط|التسعير|price|pricing|plans|packages/i],
    [/review|testimonial/i, /آراء|الاراء|شهادات|تقييم|العملاء|review|testimonial/i],
    [/faq|question/i, /الأسئلة|اسئلة|شائعة|faq|questions/i],
    [/contact|form/i, /تواصل|اتصل|النموذج|المراسلة|contact|form/i],
    [/footer/i, /تذييل|الفوتر|أسفل الصفحة|footer/i],
    [/team|about/i, /من نحن|عننا|الفريق|نبذة|about|team/i],
    [/service|feature/i, /خدمات|الخدمات|المزايا|الميزات|service|feature/i],
    [/gallery|portfolio|work/i, /معرض|الأعمال|اعمال|صور|gallery|portfolio/i],
    [/menu|dish|food/i, /المنيو|قائمة الطعام|الأطباق|اطباق|menu|dishes/i],
    [/cart|checkout/i, /السلة|العربة|الدفع|cart|checkout/i],
    [/newsletter|subscribe/i, /النشرة|الاشتراك|البريدية|newsletter|subscribe/i],
    [/stat|metric|number|counter/i, /إحصاء|احصاء|الأرقام|ارقام|النتائج|stats|metrics|numbers/i],
    [/step|process|how/i, /خطوات|الخطوات|كيف نعمل|آلية|steps|process|how it works/i],
];

/**
 * The sections a request is about, or [] when it is global or unclear.
 *
 * Deterministic and conservative on purpose: matching the wrong section would
 * rewrite a part of the page the user never mentioned, which is worse than
 * falling back to a whole-page edit.
 */
export function targetSections(request: string, sections: PageSection[]): PageSection[] {
    if (!sections.length) return [];
    let probe = String(request || '');
    try { probe = `${probe}\n${normalizeIntentText(probe)}`; } catch { /* optional */ }
    if (GLOBAL_CUE.test(probe)) return [];

    const scored = sections.map(s => {
        let score = 0;
        const hay = `${s.id} ${s.tag} ${s.headings.join(' ')}`.toLowerCase();

        // The user quoted a heading that is in this section.
        for (const h of s.headings) {
            if (h.length >= 3 && probe.includes(h)) score += 60;
        }
        // The user named the id, or a word from it.
        for (const w of s.id.split('-')) {
            if (w.length > 3 && new RegExp(`\\b${w}\\b`, 'i').test(probe)) score += 25;
        }
        // The user used the ordinary name for this kind of section.
        for (const [idRe, wordRe] of SECTION_WORDS) {
            if (idRe.test(hay) && wordRe.test(probe)) score += 40;
        }
        return { s, score };
    }).filter(x => x.score >= 40).sort((a, b) => b.score - a.score);

    if (!scored.length) return [];
    // A single clear winner, or two of equal strength — never "most of the page".
    const top = scored[0].score;
    const winners = scored.filter(x => x.score >= top * 0.8).map(x => x.s);
    if (winners.length > 2 || winners.length >= sections.length * 0.6) return [];
    return winners.sort((a, b) => a.index - b.index);
}

/**
 * The sections an audit's findings are actually about.
 *
 * A page Joe shipped was 45 KB. The whole-page repair asks the model to return
 * the whole document, which at that size is truncated by the provider before it
 * finishes — so the build reported:
 *
 *     ℹ️ الصفحة أكبر من أن تُعاد كاملة في ردّ واحد، فلم أُشغّل الإصلاح التلقائي
 *     ⚠️ الزر المطلوب «تسجيل الخروج» غير موجود
 *     🖱️ 4 من 10 أزرار لا تفعل شيئًا عند الضغط
 *
 * It measured the page, named four real defects, and shipped all four. Skipping
 * the repair was the honest thing to do about a call that would have failed, but
 * honesty about a defect is not a fix — and a page written section by section
 * can be repaired section by section. Each one is 2-6 KB, which comfortably
 * fits.
 *
 * `probes` are the concrete strings the audit produced — the label of a dead
 * button, the id in a selector, the alt of an oversized image. A section is a
 * target when it actually contains one. Nothing is guessed: a probe that matches
 * nowhere simply yields no section, and the caller reports the finding as it
 * already does.
 */
export function sectionsForFindings(
    sections: PageSection[],
    probes: string[],
    max = 3,
): PageSection[] {
    const wanted = probes.map(p => String(p || '').trim()).filter(p => p.length >= 2);
    if (!sections.length || !wanted.length) return [];

    const scored = sections.map(s => {
        const hay = s.html;
        let score = 0;
        for (const p of wanted) {
            // An exact occurrence of the label as the model wrote it.
            if (hay.includes(p)) { score += 10; continue; }
            // …or the same text with whitespace normalised, which is how a
            // browser reports a label that was pretty-printed across lines.
            const loose = p.replace(/\s+/g, '\\s+').replace(/[.*+?^${}()|[\]\\]/g, m => (m === '\\' ? m : '\\' + m));
            try { if (new RegExp(loose, 'i').test(hay)) score += 6; } catch { /* not a usable probe */ }
        }
        return { s, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    // Repairing most of the document one section at a time is the whole-page
    // repair with extra steps — and more chances to corrupt the splice.
    if (scored.length > Math.max(max, Math.ceil(sections.length * 0.6))) return [];
    return scored.slice(0, max).map(x => x.s).sort((a, b) => a.index - b.index);
}

/* ---------- putting it back -------------------------------------------------- */

/** Clean whatever the model returned back down to one section block. */
export function extractEditedSection(raw: string, original: PageSection): { html: string; ok: boolean; reason?: string } {
    let out = String(raw || '').trim();
    const fence = out.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fence) out = fence[1].trim();
    const bodyOpen = out.search(/<body[^>]*>/i);
    if (bodyOpen >= 0) {
        out = out.slice(out.indexOf('>', bodyOpen) + 1).replace(/<\/body[\s\S]*$/i, '');
    }
    out = out.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?html[^>]*>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '').trim();

    if (!out) return { html: '', ok: false, reason: 'the model returned nothing' };
    const openRe = new RegExp(`<${original.tag}\\b`, 'i');
    if (!openRe.test(out)) return { html: '', ok: false, reason: `no <${original.tag}> in the response` };
    // Trim anything before the opener and after the last closer, so a stray
    // sentence cannot land in the middle of the document.
    const first = out.search(openRe);
    const lastClose = out.toLowerCase().lastIndexOf(`</${original.tag}>`);
    if (first > 0) out = out.slice(first);
    if (lastClose >= 0) out = out.slice(0, out.toLowerCase().lastIndexOf(`</${original.tag}>`) + original.tag.length + 3);

    const opens = (out.match(new RegExp(`<${original.tag}\\b`, 'gi')) || []).length;
    const closes = (out.match(new RegExp(`</${original.tag}\\s*>`, 'gi')) || []).length;
    if (opens !== closes) return { html: '', ok: false, reason: 'unbalanced tags in the response' };
    // A section that came back as a tenth of its former self was not edited, it
    // was forgotten. Better to keep the original and say so.
    if (out.length < original.html.length * 0.25) {
        return { html: '', ok: false, reason: `the section came back ${Math.round((out.length / original.html.length) * 100)}% of its size` };
    }
    return { html: out, ok: true };
}

/** Put the edited sections back into the document, last first so offsets hold. */
export function spliceSections(html: string, edits: Array<{ section: PageSection; html: string }>): string {
    let out = String(html || '');
    const ordered = edits.slice().sort((a, b) => b.section.start - a.section.start);
    for (const e of ordered) {
        out = out.slice(0, e.section.start) + e.html + out.slice(e.section.end);
    }
    return out;
}

/** The instruction for a single-section edit. */
export function sectionEditPrompt(opts: {
    request: string;
    section: PageSection;
    isArabic: boolean;
    designBrief: string;
}): string {
    const { request, section, isArabic, designBrief } = opts;
    return `You are editing ONE section of an existing page. Not the page — this one section.

THE CHANGE REQUESTED: ${request}

Apply EXACTLY that change to the <${section.tag}> below and return the COMPLETE edited
<${section.tag}> element and nothing else. No <html>, no <head>, no <body>, no <style>,
no markdown fences, no explanation.

- Keep its id ("${section.id}"), its classes, and everything the change does not touch.
- Keep using the design tokens already in the page (var(--brand), var(--space-6), …).
  Never hardcode a colour or a font size.
- Do not shorten it. Every card, item and paragraph that is there now must still be there
  afterwards unless the change explicitly removes it.
${isArabic ? '- The page is Arabic and right-to-left; write natural Arabic.\n' : ''}
${designBrief}`;
}
