/**
 * WHAT THE AGENT ENGINE IS DOING, ONE STEP AT A TIME: the Activity panel's state.
 *
 * The engine drives a short list of general tools in a loop (read, write,
 * run, look, fix) and announces each part of it on the live socket. No
 * surface drew a tool call with its input and its result: the composer built
 * a step model and hid it, and the Arabic interface drops any narration that
 * contains a Latin letter, so the commands, the paths and the model's own
 * notes never reached the owner at all.
 *
 * This file folds those events into the one state the panel draws:
 *   - the plan: its steps, then the requirements R1..Rn read from the request;
 *   - every tool call, paired by its callId, with its input, result and time;
 *   - the model's notes, whatever script they are written in;
 *   - the final checks' verdict, and how the run ended;
 *   - the files changed, the latest screenshot, the addresses served.
 *
 * Pure on purpose: no React and no socket. api jest imports it the way it
 * imports neuralTrace.ts, and React may call a reducer twice in development
 * without the second call seeing a different world.
 *
 * Every list is bounded, and every bound is counted: what is left out is
 * said, never dropped in silence.
 */

export type PlanStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface PlanItem {
    id: string;
    content: string;
    status: PlanStatus;
}

export interface ActivityPlan {
    steps: PlanItem[];
    requirements: PlanItem[];
}

/** `written`: a file a build streamed to disk without saying whether it was new. */
export type FileChangeKind = 'created' | 'modified' | 'deleted' | 'written';

export interface StepFile {
    path: string;
    change: FileChangeKind;
    bytes?: number;
}

export interface ActivityFile extends StepFile {
    additions?: number;
    deletions?: number;
    at: number;
}

export interface ActivityStep {
    /** Unique in this state. Usually the callId; a provider that reuses an id across turns gets a suffix. */
    key: string;
    /** The model's id for the call, as the engine sent it. */
    callId: string;
    /** True once the event that opened the call was seen; a record read back may bring the result first. */
    started: boolean;
    /** True when no callId came with the call (the history's pairs): its result is paired by tool and order. */
    anonymous: boolean;
    /** The tool's own name, without the `engine:` or `execute:` prefix. */
    tool: string;
    /** `engine`: the agent engine. `pipeline`: Joe's first engine, as the session history returns it. */
    source: 'engine' | 'pipeline';
    /** What the tool was given, as text, bounded. */
    input: string;
    /** Undefined while the call is still running. */
    ok?: boolean;
    output?: string;
    durationMs?: number;
    startedAt: number;
    endedAt?: number;
    /** The file name of a screenshot the call saved in the run folder. */
    screenshotFile?: string;
    filesChanged?: StepFile[];
    served?: { name: string; url: string };
    /** The engine's own number for the event that opened the call: the order of calls in one millisecond. */
    seq: number;
}

export type NoteKind = 'thought' | 'verification' | 'compacted';

export interface ActivityNote {
    id: string;
    kind: NoteKind;
    text: string;
    at: number;
    seq: number;
}

export type CheckStatus = 'passed' | 'failed' | 'skipped';

export interface ActivityVerification {
    passed: boolean;
    checks: { id: string; status: CheckStatus; detail: string }[];
    unproven: { id: string; text: string; reason: string }[];
    at: number;
}

export type FinalStatus = 'delivered' | 'failed' | 'cancelled';

export interface ActivityFinal {
    status: FinalStatus;
    steps: number;
    model: string;
    reason: string | null;
    at: number;
    /** The run's project folder in the workspace, which the card offers for download. */
    project: string | null;
    /** The run's wall time and what its model calls cost, when known. */
    durationMs: number | null;
    costUsd: number | null;
}

/**
 * The latest screenshot of the run.
 *  - `capture`: stored for the session; the panel loads it by id, the way the chat's results do.
 *  - `href`: a same-origin image the server published (the browser tools' /artifacts files).
 *  - `file`: a path on the server's disk, which a browser cannot open; only its name is kept.
 */
export type ActivityScreenshot =
    | { kind: 'capture'; captureId: string; pageName?: string; at: number }
    | { kind: 'href'; href: string; pageUrl?: string; at: number }
    | { kind: 'file'; name: string; at: number };

export interface ActivityServed {
    name: string;
    url: string;
    kind: 'server' | 'preview';
    at: number;
}

export interface ActivityLimits {
    steps: number;
    notes: number;
    files: number;
    /**
     * Characters of an input or an output kept for one call. Above the
     * engine's own clip (4,000 plus the sentence saying how much more is in
     * the run record), so the engine's text arrives whole and only a larger
     * value read back from the history is cut here.
     */
    text: number;
}

export const ACTIVITY_LIMITS: ActivityLimits = { steps: 200, notes: 200, files: 500, text: 6_000 };

/** How many keys of events without an engine number are remembered for dedupe. */
const KEY_LIMIT = 2_048;

interface Seen {
    /** The engine numbers its events per run; the numbers seen, as merged [from, to] ranges. */
    ranges: [number, number][];
    /** The highest engine number seen. */
    top: number;
    /** Every other consumed event, by type and id, or by time when it has no id. */
    keys: string[];
}

