/**
 * A FILE WHOSE PARTS ARE «...» IS AN OUTLINE, NOT THE FILE.
 *
 * From his own run (P001, eval 2026-10-27, run-1793086226335): the planner
 * wrote phase 2's index.html inline in the plan as a write_file task, and every
 * part of the page was elided:
 *
 *   <nav class="navbar">...</nav>
 *   <header class="hero">...</header>
 *   <section id="services">...</section>
 *   <section id="contact">...</section>
 *
 * PhaseExecutor wrote that verbatim and called the phase completed. The
 * delivered page had no hero, no services and no contact form; the scope audit
 * then reported «Visit contact form» missing and the repair pass planned an
 * Express backend for a static site.
 *
 * A planner abbreviates when the plan itself is long; the file it meant is the
 * one it outlined. This names the elided parts so the writer can author them
 * in full. Text such as «Loading...» or a spread `{...props}` is content, not
 * elision. Prose files are not judged, and Python is judged only by comment
 * lines (a bare `...` is its own statement there).
 *
 * WHICH ELLIPSIS STANDS FOR A PART (round 21 review). The first reading took
 * every container whose whole body was «...» for an elided part, `div`
 * included, and an ellipsis only when it was a whole line or a bare comment.
 * Wrong both ways: `<div id="result">...</div>` and a typing indicator are what
 * a page SHOWS while it waits, and a complete planned file was discarded for
 * them; `<section id="services"><h2>…</h2>...</section>` and
 * `// ... rest of the handlers` are outlines, and were written verbatim. So an
 * ellipsis is judged by what stands around it:
 *   - the whole body of an element whose content is other elements (a section,
 *     a list, a table, a form, a landmark) is a part;
 *   - an ellipsis beside a block element — after a heading, between list
 *     items, before a component — stands for more of them, and is a part;
 *   - the whole body of a `div` is text the page shows, unless the file is
 *     already an outline: another part is elided, or the page has nothing
 *     written outside its elided blocks (and is no script's mount point);
 *   - a comment that opens with an ellipsis («// ... rest of the handlers») is
 *     a part, unless it continues the comment above it;
 *   - an ellipsis beside inline text («<strong>جارٍ</strong>...») is prose.
 */
