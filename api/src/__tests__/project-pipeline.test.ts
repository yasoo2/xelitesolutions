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
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import {
    applyLiveRunOutcome,
    applyProjectQualityContractOutcome,
    applyScopeAuditOutcome,
    buildPlannerEvidence,
    inspectProjectQualityContract,
    deterministicRescueAllowed,
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
        expect(src).not.toMatch(/tool: '(?:orion_business_foundation|enterprise_platform_foundation|api_project|react_project)'/);
        expect(src).not.toMatch(/executeTool\('(?!engineering_discovery|project_planner)/);
    });

    test('a simple landing page is NOT stolen from the page builder', async () => {
        const p = await plan('ابنِ لي صفحة هبوط لمطعم شعبي');
        expect(p.steps[0].tool).toBe('web_page_builder');
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

    test('provider preflight blocks honestly before planner when no model is healthy', () => {
        const preflight = src.indexOf('verifyProviderDirect');
        const planner = src.indexOf("executeTool('project_planner'");
        expect(preflight).toBeGreaterThan(-1);
        expect(planner).toBeGreaterThan(preflight);
        expect(src).toMatch(/stopReason: 'provider_unavailable'/);
        expect(src).toMatch(/provider preflight/);
        expect(src).toMatch(/skipProviderPreflight/);
    });

    test('bounded live-run repair rediscovers the current incomplete root instead of the greenfield reference set', () => {
        expect(src).toMatch(/const repairDiscoveryRequest = \[/);
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

    test('the visible browser panel survives the pipeline-to-phase boundary', () => {
        expect(src).toMatch(/browserSessionId:\s*context\?\.browserSessionId/);
        const loop = fs.readFileSync(
            path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf-8');
        expect(loop).toMatch(/browserSessionId\?:\s*string/);
        expect(loop).toMatch(/const projectContext = \{[\s\S]*browserSessionId,/);
        expect(loop).toMatch(/const executionContext = \{[\s\S]*browserSessionId,[\s\S]*engineeringPipeline:\s*true,[\s\S]*purpose:\s*['"]internal['"]/);
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
            expect(src).toMatch(/applyProjectQualityContractOutcome\(liveArtifactRoot, request, liveOutcome\)/);
            expect(src).toMatch(/applyScopeAuditOutcome\(request, liveArtifactRoot, (?:qualityCheckedLiveOutcome|liveOutcome)\)/);
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
        expect(src).toMatch(/applyProjectQualityContractOutcome\(artifactRoot, request, scopeRetryLive\)/);
        expect(src).toMatch(/applyScopeAuditOutcome\(request, artifactRoot, (?:qualityCheckedScopeRetry|scopeRetryLive)\)/);
    });

    test('success and verification are earned, with explicit execution and delivery states', () => {
        expect(src).toMatch(/const verified = pipeline\?\.ok === true/);
        expect(src).toMatch(/const executionStatus = verified/);
        expect(src).toMatch(/const verificationStatus = verified/);
        expect(src).toMatch(/const deliveryStatus = verified/);
        expect(src).toMatch(/ok: finalVerified/);
        // The honest partial-delivery message exists in Arabic.
        expect(src).toMatch(/توقف البناء بصدق/);
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
