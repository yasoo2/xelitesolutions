/**
 * A CLAIM ABOUT A PLACE MUST CARRY ITS PLACE.
 *
 * The owner watched a build report this, with nothing moving on his screen:
 *
 *     Self-QA (1 page(s), 2 control(s) pressed, 1 form(s) filled and
 *     submitted (5 fields), 3 viewport(s)): 97/100
 *
 * and asked what the sentence was worth. It was TRUE and it was useless: a
 * private headless browser is a real browser, and the audit really did press
 * two controls. The sentence simply never said WHICH browser — so a number he
 * could not see read exactly like a number he had been shown.
 *
 * He then made it a law, in his own words:
 *
 *     «لا تنقل اي ادعاء بدون قياس دقيق وهذا قانون»
 *
 * The repair is not to hide the score or to stop auditing. It is that the
 * venue is named in the same breath as the number — «في لوحة المتصفّح أمامك»
 * or «في متصفّح خاصّ لم تره» — so the reader always knows whether the claim
 * was something he could have watched.
 */

import { formatAudit, type AppAudit } from '../core/quality/app-audit';

const audit = (over: Partial<AppAudit> = {}): AppAudit => ({
    score: 97,
    findings: [],
    routes: ['/'],
    pressed: 2,
    formsFilled: 1,
    fieldsFilled: 5,
    viewports: ['360', '768', '1280'],
    ...over,
});

describe('the self-QA verdict says where it ran', () => {
    // POSITIVE — an audit he could watch says so, in both languages.
    it.each([
        ['عربي', true, 'في لوحة المتصفّح أمامك'],
        ['English', true, 'in the Browser panel, in front of you'],
    ])('%s: a visible audit names the panel', (label, visible, phrase) => {
        expect(formatAudit(audit({ visible }), label === 'عربي')).toContain(phrase);
    });

    // POSITIVE — and an audit he could NOT watch says that instead.
    it.each([
        ['عربي', 'في متصفّح خاصّ لم تره'],
        ['English', 'in a private browser you could not see'],
    ])('%s: an invisible audit says he could not see it', (label, phrase) => {
        expect(formatAudit(audit({ visible: false }), label === 'عربي')).toContain(phrase);
    });

    // NEGATIVE — the old unqualified claim must never come back.
    it.each([
        ['visible', true],
        ['invisible', false],
    ])('%s: never claims «a real browser» without saying which', (_label, visible) => {
        for (const isAr of [true, false]) {
            const text = formatAudit(audit({ visible }), isAr);
            expect(text).not.toContain('في متصفح حقيقي');
            expect(text).not.toContain('Self-QA in a real browser');
        }
    });

    // NEGATIVE — the venue is stated for a clean run too, not only a flawed one.
    it('a perfect score still says where it was measured', () => {
        expect(formatAudit(audit({ visible: false, score: 100, findings: [] }), true))
            .toContain('في متصفّح خاصّ لم تره');
    });

    // NEGATIVE — and the numbers he asked for are still there beside it.
    it('the countable evidence survives the change', () => {
        const text = formatAudit(audit({ visible: true }), false);
        expect(text).toContain('2 control(s) pressed');
        expect(text).toContain('1 form(s) filled and submitted');
        expect(text).toContain('3 viewport(s)');
    });
});
