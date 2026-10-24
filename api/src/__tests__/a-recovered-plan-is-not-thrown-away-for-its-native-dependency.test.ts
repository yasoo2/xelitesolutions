const mockCallLLM = jest.fn();

jest.mock('../core/llm', () => ({
    callLLM: (...args: any[]) => mockCallLLM(...args),
}));

import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';

/**
 * Eval round 15, 2026-10-24.
 *
 * P151 «Build a complete full-stack system for a dental clinic …»: the first
 * plan's scaffold_full_stack had no `name` (tool_contract_invalid). The
 * bounded recovery ran 21 minutes and returned a complete plan whose only
 * defect was sqlite3 — but `clean` still held the FIRST plan's blocker, the
 * dependency rewrite is gated on `clean`, so it never ran and the recovered
 * plan was thrown away. The build ended with nothing.
 *
 * P101: the rewrite that did run turned «npm install express sqlite3» into an
 * install of five bogus packages when the command started with «cd …», and
 * would rename a literal «require('sqlite3')» into a module that cannot load.
 */
const P151 = 'Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records.';
const evidence = { mode: 'greenfield', referenceProjects: [], facts: [], blockers: [] } as any;
const context = { plannerRecoveryRetryDelayMs: 0, engineeringPipeline: true, requireRunnableContract: true };
const write = (file: string) => ({ task: `Write ${file}`, tool: 'ai_write_file', args: { path: file, description: `Write ${file}.` } });

const firstPlan = {
    projectName: 'dental-clinic',
    projectVibe: 'Full-stack clinic system',
    totalPhases: 2,
    estimatedDuration: '2 hours',
    dependencies: {},
    phases: [
        {
            phaseNumber: 1,
            name: 'Project Scaffolding & Architecture',
            description: 'Create the full-stack skeleton.',
            tasks: [{ task: 'Create full-stack project skeleton with React and Express.', tool: 'scaffold_full_stack', args: {} }],
            deliverables: ['skeleton'],
            requirementsCovered: ['skeleton'],
        },
        {
            phaseNumber: 2,
            name: 'Run',
            description: 'Run the system.',
            tasks: [{ task: 'Start the system', tool: 'project_run', args: {} }],
        },
    ],
};

function recoveredPlan(extraPhases: any[] = []) {
    return {
        projectName: 'dental-clinic',
        projectVibe: 'Full-stack clinic system',
        totalPhases: 3 + extraPhases.length,
        estimatedDuration: '2 hours',
        dependencies: {},
        phases: [
            {
                phaseNumber: 1,
                name: 'Foundation & Schema Definition',
                description: 'Node backend for patients, appointments and treatments, stored with sqlite3.',
                tasks: [
                    {
                        task: 'Write the package manifest',
                        tool: 'write_file',
                        args: { path: 'package.json', content: JSON.stringify({ name: 'dental-clinic', scripts: { start: 'node server.js', test: 'node --test' }, dependencies: { express: '^4.19.0', sqlite3: '^5.1.7' } }) },
                    },
                    {
                        task: 'Write the Express server for patients, appointments and treatments with login, roles and per-staff record ownership',
                        tool: 'ai_write_file',
                        args: { path: 'server.js', description: 'Express server using sqlite3: login with admin and staff roles; patients, appointments and treatments routes; each staff member only sees their own records.' },
                    },
                ],
                deliverables: ['package.json', 'server.js'],
                requirementsCovered: ['Node backend', 'user login with roles', 'patients', 'appointments', 'treatments', 'own records'],
            },
            ...extraPhases,
            {
                phaseNumber: 2 + extraPhases.length,
                name: 'React frontend',
                description: 'The React interface for patients, appointments and treatments.',
                tasks: [{ task: 'Write the React application', tool: 'ai_write_file', args: { path: 'src/App.jsx', description: 'React frontend with login and the patients, appointments and treatments screens.' } }],
                deliverables: ['src/App.jsx'],
                requirementsCovered: ['React frontend'],
            },
            {
                phaseNumber: 3 + extraPhases.length,
                name: 'Install and run',
                description: 'Install the dependencies and start the system.',
                tasks: [
                    { task: 'Install dependencies', tool: 'npm_manager', args: { command: 'install express sqlite3' } },
                    { task: 'Start the system', tool: 'project_run', args: {} },
                ],
            },
        ],
    };
}

