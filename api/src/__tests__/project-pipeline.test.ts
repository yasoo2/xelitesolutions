/**
 * The multi-file project audit: the canonical pipeline (Plan → PhaseExecutor →
 * QualityGate → RepairTicket → SelfFix → Rerun) existed, was verified by six
 * manual harnesses — and was called by NOTHING in production. A user asking
 * for a complete project got a single HTML page or a pile of never-executed
 * files. project_pipeline is the missing production bridge, and the planner
 * routes full-project requests to it deterministically.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningEngine, extractExactEchoRequest } from '../core/orchestrator/PlanningEngine';
import {
    applyLiveRunOutcome,
    applyProjectQualityContractOutcome,
    applyScopeAuditOutcome,
    projectAuditRoots,
    projectAuditDirectory,
    buildPlannerEvidence,
    inspectProjectQualityContract,
    deterministicRescueAllowed,
    interactiveAppNeedsReactBuilder,
    planContainsReactBuilder,
    planContainsUnrequestedApiBuilder,
    buildPipelineDecisionEvidence,
    requestRequiresLocalSpecification,
} from '../modules/tools/definitions/ProjectPipelineTool';
import { applyPhaseExecutionEvidence } from '../modules/tools/definitions/PhaseExecutorTool';

describe('routing — full-project requests reach the pipeline, offline and deterministic', () => {
    const plan = (goal: string) =>
        PlanningEngine.generatePlan({ intent: { goal, complexity: 'high', riskLevel: 'medium', rawIntent: {} } as any });

    test.each([
        'ابنِ لي مشروعاً متكاملاً لإدارة المخزون بباك اند وقاعدة بيانات',
        'انشئ نظام إدارة متكامل للمبيعات',
        'build a complete project for a task manager with a REST API',
        'create a full-stack inventory application with a database',
        'develop a Node.js express server with authentication',
        'build a React Vite SPA for collaborative scheduling with offline support',
        'Build ORION, a multi-tenant business system with approvals, inventory, ledger, and audit trails',
        'Create NOVA, an unfamiliar engineering workspace with a web console, background jobs, and local verification',
        'Build NOVA, an internal web console for verifying warehouse jobs. First inspect the current workspace and state an implementation plan. Then implement only the smallest independently testable vertical slice, run its local tests, report the evidence and remaining work, and never deploy externally.',
    ])('«%s» → project_pipeline', async (goal) => {
        const p = await plan(goal);
        expect(p.steps).toHaveLength(1);
        expect(p.steps[0].tool).toBe('project_pipeline');
        expect((p.steps[0].input as any).request).toBe(goal);
    });

    test('an engineering build resists browser-biased intent metadata and remains local', async () => {
        const goal = 'Build NOVA, an internal web console with background jobs and local verification.';
        const p = await PlanningEngine.generatePlan({
            intent: {
                goal,
                complexity: 'medium',
                riskLevel: 'low',
                // This mimics an unavailable or imprecise upstream analysis. It must
                // not turn a build into browser automation merely because it says web.
                suggestedAgent: 'Browser',
                requiredTools: ['browser_run'],
                rawIntent: { analysisUnavailable: true },
            } as any,
        });
        expect(p.steps).toHaveLength(1);
        expect(p.steps[0].tool).toBe('project_pipeline');
        expect(p.steps[0].agent).toBe('Dev');
    });

    test('the planning engine has no production route that dispatches a named foundation or prescribed stack', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
        // The doctrine stands for SYSTEMS: no invented foundations, no
        // prescribed backend — those routes stay evidence-first through the
        // pipeline. The one stack the planner may name is the deterministic
        // page engine, and only inside the page-scope branch: a marketing
        // site needs no workspace discovery to know what it is.
        expect(src).not.toMatch(/tool: '(?:orion_business_foundation|enterprise_platform_foundation|api_project)'/);
        expect(src).not.toMatch(/executeTool\('(?!engineering_discovery|project_planner)/);
    });

    test('a simple landing page goes to the deterministic React engine', async () => {
        const p = await plan('ابنِ لي صفحة هبوط لمطعم شعبي');
        expect(p.steps[0].tool).toBe('react_project');
    });

    test('planner handoff preserves direct and wrapped reference-project evidence', () => {
        const referenceProjects = [{
            root: '/workspace/reference-app',
            projectKinds: ['node'],
            manifests: [{ path: '/workspace/reference-app/package.json', kind: 'package.json' }],
        }];
        const direct = buildPlannerEvidence({ mode: 'greenfield', referenceProjects });
        expect(direct.referenceProjects).toBe(referenceProjects);
        expect(direct.mode).toBe('greenfield');

        const wrapped = buildPlannerEvidence({ mode: 'greenfield', output: { evidence: { referenceProjects } } });
        expect(wrapped.referenceProjects).toBe(referenceProjects);
        expect(wrapped.mode).toBe('greenfield');
    });

    test('greenfield planner handoff does not send an unrelated workspace catalogue', () => {
        const referenceProjects = [{ root: '/workspace/unrelated-app', projectKinds: ['node'] }];
        const plannerEvidence = buildPlannerEvidence({
            mode: 'greenfield',
            referenceProjects,
            constraints: { createsNewProject: true },
        });
        expect(plannerEvidence.referenceProjects).toEqual([]);
    });

    test('planner failure cannot turn a multi-phase contract brief into a generic scaffold rescue', () => {
        const brief = [
            'Build a production API integration slice.',
            'First inspect the workspace, then define the API contract and implement the smallest vertical slice.',
            'Add integration tests, acceptance criteria, an evidence matrix, and a final audit.',
            'Do not build a test template or claim completion without running verification.'
        ].join(' ');
        expect(deterministicRescueAllowed(brief)).toBe(false);
        expect(deterministicRescueAllowed('Build a small local notes app with a web interface.')).toBe(true);
    });

    test('QuickNotes is a composite interactive app and requires the concrete React builder', () => {
        const quickNotes = [
            'Build a complete mobile productivity application called "QuickNotes".',
            'The application must allow users to manage notes and tasks.',
            'Create Home, Notes, Tasks, Note editor, Task editor, Search, and Settings screens.',
            'Implement light/dark mode, responsive mobile UI, validation, and persistence using storage/database.',
            'Run and verify the complete application.'
        ].join(' ');
        const { detectAppKind } = require('../core/design/app-blueprints');
        expect(detectAppKind(quickNotes)).toBe('productivity');
        expect(PlanningEngine.classifyBuildScope(quickNotes)).toBe('system');
        expect(interactiveAppNeedsReactBuilder(quickNotes)).toBe(true);
    });

    test('optional authentication wording in a browser app does not create a backend system', () => {
        const weathergo = [
            'Build a real weather web application using React and Vite.',
            'Use the public Open-Meteo geocoding and forecast APIs; do not build a project-owned backend.',
            'Include city search, hourly and seven-day forecasts, favorites in localStorage, and settings persistence.',
            'If authentication is needed for this flow, implement a usable local/demo persistence path and do not block acceptance on credentials.',
        ].join(' ');
        expect(PlanningEngine.classifyBuildScope(weathergo)).toBe('app');
        expect(interactiveAppNeedsReactBuilder(weathergo)).toBe(true);
    });

    test('an interactive app request requires the concrete React builder instead of a generic scaffold', () => {
        const calcPro = [
            'Build a mobile-responsive calculator application called "CalcPro" with basic arithmetic,',
            'decimals, percentage, sign toggle, clear, delete, history, division by zero handling,',
            'light and dark mode, and working tests.'
        ].join(' ');
        expect(interactiveAppNeedsReactBuilder(calcPro)).toBe(true);
        expect(planContainsReactBuilder([{ tasks: [{ tool: 'scaffold_project' }] }])).toBe(false);
        expect(planContainsReactBuilder([{ tasks: [{ tool: 'react_project' }] }])).toBe(true);
        expect(interactiveAppNeedsReactBuilder('Build a production API integration slice with an OpenAPI contract and an evidence matrix.')).toBe(false);
    });

    test('an app plan with an unrequested api_project is rescued before it can create a second artifact', () => {
        const weatherApp = [
            'Build a real weather web application using React and Vite.',
            'Use the public Open-Meteo geocoding and forecast APIs; do not build a project-owned backend.',
            'Include city search, hourly and seven-day forecasts, favorites in localStorage, and settings persistence.'
        ].join(' ');
        const mixedPlan = [
            { name: 'Backend', tasks: [{ tool: 'api_project' }] },
            { name: 'UI', tasks: [{ tool: 'react_project' }] },
        ];
        expect(PlanningEngine.classifyBuildScope(weatherApp)).toBe('app');
        expect(planContainsUnrequestedApiBuilder(weatherApp, mixedPlan)).toBe(true);
        expect(planContainsUnrequestedApiBuilder(
            'Build a backend API with a database, authentication, and a React admin dashboard.',
            mixedPlan,
        )).toBe(false);
    });

    test("the pair's door is the API — apiSiblingOf finds it by shared suffix", () => {
        const os = require('os');
        const { apiSiblingOf } = require('../modules/tools/definitions/ProjectPipelineTool');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-'));
        fs.mkdirSync(path.join(tmp, 'react-taskflow-ai-9304'));
        fs.mkdirSync(path.join(tmp, 'api-taskflow-ai-9304'));
        fs.writeFileSync(path.join(tmp, 'api-taskflow-ai-9304', 'server.js'), '// the door');
        // Round 6, measured: live-run started the interface's dev server and
        // Browser QA counted the app's own /api/health calls as 8×404.
        expect(apiSiblingOf(path.join(tmp, 'react-taskflow-ai-9304'))).toBe(path.join(tmp, 'api-taskflow-ai-9304'));
        expect(apiSiblingOf(path.join(tmp, 'api-taskflow-ai-9304'))).toBeNull();
        expect(apiSiblingOf('/nowhere/react-ghost')).toBeNull();
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('full-stack quality audits the source root while project_run may use the API door', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-source-runtime-audit-'));
        const reactRoot = path.join(tmp, 'react-weathergo-1234');
        const apiRoot = path.join(tmp, 'api-weathergo-1234');
        try {
            fs.mkdirSync(reactRoot, { recursive: true });
            fs.mkdirSync(apiRoot, { recursive: true });
            fs.writeFileSync(path.join(reactRoot, 'index.html'), '<div id="root"></div>', 'utf8');
            fs.writeFileSync(path.join(reactRoot, 'package.json'), JSON.stringify({ scripts: {
                build: 'vite build',
                test: 'node smoke-test.mjs',
            } }), 'utf8');
            fs.writeFileSync(path.join(apiRoot, 'package.json'), JSON.stringify({ scripts: {
                start: 'node server.js',
            } }), 'utf8');
            fs.writeFileSync(path.join(apiRoot, 'server.js'), '// runtime door', 'utf8');

            const roots = projectAuditRoots(reactRoot, apiRoot);
            expect(roots).toEqual([reactRoot, apiRoot]);
            expect(projectAuditDirectory(roots)).toBe(reactRoot);
            const live = applyLiveRunOutcome(true, { ok: true, output: { url: 'http://localhost:4318/', cwd: apiRoot } });
            expect(applyProjectQualityContractOutcome(reactRoot, 'run build and tests', live).verified).toBe(true);
            expect(applyProjectQualityContractOutcome(apiRoot, 'run build and tests', live).verified).toBe(false);
            expect(applyScopeAuditOutcome('Build a React weather app.', roots, live).scopeAudit).toBeDefined();
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    test('a DEAD planner rescues any build the engine recognises — the TaskFlow live failure', () => {
        const { deterministicRescueForDeadPlanner } = require('../modules/tools/definitions/ProjectPipelineTool');
        // The live test, verbatim shape: a giant structured production brief.
        // The strict gate says no (length + structural signals) — right for a
        // paper plan from a LIVE planner. With NO plan at all, the engine
        // recognises a task-management system and answers; the scope audit
        // still names what it did not build.
        const taskflow = 'Build a complete production-quality web application called "TaskFlow AI". '
            + 'A modern project and task management platform. Implement authentication, users, '
            + 'projects, tasks, kanban, notifications, database, API, tests, end-to-end test, '
            + 'acceptance criteria and a final audit. '.repeat(60);
        expect(taskflow.length).toBeGreaterThan(1800);
        expect(deterministicRescueAllowed(taskflow)).toBe(false);
        expect(deterministicRescueForDeadPlanner(taskflow)).toBe(true);
        // …and a brief the engine does NOT recognise still stops honestly.
        expect(deterministicRescueForDeadPlanner('Write a kernel driver for my GPU with acceptance criteria and integration tests. '.repeat(40))).toBe(false);
        // The paper-plan branch keeps the STRICT gate — pinned at the source.
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');
        expect(src).toMatch(/plannerResult\?\.output\?\.deterministic !== true[\s\S]*deterministicRescueAllowed\(productRequest\)/);
    });

    test('a recovery goal is NOT hijacked even if it mentions a server', async () => {
        // Recovery goals route to the dynamic planner before any fast-path.
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
        const recoveryGuard = src.indexOf('if (/^fix and continue:/i.test(String(intent.goal');
        const projectPath = src.indexOf('[FULL-PROJECT FAST-PATH]');
        expect(recoveryGuard).toBeGreaterThan(0);
        expect(projectPath).toBeGreaterThan(recoveryGuard);
    });

    test('the project path outranks the page path — «تطبيق متكامل» must not become one HTML file', async () => {
        const p = await plan('اعمل لي تطبيق متكامل مع قاعدة بيانات للمواعيد');
        expect(p.steps[0].tool).toBe('project_pipeline');
    });
});

describe('routing — exact response contracts stay deterministic', () => {
    test('extracts the requested literal without invoking a planner', () => {
        expect(extractExactEchoRequest('Reply with exactly OLLAMA-AUTO-OK and nothing else.')).toBe('OLLAMA-AUTO-OK');
        expect(extractExactEchoRequest('Reply with exactly "READY" and nothing else')).toBe('READY');
        expect(extractExactEchoRequest('Explain why the build failed.')).toBeNull();
    });

    test('routes an exact response to echo', async () => {
        const goal = 'Reply with exactly OLLAMA-AUTO-OK and nothing else.';
        const p = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });
        expect(p.steps).toHaveLength(1);
        expect(p.steps[0].tool).toBe('echo');
        expect((p.steps[0].input as any).text).toBe('OLLAMA-AUTO-OK');
    });
});

describe('specification intent detection', () => {
    test('does not confuse ordinary file read-back instructions with a local specification request', () => {
        expect(requestRequiresLocalSpecification('Create a file, read the file back, then rename it.')).toBe(false);
        expect(requestRequiresLocalSpecification('Read the local specification then implement it.')).toBe(true);
        expect(requestRequiresLocalSpecification('Read NEXUS_SPECIFICATION.md and implement it.')).toBe(true);
    });
});

describe('the bridge tool — plan, execute phases, report honestly', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');

    test('it discovers evidence before planning, then hands valid phases to the canonical pipeline', () => {
        const discovery = src.indexOf("executeTool('engineering_discovery'");
        const planner = src.indexOf("executeTool('project_planner'");
        expect(discovery).toBeGreaterThan(-1);
        expect(planner).toBeGreaterThan(discovery);
        expect(src).toMatch(/evidence is incomplete — blocking writes honestly/);
        expect(src).not.toMatch(/executeTool\('orion_business_foundation'/);
        expect(src).not.toMatch(/executeTool\('enterprise_platform_foundation'/);
        expect(src).toMatch(/AgentLoopService\.runPlannedPhasesIfPresent/);
        // Lazy require, or the import cycle ToolService→definitions→AgentLoopService bites.
        expect(src).toMatch(/require\('\.\.\/\.\.\/services\/AgentLoopService'\)/);
    });

    test('routes a read-only audit to the safe pipeline before stop/run keyword paths', async () => {
        const goal = 'You are conducting a deep, non-destructive engineering audit. Do not create, edit, delete, move, install, publish, deploy, or commit anything. Do not access external websites. You may only read project files and run read-only checks. Return the first actionable error and clear stop conditions.';
        const plan: any = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'high', riskLevel: 'medium', rawIntent: {} } as any });
        expect(plan.steps[0].tool).toBe('project_pipeline');
        expect(plan.metadata.matchedBy).toBe('read-only-safety-boundary');
    });

    test('read-only evidence blocks before planner and phase execution', () => {
        const readOnlyGuard = src.indexOf('if (evidence.constraints?.readOnly === true)');
        const planner = src.indexOf("executeTool('project_planner'");
        expect(readOnlyGuard).toBeGreaterThan(-1);
        expect(readOnlyGuard).toBeLessThan(planner);
        expect(src).toMatch(/stopReason: 'read_only_request'/);
        expect(src).toMatch(/read-only intent detected — blocking planning and execution/);
    });

    test('read-only workspace overview does not require choosing one child project', () => {
        expect(src).toMatch(/isWorkspaceOverviewRequest/);
        expect(src).toMatch(/executeTool\('inspect_directory'/);
        expect(src).toMatch(/executeTool\('search_files'/);
        expect(src).toMatch(/executeTool\('read_file'/);
        expect(src).toMatch(/read-only-workspace-overview/);
        expect(src).toMatch(/No README exists at the workspace root/);
        expect(src).toMatch(/Full discovery details are available in Logs/);
        expect(src).toMatch(/workspace\.overview\.top_level=/);
    });

    test('provider preflight blocks honestly before planner when no model is healthy', () => {
        const preflight = src.indexOf('verifyProviderDirect');
        const planner = src.indexOf("executeTool('project_planner'");
        expect(preflight).toBeGreaterThan(-1);
        expect(planner).toBeGreaterThan(preflight);
        expect(src).toMatch(/stopReason: 'provider_unavailable'/);
        expect(src).toMatch(/provider preflight/);
        expect(src).toMatch(/skipProviderPreflight/);
    });

    test('provider preflight does not treat the router failure apology as a healthy answer', () => {
        const router = fs.readFileSync(
            path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf-8');
        expect(router).toMatch(/providerProbeSucceeded[\s\S]*!isProviderFailure/);
        expect(router).toMatch(/const usable = \(s: any\) => providerProbeSucceeded\(s\)/);
    });

    test('Auto preflight gives a measured local Ollama brain enough time before fallback', () => {
        const router = fs.readFileSync(
            path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf-8');
        expect(router).toContain("localProvider.chatComplete(probe as any, pickLocalModel('code_generation'))");
        expect(router).toContain("detail: 'local_ok'");
        expect(router).toContain('localWarmupMs');
        expect(router).toContain('warmup * 12');
    });

    test('bounded live-run repair rediscovers the current incomplete root instead of the greenfield reference set', () => {
        expect(src).toMatch(/const repairDiscoveryRequest = \[/);
        expect(src).toMatch(/const trustedRepairRoot = String\(/);
        expect(src).toMatch(/liveRunResult\?\.output\?\.cwd/);
        expect(src).toMatch(/request:\s*repairDiscoveryRequest/);
        expect(src).toMatch(/Treat the existing workspace root as the write target/);
        expect(src).not.toMatch(/repairDiscovery[\\s\\S]{0,500}request,\s*path:\s*projectPath/);
    });

    test('dependency bootstrap runs after a successful repair phase when node_modules is still absent', () => {
        expect(src).toMatch(/if \(\/launchability\|runtime target is missing\|cannot start the project safely\|runtime dependencies missing or undeclared\/i\.test\(failureText\)\)/);
        expect(src).not.toMatch(/if \(\\!boundedRepairReady && \/launchability\|runtime target is missing\|cannot start the project safely\|runtime dependencies missing or undeclared\/i\.test\(failureText\)\)/);
        expect(src).toMatch(/npm_manager/);
        expect(src).toMatch(/install --ignore-scripts --no-audit --no-fund/);
    });

    test('post-phase discovery rebinds the artifact root before live-run', () => {
        expect(src).toMatch(/const postPhaseDiscoveryRequest = \[/);
        expect(src).toMatch(/postPhaseDiscoveryRequest/);
        expect(src).toMatch(/selectedProject\?\.root/);
        expect(src).toMatch(/plannerResult\.output\.projectRoot = runtimeProjectRoot/);
        expect(src).toMatch(/post-phase discovery bound projectRoot/);
    });

    test('the local engineering boundary survives the pipeline-to-phase handoff', () => {
        expect(src).toMatch(/engineeringPipeline:\s*true/);
        expect(src).toMatch(/purpose:\s*['"]internal['"]/);
    });

    test('the visible browser panel survives the pipeline-to-phase boundary', () => {
        expect(src).toMatch(/browserSessionId:\s*context\?\.browserSessionId/);
        const loop = fs.readFileSync(
            path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf-8');
        expect(loop).toMatch(/browserSessionId\?:\s*string/);
        expect(loop).toMatch(/const projectContext = \{[\s\S]*browserSessionId,/);
        expect(loop).toMatch(/const executionContext = \{[\s\S]*browserSessionId,[\s\S]*language:\s*opts\.language,[\s\S]*engineeringPipeline:\s*true,[\s\S]*purpose:\s*['"]internal['"]/);
    });

    test('a live HTTP 200 cannot bypass semantic artifact scope verification', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-scope-gate-'));
        try {
            fs.writeFileSync(path.join(root, 'index.js'), "require('http').createServer((_req, res) => res.end('Hello World')).listen(3000);\n");
            const live = applyLiveRunOutcome(true, {
                ok: true,
                output: { url: 'http://localhost:3000/', cwd: root },
            });
            const result = applyScopeAuditOutcome(
                'Build an e-commerce platform with user authentication, inventory management, and analytics.',
                root,
                live,
            );
            expect(live.verified).toBe(true);
            expect(result.verified).toBe(false);
            expect(result.verificationFailed).toBe(true);
            expect(result.scopeAudit.coverage).toBe(0);
            expect(result.scopeCoverageFailed).toBe(true);
            expect(result.error).toMatch(/artifact coverage 0%/);
            expect(result.error).toMatch(/user accounts|inventory management|analytics/i);
            expect(src).toMatch(/applyProjectQualityContractOutcome\(liveSourceRoot \|\| liveRuntimeRoot, productRequest, liveOutcome\)/);
            expect(src).toMatch(/applyScopeAuditOutcome\(productRequest, liveAuditRoots, qualityCheckedLiveOutcome\)/);
            expect(src).toMatch(/scopeAudit/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('50% scope coverage is still blocked instead of being delivered as complete', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-scope-half-'));
        try {
            fs.writeFileSync(path.join(root, 'index.js'), "app.get('/api/products', listProducts);\n", 'utf-8');
            const live = applyLiveRunOutcome(true, { ok: true, output: { url: 'http://localhost:3000/', cwd: root } });
            const result = applyScopeAuditOutcome('Build a product catalogue with analytics.', root, live);
            expect(result.scopeAudit.coverage).toBe(0.5);
            expect(result.scopeCoverageFailed).toBe(true);
            expect(result.verified).toBe(false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('placeholder lifecycle scripts invalidate an otherwise reachable live artifact', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-quality-contract-'));
        try {
            fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: {
                build: "echo 'Build script not implemented yet'",
                test: "echo 'No test specified' && exit 0",
            } }), 'utf-8');
            const quality = inspectProjectQualityContract(root, 'run install, build, and tests');
            expect(quality.ok).toBe(false);
            expect(quality.failures.join(' ')).toMatch(/build script is a placeholder|test script is a placeholder/i);
            const live = applyLiveRunOutcome(true, { ok: true, output: { url: 'http://localhost:3000/', cwd: root } });
            const checked = applyProjectQualityContractOutcome(root, 'run install, build, and tests', live);
            expect(checked.verified).toBe(false);
            expect(checked.error).toMatch(/project quality contract failed/i);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('scope coverage failure gets one bounded repair path without weakening the gate', () => {
        expect(src).toMatch(/const attemptScopeRepair = async/);
        expect(src).toMatch(/scopeRepairMode:\s*true/);
        expect(src).toMatch(/scopeRepairTargets/);
        expect(src).toMatch(/scope_repair_pipeline_failed/);
        expect(src).toMatch(/if \(scopeCoverageFailed && !finalVerified/);
        expect(src).toMatch(/scopeRepairAttempted/);
            expect(src).toMatch(/applyProjectQualityContractOutcome\(artifactRoot \|\| scopeRetryRuntimeRoot, productRequest, scopeRetryLive\)/);
            expect(src).toMatch(/applyScopeAuditOutcome\(productRequest, scopeRetryAuditRoots, qualityCheckedScopeRetry\)/);
    });

    test('success and verification are earned, with explicit execution and delivery states', () => {
        expect(src).toMatch(/const verified = pipeline\?\.ok === true/);
        expect(src).toMatch(/const executionStatus = verified/);
        // 044: verificationStatus/deliveryStatus تُشتقان من requestFidelityBlocked (يشمل mismatch + unverifiable)
        expect(src).toMatch(/const requestFidelityBlocked = requestFidelityMismatch \|\| requestFidelityEvidenceUnavailable/);
        expect(src).toMatch(/const verificationStatus = requestFidelityBlocked/);
        expect(src).toMatch(/const deliveryStatus = requestFidelityBlocked/);
        expect(src).toMatch(/ok: finalVerified/);
        // The honest partial-delivery message exists in Arabic.
        expect(src).toMatch(/توقف البناء بصدق/);
    });

    test('current-run decision evidence names the six gate facts without changing the verdict', () => {
        const blocked = buildPipelineDecisionEvidence({
            finalVerified: false,
            browserQaFailed: false,
            scopeCoverageFailed: true,
            liveUrl: 'http://localhost:4173/weather',
            done: 0,
            total: 8,
            finalHonestBlocker: true,
            scopeAudit: { built: 0, requested: 8, missing: ['weather search'] },
            phaseResults: [{ status: 'completed' }],
        });
        expect(Object.keys(blocked).sort()).toEqual([
            'browserQaFailed', 'done', 'finalVerified', 'honestBlocker', 'liveUrl', 'scopeCoverageFailed', 'total', 'verificationUnavailable',
        ].sort());
        expect(blocked).toMatchObject({
            finalVerified: false,
            browserQaFailed: false,
            scopeCoverageFailed: true,
            verificationUnavailable: false,
            liveUrl: 'http://localhost:4173/weather',
            done: 0,
            total: 8,
            honestBlocker: 'scope_coverage: 0/8',
        });

        const delivered = buildPipelineDecisionEvidence({
            finalVerified: true,
            browserQaFailed: false,
            scopeCoverageFailed: false,
            liveUrl: 'http://localhost:4173/weather',
            done: 8,
            total: 8,
            finalHonestBlocker: false,
            phaseResults: [{ status: 'completed', ok: true }],
        });
        expect(delivered.finalVerified).toBe(true);
        expect(delivered.verificationUnavailable).toBe(false);
        expect(delivered.honestBlocker).toBeNull();
    });

    test('the chat gets a delivery REPORT, not a terse line', () => {
        // extractAnswer picks `summary` — so summary must BE the report.
        expect(src).toMatch(/summary = this\.buildDeliveryReport\(/);
        // Phases, files and diagnosis sections exist in both languages.
        expect(src).toMatch(/### المراحل/);
        expect(src).toMatch(/### الملفات/);
        expect(src).toMatch(/### ماذا حدث/);
        expect(src).toMatch(/### Phases/);
        expect(src).toMatch(/### Files/);
    });

    test('the file list comes from the PLAN itself — exact paths, not guesses', () => {
        expect(src).toMatch(/t\?\.args\?\.path \|\| t\?\.args\?\.filename/);
    });

    test('the run hint is honest: only when an entry file or package.json was really written', () => {
        expect(src).toMatch(/verified && \(entry \|\| wrotePackageJson\)/);
        expect(src).toMatch(/index\|main\|app\|server/);
    });

    test('it is registered and runs deterministically in the orchestrator', () => {
        const registry = fs.readFileSync(
            path.join(__dirname, '..', 'modules', 'tools', 'registry.ts'), 'utf-8');
        expect(registry).toMatch(/createTool\(ProjectPipelineTool\)/);
        const orch = fs.readFileSync(
            path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        expect(orch).toMatch(/'project_pipeline'/);
        // And it gets the RUN budget — a multi-phase build is not one node's slice.
        expect(orch).toMatch(/node\.tool === 'project_pipeline' \? RUN_DEADLINE_MS : NODE_DEADLINE_MS/);
    });

    test('phase project_run uses accepted project evidence without overriding explicit arguments', () => {
        const logs: string[] = [];
        const planned: Record<string, any> = {};
        applyPhaseExecutionEvidence('project_run', planned, { projectName: 'NEXUS Console' }, logs);
        expect(planned.projectQuery).toBe('run the project named "NEXUS Console"');
        expect(logs.join('\\n')).toMatch(/accepted plan project evidence/i);

        const withCwd: Record<string, any> = { cwd: '/workspace/nexus' };
        applyPhaseExecutionEvidence('project_run', withCwd, { projectName: 'Other' });
        expect(withCwd).toEqual({ cwd: '/workspace/nexus' });

        const withQuery: Record<string, any> = { projectQuery: 'run the project named "NEXUS"' };
        applyPhaseExecutionEvidence('project_run', withQuery, { projectName: 'Other' });
        expect(withQuery.projectQuery).toBe('run the project named "NEXUS"');

        const noEvidence: Record<string, any> = {};
        applyPhaseExecutionEvidence('project_run', noEvidence, { projectName: 'Unknown project' });
        expect(noEvidence).toEqual({});
    });

    test('the executor chain it relies on really verifies: build check after code phases', () => {
        const phaseExec = fs.readFileSync(
            path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf-8');
        // Language is part of the trusted phase context. If this boundary drops
        // it, generic tool progress silently switches back to Arabic mid-run.
        expect(phaseExec).toMatch(/language:\s*context\?\.language\s*\|\|\s*projectContext\?\.language/);
        expect(phaseExec).toMatch(/npm run --if-present build/);
        expect(phaseExec).toMatch(/verificationTask/);
        // The check runs in the PROJECT dir derived from the plan's own
        // package.json path — never blindly at the workspace root — and skips
        // honestly when the phase wrote no package.json.
        expect(phaseExec).toMatch(/pkgPath\.replace/);
        expect(phaseExec).toMatch(/skipped honestly/);
        expect(phaseExec).toMatch(/timeout: 300000/);
    });
});
