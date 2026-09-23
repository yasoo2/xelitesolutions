import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { executeTool } from '../modules/services/ToolService';
import { workspaceService } from '../modules/services/WorkspaceService';
import { durableReadCommand } from '../core/quality/local-backend-evidence';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

it.each(['json', 'sqlite'])('runs the fixed %s reader through ToolService with encoded data and the real shell result contract', async backend => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe backend gateway '));
    const backendRoot = path.join(root, "backend with 'quotes' & spaces");
    fs.mkdirSync(backendRoot);
    const expected = { title: "quotes ' and \" ; & echo SHOULD_NOT_EXECUTE | $(whoami) `test`" };
    fs.writeFileSync(path.join(backendRoot, 'data.json'), JSON.stringify({ rows: [{ id: 1, ...expected }] }));
    if (backend === 'sqlite') {
        execFileSync(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(${JSON.stringify(path.join(backendRoot, 'data.db'))});db.exec('CREATE TABLE records(id INTEGER PRIMARY KEY,title TEXT)');db.prepare('INSERT INTO records VALUES(?,?)').run(1,${JSON.stringify(expected.title)});db.close();`], { stdio: 'pipe' });
    }
    const context = { workspaceId: 'backend-proof-fixture', sessionId: `backend-proof-${Date.now()}`,
        userId: 'backend-proof-user', runId: 'backend-proof-run' };
    const scope = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
    try {
        const proofContext = { ...context, workspaceRoot: root, backendRoot, resource: 'records' };
        const command = durableReadCommand(proofContext, backend, 1, expected)!;
        expect(command).not.toContain('SHOULD_NOT_EXECUTE');
        expect(command).not.toContain(backendRoot);
        const run = (command: string) => executionFirewall.runInContext(context.runId,
            () => executeTool('shell_execute', { command, cwd: backendRoot, timeout: 15000 }, context), context);
        const result: any = await run(command);
        expect({ ok: result.ok, error: result.error }).toEqual({ ok: true, error: undefined });
        expect(result.output.exitCode).toBe(0);
        expect(result.output.stdout.trim()).toBe('JOE_BACKEND_DURABLE_MATCH');
        const wrong = durableReadCommand(proofContext, backend, 1, { title: 'not the saved value' })!;
        const failed: any = await run(wrong);
        expect(failed.ok).toBe(false);
        expect(failed.output.exitCode).not.toBe(0);
    } finally {
        scope.mockRestore();
        fs.rmSync(root, { recursive: true, force: true });
    }
}, 45000);
