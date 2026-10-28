import fs from 'fs';
import path from 'path';
import {
    buildObjectIsAnApi,
    completePaperPlan,
    deterministicPhasesFor,
    planContainsUnrequestedApiBuilder,
    pythonTestCommand,
    requestDeclaresOwnBackend,
} from '../modules/tools/definitions/ProjectPipelineTool';
import { isCliRequest } from '../core/design/app-blueprints';
import { pythonExecutable } from '../core/quality/python-executable';

/**
 * Eval round 15, 2026-10-24 — three runs where the deterministic chain built
 * something other than what was asked:
 *   - P101 «واجهة برمجية REST … المرضى والمواعيد والعلاجات … واختبارات آلية»:
 *     the model planned those routes and their tests; the paper-plan rescue
 *     swapped in the stock bookings API plus an unrequested React interface,
 *     with no requested entity and no test — and it was scored a pass;
 *   - P151 «React frontend, Node backend … each staff member only sees their
 *     own records»: rescued into one frontend phase, the backend dropped;
 *   - P301 «اكتب أداة سطر أوامر بلغة Python …»: rescued into a landing page.
 */
const P101 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';
const P102 = 'Create a REST API with Node.js and Express for a private school with endpoints for students, classes, grades, input validation, proper error codes, and automated tests for every endpoint.';
const P151 = 'Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records.';
const P301 = 'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه المرضى لـعيادة أسنان، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.';
const P302 = 'Write a Python command-line tool that reads a CSV file of students for a private school, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv.';

const toolsOf = (phases: any[]) => phases.flatMap((phase: any) => (phase.tasks || []).map((task: any) => task.tool));
const write = (file: string, description = 'from the request') => ({ task: `Write ${file}`, tool: 'ai_write_file', args: { path: file, description } });

/** P101's model plan after portability normalisation: files and tests, nothing run. */
const P101_PAPER = [
    { phaseNumber: 1, name: 'Foundation & Schema Definition', tasks: [write('dental-clinic-api/package.json'), write('dental-clinic-api/src/db.ts')] },
    { phaseNumber: 2, name: 'Routes', tasks: [write('dental-clinic-api/src/server.ts'), write('dental-clinic-api/src/routes/patients.ts'), write('dental-clinic-api/src/routes/appointments.ts'), write('dental-clinic-api/src/routes/treatments.ts')] },
    { phaseNumber: 3, name: 'Tests', tasks: [write('dental-clinic-api/tests/patients.test.ts')] },
];
/** P301's model plan: six Python files in dental-cli/, nothing run. */
const P301_PAPER = [
    { phaseNumber: 1, name: 'Validation core', tasks: [write('dental-cli/config/rules.json'), write('dental-cli/src/utils.py'), write('dental-cli/src/errors.py')] },
    { phaseNumber: 2, name: 'CLI entry', tasks: [write('dental-cli/src/main.py'), write('dental-cli/README.md')] },
];

describe('what the request says the system is made of decides its phases', () => {
    it('P101/P102: an API with no interface for people gets the service and no UI phase', () => {
        for (const request of [P101, P102]) {
            expect(buildObjectIsAnApi(request)).toBe(true);
            expect(toolsOf(deterministicPhasesFor(request)!.phases)).toEqual(['api_project']);
        }
    });
    it('P151: a declared Node backend makes it a system — service, then interface', () => {
        expect(requestDeclaresOwnBackend(P151)).toBe(true);
        expect(buildObjectIsAnApi(P151)).toBe(false);
        expect(toolsOf(deterministicPhasesFor(P151)!.phases)).toEqual(['api_project', 'react_project']);
        // …and a planner plan that builds that backend is not an «unrequested» one.
        expect(planContainsUnrequestedApiBuilder(P151, [{ tasks: [{ tool: 'api_project' }, { tool: 'react_project' }] }])).toBe(false);
    });
    it('an app that consumes a public API and forbids a backend stays one frontend phase; an app using an API is not an API', () => {
        const weather = 'Create a weather web application that shows the forecast from the public Open-Meteo API, without a backend.';
        expect(requestDeclaresOwnBackend(weather)).toBe(false);
        expect(toolsOf(deterministicPhasesFor(weather)!.phases)).toEqual(['react_project']);
        expect(buildObjectIsAnApi('Build an app using an API for the weather')).toBe(false);
        expect(buildObjectIsAnApi('Build a REST API for a gym with a React dashboard')).toBe(false);
    });
    it('P301/P302: a command-line tool is a program — never a page or a React app', () => {
        // Each Arabic reading on its own: a command line with no CSV, a CSV with no «command line».
        const renamer = 'اكتب أداة سطر أوامر بلغة Python تعيد تسمية الصور في مجلد حسب تاريخ التقاطها.';
        const csvOnly = 'اكتب برنامجاً يقرأ ملف CSV فيه الموظفين ويطبع مجموع الرواتب.';
        for (const request of [renamer, csvOnly]) {
            expect(isCliRequest(request)).toBe(true);
            expect(toolsOf(deterministicPhasesFor(request)!.phases)).not.toContain('web_page_builder');
        }
        for (const request of [P301, P302]) {
            expect(isCliRequest(request)).toBe(true);
            const tools = toolsOf(deterministicPhasesFor(request)!.phases);
            expect(tools).not.toContain('web_page_builder');
            expect(tools).not.toContain('react_project');
            expect(tools).toContain('scaffold_project');
        }
    });
});

