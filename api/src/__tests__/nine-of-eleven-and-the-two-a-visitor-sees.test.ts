/**
 * NINE OF ELEVEN, AND THE TWO IT MISSED ARE THE TWO A VISITOR SEES.
 *
 * The lesson of the previous commit was that extracting a rule proves it as
 * written and cannot tell you it asks the wrong question — only running the
 * whole system against a defect you planted yourself can. So I planted eleven,
 * across every category he complained about, and ran the real `auditBuiltApp`:
 *
 *     ✓ dead anchor to a missing section id       dead_anchors
 *     ✓ a link that goes nowhere (href="#")       dead_links
 *     ✓ a form filled in, sent, nothing happened  form_dead_submit    high
 *     ✓ a button with no handler                  some_dead_controls
 *     ✓ an input with no name at all              inputs_without_labels
 *     ✓ an image with no alt                      images_without_alt
 *     ✓ a clickable div Tab cannot reach          keyboard_unreachable
 *     ✓ h1 followed by h3                         heading_skip
 *     ✓ two elements sharing an id                duplicate_ids
 *     ✗ an input named only by its placeholder    — nothing
 *     ✗ a sentence cut off by its own box         — nothing
 *
 * ⛔ THE TWO MISSES ARE THE TWO THAT NEED NO EXPERTISE TO NOTICE. Everything
 * caught is something a specialist knows to look for. The two that got through
 * are what any person sees in the first two seconds: **half a sentence, and a
 * box you cannot remember the purpose of.**
 *
 * Both are now measured, and both are measured live in the same probe that
 * found them missing — score fell 15 → 4 on the same page.
 */

import fs from 'fs';
import path from 'path';

const UI = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'quality', 'ui-inspection.ts'), 'utf-8',
);
/** The page function only — no prose, so a guard cannot match its own comment. */
const IN_PAGE = (name: string) => {
    const at = UI.indexOf(`function ${name}(`);
    const end = UI.indexOf('\n}', at);
    return UI.slice(at, end).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
};

describe('text cut off by its own box', () => {
    const R = IN_PAGE('measureResponsive');

    it('⛔ POSITIVE — it is measured at every width, and the narrowest is named', () => {
        //  Truncation is a function of width: a card title that fits at 1280
        //  and is cut at 390 is the commonest shape of it, and the width he
        //  will see it at first is the one worth reporting.
        expect(R).toContain('el.scrollWidth > el.clientWidth + 2');
        expect(R).toContain('el.scrollHeight > el.clientHeight + 2');
        expect(UI).toContain('if (r.clipped && !clippedAt) {');
        expect(UI).toContain('clippedAt = `${vp.w}px`;');
    });

    it('⛔ POSITIVE — and it says what was cut, not just that something was', () => {
        //  «1 element has text cut off» is a fact he cannot act on. The first
        //  forty characters of the sentence tell him which box to look at.
        expect(UI).toContain("code: 'text_clipped'");
        expect(UI).toContain('clippedEvidence[0]?.text');
    });

    it('⛔ NEGATIVE — an element that only CONTAINS clipped children is not accused', () => {
        //  A slider or a marquee clips its children on purpose. The element
        //  must own the text that is being cut, or every carousel on the web
        //  becomes a defect.
        expect(R).toContain('var ownsText = Array.prototype.some.call(el.childNodes, function (n: any) {');
        expect(R).toContain("n.nodeType === 3 && (n.textContent || '').trim().length > 4");
    });

    it('⛔ NEGATIVE — a scrollable box is not a cut, and ellipsis is not silence', () => {
        //  Scrollable: the rest is one gesture away. Ellipsis: the designer
        //  asked for truncation and SAID SO on screen. This finding is for
        //  text that vanishes without a word — and a finding that fires on
        //  deliberate design is a finding he learns to skip.
        expect(R).toContain("var hidesX = ox === 'hidden' || ox === 'clip';");
        expect(R).toContain("if (String(cs.textOverflow || '') === 'ellipsis') return;");
    });
});

describe('a placeholder is not a label, and it is not nothing either', () => {
    const A = IN_PAGE('measureA11y');

    it('⛔ POSITIVE — a field named only by its hint is now reported', () => {
        //  This line used to `return` on `placeholder`, so the commonest form
        //  on the web — including the ones Joe writes — passed silently.
        expect(A).toContain("if (f.getAttribute('placeholder')) {");
        expect(UI).toContain("code: 'placeholder_as_label'");
    });

    it('⛔ NEGATIVE — and it is NOT folded into "no accessible name"', () => {
        //  Different costs, so different findings. A browser does fall back to
        //  the placeholder for the name, so a screen reader says something;
        //  what is lost is that the hint disappears on the first keystroke.
        //  Folding them would either understate the nameless field or
        //  overstate this one, and a report that overstates gets skimmed.
        expect(A).toContain("code: 'inputs_without_labels', severity: 'major'");
        expect(A).toContain("code: 'placeholder_as_label', severity: 'minor'");
    });

    it('⛔ POSITIVE — the sentence names the cost, not the rule', () => {
        //  «Fields named only by their placeholder» means nothing to him. What
        //  it costs him is that the hint vanishes and nobody can check what
        //  belongs in the box.
        expect(UI).toContain('the hint vanishes on the first keystroke');
        expect(UI).toContain('يختفي أول ما يكتب المستخدم');
    });

    /**
     *  ⛔ MY FIRST VERSION OF THIS TEST WAS TOO NARROW AND LET A REAL FALSE
     *  POSITIVE THROUGH.
     *
     *  It asserted only that `aria-label` was asked before the placeholder.
     *  It was — and I had still put the placeholder check three lines too
     *  early, ahead of `label[for=…]` and `closest('label')`. So **a field
     *  with a perfectly good visible label was reported as hint-only**, which
     *  is worse than the miss it replaced: a placeholder alongside a label is
     *  the recommended pattern, not a defect.
     *
     *  Nothing in the source caught it. What caught it was repairing the
     *  planted page BY HAND and watching the audit go on complaining about the
     *  thing I had just fixed. Measured after the move: zero complaints on the
     *  repaired page, both findings still present on the broken one.
     *
     *  So the check is every label form, in order, by construction.
     */
    it('⛔ NEGATIVE — EVERY way of naming a field is asked before the placeholder', () => {
        const phAt = A.indexOf("if (f.getAttribute('placeholder')) {");
        expect(phAt).toBeGreaterThan(0);
        for (const earlier of [
            "f.getAttribute('aria-label')",
            "f.getAttribute('aria-labelledby')",
            "f.getAttribute('title')",
            "label[for=",
            "f.closest('label')",
        ]) {
            const at = A.indexOf(earlier);
            expect(at).toBeGreaterThan(0);
            //  named in the message so a failure says WHICH one moved
            expect({ form: earlier, before: at < phAt }).toEqual({ form: earlier, before: true });
        }
    });

    it('⛔ NEGATIVE — and a field with no name at all is still the stronger finding', () => {
        //  The nameless field must not be swallowed by the new one: the
        //  placeholder branch returns, so anything reaching `unlabelled` has
        //  neither a label nor a hint.
        const phAt = A.indexOf("if (f.getAttribute('placeholder')) {");
        const pushAt = A.indexOf('unlabelled.push(');
        expect(pushAt).toBeGreaterThan(phAt);
    });
});
