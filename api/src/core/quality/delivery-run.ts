/**
 * LIVE, QUALITY, SCOPE AND RECORDS — MEASURED THE SAME WAY BY EVERY ENGINE.
 *
 * These two measurements were closures inside ProjectPipelineTool.executeRun
 * (map R5, C6-C8): what one project_run result proves, and which of the
 * records the request named are served, tested or present. A second engine
 * that wanted the same verdict would have had to copy them, and two copies of
 * a gate drift apart — one learns a rule, the other does not, and nothing
 * forces them to agree. They moved here unchanged, as a factory over the
 * run's own ledger and facts. The pipeline builds one per run and keeps the
 * facts it reports (the live URL, the scope audit, the coverage report); the
 * general agent engine's verifier (core/engine/verify.ts) builds one per
 * task_finish.
 *
 * What a caller supplies is what the closures used to capture: the user's
 * full request (never a plan or a summary — law 4), the ledger, the delivery
 * roles, the delivered roots and parts, the tool executor, and how to make an
 * instrument required. The reducers the pipeline owns (applyLiveRunOutcome,
 * inspectProjectQualityContract, applyScopeAuditOutcome) are read from it when
 * a run starts: ProjectPipelineTool imports this module, so a static import
 * back would be a cycle.
 */
import fs from 'fs';
import path from 'path';
import { verifiedLiveUrl, type DeliveryInstrument, type DeliveryLedger } from './delivery-verdict';
import {
    backendRequestedFor, collectServerEvidence, coverageError, coverageUnverified, identifiersFor, judgeRequestCoverage,
    probePathsFor, probeServedResources, requestedRecords, requestedTestsRoot, runRequestedTests, testsRequestedIn,
    takenIdentifiers, testTreeFingerprint, type ProbeResult, type RequestCoverageReport, type RequestedTestsRun,
} from './request-coverage';
import { servedByStaticFallback } from './builder-proofs';
import { measureIsolation, readIsolationDeclaration, requestedRecordWords } from './isolation-probe';
import { interactiveMissing, measureInteractions, reconcileScope } from './interaction-probe';
import { deliveredTreeHasInterface } from './scope-audit';
import type { DeliveryPart } from './delivery-parts';
import { bindRunCancellation } from '../session/attended-run';
import { say as pick } from '../../shared/reply-language';
import type { ScopeGateOutcome } from '../../modules/tools/definitions/ProjectPipelineTool';

export interface DeliveryRunInput {
    /** The user's full request: every reader reads it, never the agent's plan or summary. */
    productRequest: string;
    /** The run's one ledger: every instrument records its own measurement there. */
    ledger: DeliveryLedger;
    /** requestedDeliveryRoles of the full request. */
    deliveryRoles: { service: boolean; interface: boolean; program: boolean };
    /** Every root this run delivered, plus the extra roots given, that exist on disk, resolved. */
    deliveredRoots: (extra?: string[]) => string[];
    /** The parts this run bound, with the tool whose evidence bound each. */
    deliveryParts: () => DeliveryPart[];
    /** Runs one of Joe's tools through ToolService: quality_run for npm tests, shell_execute for Python's. */
    runTool: (tool: string, input: any) => Promise<any>;
    /** Makes an instrument required for the final verdict ('tests' when the request asks for tests). */
    requireInstrument: (instrument: DeliveryInstrument) => void;
    /** The run's cancellation: the record probes stop with it. */
    cancellation?: Promise<unknown>;
    signal?: AbortSignal;
    isAr?: boolean;
    /** A progress line for the person watching. */
    say?: (message: string) => void;
    /** A line for the run's log. */
    log?: (line: string) => void;
}

/** The facts the last measurement established, for the caller's report. */
export interface DeliveryRunState {
    /** The live URL project_run confirmed, or '' when the last live run failed. */
    liveUrl: string;
    scopeAudit?: ScopeGateOutcome['scopeAudit'];
    /** Undefined until records were measured, and when the request names none. */
    requestCoverage?: RequestCoverageReport;
}

