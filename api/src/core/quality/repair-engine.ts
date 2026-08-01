/**
 * Mechanical repairs — Joe fixes what the audit measured, with CODE, not with
 * another model call.
 *
 * The visual audit names defects that have exactly one correct fix: a missing
 * DOCTYPE, a missing <title>, a duplicated id, an http:// asset on an https
 * page. Sending those to the LLM "repair" pass costs a whole model round-trip
 * (daily quota!) and can come back wrong; a deterministic string operation
 * cannot. The model pass still runs afterwards for the defects that genuinely
 * need judgement (contrast, layout, overflow).
 *
 * The law this encodes — «اكتشف، أصلح، أعد الفحص، ولا تتقدم إلا والفحص نظيف» —
 * is the same discipline the user demanded of every Joe build.
 *
 * Every rule:
 *  - fires ONLY when the audit actually reported its finding code,
 *  - is idempotent (running twice changes nothing the second time),
 *  - records what it did, in Arabic, for the build log.
 */

export interface MechanicalRepair {
    /** The repaired document. Unchanged when nothing applied. */
    html: string;
    /** Finding codes that were actually repaired. */
    applied: string[];
    /** One human line per repair, for the build log. */
    notesAr: string[];
}

export interface RepairContext {
    /** UI language of the build («ar», «en», …) — decides lang/dir injection. */
    language?: string;
    /** The build subject, used to synthesise a title/description when the page has none. */
    subject?: string;
}

const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Insert markup just before </head>; falls back to after <html …> / prepend. */
function injectIntoHead(html: string, snippet: string): string {
    const head = html.search(/<\/head\s*>/i);
    if (head >= 0) return html.slice(0, head) + snippet + '\n' + html.slice(head);
    const openHtml = html.match(/<html[^>]*>/i);
    if (openHtml && openHtml.index !== undefined) {
        const at = openHtml.index + openHtml[0].length;
        return html.slice(0, at) + '\n<head>' + snippet + '</head>' + html.slice(at);
    }
    return snippet + '\n' + html;
}

