/**
 * THE OVERLAY NAMED A NUMBER THE CODE DOES NOT USE.
 *
 * Found by sweeping the class that produced the design defect one commit
 * earlier: **a rule that lives inside `page.evaluate` cannot be unit-tested,
 * so it drifts from everything maintained beside it.**
 *
 * The measurement:
 *
 *     ui-inspection.ts, inside the page:
 *       if (r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40)) tiny++;
 *
 *     the finding he reads:
 *       «${mobileTiny} هدف لمس أصغر من 40px على الجوّال»
 *
 *     the note drawn on HIS PANEL, over the highlighted boxes:
 *       «أهداف لمس أصغر من 44px»                      ← nothing measures 44
 *
 * ⛔ NEITHER NUMBER IS WRONG IN ITSELF. Apple says 44, Material says 48, WCAG
 * 2.5.8 says 24. What is wrong is that the thing he READS was maintained apart
 * from the thing that DECIDES — the class that has cost this repository more
 * than any other, and here it had reached the overlay he actually watches.
 *
 * The rule this file enforces is the only one available when a function is
 * serialised into a browser and cannot reference a constant: **the literal
 * inside the page must equal the constant outside it, and a test says so.**
 */

import fs from 'fs';
import path from 'path';
import { TAP_TARGET_MIN_PX } from '../core/quality/ui-inspection';

const UI = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'quality', 'ui-inspection.ts'), 'utf-8',
);

/** The page function only — nothing outside it, and no prose. */
const IN_PAGE = (() => {
    const at = UI.indexOf('function measureResponsive(');
    const end = UI.indexOf('\n}', at);
    return UI.slice(at, end)
        .split('\n')
        .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
})();

describe('the panel, the report and the measurement say one number', () => {
    it('⛔ POSITIVE — the literal inside the page equals the constant outside it', () => {
        //  The only enforcement available across a serialisation boundary.
        //  Change the constant without changing the page and this reddens;
        //  change the page without the constant and it reddens too.
        const cmp = IN_PAGE.match(/r\.width < (\d+) \|\| r\.height < (\d+)/);
        expect(cmp).toBeTruthy();
        expect(Number(cmp![1])).toBe(TAP_TARGET_MIN_PX);
        expect(Number(cmp![2])).toBe(TAP_TARGET_MIN_PX);
    });

    it('⛔ POSITIVE — and the overlay he watches reads the constant, not a literal', () => {
        //  This is the one that was wrong. A guard on the finding text alone
        //  would have stayed green for as long as the overlay has existed.
        expect(UI).toContain('note: `أهداف لمس أصغر من ${TAP_TARGET_MIN_PX}px`');
    });

    it('⛔ POSITIVE — so do both sentences of the finding', () => {
        expect(UI).toContain('هدف لمس أصغر من ${TAP_TARGET_MIN_PX}px على الجوّال');
        expect(UI).toContain('tap target(s) under ${TAP_TARGET_MIN_PX}px on a phone');
    });

    it('⛔ NEGATIVE — no other threshold is spoken to him anywhere', () => {
        //  Strip comments first: the comment explaining the defect quotes 44,
        //  and a guard that matches its own prose goes red on the fixed file.
        //  Third time that trap has been hit here; it is checked for by
        //  construction now.
        const code = UI.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
        const spoken = code.match(/(?:note|ar|en): [`'][^`']*?(\d\d)px[^`']*[`']/g) || [];
        for (const line of spoken) {
            const n = Number((line.match(/(\d\d)px/) || [])[1]);
            //  12px is the small-text rule and has its own finding; anything
            //  else that talks about a pixel threshold must come from the
            //  constant, not from a number somebody typed twice.
            expect([TAP_TARGET_MIN_PX, 12]).toContain(n);
        }
    });
});
