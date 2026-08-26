/**
 *  A DESCRIPTION STAPLED TO THE THING IT DESCRIBES.
 *
 *  Read out of a live run's own evidence file on his machine:
 *
 *      "tool": "project_edit",
 *      "input": { "request": "Surgical edit of the active project:
 *        زيد عمود الملاحظات زيد عمود الملاحظات" }
 *
 *  His message was eighteen characters — «زيد عمود الملاحظات» — read
 *  straight out of the chat store. Every project_edit step is described
 *  as «Surgical edit of the active project: ${intent.goal}», so the goal
 *  is already IN the description, and the filler then joined the
 *  description to the goal again.
 *
 *  Downstream, columnEdit read «عمود الملاحظات زيد عمود الملاحظات» and
 *  named his new column after the whole order:
 *
 *      { key: 'text4', label: 'الملاحظات زيد عمود الملاحظات' }
 *
 *  A description that already carries the goal adds nothing by being
 *  repeated. One or the other — never both.
 *
 *  This is asserted on the SOURCE, because the filler is a private step
 *  inside generatePlan with no seam a test can reach without building a
 *  whole plan around a fake registry. The property is narrow enough to
 *  read directly: no expression joins a step description to the goal.
 */
import * as fs from 'fs';
import * as path from 'path';

const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf8');

describe('the goal is never joined to a description that already contains it', () => {
    it('no expression staples the two together', () => {
        //  The exact shape that produced the doubled request. If it comes
        //  back — in any spacing — this fails.
        expect(SOURCE).not.toMatch(/`\$\{s\.description[^`]*\}\s*\$\{goal\}`/);
        expect(SOURCE).not.toMatch(/`\$\{step\.description[^`]*\}\s*\$\{goal\}`/);
    });

    it('and the guard that decides is present and reads containment', () => {
        expect(SOURCE).toContain('said.includes(goal)');
    });
});

describe('the decision itself, as a property', () => {
    //  The one line of logic, stated where it can be checked: a
    //  description that carries the goal is used alone.
    const forFilling = (said: string, goal: string): string =>
        (said && goal && said.includes(goal) ? said : `${said} ${goal}`.trim());

    it('a description that already carries the goal is used alone', () => {
        const goal = 'زيد عمود الملاحظات';
        const said = `Surgical edit of the active project: ${goal}`;
        expect(forFilling(said, goal)).toBe(said);
        //  …and the goal appears exactly once in what is handed on.
        expect(forFilling(said, goal).split(goal).length - 1).toBe(1);
    });

    it('a description that does NOT carry the goal still contributes', () => {
        //  The negative: the join exists for a reason — some steps are
        //  described in words the goal does not contain, and the filler
        //  needs both.
        const goal = 'شغّل الخادم';
        const said = 'Run the project and open the live preview';
        expect(forFilling(said, goal)).toBe(`${said} ${goal}`);
    });

    it('an empty description leaves the goal alone', () => {
        expect(forFilling('', 'زيد عمود الملاحظات')).toBe('زيد عمود الملاحظات');
    });

    it('an empty goal leaves the description alone', () => {
        expect(forFilling('Surgical edit of the active project', '')).toBe('Surgical edit of the active project');
    });
});
