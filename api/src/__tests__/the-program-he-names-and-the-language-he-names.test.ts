import { namedTargetFile } from '../core/orchestrator/file-intent';
import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';
import { pythonExecutable } from '../core/quality/python-executable';

/**
 * Round 21 review, group 1 #7:
 *   - namedTargetFile's «exactly one name» rule ran before the CLI scaffold's
 *     extension filter: «a Python CLI validate.py that … errors.csv» names a
 *     program and a data file, two names counted as none, and validate.py
 *     became main.py;
 *   - detectLanguage had no Arabic language names: «بلغة بايثون» fell to the
 *     TypeScript default. And a name that is also an everyday word must be
 *     read as a language only in a language phrase — English «go», Arabic
 *     «جو» (also Joe's name, and «weather»).
 */
const entryOf = (request: string) => {
    const structure = deterministicPhasesFor(request)!.phases[0].tasks[0].args.structure as Record<string, string>;
    const pkg = JSON.parse(structure['package.json']);
    return { main: pkg.main, start: pkg.scripts.start, files: Object.keys(structure) };
};

describe('the program he names is the entry, whatever data files he names beside it', () => {
    const request = 'Write a Python CLI validate.py that reads the file named patients.csv and writes the bad rows to errors.csv';

    it('the source filter applies before «exactly one name»', () => {
        expect(namedTargetFile(request)).toBeNull(); // two names: as a target file, still ambiguous
        expect(namedTargetFile(request, name => /\.py$/u.test(name))).toBe('validate.py');
        expect(namedTargetFile('Write a CLI a.py and a CLI b.py', name => /\.py$/u.test(name))).toBeNull();
    });

    it('the CLI scaffold makes validate.py the program', () => {
        expect(entryOf(request)).toMatchObject({ main: 'validate.py', start: `${pythonExecutable()} validate.py` });
    });
});

describe('a language he names in Arabic is the language of the program', () => {
    it.each([
        ['اكتب أداة سطر أوامر بلغة بايثون تقرأ ملف CSV وتطبع عدد الأسطر', 'main.py', `${pythonExecutable()} main.py`],
        ['اكتب أداة سطر أوامر باللغة بايتون تعد الكلمات في ملف', 'main.py', `${pythonExecutable()} main.py`],
        ['اكتب أداة سطر أوامر بلغة جافاسكربت تعد الكلمات في ملف', 'index.js', 'node index.js'],
        ['اكتب أداة سطر أوامر بلغة جافا سكريبت تعد الكلمات في ملف', 'index.js', 'node index.js'],
        ['اكتب أداة سطر أوامر بلغة رست تعد الكلمات في ملف', 'src/main.rs', expect.stringMatching(/^\.\/target\/release\//u)],
        ['اكتب أداة سطر أوامر بلغة Go تعد الكلمات في ملف', 'main.go', './dist/main'],
        ['اكتب أداة سطر أوامر بلغة جو تعد الكلمات في ملف', 'main.go', './dist/main'],
        ['اكتب سكربت باش يعد الكلمات في ملف', 'main.sh', 'bash main.sh'],
    ])('%s', (request, main, start) => {
        expect(entryOf(request)).toMatchObject({ main, start });
    });

    it('an everyday word is not a language: «go through», «الجو»', () => {
        expect(entryOf('Write a command-line tool that lets me go through my notes and count the words').main).not.toBe('main.go');
        expect(entryOf('اكتب أداة سطر أوامر تطبع حالة الجو من ملف').main).not.toBe('main.go');
    });
});
