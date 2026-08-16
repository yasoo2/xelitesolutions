import fs from 'fs';
import os from 'os';
import path from 'path';
import { SecurityScannerTool } from '../modules/tools/definitions/SecurityScannerTool';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('SecurityScannerTool workspace-bound input contract', () => {
    let workspaceRoot = '';
    let activeRootSpy: jest.SpyInstance;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-security-scan-'));
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
    });

    afterEach(() => {
        activeRootSpy.mockRestore();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('discovers and scans source files from an evidence-backed project target', async () => {
        const projectRoot = path.join(workspaceRoot, 'NEXUS');
        fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src', 'server.js'), [
            'const value = req.body.value;',
            'eval(value);',
        ].join('\n'));
        fs.mkdirSync(path.join(projectRoot, 'node_modules', 'ignored'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'node_modules', 'ignored', 'bad.js'), 'eval("ignored");');

        const result: any = await new SecurityScannerTool().execute({
            target: 'NEXUS',
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(true);
        expect(result.output.filesScanned).toBe(1);
        expect(result.output.scannedFiles).toEqual(['src/server.js']);
        expect(result.output.vulnerabilities).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'Code Injection', severity: 'high' }),
        ]));
        expect(result.logs.join('\n')).toContain(projectRoot);
    });

    it('returns an explicit contract error instead of reading length from undefined', async () => {
        const result: any = await new SecurityScannerTool().execute({}, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('requires a non-empty files array');
        expect(result.logs.join('\n')).toContain('Input error');
    });

    it('rejects a project target outside the active workspace', async () => {
        const result: any = await new SecurityScannerTool().execute({
            projectPath: path.join(workspaceRoot, '..', 'outside'),
        }, { workspaceId: 'workspace-nexus' });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('must stay within the active workspace');
    });
});