export interface ActivityState {
    /** The run on screen. One run at a time: a new run starts a new state. */
    runId: string;
    /** The engine's step: one model turn, which may hold several tool calls. */
    step: number;
    plan: ActivityPlan;
    /** Oldest first, newest last. */
    steps: ActivityStep[];
    /** Calls removed from `steps` to keep it within its limit. */
    olderSteps: number;
    notes: ActivityNote[];
    olderNotes: number;
    /** The latest verdict of the final checks. */
    verification: ActivityVerification | null;
    /** How many times the checks gave a verdict in this run. */
    checkRounds: number;
    final: ActivityFinal | null;
    /** Newest first. */
    files: ActivityFile[];
    olderFiles: number;
    latestScreenshot: ActivityScreenshot | null;
    served: ActivityServed[];
    /** Events the engine numbered for this run that never reached this state. */
    missedEvents: number;
    limits: ActivityLimits;
    seen: Seen;
    /** Calls removed by the step bound: a late event for one is already counted, not a new call. */
    droppedCalls: string[];
    /** Paths removed by the file bound, so a path that changes again is not counted twice. */
    droppedPaths: string[];
    /** The latest event time seen: the time of an event that carries none. */
    clock: number;
}

export function emptyActivity(limits: Partial<ActivityLimits> = {}): ActivityState {
    const merged = { ...ACTIVITY_LIMITS };
    for (const key of Object.keys(merged) as (keyof ActivityLimits)[]) {
        const v = limits[key];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 1) merged[key] = Math.floor(v);
    }
    return {
        runId: '',
        step: 0,
        plan: { steps: [], requirements: [] },
        steps: [],
        olderSteps: 0,
        notes: [],
        olderNotes: 0,
        verification: null,
        checkRounds: 0,
        final: null,
        files: [],
        olderFiles: 0,
        latestScreenshot: null,
        served: [],
        missedEvents: 0,
        limits: merged,
        seen: { ranges: [], top: 0, keys: [] },
        droppedCalls: [],
        droppedPaths: [],
        clock: 0,
    };
}

/* ───────────────────────── tool names, for people ───────────────────────── */

type Lang = 'ar' | 'en' | 'fr' | 'de' | 'ru' | 'es';

const TOOL_LABELS: Record<string, Record<Lang, string>> = {
    shell_run: { ar: 'تشغيل أمر', en: 'Run a command', fr: 'Exécuter une commande', de: 'Befehl ausführen', ru: 'Запуск команды', es: 'Ejecutar un comando' },
    shell_start: { ar: 'تشغيل خادم', en: 'Start a server', fr: 'Démarrer un serveur', de: 'Server starten', ru: 'Запуск сервера', es: 'Iniciar un servidor' },
    shell_logs: { ar: 'سجل الخادم', en: 'Server log', fr: 'Journal du serveur', de: 'Serverprotokoll', ru: 'Журнал сервера', es: 'Registro del servidor' },
    shell_stop: { ar: 'إيقاف خادم', en: 'Stop a server', fr: 'Arrêter un serveur', de: 'Server stoppen', ru: 'Остановка сервера', es: 'Detener un servidor' },
    file_read: { ar: 'قراءة ملف', en: 'Read a file', fr: 'Lire un fichier', de: 'Datei lesen', ru: 'Чтение файла', es: 'Leer un archivo' },
    file_write: { ar: 'كتابة ملف', en: 'Write a file', fr: 'Écrire un fichier', de: 'Datei schreiben', ru: 'Запись файла', es: 'Escribir un archivo' },
    file_edit: { ar: 'تعديل ملف', en: 'Edit a file', fr: 'Modifier un fichier', de: 'Datei bearbeiten', ru: 'Правка файла', es: 'Editar un archivo' },
    file_list: { ar: 'استعراض الملفات', en: 'List the files', fr: 'Lister les fichiers', de: 'Dateien auflisten', ru: 'Список файлов', es: 'Listar los archivos' },
    file_search: { ar: 'بحث في الملفات', en: 'Search the files', fr: 'Chercher dans les fichiers', de: 'Dateien durchsuchen', ru: 'Поиск по файлам', es: 'Buscar en los archivos' },
    browser_open: { ar: 'فتح الصفحة', en: 'Open the page', fr: 'Ouvrir la page', de: 'Seite öffnen', ru: 'Открытие страницы', es: 'Abrir la página' },
    browser_act: { ar: 'تجربة في الصفحة', en: 'Try it in the page', fr: 'Essayer dans la page', de: 'Auf der Seite ausprobieren', ru: 'Проверка на странице', es: 'Probar en la página' },
    browser_screenshot: { ar: 'لقطة شاشة', en: 'Screenshot', fr: "Capture d'écran", de: 'Bildschirmfoto', ru: 'Снимок экрана', es: 'Captura de pantalla' },
    plan_update: { ar: 'تحديث الخطة', en: 'Update the plan', fr: 'Mettre à jour le plan', de: 'Plan aktualisieren', ru: 'Обновление плана', es: 'Actualizar el plan' },
    task_finish: { ar: 'طلب الفحص النهائي', en: 'Ask for the final checks', fr: 'Demander la vérification finale', de: 'Abschlussprüfung anfordern', ru: 'Запрос финальной проверки', es: 'Pedir la verificación final' },
    //  The engine's web_read had no name for people; the checks' own runs
    //  (quality_run, project_run, project_stop) arrive as steps too.
    web_read: { ar: 'قراءة صفحة من الإنترنت', en: 'Read a web page', fr: 'Lire une page web', de: 'Webseite lesen', ru: 'Чтение веб-страницы', es: 'Leer una página web' },
    project_run: { ar: 'تشغيل المشروع', en: 'Run the project', fr: 'Lancer le projet', de: 'Projekt starten', ru: 'Запуск проекта', es: 'Arrancar el proyecto' },
    project_stop: { ar: 'إيقاف المشروع', en: 'Stop the project', fr: 'Arrêter le projet', de: 'Projekt stoppen', ru: 'Остановка проекта', es: 'Detener el proyecto' },
    quality_run: { ar: 'تشغيل الاختبارات والبناء', en: 'Run the tests and the build', fr: 'Lancer les tests et le build', de: 'Tests und Build ausführen', ru: 'Запуск тестов и сборки', es: 'Ejecutar las pruebas y el build' },
};

