import { replyLanguageCode, isArabicReply } from '../shared/reply-language';

describe('the interface decides what Joe says', () => {
    it.each([
        ['English UI, Arabic request', 'en', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد', 'en'],
        ['Arabic UI, English request', 'ar', 'Build me a table for my clients', 'ar'],
        ['locale with a region', 'en-US', 'عندي عيادة أسنان', 'en'],
        ['a third language', 'fr', 'عندي عيادة أسنان', 'fr'],
    ])('%s → %s', (_label, ui, text, expected) => {
        expect(replyLanguageCode(ui, text)).toBe(expected);
    });

    it.each([
        ['no UI, Arabic request', undefined, 'عندي عيادة أسنان. بدي جدول', 'ar'],
        ['no UI, English request', '', 'Build me a table for my clients', 'en'],
    ])('%s → %s', (_label, ui, text, expected) => {
        expect(replyLanguageCode(ui as string | undefined, text)).toBe(expected);
    });

    it.each([
        ['en over Arabic text', 'en', 'عندي عيادة أسنان'],
        ['ar over English text', 'ar', 'Build me a table'],
        ['no UI, Arabic text', '', 'عندي عيادة أسنان'],
        ['no UI, English text', '', 'Build me a table'],
    ])('%s: isArabicReply and replyLanguageCode agree', (_label, ui, text) => {
        expect(isArabicReply({ language: ui, text })).toBe(replyLanguageCode(ui, text) === 'ar');
    });
});
