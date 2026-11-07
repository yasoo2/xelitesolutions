/**
 * THE AGENT ENGINE'S CONTRACTS.
 *
 * Joe's first engine builds a project by planning phases and calling 96
 * special tools, most of which write fixed project code. The model fills
 * gaps and gates judge the result. A defect in the generated code can only be
 * met by asking the same model the same question again, because nothing in
 * that chain lets the model look at what it wrote.
 *
 * This engine works the way Codex, Claude Code and Manus work. One model
 * drives a short, fixed list of general tools in a loop:
 *
 *     read → write → run → look (terminal, served page, screenshot) → fix
 *
 * and it is done only when Joe's checks prove the request was delivered.
 *
 * Everything the loop, the tools and the checks share is declared here, so
 * each part can be built and tested on its own.
 */

/* ───────────────────────── conversation ───────────────────────── */

/** One function call exactly as the model wrote it. `arguments` is JSON text. */
export interface ToolCall {
    id: string;
    name: string;
    arguments: string;
}

export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

/** OpenAI-shaped chat messages: what the router and every provider read. */
export type ChatMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string | ContentPart[] }
    | {
        role: 'assistant'; content: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
        /**
         * The turn exactly as a native provider returned it (Claude's content
         * blocks, thinking included), replayed unchanged on the next call.
         * Opaque to everything but that provider's connector.
         */
        native?: unknown[];
    }
    | { role: 'tool'; tool_call_id: string; content: string };

