import { v4 as uuidv4 } from 'uuid';

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
        const traceId = `trace-${uuidv4()}`;
        this.traces.set(traceId, {
            traceId,
            sessionId,
            goal,
            startTime: Date.now(),
            timeline: []
        });
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
                data
            });
        }
    }

    public endTrace(traceId: string) {
        const trace = this.traces.get(traceId);
        if (trace) {
            trace.endTime = Date.now();
        }
    }

    public getTrace(traceId: string): Trace | undefined {
        return this.traces.get(traceId);
    }
}

export const traceManager = TraceManager.getInstance();
