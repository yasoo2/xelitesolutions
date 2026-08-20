import { JsonStore } from './lib/jsondb';

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

export const runEvidenceStore = new JsonStore<RunEvidenceRecord>('run-evidence');

const runQueues = new Map<string, Promise<void>>();

function trimString(value: unknown, max: number): string {
    return String(value ?? '').slice(0, max);
}

function compactValue(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.slice(0, 16_000);
    if (typeof value !== 'object') return value;
    if (depth >= 4) return '[truncated evidence value]';
    if (Array.isArray(value)) return value.slice(0, 96).map(item => compactValue(item, depth + 1));
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 96)) {
        result[trimString(key, 160)] = compactValue(item, depth + 1);
    }
    return result;
}

function compactEvent(event: RunEvidenceEvent): RunEvidenceEvent {
    const candidate = compactValue({
        type: trimString(event?.type, 120),
        runId: trimString(event?.runId, 180) || undefined,
        sessionId: trimString(event?.sessionId, 180) || undefined,
        id: trimString(event?.id, 240) || undefined,
        seq: event?.seq,
        ts: event?.ts,
        data: event?.data,
    }) as RunEvidenceEvent;
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
    while (Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_RECORD_BYTES && next.events.length > 0) {
        next.events.shift();
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
        } catch {
            // A failing receipt write is observable only as missing evidence; the run remains honest.
        }
    });
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
