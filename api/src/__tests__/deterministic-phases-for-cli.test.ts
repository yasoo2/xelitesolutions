import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { hasExplicitRecordSchema } from '../core/design/app-blueprints';

describe('deterministicPhasesFor CLI routing', () => {
    const cliRequests = [
        {
            request: 'Create a simple Node.js CLI tool that reads a JSON file containing an array of objects, filters them by a given property value, and outputs the filtered results to stdout. The tool should accept two command-line arguments: the path to the JSON file and the property value to filter by (format: property=value). Include a sample JSON file and a README.',
            expectedEntryPoint: 'src/index.ts',
        },
        {
            request: 'Create a simple Node.js command-line tool in TypeScript that reads a CSV file with columns name,email,age and outputs a JSON array of objects. The tool should accept the CSV file path as a command-line argument and write the JSON to stdout. Include a package.json with a build script (tsc) and a start script (node dist/index.js). Do not create a web app or React frontend.',
            expectedEntryPoint: 'src/index.ts',
        },
        {
            request: 'Build a Python command-line tool that reads a local JSON file and prints matching entries to stdout. No website or browser interface.',
            expectedEntryPoint: 'main.py',
        },
    ];

    const landingPageRequests = [
        'Build a modern restaurant landing page with a menu and contact section.',
    ];

    const webAppRequests = [
        'Build a web app with user login and dashboard',
    ];

    const storedWebRequests = [
        'Build a web application to create, edit and delete inventory records with name, price and quantity and persist them in a database.',
    ];

    const posRequests = [
        'Create a POS inventory system with products table',
    ];

    it.each(cliRequests)('routes CLI request to scaffold_project: %s', async ({ request, expectedEntryPoint }) => {
        const scope = PlanningEngine.classifyBuildScope(request);
        const hasSchema = hasExplicitRecordSchema(request);
        const phases = deterministicPhasesFor(request);
        
        expect(scope).toBe('page');
        expect(hasSchema).toBe(false);
        expect(phases).not.toBeNull();
        expect(phases?.phases[0]?.tasks[0]?.tool).toBe('scaffold_project');
        expect(phases?.phases[0]?.name).toBe('CLI Scaffold');
        expect(phases?.phases[0]?.tasks[0]?.args?.structure).toBeDefined();
        expect(phases?.phases[0]?.tasks[0]?.args?.structure?.['package.json']).toBeDefined();
        expect(phases?.phases[0]?.tasks[0]?.args?.structure?.[expectedEntryPoint]).toBeDefined();
    });

    it.each(landingPageRequests)('routes landing page to web_page_builder: %s', async (request) => {
        const scope = PlanningEngine.classifyBuildScope(request);
        const hasSchema = hasExplicitRecordSchema(request);
        const phases = deterministicPhasesFor(request);
        
        expect(scope).toBe('page');
        expect(hasSchema).toBe(false);
        expect(phases).not.toBeNull();
        expect(phases?.phases[0]?.tasks[0]?.tool).toBe('web_page_builder');
    });

    // A login and a database are declared server claims: a sign-in or a
    // «database» kept in the browser would be fake (CLAUDE.md law 2). These two
    // were pinned to a front end alone by snapshot b906f3bc.
    it.each(webAppRequests)('routes a web app with a login to its own service first: %s', async (request) => {
        const scope = PlanningEngine.classifyBuildScope(request);
        const hasSchema = hasExplicitRecordSchema(request);
        const phases = deterministicPhasesFor(request);

        expect(scope).toBe('system');
        expect(hasSchema).toBe(false);
        expect(phases).not.toBeNull();
        expect(phases?.phases[0]?.tasks[0]?.tool).toBe('api_project');
        expect(phases?.phases[1]?.tasks[0]?.tool).toBe('react_project');
    });

    it.each(storedWebRequests)('routes a request that persists to a database to its own service first: %s', async (request) => {
        const scope = PlanningEngine.classifyBuildScope(request);
        const hasSchema = hasExplicitRecordSchema(request);
        const phases = deterministicPhasesFor(request);

        expect(scope).toBe('system');
        expect(hasSchema).toBe(true);
        expect(phases).not.toBeNull();
        expect(phases?.phases[0]?.tasks[0]?.tool).toBe('api_project');
        expect(phases?.phases[1]?.tasks[0]?.tool).toBe('react_project');
    });

    it.each(posRequests)('routes POS request to system: %s', async (request) => {
        const scope = PlanningEngine.classifyBuildScope(request);
        const hasSchema = hasExplicitRecordSchema(request);
        const phases = deterministicPhasesFor(request);
        
        expect(scope).toBe('system');
        expect(hasSchema).toBe(false);
        expect(phases).not.toBeNull();
        expect(phases?.phases[0]?.tasks[0]?.tool).toBe('api_project');
    });
});