const ELLIPSIS = '(?:\\.{3}|…)';
/** Elements whose content is other elements: «...» as the whole body stands where markup must be. */
const STRUCTURAL = new Set(['nav', 'header', 'footer', 'main', 'section', 'article', 'aside', 'form', 'ul', 'ol', 'dl',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'body', 'head', 'template', 'select', 'fieldset']);
/** Block-level elements; an ellipsis beside one stands for more of them. A capitalised JSX component is one too. */
const BLOCK = new Set([...STRUCTURAL, 'html', 'address', 'blockquote', 'details', 'dialog', 'dd', 'dt', 'div', 'figcaption',
    'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'hr', 'li', 'p', 'pre', 'td', 'th', 'option']);
/** A text node that is nothing but an ellipsis: `>…<`. */
const ELLIPSIS_TEXT_NODE = new RegExp(`>(\\s*${ELLIPSIS}\\s*)(?=<)`, 'gu');
const TAG = /^<(\/)?\s*([A-Za-z][\w.:-]*)\b[^>]*?(\/)?\s*>$/u;
const ELIDED_LINE = new RegExp(
    `^\\s*(?:${ELLIPSIS}|//\\s*${ELLIPSIS}|/\\*\\s*${ELLIPSIS}\\s*\\*/|<!--\\s*${ELLIPSIS}\\s*-->|\\{\\s*/\\*\\s*${ELLIPSIS}\\s*\\*/\\s*\\})\\s*$`,
    'u',
);
/** A comment that opens with an ellipsis and says what it stands for: «// ... rest of the handlers». */
const OMISSION_COMMENT = new RegExp(
    `^\\s*(?://\\s*${ELLIPSIS}.*\\S|/\\*\\s*${ELLIPSIS}(?:(?!\\*/).)*\\*/|<!--\\s*${ELLIPSIS}(?:(?!-->).)*-->|\\{\\s*/\\*\\s*${ELLIPSIS}(?:(?!\\*/).)*\\*/\\s*\\})\\s*$`,
    'u',
);
const ELIDED_HASH_LINE = new RegExp(`^\\s*#\\s*${ELLIPSIS}\\s*$`, 'u');
const HASH_OMISSION_COMMENT = new RegExp(`^\\s*#\\s*${ELLIPSIS}.*\\S\\s*$`, 'u');
const ELIDED_BRACES = new RegExp(`\\{\\s*${ELLIPSIS}\\s*\\}`, 'gu');

const BRACE_AND_LINE_FILES = /\.(?:html?|vue|svelte|astro|xml|svg|[cm]?jsx?|tsx?|css|scss|sass|less|json|php|go|rs|java|kt|cs|swift|c|cc|cpp|h|hpp)$/iu;
const MARKUP_FILES = /\.(?:html?|vue|svelte|astro|xml|svg|[cm]?jsx|tsx|php)$/iu;
const PAGE_FILES = /\.(?:html?|php)$/iu;
const HASH_COMMENT_FILES = /\.(?:py|pyi|rb|sh|ya?ml|toml)$/iu;

const tagOf = (text: string) => {
    const m = TAG.exec(text);
    return m ? { closing: !!m[1], name: m[2], selfClosing: !!m[3] } : null;
};
const isBlock = (name: string) => BLOCK.has(name.toLowerCase()) || /^[A-Z]/u.test(name);

/** True when the line before `index` (the previous non-blank one) is itself a comment this one continues. */
function continuesAComment(lines: string[], index: number, hash: boolean): boolean {
    for (let i = index - 1; i >= 0; i--) {
        const prev = lines[i].trim();
        if (!prev) continue;
        return hash ? prev.startsWith('#') : (prev.startsWith('//') || prev.endsWith('*/') || prev.endsWith('-->'));
    }
    return false;
}

/** Nothing written outside the elided blocks: no word or number left in the page body. */
function writesNothingElse(content: string, elided: string[]): boolean {
    const body = /<body\b[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/iu.exec(content)?.[1] ?? content;
    let rest = body;
    for (const part of elided) rest = rest.split(part).join(' ');
    rest = rest.replace(/<script\b[\s\S]*?<\/script\s*>/giu, ' ').replace(/<style\b[\s\S]*?<\/style\s*>/giu, ' ')
        .replace(/<!--[\s\S]*?-->/gu, ' ').replace(/<[^>]*>/gu, ' ').replace(/&[#\w]+;/gu, ' ');
    return !/[\p{L}\p{N}]/u.test(rest);
}

/** The elided parts of `content` (as written), in the order they appear, or [] when it is a whole file. */
export function elidedParts(filePath: string, content: unknown): string[] {
    const target = String(filePath || '');
    if (typeof content !== 'string' || !content.trim()) return [];
    const parts: Array<{ at: number; text: string }> = [];
    const slots: Array<{ at: number; text: string }> = [];
    const markup = MARKUP_FILES.test(target);
    // The text with every ellipsis text node judged here blanked out, so the
    // line and brace readers below never judge one a second time.
    let rest = content;
    if (markup) {
        for (const match of content.matchAll(ELLIPSIS_TEXT_NODE)) {
            const gt = match.index as number;
            const end = gt + match[0].length;
            const leftText = content.slice(content.lastIndexOf('<', gt), gt + 1);
            const close = content.indexOf('>', end);
            const rightText = close > end ? content.slice(end, close + 1) : '';
            const left = tagOf(leftText);
            const right = tagOf(rightText);
            rest = rest.slice(0, gt + 1) + match[1].replace(/\S/gu, ' ') + rest.slice(end);
            if (left && !left.closing && !left.selfClosing && right?.closing && right.name.toLowerCase() === left.name.toLowerCase()) {
                const whole = { at: gt + 1 - leftText.length, text: leftText + match[1] + rightText };
                const name = left.name.toLowerCase();
                if (STRUCTURAL.has(name)) parts.push(whole);
                else if (name === 'div') slots.push(whole);
                continue;                                   // a leaf's own text: «<p>...</p>», a paginator's «<li>…</li>»
            }
            const besideBlock = (!!left && (left.closing || left.selfClosing) && isBlock(left.name))
                || (!!right && !right.closing && isBlock(right.name));
            if (besideBlock) parts.push({ at: gt + 1, text: `${leftText}${match[1].trim()}${rightText}` });
        }
    }
    if (BRACE_AND_LINE_FILES.test(target) || HASH_COMMENT_FILES.test(target)) {
        const hash = !BRACE_AND_LINE_FILES.test(target);
        const lines = rest.split(/\r?\n/u);
        let offset = 0;
        lines.forEach((line, index) => {
            const at = offset;
            offset += line.length + (rest.startsWith('\r\n', offset + line.length) ? 2 : 1);
            if (hash) {
                if (ELIDED_HASH_LINE.test(line)
                    || (HASH_OMISSION_COMMENT.test(line) && !continuesAComment(lines, index, true))) parts.push({ at, text: line.trim() });
                return;
            }
            if (ELIDED_LINE.test(line)
                || (OMISSION_COMMENT.test(line) && !continuesAComment(lines, index, false))) parts.push({ at, text: line.trim() });
        });
        if (!hash) for (const match of rest.matchAll(ELIDED_BRACES)) parts.push({ at: match.index as number, text: match[0] });
    }
    //  A div's «...» is the page's own waiting text — unless the file is an
    //  outline anyway, or a page with nothing written outside its elided blocks
    //  (several of them, or no script that could be filling one).
    if (slots.length && (parts.length > 0 || (PAGE_FILES.test(target)
        && writesNothingElse(content, slots.map(slot => slot.text))
        && (slots.length > 1 || !/<script\b/iu.test(content))))) parts.push(...slots);
    return parts.sort((a, b) => a.at - b.at).map(part => part.text);
}
