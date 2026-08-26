/**
 * PAGE DURABILITY — «عدّل …» still works after the restart.
 *
 * global.joePages is the memory that makes a follow-up message an EDIT of the
 * page Joe just built: the planner's `hasActivePage` reads it to route «عدل
 * الألوان» to the builder, and the builder's `prev` reads it to edit the
 * existing page (same palette, same layout) instead of regenerating from
 * scratch. It lived in RAM only — and the user runs update-joe.ps1
 * constantly. Every restart silently erased it, so the FIRST edit request
 * after any update found no active page: the planner handed «عدل على كذا» to
 * the generic DAG (a browser/search circus about nothing) or the builder
 * re-rolled a brand-new page with different colours. Both read as «جو لا
 * يفهم». Same disk pattern as chat-store: load at boot, debounced write
 * after every mutation, bounded, best-effort.
 */
import fs from 'fs';
import path from 'path';

/** Newest sessions only — a page entry carries the full HTML, so keep few. */
const MAX_PERSISTED_PAGES = 12;
const DEBOUNCE_MS = 800;

function storeDir(): string {
    return String(process.env.JOE_CHAT_STORE_DIR || '').trim()
        || path.join(process.cwd(), 'data', 'db');
}
const pagesFile = () => path.join(storeDir(), 'joe-pages.json');

/** Trim to the newest N entries by their recorded update time. */
function bounded(store: Record<string, any>): Record<string, any> {
    const entries = Object.entries(store || {});
    if (entries.length <= MAX_PERSISTED_PAGES) return store;
    entries.sort((a, b) => (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0));
    return Object.fromEntries(entries.slice(0, MAX_PERSISTED_PAGES));
}

/**
 * Restore the page store — only where the global is still empty, so a live
 * process never has its state clobbered by a late load.
 */
export function loadJoePages(): void {
    try {
        const g: any = global as any;
        if (g.joePages && Object.keys(g.joePages).length > 0) return;
        if (!fs.existsSync(pagesFile())) return;
        const v = JSON.parse(fs.readFileSync(pagesFile(), 'utf-8'));
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            g.joePages = bounded(v);
            const n = Object.keys(g.joePages).length;
            if (n) console.info(`[PageStore] 💾 restored ${n} built page(s) from disk — «عدّل …» works across restarts.`);
        }
    } catch (e: any) {
        console.warn(`[PageStore] could not restore built pages (${String(e?.message || e).slice(0, 120)}) — starting fresh.`);
    }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced write. Call after ANY mutation of global.joePages. */
export function persistJoePages(): void {
    if (timer) return;
    timer = setTimeout(() => {
        timer = null;
        try {
            const g: any = global as any;
            fs.mkdirSync(storeDir(), { recursive: true });
            fs.writeFileSync(pagesFile(), JSON.stringify(bounded(g.joePages || {}), null, 0), 'utf-8');
        } catch (e: any) {
            console.warn(`[PageStore] persist failed (${String(e?.message || e).slice(0, 120)}) — pages continue in memory.`);
        }
    }, DEBOUNCE_MS);
    (timer as any).unref?.();
}

/* ---------- the PROJECT store — Stage 3 (surgical edits) -------------------
 * joeProjects remembers the last scaffolded PROJECT per session (a React app
 * is a directory of files, not one html), so «عدل …» after a scaffold routes
 * to the surgical project editor instead of the page builder. Same disk
 * pattern, same file directory, own file. */

const projectsFile = () => path.join(storeDir(), 'joe-projects.json');
const MAX_PERSISTED_PROJECTS = 20;

type ProjectStoreReadStatus = 'unknown' | 'missing' | 'empty' | 'loaded' | 'failed';

export interface ProjectStoreLoadResult {
    status: 'missing' | 'empty' | 'loaded' | 'failed' | 'already-loaded';
    projects: Record<string, any>;
    reason?: string;
}

export interface ProjectStoreWriteResult {
    status: 'saved' | 'queued' | 'blocked' | 'failed';
    reason?: string;
}

