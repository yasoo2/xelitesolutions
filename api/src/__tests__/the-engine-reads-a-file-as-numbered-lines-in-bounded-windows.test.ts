/**
 * THE ENGINE READS A FILE AS NUMBERED LINES, IN WINDOWS THAT SAY WHAT IS LEFT.
 *
 * engine_file_read, through ToolService.executeTool with a real run context:
 * cat -n numbering, a 400-line default window that names the offset to
 * continue from, a character bound that does the same, binary files refused,
 * images described with their size, a folder pointed to file_list, and a file
 * too large to hold read as a stream whose answer names the bytes that follow.
 */
import fs from 'fs';
import { fileToolsFixture, jpegHeader, pngHeader, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.setTimeout(120_000);

let fx: FileToolsFixture;
beforeAll(() => {
    fx = fileToolsFixture('read');
    fx.put('src/App.jsx', "import React from 'react';\n\nexport default function App() { return null; }\n");
    fx.put('long.txt', Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join('\n') + '\n');
    fx.put('crlf.txt', 'first\r\nsecond\r\n');
    fx.put('arabic.md', 'مرحبا بالعالم\nسطر ثانٍ\n');
    fx.put('empty.txt', '');
    fx.put('wide.txt', `${'x'.repeat(5000)}\n`);
    fx.put('chars.txt', Array.from({ length: 400 }, (_, i) => `${String(i + 1).padStart(4, '0')} ${'y'.repeat(95)}`).join('\n'));
    fx.put('assets/logo.png', pngHeader(300, 120));
    fx.put('assets/photo.jpg', jpegHeader(640, 480));
    fx.put('data.bin', Buffer.from([0x41, 0x42, 0x00, 0x43]));
    fx.put('doc.pdf', '%PDF-1.7\n%âãÏÓ\n1 0 obj\n');
    fx.put('utf16.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hello\r\nworld\r\n', 'utf16le')]));
    fx.put('.joe/out/0001-1-shell_run.txt', 'full command log\n');
});
afterAll(() => fx.cleanup());

const read = (input: Record<string, unknown>) => fx.run('engine_file_read', input);

describe('a text file comes back numbered like cat -n', () => {
    it('every line carries its number and a tab; the footer says it is the whole file', async () => {
        const r = await read({ path: 'src/App.jsx' });
        expect(r.ok).toBe(true);
        expect(r.output.text).toBe([
            "     1\timport React from 'react';",
            '     2\t',
            '     3\texport default function App() { return null; }',
            '[src/App.jsx: lines 1-3 of 3, the whole file.]',
        ].join('\n'));
        expect(r.output).toMatchObject({ path: 'src/App.jsx', totalLines: 3, startLine: 1, endLine: 3 });
    });

    it('CRLF lines lose only their line break, and Arabic is shown as it is', async () => {
        expect((await read({ path: 'crlf.txt' })).output.text.split('\n').slice(0, 2)).toEqual(['     1\tfirst', '     2\tsecond']);
        expect((await read({ path: 'arabic.md' })).output.text).toContain('     1\tمرحبا بالعالم\n     2\tسطر ثانٍ');
    });

    it('an empty file says so', async () => {
        const r = await read({ path: 'empty.txt' });
        expect(r.ok).toBe(true);
        expect(r.output.text).toBe('[empty.txt: the file is empty (0 lines).]');
    });

    it('a UTF-16 file (what PowerShell 5 writes) is decoded and named', async () => {
        const r = await read({ path: 'utf16.txt' });
        expect(r.ok).toBe(true);
        expect(r.output.text).toBe('     1\thello\n     2\tworld\n[utf16.txt (UTF-16 LE): lines 1-2 of 2, the whole file.]');
    });

    it('.joe is readable: the loop points the model at .joe/out for a long output', async () => {
        expect((await read({ path: '.joe/out/0001-1-shell_run.txt' })).output.text).toContain('     1\tfull command log');
    });
});

