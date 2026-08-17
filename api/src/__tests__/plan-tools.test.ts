/**
 * THE PLAN THAT KILLED HIS BUILD.
 *
 * The field log, verbatim:
 *
 *   [pipeline] plan ready: E-commerce Platform — 8 phases
 *   [PhaseExecutor] Task 1/2: "Create project repository" — executing tool: Git
 *   [PhaseExecutor] ❌ Task 1 failed: Git — unknown_tool: "Git"
 *   [PhaseExecutor] Task 2/2: "Set up project management board" — executing tool: Jira
 *   [PhaseExecutor] ❌ Task 2 failed: Jira — unknown_tool: "Jira"
 *   ⛔ لم ينجح الإصلاح الذاتي — أتوقف بصدق عند 0/8 مراحل
 *
 * Eight phases of an e-commerce platform, dead on the first two tasks, because
 * the planner asked a model what a senior project manager would do and never
 * told it what this machine can actually do. Then the self-fix ran
 * `git --version` (exit 0), concluded git was missing, and tried
 * `sudo apt-get install git -y` — on Windows.
 *
 * These are the exact strings from that run.
 */
import { resolvePlannedTool, sanitisePlanPhases, unrunnableShellStep, plannerToolPrompt, plannedArgsIssue, adaptPlannedArgs, PLANNER_TOOL_CATALOGUE, isShellLikeWorkspacePath } from '../core/orchestrator/plan-tools';

describe('a plan may only name tools that exist', () => {
    it('«Git» is git_ops — the model named the product, it meant the capability', () => {
        expect(resolvePlannedTool('Git')).toEqual({ tool: 'git_ops', how: 'meaning' });
    });

    it('«Jira» is nothing, and saying so is the point', () => {
        // Joe writes software. It does not open tickets. Inventing a mapping
        // here would be worse than the failure it replaces.
        expect(resolvePlannedTool('Jira')).toEqual({ tool: null, why: 'not_software' });
    });

    it.each([
        ['Docker', 'docker_manager'],
        ['Stripe', 'payments_create_checkout_session'],
        ['npm install', 'npm_manager'],
        ['PostgreSQL', 'db_schema_migrator'],
        ['Jest', 'auto_tester'],
        ['React', 'react_project'],
        ['Express.js', 'api_project'],
        // «bash» already had a meaning in TOOL_ALIASES, and the existing alias
        // wins on purpose: one name, one answer, everywhere in the system.
        ['bash', 'terminal_manager'],
        ['Terminal', 'shell_execute'],
    ])('«%s» resolves to %s', (asked, expected) => {
        expect(resolvePlannedTool(asked).tool).toBe(expected);
    });

    it('a real tool name passes through untouched', () => {
        expect(resolvePlannedTool('ai_write_file')).toEqual({ tool: 'ai_write_file', how: 'exact' });
    });

    it('and casing or spacing never breaks a real name', () => {
        expect(resolvePlannedTool('AI Write File').tool).toBe('ai_write_file');
        expect(resolvePlannedTool('shell-execute').tool).toBe('shell_execute');
    });

    it('an invention with no meaning is refused, not guessed at', () => {
        expect(resolvePlannedTool('QuantumFluxCompiler')).toEqual({ tool: null, why: 'unknown' });
    });
});

