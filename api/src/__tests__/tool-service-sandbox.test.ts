/**
 * The alias layer in ToolService.
 *
 * The model does not always call a tool by its registered name. This layer maps
 * `file_write` → `write_file`, `view_file` → `read_file` and so on, and while it
 * is there it rewrites the path argument to an absolute one. That makes it a
 * containment boundary whether or not it was designed as one — and it had its
 * own hand-rolled check with two holes:
 *
 *   - `abs.startsWith(root)` admits a SIBLING that shares a prefix: a root of
 *     "/srv/joe" accepted "/srv/joe-backup/anything".
 *   - the destination directory was created BEFORE the check, so a correctly
 *     refused write still left attacker-chosen directories across the disk.
 *
 * These drive the real `executeTool`, entered through the firewall's own
 * `runInContext` — the same door the orchestrator uses, not a way around it.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { executeTool } from '../modules/services/ToolService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { workspaceService } from '../modules/services/WorkspaceService';

/** Run a tool the way the orchestrator does. */
const run = (name: string, input: any, context?: any) =>
    executionFirewall.runInContext(undefined, () => executeTool(name, input, context)) as Promise<any>;

/**
 * A caller a write is allowed to be attributed to.
 *
 * The workspace is named explicitly rather than left to default, because
 * `getActiveRoot()` with no id answers with a fallback root — so a test that
 * omitted it would be checking a different directory from the one the tool
 * wrote to, and would fail for a reason that has nothing to do with the guard.
 */
const WORKSPACE = 'default-workspace';
const AS_USER = { userId: 'test-user', workspaceId: WORKSPACE };

const landsAt = (rel: string) => path.resolve(workspaceService.getActiveRoot(WORKSPACE), rel);
const DIR = '__tool_service_test__';

/** The outermost directory the resolver permits, derived as the resolver does. */
const outermostAllowed = (() => {
    const parts = process.cwd().split(path.sep);
    const i = parts.indexOf('api');
    return i === -1 ? process.cwd() : (parts.slice(0, i).join(path.sep) || path.sep);
})();

afterAll(() => { try { fs.rmSync(landsAt(DIR), { recursive: true, force: true }); } catch { } });

describe('the write aliases are contained', () => {
    it.each(['file_write', 'write_to_file', 'create_file'])('%s refuses an absolute path outside the workspace', async (alias) => {
        const target = path.join(os.tmpdir(), `joe-${alias}-escape-${process.pid}.txt`);

        const res: any = await run(alias, { path: target, content: 'owned' });

        expect(res.ok).toBe(false);
        expect(String(res.error)).toMatch(/path_outside_workspace/);
        expect(fs.existsSync(target)).toBe(false);
    });

    it('refuses a sibling directory that merely shares a string prefix', async () => {
        // This is the case `startsWith` let through, and it is not exotic: a
        // "joe-backup" beside "joe" is what a backup script creates.
        const target = outermostAllowed + '-evil/payload.txt';

        const res: any = await run('file_write', { path: target, content: 'owned' });

        expect(res.ok).toBe(false);
        expect(String(res.error)).toMatch(/path_outside_workspace/);
        expect(fs.existsSync(outermostAllowed + '-evil')).toBe(false);
    });

    it('does not create the destination directory of a write it refuses', async () => {
        const dir = path.join(os.tmpdir(), `joe-ts-mkdir-${process.pid}`);
        try {
            await run('file_write', { path: path.join(dir, 'deep', 'f.txt'), content: 'x' });
            expect(fs.existsSync(dir)).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('still writes through the alias when the path is inside the workspace', async () => {
        const rel = path.join(DIR, 'via-alias.txt');

        const res: any = await run('file_write', { path: rel, content: 'written' }, AS_USER);

        expect(res.ok).toBe(true);
        expect(fs.readFileSync(landsAt(rel), 'utf-8')).toBe('written');
    });

    it('refuses an unattributed write even when the path is fine', async () => {
        // Containment and attribution are separate guarantees, and the order
        // matters for what the agent is told: an escape must read as an escape,
        // not as a missing login.
        const res: any = await run('file_write', { path: path.join(DIR, 'anon.txt'), content: 'x' });

        expect(res.ok).toBe(false);
        expect(res.error).toBe('unauthorized');
        expect(fs.existsSync(landsAt(path.join(DIR, 'anon.txt')))).toBe(false);
    });
});

describe('the read and edit aliases are contained', () => {
    it.each(['file_read', 'view_file', 'get_file'])('%s refuses to read /etc/passwd', async (alias) => {
        const res: any = await run(alias, { filePath: '/etc/passwd' });

        expect(res.ok).toBe(false);
        expect(String(res.error)).toMatch(/path_outside_workspace/);
        expect(JSON.stringify(res.output ?? '')).not.toMatch(/root:/);
    });

    it('edit_file refuses an absolute path and leaves the file untouched', async () => {
        const dir = path.join(os.tmpdir(), `joe-ts-edit-${process.pid}`);
        fs.mkdirSync(dir, { recursive: true });
        const victim = path.join(dir, 'victim.txt');
        fs.writeFileSync(victim, 'original', 'utf-8');
        try {
            const res: any = await run('edit_file', { filePath: victim, find: 'original', replace: 'owned' });

            expect(res.ok).toBe(false);
            expect(String(res.error)).toMatch(/path_outside_workspace/);
            expect(fs.readFileSync(victim, 'utf-8')).toBe('original');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('the firewall in front of all of it', () => {
    it('refuses a tool call made outside the orchestrator context', async () => {
        // The containment tests above deliberately enter the authorized context.
        // This one proves that door is the only one — otherwise the tests would
        // be measuring a boundary that anything can walk around.
        await expect(executeTool('file_read', { path: 'package.json' }))
            .rejects.toThrow(/Execution bypass detected/);
    });
});
