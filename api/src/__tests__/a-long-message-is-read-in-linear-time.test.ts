/**
 * A LONG MESSAGE IS READ IN THE TIME IT TAKES TO READ IT.
 *
 * Every request passes through requestedArtifact and normalizeIntentText,
 * several times. On 2026-11-11 the planner's agent timed them on long
 * messages — people paste specifications — and found:
 *
 *   requestedArtifact      20 KB of «build a build a …»   81 s
 *   normalizeIntentText    20 KB of text                  2.1 s
 *
 * The first read the whole rest of the clause after EVERY build verb; the
 * second joined the whole text before every word it repaired. On one server
 * for many users that is one person's paste stopping everyone's requests.
 * Now the object is read within a window after at most 64 verbs, and only the
 * end of what comes before a word is read. Measured on the 1032 prompts of
 * the eval: not one result changed.
 */
import { requestedArtifact } from '../core/design/requested-artifact';
import { normalizeIntentText, canonicalIntentText } from '../core/orchestrator/promptNormalizer';

const timed = (work: () => unknown): number => {
    const t = Date.now();
    work();
    return Date.now() - t;
};

describe('a long message', () => {
    //  Generous bounds for a loaded machine: the old cost was seconds to minutes, not milliseconds.
    const LONG: Array<[string, string]> = [
        ['a build verb on every other word', 'build a '.repeat(2560)],
        ['an Arabic order repeated', 'ابني نظام '.repeat(2000)],
        ['a long list', 'name, phone, email, '.repeat(1000)],
        ['diacritics', 'بَنَيْتُ مَوْقِعًا لِلشَّرِكَةِ '.repeat(680)],
        ['typos the normalizer repairs', 'امني صفحه '.repeat(2000)],
    ];

    it.each(LONG)('%s is read by requestedArtifact in well under two seconds', (_label, text) => {
        expect(text.length).toBeGreaterThan(15_000);
        expect(timed(() => requestedArtifact(text))).toBeLessThan(2000);
    });

    /*
     * The normalizer is linear but not free (it repairs typos word by word), so on a
     * loaded machine its absolute time says little. What it must not do is grow with
     * the square of the text: four times the text, at most about four times the time
     * (before the fix: ×13 from 5 KB to 20 KB of typos).
     */
    it.each(LONG)('%s is normalised in time that grows with the text, not with its square', (_label, text) => {
        const quarter = text.slice(0, Math.floor(text.length / 4));
        //  normalizeIntentText now keeps its last readings (one-message-is-normalised-once.test.ts),
        //  so the second and third call would time a lookup. What is timed here is the reading
        //  itself, as it always was.
        const best = (t: string) => Math.max(1, Math.min(timed(() => canonicalIntentText(t)), timed(() => canonicalIntentText(t)), timed(() => canonicalIntentText(t))));
        const small = best(quarter);
        const whole = best(text);
        expect(whole).toBeLessThan(Math.max(9 * small, 300));
        expect(whole).toBeLessThan(5000);
    });

    it('and a short one still reads what it always read', () => {
        expect(requestedArtifact('Build a booking app for a dental clinic').kind).toBe('booking');
        expect(requestedArtifact('ابني متجر إلكتروني للعطور').kind).toBe('store');
        //  A typo is repaired into an order only where an order can stand: after a wish, or opening the text.
        expect(normalizeIntentText('بدي امني صفحة')).toBe(normalizeIntentText('بدي ابني صفحة'));
        expect(normalizeIntentText('امني صفحة')).toBe(normalizeIntentText('ابني صفحة'));
    });
});
