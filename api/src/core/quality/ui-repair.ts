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
    /** What was done, in Arabic. */
    detail: string;
    /** …and in English, for the message written in English. */
    detailEn?: string;
    count: number;
}

export interface RepairedFile {
    text: string;
    repairs: Repair[];
}

/**
 * …AND IN ENGLISH, FOR THE SAME REASON THE FINDINGS ARE.
 *
 * His English delivery read: «🛠️ Repaired before delivery: 89/100 → 97/100 ·
 * ربطتُ كل حقل إدخال باسمه المعروض». Every repair sentence lived in one
 * language and was printed into whichever message asked for it.
 */
export const REPAIR_EN: Record<string, string> = {
    html_lang: 'Added the document language and direction to the <html> tag',
    meta_missing: 'Added the missing viewport/charset meta tags',
    title_missing: 'Gave the page a real title',
    dead_images: 'Added alt text to images that had none',
    unlabeled_inputs: 'Linked every input to its visible label (aria-label)',
    dead_links: 'Turned links carrying a click handler into real buttons (they had no destination)',
    h1_count: 'Kept exactly one main heading and demoted the rest',
    low_contrast: 'Raised text contrast to at least 4.5:1 (WCAG AA)',
    heavy_images: 'Deferred off-screen images (lazy + decoding=async)',
    keyboard_unreachable: 'Made clickable elements reachable by keyboard (Tab, then Enter/Space)',
    small_targets: 'Widened tap targets to at least 44px',
    responsive: 'Stopped horizontal scrolling and fitted media and tables to small screens',
};

/** The repair in the reader's language. */
export function repairText(r: { id: string; detail: string; detailEn?: string }, isAr: boolean): string {
    return (isAr ? r.detail : (r.detailEn || REPAIR_EN[r.id] || r.detail)) || '';
}

