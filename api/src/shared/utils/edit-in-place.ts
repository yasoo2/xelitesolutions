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
 *
 * WHERE THE EDIT WOULD LAND DECIDES WHAT «ALREADY» MEANS (round 21 review).
 * file_edit and file_edit_advanced land on the FIRST occurrence, so for them
 * the first occurrence is the one to recognise. The autonomous policy refuses
 * an ambiguous match instead, and it asked this question before its own
 * ambiguity check: a file with two `</ul>`, the first already followed by the
 * item, came back «already applied» — the ambiguity the policy exists to
 * refuse was answered as success. For a `unique` editor the edit is already
 * in place only when every occurrence of the sought text lies inside a copy
 * of the replacement (one occurrence included); otherwise its ambiguity deny
 * stands.
 */
const MIN_RECOGNISABLE_REPLACEMENT = 24;

/** `first`: the editor replaces the first occurrence. `unique`: it refuses a text that occurs more than once. */
export type EditLanding = 'first' | 'unique';

export function editAlreadyApplied(content: string, find: string, replace: string, landing: EditLanding = 'first'): boolean {
    if (!find || !replace || find === replace) return false;
    const inner = replace.indexOf(find);
    if (inner >= 0) {
        const insideACopy = (at: number) => at >= inner && content.startsWith(replace, at - inner);
        if (landing === 'first') return insideACopy(content.indexOf(find));
        let seen = false;
        for (let at = content.indexOf(find); at >= 0; at = content.indexOf(find, at + 1)) {
            if (!insideACopy(at)) return false;
            seen = true;
        }
        return seen;
    }
    if (content.includes(find)) return false;
    if (replace.trim().length < MIN_RECOGNISABLE_REPLACEMENT) return false;
    const first = content.indexOf(replace);
    return first >= 0 && content.indexOf(replace, first + 1) < 0;
}