/**
 * WHAT KIND OF STEP A TOOL IS — the mark the Activity ticker draws before it.
 *
 * «ج … ولكن يجب ان يكون حقيقي ومربوط بشكل صحيح مع كل الادوات» (the owner,
 * 2026-11-06). Every tool the agent engine offers its model, and every run
 * the final checks make, has a kind here; a test reads the engine's own tool
 * definitions and fails for a tool that has none.
 */
export type ToolKind =
    | 'read' | 'list' | 'search' | 'write' | 'edit'
    | 'command' | 'server' | 'log' | 'stop'
    | 'web' | 'page' | 'click' | 'shot'
    | 'plan' | 'finish' | 'run' | 'test' | 'other';

const TOOL_KINDS: Record<string, ToolKind> = {
    file_read: 'read', file_list: 'list', file_search: 'search', file_write: 'write', file_edit: 'edit',
    shell_run: 'command', shell_start: 'server', shell_logs: 'log', shell_stop: 'stop',
    web_read: 'web', browser_open: 'page', browser_act: 'click', browser_screenshot: 'shot',
    plan_update: 'plan', task_finish: 'finish',
    project_run: 'run', project_stop: 'stop', quality_run: 'test',
};

/** The tool's kind, whether it is named by the model (`shell_run`) or by its gateway (`engine_shell_run`). */
export function toolKind(tool: string): ToolKind {
    const name = String(tool || '').replace(/^engine[_:]/, '');
    return TOOL_KINDS[name] || 'other';
}

/** The Activity ticker's pace: a line types in at most this long, a character in at most this long. */
export const TICK_LINE_MS = 1_200;
export const TICK_CHAR_MS = 22;

/** Milliseconds between two characters of a line of `length` characters. */
export function tickInterval(length: number): number {
    return Math.max(8, Math.min(TICK_CHAR_MS, Math.floor(TICK_LINE_MS / Math.max(1, length))));
}

function langOf(language: string): Lang {
    const base = String(language || 'en').split('-')[0].toLowerCase();
    return (['ar', 'en', 'fr', 'de', 'ru', 'es'] as const).find(l => l === base) || 'en';
}

/**
 * The tool's name in the reader's language, or null for a tool this table
 * does not know. The panel always shows the tool's own name beside it, so the
 * label explains the name and never replaces it.
 */
export function toolLabel(tool: string, language: string): string | null {
    const row = TOOL_LABELS[String(tool || '')];
    return row ? row[langOf(language)] : null;
}

/** Inputs written in the request's language rather than as code: read with their own direction. */
export function summaryIsProse(tool: string): boolean {
    return tool === 'task_finish' || tool === 'plan_update';
}

const SUMMARY_LIMIT = 160;
/** The field that says most about a call, per tool, before the general list is tried. */
const SUMMARY_KEYS_BY_TOOL: Record<string, string[]> = {
    shell_run: ['command'],
    shell_logs: ['name'],
    shell_stop: ['name'],
    file_search: ['pattern', 'query', 'text'],
    browser_open: ['url'],
    web_read: ['url'],
    task_finish: ['summary'],
};
const SUMMARY_KEYS = ['command', 'path', 'url', 'pattern', 'query', 'name', 'dir', 'key', 'text', 'summary', 'title', 'note'];

function oneLine(s: string): string {
    const flat = s.replace(/\s+/g, ' ').trim();
    return flat.length > SUMMARY_LIMIT ? `${flat.slice(0, SUMMARY_LIMIT - 1)}…` : flat;
}

function scalar(v: unknown): string {
    return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
}