/** The function schema sent with every step. Built once per run. */
export interface ToolSchema {
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** One model turn. */
export interface ModelStep {
    /** Visible text. Empty when the model only called tools. */
    text: string;
    toolCalls: ToolCall[];
    /** Tool calls read out of the text, because the model wrote them as text. */
    toolCallsFromText?: boolean;
    /**
     * promptTokens is the size of the prompt; promptEvaluated is how much of it
     * the server actually computed. The difference is the prefix it reused.
     */
    usage?: { promptTokens?: number; promptEvaluated?: number; completionTokens?: number; cacheReadTokens?: number; costUsd?: number };
    durationMs: number;
    /** The turn as the provider returned it, when the provider needs it replayed (see ChatMessage). */
    native?: unknown[];
}

/** The model as the loop sees it, so a test can drive the loop with a script. */
export interface EngineModel {
    step(messages: ChatMessage[], tools: ToolSchema[], opts: { signal: AbortSignal; deadlineAt: number }): Promise<ModelStep>;
    /** Usable context window in tokens. The loop compacts before it is full. */
    contextTokens(): number;
    /** True when image parts reach the model, so screenshots can be shown to it. */
    readonly vision: boolean;
    /** A label for the receipt: provider and model. */
    readonly label: string;
    /** Dollars this model has been billed in this run, for a paid model. */
    readonly spentUsd?: number;
}

/* ───────────────────────── tools ───────────────────────── */

export interface ToolOutcome {
    ok: boolean;
    /**
     * What the model reads. A tool keeps it bounded itself (a long command
     * log gives its head and tail). The loop bounds it once more, and saves
     * the full text in the state folder so nothing is lost for good.
     */
    output: string;
    /** Images the model should look at on its next turn (absolute paths). */
    images?: { path: string; mime: string }[];
    /** Facts for the run state, the UI and the checks. Never shown verbatim. */
    facts?: ToolFacts;
}

export interface FileChange {
    path: string;            // relative to the project folder, forward slashes
    change: 'created' | 'modified' | 'deleted';
    bytes?: number;
}

export interface CommandFact {
    command: string;
    cwd: string;             // relative to the project folder
    exitCode: number | null; // null: killed, timed out or never started
    durationMs: number;
    timedOut?: boolean;
}

export interface PageFact {
    url: string;
    status?: number;
    title?: string;
    textLength: number;
    consoleErrors: string[];
    failedRequests: string[];
    screenshotPath?: string;
}

export interface ToolFacts {
    filesChanged?: FileChange[];
    command?: CommandFact;
    served?: ProcessInfo;
    page?: PageFact;
    plan?: PlanState;
    verification?: VerificationReport;
}

export type ParseResult<A> = { ok: true; value: A } | { ok: false; error: string };

/**
 * One tool. The list is fixed for the whole run (Manus: a tool that appears or
 * disappears mid-run breaks the prompt cache and leaves earlier calls naming a
 * tool that is gone). A tool that cannot act now says why in its output.
 */
export interface EngineTool<A = any> {
    /** snake_case and grouped by prefix: shell_, file_, browser_, web_, plan_, task_. */
    name: string;
    /** Written for the model: what it does, when to use it, what it returns. */
    description: string;
    /** JSON Schema for the arguments. Keys in a fixed order, so the prefix stays byte-stable. */
    parameters: Record<string, unknown>;
    /** Check and normalise the model's arguments. An error tells the model what to change. */
    parse(args: unknown): ParseResult<A>;
    run(args: A, ctx: ToolContext): Promise<ToolOutcome>;
}

/* ───────────────────────── run-scoped services ───────────────────────── */

export interface ProcessInfo {
    name: string;
    command: string;
    cwd: string;             // relative to the project folder
    pid?: number;
    running: boolean;
    exitCode?: number | null;
    /** The address the process was SEEN serving on, never a guess. */
    url?: string;
    port?: number;
    startedAt: number;
}

/** Background processes of one run: dev servers, watchers. All stop with the run. */
export interface ProcessRegistry {
    start(spec: { name: string; command: string; cwd: string; port?: number; readyTimeoutMs?: number }): Promise<ProcessInfo & { output: string }>;
    logs(name: string, lines?: number): (ProcessInfo & { output: string }) | undefined;
    stop(name: string): Promise<boolean>;
    list(): ProcessInfo[];
    stopAll(): Promise<void>;
}

export type BrowserAction =
    | { action: 'click'; ref: string }
    | { action: 'type'; ref: string; text: string; submit?: boolean }
    | { action: 'select'; ref: string; value: string }
    | { action: 'press'; key: string }
    | { action: 'scroll'; direction: 'up' | 'down' }
    | { action: 'back' }
    | { action: 'reload' };

export interface PageState extends PageFact {
    /** Visible text, bounded. */
    text: string;
    /** Interactive elements with the short refs browser_act takes: `[e12] button "Save"`. */
    elements: string[];
}

/** One browser context per run, opened on first use, closed with the run. */
export interface BrowserSession {
    open(url: string): Promise<PageState>;
    act(action: BrowserAction): Promise<PageState>;
    screenshot(fullPage?: boolean): Promise<string>;
    close(): Promise<void>;
}

/* ───────────────────────── plan and requirement ledger ───────────────────────── */

export type RequirementStatus = 'open' | 'done' | 'blocked';

/**
 * The requested items, read from the request by the same reader the final
 * judge uses, so the plan and the verdict talk about the same things. The
 * model may add items and report progress; it cannot drop one.
 */
export interface Requirement {
    id: string;              // R1, R2, … : short, for the model
    text: string;
    status: RequirementStatus;
    evidence?: string;
    /** Seeded from the request (true) or added by the model during the run. */
    fromRequest: boolean;
    /** The exact span of the request it came from, when the reader gave one. */
    quote?: string;
    /** The acceptance judge's own stable id for it, so the verdict maps back. */
    key?: string;
}

export interface PlanStep {
    title: string;
    status: 'pending' | 'in_progress' | 'done';
}

export interface PlanState {
    requirements: Requirement[];
    steps: PlanStep[];
    note?: string;
    revision: number;
}

/* ───────────────────────── verification ───────────────────────── */

export type CheckStatus = 'passed' | 'failed' | 'skipped';

export interface CheckResult {
    id: string;              // e.g. 'files', 'build', 'serve', 'render', 'requirements'
    status: CheckStatus;
    /** What was measured, in a sentence the model and the owner can act on. */
    detail: string;
    /** Requirement ids this check judged, when it judged any. */
    requirementIds?: string[];
}

export interface VerificationReport {
    passed: boolean;
    checks: CheckResult[];
    /** The requirements still not proven, with the reason for each. */
    unproven: { id: string; text: string; reason: string }[];
    at: number;
}

/* ───────────────────────── run state, events, entry ───────────────────────── */

export interface RunState {
    plan: PlanState;
    files: Map<string, FileChange>;
    commands: CommandFact[];
    served: ProcessInfo[];
    pages: PageFact[];
    verifications: VerificationReport[];
    steps: number;
    modelMs: number;
    toolMs: number;
}

export type EngineEvent =
    | { type: 'step'; step: number }
    | { type: 'thought'; text: string }
    | { type: 'tool_call'; id: string; name: string; args: unknown }
    | { type: 'tool_result'; id: string; name: string; ok: boolean; output: string; durationMs: number; facts?: ToolFacts }
    | { type: 'plan'; plan: PlanState }
    | { type: 'compacted'; removedMessages: number; summaryChars: number }
    | { type: 'verification'; report: VerificationReport }
    | { type: 'final'; result: EngineResult };

export interface ToolContext {
    runId: string;
    /** Absolute project folder. Every path a tool touches stays inside it. */
    projectDir: string;
    /** `<projectDir>/.joe`: full logs, screenshots and the transcript. */
    stateDir: string;
    signal: AbortSignal;
    /** Settles when the run is cancelled: ExecutionEngine's `cancel` option. */
    cancelled: Promise<void>;
    deadlineAt: number;
    /** The request's language, as Joe read it: the app speaks it. */
    language: string;
    /**
     * The language Joe speaks to the user in: the language set in Joe's
     * interface (replyLanguageCode). The notes, the summary and the verdict
     * use it; the app keeps the request's language.
     */
    replyLanguage?: string;
    request: string;
    processes: ProcessRegistry;
    /** Created on first use. */
    browser(): BrowserSession;
    state: RunState;
    emit(event: EngineEvent): void;
    /** Joe's own run context, for execution leases and the provider mesh. */
    joe: any;
    /** Set when the run changes a project that already exists (EngineRequest.change). */
    change?: ChangeContext;
}

export interface EngineRequest {
    runId: string;
    request: string;
    language: string;
    /** The interface's language: what Joe says is said in it (see ToolContext.replyLanguage). */
    replyLanguage?: string;
    projectDir: string;
    deadlineAt: number;
    signal: AbortSignal;
    emit(event: EngineEvent): void;
    joe: any;
    /** Set when the run changes a project an earlier run built (see run.ts changeContextFor). */
    change?: ChangeContext;
    /** Operate: the run acts on the owner's computer instead of building (operate.ts). */
    operate?: boolean;
}

/** One earlier run of a project: what was asked, and what came of it. */
export interface ProjectRun {
    request: string;
    status: string;
    summary: string;
}

/** What a change run is told about the project it changes. */
export interface ChangeContext {
    /** The project's earlier runs, oldest first. */
    history: ProjectRun[];
    /** The version kept just before this change, which «تراجع» restores. */
    snapshot?: string;
    /**
     * Set when the folder is the user's own repository, brought into the chat
     * (an import or an attached folder), not a project Joe built: the change
     * is judged the way a change to a codebase is (verify.ts, repository mode).
     */
    repository?: RepositoryContext;
}

/** The user's own repository, as it was before this run touched it. */
export interface RepositoryContext {
    /** Source problems it already had: they are the repository's, not this change's. */
    baselineSourceProblems: string[];
}

export type EngineStatus = 'delivered' | 'failed' | 'cancelled';

export interface EngineResult {
    status: EngineStatus;
    /** The model's last summary, or the honest reason the run stopped. */
    summary: string;
    reason?: string;
    verification?: VerificationReport;
    filesChanged: FileChange[];
    served: ProcessInfo[];
    steps: number;
    model: string;
    /** How to install and start it, as the model told task_finish when it delivered. */
    howToRun?: string;
    /** The run's wall time, from its first step to its end. */
    durationMs?: number;
    /** What the run's model calls cost, when the provider prices them. */
    costUsd?: number;
}
