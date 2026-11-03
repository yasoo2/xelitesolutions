/**
 * Round 21, second review — group Q (fixed in round 22), the syntax gate
 * (js-syntax-check), measured with the real parsers on Node 24:
 *
 *   - Q4: checking a subset of files lost the page's module closure: under
 *     `"type": "commonjs"`, index.html loads main.js as a module and main.js
 *     imports util.js — checked alone (auto_tester's path), util.js was read
 *     as CommonJS and its `export` was «SyntaxError: Unexpected token
 *     'export'», sending self-fix to repair a working module.
 *   - Q5: a classic page script was parsed in Node's CommonJS wrapper:
 *     `const module = …` (fine in a browser) was a redeclaration — a false
 *     failure — and a top-level `return` (refused by every browser) passed.
 *   - Q6: a commented-out `<script>` tag decided a file's goal.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkJavaScriptFiles, checkJavaScriptSyntax } from '../core/quality/js-syntax-check';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(90_000);

const asSystem = <T>(fn: () => Promise<T>) => executionFirewall.runAsSystem(fn);

describe('a page script is parsed as the browser parses it', () => {
    let root = '';
    const write = (rel: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    };
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-checks-page-')); });
    afterEach(() => { fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

    it('Q4: a module a page reaches through another module is a module when it is checked alone', async () => {
        write('package.json', JSON.stringify({ name: 'site', type: 'commonjs' }));
        write('index.html', '<!doctype html><html><body><script type="module" src="main.js"></script></body></html>');
        write('main.js', "import { total } from './util.js';\nconsole.log(total);\n");
        write('util.js', 'export const total = 3;\n');
        const alone = await asSystem(() => checkJavaScriptFiles(root, ['util.js']));
        expect(alone.failure).toBeNull();
        expect(alone.planned).toEqual([{ file: 'util.js', plan: { groups: [['module']], because: 'a page loads it as ES module' } }]);
        // It is still parsed: a broken module checked alone is refused, as a module.
        write('util.js', 'export const total = ;\n');
        expect((await asSystem(() => checkJavaScriptFiles(root, ['util.js']))).failure).toMatchObject({ file: 'util.js:1', kind: 'syntax' });
    });

    it('Q5: a classic script is a Script — `const module` passes, a top-level `return` is refused', async () => {
        write('package.json', JSON.stringify({ name: 'site' }));
        write('index.html', '<!doctype html><html><body><script src="app.js"></script></body></html>');
        write('app.js', 'const module = { ready: true };\nwindow.app = module;\n');
        expect((await asSystem(() => checkJavaScriptSyntax(root))).failure).toBeNull();

        write('app.js', 'var ready = true;\nif (ready) return;\n');
        expect((await asSystem(() => checkJavaScriptSyntax(root))).failure).toEqual({ file: 'app.js:2', error: 'SyntaxError: Illegal return statement', kind: 'syntax' });
        // The same file run by Node (no page loads it) keeps Node's own CommonJS reading.
        fs.rmSync(path.join(root, 'index.html'));
        expect((await asSystem(() => checkJavaScriptSyntax(root))).failure).toBeNull();
    });

    it('Q6: a commented-out <script> tag decides nothing', async () => {
        write('package.json', JSON.stringify({ name: 'site', type: 'commonjs' }));
        // The page moved app.js to a module and left its old classic tag commented out.
        write('index.html', [
            '<!doctype html><html><body>',
            '<!-- <script src="app.js"></script> -->',
            '<script type="module" src="app.js"></script>',
            '<!--><script src="never-a-comment-body.js"></script>',
            '</body></html>',
        ].join('\n'));
        write('app.js', "import { total } from './util.js';\nconsole.log(total);\n");
        write('util.js', 'export const total = 3;\n');
        write('never-a-comment-body.js', 'console.log("loaded");\n');
        const result = await asSystem(() => checkJavaScriptSyntax(root));
        expect(result.failure).toBeNull();
        // `<!-->` ends the comment at once, as HTML parses it: the tag after it is real.
        const planned = await asSystem(() => checkJavaScriptFiles(root, ['never-a-comment-body.js', 'app.js']));
        expect(planned.planned.map(entry => [entry.file, entry.plan?.groups])).toEqual([
            ['never-a-comment-body.js', [['script']]],
            ['app.js', [['module']]],
        ]);
    });
});
