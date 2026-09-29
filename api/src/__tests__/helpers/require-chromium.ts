/**
 * Fail-closed Chromium for Jest suites whose core assertion needs a real
 * browser engine.
 *
 * A suite that "passes" because the browser was missing proves nothing and
 * trains everyone to trust a green tick that checked no behavior. So the
 * default here is fail-closed: no launchable Chromium means the suite FAILS
 * with the launch reason attached, instead of warning-and-skipping to green.
 *
 * Two escape hatches, both explicit:
 * - JOE_ALLOW_NO_BROWSER=1 — for browserless environments (minimal CI
 *   containers). The suite skips loudly: the warning names the variable and
 *   says the green proves nothing about browser behavior. Returns null.
 * - JOE_FORCE_NO_BROWSER=1 — a test hook that simulates a missing browser
 *   without touching the launcher. It flows through the same catch as a
 *   real launch failure, so the fail-closed RED and the loud opt-out skip
 *   can both be run on a machine that has Chromium.
 */
export async function requireChromiumOrThrow(tag: string): Promise<any> {
    try {
        if (process.env.JOE_FORCE_NO_BROWSER === '1') {
            throw new Error('JOE_FORCE_NO_BROWSER=1 simulates a missing browser');
        }
        // Lazy requires: playwright and the browser manager stay out of suites
        // that never call here.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { findChromiumExecutable, getChromiumLaunchOptions } = require('../../modules/browser/manager');
        const exe = findChromiumExecutable();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { chromium } = require('playwright');
        return await chromium.launch({
            ...getChromiumLaunchOptions(),
            ...(exe ? { executablePath: exe } : {}),
        });
    } catch (e: any) {
        const why = String(e?.message || e).slice(0, 300);
        if (process.env.JOE_ALLOW_NO_BROWSER === '1') {
            // eslint-disable-next-line no-console
            console.warn(
                `[${tag}] JOE_ALLOW_NO_BROWSER=1: SKIPPING real-Chromium assertions ` +
                `(browser unavailable: ${why}). This green proves nothing about browser behavior.`,
            );
            return null;
        }
        throw new Error(
            `[${tag}] Chromium is required for this suite's core assertion but could not be launched: ${why}; ` +
            `failing closed rather than passing vacuously. In a browserless environment ` +
            `set JOE_ALLOW_NO_BROWSER=1 to skip explicitly.`,
        );
    }
}
