/**
 * A SLOW MACHINE IS NOT A BROKEN APP (the live exam, 2026-11-16, P298).
 *
 * One navigation wait that ran out is opened once more with twice the time;
 * a second timeout, or any other failure, is thrown exactly as before.
 */
import fs from 'fs';
import path from 'path';
import { isNavigationTimeout, openPatiently } from '../core/quality/app-audit';

function timeoutError(ms: number) {
    const e = new Error(`page.goto: Timeout ${ms}ms exceeded.\nCall log:\n  - navigating to "http://127.0.0.1/owner"`);
    e.name = 'TimeoutError';
    return e;
}

function fakePage(outcomes: Array<'ok' | 'timeout' | 'refused'>) {
    const calls: Array<{ target: string; timeout: number }> = [];
    return {
        calls,
        async goto(target: string, opts: { timeout: number }) {
            calls.push({ target, timeout: opts.timeout });
            const next = outcomes.shift();
            if (next === 'timeout') throw timeoutError(opts.timeout);
            if (next === 'refused') throw new Error('page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1/owner');
            return { status: () => 200 };
        },
    };
}

describe('a page slow to open on a loaded machine is opened once more', () => {
    it('opens once more, with twice the time, after one timeout', async () => {
        const page = fakePage(['timeout', 'ok']);
        const opened = await openPatiently(page, 'http://127.0.0.1/owner', { waitUntil: 'load', timeout: 12_000 });
        expect(opened.status()).toBe(200);
        expect(page.calls.map(c => c.timeout)).toEqual([12_000, 24_000]);
    });

    it('caps the second wait at 30 s', async () => {
        const page = fakePage(['timeout', 'ok']);
        await openPatiently(page, 'http://x/', { waitUntil: 'load', timeout: 20_000 });
        expect(page.calls.map(c => c.timeout)).toEqual([20_000, 30_000]);
    });

    it('tells a second timeout as before — never a pass', async () => {
        const page = fakePage(['timeout', 'timeout']);
        await expect(openPatiently(page, 'http://x/', { waitUntil: 'load', timeout: 12_000 })).rejects.toThrow(/Timeout 24000ms exceeded/);
        expect(page.calls).toHaveLength(2);
    });

    it('never retries a page that refused or failed for another reason', async () => {
        const page = fakePage(['refused', 'ok']);
        await expect(openPatiently(page, 'http://x/', { waitUntil: 'load', timeout: 12_000 })).rejects.toThrow(/ERR_CONNECTION_REFUSED/);
        expect(page.calls).toHaveLength(1);
    });

    it('knows a navigation timeout by its name or its words, and nothing else', () => {
        expect(isNavigationTimeout(timeoutError(12_000))).toBe(true);
        expect(isNavigationTimeout(new Error('page.goto: Timeout 12000ms exceeded.'))).toBe(true);
        expect(isNavigationTimeout(new Error('net::ERR_ABORTED'))).toBe(false);
        expect(isNavigationTimeout(null)).toBe(false);
    });

    it('the page walk and the walk at every width open their pages patiently', () => {
        const src = fs.readFileSync(path.join(__dirname, '../core/quality/app-audit.ts'), 'utf8');
        expect(src).toMatch(/let opened = await openPatiently\(page, target, \{ waitUntil: 'load', timeout: Math\.min\(timeoutMs, 20_000\) \}\)/);
        expect(src).toMatch(/await openPatiently\(page, target, \{ waitUntil: 'load', timeout: Math\.min\(timeoutMs, 12_000\) \}\);\s*\n\s*await reenter\(\);\s*\n\s*await applyViewportSize/);
    });
});
