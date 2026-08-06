/**
 * «قم بتذكيري فيها عندما نقرر ان نخرج جو للعامه».
 *
 * A reminder held in someone's memory is not a control. Joe runs today with
 * ENABLE_AUTH_BYPASS=true, which is right for one person on one machine: every
 * tool call is trusted because there is only one caller. The moment the same
 * process answers a stranger, that same setting hands every visitor every
 * permission — and the person flipping the switch is exactly the person too
 * busy to recall a note from days earlier.
 *
 * So the note is machinery: it reads the settings this process would start
 * with, stays silent on a private machine, and refuses to serve the world with
 * single-user switches on.
 */
import { goLiveCheck, goLiveBanner, looksPublic, assertSafeToServe } from '../shared/go-live';

const LOCAL: any = { ENABLE_AUTH_BYPASS: 'true', AUTO_APPROVE_ALL: '1', SUPER_ADMIN_EMAILS: '', JWT_SECRET: 'x' };
const PUBLIC_SAFE: any = {
    PUBLIC_URL: 'https://joe.example.com', ENABLE_AUTH_BYPASS: 'false',
    SUPER_ADMIN_EMAILS: 'me@example.com', JWT_SECRET: 'k'.repeat(40),
};

describe('what counts as public', () => {
    it('a localhost URL is not', () => {
        for (const url of ['http://localhost:5002', 'http://127.0.0.1:5002', 'http://0.0.0.0:5002']) {
            expect(looksPublic({ PUBLIC_URL: url } as any)).toBe(false);
        }
    });

    it('a real host is, and so is saying so outright', () => {
        expect(looksPublic({ PUBLIC_URL: 'https://joe.example.com' } as any)).toBe(true);
        expect(looksPublic({ JOE_PUBLIC: '1' } as any)).toBe(true);
        expect(looksPublic({} as any)).toBe(false);
    });
});

describe('the blockers are the ones that actually matter', () => {
    it('names every single-user switch, in his language', () => {
        const v = goLiveCheck(LOCAL);
        const joined = v.blockers.join(' | ');
        expect(joined).toContain('ENABLE_AUTH_BYPASS');
        expect(joined).toContain('AUTO_APPROVE_ALL');
        expect(joined).toContain('SUPER_ADMIN_EMAILS');
        expect(joined).toMatch(/[؀-ۿ]/);            // Arabic, because he reads Arabic
    });

    it('and a properly configured public server has none', () => {
        expect(goLiveCheck(PUBLIC_SAFE).blockers).toEqual([]);
    });
});

describe('it speaks when it matters and is quiet when it does not', () => {
    it('a private machine gets one line, not a wall', () => {
        const banner = goLiveBanner(goLiveCheck(LOCAL));
        expect(banner.split('\n').length).toBe(1);
        expect(banner).toContain('go-live-check');
    });

    it('a public machine with blockers gets the wall', () => {
        const banner = goLiveBanner(goLiveCheck({ ...LOCAL, JOE_PUBLIC: '1' }));
        expect(banner).toContain('⛔');
        expect(banner).toContain('ENABLE_AUTH_BYPASS');
    });

    it('and a clean public machine gets nothing at all', () => {
        expect(goLiveBanner(goLiveCheck(PUBLIC_SAFE))).toBe('');
    });
});

describe('it refuses rather than warns', () => {
    const exits: number[] = [];
    const exit = (c: number) => { exits.push(c); };
    beforeEach(() => { exits.length = 0; });

    it('a public server with single-user switches does not start', () => {
        assertSafeToServe({ ...LOCAL, JOE_PUBLIC: '1' } as any, exit);
        expect(exits).toEqual([1]);
    });

    it('a deliberate override is possible, and must be deliberate', () => {
        assertSafeToServe({ ...LOCAL, JOE_PUBLIC: '1', JOE_ALLOW_UNSAFE_PUBLIC: '1' } as any, exit);
        expect(exits).toEqual([]);
    });

    it('and his own machine keeps working exactly as it does today', () => {
        assertSafeToServe(LOCAL as any, exit);
        expect(exits).toEqual([]);
    });
});

describe('the check runs at boot, before the door opens', () => {
    it('index.ts asserts it ahead of listen()', () => {
        const fs = require('fs'); const path = require('path');
        const I = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.ts'), 'utf-8');
        expect(I).toMatch(/assertSafeToServe\(\)/);
        expect(I.indexOf('assertSafeToServe()')).toBeLessThan(I.indexOf('server.listen('));
    });
});
