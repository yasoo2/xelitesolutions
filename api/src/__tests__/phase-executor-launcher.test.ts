import fs from 'fs';
import os from 'os';
import path from 'path';
import { recoverMissingNpmLauncher } from '../modules/tools/definitions/PhaseExecutorTool';

describe('PhaseExecutor manifest-aware npm launcher recovery', () => {
    let workspaceRoot: string;
    const previousRoot = process.env.JOE_WORKSPACE_ROOT;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-launcher-'));
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
            scripts: {
                start: 'node dist/index.js',
                build: 'echo build',
            },
        }));
        process.env.JOE_WORKSPACE_ROOT = workspaceRoot;
    });

    afterEach(() => {
        if (previousRoot === undefined) delete process.env.JOE_WORKSPACE_ROOT;
        else process.env.JOE_WORKSPACE_ROOT = previousRoot;
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('selects the repository start script when a server alias is missing', () => {
        const recovery = recoverMissingNpmLauncher(
            'npm run server',
            'Start Joe System',
            '.',
        );

        expect(recovery).not.toBeNull();
        expect(recovery).toMatchObject({
            command: 'npm run start',
            script: 'start',
            background: true,
        });
        expect(recovery?.manifest).toBe(path.join(workspaceRoot, 'package.json'));
    });

    it('does not rewrite an npm script that the manifest already defines', () => {
        const recovery = recoverMissingNpmLauncher(
            'npm run build',
            'Build the API',
            '.',
        );

        expect(recovery).toBeNull();
    });

    it('does not invent a launcher for a non-launch task', () => {
        const recovery = recoverMissingNpmLauncher(
            'npm run missing-test',
            'Execute the required test suite',
            '.',
        );

        expect(recovery).toBeNull();
    });
});
