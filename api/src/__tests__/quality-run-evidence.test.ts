import fs from 'fs';
import os from 'os';
import path from 'path';
import { dependencyFreeRecordsBuildEvidence, QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { handleShellCommand } from '../modules/tools/handlers';

jest.mock('../modules/tools/handlers', () => ({ handleShellCommand: jest.fn() }));
jest.mock('../modules/tools/utils', () => ({ resolveToolPath: (value: string) => value }));

describe('quality runs require executed checks', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-quality-evidence-'));
        jest.clearAllMocks();
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
    it('reports incomplete when all requested scripts are absent', async () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: {} }));
        const result = await new QualityRunTool().execute({ path: root });
        expect(result).toMatchObject({
            ok: false,
            error: 'No requested quality checks were available to execute (lint, typecheck, test, build)',
            output: { status: 'incomplete' },
        });
        expect(result.output.results.every(item => item.skipped)).toBe(true);
        expect(handleShellCommand).not.toHaveBeenCalled();
    });
    it('records executed build and explicitly skipped unavailable checks', async () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }));
        (handleShellCommand as jest.Mock).mockResolvedValue({ ok: true, output: 'built' });
        const result = await new QualityRunTool().execute({ path: root });
        expect(result).toMatchObject({ ok: true, output: { status: 'completed' } });
        expect(result.output.results.filter(item => !item.skipped)).toEqual([{ task: 'build', ok: true, skipped: false, output: 'built' }]);
        expect(handleShellCommand).toHaveBeenCalledTimes(1);
        expect((handleShellCommand as jest.Mock).mock.calls[0][2]).toBe(root);
    });
    it('verifies a marked dependency-free records artifact without invoking Vite', async () => {
        fs.mkdirSync(path.join(root, 'dist'));
        fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><meta name="joe-artifact-mode" content="static-records">');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }));

        const result = await new QualityRunTool().execute({ path: root, tasks: ['build'] });

        expect(result).toMatchObject({
            ok: true,
            output: {
                status: 'completed',
                results: [{ task: 'build', ok: true, skipped: false, artifactMode: 'static-records' }],
            },
        });
        expect(dependencyFreeRecordsBuildEvidence(root)).toBe(path.join(root, 'dist', 'index.html'));
        expect(handleShellCommand).not.toHaveBeenCalled();
    });
    it('does not accept an unmarked dist file as a dependency-free build', async () => {
        fs.mkdirSync(path.join(root, 'dist'));
        fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><title>Unmarked</title>');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }));
        (handleShellCommand as jest.Mock).mockResolvedValue({ ok: false, error: 'vite missing' });

        expect(await new QualityRunTool().execute({ path: root, tasks: ['build'] })).toMatchObject({
            ok: false,
            output: { status: 'failed' },
        });
        expect(handleShellCommand).toHaveBeenCalledTimes(1);
        expect(dependencyFreeRecordsBuildEvidence(root)).toBeNull();
    });
    it('preserves a failed check instead of accepting the skipped ones', async () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }));
        (handleShellCommand as jest.Mock).mockResolvedValue({ ok: false, error: 'build error' });
        expect(await new QualityRunTool().execute({ path: root })).toMatchObject({
            ok: false,
            error: 'Quality checks failed: build: build error',
            output: { status: 'failed' },
        });
    });
    it('preserves the trusted session for nested quality commands', async () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
        (handleShellCommand as jest.Mock).mockResolvedValue({ ok: true, output: 'passed' });
        const result = await new QualityRunTool().execute({ path: root, tasks: ['test'], sessionId: 'quality-session' });
        expect(result).toMatchObject({ ok: true, output: { status: 'completed' } });
        expect(handleShellCommand).toHaveBeenCalledWith(
            'npm', ['run', 'test'], root, 15 * 60_000, false, 'quality-session',
        );
    });
});
