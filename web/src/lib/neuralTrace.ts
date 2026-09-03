/**
 * THE NEURAL TRACE — what Joe did, kept after he finished doing it.
 *
 * «لمذا لا يحفظ التفاعل العصبي في الدردشة» — because it was never saved. The
 * indicator held its steps in component state (`useState<string[]>`), so the
 * moment a run ended and the component unmounted, every step Joe had shown was
 * gone. The chat kept the answer and threw away the work.
 *
 * This module is the memory. Steps arrive from the socket with the wall clock
 * attached; when the run ends the socket SEALS them into a NeuralTrace and
 * stores it under the session. The chat then re-attaches each sealed trace to
 * the assistant message it produced, so the receipt survives a reload.
 *
 * Matching is by TIME, not by id, and deliberately so: the live path mints
 * `msg-${Date.now()}` for a reply the server broadcast without one, while the
 * reload path reads the stored event's own id — the two never agree. What both
 * agree on is when the reply appeared, and a trace that ended two seconds
 * earlier is the trace that produced it.
 */

export type TracePhase = 'analyzing' | 'synthesizing' | 'executing' | 'idle';

/** The small, human-readable work model shown above the technical trace. */
export type WorkStage = 'understand' | 'plan' | 'build' | 'test' | 'repair' | 'verify';

export const WORK_STAGES: WorkStage[] = ['understand', 'plan', 'build', 'test', 'repair', 'verify'];

/**
 * Map observed trace text to a product-level stage. This is deliberately a
 * presentation rule, not an execution rule: the backend remains the source
 * of truth, while the user gets a stable vocabulary instead of tool names.
 */
export function workStageFor(phase: TracePhase, text = ''): WorkStage {
    const value = String(text).toLocaleLowerCase();
    if (/repair|fix|recover|retry|إصلاح|تصحيح|تعاف|إعادة المحاولة/u.test(value)) return 'repair';
    if (/verify|verified|acceptance|deliver|evidence|complete|تحقق|تسليم|دليل|مكتمل|نجح/u.test(value)) return 'verify';
    if (/qa|quality|test|browser|audit|check|فحص|جودة|اختبار|متصفح|تدقيق/u.test(value)) return 'test';
    if (/build|scaffold|write|create|install|project|file|بناء|إنشاء|تثبيت|مشروع|ملف/u.test(value)) return 'build';
    if (/plan|planning|discover|analys|phase|خطة|تخطيط|اكتشاف|تحليل|مرحلة/u.test(value)) return 'plan';
    if (phase === 'analyzing' || phase === 'idle') return 'understand';
    if (phase === 'synthesizing') return 'plan';
    return 'build';
}

/**
 * Give common internal progress lines a user-facing label. Unknown text is
 * retained after harmless prefix cleanup so evidence is never fabricated or
 * silently discarded.
 */
export function traceDisplayKey(text = ''): string | null {
    const value = String(text).trim();
    if (!value) return null;
    if (/^running:\s*terminal manager/i.test(value)) return 'neuralDetailTerminal';
    if (/^running:\s*project pipeline/i.test(value)) return 'neuralDetailOrchestration';
    if (/engineering discovery|\[pipeline\].*discovering/i.test(value)) return 'neuralDetailDiscovery';
    if (/^running:\s*phase executor/i.test(value)) return 'neuralDetailPhase';
    if (/^running:\s*(?:react project|project)/i.test(value) || /scaffolding|authoring/i.test(value)) return 'neuralDetailBuild';
    if (/npm\s+(?:install|run)|dependencies|packages installed/i.test(value)) return 'neuralDetailDependencies';
    if (/vite build|production build|build passed/i.test(value)) return 'neuralDetailBuildCheck';
    if (/browser[_\s-]+(?:summarize|summary|inspect|click|fill|test)|self-qa|browser qa|quality audit|browser.*test|فحص.*متصفح/i.test(value)) return 'neuralDetailBrowserAction';
    if (/improvement loop|terminal votes|no round produced|coverage|finding\(s\)/i.test(value)) return 'neuralDetailVerify';
    if (/putting the steps in order|plan(?:ning)? the work|organizing the request/i.test(value)) return 'neuralDetailOrchestration';
    if (/(?:import[_\s-]+project|repo(?:sitory)?[_\s-]+import|clone|cloning|github\.com|مستودع|استيراد)/i.test(value)) return 'neuralDetailWorkspace';
    if (/repairing|self-fix|repair|إصلاح|تصحيح/i.test(value)) return 'neuralDetailRepair';
    if (/verified|acceptance|evidence|delivery|تحقق|دليل|تسليم/i.test(value)) return 'neuralDetailVerify';
    if (/^running:\s*[a-z0-9_-]+/i.test(value)) return 'neuralDetailAction';
    return null;
}

