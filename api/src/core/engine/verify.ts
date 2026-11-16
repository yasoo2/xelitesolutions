/**
 * WHAT task_finish RUNS: JOE'S OWN DELIVERY GATES, ON THE PROJECT AS IT IS.
 *
 * The model's claim is never evidence. The verdict is computed from the
 * project folder, the commands Joe runs on it, the server project_run starts
 * and the page it serves, and the acceptance judge's reading of the source —
 * the same gates the canonical pipeline delivers by (map R5, C0-C15), in the
 * order it applies them:
 *
 *   roles → source → manifest → build → live run (or the program's own
 *   tests) → scope → records → server → interface → acceptance → visible
 *   Browser QA → one verdict
 *
 * Every step is recorded in one DeliveryLedger, or skipped with its reason.
 * A different instrument never clears another's failure, and the verdict is
 * deliveryVerdict over the whole ledger. The report passes only when the
 * delivery is VERIFIED: a partial delivery (named scope missing) is not
 * passed, so the model keeps fixing.
 *
 * Template-only gates are not called here (uncoveredFeatures, stockEngineGaps,
 * deriveRequestFidelity, the catalogue and structural acceptance criteria):
 * they read the generators' identifiers, and a hand-written project would be
 * judged by a template it never used.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CheckResult, EngineResult, ProcessInfo, Requirement, ToolContext, VerificationReport } from './types';
import { reportText, type FinishArgs, type Verifier } from './finish';
import { deliveryFooter, deliveryProofPaths, instrumentName, qaCoverageLine, qaCoverageOf } from './certificate';
import {
    DeliveryLedger, DELIVERY_PRIORITY, browserQaTargetUrl, deliveryVerdict, mayRunBrowserQa, readAsRequirements, stillUnread, stillUnverified, verifiedLiveUrl,
    type DeliveryInstrument, type DeliveryMeasurement, type DeliveryVerdict,
} from '../quality/delivery-verdict';
import { deliveryRun, type DeliveryRunInput, type DeliveryRunState } from '../quality/delivery-run';
import { acceptanceBlocksDelivery, deliveryErrorForAcceptance, deliveryErrorForUnreadRequest, readRequestRequirements } from '../quality/acceptance-gate';
import { judgeAcceptance, type Criterion } from '../quality/acceptance';
import { isAppearanceRequirement, judgeAppearance, type JudgedAppearance, type Look } from '../quality/appearance';
import { judgeSourceOf, nothingWasJudged, verifyNamed, type JudgedNamed, type NamedRequirement } from '../quality/named-requirements';
import { judgeTestSuiteByRun, type RunVerdict } from '../quality/test-suite-requirement';
import type { SignInAccount } from '../quality/sign-in';
import { asksRolePermissions, measureRoles, roleLeakError, type RoleAccount } from '../quality/role-probe';
import { runRequestedTests, testsRequestedIn } from '../quality/request-coverage';
import { checkJavaScriptSyntax } from '../quality/js-syntax-check';
import { undefinedJsxComponentMismatch, undefinedSourceReferenceMismatch } from '../quality/source-contract';
import { runPython } from '../quality/python-runtime';
import { auditBuiltApp, COVERAGE_RETRY_TIMEOUT_MS, type AppAudit } from '../quality/app-audit';
import {
    acquireVerifyLock, addressIsFree, appDataChanges, discardSnapshot, isData, isInsideFolder, RECOVERY_BUDGET, recoveryHome, recoveryProjectDir,
    recoveryRunDir, recoveryVersionDir, restoreAppData, restoreLine, snapshotAppData, VERIFY_LOCK_WAIT_MS, watchAppData,
    type AppDataSnapshot, type AppDataWatch, type VerifyLock,
} from '../quality/qa-leaves-no-trace';
import { chooseQaPath, hasDeliveryRecord, strictest, type QaPath, type QaPathChoice, type QaPin, type QaReason, type QaReasonKey, type QaRecord } from '../quality/qa-target';
import { startQaFence, type QaFence } from '../quality/qa-fence';
import { createQaWindows, unexplainedFiles, type QaWindows } from '../quality/qa-windows';
import { isJoeAppKit, listProjectFiles, MACHINE_STATE_DIRECTORIES } from '../../shared/utils/project-tree';
import { lookAtPdfs, type PdfLook } from '../quality/outside-probe';
import { outsideLines, type PdfRecordEntry } from '../quality/outside-parts';
import { isArabicReply, replyLanguageCode, say as pick } from '../../shared/reply-language';
import { isWithinRoot } from '../../modules/tools/path-containment';
import { mendable, mendIsBetter, mendPage, refuses, whyMendNotBetter, type Mender } from './browser-mend';
import { resolveInProject } from './workspace';
import { projectOriginFor } from './run';
import { detectStart } from '../../modules/tools/definitions/ProjectRunTool';
import {
    BUILD_COMMAND_NAMED, buildPipelineDecisionEvidence, deliveredPageDirectory, hasOnlyBrowserQaInfrastructureFindings,
    inspectProjectQualityContract, missingRequestedServer, postRepairRunOutcome, projectAuditDirectory, projectAuditRoots,
    requestedDeliveryRoles, rootHasBuildStep, servedInterfaceDirectory, servesHtmlAtRoot,
} from '../../modules/tools/definitions/ProjectPipelineTool';

/* ───────────────────────── what a verification leaves behind ───────────────────────── */

export type DeliveryStatus = 'delivered' | 'blocked' | 'not_verified' | 'partial';

/** One judged requirement of the request, by the plan's id and the judge's. */
export interface JudgedRequirement {
    /** R1…Rn in the plan. */
    id: string;
    /** The reader's own id (Requirement.key). */
    key: string;
    text: string;
    verdict: 'met' | 'unmet' | 'unprovable';
    why: string;
    /**
     * Where it was judged: on the source, or on a screenshot of the page (a
     * requirement about how the page looks, core/quality/appearance.ts). An
     * unprovable look never blocks; an unmet one fails the Browser QA. A
     * requirement for the project's own tests is judged on Joe's run of them
     * (core/quality/test-suite-requirement.ts).
     */
    judgedBy?: 'source' | 'sight' | 'tests';
}

/** Everything the verdict was made from, kept so the run's receipt can be built from it. */
export interface DeliveryRecord {
    projectRoot: string;
    primary: 'live' | 'program';
    required: DeliveryInstrument[];
    measurements: DeliveryMeasurement[];
    verdict: DeliveryVerdict;
    executionStatus: 'completed' | 'partial' | 'failed';
    verificationStatus: string;
    deliveryStatus: DeliveryStatus;
    /** The URL the live run confirmed, when it did. */
    liveUrl?: string;
    /** Required instruments with no measurement, and why each was not measured. */
    notMeasured: Record<string, string>;
    acceptance: { requirements: JudgedRequirement[]; requestUnread: boolean; whyNotRead: string };
    scopeAudit?: DeliveryRunState['scopeAudit'];
    requestCoverage?: DeliveryRunState['requestCoverage'];
    browserQa?: AppAudit;
    /** The account the Browser QA signed in with, when it did (its name only, never its password). */
    signedInAs?: string;
    /** What each role's menu offered, when the permissions held (quality/role-probe.ts). */
    roleViews?: Array<{ role: string; screens: string[] }>;
    /** The run's own servers this verification stopped before its live run. */
    stoppedServers: string[];
    /**
     * What Joe saw in the app's PDFs (design arabic-pdf v9 §4–§5): told only, on a
     * verified right-to-left delivery with a PDF mechanism or a PDF — never a verdict.
     */
    pdf?: PdfRecordEntry[];
    /**
     * How Joe's checks treated the owner's data on a change run (design v13.3 §9): the path of the last
     * measurement kept, what it could not try, the probes it did not run, and the recovery copy kept on 2T.
     * Absent on a new build (no delivery record): its checks ran as they always have.
     */
    qaPath?: DeliveryQaPath;
    /** What the measurements printed along the way (bounded; the count of lines left out is kept). */
    log: string[];
}

/** DeliveryRecord.qaPath: the measured facts the owner's lines are said from (qaPathLines), never the lines themselves. */
export interface DeliveryQaPath {
    path: QaPath;
    /** The reason's «why» (owner-lines13.json reasonToWhy), when the path was chosen for a reason. */
    why?: string;
    /** The first reason's own words. */
    whyDetail?: string;
    /** Requests the app's page made to other addresses, stopped by the fence (Chromium's own left out). */
    blocked: number;
    blockedHosts?: string[];
    /** What the no-write walk did not press or send because it would save data. */
    notTried: string[];
    skippedProbes: Array<'isolation' | 'builderProofs'>;
    /** 2T: the copies kept outside the project (§5b) — counts and file names only, never a folder. */
    recovery?: { versions: number; bytes: number; unexplained: string[]; overBudget: boolean; keptDays: number; runId?: string };
    /** The walked address. */
    origin?: string;
    /** Whether a browser walk was measured and kept (the lines about the walk are said only then). */
    walked?: boolean;
    /** The walk signed in with the account given (the one write path 3 allows). */
    signedIn?: boolean;
    /** The fence did not start, so the checks ran on path 3 (§4.5). */
    fenceDown?: boolean;
    /** Another check of the project held its lock past the wait: this one saved nothing and put nothing back (§5b step 5). */
    lockBusy?: boolean;
    /** A later measurement ran another way than the pin; the first stands (§2.3). */
    notComparable?: { from: QaPath; to: QaPath };
    /** Data files the put-back could not restore. */
    putBackFailed?: string[];
    /** M3: where the version from before the checks of `putBackFailed` is: among the recovery copies, or a temporary folder. */
    putBackFailedBefore?: 'copies' | 'snapshot';
    /**
     * Review 7, B1/H3: the data files that changed while the checks ran (the project's own tests, the walk, the app's
     * own start, the owner or his customers) and were put back as they were before them — on every path.
     */
    putBack?: string[];
    /** Data files that changed during the checks and were NOT put back, and why (another check held the lock, the server would not stop). */
    leftChanged?: { files: string[]; why: 'lockBusy' | 'serverRunning' };
    /** Path 3 (W10): GETs the app answered with a redirect to a page — a sign they saved something. */
    writeSignals?: string[];
    /** Path 3 (W11): the page's background workers were not created (no fence could read what they send). */
    workersHeld?: boolean;
}

/** A VerificationReport that also carries what it was computed from. */
export interface DeliveryVerification extends VerificationReport {
    delivery: DeliveryRecord;
}

/* ───────────────────────── visible Browser QA ───────────────────────── */

/**
 * What the verification tells the walk about the owner's data (design v13.3 §2): his project folder, the loop's
 * pin, the panel the walk is streamed to, the app's other live addresses, how project_run started it, and the folder
 * it runs from. auditBuiltApp's door reads them (app-audit.ts); declared here too, so this file stands alone.
 */
interface QaAuditOptions {
    projectRoot?: string;
    qaPin?: QaPin;
    streamTo?: string;
    walkedOrigins?: string[];
    startKind?: string;
    serverRoot?: string;
}
type AuditOptions = NonNullable<Parameters<typeof auditBuiltApp>[1]> & QaAuditOptions;

/** What a walk says about how it treated the owner's data (AppAudit.qaPath, design v13.3 §9). */
interface AuditQaPath {
    path: QaPath;
    reasons?: QaReason[];
    comparable?: boolean;
    windows?: Array<{ start: number; end: number; long: boolean; writes?: boolean }>;
    blocked?: number;
    blockedHosts?: string[];
    notTried?: string[];
    streamed?: boolean;
    signedIn?: boolean;
    writeSignals?: string[];
    workersHeld?: boolean;
}
const qaOf = (audit: AppAudit | undefined): AuditQaPath | undefined => (audit as (AppAudit & { qaPath?: AuditQaPath }) | undefined)?.qaPath;
/** A walk measured the way the loop pinned (§2.3): only such a walk is compared with another. */
const comparableWalk = (audit: AppAudit | undefined): boolean => qaOf(audit)?.comparable !== false;

/** The Browser panel the visible QA runs in. Joe's panel by default; a test gives its own. */
export interface BrowserQa {
    /** Ask the panel to come forward, then say whether someone is watching it. */
    watcher(ctx: ToolContext): Promise<{ sessionId: string; watching: boolean }>;
    audit(dir: string, opts: AuditOptions): Promise<AppAudit>;
}

/** How long the panel, which loads lazily, is given to attach after it is asked to come forward (the pipeline's own wait). */
export const PANEL_WATCH_BUDGET_MS = 15_000;

function chatSessionOf(ctx: ToolContext): string {
    const joe = ctx.joe || {};
    return String(joe.toolContext?.sessionId || joe.sessionId || '').trim();
}

/**
 * The run's own Browser panel session: the one Joe's tools were given, else
 * the one run.ts derives for this chat (`browser:<session>`). Never a panel
 * shared by every user: on a server another person's panel would watch this
 * run's audit. With no session at all there is no panel to watch, and the
 * audit is unmeasured — never passed.
 */
function panelSessionOf(ctx: ToolContext): string {
    const joe = ctx.joe || {};
    const own = String(joe.toolContext?.browserSessionId || joe.browserSessionId || '').trim();
    if (own) return own;
    const chat = chatSessionOf(ctx);
    return chat ? `browser:${chat}` : '';
}

/**
 * Joe's Browser panel: asked to come forward (panel_focus, addressed to this
 * run's chat only — an unaddressed event reaches every connected user), its
 * browser session warmed so the audit can borrow it, and given the wait to
 * attach. The audit is auditBuiltApp with the visible browser required.
 */
/**
 * One browser finding as the model and the owner read it. Its evidence is
 * often a list of elements: written as JSON, not as «[object Object]».
 */
/** What the builder can do about a finding, when the finding itself does not say. */
const FINDING_HINT: Record<string, string> = {
    authenticated_coverage_missing: 'give task_finish "sign_in": {"username": …, "password": …} — an account the project seeds — and Joe signs in through the product\'s own form and tests the screens behind it',
    //  The walk's own clock (app-audit.ts keptWalks): what it finished is kept for the next walk over the same code.
    qa_budget_exhausted: 'this is the walk\'s clock, not a defect found in the product. Every page the walk finished is kept: call task_finish again WITHOUT changing any file and the walk goes on from where it stopped. A change to any file of the project starts the walk again from the first page, so change a file only for a real defect',
};

export function browserFindingLine(f: { id?: unknown; detailEn?: unknown; detail?: unknown; evidence?: unknown }): string {
    const hint = FINDING_HINT[String(f.id || '')];
    const detail = `${String(f.detailEn || f.detail || '').trim()}${hint ? `: ${hint}` : ''}`;
    const ev = f.evidence == null || f.evidence === '' ? ''
        : typeof f.evidence === 'string' ? f.evidence
        : (() => { try { return JSON.stringify(f.evidence); } catch { return ''; } })();
    return `${String(f.id || 'finding')} — ${detail}${ev ? ` [${ev.slice(0, 160)}]` : ''}`;
}

export function panelBrowserQa(opts: { watchBudgetMs?: number } = {}): BrowserQa {
    const budgetMs = opts.watchBudgetMs ?? PANEL_WATCH_BUDGET_MS;
    return {
        async watcher(ctx) {
            const sessionId = panelSessionOf(ctx);
            if (!sessionId) return { sessionId, watching: false };
            const chat = chatSessionOf(ctx);
            if (chat) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    require('../../api/ws').broadcast({ type: 'panel_focus', sessionId: chat, data: { panel: 'browser', reason: 'engine_qa' } });
                } catch { /* the panel is asked to come forward; the wait below is what decides */ }
            }
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            try { require('../../modules/browser/manager').warmBrowserSession(sessionId); } catch { /* the audit reports its own borrow failure */ }
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { waitForPanelWatcher } = require('../../modules/browser/wsHub');
                return { sessionId, watching: await waitForPanelWatcher(sessionId, budgetMs) === true };
            } catch {
                return { sessionId, watching: false };
            }
        },
        audit: (dir, auditOpts) => auditBuiltApp(dir, auditOpts),
    };
}

/* ───────────────────────── the verifier ───────────────────────── */

export interface VerifierDeps {
    /** The model the request reader and the acceptance judge ask (Joe's contract asker in production). */
    ask: (prompt: string) => Promise<string>;
    /** One of Joe's tools through ToolService: quality_run, project_run, project_stop, shell_execute. */
    runTool: (tool: string, input: any) => Promise<any>;
    browserQa?: BrowserQa;
    /** The same model shown a screenshot, when it can see: judges what the request says about the look. */
    look?: Look;
    /** Joe's own repair of what the browser found, before he refuses (browser-mend.ts); null: none. */
    mend?: Mender | null;
}

/** The order the report lists the instruments in: the order they are measured. */
const REPORT_ORDER: DeliveryInstrument[] = ['source', 'quality', 'build', 'live', 'program', 'scope', 'coverage', 'tests', 'service', 'acceptance', 'browser', 'roles'];

const LOG_LINES = 120;
/** The whole log of one verification, kept in the run's own folder: the report keeps only its first LOG_LINES. */
const FILE_LOG_LINES = 4000;
/** A source file larger than this is not handed to the judge; the acceptance check names each one left out. */
const JUDGE_FILE_BYTES = 1_000_000;

