import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MonitoringTool } from '../../modules/tools/definitions/MonitoringTool';
import { executionEngine } from '../../kernel/ExecutionEngine';
import { isLoopbackRequest } from '../middleware/auth';
import { findBinary } from '../../core/orchestrator/plan-tools';

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
/**
 * TWO CHANNELS, TWO FILES, NEITHER ABLE TO SILENCE THE OTHER.
 *
 * The updater can speak two ways: on its own standard output (which Joe
 * redirects into a file) and by writing a file itself. Pointing BOTH at one
 * file put two writers from two processes on one handle, and on Windows that
 * failed inside a silent catch — one line, half an hour, «الخطوة 1 من 4».
 *
 * They are separate files now. The child's stdout lands here; anything the
 * script writes itself lands in UPDATE_LOG; the status route shows both. If
 * either channel breaks, the other still carries the progress.
 */
const UPDATE_OUT = path.join(os.tmpdir(), 'joe-self-update.out');
const DONE_MARK = 'التحديث اكتمل';
/** Set when THIS process started an update; a restart clears it, which is correct. */
let startedAt = 0;
let updaterPid = 0;

/**
 * HOW LONG SILENCE IS ALLOWED TO MEAN «WORKING».
 *
 * «نصف ساعه ولم يتم تحديث النظام» — and the interface said «الخطوة 1 من 4»
 * the whole time, because the only thing it knew was that a file had been
 * written to recently, and nothing had written to it at all.
 *
 * The updater's banner reaches the log in about two seconds. So a log holding
 * nothing but Joe's own header after this long has ONE meaning: the updater
 * never started. That is a different sentence from «still working», and the
 * user is owed the true one.
 */
const neverStartedMs = () => Number(process.env.JOE_UPDATE_SILENT_MS || 40_000);
/** …and once it IS talking, this much dead air means it is stuck, not busy. */
const stalledMs = () => Number(process.env.JOE_UPDATE_STALL_MS || 6 * 60_000);

/** Is that process still there? (signal 0 asks without touching it.) */
function pidAlive(pid: number): boolean {
    if (!pid) return false;
    try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === 'EPERM'; }
}

/**
 * HAS THE UPDATER ITSELF SAID ANYTHING?
 *
 * Joe writes the header and the two «what I am launching» lines, so counting
 * lines would have Joe hearing its own voice and calling it progress. Only
 * lines that are NOT Joe's count as the updater being alive and talking.
 */
function updaterSpoke(tail: string): boolean {
    return tail.split('\n').some(l => {
        const t = l.trim();
        return !!t && !t.startsWith('[i] ') && !t.startsWith('[!] ') && !t.startsWith('بدأ التحديث');
    });
}

/** Joe's own voice in the updater's log — always prefixed, never mistaken for progress. */
function note(mark: '[i]' | '[!]', lines: string[]): void {
    try { fs.appendFileSync(UPDATE_LOG, lines.map(l => `${mark} ${l}\n`).join('')); } catch { /* a courtesy */ }
}

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

function readFileTail(file: string, limit: number): string {
    try {
        const raw = fs.readFileSync(file, 'utf-8');
        return raw.length > limit ? raw.slice(-limit) : raw;
    } catch { return ''; }
}

/** Both channels, in one readable transcript. */
function readTail(limit = 8000): string {
    const own = readFileTail(UPDATE_LOG, limit);
    const streamed = readFileTail(UPDATE_OUT, limit);
    if (!streamed.trim()) return own;
    if (!own.trim()) return streamed;
    return `${own}${own.endsWith('\n') ? '' : '\n'}${streamed}`;
}