export interface DeliveryRun {
    readonly state: DeliveryRunState;
    /** The records the request named, served / tested / present, on the delivered tree and the live server. */
    measureRequestedRecords(runRes: any, roots: string[]): Promise<void>;
    /** live, quality, scope and records for one project_run result — measured separately, never folded into one flag. */
    recordLiveAcceptance(runRes: any, qualityRoot: string, auditRoots: string[]): Promise<void>;
}

export function deliveryRun(input: DeliveryRunInput): DeliveryRun {
    const { productRequest, ledger, deliveryRoles, deliveredRoots } = input;
    const isAr = input.isAr === true;
    const say = (message: string) => input.say?.(message);
    const requireInstrument = (instrument: DeliveryInstrument) => input.requireInstrument(instrument);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pipeline: typeof import('../../modules/tools/definitions/ProjectPipelineTool') = require('../../modules/tools/definitions/ProjectPipelineTool');
    const { applyLiveRunOutcome, inspectProjectQualityContract, applyScopeAuditOutcome } = pipeline;
    const state: DeliveryRunState = { liveUrl: '' };

    /**
     * The records the request named, measured on the delivered tree and the
     * live server: served (a backend was asked for or the tree has one),
     * tested (tests were asked for), present (a static build). Judged
     * whenever project_run confirmed a live URL — even when the quality or
     * scope gate already failed — so missing records are always named.
     */
    /** One executed run of his tests per unchanged tree: a re-measurement after an edit re-runs them, an idle one does not. */
    const requestedTestRuns = new Map<string, RequestedTestsRun>();
    const measureRequestedRecords = async (runRes: any, roots: string[]) => {
        ledger.forget('coverage');
        ledger.forget('tests');
        // The gate's own fact — a server the request asks for (a backend, a
        // database, sign-in, accounts, roles, an API) — not every claim the
        // router reads as needing a server (round 20: an invoice in a list of
        // records made P080's actions «unread records»).
        const backendRequested = backendRequestedFor(productRequest);
        // His list is read the way the builders read it (R2): api_project
        // reads it as a request for a server, so when this run built one
        // the gate reads the same list the same way — never a list one side
        // proved and the other dropped.
        const builtAServer = input.deliveryParts().some(part => part.tool === 'api_project');
        const records = requestedRecords(productRequest, { backendRequested: backendRequested || builtAServer });
        if (!records.entities.length && !records.unread.length && !(records.capabilities || []).length && !records.testsRequested) {
            state.requestCoverage = undefined;
            return;
        }
        const runRoot = String(runRes?.output?.cwd || '').trim();
        const deliveredRoots = Array.from(new Set([runRoot, ...roots].filter(Boolean)));
        const evidence = await collectServerEvidence(deliveredRoots, records.entities);
        const servedApplies = backendRequested || evidence.routes.length > 0;
        let probe: Record<string, ProbeResult> | undefined;
        const probeDetails: Record<string, string[]> = {};
        const base = verifiedLiveUrl(ledger.all());
        if (servedApplies && base && records.entities.length) {
            const bound = bindRunCancellation(input.cancellation, input.signal);
            try {
                // project_run's own bound for one HTTP answer — no new constant.
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { HTTP_ANSWER_TIMEOUT_MS } = require('../../modules/tools/definitions/ProjectRunTool');
                probe = await probeServedResources(base, evidence.prefixes,
                    records.entities.map(record => {
                        const ids = identifiersFor(record, evidence.labelKeys[record.key] || [], records.entities);
                        // The exact path each record's own route registers — never a guessed prefix.
                        return { key: record.key, ids, paths: probePathsFor(evidence, ids, takenIdentifiers(record, records.entities)) };
                    }),
                    { signal: bound.signal, timeoutMs: Number(HTTP_ANSWER_TIMEOUT_MS) || 2500, details: probeDetails });
            } finally {
                bound.dispose();
            }
        }
        // «Tested» means his tests RAN and passed (round 20: a word in a
        // skipped test, or a file no test script collects, counted as tested).
        let testsRun: RequestedTestsRun | undefined;
        if (records.testsRequested) {
            const testsRoot = requestedTestsRoot(evidence, runRoot, deliveredRoots);
            const fingerprint = `${testsRoot}|${testTreeFingerprint(testsRoot, evidence)}`;
            testsRun = requestedTestRuns.get(fingerprint);
            if (!testsRun) {
                say(pick(isAr, '▶️ أشغّل الاختبارات التي طلبتها لأثبت أنها تنجح…', '▶️ Running the tests you asked for, to prove they pass…'));
                testsRun = await runRequestedTests(testsRoot, input.runTool);
                requestedTestRuns.set(fingerprint, testsRun);
            }
            requireInstrument('tests');
            // No runner Joe knows: 'tests' stays required and unmeasured — not verified, never passed.
            if (!testsRun.noRunner) {
                ledger.record({
                    instrument: 'tests',
                    target: testsRun.root,
                    ok: testsRun.passed,
                    error: testsRun.passed ? undefined
                        : `the requested tests ${testsRun.ran ? 'did not pass' : 'could not run'} in ${path.basename(testsRun.root || '.')}: ${String(testsRun.error || '').slice(0, 400)}`,
                });
            }
        }
        const requestCoverage = judgeRequestCoverage({ records, evidence, probe, probeDetails, backendRequested, testsRun });
        state.requestCoverage = requestCoverage;
        //  «Each user sees only their own records», measured on the live
        //  server through the doors the project declares (isolation-probe.ts).
        //  Measured, it is no longer «not measured»: it holds, or it fails
        //  with what the server answered.
        let isolationError = '';
        const isolationRules = (requestCoverage.capabilities || []).filter(c => c.startsWith('per-user record isolation'));
        if (isolationRules.length && base) {
            const declared = readIsolationDeclaration(deliveredRoots, requestedRecordWords(productRequest));
            if (declared.declaration) {
                say(pick(isAr, '▶️ أتحقّق أن كل مستخدم يرى سجلاته فقط: أدخل بحسابين وأنشئ سجلاً بالأول…', '▶️ Checking that each user sees only their own records: signing in as two accounts and creating a record as the first…'));
                const bound = bindRunCancellation(input.cancellation, input.signal);
                try {
                    requestCoverage.isolation = await measureIsolation(base, declared.declaration, { signal: bound.signal });
                } finally {
                    bound.dispose();
                }
                if (!requestCoverage.isolation.ok) isolationError = `per-user record isolation does not hold: ${requestCoverage.isolation.error}`;
            } else {
                isolationError = `per-user record isolation: ${declared.error}`;
            }
            requestCoverage.capabilities = (requestCoverage.capabilities || []).filter(c => !isolationRules.includes(c));
        }
        const unverified = coverageUnverified(requestCoverage);
        const coverageErrors = [requestCoverage.missing.length ? coverageError(requestCoverage) : '', isolationError].filter(Boolean);
        ledger.record({
            instrument: 'coverage',
            ok: coverageErrors.length === 0,
            error: coverageErrors.length ? coverageErrors.join(' | ') : undefined,
            unread: requestCoverage.unread,
            unverified,
        });
        input.log?.(`[pipeline] request coverage checked=${requestCoverage.checked} missing=${requestCoverage.missing.map(r => r.key).join(',') || 'none'} unread=${requestCoverage.unread.join(',') || 'none'} unverified=${unverified.length} capabilities=${(requestCoverage.capabilities || []).length} tests=${testsRun ? (testsRun.passed ? 'passed' : testsRun.ran ? 'failed' : testsRun.noRunner ? 'no runner' : 'not run') : 'not requested'}`);
    };
    /** live, quality, scope and records for one project_run result — measured separately, never folded into one flag. */
    const recordLiveAcceptance = async (runRes: any, qualityRoot: string, auditRoots: string[]) => {
        // Static files are not a live SYSTEM when the delivery needs a
        // server: a requested service, or server routes in the run's own
        // tree. A landing page whose bogus start script fell back to its
        // static site keeps the fallback (round 15 review, finding 28).
        if (servedByStaticFallback(runRes)) {
            const runRoots = Array.from(new Set([String(runRes?.output?.cwd || '').trim(), qualityRoot, ...auditRoots].filter(Boolean)));
            const serverRoutes = deliveryRoles.service ? 1 : (await collectServerEvidence(runRoots, [])).routes.length;
            if (serverRoutes > 0) {
                runRes = {
                    ...runRes,
                    ok: false,
                    error: `the server did not start; only static files were served (${String(runRes?.output?.fallbackFrom || runRes?.output?.kind || 'static fallback').slice(0, 200)})`,
                };
            }
        }
        const live = applyLiveRunOutcome(true, runRes);
        ledger.record({ instrument: 'live', ok: live.verified, url: live.liveUrl, error: live.error });
        state.liveUrl = live.verified ? live.liveUrl : '';
        if (!live.verified) {
            ledger.forget('quality');
            ledger.forget('scope');
            ledger.forget('coverage');
            state.scopeAudit = { requested: 0, built: 0, coverage: 0, missing: [] };
            return;
        }
        ledger.forget('quality');
        const quality = inspectProjectQualityContract(qualityRoot, productRequest);
        ledger.record({
            instrument: 'quality',
            ok: quality.ok,
            error: quality.ok ? undefined : `project quality contract failed — ${quality.failures.slice(0, 4).join('; ')}`,
        });
        // Every other delivered part with a manifest answers for what the
        // request asks of it — never the primary root's broad contract.
        const testsAsked = !!testsRequestedIn(productRequest);
        const primary = path.resolve(String(qualityRoot || '.'));
        const otherRoots = deliveredRoots([String(runRes?.output?.cwd || '').trim(), ...auditRoots])
            .filter(root => root !== primary && fs.existsSync(path.join(root, 'package.json')));
        for (const root of otherRoots) {
            const part = inspectProjectQualityContract(root, productRequest, { additionalRoot: true, testsRequested: testsAsked });
            ledger.record({
                instrument: 'quality',
                target: root,
                ok: part.ok,
                error: part.ok ? undefined : `project quality contract failed in ${path.basename(root)} — ${part.failures.slice(0, 4).join('; ')}`,
            });
        }
        let scoped = applyScopeAuditOutcome(productRequest, auditRoots, { verified: true, liveUrl: live.liveUrl, verificationFailed: false });
        //  Search, filtering and sorting are behaviour. When the source does
        //  not show one of them, the live page is operated before it is
        //  called missing (interaction-probe.ts: P352–P354, 2026-11-03).
        const unseen = scoped.scopeCoverageFailed ? interactiveMissing(scoped.scopeAudit?.missing || []) : [];
        if (unseen.length && live.liveUrl && deliveredTreeHasInterface(auditRoots)) {
            say(pick(isAr, `▶️ لم أجد ${unseen.join(' و')} في الكود، فأجرّبها على الصفحة الحية كما يفعل المستخدم…`, `▶️ The source did not show ${unseen.join(' and ')}, so I am trying it on the live page the way a user would…`));
            const bound = bindRunCancellation(input.cancellation, input.signal);
            try {
                const measured = await measureInteractions(live.liveUrl, unseen, { signal: bound.signal });
                scoped = reconcileScope(scoped, measured);
                for (const r of measured.results) input.log?.(`[pipeline] interaction ${r.capability} ${r.ok ? 'shown' : 'not shown'}: ${r.detail}`);
            } finally {
                bound.dispose();
            }
        }
        state.scopeAudit = scoped.scopeAudit;
        if (scoped.verified || scoped.scopeCoverageFailed === true) {
            ledger.record({ instrument: 'scope', ok: scoped.verified, error: scoped.error });
        } else {
            // No artifact root to audit is a live-acceptance gap, not missing scope.
            ledger.forget('scope');
            ledger.record({ instrument: 'live', ok: false, url: live.liveUrl, error: scoped.error });
        }
        await measureRequestedRecords(runRes, deliveredRoots(auditRoots));
    };
    return { state, measureRequestedRecords, recordLiveAcceptance };
}
