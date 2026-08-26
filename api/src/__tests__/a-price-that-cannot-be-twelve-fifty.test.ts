/**
 * A SALES TABLE THAT COULD RECORD 12 AND 13, BUT NOT 12.50.
 *
 * Built by Joe on the owner's machine from his own sentence:
 *
 *     «اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر ولا تقبل سعرًا صفرًا»
 *
 * Measured in Chromium against the shipped dist bundle, same inputs both runs
 * (اسم الصنف=«قلم», الكمية=«2»), only the price changed:
 *
 *     price="13"     checkValidity: true   stepMismatch: false   rows 0 → 1
 *     price="12.50"  checkValidity: false  stepMismatch: true    rows 0 → 0
 *                    validationMessage: "…The two nearest valid values are ١٢ and ١٣."
 *
 * The emitted field carried `min` and no `step`. With no `step` the default is
 * 1 and the step base is `min` = 0, so every fractional price is a stepMismatch
 * and the browser refuses the form before `submit` ever runs. The app's OWN
 * validator would have accepted 12.50 — it was never consulted.
 *
 * Two things make it worse than a rejected row. The failure is silent: the row
 * simply does not appear. And `setError('')` lives inside `submit`, so a
 * message from a previous attempt — «يجب أن تكون قيمة السعر أكبر من 0» — stays
 * pinned under the form and reads as a verdict on 12.50, sending him to fix a
 * rule he did not break.
 *
 * The class: THE BROWSER ENFORCING A RULE HE NEVER STATED. He forbade zero. He
 * said nothing about whole numbers. An integer step is a constraint the
 * generator invented, in the same family as a page Joe adds because it is in a
 * catalogue rather than in the request. `step="any"` hands judgement back to
 * the rules actually derived from his sentence.
 *
 * The file already knew this — react-app-templates.ts:2995 emits
 * `step={f.type === 'REAL' ? 'any' : undefined}` in another template. Two
 * number fields, two templates, one of them told. A seam, again.
 */

import { blueprintFor } from '../core/design/app-blueprints';
import { fileRecordsAppJsx } from '../modules/tools/definitions/react-app-templates';

const REQUEST = 'اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر ولا تقبل سعرًا صفرًا';

/** Every `<input …/>` element in the generated source, as raw text. */
const inputsOf = (src: string) => [...src.matchAll(/<input\b[\s\S]*?\/>/g)].map(m => m[0]);

describe('a number field he did not restrict accepts a fraction', () => {
    const source = fileRecordsAppJsx(true);

    it('the generated source was really produced — an empty scan proves nothing', () => {
        expect(source.length).toBeGreaterThan(2000);
        expect(inputsOf(source).length).toBeGreaterThan(0);
    });

    it('every emitted number input carries a step, so a fraction is not a stepMismatch', () => {
        //  Read from the source that is actually written to his disk, not from
        //  a description of it. The two number inputs live in two different
        //  templates in one file; a fix that reaches one is not a fix.
        const numeric = inputsOf(source).filter(i => i.includes("'number'"));
        expect(numeric.length).toBeGreaterThanOrEqual(2);
        const without = numeric.filter(i => !/\bstep=/.test(i));
        //  The message names the offenders: «one input lacks step» is the
        //  report that would have taken an hour to place.
        expect(`no step on: ${without.join(' || ')}`).toBe('no step on: ');
    });

    it('and the bound he DID state is still on the field he stated it about', () => {
        //  The negative case. Removing the browser's invented rule must not
        //  remove his real one — «لا تقبل سعرًا صفرًا» still has to hold.
        const bp: any = blueprintFor('records' as any, REQUEST, true);
        const price = (bp.fields || []).find((f: any) => f.label === 'السعر');
        expect(price?.min).toBe(0);
        expect(price?.minExclusive).toBe(true);
        expect(source).toMatch(/minExclusive|min !== undefined/);
    });

    it('a text field is given no step at all', () => {
        //  A step on a text input is meaningless markup; the guard has to be
        //  about number fields, not about the string «step» appearing.
        const texts = inputsOf(source).filter(i => i.includes("'text'") && !i.includes("'number'"));
        for (const t of texts) expect(/\bstep=/.test(t)).toBe(false);
    });
});