describe('his phase 1, run through the sanitiser', () => {
    const phase1 = {
        phaseNumber: 1,
        name: 'Project Setup',
        description: 'Initialize the project',
        tasks: [
            { task: 'Create project repository', tool: 'Git', args: {}, priority: 'high' },
            { task: 'Set up project management board', tool: 'Jira', args: {}, priority: 'high' },
        ],
        verificationTask: { task: 'Check board', tool: 'Jira', args: {} },
    };

    it('the repository task becomes runnable', () => {
        const { phases } = sanitisePlanPhases([phase1], 'E-commerce Platform');
        expect(phases[0].tasks[0].tool).toBe('git_ops');
    });

    it('the Jira task is dropped, with a reason a human can read', () => {
        const { phases, notes } = sanitisePlanPhases([phase1], 'E-commerce Platform');
        expect(phases[0].tasks.find((t: any) => t.tool === 'Jira')).toBeUndefined();
        expect(notes.join('\n')).toMatch(/عمل تنظيمي بشري/);
    });

    it('the verification step reads the concrete evidence artefact, not an invented source', () => {
        const { phases } = sanitisePlanPhases([phase1], 'E-commerce Platform');
        expect(phases[0].verificationTask.tool).toBe('read_file');
        expect(phases[0].verificationTask.args.path).toMatch(/docs\/01-project_setup\.md$/);
    });

    it('and the phase that used to score 0/2 now has real work in it', () => {
        const { executableTasks } = sanitisePlanPhases([phase1], 'E-commerce Platform');
        expect(executableTasks).toBeGreaterThan(0);
    });

    it('a phase left with nothing runnable becomes a document, not a red ❌', () => {
        const allHuman = {
            phaseNumber: 2, name: 'Team Kickoff', description: 'Align the team',
            tasks: [
                { task: 'Run kickoff meeting', tool: 'Zoom' },
                { task: 'Assign tickets', tool: 'Trello' },
            ],
        };
        const { phases, notes } = sanitisePlanPhases([allHuman], 'Shop');
        const runnable = phases[0].tasks.filter((t: any) => t.tool !== 'manual');
        expect(runnable).toHaveLength(1);
        // write_file, not ai_write_file: the replacement for a failing phase
        // must not itself need a model, or it fails the same way one layer down.
        expect(runnable[0].tool).toBe('write_file');
        expect(String(runnable[0].args.path)).toMatch(/docs\/02-team_kickoff\.md$/);
        // and it carries the real content, already known from the plan
        expect(String(runnable[0].args.content)).toMatch(/# Team Kickoff/);
        expect(String(runnable[0].args.content)).toMatch(/Zoom/);
        expect(notes.join('\n')).toMatch(/حوّلتُها إلى وثيقة حقيقية/);
    });
});

describe('greenfield runnable contract is explicit before live-run', () => {
    it('blocks project_run when no creation task writes a manifest or entrypoint', () => {
        const result = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Build services',
                tasks: [
                    { task: 'Implement the service logic', tool: 'ai_write_file', args: { path: 'src/service.ts', description: 'Implement service logic' } },
                ],
                verificationTask: { task: 'Start the project', tool: 'project_run', args: {} },
            },
        ], 'nexus', { mode: 'greenfield' });
        expect(result.blocker?.code).toBe('missing_runnable_contract');
        expect(result.notes.join('\\n')).toMatch(/project_run/);
    });

    it('does not mistake a nested feature index for the application entrypoint', () => {
        const result = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Feature implementation',
                tasks: [
                    { task: 'Implement authentication', tool: 'ai_write_file', args: { path: 'src/auth/index.ts', description: 'Implement auth module' } },
                    { task: 'Add auth tests', tool: 'ai_write_file', args: { path: 'tests/auth.test.ts', description: 'Add auth tests' } },
                ],
                verificationTask: { task: 'Start the project', tool: 'project_run', args: {} },
            },
        ], 'nexus', { mode: 'greenfield', requireRunnableContract: true });
        expect(result.blocker?.code).toBe('missing_runnable_contract');
    });

    it('accepts a conventional root entrypoint before project_run', () => {
        const result = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Foundation',
                tasks: [
                    { task: 'Create the HTTP entrypoint', tool: 'ai_write_file', args: { path: 'src/index.ts', description: 'Create the application entrypoint' } },
                ],
                verificationTask: { task: 'Start the project', tool: 'project_run', args: {} },
            },
        ], 'nexus', { mode: 'greenfield', requireRunnableContract: true });
        expect(result.blocker).toBeUndefined();
    });

    it('accepts a greenfield plan that creates package.json before project_run', () => {
        const result = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Foundation',
                tasks: [
                    { task: 'Create the runnable manifest', tool: 'ai_write_file', args: { path: 'package.json', description: 'Create package manifest' } },
                    { task: 'Create the HTTP entrypoint', tool: 'ai_write_file', args: { path: 'src/index.ts', description: 'Create an HTTP entrypoint' } },
                ],
                verificationTask: { task: 'Start the project', tool: 'project_run', args: {} },
            },
        ], 'nexus', { mode: 'greenfield' });
        expect(result.blocker).toBeUndefined();
        expect(result.phases[0].tasks.map((task: any) => task.tool)).toEqual(['ai_write_file', 'ai_write_file']);
    });

    it('treats file_edit as source-dependent and does not mistake it for file creation', () => {
        const result = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Foundation',
                tasks: [
                    { task: 'Patch a missing manifest', tool: 'file_edit', args: { filename: 'package.json', find: '{}', replace: '{"scripts":{"start":"node src/index.js"}}' } },
                ],
                verificationTask: { task: 'Start the project', tool: 'project_run', args: {} },
            },
        ], 'nexus', { mode: 'greenfield' });
        expect(result.blocker?.code).toBe('missing_runnable_contract');
    });

    it('accepts an in-place manifest edit only in bounded repair mode', () => {
        const result = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Repair runnable contract',
                tasks: [
                    { task: 'Patch the evidenced manifest', tool: 'file_edit', args: { filename: 'package.json', find: '{}', replace: '{"scripts":{"start":"node src/index.js"}}' } },
                ],
                verificationTask: { task: 'Start the project', tool: 'project_run', args: {} },
            },
        ], 'nexus', { mode: 'greenfield', requireRunnableContract: true, repairMode: true });
        expect(result.blocker).toBeUndefined();
        expect(result.phases[0].tasks.map((task: any) => task.tool)).toContain('file_edit');
    });

    it('allows a bounded repair of an evidenced conventional server entrypoint', () => {
        const result = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Repair entrypoint contract',
                tasks: [
                    { task: 'Patch the existing server entrypoint reference', tool: 'file_edit', args: { filename: 'server/index.js', find: "require('./server.js')", replace: "require('./index.js')" } },
                ],
                verificationTask: { task: 'Start the project', tool: 'project_run', args: {} },
            },
        ], 'nexus', { mode: 'existing', requireRunnableContract: true, repairMode: true });
        expect(result.blocker).toBeUndefined();
        expect(result.phases[0].tasks.map((task: any) => task.tool)).toContain('file_edit');
    });

    it('does not let bounded repair edit an arbitrary unproven source file', () => {
        const result = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Repair source',
                tasks: [
                    { task: 'Patch an unverified route', tool: 'file_edit', args: { filename: 'server/routes/auth.js', find: 'old', replace: 'new' } },
                ],
                verificationTask: { task: 'Start the project', tool: 'project_run', args: {} },
            },
        ], 'nexus', { mode: 'existing', requireRunnableContract: true, repairMode: true });
        expect(result.phases[0].tasks.map((task: any) => task.tool)).not.toContain('file_edit');
        expect(result.notes.join('\\n')).toMatch(/server\/routes\/auth\.js/);
    });
});

