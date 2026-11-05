/**
 * ONE JOE RUN, AS THE ENGINE SEES IT: ITS FOLDER AND ITS VOICE.
 *
 *  - The folder. A new project gets its own folder inside the workspace root
 *    Joe resolved for the request (AGENTS.md: workspaceService.getActiveRoot).
 *    A project Joe was asked to change keeps the folder it already has. The
 *    folder is registered the way the first engine registers its projects,
 *    so the preview, project_run and the next request can find it.
 *  - The voice. The engine's events become the live events the UI already
 *    shows: the plan becomes the todo list, and the model's words go to the
 *    neural trace. Tool calls need nothing here: every one runs through
 *    executeTool, which announces itself.
 */
import fs, { promises as fsp } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { projectRootProblem } from './workspace';
import { snapshotProject } from '../project/versions';
import type { ChangeContext, EngineEvent, PlanState, ProjectRun } from './types';

export async function projectFolderFor(activeRoot: string, runId: string, resumePath?: string): Promise<{ dir: string; resumed: boolean } | { error: string }> {
    if (resumePath) {
        const problem = projectRootProblem(resumePath, activeRoot);
        if (problem) return { error: problem };
        try {
            const st = await fsp.stat(resumePath);
            if (!st.isDirectory()) return { error: 'The project to change is not a folder.' };
        } catch { return { error: 'The project to change does not exist.' }; }
        return { dir: path.resolve(resumePath), resumed: true };
    }
    const tag = String(runId || '').replace(/[^A-Za-z0-9]/g, '').slice(-10) || randomBytes(4).toString('hex');
    const dir = path.join(activeRoot, `joe-app-${tag}`);
    await fsp.mkdir(dir, { recursive: true });
    return { dir, resumed: false };
}

/**
 * THE PROJECT'S OWN HISTORY: EVERY RUN'S REQUEST AND WHAT IT DELIVERED.
 *
 * A change run meets a full folder. Without this it knew only the new
 * sentence: not what the project is for, not what it already does. Each run
 * adds one line to `.joe/history.json` (the newest twenty are kept); a project
 * built before the history existed is read from its last result and the
 * request it was registered with.
 */
const HISTORY_FILE = path.join('.joe', 'history.json');
const HISTORY_LIMIT = 20;
const HISTORY_TEXT_LIMIT = 1_500;

const clipText = (s: unknown, n = HISTORY_TEXT_LIMIT) => String(s ?? '').trim().slice(0, n);

export function projectHistory(dir: string, registeredRequest = ''): ProjectRun[] {
    try {
        const kept = JSON.parse(fs.readFileSync(path.join(dir, HISTORY_FILE), 'utf8'));
        if (Array.isArray(kept) && kept.length) {
            return kept.filter(h => h && typeof h.request === 'string')
                .map(h => ({ request: clipText(h.request), status: clipText(h.status, 40), summary: clipText(h.summary) }));
        }
    } catch { /* no history yet */ }
    if (!clipText(registeredRequest)) return [];
    let last: any = {};
    try { last = JSON.parse(fs.readFileSync(path.join(dir, '.joe', 'result.json'), 'utf8')); } catch { /* none */ }
    return [{ request: clipText(registeredRequest), status: clipText(last.status || 'unknown', 40), summary: clipText(last.summary) }];
}

export function recordRunHistory(dir: string, run: ProjectRun): void {
    try {
        const file = path.join(dir, HISTORY_FILE);
        let kept: Array<ProjectRun & { at?: number }> = [];
        try { const read = JSON.parse(fs.readFileSync(file, 'utf8')); if (Array.isArray(read)) kept = read; } catch { /* first run */ }
        kept.push({ request: clipText(run.request), status: clipText(run.status, 40), summary: clipText(run.summary), at: Date.now() });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(kept.slice(-HISTORY_LIMIT), null, 2), 'utf8');
    } catch { /* the run is delivered either way; only the next change knows less */ }
}

/**
 * «تراجع» put back a version kept before some runs: they no longer describe
 * the project, so they are marked undone (2026-11-05: after the undo of «أضف
 * وضعاً ليلياً» the history still said it was delivered, and the next change
 * and its certificate would have listed it). A second «تراجع» restores the copy
 * the first one kept (`keptBeforeUndo`), and the runs it undid stand again.
 */
