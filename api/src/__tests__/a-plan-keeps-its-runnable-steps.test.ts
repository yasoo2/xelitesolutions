const mockCallLLM = jest.fn();

jest.mock('../core/llm', () => ({
    callLLM: (...args: any[]) => mockCallLLM(...args),
}));

import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { adaptPlannedArgs, REQUIRED_DEFAULTS, sanitisePlanPhases, toolExecutes } from '../core/orchestrator/plan-tools';
import { tools } from '../modules/tools/registry';

/**
 * Eval round 15, 2026-10-24 — how a model plan loses its install, test and run
 * steps between the planner's recovery and the sanitiser:
 *   - the compact greenfield recovery prompt allowed ai_write_file ONLY, so
 *     every recovered plan was file writes — «all paper» (P101);
 *   - a sqlite3 plan went to the model before the deterministic rewrite;
 *   - a phase of [quality_run, swagger_docs {}] lost its proven quality_run;
 *     a package script beside the plan's own package.json was dropped; a
 *     «cd <project> && npm test» verification became a file read;
 *   - «cd store && npm install express cors sqlite3» was dropped whole (P201).
 */
const P102 = 'Create a REST API with Node.js and Express for a private school with endpoints for students, classes, grades, input validation, proper error codes, and automated tests for every endpoint.';
const evidence = { mode: 'greenfield', referenceProjects: [], facts: [], blockers: [] } as any;
const context = { plannerRecoveryRetryDelayMs: 0, engineeringPipeline: true, requireRunnableContract: true };
const tasksOf = (phases: any[]) => phases.flatMap((phase: any) => phase.tasks || []);
const greenfield = { mode: 'greenfield', disallowUnportableNativeDependencies: true };

/** P101's shape, in English: a faithful plan whose only defect is sqlite3. */
function nativePlan(extraPhase?: any) {
    return {
        projectName: 'school-api',
        projectVibe: 'REST API',
        totalPhases: 3,
        estimatedDuration: '1 hour',
        dependencies: {},
        phases: [
            {
                phaseNumber: 1,
                name: 'Foundation',
                description: 'Express API for students, classes and grades stored with sqlite3.',
                tasks: [
                    { task: 'Write the manifest', tool: 'write_file', args: { path: 'package.json', content: JSON.stringify({ name: 'school-api', scripts: { start: 'node server.js', test: 'node --test' }, dependencies: { express: '^4.19.0', sqlite3: '^5.1.7' } }) } },
                    { task: 'Write the Express server for students, classes and grades with input validation and proper error codes', tool: 'ai_write_file', args: { path: 'server.js', description: 'Express REST API for students, classes and grades backed by sqlite3, with input validation and proper error codes.' } },
                ],
                requirementsCovered: ['students', 'classes', 'grades', 'input validation', 'proper error codes'],
            },
            ...(extraPhase ? [extraPhase] : []),
            {
                phaseNumber: 2,
                name: 'Tests',
                description: 'Automated tests for every endpoint.',
                tasks: [{ task: 'Write the endpoint tests', tool: 'ai_write_file', args: { path: 'tests/students.test.js', description: 'Automated node:test tests for every students, classes and grades endpoint.' } }],
                requirementsCovered: ['automated tests for every endpoint'],
            },
            {
                phaseNumber: 3,
                name: 'Install and run',
                description: 'Install the dependencies and start the API.',
                tasks: [
                    { task: 'Install dependencies', tool: 'npm_manager', args: { command: 'install express sqlite3' } },
                    { task: 'Start the API', tool: 'project_run', args: {} },
                ],
            },
        ],
    };
}

describe('C1 — the greenfield recovery prompt keeps runnable steps', () => {
    it('allows any registered tool, names install/test/run, and asks for an object checker', () => {
        const prompt: string = (new ProjectPlannerTool() as any).createCompactRecoveryPlanningPrompt(
            P102, 'unportable_native_dependency: sqlite3', undefined, false, false, [], evidence);
        expect(prompt).not.toMatch(/using the registered tool ai_write_file/);
        expect(prompt).not.toMatch(/Do not use scaffold_project in this recovery/);
        expect(prompt).toMatch(/keep every install, test and run step of the rejected plan/);
        expect(prompt).toMatch(/npm_manager \{"command": "install"\}/);
        expect(prompt).toMatch(/project_run/);
        expect(prompt).toContain('"verificationTask": {"task": "run the project\'s own tests", "tool": "quality_run", "args": {"tasks": ["test"]}}');
        expect(prompt).not.toContain('"verificationTask": "short verification note"');
    });
});

