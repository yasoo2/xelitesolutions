import { deterministicPhasesFor, pythonTestCommand } from '../modules/tools/definitions/ProjectPipelineTool';
import { pythonRunCommand } from '../core/quality/python-test-runner';

/**
 * Eval P301-cli-ar, 2026-10-25: «اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV …
 * وتكتب الأسطر الخاطئة في ملف errors.csv» names the file the program WRITES.
 * The CLI scaffold took it as the program: package.json said `python errors.csv`,
 * the Python code was authored into errors.csv, and the test ran under pytest,
 * which is not installed — «No module named pytest» failed the delivery.
 */
const P301 = 'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه المرضى لـعيادة أسنان، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.';
const tasksOf = (request: string) => deterministicPhasesFor(request)!.phases[0].tasks;

describe('a data file he named is the program\'s input or output, not the program', () => {
    it('the Python program lives in a .py entry, and the named errors.csv is not the entry', () => {
        const tasks = tasksOf(P301);
        const pkg = JSON.parse(tasks[0].args.structure['package.json']);
        expect(pkg.main).toBe('main.py');
        expect(pkg.scripts.start).toBe(pythonRunCommand('main.py'));
        const authored = tasks.filter((t: any) => t.tool === 'ai_write_file').map((t: any) => t.args.path);
        // The test is named after the program (eval round 19).
        expect(authored).toEqual(['main.py', 'test_main.py']);
        expect(authored).not.toContain('errors.csv');
        // his request, which names errors.csv as the output, still reaches the author
        expect(tasks[1].args.description).toContain('errors.csv');
    });

    it('a named source file is still the entry', () => {
        const pkg = JSON.parse(tasksOf('Write a Python command-line tool report.py that reads a CSV file and prints the totals')[0].args.structure['package.json']);
        expect(pkg.main).toBe('report.py');
        expect(pkg.scripts.start).toBe(pythonRunCommand('report.py'));
    });

    it('the Python test runs with Python alone, and its brief names that command', () => {
        const tasks = tasksOf(P301);
        const pkg = JSON.parse(tasks[0].args.structure['package.json']);
        expect(pkg.scripts.test).toBe(pythonTestCommand(['test_main.py'], true));
        // Nothing asks for pytest; the brief only says not to use it.
        expect(JSON.stringify(tasks).replace(/\(no pytest\)/g, '')).not.toMatch(/pytest/);
        // Round 22: the brief says how the runner runs it — its two thousand characters
        // (launcher and runner on one line) would only fill the author's window.
        expect(tasks[2].args.description).toContain('The test is run by a standard-library runner that imports this file and runs every unittest test in it');
        expect(tasks[2].args.description).not.toContain(pkg.scripts.test);
    });
});
