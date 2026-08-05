/**
 * THE BROWSER STOPS COMPLAINING AND STARTS FIXING — «اريده ان يصلح ui لاي نظام
 * ولاي صفحة عندما يطلب منه».
 *
 * Joe's self-QA has measured builds for weeks: «62/100 — console_errors,
 * failed_requests, small_targets». Every one of those was true, and not one of
 * them was ever REPAIRED. A reviewer who only ever files tickets is half an
 * engineer.
 *
 * These are the repairs, and they are deterministic on purpose. No model
 * rewrites a component here: each fixer knows one defect, finds it in the
 * SOURCE (not in the rendered DOM, which cannot be edited), and makes the
 * smallest correct change. That is why the result can be trusted without a
 * human reading the diff — and why the same input always produces the same
 * output.
 *
 * Everything returns the new text plus what it changed, so the caller can
 * refuse to write a file whose syntax gate fails and report honestly.
 */

export interface Repair {
    /** Machine id, matched to the audit finding it answers. */
    id: string;
    /** What was done, in Arabic, for the report he reads. */
    detail: string;
    count: number;
}

export interface RepairedFile {
    text: string;
    repairs: Repair[];
}

const add = (list: Repair[], id: string, detail: string, count: number) => {
    if (count > 0) list.push({ id, detail, count });
};

/* ── the document shell ──────────────────────────────────────────────────── */

/**
 * index.html carries the four things a page is judged on before a single
 * component renders: its language, its direction, its viewport and its title.
 */
export function repairHtmlShell(html: string, opts: { isArabic?: boolean; title?: string } = {}): RepairedFile {
    let text = String(html || '');
    const repairs: Repair[] = [];
    const isAr = !!opts.isArabic;

    // <html lang> — an unlabelled document is unreadable to a screen reader and
    // to every RTL heuristic in a browser.
    const htmlTag = text.match(/<html\b[^>]*>/i);
    if (htmlTag) {
        let tag = htmlTag[0];
        const before = tag;
        if (!/\blang\s*=/.test(tag)) tag = tag.replace(/<html\b/i, `<html lang="${isAr ? 'ar' : 'en'}"`);
        if (isAr && !/\bdir\s*=/.test(tag)) tag = tag.replace(/<html\b/i, '<html dir="rtl"');
        if (tag !== before) {
            text = text.replace(before, tag);
            add(repairs, 'html_lang', 'أضفتُ لغة المستند واتجاهه إلى وسم <html>', 1);
        }
    }

    const head = text.match(/<head\b[^>]*>/i);
    if (head) {
        const inject: string[] = [];
        if (!/<meta[^>]+name=["']viewport["']/i.test(text)) {
            inject.push('    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />');
        }
        if (!/<meta[^>]+charset=/i.test(text)) inject.push('    <meta charset="UTF-8" />');
        if (inject.length) {
            text = text.replace(head[0], `${head[0]}\n${inject.join('\n')}`);
            add(repairs, 'meta_missing', 'أضفتُ وسوم viewport/charset الناقصة', inject.length);
        }
        if (!/<title>[^<]*\S[^<]*<\/title>/i.test(text)) {
            const title = String(opts.title || (isAr ? 'الصفحة' : 'Page')).slice(0, 70);
            text = /<title>\s*<\/title>/i.test(text)
                ? text.replace(/<title>\s*<\/title>/i, `<title>${title}</title>`)
                : text.replace(head[0], `${head[0]}\n    <title>${title}</title>`);
            add(repairs, 'title_missing', 'أعطيتُ الصفحة عنواناً حقيقياً', 1);
        }
    }
    return { text, repairs };
}

/* ── JSX components ──────────────────────────────────────────────────────── */

/** A JSX attribute value, escaped for a double-quoted literal. */
const attr = (s: string) => String(s).replace(/"/g, '&quot;').slice(0, 80);

/**
 * THE WHOLE OPENING TAG — AND WHY `[^>]*` CANNOT FIND IT.
 *
 * JSX attributes hold JavaScript, and JavaScript holds `>`:
 *
 *     <input value={email} onChange={e => setEmail(e.target.value)} />
 *
 * A regex that reads «anything but > until >» stops at the arrow, mid-attribute.
 * Measured: the first version of this file spliced aria-label INTO an arrow
 * function and produced `onChange={e = aria-label="البريد"> setEmail(...)}`.
 * esbuild refused the file, the syntax gate refused the repair, and nothing was
 * fixed at all — the gate did its job, and the fixer was simply wrong.
 *
 * Depth-tracked braces find the real end of the tag, because a `>` inside `{…}`
 * belongs to the expression, not to the element.
 */
function tagSpan(src: string, start: number): string {
    let depth = 0;
    for (let i = start; i < src.length && i - start < 4000; i++) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth === 0) return src.slice(start, i + 1);
    }
    return src.slice(start, start + 4000);
}

