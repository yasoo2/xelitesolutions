/**
 * THE PLANNER DECIDES WHAT; THE PLAN ENFORCES WHEN.
 *
 * When the deterministic route was replaced by an LLM planner, one guarantee
 * left with it: an application with its own rows used to get `api_project`
 * before `react_project`, wired with an explicit dependency. Afterwards the
 * order was whatever the model happened to emit — and a live harness caught
 * it on the first run.
 *
 * The repair is deliberately NOT "force every app onto a server". A static
 * page needs none, and an interface built on someone else's API must not
 * have a new one grafted underneath it. The model keeps the decision; the
 * relation between the phases it chose is stamped afterwards, and only when
 * both sides of the relation are actually present.
 */

import { sanitisePlanPhases, stampPlanDependencies } from '../core/orchestrator/plan-tools';

const phase = (name: string, tool: string) => ({ name, tasks: [{ tool, task: name, args: {} }] });
const toolsOf = (phases: any[]) => phases.map(p => String(p.tasks?.[0]?.tool));

describe('a plan states its own dependencies', () => {
    test('an interface planned after a data service depends on it', () => {
        const out = stampPlanDependencies([phase('Data service', 'api_project'), phase('Interface', 'react_project')]);
        expect(toolsOf(out)).toEqual(['api_project', 'react_project']);
        expect(out[1].dependsOn).toContain('Data service');
    });

    test('an interface planned BEFORE its data service is reordered, not rewritten', () => {
        const notes: string[] = [];
        const out = stampPlanDependencies([phase('Interface', 'react_project'), phase('Data service', 'api_project')], notes);
        expect(toolsOf(out)).toEqual(['api_project', 'react_project']);
        expect(out[1].dependsOn).toContain('Data service');
        // The phases keep their own names and tasks; only their order changed.
        expect(out[0].name).toBe('Data service');
        expect(out[0].tasks[0].task).toBe('Data service');
        // And the move is announced — a silent rewrite is its own lie.
        expect(notes.join(' ')).toMatch(/moved ahead of the interface/);
    });

    test('a static page is never given a server it did not ask for', () => {
        const out = stampPlanDependencies([phase('Landing page', 'web_page_builder')]);
        expect(toolsOf(out)).toEqual(['web_page_builder']);
        expect(out[0].dependsOn).toBeUndefined();
        expect(out).toHaveLength(1);
    });

    test('an interface with no data phase in the plan gains no dependency', () => {
        const out = stampPlanDependencies([phase('Interface on an existing API', 'react_project')]);
        expect(out[0].dependsOn).toBeUndefined();
    });

    test('a plan of neither kind passes through untouched', () => {
        const input = [phase('Docs', 'write_file'), phase('Checks', 'shell_run')];
        expect(stampPlanDependencies(input)).toEqual(input);
    });

    test('an existing dependency is not duplicated', () => {
        const out = stampPlanDependencies([
            phase('Data service', 'api_project'),
            { ...phase('Interface', 'react_project'), dependsOn: ['Data service'] },
        ]);
        expect(out[1].dependsOn).toEqual(['Data service']);
    });

    test('and it runs on every plan the sanitiser returns, whoever wrote it', () => {
        const clean = sanitisePlanPhases([phase('Interface', 'react_project'), phase('Data service', 'api_project')], 'project');
        expect(toolsOf(clean.phases)).toEqual(['api_project', 'react_project']);
        expect(clean.phases[1].dependsOn).toContain('Data service');
    });

    test('scope repair keeps safe feature-source edits inside an existing artifact', () => {
        const clean = sanitisePlanPhases([{
            name: 'Recover wishlist capability',
            tasks: [{
                tool: 'file_edit',
                task: 'Add the wishlist feature to the existing app',
                args: { filename: 'src/features/wishlist.js', find: 'export const wishlist = [];', replace: 'export const wishlist = ["safe"];' },
            }],
        }], 'WeatherGo', {
            mode: 'existing',
            scopeRepairMode: true,
        });

        expect(clean.executableTasks).toBe(1);
        expect(clean.phases[0].tasks[0].tool).toBe('file_edit');
    });

    test('scope repair still rejects absolute and traversal source paths', () => {
        const clean = sanitisePlanPhases([{
            name: 'Unsafe repair',
            tasks: [
                { tool: 'file_edit', task: 'Absolute path', args: { filename: '/tmp/escape.js', find: 'x', replace: 'y' } },
                { tool: 'file_edit', task: 'Traversal path', args: { filename: '../escape.js', find: 'x', replace: 'y' } },
            ],
        }], 'WeatherGo', {
            mode: 'existing',
            scopeRepairMode: true,
        });

        expect(clean.executableTasks).toBe(1);
        expect(clean.phases[0].tasks[0].tool).toBe('write_file');
        expect(clean.notes.join(' ')).toMatch(/مساراً نسبياً آمناً|غير مثبت/);
    });

});
