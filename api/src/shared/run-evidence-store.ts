import fs from 'fs';
import path from 'path';

export const MAX_EVENTS_PER_RUN = 500;
export const MAX_EVENT_BYTES = 64 * 1024;
const HEAD_EVENTS_PER_RUN = 4;
export const MAX_RECORD_BYTES = 2 * 1024 * 1024;
export const MAX_RUN_RECORDS = 100;

export interface RunEvidenceEvent {
    type: string;
    runId?: string;
    sessionId?: string;
    id?: string;
    seq?: number;
    ts?: number;
    data?: unknown;
    [key: string]: unknown;
}

export interface RunReceiptPayload {
    projectRoot?: string;
    taskReceipts?: unknown[];
    fidelityVerdict?: unknown;
    selfFixReason?: string;
    [key: string]: unknown;
}

export interface RunEvidenceRecord {
    id?: string;
    _id?: string;
    runId: string;
    sessionId?: string;
    startedAt: string;
    updatedAt: string;
    status?: string;
    events: RunEvidenceEvent[];
    receipt?: RunReceiptPayload;
}

/**
 *  ⛔ ONE FILE PER RUN, READ FROM MEMORY, WRITTEN IN BATCHES.
 *
 *  The 500-prompt exam, 2026-11-03 (P155). Every run's evidence lived in ONE
 *  JSON file, and every event of every run — hundreds per run — read that
 *  file and parsed it four times (findOne, findOne, updateOne, the rotation's
 *  find) and wrote all of it back. At 24.6 MB a finished run's receipt could
 *  not be read forty minutes after the run had ended: the receipt request
 *  waited behind the run's own event writes, and the exam waited on it. Each
 *  run made every later event slower; on a server with thousands of users it
 *  would have stopped Joe.
 *
 *  The records now live in memory (bounded by MAX_RUN_RECORDS ×
 *  MAX_RECORD_BYTES), each in its own file under data/db/run-evidence/. An
 *  event marks its run dirty and the dirty runs are written together a moment
 *  later; a status that must be durable (a receipt, a close, an interrupted
 *  run) is flushed before its call returns. The old single file is moved in
 *  once and set aside. The interface is the store's old one — find, findOne,
 *  create, updateOne, deleteOne — so every caller and guard keeps working.
 */
export class RunEvidenceShelf {
    private readonly dir: string;
    private readonly records = new Map<string, RunEvidenceRecord>();
    private readonly dirty = new Set<string>();
    private readonly removed = new Set<string>();
    private loading: Promise<void> | null = null;
    private timer: NodeJS.Timeout | null = null;
    private writing: Promise<void> = Promise.resolve();

    constructor(dir?: string) {
        this.dir = dir || path.join(process.cwd(), 'data', 'db', 'run-evidence');
    }

    private fileOf(runId: string): string {
        return path.join(this.dir, `${encodeURIComponent(runId)}.json`);
    }

    private load(): Promise<void> {
        if (!this.loading) this.loading = (async () => {
            await fs.promises.mkdir(this.dir, { recursive: true });
            const legacy = path.join(path.dirname(this.dir), `${path.basename(this.dir)}.json`);
            if (fs.existsSync(legacy)) {
                try {
                    const items = JSON.parse(await fs.promises.readFile(legacy, 'utf-8'));
                    for (const item of Array.isArray(items) ? items : []) {
                        if (item && typeof item.runId === 'string' && item.runId) {
                            this.records.set(item.runId, item);
                            this.dirty.add(item.runId);
                        }
                    }
                } catch { /* an unreadable old store is set aside, not trusted */ }
                try { await fs.promises.rename(legacy, `${legacy}.migrated-${Date.now()}`); } catch { /* moved next time */ }
            }
            for (const name of await fs.promises.readdir(this.dir)) {
                if (!name.endsWith('.json')) continue;
                try {
                    const record = JSON.parse(await fs.promises.readFile(path.join(this.dir, name), 'utf-8'));
                    if (record && typeof record.runId === 'string' && record.runId && !this.records.has(record.runId)) {
                        this.records.set(record.runId, record);
                    }
                } catch {
                    try { await fs.promises.rename(path.join(this.dir, name), path.join(this.dir, `${name}.unreadable`)); } catch { /* left as is */ }
                }
            }
            if (this.dirty.size) this.schedule(0);
        })();
        return this.loading;
    }