export function recordUndo(dir: string, restored: { id: string; at: number }, keptBeforeUndo?: string | null): void {
    try {
        const file = path.join(dir, HISTORY_FILE);
        const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(kept)) return;
        for (const run of kept) {
            if (!run || typeof run !== 'object') continue;
            if (run.undoneBy && run.undoneBy === restored.id) {
                run.status = run.undoneFrom || 'delivered';
                delete run.undoneBy;
                delete run.undoneFrom;
            } else if (run.status !== 'undone' && Number(run.at) >= restored.at) {
                run.undoneFrom = run.status;
                run.status = 'undone';
                if (keptBeforeUndo) run.undoneBy = keptBeforeUndo;
            }
        }
        fs.writeFileSync(file, JSON.stringify(kept, null, 2), 'utf8');
    } catch { /* no history: a page, or a project built before it */ }
}

/**
 * Before a change touches the project: keep it as it is (so «تراجع» puts it
 * back) and gather what the change run is told about it.
 */
export function changeContextFor(dir: string, request: string, registeredRequest = ''): ChangeContext {
    const history = projectHistory(dir, registeredRequest);
    const said = String(request || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    // «اعرض النسخ» lists the label in the request's own language.
    const kept = snapshotProject(dir, `${/[؀-ۿ]/u.test(said) ? 'قبل' : 'before'}: ${said}`);
    return { history, ...(kept ? { snapshot: kept.id } : {}) };
}

/** The request the chat's project was last registered with, read before this run registers its own. */
export function registeredRequestFor(sessionId: string | undefined): string {
    if (!sessionId) return '';
    try {
        const { readJoeProjectForRun } = require('../../api/page-store');
        const { previewKey } = require('../../modules/tools/preview-site');
        return String(readJoeProjectForRun(previewKey(sessionId), null)?.lastRequest || '');
    } catch { return ''; }
}

/** Register the folder where the preview and project_run look for this session's project. */
export function registerProjectFolder(sessionId: string | undefined, runId: string, dir: string, request: string): void {
    if (!sessionId) return;
    try {
        const { writeJoeProject, persistJoeProjects } = require('../../api/page-store');
        const { previewKey } = require('../../modules/tools/preview-site');
        writeJoeProject(previewKey(sessionId), { dir, type: 'agent', updatedAt: Date.now(), lastRequest: String(request || '').slice(0, 2000) }, runId);
        persistJoeProjects();
    } catch { /* the run still works; only the preview cannot find it */ }
}

function todosFor(plan: PlanState) {
    const step = (s: PlanState['steps'][number], i: number) => ({
        id: `step-${i + 1}`,
        content: s.title,
        status: s.status === 'done' ? 'completed' : s.status,
    });
    const req = (r: PlanState['requirements'][number]) => ({
        id: r.id,
        content: `${r.id}: ${r.text}`,
        status: r.status === 'done' ? 'completed' : r.status === 'blocked' ? 'cancelled' : 'pending',
    });
    return [...plan.steps.map(step), ...plan.requirements.map(req)];
}

/** At most this much of a tool's input or output rides on a live event; the full text is in .joe/. */
export const UI_TEXT_LIMIT = 4_000;

function clip(value: unknown): string {
    const s = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    return s.length > UI_TEXT_LIMIT ? `${s.slice(0, UI_TEXT_LIMIT)}… [${s.length - UI_TEXT_LIMIT} more characters in the run record]` : s;
}

/**
 * The engine's events as the UI's live events, addressed to the chat session.
 *
 *  - The plan becomes the todo list (TodosPanel).
 *  - Each tool call becomes a step_started and step_done/step_failed pair in
 *    the shape the session history already returns, so a reloaded session
 *    shows the same steps. `name` is `engine:<tool>`.
 *  - The model's words, the checks' verdicts and compaction go to the neural
 *    trace, and to an `engine_note` the activity panel shows. The Arabic UI
 *    hides narration that contains Latin letters, and the model writes in
 *    English.
 */
/** The few sentences the emitter writes itself, in each language Joe's interface offers. */
const NOTES: Record<string, { passed: string; failed: (ids: string) => string; folded: (n: number) => string }> = {
    ar: { passed: '✅ نجحت الفحوص', failed: ids => `❌ فشلت الفحوص: ${ids}`, folded: n => `… طُويت ${n} رسالة سابقة في ملخص` },
    en: { passed: '✅ checks passed', failed: ids => `❌ checks failed: ${ids}`, folded: n => `… folded ${n} earlier messages into a summary` },
    es: { passed: '✅ las comprobaciones pasaron', failed: ids => `❌ fallaron las comprobaciones: ${ids}`, folded: n => `… ${n} mensajes anteriores resumidos` },
    fr: { passed: '✅ vérifications réussies', failed: ids => `❌ vérifications échouées : ${ids}`, folded: n => `… ${n} messages précédents résumés` },
    de: { passed: '✅ Prüfungen bestanden', failed: ids => `❌ Prüfungen fehlgeschlagen: ${ids}`, folded: n => `… ${n} frühere Nachrichten zusammengefasst` },
    ru: { passed: '✅ проверки пройдены', failed: ids => `❌ проверки не пройдены: ${ids}`, folded: n => `… ${n} предыдущих сообщений свёрнуты в сводку` },
};

/**
 * `project` is the run's folder name inside the workspace: the run's card
 * offers it for download (GET /project/export?project=…), with the run's time
 * and cost beside its steps.
 */
export function uiEmitter(sessionId: string | undefined, runId: string, language = 'en', project = ''): (e: EngineEvent) => void {
    const words = NOTES[String(language || '').toLowerCase().split('-')[0]] || NOTES.en;
    if (!sessionId) return () => { /* nobody to tell */ };
    let ws: any;
    try { ws = require('../../api/ws'); } catch { return () => { /* no live wire */ }; }
    let seq = 0;
    const send = (type: string, data: Record<string, unknown>) =>
        ws.broadcast({ type, id: `engine-${runId}-${++seq}`, sessionId, runId, data: { ...data, sessionId, runId } });
    const note = (kind: string, text: string) => {
        try { ws.broadcastThinkingDetail(sessionId, text.slice(0, 600)); } catch { /* UI only */ }
        send('engine_note', { kind, text: clip(text) });
    };
    return (e: EngineEvent) => {
        try {
            switch (e.type) {
                case 'plan':
                    send('todo_update', { merge: false, todos: todosFor(e.plan), timestamp: new Date().toISOString() });
                    break;
                case 'step':
                    send('engine_step', { step: e.step });
                    break;
                case 'thought':
                    note('thought', e.text);
                    break;
                case 'tool_call':
                    send('step_started', { name: `engine:${e.name}`, callId: e.id, input: clip(e.args) });
                    break;
                case 'tool_result':
                    send(e.ok ? 'step_done' : 'step_failed', {
                        name: `engine:${e.name}`, callId: e.id, durationMs: e.durationMs,
                        result: { ok: e.ok, output: clip(e.output) },
                        ...(e.facts?.page?.screenshotPath ? { screenshotPath: e.facts.page.screenshotPath } : {}),
                        ...(e.facts?.filesChanged?.length ? { filesChanged: e.facts.filesChanged } : {}),
                        ...(e.facts?.served?.url ? { served: { name: e.facts.served.name, url: e.facts.served.url } } : {}),
                    });
                    break;
                case 'verification': {
                    const failed = e.report.checks.filter(c => c.status === 'failed').map(c => c.id);
                    note('verification', e.report.passed ? words.passed : words.failed(failed.join(', ') || '…'));
                    send('engine_verification', { passed: e.report.passed, checks: e.report.checks, unproven: e.report.unproven });
                    break;
                }
                case 'compacted':
                    note('compacted', words.folded(e.removedMessages));
                    break;
                case 'final':
                    send('engine_final', {
                        status: e.result.status, steps: e.result.steps, model: e.result.model, reason: e.result.reason ?? null,
                        ...(project ? { project } : {}),
                        ...(e.result.durationMs != null ? { durationMs: e.result.durationMs } : {}),
                        ...(e.result.costUsd != null ? { costUsd: e.result.costUsd } : {}),
                    });
                    break;
                default:
                    break;
            }
        } catch { /* the UI is optional; the run is not */ }
    };
}
