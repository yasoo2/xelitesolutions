/**
 * «npm preflight completed but local binary is still missing: vite».
 *
 * P001-landing-ar (run500, run-1793027826564). The plan scaffolded
 * `"scripts": { "build": "vite build" }` with `"dependencies": { "vue" }` only,
 * and a vite.config.js beginning `import { defineConfig } from 'vite'`. After
 * `npm install` vite was still absent, so the npm preflight stopped the build
 * phase and project_run refused «I will not install or invent an undeclared
 * package». Self-fix had no file to repair; the build ended 0/5.
 *
 * The class: a manifest script runs a program that no declared package
 * provides. The project's own import of a package by that exact name is the
 * evidence of which package it is, and npm_manager's `providesBin` makes the
 * registry prove that release ships the program. The program name alone is
 * never enough: the registry's `tsc` is not TypeScript.
 */
jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executeTool } from '../modules/services/ToolService';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { ProjectRunTool } from '../modules/tools/definitions/ProjectRunTool';
import { NpmManagerTool } from '../modules/tools/definitions/SystemTools';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { importedPackageForScriptBinary } from '../modules/tools/script-binary-provider';

const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

// P001's scaffold, file for file where it matters.
function writeP001Project(root: string, script = 'vite build') {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        name: 'clinic-landing-ar',
        type: 'module',
        scripts: { dev: 'vite', build: script, preview: 'vite preview' },
        dependencies: { vue: '^3.4.0' },
    }));
    fs.writeFileSync(path.join(root, 'vite.config.js'), "import { defineConfig } from 'vite';\nexport default defineConfig({ base: './', build: { outDir: 'dist' } });");
    fs.writeFileSync(path.join(root, 'index.html'), '<!DOCTYPE html><html lang="ar" dir="rtl"><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>');
    fs.writeFileSync(path.join(root, 'src', 'main.js'), "import { createApp } from 'vue';\nimport App from './App.vue';\ncreateApp(App).mount('#app');");
}

function installBin(root: string, name: string) {
    const binDir = path.join(root, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, name), '#!/usr/bin/env node\n');
    fs.writeFileSync(path.join(binDir, `${name}.cmd`), '@echo off\n');
}

async function runBuildPhase(root: string, workspaceId: string, sessionId: string, command = 'npm run build') {
    return new PhaseExecutorTool().execute({
        phase: {
            phaseNumber: 1,
            name: 'Project Initialization & Architecture Decision',
            tasks: [{ task: 'Run initial build to verify setup.', tool: 'shell_execute', args: { command } }],
        },
        projectContext: {
            projectName: path.basename(root),
            createsNewProject: true,
            projectRoot: root,
            projectRootRuntimeBound: true,
            sessionId,
            workspaceId,
            userId: 'user-script-binary',
        },
    }, { sessionId, workspaceId, userId: 'user-script-binary' }) as Promise<any>;
}

