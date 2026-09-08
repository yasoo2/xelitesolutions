import fs from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import { mayUseRunSession } from '../api/routes/run';

const RUN_ROUTE = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'routes', 'run.ts'),
    'utf-8',
);

describe('run/start preserves browser ownership on the first message', () => {
    const originalReadyState = (mongoose.connection as any)._readyState;
    const originalSessions = (global as any).mockSessions;

    afterEach(() => {
        (mongoose.connection as any)._readyState = originalReadyState;
        (global as any).mockSessions = originalSessions;
    });

    it('uses the isolated local session store when Mongo is unavailable', async () => {
        (mongoose.connection as any)._readyState = 0;
        (global as any).mockSessions = [
            { id: 'local-a', userId: 'owner-a' },
            { id: 'local-b', userId: 'owner-b' },
        ];

        await expect(mayUseRunSession('local-a', 'owner-a')).resolves.toBe(true);
        await expect(mayUseRunSession('local-a', 'owner-b')).resolves.toBe(false);
        await expect(mayUseRunSession('missing', 'owner-b')).resolves.toBe(true);
    });

    it('persists the run message through the same runtime-aware store decision', () => {
        expect(RUN_ROUTE).toContain('if (usesJsonRunStore())');
    });

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
