/**
 * THE LOOP.
 *
 *     ask the model → run the tools it called → show it what happened → repeat
 *
 * until task_finish passes Joe's checks, the run is cancelled, or the
 * deadline arrives. There is no step limit. Joe's laws forbid a fixed cap that
 * cuts real work silently, and a long build on a CPU laptop is still real
 * work. What ends a run early is a measured lack of progress, and the run says
 * so. That covers the same failing call repeated, steps in which nothing
 * changed after two warnings, and a model that stops calling tools.
 *
 * Every failure stays in the conversation, so the next step sees it. A retry
 * therefore always carries the failure it retries: the first engine re-sent
 * identical input and waited 2.5 hours to fail the same way.
 */
import { promises as fsp } from 'fs';
import path from 'path';
import { Conversation, budgetFor, estimateTokens, formatPlan } from './context';
import { firstMessage, languageReminder, languageSection, noteInWrongScript, systemPrompt, type MachineFacts } from './prompt';
import { newPlan, seededRequirements, type RequirementSeed } from './plan';
import { keepJoeFilesOutOfGit } from '../project/git-exclude';
import { pdfBriefAfterWrite, pdfGiveBrief, pdfRunStart, pdfStartScan, type PdfBriefState } from './pdf-brief';
import { operatorFirstMessage, operatorSystemPrompt } from './operate';
import type { FinishArgs } from './finish';
import type {
    BrowserSession, ChatMessage, ContentPart, EngineModel, EngineRequest, EngineResult, EngineTool, ModelStep,
    ProcessRegistry, RunState, ToolContext, ToolFacts, ToolOutcome, ToolSchema,
} from './types';

