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
import { deliveryFooter, deliveryProofPaths, instrumentName } from './certificate';
import {
    DeliveryLedger, DELIVERY_PRIORITY, browserQaTargetUrl, deliveryVerdict, mayRunBrowserQa, readAsRequirements, stillUnread, verifiedLiveUrl,
    type DeliveryInstrument, type DeliveryMeasurement, type DeliveryVerdict,
} from '../quality/delivery-verdict';
import { deliveryRun, type DeliveryRunState } from '../quality/delivery-run';
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
import { listProjectFiles, MACHINE_STATE_DIRECTORIES } from '../../shared/utils/project-tree';
import { isArabicReply, replyLanguageCode, say as pick } from '../../shared/reply-language';
import { isWithinRoot } from '../../modules/tools/path-containment';
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
    /** What the measurements printed along the way (bounded; the count of lines left out is kept). */
    log: string[];
}

/** A VerificationReport that also carries what it was computed from. */
export interface DeliveryVerification extends VerificationReport {
    delivery: DeliveryRecord;
}

/* ───────────────────────── visible Browser QA ───────────────────────── */

type AuditOptions = NonNullable<Parameters<typeof auditBuiltApp>[1]>;

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
}

/** The order the report lists the instruments in: the order they are measured. */
const REPORT_ORDER: DeliveryInstrument[] = ['source', 'quality', 'build', 'live', 'program', 'scope', 'coverage', 'tests', 'service', 'acceptance', 'browser', 'roles'];

const LOG_LINES = 120;
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