function message(e: unknown): string {
    return String((e as any)?.message ?? e ?? 'unknown error').slice(0, 400);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The end of a long text: a compiler's or a runner's own words are at the end of what it printed. */
function tail(text: string, max = 600): string {
    const t = String(text || '').trim();
    return t.length > max ? `…${t.slice(-(max - 1))}` : t;
}

const yieldTurn = () => new Promise<void>(resolve => setImmediate(resolve));

export function createVerifier(deps: VerifierDeps): Verifier {
    const browserQa = deps.browserQa ?? panelBrowserQa();
    //  The claim (task_finish's summary, url and evidence) is never read: the
    //  verdict is measured on the project and judged against the request. Its
    //  sign-in account is not a claim but a key the checks try on the
    //  product's own form: a wrong one fails to sign in (quality/sign-in.ts).
    return (ctx: ToolContext, claim: FinishArgs) => verifyDelivery(ctx, deps, browserQa, claim?.sign_in, claim?.accounts);
}

/**
 * What project_run is asked to start, after the run's own servers are stopped.
 *
 * The live run measures a FRESH start of the code as it is now (restart:
 * true). A server this run started with shell_start may still run the code
 * from before the last edit, and it holds the port the project binds, so the
 * fresh start would die on a busy port and be read as a broken project. Those
 * servers are stopped first — only the ones seen serving an address inside
 * the project folder. A database or a watcher that serves no address keeps
 * running: the project may need it.
 *
 * project_run knows how Node, TypeScript and static projects start
 * (detectStart), and it never guesses for any other stack (map R5, C6: a
 * Python or Go server). When it knows no command for the project, the command
 * is the one this run's own server was seen serving with — a command Joe ran
 * and watched answer, never the model's claim in task_finish.
 */
async function liveRunInput(ctx: ToolContext, root: string): Promise<{ input: Record<string, unknown>; stopped: string[]; adopted?: { name: string; command: string } }> {
    let own: ProcessInfo[] = [];
    try { own = ctx.processes?.list?.() || []; } catch { own = []; }
    const inside = (rel: string): string => {
        const abs = path.resolve(root, String(rel || '.'));
        return abs === root || isWithinRoot(abs, root) ? abs : '';
    };
    const serving = own.filter(p => p && p.running && String(p.url || '').trim() && inside(p.cwd));
    const stopped: string[] = [];
    for (const p of serving) {
        try { if (await ctx.processes.stop(p.name)) stopped.push(p.name); } catch { /* the registry reports its own stop failure */ }
    }
    const input: Record<string, unknown> = { cwd: root, restart: true };
    let knowsHow = true;
    try { knowsHow = (await detectStart(root, 0)).kind !== 'unknown'; } catch { knowsHow = true; }
    if (!knowsHow) {
        const from = serving.find(p => inside(p.cwd) === root && String(p.command || '').trim())
            || serving.find(p => String(p.command || '').trim());
        if (from) {
            input.cwd = inside(from.cwd);
            input.command = String(from.command).trim();
            return { input, stopped, adopted: { name: from.name, command: String(from.command).trim() } };
        }
    }
    return { input, stopped };
}

/** How many verification logs a project keeps: the newest, the rest are let go. */
const KEPT_VERIFICATION_LOGS = 12;

/**
 * Every line one verification printed, in the project's own .joe/logs (never walked as code).
 * Every step of the way is checked by resolveInProject — no link anywhere, so a «.joe» link in
 * an imported repository cannot carry the log out of the project — and only the newest
 * KEPT_VERIFICATION_LOGS are kept (the review of 2026-11-10).
 */
export async function keepVerificationLog(projectDir: string, lines: string[]): Promise<string> {
    if (!lines.length) return '';
    try {
        let dir = await resolveInProject(projectDir, '.joe/logs', 'list');
        if (dir.ok && !dir.exists) {
            await fs.promises.mkdir(dir.abs, { recursive: true });
            dir = await resolveInProject(projectDir, '.joe/logs', 'list');
        }
        if (!dir.ok || !dir.exists || !dir.isDir) return '';
        const name = `verification-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
        const file = await resolveInProject(projectDir, `.joe/logs/${name}`, 'list');
        if (!file.ok || file.exists) return '';
        await fs.promises.writeFile(file.abs, lines.join('\n') + '\n', { encoding: 'utf8', flag: 'wx' });
        const old = (await fs.promises.readdir(dir.abs)).filter(n => /^verification-.*\.log$/.test(n)).sort().slice(0, -KEPT_VERIFICATION_LOGS);
        for (const n of old) await fs.promises.unlink(path.join(dir.abs, n)).catch(() => { /* already gone */ });
        return file.abs;
    } catch {
        return '';
    }
}

/* ───────────────────────── the owner's data during a verification (design v13.3) ───────────────────────── */

/**
 * ⛔ A CHANGE RUN'S CHECKS NEVER LEAVE THE OWNER'S DATA WORSE THAN TODAY'S.
 *
 * A folder Joe has delivered before is the owner's app, and he may have put his
 * own records in it. So before anything starts, the verification chooses once how
 * its checks treat that data (qa-target.ts chooseQaPath, §2.5) and pins it for
 * every walk it takes (§2.3): a new build as today; Joe's static preview or a
 * proven front in a private, fenced window that writes nothing of his (path 1);
 * a Node server whose data today's put-back covers, walked as today behind the
 * fence (2T, §5b); anything else walked without saving anything (path 3, §5).
 * And on EVERY path (review 7, B1/H3): the snapshot is taken before any check
 * that can write, the project's own tests included; every version of his data
 * files is copied outside the project while the checks run; and what changed is
 * put back as main put it back, and told plainly. What could not be tried is
 * told, never passed.
 */
interface QaSpan {
    /** One per verification: the record read once, and the path every walk of it runs (the stricter of this and its own choice). */
    pin: QaPin;
    /** The folder has a delivery record: a change run. False: a new build, as today in every respect. */
    changeRun: boolean;
    /** The choice the final path stands on (its reasons are the owner's «why»). */
    choice?: QaPathChoice;
    /** The verification's own windows (§5b step 4). */
    windows: QaWindows;
    /** The probes' fence (§4.4), started once the app answers. */
    fence?: QaFence;
    /** Every change run: the recovery watcher, its run folder and its id, and the project's verify lock. */
    watch?: AppDataWatch;
    runDir?: string;
    runKey: string;
    workspaceId: string;
    lock?: VerifyLock;
    /** restoreAppData ran at least once (the copies were «before a put-back»). */
    putBackRan: boolean;
    putBackFailed: string[];
    fenceDown?: boolean;
    lockBusy?: boolean;
    notComparable?: { from: QaPath; to: QaPath };
    /** B1/H3: what a put-back found changed and wrote back or removed (project-relative, forward slashes). */
    putBackStores: string[];
    /** Changed during the checks and not put back (see DeliveryQaPath.leftChanged). */
    leftChanged?: { files: string[]; why: 'lockBusy' | 'serverRunning' };
    /** M3: the failed files' version from before the checks was kept: in the recovery copies, or the snapshot left in place. */
    putBackFailedBefore?: 'copies' | 'snapshot';
}

/** The workspace the run's project belongs to: the recovery copies are kept per workspace. */
function workspaceOf(ctx: ToolContext): string {
    const joe = ctx.joe || {};
    return String(joe.workspaceId || joe.toolContext?.workspaceId || 'default').trim() || 'default';
}

function originOf(url: string): string {
    try { return new URL(String(url)).origin; } catch { return ''; }
}

/** The host a fence refusal names ('POST 127.0.0.1:5055/api/orders' → 127.0.0.1:5055, 'CONNECT api.x.sa:443' → api.x.sa). */
function refusedHost(what: string): string {
    const target = String(what || '').trim().split(/\s+/u)[1] || '';
    return target.replace(/^[a-z]+:\/\//iu, '').split('/')[0].replace(/:(?:443|80)$/u, '');
}

/** The protective choice when the folder could not be read: a change run writes nothing (§2.2 «anything not proven»). */
function protectiveChoice(record: QaRecord, why: string): QaPathChoice {
    return { path: record ? 'no-write' : 'as-today', reasons: record ? [{ key: 'notProven', detail: why }] : [], record, facts: { files: 0, read: 0, ms: 0 } };
}

/** Ends the recovery watch: its copies are removed when nothing was put back over them (they guard against nothing). */
async function endRecovery(span: QaSpan, keep: boolean): Promise<void> {
    const watch = span.watch;
    span.watch = undefined;
    if (watch) await watch.stop().catch(() => undefined);
    if (!keep && span.runDir && isInsideFolder(span.runDir, recoveryHome())) {
        await fs.promises.rm(span.runDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined);
    }
    if (!keep) span.runDir = undefined;
}

async function releaseLock(span: QaSpan): Promise<void> {
    const lock = span.lock;
    span.lock = undefined;
    if (lock) await lock.release().catch(() => undefined);
}

/** Whatever happened, the watcher stops, the fence closes and the lock is released. */
async function releaseSpan(span: QaSpan): Promise<void> {
    await endRecovery(span, span.putBackRan).catch(() => undefined);
    const fence = span.fence;
    span.fence = undefined;
    if (fence) await fence.close().catch(() => undefined);
    await releaseLock(span);
}

async function verifyDelivery(ctx: ToolContext, deps: VerifierDeps, browserQa: BrowserQa, signIn?: SignInAccount, accounts?: RoleAccount[]): Promise<DeliveryVerification> {
    const span: QaSpan = {
        pin: {}, changeRun: false, windows: createQaWindows(), runKey: `${String(ctx.runId || 'run').slice(0, 60)}-${Date.now().toString(36)}`,
        workspaceId: workspaceOf(ctx), putBackRan: false, putBackFailed: [], putBackStores: [],
    };
    try {
        return await verifyDeliveryOnce(ctx, deps, browserQa, span, signIn, accounts);
    } finally {
        await releaseSpan(span);
    }
}

async function verifyDeliveryOnce(ctx: ToolContext, deps: VerifierDeps, browserQa: BrowserQa, span: QaSpan, signIn?: SignInAccount, accounts?: RoleAccount[]): Promise<DeliveryVerification> {
    const root = path.resolve(ctx.projectDir);
    //  Joe's own repair of what the browser found (browser-mend.ts): the real one unless a test gives its own, or none.
    const mender: Mender | null = deps.mend === undefined ? mendPage : deps.mend;
    //  Law 4: every gate reads the user's full request — never the model's
    //  plan or the summary it wrote in task_finish.
    const request = String(ctx.request || '');
    const isAr = isArabicReply({ language: ctx.language, text: request });
    const ledger = new DeliveryLedger();
    /** What a passing instrument measured, said to the model. */
    const passed = new Map<DeliveryInstrument, string>();
    /** Why an instrument was not measured. */
    const skipped = new Map<DeliveryInstrument, string>();
    /** What the model must also know about an instrument, whatever its status. */
    const remarks = new Map<DeliveryInstrument, string[]>();
    const remark = (instrument: DeliveryInstrument, text: string) => remarks.set(instrument, [...(remarks.get(instrument) || []), text]);
    const log: string[] = [];
    let logDropped = 0;
    /*
     * The ladder's live check, 2026-11-10 (L160): a refusal for buttons under 40 px that
     * Joe's own repairer answers, and no line anywhere said whether the repair ran — the
     * report keeps 120 lines, the walk's progress filled them, and only the last
     * verification's report was kept at all. Every line is also kept in a file.
     */
    const fileLog: string[] = [];
    const note = (line: string) => {
        if (fileLog.length < FILE_LOG_LINES) fileLog.push(`${new Date().toISOString().slice(11, 19)} ${String(line).slice(0, 2000)}`);
        if (log.length < LOG_LINES) log.push(String(line).slice(0, 600));
        else logDropped++;
    };
    const cancelled = () => ctx.signal?.aborted === true;
    const runTool = async (tool: string, input: any) => {
        try { return await deps.runTool(tool, input); }
        catch (e) { return { ok: false, error: `${tool} failed: ${message(e)}` }; }
    };
    /** A delivered root is the project folder or a folder inside it — never a path outside. */
    const deliveredRoots = (extra: string[] = []) => Array.from(new Set([root, ...extra]
        .map(r => String(r || '').trim())
        .filter(r => r && fs.existsSync(r))
        .map(r => path.resolve(r))
        .filter(r => r === root || isWithinRoot(r, root))));

    //  C1 — which parts the request asked for, from the full request.
    const roles = requestedDeliveryRoles(request);
    const programServesAPage = !!servedInterfaceDirectory(root);
    /**
     *  ⛔ THE USER'S OWN REPOSITORY IS JUDGED AS A CODEBASE, NOT AS A BUILD.
     *
     *  The Codex exam (2026-11-06): an issue on a repository Joe did not write
     *  — a library, a command-line tool, a server — is proven the way a change
     *  to a codebase is: its own test suite passes (with the test the issue
     *  asked for), the acceptance judge finds the issue's requirements met in
     *  the source, and the source has no problem it did not have before. The
     *  checks of a build from a request (the live page, the records and routes
     *  a request names, the Browser QA, the roles, the manifest contract) are
     *  for products Joe builds: a repository's issue is not a product request,
     *  and what the repository already was is not this change's to answer for.
     */
    const repository = ctx.change?.repository;
    //  A document asked for (a report, a plan, a sheet, slides) is the file, judged on what it says (select.ts asksForDocument).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const documentAsked = !repository && (require('./select') as typeof import('./select')).asksForDocument(request);
    //  …judged as a document unless a page was built around it (then the page is proven too).
    const documentOnly = documentAsked && !programServesAPage;
    const programOnly = !!repository || documentOnly || (roles.program && !roles.interface && !roles.service && !programServesAPage);
    const primary: 'live' | 'program' = programOnly ? 'program' : 'live';
    const required = new Set<DeliveryInstrument>(programOnly && !repository && !documentOnly ? ['quality'] : []);
    if (repository || documentOnly) required.add('program');
    //  The acceptance judge always rules; an unmeasured acceptance is never a pass.
    required.add('acceptance');
    note(repository
        ? 'repository: the user\'s own repository — judged by its own test suite, the acceptance judge, and no new source problem'
        : documentOnly
            ? 'document: the request asks for a document — the file is the delivery, judged on what it says; no page, server or tests are owed'
            : `roles: service=${roles.service} interface=${roles.interface} program=${roles.program}${programOnly ? ' (program only: its own tests prove it runs)' : ''}`);

    const deliveryInput: DeliveryRunInput = {
        productRequest: request,
        ledger,
        deliveryRoles: roles,
        deliveredRoots,
        deliveryParts: () => [{ root, tool: 'general_agent' }],
        runTool,
        requireInstrument: instrument => { required.add(instrument); },
        cancellation: ctx.cancelled,
        signal: ctx.signal,
        isAr,
        say: line => note(line),
        log: line => note(line),
        signIn,
    };
    const delivery = deliveryRun(deliveryInput);

    /* ── the owner's data (design v13.3 §2.5, §5b, §7): nothing below changes a new build ── */
    const pin = span.pin;
    /** Inside one of this verification's windows, on a change run (a new build keeps none). */
    const inWindow = <T>(what: string, work: () => Promise<T>): Promise<T> => span.changeRun ? span.windows.around(what, work) : work();
    /**
     * Path 3 from here on, and why (the fence, the lock or the watcher could not be had). The snapshot, the put-back,
     * the recovery copy and the lock stay: every change run puts back what its checks changed (review 7, B1).
     */
    const toNoWrite = async (why: string) => {
        if (pin.path === 'no-write') return;
        note(`qa path: ${pin.path} → no-write: ${why}`);
        pin.path = 'no-write';
        //  The probes' fence holds every write its guard did not see from now on (B2).
        try { span.fence?.holdWrites(true, signIn ? { signIn } : {}); } catch { /* the fence is gone */ }
    };
    /**
     * The project's verify lock, on every change run (§5b step 5, review 7 B1): one check at a time puts his data
     * back. A bounded wait; held past it, this check saves nothing (2T → path 3) and puts nothing back.
     */
    const takeLock = async () => {
        if (span.lock || span.lockBusy) return;
        const left = Number(ctx.deadlineAt) - Date.now();
        const waitMs = Math.max(0, Math.min(VERIFY_LOCK_WAIT_MS, Number.isFinite(left) ? left : VERIFY_LOCK_WAIT_MS));
        let lock: VerifyLock | null = null;
        try { lock = await acquireVerifyLock(span.workspaceId, root, span.runKey, { waitMs }); }
        catch (e) {
            //  No lock file could be written: the put-back still runs (as main did), but nothing is walked with writes on.
            note(`qa path: the verify lock could not be taken (${message(e)}); the checks write nothing, and what they change is still put back`);
            if (pin.path === '2t') await toNoWrite(`the verify lock could not be taken (${message(e)})`);
            return;
        }
        if (!lock) {
            span.lockBusy = true;
            note('qa path: another check of this app held its verify lock past the wait: this one saves nothing and puts nothing back');
            if (pin.path === '2t') await toNoWrite('another check of this app held its verify lock past the wait');
            return;
        }
        span.lock = lock;
    };
    /** The recovery watch over the whole span the snapshot is held (§5b steps 1–2), on every change run that puts back. */
    const watchSpan = async () => {
        if (span.watch || !dataBefore || !span.changeRun || span.lockBusy) return;
        try {
            span.runDir = recoveryRunDir(span.workspaceId, root, span.runKey);
            span.watch = watchAppData(dataBefore, { into: span.runDir, budget: RECOVERY_BUDGET });
        } catch (e) {
            span.runDir = undefined;
            await toNoWrite(`the recovery copy could not be kept (${message(e)})`);
        }
    };
    /** The app's own live addresses, from the processes running now (§4.2, G14): the run's url and this project's servers. */
    const walkedOrigins = (): string[] => {
        let own: ProcessInfo[] = [];
        try { own = ctx.processes?.list?.() || []; } catch { own = []; }
        const inside = (cwd: string) => { const abs = path.resolve(root, String(cwd || '.')); return abs === root || isWithinRoot(abs, root); };
        return Array.from(new Set([String(liveRun?.output?.url || ''), ...own.filter(p => p && p.running && inside(p.cwd)).map(p => String(p.url || ''))]
            .map(originOf).filter(Boolean)));
    };

    const stage = async (instruments: DeliveryInstrument[], measure: () => Promise<void>) => {
        if (cancelled()) {
            for (const i of instruments) if (!skipped.has(i)) skipped.set(i, 'the run was cancelled before this was measured');
            return;
        }
        try { await measure(); }
        catch (e) {
            //  A check that raised must not let the delivery through: its
            //  instrument is recorded as failed, in its own words, over
            //  whatever it recorded before it raised — as the pipeline records
            //  a live failure when its acceptance closure throws.
            for (const i of instruments) ledger.record({ instrument: i, ok: false, error: `the ${i} check could not run: ${message(e)}` });
        }
    };

    //  C2 — the source parses, and its components and names are declared.
    await stage(['source'], async () => {
        const measuredSource = await measureProjectSource(root, ctx.deadlineAt, cancelled);
        //  His repository: a problem it had before this change is its own (said, never charged).
        const before = new Set(repository?.baselineSourceProblems || []);
        const inherited = measuredSource.problems.filter(p => before.has(p));
        const source = { ...measuredSource, problems: measuredSource.problems.filter(p => !before.has(p)) };
        if (inherited.length) remark('source', `the repository already had ${inherited.length} source problem(s) before this change (not this change's): ${inherited.slice(0, 3).join(' | ')}`);
        if (!source.measured.length && !source.problems.length) {
            skipped.set('source', source.notMeasured.length
                ? `not measured: ${source.notMeasured.join('; ')}`
                : 'no JavaScript, JSX/TSX or Python source to parse');
            return;
        }
        ledger.record({
            instrument: 'source',
            ok: source.problems.length === 0,
            error: source.problems.length ? `the source does not parse or names what it never declares: ${source.problems.slice(0, 6).join(' | ')}${source.problems.length > 6 ? ` (+${source.problems.length - 6} more)` : ''}` : undefined,
        });
        passed.set('source', `parsed ${source.measured.join(', ')}`);
        if (source.notMeasured.length) remark('source', `not measured: ${source.notMeasured.join('; ')}`);
    });

    //  C3 — the manifest contract. A program records it before its own test
    //  run (as the pipeline's program proof does); a live delivery has it
    //  measured after the live run, inside recordLiveAcceptance.
    const manifestText = await fs.promises.readFile(path.join(root, 'package.json'), 'utf8').catch(() => null);
    let manifest: any = null;
    try { manifest = manifestText === null ? null : JSON.parse(manifestText); } catch { manifest = null; }
    const contract = inspectProjectQualityContract(root, request);
    const contractError = contract.ok ? undefined : `project quality contract failed — ${contract.failures.slice(0, 4).join('; ')}`;
    if (programOnly && !repository && !documentOnly) {
        ledger.record({ instrument: 'quality', ok: contract.ok, error: contractError });
    } else if (repository && !contract.ok) {
        remark('quality', `the repository's own manifest is not held to Joe's build contract (${contractError})`);
    }
    passed.set('quality', manifestText !== null
        ? 'package.json declares truthful scripts for what the request and the project need'
        : 'no package.json: no npm scripts to hold to the contract');

    //  C4 — the build, when one is owed: a bundler or TypeScript build step,
    //  or a request that names the build. It decides phaseVerified.
    const buildStep = rootHasBuildStep(root, manifest);
    const buildNamed = BUILD_COMMAND_NAMED.test(request);
    let buildsPassed = true;
    if (buildStep || buildNamed) {
        required.add('build');
        await stage(['build'], async () => {
            const run = await runTool('quality_run', { path: root, tasks: ['build'] });
            const results: any[] = Array.isArray(run?.output?.results) ? run.output.results : [];
            const executed = results.filter(r => r?.skipped === false);
            const ok = run?.ok === true && executed.length > 0 && executed.every(r => r?.ok === true);
            const why = buildStep ? 'the project has a build step' : 'the request names the build';
            ledger.record({
                instrument: 'build',
                ok,
                error: ok ? undefined : executed.length
                    ? `the build failed (${why}): ${tail(String(executed.find(r => r?.ok !== true)?.error || run?.error || 'npm run build failed'))}`
                    : `a build is owed (${why}), but none ran: ${String(run?.error || 'package.json has no build script')}`,
            });
            passed.set('build', `npm run build passed (${why})`);
        });
        if (!ledger.all().some(m => m.instrument === 'build' && m.ok)) buildsPassed = false;
    } else {
        skipped.set('build', 'no build is owed: no bundler or TypeScript build step, and the request names no build');
    }

    //  C6 — the live run, unless the request asks for a program on its own.
    //  C5 — a program's own tests prove it runs.
    let liveRun: any = null;
    let liveStarted = false;
    let stoppedServers: string[] = [];
    let auditRoots: string[] = [root];
    /** The app's records before its server was started for this check, and how it was started (qa-leaves-no-trace.ts). */
    let dataBefore: AppDataSnapshot | undefined;
    let liveInput: Record<string, unknown> | undefined;
    /** What project_run started, and from which folder: the walk's door reads them (§2 steps 1–2). */
    let serverRoot: string | undefined;
    let startKind: string | undefined;
    if (programOnly) {
        skipped.set('live', repository
            ? 'the user\'s own repository is proven by its own test suite, not by a page Joe opens'
            : documentOnly
                ? 'the request asks for a document: the file is the delivery, not a page Joe opens'
                : 'the request asks for a program, so its own test run proves it runs (there is no address to confirm)');
        await stage(['program'], async () => {
            if (documentOnly) {
                const docs = await deliveredDocuments(root);
                ledger.record({
                    instrument: 'program',
                    target: root,
                    ok: docs.length > 0,
                    error: docs.length ? undefined : 'the request asks for a document, and the project holds none: write it as a file (a report or plan as .md, a sheet as .csv, slides as .html or .md) in the project folder',
                });
                passed.set('program', `the document(s) asked for are delivered: ${docs.map(d => `${d.path} (${d.words} words)`).join(', ')}`);
                return;
            }
            const run = await runRequestedTests(root, runTool);
            if (run.noRunner) {
                skipped.set('program', `not measured, and the delivery needs it: ${run.error || 'no test runner Joe knows for this project'}`);
                return;
            }
            ledger.record({
                instrument: 'program',
                target: root,
                ok: run.passed,
                error: run.passed ? undefined : `the program's own tests ${run.ran ? 'did not pass' : 'could not run'}: ${String(run.error || '').slice(0, 400)}`,
            });
            passed.set('program', run.sameFilesAsLastPass
                ? `its own tests passed (${run.runner || 'tests'}) on these very files at the last check; nothing changed since, so they were not run again`
                : `its own tests ran and passed (${run.runner || 'tests'})`);
        });
    } else {
        skipped.set('program', 'the request asks for more than a program: the live run proves it');
        await stage(['live'], async () => {
            /*
             * §2.5: the way the checks treat his data is chosen before anything starts — before the snapshot, the
             * probes and the walk. The delivery record is read once, into the pin; a new build (none) is as today.
             */
            const origin = projectOriginFor(chatSessionOf(ctx) || undefined, root);
            //  M4: a folder this run changes (not one it made) that holds records is his app, record or none.
            pin.record = hasDeliveryRecord(root, { origin, resumed: !!ctx.change });
            span.changeRun = !!pin.record;
            if (span.changeRun) {
                let kind = 'unknown';
                try { kind = (await detectStart(root, 0)).kind; } catch { kind = 'unknown'; }
                const early = await chooseQaPath(root, { kind, hasServeUrl: true, record: pin.record })
                    .catch((e: unknown) => protectiveChoice(pin.record || '', `the project could not be read (${message(e)})`));
                pin.path = early.path;
                pin.first = early;
                span.choice = early;
                note(`qa path: a change run (${pin.record}); before the start: ${early.path}${early.reasons.length ? ` — ${early.reasons[0].key}: ${early.reasons[0].detail}` : ''} (${early.facts.files} file(s) read in ${early.facts.ms} ms)`);
                await takeLock();
            } else {
                pin.path = 'as-today';
            }
            const start = await liveRunInput(ctx, root);
            stoppedServers = start.stopped;
            if (start.stopped.length) {
                remark('live', `this run's own server(s) ${start.stopped.join(', ')} were stopped first: a server started before the last edit may still run the old code, and it holds the port; start them again with shell_start if you need them`);
            }
            if (start.adopted) {
                note(`live: project_run knows no start command for this project, so it is started with the command this run's server «${start.adopted.name}» was seen serving with: ${start.adopted.command}`);
                remark('live', `started with the command this run's server ${start.adopted.name} was seen serving with: ${start.adopted.command}`);
            }
            liveStarted = true;
            //  Read at rest, before the server holds the files and before ANY check that can write — the project's own
            //  tests included (review 7, H3): what every change run's put-back writes back (B1), whatever its path.
            dataBefore = await snapshotAppData(root).catch(() => undefined);
            await watchSpan();
            liveInput = start.input;
            const started = await inWindow('project_run', () => runTool('project_run', start.input));
            liveRun = postRepairRunOutcome(started);
            const cwd = String(liveRun?.output?.cwd || '').trim();
            const runtimeRoot = cwd && fs.existsSync(cwd) && isWithinRoot(path.resolve(cwd), root) ? path.resolve(cwd) : root;
            auditRoots = projectAuditRoots(root, runtimeRoot);
            if (span.changeRun) {
                //  Taken again on what really started (its kind, the folder it runs from); the stricter one is kept,
                //  and the put-back and the recovery copy follow this final pin (§2.5, §7).
                serverRoot = runtimeRoot;
                startKind = String(liveRun?.output?.kind || '').trim();
                let kind = startKind;
                if (!kind) { try { kind = (await detectStart(runtimeRoot, 0)).kind; } catch { kind = 'unknown'; } }
                const after = await chooseQaPath(runtimeRoot, { kind, hasServeUrl: true, record: pin.record })
                    .catch((e: unknown) => protectiveChoice(pin.record || '', `the project could not be read (${message(e)})`));
                const before = pin.path;
                pin.path = strictest(pin.path, after.path);
                if (pin.path === after.path) span.choice = after;
                note(`qa path: after the start (${kind || 'unknown kind'} in ${path.relative(root, runtimeRoot) || '.'}): ${after.path}; the checks run ${pin.path}`);
                //  2T walks with writes on only while this check holds the lock (§5b step 5).
                if (pin.path === '2t' && before !== '2t' && span.lockBusy) await toNoWrite('another check of this app held its verify lock past the wait');
                //  The probes that open their own browser reach only the app's own addresses (§4.4); no fence, path 3 (§4.5).
                //  On path 3 the fence holds every write the probes' guards did not see (review 7, B2).
                const runUrl = String(liveRun?.output?.url || '').trim();
                if (runUrl && originOf(runUrl)) {
                    try {
                        span.fence = await startQaFence({ allow: walkedOrigins(), hold: pin.path === 'no-write', ...(signIn ? { signIn } : {}) });
                    } catch (e) {
                        span.fenceDown = true;
                        await toNoWrite(`Joe's network fence did not start (${message(e)})`);
                    }
                }
                deliveryInput.qaPath = pin.path;
                if (span.fence) deliveryInput.browserProxy = span.fence.proxy;
                //  Every change run keeps its windows now: its recovery copy tells what changed outside them (B1, M2).
                deliveryInput.qaWindows = span.windows;
            }
            await delivery.recordLiveAcceptance(liveRun, root, auditRoots);
        });
    }
    const liveUrl = verifiedLiveUrl(ledger.all());
    if (liveUrl) passed.set('live', `project_run started it and it answers at ${liveUrl}${liveRun?.output?.kind ? ` (${liveRun.output.kind})` : ''}`);

    /*
     * The Browser QA leaves the app as it found it (qa-leaves-no-trace.ts):
     * before a second measurement, and once the verdict is known, the records
     * its forms made the app keep are put back — the server stopped first, and
     * started again on the same address when the page must stay live.
     * A file Joe's own repair changed on purpose is never put back.
     */
    let qaAuditsTaken = 0;
    const keptOnPurpose: string[] = [];
    const livePort = (() => { try { const p = Number(new URL(String(liveUrl)).port); return p > 0 ? p : 0; } catch { return 0; } })();
    /** Why the server Joe stopped to put the records back did not come back, when it did not (the live check is then failed). */
    let liveLostBy = '';
    /**
     * «nothing» — the app's records are as they were; «left» — not put back, the
     * server still answers (it would not stop, or something kept its port);
     * «restored» — put back, and started again when asked; «down» — put back, and
     * the server did not come back where it was: what is measured next is not the app.
     */
    const putQaRecordsBack = async (startAgain: boolean): Promise<'nothing' | 'left' | 'restored' | 'down'> => {
        if (!dataBefore) return 'nothing';
        //  A new build as today: only after a walk.
        if (!span.changeRun && !qaAuditsTaken) return 'nothing';
        /*
         * ⛔ A CHANGE RUN IS NEVER WORSE FOR HIS DATA THAN MAIN (review 7, B1/H3). Whatever the path, what changed
         * while the checks ran — a «Mark done» link the walk followed, a worker's write, the project's own tests, the
         * app's own start — is put back as main put it back, after every check that can write. A write he or his
         * customers made meanwhile is erased from the app by it, as on main, and kept in the recovery copy (told,
         * and brought back from the chat). Only another check holding the lock stops it: that check puts back.
         */
        if (span.changeRun && span.lockBusy) return 'nothing';
        return inWindow('put-back', () => putBack(startAgain));
    };
    const putBack = async (startAgain: boolean): Promise<'nothing' | 'left' | 'restored' | 'down'> => {
        if (!dataBefore) return 'nothing';
        let changes: string[] = [];
        try { changes = await appDataChanges(dataBefore, keptOnPurpose); } catch { return 'nothing'; }
        if (!changes.length) return 'nothing';
        const stop = await runTool('project_stop', {}).catch((e: unknown) => ({ ok: false, error: message(e) }));
        if (stop?.ok !== true) {
            note(`browser QA: the records its forms left could not be put back, because the server did not stop: ${String((stop as any)?.error || 'project_stop failed')}`);
            if (span.changeRun) span.leftChanged = { files: changes.map(f => path.relative(root, f).split(path.sep).join('/')), why: 'serverRunning' };
            return 'left';
        }
        //  Said stopped is not stopped: a file written back under a live server is written over again by it.
        //  The address is asked itself when there is one: «released: false» can mean a zombie the port has already left.
        if (liveUrl ? !(await addressIsFree(liveUrl)) : (stop as any)?.output?.released === false) {
            note(`browser QA: the records its forms left were not put back: something still answers at ${liveUrl || 'its address'} after the server was stopped, and a running server keeps its own copy of them`);
            if (span.changeRun) span.leftChanged = { files: changes.map(f => path.relative(root, f).split(path.sep).join('/')), why: 'serverRunning' };
            return 'left';
        }
        //  2T: one last version of every changed file, the server's shutdown writes in it, before anything is put back (§5b step 2).
        if (span.watch) await span.watch.flush('put-back').catch((e: unknown) => note(`qa path: the last recovery copy before the put-back failed: ${message(e)}`));
        const restored = await restoreAppData(dataBefore, keptOnPurpose);
        if (span.changeRun) {
            span.putBackRan = true;
            span.leftChanged = undefined;
            //  Told plainly: which of his data files changed during the checks, and that they were put back (B1).
            for (const f of [...restored.restored, ...restored.removed]) {
                const rel = f.split(path.sep).join('/');
                if (!span.putBackStores.includes(rel)) span.putBackStores.push(rel);
            }
            for (const abs of restored.failed) {
                const f = (path.isAbsolute(abs) ? path.relative(root, abs) : abs).split(path.sep).join('/');
                if (!span.putBackFailed.includes(f)) span.putBackFailed.push(f);
            }
        }
        note(`browser QA: ${restoreLine(restored)}`);
        if (!startAgain || !liveInput) return 'restored';
        const again: any = await runTool('project_run', { ...liveInput, ...(livePort ? { port: livePort } : {}) })
            .catch((e: unknown) => ({ ok: false, error: message(e) }));
        const at = String(again?.output?.url || '').trim();
        const sameAddress = !at || !liveUrl || (() => { try { return new URL(at).origin === new URL(liveUrl).origin; } catch { return false; } })();
        if (again?.ok === true && sameAddress) return 'restored';
        liveLostBy = again?.ok === true
            ? `it came back at ${at}, not at ${liveUrl}`
            : String(again?.error || 'project_run failed').slice(0, 300);
        note(`live: the server was stopped to put the QA's records back and did not come back where it was: ${liveLostBy}`);
        return 'down';
    };

    const interfaceRoots = deliveredRoots([...auditRoots, String(liveRun?.output?.cwd || '').trim()]);

    //  C9 — a request that needs a server is never delivered by a browser-only build.
    if (!programOnly) {
        await stage(['service'], async () => {
            const gap = await missingRequestedServer(request, interfaceRoots, [{ tool: 'general_agent' }]);
            if (gap) ledger.record({ instrument: 'service', ok: false, error: gap });
            else if (roles.service) {
                ledger.record({ instrument: 'service', ok: true });
                passed.set('service', 'the delivered tree registers server routes, as a request that needs a server must');
            } else skipped.set('service', 'the request asks for no server');
        });
    } else skipped.set('service', 'a program on its own needs no server');

    //  C10 — is an interface delivered?
    let interfaceDelivered = false;
    if (!programOnly) {
        interfaceDelivered = interfaceRoots.some(r => !!servedInterfaceDirectory(r))
            || String(liveRun?.output?.kind || '') === 'static-site'
            || await servesHtmlAtRoot(liveUrl)
            || (roles.interface && interfaceRoots.some(r => !!deliveredPageDirectory(r)));
        if (!interfaceDelivered && liveUrl && roles.interface) {
            ledger.record({ instrument: 'browser', ok: false, error: 'the request asks for an interface, but no delivered part serves one (no page is served at the live address)' });
        }
    }

    //  C11 — every requirement the request named, judged on the source.
    //  Recorded before Browser QA, so QA never runs to rescue a refused delivery.
    //  A requirement about how a delivered page LOOKS is held for the page
    //  itself: the source cannot show a taste (core/quality/appearance.ts).
    const acceptance = { requirements: [] as JudgedRequirement[], requestUnread: false, whyNotRead: '' };
    let bySight: Array<{ id: string; text: string; quote: string }> = [];
    await stage(['acceptance'], async () => {
        const judged = await judgeRequirements(ctx, request, isAr, root, deps.ask, note, {
            built: buildsPassed, liveUrl, tests: delivery.state.requestCoverage,
        }, interfaceDelivered, documentAsked);
        Object.assign(acceptance, judged.summary);
        bySight = judged.bySight;
        ledger.record({ instrument: 'acceptance', ok: !judged.blocked, error: judged.blocked ? judged.error : undefined, met: judged.met });
        const onThePage = bySight.length ? `; ${bySight.length} about how the page looks (${bySight.map(r => planIdOf(ctx, r.id)).join(', ')}) are judged on the page itself, by the Browser QA` : '';
        passed.set('acceptance', judged.requirementsCount
            ? `every one of the ${judged.requirementsCount} requirement(s) read from the request is met in the source${onThePage}`
            : bySight.length ? `the request's requirement(s) are all about how the page looks${onThePage}`
                : 'the request was read and names nothing the source can be judged against');
        if (judged.leftOut.length) remark('acceptance', `not handed to the judge (over ${JUDGE_FILE_BYTES} bytes each): ${judged.leftOut.join(', ')}`);
    });
    let looks: JudgedAppearance[] | undefined;

    //  C12 — visible Browser QA, when an interface is delivered and nothing
    //  it cannot repair has already failed.
    let browserAudit: AppAudit | undefined;
    const qaTarget = interfaceDelivered && mayRunBrowserQa(ledger.all()) ? browserQaTargetUrl(verifiedLiveUrl(ledger.all()), '') : '';
    if (qaTarget) {
        required.add('browser');
        await stage(['browser'], async () => {
            const eye = await browserQa.watcher(ctx);
            /*
             * §8: paths 1 and 3 write nothing of his, so they walk whether or not the panel is watched (streamed when
             * it is). A new build and 2T walk only while someone watches, exactly as today.
             */
            const walksUnwatched = span.changeRun && (pin.path === 'private-live' || pin.path === 'no-write');
            if (!eye.watching && !walksUnwatched) {
                skipped.set('browser', `not measured, and the delivery needs it: visible Browser QA runs only in the Browser panel, and no one is watching it${eye.sessionId ? ` (panel session ${eye.sessionId})` : ' (this run has no Browser panel session)'}; it is never counted as passed`);
                return;
            }
            const auditDir = projectAuditDirectory(Array.from(new Set([...auditRoots, ...interfaceRoots])));
            //  The landing view on a desktop and on a phone is kept as the
            //  delivery's proof (certificate.ts); a look he asked for is judged
            //  on a picture of its own, and kept as the desktop proof after.
            const proof = deliveryProofPaths(ctx.stateDir || path.join(root, '.joe'));
            const lookPath = bySight.length ? path.join(ctx.stateDir || path.join(root, '.joe'), 'look', `page-${Date.now()}.jpg`) : proof.desktop;
            //  A system behind a sign-in is tested signed in, with the account
            //  the builder gave (quality/sign-in.ts); without one, a product
            //  that shows a sign-in is not proven past its door.
            //  The PDFs a walk receives are kept for the look at Arabic PDFs (outside-probe.ts): one folder a walk, this check's only.
            const pdfDir = path.join(ctx.stateDir || path.join(root, '.joe'), 'proof', 'outside');
            await fs.promises.rm(pdfDir, { recursive: true, force: true }).catch(() => { /* none kept */ });
            let walks = 0;
            const options = (timeoutMs: number): AuditOptions => ({
                request, watchSessionId: eye.sessionId, serveUrl: qaTarget, artifactRootDir: root,
                requireVisibleBrowser: true, timeoutMs, onProgress: (m: string) => note(`browser QA: ${m}`),
                lookPath, phoneLookPath: proof.phone, pdfCaptureDir: path.join(pdfDir, `walk-${++walks}`),
                ...(signIn ? { credentials: { identity: signIn.identity, password: signIn.password } } : {}),
                requireAuthenticatedCoverage: true,
                //  The door's facts (design v13.3 §2): his folder, this verification's pin, the panel it streams to,
                //  how project_run started it and from where, and the app's other live addresses.
                projectRoot: root, qaPin: pin, streamTo: eye.sessionId,
                ...(serverRoot ? { serverRoot } : {}), ...(startKind ? { startKind } : {}),
                ...(span.changeRun ? { walkedOrigins: walkedOrigins() } : {}),
            });
            /*
             * One measurement of the page, the same every time it is taken: the
             * page after Joe's own repair is measured as the page before it was.
             * The ladder's live check, 2026-11-10 (L160, five screens): the walk
             * needed its larger budget, the repair's code was new to the walk
             * (nothing carried), and a 45-second look at it ran out of time —
             * «qa_budget_exhausted», a kind the first measurement did not have,
             * so every repair on a product of that size was put back.
             */
            /** One walk of the page, on the records the app had before the QA's first one. */
            const walk = async (timeoutMs: number): Promise<AppAudit> => {
                //  A walk of a server that did not come back measures Joe's restart, not the app: not taken.
                if (qaAuditsTaken > 0 && await putQaRecordsBack(true) === 'down') {
                    return { score: 0, findings: [], skipped: `the server was stopped to put the QA's records back and did not come back: ${liveLostBy}` } as AppAudit;
                }
                qaAuditsTaken++;
                if (!span.changeRun) return browserQa.audit(auditDir, options(timeoutMs));
                //  The walk's own requests are this verification's windows (the fence saw them, §5b step 4); a walk
                //  that reports none is one window as a whole, so its writes are never told as unexplained.
                const t0 = Date.now();
                let measured: AppAudit | undefined;
                try {
                    measured = await browserQa.audit(auditDir, options(timeoutMs));
                    return measured;
                } finally {
                    const seen = qaOf(measured)?.windows;
                    if (seen) for (const w of seen) span.windows.add({ start: w.start, end: w.end, long: !!w.long, what: 'walk', writes: w.writes !== false });
                    else span.windows.add({ start: t0, end: Date.now(), long: false, what: 'walk (whole)' });
                }
            };
            /** A later walk that ran another way than the loop's pin is not compared with the first (§2.3). */
            const comparedTo = (later: AppAudit): boolean => {
                if (comparableWalk(later)) return true;
                const to = qaOf(later)?.path;
                if (pin.path && to) span.notComparable = { from: pin.path, to };
                note(`qa path: the way of checking changed between two measurements (${pin.path} → ${to || 'unknown'}), so the first measurement stands`);
                return false;
            };
            const measure = async (): Promise<AppAudit> => {
                let a = await walk(45_000);
                //  A coverage timeout is the walker's budget, not the app: once more, larger.
                if (!a.skipped && a.findings.some(f => f.id === 'qa_budget_exhausted')) {
                    const retry = await walk(COVERAGE_RETRY_TIMEOUT_MS);
                    if (!retry.skipped && comparedTo(retry)) a = retry;
                }
                //  A browser-rig failure says nothing about the app: measured once more.
                if (!a.skipped && hasOnlyBrowserQaInfrastructureFindings(a.findings)) {
                    const retry = await walk(45_000);
                    if (!retry.skipped && comparedTo(retry)) a = retry;
                }
                return a;
            };
            let audit = await measure();
            /*
             * What Joe's repairer answers, Joe repairs, and measures once more
             * (browser-mend.ts): kept only when the page is better, put back
             * otherwise. Never in the user's own repository.
             */
            let mended: string[] = [];
            /** A repair measured and put back, and why: told with the refusal, so the builder does not repeat it blind. */
            let mendPutBack = '';
            //  Only for what would refuse: a rebuild and a second measurement are not spent on taste alone.
            if (mender && !repository && !audit.skipped && mendable(audit.findings.filter(refuses))) {
                const mendRoot = [...auditRoots].sort((a, b) => b.length - a.length)
                    .find(r => path.resolve(auditDir) === path.resolve(r) || isWithinRoot(path.resolve(auditDir), path.resolve(r))) || root;
                try {
                    //  Only what refuses is mended: a told line (ui-inspection's) never rides along unmeasured (design v3 §2.2).
                    //  The mend's rebuild is one of this verification's windows (§5b step 4).
                    const m = await inWindow('mend', () => mender(mendRoot, audit.findings.filter(refuses), isAr, note, auditDir));
                    if (m) {
                        //  What the repair wrote is its own, kept or undone by it — never put back as a QA record.
                        keptOnPurpose.push(...m.changed.map(f => path.resolve(mendRoot, f)));
                        const again = await measure();
                        //  Measured another way than the first (§2.3): mendIsBetter is not asked, the repair is undone.
                        const comparable = again.skipped || comparedTo(again);
                        //  Whole audits, so the comparison reads each walk's own inspection status (a told kind is counted only when both were complete).
                        if (!again.skipped && comparable && mendIsBetter(audit, again)) {
                            audit = again;
                            mended = m.repairs;
                            note(`browser QA: Joe repaired it himself (${m.changed.join(', ')}): ${m.repairs.join('; ')}`);
                        } else {
                            const why = again.skipped ? `the page could not be measured after it (${again.skipped})`
                                : !comparable ? `the way of checking changed between the two measurements (${pin.path} → ${qaOf(again)?.path || 'unknown'}), so the first measurement stands`
                                    : whyMendNotBetter(audit, again);
                            //  Putting it back can fail too: then the builder is told the files may still be changed, never «it could not run».
                            const undone = await m.undo().then(() => '', (e: unknown) => message(e));
                            mendPutBack = undone
                                ? `${m.repairs.join('; ')} — ${why}; putting it back failed (${undone}), so ${m.changed.join(', ')} may still hold the repair`
                                : `${m.repairs.join('; ')} — ${why}`;
                            note(`browser QA: Joe's own repair did not make the page better (${why}), ${undone ? `and putting it back failed: ${undone}` : 'so every file was put back'}`);
                        }
                    }
                } catch (e) {
                    mendPutBack = `it could not run: ${message(e)}`;
                    note(`browser QA: Joe's own repair could not run: ${message(e)}`);
                }
            }
            browserAudit = audit;
            if (audit.look?.path && audit.look.path !== proof.desktop) {
                try {
                    await fs.promises.mkdir(path.dirname(proof.desktop), { recursive: true });
                    await fs.promises.copyFile(audit.look.path, proof.desktop);
                } catch { /* the proof is kept when it can be */ }
            }
            //  What the request says about the look, judged on the page the audit opened.
            if (bySight.length && !audit.skipped) {
                looks = await judgeAppearance(bySight, audit.look, isAr, deps.look,
                    audit.lookProblem ? `the page's screenshot could not be taken: ${audit.lookProblem}` : undefined);
                for (const l of looks) note(`look: ${planIdOf(ctx, l.id)} ${l.verdict}: ${l.why}`);
            }
            const unmetLooks = (looks || []).filter(l => l.verdict === 'unmet')
                .map(l => `${planIdOf(ctx, l.id)} «${l.text}» does not look as he asked: ${l.why}`);
            //  A minor finding of taste is told with the delivery, never a refusal on its own (browser-mend.ts).
            const blocking = audit.skipped ? [] : audit.findings.filter(refuses);
            const told = audit.skipped ? [] : audit.findings.filter(f => !refuses(f));
            const mendedLine = `${audit.carried ? `; ${audit.carried} part(s) of this walk were finished by the walk before it, on the same unchanged code` : ''}${mended.length ? `; Joe repaired it himself before this measurement: ${mended.join('; ')}` : ''}${mendPutBack ? `; Joe's own repair was measured and put back: ${mendPutBack}` : ''}`;
            if (audit.skipped) {
                ledger.record({ instrument: 'browser', ok: false, error: `browser QA skipped: ${audit.skipped}` });
            } else if (blocking.length) {
                const findings = blocking.map(browserFindingLine);
                ledger.record({ instrument: 'browser', ok: false, error: `browser QA found ${blocking.length} blocking finding(s): ${findings.slice(0, 8).join(' | ')}${findings.length > 8 ? ` (+${findings.length - 8} more)` : ''}${unmetLooks.length ? ` | ${unmetLooks.join(' | ')}` : ''}${told.length ? ` | minor, not blocking: ${told.map(f => f.id).join(', ')}` : ''}${mendedLine}` });
            } else if (unmetLooks.length) {
                ledger.record({ instrument: 'browser', ok: false, error: `the page, seen on its screenshot: ${unmetLooks.join(' | ')}` });
            } else {
                ledger.record({ instrument: 'browser', ok: true });
                const seen = (looks || []).filter(l => l.verdict === 'met');
                passed.set('browser', `visible Browser QA in the panel found nothing ${told.length ? 'that blocks' : 'to fix'} (score ${audit.score})${mendedLine}${told.length ? `; minor notes, told and not refused: ${told.map(browserFindingLine).join(' | ')}` : ''}${seen.length ? `; seen on the page's screenshot: ${seen.map(l => `${planIdOf(ctx, l.id)} ${l.why}`).join(' | ')}` : ''}`);
            }
        });
    } else if (interfaceDelivered && !ledger.all().some(m => m.instrument === 'browser')) {
        skipped.set('browser', 'not run: an earlier check failed, and Browser QA never runs to rescue a refused delivery');
    } else if (!interfaceDelivered && !ledger.all().some(m => m.instrument === 'browser')) {
        skipped.set('browser', 'no interface is delivered, so there is no page to open');
    }

    //  C13 — roles with their own permissions: what a role's screens hide
    //  from it, the server refuses it (quality/role-probe.ts).
    let roleViews: Array<{ role: string; screens: string[] }> | undefined;
    if (!programOnly && interfaceDelivered && liveUrl && asksRolePermissions(request)) {
        required.add('roles');
        await stage(['roles'], async () => {
            const given = accounts || [];
            if (given.length < 2) {
                ledger.record({ instrument: 'roles', ok: false, error: 'the request asks for roles with their own permissions, and task_finish gave no account per role: give task_finish "accounts": [{"username": …, "password": …, "role": …}, …] — one account the project seeds for each role — and Joe signs in as each and checks that what a role\'s screens hide, the server refuses it' });
                return;
            }
            //  On a change run its browser reaches only the app's own addresses, and on path 3 it saves nothing (design v13.3 §6).
            const roleOpts = {
                signal: ctx.signal,
                ...(span.changeRun ? { qaPath: pin.path } : {}),
                ...(span.fence ? { browserProxy: span.fence.proxy } : {}),
            } as Parameters<typeof measureRoles>[2];
            const measured = await inWindow('role probe', () => measureRoles(liveUrl, given, roleOpts));
            const error = roleLeakError(measured);
            ledger.record({ instrument: 'roles', ok: !error, error: error || undefined });
            for (const v of measured.views) note(`roles: ${v.role} ${v.signedIn ? `sees ${v.screens.join(', ') || 'no screen'}` : `did not sign in: ${v.why}`}`);
            if (!error) {
                roleViews = measured.views.map(v => ({ role: v.role, screens: v.screens }));
                passed.set('roles', `every role signed in, and the server refused each the data of the screens it is not shown (${measured.refused.length} refusal(s)): ${measured.views.map(v => `${v.role} sees ${v.screens.length} screen(s)`).join(', ')}`);
            }
        });
    }

    //  A look nobody could see is said so, and never blocks.
    if (bySight.length && !looks) {
        looks = await judgeAppearance(bySight, undefined, isAr, deps.look,
            `not looked at: ${skipped.get('browser') || (ledger.all().some(m => m.instrument === 'browser' && m.ok !== true) ? 'the Browser QA did not open the page' : 'the page was not opened')}`);
    }
    for (const l of looks || []) {
        acceptance.requirements.push({ id: planIdOf(ctx, l.id), key: l.id, text: l.text, verdict: l.verdict, why: l.why, judgedBy: 'sight' });
    }

    //  C14 — one verdict, from every measurement. The agent called
    //  task_finish; phaseVerified holds when every owed build passed.
    const judge = () => deliveryVerdict({
        phaseVerified: buildsPassed,
        requestFidelityBlocked: false,
        measurements: ledger.all(),
        required: [...required],
        primary,
    });
    let verdict = judge();
    /*
     * THE LOOK AT AN ARABIC PDF (design arabic-pdf v9 §4): on a verified delivery
     * only, never in his own repository; it reads the PDFs the delivery wrote and the
     * PDF bytes the Browser QA walk already received, and sends nothing to the app.
     * It changes no verdict: its lines reach the chat, the notes and record.pdf.
     */
    let pdfLook: PdfLook | null = null;
    if (verdict.verified && !repository) {
        const servedDir = servedInterfaceDirectory(root);
        pdfLook = await lookAtPdfs({
            root, stateDir: ctx.stateDir || path.join(root, '.joe'), runId: ctx.runId, request, language: ctx.language,
            servedIndex: servedDir && fs.existsSync(path.join(servedDir, 'index.html')) ? path.join(servedDir, 'index.html') : null,
            captured: browserAudit?.pdfs || [], deadlineAt: ctx.deadlineAt, signal: ctx.signal, cancelled: ctx.cancelled,
        }).catch((e: unknown) => ({ entries: [], notes: [`pdf look: could not run: ${message(e)}`], proofs: [] }));
        for (const line of pdfLook?.notes || []) note(line);
    }
    /*
     * The app he receives starts from his records, never the QA's — and a delivery
     * says it is live only while its server answers. The records are put back before
     * the verdict is final: a server stopped for it that does not come back is a
     * failed live check, never a delivered address nothing answers at.
     */
    if (liveStarted && verdict.verified) {
        let back = await putQaRecordsBack(true);
        if (back !== 'down' && liveLostBy) {
            //  Lost earlier, before a walk that was then not taken: started once more.
            const again: any = await inWindow('restart', () => runTool('project_run', { ...liveInput, ...(livePort ? { port: livePort } : {}) }))
                .catch((e: unknown) => ({ ok: false, error: message(e) }));
            back = again?.ok === true ? 'restored' : 'down';
            if (again?.ok !== true) liveLostBy = String(again?.error || 'project_run failed').slice(0, 300);
        }
        if (back === 'down') {
            ledger.record({ instrument: 'live', ok: false, error: `the server was stopped to put the Browser QA's own records back, and it could not be started again where it was: ${liveLostBy}; start it again with project_run` });
            verdict = judge();
        }
    }

    //  A delivered project keeps the server project_run started: it is the
    //  live preview. A refused one does not — the model goes on fixing, and a
    //  server it did not start would hold the port its own shell_start needs.
    if (liveStarted && !verdict.verified) {
        const stop = await inWindow('project_stop', () => runTool('project_stop', {}));
        if (stop?.ok === true && stop?.output?.stopped === true) {
            remark('live', 'the server project_run started for this check was stopped again, because the delivery is not verified; start your own with shell_start to keep testing');
        } else if (stop?.ok !== true) {
            note(`live: the server project_run started could not be stopped: ${String(stop?.error || 'project_stop failed')}`);
        }
    }
    //  A refused one is put back with its server stopped: the next check opens on his records.
    if (!verdict.verified) await putQaRecordsBack(false);
    //  Another check held the lock, so nothing was put back: what changed during this one is told (never «nothing saved»).
    if (span.changeRun && dataBefore && span.lockBusy) {
        try {
            const changed = (await appDataChanges(dataBefore, keptOnPurpose)).map(f => path.relative(root, f).split(path.sep).join('/'));
            if (changed.length) span.leftChanged = { files: changed, why: 'lockBusy' };
        } catch { /* nothing to tell */ }
    }
    /*
     * M3: a file the put-back could not restore keeps its version from before the checks — among the recovery copies
     * (a version of its own, brought back from the chat) or, with no recovery copy, in the snapshot folder, which is
     * then left in place and named in the log. The line says which.
     */
    if (span.putBackFailed.length && dataBefore) {
        const before = span.putBackFailed.map(f => f.replace(/ \([^)]*\)$/u, ''))
            .map(rel => ({ rel, kept: dataBefore!.files.get(path.join(root, ...rel.split('/'))) }))
            .filter((x): x is { rel: string; kept: NonNullable<typeof x.kept> } => !!x.kept);
        if (span.watch && before.length) {
            try { if (await span.watch.keep(before.map(x => ({ rel: x.rel, from: x.kept.copy })), 'before the checks')) span.putBackFailedBefore = 'copies'; }
            catch (e) { note(`qa path: the version from before the checks could not be added to the recovery copy: ${message(e)}`); }
        }
        if (span.putBackFailedBefore !== 'copies') {
            span.putBackFailedBefore = 'snapshot';
            note(`qa path: ${span.putBackFailed.join(', ')} could not be put back; the version from before the checks is kept in ${dataBefore.dir} (removed after 6 hours)`);
        }
    }
    //  The last put-back is done: the recovery watch ends (its copies stay only when something was put back over them).
    const watched = span.watch;
    await endRecovery(span, span.putBackRan);
    //  The copies were for this check only — unless they are the only version from before of a file not put back (M3).
    if (span.putBackFailedBefore !== 'snapshot') await discardSnapshot(dataBefore);
    const qaPath = span.changeRun ? qaPathOfRecord(span, browserAudit, watched, qaTarget, delivery.state.skippedProbes) : undefined;
    if (qaPath) {
        for (const line of qaPathLines(qaPath, 'en')) { note(`qa path: told: ${line}`); remark(qaPath.walked ? 'browser' : 'live', line); }
    }

    const testsAsked = testsRequestedIn(request);
    const reasons = skipReasons({
        ledger, skipped, programOnly, liveOk: !!liveUrl, testsAsked: !!testsAsked, contractError, contractOk: contract.ok,
        requestCoverage: delivery.state.requestCoverage,
    });
    const checks = reportChecks(ledger, passed, reasons, remarks, required, acceptance.requirements);
    const notMeasured: Record<string, string> = {};
    for (const instrument of verdict.unmeasured) notMeasured[instrument] = reasons.get(instrument) || 'not measured';
    const statuses = deliveryStatuses(verdict, ledger.all());
    const unproven = unprovenRequirements(ctx, acceptance.requirements, ledger, reasons);
    if (logDropped) log.push(`… ${logDropped} more line(s) were left out of this log`);
    const fileLogPath = await keepVerificationLog(root, fileLog);
    if (fileLogPath && logDropped) log.push(`the whole log: ${fileLogPath}`);

    const record: DeliveryRecord = {
        projectRoot: root,
        primary,
        required: [...required],
        measurements: ledger.all(),
        verdict,
        ...statuses,
        ...(liveUrl ? { liveUrl } : {}),
        notMeasured,
        acceptance,
        ...(delivery.state.scopeAudit ? { scopeAudit: delivery.state.scopeAudit } : {}),
        ...(delivery.state.requestCoverage ? { requestCoverage: delivery.state.requestCoverage } : {}),
        ...(browserAudit ? { browserQa: browserAudit } : {}),
        ...(signIn && browserAudit?.authenticated ? { signedInAs: signIn.identity } : {}),
        ...(roleViews ? { roleViews } : {}),
        stoppedServers,
        //  A delivery the restore turned down carries none: its lines were the builder's notes only.
        ...(verdict.verified && pdfLook?.entries.length ? { pdf: pdfLook.entries } : {}),
        ...(qaPath ? { qaPath } : {}),
        log,
    };
    return { passed: verdict.verified, checks, unproven, at: Date.now(), delivery: record };
}

/* ───────────────────────── what is told about the owner's data (design v13.3 §9) ───────────────────────── */

/**
 * The owner's lines, in each language Joe's interface offers (accounts-lab/v13/owner-lines13.json, copied
 * verbatim). Each is said only when its condition is measured true for this verification (qaPathLines).
 */
const QA_LINES = {
    "checkedPrivately": {
        "ar": "جرت فحوص جو على تطبيقك في نافذة خاصة جديدة بلا بيانات محفوظة منك، ولم تصل إلا إلى عنوان تطبيقك {origin}.",
        "en": "Joe's checks ran on your app in a fresh private window holding none of your saved data, and reached only your app's address {origin}.",
        "es": "Las comprobaciones de Joe se hicieron en tu aplicación en una ventana privada nueva, sin tus datos guardados, y solo llegaron a la dirección de tu aplicación {origin}.",
        "fr": "Les vérifications de Joe ont tourné sur votre application dans une nouvelle fenêtre privée, sans vos données enregistrées, et n'ont joint que l'adresse de votre application {origin}.",
        "de": "Joes Prüfungen liefen in einem neuen privaten Fenster ohne Ihre gespeicherten Daten auf Ihrer App und erreichten nur die Adresse Ihrer App {origin}.",
        "ru": "Проверки Joe прошли в вашем приложении в новом приватном окне без ваших сохранённых данных и обращались только к адресу приложения {origin}."
    },
    "blocked": {
        "ar": "حاولت صفحة تطبيقك أثناء الفحص الاتصال بعناوين أخرى {n} مرة ({hosts})؛ أوقفت فحوص جو هذه الطلبات، فما يعتمد عليها لم يُجرَّب.",
        "en": "During the checks your app's page tried {n} times to reach other addresses ({hosts}); Joe's checks stopped those requests, so what depends on them was not tried.",
        "es": "Durante las comprobaciones, la página de tu aplicación intentó {n} veces llegar a otras direcciones ({hosts}); las comprobaciones de Joe detuvieron esas peticiones, así que lo que depende de ellas no se probó.",
        "fr": "Pendant les vérifications, la page de votre application a tenté {n} fois de joindre d'autres adresses ({hosts}) ; les vérifications de Joe ont arrêté ces requêtes, donc ce qui en dépend n'a pas été essayé.",
        "de": "Während der Prüfungen versuchte die Seite Ihrer App {n}-mal, andere Adressen zu erreichen ({hosts}); Joes Prüfungen haben diese Anfragen gestoppt, was davon abhängt, wurde nicht ausprobiert.",
        "ru": "Во время проверок страница вашего приложения {n} раз пыталась обратиться к другим адресам ({hosts}); проверки Joe остановили эти запросы, поэтому то, что от них зависит, не опробовано."
    },
    "notWritten": {
        "ar": "تطبيقك يحفظ بياناته على خادمه ({why})، فجرت فحوص جو على تطبيقك الحي دون أن تحفظ فيه شيئًا، ولذلك لم تُجرَّب: {labels} (المجموع: {n}).",
        "en": "Your app keeps its data on its server ({why}), so Joe's checks ran on your live app without saving anything in it; not tried: {labels} (total: {n}).",
        "es": "Tu aplicación guarda sus datos en su servidor ({why}), así que las comprobaciones de Joe se hicieron en tu aplicación real sin guardar nada en ella; sin probar: {labels} (total: {n}).",
        "fr": "Votre application garde ses données sur son serveur ({why}) ; les vérifications de Joe ont donc tourné sur votre application réelle sans rien y enregistrer ; non essayé : {labels} (total : {n}).",
        "de": "Ihre App speichert ihre Daten auf ihrem Server ({why}); Joes Prüfungen liefen deshalb auf Ihrer echten App, ohne darin etwas zu speichern; nicht ausprobiert: {labels} (insgesamt: {n}).",
        "ru": "Ваше приложение хранит данные на своём сервере ({why}), поэтому проверки Joe прошли на рабочем приложении, ничего в нём не сохраняя; не опробовано: {labels} (всего: {n})."
    },
    "notWrittenSignedIn": {
        "ar": "تطبيقك يحفظ بياناته على خادمه ({why})، فجرت فحوص جو على تطبيقك الحي دون أن تحفظ فيه شيئًا غير تسجيل الدخول بالحساب الذي أعطيته؛ لم تُجرَّب: {labels} (المجموع: {n}).",
        "en": "Your app keeps its data on its server ({why}), so Joe's checks ran on your live app saving nothing in it beyond signing in with the account you gave; not tried: {labels} (total: {n}).",
        "es": "Tu aplicación guarda sus datos en su servidor ({why}), así que las comprobaciones de Joe se hicieron en tu aplicación real sin guardar nada salvo el inicio de sesión con la cuenta que diste; sin probar: {labels} (total: {n}).",
        "fr": "Votre application garde ses données sur son serveur ({why}) ; les vérifications de Joe ont donc tourné sur votre application réelle sans rien y enregistrer hormis la connexion avec le compte fourni ; non essayé : {labels} (total : {n}).",
        "de": "Ihre App speichert ihre Daten auf ihrem Server ({why}); Joes Prüfungen liefen deshalb auf Ihrer echten App und speicherten darin nichts außer der Anmeldung mit dem angegebenen Konto; nicht ausprobiert: {labels} (insgesamt: {n}).",
        "ru": "Ваше приложение хранит данные на своём сервере ({why}), поэтому проверки Joe прошли на рабочем приложении, ничего не сохраняя, кроме входа под указанной вами учётной записью; не опробовано: {labels} (всего: {n})."
    },
    "notComparable": {
        "ar": "تغيّر طريق الفحص بين القياسين ({from} ← {to})، فبقي القياس الأول هو المعتمد.",
        "en": "The way of checking changed between the two measurements ({from} → {to}), so the first measurement stands.",
        "es": "La forma de comprobar cambió entre las dos mediciones ({from} → {to}), así que vale la primera medición.",
        "fr": "La manière de vérifier a changé entre les deux mesures ({from} → {to}) ; la première mesure fait donc foi.",
        "de": "Die Prüfweise hat sich zwischen den beiden Messungen geändert ({from} → {to}); deshalb gilt die erste Messung.",
        "ru": "Способ проверки изменился между двумя измерениями ({from} → {to}), поэтому в силе остаётся первое измерение."
    },
    "probeSkipped": {
        "ar": "لم يُجرَّب {probe} لأنه يحفظ بيانات في تطبيقك الحي.",
        "en": "{probe} was not run because it saves data in your live app.",
        "es": "{probe} no se ejecutó porque guarda datos en tu aplicación real.",
        "fr": "{probe} n'a pas été lancé car il enregistre des données dans votre application réelle.",
        "de": "{probe} wurde nicht ausgeführt, weil es Daten in Ihrer echten App speichert.",
        "ru": "{probe} не запускалась, потому что она сохраняет данные в рабочем приложении."
    },
    "probeName": {
        "isolation": {
            "ar": "فحص فصل بيانات المستخدمين",
            "en": "The per-user isolation check",
            "es": "La comprobación de aislamiento por usuario",
            "fr": "La vérification d'isolement par utilisateur",
            "de": "Die Prüfung der Trennung pro Nutzer",
            "ru": "Проверка изоляции данных пользователей"
        },
        "builderProofs": {
            "ar": "فحص واجهة البرمجة بالإنشاء والحذف",
            "en": "The create-and-delete API check",
            "es": "La comprobación de API de crear y borrar",
            "fr": "La vérification d'API par création et suppression",
            "de": "Die API-Prüfung mit Anlegen und Löschen",
            "ru": "Проверка API созданием и удалением"
        }
    },
    "why": {
        "ownServer": {
            "ar": "يعمل بخادم خاص به: {detail}",
            "en": "it runs a server of its own: {detail}",
            "es": "funciona con un servidor propio: {detail}",
            "fr": "elle tourne avec son propre serveur : {detail}",
            "de": "sie läuft mit einem eigenen Server: {detail}",
            "ru": "оно работает со своим сервером: {detail}"
        },
        "devProxy": {
            "ar": "خادم التطوير فيه يمرّر الطلبات إلى خادم آخر: {detail}",
            "en": "its dev server passes requests on to another server: {detail}",
            "es": "su servidor de desarrollo reenvía peticiones a otro servidor: {detail}",
            "fr": "son serveur de développement transmet des requêtes à un autre serveur : {detail}",
            "de": "sein Entwicklungsserver leitet Anfragen an einen anderen Server weiter: {detail}",
            "ru": "его сервер разработки передаёт запросы другому серверу: {detail}"
        },
        "outsideService": {
            "ar": "صفحته تكتب في خدمة خارجية: {detail}",
            "en": "its page writes to an outside service: {detail}",
            "es": "su página escribe en un servicio externo: {detail}",
            "fr": "sa page écrit dans un service externe : {detail}",
            "de": "seine Seite schreibt in einen externen Dienst: {detail}",
            "ru": "его страница записывает во внешний сервис: {detail}"
        },
        "notProven": {
            "ar": "لم تستطع فحوص جو أن تقرأه كله: {detail}",
            "en": "Joe's checks could not read all of it: {detail}",
            "es": "las comprobaciones de Joe no pudieron leerlo entero: {detail}",
            "fr": "les vérifications de Joe n'ont pas pu tout lire : {detail}",
            "de": "Joes Prüfungen konnten es nicht ganz lesen: {detail}",
            "ru": "проверки Joe не смогли прочитать его целиком: {detail}"
        },
        "externalStore": {
            "ar": "يستعمل قاعدة بيانات أو خدمة تخزين خارجية: {detail}",
            "en": "it uses an external database or storage service: {detail}",
            "es": "usa una base de datos o un almacenamiento externo: {detail}",
            "fr": "elle utilise une base de données ou un stockage externe : {detail}",
            "de": "sie nutzt eine externe Datenbank oder einen externen Speicher: {detail}",
            "ru": "оно использует внешнюю базу данных или хранилище: {detail}"
        },
        "sender": {
            "ar": "خادمه يستطيع أن يرسل إلى الخارج (بريدًا أو رسائل أو طلبات): {detail}",
            "en": "its server can send to the outside (mail, messages or requests): {detail}",
            "es": "su servidor puede enviar al exterior (correo, mensajes o peticiones): {detail}",
            "fr": "son serveur peut envoyer vers l'extérieur (e-mails, messages ou requêtes) : {detail}",
            "de": "sein Server kann nach außen senden (E-Mails, Nachrichten oder Anfragen): {detail}",
            "ru": "его сервер может отправлять наружу (почту, сообщения или запросы): {detail}"
        },
        "outsidePath": {
            "ar": "يحفظ بيانات خارج مجلد المشروع: {detail}",
            "en": "it keeps data outside the project folder: {detail}",
            "es": "guarda datos fuera de la carpeta del proyecto: {detail}",
            "fr": "elle garde des données hors du dossier du projet : {detail}",
            "de": "sie speichert Daten außerhalb des Projektordners: {detail}",
            "ru": "оно хранит данные вне папки проекта: {detail}"
        },
        "notCovered": {
            "ar": "يكتب ملف بيانات لا تعيده فحوص جو: {detail}",
            "en": "it writes a data file Joe's checks do not put back: {detail}",
            "es": "escribe un archivo de datos que las comprobaciones no restauran: {detail}",
            "fr": "elle écrit un fichier de données que les vérifications ne remettent pas : {detail}",
            "de": "sie schreibt eine Datendatei, die die Prüfungen nicht zurücklegen: {detail}",
            "ru": "оно пишет файл данных, который проверки не возвращают: {detail}"
        },
        "envName": {
            "ar": "في ملف إعداداته مفتاح لا تستطيع فحوص جو أن تتأكد أنه غير ضار: {detail}",
            "en": "its settings file holds a key Joe's checks cannot tell is harmless: {detail}",
            "es": "su archivo de configuración tiene una clave que las comprobaciones no pueden saber si es inofensiva: {detail}",
            "fr": "son fichier de réglages contient une clé dont les vérifications ne peuvent dire qu'elle est sans danger : {detail}",
            "de": "seine Einstellungsdatei enthält einen Schlüssel, dessen Harmlosigkeit die Prüfungen nicht erkennen können: {detail}",
            "ru": "в его файле настроек есть ключ, безвредность которого проверки не могут определить: {detail}"
        }
    },
    "reasonToWhy": {
        "server": "ownServer",
        "serverCode": "ownServer",
        "apiRoutes": "ownServer",
        "otherRuntime": "ownServer",
        "backendScript": "ownServer",
        "backendDep": "ownServer",
        "devScript": "ownServer",
        "devProxy": "devProxy",
        "browserStore": "outsideService",
        "absWrite": "outsideService",
        "link": "notProven",
        "workspace": "notProven",
        "unread": "notProven",
        "budget": "notProven",
        "externalStore": "externalStore",
        "sender": "sender",
        "outsidePath": "outsidePath",
        "notCovered": "notCovered",
        "envName": "envName",
        "notProven": "notProven"
    },
    "checkedAsBefore": {
        "ar": "جرت فحوص جو على تطبيقك كما تجري دائمًا، وجرّبت نماذجه وأزراره؛ وبعدها أُعيدت ملفات بيانات تطبيقك كما كانت تُعاد من قبل. ولم يصل متصفح الفحوص إلا إلى عنوان تطبيقك {origin}.",
        "en": "Joe's checks ran on your app the way they always have, trying its forms and buttons; afterwards your app's data files were put back as before. The checks' browser reached only your app's address {origin}.",
        "es": "Las comprobaciones de Joe se hicieron en tu aplicación como siempre, probando sus formularios y botones; después, los archivos de datos de tu aplicación se restauraron como antes. El navegador de las comprobaciones solo llegó a la dirección de tu aplicación {origin}.",
        "fr": "Les vérifications de Joe ont tourné sur votre application comme toujours, en essayant ses formulaires et ses boutons ; ensuite, les fichiers de données de votre application ont été remis comme avant. Le navigateur des vérifications n'a joint que l'adresse de votre application {origin}.",
        "de": "Joes Prüfungen liefen wie immer auf Ihrer App und probierten ihre Formulare und Schaltflächen aus; danach wurden die Datendateien Ihrer App wie bisher zurückgelegt. Der Browser der Prüfungen erreichte nur die Adresse Ihrer App {origin}.",
        "ru": "Проверки Joe прошли на вашем приложении как обычно и опробовали его формы и кнопки; затем файлы данных приложения были возвращены, как и раньше. Браузер проверок обращался только к адресу приложения {origin}."
    },
    "recoveryKept": {
        "ar": "أثناء الفحوص تغيّر أيضًا {files} في لحظة لم يكن فيها أي طلب من الفحوص يمكن أن يحفظ شيئًا، فقد لا يكون التغيير منها؛ ثم أُعيد كما كان. كل نسخة رآها جو بين النسخ التي يحتفظ بها؛ اطلبها من جو في المحادثة إن كانت تلك التغييرات منك أو من زبائنك.",
        "en": "While the checks ran, {files} also changed at a moment when none of the checks' requests could save anything, so the change may not have come from the checks; then it was put back. Every version Joe saw is among the copies it keeps; ask Joe for it in the chat if those changes were yours or your customers'.",
        "es": "Mientras corrían las comprobaciones, {files} también cambió en un momento en que ninguna petición de las comprobaciones podía guardar nada, así que el cambio puede no venir de ellas; después se restauró. Cada versión que Joe vio está entre las copias que guarda; pídesela a Joe en el chat si esos cambios eran tuyos o de tus clientes.",
        "fr": "Pendant les vérifications, {files} a aussi changé à un moment où aucune requête des vérifications ne pouvait rien enregistrer, donc le changement ne vient peut-être pas d'elles ; puis il a été remis. Chaque version que Joe a vue fait partie des copies qu'il garde ; demandez-la à Joe dans la discussion si ces changements venaient de vous ou de vos clients.",
        "de": "Während der Prüfungen änderte sich {files} auch zu einem Zeitpunkt, an dem keine Anfrage der Prüfungen etwas speichern konnte, die Änderung kam also vielleicht nicht von ihnen; danach wurde es zurückgelegt. Jede Version, die Joe gesehen hat, gehört zu den Kopien, die er aufbewahrt; fragen Sie Joe im Chat danach, falls diese Änderungen von Ihnen oder Ihren Kunden waren.",
        "ru": "Пока шли проверки, {files} изменился ещё и в момент, когда ни один запрос проверок не мог ничего сохранить, поэтому изменение могло прийти не от них; затем он был возвращён. Каждая версия, которую видел Joe, есть среди сохранённых копий; попросите её у Joe в чате, если это были изменения ваши или ваших клиентов."
    },
    "recoveryOverBudget": {
        "ar": "لم يحتفظ جو إلا بآخر نسخة من كل ملف بيانات قبل إعادته؛ فالبيانات أكبر مما يحفظه كاملًا.",
        "en": "Joe kept only the last version of each data file before it was put back; the data was larger than Joe keeps in full.",
        "es": "Joe solo guardó la última versión de cada archivo de datos antes de restaurarlo; los datos eran más grandes de lo que guarda completo.",
        "fr": "Joe n'a gardé que la dernière version de chaque fichier de données avant sa remise ; les données étaient plus grandes que ce qu'il garde en entier.",
        "de": "Joe hat nur die letzte Version jeder Datendatei vor dem Zurücklegen aufbewahrt; die Daten waren größer, als er vollständig aufbewahrt.",
        "ru": "Joe сохранил только последнюю версию каждого файла данных перед возвратом: данных больше, чем он хранит целиком."
    },
    "putBackFailed": {
        "ar": "تعذّرت إعادة {files} كما كانت قبل الفحوص؛ نسختها من قبل الفحوص وآخر نسخة منها بين النسخ التي يحتفظ بها جو خارج مشروعك، فاطلب من جو في المحادثة أن يعيد إحداها.",
        "en": "{files} could not be put back as they were before the checks; their version from before the checks and their last version are among the copies Joe keeps outside your project — ask Joe in the chat to bring one back.",
        "es": "{files} no se pudo restaurar como estaba antes de las comprobaciones; su versión de antes y su última versión están entre las copias que Joe guarda fuera de tu proyecto: pídele a Joe en el chat que te devuelva una.",
        "fr": "{files} n'a pas pu être remis comme avant les vérifications ; sa version d'avant et sa dernière version font partie des copies que Joe garde hors de votre projet — demandez à Joe dans la discussion d'en remettre une.",
        "de": "{files} konnte nicht wie vor den Prüfungen zurückgelegt werden; die Version von vorher und die letzte Version gehören zu den Kopien, die Joe außerhalb Ihres Projekts aufbewahrt — bitten Sie Joe im Chat, eine zurückzuholen.",
        "ru": "{files} не удалось вернуть в прежнее состояние; версия до проверок и последняя версия есть среди копий, которые Joe хранит вне вашего проекта, — попросите Joe в чате вернуть одну из них."
    },
    "putBackFailedSnapshot": {
        "ar": "تعذّرت إعادة {files} كما كانت قبل الفحوص؛ ونسختها من قبل الفحوص في مجلد مؤقت مذكور في سجل الفحص، يُحذف بعد ست ساعات.",
        "en": "{files} could not be put back as they were before the checks; their version from before the checks is in a temporary folder named in the verification log, removed after six hours.",
        "es": "{files} no se pudo restaurar como estaba antes de las comprobaciones; su versión de antes está en una carpeta temporal indicada en el registro de la verificación, que se borra a las seis horas.",
        "fr": "{files} n'a pas pu être remis comme avant les vérifications ; sa version d'avant est dans un dossier temporaire indiqué dans le journal de la vérification, supprimé au bout de six heures.",
        "de": "{files} konnte nicht wie vor den Prüfungen zurückgelegt werden; die Version von vorher liegt in einem temporären Ordner, der im Prüfprotokoll steht und nach sechs Stunden gelöscht wird.",
        "ru": "{files} не удалось вернуть в прежнее состояние; версия до проверок лежит во временной папке, указанной в журнале проверки, и удаляется через шесть часов."
    },
    "recoverySaved": {
        "ar": "احتفظ جو بملفات بيانات تطبيقك كما كانت قبل كل إعادة، خارج مشروعك، لمدة {days} يومًا، ما لم تمتلئ المساحة التي يخصّصها جو لهذه النسخ قبل ذلك، فتُحذف الأقدم أولًا. لاسترجاع نسخة، اطلب ذلك من جو في المحادثة.",
        "en": "Joe kept your app's data files as they were before each put-back, outside your project, for {days} days — unless the space Joe sets aside for these copies fills up first, when the oldest go first. To bring one back, ask Joe in the chat.",
        "es": "Joe guardó los archivos de datos de tu aplicación tal como estaban antes de cada restauración, fuera de tu proyecto, durante {days} días, salvo que el espacio que Joe reserva para estas copias se llene antes; entonces se borran primero las más antiguas. Para recuperar una, pídeselo a Joe en el chat.",
        "fr": "Joe a gardé les fichiers de données de votre application tels qu'ils étaient avant chaque remise, hors de votre projet, pendant {days} jours — sauf si l'espace que Joe réserve à ces copies se remplit avant ; les plus anciennes partent alors en premier. Pour en récupérer une, demandez-le à Joe dans la discussion.",
        "de": "Joe hat die Datendateien Ihrer App so, wie sie vor jedem Zurücklegen waren, außerhalb Ihres Projekts {days} Tage lang aufbewahrt — es sei denn, der Platz, den Joe für diese Kopien vorsieht, ist vorher voll; dann gehen die ältesten zuerst. Um eine zurückzuholen, fragen Sie Joe im Chat.",
        "ru": "Joe сохранил файлы данных приложения в том виде, в каком они были перед каждым возвратом, вне вашего проекта, на {days} дней — если только место, которое Joe отводит под эти копии, не заполнится раньше; тогда первыми удаляются самые старые. Чтобы вернуть копию, попросите Joe в чате."
    },
    "fenceDown": {
        "ar": "لم يعمل سياج الشبكة الذي يضعه جو، فجرت الفحوص دون أن تحفظ شيئًا في تطبيقك.",
        "en": "Joe's network fence did not start, so the checks ran without saving anything in your app.",
        "es": "La barrera de red de Joe no arrancó, así que las comprobaciones se hicieron sin guardar nada en tu aplicación.",
        "fr": "La barrière réseau de Joe n'a pas démarré ; les vérifications ont donc tourné sans rien enregistrer dans votre application.",
        "de": "Joes Netzwerkschranke startete nicht; die Prüfungen liefen daher, ohne etwas in Ihrer App zu speichern.",
        "ru": "Сетевой барьер Joe не запустился, поэтому проверки прошли, ничего не сохраняя в приложении."
    },
    "fenceDownChanged": {
        "ar": "لم يعمل سياج الشبكة الذي يضعه جو، فجرت الفحوص دون أن تضغط ما يحفظ في تطبيقك.",
        "en": "Joe's network fence did not start, so the checks ran without pressing what saves in your app.",
        "es": "La barrera de red de Joe no arrancó, así que las comprobaciones se hicieron sin pulsar lo que guarda en tu aplicación.",
        "fr": "La barrière réseau de Joe n'a pas démarré ; les vérifications ont donc tourné sans appuyer sur ce qui enregistre dans votre application.",
        "de": "Joes Netzwerkschranke startete nicht; die Prüfungen liefen daher, ohne in Ihrer App zu drücken, was speichert.",
        "ru": "Сетевой барьер Joe не запустился, поэтому проверки прошли, не нажимая в приложении то, что сохраняет."
    },
    "lockBusyChanged": {
        "ar": "كان فحص آخر لهذا التطبيق ما زال يعمل، فجرى هذا الفحص دون أن يضغط ما يحفظ في تطبيقك، ولم يُعِد شيئًا.",
        "en": "Another check of this app was still running, so this one ran without pressing what saves in your app, and put nothing back.",
        "es": "Otra comprobación de esta aplicación seguía en marcha, así que esta se hizo sin pulsar lo que guarda en tu aplicación y no restauró nada.",
        "fr": "Une autre vérification de cette application tournait encore ; celle-ci a donc tourné sans appuyer sur ce qui enregistre dans votre application, et n'a rien remis.",
        "de": "Eine andere Prüfung dieser App lief noch; diese lief daher, ohne in Ihrer App zu drücken, was speichert, und legte nichts zurück.",
        "ru": "Другая проверка этого приложения ещё шла, поэтому эта прошла, не нажимая в приложении то, что сохраняет, и ничего не возвращала."
    },
    "lockBusy": {
        "ar": "كان فحص آخر لهذا التطبيق ما زال يعمل، فجرى هذا الفحص دون أن يحفظ شيئًا في تطبيقك، ولم يُعِد شيئًا.",
        "en": "Another check of this app was still running, so this one ran without saving anything in your app, and put nothing back.",
        "es": "Otra comprobación de esta aplicación seguía en marcha, así que esta se hizo sin guardar nada en tu aplicación y no restauró nada.",
        "fr": "Une autre vérification de cette application tournait encore ; celle-ci a donc tourné sans rien enregistrer dans votre application, et n'a rien remis.",
        "de": "Eine andere Prüfung dieser App lief noch; diese lief daher, ohne etwas in Ihrer App zu speichern, und legte nichts zurück.",
        "ru": "Другая проверка этого приложения ещё шла, поэтому эта прошла, ничего не сохраняя в приложении, и ничего не возвращала."
    },
    "dataPutBack": {
        "ar": "تغيّرت أثناء فحوص جو ملفات بيانات في تطبيقك: {files}؛ وأُعيدت كما كانت قبل الفحوص.",
        "en": "While Joe's checks ran, these data files of your app changed: {files}; they were put back as they were before the checks.",
        "es": "Mientras corrían las comprobaciones de Joe cambiaron estos archivos de datos de tu aplicación: {files}; se restauraron como estaban antes de las comprobaciones.",
        "fr": "Pendant les vérifications de Joe, ces fichiers de données de votre application ont changé : {files} ; ils ont été remis comme avant les vérifications.",
        "de": "Während Joes Prüfungen änderten sich diese Datendateien Ihrer App: {files}; sie wurden so zurückgelegt, wie sie vor den Prüfungen waren.",
        "ru": "Пока шли проверки Joe, изменились эти файлы данных приложения: {files}; они возвращены в состояние до проверок."
    },
    "leftChangedLock": {
        "ar": "تغيّرت أثناء هذه الفحوص ملفات بيانات في تطبيقك: {files}؛ ولم تُعَد، لأن فحصًا آخر لهذا التطبيق كان يعمل في الوقت نفسه.",
        "en": "While these checks ran, these data files of your app changed: {files}; they were not put back, because another check of this app was running at the same time.",
        "es": "Mientras corrían estas comprobaciones cambiaron estos archivos de datos de tu aplicación: {files}; no se restauraron, porque otra comprobación de esta aplicación estaba en marcha a la vez.",
        "fr": "Pendant ces vérifications, ces fichiers de données de votre application ont changé : {files} ; ils n'ont pas été remis, car une autre vérification de cette application tournait en même temps.",
        "de": "Während dieser Prüfungen änderten sich diese Datendateien Ihrer App: {files}; sie wurden nicht zurückgelegt, weil gleichzeitig eine andere Prüfung dieser App lief.",
        "ru": "Пока шли эти проверки, изменились эти файлы данных приложения: {files}; они не возвращены, потому что одновременно шла другая проверка этого приложения."
    },
    "leftChangedServer": {
        "ar": "تغيّرت أثناء الفحوص ملفات بيانات في تطبيقك: {files}؛ ولم تُعَد، لأن خادم تطبيقك لم يتوقف.",
        "en": "While the checks ran, these data files of your app changed: {files}; they were not put back, because your app's server did not stop.",
        "es": "Mientras corrían las comprobaciones cambiaron estos archivos de datos de tu aplicación: {files}; no se restauraron, porque el servidor de tu aplicación no se detuvo.",
        "fr": "Pendant les vérifications, ces fichiers de données de votre application ont changé : {files} ; ils n'ont pas été remis, car le serveur de votre application ne s'est pas arrêté.",
        "de": "Während der Prüfungen änderten sich diese Datendateien Ihrer App: {files}; sie wurden nicht zurückgelegt, weil der Server Ihrer App nicht anhielt.",
        "ru": "Пока шли проверки, изменились эти файлы данных приложения: {files}; они не возвращены, потому что сервер приложения не остановился."
    },
    "notWrittenChanged": {
        "ar": "تطبيقك يحفظ بياناته على خادمه ({why})، فجرت فحوص جو على تطبيقك الحي دون أن تضغط ما يحفظ؛ لم تُجرَّب: {labels} (المجموع: {n}).",
        "en": "Your app keeps its data on its server ({why}), so Joe's checks ran on your live app without pressing what saves; not tried: {labels} (total: {n}).",
        "es": "Tu aplicación guarda sus datos en su servidor ({why}), así que las comprobaciones de Joe se hicieron en tu aplicación real sin pulsar lo que guarda; sin probar: {labels} (total: {n}).",
        "fr": "Votre application garde ses données sur son serveur ({why}) ; les vérifications de Joe ont donc tourné sur votre application réelle sans appuyer sur ce qui enregistre ; non essayé : {labels} (total : {n}).",
        "de": "Ihre App speichert ihre Daten auf ihrem Server ({why}); Joes Prüfungen liefen deshalb auf Ihrer echten App, ohne zu drücken, was speichert; nicht ausprobiert: {labels} (insgesamt: {n}).",
        "ru": "Ваше приложение хранит данные на своём сервере ({why}), поэтому проверки Joe прошли на рабочем приложении, не нажимая то, что сохраняет; не опробовано: {labels} (всего: {n})."
    },
    "notWrittenChangedSignedIn": {
        "ar": "تطبيقك يحفظ بياناته على خادمه ({why})، فجرت فحوص جو على تطبيقك الحي دون أن تضغط ما يحفظ غير تسجيل الدخول بالحساب الذي أعطيته؛ لم تُجرَّب: {labels} (المجموع: {n}).",
        "en": "Your app keeps its data on its server ({why}), so Joe's checks ran on your live app without pressing what saves beyond signing in with the account you gave; not tried: {labels} (total: {n}).",
        "es": "Tu aplicación guarda sus datos en su servidor ({why}), así que las comprobaciones de Joe se hicieron en tu aplicación real sin pulsar lo que guarda salvo el inicio de sesión con la cuenta que diste; sin probar: {labels} (total: {n}).",
        "fr": "Votre application garde ses données sur son serveur ({why}) ; les vérifications de Joe ont donc tourné sur votre application réelle sans appuyer sur ce qui enregistre, hormis la connexion avec le compte fourni ; non essayé : {labels} (total : {n}).",
        "de": "Ihre App speichert ihre Daten auf ihrem Server ({why}); Joes Prüfungen liefen deshalb auf Ihrer echten App, ohne zu drücken, was speichert, außer der Anmeldung mit dem angegebenen Konto; nicht ausprobiert: {labels} (insgesamt: {n}).",
        "ru": "Ваше приложение хранит данные на своём сервере ({why}), поэтому проверки Joe прошли на рабочем приложении, не нажимая то, что сохраняет, кроме входа под указанной вами учётной записью; не опробовано: {labels} (всего: {n})."
    },
    "writeSignal": {
        "ar": "فتحت الفحوص {n} عنوانًا ردّ عليه تطبيقك بتحويل المتصفح إلى صفحة أخرى ({paths})، وهذا ما تفعله التطبيقات عادة بعد أن تحفظ شيئًا؛ فلم تفتح الفحوص بعدها عناوين على الشكل نفسه.",
        "en": "The checks opened {n} address(es) your app answered by sending the browser to another page ({paths}), which apps usually do after saving something; so the checks opened no more addresses of that shape.",
        "es": "Las comprobaciones abrieron {n} dirección(es) a las que tu aplicación respondió enviando el navegador a otra página ({paths}), lo que las aplicaciones suelen hacer tras guardar algo; así que no abrieron más direcciones de esa forma.",
        "fr": "Les vérifications ont ouvert {n} adresse(s) auxquelles votre application a répondu en envoyant le navigateur vers une autre page ({paths}), ce que font d'habitude les applications après avoir enregistré quelque chose ; elles n'ont donc plus ouvert d'adresses de cette forme.",
        "de": "Die Prüfungen öffneten {n} Adresse(n), auf die Ihre App mit einer Weiterleitung zu einer anderen Seite antwortete ({paths}) — so antworten Apps meist, nachdem sie etwas gespeichert haben; deshalb öffneten die Prüfungen keine weiteren Adressen dieser Form.",
        "ru": "Проверки открыли {n} адрес(ов), на которые приложение ответило переходом на другую страницу ({paths}) — так приложения обычно делают после сохранения; поэтому адреса такого вида проверки больше не открывали."
    },
    "workersHeld": {
        "ar": "تشغّل صفحة تطبيقك عمّالًا في الخلفية لا تستطيع فحوص جو أن تحجز ما يرسلونه، فلم تسمح لهم الفحوص بالعمل، وما يقومون به لم يُجرَّب.",
        "en": "Your app's page starts background workers whose requests Joe's checks cannot hold, so the checks did not let them start, and what they do was not tried.",
        "es": "La página de tu aplicación inicia procesos en segundo plano cuyas peticiones las comprobaciones de Joe no pueden retener, así que no los dejaron arrancar y lo que hacen no se probó.",
        "fr": "La page de votre application lance des tâches de fond dont les vérifications de Joe ne peuvent retenir les requêtes ; elles ne les ont donc pas laissées démarrer, et ce qu'elles font n'a pas été essayé.",
        "de": "Die Seite Ihrer App startet Hintergrund-Worker, deren Anfragen Joes Prüfungen nicht zurückhalten können; die Prüfungen ließen sie daher nicht starten, und was sie tun, wurde nicht ausprobiert.",
        "ru": "Страница приложения запускает фоновые обработчики, чьи запросы проверки Joe не могут задержать, поэтому проверки не дали им запуститься, и то, что они делают, не опробовано."
    }
} as const;

type QaLineKey = Exclude<keyof typeof QA_LINES, 'probeName' | 'why' | 'reasonToWhy'>;
type QaLanguage = keyof typeof QA_LINES.fenceDown;

const languageOf = (language: string): QaLanguage => {
    const code = String(language || '').toLowerCase().slice(0, 2);
    return (code in QA_LINES.fenceDown ? code : 'en') as QaLanguage;
};

function fill(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/gu, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/**
 * What is told about how the checks treated his data, in his language: each line only when what it says was
 * measured — the private window only with no refusal, «nothing saved» only on the no-write walk (with the
 * sign-in named when it happened), the recovery copy only when one was kept before a put-back.
 */
export function qaPathLines(q: DeliveryQaPath | undefined, language: string): string[] {
    if (!q) return [];
    const lang = languageOf(language);
    const comma = lang === 'ar' ? '، ' : ', ';
    const say = (key: QaLineKey, vars: Record<string, string | number> = {}) => fill(QA_LINES[key][lang] || QA_LINES[key].en, vars);
    const quoted = (items: string[], max: number) => `${items.slice(0, max).map(l => `«${l}»`).join(comma)}${items.length > max ? `${comma}…` : ''}`;
    const lines: string[] = [];
    //  «Nothing saved» is said only when nothing of his changed during the checks (review 7, B1).
    const changedFirst = !!(q.putBack?.length || q.leftChanged?.files.length || q.putBackFailed?.length);
    if (q.fenceDown) lines.push(say(changedFirst ? 'fenceDownChanged' : 'fenceDown'));
    if (q.lockBusy) lines.push(say(changedFirst ? 'lockBusyChanged' : 'lockBusy'));
    if (q.walked && q.origin) {
        if (q.path === 'private-live' && !q.blocked) lines.push(say('checkedPrivately', { origin: q.origin }));
        if (q.path === '2t') lines.push(say('checkedAsBefore', { origin: q.origin }));
    }
    //  «Nothing saved» is said only when nothing of his changed during the checks (review 7, B1): else what changed is named below.
    const changedDuring = !!(q.putBack?.length || q.leftChanged?.files.length || q.putBackFailed?.length);
    if (q.walked && q.path === 'no-write' && q.why) {
        const whyKey = (q.why in QA_LINES.why ? q.why : 'notProven') as keyof typeof QA_LINES.why;
        const why = fill(QA_LINES.why[whyKey][lang] || QA_LINES.why[whyKey].en, { detail: String(q.whyDetail || '').slice(0, 200) });
        const key: QaLineKey = changedDuring
            ? (q.signedIn ? 'notWrittenChangedSignedIn' : 'notWrittenChanged')
            : (q.signedIn ? 'notWrittenSignedIn' : 'notWritten');
        lines.push(say(key, { why, labels: q.notTried.length ? quoted(q.notTried, 3) : '—', n: q.notTried.length }));
    }
    if (q.workersHeld) lines.push(say('workersHeld'));
    if (q.writeSignals?.length) lines.push(say('writeSignal', { n: q.writeSignals.length, paths: quoted(q.writeSignals, 3) }));
    if (q.blocked > 0 && q.path !== 'as-today') lines.push(say('blocked', { n: q.blocked, hosts: (q.blockedHosts || []).slice(0, 3).join(comma) || '—' }));
    for (const probe of q.skippedProbes) {
        const name = QA_LINES.probeName[probe];
        if (name) lines.push(say('probeSkipped', { probe: name[lang] || name.en }));
    }
    if (q.notComparable) lines.push(say('notComparable', { from: q.notComparable.from, to: q.notComparable.to }));
    if (q.recovery) {
        if (q.recovery.versions > 0) lines.push(say('recoverySaved', { days: q.recovery.keptDays }));
        if (q.recovery.unexplained.length) lines.push(say('recoveryKept', { files: quoted(q.recovery.unexplained, 6) }));
        if (q.recovery.overBudget) lines.push(say('recoveryOverBudget'));
    }
    //  Which of his data files changed during the checks, and what became of them (B1, H3) — on every path.
    if (q.putBack?.length) lines.push(say('dataPutBack', { files: quoted(q.putBack, 6) }));
    if (q.leftChanged?.files.length) lines.push(say(q.leftChanged.why === 'lockBusy' ? 'leftChangedLock' : 'leftChangedServer', { files: quoted(q.leftChanged.files, 6) }));
    if (q.putBackFailed?.length) lines.push(say(q.putBackFailedBefore === 'snapshot' ? 'putBackFailedSnapshot' : 'putBackFailed', { files: quoted(q.putBackFailed, 6) }));
    return lines;
}

/** The facts the record keeps (DeliveryRecord.qaPath), from the last measurement kept and what the verification measured. */
function qaPathOfRecord(span: QaSpan, audit: AppAudit | undefined, watched: AppDataWatch | undefined, walkedUrl: string, skippedProbes?: Array<'isolation' | 'builderProofs'>): DeliveryQaPath {
    const walked = !!audit && !audit.skipped;
    const walk = walked ? qaOf(audit) : undefined;
    const ran: QaPath = walk?.path || span.pin.path || 'no-write';
    const reasons = walk?.reasons?.length ? walk.reasons : (span.choice?.reasons || []);
    const first = reasons[0];
    //  The probes' browsers went through the verification's own fence: what it refused is the page's too.
    const probeRefusals = (() => { try { return span.fence ? span.fence.appRefusals() : []; } catch { return []; } })();
    const probeHeld = (() => { try { return span.fence ? span.fence.held().map(h => `request: ${h.what.replace(/^(\S+) [^/\s]+/u, '$1 ')}`.replace(/ {2,}/gu, ' ')) : []; } catch { return []; } })();
    try { for (const w of span.fence?.windows() || []) span.windows.add(w); } catch { /* the fence is gone: the windows already kept stand */ }
    const hosts = Array.from(new Set([...(walk?.blockedHosts || []), ...probeRefusals.map(r => refusedHost(r.what)).filter(Boolean)]));
    const reasonToWhy = QA_LINES.reasonToWhy as Record<QaReasonKey, string>;
    let recovery: DeliveryQaPath['recovery'];
    //  M2: the windows a change may come from are the requests that could write (a plain GET read explains nothing).
    const writing = span.windows.list().filter(w => w.writes !== false);
    if (watched && span.putBackRan) {
        const versions = watched.versions();
        recovery = {
            versions: versions.length,
            bytes: versions.reduce((sum, v) => sum + v.bytes, 0),
            unexplained: unexplainedFiles(watched.changes(), writing),
            overBudget: watched.overBudget(),
            keptDays: RECOVERY_BUDGET.keepDays,
            runId: span.runKey,
        };
    }
    return {
        path: ran,
        ...(first ? { why: reasonToWhy[first.key] || 'notProven', whyDetail: first.detail } : {}),
        blocked: (Number(walk?.blocked) || 0) + probeRefusals.length,
        ...(hosts.length ? { blockedHosts: hosts } : {}),
        //  What the probes' fence held at his app (a worker's write the probes' guards never saw, B2) is not tried either.
        notTried: Array.from(new Set([...(walk?.notTried || []), ...probeHeld])),
        skippedProbes: [...(skippedProbes || [])],
        ...(recovery ? { recovery } : {}),
        ...(walked && originOf(walkedUrl) ? { origin: originOf(walkedUrl) } : {}),
        walked,
        ...(walk?.signedIn ? { signedIn: true } : {}),
        ...(span.fenceDown ? { fenceDown: true } : {}),
        ...(span.lockBusy ? { lockBusy: true } : {}),
        ...(span.notComparable ? { notComparable: span.notComparable } : {}),
        ...(span.putBackFailed.length ? { putBackFailed: [...span.putBackFailed], ...(span.putBackFailedBefore ? { putBackFailedBefore: span.putBackFailedBefore } : {}) } : {}),
        ...(span.putBackStores.length ? { putBack: [...span.putBackStores] } : {}),
        ...(span.leftChanged?.files.length ? { leftChanged: { files: [...span.leftChanged.files], why: span.leftChanged.why } } : {}),
        ...(walk?.writeSignals?.length ? { writeSignals: [...walk.writeSignals] } : {}),
        ...(walk?.workersHeld ? { workersHeld: true } : {}),
    };
}

/* ───────────────────────── bringing a kept version back (design v13.3 §5b step 2) ───────────────────────── */

/** A kept run of one project: when, and each version's number, time, files (project-relative) and bytes — never their contents. */
export interface RecoveryRunListing { runId: string; startedAt: number; versions: Array<{ n: number; at: number; files: string[]; bytes: number }> }

/** The recovery copies kept for a project, newest first (names and sizes only: what Joe shows before he brings one back). */
export async function listRecoveryVersions(workspaceId: string, projectRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<RecoveryRunListing[]> {
    const dir = recoveryProjectDir(workspaceId, path.resolve(projectRoot), env);
    let entries: fs.Dirent[] = [];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return []; }
    const out: RecoveryRunListing[] = [];
    for (const e of entries) {
        if (!e.isDirectory() || e.isSymbolicLink()) continue;
        try {
            const index = JSON.parse(await fs.promises.readFile(path.join(dir, e.name, 'run.json'), 'utf8'));
            out.push({
                runId: e.name,
                startedAt: Number(index?.startedAt) || 0,
                versions: (Array.isArray(index?.versions) ? index.versions : []).map((v: any) => ({
                    n: Number(v?.n) || 0, at: Number(v?.at) || 0, files: Array.isArray(v?.files) ? v.files.map(String) : [], bytes: Number(v?.bytes) || 0,
                })),
            });
        } catch { /* not a run */ }
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
}

/** What bringing a version back did: file names and sizes only, never their contents. */
export interface RecoveryRestore {
    ok: boolean;
    restored: Array<{ file: string; bytes: number }>;
    skipped: Array<{ file: string; why: string }>;
    /** The files as they were just before, kept beside the version (so bringing one back loses nothing either). */
    keptAside: string[];
    error?: string;
}

const SQLITE_FILE = /\.(?:db|sqlite|sqlite3|db3)$/iu;

/**
 * Brings one kept version of the owner's data files back into his project (design v13.3 §5b step 2): called
 * when he asks in the chat and Joe has confirmed which version (listRecoveryVersions). A file copy by Joe's
 * code — the model never reads the copies. Only data files come back, only inside the project, never through
 * a link; what each file is now is kept aside first. A database copied whole (one file, out of WAL mode)
 * replaces its old journal too. Stop the app's server first: a running server writes its own copy back.
 */
export async function restoreRecoveryVersion(workspaceId: string, projectRoot: string, runId: string, n: number, env: NodeJS.ProcessEnv = process.env): Promise<RecoveryRestore> {
    const root = path.resolve(projectRoot);
    const out: RecoveryRestore = { ok: false, restored: [], skipped: [], keptAside: [] };
    const home = recoveryHome(env);
    const versionDir = recoveryVersionDir(workspaceId, root, runId, n, env);
    if (!isInsideFolder(versionDir, home) || isInsideFolder(versionDir, root)) return { ...out, error: 'that version is not one of Joe\'s recovery copies' };
    try {
        const st = await fs.promises.lstat(versionDir);
        if (!st.isDirectory() || st.isSymbolicLink()) return { ...out, error: 'that version is not kept' };
    } catch { return { ...out, error: 'that version is not kept (it may have been pruned)' }; }
    const files: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
        let entries: fs.Dirent[] = [];
        try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.isSymbolicLink()) continue;
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) await walk(path.join(dir, e.name), r);
            else if (e.isFile()) files.push(r);
        }
    };
    await walk(versionDir, '');
    //  What the files are now is kept as a run of its own (one version), so the chat lists it and can bring it back too.
    const asideRun = path.join(recoveryProjectDir(workspaceId, root, env), `before-restore-${Date.now().toString(36)}`);
    const aside = path.join(asideRun, '1');
    let asideBytes = 0;
    const keepAside = async (rel: string, abs: string) => {
        try { if (!(await fs.promises.lstat(abs)).isFile()) return; } catch { return; }
        const to = path.join(aside, ...rel.split('/'));
        await fs.promises.mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
        await fs.promises.copyFile(abs, to);
        try { asideBytes += (await fs.promises.stat(to)).size; } catch { /* counted when it can be */ }
        out.keptAside.push(rel);
    };
    for (const rel of files.sort()) {
        if (!isData(rel)) { out.skipped.push({ file: rel, why: 'not one of the app\'s data files' }); continue; }
        const target = await resolveInProject(root, rel, 'write');
        if (!target.ok) { out.skipped.push({ file: rel, why: String(target.error || 'outside the project') }); continue; }
        if (target.isDir) { out.skipped.push({ file: rel, why: 'a folder is there now' }); continue; }
        try {
            const from = path.join(versionDir, ...rel.split('/'));
            await keepAside(rel, target.abs);
            //  A database kept whole is one file: its old journal would replay over it, so it goes (kept aside first).
            if (SQLITE_FILE.test(rel) && !files.includes(`${rel}-wal`)) {
                for (const extra of ['-wal', '-shm', '-journal']) {
                    const journal = await resolveInProject(root, `${rel}${extra}`, 'write');
                    if (!journal.ok || !journal.exists || journal.isDir) continue;
                    await keepAside(`${rel}${extra}`, journal.abs);
                    await fs.promises.rm(journal.abs, { force: true });
                }
            }
            await fs.promises.mkdir(path.dirname(target.abs), { recursive: true });
            await fs.promises.copyFile(from, target.abs);
            out.restored.push({ file: rel, bytes: (await fs.promises.stat(target.abs)).size });
        } catch (e) {
            out.skipped.push({ file: rel, why: `could not be copied back (${message(e)})` });
        }
    }
    if (out.keptAside.length) {
        const at = Date.now();
        await fs.promises.writeFile(path.join(asideRun, 'run.json'), JSON.stringify({ runId: path.basename(asideRun), startedAt: at, overBudget: false, versions: [{ n: 1, at, why: 'before a restore', files: [...out.keptAside], bytes: asideBytes }] }, null, 2), { mode: 0o600 }).catch(() => undefined);
    }
    out.ok = out.restored.length > 0 && !out.skipped.length;
    if (!out.restored.length && !out.error) out.error = files.length ? 'nothing in that version could be brought back' : 'that version holds no files';
    return out;
}

