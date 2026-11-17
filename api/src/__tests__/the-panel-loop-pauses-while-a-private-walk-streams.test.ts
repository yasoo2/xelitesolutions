/**
 * ONE STREAMER PER PANEL ID (design v13.3 §8, agent G).
 *
 * A change run's walk runs in a private browser and streams that page's frames to the owner's panel id. While it
 * does, the panel session's own capture loop must not run: two loops sending `stream_frame` to one id paint two
 * pages into one panel. `pauseStreaming(sid)` clears the loop's timer without un-watching the id, a panel that
 * attaches meanwhile does not restart it, and the returned `resume()` starts it again if the id is still watched.
 *
 * Measured against the real manager with Playwright and the native capture stubbed: the count of captures the
 * loop makes is the observable.
 */
let captures = 0;

jest.mock('../modules/browser/native-capture', () => ({
    captureNativeJpeg: jest.fn(async () => { captures++; return Buffer.from(''); }),
}));

jest.mock('playwright', () => {
    const page = {
        on: jest.fn(), off: jest.fn(), goto: jest.fn(async () => undefined), url: () => 'about:blank',
        setViewportSize: jest.fn(async () => undefined), close: jest.fn(async () => undefined),
        screenshot: jest.fn(async () => Buffer.from('')), isClosed: () => false,
        viewportSize: () => ({ width: 1280, height: 720 }),
    };
    const context = {
        newPage: jest.fn(async () => page),
        on: jest.fn(),
        pages: () => [page],
        storageState: jest.fn(async () => ({ cookies: [], origins: [] })),
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

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Captures the loop makes over `ms`. */
async function capturesOver(ms: number): Promise<number> {
    const before = captures;
    await wait(ms);
    return captures - before;
}

describe('the panel loop pauses while a private walk streams to its id', () => {
    const SID = 'pause-proof';
    let mgr: any;
    beforeAll(async () => {
        mgr = require('../modules/browser/manager');
        await mgr.getBrowserSession(SID);
    });
    afterAll(async () => {
        mgr.stopStreaming(SID);
        await mgr.stopSession(SID).catch(() => undefined);
    });

    it('streams, pauses, stays paused through a panel attach, and resumes', async () => {
        mgr.startStreaming(SID);
        expect(await capturesOver(600)).toBeGreaterThan(0);

        const resume = mgr.pauseStreaming(SID);
        expect(mgr.isStreamingPaused(SID)).toBe(true);
        await wait(150);   // a tick already in flight may land
        expect(await capturesOver(600)).toBe(0);

        //  The panel attaches again (onFirstClient → startStreaming) while the walk streams: still paused.
        mgr.startStreaming(SID);
        mgr.resumeStreamingIfWatched(SID);
        expect(await capturesOver(600)).toBe(0);

        resume();
        expect(mgr.isStreamingPaused(SID)).toBe(false);
        expect(await capturesOver(600)).toBeGreaterThan(0);
        //  resume() is idempotent: calling it again starts no second loop and breaks nothing.
        resume();
        expect(mgr.isStreamingPaused(SID)).toBe(false);
    });

    it('pauses nest: the loop comes back when the last one resumes', async () => {
        mgr.startStreaming(SID);
        const a = mgr.pauseStreaming(SID);
        const b = mgr.pauseStreaming(SID);
        await wait(150);
        a();
        expect(mgr.isStreamingPaused(SID)).toBe(true);
        expect(await capturesOver(500)).toBe(0);
        b();
        expect(await capturesOver(600)).toBeGreaterThan(0);
    });

    it('a panel that left during the pause is not streamed to on resume', async () => {
        mgr.startStreaming(SID);
        const resume = mgr.pauseStreaming(SID);
        mgr.stopStreaming(SID);   // the last watcher left
        resume();
        await wait(150);
        expect(await capturesOver(500)).toBe(0);
    });

    it('an id with no session and an empty id pause harmlessly', () => {
        const r = mgr.pauseStreaming('no-such-session');
        expect(mgr.isStreamingPaused('no-such-session')).toBe(true);
        r();
        expect(mgr.isStreamingPaused('no-such-session')).toBe(false);
        expect(() => mgr.pauseStreaming('')()).not.toThrow();
    });
});
