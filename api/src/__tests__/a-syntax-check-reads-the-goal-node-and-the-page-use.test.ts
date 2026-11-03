/**
 * Round 21 review of the syntax gate (js-syntax-check), measured on Node 24:
 *
 *   - group 2 #1 (HIGH): `"type": "commonjs"` — what `npm init -y` writes —
 *     makes Node run server.js as CommonJS, so an ES-module server crashes at
 *     start; the gate read only the project root's manifest, saw an `import`
 *     and checked the file as a module: it passed the launch gate.
 *   - group 1 #5: with no stated type Node detects the goal; a file whose only
 *     module signal is `import.meta` or a top-level `await` runs fine and the
 *     gate failed it. A page decides for the scripts it loads: a module script
 *     (and what it imports), a classic script, a file handed to Babel.
 *   - group 1 #6: the reported line was the first containing «Error» — the
 *     probe's own path for ErrorBoundary.js, or the echoed source line.
 *   - group 1 #2: a gateway failure (queue full, timeout, spawn error) was
 *     reported as a syntax error in his file.
 *
 * Every verdict here is a real `node --check` (or esbuild) run on real files,
 * except the gateway failures, which are what the gateway returns.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { checkJavaScriptFile, checkJavaScriptSyntax, nodeDetectsModuleSyntax } from '../core/quality/js-syntax-check';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { AutoTesterTool } from '../modules/tools/definitions/AutoTesterTool';
import { workspaceService } from '../modules/services/WorkspaceService';

jest.mock('../modules/tools/utils', () => ({ resolveToolPath: (value: string) => value }));

jest.setTimeout(90_000);

const asSystem = <T>(fn: () => Promise<T>) => executionFirewall.runAsSystem(fn);
const ESM_SERVER = 'import http from "node:http";\nconsole.log(typeof http.createServer);\n';

describe('the syntax gate parses each file with the goal it is really run with', () => {
    let root: string;
    const write = (rel: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    };
    const node = (rel: string) => spawnSync(process.execPath, [rel], { cwd: root, encoding: 'utf-8' });
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-goal-')); });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

    it('HIGH: an ES-module server under "type": "commonjs" is refused, because Node crashes on it', async () => {
        write('package.json', JSON.stringify({ name: 'api', version: '1.0.0', main: 'server.js', type: 'commonjs' }));
        write('server.js', ESM_SERVER);
        // The premise, measured: Node refuses to run it.
        const ran = node('server.js');
        expect(ran.status).not.toBe(0);
        expect(ran.stderr).toMatch(/SyntaxError: Cannot use import statement outside a module/u);

        const failure = await asSystem(() => checkJavaScriptFile(root, 'server.js'));
        expect(failure).toEqual({ file: 'server.js:1', error: expect.stringMatching(/^SyntaxError: Cannot use import statement outside a module/u), kind: 'syntax' });
        const lint = await asSystem(() => checkJavaScriptSyntax(root));
        expect(lint.failure).toMatchObject({ file: 'server.js:1', kind: 'syntax' });
    });

    it('the nearest package.json above the file decides, as Node walks', async () => {
        write('package.json', JSON.stringify({ name: 'workspace', type: 'commonjs' }));
        write('api/package.json', JSON.stringify({ name: 'api', type: 'module' }));
        write('api/server.js', ESM_SERVER);
        write('tools/package.json', JSON.stringify({ name: 'tools' })); // no type: Node detects
        write('tools/run.js', ESM_SERVER);
        expect(node('api/server.js').status).toBe(0);
        expect(await asSystem(() => checkJavaScriptFile(root, 'api/server.js'))).toBeNull();
        expect(node('tools/run.js').status).toBe(nodeDetectsModuleSyntax() ? 0 : 1);
        expect(await asSystem(() => checkJavaScriptFile(root, 'tools/run.js'))).toBeNull();
    });

    it('with no stated type, import.meta and a top-level await are module syntax Node runs — not broken CommonJS', async () => {
        write('package.json', JSON.stringify({ name: 'site', scripts: { start: 'node meta.js' } }));
        write('meta.js', 'console.log(import.meta.url.length > 0);\n');
        write('wait.js', 'const value = await Promise.resolve(2);\nconsole.log(value);\n');
        for (const file of ['meta.js', 'wait.js']) {
            expect({ file, status: node(file).status }).toEqual({ file, status: 0 });
            expect({ file, failure: await asSystem(() => checkJavaScriptFile(root, file)) }).toEqual({ file, failure: null });
        }
        // …while a broken file is still broken, at the line the module parse reached.
        write('broken.js', 'console.log(import.meta.url);\nconst = 1;\n');
        expect(await asSystem(() => checkJavaScriptFile(root, 'broken.js'))).toMatchObject({ file: 'broken.js:2', kind: 'syntax' });
    });

    it('a page decides for the scripts it loads: a module and its imports, a classic script, a Babel script', async () => {
        write('package.json', JSON.stringify({ name: 'site', type: 'commonjs', scripts: { start: 'node server.js' } }));
        write('server.js', "const http = require('http');\nmodule.exports = http;\n");
        write('public/index.html', [
            '<!doctype html><html><body>',
            '<script type="module" src="/js/app.js"></script>',
            '<script src="js/classic.js"></script>',
            '<script type="text/babel" data-presets="react" src="js/widget.js"></script>',
            '<script type="text/x-template" src="js/card.js"></script>',
            '</body></html>',
        ].join('\n'));
        write('public/js/app.js', "import { total } from './util.js';\nconsole.log(total);\n");
        write('public/js/util.js', 'export const total = 3;\n');
        write('public/js/classic.js', 'window.addEventListener("load", () => console.log("ready"));\n');
        write('public/js/widget.js', 'const Widget = () => <section className="w">{1 + 1}</section>;\nReactDOM.render(<Widget />, document.body);\n');
        write('public/js/card.js', '<div class="card">{{ title }}</div>\n');

        const passed = await asSystem(() => checkJavaScriptSyntax(root));
        expect(passed.failure).toBeNull();
        expect(passed.files).toEqual(['public/js/app.js', 'public/js/classic.js', 'public/js/util.js', 'public/js/widget.js', 'server.js']);
        expect(passed.notParsed).toEqual([{ file: 'public/js/card.js', why: expect.stringMatching(/text\/x-template/u) }]);

        // A classic script cannot import: the browser refuses it, and so does the gate.
        write('public/js/classic.js', "import { total } from './util.js';\nconsole.log(total);\n");
        expect((await asSystem(() => checkJavaScriptSyntax(root))).failure).toMatchObject({
            file: 'public/js/classic.js:1', kind: 'syntax', error: expect.stringMatching(/^SyntaxError: Cannot use import statement outside a module/u),
        });
        write('public/js/classic.js', 'console.log("ready");\n');
        // Broken JSX is named with the transpiler's own words.
        write('public/js/widget.js', 'const Widget = () => <section>{1 + }</section>;\n');
        expect((await asSystem(() => checkJavaScriptSyntax(root))).failure).toMatchObject({ file: 'public/js/widget.js:1', kind: 'syntax' });
    });

    it('the reported error is the parser\'s SyntaxError line — never the probe path or the echoed source', async () => {
        write('src/ErrorBoundary.js', 'const ok = 1;\nthrow new Error("boom") +;\n');
        const failure = await asSystem(() => checkJavaScriptFile(root, 'src/ErrorBoundary.js'));
        expect(failure).toEqual({ file: 'src/ErrorBoundary.js:2', error: "SyntaxError: Unexpected token ';'", kind: 'syntax' });
    });

    describe('a check that could not run is never a syntax error in his file', () => {
        const gatewaySays = (answer: any) => jest.spyOn(ExecutionGateway, 'execute').mockResolvedValue(answer);
        it.each([
            ['a full queue', { success: false, error: 'Execution queue is full. Please try again later.', data: { code: 'QUEUE_FULL' }, duration: 0 }, /queue is full/u],
            ['a spawn error', { success: true, data: { ok: false, error: 'spawn EMFILE', exitCode: 1 }, duration: 3 }, /spawn EMFILE/u],
            ['a timeout', { success: true, data: { ok: false, error: 'Execution timed out', exitCode: 124 }, duration: 8000 }, /did not finish within 8000 ms/u],
        ])('%s', async (_name, answer, reason) => {
            write('server.js', ESM_SERVER);
            gatewaySays(answer);
            const failure = await asSystem(() => checkJavaScriptFile(root, 'server.js', 8000));
            expect(failure).toEqual({ file: 'server.js', error: expect.stringMatching(/^the check could not run: /u), kind: 'unchecked' });
            expect(failure!.error).toMatch(reason);
            expect(failure!.error).not.toMatch(/syntax/iu);
        });

        it('lint keeps reading after a check that could not run, names a real rejection, and never blames the unchecked file', async () => {
            // a.cjs has one goal, so its one check is the one that cannot run.
            write('a.cjs', "module.exports = 1;\n");
            write('b.js', "const = 2;\n");
            const real = ExecutionGateway.execute.bind(ExecutionGateway);
            const gateway = jest.spyOn(ExecutionGateway, 'execute')
                .mockResolvedValueOnce({ success: false, error: 'Execution queue is full. Please try again later.', data: { code: 'QUEUE_FULL' }, duration: 0 } as any)
                .mockImplementation(real as any);
            expect((await asSystem(() => checkJavaScriptSyntax(root))).failure).toMatchObject({ file: 'b.js:1', kind: 'syntax' });
            expect(String((gateway.mock.calls[0][0] as any).payload.args[1])).toMatch(/a\.cjs-commonjs\.cjs$/u);

            fs.writeFileSync(path.join(root, 'b.js'), 'module.exports = 2;\n');
            jest.restoreAllMocks();
            gatewaySays({ success: false, error: 'Execution queue is full. Please try again later.', data: { code: 'QUEUE_FULL' }, duration: 0 });
            const result: any = await asSystem(() => new QualityRunTool().execute({ path: root, action: 'lint' }));
            expect(result.ok).toBe(false);
            const lint = result.output.results.find((r: any) => r.task === 'lint');
            expect(lint).toMatchObject({ ok: false, unchecked: true, error: expect.stringMatching(/^the check could not run: Execution queue is full/u) });
            expect(lint.error).not.toMatch(/a\.cjs|b\.js/u);
        });
    });

    it('auto_tester refuses the ES-module server under "type": "commonjs" too — the same checker', async () => {
        write('package.json', JSON.stringify({ name: 'api', type: 'commonjs' }));
        write('server.js', ESM_SERVER);
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        const result: any = await executionFirewall.runInContext('goal-tester', () => new AutoTesterTool().execute(
            { testType: 'syntax', projectPath: root, files: [path.join(root, 'server.js')] }, { workspaceId: 'goal-tester' }));
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/^Syntax error in server\.js:1: SyntaxError: Cannot use import statement outside a module/u);
        expect(result.logs.join('\n')).toMatch(/Parsing server\.js as CommonJS[^\n]*"type": "commonjs"/u);
    });
});