/** Remove machine prefixes while preserving an otherwise unknown evidence line. */
export function cleanTraceText(text = ''): string {
    return String(text)
        .replace(/^\s*\[(?:pipeline|system|agent)\]\s*/i, '')
        .replace(/^\s*(?:running|جاري تنفيذ)\s*:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** One line Joe showed while working, with the moment it appeared. */
export interface TraceStep {
    /** The text exactly as it was shown. */
    text: string;
    /** Wall clock, ms — the durations are measured from these, never invented. */
    at: number;
    /** Which phase was active when it arrived. */
    phase: TracePhase;
    /**
     * `status` is the headline Joe replaces in place («جاري تنفيذ: react
     * project»); `detail` is a line from the reasoning stream. Both are real
     * events — keeping them apart lets the timeline group them honestly.
     */
    kind: 'status' | 'detail';
}

export interface NeuralTrace {
    id: string;
    sessionId: string;
    startedAt: number;
    endedAt: number;
    steps: TraceStep[];
}

const KEY_PREFIX = 'joe:trace:';
/** Per session. Enough to scroll back through a working day, small enough to store. */
const MAX_TRACES = 30;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** A reply can never belong to a trace that ended long before it. */
const MATCH_WINDOW_MS = 5 * 60 * 1000;
/** …nor to one that "ended" after it, beyond the slack between two clocks. */
const MATCH_SLACK_MS = 8 * 1000;

function storage(): Storage | null {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage;
    } catch {
        return null; // private mode, blocked storage — the feature degrades, nothing throws
    }
}

function keyFor(sessionId: string): string {
    return KEY_PREFIX + sessionId;
}

/** Every trace stored for a session, oldest first, with expired ones dropped. */
export function loadTraces(sessionId?: string): NeuralTrace[] {
    const s = storage();
    if (!s || !sessionId) return [];
    let raw: string | null = null;
    try { raw = s.getItem(keyFor(sessionId)); } catch { return []; }
    if (!raw) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return []; }
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return (parsed as NeuralTrace[])
        .filter(t => t && Array.isArray(t.steps) && Number(t.endedAt) > cutoff)
        .sort((a, b) => a.endedAt - b.endedAt);
}

/** Seal one run into the session's history. */
export function saveTrace(trace: NeuralTrace): void {
    const s = storage();
    if (!s || !trace?.sessionId || !trace.steps?.length) return;
    const all = [...loadTraces(trace.sessionId).filter(t => t.id !== trace.id), trace]
        .sort((a, b) => a.endedAt - b.endedAt)
        .slice(-MAX_TRACES);
    try {
        s.setItem(keyFor(trace.sessionId), JSON.stringify(all));
    } catch {
        // Quota. Keep the newest few rather than losing the lot.
        try { s.setItem(keyFor(trace.sessionId), JSON.stringify(all.slice(-5))); } catch { /* give up quietly */ }
    }
}

export function clearTraces(sessionId: string): void {
    const s = storage();
    if (!s || !sessionId) return;
    try { s.removeItem(keyFor(sessionId)); } catch { /* nothing to clear */ }
}

