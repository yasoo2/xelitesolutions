import { AsyncLocalStorage } from 'node:async_hooks';
import * as os from 'node:os';
import { releaseResidentInference, residentInferenceBytes, type ResidentRelease } from './resident-inference';
import { LOCAL_INFERENCE_HARD_MAX_MS } from '../llm/local-throughput';
import { CONTEXT_HARD_MAX_TOKENS, contextTierForMemory, localContextCeilingTokens } from './context-ceiling';

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const MIN_FITTED_OUTPUT_TOKENS = 256;
// After an unload: how long memory is given to show what the server handed
// back (the server has already said its runner exited), in readings.
const UNLOAD_SETTLE_READINGS = 8;
const UNLOAD_SETTLE_MS = 250;
const NO_RELEASE: ResidentRelease = { releasedBytes: 0, unloadedModels: 0, confirmed: false };

export type ResourceAdmissionCode = 'RESOURCE_QUEUE_FULL' | 'RESOURCE_QUEUE_TIMEOUT'
    | 'RESOURCE_LOW_MEMORY' | 'RESOURCE_MEMORY_UNAVAILABLE' | 'RESOURCE_CONTEXT_OVERFLOW'
    | 'RESOURCE_INVALID_BUDGET' | 'RESOURCE_INFERENCE_REENTRANT' | 'RESOURCE_CANCELLED'
    | 'RESOURCE_HEAVY_DEPTH_LIMIT' | 'RESOURCE_HEAVY_LEASE_CLOSED'
    | 'RESOURCE_SCOPE_CLOSED' | 'RESOURCE_SCOPE_REQUIRED' | 'RESOURCE_CLEANUP_FAILED';

export class ResourceAdmissionError extends Error {
    readonly name = 'ResourceAdmissionError';
    constructor(public readonly code: ResourceAdmissionCode, public readonly details: Record<string, number | string> = {}) {
        super(code);
    }
}

export interface MemoryReading {
    totalBytes?: number;
    freeBytes?: number;
    availableBytes?: number;
    rssBytes?: number;
}

export interface MemorySnapshot {
    readonly measuredAt: number;
    readonly totalBytes: number | null;
    readonly freeBytes: number | null;
    readonly processAvailableBytes: number | null;
    readonly availableBytes: number;
    readonly rssBytes: number | null;
}

export interface ResourceEvent {
    lane: 'request' | 'heavy' | 'inference';
    state: 'measured' | 'queued' | 'started' | 'completed' | 'failed' | 'cancelled' | 'cleanup_failed';
    kind?: string;
    availableBytes?: number;
    freeBytes?: number | null;
    rssBytes?: number | null;
    contextTokens?: number;
    outputTokens?: number;
    queueWaitMs?: number;
    elapsedMs?: number;
    code?: string;
    /** The numbers behind a refusal (prompt/context tokens, memory), so a failure explains itself. */
    details?: Record<string, number | string>;
}

export interface ResourceRequestScope {
    requestId: string;
    sessionId?: string;
    workspaceId?: string;
    userId?: string;
    signal?: AbortSignal;
    notify?: (event: ResourceEvent) => void;
}

export interface HeavyOptions {
    kind?: string;
    signal?: AbortSignal;
    queueTimeoutMs?: number;
    /**
     * This work's heavy parts are model calls (admitted on their own) or a
     * browser that is already running — project_edit, react_project, a browser
     * action. The model the local server holds counts as available to it, and
     * it is never unloaded for it: unloading it there only made the work's own
     * first model call load it again (second review of round 21: five
     * project_edit runs, five unloads, five cold loads). Work that allocates its
     * own memory — a process, an install, a build, a recogniser — leaves this
     * unset and is judged on what is really free.
     */
    modelBound?: boolean;
}

export interface InferenceOptions extends HeavyOptions {
    promptEstimatedTokens: number;
    requestedOutputTokens?: number;
    /** A trusted server/provider cap only; never a user-body override. */
    requestedContextTokens?: number;
    /** Opt-in: serve the room the prompt leaves instead of refusing an output wish that does not fit. */
    fitOutputToContext?: boolean;
}

