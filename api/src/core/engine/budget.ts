/**
 * THE MONEY GUARD FOR A PAID MODEL.
 *
 * The engine can drive a paid API model (Claude), and every step of a long
 * loop costs money. Nothing reaches the API unless this guard allows it:
 *
 *  - a TOTAL budget for the deployment (JOE_ENGINE_BUDGET_USD), kept in a
 *    ledger file under Joe's data folder, so it holds across runs and
 *    restarts;
 *  - a budget PER RUN (JOE_ENGINE_RUN_BUDGET_USD, default $3), so one prompt
 *    that loops cannot eat the rest.
 *
 * Before a call the guard prices the worst case: the whole prompt at the full
 * input price, plus every output token the call may write. If that does not
 * fit what is left, the call is not made and the run stops with
 * ENGINE_BUDGET_EXHAUSTED, which says so. After the call it charges what the
 * API reported it billed (usage), never an estimate.
 *
 * Prices are the published ones (platform.claude.com/docs/en/about-claude/pricing,
 * read 2026-11-01), in dollars per million tokens. A model with no price
 * here is refused: spending on a price nobody checked is not allowed.
 */
import { createHash } from 'crypto';
import { promises as fsp } from 'fs';
import path from 'path';

export interface Price {
    input: number;
    output: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
    cacheRead: number;
}

interface PriceRule {
    /** Matches the model id and its dated or suffixed forms. */
    pattern: RegExp;
    base: Price;
    /** Haiku 5.5 bills a whole request at higher prices when its prompt passes this many tokens. */
    above?: { promptTokens: number; price: Price };
}

const PRICES: PriceRule[] = [
    {
        pattern: /^claude-haiku-5-5(?:$|[-@])/,
        base: { input: 0.10, output: 0.50, cacheWrite5m: 0.125, cacheWrite1h: 0.20, cacheRead: 0.01 },
        above: { promptTokens: 100_000, price: { input: 0.50, output: 2.50, cacheWrite5m: 0.625, cacheWrite1h: 1.00, cacheRead: 0.05 } },
    },
    { pattern: /^claude-sonnet-5-5(?:$|[-@])/, base: { input: 2, output: 10, cacheWrite5m: 2.50, cacheWrite1h: 4, cacheRead: 0.10 } },
    { pattern: /^claude-opus-5-5(?:$|[-@])/, base: { input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.20 } },
    //  Fable 5.2 (published 2026-11-09): stronger than 5.1 and cheaper; the whole 1M window at one rate.
    { pattern: /^claude-fable-5-2(?:$|[-@])/, base: { input: 8, output: 40, cacheWrite5m: 10, cacheWrite1h: 16, cacheRead: 0.20 } },
    { pattern: /^claude-fable-5-1(?:$|[-@])/, base: { input: 10, output: 50, cacheWrite5m: 12.50, cacheWrite1h: 20, cacheRead: 0.25 } },
];

export function priceRule(model: string): PriceRule | undefined {
    return PRICES.find(p => p.pattern.test(String(model || '').trim()));
}

/** The token counts a response's `usage` reports. */
export interface BilledUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    /** Cache writes by lifetime. A write with no breakdown counts as 5-minute. */
    cacheWrite5mTokens: number;
    cacheWrite1hTokens: number;
}

export function promptTokensOf(u: BilledUsage): number {
    return u.inputTokens + u.cacheReadTokens + u.cacheWrite5mTokens + u.cacheWrite1hTokens;
}

/** What one response cost, in dollars. */
export function costOf(model: string, u: BilledUsage): number {
    const rule = priceRule(model);
    if (!rule) throw Object.assign(new Error(`No price is known for the model ${model}.`), { code: 'ENGINE_PRICE_UNKNOWN' });
    const p = rule.above && promptTokensOf(u) > rule.above.promptTokens ? rule.above.price : rule.base;
    return (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead
        + u.cacheWrite5mTokens * p.cacheWrite5m + u.cacheWrite1hTokens * p.cacheWrite1h) / 1_000_000;
}