/** The newest write across both files — silence means BOTH are silent. */
function silentForMs(): number {
    let newest = 0;
    for (const f of [UPDATE_LOG, UPDATE_OUT]) {
        try { newest = Math.max(newest, fs.statSync(f).mtimeMs); } catch { /* not written yet */ }
    }
    return newest ? Date.now() - newest : Infinity;
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

// Warm on boot, so the very first question already has a real answer.
setTimeout(() => { void refreshUpdateCheck(true); }, 3000).unref?.();

router.get('/update/check', async (req, res) => {
    if (!isLoopbackRequest(req)) return res.status(403).json({ error: 'local_only' });
    /**
     * A COLD CACHE MUST NOT ANSWER «NOTHING NEW».
     *
     * The first call used to return the empty cache and refresh in the
     * background, so the button reported «up to date» before anyone had asked
     * git anything — and since the interface only re-asked every ten minutes,
     * the label never changed. «الاسم لم يتغير على الزر» was the visible end
     * of that: a feature that could not be seen.
     */
    if (!lastCheck.at || String(req.query.force || '') === '1') await refreshUpdateCheck(true);
    else void refreshUpdateCheck(false);
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
    const lines = tail ? tail.split('\n').filter(Boolean).length : 0;
    const silentFor = silentForMs();
    const finished = tail.includes(DONE_MARK);
    const failed = tail.includes('[X]');
    const age = startedAt ? Date.now() - startedAt : 0;

    /**
     * «نصف ساعه ولم يتم تحديث النظام» — AND THE SCREEN KEPT SAYING «STEP 1».
     *
     * The old rule was «the file was touched in the last ten minutes» → still
     * running. After that it reported neither running, nor finished, nor
     * failed — three noes the interface had no state for, so it showed the
     * last thing it knew, forever. A progress bar that cannot say «I stopped»
     * is not progress, it is decoration.
     *
     * There are now two distinct honest answers:
     *   never_started — nothing but Joe's own header, well past the point the
     *                   updater's banner should have arrived
     *   stalled       — it spoke, then went silent for minutes
     */
    let stalled = '';
    if (startedAt && !finished && !failed) {
        if (!updaterSpoke(tail) && age > neverStartedMs()) stalled = 'never_started';
        else if (silentFor > stalledMs()) stalled = 'silent';
    }

    res.json({
        ok: true,
        allowed: selfUpdateEnabled() && isLoopbackRequest(req),
        // "still working" means: it is talking, or it is young enough that
        // silence is normal — and its process is still alive.
        running: !!startedAt && !finished && !failed && !stalled,
        finished,
        failed,
        // The one word the interface was missing.
        stalled,
        alive: pidAlive(updaterPid),
        startedAt,
        pid: updaterPid,
        // seconds of dead air, so the overlay can be specific rather than vague
        silentForMs: Number.isFinite(silentFor) ? Math.max(0, Math.round(silentFor)) : 0,
        // so the overlay can say «لم يصل سطر بعد» instead of showing three dots
        lines,
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
    // The streamed channel starts empty too, or the last run's output would be
    // read as this one's progress.
    try { fs.writeFileSync(UPDATE_OUT, ''); } catch { /* the log is a convenience */ }
    startedAt = Date.now();
    updaterPid = 0;

    /**
     * THE INTERPRETER IS FOUND BEFORE IT IS LAUNCHED.
     *
     * Handed a bare name like «powershell.exe», the process launcher resolves
     * it through PATH itself, and when that lookup fails it does not throw —
     * it emits an event that used to kill Joe outright. Resolving here means a
     * missing interpreter is a sentence on the screen instead of a dead server
     * behind a frozen bar, and it lets pwsh 7 stand in when Windows PowerShell
     * is not on PATH.
     */
    let file = '';
    let args: string[] = [];
    let missing = '';
    if (/\.ps1$/i.test(script)) {
        const winPs = process.env.SystemRoot
            ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
            : '';
        const found = (winPs && fs.existsSync(winPs) ? winPs : '')
            || findBinary('powershell.exe') || findBinary('powershell') || findBinary('pwsh');
        if (!found) missing = 'PowerShell';
        file = found || '';
        args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script];
    } else if (isWin) {
        file = script;
    } else {
        const sh = findBinary('bash') || '/bin/bash';
        if (!fs.existsSync(sh)) missing = 'bash';
        file = sh;
        args = [script];
    }

    if (missing) {
        const message = `تعذّر العثور على ${missing} على هذا الجهاز — لا يمكن تشغيل المحدِّث تلقائياً.`;
        try { fs.appendFileSync(UPDATE_LOG, `[X] ${message}\n`); } catch { /* best effort */ }
        return res.status(500).json({ error: 'interpreter_missing', message });
    }

    /**
     * WHAT WAS ATTEMPTED, WRITTEN BEFORE IT IS ATTEMPTED.
     *
     * When the updater says nothing at all, the log used to say nothing about
     * it either — one header line and half an hour of silence, with no way to
     * tell «PowerShell is missing» from «the script hung on line 3». Two lines
     * cost nothing and turn the next screenshot into a diagnosis.
     */
    note('[i]', [`البرنامج: ${file}`, `السكربت: ${script}`]);

    const spawned = executionEngine.runDetached(file, args, {
        // The child's own stdout goes to ITS file; the script writes to the
        // other one; Joe's remarks (an exit code, a failure) go with the script's
        // so they read in order. No two writers ever share a handle.
        outFile: UPDATE_OUT,
        noteFile: UPDATE_LOG,
        cwd: root,
        env: { JOE_UNATTENDED: '1', JOE_UPDATE_LOG: UPDATE_LOG },
    });

    if (!spawned.ok) {
        // A failure to even start must be VISIBLE, not a silent empty overlay.
        try { fs.appendFileSync(UPDATE_LOG, `[X] تعذّر تشغيل المحدِّث: ${spawned.error}\n`); } catch { /* best effort */ }
        return res.status(500).json({ error: 'spawn_failed', message: spawned.error });
    }
    updaterPid = spawned.pid || 0;

    /**
     * THE WATCHDOG — because a process that starts and says nothing is the
     * exact shape of the half-hour failure. If the updater's own banner has
     * not arrived by now, the log SAYS SO, in the log the user can copy, and
     * hands over the one line that always works.
     */
    setTimeout(() => {
        try {
            if (updaterSpoke(readTail())) return;   // it is talking; nothing to say
            const alive = pidAlive(updaterPid);
            /**
             * [!] AND NOT [X]: this is Joe's diagnosis, not the updater's own
             * failure. Marked as [X] it would be read as «the update failed»,
             * and the interface would show a generic error instead of the one
             * state that carries the explanation and the way out.
             */
            note('[!]', [
                `المحدِّث لم يكتب أي سطر خلال ${Math.round(neverStartedMs() / 1000)} ثانية`
                + ` — العملية ${alive ? `(${updaterPid}) ما زالت قائمة لكنها لا تتقدّم` : 'انتهت دون أن تبدأ'}.`,
                `شغّله بنفسك في نافذة PowerShell لترى السبب كاملاً:`,
                `cd ${root}`,
                `${/\.ps1$/i.test(script) ? '.\\' + path.basename(script) : script}`,
            ]);
        } catch { /* the log is a courtesy, never a failure */ }
    }, neverStartedMs()).unref?.();

    // Answer NOW: the updater is about to kill this very process.
    res.json({ ok: true, pid: spawned.pid, log: UPDATE_LOG });
});

export default router;