describe('C2 — the deterministic portability rewrite comes before the model', () => {
    beforeEach(() => mockCallLLM.mockReset());

    it('a sqlite3 plan is made portable with no model recovery, keeping its install, tests and run', async () => {
        mockCallLLM.mockResolvedValueOnce(JSON.stringify(nativePlan()));
        const result: any = await new ProjectPlannerTool().execute({ projectDescription: P102, evidence }, context);
        const logs = result.logs.join('\n');
        expect(mockCallLLM).toHaveBeenCalledTimes(1);
        expect(logs).toContain('Planner portability normalization completed before model recovery.');
        expect(result.ok).toBe(true);
        const tasks = tasksOf(result.output.phases);
        expect(JSON.stringify(result.output.phases)).not.toMatch(/\bsqlite3\b/);
        expect(tasks.find((task: any) => task.tool === 'npm_manager')?.args?.command).toBe('install express');
        expect(tasks.some((task: any) => task.tool === 'project_run')).toBe(true);
        expect(tasks.some((task: any) => String(task.args?.path || '').endsWith('tests/students.test.js'))).toBe(true);
        expect(tasks.find((task: any) => String(task.args?.path || '').endsWith('server.js'))?.args?.description).toMatch(/node:sqlite/);
    });

    it('a recovery that repeats the native dependency never replaces the original plan', async () => {
        const stillMissing = { phaseNumber: 9, name: 'Skeleton', description: 'Skeleton with no name.', tasks: [{ task: 'Create the skeleton.', tool: 'scaffold_full_stack', args: {} }] };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(nativePlan(stillMissing)))
            .mockResolvedValueOnce(JSON.stringify({ ...nativePlan(), projectName: 'replacement' }));
        const result: any = await new ProjectPlannerTool().execute({ projectDescription: P102, evidence }, context);
        const logs = result.logs.join('\n');
        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(logs).toMatch(/Planner portability normalization failed/);
        expect(logs).toContain('the recovery repeated the native dependency; the original plan stays the source of the portability rewrite.');
        expect(result.ok).toBe(false);
        expect(result.output.projectName).not.toBe('replacement');
    });

    it('the contract recovery is told which runnable steps of the rejected plan to keep', async () => {
        const firstPlan = {
            projectName: 'school-api', projectVibe: 'REST API', totalPhases: 2, estimatedDuration: '1 hour', dependencies: {},
            phases: [
                { phaseNumber: 1, name: 'Skeleton', description: 'Skeleton.', tasks: [{ task: 'Create the skeleton.', tool: 'scaffold_full_stack', args: {} }] },
                { phaseNumber: 2, name: 'Run', description: 'Run.', tasks: [{ task: 'Install dependencies', tool: 'npm_manager', args: { command: 'install' } }, { task: 'Start the API', tool: 'project_run', args: {} }] },
            ],
        };
        mockCallLLM.mockResolvedValueOnce(JSON.stringify(firstPlan)).mockResolvedValueOnce('not json');
        await new ProjectPlannerTool().execute({ projectDescription: P102, evidence }, context);
        const recoveryPrompt = String(mockCallLLM.mock.calls[1]?.[0] || '');
        expect(recoveryPrompt).toContain('Steps of the rejected plan to keep: «Install dependencies» (npm_manager), «Start the API» (project_run)');
        expect(recoveryPrompt).not.toMatch(/use file-level implementation tasks instead/);
    });
});