describe('model-written tool arguments are checked before execution', () => {
    const invalidMigrationPhase = {
        phaseNumber: 2,
        name: 'Data layer',
        tasks: [
            { task: 'Create a basic database schema for warehouse jobs', tool: 'db_schema_migrator', args: { engine: 'prisma', action: 'create' }, priority: 'high' },
            { task: 'Write a documented vertical slice', tool: 'write_file', args: { path: 'docs/slice.md', content: '# Slice' } },
        ],
    };

    it('rejects an invented migration action rather than guessing a destructive operation', () => {
        expect(plannedArgsIssue('db_schema_migrator', { engine: 'prisma', action: 'create' })).toMatch(/action واحداً/);
        expect(plannedArgsIssue('db_schema_migrator', { engine: 'prisma', action: 'status' })).toBeNull();
    });

    it('rejects auth_builder when a schema-required outputDir is missing', () => {
        expect(plannedArgsIssue('auth_builder', { type: 'full' })).toMatch(/outputDir/);
        expect(plannedArgsIssue('auth_builder', { type: 'full', outputDir: 'src/auth' })).toBeNull();
    });

    it('allows browser_run without runtime sessionId but still requires browser intent', () => {
        expect(plannedArgsIssue('browser_run', { instructionText: 'Open the local app and inspect the page' })).toBeNull();
        expect(plannedArgsIssue('browser_run', { sessionId: 'browser:test' })).toMatch(/instructionText أو actions/);
    });

    it('allows browser_ui_audit to resolve url from the Joe session runtime', () => {
        expect(plannedArgsIssue('browser_ui_audit', {})).toBeNull();
        expect(plannedArgsIssue('browser_ui_audit', { url: 'http://127.0.0.1:4300' })).toBeNull();
    });

    it('keeps business-tool required fields strict after runtime URL exceptions', () => {
        expect(plannedArgsIssue('auth_builder', { type: 'full' })).toMatch(/outputDir/);
    });

    it('drops an auth_builder task with missing required fields before execution', () => {
        const phase = {
            phaseNumber: 2,
            name: 'Authentication',
            tasks: [
                { task: 'Generate the authentication system', tool: 'auth_builder', args: { type: 'full' }, priority: 'high' },
                { task: 'Record the authentication boundary', tool: 'write_file', args: { path: 'docs/auth-boundary.md', content: '# Auth boundary' } },
            ],
        };
        const { phases, notes } = sanitisePlanPhases([phase], 'warehouse-console');
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['write_file']);
        expect(notes.join('\n')).toMatch(/auth_builder يحتاج الحقل الإلزامي/);
        expect(notes.join('\n')).toMatch(/outputDir/);
    });

    it('drops the invalid migration task before PhaseExecutor can emit Unsupported action', () => {
        const { phases, notes } = sanitisePlanPhases([invalidMigrationPhase], 'warehouse-console');
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['write_file']);
        expect(notes.join('\n')).toMatch(/db_schema_migrator يحتاج action/);
    });

    it('describes db_schema_migrator as an executor for an existing schema, not a schema designer', () => {
        const entry = PLANNER_TOOL_CATALOGUE.find((item: any) => item.tool === 'db_schema_migrator');
        expect(entry?.purpose).toMatch(/existing .*schema file/i);
        expect(entry?.purpose).toMatch(/migrate, push, reset, or status/i);
        expect(entry?.purpose).toMatch(/do not use create/i);
    });

    it('drops a documentation task with no evidenced source file before it can report File not found undefined', () => {
        const phase = {
            phaseNumber: 1,
            name: 'Initial planning',
            tasks: [
                { task: 'Document the initial plan', tool: 'doc_generator', args: {}, priority: 'high' },
                { task: 'Record the plan explicitly', tool: 'write_file', args: { path: 'docs/plan.md', content: '# Plan' } },
            ],
        };
        expect(plannedArgsIssue('doc_generator', {})).toMatch(/filePath/);
        const { phases, notes } = sanitisePlanPhases([phase], 'warehouse-console');
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['write_file']);
        expect(notes.join('\n')).toMatch(/doc_generator يحتاج filePath/);
    });

    it('derives requiredAny search input from the task sentence before PhaseExecutor sees it', () => {
        const phase = {
            phaseNumber: 1,
            name: 'Inspect the workspace',
            tasks: [
                { task: 'Search for providerTimeoutMs inside the existing project', tool: 'search_text', args: {}, priority: 'high' },
            ],
        };
        expect(plannedArgsIssue('search_text', {})).toMatch(/query أو pattern/);
        expect(plannedArgsIssue('search_text', { query: 'providerTimeoutMs' })).toBeNull();
        const { phases } = sanitisePlanPhases([phase], 'nexus');
        const search = phases[0].tasks.find((task: any) => task.tool === 'search_text');
        expect(search).toBeDefined();
        expect(search.args.query).toContain('providerTimeoutMs');
    });

    it('replaces a generative verification of an invented file with a read of the phase output', () => {
        const phase = {
            phaseNumber: 1,
            name: 'Architecture discovery',
            tasks: [
                { task: 'Record the discovered architecture', tool: 'write_file', args: { path: 'docs/architecture-evidence.md', content: '# Evidence' } },
            ],
            // This mirrors the NEXUS failure: the model treated a documentation
            // generator as an acceptance check and named a source no task wrote.
            verificationTask: { task: 'Generate architecture document', tool: 'doc_generator', args: { filePath: 'architecture_plan.md' } },
        };
        const { phases, notes } = sanitisePlanPhases([phase], 'evidence-workspace');
        expect(phases[0].verificationTask).toMatchObject({
            tool: 'read_file',
            args: { path: 'docs/architecture-evidence.md' },
        });
        expect(phases[0].verificationTask.args.filePath).toBeUndefined();
        expect(notes.join('\n')).toMatch(/تحققاً مولّداً/);
    });

    it('replaces a read of an invented verification file with a read of the phase output', () => {
        const phase = {
            phaseNumber: 1,
            name: 'Architecture discovery',
            tasks: [
                { task: 'Record the discovered architecture', tool: 'write_file', args: { path: 'docs/architecture-evidence.md', content: '# Evidence' } },
            ],
            // This is the second live NEXUS failure: the planner used a read,
            // not a generator, but architecture.md was never written by the
            // phase. It must remain a plan-contract error, never a self-fix.
            verificationTask: { task: 'Read the architecture', tool: 'read_file', args: { path: 'architecture.md' } },
        };
        const { phases, notes } = sanitisePlanPhases([phase], 'evidence-workspace');
        expect(phases[0].verificationTask).toMatchObject({
            tool: 'read_file',
            args: { path: 'docs/architecture-evidence.md' },
        });
        expect(notes.join('\n')).toMatch(/ملفاً غير مثبت/);
    });

    it('does not run a foundation phase before a runnable artifact exists', () => {
        const phase = {
            phaseNumber: 1,
            name: 'Foundation and Architecture',
            tasks: [
                { task: 'Create the backend entry point', tool: 'write_file', args: { path: 'NEXUS/backend/src/index.js', content: 'console.log("nexus")' } },
            ],
            verificationTask: { task: 'Start the live project', tool: 'project_run', args: {} },
        };
        const { phases, notes } = sanitisePlanPhases([phase], 'NEXUS');
        expect(phases[0].verificationTask).toMatchObject({
            tool: 'read_file',
            args: { path: 'NEXUS/backend/src/index.js' },
        });
        expect(notes.join('\\n')).toMatch(/تشغيلاً حياً قبل إنتاج artifact قابل للتشغيل/);
    });

    it('drops an AI source-generation task without a concrete path and brief before it can trigger repair', () => {
        const phase = {
            phaseNumber: 2,
            name: 'Minimal vertical slice',
            tasks: [
                { task: 'Implement the warehouse verification console UI', tool: 'ai_write_file', args: {}, priority: 'high' },
                { task: 'Record the implementation boundary', tool: 'write_file', args: { path: 'docs/slice-boundary.md', content: '# Boundary' } },
            ],
        };
        expect(plannedArgsIssue('ai_write_file', {})).toMatch(/path نسبياً/);
        expect(plannedArgsIssue('ai_write_file', { path: '../outside.ts', description: 'unsafe' })).toMatch(/داخل مساحة العمل/);
        const { phases, notes } = sanitisePlanPhases([phase], 'warehouse-console');
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['write_file']);
        expect(notes.join('\n')).toMatch(/ai_write_file يحتاج path نسبياً/);
    });

    it('drops a test-generation task without a concrete source file before it can read undefined', () => {
        const phase = {
            phaseNumber: 3,
            name: 'Local verification',
            tasks: [
                { task: 'Test the verification console', tool: 'test_generator', args: {}, priority: 'high' },
                { task: 'Record the local result', tool: 'write_file', args: { path: 'docs/verification.md', content: '# Verification' } },
            ],
        };
        expect(plannedArgsIssue('test_generator', {})).toMatch(/filePath/);
        expect(plannedArgsIssue('test_generator', { filePath: 'undefined' })).toMatch(/filePath/);
        expect(adaptPlannedArgs('test_generator', { path: 'src/verification-console.js' })).toMatchObject({ filePath: 'src/verification-console.js' });
        const { phases, notes } = sanitisePlanPhases([phase], 'warehouse-console');
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['write_file']);
        expect(notes.join('\n')).toMatch(/test_generator يحتاج filePath/);
    });

    it('drops an absolute read path before SafeReadFileTool can reject it at runtime', () => {
        const phase = {
            phaseNumber: 1,
            name: 'Repository inspection',
            tasks: [
                { task: 'Read copied host path', tool: 'read_file', args: { path: '/tmp/joe-workspace/NEXUS_SPECIFICATION.txt' } },
                { task: 'Record the inspection boundary', tool: 'write_file', args: { path: 'docs/inspection.md', content: '# Inspection' } },
            ],
        };
        const { phases, notes } = sanitisePlanPhases([phase], 'nexus', {
            evidencedPaths: ['NEXUS_SPECIFICATION.txt'],
        });
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['write_file']);
        expect(notes.join('\n')).toMatch(/ليس مساراً نسبياً آمناً/);
    });

    it('retains a read of a discovered workspace-relative specification', () => {
        const phase = {
            phaseNumber: 1,
            name: 'Repository inspection',
            tasks: [
                { task: 'Read specification', tool: 'read_file', args: { path: 'NEXUS_SPECIFICATION.txt' } },
                { task: 'Record the inspection boundary', tool: 'write_file', args: { path: 'docs/inspection.md', content: '# Inspection' } },
            ],
        };
        const { phases } = sanitisePlanPhases([phase], 'nexus', {
            evidencedPaths: ['NEXUS_SPECIFICATION.txt'],
        });
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['read_file', 'write_file']);
        expect(phases[0].tasks[0].args.path).toBe('NEXUS_SPECIFICATION.txt');
    });

    it('rejects a non-parser artifact from auto_tester syntax before execution', () => {
        expect(plannedArgsIssue('auto_tester', {
            testType: 'syntax',
            projectPath: '.',
            files: ['docs/verification.md'],
        })).toMatch(/يدعم JavaScript\/TypeScript وJSON فقط/);
    });

    it('allows a discovered JSON schema through the syntax contract', () => {
        expect(plannedArgsIssue('auto_tester', {
            testType: 'syntax',
            projectPath: '.',
            files: ['schemas/lifecycle_state_schema.json'],
        })).toBeNull();
    });

    it('refuses an empty or unevidenced code review before it can throw undefined.length', () => {
        expect(plannedArgsIssue('code_reviewer', {})).toMatch(/files/);
        expect(plannedArgsIssue('code_reviewer', { files: ['undefined'] })).toMatch(/files/);
        const phase = {
            phaseNumber: 4,
            name: 'Quality gate',
            tasks: [
                { task: 'Review quality', tool: 'code_reviewer', args: {}, priority: 'high' },
                { task: 'Review an invented path', tool: 'code_reviewer', args: { files: ['src/invented.ts'] }, priority: 'high' },
                { task: 'Write reviewed source', tool: 'write_file', args: { path: 'src/core.ts', content: 'export const ready = true;' } },
                { task: 'Review the phase output', tool: 'code_reviewer', args: { files: ['src/core.ts'] }, priority: 'high' },
            ],
        };
        const { phases, notes } = sanitisePlanPhases([phase], 'evidence-workspace');
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['write_file', 'code_reviewer']);
        expect(phases[0].tasks[1].args.files).toEqual(['src/core.ts']);
        expect(notes.join('\n')).toMatch(/code_reviewer يحتاج files/);
        expect(notes.join('\n')).toMatch(/src\/invented\.ts/);
    });
});

