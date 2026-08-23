/**
 * «مازال يفتح المتصفح دون عمل شيء — لاحظ الصورة»
 *
 * His screenshot, taken the moment «🔎 Self-QA in a real browser…» appeared:
 * the Browser panel open and «connected · 1280×720», the URL bar reading «No
 * page loaded», the viewport blank white.
 *
 * Nothing was broken — Chromium was still STARTING. Measured live: the first
 * frame that actually showed the audited page arrived 3853ms after the audit
 * began, and his audits run for ~29 seconds on a machine slower than the one
 * that measured it. He was invited to watch, and given a white rectangle.
 *
 * Two things are pinned here:
 *   1. the browser is woken during `npm install`, so the panel paints the page
 *      instead of the launch (3853ms → 204ms, measured in
 *      verify_panel_shows_the_audit.ts);
 *   2. and when the panel CANNOT be borrowed, he is told so — an invitation to
 *      watch a private headless browser is the same white rectangle with a
 *      caption.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('the browser is awake before the audit needs it', () => {
    it('the manager can warm a session without opening a second one', () => {
        const m = read('modules', 'browser', 'manager.ts');
        expect(m).toMatch(/export function warmBrowserSession\(sessionId: string\): void/);
        // A warm-up must never duplicate a live session, and never throw into a build.
        const fn = m.slice(m.indexOf('export function warmBrowserSession'), m.indexOf('export function warmBrowserSession') + 500);
        expect(fn).toMatch(/if \(!sid \|\| sessions\.has\(sid\) \|\| pendingSessions\.has\(sid\)\) return;/);
        expect(fn).toMatch(/\.catch\(\(\) =>/);
        expect(fn).toMatch(/resumeStreamingIfWatched\(sid\)/);
    });

    it('and the build wakes it BEFORE npm install, not when the audit starts', () => {
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        const warmAt = r.indexOf('warmBrowserSession(');
        const installAt = r.indexOf("run('npm', ['install'");
        const auditAt = r.indexOf('audit = await auditBuiltApp');
        expect(warmAt).toBeGreaterThan(0);
        expect(r).toContain('browserSessionId');
        expect(r).toContain('const auditSid = String(context?.browserSessionId || \'\').trim() || PANEL_BROWSER_SID;');
        expect(r).toContain('waitForPanelWatcher(auditSid, 4000)');
        expect(r).toContain('watchSessionId: auditSid');
        expect(warmAt).toBeLessThan(installAt);
        expect(installAt).toBeLessThan(auditAt);
    });

    it('and a build that was told to skip the audit does not open a browser at all', () => {
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        const skipAt = r.indexOf('if (!input?.skipAudit) {');
        const at = r.indexOf('warmBrowserSession(');
        expect(skipAt).toBeGreaterThan(0);
        expect(at).toBeGreaterThan(skipAt);
        expect(r).toContain('warmBrowserSession(');
    });

    it('and «أصلح ما تبقّى» warms it too — it audits within seconds of starting', () => {
        const p = read('modules', 'tools', 'definitions', 'ProjectRepairTool.ts');
        expect(p).toMatch(/warmBrowserSession\(PANEL_BROWSER_SID\)/);
        // …before the first MEASUREMENT (the import above it is not the audit).
        // The directory the audit is handed was once called `dist` and is now
        // `auditDir`. The guarantee was never the NAME of that variable — it is
        // that the browser is warming before the first measurement starts — so
        // the check is anchored to the call, whatever it is handed.
        const firstAudit = p.indexOf('await auditBuiltApp(');
        expect(firstAudit).toBeGreaterThan(0);
        expect(p.indexOf('warmBrowserSession')).toBeLessThan(firstAudit);
    });
});

/**
 * «لم يتحرك متصفح جو … كل شي وهمي» — and the second half of that run: the
 * honest «🔒 the panel could not be used» was followed three seconds later by
 * «👁️ Watch it happen in the Browser panel». The audit emits a second progress
 * event when it starts pressing controls, and the handler treated anything that
 * was not the word «private» as an invitation.
 *
 * Under both lines: on his machine the panel session failed to start EVERY run,
 * and the reason died inside `catch { }`.
 */
