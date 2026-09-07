import fs from 'fs';
import path from 'path';

const RUN_ROUTE = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'routes', 'run.ts'),
    'utf-8',
);

describe('run/start preserves browser ownership on the first message', () => {
    it('derives browser session from the canonical chat session when the client has none', () => {
        const fallbackAt = RUN_ROUTE.indexOf('const effectiveBrowserSessionId');
        const executeAt = RUN_ROUTE.indexOf('browserSessionId: effectiveBrowserSessionId || undefined');

        expect(fallbackAt).toBeGreaterThan(-1);
        expect(RUN_ROUTE.slice(fallbackAt, executeAt)).toContain(
            "String(browserSessionId || '').trim()",
        );
        expect(RUN_ROUTE.slice(fallbackAt, executeAt)).toContain(
            '`browser:${runSessionId}`',
        );
        expect(executeAt).toBeGreaterThan(fallbackAt);
    });

    it('keeps an explicit browser session ahead of the derived fallback', () => {
        const explicit = RUN_ROUTE.indexOf("String(browserSessionId || '').trim()");
        const fallback = RUN_ROUTE.indexOf('`browser:${runSessionId}`');
        expect(explicit).toBeGreaterThan(-1);
        expect(fallback).toBeGreaterThan(explicit);
    });

    it('resolves a new chat session before it can touch attachment memory or persistence', () => {
        const resolved = RUN_ROUTE.indexOf('const runSessionId = String(sessionId || \'\').trim()');
        const attachmentMemory = RUN_ROUTE.indexOf('rememberSessionFiles(runSessionId, fileIds)');
        const persistedMessage = RUN_ROUTE.indexOf('sessionId: runSessionId, role: \'user\'');
        const trace = RUN_ROUTE.indexOf('traceManager.startTrace(runSessionId, text)');

        expect(resolved).toBeGreaterThan(-1);
        expect(attachmentMemory).toBeGreaterThan(resolved);
        expect(persistedMessage).toBeGreaterThan(resolved);
        expect(trace).toBeGreaterThan(resolved);
    });
});
