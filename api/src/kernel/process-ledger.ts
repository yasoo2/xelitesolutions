/**
 * WHAT A JOE THAT DIED LEFT RUNNING.
 *
 * A run's processes are stopped at the end of the run (stopAllForRun, the
 * request scope's cleanup). That end never comes when Joe himself dies in the
 * middle: the test Joe aborted natively at 12:25 on 2026-11-06, right after a
 * local-model crash, and the `python -m http.server 5173` a run had started
 * one minute earlier was still serving seven hours later, parent gone,
 * holding its port. Windows does not end children with their parent, and a
 * POSIX child is handed to init. The next Joe could not know it was his.
 *
 * So every long-lived child the execution engine starts is written here, with
 * the identity that survives pid reuse: its pid AND when it started, and the
 * same pair for the Joe that started it. A record stays after its process
 * ends, marked with when (closedMs): a shell that ends may leave the server it
 * started running, and only the parent's pid and those two times find that
 * server later. A Joe that boots reads the ledger and ends what a Joe that is
 * no longer alive left behind (ExecutionEngine reapPreviousLife). The plan is
 * decided here, from plain data, so it can be tested without one process:
 *
 *   - a record whose owner is still alive (this Joe, or another Joe sharing
 *     the folder) is kept and never touched;
 *   - an open record whose process is still that process (same pid, started
 *     within a few seconds of the record) is ended with its whole tree;
 *   - a record whose process is gone may have left children holding its
 *     pipes and ports. Windows keeps the parent's pid on them: the ones
 *     created after the record (and, for an ended record, before it ended),
 *     and before any process that has since taken that pid, are its own, and
 *     each is ended with its tree. On POSIX a command in its own group
 *     (setsid) is ended by the group's id while no other process holds that
 *     pid, since a pid that names a live group is never handed out;
 *   - Joe's own process and the process that started him are never ended.
 *
 * The ledger is off until the server turns it on (api/index.ts), so tests and
 * scripts that load the engine write nothing anywhere.
 */
import fs from 'fs';
import path from 'path';

export interface ChildRecord {
    pid: number;
    /** When the child started, in ms since the epoch, as Joe saw it. */
    startedMs: number;
    /** The program's file name, for the log only. */
    program: string;
    /** POSIX: the child leads its own process group (setsid), so it is ended by the group's id. */
    group: boolean;
    ownerPid: number;
    ownerStartedMs: number;
    /** When Joe saw it end; absent while it runs. */
    closedMs?: number;
}

export interface LiveProcess { pid: number; ppid: number; startedMs: number }

export interface Owner { pid: number; startedMs: number; parentPid?: number }

export interface ReapPlan {
    /** Pids to end with their whole tree (Windows: taskkill /T; POSIX: the process itself). */
    trees: number[];
    /** POSIX process groups to end by their id. */
    groups: number[];
    /** Records left by a Joe that is gone: they leave the ledger. */
    reaped: ChildRecord[];
    /** Records of a Joe that is alive. */
    keep: ChildRecord[];
}

/** Two observations of one process's start agree within this. */
export const SAME_START_MS = 5_000;
/** A child observed starting slightly before its parent was recorded is still its child. */
const CHILD_EARLY_MS = 1_500;
/** A child observed starting just after its parent was seen ending was still started by it. */
const CHILD_LATE_MS = 1_000;
/**
 * Ended records kept per ledger. While Joe lives, a run's own cleanup ends
 * what its commands left; these are for the Joe that dies before it can.
 */
export const KEPT_CLOSED = 300;

export const THIS_JOE: Owner = {
    pid: process.pid,
    startedMs: Math.round(Date.now() - process.uptime() * 1000),
    parentPid: process.ppid,
};

/** Where a Joe that serves from `cwd` keeps the ledger: his data folder, as the engine's spend ledger finds it. */
export function ledgerFileFor(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
    const dataDir = String(env.JOE_DATA_DIR || '').trim() || path.join(cwd, 'data');
    return path.resolve(dataDir, 'runtime', 'child-processes.json');
}

let ledgerFile: string | null = null;

export function enableProcessLedger(file: string): void {
    ledgerFile = path.resolve(file);
}

export function disableProcessLedger(): void {
    ledgerFile = null;
}

export function processLedgerFile(): string | null {
    return ledgerFile;
}

function wholePositive(v: unknown): number | null {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function recordOf(raw: any): ChildRecord | null {
    if (!raw || typeof raw !== 'object') return null;
    const pid = wholePositive(raw.pid);
    const startedMs = wholePositive(raw.startedMs);
    const ownerPid = wholePositive(raw.ownerPid);
    const ownerStartedMs = wholePositive(raw.ownerStartedMs);
    if (!pid || !startedMs || !ownerPid || !ownerStartedMs) return null;
    const closedMs = wholePositive(raw.closedMs);
    return {
        pid, startedMs, ownerPid, ownerStartedMs, program: String(raw.program || '').slice(0, 80), group: raw.group === true,
        ...(closedMs ? { closedMs } : {}),
    };
}

export function readLedger(file: string | null = ledgerFile): ChildRecord[] {
    if (!file) return [];
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
    try {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed?.children) ? parsed.children : [];
        return list.map(recordOf).filter(Boolean) as ChildRecord[];
    } catch { return []; }
}