/**
 * One line that says what a call was given: the command, the path, the
 * address. The engine sends the input as JSON text clipped at a few thousand
 * characters, so a long input arrives as JSON that no longer parses; the
 * fields are then read out of the text itself.
 */
export function inputSummary(tool: string, input: string): string {
    const raw = String(input ?? '').trim();
    if (!raw || raw === '{}' || raw === 'null') return '';
    const keys = [...(SUMMARY_KEYS_BY_TOOL[tool] || []), ...SUMMARY_KEYS];
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const a = parsed as Record<string, unknown>;
        if (tool === 'browser_act') {
            const parts = [scalar(a.action), scalar(a.ref), scalar(a.key), scalar(a.value), scalar(a.direction)].filter(Boolean);
            if (scalar(a.text)) parts.push(JSON.stringify(scalar(a.text)));
            if (parts.length) return oneLine(parts.join(' '));
        }
        if (tool === 'shell_start' && scalar(a.name) && scalar(a.command)) return oneLine(`${scalar(a.name)}: ${scalar(a.command)}`);
        if (tool === 'plan_update' && Array.isArray(a.steps)) {
            const steps = a.steps as unknown[];
            const title = (s: unknown) => (typeof s === 'string' ? s : scalar((s as any)?.title));
            const current = steps.find(s => (s as any)?.status === 'in_progress') ?? steps[0];
            if (current !== undefined && title(current)) return oneLine(title(current));
        }
        for (const key of keys) {
            const v = scalar(a[key]);
            if (v.trim()) return oneLine(v);
        }
        return oneLine(raw);
    }
    for (const key of keys) {
        const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(raw);
        if (m && m[1].trim()) {
            let value = m[1];
            try { value = JSON.parse(`"${m[1]}"`); } catch { /* clipped inside an escape: keep the text as written */ }
            return oneLine(value);
        }
    }
    return oneLine(raw);
}

/* ───────────────────────── reading an event ───────────────────────── */

/** The event kinds this state is made of. Anything else leaves it unchanged. */
export const ACTIVITY_EVENT_TYPES: ReadonlySet<string> = new Set([
    'run_started', 'user_input',
    'todo_update', 'engine_step', 'step_started', 'step_done', 'step_failed',
    'engine_note', 'engine_verification', 'engine_final',
    'file_stream', 'diff', 'screenshot', 'browser_screenshot', 'preview_ready',
]);

type Ev = { type?: unknown; id?: unknown; runId?: unknown; seq?: unknown; ts?: unknown; data?: any };

function str(v: unknown): string {
    return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

function num(v: unknown): number | undefined {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
}

function runIdOf(e: Ev): string {
    return str(e.runId).trim() || str(e.data?.runId).trim();
}

/** A step event's tool, read from its name: `engine:<tool>` (the engine) or `execute:<tool>` (the history). */
function stepName(e: Ev): { tool: string; source: ActivityStep['source'] } | null {
    const name = str(e.data?.name).trim();
    if (!name) return null;
    if (name.startsWith('engine:')) return { tool: name.slice('engine:'.length), source: 'engine' };
    if (name.startsWith('execute:')) return { tool: name.slice('execute:'.length), source: 'pipeline' };
    return { tool: name, source: 'pipeline' };
}

/** True for a step event the agent engine sent about one of its own calls. */
export function isEngineStepEvent(event: unknown): boolean {
    const e = (event && typeof event === 'object' ? event : {}) as Ev;
    const t = str(e.type);
    return (t === 'step_started' || t === 'step_done' || t === 'step_failed') && stepName(e)?.source === 'engine';
}

/** `engine-<runId>-<n>`: the engine's id for its n-th event of that run. */
const ENGINE_ID = /^engine-(.+)-(\d+)$/;

function engineSeq(e: Ev, runId: string): number | undefined {
    const m = ENGINE_ID.exec(str(e.id));
    return m && runId && m[1] === runId ? Number(m[2]) : undefined;
}

function eventKey(e: Ev): string | null {
    const type = str(e.type);
    const id = str(e.id).trim();
    if (id) return `${type}|id|${id}`;
    const seq = num(e.seq);
    if (seq !== undefined && seq > 0) return `${type}|seq|${seq}`;
    const ts = num(e.ts);
    if (ts !== undefined) return `${type}|ts|${ts}|${str(e.data?.name)}|${str(e.data?.callId)}`;
    return null;
}

function inRanges(ranges: [number, number][], n: number): boolean {
    let lo = 0;
    let hi = ranges.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (n < ranges[mid][0]) hi = mid - 1;
        else if (n > ranges[mid][1]) lo = mid + 1;
        else return true;
    }
    return false;
}

/** Add a number not yet in the ranges; neighbours merge. Events arrive mostly in order, so the scan starts at the end. */
function addToRanges(ranges: [number, number][], n: number): [number, number][] {
    const out = ranges.slice();
    let i = out.length;
    while (i > 0 && out[i - 1][0] > n) i--;
    const prev = i > 0 ? out[i - 1] : undefined;
    const next = i < out.length ? out[i] : undefined;
    const joinsPrev = !!prev && prev[1] + 1 === n;
    const joinsNext = !!next && next[0] - 1 === n;
    if (joinsPrev && joinsNext) out.splice(i - 1, 2, [prev![0], next![1]]);
    else if (joinsPrev) out[i - 1] = [prev![0], n];
    else if (joinsNext) out[i] = [n, next![1]];
    else out.splice(i, 0, [n, n]);
    return out;
}