describe('the planner is told the vocabulary', () => {
    it('the prompt carries real tool names and forbids inventing one', () => {
        const p = plannerToolPrompt();
        expect(p).toMatch(/ai_write_file/);
        expect(p).toMatch(/react_project/);
        expect(p).toMatch(/Never invent a name/);
        expect(p).toMatch(/Jira/);   // named as a thing it CANNOT do
    });

    it('and every tool it advertises is actually registered', () => {
        // The catalogue is a promise made to a model. A name in it that does
        // not exist is the same defect one layer up.
        const { PLANNER_TOOL_CATALOGUE } = require('../core/orchestrator/plan-tools');
        const { tools } = require('../modules/tools/registry');
        const names = new Set(tools.map((t: any) => t.name));
        const missing = PLANNER_TOOL_CATALOGUE.map((t: any) => t.tool).filter((n: string) => !names.has(n));
        expect(missing).toEqual([]);
    });
});

describe('a step nobody could ever run is recognised before it is attempted', () => {
    const win = process.platform === 'win32';

    it('sudo is refused everywhere, with a reason', () => {
        expect(unrunnableShellStep('sudo apt-get install git -y')).toMatch(/sudo/);
    });

    it('installing something already on PATH is pointless, and named as such', () => {
        // node is running this test, so node is certainly installed.
        const r = unrunnableShellStep(win ? 'choco install node' : 'apt-get install node');
        expect(r).toMatch(/مثبَّت على الجهاز فعلاً/);
    });

    it('the wrong platform\'s package manager is impossible, not merely blocked', () => {
        const r = unrunnableShellStep(win ? 'apt-get install ripgrep' : 'choco install ripgrep');
        expect(r).toMatch(/مستحيلة أصلاً/);
    });

    it('an ordinary build command is left alone', () => {
        expect(unrunnableShellStep('npm run build')).toBeNull();
        expect(unrunnableShellStep('npm test')).toBeNull();
        expect(unrunnableShellStep('git status')).toBeNull();
    });
});