const add = (list: Repair[], id: string, detail: string, count: number) => {
    if (count > 0) list.push({ id, detail, detailEn: REPAIR_EN[id], count });
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
    let text = String(code || '');
    let count = 0;
    let leftAlone = 0;
    /**
     * The tag is read with the brace-aware reader rather than a regex. `[^>]*?`
     * stops at the first `>` — and `onClick={() => window.print()}` contains
     * one, inside the arrow. The integration sweep caught exactly that: the one
     * link that SHOULD have become a button was the one the pattern could not
     * see, because it carried the handler that qualified it.
     */
    for (const at of tagPositions(text, 'a')) {          // reversed: edits do not shift
        const span = tagSpan(text, at);
        if (!/href=(["'])\s*#?\s*\1/.test(span)) continue;
        /**
         * A DEAD LINK MUST NOT BECOME A DEAD BUTTON.
         *
         * The standard advice — «if it does not navigate, it is a button» —
         * assumes the button DOES something. This repair used to apply it
         * unconditionally, and the day the audit began pressing controls the
         * cost showed up as a number: 92 → 85. One finding, `dead_links`, had
         * been traded for a worse one, `dead_controls`, and the report called
         * the trade a repair.
         *
         * So the conversion now happens only where it is true: an anchor that
         * already carries a click handler really is a button wearing the wrong
         * tag. A placeholder with no handler and no destination is not something
         * this code can invent an answer for — it is left exactly as it is, and
         * the audit keeps naming it for the person who knows where it should go.
         */
        if (!/\bonClick\s*=/.test(span)) { leftAlone++; continue; }
        const open = at + span.length;
        const close = text.indexOf('</a>', open);
        if (close === -1) { leftAlone++; continue; }
        const body = text.slice(open, close);
        if (/<a\b/.test(body)) { leftAlone++; continue; }        // nested anchors: not ours to reshape
        const attrs = span.slice(2, -1).replace(/\s*href=(["'])\s*#?\s*\1/, '');
        text = text.slice(0, at) + `<button type="button"${attrs}>` + body + '</button>' + text.slice(close + 4);
        count++;
    }
    const repairs: Repair[] = [];
    add(repairs, 'dead_links', 'حوّلتُ الروابط التي تحمل معالج نقر إلى أزرار حقيقية (كانت روابط بلا وجهة)', count);
    // What was left alone is NOT listed as a repair — it is not one. The audit
    // still reports `dead_links`, and it lands where it belongs: «ما زال قائماً
    // — يحتاج قراراً منك».
    void leftAlone;
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
        repairs: [{ id: 'small_targets', detail: 'وسّعتُ أهداف اللمس إلى 44 بكسل على الأقل', detailEn: REPAIR_EN.small_targets, count: 1 }],
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
            for (const fix of [repairImagesAlt, repairInputLabels, repairDeadLinks, repairHeadings, repairLazyImages, repairKeyboardControls]) {
                const r = fix(text);
                text = r.text; merge(r.repairs);
            }
        } else if (lower.endsWith('.css')) {
            // Tokens first: contrast is decided in the palette, and the two
            // appended blocks must not sit between a token and its block.
            for (const fix of [repairContrast, repairTapTargets, repairResponsive]) {
                const r = fix(text);
                text = r.text; merge(r.repairs);
            }
        }

        if (text !== original) out[rel] = text;
    }
    return { files: out, repairs: all };
}

/* ── colour: contrast that a person can actually read ────────────────────── */

/** #rgb / #rrggbb → [r,g,b], or null for anything else (var(), rgba(), a name). */
export function parseHex(raw: string): [number, number, number] | null {
    const m = String(raw || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (rgb: [number, number, number]) =>
    '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** WCAG relative luminance. */
export function luminance([r, g, b]: [number, number, number]): number {
    const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * Move a foreground toward black or away from it — whichever direction the
 * background demands — until it clears the threshold. Deterministic, bounded,
 * and it stops at the first passing value so the design shifts as little as
 * the requirement allows.
 */
export function fixForeground(fg: [number, number, number], bg: [number, number, number], min = 4.5): [number, number, number] {
    if (contrastRatio(fg, bg) >= min) return fg;
    const darken = luminance(bg) > 0.5;                 // light background → darker text
    let out: [number, number, number] = [...fg] as any;
    for (let step = 0; step < 100; step++) {
        out = out.map(v => (darken ? v * 0.96 : v + (255 - v) * 0.04)) as any;
        if (contrastRatio(out, bg) >= min) break;
    }
    return out;
}

/**
 * CONTRAST, IN THE TOKENS THE WHOLE DESIGN IS BUILT FROM.
 *
 * Joe's builds declare their palette once — `--text-muted`, `--bg`, `--surface`
 * — and every component reads it. So the readable fix is one line in one file,
 * not a hunt through components. The audit has been reporting «/month contrast»
 * and similar for months; this is the answer to it.
 *
 * Only the foreground tokens move, and only as far as 4.5:1 requires. The
 * brand colour is deliberately left alone: it is an identity, not a text
 * colour, and darkening someone's brand without asking is not a repair.
 */
export function repairContrast(css: string): RepairedFile {
    const repairs: Repair[] = [];
    let count = 0;

    // Each block is judged against ITS OWN background, so a dark theme is read
    // as a dark theme instead of being measured against the light one. The
    // rewrite happens in a single pass: an earlier version matched blocks with
    // `(?:^|})` and so ATE every second block as another block's opening brace
    // — the dark palette was silently skipped.
    const text = String(css || '').replace(/[^{}]*\{[^{}]*\}/g, (block) => {
        const bgRaw = block.match(/--(?:bg|surface)\s*:\s*(#[0-9a-fA-F]{3,6})/);
        if (!bgRaw) return block;
        const bg = parseHex(bgRaw[1]);
        if (!bg) return block;
        let next = block;
        for (const token of ['text-muted', 'text', 'on-tint', 'brand-text']) {
            const m = next.match(new RegExp(`--${token}\\s*:\\s*(#[0-9a-fA-F]{3,6})`));
            if (!m) continue;
            const fg = parseHex(m[1]);
            if (!fg) continue;
            // Body text is held to 4.5; a muted secondary is still text.
            if (contrastRatio(fg, bg) >= 4.5) continue;
            const fixed = toHex(fixForeground(fg, bg, 4.5));
            next = next.replace(m[0], `--${token}: ${fixed}`);
            count++;
        }
        return next;
    });
    add(repairs, 'low_contrast', 'رفعتُ تباين ألوان النصوص إلى 4.5:1 على الأقل (WCAG AA)', count);
    return { text, repairs };
}

/* ── performance: the bytes and the paint ────────────────────────────────── */

/**
 * IMAGES THAT BLOCK THE FIRST PAINT.
 *
 * Every image below the fold that loads eagerly competes with the one the user
 * is actually looking at. `loading="lazy"` and `decoding="async"` are one
 * attribute each and they are free — but the FIRST image on a page is usually
 * the hero, and lazy-loading a hero delays the very thing being measured. So
 * the first img in a file is left eager on purpose.
 */
export function repairLazyImages(code: string): RepairedFile {
    let text = String(code || '');
    let count = 0;
    const positions = tagPositions(text, 'img');   // latest first
    // …so the LAST element of this reversed list is the first image in the file.
    const skipFirst = positions.length ? positions[positions.length - 1] : -1;
    for (const at of positions) {
        if (at === skipFirst) continue;
        const span = tagSpan(text, at);
        if (/\bloading\s*=/.test(span)) continue;
        text = injectAttr(text, at, 'img', 'loading="lazy" decoding="async"');
        count++;
    }
    const repairs: Repair[] = [];
    add(repairs, 'heavy_images', 'أجّلتُ تحميل الصور غير الظاهرة أولاً (lazy + decoding=async)', count);
    return { text, repairs };
}

/* ── a control a keyboard can actually reach ─────────────────────────────── */

/**
 * A `<div onClick>` LOOKS like a button and behaves like one for a mouse. For
 * the Tab key it does not exist at all: it is not focusable, so a keyboard or
 * switch-device user can never trigger it. The behaviour audit has reported
 * this for months under `keyboard_unreachable` and nothing ever fixed it.
 *
 * The repair is exact and safe: make it announce itself as a button, put it in
 * the tab order, and let Enter/Space do what the mouse does. The existing click
 * handler is not touched — it is invoked through the element's own click().
 */
export function repairKeyboardControls(code: string): RepairedFile {
    let text = String(code || '');
    let count = 0;
    const KEY = 'onKeyDown={(e) => { if (e.key === \'Enter\' || e.key === \' \') { e.preventDefault(); e.currentTarget.click(); } }}';
    for (const tag of ['div', 'span', 'li']) {
        for (const at of tagPositions(text, tag)) {
            const span = tagSpan(text, at);
            if (!/\bonClick\s*=/.test(span)) continue;
            if (/\btabIndex\s*=/.test(span)) continue;      // already reachable
            const attrs = [
                /\brole\s*=/.test(span) ? '' : 'role="button"',
                'tabIndex={0}',
                /\bonKeyDown\s*=/.test(span) ? '' : KEY,
            ].filter(Boolean).join(' ');
            text = injectAttr(text, at, tag, attrs);
            count++;
        }
    }
    const repairs: Repair[] = [];
    add(repairs, 'keyboard_unreachable', 'جعلتُ العناصر القابلة للنقر تصلها لوحة المفاتيح (Tab ثم Enter/Space)', count);
    return { text, repairs };
}

/* ── responsive: the page fits the phone it is opened on ─────────────────── */

export const RESPONSIVE_CSS = `
/* ── إصلاح جو: التجاوب ──────────────────────────────────────────────────
   قيست الصفحة على 390×844 فخرجت عن حدّ الشاشة أفقياً. هذه القواعد تمنع
   التمرير الأفقي من مصدره: الوسائط لا تتجاوز عرض حاويتها، والجداول
   والشيفرة تمرّر داخل صندوقها بدل دفع الصفحة كلها. */
html, body { max-width: 100%; overflow-x: hidden; }
img, video, canvas, svg, iframe { max-width: 100%; height: auto; }
table, pre, code { max-width: 100%; overflow-x: auto; }
/* كلمة طويلة واحدة (رابط، بريد) كانت تكفي لتوسيع الصفحة كلها. */
p, h1, h2, h3, li, td, dd { overflow-wrap: anywhere; }
@media (max-width: 480px) {
  /* شبكات ثابتة الأعمدة تُجبَر على عمود واحد على الجوال. */
  .products, .stats, .days, .rows { grid-template-columns: 1fr !important; }
}
`;

export function repairResponsive(css: string): RepairedFile {
    const text = String(css || '');
    if (text.includes('إصلاح جو: التجاوب')) return { text, repairs: [] };
    return {
        text: text + RESPONSIVE_CSS,
        repairs: [{ id: 'responsive', detail: 'منعتُ التمرير الأفقي وضبطتُ الوسائط والجداول على الشاشات الصغيرة', detailEn: REPAIR_EN.responsive, count: 1 }],
    };
}