describe('a window is bounded and names what is left', () => {
    it('400 lines by default, then the offset to continue from', async () => {
        const r = await read({ path: 'long.txt' });
        const lines = r.output.text.split('\n');
        expect(lines).toHaveLength(401);
        expect(lines[399]).toBe('   400\tline 400');
        expect(lines[400]).toBe('[long.txt: lines 1-400 of 1000. Continue with offset=401.]');
    });

    it('offset and limit choose the window, and the last window says it reached the end', async () => {
        expect((await read({ path: 'long.txt', offset: 401, limit: 2 })).output.text)
            .toBe('   401\tline 401\n   402\tline 402\n[long.txt: lines 401-402 of 1000. Continue with offset=403.]');
        expect((await read({ path: 'long.txt', offset: '999', limit: '5' })).output.text)
            .toBe('   999\tline 999\n  1000\tline 1000\n[long.txt: lines 999-1000 of 1000, the end of the file.]');
    });

    it('a window also stops at its character bound, and says where to continue', async () => {
        const r = await read({ path: 'chars.txt' });
        const footer = r.output.text.split('\n').pop();
        expect(r.output.endLine).toBeLessThan(400);
        expect(footer).toBe(`[chars.txt: lines 1-${r.output.endLine} of 400 (the window stops at 24000 characters). Continue with offset=${r.output.endLine + 1}.]`);
        expect(r.output.text.length).toBeLessThanOrEqual(24_000 + footer!.length + 1);
    });

    it('a line longer than 1000 characters is cut, and the cut counts what is left on it', async () => {
        expect((await read({ path: 'wide.txt' })).output.text.split('\n')[0]).toBe(`     1\t${'x'.repeat(1000)} … [+4000 characters on this line]`);
    });

    it('an offset past the end, or an offset that is not a number, is refused with the reason', async () => {
        expect(await read({ path: 'src/App.jsx', offset: 10 })).toMatchObject({ ok: false, error: 'offset 10 is past the end: src/App.jsx has 3 lines.' });
        expect((await read({ path: 'src/App.jsx', offset: 'first' })).error).toBe('file_read: "offset" must be a whole number of at least 1 (got "first").');
        expect((await read({ path: 'src/App.jsx', limit: 0 })).error).toBe('file_read: "limit" must be a whole number of at least 1 (got 0).');
    });
});

describe('what is not a text file is described, not dumped', () => {
    it('an image gives its format, pixel size and bytes', async () => {
        const png = await read({ path: 'assets/logo.png' });
        expect(png.ok).toBe(false);
        expect(png.error).toBe(`assets/logo.png is an image (PNG, 300x120 pixels, ${fs.statSync(`${fx.project}/assets/logo.png`).size} B). file_read shows text files only.`);
        expect((await read({ path: 'assets/photo.jpg' })).error).toMatch(/^assets\/photo\.jpg is an image \(JPEG, 640x480 pixels, \d+ B\)\./u);
    });

    it('a file with NUL bytes is binary, and a PDF is named as one', async () => {
        expect((await read({ path: 'data.bin' })).error).toBe('data.bin is a binary file (4 B), not text. file_read shows text files only.');
        expect((await read({ path: 'doc.pdf' })).error).toMatch(/^doc\.pdf is a PDF document \(\d+ B\), not text\./u);
    });

    it('a folder is pointed to file_list; a missing file names what its folder holds', async () => {
        expect((await read({ path: 'src' })).error).toBe('src is a folder, not a file. Use file_list to see what is in it.');
        expect((await read({ path: 'src/Ap.jsx' })).error).toBe('src/Ap.jsx does not exist. src/ has: App.jsx.');
        // The nearest folder that exists is named with what it holds; .joe, like node_modules, is not offered.
        expect((await read({ path: 'nope/deeper/x.js' })).error).toMatch(/^nope\/deeper\/x\.js does not exist\. The project folder has: arabic\.md, assets\/, chars\.txt, /u);
    });

    it('a call without a path is refused with what to send', async () => {
        expect((await read({})).error).toBe('file_read needs "path": the file to read, relative to the project folder.');
    });
});

describe('a file too large to hold is read as a stream', () => {
    it('the window names the bytes that follow it, exactly', async () => {
        const row = (n: number) => `row ${String(n).padStart(8, '0')} ${'z'.repeat(80)}\n`;
        const count = 190_000;
        const file = fx.put('huge.log', Array.from({ length: count }, (_, i) => row(i + 1)).join(''));
        const size = fs.statSync(file).size;
        expect(size).toBeGreaterThan(16 * 1024 * 1024);
        const r = await read({ path: 'huge.log', offset: 3, limit: 2 });
        expect(r.ok).toBe(true);
        expect(r.output.text.split('\n').slice(0, 2)).toEqual([`     3\t${row(3).trimEnd()}`, `     4\t${row(4).trimEnd()}`]);
        expect(r.output.bytesAfter).toBe(size - 4 * Buffer.byteLength(row(1)));
        expect(r.output.totalLines).toBeNull();
        expect(r.output.text.split('\n').pop()).toMatch(/^\[huge\.log: lines 3-4 of a 1\d\.\d MB file; 1\d\.\d MB follow these lines\. The file is larger than 16\.0 MB, so its lines are not counted\. Continue with offset=5\.\]$/u);
    });
});
