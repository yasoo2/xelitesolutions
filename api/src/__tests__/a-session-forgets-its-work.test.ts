/**
 *  A SESSION THAT REMEMBERS ITS WORDS AND FORGETS ITS WORK.
 *
 *  He closed Joe's window, reopened it, and picked a session out of the row at
 *  the bottom. The conversation came back — «وهذا ممتاز» — and then:
 *
 *      «عندما اضغط على شاشة البرفيو فانه لا يعرض الملف الذي بني في تلك الجلسه
 *       … وكل الجلسات السابقة لا تعرض على البرفيو واللوجز ما تم في تلك الجلسة»
 *
 *  Measured on his machine, as a guest, opening two past sessions:
 *
 *      «جدول مهام متصفح»      chat 211 lines · preview iframes=0 src=null · logs empty
 *      «برنامج لحفظ الزبائن»  chat 205 lines · preview iframes=0 src=null · logs empty
 *
 *  and at the same moment, from the same machine:
 *
 *      GET /project-preview/6a8c269c433c89409960335d/index.html  →  HTTP 200
 *      <title>AUTHORITATIVE — العملاء</title>
 *
 *  Nothing was lost. The chat came back because the chat is ASKED for; the
 *  preview and the logs were only ever LISTENED for, and a listener hears
 *  nothing about a build that finished yesterday.
 */
import { logTextFor, logStampFor, asPlainLine } from '../core/session/log-line';

describe('one event, the same line, wherever it is turned into text', () => {
    it('a step that started names itself', () => {
        expect(logTextFor({ type: 'step_started', data: { name: 'scaffold_project' } }))
            .toEqual(['Step Started: scaffold_project']);
    });

    it('a step with no name still produces its line', () => {
        expect(logTextFor({ type: 'step_started', data: {} })).toEqual(['Step Started: Unknown']);
    });

    it('an event nobody logs produces nothing', () => {
        //  The negative that keeps the table from becoming a firehose.
        expect(logTextFor({ type: 'heartbeat', data: { n: 1 } })).toEqual([]);
    });

    it('the build\u2019s real voice becomes one line per line', () => {
        expect(logTextFor({ type: 'terminal_output', id: 'panel-terminal', data: 'npm install\nadded 42 packages\n' }))
            .toEqual(['npm install', 'added 42 packages']);
    });

    it('\u2026and colour never reaches the panel', () => {
        expect(logTextFor({ type: 'terminal_output', id: 'panel-terminal', data: '\u001B[32mdone\u001B[0m' }))
            .toEqual(['done']);
    });

    it('\u2026and the same line fanned to another terminal id is not logged twice', () => {
        //  The negative case: the server may send one session-owned line to
        //  several terminal ids, and only the canonical one is drawn.
        expect(logTextFor({ type: 'terminal_output', id: 'some-other-terminal', data: 'npm install' })).toEqual([]);
    });

    it('spoken text loses its markup and keeps its words', () => {
        expect(logTextFor({ type: 'text', data: { text: '**One thing** before I start' } }))
            .toEqual(['One thing before I start']);
    });

    it('an empty text event says nothing', () => {
        expect(logTextFor({ type: 'text', data: { text: '' } })).toEqual([]);
    });

    it('a failed step and a failed system read differently', () => {
        //  They were two branches with two wordings. Collapsing them into one
        //  would have quietly renamed every system error in every old log.
        expect(logTextFor({ type: 'step_failed', data: { result: { error: 'vite exited 1' } } }))
            .toEqual(['ERROR: vite exited 1']);
        expect(logTextFor({ type: 'error', data: { message: 'socket closed' } }))
            .toEqual(['SYSTEM ERROR: socket closed']);
    });

    it('an error object is spelled out, not printed as [object Object]', () => {
        expect(logTextFor({ type: 'step_failed', data: { error: { code: 'EACCES' } } }))
            .toEqual(['ERROR: {"code":"EACCES"}']);
    });

    it('a tool that started is marked, a tool with no name is not', () => {
        expect(logTextFor({ type: 'tool_started', data: { name: 'npm_manager' } })).toEqual(['▶ npm_manager']);
        expect(logTextFor({ type: 'tool_started', data: {} })).toEqual([]);
    });
});

describe('a restored line carries the moment it happened', () => {
    it('a real timestamp becomes a 24h stamp', () => {
        //  Locale-free on purpose: his Windows is Arabic and an English panel
        //  was stamping «٥:٠٣:١٢ م» into a log the rest of which is Latin.
        const at = new Date(2026, 7, 24, 14, 5, 9).getTime();
        expect(logStampFor(at)).toBe('14:05:09');
    });

    it('an event with no timestamp says so instead of inventing now', () => {
        //  The negative that matters most: a restored log must never wear
        //  today's clock on last week's build.
        expect(logStampFor(undefined)).toBe('--:--:--');
        expect(logStampFor(0)).toBe('--:--:--');
        expect(logStampFor('not a time')).toBe('--:--:--');
    });
});

describe('the markdown stripper moved without changing', () => {
    it('still keeps the words of a link and drops its address', () => {
        expect(asPlainLine('see [the report](http://x/y)')).toBe('see the report');
    });

    it('still turns a bullet into something one font can draw', () => {
        expect(asPlainLine('- first')).toBe('· first');
    });
});
