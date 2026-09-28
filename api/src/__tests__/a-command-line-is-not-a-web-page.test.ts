/**
 * A COMMAND LINE IS NOT A WEB PAGE.
 *
 * Observed in real Joe UI run 16 (CRITICAL-REAL-JOE-UI-001): asked to «Build
 * a Node.js command-line tool named versort ... in major.minor.patch form»,
 * Joe planned a React browser application without ever consulting a provider.
 * The constrained-frontend outage fallback fired on «Build» plus the everyday
 * word «form» (shape, not an HTML form) and hijacked an explicit CLI request.
 *
 * A fallback with a fixed stack decision may only fire when the request is
 * compatible with that stack. Explicit terminal-runtime demands veto it, so
 * the pipeline either gets a real model plan or stops honestly instead of
 * building the wrong artifact type.
 */
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';

const planFor = (request: string) =>
    (new ProjectPlannerTool() as any).constrainedFrontendPlan(request, undefined);

describe('an explicit terminal runtime vetoes the constrained frontend plan', () => {
    it('refuses the observed run-16 shape: command-line tool plus the word form', () => {
        const versort = 'Build a Node.js command-line tool named versort that sorts semantic version strings from a file. '
            + 'Usage: `node versort.js <file>`. Each non-empty line of the file holds one version in major.minor.patch form. '
            + 'It prints the versions sorted ascending, one per line. If the file does not exist, exit with code 3.';
        expect(planFor(versort)).toBeNull();
    });

    it('refuses fresh CLI variants that carry other everyday trigger words', () => {
        // «page» as in manual pages, stdin plus an exit code.
        expect(planFor(
            'Build a command-line tool named mansearch that searches installed man pages for a keyword. '
            + 'It reads extra keywords from stdin, one per line, and prints matching page names. '
            + 'If nothing matches, exit with code 3 and print one line starting with no match.',
        )).toBeNull();
        // «app» inside an explicit console application.
        expect(planFor(
            'Build a console application named logtail that prints the last N lines of a log file. '
            + 'Usage: logtail --lines 50 app.log. It reads argv for the file name and line count.',
        )).toBeNull();
        // «form» as in data shape over stdin, terminal-based.
        expect(planFor(
            'Build a terminal-based CSV reporter named csvsum. Each record arrives in comma-separated form over stdin. '
            + 'It prints column totals, one per line. Malformed rows go to stderr.',
        )).toBeNull();
        // «converter» plus a backticked node usage signature, no other marker.
        expect(planFor(
            'Build a Node.js CSV-to-JSON converter named csv2json. Usage: `node csv2json.js <file>`. '
            + 'It prints the converted JSON to stdout.',
        )).toBeNull();
    });

    it('still plans genuine self-contained browser requests', () => {
        for (const request of [
            'Build a simple weather dashboard using a free public API.',
            'Build me a local todo app.',
            'Build a local inventory app.',
            'Build me a currency converter.',
        ]) {
            const plan = planFor(request);
            expect(plan).not.toBeNull();
            expect(plan.phases[0].tasks.map((task: any) => task.tool)).toContain('react_project');
        }
    });

    it('does not mistake domain words for runtime demands', () => {
        // «exit» without «code» is not an exit-code contract.
        expect(planFor('Build an exit-poll results dashboard for a news site.')).not.toBeNull();
        // An airport terminal is a building, not a runtime.
        expect(planFor('Build a flight dashboard showing airport terminal gates and delays.')).not.toBeNull();
    });
});
