/**
 * THE OWNER'S DATA ACROSS ONE LOOP OF CHECKS — THE SAME SAFETY NET AS THE VERIFICATION'S (review 7, H2).
 *
 * The verification (verify.ts) takes, on every change run, a snapshot of the app's data files before any check that
 * can write, holds the project's verify lock, keeps every version of them outside the project while it runs (the
 * recovery copy), and puts back what its checks changed. The other loops that walk the owner's app — the pipeline,
 * project_repair, react_project — choose their door through the same code (`seedLoopQaPin` → `chooseQaPath`) and get
 * this same net through this file: the same snapshot, lock, recovery copy and put-back primitives
 * (qa-leaves-no-trace.ts), with the loop's own way of stopping and starting the server it walked.
 *
 * A folder with no delivery record (a new build) gets nothing here: it runs exactly as today.
 */
import fs from 'fs';
import path from 'path';
import {
    acquireVerifyLock, addressIsFree, appDataChanges, discardSnapshot, isInsideFolder, RECOVERY_BUDGET, recoveryHome,
    recoveryRunDir, restoreAppData, snapshotAppData, VERIFY_LOCK_WAIT_MS, watchAppData,
    type AppDataSnapshot, type AppDataWatch, type VerifyLock,
} from './qa-leaves-no-trace';
import { createQaWindows, unexplainedFiles } from './qa-windows';
import type { QaPin } from './qa-target';

/** What settling the span did, for the loop's report and the owner's lines. */
export interface OwnerDataSettle {
    /** Data files that changed while the loop's checks ran (project-relative, forward slashes). */
    changed: string[];
    /** Of them, put back as they were (or removed, when the checks made them). */
    putBack: string[];
    /** Could not be put back. */
    failed: string[];
    /** Changed and left as they are, and why. */
    left?: 'lockBusy' | 'serverRunning';
    /** Versions kept in the recovery copy (0: none). */
    recoveryVersions: number;
    /** Changes seen outside every window of the loop's own work. */
    unexplained: string[];
}

export interface OwnerDataSpan {
    /** A change run whose data was snapshotted: settle() puts back. False: a new build, or nothing could be read. */
    readonly active: boolean;
    /** Another check of this app held the verify lock: this loop must save nothing, and puts nothing back. */
    readonly lockBusy: boolean;
    /** The loop's pin is held to what the span allows (a busy lock: 2T runs as path 3). Call it on every pin the loop seeds. */
    restrict(pin: QaPin): void;
    /** Runs `work` inside one of the loop's windows (its own requests: a walk, a probe, a restart). */
    around<T>(what: string, work: () => Promise<T>): Promise<T>;
    /**
     * Compares the data with the snapshot and puts back what changed — the server stopped first with `stop` (a
     * running server holds its files and writes its own copy back), and started again with `start`. Without `stop`
     * nothing of the loop's is running, and the files are put back as they are. Once: a second call returns the first.
     */
    settle(hooks?: { stop?: () => Promise<boolean>; start?: () => Promise<unknown>; liveUrl?: string }): Promise<OwnerDataSettle>;
    /** The owner's lines for what settle() did, in his language (verify.ts qaPathLines). */
    lines(language: string): string[];
    /** Ends the watch, discards the snapshot and lets the lock go. A loop that never settled has nothing put back (it is logged, and the copy kept). */
    close(): Promise<void>;
}

const EMPTY: OwnerDataSettle = { changed: [], putBack: [], failed: [], recoveryVersions: 0, unexplained: [] };

const rel = (root: string, abs: string) => (path.isAbsolute(abs) ? path.relative(root, abs) : abs).split(path.sep).join('/');

/**
 * Opens the span for one loop on `projectRoot` (the folder its server runs from, or the project): on a change run
 * (`pin.record`), the verify lock (a bounded wait), the snapshot and the recovery watch, before any check of the loop.
 */
