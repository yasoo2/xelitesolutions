import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { GitLocalWorkflowTool } from '../modules/tools/definitions/GitLocalWorkflowTool';

function git(dir: string, args: string[]): string {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

describe('GitLocalWorkflowTool — bounded post-import work', () => {
    let repo = '';
    const sessionId = 'git-local-workflow-test';

    beforeEach(() => {
        repo = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-git-workflow-'));
        git(repo, ['init']);
        git(repo, ['config', 'user.email', 'joe-test@example.invalid']);
        git(repo, ['config', 'user.name', 'Joe Test']);
        fs.writeFileSync(path.join(repo, 'README.md'), '# Temporary repository\n');
        git(repo, ['add', 'README.md']);
        git(repo, ['commit', '-m', 'chore: initial']);
        (global as any).joeProjects = (global as any).joeProjects || {};
        (global as any).joeProjects[sessionId] = { dir: repo, type: 'imported' };
    });

    afterEach(() => {
        delete (global as any).joeProjects?.[sessionId];
        fs.rmSync(repo, { recursive: true, force: true });
    });

    it('creates exactly the requested documentation change and a local commit without a remote publish', async () => {
        const request = 'أنشئ فرعاً محلياً بالاسم joe/validation-smoke وأضف docs/agent-validation/joe-git-publish-smoke.md ثم أنشئ commit محلياً فقط ولا تنفذ git push.';
        const result: any = await new GitLocalWorkflowTool().execute({ request }, { sessionId });

        expect(result.ok).toBe(true);
        expect(result.output).toMatchObject({
            directory: repo,
            branch: 'joe/validation-smoke',
            documentationPath: 'docs/agent-validation/joe-git-publish-smoke.md',
            pushed: false,
            remotePublication: 'not_performed',
        });
        expect(fs.existsSync(path.join(repo, result.output.documentationPath))).toBe(true);
        expect(git(repo, ['branch', '--show-current'])).toBe('joe/validation-smoke');
        expect(git(repo, ['status', '--short'])).toBe('');
        expect(git(repo, ['show', '--format=%s', '--no-patch', 'HEAD'])).toBe('docs: add Joe Git validation smoke note');
        expect(git(repo, ['remote'])).toBe('');
        expect(result.logs).toEqual(expect.arrayContaining(['remote_publish=skipped_by_design']));
    });

    it('refuses to work if the imported checkout is already dirty', async () => {
        fs.writeFileSync(path.join(repo, 'unrelated.txt'), 'untracked\n');
        const result: any = await new GitLocalWorkflowTool().execute({ request: 'أنشئ فرعاً محلياً باسم joe/dirty-check وأنشئ commit' }, { sessionId });
        expect(result.ok).toBe(false);
        expect(result.error).toBe('imported_repository_not_clean');
        expect(git(repo, ['branch', '--show-current'])).not.toBe('joe/dirty-check');
    });
});
