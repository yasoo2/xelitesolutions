/**
 * Open item from the P001 quality_run round (FINDINGS 2026-10-26 00:30):
 * project_run's foreground syntax gate ran plain `node --check server.js`.
 * On Node 24.18 that exits ZERO for `import … ;\nconst = 1;` in a `.js` file
 * of a package without `"type": "module"` — the script parse fails and the
 * module retry swallows the error — so a broken ESM entry passed the gate and
 * died in the detached child. auto_tester's syntax check sent the same plain
 * command. Both now parse under the goal Node will run the file with, through
 * the checker lint already uses.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { checkJavaScriptFile } from '../core/quality/js-syntax-check';
import { ProjectRunTool } from '../modules/tools/definitions/ProjectRunTool';
import { AutoTesterTool } from '../modules/tools/definitions/AutoTesterTool';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { workspaceService } from '../modules/services/WorkspaceService';
import * as ToolService from '../modules/services/ToolService';

jest.setTimeout(60_000);

const BROKEN_ESM = 'import http from "node:http";\nconst = 1;\nhttp.createServer().listen(process.env.PORT);\n';
const asSystem = <T>(fn: () => Promise<T>) => executionFirewall.runAsSystem(fn);

describe('a broken ES module entry does not pass the launch gate', () => {
    let root: string;
    const write = (rel: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    };
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-esm-gate-')); });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

    it('the premise: plain node --check passes these bytes in a .js file', () => {
        write('server.js', BROKEN_ESM);
        expect(spawnSync(process.execPath, ['--check', 'server.js'], { cwd: root }).status).toBe(0);
    });

    it('checkJavaScriptFile names the file and line of broken ESM in a .js file', async () => {
        write('package.json', JSON.stringify({ scripts: { start: 'node server.js' } }));
        write('server.js', BROKEN_ESM);
        const failure = await asSystem(() => checkJavaScriptFile(root, 'server.js'));
        // The parser's own line, and a rejection — never a probe path (round 21).
        expect(failure).toEqual({ file: 'server.js:2', error: expect.stringMatching(/^SyntaxError: /u), kind: 'syntax' });
    });

    it('passes valid ESM, valid CommonJS, and fails broken CommonJS and a missing file', async () => {
        write('esm.js', 'import http from "node:http";\nexport const port = 3000;\n');
        write('cjs.js', "const http = require('http');\nmodule.exports = http;\n");
        write('broken.cjs', "const http = require('http');\nconst = 2;\n");
        expect(await asSystem(() => checkJavaScriptFile(root, 'esm.js'))).toBeNull();
        expect(await asSystem(() => checkJavaScriptFile(root, 'cjs.js'))).toBeNull();
        expect(await asSystem(() => checkJavaScriptFile(root, 'broken.cjs'))).toMatchObject({ file: 'broken.cjs:2' });
        expect(await asSystem(() => checkJavaScriptFile(root, 'gone.js'))).toMatchObject({ file: 'gone.js', error: expect.stringMatching(/^the check could not run: cannot read/u), kind: 'unchecked' });
    });

    it('project_run refuses to launch the broken entry and says where it broke', async () => {
        write('package.json', JSON.stringify({ name: 'clinic-api', scripts: { start: 'node server.js' } }));
        write('server.js', BROKEN_ESM);
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        const launch = jest.spyOn(ExecutionGateway, 'startManaged');

        const result: any = await executionFirewall.runInContext('esm-gate-test', () =>
            new ProjectRunTool().execute({ cwd: root, port: 4391 }, { workspaceId: 'esm-gate-test' }));

        expect(result.ok).toBe(false);
        expect(result.output).toMatchObject({ ready: false, verificationFailed: true });
        expect(result.error).toMatch(/runtime syntax check failed \(server\.js:2\): SyntaxError/u);
        expect(launch).not.toHaveBeenCalled();
    });

    it('auto_tester parses through the same checker: a real parse, no shell line, the parser\'s words', async () => {
        write('src/app.js', BROKEN_ESM);
        write('src/legacy.js', "module.exports = 1;\n");
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        const exec = jest.spyOn(ToolService, 'executeTool');

        const result: any = await executionFirewall.runInContext('esm-gate-tester', () => new AutoTesterTool().execute(
            { testType: 'syntax', projectPath: '.', files: ['src/app.js', 'src/legacy.js'] },
            { workspaceId: 'esm-gate-tester' }));

        expect(result.ok).toBe(false);
        expect(result.output.errors[0]).toMatchObject({ type: 'syntax' });
        expect(result.error).toMatch(/^Syntax error in src\/app\.js:2: SyntaxError: Unexpected token '='/u);
        // The shell line it used to build is gone: single quotes are not quotes to cmd.exe.
        expect(exec).not.toHaveBeenCalled();
    });
});
