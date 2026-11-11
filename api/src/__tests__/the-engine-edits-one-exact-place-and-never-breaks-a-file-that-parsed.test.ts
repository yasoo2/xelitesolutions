/**
 * THE ENGINE EDITS ONE EXACT PLACE, AND NEVER BREAKS A FILE THAT PARSED.
 *
 * engine_file_edit, through ToolService.executeTool with a real run context.
 * old_text is sought in the order Codex's seek_sequence uses: exact, then with
 * the file's line endings, then line by line with trailing whitespace
 * ignored, then with indentation ignored, and the first pass that finds
 * anything decides. Several matches without replace_all are refused with
 * every line number. The new text takes the file's line ending. An edit that
 * would stop a file that parsed from parsing is refused and the file keeps
 * its bytes (sha256). The answer carries a bounded diff from the diff package.
 */
import path from 'path';
import { fileToolsFixture, pngHeader, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.setTimeout(120_000);

let fx: FileToolsFixture;
const APP = 'const a = 1;\nfunction add(x, y) {\n  return x + y;\n}\nmodule.exports = { add };\n';
const LIST = 'start();\nitem();\nmid();\nmid2();\nitem();\nend();\nx();\ny();\nitem();\n';
const PACKAGE = '{\n  "name": "shop",\n  "version": "1.0.0"\n}\n';
beforeAll(() => {
    fx = fileToolsFixture('edit');
    fx.put('src/app.js', APP);
    fx.put('win.txt', 'alpha\r\nbeta\r\ngamma\r\n');
    fx.put('ws.js', 'foo();   \nbar();\n');
    fx.put('calc.py', 'def f(x):\n    if x:\n        return 1\n    return 2\n');
    fx.put('odd.py', 'def g():\n    a = 1\n      b = 2\n');
    fx.put('list.js', LIST);
    fx.put('broken.js', 'const a = ;\nconst b = 1;\n');
    fx.put('package.json', PACKAGE);
    fx.put('bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello world\n')]));
    fx.put('crlf2.txt', 'one\r\ntwo\r\nthree\r\n');
    fx.put('big.txt', Array.from({ length: 300 }, (_, i) => `v ${i + 1}`).join('\n') + '\n');
    fx.put('ui.js', 'a\nb\nc\n');
    fx.put('list.html', '<ul>\n  <li>a</li>\n</ul>\n');
    fx.put('logo.png', pngHeader(16, 16));
    fx.put('u16.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('text\r\n', 'utf16le')]));
});
afterAll(() => fx.cleanup());

const edit = (input: Record<string, unknown>) => fx.run('engine_file_edit', input);

