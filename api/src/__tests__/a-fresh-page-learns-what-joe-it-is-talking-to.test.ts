/**
 *  A FRESH PAGE LEARNS WHAT JOE IT IS TALKING TO, EVEN WHEN THE MACHINE IS BUSY.
 *
 *  The ladder exam, 2026-11-07 (L003): Joe's page in a fresh phone-width tab
 *  opened on the sign-in form with «SYSTEM Connecting…», behind twelve «429
 *  Too Many Requests». Every page on the owner's machine came from 127.0.0.1
 *  and together they passed the limit; the page's first question, /api/health
 *  («is this a single-user Joe?»), was refused, and it never asked again.
 *
 *  Now /api/health is never counted, and on a single-user install the
 *  owner's own machine is never counted. A shared server keeps the limit for
 *  everyone, the loopback included.
 */
import fs from 'fs';
import path from 'path';
import { rateLimitSkips } from '../api/app';

const SINGLE = { NODE_ENV: 'development', ENABLE_AUTH_BYPASS: 'true' } as NodeJS.ProcessEnv;
const SHARED = { NODE_ENV: 'production', ENABLE_AUTH_BYPASS: 'true' } as NodeJS.ProcessEnv;
const ACCOUNTS = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

describe('what the rate limit never counts', () => {
    test('the health question, anywhere, from anyone', () => {
        expect(rateLimitSkips({ originalUrl: '/api/health', ip: '203.0.113.9' }, SHARED)).toBe(true);
        expect(rateLimitSkips({ originalUrl: '/api/health?x=1', ip: '203.0.113.9' }, ACCOUNTS)).toBe(true);
        expect(rateLimitSkips({ originalUrl: '/api/healthz', ip: '203.0.113.9' }, SHARED)).toBe(false);
    });

    test('the owner\'s own machine, on a single-user install only', () => {
        for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
            expect(rateLimitSkips({ originalUrl: '/api/sessions', ip }, SINGLE)).toBe(true);
        }
        expect(rateLimitSkips({ originalUrl: '/api/sessions', ip: '192.168.1.20' }, SINGLE)).toBe(false);
    });

    test('a shared server, or one with accounts, counts the loopback like anyone', () => {
        expect(rateLimitSkips({ originalUrl: '/api/sessions', ip: '127.0.0.1' }, SHARED)).toBe(false);
        expect(rateLimitSkips({ originalUrl: '/api/sessions', ip: '127.0.0.1' }, ACCOUNTS)).toBe(false);
    });

    test('the limiter asks it, and the page asks again after «not now»', () => {
        const app = fs.readFileSync(path.join(__dirname, '..', 'api', 'app.ts'), 'utf8');
        expect(app).toMatch(/skip: \(req\) => rateLimitSkips\(req\)/);
        const main = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'main.tsx'), 'utf8');
        expect(main).toMatch(/r\.status !== 429/);
        expect(main).toMatch(/for \(let attempt = 0; attempt < 5; attempt\+\+\)/);
    });
});
