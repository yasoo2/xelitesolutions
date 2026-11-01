/**
 * THE ENGINE WRITES A WHOLE FILE ATOMICALLY, AND SAYS WHETHER IT PARSES.
 *
 * engine_file_write, through ToolService.executeTool with a real run context:
 * parents created, the model's bytes written as they are, a complete Markdown
 * fence removed, the destination contract of prepareArtifactContent kept, a
 * file that does not parse still written with the line, column and a snippet
 * (so the next step is a small edit, not the whole file again), the write
 * done as a temporary file renamed over the target, and the UI told the way
 * write_file tells it.
 */
import fs from 'fs';
import path from 'path';
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.setTimeout(120_000);

let fx: FileToolsFixture;
beforeAll(() => { fx = fileToolsFixture('write'); });
afterAll(() => fx.cleanup());
afterEach(() => jest.restoreAllMocks());

const write = (filePath: string, content: string) => fx.run('engine_file_write', { path: filePath, content });

function allFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? allFiles(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

describe('a write creates what is missing and reports the change', () => {
    it('a new file in new folders is created with exactly the bytes given', async () => {
        const r = await write('src/new/deep/file.js', 'export const a = 1;\n');
        expect(r.ok).toBe(true);
        expect(r.output.text).toBe('Wrote src/new/deep/file.js (created, 20 bytes).\nJavaScript syntax OK.');
        expect(r.output).toMatchObject({ path: 'src/new/deep/file.js', change: 'created', bytes: 20, parses: true });
        expect(fx.text('src/new/deep/file.js')).toBe('export const a = 1;\n');
    });

    it('writing it again is a modification; CRLF content is kept byte for byte', async () => {
        const r = await write('src/new/deep/file.js', 'export const a = 2;\r\nexport const b = 3;\r\n');
        expect(r.output).toMatchObject({ change: 'modified', bytes: 42 });
        expect(fx.text('src/new/deep/file.js')).toBe('export const a = 2;\r\nexport const b = 3;\r\n');
    });

    it('an empty file can be created (an __init__.py is a real file)', async () => {
        const r = await write('pkg/__init__.py', '');
        expect(r.output.text).toBe('Wrote pkg/__init__.py (created, 0 bytes).');
        expect(fx.text('pkg/__init__.py')).toBe('');
    });

    it('but empty content over a file that has content is refused, and the file is unchanged', async () => {
        const before = fx.sha('src/new/deep/file.js');
        const r = await write('src/new/deep/file.js', '  \n');
        expect(r).toMatchObject({ ok: false, error: '"content" is empty: writing it would erase src/new/deep/file.js (42 B). Nothing was written.' });
        expect(fx.sha('src/new/deep/file.js')).toBe(before);
    });

    it('a folder is not a file', async () => {
        expect((await write('src', 'x')).error).toBe('src is a folder. Give a file path, for example src/index.html.');
        expect((await write('src/newdir/', 'x')).error).toBe('file_write needs a file path; "src/newdir/" names a folder. Add the file name, for example src/newdir/index.html.');
        expect(fx.exists('src/newdir')).toBe(false);
    });
});

describe('the destination contract of prepareArtifactContent', () => {
    it('a complete Markdown fence around the content is removed, and the file ends with its line break', async () => {
        const r = await write('src/A.jsx', '```jsx\nexport default function A() { return <div/>; }\n```');
        expect(r.output.text).toBe('Wrote src/A.jsx (created, 47 bytes; the Markdown fence around the content was removed).\nJSX syntax OK.');
        expect(fx.text('src/A.jsx')).toBe('export default function A() { return <div/>; }\n');
    });

    it('content that cannot be the file it names is refused and nothing is written', async () => {
        const python = await write('x.js', 'def main():\n    pass\n');
        expect(python.error).toBe('artifact_type_mismatch: x.js has Python source markers but requires JavaScript/TypeScript. Nothing was written.');
        const cutFence = await write('y.js', '```js\nconst a = 1;');
        expect(cutFence.error).toBe('artifact_type_mismatch: y.js still contains an incomplete Markdown fence. Nothing was written.');
        const manifest = await write('package.json', JSON.stringify({ name: 'shop', dependencies: { 'node:sqlite': '*' } }));
        expect(manifest.error).toMatch(/^manifest_dependency_uninstallable: package\.json declares what npm install cannot fetch: dependencies\.node:sqlite is a Node built-in.*\. Nothing was written\.$/u);
        expect([fx.exists('x.js'), fx.exists('y.js'), fx.exists('package.json')]).toEqual([false, false, false]);
    });
});

describe('a file that does not parse is written, and the answer says exactly where', () => {
    it('JavaScript: line, column, the parser\'s words and a snippet with a caret', async () => {
        const r = await write('bad.js', 'const x = ;\nconst y = 2;\n');
        expect(r.ok).toBe(true);
        expect(r.output.parses).toBe(false);
        expect(r.output.text).toBe([
            'Wrote bad.js (created, 25 bytes).',
            'Written, but it does not parse: line 1 col 11: Unexpected ";"',
            '> 1 | const x = ;',
            '    |           ^',
            '  2 | const y = 2;',
            'Fix it with a small file_edit of bad.js; do not resend the whole file.',
        ].join('\n'));
        expect(fx.text('bad.js')).toBe('const x = ;\nconst y = 2;\n');
    });

    it('the column counts characters: Arabic before the error does not move it', async () => {
        const r = await write('ar.js', 'const s = "مرحبا"; const = 1;\n');
        expect(r.output.text).toContain('it does not parse: line 1 col 26: Expected identifier but found "="');
        expect(r.output.text).toContain(`    | ${' '.repeat(25)}^`);
    });

    it('JSON is checked with JSON.parse and written even when it does not parse', async () => {
        const r = await write('data.json', '{"a": 1,}');
        expect(r.ok).toBe(true);
        expect(r.output.text).toContain('Written, but it does not parse: line 1 col 9: Expected double-quoted property name');
        expect(fx.text('data.json')).toBe('{"a": 1,}');
    });

    it('TypeScript configs are JSON with comments, as TypeScript reads them; TSX is TSX', async () => {
        const tsconfig = await write('tsconfig.app.json', '{\n  /* Bundler mode */\n  "compilerOptions": { "jsx": "react-jsx", },\n}\n');
        expect(tsconfig.output.text).toMatch(/\nJSON with comments syntax OK\.$/u);
        const tsx = await write('src/C.tsx', 'export const C = (p: { a: number }) => <b>{p.a}</b>;\n');
        expect(tsx.output.text).toMatch(/\nTSX syntax OK\.$/u);
    });
});

describe('a write is a temporary file renamed over the target', () => {
    it('the rename goes from a temporary file beside the target, and no temporary file is left', async () => {
        const rename = jest.spyOn(fs.promises, 'rename');
        await write('src/new/deep/file.js', 'export const a = 4;\n');
        expect(rename).toHaveBeenCalledTimes(1);
        const [from, to] = rename.mock.calls[0] as [string, string];
        expect(path.basename(to)).toBe('file.js');
        expect(path.dirname(from)).toBe(path.dirname(to));
        expect(path.basename(from)).toMatch(/^\.file\.js\.\d+-[0-9a-f]{8}\.joe-tmp$/u);
        expect(allFiles(fx.project).filter(f => f.endsWith('.joe-tmp'))).toEqual([]);
    });

    it('when the rename fails, the old content stays whole and the temporary file is removed', async () => {
        const before = fx.sha('src/new/deep/file.js');
        jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(Object.assign(new Error('cross-device link'), { code: 'EXDEV' }));
        const r = await write('src/new/deep/file.js', 'export const a = 5;\n');
        expect(r).toMatchObject({ ok: false, error: 'src/new/deep/file.js could not be written: EXDEV.' });
        expect(fx.sha('src/new/deep/file.js')).toBe(before);
        expect(allFiles(fx.project).filter(f => f.endsWith('.joe-tmp'))).toEqual([]);
    });

    (process.platform === 'win32' ? it.skip : it)('the file keeps its permission bits', async () => {
        const file = fx.put('run.sh', '#!/bin/sh\necho old\n');
        fs.chmodSync(file, 0o755);
        await write('run.sh', '#!/bin/sh\necho new\n');
        expect(fs.statSync(file).mode & 0o777).toBe(0o755);
    });
});

describe('the UI hears about it the way write_file tells it', () => {
    it('a diff event with the content, then a finished file_stream event', async () => {
        const content = 'export const ui = true;\n';
        const { events } = await fx.events(() => write('src/ui.js', content));
        const abs = path.join(fx.project, 'src', 'ui.js');
        const diff = events.find(e => e.type === 'diff');
        const stream = events.find(e => e.type === 'file_stream');
        expect(diff).toMatchObject({ sessionId: fx.context.sessionId, data: { path: abs, content, additions: 2, deletions: 0 } });
        expect(diff.data.lines[0]).toEqual({ type: 'add', content: 'export const ui = true;', lineNumber: 1 });
        expect(stream).toMatchObject({ sessionId: fx.context.sessionId, data: { file: abs, chunk: content, done: true, label: 'written to disk', bytes: Buffer.byteLength(content) } });
    });
});
