/**
 * ATTACHMENT MEMORY — the picture stays on the table.
 *
 * Field log, verbatim sequence: the user sent an image with «حلل», then
 * followed up «قمم بتحليل هذه الصوره». The composer sends fileIds only WITH
 * the uploading message, so the follow-up reached Joe with no attachment —
 * and the planner invented an exiftool/grep circus. The run route now
 * remembers each session's last attached files and re-attaches them when a
 * later message refers to them.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

import { rememberSessionFiles, recallSessionFiles, REFERS_TO_ATTACHMENT } from '../api/routes/run';

describe('session file memory — remember and recall', () => {
    test('a session recalls exactly what it attached', () => {
        rememberSessionFiles('s-mem-1', ['f1', 'f2']);
        expect(recallSessionFiles('s-mem-1')).toEqual(['f1', 'f2']);
    });
    test('a NEW batch replaces the old one — only the latest files ride again', () => {
        rememberSessionFiles('s-mem-2', ['old']);
        rememberSessionFiles('s-mem-2', ['new1', 'new2']);
        expect(recallSessionFiles('s-mem-2')).toEqual(['new1', 'new2']);
    });
    test('sessions never leak into each other, and unknown sessions recall nothing', () => {
        rememberSessionFiles('s-mem-3', ['mine']);
        expect(recallSessionFiles('s-mem-4')).toEqual([]);
        expect(recallSessionFiles('s-mem-3')).toEqual(['mine']);
    });
    test('empty input is ignored', () => {
        rememberSessionFiles('', ['x']);
        rememberSessionFiles('s-mem-5', []);
        expect(recallSessionFiles('')).toEqual([]);
        expect(recallSessionFiles('s-mem-5')).toEqual([]);
    });
});

describe('what counts as referring to an attachment', () => {
    const refers = [
        'قم بتحليل هذه الصوره',          // the field message
        'قمم بتحليل هذه الصوره',         // with the field typo
        'حللها بدقه',                     // suffix pronoun, no noun
        'لخص الملف',
        'ما رأيك في اللقطة؟',
        'analyze this screenshot please',
        'summarize the attached PDF',
        'translate the document',
    ];
    const doesNot = [
        'ابنِ لي موقعاً لمطعم',
        'كم الساعة الآن؟',
        'شغّل المشروع',
        'ما هي عاصمة فرنسا؟',
    ];
    for (const t of refers) {
        test(`«${t}» → the last files ride again`, () => expect(REFERS_TO_ATTACHMENT.test(t)).toBe(true));
    }
    for (const t of doesNot) {
        test(`«${t}» → nothing is dragged back in`, () => expect(REFERS_TO_ATTACHMENT.test(t)).toBe(false));
    }
});

/**
 * THE WEAK TIER — «صار يتهبل» (field log): «هل هذا متعلق بهاتف ام اي باد؟»
 * points at the fresh screenshot with only a demonstrative; it missed the
 * strong regex and the planner spawned an iPad-vs-iPhone browser
 * expedition. Demonstratives recall the attachment too — but only while
 * it is fresh (15 minutes), so an old picture is never dragged into an
 * unrelated conversation hours later.
 */
import { attachmentRecallMode, WEAK_REFERENCE_WINDOW_MS } from '../api/routes/run';

describe('weak references — demonstratives point at the fresh attachment', () => {
    const weak = [
        'هل هذا متعلق بهاتف ام اي باد؟',   // the field message, verbatim
        'ما رأيك فيها؟',
        'هل هذه واجهة حقيقية؟',
        'ماذا يوجد عنها في الويب؟',
        'is this a phone screen?',
    ];
    const none = [
        'كم الساعة الآن؟',
        'شغّل المشروع',
        'ما هي عاصمة فرنسا؟',
        'ابنِ لي موقعاً لمطعم',
    ];
    for (const t of weak) {
        test(`«${t}» → weak recall`, () => expect(attachmentRecallMode(t)).toBe('weak'));
    }
    for (const t of none) {
        test(`«${t}» → no recall at all`, () => expect(attachmentRecallMode(t)).toBe('none'));
    }
    test('a strong noun stays strong (not downgraded by also containing هذا)', () => {
        expect(attachmentRecallMode('حلل هذه الصوره')).toBe('strong');
    });
    test('the weak window is minutes, not hours', () => {
        expect(WEAK_REFERENCE_WINDOW_MS).toBeLessThanOrEqual(30 * 60_000);
    });
    test('recall honours a custom max age (the weak window)', () => {
        rememberSessionFiles('s-weak-1', ['w1']);
        expect(recallSessionFiles('s-weak-1', WEAK_REFERENCE_WINDOW_MS)).toEqual(['w1']);
        expect(recallSessionFiles('s-weak-1', -1)).toEqual([]);   // already "too old"
    });
});