describe('a recovered plan whose only defect is a native dependency is made portable, not discarded', () => {
    beforeEach(() => mockCallLLM.mockReset());

    it('P151: a first plan blocked on a missing field, a recovery that repeats sqlite3 → the recovery is kept, portable and runnable', async () => {
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(firstPlan))
            .mockResolvedValueOnce(JSON.stringify(recoveredPlan()));

        const result: any = await new ProjectPlannerTool().execute({ projectDescription: P151, evidence }, context);
        const logs = result.logs.join('\n');

        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(logs).toMatch(/tool_contract_invalid detected; starting one bounded contract recovery/);
        expect(logs).toContain('Planner portability normalization completed after bounded model recovery failed.');
        expect(result.ok).toBe(true);
        const phases = JSON.stringify(result.output.phases);
        expect(phases).not.toMatch(/\bsqlite3\b/);
        expect(phases).toContain('server.js');
        expect(phases).toContain('src/App.jsx');
        const tasks = result.output.phases.flatMap((phase: any) => phase.tasks || []);
        expect(tasks.find((task: any) => task.tool === 'npm_manager')?.args?.command).toBe('install express');
        const manifest = tasks.find((task: any) => String(task.args?.path || '').endsWith('package.json'));
        expect(JSON.parse(manifest.args.content).dependencies).toEqual({ express: '^4.19.0' });
    });

    it('a recovered plan with sqlite3 AND a still-missing required field stays blocked', async () => {
        const stillMissing = {
            phaseNumber: 2,
            name: 'Skeleton',
            description: 'A second skeleton step that still omits its name.',
            tasks: [{ task: 'Create the full-stack skeleton.', tool: 'scaffold_full_stack', args: {} }],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(firstPlan))
            .mockResolvedValueOnce(JSON.stringify(recoveredPlan([stillMissing])));

        const result: any = await new ProjectPlannerTool().execute({ projectDescription: P151, evidence }, context);

        expect(result.ok).toBe(false);
        expect(result.logs.join('\n')).toMatch(/Planner portability normalization failed/);
    });
});

describe("the no-artifact recovery hands the rewrite the model's own tasks", () => {
    beforeEach(() => mockCallLLM.mockReset());

    it('a documents-only first plan, a recovery that repeats sqlite3 → the rewrite reads the raw recovered plan, not its blocked sanitised phases', async () => {
        const docsOnly = {
            projectName: 'dental-clinic',
            projectVibe: 'Full-stack clinic system',
            totalPhases: 1,
            estimatedDuration: '1 hour',
            dependencies: {},
            phases: [{ phaseNumber: 1, name: 'Notes', description: 'Architecture notes.', tasks: [write('README.md')] }],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(docsOnly))
            .mockResolvedValueOnce(JSON.stringify(recoveredPlan()));

        // No runnable-contract demand, so the documents-only plan reaches the
        // no-artifact recovery rather than the contract recovery.
        const result: any = await new ProjectPlannerTool().execute({ projectDescription: P151, evidence }, { plannerRecoveryRetryDelayMs: 0, engineeringPipeline: true });
        const logs = result.logs.join('\n');

        expect(logs).toMatch(/retained no non-document implementation artifact after contract sanitisation/);
        expect(logs).toContain('Planner portability normalization completed before model recovery.');
        expect(result.ok).toBe(true);
        expect(JSON.stringify(result.output.phases)).not.toMatch(/\bsqlite3\b/);
        // The server is a TASK of the kept plan, not only a deliverable label
        // left on a phase the sanitiser emptied.
        const paths = result.output.phases.flatMap((phase: any) => (phase.tasks || []).map((task: any) => String(task.args?.path || '')));
        expect(paths.some((file: string) => file.endsWith('server.js'))).toBe(true);
    });
});

