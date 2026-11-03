/**
 * THE OLD PLANNER NEVER OFFERS THE ENGINE'S OWN TOOLS.
 *
 * The engine's file tools are registered (engine_file_*) so ToolService runs
 * every action they take, and only the engine's adapters, which bind them to
 * the run's project folder, should reach them. Joe's first planner reads the
 * same registry. Measured with them registered and nothing else changed
 * (D:\Joe\eval\proof\engine\files\resume\probe-old-planner-sees-engine-tools.txt):
 * «read the file src/App.jsx and check it» ranked engine_file_read above
 * read_file, and «check the files of the engine and list them» was routed to
 * engine_file_list. Here, with the real registry: none of these requests is
 * offered, matched or routed to an engine tool, a plan cannot name one, and
 * everything the planner computes (catalogue, scores, route, capability
 * match) is exactly what it computes from the registry without them.
 */
jest.setTimeout(180_000);

const GOALS = [
    'inspect the engine file src/app.js',
    'review the search engine code',
    'افحص ملف المحرك src/app.js',
    'check the files of the engine and list them',
    'search the engine files for useState',
    'search the project files for useState',
    'read the file src/App.jsx and check it',
    'list the files in src',
    'edit the file index.html and change the title',
    'write a file named notes.txt',
    'ابحث في ملفات المشروع عن useState',
    'اقرأ الملف src/App.jsx وراجعه',
];

const isEngine = (name: unknown) => /^engine_/u.test(String(name ?? ''));
let all: any[];
beforeAll(() => {
    all = require('../modules/tools/registry').tools;
});

/** The first planner's readers, loaded fresh over the given tool list. */
function plannerOver(list: any[]) {
    let loaded: any;
    jest.isolateModules(() => {
        jest.doMock('../modules/tools/registry', () => ({ tools: list }));
        loaded = {
            catalog: require('../core/orchestrator/toolCatalog'),
            match: require('../core/orchestrator/capability-match'),
        };
    });
    return loaded;
}

function whatItSees(planner: any, goal: string) {
    const route = planner.catalog.capabilityRoute(goal, {});
    return {
        offered: planner.catalog.selectToolsFor(goal).map((s: any) => `${s.name}:${s.score}`),
        route: route ? `${route.tool}:${route.score}` : null,
        capable: planner.match.capableTools(goal).map((c: any) => `${c.name}:${c.score}`),
    };
}

describe('the engine\'s tools stay ToolService\'s, and out of the first planner\'s sight', () => {
    it('they are registered, so ToolService can run them', () => {
        expect(all.filter(t => /^engine_file_/u.test(t.name)).map(t => t.name))
            .toEqual(['engine_file_read', 'engine_file_write', 'engine_file_edit', 'engine_file_list', 'engine_file_search']);
    });

    it('no request is offered, matched or routed to one', () => {
        const { selectToolsFor, capabilityRoute } = require('../core/orchestrator/toolCatalog');
        const { capableTools } = require('../core/orchestrator/capability-match');
        const seen = GOALS.flatMap(goal => [
            ...selectToolsFor(goal).map((s: any) => s.name),
            capabilityRoute(goal, {})?.tool,
            ...capableTools(goal).map((c: any) => c.name),
        ].filter(isEngine).map(name => `${goal} → ${name}`));
        expect(seen).toEqual([]);
    });

    it('a plan cannot name one', () => {
        const { registeredToolNames } = require('../core/orchestrator/toolCatalog');
        const { resolvePlannedTool } = require('../core/orchestrator/plan-tools');
        expect(registeredToolNames().filter(isEngine)).toEqual([]);
        expect(['engine_file_read', 'engine_file_write', 'engine file edit'].map(name => resolvePlannedTool(name).tool).filter(isEngine)).toEqual([]);
    });

    it('what the planner computes is what it computes without them: the same scores, routes and matches', () => {
        const without = plannerOver(all.filter(t => !isEngine(t.name)));
        const withThem = plannerOver(all);
        for (const goal of GOALS) {
            expect([goal, whatItSees(withThem, goal)]).toEqual([goal, whatItSees(without, goal)]);
        }
    });
});
