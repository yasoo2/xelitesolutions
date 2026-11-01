/**
 * THE ENGINE LISTS THE PROJECT, AND SAYS WHAT IT SKIPPED.
 *
 * engine_file_list, through ToolService.executeTool with a real run context:
 * an asynchronous walk with sizes, the project's .gitignore files honoured at
 * every depth (and above the folder listed), node_modules, .git, dist, build
 * and .joe never entered but counted, a virtualenv known by what it holds,
 * links shown and not followed, a glob filter, and a bounded answer that
 * says how many entries it did not show.
 */
import fs from 'fs';
import path from 'path';
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.setTimeout(120_000);

let fx: FileToolsFixture;
beforeAll(() => {
    fx = fileToolsFixture('list');
    fx.put('.gitignore', 'logs/\n*.log\n!keep.log\n');
    fx.put('README.md', '# demo\n');
    fx.put('package.json', '{"name":"demo"}\n');
    fx.put('src/App.jsx', 'export default 1;\n');
    fx.put('src/.gitignore', 'generated.js\n');
    fx.put('src/generated.js', 'x\n');
    fx.put('src/components/Button.jsx', 'b\n');
    fx.put('src/components/deep/x.js', 'y\n');
    fx.put('src/components/trace.log', 't\n');
    fx.put('logs/a.txt', 'l\n');
    fx.put('debug.log', 'd\n');
    fx.put('keep.log', 'k\n');
    fx.put('node_modules/a/index.js', 'a\n');
    fx.put('node_modules/b/index.js', 'b\n');
    fx.put('node_modules/.bin/x', 'x\n');
    fx.put('.git/HEAD', 'ref: refs/heads/main\n');
    fx.put('dist/bundle.js', 'bundle\n');
    fx.put('.joe/out/1.txt', 'log\n');
    fx.put('.cache/x', 'c\n');
    fx.put('.env', 'SECRET=1\n');
    fx.put('env/pyvenv.cfg', 'home = /usr/bin\n');
    fx.put('env/lib/site.py', 'p\n');
    fs.mkdirSync(path.join(fx.project, 'empty'));
    for (let i = 0; i < 450; i++) fx.put(`bulk/many/f${String(i).padStart(3, '0')}.txt`, 'm\n');
    fx.link('linked', fx.outside);
});
afterAll(() => fx.cleanup());

const list = (input: Record<string, unknown> = {}) => fx.run('engine_file_list', input);

describe('a tree with sizes, honest about what it left out', () => {
    it('the default is two levels deep; skipped folders are counted, ignored entries too', async () => {
        const r = await list({});
        expect(r.ok).toBe(true);
        expect(r.output.text).toBe([
            'Folder . (depth 2):',
            '.env  9 B  (holds secrets: the engine never reads it)',
            '.gitignore  22 B',
            'README.md  7 B',
            'bulk/',
            'bulk/many/  (450 entries below depth 2)',
            'empty/  (empty)',
            'keep.log  2 B',
            'linked  (a link; not followed)',
            'package.json  16 B',
            'src/',
            'src/.gitignore  13 B',
            'src/App.jsx  18 B',
            'src/components/  (3 entries below depth 2)',
            '5 folders, 7 files.',
            'Skipped, not entered: .cache/ (1 entry, tool or cache state), .git/ (1 entry), .joe/ (1 entry), dist/ (1 entry), env/ (2 entries, a Python virtual environment), node_modules/ (3 entries).',
            'Hidden by .gitignore: 3 entries.',
        ].join('\n'));
    });

    it('depth 1 is this folder only, and a virtualenv at the edge is still known for one', async () => {
        const r = await list({ depth: 1 });
        expect(r.output.text).toContain('\nsrc/  (4 entries below depth 1)\n');
        expect(r.output.text).not.toContain('src/App.jsx');
        expect(r.output.text).toContain('env/ (2 entries, a Python virtual environment)');
    });

    it('a subfolder is listed with the .gitignore rules of the folders above it', async () => {
        const r = await list({ path: 'src/components' });
        expect(r.output.text).toBe([
            'Folder src/components (depth 2):',
            'src/components/Button.jsx  2 B',
            'src/components/deep/',
            'src/components/deep/x.js  2 B',
            '1 folder, 2 files.',
            'Hidden by .gitignore: 1 entry.',
        ].join('\n'));
    });

    it('a folder the walk skips can still be listed when it is asked for by name', async () => {
        expect((await list({ path: 'node_modules' })).output.text).toContain('\nnode_modules/a/index.js  2 B\n');
    });

    it('a long listing stops at its bound and counts the rest', async () => {
        const r = await list({ path: 'bulk/many' });
        const lines = r.output.text.split('\n');
        expect(lines.filter((l: string) => l.startsWith('bulk/many/f'))).toHaveLength(400);
        expect(r.output.text).toContain('\n… 50 more entries not shown. List a subfolder, use a smaller depth, or a pattern.\n0 folders, 450 files.');
    });

    it('a walk that reaches its entry bound says so (JOE_ENGINE_WALK_MAX_ENTRIES lowers it here)', async () => {
        process.env.JOE_ENGINE_WALK_MAX_ENTRIES = '20';
        try {
            const r = await list({ path: 'bulk/many' });
            expect(r.output.text).toMatch(/\nThe walk stopped after 20 entries, so what is above is not all there is; give a narrower path\.$/u);
        } finally { delete process.env.JOE_ENGINE_WALK_MAX_ENTRIES; }
    });
});

describe('a glob lists the files that match, at any depth', () => {
    it('a pattern with a slash is matched against the path inside the folder listed', async () => {
        const r = await list({ pattern: '**/*.jsx' });
        expect(r.output.text.split('\n').slice(0, 4)).toEqual([
            'Files matching "**/*.jsx" in .:',
            'src/App.jsx  18 B',
            'src/components/Button.jsx  2 B',
            '2 files match.',
        ]);
    });

    it('a pattern without one matches the name at any depth, and ignored files stay out', async () => {
        const r = await list({ pattern: '*.js' });
        expect(r.output.text.split('\n').slice(0, 3)).toEqual(['Files matching "*.js" in .:', 'src/components/deep/x.js  2 B', '1 file matches.']);
    });
});

describe('what is not a folder to list', () => {
    it('a file, a missing path and a bad depth each get a sentence', async () => {
        expect((await list({ path: 'README.md' })).output.text).toBe('README.md is a file (7 B). Use file_read to read it.');
        expect((await list({ path: 'nope' })).error).toMatch(/^nope does not exist\. The project folder has: /u);
        expect((await list({ depth: 0 })).error).toBe('file_list: "depth" must be a whole number of at least 1 (got 0).');
    });
});