export interface ContextBudget {
    signal: AbortSignal;
    contextTokens: number;
    outputTokens: number;
    promptEstimatedTokens: number;
    reservedMemoryBytes: number;
    memory: MemorySnapshot;
    /** These policies do not prove tokenizer fit or model cold-load fit. */
    estimated: true;
}

export interface RequestResourceManagerOptions {
    maxQueued?: number;
    queueTimeoutMs?: number;
    minFreeBytes?: number;
    reserveBytes?: number;
    maxContextTokens?: number;
    sampleMemory?: () => MemoryReading;
    /**
     * RAM the local inference server holds for loaded models (not their VRAM).
     * It is reclaimable for the next local model call only (withInference),
     * never for other heavy work.
     */
    sampleResidentInference?: () => Promise<number>;
    /**
     * Unload the idle models the local server holds in RAM and say what that
     * did (see admitBesideIdleModels). Defaults to the loopback server's own
     * unload; an injected memory reading with no unloader unloads nothing.
     */
    releaseResidentInference?: () => Promise<ResidentRelease>;
    /** How often a running inference re-reads what the server holds (see withInference). */
    residencyRefreshMs?: number;
    now?: () => number;
}

type Release = () => void;
type Waiter = { signal: AbortSignal; resolve: (release: Release) => void; reject: (error: Error) => void;
    abort: () => void; timer?: ReturnType<typeof setTimeout>; };

/** One removable FIFO waiter per caller; cancellation never revokes another lease. */
class FifoLane {
    private active = false;
    private readonly waiters: Waiter[] = [];
    constructor(private readonly maxQueued: number) {}

    status(): { active: number; queued: number } {
        return { active: Number(this.active), queued: this.waiters.length };
    }

    acquire(signal: AbortSignal, timeoutMs: number, onQueued: () => void): Promise<Release> {
        if (signal.aborted) return Promise.reject(new ResourceAdmissionError('RESOURCE_CANCELLED'));
        if (!this.active) {
            this.active = true;
            return Promise.resolve(this.releaser());
        }
        if (this.waiters.length >= this.maxQueued) return Promise.reject(new ResourceAdmissionError('RESOURCE_QUEUE_FULL'));
        return new Promise((resolve, reject) => {
            const waiter: Waiter = { signal, resolve, reject, abort: () => {} };
            const remove = (code: ResourceAdmissionCode) => {
                const index = this.waiters.indexOf(waiter);
                if (index < 0) return;
                this.waiters.splice(index, 1);
                this.dispose(waiter);
                reject(new ResourceAdmissionError(code));
            };
            waiter.abort = () => remove('RESOURCE_CANCELLED');
            this.waiters.push(waiter);
            signal.addEventListener('abort', waiter.abort, { once: true });
            waiter.timer = setTimeout(() => remove('RESOURCE_QUEUE_TIMEOUT'), timeoutMs);
            // Recheck after registration, including signals that were aborted by a notifier.
            onQueued();
            if (signal.aborted) waiter.abort();
        });
    }

    private dispose(waiter: Waiter): void {
        if (waiter.timer !== undefined) clearTimeout(waiter.timer);
        waiter.signal.removeEventListener('abort', waiter.abort);
    }

    private releaser(): Release {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.active = false;
            while (this.waiters.length) {
                const waiter = this.waiters.shift()!;
                this.dispose(waiter);
                if (waiter.signal.aborted) {
                    waiter.reject(new ResourceAdmissionError('RESOURCE_CANCELLED'));
                    continue;
                }
                this.active = true;
                waiter.resolve(this.releaser());
                break;
            }
        };
    }
}

type RequestState = { scope: ResourceRequestScope; controller: AbortController; closed: boolean;
    cleanups: Set<() => void | Promise<void>>; };
type HeavyLease = { live: boolean; accepting: boolean; depth: number; lane: FifoLane; children: Set<Promise<unknown>> };
type RequestStore = { state: RequestState; signal: AbortSignal; heavyLease?: HeavyLease };

const positive = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const nonnegative = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const boundedInteger = (value: unknown, fallback: number, min: number, max: number): number => {
    const n = positive(value);
    return n === null ? fallback : Math.max(min, Math.min(max, Math.floor(n)));
};