describe('a paper plan that read the request is completed, not replaced', () => {
    it('P101: the planned entities and tests stay; install and the plan\'s own tests are added', () => {
        const completed = completePaperPlan(P101, P101_PAPER, deterministicPhasesFor(P101))!;
        expect(completed).not.toBeNull();
        const paths = completed.phases.flatMap((phase: any) => (phase.tasks || []).map((task: any) => task.args?.path)).filter(Boolean);
        expect(paths).toEqual(expect.arrayContaining(['dental-clinic-api/src/routes/patients.ts', 'dental-clinic-api/src/routes/treatments.ts', 'dental-clinic-api/tests/patients.test.ts']));
        expect(toolsOf(completed.phases)).not.toContain('api_project');
        expect(toolsOf(completed.phases)).not.toContain('react_project');
        const run = completed.phases[completed.phases.length - 1];
        expect(run.tasks).toEqual([expect.objectContaining({ tool: 'npm_manager', args: { command: 'install', cwd: 'dental-clinic-api' } })]);
        expect(run.verificationTask).toMatchObject({ tool: 'quality_run', args: { path: 'dental-clinic-api', tasks: ['test'] } });
        expect(completed.reasons.join(' ')).toMatch(/writes its own tests/);
    });

    it('P301/P302: the model\'s Python files stay, with a test authored from the request and a runner the quality gate executes', () => {
        for (const request of [P301, P302]) {
            const completed = completePaperPlan(request, P301_PAPER, deterministicPhasesFor(request))!;
            expect(completed).not.toBeNull();
            const tools = toolsOf(completed.phases);
            expect(tools).not.toContain('web_page_builder');
            expect(tools).not.toContain('react_project');
            expect(tools).not.toContain('scaffold_project');
            const run = completed.phases[completed.phases.length - 1];
            expect(completed.projectDir).toBe('dental-cli');
            expect(run.tasks[0]).toMatchObject({ tool: 'ai_write_file', args: { path: 'dental-cli/test_main.py' } });
            expect(run.tasks[0].args.description).toContain(`Create its own input fixture, run \`${pythonExecutable()} src/main.py\``);
            const manifest = JSON.parse(run.tasks[1].args.content);
            expect(run.tasks[1].args.path).toBe('dental-cli/package.json');
            // The test Joe authors runs on the standard library alone (was `python -m pytest`):
            // pytest is never installed, and eval P301 failed a finished program on «No module named pytest».
            // Since round 21 that runner also fails an empty run on every Python version.
            expect(manifest.scripts).toEqual({ start: `${pythonExecutable()} src/main.py`, test: pythonTestCommand(['test_main.py'], true) });
            expect(manifest.scripts.test).not.toMatch(/pytest/);
            expect(run.verificationTask).toMatchObject({ tool: 'quality_run', args: { path: 'dental-cli', tasks: ['test'] } });
        }
    });

    it('a plan the stock engine fully covers, with no tests of its own, is still replaced; a plan with nothing to run is never completed', () => {
        const ledger = 'Build an expense tracker web application with amount, category, date and note';
        const paper = [{ phaseNumber: 1, name: 'Files', tasks: [write('ledger/package.json'), write('ledger/src/App.jsx'), write('ledger/index.html')] }];
        expect(completePaperPlan(ledger, paper, deterministicPhasesFor(ledger))).toBeNull();
        const loose = [{ phaseNumber: 1, name: 'Files', tasks: [write('src/types.ts'), write('src/budget.ts')] }];
        expect(completePaperPlan('Build a budgeting app with charts', loose, deterministicPhasesFor('Build a budgeting app with charts'))).toBeNull();
    });

    it('the wiring: the paper-plan rescue asks completePaperPlan before it substitutes, and a blocked plan is not «no planner»', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
        expect(source).toMatch(/const completed = paperOnly \? completePaperPlan\(productRequest, planPhases, rescue\) : null;\s*if \(completed\) \{/);
        expect(source).toMatch(/\} else if \(rescue\) \{\s*const reason = missingConcreteUiBuilder/);
        expect(source).toContain("the planner's plan was blocked (");
    });
});
