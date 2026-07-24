import { broadcast } from '../api/ws';

/**
 * Departments — a live "engineering company" status card for every task.
 *
 * Emits a `department_status` WS event at the REAL transition points of the
 * orchestration pipeline so the UI can show which department is working now:
 *
 *   Analyst (BA)  ->  Architect (Planner)  ->  Developer  ->  Reviewer (QA)  ->  Delivered
 *
 * This is not a fake animation: each stage is fired from the actual code path
 * (intent/plan, node execution, evaluate/recover, completion), so the card
 * reflects what Joe is genuinely doing.
 */

export type DepartmentKey = 'analyst' | 'architect' | 'developer' | 'reviewer' | 'delivered';

export interface DepartmentStage {
    key: DepartmentKey;
    label: string;    // English
    labelAr: string;  // Arabic
    icon: string;
}

export const DEPARTMENT_STAGES: DepartmentStage[] = [
    { key: 'analyst',   label: 'Analyst (BA)',      labelAr: 'المحلل',       icon: '🧭' },
    { key: 'architect', label: 'Architect',          labelAr: 'المهندس',      icon: '📐' },
    { key: 'developer', label: 'Developer',          labelAr: 'المطوّر',      icon: '💻' },
    { key: 'reviewer',  label: 'Reviewer (QA)',      labelAr: 'مراجع الجودة', icon: '🔎' },
    { key: 'delivered', label: 'Delivered',          labelAr: 'التسليم',      icon: '✅' },
];

const ORDER: DepartmentKey[] = DEPARTMENT_STAGES.map(s => s.key);

/**
 * Broadcast the current active department. `done` is derived from stage order so
 * the UI can show earlier stages as completed. Best-effort / never throws.
 */
export function emitDepartment(sessionId: string | undefined, active: DepartmentKey, note?: string): void {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    try {
        const activeIdx = ORDER.indexOf(active);
        const done = ORDER.slice(0, Math.max(0, activeIdx));
        broadcast({
            type: 'department_status',
            sessionId: sid,
            data: {
                sessionId: sid,
                stages: DEPARTMENT_STAGES,
                active,
                done,
                note: note || '',
                ts: Date.now(),
            },
        } as any);
    } catch { /* non-fatal */ }
}
