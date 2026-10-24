import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { hasExplicitRecordSchema } from '../core/design/app-blueprints';

const testCases = [
    {
        name: 'TypeScript CLI with CSV',
        input: 'Create a simple Node.js command-line tool in TypeScript that reads a CSV file with columns name,email,age and outputs a JSON array of objects. The tool should accept the CSV file path as a command-line argument and write the JSON to stdout. Include a package.json with a build script (tsc) and a start script (node dist/index.js). Do not create a web app or React frontend.',
        expectedScope: 'page', // CLI should be treated as page (file-level)
        expectedSchema: false,
    },
    {
        name: 'CLI tool with CSV columns',
        input: 'Create a CLI tool that reads CSV with columns task_name,estimated_minutes,actual_minutes and outputs JSON',
        expectedScope: 'page',
        expectedSchema: false,
    },
    {
        name: 'Web app with login',
        input: 'Build a web app with user login and dashboard',
        // A login is a declared server claim: a sign-in with no server behind
        // it is fake (CLAUDE.md law 2). Pinned 'app' by snapshot b906f3bc.
        expectedScope: 'system',
        expectedSchema: false,
    },
    {
        name: 'POS inventory system',
        input: 'Create a POS inventory system with products table',
        expectedScope: 'system', // POS is a system (backend + frontend), not a web app
        expectedSchema: false,
    },
{
        name: 'RUN25 exact prompt',
        input: 'Create a simple Node.js command-line tool in TypeScript that reads a CSV file with columns name,email,age and outputs a JSON array of objects. The tool should accept the CSV file path as a command-line argument and write the JSON to stdout. Include a package.json with a "build" script (tsc) and a "start" script (node dist/index.js). Do not create a web app or React frontend.',
        expectedScope: 'page',
        expectedSchema: false,
    },
];

describe('CLI routing fix', () => {
    for (const tc of testCases) {
        it(`should classify "${tc.name}" as ${tc.expectedScope}`, () => {
            const scope = PlanningEngine.classifyBuildScope(tc.input);
            expect(scope).toBe(tc.expectedScope);
        });

        it(`should haveExplicitRecordSchema return ${tc.expectedSchema} for "${tc.name}"`, () => {
            const hasSchema = hasExplicitRecordSchema(tc.input);
            expect(hasSchema).toBe(tc.expectedSchema);
        });
    }
});