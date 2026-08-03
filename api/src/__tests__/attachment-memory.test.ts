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