export interface EngineDeps {
    model: EngineModel;
    /** The fixed tool list for the run, plan_update and task_finish included. */
    tools: EngineTool[];
    processes: ProcessRegistry;
    /** Opens the run's browser on first use. */
    browser: () => BrowserSession;
    machine: MachineFacts;
    /** Reads the requested items. A failure leaves the ledger empty, never the run stopped. */
    seedRequirements?: (request: string, language: string) => Promise<RequirementSeed[]>;
    now?: () => number;
    /**
     * Before the first model call: work done without a model (experience.ts, a
     * request done again from Joe's book). `finish` claims it done — the run's
     * own task_finish checks it, and a pass delivers with no model call; `note`
     * tells the model, in its first message, what was done and where it stopped.
     */
    before?: (ctx: ToolContext, tools: Map<string, EngineTool>) => Promise<{ finish?: string; note?: string; refused?: (failed: string) => string } | null>;
    /** Waits between transient model failures; a test hands in one that does not sleep. Settles early when the run is cancelled. */
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Steps with no file changed, no command passing and no page served before the engine steps in. */
export const STALL_STEPS = 8;
/** The same failing call this many times ends the run. */
export const REPEAT_LIMIT = 4;
/** Turns in a row without a tool call before the run ends. */
export const IDLE_LIMIT = 3;
/** Model calls in a row that fail before the run ends. */
export const MODEL_FAILURE_LIMIT = 3;
/**
 * A PROVIDER'S BAD MINUTES ARE WAITED OUT, NOT TURNED INTO A FAILED RUN.
 *
 * The 500-prompt exam on Claude, 2026-11-12/13: P231 («Connection error»), and
 * P394 and P444 seven minutes apart («503 credential validation failed», one
 * incident at the provider), each ended as failed after three calls in a row
 * that the SDK's own quick retries could not carry over. Nothing was wrong with
 * the work. A failure of the transient kinds — a rate limit (429), the server's
 * own trouble (5xx, 529 overloaded), a timeout, a connection that dropped — is
 * now waited out before the call is asked again: 30 s, then 2 min, then 5 min
 * (longer when the server's Retry-After asks for longer), and the chat says so
 * while Joe waits. A refusal the provider means (a 4xx: the key, the request)
 * is not waited on. The run's deadline and its budget guard stay in charge: a
 * wait that would pass the deadline ends the run now, and every call that
 * follows a wait still goes through the budget guard.
 */
export const TRANSIENT_WAITS_MS: readonly number[] = [30_000, 120_000, 300_000];

/*
 * ⛔ ONLY THE PROVIDER'S OWN BAD MINUTES ARE WAITED OUT.
 *
 * The r40 review, 2026-11-15: with no status, any «timeout» or «overloaded» in
 * the words was waited on — «Local inference timeout must be between 1 ms and …»
 * (a setting, OLLAMA_TIMEOUT_INPUT) and «Ollama: model overloaded, out of memory»
 * (a local model that does not fit) got 30 s + 2 min + 5 min and a fourth call,
 * and 501 (not implemented) and 505 (version not supported) counted as trouble
 * that passes. Waited on now: 408, 409, 425, 429, 500, 502, 503, 504, 529; with
 * no status, only the shapes a provider or the network gives — a rate limit, the
 * API overloaded, one of those statuses in its words, a connection reset, timed
 * out or dropped, «Connection error», «fetch failed». A failure that carries a
 * code of Joe's own (OLLAMA_*, MODEL_*, LOCAL_*, RESOURCE_*) is never one, and
 * neither are words of a setting or of a model out of memory.
 */
const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
/** The network's own failure codes; any other code on the failure is Joe's own word for it. */
const NETWORK_CODE = /^(?:ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|EAI_AGAIN|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ECONNABORTED|UND_ERR_(?:SOCKET|CLOSED|CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT))$/u;
/** Words of a setting, a request or a machine that waiting does not change. */
const NEVER_WAITED_TEXT = /ECONNREFUSED|out of memory|\boom\b|insufficient (?:memory|vram)|cuda error|must be (?:between|at (?:least|most)|one of|a |an |positive|greater|less|lower|higher)|\binvalid\b|is required|not supported|unsupported|not implemented/iu;
const PROVIDER_TRANSIENT_TEXT = /\b(?:ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|EAI_AGAIN|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ECONNABORTED|UND_ERR_(?:SOCKET|CLOSED|CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT))\b|connection error|socket hang up|fetch failed|network (?:error|failure)|request timed out|rate[- ]?limit(?:ed|s)?\b|too many requests|overloaded_error|(?:the\s+)?(?:api|model|engine|server|servers|service)\s+(?:is|are)\s+(?:currently\s+|temporarily\s+)?overloaded|^\s*overloaded\.?\s*$|temporarily unavailable|service unavailable|bad gateway|gateway time-?out|internal server error/iu;
/** A gateway's own failure status in the words, as a number standing alone or by its name. */
const GATEWAY_STATUS_TEXT = /(?<![\w.-])(?:502|503|504|529)(?![\w.-])(?!\s*(?:ms|s|sec|seconds?|tokens?|bytes?|mb|gb|kb)\b)|bad gateway|service unavailable|gateway time-?out/iu;
/** One of the waited statuses in the failure's words: at its start, in brackets, or after «status», «HTTP», «error», «code». */
const STATUS_IN_TEXT = /(?:^\s*|\((?=\d{3}\))|\b(?:status(?:\s*code)?|http(?:\/[\d.]+)?|error|code)\s*[:=]?\s*)(?:408|429|500|502|503|504|529)\b(?!\s*(?:ms|s|sec|seconds?|tokens?|bytes?|mb|gb|kb)\b)/iu;

/** A failure that waiting can cure: a provider's 408, 409, 425, 429, 500, 502, 503, 504, 529, or a network failure with no status. */
export function transientModelFailure(e: unknown): boolean {
    const err = e as any;
    const status = Number(err?.status ?? err?.statusCode ?? err?.response?.status);
    if (Number.isFinite(status) && status > 0) return TRANSIENT_STATUSES.has(status);
    //  No status: the call never got an answer. A code of Joe's own names a failure of its own.
    const code = String(err?.code ?? '');
    if (code && code !== 'PROVIDER_FAILURE' && !NETWORK_CODE.test(code)) return false;
    const said = message(e);
    const text = `${code} ${String(err?.cause?.code ?? '')} ${said}`;
    //  A connection refused means nothing is listening (a local server that is not started):
    //  waiting minutes does not start it; nor does it fix a setting or free a machine's memory.
    //  …but «invalid» beside a gateway's own status (502, 503, 504, 529) is the gateway's bad minute:
    //  «Invalid response from upstream: 502 Bad Gateway» (the second review of 2026-11-15) is waited out.
    if (NEVER_WAITED_TEXT.test(text) && !(GATEWAY_STATUS_TEXT.test(text) && !NEVER_WAITED_TEXT.test(text.replace(/\binvalid\b/giu, ' ')))) return false;
    if (GATEWAY_STATUS_TEXT.test(text) && /\binvalid\b/iu.test(text)) return true;
    if (NETWORK_CODE.test(code) || NETWORK_CODE.test(String(err?.cause?.code ?? ''))) return true;
    //  The provider's words come after the engine's own prefix («The Claude API call failed: …»).
    const theirs = said.replace(/^.*?\bAPI call failed(?:\s*\(\d+\))?:\s*/iu, '');
    return PROVIDER_TRANSIENT_TEXT.test(said) || PROVIDER_TRANSIENT_TEXT.test(theirs) || STATUS_IN_TEXT.test(said) || STATUS_IN_TEXT.test(theirs);
}

/** What the server asked us to wait, in ms, from a Retry-After (seconds or a date) or retry-after-ms; 0 when it said nothing. */
export function retryAfterMs(e: unknown, nowMs: number): number {
    const err = e as any;
    if (Number.isFinite(Number(err?.retryAfterMs)) && Number(err.retryAfterMs) > 0) return Number(err.retryAfterMs);
    const h = err?.headers ?? err?.response?.headers;
    const read = (name: string): string => {
        if (!h) return '';
        if (typeof h.get === 'function') return String(h.get(name) ?? '');
        //  A plain object's header names keep whatever case they came in («Retry-After»).
        if (typeof h !== 'object') return '';
        const key = Object.keys(h).find(k => k.toLowerCase() === name);
        return key === undefined ? '' : String(h[key] ?? '');
    };
    const ms = Number(read('retry-after-ms'));
    if (Number.isFinite(ms) && ms > 0) return ms;
    const after = read('retry-after').trim() || String(err?.retryAfter ?? '').trim();
    if (!after) return 0;
    if (/^\d+(?:\.\d+)?$/u.test(after)) return Math.round(Number(after) * 1000);
    const at = Date.parse(after);
    return Number.isFinite(at) ? Math.max(0, at - nowMs) : 0;
}

function spokenDuration(ms: number, ar: boolean): string {
    const s = Math.round(ms / 1000);
    if (s < 90) return ar ? `${s} ثانية` : `${s} s`;
    const m = Math.round(s / 60);
    return ar ? `${m} دقائق` : `${m} min`;
}

function sleepUnlessCancelled(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
        if (signal.aborted) { resolve(); return; }
        const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', done, { once: true });
    });
}
/**
 * Joe's checks refusing the same thing this many times in a row ends the run.
 * Measured on 2026-11-01: a store whose every requirement worked was refused
 * nine times on one check, and the model spent those turns trying to please
 * the checker instead of building. Four identical refusals mean the model and
 * the checks disagree; the run stops and says on what.
 */
