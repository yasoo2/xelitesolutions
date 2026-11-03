/**
 * JOE SPEAKS THE LANGUAGE THE USER SET.
 *
 * The owner's rule (2026-11-01): when the user sets Joe's language in the
 * settings, everything Joe says is in that language. The agent engine's
 * notes, its summary and its verdict follow the interface's language; the
 * app it builds keeps the request's language.
 */
jest.mock('../api/ws', () => ({ broadcast: jest.fn(), broadcastThinkingDetail: jest.fn() }));
import { firstMessage, systemPrompt } from '../core/engine/prompt';
import { newPlan } from '../core/engine/plan';
import { uiEmitter } from '../core/engine/run';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ws = require('../api/ws');

describe('the engine is told which language to speak', () => {
    it('an Arabic request with the interface in English: the app in Arabic, the notes and summary in English', () => {
        const text = firstMessage('اعمل لي متجر', 'ar', newPlan([]), 'D:/w/app', 'en');
        expect(text).toMatch(/Request language: Arabic\./);
        expect(text).toMatch(/task_finish summary in English: that is the language the user set Joe to\./);
    });

    it('every language the interface offers is named for the model', () => {
        for (const [code, name] of [['ar', 'Arabic'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['ru', 'Russian']]) {
            expect(firstMessage('Build a shop', 'en', newPlan([]), 'D:/w/app', code)).toMatch(new RegExp(`summary in ${name}:`));
        }
    });

    it('the standing instructions no longer tie the summary to the request', () => {
        const prompt = systemPrompt({ platform: 'win32', shell: 'Windows PowerShell 5.1' });
        expect(prompt).not.toMatch(/Write your final summary in the request's language/);
        expect(prompt).toMatch(/the language the first message names for them/);
    });
});

describe('the live notes are in the interface\'s language', () => {
    const notes = (language: string) => {
        (ws.broadcast as jest.Mock).mockClear();
        const emit = uiEmitter('s1', 'run-1', language);
        emit({ type: 'verification', report: { passed: false, checks: [{ id: 'browser', status: 'failed', detail: 'x' }], unproven: [], at: 0 } } as any);
        emit({ type: 'compacted', removedMessages: 12, summaryChars: 300 } as any);
        return (ws.broadcast as jest.Mock).mock.calls.map(c => c[0]).filter((m: any) => m.type === 'engine_note').map((m: any) => m.data.text);
    };
    it('Arabic', () => expect(notes('ar')).toEqual(['❌ فشلت الفحوص: browser', '… طُويت 12 رسالة سابقة في ملخص']));
    it('English', () => expect(notes('en')).toEqual(['❌ checks failed: browser', '… folded 12 earlier messages into a summary']));
    it('Spanish', () => expect(notes('es')[0]).toBe('❌ fallaron las comprobaciones: browser'));
    it('an unknown code falls back to English, never to nothing', () => expect(notes('xx')[0]).toBe('❌ checks failed: browser'));
});