async function verifyDelivery(ctx: ToolContext, deps: VerifierDeps, browserQa: BrowserQa, signIn?: SignInAccount, accounts?: RoleAccount[]): Promise<DeliveryVerification> {
    const root = path.resolve(ctx.projectDir);
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
    const note = (line: string) => {
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
    const programOnly = !!repository || (roles.program && !roles.interface && !roles.service && !programServesAPage);
    const primary: 'live' | 'program' = programOnly ? 'program' : 'live';
    const required = new Set<DeliveryInstrument>(programOnly && !repository ? ['quality'] : []);
    if (repository) required.add('program');
    //  The acceptance judge always rules; an unmeasured acceptance is never a pass.
    required.add('acceptance');
    note(repository
        ? 'repository: the user\'s own repository — judged by its own test suite, the acceptance judge, and no new source problem'
        : `roles: service=${roles.service} interface=${roles.interface} program=${roles.program}${programOnly ? ' (program only: its own tests prove it runs)' : ''}`);

    const delivery = deliveryRun({
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
    });

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
    if (programOnly && !repository) {
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
    if (programOnly) {
        skipped.set('live', repository
            ? 'the user\'s own repository is proven by its own test suite, not by a page Joe opens'
            : 'the request asks for a program, so its own test run proves it runs (there is no address to confirm)');
        await stage(['program'], async () => {
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
            passed.set('program', `its own tests ran and passed (${run.runner || 'tests'})`);
        });
    } else {
        skipped.set('program', 'the request asks for more than a program: the live run proves it');
        await stage(['live'], async () => {
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
            const started = await runTool('project_run', start.input);
            liveRun = postRepairRunOutcome(started);
            const cwd = String(liveRun?.output?.cwd || '').trim();
            const runtimeRoot = cwd && fs.existsSync(cwd) && isWithinRoot(path.resolve(cwd), root) ? path.resolve(cwd) : root;
            auditRoots = projectAuditRoots(root, runtimeRoot);
            await delivery.recordLiveAcceptance(liveRun, root, auditRoots);
        });
    }
    const liveUrl = verifiedLiveUrl(ledger.all());
    if (liveUrl) passed.set('live', `project_run started it and it answers at ${liveUrl}${liveRun?.output?.kind ? ` (${liveRun.output.kind})` : ''}`);

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
        }, interfaceDelivered);
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
            if (!eye.watching) {
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
            const options = (timeoutMs: number): AuditOptions => ({
                request, watchSessionId: eye.sessionId, serveUrl: qaTarget, artifactRootDir: root,
                requireVisibleBrowser: true, timeoutMs, onProgress: (m: string) => note(`browser QA: ${m}`),
                lookPath, phoneLookPath: proof.phone,
                ...(signIn ? { credentials: { identity: signIn.identity, password: signIn.password } } : {}),
                requireAuthenticatedCoverage: true,
            });
            let audit = await browserQa.audit(auditDir, options(45_000));
            //  A coverage timeout is the walker's budget, not the app: once more, larger.
            if (!audit.skipped && audit.findings.some(f => f.id === 'qa_budget_exhausted')) {
                const retry = await browserQa.audit(auditDir, options(COVERAGE_RETRY_TIMEOUT_MS));
                if (!retry.skipped) audit = retry;
            }
            //  A browser-rig failure says nothing about the app: measured once more.
            if (!audit.skipped && hasOnlyBrowserQaInfrastructureFindings(audit.findings)) {
                const retry = await browserQa.audit(auditDir, options(45_000));
                if (!retry.skipped) audit = retry;
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
            if (audit.skipped) {
                ledger.record({ instrument: 'browser', ok: false, error: `browser QA skipped: ${audit.skipped}` });
            } else if (audit.findings.length) {
                const findings = audit.findings.map(browserFindingLine);
                ledger.record({ instrument: 'browser', ok: false, error: `browser QA found ${audit.findings.length} blocking finding(s): ${findings.slice(0, 8).join(' | ')}${findings.length > 8 ? ` (+${findings.length - 8} more)` : ''}${unmetLooks.length ? ` | ${unmetLooks.join(' | ')}` : ''}` });
            } else if (unmetLooks.length) {
                ledger.record({ instrument: 'browser', ok: false, error: `the page, seen on its screenshot: ${unmetLooks.join(' | ')}` });
            } else {
                ledger.record({ instrument: 'browser', ok: true });
                const seen = (looks || []).filter(l => l.verdict === 'met');
                passed.set('browser', `visible Browser QA in the panel found nothing to fix (score ${audit.score})${seen.length ? `; seen on the page's screenshot: ${seen.map(l => `${planIdOf(ctx, l.id)} ${l.why}`).join(' | ')}` : ''}`);
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
            const measured = await measureRoles(liveUrl, given, { signal: ctx.signal });
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
    const verdict = deliveryVerdict({
        phaseVerified: buildsPassed,
        requestFidelityBlocked: false,
        measurements: ledger.all(),
        required: [...required],
        primary,
    });

    //  A delivered project keeps the server project_run started: it is the
    //  live preview. A refused one does not — the model goes on fixing, and a
    //  server it did not start would hold the port its own shell_start needs.
    if (liveStarted && !verdict.verified) {
        const stop = await runTool('project_stop', {});
        if (stop?.ok === true && stop?.output?.stopped === true) {
            remark('live', 'the server project_run started for this check was stopped again, because the delivery is not verified; start your own with shell_start to keep testing');
        } else if (stop?.ok !== true) {
            note(`live: the server project_run started could not be stopped: ${String(stop?.error || 'project_stop failed')}`);
        }
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
        log,
    };
    return { passed: verdict.verified, checks, unproven, at: Date.now(), delivery: record };
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
async function judgeSource(root: string): Promise<{ text: string; leftOut: string[] }> {
    //  A requirement of a Python, Go or Ruby project would be judged on no
    //  source at all — every verdict «unprovable», the delivery blocked
    //  forever — so its own files are read too, by the same walker.
    const files = await listProjectFiles(root, {
        skipDirectory: name => name === 'dist' || name.startsWith('.'),
        keepFile: (_relative, name) => /\.(?:jsx?|tsx?|html|css|py|go|rb|rs|java|kt|php|cs|vue|svelte|astro|mjs|cjs)$/iu.test(name),
    });
    const read: Array<{ path: string; text: string }> = [];
    const leftOut: string[] = [];
    for (const rel of files) {
        try {
            const stat = await fs.promises.stat(path.join(root, rel));
            if (stat.size > JUDGE_FILE_BYTES) { leftOut.push(rel); continue; }
            read.push({ path: rel.split(path.sep).join('/'), text: await fs.promises.readFile(path.join(root, rel), 'utf8') });
        } catch { /* unreadable is not evidence */ }
    }
    return { text: judgeSourceOf(read), leftOut };
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
    const verdicts: JudgedNamed[] = onSource.length ? await verifyNamed(onSource, source.text, isAr, ask) : [];
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
            const unverified = measured.flatMap(m => m.unverified || []);
            if (instrument === 'coverage') {
                const asked = measured.flatMap(m => m.unread || []);
                const read = readAsRequirements(asked, all.flatMap(m => m.instrument === 'acceptance' ? (m.met || []) : []));
                if (read.length) detail += ` | read as requirements the judge found met: ${read.join(', ')}`;
            }
            if (unread.length) detail += ` | requested items that could not be read: ${unread.join(', ')}`;
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
    const summary = verified
        ? [
            String(result!.summary || '').trim(),
            words.verified(taskReceipts.map(r => instrumentName(r.tool.replace(/^delivery:/u, ''), lang)), record.liveUrl || ''),
            ...deliveryFooter({ howToRun: result!.howToRun, durationMs: result!.durationMs, costUsd: result!.costUsd, language: lang }),
        ].filter(Boolean).join('\n\n')
        : [
            headline(firstError),
            unprovenLines.length ? [words.unproven, ...unprovenLines].join('\n') : '',
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
