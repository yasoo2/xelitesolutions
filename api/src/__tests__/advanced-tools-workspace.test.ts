import fs from 'fs';
import os from 'os';
import path from 'path';
import { DocumentationGeneratorTool, TestGeneratorTool } from '../modules/tools/definitions/AdvancedTools';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('DocumentationGeneratorTool workspace-bound contract', () => {
    let workspaceRoot = '';
    let activeRootSpy: jest.SpyInstance;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-doc-generator-'));
        fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
    });

    afterEach(() => {
        activeRootSpy.mockRestore();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('resolves a relative source path from the active workspace rather than API cwd', async () => {
        fs.writeFileSync(
            path.join(workspaceRoot, 'src', 'service.js'),
            'export function createService() { return true; }\n',
        );

        const result: any = await new DocumentationGeneratorTool().execute({
            filePath: 'src/service.js',
            outputFormat: 'markdown',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(true);
        expect(result.output.outputPath).toBe(path.join(workspaceRoot, 'src', 'service.md'));
        expect(fs.existsSync(path.join(workspaceRoot, 'src', 'service.md'))).toBe(true);
        expect(fs.readFileSync(path.join(workspaceRoot, 'src', 'service.md'), 'utf8')).toContain('# service.js');
    });

    it('rejects a path outside the active workspace before reading it', async () => {
        const result: any = await new DocumentationGeneratorTool().execute({
            filePath: '../outside.js',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('path_outside_workspace');
    });
});


describe('TestGeneratorTool matches the project runner and source layout', () => {
    let workspaceRoot = '';
    let activeRootSpy: jest.SpyInstance;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-test-generator-'));
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
    });

    afterEach(() => {
        activeRootSpy.mockRestore();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('generates a runnable native Node test for a CommonJS source file', async () => {
        fs.mkdirSync(path.join(workspaceRoot, 'src', 'services'), { recursive: true });
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
            name: 'native-node-project',
            scripts: { test: 'node --test' },
        }));
        fs.writeFileSync(
            path.join(workspaceRoot, 'src', 'services', 'weatherService.js'),
            "module.exports = function weatherService() { return true; };\n",
        );

        const result: any = await new TestGeneratorTool().execute({
            filePath: 'src/services/weatherService.js',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(true);
        expect(result.output.runner).toBe('node');
        expect(result.output.testFilePath).toBe(path.join(workspaceRoot, 'src', 'services', '__tests__', 'weatherService.test.js'));
        const generated = fs.readFileSync(result.output.testFilePath, 'utf8');
        expect(generated).toContain("require('node:test')");
        expect(generated).toContain("require('../weatherService.js')");
        expect(generated).not.toContain('@jest/globals');
    });

    it('uses a project-declared TypeScript runner and extensionless TS import', async () => {
        fs.mkdirSync(path.join(workspaceRoot, 'src', 'lib'), { recursive: true });
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
            name: 'vitest-project',
            scripts: { test: 'vitest run' },
            devDependencies: { vitest: '^2.0.0' },
        }));
        fs.writeFileSync(
            path.join(workspaceRoot, 'src', 'lib', 'math.ts'),
            'export function add(a: number, b: number) { return a + b; }\n',
        );

        const result: any = await new TestGeneratorTool().execute({
            filePath: 'src/lib/math.ts',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(true);
        expect(result.output.runner).toBe('vitest');
        const generated = fs.readFileSync(result.output.testFilePath, 'utf8');
        expect(result.output.testFilePath).toBe(path.join(workspaceRoot, 'src', 'lib', '__tests__', 'math.test.ts'));
        expect(generated).toContain("from 'vitest'");
        expect(generated).toContain("from '../math'");
        expect(generated).not.toContain("from '../math.ts'");
    });

    it('reports an honest, non-fatal skip when node cannot transpile a TypeScript source', async () => {
        fs.mkdirSync(path.join(workspaceRoot, 'src', 'lib'), { recursive: true });
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
            name: 'native-node-with-ts-source',
            scripts: { test: 'node --test' },
        }));
        const sourcePath = path.join(workspaceRoot, 'src', 'lib', 'math.ts');
        fs.writeFileSync(sourcePath, 'export function add(a: number, b: number) { return a + b; }\\n');

        const result: any = await new TestGeneratorTool().execute({
            filePath: 'src/lib/math.ts',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(true);
        expect(result.output).toMatchObject({
            generated: false,
            skipped: true,
            runner: 'node',
            sourceExt: '.ts',
        });
        expect(result.output.reason).toContain('node --test cannot execute TypeScript/TSX');
        expect(result.logs).toEqual(expect.arrayContaining([
            expect.stringContaining('test_runner_unsupported'),
        ]));
        expect(fs.existsSync(path.join(workspaceRoot, 'src', 'lib', '__tests__', 'math.test.ts'))).toBe(false);
    });
});