let projectReadState: { file: string; status: ProjectStoreReadStatus } = { file: '', status: 'unknown' };

function projectStateFor(file: string): ProjectStoreReadStatus {
    return projectReadState.file === file ? projectReadState.status : 'unknown';
}

function setProjectReadState(file: string, status: ProjectStoreReadStatus): void {
    projectReadState = { file, status };
}

function projectWriteDecision(file: string): { allowed: boolean; reason?: string } {
    const state = projectStateFor(file);
    if (state === 'failed') return { allowed: false, reason: 'persisted project read failed; refusing to overwrite the unreadable file' };
    if (state === 'missing' || state === 'empty' || state === 'loaded') return { allowed: true };
    if (!fs.existsSync(file)) return { allowed: true };
    return { allowed: false, reason: 'persisted project file exists but has not been read successfully' };
}

function projectFailure(reason: unknown): ProjectStoreLoadResult {
    const message = String((reason as any)?.message || reason).slice(0, 160);
    return { status: 'failed', projects: {}, reason: message };
}

/** A project identity is explicit: a real pipeline id or null, never an absent field. */
export function normalizePipelineRunId(value: unknown): string | null {
    const id = String(value ?? '').trim();
    return id || null;
}

/** A null/legacy entry is never a same-pipeline handoff. */
export function samePipelineRun(current: unknown, previous: unknown): boolean {
    const currentId = normalizePipelineRunId(current);
    const previousId = normalizePipelineRunId(previous);
    return currentId !== null && currentId === previousId;
}

/**
 * Read a session project without allowing a pipeline run to adopt stale state.
 * Calls without a run id are conversation/preview reads and intentionally keep
 * the legacy session-memory behavior; calls inside a run require an explicit
 * matching pipeline identity.
 */
export function readJoeProjectForRun(key: string, runId: unknown): Record<string, any> | null {
    const entry = (global as any).joeProjects?.[String(key)];
    if (!entry) return null;
    if (normalizePipelineRunId(runId) === null) return entry;
    return samePipelineRun(runId, entry.pipelineRunId) ? entry : null;
}

/** The only boundary allowed to write an item into global.joeProjects. */
export function writeJoeProject(key: string, entry: Record<string, any>, pipelineRunId: unknown = null): Record<string, any> {
    const g: any = global as any;
    if (!g.joeProjects || typeof g.joeProjects !== 'object' || Array.isArray(g.joeProjects)) g.joeProjects = {};
    const normalized = {
        ...(entry || {}),
        pipelineRunId: normalizePipelineRunId(pipelineRunId),
    };
    g.joeProjects[String(key)] = normalized;
    return normalized;
}

/** Remove ephemeral credentials and normalize project identity at the process boundary. */
function persistedProjects(store: Record<string, any>): Record<string, any> {
    return Object.fromEntries(Object.entries(store || {}).map(([key, value]) => {
        const copy = { ...(value as any) };
        delete copy.runtimeAuth;
        delete copy.ownerEmail;
        delete copy.ownerPassword;
        copy.pipelineRunId = normalizePipelineRunId(copy.pipelineRunId);
        return [key, copy];
    }));
}

export function loadJoeProjects(): ProjectStoreLoadResult {
    const file = projectsFile();
    const g: any = global as any;
    if (g.joeProjects && Object.keys(g.joeProjects).length > 0) {
        const state = projectStateFor(file);
        return {
            status: state === 'failed' ? 'failed' : 'already-loaded',
            projects: g.joeProjects,
            ...(state === 'failed' ? { reason: 'persisted project read previously failed; memory was not reloaded' } : {}),
        };
    }
    if (!fs.existsSync(file)) {
        g.joeProjects = {};
        setProjectReadState(file, 'missing');
        return { status: 'missing', projects: g.joeProjects };
    }
    try {
        const v = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (!v || typeof v !== 'object' || Array.isArray(v)) {
            const failure = projectFailure('persisted project store is not a JSON object');
            setProjectReadState(file, 'failed');
            console.warn(`[PageStore] could not restore projects (${failure.reason}) — refusing writeback.`);
            return failure;
        }
        g.joeProjects = persistedProjects(v);
        const n = Object.keys(g.joeProjects).length;
        setProjectReadState(file, n ? 'loaded' : 'empty');
        if (n) console.info(`[PageStore] 💾 restored ${n} project(s) — surgical edits survive restarts.`);
        return { status: n ? 'loaded' : 'empty', projects: g.joeProjects };
    } catch (e: any) {
        const failure = projectFailure(e);
        setProjectReadState(file, 'failed');
        console.warn(`[PageStore] could not restore projects (${failure.reason}) — refusing writeback.`);
        return failure;
    }
}

