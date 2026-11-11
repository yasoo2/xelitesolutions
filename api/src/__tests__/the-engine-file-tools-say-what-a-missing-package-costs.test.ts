/**
 * THE ENGINE'S FILE TOOLS SAY WHAT A MISSING PACKAGE COSTS.
 *
 * esbuild, diff and ignore are dev dependencies of the api package (picomatch
 * comes with another dependency), so an install without them is possible.
 * The file tools load them when first needed: a missing one never stops the
 * registry from loading, and each answer says what it could not do and why,
 * instead of claiming a check that did not run. Measured through
 * ToolService.executeTool with all four unavailable.
 */
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.mock('esbuild', () => { throw new Error("Cannot find module 'esbuild'"); });
jest.mock('diff', () => { throw new Error("Cannot find module 'diff'"); });
jest.mock('ignore', () => { throw new Error("Cannot find module 'ignore'"); });
jest.mock('picomatch', () => ({}));

jest.setTimeout(120_000);

let fx: FileToolsFixture;
beforeAll(() => {
    fx = fileToolsFixture('missing');
    fx.put('.gitignore', 'secret-notes.txt\n');
    fx.put('secret-notes.txt', 'n\n');
    fx.put('src/app.js', 'export const a = 1;\n');
});
afterAll(() => fx.cleanup());

describe('without esbuild, diff, ignore or picomatch', () => {
    it('the registry still loads the five tools', () => {
        const { tools } = require('../modules/tools/registry');
        expect(tools.filter((t: any) => /^engine_file_/u.test(t.name)).map((t: any) => t.name))
            .toEqual(['engine_file_read', 'engine_file_write', 'engine_file_edit', 'engine_file_list', 'engine_file_search']);
    });

    it('a write is made and says it was not syntax-checked, and why', async () => {
        const r = await fx.run('engine_file_write', { path: 'src/b.js', content: 'const = 1;\n' });
        expect(r.ok).toBe(true);
        expect(r.output.text).toBe("Wrote src/b.js (created, 11 bytes).\nNot syntax-checked: the esbuild package is not installed here (Cannot find module 'esbuild').");
        expect(r.output.parses).toBeNull();
    });

    it('an edit is made, and says the diff and the check it could not give', async () => {
        const r = await fx.run('engine_file_edit', { path: 'src/app.js', old_text: 'a = 1', new_text: 'a = 2' });
        expect(r.ok).toBe(true);
        expect(r.output.text).toBe([
            'Edited src/app.js: replaced 1 occurrence at line 1 (exact match).',
            "The diff is not shown: the diff package is not installed here (Cannot find module 'diff').",
            "Not syntax-checked: the esbuild package is not installed here (Cannot find module 'esbuild').",
        ].join('\n'));
        expect(fx.text('src/app.js')).toBe('export const a = 2;\n');
    });

    it('a listing says .gitignore was not applied, and shows what it would have hidden', async () => {
        const r = await fx.run('engine_file_list', {});
        expect(r.output.text).toContain('\nsecret-notes.txt  2 B\n');
        expect(r.output.text).toMatch(/\n\.gitignore was not applied: the ignore package is not installed here \(Cannot find module 'ignore'\)\.$/u);
    });

    it('a glob that cannot be applied is refused rather than ignored', async () => {
        expect((await fx.run('engine_file_list', { pattern: '**/*.js' })).error)
            .toBe('file_list cannot apply the glob "**/*.js": the picomatch package is not installed here (picomatch exported nothing usable).');
        expect((await fx.run('engine_file_search', { pattern: 'a', glob: '*.js' })).error)
            .toBe('file_search cannot apply the glob "*.js": the picomatch package is not installed here (picomatch exported nothing usable).');
        expect((await fx.run('engine_file_search', { pattern: 'const a' })).output.text).toContain('src/app.js:1: export const a = 2;');
    });
});