describe('C3 — a phase that executes something is work, at both judgements', () => {
    it('R1: [quality_run, swagger_docs {}] keeps the proven quality_run, names the dropped step, writes no document', () => {
        const { phases, notes, blocker } = sanitisePlanPhases([
            { phaseNumber: 1, name: 'Server', tasks: [
                { task: 'Write the manifest', tool: 'write_file', args: { path: 'package.json', content: '{"scripts":{"start":"node server.js","test":"node --test"}}' } },
                { task: 'Write the server', tool: 'ai_write_file', args: { path: 'server.js', description: 'Express server.' } },
            ] },
            { phaseNumber: 2, name: 'Quality', tasks: [
                { task: 'Run lint and tests', tool: 'quality_run', args: { tasks: ['lint', 'test'] } },
                { task: 'Generate Swagger API documentation', tool: 'swagger_docs', args: {} },
            ] },
        ], 'school-api', { mode: 'existing' });
        expect(phases[1].tasks.map((task: any) => task.tool)).toEqual(['quality_run']);
        expect(phases[1].deliveryStatus).not.toBe('blocked');
        expect(notes.join('\n')).toMatch(/«Generate Swagger API documentation»/);
        expect(tasksOf(phases).some((task: any) => /\/docs\//.test(String(task.args?.path || '')))).toBe(false);
        expect(blocker).toBeUndefined();
    });

    it('a builder-only phase gets no stray document', () => {
        const { phases } = sanitisePlanPhases([
            { phaseNumber: 1, name: 'Page', tasks: [{ task: 'Build the page', tool: 'web_page_builder', args: { request: 'A landing page for a bakery.' } }] },
        ], 'bakery', { mode: 'existing' });
        expect(phases[0].tasks.map((task: any) => task.tool)).toEqual(['web_page_builder']);
    });

    it('the execute reader comes from the registry\'s own sideEffects', () => {
        for (const name of ['npm_manager', 'project_run', 'shell_execute', 'quality_run']) expect(toolExecutes(name)).toBe(true);
        expect(toolExecutes('read_file')).toBe(false);
        const declared = (name: string) => (tools as any[]).find(tool => tool.name === name)?.sideEffects || [];
        expect(declared('npm_manager')).toContain('execute');
    });
});

describe('C4 — a package-script step is kept or translated, never dropped beside its manifest', () => {
    it('R3: «npm run build» and «npm test» after the plan wrote app/package.json are kept', () => {
        const { phases, notes } = sanitisePlanPhases([
            { phaseNumber: 1, name: 'App', tasks: [
                { task: 'Write the manifest', tool: 'write_file', args: { path: 'app/package.json', content: '{"scripts":{"build":"node build.js","test":"node --test"}}' } },
                { task: 'Write the server', tool: 'ai_write_file', args: { path: 'app/server.js', description: 'Server.' } },
            ] },
            { phaseNumber: 2, name: 'Build', tasks: [
                { task: 'Build it', tool: 'shell_execute', args: { command: 'npm run build' } },
                { task: 'Test it', tool: 'shell_execute', args: { command: 'npm test' } },
            ] },
        ], 'app', { mode: 'existing' });
        expect(phases[1].tasks.map((task: any) => task.args?.command)).toEqual(['npm run build', 'npm test']);
        expect(tasksOf(phases).some((task: any) => /\/docs\//.test(String(task.args?.path || '')))).toBe(false);
        expect(notes.join('\n')).not.toMatch(/«npm run build» ليس فحصاً معلناً/);
    });

    it('after a builder with no manifest path, «npm test» runs through quality_run on the bound root', () => {
        const { phases, notes } = sanitisePlanPhases([
            { phaseNumber: 1, name: 'UI', tasks: [{ task: 'Build the app', tool: 'react_project', args: { request: 'A notes app.' } }] },
            { phaseNumber: 2, name: 'Check', tasks: [{ task: 'Test it', tool: 'shell_execute', args: { command: 'npm test -- --watchAll=false' } }] },
        ], 'notes', { mode: 'existing' });
        expect(phases[1].tasks).toEqual([expect.objectContaining({ tool: 'quality_run', args: { tasks: ['test'] } })]);
        expect(notes.join('\n')).toMatch(/--watchAll=false/);
    });
});

describe('C5 — a test run in a verification becomes quality_run, in the pre-prefix shape', () => {
    const phase = (command: string) => [{
        phaseNumber: 1, name: 'API and tests',
        tasks: [
            { task: 'Write the manifest', tool: 'write_file', args: { path: 'package.json', content: '{"scripts":{"start":"node server.js","test":"node --test"}}' } },
            { task: 'Write the tests', tool: 'ai_write_file', args: { path: 'tests/patients.test.js', description: 'Tests.' } },
        ],
        verificationTask: { task: 'Run the tests', tool: 'shell_execute', args: { command } },
    }];

    it('R2 (P101): «cd dental-clinic-api && npm test -- --passWithNoTests» → quality_run on the project, the flag named and not carried', () => {
        const { phases, notes } = sanitisePlanPhases(phase('cd dental-clinic-api && npm test -- --passWithNoTests'), 'dental-clinic-api', { mode: 'greenfield' });
        expect(phases[0].verificationTask).toMatchObject({ tool: 'quality_run', args: { path: 'dental-clinic-api', tasks: ['test'] } });
        expect(notes.join('\n')).toMatch(/--passWithNoTests/);
    });

    it('controls: a cd out of the workspace, or into a folder with no manifest, is not translated', () => {
        for (const command of ['cd ../other && npm test', 'cd somewhere-else && npm test']) {
            const { phases } = sanitisePlanPhases(phase(command), 'dental-clinic-api', { mode: 'greenfield' });
            expect(phases[0].verificationTask?.tool).not.toBe('quality_run');
        }
    });
});

describe('C6 — an install is repaired in place; only an unrepairable executing step blocks', () => {
    it('P201: «cd store && npm install express cors sqlite3» keeps express and cors, and the plan is not blocked', () => {
        const { phases, notes, blocker } = sanitisePlanPhases([{
            phaseNumber: 1, name: 'Store backend',
            tasks: [
                { task: 'Write the manifest', tool: 'write_file', args: { path: 'store/package.json', content: '{"scripts":{"start":"node server.js"},"dependencies":{"express":"^4.19.0","cors":"^2.8.5"}}' } },
                { task: 'Write the server', tool: 'ai_write_file', args: { path: 'store/server.js', description: 'Express server for the store.' } },
                { task: 'Install backend dependencies', tool: 'shell_execute', args: { command: 'cd store && npm install express cors sqlite3' } },
            ],
        }], 'dental-clinic-store', greenfield);
        expect(blocker).toBeUndefined();
        expect(phases[0].tasks.find((task: any) => task.tool === 'shell_execute')?.args?.command).toBe('cd store && npm install express cors');
        expect(notes.join('\n')).toMatch(/أزلتُ sqlite3 من التثبيت/);
    });

    it('npm_manager names the addon in its command or packages: repaired, not blocked', () => {
        const { phases, blocker } = sanitisePlanPhases([{
            phaseNumber: 1, name: 'Backend',
            tasks: [
                { task: 'Write the manifest', tool: 'write_file', args: { path: 'package.json', content: '{"scripts":{"start":"node server.js"},"dependencies":{"express":"^4.19.0"}}' } },
                { task: 'Install', tool: 'npm_manager', args: { command: 'install express sqlite3' } },
                { task: 'Install more', tool: 'npm_manager', args: { command: 'install', packages: ['cors', 'bcrypt'] } },
            ],
        }], 'api', greenfield);
        expect(blocker).toBeUndefined();
        const installs = phases[0].tasks.filter((task: any) => task.tool === 'npm_manager');
        expect(installs.map((task: any) => task.args.command)).toEqual(['install express', 'install']);
        expect(installs[1].args.packages).toEqual(['cors']);
    });

    it('an executing step lost with no repair beside a runnable artifact becomes a named plan blocker; npm_manager {} beside a page does not', () => {
        const lost = sanitisePlanPhases([{
            phaseNumber: 1, name: 'Ship',
            tasks: [
                { task: 'Write the manifest', tool: 'write_file', args: { path: 'package.json', content: '{"scripts":{"start":"node server.js"}}' } },
                { task: 'Write the server', tool: 'ai_write_file', args: { path: 'server.js', description: 'Server.' } },
                { task: 'Containerise it', tool: 'docker_manager', args: {} },
            ],
        }], 'api', { mode: 'existing' });
        expect(lost.blocker?.code).toBe('tool_contract_invalid');
        expect(lost.blocker?.message).toMatch(/«Containerise it» \(docker_manager\)/);
        const page = sanitisePlanPhases([{
            phaseNumber: 1, name: 'Page',
            tasks: [
                { task: 'Write the page', tool: 'ai_write_file', args: { path: 'index.html', description: 'A page.' } },
                { task: 'Install packages', tool: 'npm_manager', args: {} },
            ],
        }], 'page', { mode: 'existing' });
        expect(page.blocker).toBeUndefined();
    });
});

describe('C7 — action → command only where the schema\'s contract says so', () => {
    it('npm_manager {action} becomes its command; project_run and terminal_manager keep their own fields', () => {
        expect(adaptPlannedArgs('npm_manager', { action: 'install' }).command).toBe('install');
        expect(adaptPlannedArgs('project_run', { action: 'start' }).command).toBeUndefined();
        expect(adaptPlannedArgs('terminal_manager', { action: 'create' }).command).toBeUndefined();
        expect(adaptPlannedArgs('npm_manager', {}).command).toBeUndefined();
    });
    it('every remaining default names a field its tool declares', () => {
        for (const [name, defaults] of Object.entries(REQUIRED_DEFAULTS)) {
            const schema = (tools as any[]).find(tool => tool.name === name)?.inputSchema;
            for (const field of Object.keys(defaults)) expect({ name, field, declared: field in (schema?.properties || {}) }).toEqual({ name, field, declared: true });
        }
    });
});

describe('the rewrite reaches scaffold structures', () => {
    it('a manifest in a structure drops the addon; native source leaves the structure for the author', () => {
        const out = (new ProjectPlannerTool() as any).rewriteUnportableNativePlan({ phases: [{ tasks: [{
            task: 'Create the skeleton', tool: 'scaffold_project',
            args: { baseDir: 'api', structure: {
                'package.json': JSON.stringify({ name: 'api', dependencies: { express: '^4.19.0', sqlite3: '^5.1.7' } }),
                'src/db.js': "const sqlite3 = require('sqlite3');",
                'src/server.js': "const express = require('express');",
            } },
        }] }] });
        const [scaffold, db] = out.phases[0].tasks;
        expect(scaffold.tool).toBe('scaffold_project');
        expect(Object.keys(scaffold.args.structure)).toEqual(['package.json', 'src/server.js']);
        expect(JSON.parse(scaffold.args.structure['package.json']).dependencies).toEqual({ express: '^4.19.0' });
        expect(db).toMatchObject({ tool: 'ai_write_file', args: { path: 'api/src/db.js' } });
        expect(JSON.stringify(out)).not.toMatch(/\bsqlite3\b/);
    });
});