/**
 * Every requirement the request named that is not proven met: each verdict
 * that is not «met», with the judge's reason, and each requirement the judge
 * never ruled on (the run was cancelled, the check raised) — with why it was
 * not judged. Ids are the plan's R1…Rn.
 */
function unprovenRequirements(
    ctx: ToolContext,
    judged: JudgedRequirement[],
    ledger: DeliveryLedger,
    reasons: Map<DeliveryInstrument, string>,
): VerificationReport['unproven'] {
    const out: VerificationReport['unproven'] = judged
        .filter(r => r.verdict !== 'met')
        .map(r => ({
            id: r.id, text: r.text,
            reason: r.judgedBy === 'sight'
                ? `${r.verdict === 'unmet' ? 'not met, seen on the page' : 'not judged by eye (this does not block the delivery)'}: ${r.why}`
                : `${r.verdict === 'unmet' ? 'not met' : 'not provable'}: ${r.why}`,
        }));
    const ruled = new Set(judged.map(r => r.id));
    const measured = ledger.all().find(m => m.instrument === 'acceptance');
    const whyNot = measured && measured.ok !== true ? String(measured.error || 'the acceptance check failed')
        : reasons.get('acceptance') || 'the judge gave no verdict for it';
    for (const r of (ctx.state?.plan?.requirements || []).filter((x: Requirement) => x.fromRequest)) {
        if (ruled.has(r.id)) continue;
        out.push({ id: r.id, text: r.text, reason: `not judged: ${whyNot}` });
    }
    return out;
}

