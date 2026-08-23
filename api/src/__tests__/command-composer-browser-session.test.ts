import fs from 'fs';
import path from 'path';

const COMPOSER = path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'CommandComposer.tsx');
const readComposer = () => fs.readFileSync(COMPOSER, 'utf-8');

describe('each Joe run carries the browser of its chat session', () => {
    it('derives the browser session before any text-specific browser detection', () => {
        const src = readComposer();
        const deriveAt = src.indexOf('let effectiveBrowserSessionId = browserSessionId || (sessionId ? `browser:${sessionId}` : undefined);');
        const textGateAt = src.indexOf('needsBrowserForText(inputText)');
        expect(deriveAt).toBeGreaterThan(0);
        expect(textGateAt).toBeGreaterThan(deriveAt);
    });

    it('sends that effective session in the run payload', () => {
        const src = readComposer();
        const payloadAt = src.indexOf('const payload: any = {');
        expect(payloadAt).toBeGreaterThan(0);
        const payload = src.slice(payloadAt, payloadAt + 900);
        expect(payload).toMatch(/sessionId,\s*\n\s*browserSessionId: effectiveBrowserSessionId \|\| undefined,/);
    });

    it('preserves an explicitly supplied browser session over the derived fallback', () => {
        const src = readComposer();
        expect(src).toContain('browserSessionId || (sessionId ? `browser:${sessionId}` : undefined)');
        expect(src).toContain('const b = String(browserSessionId || \'\').trim();');
        expect(src).toContain('if (b) return { sessionId: b };');
    });
});