/** The most one call can cost: every prompt token written to the cache at the top tier, every output token used. */
export function worstCaseCost(model: string, promptTokens: number, maxOutputTokens: number): number {
    const rule = priceRule(model);
    if (!rule) throw Object.assign(new Error(`No price is known for the model ${model}.`), { code: 'ENGINE_PRICE_UNKNOWN' });
    const p = rule.above && promptTokens > rule.above.promptTokens ? rule.above.price : rule.base;
    const inputRate = Math.max(p.input, p.cacheWrite5m, p.cacheWrite1h);
    return (promptTokens * inputRate + maxOutputTokens * p.output) / 1_000_000;
}

export interface LedgerEntry {
    at: number;
    runId: string;
    model: string;
    costUsd: number;
    usage: BilledUsage;
    purpose: string;
}

export interface Reservation {
    /** No call was billed: give the hold back. */
    release(): void;
    /** The call was billed: replace the hold with what it cost. Resolves once it is on disk. */
    charge(entry: Omit<LedgerEntry, 'runId'>): Promise<void>;
}

interface LedgerFile {
    totalUsd: number;
    calls: number;
    byRun: Record<string, { usd: number; calls: number; model: string; firstAt: number; lastAt: number }>;
    recent: LedgerEntry[];
}

const RECENT_KEPT = 500;

type RunSpend = LedgerFile['byRun'][string];
/** What this process charged since its last write: ADDED to the file, never written over it. */
interface Unsynced { usd: number; calls: number; byRun: Record<string, RunSpend>; recent: LedgerEntry[] }
const noneUnsynced = (): Unsynced => ({ usd: 0, calls: 0, byRun: {}, recent: [] });
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
/** Windows answers a file another process is renaming or reading with these, for a moment. */
const BUSY = new Set(['EBUSY', 'EPERM', 'EACCES']);

function addRun(into: Record<string, RunSpend>, runId: string, r: RunSpend): void {
    const cur = into[runId];
    if (!cur) { into[runId] = { ...r }; return; }
    cur.usd += r.usd;
    cur.calls += r.calls;
    cur.firstAt = Math.min(cur.firstAt, r.firstAt);
    if (r.lastAt >= cur.lastAt) { cur.lastAt = r.lastAt; cur.model = r.model; }
}

/** The file as it is, with what this process has not written yet added on top. */
function withUnsynced(base: LedgerFile, u: Unsynced): LedgerFile {
    const byRun: Record<string, RunSpend> = {};
    for (const [k, v] of Object.entries(base.byRun || {})) byRun[k] = { ...v };
    for (const [k, v] of Object.entries(u.byRun)) addRun(byRun, k, v);
    const recent = u.recent.length ? [...(base.recent || []), ...u.recent].sort((a, b) => a.at - b.at) : [...(base.recent || [])];
    return { totalUsd: base.totalUsd + u.usd, calls: base.calls + u.calls, byRun, recent: recent.slice(-RECENT_KEPT) };
}

/** The ledger on disk, or null when there is none yet. A ledger that cannot be read throws: it must never reset the total to zero. */
async function readLedger(file: string): Promise<{ data: LedgerFile; mtimeMs: number } | null> {
    for (let attempt = 0; ; attempt++) {
        try {
            const st = await fsp.stat(file);
            const parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
            const data: LedgerFile = typeof parsed?.totalUsd === 'number' && parsed.byRun && typeof parsed.byRun === 'object'
                ? { totalUsd: parsed.totalUsd, calls: Number(parsed.calls) || 0, byRun: parsed.byRun, recent: Array.isArray(parsed.recent) ? parsed.recent : [] }
                : { totalUsd: 0, calls: 0, byRun: {}, recent: [] };
            return { data, mtimeMs: st.mtimeMs };
        } catch (e: any) {
            if (e?.code === 'ENOENT') return null;
            if (BUSY.has(e?.code) && attempt < 20) { await pause(25); continue; }
            throw Object.assign(new Error(`The spend ledger ${file} cannot be read: ${String(e?.message || e).slice(0, 200)}`), { code: 'ENGINE_BUDGET_LEDGER' });
        }
    }
}