describe('old_text is found strictest first', () => {
    it('an exact match is replaced, and the answer is the diff of the change', async () => {
        const r = await edit({ path: 'src/app.js', old_text: '  return x + y;', new_text: '  return x + y + a;' });
        expect(r.ok).toBe(true);
        expect(r.output.text).toBe([
            'Edited src/app.js: replaced 1 occurrence at line 3 (exact match).',
            '--- a/src/app.js',
            '+++ b/src/app.js',
            '@@ -1,5 +1,5 @@',
            ' const a = 1;',
            ' function add(x, y) {',
            '-  return x + y;',
            '+  return x + y + a;',
            ' }',
            ' module.exports = { add };',
            'JavaScript syntax OK.',
        ].join('\n'));
        expect(r.output).toMatchObject({ path: 'src/app.js', change: 'modified', replacements: 1, matchedBy: 'exact', parses: true });
        expect(fx.text('src/app.js')).toBe(APP.replace('x + y;', 'x + y + a;'));
    });

    it('LF old_text finds CRLF lines, and the new text is written with CRLF', async () => {
        const r = await edit({ path: 'win.txt', old_text: 'alpha\nbeta', new_text: 'ALPHA\nBETA' });
        expect(r.output.text.split('\n')[0]).toBe('Edited win.txt: replaced 1 occurrence at line 1 (matched after giving old_text the file\'s line endings).');
        expect(fx.text('win.txt')).toBe('ALPHA\r\nBETA\r\ngamma\r\n');
    });

    it('trailing whitespace is forgiven line by line', async () => {
        const r = await edit({ path: 'ws.js', old_text: 'foo();\nbar();', new_text: 'foo(1);\nbar(2);' });
        expect(r.output.matchedBy).toBe('trailing whitespace ignored');
        expect(fx.text('ws.js')).toBe('foo(1);\nbar(2);\n');
    });

    it('indentation is forgiven last, and the new text is shifted to the file\'s indentation', async () => {
        const r = await edit({ path: 'calc.py', old_text: 'if x:\n    return 1', new_text: 'if x:\n    return 10' });
        expect(r.output.text.split('\n')[0]).toBe('Edited calc.py: replaced 1 occurrence at line 2 (matched with indentation ignored; new_text was re-indented to the file\'s indentation).');
        expect(fx.text('calc.py')).toBe('def f(x):\n    if x:\n        return 10\n    return 2\n');
    });

    it('when the indentation does not differ evenly, nothing is guessed: new_text goes in as given', async () => {
        const r = await edit({ path: 'odd.py', old_text: 'a = 1\nb = 2', new_text: 'a = 10\nb = 20' });
        expect(r.output.text.split('\n')[0]).toBe('Edited odd.py: replaced 1 occurrence at line 2 (matched with indentation ignored; new_text was inserted as given).');
        expect(fx.text('odd.py')).toBe('def g():\na = 10\nb = 20\n');
    });

    it('the new text takes the file\'s dominant line ending', async () => {
        await edit({ path: 'crlf2.txt', old_text: 'two', new_text: '2a\n2b' });
        expect(fx.text('crlf2.txt')).toBe('one\r\n2a\r\n2b\r\nthree\r\n');
    });

    it('a byte order mark stays where it was', async () => {
        await edit({ path: 'bom.txt', old_text: 'world', new_text: 'there' });
        expect(fx.bytes('bom.txt').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
        expect(fx.text('bom.txt')).toBe('\uFEFFhello there\n');
    });
});

describe('one place, or every place when asked', () => {
    it('several matches without replace_all are refused with the count and each line, and the file keeps its bytes', async () => {
        const before = fx.sha('list.js');
        const r = await edit({ path: 'list.js', old_text: 'item();', new_text: 'item(1);' });
        expect(r).toMatchObject({ ok: false, error: 'old_text matches 3 places in list.js (lines 2, 5, 9). Include more of the surrounding lines so it matches exactly one place, or set replace_all to true to change all 3.' });
        expect(fx.sha('list.js')).toBe(before);
    });

    it('replace_all changes every one and names their lines', async () => {
        const r = await edit({ path: 'list.js', old_text: 'item();', new_text: 'item(1);', replace_all: true });
        expect(r.output.text.split('\n')[0]).toBe('Edited list.js: replaced 3 occurrences at lines 2, 5, 9 (exact match).');
        expect(fx.text('list.js')).toBe(LIST.split('item();').join('item(1);'));
    });

    it('a large change gets a bounded diff that counts what it leaves out', async () => {
        const r = await edit({ path: 'big.txt', old_text: 'v ', new_text: 'w ', replace_all: true });
        const lines = r.output.text.split('\n');
        expect(lines[0]).toMatch(/^Edited big\.txt: replaced 300 occurrences at lines 1, 2, 3, .*, 50, and 250 more \(exact match\)\.$/u);
        expect(lines).toHaveLength(1 + 160 + 1);
        expect(lines[161]).toBe('… 443 more lines of the diff not shown. Use file_read to see the result.');
    });
});

describe('an edit never turns a file that parsed into one that does not', () => {
    it('the breaking edit is refused with the parser\'s place and words, and the file keeps its sha256', async () => {
        const before = fx.sha('src/app.js');
        const r = await edit({ path: 'src/app.js', old_text: '  return x + y + a;', new_text: '  return x + ;' });
        expect(r.ok).toBe(false);
        expect(r.error).toBe([
            'Not applied: after this edit src/app.js would not parse: line 3 col 14: Unexpected ";"',
            '  1 | const a = 1;',
            '  2 | function add(x, y) {',
            '> 3 |   return x + ;',
            '    |              ^',
            '  4 | }',
            'src/app.js is unchanged. Fix new_text (or old_text) and try again.',
        ].join('\n'));
        expect(fx.sha('src/app.js')).toBe(before);
    });

    it('JSON that parsed is held to the same rule', async () => {
        const before = fx.sha('package.json');
        const r = await edit({ path: 'package.json', old_text: '"version": "1.0.0"', new_text: '"version": "1.0.0",' });
        expect(r.error).toMatch(/^Not applied: after this edit package\.json would not parse: line 4 col 1: Expected double-quoted property name\n/u);
        expect(fx.sha('package.json')).toBe(before);
    });

    it('the destination contract holds too: a dependency npm cannot install is not edited in', async () => {
        const before = fx.sha('package.json');
        const r = await edit({ path: 'package.json', old_text: '"version": "1.0.0"', new_text: '"version": "1.0.0",\n  "dependencies": { "node:fs": "*" }' });
        expect(r.error).toMatch(/^manifest_dependency_uninstallable: package\.json declares what npm install cannot fetch: dependencies\.node:fs is a Node built-in.*\. The edit was not applied; package\.json is unchanged\.$/u);
        expect(fx.sha('package.json')).toBe(before);
    });

    it('a file that did not parse before is edited, and the error that remains is reported', async () => {
        const r = await edit({ path: 'broken.js', old_text: 'const b = 1;', new_text: 'const b = 2;' });
        expect(r.ok).toBe(true);
        expect(r.output.parses).toBe(false);
        expect(r.output.text).toContain('It did not parse before this edit and still does not: line 1 col 11: Unexpected ";"');
        expect(fx.text('broken.js')).toBe('const a = ;\nconst b = 2;\n');
    });
});

describe('when old_text is not there, the answer says what to do', () => {
    it('it names the passes tried and the lines that start like old_text', async () => {
        const r = await edit({ path: 'src/app.js', old_text: 'function add(x, y) {\n  return x * y;\n}', new_text: 'x' });
        expect(r.error).toBe('old_text was not found in src/app.js (tried: exact; the file\'s line endings; trailing whitespace ignored; indentation ignored). Lines that start like old_text: 2: "function add(x, y) {". Read the file again with file_read and copy old_text exactly as it is there.');
    });

    it('it sees old_text copied with file_read\'s line numbers', async () => {
        const numbered = await edit({ path: 'src/app.js', old_text: '     3\t  return x + y + a;', new_text: 'x' });
        expect(numbered.error).toContain('old_text starts its lines with file_read\'s line numbers; leave the numbers and the tab after them out.');
    });

    it('an edit sent again after it landed lands once: an insert-after is not doubled', async () => {
        const first = await edit({ path: 'list.html', old_text: '</ul>', new_text: '  <li>b</li>\n</ul>' });
        expect(first.ok).toBe(true);
        expect(fx.text('list.html')).toBe('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>\n');
        const before = fx.sha('list.html');
        const again = await edit({ path: 'list.html', old_text: '</ul>', new_text: '  <li>b</li>\n</ul>' });
        expect(again).toMatchObject({ ok: true, output: { alreadyApplied: true, replacements: 0, text: 'Already in place: list.html already has this edit (new_text stands where old_text was). Nothing was changed.' } });
        expect(again.output.change).toBeUndefined();
        expect(fx.sha('list.html')).toBe(before);
    });

    it('a missing file, an empty old_text, identical texts and a missing new_text are refused with the reason', async () => {
        expect((await edit({ path: 'nope.js', old_text: 'a', new_text: 'b' })).error).toMatch(/^nope\.js does not exist\. To create it, use file_write\. The project folder has: /u);
        expect((await edit({ path: 'ui.js', old_text: '', new_text: 'b' })).error).toBe('file_edit needs "old_text": the exact text to replace, copied from file_read. To create a file, use file_write.');
        expect((await edit({ path: 'ui.js', old_text: 'b', new_text: 'b' })).error).toBe('old_text and new_text are the same; the edit would change nothing.');
        expect((await edit({ path: 'ui.js', old_text: 'b' })).error).toBe('file_edit needs "new_text": the text to put in place of old_text (empty to delete it).');
    });

    it('an image or a UTF-16 file is not edited as text', async () => {
        expect((await edit({ path: 'logo.png', old_text: 'a', new_text: 'b' })).error).toBe('logo.png is an image (PNG, 16x16 pixels, 33 B). file_edit changes text files only.');
        expect((await edit({ path: 'u16.txt', old_text: 'text', new_text: 'b' })).error).toBe('u16.txt is UTF-16 LE text; file_edit changes UTF-8 files. Rewrite it as UTF-8 with file_write.');
    });
});

describe('the UI hears about it the way file_edit tells it', () => {
    it('a diff event with the new content and the removed and added lines at their real numbers', async () => {
        const { events } = await fx.events(() => edit({ path: 'ui.js', old_text: 'b', new_text: 'B' }));
        const diff = events.find(e => e.type === 'diff');
        expect(diff).toMatchObject({
            sessionId: fx.context.sessionId,
            data: {
                path: path.join(fx.project, 'ui.js'), content: 'a\nB\nc\n', additions: 1, deletions: 1,
                lines: [{ type: 'remove', content: 'b', lineNumber: 2 }, { type: 'add', content: 'B', lineNumber: 2 }],
            },
        });
    });
});