    private static matches(record: RunEvidenceRecord, query: Record<string, unknown>): boolean {
        return Object.entries(query || {}).every(([key, value]) => (record as any)[key] === value);
    }

    async find(query: Record<string, unknown> = {}): Promise<RunEvidenceRecord[]> {
        await this.load();
        return Array.from(this.records.values()).filter(record => RunEvidenceShelf.matches(record, query));
    }

    async findOne(query: Record<string, unknown>): Promise<RunEvidenceRecord | null> {
        await this.load();
        if (typeof query?.runId === 'string') {
            const record = this.records.get(query.runId);
            return record && RunEvidenceShelf.matches(record, query) ? record : null;
        }
        return (await this.find(query))[0] || null;
    }

    async create(item: RunEvidenceRecord): Promise<RunEvidenceRecord> {
        await this.load();
        this.records.set(item.runId, item);
        this.touch(item.runId);
        return item;
    }

    async updateOne(query: Record<string, unknown>, item: Partial<RunEvidenceRecord>): Promise<void> {
        const current = await this.findOne(query);
        if (!current) return;
        const next = { ...current, ...item } as RunEvidenceRecord;
        this.records.set(current.runId, next);
        this.touch(current.runId);
    }

    async deleteOne(query: Record<string, unknown>): Promise<void> {
        const current = await this.findOne(query);
        if (!current) return;
        this.records.delete(current.runId);
        this.dirty.delete(current.runId);
        this.removed.add(current.runId);
        this.schedule(400);
    }

    /** Write every dirty run now; resolves once they are on disk. */
    async flush(): Promise<void> {
        await this.load();
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        const write = async () => {
            const dirty = Array.from(this.dirty);
            const removed = Array.from(this.removed);
            this.dirty.clear();
            this.removed.clear();
            for (const runId of dirty) {
                const record = this.records.get(runId);
                if (!record) continue;
                const file = this.fileOf(runId);
                const temp = `${file}.${process.pid}.tmp`;
                try {
                    await fs.promises.writeFile(temp, JSON.stringify(record));
                    await fs.promises.rename(temp, file);
                } catch {
                    this.dirty.add(runId);
                    try { await fs.promises.unlink(temp); } catch { /* already gone */ }
                }
            }
            for (const runId of removed) {
                try { await fs.promises.unlink(this.fileOf(runId)); } catch { /* already gone */ }
            }
        };
        this.writing = this.writing.catch(() => undefined).then(write);
        return this.writing;
    }

    private touch(runId: string): void {
        this.removed.delete(runId);
        this.dirty.add(runId);
        this.schedule(400);
    }

    private schedule(delayMs: number): void {
        if (this.timer) return;
        this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, delayMs);
        this.timer.unref?.();
    }
}

export const runEvidenceStore = new RunEvidenceShelf();

const runQueues = new Map<string, Promise<void>>();

function trimString(value: unknown, max: number): string {
    return String(value ?? '').slice(0, max);
}

/**
 *  ⛔ A DEPTH CAP REMOVES EXACTLY THE MOST SPECIFIC EVIDENCE THERE IS.
 *
 *  Measured while diagnosing a real refusal. The stored envelope of a phase
 *  kept the phase name, its description, its deliverables, its estimated
 *  time, the project name, three ids and the full requirements text — and
 *  showed the two fields that could explain the failure as:
 *
 *      phase.tasks:               [truncated evidence value]
 *      phase.requirementsCovered: [truncated evidence value]
 *
 *  The nesting is `data → phase → tasks → each task`, which is depth 4
 *  exactly. Shallow metadata always survives a depth cap; the payload never
 *  does. Two hours went into a defect whose evidence had been collected,
 *  stored, and stripped of its decisive half before anyone read it.
 *
 *  ⛔ AND RAISING THE CAP ALONE WOULD HAVE MADE IT WORSE. `MAX_EVENT_BYTES`
 *  is the real limit, and exceeding it replaces the WHOLE payload with
 *  `[event payload truncated]`. A deeper capture that overshoots loses
 *  everything, not the deep part.
 *
 *  So the depth is no longer a fixed cliff: the event is captured as deeply
 *  as the byte budget allows, stepping down until it fits. The last step is
 *  4, which is exactly today's behaviour — so nothing can come out worse
 *  than it does now, and small events keep everything.
 */