describe('the panel browser is not allowed to stay dead', () => {
    it('a launch the machine refuses falls back to a bare headless one', () => {
        const m = read('modules', 'browser', 'manager.ts');
        expect(m).toMatch(/async function launchPlainChromium\(\): Promise<Browser>/);
        const fn = m.slice(m.indexOf('async function launchPlainChromium'), m.indexOf('async function launchPlainChromium') + 1200);
        expect(fn).toMatch(/const bare: LaunchOptions = \{ headless: true \};/);
        expect(fn).toMatch(/browser_launch_failed/);
        // Both branches of createSession go through it — persistent profiles included.
        expect(m).toMatch(/browser = await launchPlainChromium\(\);\s*\n\s*persistentContext = null;/);
    });

    it('and a saved login state Chromium rejects is dropped, not fatal', () => {
        const m = read('modules', 'browser', 'manager.ts');
        // storageState is validated by Playwright: one stale cookie used to kill
        // the session at creation, on every run, for ever.
        expect(m).toMatch(/context = await browser!\.newContext\(\{ \.\.\.baseContextOpts, \.\.\.\(savedState \? \{ storageState: savedState \} : \{\}\) \}\);/);
        const at = m.indexOf('if (!savedState) throw Object.assign(e,');
        expect(at).toBeGreaterThan(0);
        const rescue = m.slice(at, at + 700);
        expect(rescue).toMatch(/context = await browser!\.newContext\(baseContextOpts\);/);
        expect(rescue).toMatch(/fs\.unlinkSync\(sessionStateFile/);
    });

    it('and every failure inside the SERVER leaves a note with the stage it died at', () => {
        const m = read('modules', 'browser', 'manager.ts');
        // His machine passes the standalone diagnosis while the same audit
        // inside the server falls back to a private browser: the reason has to
        // survive on disk, or it never reaches anyone.
        expect(m).toMatch(/export function browserErrorLogPath\(\): string/);
        expect(m).toMatch(/browser-errors\.log/);
        expect(m).toMatch(/export function noteBrowserFailure\(sessionId: string, stage: string, err: any\): void/);
        expect(m).toMatch(/stage=\$\{stage\}/);
        expect(m).toMatch(/noteBrowserFailure\(sid, String\(e\?\.joeStage \|\| 'create'\), e\);/);
        // …and the stages are really tagged, not invented at the end.
        expect(m).toMatch(/joeStage: 'launch'/);
        expect(m).toMatch(/joeStage: e\?\.joeStage \|\| 'newContext'/);
        expect(m).toMatch(/joeStage: e\?\.joeStage \|\| 'newPage'/);
        // A diagnostic log must not become a disk leak.
        expect(m).toMatch(/const BROWSER_LOG_MAX = 64 \* 1024;/);
        // And the diagnosis reads it FIRST.
        const d = read('tests', 'manual', 'diagnose_browser.ts');
        expect(d).toMatch(/browserErrorLogPath\(\)/);
        expect(d).toMatch(/ما سجّله خادم جو نفسه أثناء البناء/);
    });

    it('and the borrow failure carries its reason out of the catch', () => {
        const a = read('core', 'quality', 'app-audit.ts');
        expect(a).not.toMatch(/\} catch \{ \/\* no panel available/);
        expect(a).toMatch(/borrowError = String\(e\?\.message \|\| e\)\.slice\(0, 300\);/);
        expect(a).toMatch(/onProgress\?\.\(borrowError \? `private:\$\{borrowError\}` : 'private'\)/);
    });
});

describe('and he is never invited to watch a browser he cannot see', () => {
    it('the audit says which browser it landed in', () => {
        const a = read('core', 'quality', 'app-audit.ts');
        expect(a).toMatch(/opts\.onProgress\?\.\('watching'\)/);
        // The private-browser fallback announces itself instead of running mute.
        // The window grew: the fallback now also guards the launch and fetches
        // Chromium once if the binary is missing, so the announcement sits
        // further down the same block. What is asserted is unchanged — the
        // private-browser fallback still announces itself instead of running
        // mute.
        const fb = a.slice(a.indexOf('if (!page) {'), a.indexOf('if (!page) {') + 2200);
        expect(fb).toMatch(/onProgress\?\.\(borrowError \? `private:/);
    });

    it('and the build repeats it honestly in both languages, with the reason', () => {
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(r).toMatch(/onProgress: \(where: string\) => \{/);
        expect(r).toMatch(/if \(where\.startsWith\('private'\)\)/);
        expect(r).toMatch(/تعذّر استعمال لوحة المتصفّح/);
        expect(r).toMatch(/The Browser panel could not be used/);
        expect(r).toMatch(/nothing to watch/);
        expect(r).toMatch(/السبب: \$\{why\}/);
        expect(r).toMatch(/Reason: \$\{why\}/);
    });

    it('and nothing AFTER it invites him to watch — «👁️» three seconds later was a lie', () => {
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        // The audit emits 'pressing' as well as 'watching' / 'private'.
        expect(r).toMatch(/if \(where === 'watching'\) \{\s*\n\s*auditVisible = true;/);
        expect(r).toMatch(/if \(where === 'pressing' && auditVisible\)/);
        expect(r).toMatch(/auditVisible = false;/);
        const a = read('core', 'quality', 'app-audit.ts');
        expect(a).toMatch(/onProgress\?\.\('pressing'\)/);
    });

    it('never calls a borrowed-but-unwatched browser visible', () => {
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(r).toMatch(/let auditWatching = false/);
        expect(r).toMatch(/auditWatching = watching/);
        expect(r).toMatch(/const someoneIsWatching = auditWatching/);
        expect(r).toMatch(/if \(audit && !someoneIsWatching\) audit\.visible = false/);
        expect(r).toMatch(/\[SelfQA\] session=\$\{auditSid\} watching=\$\{watching\}/);
    });

    it('and so does the repair command', () => {
        const p = read('modules', 'tools', 'definitions', 'ProjectRepairTool.ts');
        expect(p).toMatch(/where\.startsWith\('private'\)/);
        expect(p).toMatch(/تعذّر استعمال لوحة المتصفّح/);
    });
});
