jest.mock('../api/middleware/auth', () => ({ authenticate: jest.fn() }));
jest.mock('../modules/browser/runner', () => ({ runBrowserInstruction: jest.fn() }));
jest.mock('../modules/browser/executor', () => ({ executePlannedActions: jest.fn() }));
jest.mock('../modules/browser/manager', () => ({ getBrowserSession: jest.fn() }));
jest.mock('../modules/browser/wsHub', () => ({ canAccessBrowserSession: jest.fn() }));

import router from '../api/routes/browser';
import { getBrowserSession } from '../modules/browser/manager';
import { canAccessBrowserSession } from '../modules/browser/wsHub';

const handler = (router as any).stack.find((layer: any) => layer.route?.path === '/nav/goto').route.stack.at(-1).handle;
function response() {
    const res: any = { statusCode: 200 };
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (body: unknown) => { res.body = body; return res; };
    return res;
}
function request(url: string, auth: unknown = { sub: 'test-user' }) {
    return { auth, body: { sessionId: 'browser:test', url } };
}

describe('navigation route supersession', () => {
    test.each([['back', 'goBack'], ['forward', 'goForward'], ['refresh', 'reload']])('newer %s cancels a pending goto retry', async (route, method) => {
        (canAccessBrowserSession as jest.Mock).mockResolvedValue(true);
        let entered!: () => void;
        const started = new Promise<void>(resolve => { entered = resolve; });
        let url = 'http://localhost/old';
        const page = {
            url: () => url,
            goto: jest.fn(async () => { entered(); throw new Error('net::ERR_CONNECTION_RESET'); }),
            [method]: jest.fn(async () => { url = 'http://localhost/newer'; return {}; }),
        };
        (getBrowserSession as jest.Mock).mockResolvedValue({ page });
        const older = response();
        const pending = handler(request('http://localhost/old'), older);
        await started;
        const newer = response();
        const next = (router as any).stack.find((layer: any) => layer.route?.path === `/nav/${route}`).route.stack.at(-1).handle;
        await next(request(''), newer);
        await pending;
        expect(newer.statusCode).toBe(200);
        expect(older.statusCode).toBe(409);
        expect(older.body.error).toBe('nav_superseded');
        expect(page.goto).toHaveBeenCalledTimes(1);
        expect(url).toBe('http://localhost/newer');
    });
    beforeEach(() => {
        jest.clearAllMocks();
        (canAccessBrowserSession as jest.Mock).mockResolvedValue(true);
    });

    test('an interrupted older request returns conflict without retrying over the newer page', async () => {
        let rejectOlder!: (error: Error) => void;
        let entered!: () => void;
        const started = new Promise<void>(resolve => { entered = resolve; });
        let url = 'http://localhost/start';
        const page = {
            url: () => url,
            goto: jest.fn((target: string) => {
                if (target.endsWith('/slow')) {
                    entered();
                    return new Promise<void>((_, reject) => { rejectOlder = reject; });
                }
                url = target;
                rejectOlder(new Error('page.goto: net::ERR_ABORTED'));
                return Promise.resolve();
            }),
        };
        (getBrowserSession as jest.Mock).mockResolvedValue({ page });
        const older = response();
        const latest = response();
        const pending = handler(request('http://localhost/slow'), older);
        await started;
        await handler(request('http://localhost/latest'), latest);
        await pending;
        expect(older.statusCode).toBe(409);
        expect(older.body).toEqual({ ok: false, error: 'nav_superseded', attempts: 1 });
        expect(latest.body).toEqual({ ok: true, url: 'http://localhost/latest' });
        expect(page.goto).toHaveBeenCalledTimes(2);
    });

    test('a real failure without a newer request remains a failure', async () => {
        const page = { url: () => 'about:blank', goto: jest.fn().mockRejectedValue(new Error('Invalid URL')),
            evaluate: jest.fn().mockResolvedValue('interactive') };
        (getBrowserSession as jest.Mock).mockResolvedValue({ page });
        const res = response();
        await handler(request('http://invalid'), res);
        expect(res.statusCode).toBe(502);
        expect(res.body.error).toBe('nav_goto_failed');
        expect(res.body.documentState).toBe('interactive');
        expect(page.goto).toHaveBeenCalledTimes(1);
    });

    test('unauthorized and cross-user requests never claim or navigate a page', async () => {
        const missingAuth = response();
        await handler({ body: { sessionId: 'browser:test', url: 'http://localhost/' } }, missingAuth);
        expect(missingAuth.statusCode).toBe(401);
        jest.clearAllMocks();
        (canAccessBrowserSession as jest.Mock).mockResolvedValue(false);
        const forbidden = response();
        await handler(request('http://localhost/'), forbidden);
        expect(forbidden.statusCode).toBe(403);
        expect(getBrowserSession).not.toHaveBeenCalled();
    });
});