describe('a greenfield slice does not silently choose its technology', () => {
    const implicitSeedPhase = {
        phaseNumber: 1,
        name: 'Project setup',
        tasks: [
            { task: 'Generate a full-stack starter', tool: 'scaffold_full_stack', args: { projectName: 'my-app' } },
            { task: 'Create the smallest observable page', tool: 'ai_write_file', args: { path: 'index.html', description: 'A self-contained local HTML page that shows one verifiable warehouse-job status row.' } },
            { task: 'Install packages', tool: 'npm_manager', args: {} },
        ],
    };

    it('rejects npm_manager without a real command before it can emit missing_command', () => {
        expect(plannedArgsIssue('npm_manager', {})).toMatch(/command صالحاً/);
        expect(plannedArgsIssue('npm_manager', { command: 'run test' })).toBeNull();
    });

    it('keeps only explicit file-level work when the user did not choose a stack', () => {
        const { phases, notes } = sanitisePlanPhases([implicitSeedPhase], 'warehouse-console', { disallowImplicitScaffold: true });
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['ai_write_file']);
        expect(notes.join('\n')).toMatch(/لن أُنشئ scaffold افتراضياً/);
        expect(notes.join('\n')).toMatch(/npm_manager يحتاج command/);
    });

    it('permits a seed tool when an explicit engineering constraint authorizes it', () => {
        const { phases } = sanitisePlanPhases([implicitSeedPhase], 'warehouse-console', { disallowImplicitScaffold: false });
        expect(phases[0].tasks.map((task: any) => task.tool)).toContain('scaffold_full_stack');
    });

    it('rejects scaffold_project with an empty structure before execution', () => {
        expect(plannedArgsIssue('scaffold_project', { structure: {} })).toMatch(/structure كائناً غير فارغاً/);
    });

    it('turns a blocked scaffold phase into an explicit planning blocker, not a fallback document', () => {
        const result = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Repository Inspection and Initial Setup',
            tasks: [{ task: 'Create the project structure', tool: 'scaffold_project', args: { structure: {} } }],
        }], 'NEXUS', { disallowImplicitScaffold: true });
        expect(result.blocker?.code).toBe('scaffold_project_contract_invalid');
        expect(result.phases[0].deliveryStatus).toBe('blocked');
        expect(result.phases[0].tasks).toEqual([]);
        expect(result.phases[0].tasks.some((task: any) => task.tool === 'write_file')).toBe(false);
        expect(result.notes.join('\n')).toMatch(/أوقفتُ المرحلة/);
    });

    it('does not hide an implicit scaffold behind a fallback document', () => {
        const result = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Choose an implementation stack',
            tasks: [{ task: 'Create the project structure', tool: 'scaffold_project', args: { structure: { 'README.md': '# NEXUS' } } }],
        }], 'NEXUS', { disallowImplicitScaffold: true });
        expect(result.blocker?.code).toBe('implicit_scaffold_requires_explicit_stack');
        expect(result.phases[0].tasks).toEqual([]);
        expect(result.phases[0].tasks.some((task: any) => task.tool === 'write_file')).toBe(false);
    });
});


