/**
 * THE ENGINE SEARCHES FILE TEXT WITHOUT BLOCKING THE SERVER.
 *
 * engine_file_search, through ToolService.executeTool with a real run
 * context: path:line: text with each line cut to 300 characters around its
 * match, the total count with a bounded list, literal text or a regular
 * expression whose error comes back as written, binaries, secrets and the
 * skipped folders left out and counted. The model's pattern runs in a worker
 * thread with a deadline: a pattern that backtracks for minutes stops at the
 * deadline with what it found, and the request thread keeps serving.
 */
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.setTimeout(180_000);

let fx: FileToolsFixture;
const WIDE = `${'a'.repeat(1500)}useState${'b'.repeat(500)}`;
beforeAll(() => {
    fx = fileToolsFixture('search');
    fx.put('.gitignore', 'logs/\n');
    fx.put('src/App.jsx', "import { useState } from 'react';\nexport default function App() {\n  const [n, setN] = useState(0);\n  return n;\n}\n");
    fx.put('src/util.js', 'export function useStateLike() {}\n');
    fx.put('node_modules/react/index.js', 'export function useState() {}\n');
    fx.put('dist/bundle.js', 'useState()\n');
    fx.put('logs/x.log', 'useState\n');
    fx.put('.env', 'useState=secret\n');
    fx.put('bin.dat', Buffer.concat([Buffer.from([0]), Buffer.from('useState')]));
    fx.put('wide.js', `${WIDE}\n`);
    fx.put('notes/arabic.md', 'سطر أول\nابحث عن كلمة مرحبا هنا\n');
    fx.put('dots.txt', 'a.b\naxb\n');
    for (let i = 0; i < 150; i++) fx.put(`many/m${String(i).padStart(3, '0')}.txt`, 'hit\n');
    fx.put('redos.txt', `${'a'.repeat(40)}!\n`);
    fx.put('slow.txt', `${'a'.repeat(25)}!\n`);
});
afterAll(() => fx.cleanup());

const search = (input: Record<string, unknown>) => fx.run('engine_file_search', input);

describe('matches come back as path:line: text, with the whole count', () => {
    it('the project is searched except what is skipped, ignored, secret or binary, and each of those is counted', async () => {
        const r = await search({ pattern: 'useState' });
        expect(r.ok).toBe(true);
        expect(r.output.text).toBe([
            "src/App.jsx:1: import { useState } from 'react';",
            'src/App.jsx:3:   const [n, setN] = useState(0);',
            'src/util.js:1: export function useStateLike() {}',
            `wide.js:1: …${WIDE.slice(1400, 1700)}…`,
            '4 matching lines in 3 files (158 files searched) for /useState/ in the project folder.',
            'Skipped, not entered: dist/ (1 entry), node_modules/ (1 entry).',
            'Hidden by .gitignore: 1 entry.',
            'Not searched: 1 file that holds secrets.',
            'Not searched: 1 binary file.',
        ].join('\n'));
        expect(r.output).toMatchObject({ matches: 4, files: 3, searched: 158, shown: 4, finished: true });
    });

    it('a long line is cut to 300 characters around its match', async () => {
        const r = await search({ pattern: 'useState', path: 'wide.js' });
        const row = r.output.text.split('\n')[0];
        expect(row.slice('wide.js:1: '.length)).toHaveLength(302);
        expect(row).toContain('useState');
    });

    it('glob, ignore_case and literal narrow what matches', async () => {
        expect((await search({ pattern: 'useState', glob: '*.jsx' })).output.text.split('\n').slice(0, 3)).toEqual([
            "src/App.jsx:1: import { useState } from 'react';",
            'src/App.jsx:3:   const [n, setN] = useState(0);',
            '2 matching lines in 1 file (1 file searched) for /useState/ in the project folder.',
        ]);
        expect((await search({ pattern: 'USESTATE', ignore_case: true, glob: 'src/**' })).output.matches).toBe(3);
        expect((await search({ pattern: 'a.b', path: 'dots.txt' })).output.matches).toBe(2);
        const literal = await search({ pattern: 'a.b', path: 'dots.txt', literal: true });
        expect(literal.output.text).toBe('dots.txt:1: a.b\n1 matching line in 1 file (1 file searched) for "a.b" in dots.txt.');
    });

    it('Arabic text is found as it is written', async () => {
        expect((await search({ pattern: 'مرحبا' })).output.text.split('\n')[0]).toBe('notes/arabic.md:2: ابحث عن كلمة مرحبا هنا');
    });

    it('a long list is bounded, and the count is still the whole count', async () => {
        const r = await search({ pattern: 'hit', path: 'many' });
        const rows = r.output.text.split('\n').filter((l: string) => l.startsWith('many/'));
        expect(rows).toHaveLength(100);
        expect(r.output.text).toContain('\n150 matching lines in 150 files (150 files searched) for /hit/ in many.\nShowing 100 of 150; narrow the search with path or glob to see the rest.');
    });

    it('nothing to search, and nothing found, are said plainly', async () => {
        expect((await search({ pattern: 'x', glob: '*.nothing' })).output.text.split('\n')[0]).toBe('No files to search in the project folder matching "*.nothing".');
        expect((await search({ pattern: 'zebra', path: 'src' })).output.text).toBe('No match for /zebra/ in 2 files searched in src.');
    });
});

describe('what cannot be searched says why', () => {
    it('an invalid regular expression returns its error and the way out', async () => {
        const r = await search({ pattern: '([a-z]' });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/^The pattern is not a valid regular expression: Invalid regular expression: .*Unterminated group.*\. Fix it, or set literal to true to search for the text exactly as written\.$/u);
    });

    it('a secret file is refused like a read of it', async () => {
        expect((await search({ pattern: 'x', path: '.env' })).error).toBe('".env" holds secrets; the engine never reads or writes it. Use a .env.example with placeholder values instead.');
    });
});

describe('a pattern that backtracks without end does not hold the server', () => {
    it('it stops at its deadline with what it reached, and the request thread kept serving meanwhile', async () => {
        let ticks = 0;
        const timer = setInterval(() => { ticks++; }, 50);
        let r: any;
        try { r = await search({ pattern: '(a+)+$', path: 'redos.txt', timeout_ms: 1500 }); } finally { clearInterval(timer); }
        expect(r.ok).toBe(false);
        expect(r.error).toBe([
            'The search stopped after 1.5 s with 0 of 1 file searched: 0 matching lines so far.',
            'The pattern may backtrack too much (nested repeats such as (a+)+ do); simplify it, or narrow the search with path or glob.',
        ].join('\n'));
        expect(ticks).toBeGreaterThanOrEqual(5);
    });

    it('a slow pattern that does finish never stops the request thread for long', async () => {
        let last = Date.now();
        let longest = 0;
        const timer = setInterval(() => { const now = Date.now(); longest = Math.max(longest, now - last); last = now; }, 25);
        let r: any;
        try { r = await search({ pattern: '(a+)+$', path: 'slow.txt', timeout_ms: 120_000 }); } finally { clearInterval(timer); }
        expect(r.output.text).toBe('No match for /(a+)+$/ in 1 file searched in slow.txt.');
        // On the request thread this one line holds it for seconds (2^25 backtracking steps).
        expect(longest).toBeLessThan(2_000);
    });
});