export const REFUSAL_LIMIT = 4;

/**
 * What a refusal refused, with its counts folded, so «8 tap targets» and «12 tap targets» read alike.
 *
 * A check that names the requirements it refused (R2, R7) is that check on those
 * requirements, whatever its words: the acceptance judge is a model and words the
 * same refusal anew each time. The ladder's L150, 2026-11-08: «R2 نقل الأقسام بين
 * الأعمدة» was refused for two hours and 88 steps, never twice in the same words,
 * so the run never stopped on it.
 */
export function refusalSignature(report: { checks?: { id: string; status: string; detail?: string }[] } | undefined): string {
    return (report?.checks || [])
        .filter(c => c.status === 'failed' || unmeasured(c))
        .map(c => {
            //  A check the delivery needs and that could not be measured (2026-11-09: the Browser QA
            //  with no one watching Joe's page) is the same refusal each time: it counts toward the
            //  limit, so the run ends honestly instead of calling task_finish again until its deadline.
            if (c.status !== 'failed') return `${c.id}:unmeasured`;
            const detail = String(c.detail || '');
            const requirements = [...new Set(detail.match(/\bR\d{1,3}\b/gu) || [])].sort();
            return requirements.length ? `${c.id}:${requirements.join(',')}` : `${c.id}:${detail.replace(/\d+/g, '#').slice(0, 200)}`;
        })
        .sort()
        .join('|');
}

/** A check the delivery needs that was not measured (verify.ts: «not measured, and the delivery needs it»). */
function unmeasured(c: { status: string; detail?: string }): boolean {
    return c.status === 'skipped' && /^not measured, and the delivery needs it/u.test(String(c.detail || ''));
}
/** Recite the plan at least this often, even when it did not change. */
export const RECITE_EVERY = 5;
/**
 * Model failures that asking again cannot fix: the budget is spent, the key
 * or the account was refused, the model does not exist, or the model
 * declined. The run ends at once and says which.
 */
const FINAL_MODEL_FAILURES = new Set([
    'ENGINE_BUDGET_EXHAUSTED', 'ENGINE_BUDGET_LEDGER', 'ENGINE_PRICE_UNKNOWN',
    'MODEL_AUTH', 'MODEL_BILLING', 'MODEL_NOT_FOUND', 'MODEL_REFUSAL',
]);

function message(e: unknown): string {
    return String((e as any)?.message ?? e ?? 'unknown error').slice(0, 400);
}

function errorCode(e: unknown): string {
    const code = String((e as any)?.code ?? '');
    if (code) return code;
    const m = /\b(RESOURCE_[A-Z_]+|LOCAL_COMPLETION_LIMIT|OLLAMA_[A-Z_]+)\b/.exec(message(e));
    return m ? m[1] : '';
}

function firstLine(s: string): string {
    return String(s || '').split('\n').find(l => l.trim())?.trim().slice(0, 300) ?? '';
}