describe('file arguments cannot hide shell commands', () => {
    it('recognises command-like values but accepts a real relative entrypoint', () => {
        expect(isShellLikeWorkspacePath('node src/index.js')).toBe(true);
        expect(isShellLikeWorkspacePath('npm run dev')).toBe(true);
        expect(isShellLikeWorkspacePath('src/index.js')).toBe(false);
    });

    it('rejects a shell command in ai_write_file path before any file is written', () => {
        expect(plannedArgsIssue('ai_write_file', {
            path: 'node src/index.js',
            description: 'Create the application entrypoint',
        })).toMatch(/أمر shell/);
        expect(plannedArgsIssue('ai_write_file', {
            path: 'src/index.js',
            description: 'Create the application entrypoint',
        })).toBeNull();
    });

    it('drops a malformed file task during plan sanitisation', () => {
        const { phases, notes } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Create runnable entrypoint',
            tasks: [{
                task: 'Create the entrypoint',
                tool: 'ai_write_file',
                args: { path: 'node src/index.js', description: 'Create the entrypoint' },
            }],
        }], 'local-project');
        expect(phases[0].tasks.some((task: any) => task.tool === 'ai_write_file')).toBe(false);
        expect(notes.join('\\n')).toMatch(/مساراً نسبياً آمناً|أمر shell|لا تتضمن أدوات قابلة للتنفيذ/);
    });
});