/**
 * One writer at a time across processes: a lock file made with «wx». A lock
 * older than 15 s was left by a process that died holding it. After 5 s of
 * waiting the write goes ahead anyway — a charge written without the lock
 * may race once; a charge never written is money nobody counted.
 */
async function underFileLock<T>(lockPath: string, work: () => Promise<T>): Promise<T> {
    const until = Date.now() + 5_000;
    let handle: Awaited<ReturnType<typeof fsp.open>> | null = null;
    while (!handle && Date.now() < until) {
        try {
            handle = await fsp.open(lockPath, 'wx');
        } catch (e: any) {
            if (e?.code !== 'EEXIST' && !BUSY.has(e?.code)) break;
            try {
                if (Date.now() - (await fsp.stat(lockPath)).mtimeMs > 15_000) { await fsp.rm(lockPath, { force: true }); continue; }
            } catch { continue; }
            await pause(20);
        }
    }
    try { return await work(); } finally {
        if (handle) {
            await handle.close().catch(() => undefined);
            await fsp.rm(lockPath, { force: true }).catch(() => undefined);
        }
    }
}

/**
 * The spend record, shared by every Joe process that names the same file.
 *
 * Every hold and charge changes this process's copy at once (no await between
 * the check and the change). Each charge is then ADDED to the file, never
 * written over it: under a lock file, the file is read, what this process
 * charged since its last write is added, and the sum is written atomically
 * (temp file, then rename). A copy that only wrote itself back lost the other
 * process's spend: on 2026-11-12 a second Joe (5097) ran a paid exam beside
 * the test Joe (5047), both held the ledger in memory, and each write erased
 * the other's calls — on a server with several workers it is every write.
 * Before a hold, the file is read again when another process has changed it,
 * so the budget counts what every process spent. A crash loses at most the
 * calls in flight, never the total already written.
 */
export class SpendLedger {
    private data: LedgerFile = { totalUsd: 0, calls: 0, byRun: {}, recent: [] };
    private unsynced: Unsynced = noneUnsynced();
    private loaded: Promise<void> | null = null;
    private writes: Promise<void> = Promise.resolve();
    private writing = 0;
    private seenMtime = -1;
    private checkedAt = 0;
    private heldTotal = 0;
    private readonly held = new Map<string, number>();

    constructor(readonly file: string, public totalBudgetUsd: number, public runBudgetUsd: number) {}

    private load(): Promise<void> {
        return (this.loaded ??= (async () => {
            const disk = await readLedger(this.file);
            if (disk) { this.data = disk.data; this.seenMtime = disk.mtimeMs; }
            this.checkedAt = Date.now();
        })());
    }

    /** What every process has written, read again when the file changed since this process last saw it (at most once a second). */
    private async refresh(): Promise<void> {
        await this.load();
        //  A write of ours in flight has taken its charges out of `unsynced` and not yet put them on disk.
        if (this.writing > 0 || Date.now() - this.checkedAt < 1_000) return;
        this.checkedAt = Date.now();
        try {
            if ((await fsp.stat(this.file)).mtimeMs === this.seenMtime) return;
            const disk = await readLedger(this.file);
            if (disk && this.writing === 0) { this.data = withUnsynced(disk.data, this.unsynced); this.seenMtime = disk.mtimeMs; }
        } catch { /* the copy in memory still holds */ }
    }

    async spent(runId?: string): Promise<{ totalUsd: number; runUsd: number; calls: number }> {
        await this.refresh();
        return { totalUsd: this.data.totalUsd, runUsd: runId ? (this.data.byRun[runId]?.usd ?? 0) : 0, calls: this.data.calls };
    }

