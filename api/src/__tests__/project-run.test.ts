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
import { canAdoptRecordedLive, launchabilityError, missingRuntimeDependencies, placeholderLifecycleScriptError, reconcileMissingRuntimeTarget, resolveRunnableProject, shouldUseActiveProjectDirectly } from '../modules/tools/definitions/ProjectRunTool';

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

describe('placeholder lifecycle scripts are not engineering evidence', () => {
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-placeholder-script-'));
    });

    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

    test('rejects npm start when test is the npm placeholder that exits 1', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            scripts: {
                start: 'node server.js',
                test: 'echo "Error: no test specified" && exit 1',
            },
        }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server.js'), 'require("http").createServer((_req, res) => res.end("ok")).listen(process.env.PORT);', 'utf-8');

        expect(placeholderLifecycleScriptError(root)).toContain('scripts.test');
        expect(launchabilityError(root, { command: 'npm start', kind: 'npm-start' })).toContain('failing placeholder');
    });

    test('rejects an explicitly failing build placeholder too', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            scripts: {
                start: 'node server.js',
                build: 'echo "Build script not specified" && exit 1',
            },
        }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server.js'), 'require("http").createServer((_req, res) => res.end("ok")).listen(process.env.PORT);', 'utf-8');

        expect(placeholderLifecycleScriptError(root)).toContain('scripts.build');
    });

    test('does not require optional lifecycle scripts when they are absent or real', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { start: 'node server.js', test: 'node tests/smoke.js' } }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server.js'), 'require("http").createServer((_req, res) => res.end("ok")).listen(process.env.PORT);', 'utf-8');

        expect(placeholderLifecycleScriptError(root)).toBeNull();
        expect(launchabilityError(root, { command: 'npm start', kind: 'npm-start' })).toBeNull();
    });
});

describe('runtime import dependency preflight', () => {
    test('detects undeclared or missing runtime imports without flagging Node built-ins', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-runtime-deps-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '^4.0.0' } }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server.js'), "const http = require('http'); const sqlite3 = require('sqlite3'); http.createServer((_req, res) => res.end('ok')).listen(process.env.PORT);", 'utf-8');
        expect(missingRuntimeDependencies(root, { command: 'npm start', kind: 'npm-start' })).toContain('sqlite3');
        expect(missingRuntimeDependencies(root, { command: 'npm start', kind: 'npm-start' })).not.toContain('http');
        expect(launchabilityError(root, { command: 'npm start', kind: 'npm-start' })).toBeNull();
        fs.rmSync(root, { recursive: true, force: true });
    });
});

describe('bounded manifest-to-entrypoint reconciliation', () => {
    test('repairs a missing node target from a unique on-disk server entrypoint', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-reconcile-'));
        fs.mkdirSync(path.join(root, 'src'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            main: 'index.js',
            scripts: { start: 'node index.js' },
        }), 'utf-8');
        fs.writeFileSync(path.join(root, 'src', 'index.js'), "require('http').createServer((_req, res) => res.end('ok')).listen(process.env.PORT);", 'utf-8');

        const result = reconcileMissingRuntimeTarget(root, 'launchability: runtime target is missing (index.js)');
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
        expect(result.repaired).toBe(true);
        expect(manifest.main).toBe('src/index.js');
        expect(manifest.scripts.start).toBe('node src/index.js');
    });

    test('does not guess when equally ranked server entrypoints exist', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-reconcile-ambiguous-'));
        fs.mkdirSync(path.join(root, 'src'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { start: 'node index.js' } }), 'utf-8');
        const source = "require('http').createServer((_req, res) => res.end('ok')).listen(process.env.PORT);";
        fs.writeFileSync(path.join(root, 'src', 'foo.js'), source, 'utf-8');
        fs.writeFileSync(path.join(root, 'src', 'bar.js'), source, 'utf-8');

        const result = reconcileMissingRuntimeTarget(root, 'runtime target is missing (index.js)');
        expect(result.repaired).toBe(false);
        expect(result.message).toMatch(/multiple equally ranked/i);
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

    test('a package name identifies a runnable workspace root when the folder name differs', () => {
        fs.writeFileSync(path.join(root, 'package.json'), '{"name":"nexus-platform"}', 'utf-8');
        const result = resolveRunnableProject(root, '"nexus"');
        expect(result.matched).toBe(true);
        expect(result.cwd).toBe(root);
    });

    test('an incomplete active scaffold does not hide a named runnable workspace artifact', () => {
        const incomplete = path.join(root, 'nexus-scaffold');
        fs.mkdirSync(incomplete, { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), '{"name":"nexus"}', 'utf-8');
        expect(shouldUseActiveProjectDirectly(incomplete, '"nexus"')).toBe(false);
        expect(shouldUseActiveProjectDirectly(incomplete, '')).toBe(true);
        const resolved = resolveRunnableProject(root, '"nexus"');
        expect(resolved.matched).toBe(true);
        expect(resolved.cwd).toBe(root);
    });

    test('project_run has a named-query guard before selecting a fallback cwd', () => {
        expect(runSrc).toMatch(/namedProjectQuery/);
        expect(runSrc).toMatch(/shouldUseActiveProjectDirectly/);
        expect(runSrc).toMatch(/will not guess and start another repository/);
    });

    test('a persisted live URL is not adopted from a deleted or different cwd', () => {
        const current = process.cwd();
        expect(canAdoptRecordedLive({ pid: process.pid, cwd: current }, current)).toBe(true);
        expect(canAdoptRecordedLive({ pid: process.pid, cwd: path.join(current, 'deleted-old-run') }, current)).toBe(false);
        expect(canAdoptRecordedLive({ pid: process.pid, cwd: os.tmpdir() }, current)).toBe(false);
        expect(runSrc).toContain('ignored stale or unowned live record');
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
