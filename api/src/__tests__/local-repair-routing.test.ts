import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { isRepairRequest } from '../core/intelligence/intent-classifier';
import { validatePlan } from '../core/orchestrator/adaptive-dag-planner';

// The exact measured EVAL-001 goal whose plan collapsed: capabilityPlan sliced
// it into browser_page_fix -> deploy_project, the tail became questions, and
// the run ended "done" with zero faults fixed.
const HARBORLOG_GOAL = `In workspace folder 'harborlog' sits a small marina slip tracker written by someone else. The harbor master reports two faults: (1) creating a reservation without a vessel name kills the request with a server error instead of a clean validation rejection; (2) the expired-reservations listing always comes back empty although old reservations exist. Work it yourself end to end: read the code, reproduce both faults, repair them, align the maximum reservation length with the policy in the project's own README, add a visible expired-reservations section to the web page, then prove it all works by running the project's own test suite and booting the server.`;

// Earlier EVAL-001 sibling: same class, different domain and folder.
const SHELFSPACE_GOAL = `In the workspace folder 'shelfspace' there is a small library loan tracker built by someone else. Investigate the project yourself, fix both problems, add a visible overdue section to the web page, and prove everything works by running the project's own checks and the server.`;

// Generalization: fresh domain, folder, faults and wording - still local repair.
const WAYPOINT_GOAL = `The 'waypoint' folder in my workspace holds a hiking trail app a volunteer built. Saving a trail without a distance crashes with a 500 instead of a validation message, and the completed-trails list always comes back empty. Read the code, reproduce both issues, fix them, match the difficulty labels to the project's README, and prove it by running the test suite.`;

// Genuine multi-step chains with no repair content must keep chaining.
const LINKS_REPORT_GOAL = 'check the broken links on the page then write a report file';
const FLIGHTS_GOAL = 'search the web for cheap flights then translate the summary';

const step = (id: string, tool: string) => ({ id, tool, description: tool, agent: 'Dev', input: {}, dependsOn: [] as string[] });

describe('local repair objectives own their whole sentence', () => {
    describe('isRepairRequest', () => {
        it('sees the measured repair goals', () => {
            expect(isRepairRequest(HARBORLOG_GOAL).isRepair).toBe(true);
            expect(isRepairRequest(SHELFSPACE_GOAL).isRepair).toBe(true);
        });
        it('transfers to fresh repair wording', () => {
            expect(isRepairRequest(WAYPOINT_GOAL).isRepair).toBe(true);
        });
        it('sees an Arabic repair order', () => {
            expect(isRepairRequest(`في مجلد 'دفتر' يوجد تطبيق صغير. أصلح خطأ الحفظ ثم تحقق بتشغيل الاختبارات`).isRepair).toBe(true);
        });
        it('rejects questions, builds, browsing and fault mentions without work', () => {
            expect(isRepairRequest('Why does the app crash when I click save?').isRepair).toBe(false);
            expect(isRepairRequest('Build a task tracker with projects and search').isRepair).toBe(false);
            expect(isRepairRequest('translate my landing page into Arabic').isRepair).toBe(false);
            expect(isRepairRequest('show me the error log').isRepair).toBe(false);
        });
    });

    describe('capabilityPlan whole-objective guard', () => {
        const plan = (goal: string) => PlanningEngine.capabilityPlan({ goal } as any, {});

        it('does not slice the measured repair goal into a chain', () => {
            expect(plan(HARBORLOG_GOAL)).toBeNull();
        });
        it('does not slice sibling and fresh repair goals', () => {
            expect(plan(SHELFSPACE_GOAL)).toBeNull();
            expect(plan(WAYPOINT_GOAL)).toBeNull();
        });
        it('keeps genuine multi-step chains chaining', () => {
            const links = plan(LINKS_REPORT_GOAL);
            expect(links && links.metadata.matchedBy).toBe('capability-chain');
            expect(links.steps.map((s: any) => s.tool)).toEqual(['browser_check_links', 'ai_write_file']);
            const flights = plan(FLIGHTS_GOAL);
            expect(flights && flights.metadata.matchedBy).toBe('capability-chain');
        });
        it('leaves folder goals without repair content alone', () => {
            expect(plan('In folder assets, list the images then compress them')).toBeNull();
        });
        it('leaves folder questions to the question route', () => {
            expect(plan('What files are inside folder assets?')).toBeNull();
        });
    });

    describe('validatePlan repair shape', () => {
        const repairIntent = { goal: WAYPOINT_GOAL } as any;

        it('rejects import-plus-answers as a repair plan', () => {
            const v = validatePlan([step('s1', 'import_project'), step('s2', 'central_answer')], repairIntent);
            expect(v.valid).toBe(false);
            expect(v.issues.join(' ')).toMatch(/without any investigate\/repair\/verify step/);
        });
        it('accepts a repair plan with real engineering steps', () => {
            const v = validatePlan(
                [step('s1', 'import_project'), step('s2', 'read_file'), step('s3', 'file_edit'), step('s4', 'shell_execute')],
                repairIntent
            );
            expect(v.issues.join(' ')).not.toMatch(/without any investigate\/repair\/verify step/);
        });
        it('does not flag answer-only plans for non-repair goals', () => {
            const v = validatePlan([step('s1', 'central_answer')], { goal: 'translate my landing page into Arabic' } as any);
            expect(v.issues.join(' ')).not.toMatch(/without any investigate\/repair\/verify step/);
        });
        it('keeps the existing build answer-only rule', () => {
            const v = validatePlan([step('s1', 'central_answer')], { goal: 'Build a task tracker with projects and search' } as any);
            expect(v.valid).toBe(false);
            expect(v.issues.join(' ')).toMatch(/only answer tools/);
        });
    });
});
