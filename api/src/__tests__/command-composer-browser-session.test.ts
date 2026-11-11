import fs from 'fs';
import path from 'path';

const COMPOSER = path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'CommandComposer.tsx');
const readComposer = () => fs.readFileSync(COMPOSER, 'utf-8').replace(/\r\n/g, '\n');

/**
 * A RUN CARRIES THE BROWSER OF ITS CHAT — the chat the run really belongs to.
 *
 * These pins named the chat `sessionId`, the composer's prop. Since
 * 2026-09-07 (c219da214) the composer derives the browser from
 * `runSessionId`: the prop's value, or — on a first prompt, when there was no
 * chat yet — the session it creates at the client boundary before the first
 * live event. The prop is empty exactly then, so a browser derived from it
 * was `undefined` on every first message: the very loss the rule exists to
 * prevent. The pins read `sessionId` long after the code had moved on, and
 * failed on correct code (found 2026-11-08). They now pin the run's session,
 * and the derivation is RUN, not only read.
 */
const DERIVE = 'let effectiveBrowserSessionId = browserSessionId || (runSessionId ? `browser:${runSessionId}` : undefined);';

describe('each Joe run carries the browser of its chat session', () => {
    it('knows the run\'s own session first, then derives the browser before any text-specific browser detection', () => {
        const src = readComposer();
        const runSessionAt = src.indexOf("let runSessionId = String(sessionId || '').trim();");
        const deriveAt = src.indexOf(DERIVE);
        const textGateAt = src.indexOf('needsBrowserForText(inputText)');
        expect(runSessionAt).toBeGreaterThan(0);
        expect(deriveAt).toBeGreaterThan(runSessionAt);
        expect(textGateAt).toBeGreaterThan(deriveAt);
    });

    it('the derivation, run: an explicit browser wins, the chat\'s own browser otherwise, nothing without a chat', () => {
        const src = readComposer();
        expect(src).toContain(DERIVE);
        const expression = DERIVE.slice(DERIVE.indexOf('=') + 1, -1).trim();
        // eslint-disable-next-line no-new-func
        const derive = new Function('browserSessionId', 'runSessionId', `return ${expression};`) as
            (browserSessionId: string | null | undefined, runSessionId: string) => string | undefined;
        expect(derive('browser:picked', 'chat-1')).toBe('browser:picked');
        expect(derive(null, 'chat-1')).toBe('browser:chat-1');
        expect(derive(undefined, 'chat-created-on-first-prompt')).toBe('browser:chat-created-on-first-prompt');
        expect(derive(null, '')).toBeUndefined();
    });

    it('sends that effective session in the run payload, beside the run\'s own session', () => {
        const src = readComposer();
        const payloadAt = src.indexOf('const payload: any = {');
        expect(payloadAt).toBeGreaterThan(0);
        const payload = src.slice(payloadAt, payloadAt + 900);
        expect(payload).toMatch(/sessionId: runSessionId,\s*\n\s*browserSessionId: effectiveBrowserSessionId \|\| undefined,/);
    });

    it('preserves an explicitly supplied browser session over the derived fallback', () => {
        const src = readComposer();
        expect(src).toContain('browserSessionId || (runSessionId ? `browser:${runSessionId}` : undefined)');
        expect(src).toContain('const b = String(browserSessionId || \'\').trim();');
        expect(src).toContain('if (b) return { sessionId: b };');
    });
});