function compactValue(value: unknown, depth = 0, cap = 4): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.slice(0, 16_000);
    if (typeof value !== 'object') return value;
    if (depth >= cap) return '[truncated evidence value]';
    if (Array.isArray(value)) return value.slice(0, 96).map(item => compactValue(item, depth + 1, cap));
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 96)) {
        result[trimString(key, 160)] = compactValue(item, depth + 1, cap);
    }
    return result;
}

/** Deepest first; 4 is today's behaviour and the floor. */
export const EVIDENCE_DEPTHS = [10, 7, 5, 4] as const;

/** Events already compacted, and their encoded size: an append never re-encodes the whole record. */
const compacted = new WeakMap<object, number>();

function compactEvent(event: RunEvidenceEvent): RunEvidenceEvent {
    if (event && typeof event === 'object' && compacted.has(event)) return event;
    const out = compactEventOnce(event);
    compacted.set(out, Buffer.byteLength(JSON.stringify(out), 'utf8'));
    return out;
}

function compactEventOnce(event: RunEvidenceEvent): RunEvidenceEvent {
    const shape = {
        type: trimString(event?.type, 120),
        runId: trimString(event?.runId, 180) || undefined,
        sessionId: trimString(event?.sessionId, 180) || undefined,
        id: trimString(event?.id, 240) || undefined,
        seq: event?.seq,
        ts: event?.ts,
        data: event?.data,
    };
    //  As deep as the byte budget allows. See the note on compactValue.
    let candidate = compactValue(shape, 0, EVIDENCE_DEPTHS[EVIDENCE_DEPTHS.length - 1]) as RunEvidenceEvent;
    for (const cap of EVIDENCE_DEPTHS) {
        const attempt = compactValue(shape, 0, cap) as RunEvidenceEvent;
        if (Buffer.byteLength(JSON.stringify(attempt), 'utf8') <= MAX_EVENT_BYTES) { candidate = attempt; break; }
    }
    let encoded = JSON.stringify(candidate);
    if (Buffer.byteLength(encoded, 'utf8') <= MAX_EVENT_BYTES) return candidate;
    const fallback: RunEvidenceEvent = {
        type: candidate.type,
        runId: candidate.runId,
        sessionId: candidate.sessionId,
        id: candidate.id,
        seq: candidate.seq,
        ts: candidate.ts,
        data: '[event payload truncated]',
    };
    encoded = JSON.stringify(fallback);
    if (Buffer.byteLength(encoded, 'utf8') <= MAX_EVENT_BYTES) return fallback;
    return {
        type: trimString(candidate.type, 120),
        runId: trimString(candidate.runId, 180) || undefined,
        sessionId: trimString(candidate.sessionId, 180) || undefined,
        data: '[event payload omitted]',
    };
}

/**
 *  The compaction, exposed so a guard can read what a stored event really
 *  keeps. It is the same function the store uses — a test that re-implemented
 *  it would be testing its own copy.
 */
export function compactEventForTest(event: RunEvidenceEvent): RunEvidenceEvent {
    return compactEvent(event);
}