/**
 * Pair each assistant message with the run that produced it.
 *
 * Greedy and in order: an earlier reply claims the earliest trace that could
 * plausibly be its own, so a chat with five runs lines up five receipts instead
 * of hanging all of them on the last message. A trace is used at most once.
 */
export function attachTraces<T extends { id: string; role: string; timestamp?: Date | number }>(
    messages: T[],
    traces: NeuralTrace[]
): Map<string, NeuralTrace> {
    const out = new Map<string, NeuralTrace>();
    if (!messages?.length || !traces?.length) return out;
    const pool = [...traces].sort((a, b) => a.endedAt - b.endedAt);
    const claimed = new Set<string>();

    for (const msg of messages) {
        if (msg.role !== 'assistant') continue;
        const ts = msg.timestamp instanceof Date ? msg.timestamp.getTime() : Number(msg.timestamp || 0);
        if (!ts) continue;
        let best: NeuralTrace | null = null;
        let bestGap = Infinity;
        for (const t of pool) {
            if (claimed.has(t.id)) continue;
            const gap = ts - t.endedAt;
            if (gap < -MATCH_SLACK_MS) break;          // the rest end even later
            if (gap > MATCH_WINDOW_MS) continue;        // too old to be this reply's work
            if (ts < t.startedAt - MATCH_SLACK_MS) continue; // the reply predates the run
            const distance = Math.abs(gap);
            if (distance < bestGap) { best = t; bestGap = distance; }
        }
        if (best) { claimed.add(best.id); out.set(msg.id, best); }
    }
    return out;
}

/** Total wall time of a run. */
export function traceDuration(trace: NeuralTrace): number {
    return Math.max(0, trace.endedAt - trace.startedAt);
}

/** `4s` · `1:12` · `12:04` — never a fabricated number, always the measured one. */
export function formatDuration(ms: number, secondSuffix = 's'): string {
    const total = Math.max(0, Math.round(ms / 1000));
    if (total < 60) return `${total}${secondSuffix}`;
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** How long each step held the screen — the last one runs to the end of the run. */
export function stepDurations(trace: NeuralTrace): number[] {
    return trace.steps.map((step, i) => {
        const next = i + 1 < trace.steps.length ? trace.steps[i + 1].at : trace.endedAt;
        return Math.max(0, next - step.at);
    });
}

export interface PhaseGroup {
    phase: TracePhase;
    steps: TraceStep[];
    /** Index of each step in the original trace, so durations stay aligned. */
    indices: number[];
    startedAt: number;
    endedAt: number;
}

/** Consecutive steps of the same phase, in order — the timeline's rows. */
export function groupByPhase(trace: NeuralTrace): PhaseGroup[] {
    const groups: PhaseGroup[] = [];
    trace.steps.forEach((step, i) => {
        const tail = groups[groups.length - 1];
        if (tail && tail.phase === step.phase) {
            tail.steps.push(step);
            tail.indices.push(i);
            tail.endedAt = step.at;
            return;
        }
        groups.push({ phase: step.phase, steps: [step], indices: [i], startedAt: step.at, endedAt: step.at });
    });
    if (groups.length) groups[groups.length - 1].endedAt = trace.endedAt;
    for (let i = 0; i < groups.length - 1; i++) groups[i].endedAt = groups[i + 1].startedAt;
    return groups;
}

/** The trace as plain text, for the copy button. */
export function traceToText(trace: NeuralTrace, secondSuffix = 's'): string {
    const spans = stepDurations(trace);
    const head = `${new Date(trace.startedAt).toLocaleString()} · ${formatDuration(traceDuration(trace), secondSuffix)}`;
    const body = trace.steps.map((s, i) => `${i + 1}. [${s.phase}] ${s.text} (${formatDuration(spans[i], secondSuffix)})`);
    return [head, ...body].join('\n');
}
