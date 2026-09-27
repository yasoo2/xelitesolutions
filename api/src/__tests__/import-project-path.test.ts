import fs from 'fs';
import os from 'os';
import path from 'path';
import { ImportProjectTool } from '../modules/tools/definitions/ImportProjectTool';

/**
 * import_project must resolve a LOCAL folder the same way every other tool
 * resolves paths: relative to the session workspace, never to the server
 * process directory, and never outside the workspace. Proven by EVAL-001:
 * a real Joe run passed path 'shelfspace' (present in the workspace) and
 * the tool answered no_such_path because it checked process.cwd() instead.
 */
describe('import_project local path resolution', () => {
    let sandbox: string;
    let extRoot: string;
    let wsRoot: string;
    let wsId: string;
    let tool: ImportProjectTool;
    let wsSeq = 0;
    const OLD_ENV = { ...process.env };

    beforeEach(() => {
        wsSeq += 1;
        wsId = `wspath${wsSeq}`;
        sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-import-path-'));
        extRoot = path.join(sandbox, 'projects');
        wsRoot = path.join(extRoot, wsId);
        fs.mkdirSync(path.join(wsRoot, 'proj'), { recursive: true });
        // A package WITHOUT a test script: the audit must stay offline and fast.
        fs.writeFileSync(
            path.join(wsRoot, 'proj', 'package.json'),
            JSON.stringify({ name: 'proj', version: '1.0.0' }),
        );
        fs.writeFileSync(path.join(wsRoot, 'proj', 'README.md'), '# proj\n');
        process.env.PERSISTENCE_MODE = 'JSON';
        process.env.EXTERNAL_PROJECTS_DIR = extRoot;
        process.env.JOE_CHAT_STORE_DIR = path.join(sandbox, 'db');
        process.env.JOE_WORKSPACE_ROOT = '';
        tool = new ImportProjectTool();
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        jest.spyOn(console, 'info').mockImplementation(() => undefined);
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.env = { ...OLD_ENV };
        jest.restoreAllMocks();
        fs.rmSync(sandbox, { recursive: true, force: true });
    });

    it('opens a relative folder inside the session workspace', async () => {
        const r = await tool.execute(
            { request: 'open it', path: 'proj' },
            { sessionId: 's1', workspaceId: wsId } as any,
        );
        expect(r.ok).toBe(true);
        expect((r as any).output.dir).toBe(path.join(wsRoot, 'proj'));
    });

    it('resolves harmless dot segments inside the workspace', async () => {
        const r = await tool.execute(
            { request: 'open it', path: 'sub/../proj' },
            { sessionId: 's1', workspaceId: wsId } as any,
        );
        expect(r.ok).toBe(true);
        expect((r as any).output.dir).toBe(path.join(wsRoot, 'proj'));
    });

    it('accepts the ToolService __workspaceId call shape', async () => {
        const r = await tool.execute(
            { request: 'open it', path: 'proj', __workspaceId: wsId },
            { sessionId: 's1' } as any,
        );
        expect(r.ok).toBe(true);
        expect((r as any).output.dir).toBe(path.join(wsRoot, 'proj'));
    });

    it('keeps no_such_path for a genuinely missing folder', async () => {
        const r = await tool.execute(
            { request: 'open it', path: 'nope' },
            { sessionId: 's1', workspaceId: wsId } as any,
        );
        expect(r.ok).toBe(false);
        expect(String((r as any).error || '')).toMatch(/^no_such_path: nope/);
    });

    it('accepts an absolute path contained in the workspace', async () => {
        const r = await tool.execute(
            { request: 'open it', path: path.join(wsRoot, 'proj') },
            { sessionId: 's1', workspaceId: wsId } as any,
        );
        expect(r.ok).toBe(true);
        expect((r as any).output.dir).toBe(path.join(wsRoot, 'proj'));
    });

    it('refuses an absolute path outside every allowed root', async () => {
        const outside = path.join(path.parse(os.tmpdir()).root, 'joe-import-escape-probe-nonexistent');
        const r = await tool.execute(
            { request: 'open it', path: outside },
            { sessionId: 's1', workspaceId: wsId } as any,
        );
        expect(r.ok).toBe(false);
        expect(String((r as any).error || '')).toMatch(/path_outside_workspace/);
    });

    it('refuses a traversal that escapes the workspace', async () => {
        const r = await tool.execute(
            { request: 'open it', path: 'proj/../../../../../../../escape-probe-nonexistent' },
            { sessionId: 's1', workspaceId: wsId } as any,
        );
        expect(r.ok).toBe(false);
        expect(String((r as any).error || '')).toMatch(/path_outside_workspace/);
    });
});