describe('auto_tester receives a closed, evidence-safe contract', () => {
    it('adapts common planner aliases into the explicit test contract', () => {
        expect(adaptPlannedArgs('auto_tester', {
            type: 'syntax',
            path: 'src',
            files: ['src/index.js'],
        })).toMatchObject({
            testType: 'syntax',
            projectPath: 'src',
            files: ['src/index.js'],
        });
    });

    it('rejects a planned test with no real type before it reaches the tool', () => {
        expect(plannedArgsIssue('auto_tester', { projectPath: '.', files: ['src/index.js'] })).toMatch(/testType/);
    });

    it('rejects a syntax test that names no evidenced source files', () => {
        expect(plannedArgsIssue('auto_tester', { testType: 'syntax', projectPath: '.' })).toMatch(/files/);
    });

    it('drops an incomplete test task instead of producing Unknown test type: undefined', () => {
        const { phases, notes } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Verify implementation',
            tasks: [{ task: 'Run automated tests', tool: 'auto_tester', args: { projectPath: '.' } }],
        }], 'local project');
        expect(phases[0].tasks.some((task: any) => task.tool === 'auto_tester')).toBe(false);
        expect(notes.join('\n')).toMatch(/testType/);
    });

    it('does not treat a package script as evidence for unit tests', () => {
        const { phases, notes } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Verify implementation',
            tasks: [{ task: 'Run unit tests', tool: 'auto_tester', args: { testType: 'unit', projectPath: '.' } }],
            verificationTask: { task: 'Verify with unit tests', tool: 'auto_tester', args: { testType: 'unit', projectPath: '.' } },
        }], 'NEXUS', { candidateCheckCommands: ['npm test'] });
        expect(phases[0].tasks.some((task: any) => task.tool === 'auto_tester')).toBe(false);
        expect(phases[0].verificationTask).toBeUndefined();
        expect(notes.join('\n')).toMatch(/scripts وحدها ليست دليلاً|لا يوجد ملف اختبار مثبت/);
    });

    it('keeps unit tests when discovery provides a real test file', () => {
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Verify implementation',
            tasks: [{ task: 'Run unit tests', tool: 'auto_tester', args: { testType: 'unit', projectPath: '.' } }],
            verificationTask: { task: 'Verify with unit tests', tool: 'auto_tester', args: { testType: 'unit', projectPath: '.' } },
        }], 'NEXUS', { testFiles: ['src/__tests__/app.test.ts'], candidateCheckCommands: ['npm test'] });
        expect(phases[0].tasks.some((task: any) => task.tool === 'auto_tester')).toBe(true);
        expect(phases[0].verificationTask?.tool).toBe('auto_tester');
    });

    it('keeps unit tests after a prior test_generator task with evidenced source', () => {
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Generate and run tests',
            tasks: [
                { task: 'Generate tests', tool: 'test_generator', args: { filePath: 'src/app.ts' } },
                { task: 'Run generated tests', tool: 'auto_tester', args: { testType: 'unit', projectPath: '.' } },
            ],
        }], 'NEXUS', { evidencedPaths: ['src/app.ts'], candidateCheckCommands: ['npm test'] });
        expect(phases[0].tasks.some((task: any) => task.tool === 'test_generator')).toBe(true);
        expect(phases[0].tasks.some((task: any) => task.tool === 'auto_tester')).toBe(true);
    });
});

describe('manifest-backed local verification commands', () => {
    const shellPhase = (command: string) => ({
        phaseNumber: 1,
        name: 'Verify local project',
        tasks: [{ task: `Run ${command}`, tool: 'shell_execute', args: { command } }],
        verificationTask: { task: `Verify ${command}`, tool: 'shell_execute', args: { command } },
    });

    it('drops an assumed npm test rather than running it in a workspace with no declared script', () => {
        const { phases, notes } = sanitisePlanPhases([shellPhase('npm test')], 'empty-workspace', {
            candidateCheckCommands: [],
        });
        expect(phases[0].tasks.some((task: any) => task.tool === 'shell_execute')).toBe(false);
        expect(notes.join('\n')).toMatch(/ليس فحصاً معلناً/);
        expect(phases[0].verificationTask.tool).toBe('project_detect');
    });

    it('keeps an exact check declared by inspected package metadata', () => {
        const { phases } = sanitisePlanPhases([shellPhase('npm run test')], 'inspected-node-project', {
            candidateCheckCommands: ['npm run test'],
        });
        expect(phases[0].tasks.some((task: any) => task.tool === 'shell_execute' && task.args.command === 'npm run test')).toBe(true);
        expect(phases[0].verificationTask).toMatchObject({ tool: 'shell_execute', args: { command: 'npm run test' } });
    });
});


