import fs from 'fs';
import os from 'os';
import path from 'path';
import { executionEngine } from '../kernel/ExecutionEngine';
import { repairQuarantinedEsbuildInstall } from '../modules/tools/definitions/ReactProjectTool';

jest.setTimeout(60_000);

describe('generated-project npm quarantine boundary', () => {
    it('runs the held install script through scoped approval plus rebuild in a fresh project', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-quarantine-'));
        const fixture = path.join(root, 'fixture-esbuild');
        const project = path.join(root, 'fresh-generated-project');
        fs.mkdirSync(path.join(fixture, 'bin'), { recursive: true });
        fs.mkdirSync(project, { recursive: true });
        fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({
            name: 'esbuild', version: '0.0.0-joe-fixture',
            scripts: { install: 'node install.cjs' },
            bin: { esbuild: 'bin/esbuild.cjs' },
        }));
        fs.writeFileSync(path.join(fixture, 'install.cjs'), "require('fs').writeFileSync('install-proof.txt','rebuilt')\n");
        fs.writeFileSync(path.join(fixture, 'bin', 'esbuild.cjs'), "const fs=require('fs'),path=require('path');process.exit(fs.existsSync(path.join(__dirname,'..','install-proof.txt'))?0:9)\n");
        fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
            name: 'fresh-generated-project', private: true,
            dependencies: { esbuild: `file:${fixture.replace(/\\/g, '/')}` },
        }));

        const run = async (_cmd: string, args: string[], timeoutMs: number, idleTimeoutMs?: number) => {
            const task = executionEngine.runArgvStreaming('npm', args, {
                cwd: project,
                timeout: timeoutMs,
                idleTimeout: idleTimeoutMs,
            });
            const result = await task.done;
            return result.exitCode === 0 ? 0 : Number(result.exitCode ?? -1);
        };
        const verify = async () => {
            const task = executionEngine.runArgvStreaming('node', [path.join('node_modules', 'esbuild', 'bin', 'esbuild.cjs')], {
                cwd: project, timeout: 10_000, idleTimeout: 5_000,
            });
            const result = await task.done;
            return result.exitCode === 0;
        };

        try {
            const installTask = executionEngine.runArgvStreaming('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
                cwd: project, timeout: 30_000, idleTimeout: 10_000,
            });
            const install = await installTask.done;
            if (install.exitCode !== 0) {
                throw new Error(`fixture npm install failed: ${JSON.stringify({ exitCode: install.exitCode, error: install.error })}`);
            }
            expect(fs.existsSync(path.join(project, 'node_modules', 'esbuild', 'install-proof.txt'))).toBe(false);
            await expect(verify()).resolves.toBe(false);

            const repaired = await repairQuarantinedEsbuildInstall(project, run, verify);
            expect(repaired).toEqual({ ok: true, approvalExit: 0, rebuildExit: 0 });
            expect(fs.readFileSync(path.join(project, 'node_modules', 'esbuild', 'install-proof.txt'), 'utf8')).toBe('rebuilt');
            await expect(verify()).resolves.toBe(true);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