function absorbFacts(state: RunState, facts?: ToolFacts): void {
    if (!facts) return;
    for (const f of facts.filesChanged ?? []) {
        //  A file this run created is still new to the project after later
        //  edits; the receipt says created, not modified.
        const before = state.files.get(f.path);
        state.files.set(f.path, before?.change === 'created' && f.change === 'modified' ? { ...f, change: 'created' } : f);
    }
    if (facts.command) state.commands.push(facts.command);
    if (facts.served) {
        const i = state.served.findIndex(p => p.name === facts.served!.name);
        if (i >= 0) state.served[i] = facts.served; else state.served.push(facts.served);
    }
    if (facts.page) state.pages.push(facts.page);
}

function madeProgress(o: ToolOutcome): boolean {
    if (!o.ok || !o.facts) return false;
    const f = o.facts;
    if (f.filesChanged?.length) return true;
    if (f.command && f.command.exitCode === 0) return true;
    if (f.served?.running) return true;
    if (f.page && (f.page.status ?? 200) < 400) return true;
    return !!f.verification;
}

function statusText(state: RunState, processes: ProcessRegistry, deadlineAt: number, now: number): string {
    const minutesLeft = Math.max(0, Math.round((deadlineAt - now) / 60_000));
    const lines = [`[Status · step ${state.steps} · ${minutesLeft} min left]`];
    const plan = formatPlan(state.plan);
    if (plan) lines.push(plan);
    const running = processes.list().filter(p => p.running);
    if (running.length) lines.push(`Running: ${running.map(p => `${p.name} → ${p.url ?? '(no address seen yet)'}`).join('; ')}`);
    return lines.join('\n');
}

