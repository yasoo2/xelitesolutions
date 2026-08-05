import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MonitoringTool } from '../../modules/tools/definitions/MonitoringTool';
import { executionEngine } from '../../kernel/ExecutionEngine';
import { isLoopbackRequest } from '../middleware/auth';

const router = express.Router();
const monitor = new MonitoringTool(); // Use instance to access static metrics

router.get('/metrics', async (req, res) => {
    try {
        const result = await monitor.execute({ action: 'get_metrics' });
        res.json((result as any).output?.metrics || {});
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/metrics/track', async (req, res) => {
    const { event, value, metadata } = req.body;
    try {
        const result = await monitor.execute({ action: 'track', event, value, metadata });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * JOE UPDATES HIMSELF.
 *
 * «هذه ليش كل مرة لازم احطها على البورشال.. بدي طريقة ما احطها ولا مرة».
 *
 * He was pasting six lines of PowerShell to update, and a backup dance around
 * them so the pull would not eat his uploads. The backup dance is now the
 * updater's own job (scripts/joe-data-guard.js). This is the other half: a
 * button, so there is nothing to paste at all.
 *
 * SECURITY, because Joe is going online: this endpoint runs a script that
 * stops the server, rebuilds it from GitHub and starts it again. It is the
 * single most dangerous route in the app, so it is refused unless the request
 * came from the machine Joe runs on — the loopback interface, read from the
 * socket, never from a header anyone can forge. A user on the far side of the
 * internet cannot reach it however they authenticate, and setting
 * JOE_SELF_UPDATE=0 removes it entirely.
 */
const UPDATE_LOG = path.join(os.tmpdir(), 'joe-self-update.log');
const DONE_MARK = 'التحديث اكتمل';
/** Set when THIS process started an update; a restart clears it, which is correct. */
let startedAt = 0;
let updaterPid = 0;

/** Walk up to the checkout: the bundle runs from api/dist, the source from api/src/api/routes. */
function repoRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'update-joe.ps1')) || fs.existsSync(path.join(dir, '.git'))) return dir;
        const up = path.dirname(dir);
        if (up === dir) break;
        dir = up;
    }
    return process.cwd();
}

function selfUpdateEnabled(): boolean {
    return String(process.env.JOE_SELF_UPDATE ?? '1') !== '0';
}

function readTail(limit = 8000): string {
    try {
        const raw = fs.readFileSync(UPDATE_LOG, 'utf-8');
        return raw.length > limit ? raw.slice(-limit) : raw;
    } catch { return ''; }
}

/**
 * IS THERE ANYTHING TO UPDATE TO?
 *
 * «اريد تغير الاسم تحديث متاح، وعند وجود تحديث جديد يجب ان تظهر علامة على
 * الزر ليعرف المستخدم ان هناك تحديث جديد».
 *
 * Answered by git, not by a guess: fetch the remote branch quietly and count
 * the commits between HEAD and it. The fetch costs a network round trip, so it
 * runs at most every ten minutes and the answer is cached — the UI can ask as
 * often as it likes.
 */
let lastCheck = { at: 0, behind: 0, current: '', latest: '', ok: false };
let checking = false;

async function refreshUpdateCheck(force = false): Promise<void> {
    const TEN_MIN = 10 * 60 * 1000;
    if (checking) return;
    if (!force && Date.now() - lastCheck.at < TEN_MIN) return;
    checking = true;
    try {
        const root = repoRoot();
        const run = (args: string[]) => executionEngine.runArgv('git', args, { cwd: root, timeout: 25_000 });
        await run(['fetch', 'origin', 'main', '--quiet']);
        const behind = await run(['rev-list', '--count', 'HEAD..origin/main']);
        const head = await run(['rev-parse', '--short', 'HEAD']);
        const remote = await run(['rev-parse', '--short', 'origin/main']);
        const n = parseInt(String(behind?.output || '').trim(), 10);
        lastCheck = {
            at: Date.now(),
            behind: Number.isFinite(n) ? n : 0,
            current: String(head?.output || '').trim(),
            latest: String(remote?.output || '').trim(),
            // A failed fetch (offline) must not be reported as «up to date».
            ok: behind?.ok === true,
        };
    } catch {
        lastCheck = { ...lastCheck, at: Date.now(), ok: false };
    } finally {
        checking = false;
    }
}

