/**
 * Running a built system (proposal أ): a web PAGE previews by rendering a file,
 * but a SYSTEM must actually run. project_run starts it live, project_stop stops
 * it, the pipeline runs a verified build automatically (no button), and natural
 * language ("شغّل / أوقف المشروع") routes to them deterministically.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { resolveRunnableProject } from '../modules/tools/definitions/ProjectRunTool';

const runSrc = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRunTool.ts'), 'utf-8');
const pipeSrc = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');
const orch = fs.readFileSync(
    path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');

const plan = (goal: string) =>
    PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });

describe('natural language routes to run / stop, deterministically', () => {
    test.each([
        'شغّل المشروع',
        'شغل النظام الآن',
        'run the project',
        'start the dev server',
        'افتح المعاينة وشغّل المشروع',
    ])('«%s» → project_run', async (g) => {
        const p = await plan(g);
        expect(p.steps[0].tool).toBe('project_run');
    });

    test.each([
        'أوقف المشروع',
        'اوقف الخادم',
        'stop the project',
        'kill the server',
    ])('«%s» → project_stop', async (g) => {
        const p = await plan(g);
        expect(p.steps[0].tool).toBe('project_stop');
    });

    test('"ابنِ لي مشروعاً" is NOT mistaken for run', async () => {
        const p = await plan('ابنِ لي نظام إدارة متكامل بباك اند وقاعدة بيانات');
        expect(p.steps[0].tool).toBe('project_pipeline');
    });

    test('both are deterministic in the orchestrator', () => {
        expect(orch).toMatch(/'project_run', 'project_stop'/);
    });
});

describe('project_run really RUNS (not renders) and is Windows-safe', () => {
    test('it detects project type from files, not a guess', () => {
        expect(runSrc).toMatch(/function detectStart/);
        expect(runSrc).toMatch(/scripts\.dev/);
        expect(runSrc).toMatch(/scripts\.start/);
        expect(runSrc).toMatch(/\\.listen\\s\*\\\(/); // node-entry detection
    });
    test('it starts through the sanctioned gateway — never child_process', () => {
        expect(runSrc).toMatch(/ExecutionGateway\.execute/);
        expect(runSrc).not.toMatch(/from ['"]child_process['"]/);
    });
    test('it discovers the real port by probing (frameworks pick their own)', () => {
        expect(runSrc).toMatch(/COMMON_DEV_PORTS/);
        expect(runSrc).toMatch(/isPortOpen/);
    });
    test('stop kills the whole tree — taskkill on Windows, the group on POSIX', () => {
        expect(runSrc).toMatch(/process\.platform === 'win32'/);
        expect(runSrc).toMatch(/taskkill \/F \/T \/PID/);
        expect(runSrc).toMatch(/process\.kill\(-pid/);
    });
    test('one project owns one server — a new run stops the previous', () => {
        expect(runSrc).toMatch(/await stopServer\(key, logs\)/);
    });
});

describe('named project discovery never falls back to the workspace repository', () => {
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-project-run-discovery-'));
        // The workspace itself is runnable too — this models Joe's repository.
        fs.writeFileSync(path.join(root, 'package.json'), '{"name":"joe"}', 'utf-8');
        const child = path.join(root, 'Joe-System-Execution-Test');
        fs.mkdirSync(child, { recursive: true });
        fs.writeFileSync(path.join(child, 'package.json'), '{"name":"execution-test"}', 'utf-8');
    });

    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

    test('a quoted child name wins over the runnable workspace root', () => {
        const result = resolveRunnableProject(root, '"Joe-System-Execution-Test"');
        expect(result.matched).toBe(true);
        expect(result.cwd).toBe(path.join(root, 'Joe-System-Execution-Test'));
    });

    test('an explicit missing name returns no match instead of the workspace root', () => {
        const result = resolveRunnableProject(root, '"missing-project"');
        expect(result.matched).toBe(false);
        expect(result.cwd).toBeNull();
    });

    test('project_run has a named-query guard before selecting a fallback cwd', () => {
        expect(runSrc).toMatch(/namedProjectQuery/);
        expect(runSrc).toMatch(/will not guess and start another repository/);
    });
});

describe('the pipeline runs a verified build automatically (no button)', () => {
    test('after verified, it calls project_run and never lets a run failure fail the build', () => {
        expect(pipeSrc).toMatch(/if \(verified\) \{[\s\S]*executeTool\('project_run'/);
        expect(pipeSrc).toMatch(/liveUrl/);
    });
    test('verified delivery passes the planner identity to project_run instead of guessing a workspace child', () => {
        expect(pipeSrc).toContain('const plannedProjectName = String(plannerResult?.output?.projectName || \'\').trim();');
        expect(pipeSrc).toContain('runInput.projectQuery = `"${plannedProjectName.replace');
        expect(pipeSrc).toContain("executeTool('project_run', runInput");
    });
    test('the delivery report shows the live URL front and center', () => {
        expect(pipeSrc).toMatch(/🟢 نظامك يعمل الآن/);
        expect(pipeSrc).toMatch(/أوقف المشروع/);
    });
});
