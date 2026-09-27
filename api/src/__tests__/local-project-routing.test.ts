import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { selectToolsFor, extractLocalFolderName, isLocalFolderGoal } from '../core/orchestrator/toolCatalog';
import { hasExternalWebTarget } from '../core/intelligence/intent-classifier';

// Shortened form of the real EVAL-001 run-1 goal: a local folder to
// investigate, repair and verify. No URL anywhere in it.
const SHELFSPACE_GOAL = `In the workspace folder 'shelfspace' there is a small library loan tracker built by someone else. Investigate the project yourself, fix both problems, add a visible overdue section to the web page, and prove everything works by running the project's own checks and the server.`;

// Generalization: different domain, folder, wording - still local repair.
const BAKERY_GOAL = `The 'crumbworks' folder in my workspace holds a small bakery order site a friend wrote. Submitting an order with an empty name crashes instead of showing a validation message, and the daily totals page always shows zero. Look through the code, reproduce both faults, fix them, and verify by running the tests and starting the server.`;

// Control: a genuine external-page repair WITH a URL.
const EXTERNAL_GOAL = `The client site https://example-clinic.example.org has unreadable contrast on its booking page and tiny buttons. Measure the defects and produce a CSS patch I can hand to their developer.`;

const rankOf = (goal: string, name: string): number =>
    selectToolsFor(goal, 30).map(s => s.name).indexOf(name);

describe('local-folder goals route to workspace tools, not browser tools', () => {
    describe('extractLocalFolderName', () => {
        it('reads the folder from workspace-folder phrasing', () => {
            expect(extractLocalFolderName(SHELFSPACE_GOAL)).toBe('shelfspace');
        });
        it('reads a quoted folder named before the word folder', () => {
            expect(extractLocalFolderName(BAKERY_GOAL)).toBe('crumbworks');
        });
        it('reads an unquoted folder name', () => {
            expect(extractLocalFolderName('open folder shopfront and list its routes')).toBe('shopfront');
        });
        it('rejects URLs, domains, traversal and sentence fragments', () => {
            expect(extractLocalFolderName(EXTERNAL_GOAL)).toBe('');
            expect(extractLocalFolderName(`fix the folder 'my shop front' please`)).toBe('');
            expect(extractLocalFolderName(`open folder ../../secrets and read them`)).toBe('');
            expect(extractLocalFolderName(`check folder example.com for links`)).toBe('');
            expect(extractLocalFolderName('translate my landing page into Arabic')).toBe('');
        });
    });

    describe('isLocalFolderGoal / hasExternalWebTarget', () => {
        it('is true for folder goals without a web target', () => {
            expect(isLocalFolderGoal(SHELFSPACE_GOAL)).toBe(true);
            expect(isLocalFolderGoal(BAKERY_GOAL)).toBe(true);
        });
        it('is false when a URL or known site is present', () => {
            expect(hasExternalWebTarget(EXTERNAL_GOAL)).toBe(true);
            expect(hasExternalWebTarget('open github and find the repo')).toBe(true);
            expect(hasExternalWebTarget(SHELFSPACE_GOAL)).toBe(false);
            expect(isLocalFolderGoal(EXTERNAL_GOAL)).toBe(false);
            expect(isLocalFolderGoal('translate my landing page into Arabic')).toBe(false);
        });
    });

    describe('retrieval ranking', () => {
        it('ranks import_project above URL-required browser tools on the measured goal', () => {
            const imp = rankOf(SHELFSPACE_GOAL, 'import_project');
            const fix = rankOf(SHELFSPACE_GOAL, 'browser_page_fix');
            const auto = rankOf(SHELFSPACE_GOAL, 'browser_autofix');
            expect(imp).toBeGreaterThanOrEqual(0);
            expect(fix === -1 || imp < fix).toBe(true);
            expect(auto === -1 || imp < auto).toBe(true);
        });
        it('transfers to a paraphrased local-repair goal', () => {
            const imp = rankOf(BAKERY_GOAL, 'import_project');
            const fix = rankOf(BAKERY_GOAL, 'browser_page_fix');
            expect(imp).toBeGreaterThanOrEqual(0);
            expect(fix === -1 || imp < fix).toBe(true);
        });
        it('leaves genuine external-page goals on the browser tool', () => {
            const names = selectToolsFor(EXTERNAL_GOAL, 30).map(s => s.name);
            const fix = names.indexOf('browser_page_fix');
            expect(fix).toBeGreaterThanOrEqual(0);
            expect(fix).toBeLessThanOrEqual(2);
            const imp = names.indexOf('import_project');
            expect(imp === -1 || imp > fix).toBe(true);
        });
        it('does not touch URL-less goals that name no folder', () => {
            const names = selectToolsFor('translate my landing page into Arabic', 12).map(s => s.name);
            expect(names[0]).toBe('browser_translate');
        });
    });

    describe('fillRequiredArgs plan repair', () => {
        const browserStep = (description: string) => [{
            id: 's1',
            tool: 'browser_page_fix',
            description,
            input: { url: '' },
            dependsOn: [],
        }] as any[];

        it('reroutes a URL-less browser step to the named folder instead of asking', () => {
            const steps = browserStep(`browser_page_fix - ${SHELFSPACE_GOAL.slice(0, 60)}`);
            const result = PlanningEngine.fillRequiredArgs(steps, SHELFSPACE_GOAL, {});
            expect(result[0].tool).toBe('import_project');
            expect(result[0].input.path).toBe('shelfspace');
            expect(result[0].input.request).toBe(SHELFSPACE_GOAL);
        });
        it('reroutes on the paraphrased goal too', () => {
            const steps = browserStep(`browser_page_fix - ${BAKERY_GOAL.slice(0, 60)}`);
            const result = PlanningEngine.fillRequiredArgs(steps, BAKERY_GOAL, {});
            expect(result[0].tool).toBe('import_project');
            expect(result[0].input.path).toBe('crumbworks');
        });
        it('keeps asking honestly when no folder is named', () => {
            const steps = browserStep('browser_page_fix - fix the page');
            const result = PlanningEngine.fillRequiredArgs(steps, 'fix the page', {});
            expect(result[0].tool).toBe('central_answer');
            expect(String(result[0].input.question)).toContain('url');
        });
        it('leaves a browser step with a real URL alone', () => {
            const steps = [{
                id: 's1',
                tool: 'browser_page_fix',
                description: 'fix the client page',
                input: { url: 'https://example-clinic.example.org' },
                dependsOn: [],
            }] as any[];
            const result = PlanningEngine.fillRequiredArgs(steps, EXTERNAL_GOAL, {});
            expect(result[0].tool).toBe('browser_page_fix');
            expect(result[0].input.url).toBe('https://example-clinic.example.org');
        });
    });
});