function boundRecord(record: RunEvidenceRecord): RunEvidenceRecord {
    const next: RunEvidenceRecord = {
        ...record,
        runId: trimString(record.runId, 180),
        sessionId: trimString(record.sessionId, 180) || undefined,
        startedAt: trimString(record.startedAt, 64),
        updatedAt: trimString(record.updatedAt, 64),
        status: trimString(record.status, 120) || undefined,
        events: (() => {
            const events = (Array.isArray(record.events) ? record.events : []).map(compactEvent);
            if (events.length <= MAX_EVENTS_PER_RUN) return events;
            const tailCount = MAX_EVENTS_PER_RUN - HEAD_EVENTS_PER_RUN;
            return [...events.slice(0, HEAD_EVENTS_PER_RUN), ...events.slice(-tailCount)];
        })(),
        receipt: record.receipt ? compactValue(record.receipt) as RunReceiptPayload : undefined,
    };
    //  The size from the events' own encoded sizes; the whole record is
    //  encoded only when that estimate reaches the bound.
    const head = Buffer.byteLength(JSON.stringify({ ...next, events: [] }), 'utf8');
    let estimate = head + next.events.reduce((sum, event) => sum + (compacted.get(event) ?? 0) + 1, 0);
    while (estimate > MAX_RECORD_BYTES * 0.9 && next.events.length > 0
        && Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_RECORD_BYTES) {
        const dropped = next.events.shift()!;
        estimate -= (compacted.get(dropped) ?? 0) + 1;
    }
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_RECORD_BYTES) {
        next.receipt = { status: next.status, selfFixReason: trimString(next.receipt?.selfFixReason, 2_000) };
    }
    return next;
}

function enqueue(runId: string, work: () => Promise<void>): Promise<void> {
    const key = trimString(runId, 180);
    const previous = runQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(work).finally(() => {
        if (runQueues.get(key) === next) runQueues.delete(key);
    });
    runQueues.set(key, next);
    return next;
}

async function rotateOldRuns(): Promise<void> {
    const records = await runEvidenceStore.find();
    if (records.length <= MAX_RUN_RECORDS) return;
    const oldest = records
        .slice()
        .sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')))
        .slice(0, records.length - MAX_RUN_RECORDS);
    for (const record of oldest) {
        await runEvidenceStore.deleteOne({ runId: record.runId });
    }
}

async function upsertRecord(next: RunEvidenceRecord): Promise<void> {
    const bounded = boundRecord(next);
    const existing = await runEvidenceStore.findOne({ runId: bounded.runId });
    if (existing) {
        await runEvidenceStore.updateOne({ runId: bounded.runId }, bounded);
    } else {
        await runEvidenceStore.create({ ...bounded, id: bounded.runId });
    }
    await rotateOldRuns();
}

export function createRunEvidence(runId: string, fields: { sessionId?: string; status?: string } = {}): Promise<void> {
    const normalized = trimString(runId, 180);
    if (!normalized) return Promise.resolve();
    return enqueue(normalized, async () => {
        try {
            const now = new Date().toISOString();
            const existing = await runEvidenceStore.findOne({ runId: normalized });
            await upsertRecord({
                ...(existing || {}),
                id: existing?.id || normalized,
                runId: normalized,
                sessionId: fields.sessionId || existing?.sessionId,
                startedAt: existing?.startedAt || now,
                updatedAt: now,
                status: fields.status || existing?.status || 'running',
                events: existing?.events || [],
                receipt: existing?.receipt,
            });
        } catch {
            // Evidence is a secondary sink. Never block the live run on disk failure.
        }
    });
}

export function appendRunEvidenceEvent(runId: string, event: {
    type: string;
    runId?: string;
    sessionId?: string;
    id?: string;
    seq?: number;
    ts?: number;
    data?: unknown;
}): Promise<void> {
    const normalized = trimString(runId, 180);
    if (!normalized) return Promise.resolve();
    return enqueue(normalized, async () => {
        try {
            const now = new Date().toISOString();
            const existing = await runEvidenceStore.findOne({ runId: normalized });
            await upsertRecord({
                ...(existing || {}),
                id: existing?.id || normalized,
                runId: normalized,
                sessionId: existing?.sessionId || trimString(event?.sessionId, 180) || undefined,
                startedAt: existing?.startedAt || now,
                updatedAt: now,
                status: existing?.status || 'running',
                events: [...(existing?.events || []), compactEvent({ ...event, runId: normalized })],
                receipt: existing?.receipt,
            });
        } catch {
            // A failing evidence write must not interrupt broadcast or execution.
        }
    });
}