export async function runEngine(req: EngineRequest, deps: EngineDeps): Promise<EngineResult> {
    const now = deps.now ?? Date.now;
    const startedAt = now();
    const stateDir = path.join(req.projectDir, '.joe');
    await fsp.mkdir(stateDir, { recursive: true });
    //  In the owner's own repository, Joe's state never reaches a commit (git-exclude.ts).
    await keepJoeFilesOutOfGit(req.projectDir);

    let seeds: RequirementSeed[] = [];
    //  An operate run proves what it did on the device, not a list of features.
    if (deps.seedRequirements && !req.operate) {
        try { seeds = await deps.seedRequirements(req.request, req.language); } catch { seeds = []; }
    }
    const state: RunState = {
        plan: newPlan(seededRequirements(seeds)),
        files: new Map(), commands: [], served: [], pages: [], verifications: [],
        steps: 0, modelMs: 0, toolMs: 0,
    };

    let browser: BrowserSession | null = null;
    const cancelled = new Promise<void>(resolve => {
        if (req.signal.aborted) resolve();
        else req.signal.addEventListener('abort', () => resolve(), { once: true });
    });
    const ctx: ToolContext = {
        runId: req.runId, projectDir: req.projectDir, stateDir,
        signal: req.signal, cancelled, deadlineAt: req.deadlineAt,
        language: req.language, replyLanguage: req.replyLanguage, request: req.request,
        processes: deps.processes,
        browser: () => (browser ??= deps.browser()),
        state, emit: req.emit, joe: req.joe,
        ...(req.change ? { change: req.change } : {}),
    };

    //  The Arabic-PDF brief and kit, once per run (pdf-brief.ts): '' for every other request.
    //  The project's PDFs are remembered first (fs only, no child), before anything of this
    //  run can write one. The request's scan child is NEVER awaited before the first model
    //  call (review 3 of r40, finding 8): it starts here, runs beside the work before the
    //  model and the first model call, and its brief joins the first message only when it
    //  has already answered — else the result of the first step after it answers.
    //  The scan returns only its decision; the kit is placed by pdfGiveBrief at the moment
    //  the brief joins the conversation, never mid-step and never for a run that is ending
    //  (review 4 of r40, S5).
    const pdfBrief: PdfBriefState = { given: false };
    //  Its children stop when the run is cancelled AND when the run ends: a start scan still
    //  running at the end never places the kit after the delivery. One listener per run.
    const pdfStop = new AbortController();
    const stopPdf = () => pdfStop.abort();
    const endPdf = () => { req.signal.removeEventListener('abort', stopPdf); pdfStop.abort(); };
    if (req.signal.aborted) stopPdf(); else req.signal.addEventListener('abort', stopPdf, { once: true });
    const pdfFacts = { runId: req.runId, request: req.request, language: req.language, projectDir: req.projectDir, stateDir, change: req.change, signal: pdfStop.signal };
    /** The run-start scan: `done` once it answered, `give` its decision, `used` once the loop acted on it. */
    let pdfStart: { done: boolean; give: boolean; used: boolean; wait: Promise<boolean> } | null = null;
    //  Every throw from here to the run's own try still stops the scan and its listener
    //  (review 4 of r40, M5): a run that fails before its first step never gets the kit.
    let conv: Conversation;
    let preDelivered: string | null = null;
    let preNote = '';
    const lastErrorsBefore: string[] = [];
    let tools: Map<string, EngineTool>;
    let schemas: ToolSchema[];
    try {
        if (!req.operate) {
            await pdfRunStart(pdfFacts).catch(() => { /* a later look then reads no project PDF as new */ });
            const start = { done: false, give: false, used: false, wait: Promise.resolve(false) };
            start.wait = pdfStartScan(pdfBrief, pdfFacts).catch(() => false).then(g => { start.done = true; start.give = g; return g; });
            pdfStart = start;
        }

        tools = new Map(deps.tools.map(t => [t.name, t] as const));
        schemas = deps.tools.map(t => ({
            type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        const toolTokens = estimateTokens(JSON.stringify(schemas)) + 64 * schemas.length;

        //  Work done before any model call (experience.ts: a request done again from Joe's book).
        //  Its claim goes through the run's own task_finish: a pass delivers with no model call.
        if (deps.before) {
            try {
                const pre = await deps.before(ctx, tools);
                const fin = tools.get('task_finish');
                if (pre?.finish && fin) {
                    const parsed = fin.parse({ summary: pre.finish });
                    if (parsed.ok) {
                        const outcome = await fin.run(parsed.value, ctx);
                        absorbFacts(state, outcome.facts);
                        if (outcome.facts?.verification?.passed) preDelivered = pre.finish;
                        else {
                            const failed = (outcome.facts?.verification?.checks || []).filter(c => c.status === 'failed').map(c => `${c.id}: ${firstLine(c.detail)}`).join('; ');
                            preNote = pre.refused ? pre.refused(failed || firstLine(outcome.output)) : pre.note || '';
                        }
                    }
                } else if (pre?.note) preNote = pre.note;
            } catch (e) {
                preNote = '';
                lastErrorsBefore.push(`the work before the model failed: ${message(e)}`);
            }
        }

        conv = new Conversation(stateDir, budgetFor(deps.model.contextTokens(), toolTokens));
        conv.push({ role: 'system', content: (req.operate ? operatorSystemPrompt(deps.machine) : systemPrompt(deps.machine)) + languageSection(req.replyLanguage || req.language) });
        //  The run-start brief, when its scan answered during the work before the model (above):
        //  the kit is placed now, with it. Not for a run Joe's book already delivered.
        let pdfOpening = '';
        if (pdfStart?.done && preDelivered === null && !req.signal.aborted) {
            pdfStart.used = true;
            if (pdfStart.give) pdfOpening = await pdfGiveBrief(pdfBrief, pdfFacts).catch(() => '');
        }
        const opening = req.operate
            ? operatorFirstMessage(req.request, req.language, req.replyLanguage, req.operateTarget, req.operateHistory, req.operateAbout)
            : firstMessage(req.request, req.language, state.plan, req.projectDir, req.replyLanguage, req.change, pdfOpening || undefined);
        conv.push({ role: 'user', content: preNote ? `${opening}\n\n${preNote}` : opening });
        req.emit({ type: 'plan', plan: state.plan });
    } catch (e) {
        endPdf();
        throw e;
    }

    const lastErrors: string[] = [...lastErrorsBefore];
    const failures = new Map<string, number>();
    let idle = 0;
    let modelFailures = 0;
    let transientFailures = 0;
    const waited: number[] = [];
    const wait = deps.wait ?? sleepUnlessCancelled;
    const speaksArabic = /^ar\b/iu.test(String(req.replyLanguage || req.language || ''));
    let cutReplies = 0;
    let quietSteps = 0;
    let warnings = 0;
    let lastRefusal = '';
    let sameRefusals = 0;
    let recitedRevision = state.plan.revision;
    let recitedAt = 0;
    let recitedRunning = '';
    let summary = '';
    let howToRun = '';
    let ending: { status: EngineResult['status']; reason?: string } | null = null;
    //  Done from Joe's book and passed his checks: delivered with no model call.
    if (preDelivered !== null) { summary = preDelivered; ending = { status: 'delivered' }; }
    let served = deps.processes.list();
    const usage: NonNullable<ModelStep['usage']>[] = [];

    try {
        while (!ending) {
            if (req.signal.aborted) { ending = { status: 'cancelled', reason: 'the run was cancelled' }; break; }
            if (now() >= req.deadlineAt) { ending = { status: 'failed', reason: 'the deadline arrived before the checks passed' }; break; }
            if (conv.needsCompaction()) {
                const c = conv.compact(state, lastErrors);
                if (c.removed) req.emit({ type: 'compacted', removedMessages: c.removed, summaryChars: c.summaryChars });
            }

            state.steps++;
            req.emit({ type: 'step', step: state.steps });

            let turn: ModelStep;
            const asked = now();
            try {
                turn = await deps.model.step(conv.forCall(), schemas, { signal: req.signal, deadlineAt: req.deadlineAt });
                modelFailures = 0;
                transientFailures = 0;
                waited.length = 0;
            } catch (e) {
                state.modelMs += now() - asked;
                if (req.signal.aborted) { ending = { status: 'cancelled', reason: 'the run was cancelled' }; break; }
                const code = errorCode(e);
                lastErrors.push(`model call failed${code ? ` (${code})` : ''}: ${message(e)}`);
                if (code === 'RESOURCE_CONTEXT_OVERFLOW') {
                    //  The prompt no longer fits the window the server could give
                    //  this call (the window follows free memory). Fold and ask again.
                    const c = conv.compact(state, lastErrors);
                    if (c.removed) { req.emit({ type: 'compacted', removedMessages: c.removed, summaryChars: c.summaryChars }); continue; }
                }
                //  A picture the model cannot read is taken out, and the call is asked again
                //  without it (context.ts dropImages): it never fails a run that did its work.
                if (/could not process image|image (?:is )?(?:invalid|corrupt|could not be)|unable to process (?:the )?image/iu.test(message(e)) && conv.dropImages() > 0) {
                    lastErrors.push('a picture the model could not read was taken out of the conversation');
                    continue;
                }
                if (FINAL_MODEL_FAILURES.has(code)) { ending = { status: 'failed', reason: `the model call cannot go on (${code}): ${message(e)}` }; break; }
                if (code === 'LOCAL_COMPLETION_LIMIT' || code === 'COMPLETION_LIMIT') {
                    cutReplies++;
                    if (cutReplies >= MODEL_FAILURE_LIMIT) { ending = { status: 'failed', reason: 'the model\'s reply was cut off by the output limit three times in a row' }; break; }
                    conv.push({ role: 'user', content: 'Your last reply was cut off: it was longer than the room left for an answer, so none of it was used. Make smaller calls: write a big file as a short skeleton with file_write, then add each part with file_edit.' });
                    continue;
                }
                if (transientModelFailure(e)) {
                    transientFailures++;
                    const failedTimes = transientFailures + modelFailures;
                    if (transientFailures > TRANSIENT_WAITS_MS.length) {
                        const after = waited.map(ms => spokenDuration(ms, false)).join(', ');
                        ending = { status: 'failed', reason: `the model call failed ${failedTimes} times in a row (Joe waited ${after} between them): ${message(e)}` };
                        break;
                    }
                    const ms = Math.max(TRANSIENT_WAITS_MS[transientFailures - 1], retryAfterMs(e, now()));
                    if (now() + ms >= req.deadlineAt) {
                        ending = { status: 'failed', reason: `the model call failed ${failedTimes} times in a row, and waiting ${spokenDuration(ms, false)} for it would pass the run's deadline: ${message(e)}` };
                        break;
                    }
                    const left = TRANSIENT_WAITS_MS.length - transientFailures + 1;
                    req.emit({
                        type: 'thought',
                        text: speaksArabic
                            ? `⏳ تعذّر الوصول إلى النموذج الآن (${firstLine(message(e)).slice(0, 160)}). عطل مؤقت عند المزوّد، فلن أوقف العمل: أنتظر ${spokenDuration(ms, true)} ثم أعيد المحاولة من حيث توقفت (بقيت ${left} محاولة).`
                            : `⏳ The model cannot be reached right now (${firstLine(message(e)).slice(0, 160)}). This is the provider's temporary trouble, so the work is not stopped: waiting ${spokenDuration(ms, false)}, then asking again from where it stopped (${left} attempt(s) left).`,
                    });
                    waited.push(ms);
                    await wait(ms, req.signal);
                    if (req.signal.aborted) { ending = { status: 'cancelled', reason: 'the run was cancelled' }; break; }
                    //  Nothing was appended, so the next step asks again from the same history.
                    continue;
                }
                modelFailures++;
                if (modelFailures >= MODEL_FAILURE_LIMIT) {
                    ending = { status: 'failed', reason: `the model call failed ${MODEL_FAILURE_LIMIT} times in a row: ${message(e)}` };
                    break;
                }
                //  Nothing was appended, so the next step asks again from the same history.
                continue;
            }
            state.modelMs += now() - asked;
            cutReplies = 0;
            if (turn.usage) usage.push(turn.usage);

            conv.push({
                role: 'assistant',
                content: turn.text || '',
                ...(turn.toolCalls.length ? {
                    tool_calls: turn.toolCalls.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: tc.arguments } })),
                } : {}),
                ...(turn.native ? { native: turn.native } : {}),
            });
            if (turn.text) { req.emit({ type: 'thought', text: turn.text }); summary = turn.text; }

            if (!turn.toolCalls.length) {
                idle++;
                if (idle >= IDLE_LIMIT) { ending = { status: 'failed', reason: 'the model stopped calling tools before the checks passed' }; break; }
                conv.push({ role: 'user', content: 'You answered without calling a tool. If the work is complete, call task_finish so Joe can check it. Otherwise make the next tool call.' });
                continue;
            }
            idle = 0;

            let progressed = false;
            /** Files this step's file_write / file_edit wrote: the Arabic-PDF brief's hook reads them as they now are. */
            const wroteFiles: string[] = [];
            const results: { role: 'tool'; tool_call_id: string; content: string }[] = [];
            const images: { path: string; mime: string; from: string }[] = [];
            for (const call of turn.toolCalls) {
                if (ending) {
                    //  The run ended on an earlier call of this turn. Every call
                    //  still gets an answer, so the transcript stays well-formed.
                    results.push({ role: 'tool', tool_call_id: call.id, content: 'Not run: the run had already ended.' });
                    continue;
                }
                const tool = tools.get(call.name);
                const started = now();
                let outcome: ToolOutcome;
                let args: unknown;
                if (!tool) {
                    outcome = { ok: false, output: `There is no tool "${call.name}". The tools are: ${[...tools.keys()].join(', ')}.` };
                } else {
                    let raw: unknown;
                    let badJson = false;
                    try { raw = JSON.parse(call.arguments || '{}'); } catch { badJson = true; }
                    if (badJson) {
                        outcome = { ok: false, output: `The arguments for ${call.name} are not valid JSON: ${call.arguments.slice(0, 300)}` };
                    } else {
                        const parsed = tool.parse(raw);
                        if (!parsed.ok) outcome = { ok: false, output: parsed.error };
                        else {
                            args = parsed.value;
                            req.emit({ type: 'tool_call', id: call.id, name: call.name, args });
                            try { outcome = await tool.run(parsed.value, ctx); }
                            catch (e) { outcome = { ok: false, output: `${call.name} failed: ${message(e)}` }; }
                        }
                    }
                }
                const durationMs = now() - started;
                state.toolMs += durationMs;
                if (outcome.ok && (call.name === 'file_write' || call.name === 'file_edit') && typeof (args as any)?.path === 'string') wroteFiles.push((args as any).path);
                absorbFacts(state, outcome.facts);
                if (madeProgress(outcome)) progressed = true;

                const key = `${call.name}\u0000${call.arguments}`;
                let repeats = 0;
                if (!outcome.ok) {
                    lastErrors.push(`${call.name}: ${firstLine(outcome.output)}`);
                    repeats = (failures.get(key) ?? 0) + 1;
                    failures.set(key, repeats);
                }
                let text = await conv.observation(call.name, state.steps, outcome.output || '(no output)', req.projectDir);
                if (repeats === 2) text += '\n\nThis exact call has now failed twice. Do not repeat it: list the likely causes, then try a different approach.';
                results.push({ role: 'tool', tool_call_id: call.id, content: text || '(no output)' });
                req.emit({ type: 'tool_result', id: call.id, name: call.name, ok: outcome.ok, output: text, durationMs, facts: outcome.facts });
                for (const img of outcome.images ?? []) images.push({ ...img, from: call.name });

                if (call.name === 'task_finish' && outcome.facts?.verification && !outcome.facts.verification.passed) {
                    const signature = refusalSignature(outcome.facts.verification);
                    sameRefusals = signature && signature === lastRefusal ? sameRefusals + 1 : 1;
                    lastRefusal = signature;
                    if (sameRefusals >= REFUSAL_LIMIT) {
                        const failed = outcome.facts.verification.checks.filter(c => c.status === 'failed' || unmeasured(c)).map(c => `${c.id}: ${firstLine(c.detail)}`).join('; ');
                        ending = { status: 'failed', reason: `Joe's checks refused the same thing ${sameRefusals} times in a row: ${failed}` };
                    }
                }
                if (ending) {
                    //  Ended above: the rest of the turn is answered as not run.
                } else if (call.name === 'ask_owner' && outcome.facts?.ownerQuestion) {
                    //  The run ends on one question to the owner, honestly, instead of
                    //  asking it again and again in notes until the idle limit (the
                    //  owner's «حاول مره اخرى», 2026-11-08: 24 steps, then «failed»).
                    summary = outcome.facts.ownerQuestion;
                    ending = { status: 'delivered' };
                } else if (call.name === 'task_finish' && outcome.facts?.verification?.passed) {
                    summary = (args as FinishArgs | undefined)?.summary || summary;
                    howToRun = String((args as FinishArgs | undefined)?.how_to_run || '').trim();
                    ending = { status: 'delivered' };
                } else if (repeats >= REPEAT_LIMIT) {
                    ending = { status: 'failed', reason: `the same failing call was made ${repeats} times: ${call.name} — ${firstLine(outcome.output)}` };
                }
            }

            //  Recite the plan at the end of the step when it changed, when the
            //  set of running servers changed, and every few steps regardless.
            //  A step that called plan_update has just read the plan in its own
            //  result, so it counts as recited.
            const running = deps.processes.list().filter(p => p.running).map(p => `${p.name}=${p.url ?? ''}`).join(',');
            if (turn.toolCalls.some(c => c.name === 'plan_update')) { recitedRevision = state.plan.revision; recitedAt = state.steps; }
            if (!ending && results.length && (state.plan.revision !== recitedRevision || running !== recitedRunning || state.steps - recitedAt >= RECITE_EVERY)) {
                const last = results[results.length - 1];
                last.content = `${last.content}\n\n${statusText(state, deps.processes, req.deadlineAt, now())}`;
                recitedRevision = state.plan.revision;
                recitedRunning = running;
                recitedAt = state.steps;
            }
            //  A note in another script than the owner's language is answered
            //  with one line asking for his: the owner's phone run, 2026-11-07,
            //  wrote «The tap opened the flashlight detail panel…» to an Arabic
            //  reader after a few English tool answers.
            if (!ending && results.length && turn.text && noteInWrongScript(turn.text, req.replyLanguage || req.language)) {
                const last = results[results.length - 1];
                last.content = `${last.content}\n\n${languageReminder(req.replyLanguage || req.language)}`;
            }
            //  The run-start scan has answered (or this step wrote a file, and its answer is
            //  needed first — by now the model has been asked at least once): its brief
            //  joins this step's last result, once, and the kit is placed now, with it —
            //  between steps, never for a step that ended the run (review 4 of r40, S5).
            let pdfLate = '';
            if (!ending && results.length && pdfStart && !pdfStart.used && (pdfStart.done || (wroteFiles.length && !pdfBrief.given))) {
                const give = await pdfStart.wait;
                pdfStart.used = true;
                if (give && !req.signal.aborted) pdfLate = await pdfGiveBrief(pdfBrief, pdfFacts).catch(() => '');
            }
            //  The builder's own write added a PDF mechanism to a right-to-left app: the brief, once (pdf-brief.ts).
            if (!ending && !req.operate && !pdfLate && results.length && wroteFiles.length && !pdfBrief.given) {
                pdfLate = await pdfBriefAfterWrite(pdfBrief, pdfFacts, wroteFiles).catch(() => '');
            }
            if (pdfLate) { const last = results[results.length - 1]; last.content = `${last.content}\n\n${pdfLate}`; }
            for (const r of results) conv.push(r);
            if (!ending && images.length && deps.model.vision) {
                //  Images reach a model only inside a user message. Only the
                //  newest screenshot is shown; every one stays on disk.
                const img = images[images.length - 1];
                try {
                    const data = (await fsp.readFile(img.path)).toString('base64');
                    const parts: ContentPart[] = [
                        { type: 'text', text: `The screenshot ${img.from} just took (${path.relative(req.projectDir, img.path).split(path.sep).join('/')}):` },
                        { type: 'image_url', image_url: { url: `data:${img.mime};base64,${data}` } },
                    ];
                    conv.push({ role: 'user', content: parts } as ChatMessage);
                } catch { /* the tool already reported a missing screenshot */ }
            }
            if (ending) break;

            quietSteps = progressed ? 0 : quietSteps + 1;
            if (quietSteps >= STALL_STEPS) {
                warnings++;
                if (warnings > 2) { ending = { status: 'failed', reason: `nothing changed in ${STALL_STEPS} steps, after two warnings` }; break; }
                conv.push({ role: 'user', content: `In the last ${STALL_STEPS} steps no file changed, no command succeeded and no page was served. Step back: what is blocking you? List the likely causes, pick the most likely, and test it.` });
                quietSteps = 0;
            }
        }
    } finally {
        endPdf();
        served = deps.processes.list();
        try { await deps.processes.stopAll(); } catch { /* reported by the registry */ }
        if (browser) { try { await (browser as BrowserSession).close(); } catch { /* already closed */ } }
        await conv.flushed();
    }

    const status = ending?.status ?? 'failed';
    const result: EngineResult = {
        status,
        summary: status === 'delivered' ? summary : (ending?.reason ?? summary),
        reason: ending?.reason,
        verification: state.verifications[state.verifications.length - 1],
        filesChanged: [...state.files.values()],
        served,
        steps: state.steps,
        model: deps.model.label,
        ...(status === 'delivered' && howToRun ? { howToRun } : {}),
        durationMs: Math.max(0, now() - startedAt),
        ...(deps.model.spentUsd != null ? { costUsd: deps.model.spentUsd } : {}),
    };
    try {
        await fsp.writeFile(path.join(stateDir, 'result.json'), JSON.stringify({
            ...result, plan: state.plan, modelMs: state.modelMs, toolMs: state.toolMs,
            compactions: conv.compactions, usage,
        }, null, 2), 'utf8');
    } catch { /* the result is still returned */ }
    req.emit({ type: 'final', result });
    return result;
}
