/**
 * AN EDIT THAT IS ALREADY IN PLACE IS NOT A FAILED EDIT.
 *
 * From his own run (P001, eval 2026-10-26, run-1793008690163): phase 3 had two
 * tasks. `file_edit` on styles.css succeeded; the other task failed and was
 * repaired, and the self-fix reran the phase — every task, on purpose, so a
 * repair is proven against the whole phase. The styles.css edit ran a second
 * time against the file it had already changed:
 *
 *   ERROR: Text to replace not found in …\src\styles.css.
 *          Looked for: @media (max-width: 768px) {.
 *
 * The file held the replacement, word for word. The phase was marked failed
 * on its own earlier success, and a second repair was sent to rewrite a file
 * that was already right. When the replacement CONTAINS the text it replaces
 * (append an item before `</ul>`), the rerun did worse: it found the text again
 * inside its own replacement and added the block a second time, silently.
 *
 * So every literal edit asks this before it changes anything. Both strings
 * must already be in the file's own line endings. It answers yes only on the
 * file's own evidence:
 *  - the replacement contains the sought text: the first place that text sits
 *    is inside a copy of the replacement, at the same offset (that is where the
 *    edit would land, and it is the edit's own result);
 *  - otherwise: the sought text is gone and the replacement is in the file
 *    exactly once, and is long enough to be a line of code rather than a token
 *    (`}` or `2` in a file proves nothing about who put it there).
 * A deletion (empty replacement) leaves nothing to recognise, and is never
 * claimed as already done.
 */
const MIN_RECOGNISABLE_REPLACEMENT = 24;

export function editAlreadyApplied(content: string, find: string, replace: string): boolean {
    if (!find || !replace || find === replace) return false;
    const inner = replace.indexOf(find);
    if (inner >= 0) {
        const at = content.indexOf(find);
        return at >= inner && content.startsWith(replace, at - inner);
    }
    if (content.includes(find)) return false;
    if (replace.trim().length < MIN_RECOGNISABLE_REPLACEMENT) return false;
    const first = content.indexOf(replace);
    return first >= 0 && content.indexOf(replace, first + 1) < 0;
}