function defaultMemoryReading(): MemoryReading {
    return { totalBytes: os.totalmem(), freeBytes: os.freemem(),
        availableBytes: typeof process.availableMemory === 'function' ? process.availableMemory() : undefined,
        rssBytes: process.memoryUsage().rss };
}

function combinedSignal(...signals: Array<AbortSignal | undefined>): { signal: AbortSignal; dispose: () => void; abort: () => void } {
    const controller = new AbortController();
    const listeners = new Map<AbortSignal, () => void>();
    for (const signal of new Set(signals.filter((s): s is AbortSignal => !!s))) {
        if (signal.aborted) { controller.abort(); break; }
        const listener = () => controller.abort();
        signal.addEventListener('abort', listener, { once: true });
        listeners.set(signal, listener);
    }
    return { signal: controller.signal, abort: () => controller.abort(), dispose: () => {
        for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
        listeners.clear();
    } };
}

/** Resource ownership only: this class never grants tool identity or process authority. */
export class RequestResourceManager {
    private readonly context = new AsyncLocalStorage<RequestStore>();
    private readonly inferenceContext = new AsyncLocalStorage<{ live: boolean }>();
    private readonly heavy: FifoLane;
    private readonly inference: FifoLane;
    private readonly maxQueued: number;
    private readonly liveHeavyLeases = new Set<HeavyLease>();
    private readonly policy: { queueTimeoutMs: number; minFreeBytes: number; reserveBytes: number; maxContextTokens?: number };
    private readonly sampleMemory: () => MemoryReading;
    private readonly sampleResidentInference: () => Promise<number>;
    private readonly releaseResidentInference: () => Promise<ResidentRelease>;
    private readonly residencyRefreshMs: number;
    private readonly now: () => number;
    private lastMemory: MemorySnapshot | null = null;
    private activeRequests = 0;
    private implicitCounter = 0;
    private readonly counts = { completed: 0, failed: 0, cancelled: 0 };

    constructor(options: RequestResourceManagerOptions = {}) {
        const maxQueued = options.maxQueued === 0 ? 0 : boundedInteger(options.maxQueued, 32, 0, 32);
        this.maxQueued = maxQueued;
        this.heavy = new FifoLane(maxQueued);
        this.inference = new FifoLane(maxQueued);
        this.policy = { queueTimeoutMs: boundedInteger(options.queueTimeoutMs, 120000, 1, 300000),
            minFreeBytes: boundedInteger(options.minFreeBytes, GiB, GiB, Number.MAX_SAFE_INTEGER),
            reserveBytes: boundedInteger(options.reserveBytes, 768 * MiB, 768 * MiB, Number.MAX_SAFE_INTEGER),
            // ⛔ 4096 could not hold Joe's own planner: its prompt measured ~16.6k
            // characters (~5.5k tokens) on 2026-10-22, so local planning failed with
            // «no room for an answer» on every build. The window now follows memory
            // (tiers below) up to the operator's ceiling (context-ceiling.ts, 16384
            // unless LOCAL_MAX_CONTEXT raises it); qwen3.5's hybrid attention costs
            // ~32 KiB of KV per token, ~0.5 GiB at 16384. An explicit option is fixed
            // at construction; otherwise the ceiling is read per call.
            maxContextTokens: options.maxContextTokens === undefined ? undefined
                : boundedInteger(options.maxContextTokens, 16384, 256, CONTEXT_HARD_MAX_TOKENS) };
        this.sampleMemory = options.sampleMemory || defaultMemoryReading;
        // An injected memory reading is a test of the floor itself: no live server is asked.
        this.sampleResidentInference = options.sampleResidentInference
            || (options.sampleMemory ? async () => 0 : residentInferenceBytes);
        this.releaseResidentInference = options.releaseResidentInference
            || (options.sampleMemory ? async () => NO_RELEASE : () => releaseResidentInference());
        // 0: an injected memory reading with no residency reader asks no live server, so nothing is kept fresh.
        this.residencyRefreshMs = options.sampleMemory && !options.sampleResidentInference ? 0
            : boundedInteger(options.residencyRefreshMs, 20000, 10, 20000);
        this.now = options.now || Date.now;
    }