export function writeLedger(records: ChildRecord[], file: string | null = ledgerFile): void {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ children: records })}\n`, 'utf8');
    fs.renameSync(tmp, file);
}

/** The open records, and the newest `kept` ended ones. */
export function pruned(records: ChildRecord[], kept: number = KEPT_CLOSED): ChildRecord[] {
    const closed = records.filter(r => r.closedMs).sort((a, b) => b.closedMs! - a.closedMs!).slice(0, kept);
    const keep = new Set<ChildRecord>(closed);
    return records.filter(r => !r.closedMs || keep.has(r));
}

function sameRecord(a: ChildRecord, b: ChildRecord): boolean {
    return a.pid === b.pid && a.startedMs === b.startedMs && a.ownerPid === b.ownerPid;
}

/** Note a child this Joe started. A ledger that cannot be written never stops a process from starting. */
export function recordChild(pid: number | undefined, program: string, group = false, owner: Owner = THIS_JOE): ChildRecord | null {
    if (!ledgerFile || !pid) return null;
    const record: ChildRecord = {
        pid, startedMs: Date.now(), program: path.basename(String(program || '')).slice(0, 80), group,
        ownerPid: owner.pid, ownerStartedMs: owner.startedMs,
    };
    try { writeLedger([...readLedger().filter(r => !sameRecord(r, record)), record]); } catch { return null; }
    return record;
}

/** The child has ended: its record says when, so what it left can still be found. */
export function forgetChild(record: ChildRecord | null, closedMs: number = Date.now()): void {
    if (!ledgerFile || !record) return;
    try {
        const records = readLedger();
        const mine = records.find(r => sameRecord(r, record));
        if (!mine) return;
        mine.closedMs = closedMs;
        writeLedger(pruned(records));
    } catch { /* the next boot sees a process that is gone, and looks only for what it left */ }
}

/** After a reap: the ledger as it is now, without the records that were reaped. */
export function dropReaped(reaped: ChildRecord[]): void {
    if (!ledgerFile || !reaped.length) return;
    try { writeLedger(readLedger().filter(r => !reaped.some(x => sameRecord(r, x)))); } catch { /* tried again at the next boot */ }
}

function startsAgree(p: LiveProcess | undefined, ms: number): boolean {
    return !!p && Math.abs(p.startedMs - ms) <= SAME_START_MS;
}

/** The record was written by this very process. */
export function isOwnRecord(r: ChildRecord, self: Owner = THIS_JOE): boolean {
    return r.ownerPid === self.pid && Math.abs(r.ownerStartedMs - self.startedMs) <= SAME_START_MS;
}

/**
 * What to end, from the ledger and the machine's process list. Pure: the
 * caller lists the processes and does the ending.
 */
export function planReap(records: ChildRecord[], live: LiveProcess[], self: Owner = THIS_JOE, platform: NodeJS.Platform = process.platform): ReapPlan {
    const byPid = new Map<number, LiveProcess>();
    for (const p of live) byPid.set(p.pid, p);
    const posix = platform !== 'win32';
    const ownerAlive = (r: ChildRecord) => isOwnRecord(r, self) || startsAgree(byPid.get(r.ownerPid), r.ownerStartedMs);
    const protectedPids = new Set<number>([self.pid, ...(self.parentPid ? [self.parentPid] : [])]);
    const trees = new Set<number>();
    const groups = new Set<number>();
    const reaped: ChildRecord[] = [];
    const keep: ChildRecord[] = [];
    for (const r of records) {
        if (ownerAlive(r)) { keep.push(r); continue; }
        reaped.push(r);
        const now = byPid.get(r.pid);
        //  Still the process that was recorded: it never ended.
        if (!r.closedMs && startsAgree(now, r.startedMs)) {
            (posix && r.group ? groups : trees).add(r.pid);
            continue;
        }
        //  A process that started after this one ended holds its pid now.
        const newcomer = now && !startsAgree(now, r.startedMs) ? now : undefined;
        if (posix) {
            //  The pid is free: a group by that id, if any of it is left, is this record's.
            if (r.group && !now) groups.add(r.pid);
            continue;
        }
        //  Windows: what it started still names it as the parent.
        for (const c of live) {
            if (c.ppid !== r.pid || c.pid === r.pid) continue;
            if (c.startedMs < r.startedMs - CHILD_EARLY_MS) continue;
            if (r.closedMs && c.startedMs > r.closedMs + CHILD_LATE_MS) continue;
            if (newcomer && c.startedMs >= newcomer.startedMs) continue;
            if (now && !newcomer) continue;
            trees.add(c.pid);
        }
    }
    for (const pid of protectedPids) { trees.delete(pid); groups.delete(pid); }
    return { trees: [...trees], groups: [...groups], reaped, keep };
}

/** `pid ppid startedMs` lines, as the engine's Windows process listing prints them. */
export function parseProcessListing(text: string): LiveProcess[] {
    const out: LiveProcess[] = [];
    for (const raw of String(text || '').split(/\r?\n/u)) {
        const m = raw.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/u);
        if (!m) continue;
        const pid = Number(m[1]);
        const ppid = Number(m[2]);
        const startedMs = Number(m[3]);
        if (pid > 0 && startedMs > 0) out.push({ pid, ppid, startedMs });
    }
    return out;
}

/** POSIX `ps -eo pid=,ppid=,etimes=` → the same, the elapsed seconds turned into a start. */
export function parsePsElapsed(text: string, nowMs: number = Date.now()): LiveProcess[] {
    const out: LiveProcess[] = [];
    for (const raw of String(text || '').split(/\r?\n/u)) {
        const m = raw.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/u);
        if (!m) continue;
        const pid = Number(m[1]);
        if (pid > 0) out.push({ pid, ppid: Number(m[2]), startedMs: nowMs - Number(m[3]) * 1000 });
    }
    return out;
}
