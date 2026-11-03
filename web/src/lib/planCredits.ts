/**
 * THE PLAN, ROLLING LIKE A FILM'S CREDITS — the logic, kept pure.
 *
 * «القائمة العائمة تغطي مربع الكتابة… أريدها داخل ردّ جو، مثل شارات الفيلم:
 * كل خطوة تقف حتى تنتهي ثم تصعد». The owner, 2026-11-02, looking at the
 * «Agent Tasks» box that floated over the composer.
 *
 * The plan now lives inside Joe's reply. A small window shows it: the step
 * being worked on holds a fixed line, the finished ones roll up above it and
 * fade, the next one waits below. When a step finishes, the list moves up by
 * one line. This file decides where the window stands; PlanCredits.tsx draws
 * it, and moves it with a CSS transition.
 */

export type PlanStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface PlanItem {
    id: string;
    text: string;
    status: PlanStatus;
}

const STATUSES: PlanStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];

/** The task list as the server sends it (todo_update: content/label/text), made one shape. */
export function normalizePlan(raw: unknown): PlanItem[] {
    const list = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.todos) ? (raw as any).todos : [];
    const out: PlanItem[] = [];
    list.forEach((item: any, i: number) => {
        const text = String(item?.content ?? item?.label ?? item?.text ?? '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        const status = STATUSES.includes(item?.status) ? item.status as PlanStatus : 'pending';
        out.push({ id: String(item?.id ?? `p${i}`), text, status });
    });
    return out;
}

export interface CreditsWindow {
    /** The step on the fixed line: the one in progress, else the first not started; `total` when all are done. */
    current: number;
    done: number;
    total: number;
    /** Rows scrolled out above the window. */
    offset: number;
    allDone: boolean;
}

/** How many finished steps stay visible above the current one. */
export const ROWS_ABOVE = 2;
/** Rows in the window: the finished ones above, the current one, the next one below. */
export const WINDOW_ROWS = ROWS_ABOVE + 2;

export function creditsWindow(plan: PlanItem[]): CreditsWindow {
    const total = plan.length;
    const done = plan.filter(p => p.status === 'completed' || p.status === 'cancelled').length;
    let current = plan.findIndex(p => p.status === 'in_progress');
    if (current < 0) current = plan.findIndex(p => p.status === 'pending');
    if (current < 0) current = total;
    const allDone = total > 0 && done === total;
    //  When everything is done the last steps stay in view, the newest at the bottom.
    const anchor = allDone ? total - 1 : current;
    const offset = Math.max(0, Math.min(anchor - ROWS_ABOVE, total - WINDOW_ROWS));
    return { current, done, total, offset: Math.max(0, offset), allDone };
}

/** How a row looks: by its distance from the fixed line. */
export function rowFade(index: number, win: CreditsWindow): number {
    if (win.allDone) return 1;
    const d = index - win.current;
    if (d === 0) return 1;
    if (d < 0) return d === -1 ? 0.6 : 0.32;
    return d === 1 ? 0.5 : 0;
}