    async run<T>(scope: ResourceRequestScope, work: () => Promise<T>): Promise<T> {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (scope.signal?.aborted) abort();
        else scope.signal?.addEventListener('abort', abort, { once: true });
        const state: RequestState = { scope, controller, closed: false, cleanups: new Set() };
        const store: RequestStore = { state, signal: controller.signal };
        const started = this.now();
        this.activeRequests++;
        return this.context.run(store, async () => {
            let failed = false;
            try {
                this.assertOpen(store);
                const memory = this.measure();
                this.emit(store, { lane: 'request', state: 'measured', ...this.memoryEvent(memory) });
                this.assertOpen(store);
                const result = await work();
                if (controller.signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
                return result;
            } catch (error) {
                failed = true;
                const cancelled = (error instanceof ResourceAdmissionError && error.code === 'RESOURCE_CANCELLED') || controller.signal.aborted;
                if (cancelled) this.counts.cancelled++; else this.counts.failed++;
                this.emit(store, { lane: 'request', state: cancelled ? 'cancelled' : 'failed',
                    code: error instanceof ResourceAdmissionError ? error.code : 'RESOURCE_OPERATION_FAILED',
                    elapsedMs: Math.max(0, this.now() - started) });
                throw error;
            } finally {
                state.closed = true;
                // Only Joe's controller is aborted. The caller's signal is never changed.
                controller.abort();
                scope.signal?.removeEventListener('abort', abort);
                // Start every registered owned cleanup before waiting, so a slow one
                // cannot prevent the other handles from receiving their cleanup.
                const cleanupResults = await Promise.allSettled([...state.cleanups].reverse().map(async cleanup => cleanup()));
                const cleanupFailures = cleanupResults.filter(result => result.status === 'rejected').length;
                state.cleanups.clear();
                this.activeRequests--;
                if (cleanupFailures) {
                    this.emit(store, { lane: 'request', state: 'cleanup_failed', code: 'RESOURCE_CLEANUP_FAILED' });
                    if (!failed) {
                        this.counts.failed++;
                        throw new ResourceAdmissionError('RESOURCE_CLEANUP_FAILED', { count: cleanupFailures });
                    }
                }
                if (!failed) {
                    this.counts.completed++;
                    this.emit(store, { lane: 'request', state: 'completed', elapsedMs: Math.max(0, this.now() - started) });
                }
            }
        });
    }

    /**
     * Admit heavy work that is NOT a local model call: an install, a build, a
     * browser, a tool. Its floor is the memory that is really free.
     *
     * ⛔ Review r21 (14726945): this used to credit the resident model's bytes
     * to every heavy tool, so `npm install` was admitted with 0.9 GB free
     * because a 5.7 GB model was loaded — memory npm can never use, since
     * Ollama gives it back only to the next model call. That credit belongs to
     * withInference alone (see admitHeavy() and admitMemory()).
     */
    async withHeavy<T>(work: () => Promise<T>, options: HeavyOptions = {}): Promise<T> {
        return this.admitHeavy(work, options, false);
    }

    /**
     * A local model call to a server Joe cannot size — a generic
     * OpenAI-compatible server has no portable context parameter, so there is
     * no budget to give it (withInference is for the managed Ollama path). It
     * is still a MODEL CALL: the model the server holds is its own, credited to
     * it, and never unloaded for it (admitBesideIdleModels is for other heavy
     * work). Serialized like every heavy admission.
     */
    async withLocalModelCall<T>(work: () => Promise<T>, options: HeavyOptions = {}): Promise<T> {
        return this.admitHeavy(work, options, true);
    }

    private async admitHeavy<T>(work: () => Promise<T>, options: HeavyOptions, localInference: boolean): Promise<T> {
        const store = this.context.getStore();
        if (!store) return this.run({ requestId: `resource-${++this.implicitCounter}`, signal: options.signal }, () => this.admitHeavy(work, options, localInference));
        this.assertOpen(store);
        const parent = store.heavyLease;
        if (parent && (!parent.live || !parent.accepting)) throw new ResourceAdmissionError('RESOURCE_HEAVY_LEASE_CLOSED');
        if (parent && parent.depth >= 16) throw new ResourceAdmissionError('RESOURCE_HEAVY_DEPTH_LIMIT', { maximumDepth: 16 });
        const signal = combinedSignal(store.signal, options.signal);
        const startedWaiting = this.now();
        const kind = this.kind(options.kind || 'heavy');
        const operation = (async () => {
            let release: Release | undefined;
            let lease: HeavyLease | undefined;
            let started = 0;
            try {
                if (signal.signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
                // A parent holds its global permit while direct children share this
                // FIFO. Each child gets its own lane, so deeper legitimate nesting
                // progresses without granting parallel sibling heavy work.
                release = await (parent?.lane || this.heavy).acquire(signal.signal, this.timeout(options.queueTimeoutMs),
                    () => this.emit(store, { lane: 'heavy', state: 'queued', kind }));
                this.assertOpen(store);
                if (parent && !parent.live) throw new ResourceAdmissionError('RESOURCE_HEAVY_LEASE_CLOSED');
                if (signal.signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
                // A model call, or work whose heavy parts are model calls, counts the
                // resident model as its own; work that allocates its own memory may
                // have an idle one unloaded for it.
                const memory = localInference || options.modelBound
                    ? this.admitMemory(await this.reclaimableBytes())
                    : await this.admitBesideIdleModels(signal.signal);
                started = this.now();
                lease = { live: true, accepting: true, depth: parent ? parent.depth + 1 : 0,
                    lane: new FifoLane(this.maxQueued), children: new Set() };
                this.liveHeavyLeases.add(lease);
                this.emit(store, { lane: 'heavy', state: 'started', kind, ...this.memoryEvent(memory), queueWaitMs: Math.max(0, started - startedWaiting) });
                if (signal.signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
                const result = await this.context.run({ ...store, signal: signal.signal, heavyLease: lease }, work);
                lease.accepting = false;
                await this.drainChildren(lease);
                if (signal.signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
                this.emit(store, { lane: 'heavy', state: 'completed', kind, elapsedMs: Math.max(0, this.now() - started) });
                return result;
            } catch (error) {
                signal.abort();
                this.recordFailure(store, 'heavy', kind, error, started || startedWaiting);
                throw error;
            } finally {
                if (lease) {
                    lease.accepting = false;
                    await this.drainChildren(lease);
                    lease.live = false;
                    this.liveHeavyLeases.delete(lease);
                }
                // Neither global nor child permits are released before their
                // actual callback and all admitted descendants have settled.
                release?.();
                signal.dispose();
            }
        })();
        if (parent) {
            parent.children.add(operation);
            void operation.then(() => parent.children.delete(operation), () => parent.children.delete(operation));
        }
        return operation;
    }

    async withInference<T>(work: (budget: ContextBudget) => Promise<T>, options: InferenceOptions): Promise<T> {
        if (this.inferenceContext.getStore()?.live) throw new ResourceAdmissionError('RESOURCE_INFERENCE_REENTRANT');
        return this.admitHeavy(async () => {
            const store = this.context.getStore()!;
            const signal = combinedSignal(store.signal, options.signal);
            const startedWaiting = this.now();
            const kind = this.kind(options.kind || 'inference');
            let release: Release | undefined;
            let marker: { live: boolean } | undefined;
            let residency: ReturnType<typeof setInterval> | undefined;
            let started = 0;
            try {
                release = await this.inference.acquire(signal.signal, this.timeout(options.queueTimeoutMs),
                    () => this.emit(store, { lane: 'inference', state: 'queued', kind }));
                this.assertOpen(store);
                if (signal.signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
                const reclaimable = await this.reclaimableBytes();
                const budget = this.budget(this.admitMemory(reclaimable), options, signal.signal, reclaimable);
                started = this.now();
                marker = { live: true };
                this.emit(store, { lane: 'inference', state: 'started', kind, ...this.memoryEvent(budget.memory),
                    contextTokens: budget.contextTokens, outputTokens: budget.outputTokens, queueWaitMs: Math.max(0, started - startedWaiting) });
                if (signal.signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
                // ⛔ P001-landing-ar, run-1793050584667 (2026-10-27): a 37-minute local
                // call finished, and 768 ms later the next inference was refused
                // RESOURCE_LOW_MEMORY with reclaimableBytes 0 (available 1 072 111 616,
                // floor 1 073 741 824), then the phase's npm install the same way. The
                // model that had just answered was resident, but residency had last been
                // read when that call was admitted — 37 minutes earlier, maybe before the
                // model loaded — so the missed probe had no recent answer to reuse.
                // While the call runs, the server is read again (it answers /api/ps in
                // ~6 ms while generating), so the next admission knows what it holds.
                if (this.residencyRefreshMs) {
                    residency = setInterval(() => { void this.reclaimableBytes(); }, this.residencyRefreshMs);
                    residency.unref?.();
                }
                const result = await this.inferenceContext.run(marker, () => work(budget));
                if (signal.signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
                this.emit(store, { lane: 'inference', state: 'completed', kind, contextTokens: budget.contextTokens,
                    outputTokens: budget.outputTokens, elapsedMs: Math.max(0, this.now() - started) });
                return result;
            } catch (error) {
                this.recordFailure(store, 'inference', kind, error, started || startedWaiting);
                throw error;
            } finally {
                if (residency !== undefined) clearInterval(residency);
                if (marker) marker.live = false;
                release?.();
                signal.dispose();
            }
        }, { ...options, kind: options.kind || 'inference' }, true);
    }

    registerCleanup(cleanup: () => void | Promise<void>): () => void {
        const store = this.context.getStore();
        if (!store) throw new ResourceAdmissionError('RESOURCE_SCOPE_REQUIRED');
        this.assertOpen(store);
        store.state.cleanups.add(cleanup);
        return () => store.state.cleanups.delete(cleanup);
    }

    /** Cancellation only; exposing this signal grants no identity or lease authority. */
    currentSignal(): AbortSignal | undefined {
        const store = this.context.getStore();
        if (!store) return undefined;
        if (store.state.closed) throw new ResourceAdmissionError('RESOURCE_SCOPE_CLOSED');
        return store.signal;
    }

    status(): { activeRequests: number; heavy: { active: number; queued: number }; inference: { active: number; queued: number };
        heavyChildren: { active: number; queued: number }; completed: number; failed: number; cancelled: number; lastMemory: MemorySnapshot | null } {
        const heavyChildren = { active: 0, queued: 0 };
        for (const lease of this.liveHeavyLeases) {
            const status = lease.lane.status();
            heavyChildren.active += status.active;
            heavyChildren.queued += status.queued;
        }
        return { activeRequests: this.activeRequests, heavy: this.heavy.status(), inference: this.inference.status(),
            heavyChildren, ...this.counts, lastMemory: this.lastMemory ? { ...this.lastMemory } : null };
    }

    private async drainChildren(lease: HeavyLease): Promise<void> {
        while (lease.children.size) await Promise.allSettled([...lease.children]);
    }

    private measure(): MemorySnapshot {
        let reading: MemoryReading;
        try { reading = this.sampleMemory(); } catch { throw new ResourceAdmissionError('RESOURCE_MEMORY_UNAVAILABLE'); }
        if (!reading || typeof reading !== 'object') throw new ResourceAdmissionError('RESOURCE_MEMORY_UNAVAILABLE');
        const freeBytes = nonnegative(reading.freeBytes);
        const processAvailableBytes = nonnegative(reading.availableBytes);
        // Zero is a real exhausted limit. Only an absent optional counter permits fallback.
        if ((reading.freeBytes !== undefined && freeBytes === null)
            || (reading.availableBytes !== undefined && processAvailableBytes === null)) {
            throw new ResourceAdmissionError('RESOURCE_MEMORY_UNAVAILABLE');
        }
        const valid = [freeBytes, processAvailableBytes].filter((n): n is number => n !== null);
        if (!valid.length) throw new ResourceAdmissionError('RESOURCE_MEMORY_UNAVAILABLE');
        const memory: MemorySnapshot = Object.freeze({ measuredAt: this.now(), totalBytes: positive(reading.totalBytes),
            freeBytes, processAvailableBytes, availableBytes: Math.min(...valid), rssBytes: nonnegative(reading.rssBytes) });
        this.lastMemory = memory;
        return memory;
    }

    private async reclaimableBytes(): Promise<number> {
        try { return nonnegative(await this.sampleResidentInference()) ?? 0; } catch { return 0; }
    }

    /**
     * HEAVY WORK THAT IS NOT A MODEL CALL, BESIDE AN IDLE MODEL IN RAM.
     *
     * Review r21 stopped crediting a resident model's RAM to an install —
     * nothing gives it back to npm — and so, on the owner's 16 GB laptop with
     * qwen3.5:9b resident (5.7 GiB), every `npm install` and build with 0.9 GB
     * free was refused while the model sat idle: the build stopped although the
     * memory was there to be had. Ollama unloads a model on request and loads
     * it again for the next call. So the floor is judged on free memory first,
     * and only when it fails and the RAM the server holds would clear it is
     * that model unloaded and free memory read again (the server returns it as
     * it unloads). The model is idle then: a model call holds the heavy lane
     * for its whole run (withInference is admitted through admitHeavy), so
     * while this heavy work is being admitted no model call of this process is
     * running. A model call already queued behind this work loads the model
     * again when its turn comes — the price of the install running at all,
     * where the alternative was refusing it. Only work that allocates its own
     * memory comes here (HeavyOptions.modelBound). A GPU server's model sits
     * in VRAM — it has no RAM part to give and is never unloaded for an
     * install; a refusal that unloading cannot cure stays the refusal it was,
     * with its numbers.
     *
     * ⛔ AN UNLOAD THAT GAVE NOTHING BACK IS SAID AS ONE (second review of
     * round 21). Some machines do not give the memory back where it is read:
     * Linux maps the weights from the model file, so they were already
     * counted as available and stay cached after the unload; a container's
     * own limit does not see a host server's memory. Neither can be told
     * apart beforehand from any reading Node offers — what the server holds
     * and what is free are both true, and only the unload shows whether one
     * becomes the other. So the judgement follows the unload at once: the
     * server says when its runner has exited (resident-inference), memory
     * gets a short settle to show it, and the step is admitted or refused
     * then — not after a blind ten seconds of holding the heavy lane. A
     * refusal after an unload carries what was unloaded (unloadedModels,
     * releasedBytes), what came back (recoveredBytes) and whether the server
     * confirmed, and its sentence says the model was asked to unload: the
     * plain refusal's «no other application was stopped» alone hid that.
     */
    private async admitBesideIdleModels(signal: AbortSignal): Promise<MemorySnapshot> {
        try { return this.admitMemory(0); } catch (refusal) {
            if (!(refusal instanceof ResourceAdmissionError) || refusal.code !== 'RESOURCE_LOW_MEMORY') throw refusal;
            const held = await this.reclaimableBytes();
            const before = this.measure();
            if (!held || !this.clearsFloor(before.availableBytes + held)) throw refusal;
            let release = NO_RELEASE;
            try { release = await this.releaseResidentInference() || NO_RELEASE; } catch { release = NO_RELEASE; }
            const releasedBytes = nonnegative(release.releasedBytes) ?? 0;
            if (!releasedBytes) throw refusal;
            for (let reading = 0; ; reading++) {
                if (signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
                const now = this.measure();
                if (this.clearsFloor(now.availableBytes)) return now;
                if (reading >= UNLOAD_SETTLE_READINGS) {
                    throw new ResourceAdmissionError('RESOURCE_LOW_MEMORY', { ...refusal.details, availableBytes: now.availableBytes,
                        unloadedModels: nonnegative(release.unloadedModels) ?? 0, releasedBytes,
                        recoveredBytes: Math.max(0, now.availableBytes - before.availableBytes),
                        unloadConfirmed: release.confirmed ? 1 : 0 });
                }
                await new Promise(resolve => setTimeout(resolve, UNLOAD_SETTLE_MS));
            }
        }
    }

    /** The floor admitMemory holds every admission to. */
    private clearsFloor(usableBytes: number): boolean {
        return usableBytes >= this.policy.minFreeBytes && usableBytes > this.policy.reserveBytes;
    }

    /**
     * The floor guards against starting heavy work in too little memory. For a
     * local model call, a model the server already holds is reused or evicted
     * for the next one, so its RAM counts toward what that call can use (see
     * resident-inference.ts). Every other caller passes 0: nothing gives that
     * memory back to an install or a build.
     */
    private admitMemory(reclaimableBytes = 0): MemorySnapshot {
        const memory = this.measure();
        const usable = memory.availableBytes + reclaimableBytes;
        if (usable < this.policy.minFreeBytes || usable <= this.policy.reserveBytes) {
            throw new ResourceAdmissionError('RESOURCE_LOW_MEMORY', { availableBytes: memory.availableBytes, reclaimableBytes,
                minFreeBytes: this.policy.minFreeBytes, reservedMemoryBytes: this.policy.reserveBytes });
        }
        return memory;
    }

    private budget(memory: MemorySnapshot, options: InferenceOptions, signal: AbortSignal, reclaimableBytes = 0): ContextBudget {
        const prompt = options.promptEstimatedTokens;
        let output = options.requestedOutputTokens ?? 512;
        const ceiling = this.policy.maxContextTokens ?? localContextCeilingTokens();
        const requestedContext = options.requestedContextTokens ?? ceiling;
        if (!Number.isFinite(prompt) || prompt < 0 || !Number.isSafeInteger(prompt)
            || !Number.isSafeInteger(output) || output < 1 || !Number.isSafeInteger(requestedContext) || requestedContext < 1) {
            throw new ResourceAdmissionError('RESOURCE_INVALID_BUDGET');
        }
        const usable = memory.availableBytes + reclaimableBytes;
        const tier = contextTierForMemory(usable);
        const contextTokens = Math.min(tier, ceiling, requestedContext);
        // A caller that opted in gets the room the prompt leaves, if a real answer fits.
        if (prompt + output > contextTokens && options.fitOutputToContext && contextTokens - prompt - 1 >= MIN_FITTED_OUTPUT_TOKENS) {
            output = contextTokens - prompt - 1;
        }
        if (prompt + output > contextTokens) throw new ResourceAdmissionError('RESOURCE_CONTEXT_OVERFLOW',
            { promptEstimatedTokens: prompt, requestedOutputTokens: output, contextTokens });
        return { signal, contextTokens, outputTokens: output, promptEstimatedTokens: prompt,
            reservedMemoryBytes: this.policy.reserveBytes, memory, estimated: true };
    }

    private assertOpen(store: RequestStore): void {
        if (store.state.closed) throw new ResourceAdmissionError('RESOURCE_SCOPE_CLOSED');
        if (store.signal.aborted) throw new ResourceAdmissionError('RESOURCE_CANCELLED');
    }

    private timeout(value: number | undefined): number {
        // An explicit per-call wait may reach the local inference hard maximum.
        return boundedInteger(value, this.policy.queueTimeoutMs, 1, LOCAL_INFERENCE_HARD_MAX_MS);
    }

    private kind(value: string): string { return value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 48); }

    private memoryEvent(memory: MemorySnapshot): Pick<ResourceEvent, 'availableBytes' | 'freeBytes' | 'rssBytes'> {
        return { availableBytes: memory.availableBytes, freeBytes: memory.freeBytes, rssBytes: memory.rssBytes };
    }

    private emit(store: RequestStore, event: ResourceEvent): void {
        try { store.state.scope.notify?.(event); } catch { /* Observability does not own execution. */ }
    }

    private recordFailure(store: RequestStore, lane: 'heavy' | 'inference', kind: string, error: unknown, started: number): void {
        const cancelled = (error instanceof ResourceAdmissionError && error.code === 'RESOURCE_CANCELLED') || store.signal.aborted;
        this.emit(store, { lane, state: cancelled ? 'cancelled' : 'failed', kind,
            code: error instanceof ResourceAdmissionError ? error.code : 'RESOURCE_OPERATION_FAILED',
            ...(error instanceof ResourceAdmissionError && Object.keys(error.details).length ? { details: { ...error.details } } : {}),
            // A failed operation names its own error code (never its message), so a
            // bare RESOURCE_OPERATION_FAILED is traceable to the layer that failed.
            ...(!(error instanceof ResourceAdmissionError) && /^[A-Z][A-Z0-9_]{2,63}$/.test(String((error as any)?.code ?? ''))
                ? { details: { cause: String((error as any).code) } } : {}),
            elapsedMs: Math.max(0, this.now() - started) });
    }
}

export const requestResourceManager = new RequestResourceManager();