describe('scope recovery gets the same rewrite', () => {
    beforeEach(() => mockCallLLM.mockReset());

    it('an under-scoped first plan, a scope recovery that repeats sqlite3 → the recovery is made portable and accepted', async () => {
        const backendOnly = {
            projectName: 'dental-clinic',
            projectVibe: 'Full-stack clinic system',
            totalPhases: 1,
            estimatedDuration: '1 hour',
            dependencies: {},
            phases: [{
                phaseNumber: 1,
                name: 'Backend',
                description: 'Node backend for patients, appointments and treatments.',
                tasks: [
                    { task: 'Write the package manifest', tool: 'write_file', args: { path: 'package.json', content: JSON.stringify({ name: 'dental-clinic', scripts: { start: 'node server.js' }, dependencies: { express: '^4.19.0' } }) } },
                    { task: 'Write the Express server for patients, appointments and treatments', tool: 'ai_write_file', args: { path: 'server.js', description: 'Express server for patients, appointments and treatments.' } },
                    { task: 'Install dependencies', tool: 'npm_manager', args: { command: 'install' } },
                ],
                requirementsCovered: ['Node backend', 'patients', 'appointments', 'treatments'],
            }],
        };
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify(backendOnly))
            .mockResolvedValueOnce(JSON.stringify(recoveredPlan()));

        const result: any = await new ProjectPlannerTool().execute({ projectDescription: P151, evidence }, context);
        const logs = result.logs.join('\n');

        expect(logs).toMatch(/scope coverage insufficient; starting scope-aware recovery attempt 1/);
        expect(logs).toContain('Planner scope recovery: portability normalization applied to the recovered plan.');
        expect(result.ok).toBe(true);
        expect(JSON.stringify(result.output.phases)).not.toMatch(/\bsqlite3\b/);
        expect(JSON.stringify(result.output.phases)).toContain('src/App.jsx');
    });
});

describe('the dependency rewrite keeps every step runnable', () => {
    const rewrite = (plan: any) => (new ProjectPlannerTool() as any).rewriteUnportableNativePlan(plan);

    it('a shell install keeps «npm» and its other packages; npm_manager keeps its bare subcommand', () => {
        const out = rewrite({ phases: [{ tasks: [
            { tool: 'shell_execute', args: { command: 'cd dental-clinic-api && npm install express sqlite3' } },
            { tool: 'shell_execute', args: { command: 'npm install sqlite3 cors' } },
            { tool: 'npm_manager', args: { command: 'install sqlite3 express' } },
        ] }] });
        const commands = out.phases[0].tasks.map((task: any) => task.args.command);
        expect(commands).toEqual(['cd dental-clinic-api && npm install express', 'npm install cors', 'install express']);
    });

    it('literal source importing a native addon is handed to the author with the portable contract, never renamed into a broken require', () => {
        const out = rewrite({ phases: [{ tasks: [
            { task: 'Write the sqlite3 data layer', tool: 'write_file', args: { path: 'src/db.js', content: "const sqlite3 = require('sqlite3');\nmodule.exports = new sqlite3.Database('clinic.db');" } },
            { tool: 'write_file', args: { path: 'src/util.js', content: 'module.exports = 1;' } },
        ] }] });
        const [db, util] = out.phases[0].tasks;
        expect(db.tool).toBe('ai_write_file');
        expect(db.args.path).toBe('src/db.js');
        expect(db.args.description).toMatch(/node:sqlite \(DatabaseSync/);
        expect(JSON.stringify(db)).not.toMatch(/\bsqlite3\b/);
        expect(db.args.content).toBeUndefined();
        expect(util).toEqual({ tool: 'write_file', args: { path: 'src/util.js', content: 'module.exports = 1;' } });
    });
});
