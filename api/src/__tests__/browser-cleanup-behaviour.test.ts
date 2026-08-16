/**
 * THE STOP THAT MUST HAPPEN ONCE — measured behaviour, not source spelling.
 *
 * Joe died on every machine ~15 minutes after the browser panel was last
 * touched: stopSession re-inserted the dying session into the live registry so
 * the by-id save could find it, the idle-cleanup loop was iterating that same
 * Map, and a re-inserted entry goes to the tail of the live iterator — an
 * infinite stop-save-stop cycle. The heap snapshot at the crash held 13,805
 * identical Playwright stacks and 13,803 queued Immediates.
 *
 * The behavioural guarantee, asserted here against the real module with only
 * Playwright stubbed: WHILE the final state-save is still in flight, the
 * session is already OUT of the registry — so no loop walking the registry,
 * at any moment, can reach it a second time. The source pin for the same fix
 * lives in the-plan-reads-the-request.test.ts; this one fails even if the
 * spelling changes but the re-insertion comes back.
 */

let resolveStorageState!: (v: any) => void;
let storageStateCalls = 0;

jest.mock('playwright', () => {
    const page = {
        on: jest.fn(), goto: jest.fn(async () => undefined), url: () => 'about:blank',
        setViewportSize: jest.fn(async () => undefined), close: jest.fn(async () => undefined),
        screenshot: jest.fn(async () => Buffer.from('')),
    };
    const context = {
        newPage: jest.fn(async () => page),
        on: jest.fn(),
        pages: () => [page],
        storageState: jest.fn(() => {
            storageStateCalls++;
            return new Promise(res => { resolveStorageState = res; });
        }),
        clearCookies: jest.fn(async () => undefined),
        close: jest.fn(async () => undefined),
        addInitScript: jest.fn(async () => undefined),
        setDefaultTimeout: jest.fn(),
        setDefaultNavigationTimeout: jest.fn(),
    };
    const browser = {
        newContext: jest.fn(async () => context),
        on: jest.fn(), close: jest.fn(async () => undefined), isConnected: () => true,
        contexts: () => [context],
    };
    return { chromium: { launch: jest.fn(async () => browser), connect: jest.fn(async () => browser) } };
});

describe('an idle browser session dies once', () => {
    it('while the final save is in flight, the session is already out of the registry', async () => {
        const mgr = require('../modules/browser/manager');
        await mgr.getBrowserSession('cleanup-proof');
        expect(mgr.liveBrowserSessionCount()).toBe(1);

        const stopping: Promise<unknown> = mgr.stopSession('cleanup-proof');
        // Let stopSession run up to the awaited storageState call.
        await new Promise(r => setImmediate(r));
        expect(storageStateCalls).toBe(1);
        // THE GUARANTEE: the registry no longer contains the dying session —
        // the re-insertion that fed the infinite cycle would make this 1.
        expect(mgr.liveBrowserSessionCount()).toBe(0);

        // A second stop during the in-flight save must be a no-op, not a
        // second storageState call.
        await mgr.stopSession('cleanup-proof');
        expect(storageStateCalls).toBe(1);

        resolveStorageState({ cookies: [], origins: [] });
        await stopping;
        expect(mgr.liveBrowserSessionCount()).toBe(0);
    });
});
