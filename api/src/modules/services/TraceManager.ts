import { randomUUID } from 'crypto';
import { compactRuntimeValue } from '../../core/orchestrator/ExecutionMemory';

const MAX_TRACES = 64;
const MAX_EVENTS_PER_TRACE = 256;
const TRACE_TTL_MS = 30 * 60 * 1000;
const MAX_GOAL_CHARS = 8_000;

export type TraceEventKind = 'orchestrator' | 'tool' | 'execution' | 'planning';

export interface TraceEvent {
    kind: TraceEventKind;
    timestamp: number;
    traceId: string;
    sessionId?: string;
    data: any;
}

export interface Trace {
    traceId: string;
    sessionId: string;
    goal: string;
    startTime: number;
    endTime?: number;
    timeline: TraceEvent[];
}

export class TraceManager {
    private static instance: TraceManager;
    private traces: Map<string, Trace> = new Map();

    private constructor() {}

    public static getInstance(): TraceManager {
        if (!TraceManager.instance) {
            TraceManager.instance = new TraceManager();
        }
        return TraceManager.instance;
    }

    public startTrace(sessionId: string, goal: string): string {
        this.pruneTraces();
        const traceId = `trace-${randomUUID()}`;
        this.traces.set(traceId, {
            traceId,
            sessionId: String(sessionId || '').slice(0, MAX_GOAL_CHARS),
            goal: String(goal || '').slice(0, MAX_GOAL_CHARS),
            startTime: Date.now(),
            timeline: []
        });
        this.pruneTraces();
        return traceId;
    }

    public logEvent(traceId: string, kind: TraceEventKind, data: any) {
        const trace = this.traces.get(traceId);
        if (trace) {
            trace.timeline.push({
                kind,
                traceId,
                sessionId: trace.sessionId,
                timestamp: Date.now(),
                // Trace is an audit summary, not a second copy of file contents,
                // shell output, or LLM payloads. Keep the evidence-bearing shape
                // while bounding nested strings, arrays, and objects.
                data: compactRuntimeValue(data),
            });
            if (trace.timeline.length > MAX_EVENTS_PER_TRACE) {
                trace.timeline.splice(0, trace.timeline.length - MAX_EVENTS_PER_TRACE);
            }
        }
    }

    public endTrace(traceId: string) {
        const trace = this.traces.get(traceId);
        if (trace) {
            trace.endTime = Date.now();
            this.pruneTraces();
        }
    }

    private pruneTraces() {
        const now = Date.now();
        for (const [id, trace] of this.traces) {
            if (trace.endTime && now - trace.endTime > TRACE_TTL_MS) {
                this.traces.delete(id);
            }
        }
        if (this.traces.size <= MAX_TRACES) return;

        // Prefer removing completed traces. Active traces are retained unless
        // the process is flooded beyond the hard cap, in which case the oldest
        // trace is evicted rather than allowing an unbounded global Map.
        const completed = [...this.traces.entries()]
            .filter(([, trace]) => !!trace.endTime)
            .sort((a, b) => (a[1].endTime || 0) - (b[1].endTime || 0));
        for (const [id] of completed) {
            if (this.traces.size <= MAX_TRACES) break;
            this.traces.delete(id);
        }
        if (this.traces.size <= MAX_TRACES) return;
        const oldest = [...this.traces.entries()]
            .sort((a, b) => a[1].startTime - b[1].startTime)[0];
        if (oldest) this.traces.delete(oldest[0]);
    }

    public getTrace(traceId: string): Trace | undefined {
        return this.traces.get(traceId);
    }
}

export const traceManager = TraceManager.getInstance();