/* ───────────────────────── C2: the source ───────────────────────── */

/**
 * What the source says before anything runs: what was parsed, what does not
 * parse (or renders a component, or uses a name, it never declares), and what
 * could not be checked here (no interpreter, a check that did not conclude, a
 * script a page hands to something that is not a JavaScript engine).
 */
export async function measureProjectSource(root: string, deadlineAt: number, cancelled: () => boolean = () => false): Promise<{ measured: string[]; problems: string[]; notMeasured: string[] }> {
    const measured: string[] = [];
    const problems: string[] = [];
    const notMeasured: string[] = [];

    //  JavaScript, each file held to the goal Node or its page really parses it with.
    const js = await checkJavaScriptSyntax(root);
    if (js.files.length) {
        if (js.failure?.kind === 'syntax') problems.push(`${js.failure.file}: ${js.failure.error}`);
        if (js.failure?.kind === 'unchecked') notMeasured.push(`JavaScript (${js.failure.file}): ${js.failure.error}`);
        else measured.push(`${js.files.length} JavaScript file(s)`);
    }
    for (const n of js.notParsed || []) notMeasured.push(`${n.file}: ${n.why}`);

    //  JSX/TSX parse only through a build; what this can still say is that a
    //  rendered component, or a name, is declared somewhere in its module.
    const components = await listProjectFiles(root, {
        skipDirectory: name => name === 'dist' || name === 'build' || name.startsWith('.'),
        keepFile: (_relative, name) => /\.(?:jsx|tsx)$/iu.test(name),
    });
    let read = 0;
    for (const rel of components) {
        if (cancelled()) break;
        let text: string;
        try { text = await fs.promises.readFile(path.join(root, rel), 'utf8'); }
        catch (e) { notMeasured.push(`${rel}: unreadable (${message(e)})`); continue; }
        const mismatch = undefinedJsxComponentMismatch(rel, text) || undefinedSourceReferenceMismatch(rel, text);
        if (mismatch) problems.push(mismatch);
        read++;
        //  Each check builds a TypeScript program synchronously: the loop is
        //  handed back between files, so other users' requests keep moving.
        await yieldTurn();
    }
    if (read) measured.push(`${read} JSX/TSX file(s) for undeclared components and names`);
    if (read < components.length && cancelled()) notMeasured.push(`${components.length - read} JSX/TSX file(s): the run was cancelled`);

    //  Python, compiled without writing into the project: the bytecode goes
    //  to a folder of its own, removed when the check ends.
    const python = await listProjectFiles(root, {
        skipDirectory: name => name.startsWith('.'),
        keepFile: (_relative, name) => /\.py$/iu.test(name),
    });
    if (python.length && !cancelled()) {
        const cache = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'joe-eng-pycache-'));
        try {
            const machineState = `[\\\\/](?:${[...MACHINE_STATE_DIRECTORIES].map(escapeRegExp).join('|')})(?:[\\\\/]|$)`;
            const run = await runPython(['-m', 'compileall', '-q', '-x', machineState, '.'], {
                cwd: root,
                timeout: Math.max(30_000, deadlineAt - Date.now()),
                env: { PYTHONPYCACHEPREFIX: cache },
            });
            const said = tail(`${run.output}\n${run.error}`);
            if (run.missing) notMeasured.push('Python: no interpreter on this machine');
            else if (run.ok) measured.push(`${python.length} Python file(s)`);
            else if (run.exitCode === 1 || /Error compiling|SyntaxError|IndentationError/u.test(said)) problems.push(`Python: ${said}`);
            else notMeasured.push(`Python: the compile check did not conclude (${said || `exit ${run.exitCode ?? 'none'}`})`);
        } finally {
            await fs.promises.rm(cache, { recursive: true, force: true }).catch(() => undefined);
        }
    }
    return { measured, problems, notMeasured };
}

