/**
 * The multi-file project audit: the canonical pipeline (Plan → PhaseExecutor →
 * QualityGate → RepairTicket → SelfFix → Rerun) existed, was verified by six
 * manual harnesses — and was called by NOTHING in production. A user asking
 * for a complete project got a single HTML page or a pile of never-executed
 * files. project_pipeline is the missing production bridge, and the planner
 * routes full-project requests to it deterministically.
 */
import fs from 'fs';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

describe('routing — full-project requests reach the pipeline, offline and deterministic', () => {
    const plan = (goal: string) =>
        PlanningEngine.generatePlan({ intent: { goal, complexity: 'high', riskLevel: 'medium', rawIntent: {} } as any });

    test.each([
        'ابنِ لي مشروعاً متكاملاً لإدارة المخزون بباك اند وقاعدة بيانات',
        'انشئ نظام إدارة متكامل للمبيعات',
        'build a complete project for a task manager with a REST API',
        'create a full-stack inventory application with a database',
        'develop a Node.js express server with authentication',
    ])('«%s» → project_pipeline', async (goal) => {
        const p = await plan(goal);
        expect(p.steps).toHaveLength(1);
        expect(p.steps[0].tool).toBe('project_pipeline');
        expect((p.steps[0].input as any).request).toBe(goal);
    });

    test('a simple landing page is NOT stolen from the page builder', async () => {
        const p = await plan('ابنِ لي صفحة هبوط لمطعم شعبي');
        expect(p.steps[0].tool).toBe('web_page_builder');
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

    test('it plans with the planner-only tool, then hands phases to the canonical pipeline', () => {
        expect(src).toMatch(/executeTool\('project_planner'/);
        expect(src).toMatch(/AgentLoopService\.runPlannedPhasesIfPresent/);
        // Lazy require, or the import cycle ToolService→definitions→AgentLoopService bites.
        expect(src).toMatch(/require\('\.\.\/\.\.\/services\/AgentLoopService'\)/);
    });

    test('ok is EARNED by verification, never assumed from file writes', () => {
        expect(src).toMatch(/const verified = pipeline\?\.ok === true/);
        expect(src).toMatch(/ok: verified/);
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
        expect(orch).toMatch(/'project_pipeline',?\s*\n?\]/);
        // And it gets the RUN budget — a multi-phase build is not one node's slice.
        expect(orch).toMatch(/node\.tool === 'project_pipeline' \? RUN_DEADLINE_MS : NODE_DEADLINE_MS/);
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
