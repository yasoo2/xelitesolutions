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
import { resolvePlannedTool, sanitisePlanPhases, unrunnableShellStep, plannerToolPrompt, plannedArgsIssue, adaptPlannedArgs } from '../core/orchestrator/plan-tools';

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

    it('the verification step falls back to something that can actually verify', () => {
        const { phases } = sanitisePlanPhases([phase1], 'E-commerce Platform');
        expect(phases[0].verificationTask.tool).toBe('project_detect');
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

    it('drops the invalid migration task before PhaseExecutor can emit Unsupported action', () => {
        const { phases, notes } = sanitisePlanPhases([invalidMigrationPhase], 'warehouse-console');
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['write_file']);
        expect(notes.join('\n')).toMatch(/db_schema_migrator يحتاج action/);
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
});
