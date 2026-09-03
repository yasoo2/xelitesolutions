/**
 * «👁️ شاهدها تحدث في لوحة المتصفّح» — AND HE SAW THE LAST SIX SECONDS.
 *
 * His timestamps: `panel_focus` broadcast, the EmbeddedBrowser chunk downloaded,
 * the panel attached — twenty-three seconds into a twenty-nine second audit.
 * The focus event and the audit started in the SAME TICK, and the browser tab
 * is a lazily loaded chunk that must download, mount and open a socket first.
 *
 * A second fault sat underneath it: the panel attaches BEFORE the browser
 * session exists, so `onFirstClient → startStreaming` finds nothing to stream.
 * The session is born when the audit borrows it, and until that moment nobody
 * ever told the streamer it was there. Measured: 47 frames in an eight-second
 * audit, ZERO of them in its first third.
 */
import fs from 'fs';
import path from 'path';

const HUB = () => fs.readFileSync(path.join(__dirname, '..', 'modules', 'browser', 'wsHub.ts'), 'utf-8');
const AUDIT = () => fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');
const REACT = () => fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

describe('the audit waits for the eye it promised', () => {
    it('the hub can say whether anyone is watching', () => {
        const { panelWatcherCount } = require('../modules/browser/wsHub');
        expect(panelWatcherCount('nobody-here')).toBe(0);
        expect(panelWatcherCount('')).toBe(0);
    });

    it('and the wait gives up rather than hanging a build on an audience', async () => {
        const { waitForPanelWatcher } = require('../modules/browser/wsHub');
        const at = Date.now();
        await expect(waitForPanelWatcher('nobody-here', 400)).resolves.toBe(false);
        expect(Date.now() - at).toBeLessThan(2000);
    });

    it('a zero budget returns at once', async () => {
        const { waitForPanelWatcher } = require('../modules/browser/wsHub');
        const at = Date.now();
        await expect(waitForPanelWatcher('nobody-here', 0)).resolves.toBe(false);
        expect(Date.now() - at).toBeLessThan(400);
    });

    it('the builder focuses, THEN waits, THEN audits — in that order', () => {
        const src = REACT();
        const focus = src.indexOf("panel_focus");
        const wait = src.indexOf('waitForPanelWatcher');
        const audit = src.indexOf('audit = await auditBuiltApp');
        expect(focus).toBeGreaterThan(0);
        expect(wait).toBeGreaterThan(focus);
        expect(audit).toBeGreaterThan(wait);
    });

    it('and says plainly whether the panel was there', () => {
        const src = REACT();
        expect(src).toMatch(/the Browser panel is attached/);
        expect(src).toMatch(/no Browser panel attached — visual QA is blocked/);
    });

    it('waits on and audits the session carried by the run, with a panel fallback only when absent', () => {
        const src = REACT();
        expect(src).toMatch(/const auditSid = String\(context\?\.browserSessionId \|\| ''\)\.trim\(\) \|\| PANEL_BROWSER_SID/);
        expect(src).toMatch(/waitForPanelWatcher\(auditSid, 4000\)/);
        expect(src).toMatch(/watchSessionId: auditSid/);
        expect(src).toMatch(/requireVisibleBrowser: true/);
        expect(src).toMatch(/auditWatching = watching/);
        expect(src).toMatch(/const someoneIsWatching = auditWatching/);
        expect(src).toMatch(/if \(audit && !someoneIsWatching\) audit\.visible = false/);
    });
});

describe('and the stream starts when the page does', () => {
    it('borrowing the panel session resumes streaming for whoever is already watching', () => {
        const src = AUDIT();
        const at = src.indexOf('const s = await getBrowserSession(opts.watchSessionId);');
        expect(at).toBeGreaterThan(0);
        const block = src.slice(at, at + 1400);
        expect(block).toMatch(/resumeStreamingIfWatched\(opts\.watchSessionId\)/);
        // …and it is required from the manager alongside getBrowserSession.
        expect(src).toMatch(/const \{ getBrowserSession, resumeStreamingIfWatched \} = require/);
    });

    it('and it never fails a build when streaming cannot start', () => {
        const src = AUDIT();
        const at = src.indexOf('resumeStreamingIfWatched(opts.watchSessionId)');
        expect(src.slice(at - 20, at + 90)).toMatch(/try \{[\s\S]*catch/);
    });

    it('resuming only touches a session someone is actually watching', () => {
        const hub = fs.readFileSync(path.join(__dirname, '..', 'modules', 'browser', 'manager.ts'), 'utf-8');
        const at = hub.indexOf('export function resumeStreamingIfWatched');
        expect(hub.slice(at, at + 220)).toMatch(/watched\.has\(sid\)/);
        void HUB;
    });
});
