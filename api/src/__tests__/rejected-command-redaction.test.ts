import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));

import { executeTool } from '../modules/services/ToolService';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';
import { redactCommandForLog } from '../shared/utils/redaction';

// A rejected verification command is NAMED in plan notes and phase logs so the
// contract mismatch is diagnosable without a run-evidence dig (run 4b needed
// exactly that dig to recover `node index.js < sample.txt`). But the command
// text is model-produced and may embed credentials — the diagnostic must name
// the command SHAPE while redacting sensitive argument values
// (CRITICAL-REAL-JOE-UI-001 integration gate: raw first-120/160 characters
// were logged without redaction).
describe('rejected verification commands are redacted in diagnostics', () => {
    describe('redactCommandForLog', () => {
        test.each([
            'node index.js < sample.txt',
            'npm test',
            'cd taglines && npm test',
            'node test.js --count sample.txt',
            'node app.js --author bob --verbose',
        ])('leaves a benign command intact: %s', command => {
            expect(redactCommandForLog(command)).toBe(command);
        });

        test.each([
            ['node app.js --password=hunter2', 'node app.js --password=[REDACTED]'],
            ['node app.js --token s3cr3t-value', 'node app.js --token [REDACTED]'],
            ['TOKEN=s3cr3t-value node app.js', 'TOKEN=[REDACTED] node app.js'],
            ['node app.js --api-key "live value here"', 'node app.js --api-key [REDACTED]'],
            ['deploy --client-secret=abc123 --target prod', 'deploy --client-secret=[REDACTED] --target prod'],
            ['run password: hunter2', 'run password:[REDACTED]'],
            ['node app.js --passwords=pw1 --tokens=t1', 'node app.js --passwords=[REDACTED] --tokens=[REDACTED]'],
        ])('redacts the sensitive value but keeps the shape: %s', (command, expected) => {
            expect(redactCommandForLog(command)).toBe(expected);
        });

        it('redacts known token shapes through the shared secret redactor', () => {
            const rendered = redactCommandForLog('node app.js --header "Bearer abcdefghij123456"');
            expect(rendered).not.toContain('abcdefghij123456');
            expect(rendered).toContain('node app.js --header');
        });

        it('does not treat a following flag as a sensitive value', () => {
            expect(redactCommandForLog('node app.js --token --verbose')).toBe('node app.js --token --verbose');
        });

        it('stays bounded and total on awkward input', () => {
            expect(redactCommandForLog('node app.js --password=hunter2', 24)).toHaveLength(24);
            expect(redactCommandForLog('node app.js --password=hunter2', 24)).not.toContain('hunter2');
            expect(redactCommandForLog('')).toBe('');
            expect(redactCommandForLog(undefined)).toBe('');
        });
    });

    describe('sanitizer rewrite note', () => {
        it('names the dropped smoke command with the secret redacted', () => {
            const { phases, notes } = sanitisePlanPhases([{
                phaseNumber: 1,
                name: 'Implement Core Functionality',
                tasks: [{
                    task: 'Write main application file',
                    tool: 'ai_write_file',
                    args: { path: 'taglines/index.js', description: 'cli entry' },
                }],
                verificationTask: {
                    task: 'Verify core functionality',
                    tool: 'shell_execute',
                    args: { command: 'node index.js --api-key live_s3cr3t_key < sample.txt', cwd: 'taglines' },
                },
            }], 'taglines', { mode: 'greenfield', candidateCheckCommands: [] });

            expect(phases[0].verificationTask.tool).toBe('read_file');
            const noteText = notes.join('\n');
            expect(noteText).toContain('الأمر المسقط');
            expect(noteText).not.toContain('live_s3cr3t_key');
            expect(noteText).toContain('[REDACTED]');
            expect(noteText).toContain('node index.js --api-key');
        });
    });

    describe('phase gate rejection log', () => {
        const executeToolMock = executeTool as jest.Mock;
        let projectRoot: string;

        beforeEach(() => {
            executeToolMock.mockReset();
            executeToolMock.mockImplementation(async () => ({ ok: true, output: {} }));
            projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-rejected-command-redaction-'));
        });

        afterEach(() => {
            fs.rmSync(projectRoot, { recursive: true, force: true });
        });

        it('logs the rejection reason with the secret redacted', async () => {
            const result = await new PhaseExecutorTool().execute({
                phase: {
                    phaseNumber: 1,
                    name: 'Implement Core Functionality',
                    tasks: [{
                        task: 'Write main application file',
                        tool: 'ai_write_file',
                        args: { path: 'taglines/index.js', description: 'cli entry' },
                    }],
                    verificationTask: {
                        task: 'Verify core functionality',
                        tool: 'shell_execute',
                        args: { command: 'node index.js --password=hunter2-sekrit < sample.txt', cwd: projectRoot },
                    },
                },
                projectContext: {
                    projectName: 'taglines',
                    projectRoot,
                    projectRootRuntimeBound: true,
                    runId: 'run-rejected-command-redaction',
                    workspaceId: 'workspace-rejected-command-redaction',
                },
            }, {
                runId: 'run-rejected-command-redaction',
                sessionId: 'session-rejected-command-redaction',
                workspaceId: 'workspace-rejected-command-redaction',
                userId: 'owner-rejected-command-redaction',
            }) as any;

            expect(result.output.status).toBe('partial');
            const logText = (result.logs || []).join('\n');
            expect(logText).toContain('unsupported verification tool contract');
            expect(logText).not.toContain('hunter2-sekrit');
            expect(logText).toContain('[REDACTED]');
            expect(logText).toContain('node index.js --password=');
        });
    });
});
