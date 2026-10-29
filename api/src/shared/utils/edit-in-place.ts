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
 *
 * THE EDIT'S OWN RESULT IS READ BY UNDOING IT (round 22). The rule above looked
 * for the sought text at one offset of the replacement only — its first. An
 * «insert after» edit holds the sought text twice: find `</li>`, replace
 * `</li>\n  <li>Contact</li>`. Once it has landed, the file's second `</li>` is
 * the replacement's own second one, never covered by the first offset, so the
 * rerun of an edit that had already landed was refused as ambiguous (an import
 * inserted after `from 'react';` the same way). The question is now asked of
 * the file itself: put the sought text back where a copy of the replacement
 * stands, and see whether this editor would have landed exactly there — the
 * first occurrence for a `first` editor, the one and only occurrence for a
 * `unique` one. That reads every offset at once; for a `unique` editor it
 * means exactly one copy of the replacement and no occurrence of the sought
 * text outside it. A file whose two lists both carry the item is not what an
 * editor that refuses a text found twice could have produced, so its
 * ambiguity deny stands.
 */
const MIN_RECOGNISABLE_REPLACEMENT = 24;

/** `first`: the editor replaces the first occurrence. `unique`: it refuses a text that occurs more than once. */
export type EditLanding = 'first' | 'unique';

export function editAlreadyApplied(content: string, find: string, replace: string, landing: EditLanding = 'first'): boolean {
    if (!find || !replace || find === replace) return false;
    if (replace.includes(find)) {
        for (let at = content.indexOf(replace); at >= 0; at = content.indexOf(replace, at + 1)) {
            const undone = content.slice(0, at) + find + content.slice(at + replace.length);
            const landsHere = undone.indexOf(find) === at;
            if (landsHere && (landing === 'first' || undone.indexOf(find, at + 1) < 0)) return true;
        }
        return false;
    }
    if (content.includes(find)) return false;
    if (replace.trim().length < MIN_RECOGNISABLE_REPLACEMENT) return false;
    const first = content.indexOf(replace);
    return first >= 0 && content.indexOf(replace, first + 1) < 0;
}