describe('portable stack policy for greenfield plans', () => {
    const nativePhase = {
        phaseNumber: 1,
        name: 'Portable data layer',
        tasks: [{
            task: 'Install better-sqlite3 for the application data layer',
            tool: 'npm_manager',
            args: { command: 'install', packages: ['better-sqlite3'], dev: false },
        }],
    };

    it('blocks an unportable native addon before npm_manager can mutate the workspace', () => {
        const result = sanitisePlanPhases([nativePhase], 'new-console', {
            disallowUnportableNativeDependencies: true,
        });
        expect(result.blocker).toMatchObject({ code: 'unportable_native_dependency' });
        expect(result.executableTasks).toBe(0);
        expect(result.notes.join('\n')).toMatch(/better-sqlite3/);
    });

    it('does not reject a native dependency merely because an existing project declares it', () => {
        const result = sanitisePlanPhases([nativePhase], 'existing-console', {
            disallowUnportableNativeDependencies: false,
        });
        expect(result.blocker?.code).not.toBe('unportable_native_dependency');
        expect(result.phases[0].tasks.some((task: any) => task.tool === 'npm_manager')).toBe(true);
    });

    it('blocks a native install hidden inside shell_execute and points to npm_manager', () => {
        const result = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Dependencies',
            tasks: [{
                task: 'Install express and sqlite3',
                tool: 'shell_execute',
                args: { command: 'npm install express sqlite3' },
            }],
        }], 'existing-console', { disallowUnportableNativeDependencies: false });
        expect(result.blocker).toMatchObject({ code: 'native_dependency_requires_npm_manager' });
        expect(result.blocker?.remedy).toMatch(/npm_manager/);
        expect(result.executableTasks).toBe(0);
    });
});



describe('runnable evidence is earned, not inferred from a generated manifest', () => {
    it('does not run a fresh monorepo wrapper before dependencies are installed', () => {
        const phase = {
            phaseNumber: 1,
            name: 'Foundation and Architecture',
            tasks: [
                {
                    task: 'Create the workspace wrapper',
                    tool: 'write_file',
                    args: {
                        path: 'NEXUS/package.json',
                        content: JSON.stringify({ name: 'nexus', scripts: { dev: 'concurrently "npm --prefix backend run dev" "npm --prefix frontend run dev"' } }),
                    },
                },
                {
                    task: 'Create backend entry point',
                    tool: 'write_file',
                    args: { path: 'NEXUS/backend/src/index.js', content: 'console.log("nexus")' },
                },
            ],
            verificationTask: { task: 'Start the live project', tool: 'project_run', args: {} },
        };
        const { phases, notes } = sanitisePlanPhases([phase], 'NEXUS');
        expect(phases[0].verificationTask.tool).toBe('read_file');
        expect(notes.join('\n')).toMatch(/تشغيلاً حياً قبل إنتاج artifact قابل للتشغيل/);
    });

    it('accepts a generated manifest only after a launch script and install step are explicit', () => {
        const phase = {
            phaseNumber: 1,
            name: 'Runnable foundation',
            tasks: [
                {
                    task: 'Write the service manifest',
                    tool: 'write_file',
                    args: {
                        path: 'NEXUS/package.json',
                        content: JSON.stringify({ name: 'nexus', scripts: { start: 'node server.js' } }),
                    },
                },
                { task: 'Install project dependencies', tool: 'npm_manager', args: { command: 'install', cwd: 'NEXUS' } },
                { task: 'Write the server entry point', tool: 'write_file', args: { path: 'NEXUS/server.js', content: 'console.log("nexus")' } },
            ],
            verificationTask: { task: 'Start the live project', tool: 'project_run', args: {} },
        };
        const { phases } = sanitisePlanPhases([phase], 'NEXUS');
        expect(phases[0].verificationTask.tool).toBe('project_run');
    });
});


describe('required tool fields are validated before phase execution', () => {
    it('blocks auth_builder when outputDir is missing', () => {
        expect(plannedArgsIssue('auth_builder', { type: 'full' })).toMatch(/outputDir/);
    });

    it('accepts auth_builder when all required fields are present', () => {
        expect(plannedArgsIssue('auth_builder', { type: 'full', outputDir: 'src/auth' })).toBeNull();
    });

    it('sanitises an incomplete auth_builder task instead of executing it', () => {
        const result = sanitisePlanPhases([{
            phaseNumber: 1,
            name: 'Authentication foundation',
            tasks: [{ task: 'Generate authentication', tool: 'auth_builder', args: { type: 'full' } }],
        }], 'nexus', { mode: 'greenfield' });
        expect(result.phases[0].tasks).toHaveLength(0);
        expect(result.notes.join('\\n')).toMatch(/outputDir/);
    });
});
