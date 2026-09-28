/**
 * A DEAD PLANNER IS NOT A WEB PAGE.
 *
 * Measured in real Joe UI runs 16-17 (CRITICAL-REAL-JOE-UI-001): with every
 * provider unreachable, an explicit «Build a Node.js command-line tool ...»
 * request fell through the vetoed constrained-frontend plan into the
 * deterministic rescue, which planned api_project + react_project (run 17)
 * or a React browser application (run 16) — web artifacts for a terminal
 * runtime, each time. A fallback with a fixed stack decision may only fire
 * when the request is compatible with that stack: the rescue owns web and
 * data builders only, it cannot author a CLI, so for an explicit terminal
 * runtime it must refuse and let the pipeline stop honestly instead of
 * building the wrong artifact type.
 */

import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

describe('the deterministic rescue refuses an explicit terminal runtime', () => {
    it('POSITIVE — observed run-16/17 CLI shapes rescue to nothing', () => {
        for (const t of [
            'Build a Node.js command-line tool named versort that sorts semantic version strings from a file. '
                + 'Usage: `node versort.js <file>`. Each non-empty line of the file holds one version in major.minor.patch form. '
                + 'It prints the versions sorted ascending, one per line. If the file does not exist, exit with code 3.',
            'Build a Node.js command-line tool named inival that validates INI-style config files. '
                + 'Running `node inival.js --list <file>` prints the section names in order of appearance, one per line. '
                + 'If the file does not exist, exit with code 3 and print a one-line error starting with the words file not found.',
            'Build a command-line tool named mansearch that searches installed man pages for a keyword. '
                + 'It reads extra keywords from stdin, one per line, and prints matching page names to stdout.',
            'Build a console application named logtail that prints the last N lines of a log file. '
                + 'Usage: logtail --lines 50 app.log. It reads argv for the file name and line count.',
        ]) {
            expect(deterministicPhasesFor(t)).toBeNull();
        }
    });

    it('NEGATIVE — genuine web and data requests still rescue', () => {
        const web = deterministicPhasesFor('Build a simple weather dashboard using a free public API.');
        expect(web).toBeTruthy();
        expect(web?.phases.flatMap((phase: any) => phase.tasks).map((task: any) => task.tool)).toContain('react_project');

        const data = deterministicPhasesFor('Build an order management system with suppliers and stock levels.');
        expect(data).toBeTruthy();
        expect(data?.phases.flatMap((phase: any) => phase.tasks).map((task: any) => task.tool)).toEqual(
            expect.arrayContaining(['api_project', 'react_project']),
        );
    });

    it('NEGATIVE — domain words are not runtime demands', () => {
        // «exit» without «code» is not an exit-code contract; an airport
        // terminal is a building, not a runtime. Same pins as the
        // constrained-frontend veto, because both gates read one marker.
        expect(deterministicPhasesFor('Build an exit-poll results dashboard for a news site.')).toBeTruthy();
        expect(deterministicPhasesFor('Build a flight dashboard showing airport terminal gates and delays.')).toBeTruthy();
    });
});
