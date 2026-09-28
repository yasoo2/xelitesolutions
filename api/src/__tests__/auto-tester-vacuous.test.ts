import fs from 'fs';
import os from 'os';
import path from 'path';

import { AutoTesterTool } from '../modules/tools/definitions/AutoTesterTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import * as ToolService from '../modules/services/ToolService';

/**
 * Vacuous-test honesty: an exit-0 test script that proves it executed zero
 * tests must not be reported as passed. Real-UI evidence: run 4b (taglines)
 * and run 8 (jfilter) both scaffolded comment-only test.js files whose
 * `node test.js` exits 0 with empty output — a pass verdict there would be a
 * false acceptance. Detection is fail-open: only POSITIVE evidence of
 * nothing-happened (an explicit runner zero-report, or a silent bare-node run
 * of a statement-free file) flips the verdict. Silent assert-only scripts,
 * unrecognized runners, and non-bare commands keep their pass.
 */
describe('AutoTesterTool vacuous-test honesty', () => {
    let workspaceRoot = '';
    let activeRootSpy: jest.SpyInstance;
    let executeToolSpy: jest.SpyInstance;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-auto-tester-vacuous-'));
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
    });

    afterEach(() => {
        executeToolSpy?.mockRestore();
        activeRootSpy.mockRestore();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    function writeProject(testCommand: string, testFileContent?: string) {
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
            name: 'vacuous-probe',
            scripts: { test: testCommand },
        }));
        if (testFileContent !== undefined) {
            fs.writeFileSync(path.join(workspaceRoot, 'test.js'), testFileContent);
        }
    }

    function mockShellOk(output: unknown) {
        executeToolSpy = jest.spyOn(ToolService, 'executeTool').mockResolvedValue({
            ok: true,
            output,
            logs: [],
        } as any);
    }

    async function runUnit() {
        return (await new AutoTesterTool().execute({
            testType: 'unit',
            projectPath: '.',
        }, { workspaceId: 'workspace-vacuous' })) as any;
    }

    it('fails honestly on a jest no-tests report', async () => {
        writeProject('jest');
        mockShellOk('No tests found, exiting with code 0');
        const result = await runUnit();
        expect(result.ok).toBe(false);
        expect(result.output.passed).toBe(false);
        expect(result.error).toMatch(/zero tests/i);
    });

    it('fails honestly on a jest zero-total summary', async () => {
        writeProject('jest');
        mockShellOk('Test Suites: 0 total\nTests: 0 total\nSnapshots: 0 total');
        const result = await runUnit();
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/zero tests/i);
    });

    it('fails honestly on a mocha zero-passing summary', async () => {
        writeProject('mocha');
        mockShellOk('  0 passing (5ms)\n');
        const result = await runUnit();
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/zero tests/i);
    });

    it('fails honestly on a TAP zero plan', async () => {
        writeProject('node --test');
        mockShellOk('TAP version 13\n1..0\n');
        const result = await runUnit();
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/zero tests/i);
    });

    it('fails honestly on a node:test zero summary', async () => {
        writeProject('node --test');
        mockShellOk('\u2139 tests 0\n\u2139 suites 0\n\u2139 pass 0\n\u2139 fail 0\n');
        const result = await runUnit();
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/zero tests/i);
    });

    it('fails honestly on a vitest no-test-files report', async () => {
        writeProject('vitest run');
        mockShellOk('No test files found, exiting with code 0');
        const result = await runUnit();
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/zero tests/i);
    });

    it('fails honestly on a silent bare-node run of a comment-only test file', async () => {
        writeProject('node test.js', '// Test file\n');
        mockShellOk('');
        const result = await runUnit();
        expect(result.ok).toBe(false);
        expect(result.output.passed).toBe(false);
        expect(result.error).toMatch(/zero tests|no executable statements/i);
    });

    it('fails honestly on a silent bare-node run of an empty test file', async () => {
        writeProject('node test.js', '');
        mockShellOk('');
        const result = await runUnit();
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/zero tests|no executable statements/i);
    });

    it('keeps the pass for a mocha run with real passes (boundary guard)', async () => {
        writeProject('mocha');
        mockShellOk('  10 passing (12ms)\n');
        const result = await runUnit();
        expect(result.ok).toBe(true);
        expect(result.output.passed).toBe(true);
    });

    it('keeps the pass for a jest run with real passes', async () => {
        writeProject('jest');
        mockShellOk('Tests: 5 passed, 5 total\nTest Suites: 1 passed, 1 total');
        const result = await runUnit();
        expect(result.ok).toBe(true);
        expect(result.output.passed).toBe(true);
    });

    it('keeps the pass for a silent assert-only script (legitimate silence)', async () => {
        writeProject('node test.js', "require('assert').strictEqual(1 + 1, 2);\n");
        mockShellOk('');
        const result = await runUnit();
        expect(result.ok).toBe(true);
        expect(result.output.passed).toBe(true);
    });

    it('keeps the pass for empty output from an unresolvable command (fail-open)', async () => {
        writeProject('mocha');
        mockShellOk('');
        const result = await runUnit();
        expect(result.ok).toBe(true);
        expect(result.output.passed).toBe(true);
    });

    it('keeps the pass for non-string tool output (fail-open)', async () => {
        writeProject('node test.js', '// Test file\n');
        mockShellOk({ ready: true });
        const result = await runUnit();
        expect(result.ok).toBe(true);
        expect(result.output.passed).toBe(true);
    });

    it('keeps the pass when a bare script prints output (output evidence wins)', async () => {
        writeProject('node test.js', '// Test file\n');
        mockShellOk('tap ok\n');
        const result = await runUnit();
        expect(result.ok).toBe(true);
        expect(result.output.passed).toBe(true);
    });

    it('does not apply zero-test detection to build scripts', async () => {
        fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
            name: 'vacuous-probe',
            scripts: { build: 'node build.js' },
        }));
        fs.writeFileSync(path.join(workspaceRoot, 'build.js'), '// build\n');
        mockShellOk('No tests found, exiting with code 0');
        const result: any = await new AutoTesterTool().execute({
            testType: 'build',
            projectPath: '.',
        }, { workspaceId: 'workspace-vacuous' });
        expect(result.ok).toBe(true);
        expect(result.output.passed).toBe(true);
    });

    it('preserves the normal failure path when the script itself fails', async () => {
        writeProject('node test.js', '// Test file\n');
        executeToolSpy = jest.spyOn(ToolService, 'executeTool').mockResolvedValue({
            ok: false,
            error: 'ReferenceError: describe is not defined',
            logs: [],
        } as any);
        const result = await runUnit();
        expect(result.ok).toBe(false);
        expect(result.error).toContain('describe is not defined');
    });
});
