/**
 * ONE MOMENT, THREE NAMES — AND A CLOCK THAT NEVER MOVED.
 *
 * Measured on the owner's own machine. Three consecutive turns, under forty
 * seconds apart:
 *
 *   «عصرٌ مناسب لإنجاز شيء جميل»        ← عصر
 *   «الساعة الآن تقريبًا 12:00 ظهرًا»    ← ظهر
 *   «مساء الخير يا يونس»                ← مساء
 *
 * Then «كم الساعة الآن؟» answered «تقريبًا 12:00» twice, while his own clock
 * read 14:00. The reasoning was never the problem — in the same session Joe
 * counted 132 days to New Year correctly and refused a false Monday/Tuesday
 * choice with the right answer. It was grounded on nothing.
 *
 * Two causes, both in CentralAnswerTool:
 *
 *   1. The prompt announced a BAND («midday») and never a clock, so a request
 *      for the time had no value to quote and a plausible one was supplied —
 *      the same one every time, which reads exactly like a frozen clock.
 *
 *   2. The day-words disagreed. Band labels cut at 15, greeting buckets cut at
 *      18, one bucket carried «مساء الخير» beside «عصرٌ مناسب» under a label
 *      that read «الظهيرة» — and the instruction offered the model a menu of
 *      two, صباح الخير or مساء الخير, for a band that is in neither.
 *
 * These tests pin the repair at its two joints: every day-word comes from one
 * function, and the clock is handed over as a value.
 */
import { dayPartFor, nowFacts, buildTimeBlock } from '../modules/tools/definitions/CentralAnswerTool';

const at = (hour: number, minute = 0) => new Date(2026, 7, 22, hour, minute, 0);

describe('INVARIANT: one function names the moment', () => {
    test.each([
        [0, 'وقت متأخر من الليل'],
        [4, 'وقت متأخر من الليل'],
        [5, 'الصباح'],
        [11, 'الصباح'],
        [12, 'الظهيرة'],
        [14, 'الظهيرة'],
        [15, 'العصر'],
        [17, 'العصر'],
        [18, 'المساء'],
        [23, 'المساء'],
    ] as Array<[number, string]>)('hour %i is «%s»', (hour, ar) => {
        expect(dayPartFor(hour).ar).toBe(ar);
    });

    /**
     * The defect in one assertion. The greeting a bucket offers must belong to
     * the band that bucket is called — «عصرٌ مناسب» under «الظهيرة» is how one
     * moment got three names, and it cannot be caught by reading either line
     * alone.
     */
    test('no hour is offered a greeting from a different part of the day', () => {
        const conflicts: string[] = [];
        for (let hour = 0; hour < 24; hour++) {
            const part = dayPartFor(hour);
            const block = buildTimeBlock(at(hour));
            if (!block.includes(part.ar)) conflicts.push(`hour ${hour}: block never names «${part.ar}»`);
            if (!block.includes(part.greetAr)) conflicts.push(`hour ${hour}: block offers no «${part.greetAr}»`);
            // A morning greeting must never surface in an evening block, and
            // vice versa — the pair that actually collided in the field.
            const foreign = [
                { word: 'صباح الخير', banned: hour >= 12 },
                { word: 'مساء الخير', banned: hour >= 5 && hour < 15 },
            ].filter(f => f.banned && block.includes(f.word));
            for (const f of foreign) conflicts.push(`hour ${hour}: block offers «${f.word}»`);
        }
        expect(conflicts).toEqual([]);
    });
});

describe('INVARIANT: the clock is a value, not a band', () => {
    test('the block carries the real clock, to the minute', () => {
        const block = buildTimeBlock(at(14, 7));
        expect(block).toContain('14:07');
        expect(block).toContain('2026-08-22');
        expect(block).toContain('Saturday');
    });

    test('midnight and single-digit minutes keep two digits', () => {
        expect(buildTimeBlock(at(0, 5))).toContain('00:05');
        expect(nowFacts(at(9, 3)).clock).toBe('09:03');
    });

    /**
     * The ban is the half that stops the fabrication. Without it the model is
     * free to round a known time into «تقريبًا 12:00» — which is what it did.
     */
    test('the block forbids approximating a time', () => {
        const block = buildTimeBlock(at(14, 7));
        expect(block).toMatch(/NEVER approximate, round, or invent a time/);
        expect(block).toMatch(/ONLY clock you have/);
    });

    /**
     * The exact field case: 14:07 on his machine. The band is «الظهيرة», and
     * the greeting offered must be the one that fits it — not a menu of two
     * that excludes it.
     */
    test('at 14:07 the offered greeting belongs to midday', () => {
        const block = buildTimeBlock(at(14, 7));
        expect(block).toContain('الظهيرة');
        expect(block).toContain('طاب يومك');
        expect(block).not.toContain('مساء الخير');
        expect(block).not.toContain('صباح الخير');
    });
});