function rangeCount(ranges: [number, number][]): number {
    let total = 0;
    for (const [a, b] of ranges) total += b - a + 1;
    return total;
}

/** Text for the panel: a string as it is, anything else as JSON, bounded with what was cut said in the text. */
function displayText(value: unknown, limit: number): string {
    if (value === undefined || value === null) return '';
    let s: string;
    if (typeof value === 'string') s = value;
    else {
        try { s = JSON.stringify(value, null, 2) ?? ''; } catch { s = String(value); }
    }
    return s.length > limit ? `${s.slice(0, limit)}… [${s.length - limit} more characters not shown]` : s;
}

function baseName(p: string): string {
    const parts = String(p || '').split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

const CHANGE_KINDS = new Set<FileChangeKind>(['created', 'modified', 'deleted', 'written']);

function stepFiles(value: unknown): StepFile[] {
    if (!Array.isArray(value)) return [];
    const out: StepFile[] = [];
    for (const f of value) {
        const path = str((f as any)?.path).trim();
        if (!path) continue;
        const change = str((f as any)?.change) as FileChangeKind;
        const bytes = num((f as any)?.bytes);
        out.push({ path, change: CHANGE_KINDS.has(change) ? change : 'modified', ...(bytes !== undefined ? { bytes } : {}) });
    }
    return out;
}

/** Only an image this origin serves from its artifacts folder; nothing a third party could point the panel at. */
const SAFE_IMAGE_PATH = /^\/artifacts\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i;

export function safeScreenshotHref(href: unknown): string | null {
    const h = str(href).trim();
    return SAFE_IMAGE_PATH.test(h) && !h.includes('..') ? h : null;
}

const PLAN_STATUS = new Set<PlanStatus>(['pending', 'in_progress', 'completed', 'cancelled']);

function planItem(raw: unknown): PlanItem | null {
    const id = str((raw as any)?.id).trim();
    const content = str((raw as any)?.content ?? (raw as any)?.label ?? (raw as any)?.text);
    if (!id && !content) return null;
    const status = str((raw as any)?.status) as PlanStatus;
    return { id: id || content, content, status: PLAN_STATUS.has(status) ? status : 'pending' };
}

/** The engine numbers its requirements R1..Rn; everything else in the list is a step. */
function isRequirement(item: PlanItem): boolean {
    return /^R\d+$/i.test(item.id);
}

/* ───────────────────────── folding an event in ───────────────────────── */

function upsertById(list: PlanItem[], items: PlanItem[]): PlanItem[] {
    const out = list.slice();
    for (const item of items) {
        const i = out.findIndex(x => x.id === item.id);
        if (i >= 0) out[i] = item; else out.push(item);
    }
    return out;
}

function insertStep(steps: ActivityStep[], step: ActivityStep): ActivityStep[] {
    const out = steps.slice();
    let i = out.length;
    while (i > 0 && (out[i - 1].startedAt > step.startedAt || (out[i - 1].startedAt === step.startedAt && out[i - 1].seq > step.seq))) i--;
    out.splice(i, 0, step);
    return out;
}

/** Keep the newest calls. A call still running is never removed: its result has yet to arrive. */
function boundSteps(s: ActivityState): ActivityState {
    if (s.steps.length <= s.limits.steps) return s;
    const steps = s.steps.slice();
    const removed: string[] = [];
    for (let i = 0; i < steps.length && steps.length > s.limits.steps;) {
        if (steps[i].ok === undefined) { i++; continue; }
        removed.push(steps.splice(i, 1)[0].callId);
    }
    if (!removed.length) return s;
    return {
        ...s,
        steps,
        olderSteps: s.olderSteps + removed.length,
        droppedCalls: [...s.droppedCalls, ...removed].slice(-s.limits.steps * 4),
    };
}

function insertNote(s: ActivityState, note: ActivityNote): ActivityState {
    const notes = s.notes.slice();
    let i = notes.length;
    while (i > 0 && (notes[i - 1].at > note.at || (notes[i - 1].at === note.at && notes[i - 1].seq > note.seq))) i--;
    notes.splice(i, 0, note);
    const extra = Math.max(0, notes.length - s.limits.notes);
    return { ...s, notes: extra ? notes.slice(extra) : notes, olderNotes: s.olderNotes + extra };
}

function mergeChange(prev: FileChangeKind | undefined, next: FileChangeKind): FileChangeKind {
    //  A file this run created and then edited is, for this run, a new file.
    if (prev === 'created' && (next === 'modified' || next === 'written')) return 'created';
    return next;
}

function upsertFile(s: ActivityState, file: ActivityFile): ActivityState {
    const old = s.files.find(f => f.path === file.path);
    const merged: ActivityFile = old
        ? {
            ...old,
            ...file,
            change: mergeChange(old.change, file.change),
            additions: file.additions ?? old.additions,
            deletions: file.deletions ?? old.deletions,
            bytes: file.bytes ?? old.bytes,
            at: Math.max(old.at, file.at),
        }
        : file;
    let olderFiles = s.olderFiles;
    let droppedPaths = s.droppedPaths;
    if (!old && droppedPaths.includes(file.path)) {
        droppedPaths = droppedPaths.filter(p => p !== file.path);
        olderFiles = Math.max(0, olderFiles - 1);
    }
    const rest = s.files.filter(f => f.path !== file.path);
    let i = 0;
    while (i < rest.length && rest[i].at > merged.at) i++;
    const files = [...rest.slice(0, i), merged, ...rest.slice(i)];
    if (files.length > s.limits.files) {
        const removed = files.splice(s.limits.files);
        olderFiles += removed.length;
        droppedPaths = [...droppedPaths, ...removed.map(f => f.path)].slice(-s.limits.files * 4);
    }
    return { ...s, files, olderFiles, droppedPaths };
}

function upsertServed(s: ActivityState, entry: ActivityServed): ActivityState {
    const i = s.served.findIndex(x => x.kind === entry.kind && x.name === entry.name);
    if (i >= 0 && s.served[i].at > entry.at) return s;
    const served = s.served.slice();
    if (i >= 0) served[i] = entry; else served.push(entry);
    return { ...s, served };
}

/** A screenshot the panel can show always wins over a file it cannot; between equals, the newer wins. */
function withScreenshot(s: ActivityState, shot: ActivityScreenshot): ActivityState {
    const cur = s.latestScreenshot;
    if (cur) {
        if (shot.kind === 'file' && cur.kind !== 'file') return s;
        if (!(cur.kind === 'file' && shot.kind !== 'file') && cur.at > shot.at) return s;
    }
    return { ...s, latestScreenshot: shot };
}

function uniqueKey(s: ActivityState, callId: string): string {
    let key = callId;
    for (let n = 2; s.steps.some(x => x.key === key); n++) key = `${callId}#${n}`;
    return key;
}

function lastIndexWhere<T>(list: T[], test: (x: T) => boolean): number {
    for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return i;
    return -1;
}

function onStepStarted(s: ActivityState, e: Ev, at: number, seq: number, restored: boolean): ActivityState {
    const named = stepName(e);
    if (!named) return s;
    const input = displayText(e.data?.input, s.limits.text);
    const given = str(e.data?.callId).trim();
    const callId = given || `${named.source}:${named.tool}@${at}.${seq}`;
    //  A result read back before its start waits for that start.
    const i = given ? s.steps.findIndex(x => x.callId === callId && !x.started) : -1;
    if (i >= 0) {
        const steps = s.steps.slice();
        steps[i] = { ...steps[i], started: true, input: steps[i].input || input, startedAt: Math.min(steps[i].startedAt, at), seq: Math.min(steps[i].seq, seq) };
        return { ...s, steps };
    }
    //  A record replaying a call the bound already removed: it is counted.
    if (restored && given && s.droppedCalls.includes(callId)) return s;
    const step: ActivityStep = {
        key: uniqueKey(s, callId), callId, started: true, anonymous: !given,
        tool: named.tool, source: named.source, input, startedAt: at, seq,
    };
    return boundSteps({ ...s, steps: insertStep(s.steps, step) });
}

function onStepEnded(s: ActivityState, e: Ev, at: number, seq: number): ActivityState {
    const named = stepName(e);
    if (!named) return s;
    const d = e.data || {};
    const result = d.result && typeof d.result === 'object' ? d.result : {};
    const ok = typeof result.ok === 'boolean' ? result.ok : str(e.type) === 'step_done';
    const outputValue = result.output !== undefined && result.output !== null && result.output !== '' ? result.output : result.error;
    const output = displayText(outputValue, s.limits.text);
    const durationMs = num(d.durationMs);
    const filesChanged = stepFiles(d.filesChanged);
    const servedUrl = str(d.served?.url).trim();
    const served = servedUrl ? { name: str(d.served?.name).trim() || servedUrl, url: servedUrl } : undefined;
    const screenshotFile = baseName(str(d.screenshotPath)) || undefined;

    const given = str(d.callId).trim();
    //  A result belongs to the newest call of its id still waiting for one, so
    //  an id a provider reuses in a later turn never reopens a finished call.
    //  The history's pairs carry no id: there, the oldest waiting call of the
    //  same tool is the one.
    const i = given
        ? lastIndexWhere(s.steps, x => x.callId === given && x.ok === undefined)
        : s.steps.findIndex(x => x.anonymous && x.ok === undefined && x.tool === named.tool && x.source === named.source);
    if (i < 0 && given && s.droppedCalls.includes(given)) return s;
    const callId = given || `${named.source}:${named.tool}@${at}.${seq}`;
    const ended = {
        ok,
        output,
        endedAt: at,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(filesChanged.length ? { filesChanged } : {}),
        ...(served ? { served } : {}),
        ...(screenshotFile ? { screenshotFile } : {}),
    };
    let next: ActivityState;
    if (i >= 0) {
        const steps = s.steps.slice();
        steps[i] = { ...steps[i], ...ended };
        next = { ...s, steps };
    } else {
        //  A call refused before it could start (arguments that are not JSON,
        //  a tool that does not exist) has a result and no start.
        const startedAt = durationMs !== undefined ? Math.max(0, at - durationMs) : at;
        next = {
            ...s,
            steps: insertStep(s.steps, {
                key: uniqueKey(s, callId), callId, started: false, anonymous: !given,
                tool: named.tool, source: named.source, input: '', startedAt, seq, ...ended,
            }),
        };
    }
    for (const f of filesChanged) next = upsertFile(next, { ...f, at });
    if (served) next = upsertServed(next, { ...served, kind: 'server', at });
    if (screenshotFile) next = withScreenshot(next, { kind: 'file', name: screenshotFile, at });
    return boundSteps(next);
}

const NOTE_KINDS = new Set<NoteKind>(['thought', 'verification', 'compacted']);
const CHECK_STATUS = new Set<CheckStatus>(['passed', 'failed', 'skipped']);
const FINAL_STATUS = new Set<FinalStatus>(['delivered', 'failed', 'cancelled']);

function apply(s: ActivityState, e: Ev, at: number, seq: number, restored: boolean): ActivityState {
    const d = e.data || {};
    switch (str(e.type)) {
        case 'todo_update': {
            if (!Array.isArray(d.todos)) return s;
            const items = (d.todos as unknown[]).map(planItem).filter((x): x is PlanItem => !!x);
            const steps = items.filter(x => !isRequirement(x));
            const requirements = items.filter(isRequirement);
            if (d.merge === true) {
                return { ...s, plan: { steps: upsertById(s.plan.steps, steps), requirements: upsertById(s.plan.requirements, requirements) } };
            }
            return { ...s, plan: { steps, requirements } };
        }
        case 'engine_step': {
            const step = num(d.step);
            return step !== undefined && step > s.step ? { ...s, step } : s;
        }
        case 'step_started':
            return onStepStarted(s, e, at, seq, restored);
        case 'step_done':
        case 'step_failed':
            return onStepEnded(s, e, at, seq);
        case 'engine_note': {
            const text = displayText(d.text, s.limits.text);
            if (!text) return s;
            const kind = str(d.kind) as NoteKind;
            const id = str(e.id).trim() || `note:${at}:${seq}`;
            return insertNote(s, { id, kind: NOTE_KINDS.has(kind) ? kind : 'thought', text, at, seq });
        }
        case 'engine_verification': {
            const checks = (Array.isArray(d.checks) ? d.checks : []).map((c: any) => {
                const status = str(c?.status) as CheckStatus;
                return { id: str(c?.id), status: CHECK_STATUS.has(status) ? status : 'failed', detail: displayText(c?.detail, s.limits.text) };
            });
            const unproven = (Array.isArray(d.unproven) ? d.unproven : []).map((u: any) => ({
                id: str(u?.id), text: displayText(u?.text, s.limits.text), reason: displayText(u?.reason, s.limits.text),
            }));
            const verdict: ActivityVerification = { passed: d.passed === true, checks, unproven, at };
            const newer = !s.verification || s.verification.at <= at;
            return { ...s, verification: newer ? verdict : s.verification, checkRounds: s.checkRounds + 1 };
        }
        case 'engine_final': {
            const status = str(d.status) as FinalStatus;
            const final: ActivityFinal = {
                status: FINAL_STATUS.has(status) ? status : 'failed',
                steps: num(d.steps) ?? s.step,
                model: str(d.model),
                reason: str(d.reason).trim() || null,
                at,
                //  A folder name, never a path: the export route takes nothing else.
                project: /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(str(d.project)) ? str(d.project) : null,
                durationMs: num(d.durationMs) ?? null,
                costUsd: num(d.costUsd) ?? null,
            };
            return !s.final || s.final.at <= at ? { ...s, final } : s;
        }
        case 'file_stream': {
            //  Chunks are a file still growing; the finished frame is the change.
            if (d.done !== true) return s;
            const path = str(d.file || d.path).trim();
            if (!path) return s;
            const bytes = num(d.bytes);
            return upsertFile(s, { path, change: 'written', ...(bytes !== undefined ? { bytes } : {}), at });
        }
        case 'diff': {
            const path = str(d.path).trim();
            if (!path) return s;
            const additions = num(d.additions);
            const deletions = num(d.deletions);
            return upsertFile(s, {
                path, change: 'modified', at,
                ...(additions !== undefined ? { additions } : {}),
                ...(deletions !== undefined ? { deletions } : {}),
            });
        }
        case 'screenshot': {
            const captureId = str(d.capture?.id).trim();
            if (d.status !== 'success' || !captureId) return s;
            const pageName = str(d.pageName).trim();
            return withScreenshot(s, { kind: 'capture', captureId, ...(pageName ? { pageName } : {}), at });
        }
        case 'browser_screenshot': {
            const href = safeScreenshotHref(d.href);
            if (!href) return s;
            const pageUrl = str(d.url).trim();
            return withScreenshot(s, { kind: 'href', href, ...(pageUrl ? { pageUrl } : {}), at });
        }
        case 'preview_ready': {
            const url = str(d.url || d.previewUrl).trim();
            return url ? upsertServed(s, { name: 'preview', url, kind: 'preview', at }) : s;
        }
        default:
            return s;
    }
}

function fold(state: ActivityState, event: unknown, restored: boolean): ActivityState {
    if (!event || typeof event !== 'object') return state;
    const e = event as Ev;
    const type = str(e.type);
    if (!ACTIVITY_EVENT_TYPES.has(type)) return state;
    //  A build streams a file in many chunks; only the finished frame is a
    //  change, and the chunks must not crowd the dedupe memory.
    if (type === 'file_stream' && e.data?.done !== true) return state;
    const rid = runIdOf(e);
    let s = state;

    //  Every event read back names the run on screen (restoreActivity lets no
    //  other through), so only the live wire reaches the two resets below.
    if (type === 'run_started' || type === 'user_input') {
        //  The same run announced twice is still the same run.
        if (rid && rid === s.runId) return s;
        return { ...emptyActivity(s.limits), runId: rid };
    }
    if (rid && s.runId && rid !== s.runId) {
        //  A live event of another run is a run whose opening this panel
        //  missed: the socket lets no late event of a finished run through,
        //  so the newer one wins.
        s = { ...emptyActivity(s.limits), runId: rid };
    } else if (rid && !s.runId) {
        s = { ...s, runId: rid };
    }

    const seq = engineSeq(e, s.runId);
    let seen = s.seen;
    if (seq !== undefined) {
        if (inRanges(seen.ranges, seq)) return state;
        const ranges = addToRanges(seen.ranges, seq);
        seen = { ...seen, ranges, top: Math.max(seen.top, seq) };
    } else {
        const key = eventKey(e);
        if (key) {
            if (seen.keys.includes(key)) return state;
            const keys = seen.keys.length >= KEY_LIMIT ? seen.keys.slice(seen.keys.length - KEY_LIMIT + 1) : seen.keys.slice();
            keys.push(key);
            seen = { ...seen, keys };
        }
    }
    const at = num(e.ts) ?? s.clock;
    s = { ...s, seen, clock: Math.max(s.clock, at), missedEvents: seen.top - rangeCount(seen.ranges) };
    return apply(s, e, at, seq ?? 0, restored);
}

/** One live event from the socket. */
export function reduceActivity(state: ActivityState, event: unknown): ActivityState {
    return fold(state, event, false);
}

/**
 * Events read back for one run: the session history's step pairs, or the
 * run's own record. They fill in what this state has not seen, and are
 * ignored entirely when the panel already shows a different run, which is
 * newer than any record.
 *
 * Only an event that names this run is this run's. The run's record names it
 * on every event it keeps; a history row that names no run was written by
 * some run of the session, and painting it into the newest one would show a
 * step that run never took.
 */
export function restoreActivity(state: ActivityState, runId: string, events: unknown[]): ActivityState {
    const rid = String(runId || '').trim();
    if (!rid || (state.runId && state.runId !== rid) || !Array.isArray(events)) return state;
    let s = state.runId ? state : { ...state, runId: rid };
    for (const event of events) {
        if (!event || typeof event !== 'object') continue;
        if (runIdOf(event as Ev) !== rid) continue;
        s = fold(s, event, true);
    }
    return s;
}

/** The newest run a list of history events mentions: the run a reopened panel shows. */
export function latestRunId(events: unknown[]): string {
    let best = '';
    let bestAt = -Infinity;
    for (const event of Array.isArray(events) ? events : []) {
        if (!event || typeof event !== 'object') continue;
        const rid = runIdOf(event as Ev);
        if (!rid) continue;
        const at = num((event as Ev).ts) ?? -Infinity;
        if (at >= bestAt) { best = rid; bestAt = at; }
    }
    return best;
}

/**
 * How long a call took: tenths of a second for a short one, where a rounded
 * "0s" would hide the difference between 40 ms and 900 ms; minutes and
 * seconds for a long one.
 */
export function formatStepDuration(ms: number, secondSuffix = 's'): string {
    const v = Math.max(0, Number(ms) || 0);
    if (v < 100) return `<0.1${secondSuffix}`;
    if (v < 10_000) return `${(Math.round(v / 100) / 10).toFixed(1)}${secondSuffix}`;
    const total = Math.round(v / 1000);
    if (total < 60) return `${total}${secondSuffix}`;
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** True when the state holds anything worth drawing. */
export function hasActivity(s: ActivityState): boolean {
    return s.steps.length > 0 || s.notes.length > 0 || s.plan.steps.length > 0 || s.plan.requirements.length > 0
        || !!s.verification || !!s.final || s.files.length > 0 || !!s.latestScreenshot || s.served.length > 0;
}
