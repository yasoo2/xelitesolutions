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
 * in full. Only an ellipsis standing in for a whole part counts: a container
 * element's entire body, a line that is nothing else (bare or as a comment), or
 * a brace block holding nothing else. Text such as «Loading...» or a spread
 * `{...props}` is content, not elision. Prose files are not judged, and Python
 * is judged only by comment lines (a bare `...` is its own statement there).
 */
const ELLIPSIS = '(?:\\.{3}|…)';
const CONTAINERS = 'nav|header|footer|main|section|article|aside|div|form|ul|ol|table|thead|tbody|body|head|template';
const ELIDED_CONTAINER = new RegExp(`<(${CONTAINERS})\\b[^>]*>\\s*${ELLIPSIS}\\s*</\\1\\s*>`, 'giu');
const ELIDED_LINE = new RegExp(
    `^\\s*(?:${ELLIPSIS}|//\\s*${ELLIPSIS}|/\\*\\s*${ELLIPSIS}\\s*\\*/|<!--\\s*${ELLIPSIS}\\s*-->|\\{\\s*/\\*\\s*${ELLIPSIS}\\s*\\*/\\s*\\})\\s*$`,
    'u',
);
const ELIDED_HASH_LINE = new RegExp(`^\\s*#\\s*${ELLIPSIS}\\s*$`, 'u');
const ELIDED_BRACES = new RegExp(`\\{\\s*${ELLIPSIS}\\s*\\}`, 'gu');

const BRACE_AND_LINE_FILES = /\.(?:html?|vue|svelte|astro|xml|svg|[cm]?jsx?|tsx?|css|scss|sass|less|json|php|go|rs|java|kt|cs|swift|c|cc|cpp|h|hpp)$/iu;
const MARKUP_FILES = /\.(?:html?|vue|svelte|astro|xml|svg|[cm]?jsx|tsx|php)$/iu;
const HASH_COMMENT_FILES = /\.(?:py|pyi|rb|sh|ya?ml|toml)$/iu;

const MAX_REPORTED_PARTS = 12;

/** The elided parts of `content` (as written), or [] when it is a whole file. */
export function elidedParts(filePath: string, content: unknown): string[] {
    const target = String(filePath || '');
    if (typeof content !== 'string' || !content.trim()) return [];
    const parts: string[] = [];
    if (MARKUP_FILES.test(target)) {
        for (const match of content.matchAll(ELIDED_CONTAINER)) parts.push(match[0]);
    }
    if (BRACE_AND_LINE_FILES.test(target)) {
        for (const line of content.split(/\r?\n/u)) {
            if (ELIDED_LINE.test(line)) parts.push(line.trim());
        }
        // A brace block is judged on the text with element bodies removed, so a
        // markup part is not counted twice.
        const rest = MARKUP_FILES.test(target) ? content.replace(ELIDED_CONTAINER, '') : content;
        for (const match of rest.matchAll(ELIDED_BRACES)) parts.push(match[0]);
    } else if (HASH_COMMENT_FILES.test(target)) {
        for (const line of content.split(/\r?\n/u)) {
            if (ELIDED_HASH_LINE.test(line)) parts.push(line.trim());
        }
    }
    return parts.slice(0, MAX_REPORTED_PARTS);
}
