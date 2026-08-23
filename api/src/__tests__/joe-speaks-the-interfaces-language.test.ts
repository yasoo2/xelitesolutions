/**
 * JOE SPEAKS THE INTERFACE'S LANGUAGE.
 *
 * The owner, looking at an English interface while Joe narrated his build in
 * Arabic:
 *
 *     «النظام الان باللغه الانجليزية فلماذا تظهر بعض الكلمات باللغه العربية»
 *
 * Measured end to end before the repair. The composer sent the switcher's
 * value and the build received the opposite:
 *
 *     SENT_LANGUAGE="en"                                  (browser → server)
 *     template classification: … lang=ar (ui=ar)          (server → build)
 *
 * Cause: one question with two answers, eleven hundred lines apart.
 * AgentLoopService let the MESSAGE decide and the switcher break ties;
 * ReactProjectTool and shared/reply-language said the opposite. Both rules
 * were written after a real complaint, which is why neither looked wrong.
 *
 * There is one answer now, in one place. After the repair, same request:
 *
 *     template classification: … lang=en (ui=en)
 *     "A full React project … — «عيادة أسنان»."
 *     "A working application, not a page about one — «المواعيد»"
 *
 * — an English sentence carrying his Arabic words unchanged, which is the
 * whole point: the interface owns Joe's voice, and he owns his own words.
 */
import { replyLanguageCode, isArabicReply } from '../shared/reply-language';
describe('the interface decides what Joe says', () => {
    // POSITIVE — the switcher wins over the script of the message.
    it.each([
        ['English UI, Arabic request', 'en', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد', 'en'],
        ['Arabic UI, English request', 'ar', 'Build me a table for my clients', 'ar'],
        ['locale with a region', 'en-US', 'عندي عيادة أسنان', 'en'],
        ['a third language', 'fr', 'عندي عيادة أسنان', 'fr'],
    ])('%s → %s', (_label, ui, text, expected) => {
        expect(replyLanguageCode(ui, text)).toBe(expected);
    });
    // NEGATIVE — with no interface language, the message's own script decides.
    it.each([
        ['no UI, Arabic request', undefined, 'عندي عيادة أسنان. بدي جدول', 'ar'],
        ['no UI, English request', '', 'Build me a table for my clients', 'en'],
    ])('%s → %s', (_label, ui, text, expected) => {
        expect(replyLanguageCode(ui as string | undefined, text)).toBe(expected);
    });
    // NEGATIVE — the two helpers must never disagree again.
    it.each([
        ['en over Arabic text', 'en', 'عندي عيادة أسنان'],
        ['ar over English text', 'ar', 'Build me a table'],
        ['no UI, Arabic text', '', 'عندي عيادة أسنان'],
        ['no UI, English text', '', 'Build me a table'],
    ])('%s: isArabicReply and replyLanguageCode agree', (_label, ui, text) => {
        expect(isArabicReply({ language: ui, text })).toBe(replyLanguageCode(ui, text) === 'ar');
    });
});
