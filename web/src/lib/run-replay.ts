/**
 * THE LIVE CARD, REBUILT FROM THE RUN'S OWN RECORD.
 *
 * 2026-11-05, the UI/UX check of Joe's own page: a reload while Joe built the
 * clinic showed «Joe is working · Understand» and nothing else — no step, no
 * current action — forty-eight steps into the Build stage. The card was fed
 * only by socket frames held in the page's memory; a reload emptied that, and
 * the server never replays. Yet the server had every frame: the run's receipt
 * (GET /runs/:id/receipt) keeps the thinking_phase, thinking_detail,
 * todo_update and terminal_output events the page would have seen.
 *
 * This replays them through the same rules the live socket handler applies
 * (services/socket.ts), so a page opened mid-run shows the card, the plan and
 * the terminal it would have shown had it stayed open. State only: nothing here
 * dispatches a chat event or touches another session.
 */
import type { TraceStep } from './neuralTrace';

type Phase = 'analyzing' | 'synthesizing' | 'executing' | 'idle';
const PHASES = new Set<Phase>(['analyzing', 'synthesizing', 'executing', 'idle']);

export interface ReplayedRun {
    phase: Phase;
    status: string;
    steps: TraceStep[];
    tasks: any[];
    terminal: string;
    startedAt: number;
}

export interface RecordedEvent {
    type?: string;
    ts?: number;
    data?: any;
}

/** The task list exactly as the live handler maps a todo_update. */
export function tasksOf(raw: any): any[] {
    const list = Array.isArray(raw) ? raw : (raw?.todos || []);
    return list.map((t: any) => ({ ...t, label: t.label || t.content || t.text }));
}

export function replayRunState(events: RecordedEvent[]): ReplayedRun {
    let phase: Phase = 'idle';
    let status = '';
    let quiet = false;
    let tasks: any[] = [];
    let terminal = '';
    let startedAt = 0;
    const steps: TraceStep[] = [];
    const push = (text: unknown, kind: 'status' | 'detail', at: number) => {
        const clean = String(text || '').trim();
        if (!clean) return;
        if (steps.length && steps[steps.length - 1].text === clean) return;
        steps.push({ text: clean, at, phase, kind });
    };
    for (const e of events || []) {
        const type = String(e?.type || '');
        const at = Number(e?.ts) || 0;
        if (at && (!startedAt || at < startedAt)) startedAt = at;
        const data = e?.data;
        if (type === 'terminal_output' && typeof data === 'string') terminal += data;
        if (type === 'thinking_phase') {
            const p = data?.phase;
            if (PHASES.has(p)) {
                phase = p;
                if (data?.detail !== undefined) {
                    status = String(data.detail || '');
                    if (status) push(status, 'status', at);
                }
            }
        } else if (type === 'thinking_detail') {
            if (typeof data?.detail === 'string') push(data.detail, 'detail', at);
        } else if (type === 'thought') {
            push(typeof data === 'string' ? data : JSON.stringify(data), 'detail', at);
        } else if (type === 'todo_update') {
            tasks = tasksOf(data);
        }
        // The automatic phase transitions of the live handler, in the same order.
        if (type === 'step_started' || type === 'user_input') {
            if (!quiet) { quiet = true; phase = 'analyzing'; }
        } else if (type === 'step_done' || type === 'step_failed') {
            if (quiet) phase = 'synthesizing';
        } else if (type === 'tool_started') {
            if (quiet) phase = 'executing';
        }
    }
    // A run that is still going is never «idle» on screen.
    if (phase === 'idle' && steps.length) phase = 'executing';
    return { phase, status, steps, tasks, terminal, startedAt };
}
