/**
 * THE NO-BROWSER CONTRACT ITSELF — pinned without needing a real browser.
 *
 * Suites whose core assertion needs Chromium must fail closed when no
 * browser can launch (independent review of the first-visit generated
 * suite: a launch failure used to warn-and-skip to green). This file pins
 * the branches of requireChromiumOrThrow with a mocked launcher, so the
 * fail-closed behavior is covered even on machines that have Chromium:
 *
 *   launch failure + default env                -> throws (suite RED, fail closed)
 *   JOE_FORCE_NO_BROWSER=1                     -> throws without touching the launcher
 *   launch failure + JOE_ALLOW_NO_BROWSER=1    -> null + one loud skip warning
 *   JOE_FORCE_NO_BROWSER=1 + JOE_ALLOW_NO_BROWSER=1 -> null (force uses the same catch)
 */
jest.mock('../modules/browser/manager', () => ({
    findChromiumExecutable: () => { throw new Error('launch-canary-boom'); },
    getChromiumLaunchOptions: () => ({}),
}));

import { requireChromiumOrThrow } from './helpers/require-chromium';

describe('requireChromiumOrThrow fails closed without a browser', () => {
    const OLD_FORCE = process.env.JOE_FORCE_NO_BROWSER;
    const OLD_ALLOW = process.env.JOE_ALLOW_NO_BROWSER;

    afterEach(() => {
        if (OLD_FORCE === undefined) delete process.env.JOE_FORCE_NO_BROWSER;
        else process.env.JOE_FORCE_NO_BROWSER = OLD_FORCE;
        if (OLD_ALLOW === undefined) delete process.env.JOE_ALLOW_NO_BROWSER;
        else process.env.JOE_ALLOW_NO_BROWSER = OLD_ALLOW;
        jest.restoreAllMocks();
    });

    it('RED by default — a launch failure throws with the launch reason', async () => {
        delete process.env.JOE_FORCE_NO_BROWSER;
        delete process.env.JOE_ALLOW_NO_BROWSER;
        await expect(requireChromiumOrThrow('probe-tag')).rejects.toThrow(/could not be launched/);
        await expect(requireChromiumOrThrow('probe-tag')).rejects.toThrow(/launch-canary-boom/);
        await expect(requireChromiumOrThrow('probe-tag')).rejects.toThrow(/probe-tag/);
    });

    it('the force hook fails closed without touching the launcher', async () => {
        process.env.JOE_FORCE_NO_BROWSER = '1';
        delete process.env.JOE_ALLOW_NO_BROWSER;
        await expect(requireChromiumOrThrow('probe-tag')).rejects.toThrow(/failing closed/);
        await expect(requireChromiumOrThrow('probe-tag')).rejects.toThrow(/JOE_FORCE_NO_BROWSER=1/);
    });

    it('explicit opt-out skips loudly and returns null', async () => {
        delete process.env.JOE_FORCE_NO_BROWSER;
        process.env.JOE_ALLOW_NO_BROWSER = '1';
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        await expect(requireChromiumOrThrow('probe-tag')).resolves.toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('JOE_ALLOW_NO_BROWSER=1'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('proves nothing'));
    });

    it('the force hook honors the explicit opt-out (same catch as real failure)', async () => {
        process.env.JOE_FORCE_NO_BROWSER = '1';
        process.env.JOE_ALLOW_NO_BROWSER = '1';
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        await expect(requireChromiumOrThrow('probe-tag')).resolves.toBeNull();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('JOE_FORCE_NO_BROWSER=1'));
    });
});
