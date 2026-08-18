import fs from 'fs';
import os from 'os';
import path from 'path';

import { AutoTesterTool } from '../modules/tools/definitions/AutoTesterTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import * as ToolService from '../modules/services/ToolService';

describe('AutoTesterTool acceptance contract', () => {
    let workspaceRoot = '';
    let activeRootSpy: jest.SpyInstance;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-auto-tester-'));
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
    });

    afterEach(() => {
        activeRootSpy.mockRestore();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('rejects an undefined or unsupported test type before execution', async () => {
        const result: any = await new AutoTesterTool().execute({
            testType: undefined as any,
            projectPath: '.',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.output).toMatchObject({ passed: false });
        expect(result.error).toContain('requires testType');
    });

    it('preserves the trusted owner when syntax testing delegates to shell_execute', async () => {
        const sourceFile = path.join(workspaceRoot, 'index.js');
        fs.writeFileSync(sourceFile, 'const answer = 42;\\n');
        const executeToolSpy = jest.spyOn(ToolService, 'executeTool').mockResolvedValue({
            ok: true,
            output: '',
            logs: []
        } as any);

        const result: any = await new AutoTesterTool().execute({
            testType: 'syntax',
            projectPath: '.',
            files: ['index.js'],
        }, {
            sessionId: 'session-nexus-19',
            workspaceId: 'workspace-nexus-19',
            userId: 'owner-nexus-19',
        });

        expect(result.ok).toBe(true);
        expect(executeToolSpy).toHaveBeenCalledWith(
            'shell_execute',
            expect.objectContaining({ cwd: workspaceRoot }),
            expect.objectContaining({
                sessionId: 'session-nexus-19',
                workspaceId: 'workspace-nexus-19',
                userId: 'owner-nexus-19',
            }),
        );
        executeToolSpy.mockRestore();
    });

    it('parses a JSON schema as JSON instead of sending it to node --check', async () => {
        const schemaFile = path.join(workspaceRoot, 'schemas', 'lifecycle_state_schema.json');
        fs.mkdirSync(path.dirname(schemaFile), { recursive: true });
        fs.writeFileSync(schemaFile, '{"type":"object","properties":{"state":{"type":"string"}}}');
        const executeToolSpy = jest.spyOn(ToolService, 'executeTool');

        const result: any = await new AutoTesterTool().execute({
            testType: 'syntax',
            projectPath: '.',
            files: ['schemas/lifecycle_state_schema.json'],
        }, { workspaceId: 'workspace-nexus-json' });

        expect(result.ok).toBe(true);
        expect(result.output.passed).toBe(true);
        expect(result.logs.join('\\n')).toContain('JSON.parse passed');
        expect(executeToolSpy).not.toHaveBeenCalled();
        executeToolSpy.mockRestore();
    });

    it('reports malformed JSON as a syntax failure without invoking a shell repair', async () => {
        const schemaFile = path.join(workspaceRoot, 'broken.json');
        fs.writeFileSync(schemaFile, '{"type":"object"');
        const executeToolSpy = jest.spyOn(ToolService, 'executeTool');

        const result: any = await new AutoTesterTool().execute({
            testType: 'syntax',
            projectPath: '.',
            files: ['broken.json'],
        }, { workspaceId: 'workspace-nexus-json' });

        expect(result.ok).toBe(false);
        expect(result.output.passed).toBe(false);
        expect(result.error).toContain('Invalid JSON');
        expect(executeToolSpy).not.toHaveBeenCalled();
        executeToolSpy.mockRestore();
    });

    it('parses JSX and TSX with esbuild instead of sending them to node --check', async () => {
        const appFile = path.join(workspaceRoot, 'src', 'App.jsx');
        const cardFile = path.join(workspaceRoot, 'src', 'Card.tsx');
        fs.mkdirSync(path.dirname(appFile), { recursive: true });
        fs.writeFileSync(appFile, 'export default function App() { return <main>Weather</main>; }\n');
        fs.writeFileSync(cardFile, 'type Props = { title: string }; export function Card({ title }: Props) { return <div>{title}</div>; }\n');
        const executeToolSpy = jest.spyOn(ToolService, 'executeTool');

        const result: any = await new AutoTesterTool().execute({
            testType: 'syntax',
            projectPath: '.',
            files: ['src/App.jsx', 'src/Card.tsx'],
        }, { workspaceId: 'workspace-nexus-jsx' });

        expect(result.ok).toBe(true);
        expect(result.output.passed).toBe(true);
        expect(result.logs.join('\\n')).toContain('esbuild syntax passed: src/App.jsx');
        expect(result.logs.join('\\n')).toContain('esbuild syntax passed: src/Card.tsx');
        expect(executeToolSpy).not.toHaveBeenCalled();
        executeToolSpy.mockRestore();
    });

    it('starts and cleans up a live project when a declared test fetches localhost', async () => {
        fs.mkdirSync(path.join(workspaceRoot, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
            name: 'live-project',
            scripts: { test: 'node --test scripts/smoke-test.test.mjs' },
        }));
        fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'smoke-test.test.mjs'),
            "await fetch('http://localhost:5173/');\n");

        const tool = new AutoTesterTool();
        expect((tool as any).liveTestPort(workspaceRoot, 'node --test scripts/smoke-test.test.mjs')).toBe(5173);

        const executeToolSpy = jest.spyOn(ToolService, 'executeTool').mockResolvedValue({
            ok: true,
            output: { ready: true, url: 'http://localhost:5173/' },
            logs: [],
        } as any);

        const result: any = await tool.execute({
            testType: 'unit',
            projectPath: '.',
        }, { workspaceId: 'workspace-nexus-live' });

        expect(result.ok).toBe(true);
        expect(executeToolSpy).toHaveBeenNthCalledWith(
            1,
            'project_run',
            { cwd: workspaceRoot, port: 5173 },
            expect.objectContaining({ workspaceId: 'workspace-nexus-live' }),
        );
        expect(executeToolSpy).toHaveBeenNthCalledWith(
            2,
            'shell_execute',
            { command: 'npm run test', cwd: workspaceRoot },
            expect.objectContaining({ workspaceId: 'workspace-nexus-live' }),
        );
        expect(executeToolSpy).toHaveBeenNthCalledWith(
            3,
            'project_stop',
            {},
            expect.objectContaining({ workspaceId: 'workspace-nexus-live' }),
        );
        expect(result.logs.join('\\n')).toContain('Detected one local test endpoint');
        expect(result.logs.join('\\n')).toContain('Stopped the project started for the live test.');
        executeToolSpy.mockRestore();
    });

    it('fails unit verification honestly when the selected project declares no test script', async () => {
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'empty-project', scripts: {} }));

        const result: any = await new AutoTesterTool().execute({
            testType: 'unit',
            projectPath: '.',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.output).toMatchObject({ passed: false });
        expect(result.error).toContain('No declared unit-test script');
        expect(result.logs.join('\n')).toContain('No declared script found');
    });
});