/* ───────────────────────── C11: acceptance ───────────────────────── */

/**
 * The source the judge reads: the web stack the builders read, plus the other
 * languages a hand-written project may be in, each file opened by its name
 * (judgeSourceOf), so a project too big to show whole is shown by whole files.
 * Returns what was left out, by name.
 */
/** Source code, in every language a project may be written in. */
const JUDGE_CODE_FILE = /\.(?:jsx?|tsx?|html|css|py|go|rb|rs|java|kt|php|cs|vue|svelte|astro|mjs|cjs)$/iu;

/** A document a request can ask for, readable as text (a sheet as CSV, slides as HTML or Markdown). */
const DOCUMENT_FILE = /\.(?:md|markdown|txt|csv|tsv|html?)$/iu;
/** Binary documents: delivered, but read by no judge (named so the model knows to give a readable copy). */
const BINARY_DOCUMENT_FILE = /\.(?:xlsx|docx|pptx|pdf)$/iu;
const NOT_A_DELIVERED_DOCUMENT = /^(?:readme|changelog|contributing|license|joe-delivery)(?:\.[a-z]+)?$/iu;

/** The documents the project delivers, with their words, largest first (machine folders and Joe's own files aside). */
export async function deliveredDocuments(root: string): Promise<Array<{ path: string; words: number }>> {
    const files = await listProjectFiles(root, {
        skipDirectory: name => name === 'node_modules' || name === 'dist' || name.startsWith('.'),
        keepFile: (relative, name) => (DOCUMENT_FILE.test(name) || BINARY_DOCUMENT_FILE.test(name)) && !NOT_A_DELIVERED_DOCUMENT.test(name) && !isJoeAppKit(relative),
    });
    const out: Array<{ path: string; words: number }> = [];
    for (const rel of files) {
        try {
            const abs = path.join(root, rel);
            const stat = await fs.promises.stat(abs);
            if (!stat.size) continue;
            const words = BINARY_DOCUMENT_FILE.test(rel) || stat.size > 2_000_000 ? 0
                : (String(await fs.promises.readFile(abs, 'utf8')).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/giu, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
            out.push({ path: rel.split(path.sep).join('/'), words });
        } catch { /* unreadable is not delivered */ }
    }
    return out.sort((a, b) => b.words - a.words);
}
/**
 * The project's own documentation and configuration. C12 of the Codex exam
 * (2026-11-06): «rename timeout to timeout_seconds in the code, the tests
 * and the README». The judge was shown the code only, ruled «R1 unprovable:
 * README.md itself is not shown», and Joe refused his own correct delivery
 * for 22 minutes; every hidden test passed. A README line, a renamed key in a
 * config file, a version in package.json are requirements too. Small files
 * only (a big JSON is data, not configuration), and never a lockfile.
 */
//  A sheet delivered as CSV is read too (the Manus-style exam, 2026-11-09: a comparison in a CSV).
//  …and an installable app's manifest is its configuration (the eleventh live check, 2026-11-11, L191: «manifest.webmanifest
//  itself is not shown» — the judge could not prove the salon's app installable, and Joe renamed it .json to be read).
const JUDGE_DOC_OR_CONFIG_FILE = /^(?:readme|changelog|contributing)(?:\.[a-z]+)?$|\.(?:md|mdx|rst|txt|csv|tsv|json|webmanifest|ya?ml|toml|ini|cfg)$/iu;
const LOCKFILE = /^(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|pipfile\.lock|composer\.lock|cargo\.lock)$/iu;
const JUDGE_DOC_BYTES = 64 * 1024;

export async function judgeSource(root: string): Promise<{ text: string; leftOut: string[] }> {
    //  A requirement of a Python, Go or Ruby project would be judged on no
    //  source at all — every verdict «unprovable», the delivery blocked
    //  forever — so its own files are read too, by the same walker.
    const files = await listProjectFiles(root, {
        skipDirectory: name => name === 'dist' || name.startsWith('.'),
        keepFile: (relative, name) => !isJoeAppKit(relative) && (JUDGE_CODE_FILE.test(name) || (JUDGE_DOC_OR_CONFIG_FILE.test(name) && !LOCKFILE.test(name))),
    });
    const read: Array<{ path: string; text: string }> = [];
    const leftOut: string[] = [];
    for (const rel of files) {
        try {
            const stat = await fs.promises.stat(path.join(root, rel));
            if (!JUDGE_CODE_FILE.test(rel) && stat.size > JUDGE_DOC_BYTES) continue;
            if (stat.size > JUDGE_FILE_BYTES) { leftOut.push(rel); continue; }
            read.push({ path: rel.split(path.sep).join('/'), text: await fs.promises.readFile(path.join(root, rel), 'utf8') });
        } catch { /* unreadable is not evidence */ }
    }
    return { text: judgeSourceOf(read), leftOut };
}

/*
 * WHAT THE CHANGE CHANGED, AS IT WAS BEFORE.
 *
 * The Codex exam in Arabic, 2026-11-08: C03 asked for `--json` «and the plain
 * output stays exactly as it is». The judge saw only the files as they are now
 * and ruled it unprovable — «no previous version» — and the delivery was
 * refused, though Joe had kept that version himself (the snapshot «تراجع»
 * restores). In the user's own repository the judge is given, after the
 * source, each code or doc file this change modified or deleted as it was
 * before the change, and the names of the files it added.
 */
const BEFORE_MARK = '(before this change) ';
const BEFORE_MAX_BYTES = 48 * 1024;

export async function beforeThisChange(root: string, snapshotId: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { VERSIONS_DIR } = require('../project/versions');
    const kept = path.join(root, VERSIONS_DIR, String(snapshotId), 'files');
    if (!snapshotId || !fs.existsSync(kept)) return '';
    const judged = (rel: string) => JUDGE_CODE_FILE.test(rel) || (JUDGE_DOC_OR_CONFIG_FILE.test(path.basename(rel)) && !LOCKFILE.test(path.basename(rel)));
    const walk = async (abs: string, rel: string, out: string[]): Promise<string[]> => {
        let entries: fs.Dirent[] = [];
        try { entries = await fs.promises.readdir(abs, { withFileTypes: true }); } catch { return out; }
        for (const e of entries) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) { if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && !isJoeAppKit(r)) await walk(path.join(abs, e.name), r, out); }
            else if (e.isFile() && judged(r)) out.push(r);
        }
        return out;
    };
    const was = await walk(kept, '', []);
    const blocks: Array<{ path: string; text: string }> = [];
    let bytes = 0;
    for (const rel of was.sort()) {
        let old = '', now: string | null = null;
        try { old = await fs.promises.readFile(path.join(kept, rel), 'utf8'); } catch { continue; }
        try { now = await fs.promises.readFile(path.join(root, rel), 'utf8'); } catch { now = null; }
        if (now === old) continue;
        if (bytes + old.length > BEFORE_MAX_BYTES) { blocks.push({ path: `${BEFORE_MARK}${rel}`, text: '(too large to show here)' }); continue; }
        bytes += old.length;
        blocks.push({ path: `${BEFORE_MARK}${rel}${now === null ? ' — deleted by this change' : ''}`, text: old });
    }
    const keptSet = new Set(was);
    const added = (await walk(root, '', [])).filter(rel => !keptSet.has(rel) && !rel.startsWith(`${VERSIONS_DIR}/`));
    if (!blocks.length && !added.length) return '';
    return [
        'THE SAME REPOSITORY BEFORE THIS CHANGE (Joe\'s own copy, taken before the run): each file this change modified or deleted, as it was. Judge a requirement that something stays as it was by comparing them; the files above are the repository now, and only they are the delivery.',
        judgeSourceOf(blocks),
        added.length ? `Files this change added: ${added.slice(0, 40).join(', ')}` : '',
    ].filter(Boolean).join('\n');
}

