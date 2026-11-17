/**
 * ONE MESSAGE IS NORMALISED ONCE.
 *
 * normalizeIntentText is asked about the same string by every reader of a
 * request — the request-action reader, the build gate, the question reader,
 * the browser reader, the planner, the design readers — a dozen times and
 * more per message. Each call folded the text three ways (three Unicode
 * normalisations) and walked it word by word against the typo list.
 *
 * The canonical form is a pure function of the string, so its last readings
 * are kept — and only a few: 32 strings, two million characters. Nothing here
 * may grow with the number of messages Joe has read.
 */
import { normalizeIntentText, normalizedReadingsKept } from '../core/orchestrator/promptNormalizer';

/** How many Unicode normalisations a piece of work costs: the normalizer cannot read a string without them. */
function normalisationsDuring(work: () => void): number {
    const normalize = jest.spyOn(String.prototype, 'normalize');
    try {
        work();
        return normalize.mock.calls.length;
    } finally {
        normalize.mockRestore();
    }
}

describe('one message is normalised once', () => {
    it('the second reading of the same string does no work', () => {
        const text = 'بدي تصيم واجهة مودرن لشركه برمجيات — once only';
        let first = '';
        const again: string[] = [];
        const workOfTheFirst = normalisationsDuring(() => { first = normalizeIntentText(text); });
        const workOfFourteenMore = normalisationsDuring(() => { for (let i = 0; i < 14; i++) again.push(normalizeIntentText(text)); });
        expect(workOfTheFirst).toBeGreaterThan(0);
        expect(workOfFourteenMore).toBe(0);
        expect(new Set(again)).toEqual(new Set([first]));
    });

    it('a remembered reading is the reading: every canonical form is what it always was', () => {
        const fixtures: Array<[string, string]> = [
            ['بدي تصيم واجهة مودرن', 'اريد صمم واجهة مودرن'],
            ['بدي واجهة مودرن', 'اريد واجهة مودرن'],
            ['واجهة حديثة', 'واجهة حديثه'],
            ['وشوف التصميم', 'وانظر صمم'],
            ['والتصميم متجاوب', 'وصمم متجاوب'],
            ['', ''],
        ];
        for (let round = 0; round < 3; round++) {
            for (const [raw, canonical] of fixtures) expect(normalizeIntentText(raw)).toBe(canonical);
        }
        // Two strings that differ by one word are two messages.
        expect(normalizeIntentText('احذف الزر')).not.toBe(normalizeIntentText('اضف الزر'));
        expect(normalizeIntentText('احذف الزر')).toBe(normalizeIntentText('احذف الزر'));
    });

    it('keeps the last 32 readings and no more, however many messages pass', () => {
        for (let i = 0; i < 500; i++) normalizeIntentText(`ابني موقع رقم ${i} لمطعمي`);
        expect(normalizedReadingsKept().readings).toBeLessThanOrEqual(32);
        // The newest is still remembered; the oldest is gone, and is read again.
        expect(normalisationsDuring(() => normalizeIntentText('ابني موقع رقم 499 لمطعمي'))).toBe(0);
        expect(normalisationsDuring(() => normalizeIntentText('ابني موقع رقم 0 لمطعمي'))).toBeGreaterThan(0);
    });

    it('a reading asked for again is the last to be forgotten', () => {
        const kept = 'ابني متجر للعطور — the one he keeps asking about';
        normalizeIntentText(kept);
        for (let i = 0; i < 31; i++) normalizeIntentText(`رسالة أخرى ${i}`);
        normalizeIntentText(kept);                               // asked again: now the newest
        for (let i = 0; i < 31; i++) normalizeIntentText(`رسالة ثالثة ${i}`);
        expect(normalisationsDuring(() => normalizeIntentText(kept))).toBe(0);
    });

    it('pasted specifications cannot grow the memory: at most two million characters are kept', () => {
        const page = 'a '.repeat(150_000);                           // 300 KB, and as much again for its reading
        for (let i = 0; i < 8; i++) normalizeIntentText(`${i} ${page}`);
        const kept = normalizedReadingsKept();
        expect(kept.characters).toBeLessThanOrEqual(2_000_000);
        expect(kept.characters).toBeGreaterThan(0);
        expect(kept.readings).toBeLessThanOrEqual(32);
        // A text larger than the whole allowance is read and never kept.
        const huge = 'a '.repeat(600_000);
        expect(normalizeIntentText(huge).length).toBeGreaterThan(0);
        expect(normalizedReadingsKept()).toEqual(kept);
        expect(normalisationsDuring(() => normalizeIntentText(huge))).toBeGreaterThan(0);
    });
});
