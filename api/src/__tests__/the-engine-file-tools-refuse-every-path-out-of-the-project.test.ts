/**
 * THE ENGINE'S FILE TOOLS REFUSE EVERY PATH OUT OF THE PROJECT.
 *
 * Through ToolService.executeTool with a real run context. The project folder
 * comes from the tool context, never from the model, and must lie inside the
 * workspace both as spelled and as resolved. Every model path is judged by
 * resolveInProject: `..` and absolute paths outside, links and junctions on
 * the way, secret files, and writes into node_modules, .git and .joe are
 * refused, and a refused write leaves nothing behind.
 */
import fs from 'fs';
import path from 'path';
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.setTimeout(120_000);

let fx: FileToolsFixture;
beforeAll(() => {
    fx = fileToolsFixture('refuse');
    fs.writeFileSync(path.join(fx.outside, 'secret.txt'), 'not yours\n');
    fx.put('src/app.js', 'export const a = 1;\n');
    fx.put('.env', 'TOKEN=1\n');
    fx.put('.joe/result.json', '{}\n');
    fx.link('linked', fx.outside);
});
afterAll(() => fx.cleanup());

const ALL_FIVE: Array<[string, Record<string, unknown>]> = [
    ['engine_file_read', { path: 'src/app.js' }],
    ['engine_file_write', { path: 'src/new.js', content: 'x\n' }],
    ['engine_file_edit', { path: 'src/app.js', old_text: 'a = 1', new_text: 'a = 2' }],
    ['engine_file_list', {}],
    ['engine_file_search', { pattern: 'a' }],
];

describe('the project folder comes from Joe and stays inside the workspace', () => {
    it('without a project folder in the tool context, all five refuse', async () => {
        const { projectRoot: _omitted, ...noRoot } = fx.context;
        for (const [tool, input] of ALL_FIVE) {
            expect([tool, (await fx.run(tool, input, noRoot)).error]).toEqual([tool, 'No project folder is bound to this run.']);
        }
        expect(fx.exists('src/new.js')).toBe(false);
    });

    it('a folder outside the workspace, or the workspace root itself, is refused', async () => {
        const outside = await fx.run('engine_file_read', { path: 'secret.txt' }, { ...fx.context, projectRoot: fx.outside });
        expect(outside.error).toBe('The project folder is not inside this workspace.');
        const root = await fx.run('engine_file_list', {}, { ...fx.context, projectRoot: fx.workspace });
        expect(root.error).toBe('The project folder is not inside this workspace.');
    });

    it('a project folder spelled inside the workspace that is a junction to elsewhere is refused', async () => {
        const junction = path.join(fx.workspace, 'elsewhere');
        fs.symlinkSync(fx.outside, junction, 'junction');
        try {
            const r = await fx.run('engine_file_read', { path: 'secret.txt' }, { ...fx.context, projectRoot: junction });
            expect(r.error).toBe('The project folder is not inside this workspace: its path leads through a link to another folder.');
            expect(String(r.output ?? '')).not.toContain('not yours');
        } finally { fs.unlinkSync(junction); }
    });

    it('a project folder that does not exist is refused', async () => {
        const r = await fx.run('engine_file_list', {}, { ...fx.context, projectRoot: path.join(fx.workspace, 'missing') });
        expect(r.error).toBe('The project folder does not exist.');
    });
});

describe('every model path is judged by where it leads', () => {
    it('.. that climbs out, and an absolute path outside, are refused by all five', async () => {
        for (const [tool, input] of ALL_FIVE) {
            const r = await fx.run(tool, { ...input, path: '../../outside/secret.txt' });
            expect([tool, r.error]).toEqual([tool, '"../../outside/secret.txt" is outside the project folder. Use a path relative to the project folder.']);
        }
        const absolute = await fx.run('engine_file_read', { path: path.join(fx.outside, 'secret.txt') });
        expect(absolute.error).toMatch(/is outside the project folder/u);
    });

    it('a junction inside the project is refused even though it is spelled inside', async () => {
        expect((await fx.run('engine_file_read', { path: 'linked/secret.txt' })).error).toBe('"linked" is a link; the engine does not follow links.');
        expect((await fx.run('engine_file_write', { path: 'linked/planted.txt', content: 'x' })).error).toBe('"linked" is a link; the engine does not follow links.');
        expect(fs.existsSync(path.join(fx.outside, 'planted.txt'))).toBe(false);
    });

    it('secret files are never read, written or searched', async () => {
        const said = '".env" holds secrets; the engine never reads or writes it. Use a .env.example with placeholder values instead.';
        expect((await fx.run('engine_file_read', { path: '.env' })).error).toBe(said);
        expect((await fx.run('engine_file_write', { path: '.env', content: 'TOKEN=2\n' })).error).toBe(said);
        expect((await fx.run('engine_file_edit', { path: '.env', old_text: '1', new_text: '2' })).error).toBe(said);
        expect((await fx.run('engine_file_search', { pattern: 'TOKEN', path: '.env' })).error).toBe(said);
        expect(fx.text('.env')).toBe('TOKEN=1\n');
    });

    it('nothing is written into node_modules, .git or .joe, and .joe can still be read', async () => {
        expect((await fx.run('engine_file_write', { path: 'node_modules/react/index.js', content: 'x' })).error)
            .toBe('Writing inside "node_modules" is not allowed (npm installs packages there; add them to package.json instead).');
        expect((await fx.run('engine_file_write', { path: '.git/config', content: 'x' })).error).toBe('Writing inside ".git" is not allowed.');
        expect((await fx.run('engine_file_edit', { path: '.joe/result.json', old_text: '{}', new_text: '{"x":1}' })).error).toBe('Writing inside ".joe" is not allowed.');
        expect([fx.exists('node_modules'), fx.exists('.git')]).toEqual([false, false]);
        expect(fx.text('.joe/result.json')).toBe('{}\n');
        expect((await fx.run('engine_file_read', { path: '.joe/result.json' })).ok).toBe(true);
    });
});