    /**
     * Hold `worstUsd` for one call, or throw ENGINE_BUDGET_EXHAUSTED when it
     * does not fit. Calls in flight hold their worst case, so runs working at
     * the same time cannot together pass the budget. The hold ends with
     * `charge` (the billed cost replaces it) or `release` (nothing was billed).
     */
    async reserve(runId: string, worstUsd: number): Promise<Reservation> {
        await this.refresh();
        const totalUsd = this.data.totalUsd;
        const runUsd = this.data.byRun[runId]?.usd ?? 0;
        const heldRun = this.held.get(runId) ?? 0;
        if (worstUsd > this.totalBudgetUsd - totalUsd - this.heldTotal) {
            throw Object.assign(new Error(`The paid-model budget is used up: $${totalUsd.toFixed(4)} of $${this.totalBudgetUsd.toFixed(2)} spent, and the next call may cost up to $${worstUsd.toFixed(4)}.`), { code: 'ENGINE_BUDGET_EXHAUSTED' });
        }
        if (worstUsd > this.runBudgetUsd - runUsd - heldRun) {
            throw Object.assign(new Error(`This run reached its budget: $${runUsd.toFixed(4)} of $${this.runBudgetUsd.toFixed(2)} spent, and the next call may cost up to $${worstUsd.toFixed(4)}.`), { code: 'ENGINE_BUDGET_EXHAUSTED' });
        }
        this.heldTotal += worstUsd;
        this.held.set(runId, heldRun + worstUsd);
        let open = true;
        const release = () => {
            if (!open) return;
            open = false;
            this.heldTotal = Math.max(0, this.heldTotal - worstUsd);
            const left = (this.held.get(runId) ?? 0) - worstUsd;
            if (left > 1e-12) this.held.set(runId, left); else this.held.delete(runId);
        };
        return {
            release,
            charge: (entry: Omit<LedgerEntry, 'runId'>) => {
                //  The hold and the charge change places in one synchronous step.
                release();
                this.data.totalUsd += entry.costUsd;
                this.data.calls++;
                const run = this.data.byRun[runId] ??= { usd: 0, calls: 0, model: entry.model, firstAt: entry.at, lastAt: entry.at };
                run.usd += entry.costUsd;
                run.calls++;
                run.lastAt = entry.at;
                run.model = entry.model;
                this.data.recent.push({ ...entry, runId });
                if (this.data.recent.length > RECENT_KEPT) this.data.recent.splice(0, this.data.recent.length - RECENT_KEPT);
                //  …and owed to the file: added to whatever every other process wrote there meanwhile.
                this.unsynced.usd += entry.costUsd;
                this.unsynced.calls++;
                addRun(this.unsynced.byRun, runId, { usd: entry.costUsd, calls: 1, model: entry.model, firstAt: entry.at, lastAt: entry.at });
                this.unsynced.recent.push({ ...entry, runId });
                if (this.unsynced.recent.length > RECENT_KEPT) this.unsynced.recent.splice(0, this.unsynced.recent.length - RECENT_KEPT);
                return this.persist();
            },
        };
    }