describe('a script program the manifest never declared', () => {
    beforeEach(() => mockedExecuteTool.mockReset());

    it('P001: installs the package the project imports by that name, from the release that declares the program', async () => {
        const workspaceId = `workspace-script-binary-${process.pid}`;
        const sessionId = `chat-script-binary-${process.pid}`;
        const root = path.join(workspaceService.getActiveRoot(workspaceId), `clinic-landing-ar-${process.pid}`);
        writeP001Project(root);
        try {
            const calls: Array<{ tool: string; input: any }> = [];
            mockedExecuteTool.mockImplementation(async (tool: string, input: any) => {
                calls.push({ tool, input });
                // The manifest's own install brings vue, not vite (as in P001).
                if (tool === 'npm_manager' && input.providesBin === 'vite') installBin(root, 'vite');
                return { ok: true, output: { stdout: 'ok' } } as any;
            });

            const result = await runBuildPhase(root, workspaceId, sessionId);

            expect(result.ok).toBe(true);
            expect(calls.map(call => call.tool)).toEqual(['npm_manager', 'npm_manager', 'shell_execute']);
            expect(calls[1].input).toMatchObject({ command: 'install', packages: ['vite'], dev: true, providesBin: 'vite', cwd: root });
            expect(result.logs.join('\n')).toContain('vite.config.js imports vite');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('never installs a package from the program name alone (the registry tsc is not TypeScript)', async () => {
        const workspaceId = `workspace-script-binary-tsc-${process.pid}`;
        const sessionId = `chat-script-binary-tsc-${process.pid}`;
        const root = path.join(workspaceService.getActiveRoot(workspaceId), `tsc-only-${process.pid}`);
        writeP001Project(root, 'tsc && vite build');
        try {
            const calls: Array<{ tool: string; input: any }> = [];
            mockedExecuteTool.mockImplementation(async (tool: string, input: any) => {
                calls.push({ tool, input });
                if (tool === 'npm_manager' && input.providesBin === 'vite') installBin(root, 'vite');
                return { ok: true, output: { stdout: 'ok' } } as any;
            });

            const result = await runBuildPhase(root, workspaceId, sessionId);

            expect(result.ok).toBe(false);
            expect(calls.some(call => call.input?.providesBin === 'tsc' || (call.input?.packages || []).includes('tsc'))).toBe(false);
            expect(calls.some(call => call.tool === 'shell_execute')).toBe(false);
            expect(result.logs.join('\n')).toContain('local binary is still missing: tsc');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('stops honestly when the registry has no release declaring the program', async () => {
        const workspaceId = `workspace-script-binary-nobin-${process.pid}`;
        const sessionId = `chat-script-binary-nobin-${process.pid}`;
        const root = path.join(workspaceService.getActiveRoot(workspaceId), `nobin-${process.pid}`);
        writeP001Project(root);
        try {
            mockedExecuteTool.mockImplementation(async (tool: string, input: any) => (
                tool === 'npm_manager' && input.providesBin
                    ? { ok: false, error: 'npm_no_release_declares_executable:vite:vite' }
                    : { ok: true, output: { stdout: 'ok' } }
            ) as any);

            const result = await runBuildPhase(root, workspaceId, sessionId);

            expect(result.ok).toBe(false);
            expect(result.logs.join('\n')).toContain('npm_no_release_declares_executable:vite:vite');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('project_run: the same evidence installs vite before launch, and the registry\'s refusal is his answer', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-script-binary-run-'));
        writeP001Project(root);
        const rootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        const inputs: any[] = [];
        const installSpy = jest.spyOn(NpmManagerTool.prototype, 'execute').mockImplementation(async (input: any) => {
            inputs.push(input);
            return { ok: false, error: 'npm_no_release_declares_executable:vite:vite', logs: [] } as any;
        });
        try {
            const result: any = await executionFirewall.runInContext('script-binary-run', () =>
                new ProjectRunTool().execute({ cwd: root }, { workspaceId: 'script-binary-run' }));
            expect(result.ok).toBe(false);
            expect(inputs).toHaveLength(1);
            expect(inputs[0]).toMatchObject({ command: 'install', packages: ['vite'], dev: true, providesBin: 'vite', cwd: root });
            expect(String(result.error)).toContain('npm_no_release_declares_executable:vite:vite');
        } finally {
            installSpy.mockRestore();
            rootSpy.mockRestore();
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 20_000);

    it('reads only the project\'s own files, and a runtime import makes it a dependency', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-script-binary-unit-'));
        try {
            fs.mkdirSync(path.join(root, 'pages'), { recursive: true });
            fs.mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true });
            fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { start: 'next start', test: 'jest' }, dependencies: { react: '^18.0.0' } }));
            fs.writeFileSync(path.join(root, 'pages', 'index.jsx'), "import Link from 'next/link';\nexport default () => <Link href='/'>home</Link>;");
            // An import inside node_modules is not the project's statement.
            fs.writeFileSync(path.join(root, 'node_modules', 'x', 'index.js'), "require('jest');");

            expect(importedPackageForScriptBinary(root, 'next')).toEqual({ packageName: 'next', dev: false, importedBy: ['pages/index.jsx'] });
            expect(importedPackageForScriptBinary(root, 'jest')).toBeNull();
            expect(importedPackageForScriptBinary(root, 'react')).toBeNull(); // declared: the install's job
            expect(importedPackageForScriptBinary(root, './bin/run')).toBeNull();
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