export function saveRunReceipt(runId: string, receipt: RunReceiptPayload, status = 'done'): Promise<void> {
    const normalized = trimString(runId, 180);
    if (!normalized) return Promise.resolve();
    return enqueue(normalized, async () => {
        try {
            const now = new Date().toISOString();
            const existing = await runEvidenceStore.findOne({ runId: normalized });
            await upsertRecord({
                ...(existing || {}),
                id: existing?.id || normalized,
                runId: normalized,
                sessionId: existing?.sessionId,
                startedAt: existing?.startedAt || now,
                updatedAt: now,
                status,
                events: [...(existing?.events || []), compactEvent({ type: 'phase_receipt', runId: normalized, ts: Date.now(), data: receipt })],
                receipt,
            });
            await runEvidenceStore.flush();
        } catch {
            // A failing receipt write is observable only as missing evidence; the run remains honest.
        }
    });
}

/**
 *  Every run a session produced, oldest first.
 *
 *  A run is addressable by its own id already. Nothing could ask the
 *  opposite question — «what did THIS SESSION do» — which is the only
 *  question a user asks when he reopens a session from the row at the
 *  bottom of the screen.
 */
export async function getRunEvidenceForSession(sessionId: string): Promise<RunEvidenceRecord[]> {
    const id = String(sessionId || '').trim();
    if (!id) return [];
    const rows = await runEvidenceStore.find({ sessionId: id }).catch(() => [] as RunEvidenceRecord[]);
    return rows.slice().sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
}

export async function getRunEvidence(runId: string): Promise<RunEvidenceRecord | null> {
    const normalized = trimString(runId, 180);
    if (!normalized) return null;
    try {
        await (runQueues.get(normalized) || Promise.resolve());
        return await runEvidenceStore.findOne({ runId: normalized });
    } catch {
        return null;
    }
}

/**
 * A RUN WHOSE EXECUTION RETURNED IS NEVER LEFT «RUNNING».
 *
 * The 500-prompt exam, 2026-11-03, P454: the run asked a question and ended in
 * 54 ms, announcing its end under another id; its own record kept `running`,
 * and the client waiting on it polled for eight hours. A run cancelled before
 * its first step, or refused by the resource manager, ended the same way — a
 * message and no receipt. So the owner of a run closes its record once the
 * execution has returned: a record that already carries its receipt is left
 * as it is; one still `running` gets this status and the reason.
 */
export function closeRunEvidenceIfOpen(runId: string, status: string, reason: string): Promise<void> {
    const normalized = trimString(runId, 180);
    if (!normalized) return Promise.resolve();
    return enqueue(normalized, async () => {
        try {
            const current = await runEvidenceStore.findOne({ runId: normalized });
            if (!current || current.status !== 'running') return;
            await upsertRecord({
                ...current,
                updatedAt: new Date().toISOString(),
                status,
                events: [...(current.events || []), compactEvent({
                    type: 'run_closed', runId: normalized, sessionId: current.sessionId, ts: Date.now(),
                    data: { status, reason: trimString(reason, 400) },
                })],
            });
            await runEvidenceStore.flush();
        } catch {
            // Evidence is a secondary sink: a failed close must not fail the run.
        }
    });
}

/**
 * A process restart cannot preserve an in-memory executor. Any durable record
 * that still says `running` when this API boots is therefore an orphan, not an
 * active run. Close it explicitly so clients never mistake stale evidence for
 * live work and so the conversation can explain how to continue.
 */
export async function reconcileInterruptedRunEvidence(): Promise<string[]> {
    const interrupted: string[] = [];
    let records: RunEvidenceRecord[] = [];
    try {
        records = await runEvidenceStore.find({ status: 'running' });
    } catch {
        return interrupted;
    }

    for (const record of records) {
        const runId = trimString(record?.runId, 180);
        if (!runId) continue;
        await enqueue(runId, async () => {
            try {
                const current = await runEvidenceStore.findOne({ runId });
                if (!current || current.status !== 'running') return;
                const now = new Date().toISOString();
                await upsertRecord({
                    ...current,
                    updatedAt: now,
                    status: 'interrupted',
                    events: [
                        ...(current.events || []),
                        compactEvent({
                            type: 'run_interrupted',
                            runId,
                            sessionId: current.sessionId,
                            ts: Date.now(),
                            data: { reason: 'api_restart' },
                        }),
                    ],
                });
                await runEvidenceStore.flush();
                interrupted.push(runId);
            } catch {
                // Recovery evidence is best-effort; startup must remain available.
            }
        });
    }
    return interrupted;
}