/** Visible text of the first match of a tag, tags stripped, whitespace folded. */
function firstText(html: string, tag: string): string {
    const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (!m) return '';
    return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function applyMechanicalRepairs(
    html: string,
    findings: Array<{ code: string }>,
    ctx: RepairContext = {},
): MechanicalRepair {
    const codes = new Set(findings.map(f => f.code));
    const applied: string[] = [];
    const notesAr: string[] = [];
    let out = html;
    const lang = String(ctx.language || '').split('-')[0];

    // ── quirks: no DOCTYPE ───────────────────────────────────────────────
    if (codes.has('quirks') && !/^\s*<!DOCTYPE/i.test(out)) {
        out = '<!DOCTYPE html>\n' + out;
        applied.push('quirks');
        notesAr.push('أضفت <!DOCTYPE html> — كانت الصفحة تُعرض في وضع التوافق القديم');
    }

    // ── lang / dir on <html> ─────────────────────────────────────────────
    const htmlTag = out.match(/<html([^>]*)>/i);
    if (htmlTag) {
        let attrs = htmlTag[1];
        let touched = false;
        if (codes.has('lang_missing') && !/\blang\s*=/i.test(attrs) && lang) {
            attrs += ` lang="${lang}"`;
            touched = true;
            applied.push('lang_missing');
            notesAr.push(`أضفت lang="${lang}" على وسم html`);
        }
        if (codes.has('rtl_missing') && lang === 'ar' && !/\bdir\s*=/i.test(attrs)) {
            attrs += ' dir="rtl"';
            touched = true;
            applied.push('rtl_missing');
            notesAr.push('أضفت dir="rtl" — صفحة عربية بلا اتجاه صحيح');
        }
        if (touched) out = out.replace(htmlTag[0], `<html${attrs}>`);
    }

    // ── no_title ─────────────────────────────────────────────────────────
    // Read the ACTUAL text content: a bare `\S` probe would treat the `<` of
    // the closing tag as content and skip an empty <title></title>.
    const titleTag = out.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const hasRealTitle = !!titleTag && titleTag[1].trim().length > 0;
    if (codes.has('no_title') && !hasRealTitle) {
        const title = firstText(out, 'h1') || String(ctx.subject || '').trim() || 'صفحة';
        if (titleTag) {
            out = out.replace(titleTag[0], `<title>${escapeHtml(title.slice(0, 80))}</title>`);
        } else {
            out = injectIntoHead(out, `<title>${escapeHtml(title.slice(0, 80))}</title>`);
        }
        applied.push('no_title');
        notesAr.push(`أضفت عنوان تبويب حقيقياً: «${title.slice(0, 40)}»`);
    }

    // ── no_viewport ──────────────────────────────────────────────────────
    if (codes.has('no_viewport') && !/<meta[^>]+name=["']viewport["']/i.test(out)) {
        out = injectIntoHead(out, '<meta name="viewport" content="width=device-width, initial-scale=1">');
        applied.push('no_viewport');
        notesAr.push('أضفت وسم viewport — بدونه تظهر الصفحة مصغّرة على الهاتف');
    }

    // ── no_meta_description ──────────────────────────────────────────────
    if (codes.has('no_meta_description') && !/<meta[^>]+name=["']description["']/i.test(out)) {
        const desc = (firstText(out, 'p') || String(ctx.subject || '')).slice(0, 155).trim();
        if (desc) {
            out = injectIntoHead(out, `<meta name="description" content="${escapeHtml(desc)}">`);
            applied.push('no_meta_description');
            notesAr.push('أضفت وصف الصفحة لمحركات البحث من نصّها الفعلي');
        }
    }

    // ── duplicate_ids: keep the first, rename the rest ───────────────────
    if (codes.has('duplicate_ids')) {
        const seen = new Map<string, number>();
        let renamed = 0;
        out = out.replace(/\bid\s*=\s*(["'])([^"']+)\1/gi, (whole, q: string, id: string) => {
            const n = (seen.get(id) || 0) + 1;
            seen.set(id, n);
            if (n === 1) return whole;
            renamed++;
            return `id=${q}${id}-${n}${q}`;
        });
        if (renamed > 0) {
            applied.push('duplicate_ids');
            notesAr.push(`أعدت تسمية ${renamed} معرّفاً مكرراً (id) — التكرار يكسر الروابط الداخلية وقارئات الشاشة`);
        }
    }

    // ── blank_no_noopener ────────────────────────────────────────────────
    if (codes.has('blank_no_noopener')) {
        let patched = 0;
        out = out.replace(/<a\b[^>]*>/gi, (tag) => {
            if (!/target\s*=\s*["']_blank["']/i.test(tag)) return tag;
            if (/rel\s*=\s*["'][^"']*noopener/i.test(tag)) return tag;
            patched++;
            const rel = tag.match(/rel\s*=\s*(["'])([^"']*)\1/i);
            if (rel) return tag.replace(rel[0], `rel=${rel[1]}${(rel[2] + ' noopener noreferrer').trim()}${rel[1]}`);
            return tag.replace(/<a\b/i, '<a rel="noopener noreferrer"');
        });
        if (patched > 0) {
            applied.push('blank_no_noopener');
            notesAr.push(`حصّنت ${patched} رابطاً يفتح في تبويب جديد (rel="noopener")`);
        }
    }

    // ── http_resources: upgrade to https (never localhost/lan) ──────────
    if (codes.has('http_resources')) {
        let upgraded = 0;
        out = out.replace(/(src|href)\s*=\s*(["'])http:\/\/([^"']+)\2/gi, (whole, attr: string, q: string, rest: string) => {
            if (/^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/i.test(rest)) return whole;
            upgraded++;
            return `${attr}=${q}https://${rest}${q}`;
        });
        if (upgraded > 0) {
            applied.push('http_resources');
            notesAr.push(`رقّيت ${upgraded} مورداً من http إلى https — المتصفح كان سيحجبها`);
        }
    }

    // ── img_no_alt: decorative empty alt beats none at all ──────────────
    if (codes.has('img_no_alt')) {
        let patched = 0;
        out = out.replace(/<img\b[^>]*?>/gi, (tag) => {
            if (/\balt\s*=/i.test(tag)) return tag;
            patched++;
            return tag.replace(/<img\b/i, '<img alt=""');
        });
        if (patched > 0) {
            applied.push('img_no_alt');
            notesAr.push(`أضفت alt لـ${patched} صورة كانت بلا وصف — قارئ الشاشة كان سيقرأ اسم الملف`);
        }
    }

    // ── focus_suppressed: give keyboard users their outline back ────────
    if (codes.has('focus_suppressed') && !/joe-focus-restore/.test(out)) {
        out = injectIntoHead(out,
            '<style id="joe-focus-restore">:focus-visible{outline:3px solid currentColor !important;outline-offset:2px}</style>');
        applied.push('focus_suppressed');
        notesAr.push('أعدت إظهار إطار التركيز لمستخدمي لوحة المفاتيح (كان مُلغى بالكامل)');
    }

    return { html: out, applied, notesAr };
}
