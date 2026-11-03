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

/**
 * The spend record. One Joe process owns the file. Every hold and charge
 * changes one in-memory copy at once (no await between the check and the
 * change), and each charge is then written back atomically (temp file, then
 * rename), in order. A crash loses at most the calls in flight, never the
 * total already written.
 */
export class SpendLedger {
    private data: LedgerFile = { totalUsd: 0, calls: 0, byRun: {}, recent: [] };
    private loaded: Promise<void> | null = null;
    private writes: Promise<void> = Promise.resolve();
    private heldTotal = 0;
    private readonly held = new Map<string, number>();

    constructor(readonly file: string, public totalBudgetUsd: number, public runBudgetUsd: number) {}

    private load(): Promise<void> {
        return (this.loaded ??= (async () => {
            try {
                const parsed = JSON.parse(await fsp.readFile(this.file, 'utf8'));
                if (typeof parsed?.totalUsd === 'number' && parsed.byRun && typeof parsed.byRun === 'object') {
                    this.data = { totalUsd: parsed.totalUsd, calls: Number(parsed.calls) || 0, byRun: parsed.byRun, recent: Array.isArray(parsed.recent) ? parsed.recent : [] };
                }
            } catch (e: any) {
                if (e?.code !== 'ENOENT') {
                    //  A ledger that exists but cannot be read must not reset the total to zero.
                    throw Object.assign(new Error(`The spend ledger ${this.file} cannot be read: ${String(e?.message || e).slice(0, 200)}`), { code: 'ENGINE_BUDGET_LEDGER' });
                }
            }
        })());
    }

    async spent(runId?: string): Promise<{ totalUsd: number; runUsd: number; calls: number }> {
        await this.load();
        return { totalUsd: this.data.totalUsd, runUsd: runId ? (this.data.byRun[runId]?.usd ?? 0) : 0, calls: this.data.calls };
    }

    /**
     * Hold `worstUsd` for one call, or throw ENGINE_BUDGET_EXHAUSTED when it
     * does not fit. Calls in flight hold their worst case, so runs working at
     * the same time cannot together pass the budget. The hold ends with
     * `charge` (the billed cost replaces it) or `release` (nothing was billed).
     */
    async reserve(runId: string, worstUsd: number): Promise<Reservation> {
        await this.load();
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
                return this.persist();
            },
        };
    }

    /** Write the current copy. Writes run one after another; a failed one is reported and the next still runs. */
    private persist(): Promise<void> {
        const snapshot = JSON.stringify(this.data, null, 2);
        const next = this.writes.then(async () => {
            await fsp.mkdir(path.dirname(this.file), { recursive: true });
            const tmp = `${this.file}.${process.pid}.tmp`;
            await fsp.writeFile(tmp, snapshot, 'utf8');
            await fsp.rename(tmp, this.file);
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
