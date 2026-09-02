/**
 * Running a built system (proposal أ): a web PAGE previews by rendering a file,
 * but a SYSTEM must actually run. project_run starts it live, project_stop stops
 * it, the pipeline runs a verified build automatically (no button), and natural
 * language ("شغّل / أوقف المشروع") routes to them deterministically.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { canAdoptRecordedLive, declaredLaunchPrerequisitePackages, detectStart, launchPrerequisiteError, launchabilityError, missingLocalRuntimeImports, missingRuntimeDependencies, placeholderLifecycleScriptError, reconcileMissingRuntimeImports, reconcileMissingRuntimeTarget, resolveRunnableProject, shouldUseActiveProjectDirectly, ProjectRunTool } from '../modules/tools/definitions/ProjectRunTool';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { executionEngine } from '../kernel/ExecutionEngine';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { workspaceService } from '../modules/services/WorkspaceService';
import { NpmManagerTool } from '../modules/tools/definitions/SystemTools';

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
    test('a verified production bundle has a gateway-owned fallback when dev tooling cannot boot', () => {
        expect(runSrc).toMatch(/builtPreviewRoot/);
        expect(runSrc).toMatch(/STATIC_PREVIEW_SERVER_SOURCE/);
        expect(runSrc).toMatch(/kind: 'static-build-fallback'/);
        expect(runSrc).toMatch(/productionBundleConfirmed: true/);
    });
    test('the gateway preserves executable paths and argv with spaces', async () => {
        const execute = jest.spyOn(executionEngine, 'execute').mockResolvedValue({ success: true, data: { ok: true }, duration: 0 });
        try {
            await executionFirewall.runInContext('gateway-argv-test', () => ExecutionGateway.execute(
                'C:\\Program Files\\nodejs\\node.exe', ['-e', 'console.log("ready")'], { shell: false },
            ));
            expect(execute).toHaveBeenCalledWith(expect.objectContaining({
                payload: expect.objectContaining({
                    command: 'C:\\Program Files\\nodejs\\node.exe',
                    args: ['-e', 'console.log("ready")'],
                }),
            }));
        } finally {
            execute.mockRestore();
        }
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

describe('launch prerequisite recovery stays manifest-evidence-first', () => {
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-launch-install-'));
    });

    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

    test('returns declared runtime packages for the single bounded npm_manager recovery', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            dependencies: { express: '^4.0.0' },
            devDependencies: { vite: '^5.0.0' },
        }), 'utf-8');

        expect(declaredLaunchPrerequisitePackages(root, 'runtime dependencies missing or undeclared: express')).toEqual(['express']);
        expect(declaredLaunchPrerequisitePackages(root, 'vite')).toEqual(['vite']);
    });

    test('refuses an undeclared runtime import instead of guessing an npm package', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { express: '^4.0.0' } }), 'utf-8');

        expect(declaredLaunchPrerequisitePackages(root, 'runtime dependencies missing or undeclared: sqlite3')).toBeNull();
        expect(declaredLaunchPrerequisitePackages(root, 'vite')).toBeNull();
    });

    test('routes the repair through the existing npm manager and rechecks before launch', () => {
        expect(runSrc).toMatch(/new NpmManagerTool\(\)\.execute/);
        expect(runSrc).toMatch(/missingAfterInstall = launchPrerequisiteError/);
        expect(runSrc).toMatch(/auto npm install succeeded/);
    });

    test('detects an uninstalled declared Vite dev server as an installable prerequisite', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            scripts: { dev: 'vite' },
            devDependencies: { vite: '^5.4.11' },
        }), 'utf-8');

        expect(launchPrerequisiteError(root, {
            command: 'npm run dev -- --port 4300 --strictPort --host localhost',
            kind: 'dev-server',
        })).toBe('vite');
        expect(declaredLaunchPrerequisitePackages(root, 'vite')).toEqual(['vite']);
    });

    test('installs a declared missing dependency once, then launches only after the recheck passes', async () => {
        const server = http.createServer((_req, res) => res.end('ready'));
        server.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 4387;
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-project-run-install-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            scripts: { start: 'node server.js' },
            dependencies: { express: '^4.0.0' },
        }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server.js'), "require('express'); require('http').createServer((_req,res)=>res.end('ok')).listen(process.env.PORT);", 'utf-8');

        const rootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        const installSpy = jest.spyOn(NpmManagerTool.prototype, 'execute').mockImplementation(async (input: any) => {
            expect(input).toMatchObject({ command: 'install', cwd: root });
            fs.mkdirSync(path.join(root, 'node_modules', 'express'), { recursive: true });
            fs.writeFileSync(path.join(root, 'node_modules', 'express', 'package.json'), '{"name":"express","version":"4.0.0"}\n');
            fs.writeFileSync(path.join(root, 'node_modules', 'express', 'index.js'), 'module.exports = {};\n');
            return { ok: true, output: { output: 'added express' }, logs: ['npm.args=install'] } as any;
        });
        const gatewaySpy = jest.spyOn(ExecutionGateway, 'execute').mockImplementation(async (requestOrCommand: any) => {
            const command = typeof requestOrCommand === 'string' ? requestOrCommand : requestOrCommand?.payload?.command;
            if (command === 'node') return { success: true, data: { ok: true, exitCode: 0 } } as any;
            return { success: true, data: { ok: true } } as any;
        });

        try {
            const result: any = await new ProjectRunTool().execute({ cwd: root, port }, { workspaceId: 'project-run-install-test' });
            expect(result.ok).toBe(true);
            expect(result.output.ready).toBe(true);
            expect(installSpy).toHaveBeenCalledTimes(1);
            expect(result.logs.join('\\n')).toContain('auto npm install succeeded');
        } finally {
            gatewaySpy.mockRestore();
            installSpy.mockRestore();
            rootSpy.mockRestore();
            server.close();
            fs.rmSync(root, { recursive: true, force: true });
        }
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

describe('local runtime import preflight follows the real filesystem', () => {
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-local-imports-'));
        fs.mkdirSync(path.join(root, 'src', 'routes'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            scripts: { start: 'node server.js' },
        }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server.js'), [
            "const http = require('http');",
            "const tasks = require('./routes/tasks');",
            "http.createServer((_req, res) => res.end(tasks.ok ? 'ok' : 'bad')).listen(process.env.PORT);",
        ].join('\\n'), 'utf-8');
        fs.writeFileSync(path.join(root, 'src', 'routes', 'tasks.js'), 'module.exports = { ok: true };\\n', 'utf-8');
    });

    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

    test('reports the exact importer and missing local specifier instead of suggesting npm install', () => {
        const detected = { command: 'npm start', kind: 'npm-start' };
        expect(missingLocalRuntimeImports(root, detected)).toEqual(['server.js -> ./routes/tasks']);
        expect(launchabilityError(root, detected)).toContain('local runtime imports missing');
        expect(launchabilityError(root, detected)).toContain('server.js -> ./routes/tasks');
    });

    test('accepts the same project once the import points to the existing route layout', () => {
        fs.writeFileSync(path.join(root, 'server.js'), [
            "const http = require('http');",
            "const tasks = require('./src/routes/tasks');",
            "http.createServer((_req, res) => res.end(tasks.ok ? 'ok' : 'bad')).listen(process.env.PORT);",
        ].join('\\n'), 'utf-8');
        const detected = { command: 'npm start', kind: 'npm-start' };
        expect(missingLocalRuntimeImports(root, detected)).toEqual([]);
        expect(launchabilityError(root, detected)).toBeNull();
    });

    test('does not report an existing CSS asset imported by a reachable frontend module', () => {
        fs.writeFileSync(path.join(root, 'server.js'), [
            "const http = require('http');",
            "require('./src/main.jsx');",
            "http.createServer((_req, res) => res.end('ok')).listen(process.env.PORT);",
        ].join('\n'), 'utf-8');
        fs.mkdirSync(path.join(root, 'src', 'styles'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'main.jsx'), [
            "import './styles/app.css';",
            'export default {};',
        ].join('\n'), 'utf-8');
        fs.writeFileSync(path.join(root, 'src', 'styles', 'app.css'), ':root { color-scheme: light; }\\n', 'utf-8');

        expect(missingLocalRuntimeImports(root, { command: 'npm start', kind: 'npm-start' })).toEqual([]);
    });

    test('reports a missing CSS asset imported by a reachable frontend module', () => {
        fs.writeFileSync(path.join(root, 'server.js'), [
            "const http = require('http');",
            "require('./src/main.jsx');",
            "http.createServer((_req, res) => res.end('ok')).listen(process.env.PORT);",
        ].join('\n'), 'utf-8');
        fs.mkdirSync(path.join(root, 'src', 'styles'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'main.jsx'), [
            "import './styles/app.css';",
            'export default {};',
        ].join('\n'), 'utf-8');

        expect(missingLocalRuntimeImports(root, { command: 'npm start', kind: 'npm-start' })).toEqual([
            'src/main.jsx -> ./styles/app.css',
        ]);
    });

    test('rejects a local asset whose filename differs only by case', () => {
        fs.writeFileSync(path.join(root, 'server.js'), "require('./src/main.jsx');", 'utf-8');
        fs.mkdirSync(path.join(root, 'src', 'styles'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'main.jsx'), "import './styles/app.css';", 'utf-8');
        fs.writeFileSync(path.join(root, 'src', 'styles', 'App.css'), ':root { color-scheme: light; }', 'utf-8');

        expect(missingLocalRuntimeImports(root, { command: 'npm start', kind: 'npm-start' })).toEqual([
            'src/main.jsx -> ./styles/app.css',
        ]);
    });

    test('repairs one proven sibling naming mismatch without creating a route file', () => {
        fs.mkdirSync(path.join(root, 'server', 'routes'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { start: 'node server/index.js' } }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server', 'index.js'), [
            "const http = require('http');",
            "const auth = require('./routes/authRoutes');",
            "http.createServer((_req, res) => res.end(auth.ok ? 'ok' : 'bad')).listen(process.env.PORT);",
        ].join('\\n'), 'utf-8');
        fs.writeFileSync(path.join(root, 'server', 'routes', 'auth.js'), 'module.exports = { ok: true };\\n', 'utf-8');

        const detected = { command: 'npm start', kind: 'npm-start' };
        const result = reconcileMissingRuntimeImports(root, detected);
        const source = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf-8');
        expect(result.repaired).toBe(true);
        expect(result.changes).toEqual([expect.stringContaining('server/index.js: ./routes/authRoutes -> ./routes/auth.js')]);
        expect(source).toContain("require('./routes/auth.js')");
        expect(fs.existsSync(path.join(root, 'server', 'routes', 'authRoutes.js'))).toBe(false);
        expect(missingLocalRuntimeImports(root, detected)).toEqual([]);
        expect(launchabilityError(root, detected)).toBeNull();
    });

    test('does not guess between multiple similar sibling route files', () => {
        fs.mkdirSync(path.join(root, 'server', 'routes'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { start: 'node server/index.js' } }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server', 'index.js'), [
            "const http = require('http');",
            "const auth = require('./routes/authRoutes');",
            "http.createServer((_req, res) => res.end(auth.ok ? 'ok' : 'bad')).listen(process.env.PORT);",
        ].join('\\n'), 'utf-8');
        fs.writeFileSync(path.join(root, 'server', 'routes', 'auth.js'), 'module.exports = { ok: true };\\n', 'utf-8');
        fs.writeFileSync(path.join(root, 'server', 'routes', 'authRouter.js'), 'module.exports = { ok: true };\\n', 'utf-8');

        const result = reconcileMissingRuntimeImports(root, { command: 'npm start', kind: 'npm-start' });
        expect(result.repaired).toBe(false);
        expect(result.message).toMatch(/ambiguous/i);
        expect(fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf-8')).toContain("require('./routes/authRoutes')");
    });
});

describe('filesystem-backed start target selection', () => {
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-start-target-'));
    });

    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

    test('uses the unique backend entrypoint when a frontend lifecycle script is not the runnable contract', () => {
        fs.mkdirSync(path.join(root, 'server'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            scripts: { start: 'react-scripts start' },
            dependencies: { express: '^4.0.0' },
        }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server', 'index.js'), "require('http').createServer((_req, res) => res.end('ok')).listen(process.env.PORT);", 'utf-8');

        expect(detectStart(root, 4300)).toMatchObject({ command: 'node server/index.js', kind: 'node-entry' });
    });

    test('discovers a nested server/server.js entrypoint when no manifest is present', () => {
        fs.mkdirSync(path.join(root, 'server'), { recursive: true });
        fs.writeFileSync(path.join(root, 'server', 'server.js'), "require('http').createServer((_req, res) => res.end('ok')).listen(process.env.PORT);", 'utf-8');

        expect(detectStart(root, 4300)).toMatchObject({ command: 'node server/server.js', kind: 'node-entry' });
    });

    test('does not guess between multiple backend entrypoints', () => {
        fs.mkdirSync(path.join(root, 'server'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { start: 'react-scripts start' } }), 'utf-8');
        const source = "require('http').createServer((_req, res) => res.end('ok')).listen(process.env.PORT);";
        fs.writeFileSync(path.join(root, 'server', 'index.js'), source, 'utf-8');
        fs.writeFileSync(path.join(root, 'server', 'admin.js'), source, 'utf-8');

        expect(detectStart(root, 4300)).toMatchObject({ command: 'npm start', kind: 'npm-start' });
    });

    test('keeps a frontend-only project on its declared lifecycle script', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { start: 'react-scripts start' } }), 'utf-8');
        expect(detectStart(root, 4300)).toMatchObject({ command: 'npm start', kind: 'npm-start' });
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

    test('repairs a missing node target to the unique nested server/server.js entrypoint', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-reconcile-nested-'));
        fs.mkdirSync(path.join(root, 'server'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            main: 'src/index.js',
            scripts: { start: 'node src/index.js' },
        }), 'utf-8');
        fs.writeFileSync(path.join(root, 'server', 'server.js'), "require('http').createServer((_req, res) => res.end('ok')).listen(process.env.PORT);", 'utf-8');

        const result = reconcileMissingRuntimeTarget(root, 'launchability: runtime target is missing (src/index.js)');
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
        expect(result.repaired).toBe(true);
        expect(manifest.main).toBe('server/server.js');
        expect(manifest.scripts.start).toBe('node server/server.js');
        fs.rmSync(root, { recursive: true, force: true });
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

    test('project_run invokes bounded target reconciliation before rejecting a missing runtime target', () => {
        expect(runSrc).toMatch(/if \(launchability && !input\?\.command && \/runtime target is missing/);
        expect(runSrc).toMatch(/reconcileMissingRuntimeTarget\(cwd, launchability\)/);
        expect(runSrc).toMatch(/detected = detectStart\(cwd, port\)/);
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

    test('successful project_run persists the verified live preview for browser QA', () => {
        expect(runSrc).toContain('function rememberLiveProject');
        expect(runSrc).toContain('rememberLiveProject(context, cwd');
        const remember = runSrc.slice(
            runSrc.indexOf('function rememberLiveProject'),
            runSrc.indexOf('\n}', runSrc.indexOf('function rememberLiveProject')),
        );
        expect(remember).toContain('live.url');
        expect(remember).toMatch(/live:\s*\{[^}]*\burl\b[^}]*\bport\b[^}]*\bpid\b[^}]*\bcwd\b/);
        expect(remember).toMatch(/\bwriteJoeProject\s*\(/);
        expect(remember).toMatch(/\bpersistJoeProjects\s*\(/);
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