router.get('/update/check', async (req, res) => {
    if (!isLoopbackRequest(req)) return res.status(403).json({ error: 'local_only' });
    // Answer from cache immediately; refresh in the background for the next ask.
    void refreshUpdateCheck(String(req.query.force || '') === '1');
    res.json({
        ok: true,
        available: lastCheck.ok && lastCheck.behind > 0,
        behind: lastCheck.behind,
        current: lastCheck.current,
        latest: lastCheck.latest,
        checkedAt: lastCheck.at,
        // «we could not ask» is not «nothing new» — the UI must not claim either
        known: lastCheck.ok,
    });
});

router.get('/update/status', (req, res) => {
    const tail = readTail();
    let fresh = false;
    try { fresh = Date.now() - fs.statSync(UPDATE_LOG).mtimeMs < 10 * 60 * 1000; } catch { /* never run */ }
    res.json({
        ok: true,
        allowed: selfUpdateEnabled() && isLoopbackRequest(req),
        // "still working" means: it wrote recently and has not printed its last
        // line. An update that has produced no output YET is still running —
        // the old rule needed output to exist, so a silent start read as idle.
        running: fresh && !tail.includes(DONE_MARK) && !tail.includes('[X]'),
        finished: tail.includes(DONE_MARK),
        failed: tail.includes('[X]'),
        startedAt,
        pid: updaterPid,
        // so the overlay can say «لم يصل سطر بعد» instead of showing three dots
        lines: tail ? tail.split('\n').filter(Boolean).length : 0,
        // the coarse step, marked by the updater itself — visible even when
        // only a couple of lines have arrived
        stage: (tail.match(/\[STAGE\] (\w+)/g) || []).slice(-1)[0]?.replace('[STAGE] ', '') || '',
        log: tail,
    });
});

router.post('/update', (req, res) => {
    if (!selfUpdateEnabled()) return res.status(404).json({ error: 'self_update_disabled' });
    if (!isLoopbackRequest(req)) {
        return res.status(403).json({ error: 'local_only', message: 'التحديث يُطلب من الجهاز الذي يعمل عليه جو فقط.' });
    }

    const root = repoRoot();
    const isWin = process.platform === 'win32';
    /**
     * JOE_UPDATE_SCRIPT lets an operator say how THIS installation updates
     * itself — a container image does not update with `git pull`, it updates
     * with `docker compose pull && up -d`. Unset (his laptop, and the normal
     * case) it is the updater sitting beside this checkout.
     */
    const script = String(process.env.JOE_UPDATE_SCRIPT || '').trim()
        || (isWin ? path.join(root, 'update-joe.ps1') : path.join(root, 'update-joe.sh'));
    if (!fs.existsSync(script)) return res.status(500).json({ error: 'updater_missing', script });

    /**
     * THE PROGRESS HE COULD NOT SEE.
     *
     * PowerShell's Write-Host writes to the HOST, not to standard output. The
     * updater is spawned detached, hidden and console-less, so all 66 of its
     * progress lines went nowhere: the log stayed empty and the overlay showed
     * three dots for two minutes. «لا يظهر تقدم التحديث» was exact.
     *
     * The scripts now echo every line into this file as well, which is why they
     * are told where it is.
     */
    try { fs.writeFileSync(UPDATE_LOG, `بدأ التحديث ${new Date().toLocaleString()}\n`); } catch { /* the log is a convenience */ }
    startedAt = Date.now();

    const spawned = /\.ps1$/i.test(script)
        ? executionEngine.runDetached('powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
            { cwd: root, logFile: UPDATE_LOG, env: { JOE_UNATTENDED: '1', JOE_UPDATE_LOG: UPDATE_LOG } })
        : executionEngine.runDetached(isWin ? script : '/bin/bash', isWin ? [] : [script],
            { cwd: root, logFile: UPDATE_LOG, env: { JOE_UNATTENDED: '1', JOE_UPDATE_LOG: UPDATE_LOG } });

    if (!spawned.ok) {
        // A failure to even start must be VISIBLE, not a silent empty overlay.
        try { fs.appendFileSync(UPDATE_LOG, `[X] تعذّر تشغيل المحدِّث: ${spawned.error}\n`); } catch { /* best effort */ }
        return res.status(500).json({ error: 'spawn_failed', message: spawned.error });
    }
    updaterPid = spawned.pid || 0;
    // Answer NOW: the updater is about to kill this very process.
    res.json({ ok: true, pid: spawned.pid, log: UPDATE_LOG });
});

export default router;
