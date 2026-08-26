/**
 * A STYLESHEET WHOSE SELECTORS MATCH NOTHING THE GENERATOR WRITES.
 *
 * Caught in my own work, before it shipped. The composer emits rules for
 * `.section`, `.section-head`, `.split` and `.stack`. Counted in the file
 * that writes the markup:
 *
 *     wrap          11        <- reaches
 *     panel         32        <- reaches
 *     card           4        <- reaches
 *     product        3        <- reaches
 *     eyebrow        1        <- reaches
 *     section"       0        <- touches nothing
 *     section-head   0        <- touches nothing
 *     split          0        <- touches nothing
 *     stack          0        <- touches nothing
 *
 * So a design was composed from ten decisions and half of it landed on
 * selectors nothing wears. The page would come out looking exactly as
 * repetitive as before, and every measurement of the genome would still say
 * a hundred distinct designs — because the genome IS distinct. It simply
 * never reached the screen.
 *
 * ⛔ THE CLASS is this session's most common one, and I committed it while
 * closing it: a capability that exists and a reader that never asks. The
 * measurement said the design varied; the page said it did not; and nothing
 * connected the two claims.
 *
 * THIS TEST IS THE CONNECTION. It reads the selectors the composer really
 * emits and the class names the generator really writes, and fails when a
 * rule is written for something that does not exist. Not «does the CSS look
 * right» — «does this CSS have anything to style».
 */

import fs from 'fs';
import path from 'path';
import { composeDesign, composedCss } from '../core/design/composer';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
const TEMPLATES = SRC('modules/tools/definitions/react-app-templates.ts');

/** Every class name the generator writes into className="…". */
function classesWritten(src: string): Set<string> {
    const out = new Set<string>();
    for (const m of src.matchAll(/className=\{?["'`]([^"'`]+)["'`]/g)) {
        for (const c of m[1].split(/\s+/)) if (c && !c.includes('$')) out.add(c);
    }
    //  Template-driven names: className={`card ${x}`} and friends.
    for (const m of src.matchAll(/className=\{`([^`]+)`/g)) {
        for (const c of m[1].split(/\s+/)) if (c && !c.includes('$')) out.add(c.replace(/[{}]/g, ''));
    }
    return out;
}

/** Every class selector the composed stylesheet targets. */
function classesTargeted(css: string): Set<string> {
    const out = new Set<string>();
    //  Only selector positions: the part before '{', split on commas.
    for (const block of css.split('}')) {
        const head = block.split('{')[0] || '';
        if (!head.trim() || head.includes('@') || head.includes('--')) continue;
        for (const m of head.matchAll(/\.([a-z][a-z0-9-]*)/gi)) out.add(m[1]);
    }
    return out;
}

describe('every rule the composer writes has something to style', () => {
    const written = classesWritten(TEMPLATES);

    it('POSITIVE — no composed selector targets a class nothing wears', () => {
        const css = composedCss(composeDesign('اعمل لي موقع لمحمصة قهوة مختصة'));
        const orphans = [...classesTargeted(css)].filter(c => !written.has(c)).sort();
        //  Named one by one, because «some selector is dead» is not something
        //  anyone can act on and this list is exactly the repair.
        expect(orphans).toEqual([]);
    });

    it('POSITIVE — and it holds for every shape the composer can take', () => {
        //  A dial the request happens not to reach today must not hide a dead
        //  selector until the day it does.
        for (const r of [
            'اعمل موقع بسيط جداً', 'اعمل موقع جريء وصارخ', 'اعمل موقع فاخر أنيق',
            'اعمل موقع مرح حيوي', 'اعمل موقع رسمي مؤسسي', 'اعمل موقع مركز بالوسط',
            'اعمل موقع مزدحم كثيف', 'اعمل موقع دافئ حميم',
        ]) {
            const orphans = [...classesTargeted(composedCss(composeDesign(r)))]
                .filter(c => !written.has(c)).sort();
            expect({ r, orphans }).toEqual({ r, orphans: [] });
        }
    });

    it('NEGATIVE — the checker can actually fail', () => {
        //  Non-emptiness: a checker that never fires is indistinguishable from
        //  a clean stylesheet, which is the defect this file is about.
        const fake = '.wrap{color:red}.definitely-not-a-real-class{color:blue}';
        const orphans = [...classesTargeted(fake)].filter(c => !written.has(c));
        expect(orphans).toEqual(['definitely-not-a-real-class']);
    });

    it('NEGATIVE — and it reads real class names, not noise', () => {
        //  If the reader found nothing, every selector would look orphaned and
        //  the guard would be loud and useless.
        expect(written.has('wrap')).toBe(true);
        expect(written.has('panel')).toBe(true);
        expect(written.size).toBeGreaterThan(40);
    });
});