export async function openOwnerDataSpan(input: {
    projectRoot: string;
    pin: QaPin;
    runId: string;
    workspaceId?: string;
    log?: (line: string) => void;
    /** At most this long for the lock (default 60 s). */
    lockWaitMs?: number;
    env?: NodeJS.ProcessEnv;
}): Promise<OwnerDataSpan> {
    const root = path.resolve(String(input.projectRoot || '.'));
    const log = (line: string) => { try { input.log?.(line); } catch { /* the log is optional */ } };
    const windows = createQaWindows();
    const workspaceId = String(input.workspaceId || 'default').trim() || 'default';
    const runKey = `${String(input.runId || 'loop').replace(/[^A-Za-z0-9_.-]/gu, '_').slice(0, 60)}-${Date.now().toString(36)}`;
    let lock: VerifyLock | null = null;
    let lockBusy = false;
    let snapshot: AppDataSnapshot | undefined;
    let watch: AppDataWatch | undefined;
    let runDir: string | undefined;
    let settled: OwnerDataSettle | null = null;
    let settling: Promise<OwnerDataSettle> | null = null;
    let putBackRan = false;
    let keepSnapshot = false;
    const changeRun = !!input.pin?.record;

    const restrict = (pin: QaPin) => { if (lockBusy && pin && pin.path === '2t') { pin.path = 'no-write'; log('owner data: another check of this app holds its verify lock: this loop saves nothing (2t → no-write)'); } };

    if (changeRun) {
        try {
            lock = await acquireVerifyLock(workspaceId, root, runKey, { waitMs: Math.max(0, input.lockWaitMs ?? VERIFY_LOCK_WAIT_MS), env: input.env });
            if (!lock) lockBusy = true;
        } catch (e: any) {
            log(`owner data: the verify lock could not be taken (${String(e?.message || e).slice(0, 120)}); what the checks change is still put back`);
        }
        restrict(input.pin);
        snapshot = await snapshotAppData(root).catch(() => undefined);
        if (snapshot && !lockBusy) {
            try {
                runDir = recoveryRunDir(workspaceId, root, runKey, input.env);
                watch = watchAppData(snapshot, { into: runDir, budget: RECOVERY_BUDGET });
            } catch (e: any) {
                runDir = undefined;
                log(`owner data: the recovery copy could not be kept (${String(e?.message || e).slice(0, 120)})`);
            }
        }
        log(`owner data: a change run (${input.pin.record}); snapshot ${snapshot ? `of ${snapshot.files.size} data file(s)` : 'not taken'}${lockBusy ? '; another check holds the lock' : ''}`);
    }

    const settleOnce = async (hooks: { stop?: () => Promise<boolean>; start?: () => Promise<unknown>; liveUrl?: string } = {}): Promise<OwnerDataSettle> => {
        if (!changeRun || !snapshot) return { ...EMPTY };
        let changes: string[] = [];
        try { changes = await appDataChanges(snapshot); } catch { changes = []; }
        const changed = changes.map(f => rel(root, f));
        const versions = () => (watch ? watch.versions().length : 0);
        const unexplained = () => (watch ? unexplainedFiles(watch.changes(), windows.list().filter(w => w.writes !== false)) : []);
        if (!changed.length) return { ...EMPTY };
        if (lockBusy) return { changed, putBack: [], failed: [], left: 'lockBusy', recoveryVersions: versions(), unexplained: [] };
        return windows.around('put-back', async () => {
            if (hooks.stop) {
                const stopped = await hooks.stop().catch(() => false);
                if (!stopped || (hooks.liveUrl && !(await addressIsFree(hooks.liveUrl)))) {
                    log(`owner data: ${changed.join(', ')} changed and were not put back: the server did not stop`);
                    return { changed, putBack: [], failed: [], left: 'serverRunning' as const, recoveryVersions: versions(), unexplained: unexplained() };
                }
            }
            if (watch) await watch.flush('put-back').catch(() => undefined);
            const restored = await restoreAppData(snapshot!);
            putBackRan = true;
            const failed = restored.failed.map(f => f.split(path.sep).join('/'));
            //  The version from before of a file that could not be put back stays (M3): in the copies, else the snapshot.
            if (failed.length) {
                const before = failed.map(f => f.replace(/ \([^)]*\)$/u, ''))
                    .map(r => ({ rel: r, kept: snapshot!.files.get(path.join(root, ...r.split('/'))) }))
                    .filter(x => !!x.kept);
                const inCopies = watch ? await watch.keep(before.map(x => ({ rel: x.rel, from: x.kept!.copy })), 'before the checks').catch(() => false) : false;
                if (!inCopies) { keepSnapshot = true; log(`owner data: ${failed.join(', ')} could not be put back; the version from before is kept in ${snapshot!.dir} (removed after 6 hours)`); }
            }
            const putBack = [...restored.restored, ...restored.removed].map(f => f.split(path.sep).join('/'));
            log(`owner data: put back ${putBack.join(', ') || 'nothing'}${failed.length ? `; could not put back ${failed.join(', ')}` : ''}`);
            if (hooks.start) await hooks.start().catch((e: any) => log(`owner data: the server did not start again: ${String(e?.message || e).slice(0, 160)}`));
            return { changed, putBack, failed, recoveryVersions: versions(), unexplained: unexplained() };
        });
    };

    const span: OwnerDataSpan = {
        active: changeRun && !!snapshot,
        lockBusy,
        restrict,
        around: (what, work) => (changeRun ? windows.around(what, work) : work()),
        settle(hooks) {
            if (settled) return Promise.resolve(settled);
            if (!settling) settling = settleOnce(hooks).then(r => { settled = r; return r; });
            return settling;
        },
        lines(language: string): string[] {
            const s = settled;
            if (!s || (!s.changed.length && !s.failed.length)) return [];
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { qaPathLines } = require('../engine/verify') as typeof import('../engine/verify');
            return qaPathLines({
                path: input.pin?.path || 'no-write', blocked: 0, notTried: [], skippedProbes: [], walked: false,
                ...(s.putBack.length ? { putBack: s.putBack } : {}),
                ...(s.left ? { leftChanged: { files: s.changed, why: s.left } } : {}),
                ...(s.failed.length ? { putBackFailed: s.failed, putBackFailedBefore: keepSnapshot ? 'snapshot' as const : 'copies' as const } : {}),
                ...(s.recoveryVersions > 0 && putBackRan ? { recovery: { versions: s.recoveryVersions, bytes: 0, unexplained: s.unexplained, overBudget: !!watch?.overBudget(), keptDays: RECOVERY_BUDGET.keepDays } } : {}),
            }, language);
        },
        async close() {
            //  A loop that ended before it settled: nothing is written under a server that may still run — only told in the log.
            if (changeRun && !settled && snapshot) {
                const left = await appDataChanges(snapshot).catch(() => [] as string[]);
                if (left.length) log(`owner data: the loop ended before its put-back; ${left.map(f => rel(root, f)).join(', ')} changed and were not put back (the recovery copy keeps every version)`);
                if (left.length && watch) { await watch.flush('loop ended').catch(() => undefined); putBackRan = true; }
            }
            const w = watch;
            watch = undefined;
            if (w) await w.stop().catch(() => undefined);
            if (!putBackRan && runDir && isInsideFolder(runDir, recoveryHome(input.env))) {
                await fs.promises.rm(runDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined);
            }
            if (!keepSnapshot) await discardSnapshot(snapshot);
            const l = lock;
            lock = null;
            if (l) await l.release().catch(() => undefined);
        },
    };
    return span;
}