    /**
     * Add what this process charged to the file. Writes run one after another;
     * a failed one keeps its charges owed (the next write adds them) and is
     * reported, and the next still runs.
     */
    private persist(): Promise<void> {
        this.writing++;
        const next = this.writes.then(async () => {
            const batch = this.unsynced;
            this.unsynced = noneUnsynced();
            try {
                await fsp.mkdir(path.dirname(this.file), { recursive: true });
                await underFileLock(`${this.file}.lock`, async () => {
                    const disk = await readLedger(this.file);
                    const merged = withUnsynced(disk ? disk.data : { totalUsd: 0, calls: 0, byRun: {}, recent: [] }, batch);
                    const tmp = `${this.file}.${process.pid}.tmp`;
                    await fsp.writeFile(tmp, JSON.stringify(merged, null, 2), 'utf8');
                    for (let attempt = 0; ; attempt++) {
                        try { await fsp.rename(tmp, this.file); break; } catch (e: any) {
                            if (BUSY.has(e?.code) && attempt < 40) { await pause(25); continue; }
                            await fsp.rm(tmp, { force: true }).catch(() => undefined);
                            throw e;
                        }
                    }
                    //  What every process wrote, and what this one charged while the write ran.
                    this.data = withUnsynced(merged, this.unsynced);
                    this.seenMtime = (await fsp.stat(this.file).catch(() => null))?.mtimeMs ?? -1;
                });
            } catch (e) {
                //  Still owed: put back ahead of what came after it.
                const owed = withUnsynced({ totalUsd: batch.usd, calls: batch.calls, byRun: batch.byRun, recent: batch.recent }, this.unsynced);
                this.unsynced = { usd: owed.totalUsd, calls: owed.calls, byRun: owed.byRun, recent: owed.recent };
                throw e;
            } finally {
                this.writing--;
            }
        });
        this.writes = next.catch(() => undefined);
        return next;
    }

    /** Resolves when every charge so far is on disk. */
    flushed(): Promise<void> { return this.writes; }
}

const ledgers = new Map<string, SpendLedger>();

function dollars(v: string | undefined): number | undefined {
    const n = Number(String(v ?? '').trim());
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The deployment's budget, or why there is none. A paid model is refused
 * unless the total budget is set: the budget IS the owner's consent to spend.
 */
export function ledgerFromEnv(env: NodeJS.ProcessEnv = process.env): SpendLedger | { error: string } {
    const total = dollars(env.JOE_ENGINE_BUDGET_USD);
    if (!total) return { error: 'A paid model needs a budget: set JOE_ENGINE_BUDGET_USD (dollars, for all runs together).' };
    const perRun = dollars(env.JOE_ENGINE_RUN_BUDGET_USD) ?? 3;
    const file = path.resolve(String(env.JOE_ENGINE_LEDGER || '').trim() || path.join(dataDirOf(env), 'engine-spend.json'));
    return ledgerAt(file, total, perRun);
}

/**
 * The ledger for a key the user typed in the provider settings, not the
 * server's. Typing a paid key and choosing its model is the user's consent
 * to spend their own credit, and that credit is the limit: Anthropic refuses
 * a call once it runs out, and the run says so (MODEL_BILLING). The budget
 * per run still applies, so one prompt that loops cannot eat the credit; a
 * deployment may also cap every typed key's total (JOE_ENGINE_KEY_BUDGET_USD).
 * The file is named by a hash of the key, never by the key.
 */
export function keyLedger(apiKey: string, env: NodeJS.ProcessEnv = process.env): SpendLedger {
    const id = createHash('sha256').update(String(apiKey)).digest('hex').slice(0, 16);
    const file = path.resolve(path.join(dataDirOf(env), 'engine-spend-keys', `${id}.json`));
    return ledgerAt(file, dollars(env.JOE_ENGINE_KEY_BUDGET_USD) ?? Number.POSITIVE_INFINITY, dollars(env.JOE_ENGINE_RUN_BUDGET_USD) ?? 3);
}

function dataDirOf(env: NodeJS.ProcessEnv): string {
    return String(env.JOE_DATA_DIR || '').trim() || path.join(process.cwd(), 'data');
}

/** One ledger per file, so every run in this process charges the same total. */
function ledgerAt(file: string, total: number, perRun: number): SpendLedger {
    let ledger = ledgers.get(file);
    if (!ledger) { ledger = new SpendLedger(file, total, perRun); ledgers.set(file, ledger); }
    else { ledger.totalBudgetUsd = total; ledger.runBudgetUsd = perRun; }
    return ledger;
}