let projTimer: ReturnType<typeof setTimeout> | null = null;
let projectWriteCompletion: ProjectStoreWriteResult | null = null;

function consumeProjectWriteCompletion(): ProjectStoreWriteResult | null {
    const completion = projectWriteCompletion;
    projectWriteCompletion = null;
    return completion;
}

export function persistJoeProjects(): ProjectStoreWriteResult {
    const file = projectsFile();
    const completion = consumeProjectWriteCompletion();
    if (completion?.status === 'blocked' || completion?.status === 'failed') return completion;
    const decision = projectWriteDecision(file);
    if (!decision.allowed) {
        console.warn(`[PageStore] refusing project write (${decision.reason}).`);
        return { status: 'blocked', reason: decision.reason };
    }
    if (projTimer) return { status: 'queued' };
    projTimer = setTimeout(() => {
        projTimer = null;
        const latestDecision = projectWriteDecision(file);
        if (!latestDecision.allowed) {
            const result: ProjectStoreWriteResult = { status: 'blocked', reason: latestDecision.reason };
            projectWriteCompletion = result;
            console.warn(`[PageStore] refusing project write (${latestDecision.reason}).`);
            return;
        }
        try {
            const g: any = global as any;
            const entries = Object.entries(g.joeProjects || {});
            entries.sort((a: any, b: any) => (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0));
            fs.mkdirSync(storeDir(), { recursive: true });
            fs.writeFileSync(file, JSON.stringify(persistedProjects(Object.fromEntries(entries.slice(0, MAX_PERSISTED_PROJECTS))), null, 0), 'utf-8');
            projectWriteCompletion = { status: 'saved' };
        } catch (e: any) {
            const reason = String(e?.message || e).slice(0, 160);
            projectWriteCompletion = { status: 'failed', reason };
            console.warn(`[PageStore] persist failed (${reason}) — projects continue in memory.`);
        }
    }, DEBOUNCE_MS);
    (projTimer as any).unref?.();
    return { status: 'queued' };
}

export function flushJoeProjects(): ProjectStoreWriteResult {
    if (projTimer) { clearTimeout(projTimer); projTimer = null; }
    const completion = consumeProjectWriteCompletion();
    if (completion?.status === 'blocked' || completion?.status === 'failed') return completion;
    const file = projectsFile();
    const decision = projectWriteDecision(file);
    if (!decision.allowed) {
        console.warn(`[PageStore] refusing project write (${decision.reason}).`);
        return { status: 'blocked', reason: decision.reason };
    }
    try {
        const g: any = global as any;
        fs.mkdirSync(storeDir(), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(persistedProjects(g.joeProjects || {}), null, 0), 'utf-8');
        return { status: 'saved' };
    } catch (e: any) {
        const reason = String(e?.message || e).slice(0, 160);
        console.warn(`[PageStore] project flush failed (${reason}).`);
        return { status: 'failed', reason };
    }
}

/** Test/shutdown hook: write NOW, no debounce. */
export function flushJoePages(): void {
    if (timer) { clearTimeout(timer); timer = null; }
    try {
        const g: any = global as any;
        fs.mkdirSync(storeDir(), { recursive: true });
        fs.writeFileSync(pagesFile(), JSON.stringify(bounded(g.joePages || {}), null, 0), 'utf-8');
    } catch { /* best-effort */ }
}
