/**
 * A MISSING BROWSER IS A COMMAND JOE CAN RUN, NOT A NOTE TO HIM.
 *
 * Chromium's binary is a download, not a dependency, so a fresh machine
 * reaches the self-check with playwright installed and no browser to launch.
 * Until now that ended the check and printed a warning telling the user to
 * type `npx playwright install chromium` himself.
 *
 * The warning was honest and it was still a failure of the product: Joe has a
 * terminal, it is already open in front of him, and the missing piece is one
 * command he never asked to own. Joe runs it — once, visibly, with its own
 * prompt and exit code — and retries the check that was blocked.
 */
import fs from 'fs';
import path from 'path';
import { isMissingBrowser, ensureChromium, _resetEnsureChromium } from '../core/quality/ensure-chromium';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const AUDIT = read('core', 'quality', 'app-audit.ts');
const REACT = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

beforeEach(() => _resetEnsureChromium());

describe('it fires on the right error and no other', () => {
    it('playwright\'s own wording for a missing binary is recognised', () => {
        for (const m of [
            "browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium-1234/chrome",
            'Please run the following command to download new browsers: npx playwright install',
            "Executable doesn't exist",
        ]) expect(isMissingBrowser(new Error(m))).toBe(true);
    });

    /**
     * A page that crashed for its own reasons is not a reason to download
     * anything. This is the guard that keeps a repair from becoming a habit.
     */
    it('and an ordinary page failure is NOT', () => {
        for (const m of [
            'net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4300/',
            'Timeout 30000ms exceeded',
            'page.click: element is not visible',
        ]) expect(isMissingBrowser(new Error(m))).toBe(false);
    });
});

describe('his instruction outranks the download', () => {
    it('«لا تستخدم الشبكة» means nothing is fetched, and it says so', async () => {
        const said: string[] = [];
        const r = await ensureChromium({ offline: true, say: l => said.push(l) });
        expect(r.ok).toBe(false);
        expect(r.state).toBe('refused');
        expect(r.detail).toContain('not to use the network');
        expect(said.join('\n')).toContain('#');
    });

    it('…and the refusal is remembered, so it is answered once', async () => {
        const first = await ensureChromium({ offline: true });
        const second = await ensureChromium({ offline: false });
        // The second call gets the first answer: one attempt per process,
        // whatever the outcome, so a machine with no network does not
        // re-download on every build for the rest of the day.
        expect(second).toBe(first);
    });
});

describe('THE WIRING: the audit retries instead of giving up', () => {
    it('the launch is guarded and retried once the browser is there', () => {
        expect(AUDIT).toMatch(/const \{ isMissingBrowser, ensureChromium \} = require\('\.\/ensure-chromium'\);/);
        expect(AUDIT).toMatch(/if \(!isMissingBrowser\(e\)\) throw e;/);
        expect(AUDIT).toMatch(/if \(!got\.ok\) return \{ skipped: got\.detail, score: 0, findings: \[\] \};/);
        // The retry is a real second launch, not a hope.
        expect((AUDIT.match(/browser = await chromium\.launch\(\{ \.\.\.getChromiumLaunchOptions\(\), headless: true \}\);/g) || []).length).toBe(2);
    });

    it('the download appears in the terminal he is already watching', () => {
        const SRC = read('core', 'quality', 'ensure-chromium.ts');
        expect(SRC).toMatch(/say\('\$ npx playwright install chromium'\);/);
        expect(SRC).toMatch(/→ exit \$\{code === null \? 'not found' : code\}/);
        expect(AUDIT).toMatch(/say: \(l: string\) => opts\?\.onProgress\?\.\(`term:\$\{l\}`\)/);
    });

    it('a failed download reports the process\'s own last words', () => {
        const SRC = read('core', 'quality', 'ensure-chromium.ts');
        expect(SRC).toMatch(/const tail = out\.trim\(\)\.split\('\\n'\)\.filter\(Boolean\)\.slice\(-2\)/);
        // The phrase it refuses to print appears once — in the comment that
        // says it refuses to print it. The check is on the DETAIL it builds.
        expect(SRC).toMatch(/detail: `npx playwright install chromium exited/);
        expect(SRC).not.toMatch(/detail: 'something went wrong/i);
    });

    it('and EVERY audit carries his no-network instruction, however many there are', () => {
        /**
         *  ⛔ THIS COUNTED OCCURRENCES INSTEAD OF TESTING THE CLAIM.
         *
         *  It asserted `offline: noInstall,` appeared exactly twice. A third
         *  audit was added — the re-audit after an authored interface is
         *  rolled back — and this went red although that call site passes the
         *  flag correctly. And an audit added WITHOUT the flag, while another
         *  was removed, would have left the count at two and this green: the
         *  owner's «لا تستخدم الشبكة» quietly ignored by one call site.
         *
         *  The claim is «his instruction reaches every audit», so every call
         *  site is read.
         */
        const calls: string[] = [];
        let i = REACT.indexOf('auditBuiltApp(');
        while (i >= 0) {
            let depth = 0, j = REACT.indexOf('(', i);
            const start = j;
            for (; j < REACT.length; j++) {
                if (REACT[j] === '(') depth++;
                else if (REACT[j] === ')') { depth--; if (depth === 0) break; }
            }
            calls.push(REACT.slice(start, j + 1));
            i = REACT.indexOf('auditBuiltApp(', j);
        }
        expect(calls.length).toBeGreaterThanOrEqual(2);
        const without = calls.filter(c => !c.includes('offline: noInstall'));
        expect({ audits: calls.length, ignoringHisInstruction: without.length })
            .toEqual({ audits: calls.length, ignoringHisInstruction: 0 });
    });
});
