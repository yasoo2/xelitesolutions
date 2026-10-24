import fs from 'fs';
import os from 'os';
import path from 'path';
import { rebaseLeadingCd } from '../modules/tools/runtime-artifact-path';
import { inheritRuntimeProjectArguments } from '../modules/tools/definitions/PhaseExecutorTool';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Eval round 15, 2026-10-24 (P201, 102 min): the planner wrote
 * «cd dental-clinic-store && npm install react react-dom» relative to the
 * workspace, while the executor had already set cwd to the project itself.
 * cmd looked for dental-clinic-store\dental-clinic-store, answered only «The
 * system cannot find the path specified.», and the build stopped at 2/5
 * phases with nothing in the error to say which path was missing.
 */
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

function workspace(): { ws: string; root: string } {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-cd-'));
    roots.push(ws);
    const root = path.join(ws, 'dental-clinic-store');
    fs.mkdirSync(path.join(root, 'client'), { recursive: true });
    return { ws, root };
}

describe('a leading cd into the project is rebased onto the runtime root', () => {
    it('the P201 command runs in the project root without its cd', () => {
        const { root } = workspace();
        expect(rebaseLeadingCd('cd dental-clinic-store && npm install react react-dom', root, 'dental-clinic-store', root))
            .toEqual({ command: 'npm install react react-dom', cwd: root });
    });
    it('a sub-folder after the project label, a quoted spaced label and a plain sub-folder all land inside', () => {
        const { root } = workspace();
        expect(rebaseLeadingCd('cd dental-clinic-store/client && npm run build', root, 'dental-clinic-store', root))
            .toEqual({ command: 'npm run build', cwd: path.join(root, 'client') });
        expect(rebaseLeadingCd('cd "Dental Clinic Store" && npm test', root, 'dental-clinic-store', root))
            .toEqual({ command: 'npm test', cwd: root });
        expect(rebaseLeadingCd('cd client && npm i', root, 'dental-clinic-store', root))
            .toEqual({ command: 'npm i', cwd: path.join(root, 'client') });
        expect(rebaseLeadingCd('cd /d client && cd .. && npm test', root, 'dental-clinic-store', root))
            .toEqual({ command: 'npm test', cwd: root });
    });
    it('a real folder named like the project is entered, not read as a label', () => {
        const { root } = workspace();
        fs.mkdirSync(path.join(root, 'dental-clinic-store'));
        expect(rebaseLeadingCd('cd dental-clinic-store && npm i', root, 'dental-clinic-store', root))
            .toEqual({ command: 'npm i', cwd: path.join(root, 'dental-clinic-store') });
    });
    it('nothing that leaves the root, does not exist, or has nothing to run is rebased', () => {
        const { root } = workspace();
        expect(rebaseLeadingCd('cd .. && dir', root, 'dental-clinic-store', root)).toBeNull();
        expect(rebaseLeadingCd('cd nowhere && npm i', root, 'dental-clinic-store', root)).toBeNull();
        expect(rebaseLeadingCd('npm install', root, 'dental-clinic-store', root)).toBeNull();
        expect(rebaseLeadingCd('cd client', root, 'dental-clinic-store', root)).toBeNull();
    });
    it('the phase executor applies it to shell_execute before the command runs', () => {
        const { root } = workspace();
        const logs: string[] = [];
        const planned: Record<string, any> = { command: 'cd dental-clinic-store && npm install react react-dom' };
        inheritRuntimeProjectArguments('shell_execute', planned, { projectRoot: root, projectName: 'dental-clinic-store', projectRootRuntimeBound: true }, logs);
        expect(planned).toMatchObject({ command: 'npm install react react-dom', cwd: root });
        expect(logs.join('\n')).toContain('rebased leading cd');
    });
});

describe('a failed shell command says which command and where', () => {
    it('the error names the command and its cwd, not only the shell sentence', async () => {
        const { ws, root } = workspace();
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(ws);
        const result: any = await executionFirewall.runInContext('shell-error-names-path', () =>
            new ShellExecuteTool().execute({ command: 'cd missing-folder-p201 && echo hi', cwd: root }));
        expect(result.ok).toBe(false);
        expect(String(result.error)).toContain('missing-folder-p201');
        expect(String(result.error)).toContain(root);
    }, 60_000);
});
