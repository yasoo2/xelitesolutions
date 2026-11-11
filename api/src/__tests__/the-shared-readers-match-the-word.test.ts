/**
 * THE SHARED READERS MATCH THE WORD, NOT ONE WAY OF TYPING IT (round 22, R5
 * of the second review of round 21).
 *
 * RECORD_CONTAINER and the interface head were written in one spelling, and
 * each miss was answered with one more spelling («قائمه» after «قائمة»):
 * «قايمة الطلاب» still lost its container, so its columns became the tables
 * `asms` and `amrs`, and «اداره الحاويات» was no interface head, so
 * api_project built a generic /api/items. They are now matched on the request
 * folded the way promptNormalizer.foldChars folds it, with folded pattern
 * sources, and the match is mapped back to his own text. Every case below
 * failed on 3c8302e2 (eval/proof/r22/reading/labels-before.txt).
 */
import { namedEntities } from '../core/design/named-entities';
import { inferModel, keyForPhrase } from '../core/design/entity-inference';
import { FoldedRegExp, listRegion } from '../core/design/request-lists';
import { RECORD_CONTAINER } from '../core/design/app-blueprints';

const keys = (entities: Array<{ key: string }>) => entities.map(e => e.key);

/* ─────────────────────────────── R5 ─────────────────────────────── */

describe('R5 — the shared readers match the word, not one way of typing it', () => {
    it('«قايمة» and «قايمه» are the container «قائمة»', () => {
        for (const spelling of ['قايمة', 'قايمه', 'قائمه', 'قائمة']) {
            const request = `بدي ${spelling} الطلاب فيها: الاسم والعمر`;
            expect(RECORD_CONTAINER.test(request)).toBe(true);
            const reading = inferModel(request);
            expect(reading.declared).toBe(true);
            expect(keys(reading.entities)).toEqual(['students']);
        }
    });

    it('«اداره» is the interface head «إدارة»', () => {
        for (const spelling of ['اداره', 'إدارة', 'ادارة', 'إداره']) {
            const request = `ابن باك اند ${spelling} الحاويات والشحنات والسائقين`;
            expect(listRegion(request)?.marker).toBe('head');
            expect(keys(namedEntities(request))).toEqual(['containers', 'shipments', 'drivers']);
        }
    });

    it('a folded match is mapped back to his own text, marks and tatweel included', () => {
        const re = new FoldedRegExp('(?:جدول|قائمة)', 'u');
        for (const text of ['بدي قائمـــة الطلاب', 'ابنِ سِجِلّاً ثم قَائِمَة', 'x قايمه']) {
            const m = re.exec(text)!;
            expect(m).not.toBeNull();
            expect(text.slice(m.index, m.index + m[0].length)).toBe(m[0]);
            expect(m[0].replace(/[ً-ْـ]/gu, '').replace(/[ئ]/gu, 'ي').replace(/ة/gu, 'ه')).toMatch(/^قايم[هة]$/u);
        }
        // The head keeps the tatweel that glues a preposition to an idafa noun.
        expect(keys(namedEntities('أنشئ واجهة برمجية لمكتب عقارات فيها نقاط وصول لـعقود الإيجار والمستأجرين والمدفوعات')))
            .toEqual(expect.arrayContaining([keyForPhrase('عقود الإيجار')]));
    });
});