/**
 * IS THIS POSITION INSIDE A COMMENT?
 *
 * The generated App.jsx explains itself, and one of its JSX comments mentions
 * an h1 opening tag in ordinary prose. That tag has no closing partner, so an
 * element matcher that started there ran straight through the comment and
 * swallowed the REAL heading after it — demoting the wrong element while the
 * imaginary one stayed. Measured on Joe's own scaffold. Prose is not markup.
 */
function insideComment(src: string, idx: number): boolean {
    const before = src.slice(0, idx);
    const open = Math.max(before.lastIndexOf('{/*'), before.lastIndexOf('/*'));
    if (open === -1) return false;
    return before.lastIndexOf('*/') < open;
}

/** Insert an attribute straight after the tag NAME — always syntactically safe. */
function injectAttr(src: string, tagStart: number, tagName: string, attrText: string): string {
    const at = tagStart + 1 + tagName.length;
    return src.slice(0, at) + ' ' + attrText + src.slice(at);
}

/** Every `<tag` opening position in the source, latest first (so edits do not shift). */
function tagPositions(src: string, tagName: string): number[] {
    const out: number[] = [];
    const re = new RegExp(`<${tagName}(?=[\\s/>])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) { if (!insideComment(src, m.index)) out.push(m.index); }
    return out.reverse();
}

/**
 * IMAGES WITHOUT ALT.
 *
 * The alt text is taken from the element's own context where the source offers
 * one — `src={p.image}` next to a `name` field means the picture is of that
 * product — and left empty (decorative, and correct) when nothing is known. An
 * invented description would be a lie printed to a blind user.
 */
export function repairImagesAlt(code: string): RepairedFile {
    let text = String(code || '');
    let count = 0;
    for (const at of tagPositions(text, 'img')) {
        const span = tagSpan(text, at);
        if (/\balt\s*=/.test(span)) continue;
        const m = span.match(/src=\{([A-Za-z_$][\w$]*)\.(?:image|photo|img|src|url)\}/);
        const guess = m ? `{${m[1]}.name || ''}` : '""';
        text = injectAttr(text, at, 'img', `alt=${guess}`);
        count++;
    }
    const repairs: Repair[] = [];
    add(repairs, 'dead_images', 'أضفتُ نصاً بديلاً (alt) للصور التي بلا وصف', count);
    return { text, repairs };
}

/**
 * INPUTS WITHOUT A NAME ANYONE CAN HEAR.
 *
 * The generated forms wrap every field in `<label><span>الاسم</span><input …>`,
 * which a sighted user reads perfectly and a screen reader does not connect.
 * The visible text beside the field IS the label; it is copied into aria-label
 * rather than invented.
 */
export function repairInputLabels(code: string): RepairedFile {
    let text = String(code || '');
    let count = 0;
    for (const tag of ['input', 'textarea', 'select']) {
        for (const at of tagPositions(text, tag)) {
            const span = tagSpan(text, at);
            if (/\baria-label\s*=|\bplaceholder\s*=/.test(span)) continue;
            // The visible <span> label immediately before it, inside the same
            // <label> — at most a couple of hundred characters back.
            const before = text.slice(Math.max(0, at - 260), at);
            const label = before.match(/<span>\s*\{?['"]?([^<>{}'"]{1,40}?)['"]?\}?\s*<\/span>(?![\s\S]*<span>)/);
            const clean = String(label?.[1] || '').replace(/\s+/g, ' ').trim();
            if (!clean) continue;
            text = injectAttr(text, at, tag, `aria-label="${attr(clean)}"`);
            count++;
        }
    }
    const repairs: Repair[] = [];
    add(repairs, 'unlabeled_inputs', 'ربطتُ كل حقل إدخال باسمه المعروض (aria-label)', count);
    return { text, repairs };
}

/**
 * DEAD LINKS.
 *
 * `<a href="#">` and `<a href="">` are the oldest complaint in this project:
 * they look like navigation and go nowhere. An anchor that only ever runs an
 * onClick IS a button, and saying so fixes the keyboard, the screen reader and
 * the audit at once. Opening and closing tags are rewritten as ONE element —
 * counting `</a>` from the top of the file closes anchors nobody converted.
 */
export function repairDeadLinks(code: string): RepairedFile {
    let count = 0;
    const text = String(code || '').replace(
        /<a\b([^>]*?)>((?:(?!<\/?a\b)[\s\S])*?)<\/a>/g,
        (whole, attrs: string, body: string, offset: number, full: string) => {
            // An opening tag carrying an arrow function is not safely readable
            // by this pattern; leave it exactly as it is rather than guess.
            if (attrs.includes('=>')) return whole;
            if (insideComment(full, offset)) return whole;   // prose, not markup
            if (!/href=(["'])\s*#?\s*\1/.test(attrs)) return whole;
            count++;
            const stripped = attrs.replace(/\s*href=(["'])\s*#?\s*\1/, '');
            return `<button type="button"${stripped}>${body}</button>`;
        },
    );
    const repairs: Repair[] = [];
    add(repairs, 'dead_links', 'حوّلتُ الروابط الميتة (href فارغ أو #) إلى أزرار حقيقية', count);
    return { text, repairs };
}

/**
 * MORE THAN ONE <h1>.
 *
 * A document has one title. The first stays; the rest become <h2>, which is
 * what they were always meant to be — element by element, so the closing tags
 * follow the openings they belong to.
 */
export function repairHeadings(code: string): RepairedFile {
    let seen = 0;
    let count = 0;
    const text = String(code || '').replace(
        /<h1\b([^>]*)>((?:(?!<\/?h1\b)[\s\S])*?)<\/h1>/g,
        (whole, attrs: string, body: string, offset: number, full: string) => {
            if (attrs.includes('=>')) return whole;
            if (insideComment(full, offset)) return whole;   // prose, not markup
            seen++;
            if (seen === 1) return whole;
            count++;
            return `<h2${attrs}>${body}</h2>`;
        },
    );
    const repairs: Repair[] = [];
    add(repairs, 'h1_count', 'أبقيتُ عنواناً رئيسياً واحداً وحوّلتُ الباقي إلى عناوين فرعية', count);
    return { text, repairs };
}

/* ── the stylesheet ──────────────────────────────────────────────────────── */

export const TAP_TARGET_CSS = `
/* ── إصلاح جو: أهداف اللمس ──────────────────────────────────────────────
   قاعدة 44×44 بكسل من إرشادات الوصولية: زرٌّ أصغر من ذلك لا يمكن ضغطه
   بإصبع على الجوال. أُضيفت لأن الفحص الذاتي قاسها ووجدها أصغر. */
a.btn, button, .nav-links a, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}
/* أيقونات داخل الأزرار تبقى بحجمها — الهدف هو مساحة اللمس لا الرسم. */
a.btn > svg, button > svg { min-height: 0; min-width: 0; }
`;

/** Add the tap-target rule once, and only once, however many times we run. */
export function repairTapTargets(css: string): RepairedFile {
    const text = String(css || '');
    if (text.includes('إصلاح جو: أهداف اللمس')) return { text, repairs: [] };
    return {
        text: text + TAP_TARGET_CSS,
        repairs: [{ id: 'small_targets', detail: 'وسّعتُ أهداف اللمس إلى 44 بكسل على الأقل', count: 1 }],
    };
}

/* ── the whole project, in one pass ──────────────────────────────────────── */

export interface ProjectRepairPlan {
    /** relative path → new content */
    files: Record<string, string>;
    repairs: Repair[];
}

/**
 * Every repair this module knows, applied to whatever of them a project has.
 * Pure: it reads a map of files and returns a map of files. Writing them (and
 * refusing any that fail the syntax gate) is the caller's job.
 */
export function repairProjectFiles(
    files: Record<string, string>,
    opts: { isArabic?: boolean; title?: string } = {},
): ProjectRepairPlan {
    const out: Record<string, string> = {};
    const all: Repair[] = [];
    const merge = (rs: Repair[]) => {
        for (const r of rs) {
            const found = all.find(x => x.id === r.id);
            if (found) found.count += r.count;
            else all.push({ ...r });
        }
    };

    for (const [rel, original] of Object.entries(files)) {
        let text = String(original ?? '');
        const lower = rel.toLowerCase();

        if (lower.endsWith('.html')) {
            const r = repairHtmlShell(text, opts);
            text = r.text; merge(r.repairs);
        } else if (/\.(jsx|tsx)$/.test(lower)) {
            for (const fix of [repairImagesAlt, repairInputLabels, repairDeadLinks, repairHeadings]) {
                const r = fix(text);
                text = r.text; merge(r.repairs);
            }
        } else if (lower.endsWith('.css')) {
            const r = repairTapTargets(text);
            text = r.text; merge(r.repairs);
        }

        if (text !== original) out[rel] = text;
    }
    return { files: out, repairs: all };
}