/** The plan's R-id for a requirement the judge knows by its own id. */
function planIdOf(ctx: ToolContext, key: string): string {
    const r = (ctx.state?.plan?.requirements || []).find(x => (x.key || x.id) === key);
    return r?.id || key;
}

function adoptRequirements(ctx: ToolContext, named: NamedRequirement[]): void {
    const plan = ctx.state?.plan;
    if (!plan || !named.length) return;
    let added = 0;
    for (const r of named) {
        if (plan.requirements.some(x => (x.key && x.key === r.id) || x.text.trim().toLowerCase() === r.text.trim().toLowerCase())) continue;
        const requirement: Requirement = { id: `R${plan.requirements.length + 1}`, text: r.text, status: 'open', fromRequest: true, quote: r.quote, key: r.id };
        plan.requirements.push(requirement);
        added++;
    }
    if (added) {
        plan.revision++;
        try { ctx.emit({ type: 'plan', plan }); } catch { /* the plan is recited at the next step either way */ }
    }
}

export async function judgeRequirements(
    ctx: ToolContext,
    request: string,
    isAr: boolean,
    root: string,
    ask: (prompt: string) => Promise<string>,
    note: (line: string) => void,
    evidence: { built: boolean; liveUrl: string; tests?: Pick<NonNullable<DeliveryRunState['requestCoverage']>, 'records' | 'testsRun'> },
    pageDelivered = false,
    documentsAreTheProduct = false,
): Promise<{ blocked: boolean; error: string; requirementsCount: number; leftOut: string[]; bySight: NamedRequirement[]; met: string[]; summary: { requirements: JudgedRequirement[]; requestUnread: boolean; whyNotRead: string } }> {
    //  1. What the request names: the plan's requirements read from it (the
    //  same reader seeded them), or — when the seeding read nothing — a
    //  reading now, which also enters the plan.
    const fromRequest = (ctx.state?.plan?.requirements || []).filter(r => r.fromRequest);
    let named: NamedRequirement[];
    let requestUnread = false;
    let whyNotRead = '';
    if (fromRequest.length) {
        named = fromRequest.map(r => ({ id: r.key || r.id, text: r.text, quote: r.quote || r.text }));
    } else {
        const read = await readRequestRequirements(request, isAr, ask, note);
        named = read.named;
        requestUnread = read.requestUnread;
        whyNotRead = read.whyNotRead;
        adoptRequirements(ctx, read.named);
    }
    //  What a delivered page must LOOK like is judged on the page, after
    //  the Browser QA opened it; everything else on the source.
    const bySight = pageDelivered ? named.filter(r => isAppearanceRequirement(r.text || r.quote)) : [];
    if (bySight.length) {
        named = named.filter(r => !bySight.includes(r));
        note(`acceptance: ${bySight.length} requirement(s) about how the page looks are judged on the page itself: ${bySight.map(r => `«${r.text}»`).join(', ')}`);
    }
    //  A requirement for the project's own tests is judged on Joe's run of
    //  them, when that run measured enough to judge it (H13).
    const byRun = named.map(r => ({ r, run: judgeTestSuiteByRun(r, evidence.tests) }))
        .filter((x): x is { r: NamedRequirement; run: RunVerdict } => x.run !== null);
    const onSource = named.filter(r => !byRun.some(x => x.r === r));
    if (byRun.length) note(`acceptance: ${byRun.map(x => `«${x.r.text}» ${x.run.verdict} on the run of the project's tests`).join(', ')}`);
    //  2-3. The source, and a verdict per requirement grounded in it.
    const source = await judgeSource(root);
    //  His own repository: the files this change changed, as they were before it, so a
    //  requirement that something STAYS as it was is judged on both (beforeThisChange).
    if (ctx.change?.repository && ctx.change.snapshot) {
        const before = await beforeThisChange(root, ctx.change.snapshot);
        if (before) source.text = `${source.text}\n${before}`;
    }
    const verdicts: JudgedNamed[] = onSource.length ? await verifyNamed(onSource, source.text, isAr, ask, undefined, undefined, { documentsAreTheProduct }) : [];
    //  4. The verdicts themselves are the criteria — always, even from a blind
    //  judge, so that criteria > 0 and a judge that could rule on nothing
    //  blocks. No catalogue or structural criterion is added.
    const criteria: Criterion[] = [
        ...verdicts.map(j => ({ id: j.id, kind: 'feature' as const, ar: j.text, en: j.text, preJudged: { verdict: j.verdict, why: j.why } })),
        ...byRun.map(x => ({ id: x.r.id, kind: 'feature' as const, ar: x.r.text, en: x.r.text, preJudged: { verdict: x.run.verdict, why: x.run.why } })),
    ];
    //  5-6. The judgement, and whether it blocks.
    const accepted = judgeAcceptance(criteria, { dir: root, built: evidence.built, liveUrl: evidence.liveUrl || undefined, audit: null, source: source.text }, isAr);
    const blocked = acceptanceBlocksDelivery({
        criteria: accepted.criteria.length,
        accepted: accepted.accepted,
        unprovable: accepted.unprovable,
        named: named.length,
        judgeWasBlind: nothingWasJudged(verdicts),
        requestUnread,
    });
    const error = requestUnread ? deliveryErrorForUnreadRequest(whyNotRead) : deliveryErrorForAcceptance(accepted.criteria);
    const plan = ctx.state?.plan?.requirements || [];
    const requirements: JudgedRequirement[] = accepted.criteria.map(c => {
        const inPlan = plan.find(r => (r.key || r.id) === c.id);
        const judgedBy = byRun.some(x => x.r.id === c.id) ? 'tests' as const : 'source' as const;
        return { id: inPlan?.id || c.id, key: c.id, text: c.en, verdict: c.verdict, why: c.why, judgedBy };
    });
    //  His words of every requirement found met: an item the records reader could not read is read by them.
    const met = accepted.criteria.filter(c => c.verdict === 'met')
        .map(c => named.find(r => r.id === c.id))
        .flatMap(r => r ? [r.quote, r.text].filter(Boolean) : []);
    note(`acceptance: ${accepted.met}/${accepted.criteria.length} met, ${accepted.unmet} unmet, ${accepted.unprovable} unprovable${requestUnread ? ` — the request was not read (${whyNotRead})` : ''}`);
    return { blocked, error, requirementsCount: named.length, leftOut: source.leftOut, bySight, met, summary: { requirements, requestUnread, whyNotRead } };
}

/* ───────────────────────── the report ───────────────────────── */

function skipReasons(input: {
    ledger: DeliveryLedger;
    skipped: Map<DeliveryInstrument, string>;
    programOnly: boolean;
    liveOk: boolean;
    testsAsked: boolean;
    contractOk: boolean;
    contractError?: string;
    requestCoverage?: DeliveryRunState['requestCoverage'];
}): Map<DeliveryInstrument, string> {
    const reasons = new Map(input.skipped);
    const has = (i: DeliveryInstrument) => input.ledger.all().some(m => m.instrument === i);
    const set = (i: DeliveryInstrument, why: string) => { if (!has(i) && !reasons.has(i)) reasons.set(i, why); };
    if (!input.programOnly && !input.liveOk) {
        set('quality', `not judged: the live run failed first, and the manifest contract is judged on a running project. Read before the run: ${input.contractOk ? 'the contract holds' : input.contractError}`);
        set('scope', 'not measured: the live run failed');
        set('coverage', 'not measured: the live run failed');
        set('tests', input.testsAsked ? 'not measured: the live run failed' : 'the request asks for no tests');
    }
    set('scope', input.programOnly ? 'a program is proven by its own tests, not by named scope' : 'not measured');
    set('coverage', input.programOnly
        ? 'a program is proven by its own tests, not by served records'
        : 'the request names no records, record rules or tests to measure');
    set('tests', !input.testsAsked ? 'the request asks for no tests'
        : input.programOnly ? 'the program\'s own test run is its proof (see program)'
            : `not measured, and the delivery needs it: ${input.requestCoverage?.testsRun?.error || 'no runner Joe knows for this project\'s tests'}`);
    return reasons;
}

function reportChecks(
    ledger: DeliveryLedger,
    passed: Map<DeliveryInstrument, string>,
    reasons: Map<DeliveryInstrument, string>,
    remarks: Map<DeliveryInstrument, string[]>,
    required: Set<DeliveryInstrument>,
    requirements: JudgedRequirement[],
): CheckResult[] {
    const all = ledger.all();
    const checks: CheckResult[] = [];
    for (const instrument of REPORT_ORDER) {
        const measured = all.filter(m => m.instrument === instrument);
        const requirementIds = instrument === 'acceptance' && requirements.length ? requirements.map(r => r.id) : undefined;
        const also = (remarks.get(instrument) || []).map(r => ` | ${r}`).join('');
        if (measured.length) {
            const failed = measured.filter(m => m.ok !== true);
            let detail = failed.length
                ? failed.map(m => `${m.target ? `${path.basename(m.target)}: ` : ''}${m.error || 'failed'}`).join(' | ')
                : (passed.get(instrument) || 'passed');
            const unread = instrument === 'coverage' ? stillUnread(all) : [];
            //  What the verdict still counts as unverified: a record the passing tests and a met requirement read is not (delivery-verdict stillUnverified).
            const unverified = instrument === 'coverage' ? stillUnverified(all) : measured.flatMap(m => m.unverified || []);
            if (instrument === 'coverage') {
                const asked = measured.flatMap(m => m.unread || []);
                const read = readAsRequirements(asked, all.flatMap(m => m.instrument === 'acceptance' ? (m.met || []) : []));
                if (read.length) detail += ` | read as requirements the judge found met: ${read.join(', ')}`;
            }
            //  What reads an item, told once (L451, 2026-11-09: ten refusals spent on test names and plan entries, which read nothing).
            if (unread.length) detail += ` | requested items that could not be read: ${unread.join(', ')} — an item is read when the server serves a route named for it, or when a requirement read from his request that holds every word of it is judged met on the source; a requirement added with plan_update, a test named after it, or an evidence line does not read it`;
            if (unverified.length) detail += ` | not measured, so not verified: ${unverified.join('; ')}`;
            if (instrument === 'acceptance' && requirements.length) {
                const open = requirements.filter(r => r.verdict !== 'met');
                if (open.length) detail += ` | ${open.map(r => `${r.id} ${r.verdict}: ${r.why}`).join(' | ')}`;
            }
            const status = failed.length || unread.length || unverified.length ? 'failed' : 'passed';
            checks.push({ id: instrument, status, detail: detail + also, ...(requirementIds ? { requirementIds } : {}) });
            continue;
        }
        const why = reasons.get(instrument) || 'not measured';
        checks.push({
            id: instrument,
            status: 'skipped',
            detail: (required.has(instrument) && !/delivery needs it/u.test(why) ? `not measured, and the delivery needs it: ${why}` : why) + also,
            ...(requirementIds ? { requirementIds } : {}),
        });
    }
    return checks;
}

/** The statuses the pipeline reports (ProjectPipelineTool :4358-4373), without its «phases done» partial. */
export function deliveryStatuses(verdict: DeliveryVerdict, measurements: DeliveryMeasurement[]): Pick<DeliveryRecord, 'executionStatus' | 'verificationStatus' | 'deliveryStatus'> {
    const browserFailed = measurements.some(m => m.instrument === 'browser' && m.ok !== true);
    const notVerifiedOnly = !verdict.failures.length && (verdict.unread.length > 0 || verdict.unverified.length > 0 || verdict.unmeasured.length > 0);
    const deliveryStatus: DeliveryStatus = verdict.verified ? 'delivered'
        : verdict.coverageFailed ? 'blocked'
            : notVerifiedOnly ? 'not_verified'
                : verdict.partial ? 'partial' : 'blocked';
    const verificationStatus = verdict.verified ? 'passed'
        : verdict.coverageFailed ? 'requested_records_missing'
            : browserFailed ? 'browser_qa_failed'
                : notVerifiedOnly ? 'not_verified' : 'failed';
    const executionStatus = verdict.verified ? 'completed' : verdict.partial ? 'partial' : 'failed';
    return { executionStatus, verificationStatus, deliveryStatus };
}

/* ───────────────────────── C15: the result the orchestrator and the receipt read ───────────────────────── */

export interface DeliveryOutputInput {
    /** What runEngine returned: its status, its summary or the reason it stopped, and its last verification. */
    result: EngineResult | null | undefined;
    /** The run's project folder, as Joe allocated it — never a folder the model named. */
    projectRoot: string;
    /** The user's full request: the summary he reads is written in its language. */
    request: string;
    /** The interface language, when Joe knows it: it outranks the script the request is written in. */
    language?: string;
}

/**
 * The ProjectPipelineTool-shaped result of an engine run (map R5, C15): one
 * phase receipt, «delivery verification», whose task receipts are the
 * instruments — the measured ones in the verdict's priority order, then the
 * required ones that were never measured — so isPhaseReceipt lifts them and
 * the exam's finalVerdict names the instrument that failed first.
 *
 * ok is the verified delivery and nothing less. The pipeline also returns ok
 * for a partial one, so a partial delivery reached the receipt as «done»
 * (map R5 pitfall 1); here a partial delivery is not a delivery. The flat
 * fields the receipt needs (verified, deliveryStatus, partialDelivery,
 * firstError) sit at the top of the output.
 */
/**
 * The delivery's own sentences, in each language Joe's interface offers. Joe
 * speaks the language the user set (replyLanguageCode); the app keeps the
 * request's language.
 */
const DELIVERY_WORDS: Record<string, {
    notDelivered: (why: string) => string;
    verified: (checks: string[], liveUrl: string) => string;
    unproven: string;
    stopped: (why: string) => string;
}> = {
    ar: {
        notDelivered: why => `⚠️ لم يُسلَّم المشروع: لم تُثبت فحوص جو التسليم — ${why}`,
        verified: (c, url) => `✅ تحقّقت فحوص جو من التسليم (${c.join('، ')})${url ? ` — المعاينة الحية: ${url}` : ''}`,
        unproven: 'ما لم يثبت من طلبك:',
        stopped: why => `توقّف التشغيل: ${why}`,
    },
    en: {
        notDelivered: why => `⚠️ Not delivered: Joe's delivery checks did not verify it — ${why}`,
        verified: (c, url) => `✅ Joe's delivery checks verified it (${c.join(', ')})${url ? ` — live preview: ${url}` : ''}`,
        unproven: 'What your request asked that is not proven:',
        stopped: why => `The run stopped: ${why}`,
    },
    es: {
        notDelivered: why => `⚠️ No entregado: las comprobaciones de Joe no lo verificaron — ${why}`,
        verified: (c, url) => `✅ Las comprobaciones de Joe lo verificaron (${c.join(', ')})${url ? ` — vista previa: ${url}` : ''}`,
        unproven: 'Lo que pediste y no está probado:',
        stopped: why => `La ejecución se detuvo: ${why}`,
    },
    fr: {
        notDelivered: why => `⚠️ Non livré : les vérifications de Joe ne l'ont pas validé — ${why}`,
        verified: (c, url) => `✅ Les vérifications de Joe l'ont validé (${c.join(', ')})${url ? ` — aperçu : ${url}` : ''}`,
        unproven: "Ce que vous avez demandé et qui n'est pas prouvé :",
        stopped: why => `L'exécution s'est arrêtée : ${why}`,
    },
    de: {
        notDelivered: why => `⚠️ Nicht geliefert: Joes Prüfungen haben es nicht bestätigt — ${why}`,
        verified: (c, url) => `✅ Joes Prüfungen haben es bestätigt (${c.join(', ')})${url ? ` — Vorschau: ${url}` : ''}`,
        unproven: 'Was du verlangt hast und nicht bewiesen ist:',
        stopped: why => `Der Lauf wurde beendet: ${why}`,
    },
    ru: {
        notDelivered: why => `⚠️ Не сдано: проверки Joe не подтвердили результат — ${why}`,
        verified: (c, url) => `✅ Проверки Joe подтвердили результат (${c.join(', ')})${url ? ` — предпросмотр: ${url}` : ''}`,
        unproven: 'Что вы просили и что не доказано:',
        stopped: why => `Запуск остановлен: ${why}`,
    },
};

export function deliveryOutput(input: DeliveryOutputInput): { ok: boolean; error?: string; output: Record<string, any> } {
    const result = input?.result || undefined;
    const projectRoot = String(input?.projectRoot || '');
    const lang = replyLanguageCode(input?.language, String(input?.request || ''));
    const words = DELIVERY_WORDS[lang] || DELIVERY_WORDS.en;
    const verification = result?.verification as DeliveryVerification | undefined;
    const record = verification?.delivery;
    const headline = (why: string) => words.notDelivered(why);

    if (!record || !record.verdict) {
        const why = String(result?.reason || '').trim()
            || (result ? 'task_finish never ran, so nothing was verified' : 'the engine returned no result, so nothing was verified');
        return {
            ok: false,
            error: why,
            output: {
                verified: false,
                executionStatus: 'failed',
                verificationStatus: 'not_verified',
                deliveryStatus: 'not_verified' as DeliveryStatus,
                firstError: why,
                engineStatus: result?.status || 'failed',
                pipelineFinal: true,
                verificationFailed: true,
                honestBlocker: true,
                decisionEvidence: buildPipelineDecisionEvidence({
                    finalVerified: false, browserQaFailed: false, scopeCoverageFailed: false, done: 0, total: 1,
                    finalHonestBlocker: true, verificationFailed: true,
                    phaseResults: [{ phaseName: 'delivery verification', ok: false, primaryError: why }],
                }),
                summary: headline(why),
                results: [{
                    phaseNumber: 1,
                    phaseName: 'delivery verification',
                    status: 'failed',
                    projectRoot,
                    projectRootRuntimeBound: true,
                    primaryError: why,
                    taskReceipts: [{ tool: 'delivery:verification', ok: false, error: why }],
                }],
            },
        };
    }

    const verdict = record.verdict;
    //  The verdict and the run must agree: the loop ends delivered only on a
    //  passing task_finish, and anything else is not a delivery.
    const verified = verdict.verified === true && verification!.passed === true && result!.status === 'delivered';
    const priority = (instrument: string) => {
        const at = DELIVERY_PRIORITY.indexOf(instrument as DeliveryInstrument);
        return at < 0 ? DELIVERY_PRIORITY.length : at;
    };
    const measured = [...(record.measurements || [])]
        .map((m, order) => ({ m, order }))
        .sort((a, b) => priority(a.m.instrument) - priority(b.m.instrument) || a.order - b.order)
        .map(({ m }) => ({
            tool: `delivery:${m.instrument}`,
            ok: m.ok === true,
            ...(m.ok === true ? {} : { error: String(m.error || `${m.instrument} failed`) }),
            ...(m.target ? { target: m.target } : {}),
        }));
    const unmeasured = (verdict.unmeasured || []).map(instrument => ({
        tool: `delivery:${instrument}`,
        ok: false,
        error: `${instrument} not measured: ${record.notMeasured?.[instrument] || 'no measurement'}`,
    }));
    const taskReceipts = [...measured, ...unmeasured];
    const scopeCoverageFailed = (record.measurements || []).some(m => m.instrument === 'scope' && m.ok !== true);
    const browserQaFailed = (record.measurements || []).some(m => m.instrument === 'browser' && m.ok !== true);
    const liveFailure = (record.measurements || []).find(m => m.instrument === 'live' && m.ok !== true);
    const firstError = verified ? '' : (
        String(verdict.firstError || '').trim()
        || (unmeasured[0]?.error ?? '')
        || (verdict.unread?.length ? `requested items could not be read: ${verdict.unread.join(', ')}` : '')
        || (verdict.unverified?.length ? `not measured, so not verified: ${verdict.unverified.join('; ')}` : '')
        || (verdict.verified ? `the run ended ${result!.status} after its last verification${result!.reason ? `: ${result!.reason}` : ''}` : '')
        || String(result!.reason || '').trim()
        || 'the delivery was not verified');
    const report = reportText(verification!);
    const unprovenLines = (verification!.unproven || []).map(u => `- ${u.id} ${u.text}: ${u.reason}`);
    //  How the checks treated his data on a change run (design v13.3 §9): none on a new build.
    const qaLines = qaPathLines(record.qaPath, lang).join('\n');
    //  W11: on the no-write walk the «✅ verified» headline is not printed; what it did not try is said instead.
    const noWriteSaid = record.qaPath?.path === 'no-write' && record.qaPath.walked === true && !!record.qaPath.why;
    const summary = verified
        ? [
            String(result!.summary || '').trim(),
            noWriteSaid ? '' : words.verified(taskReceipts.map(r => instrumentName(r.tool.replace(/^delivery:/u, ''), lang)), record.liveUrl || ''),
            //  What the browser check tried, in numbers (certificate.ts qaCoverageLine).
            taskReceipts.some(r => r.tool.replace(/^delivery:/u, '') === 'browser') ? qaCoverageLine(qaCoverageOf(record.browserQa), lang) : '',
            qaLines,
            //  What Joe saw in the app's PDFs, told only (design arabic-pdf v9 §5).
            outsideLines(record.pdf, lang).join('\n'),
            ...deliveryFooter({ howToRun: result!.howToRun, durationMs: result!.durationMs, costUsd: result!.costUsd, language: lang }),
        ].filter(Boolean).join('\n\n')
        : [
            headline(firstError),
            unprovenLines.length ? [words.unproven, ...unprovenLines].join('\n') : '',
            qaLines,
            result!.reason ? words.stopped(String(result!.reason)) : '',
        ].filter(Boolean).join('\n\n');
    return {
        ok: verified,
        ...(verified ? {} : { error: firstError }),
        output: {
            verified,
            executionStatus: verified ? 'completed' : record.executionStatus === 'completed' ? 'failed' : record.executionStatus,
            verificationStatus: verified ? 'passed' : record.verificationStatus === 'passed' ? 'not_verified' : record.verificationStatus,
            deliveryStatus: verified ? 'delivered' : record.deliveryStatus === 'delivered' ? 'not_verified' : record.deliveryStatus,
            ...(verified ? {} : { firstError }),
            engineStatus: result!.status,
            decisionEvidence: buildPipelineDecisionEvidence({
                finalVerified: verified,
                browserQaFailed,
                scopeCoverageFailed,
                liveUrl: verified ? record.liveUrl : undefined,
                done: verified ? 1 : 0,
                total: 1,
                finalHonestBlocker: !verified,
                verificationFailed: !verified,
                liveRunError: liveFailure ? String(liveFailure.error || 'the live run failed') : undefined,
                scopeAudit: record.scopeAudit,
                requestCoverageFailed: verdict.coverageFailed === true,
                requestCoverageMissing: (record.requestCoverage?.missing || []).map(r => r.key),
                phaseResults: verified ? [] : [{ phaseName: 'delivery verification', ok: false, primaryError: firstError }],
            }),
            pipelineFinal: true,
            ...(verified ? {} : { verificationFailed: true, honestBlocker: true }),
            ...(verdict.partial ? { partialDelivery: true } : {}),
            //  A refused delivery's server was stopped (see verifyDelivery): its address answers no more.
            liveUrl: verified ? record.liveUrl || undefined : undefined,
            ...(record.browserQa ? { browserQa: record.browserQa } : {}),
            ...(record.requestCoverage ? { requestCoverage: record.requestCoverage } : {}),
            ...(record.scopeAudit ? { scopeAudit: record.scopeAudit } : {}),
            //  For the certificate (certificate.ts CertificateInput.qaPath): the way his data was treated, and what was not tried.
            ...(record.qaPath ? { qaPath: record.qaPath } : {}),
            summary,
            report,
            results: [{
                phaseNumber: 1,
                phaseName: 'delivery verification',
                status: verified ? 'completed' : record.deliveryStatus === 'partial' ? 'partial' : 'failed',
                projectRoot: projectRoot || record.projectRoot,
                projectRootRuntimeBound: true,
                ...(verified ? {} : { primaryError: firstError }),
                taskReceipts,
            }],
        },
    };
}
