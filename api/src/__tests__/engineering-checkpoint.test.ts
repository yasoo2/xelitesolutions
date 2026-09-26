import { engineeringCheckpointKey, loadEngineeringCheckpoint, saveEngineeringCheckpoint, clearEngineeringCheckpoint, clearAllRunCheckpoints, loadAllRunCheckpoints, checkpointPhase, checkpointTool } from '../core/resume/engineering-checkpoint';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('engineering checkpoint system', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-engineering-checkpoint-'));
    const runId = 'test-run-123';

    afterAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    beforeEach(() => {
        // Clean up any existing checkpoints
        try { fs.rmSync(path.join(testDir, '.engineering-checkpoints'), { recursive: true, force: true }); } catch { }
    });

    describe('checkpoint key generation', () => {
        it('generates consistent keys for same inputs', () => {
            const key1 = engineeringCheckpointKey('run-1', 0, 'shell_execute', 'run tests');
            const key2 = engineeringCheckpointKey('run-1', 0, 'shell_execute', 'run tests');
            expect(key1).toBe(key2);
            expect(key1.length).toBe(32); // MD5 hex
        });

        it('generates different keys for different inputs', () => {
            const key1 = engineeringCheckpointKey('run-1', 0, 'shell_execute', 'run tests');
            const key2 = engineeringCheckpointKey('run-1', 0, 'shell_execute', 'run build');
            const key3 = engineeringCheckpointKey('run-1', 1, 'shell_execute', 'run tests');
            const key4 = engineeringCheckpointKey('run-2', 0, 'shell_execute', 'run tests');
            expect(key1).not.toBe(key2);
            expect(key1).not.toBe(key3);
            expect(key1).not.toBe(key4);
        });

        it('handles missing toolName and taskDescription', () => {
            const key = engineeringCheckpointKey('run-1', 0);
            expect(key).toBeDefined();
            expect(key.length).toBe(32);
        });
    });

    describe('save and load checkpoint', () => {
        it('saves and loads a basic checkpoint', () => {
            const key = engineeringCheckpointKey(runId, 0, 'shell_execute', 'run tests');
            const checkpoint = {
                runId,
                phaseIndex: 0,
                phaseName: 'Test Phase',
                toolName: 'shell_execute',
                taskDescription: 'run tests',
                input: { command: 'npm test', cwd: '/project' },
                output: { ok: true, stdout: 'tests passed' },
                verification: { status: 'passed', checkId: 'test-check' },
                runtimeContext: {
                    projectRoot: '/project',
                    workspaceId: 'ws-1',
                    sessionId: 'session-1',
                    runId,
                },
                artifacts: [{ type: 'file', path: '/project/test.txt', hash: 'abc123', size: 100 }],
            };

            saveEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 0, 'shell_execute', 'run tests'), checkpoint);

            const result = loadEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 0, 'shell_execute', 'run tests'));
            expect(result.status).toBe('ok');
            expect(result.checkpoint).toBeDefined();
            expect(result.checkpoint?.runId).toBe(runId);
            expect(result.checkpoint?.phaseIndex).toBe(0);
            expect(result.checkpoint?.toolName).toBe('shell_execute');
            expect(result.checkpoint?.output?.ok).toBe(true);
            expect(result.checkpoint?.artifacts).toHaveLength(1);
        });

        it('handles artifacts correctly', () => {
            const key = engineeringCheckpointKey(runId, 1, 'react_project', 'build app');
            const checkpoint = {
                runId,
                phaseIndex: 1,
                phaseName: 'Build App',
                toolName: 'react_project',
                taskDescription: 'build app',
                input: { request: 'build a react app' },
                output: { 
                    ok: true, 
                    projectRoot: '/project/app',
                    previewUrl: 'http://localhost:3000',
                    artifactPaths: ['/project/app/src/App.tsx', '/project/app/package.json']
                },
                verification: { status: 'passed', checkId: 'final-quality' },
                runtimeContext: {
                    projectRoot: '/project',
                    workspaceId: 'ws-1',
                    sessionId: 'session-1',
                    runId,
                },
                artifacts: [
                    { type: 'file', path: '/project/app/src/App.tsx', hash: 'abc123', size: 500 },
                    { type: 'file', path: '/project/app/package.json', hash: 'def456', size: 300 },
                    { type: 'directory', path: '/project/app' },
                    { type: 'url', path: 'http://localhost:3000' },
                ],
            };

            saveEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 1, 'react_project', 'build app'), {
                runId,
                phaseIndex: 1,
                phaseName: 'Build App',
                toolName: 'react_project',
                taskDescription: 'build app',
                input: { request: 'build a react app' },
                output: { ok: true, projectRoot: '/project/app', previewUrl: 'http://localhost:3000' },
                verification: { status: 'passed', checkId: 'final-quality' },
                runtimeContext: {
                    projectRoot: '/project',
                    workspaceId: 'ws-1',
                    sessionId: 'session-1',
                    runId,
                },
                artifacts: [
                    { type: 'file', path: '/project/app/src/App.tsx', hash: 'abc123', size: 500 },
                    { type: 'file', path: '/project/app/package.json', hash: 'def456', size: 300 },
                    { type: 'directory', path: '/project/app' },
                    { type: 'url', path: 'http://localhost:3000' },
                ],
            });

            const result = loadEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 1, 'react_project', 'build app'));
            expect(result.status).toBe('ok');
            expect(result.checkpoint?.artifacts).toHaveLength(4);
            expect(result.checkpoint?.artifacts.filter(a => a.type === 'file')).toHaveLength(2);
            expect(result.checkpoint?.artifacts.find(a => a.type === 'directory')).toBeDefined();
            expect(result.checkpoint?.artifacts.find(a => a.type === 'url')).toBeDefined();
        });
    });

    describe('checkpoint expiration', () => {
        it('expires old checkpoints', () => {
            const key = engineeringCheckpointKey(runId, 0, 'test', 'test');
            const checkpoint = {
                runId,
                phaseIndex: 0,
                phaseName: 'Test',
                taskDescription: 'test',
                input: {},
                output: {},
                runtimeContext: { projectRoot: '/', workspaceId: 'ws', sessionId: 'sess', runId },
                artifacts: [],
            };
            
            // Manually create an expired checkpoint by writing directly
            const keyHash = engineeringCheckpointKey(runId, 0, 'test', 'test');
            const dir = path.join(testDir, '.engineering-checkpoints');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${keyHash}.json`);
            const expiredCheckpoint = {
                v: 1,
                key: keyHash,
                runId,
                phaseIndex: 0,
                phaseName: 'Test',
                taskDescription: 'test',
                input: {},
                output: {},
                runtimeContext: { projectRoot: '/', workspaceId: 'ws', sessionId: 'sess', runId },
                artifacts: [],
                ts: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
            };
            fs.writeFileSync(path.join(dir, `${keyHash}.json`), JSON.stringify(expiredCheckpoint));

            const result = loadEngineeringCheckpoint(testDir, keyHash);
            expect(result.status).toBe('expired');
        });
    });

    describe('loadAllRunCheckpoints', () => {
        it('loads all checkpoints for a run', () => {
            const runId = 'test-run-load';
            
            // Create multiple checkpoints for the same run
            const phases = [
                { phaseIndex: 0, toolName: 'shell_execute', task: 'init' },
                { phaseIndex: 0, toolName: 'react_project', task: 'build' },
                { phaseIndex: 1, toolName: 'shell_execute', task: 'test' },
            ];

            for (const p of phases) {
                const key = engineeringCheckpointKey(runId, p.phaseIndex, p.toolName, p.task);
                saveEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, p.phaseIndex, p.toolName, p.task), {
                    runId,
                    phaseIndex: p.phaseIndex,
                    phaseName: `Phase ${p.phaseIndex}`,
                    toolName: p.toolName,
                    taskDescription: p.task,
                    input: {},
                    output: {},
                    runtimeContext: { projectRoot: '/', workspaceId: 'ws', sessionId: 'sess', runId },
                    artifacts: [],
                });
            }

            // Create a checkpoint for a different run
            const otherRunId = 'other-run';
            const otherKey = engineeringCheckpointKey(otherRunId, 0, 'shell_execute', 'test');
            saveEngineeringCheckpoint(testDir, engineeringCheckpointKey(otherRunId, 0, 'shell_execute', 'test'), {
                runId: otherRunId,
                phaseIndex: 0,
                phaseName: 'Other',
                taskDescription: 'other',
                input: {},
                output: {},
                runtimeContext: { projectRoot: '/', workspaceId: 'ws', sessionId: 'sess', runId: otherRunId },
                artifacts: [],
            });

            const checkpoints = loadAllRunCheckpoints(testDir, runId);
            expect(checkpoints.length).toBe(3);
            expect(checkpoints.every(c => c.runId === runId)).toBe(true);
            
            // Should be sorted by phaseIndex then toolName
            expect(checkpoints[0].phaseIndex).toBe(0);
            expect(checkpoints[1].phaseIndex).toBe(0);
            expect(checkpoints[2].phaseIndex).toBe(1);
            expect(checkpoints[0].toolName).toBe('react_project');
            expect(checkpoints[1].toolName).toBe('shell_execute');
            expect(checkpoints[2].toolName).toBe('shell_execute');
        });
    });

    describe('clearAllRunCheckpoints', () => {
        it('clears only checkpoints for the specified run', () => {
            const runId = 'clear-test-run';
            const otherRunId = 'other-run';
            
            // Create checkpoints for both runs
            saveEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 0, 'tool', 'task'), {
                runId, phaseIndex: 0, phaseName: 'Test', taskDescription: 'test', input: {}, output: {},
                runtimeContext: { projectRoot: '/', workspaceId: 'ws', sessionId: 'sess', runId },
                artifacts: [],
            });
            saveEngineeringCheckpoint(testDir, engineeringCheckpointKey(otherRunId, 0, 'tool', 'task'), {
                runId: otherRunId, phaseIndex: 0, phaseName: 'Other', taskDescription: 'other', input: {}, output: {},
                runtimeContext: { projectRoot: '/', workspaceId: 'ws', sessionId: 'sess', runId: otherRunId },
                artifacts: [],
            });

            clearAllRunCheckpoints(testDir, runId);

            // Original run checkpoints should be gone
            const runResult = loadEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 0, 'tool', 'task'));
            expect(runResult.status).toBe('empty');

            // Other run checkpoints should remain
            const otherResult = loadEngineeringCheckpoint(testDir, engineeringCheckpointKey(otherRunId, 0, 'tool', 'task'));
            expect(otherResult.status).toBe('ok');
        });
    });

    describe('checkpointPhase and checkpointTool helpers', () => {
        it('checkpointPhase saves phase results', () => {
            const runId = 'phase-test-run';
            const phaseResult = {
                output: {
                    status: 'completed',
                    results: [
                        { tool: 'shell_execute', ok: true, output: { stdout: 'done' } },
                        { tool: 'react_project', ok: true, output: { projectRoot: '/project/app', previewUrl: 'http://localhost:3000' } }
                    ],
                    verification: { status: 'passed', checkId: 'final-quality' }
                }
            };

            const projectContext = {
                projectRoot: '/project',
                workspaceId: 'ws-1',
                sessionId: 'session-1',
                phaseName: 'Build App',
                verificationLedger: { receipts: [] }
            };

            const executionContext = {
                runId: 'test-run',
                sessionId: 'session-1',
                workspaceId: 'ws-1',
                userId: 'user-1',
            };

            checkpointPhase(testDir, 'test-run', 0, 'Build App', phaseResult, projectContext, {
                runId: 'test-run',
                sessionId: 'session-1',
                workspaceId: 'ws-1',
                userId: 'user-1',
            });

            const key = engineeringCheckpointKey('test-run', 0, 'phase');
            const result = loadEngineeringCheckpoint(testDir, engineeringCheckpointKey('test-run', 0, 'phase'));
            expect(result.status).toBe('ok');
            expect(result.checkpoint?.phaseName).toBe('Build App');
            expect(result.checkpoint?.output?.results).toHaveLength(2);
        });

        it('checkpointTool saves tool execution', () => {
            const runId = 'tool-test-run';
            
            checkpointTool(testDir, runId, 0, 'shell_execute', 'run tests', 
                { command: 'npm test', cwd: '/project' },
                { ok: true, stdout: 'tests passed', exitCode: 0 },
                { projectRoot: '/project', workspaceId: 'ws-1', sessionId: 'session-1' },
                { runId, sessionId: 'session-1', workspaceId: 'ws-1', userId: 'user-1' }
            );

            const key = engineeringCheckpointKey(runId, 0, 'shell_execute', 'run tests');
            const result = loadEngineeringCheckpoint(testDir, key);
            expect(result.status).toBe('ok');
            expect(result.checkpoint?.toolName).toBe('shell_execute');
            expect(result.checkpoint?.taskDescription).toBe('run tests');
            expect(result.checkpoint?.output?.ok).toBe(true);
        });
    });

    describe('clearAllRunCheckpoints', () => {
        it('clears all checkpoints for a run', () => {
            const runId = 'clear-test';
            const otherRunId = 'other-run';
            
            // Create checkpoints for both runs
            saveEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 0, 'tool1', 'task1'), {
                runId, phaseIndex: 0, phaseName: 'Test', toolName: 'tool1', taskDescription: 'task1',
                input: {}, output: {}, runtimeContext: { projectRoot: '/', workspaceId: 'ws', sessionId: 'sess', runId }, artifacts: [],
            });
            saveEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 1, 'tool2', 'task2'), {
                runId, phaseIndex: 1, phaseName: 'Test2', toolName: 'tool2', taskDescription: 'task2',
                input: {}, output: {}, runtimeContext: { projectRoot: '/', workspaceId: 'ws', sessionId: 'sess', runId }, artifacts: [],
            });
            saveEngineeringCheckpoint(testDir, engineeringCheckpointKey(otherRunId, 0, 'tool', 'task'), {
                runId: otherRunId, phaseIndex: 0, phaseName: 'Other', toolName: 'tool', taskDescription: 'task',
                input: {}, output: {}, runtimeContext: { projectRoot: '/', workspaceId: 'ws', sessionId: 'sess', runId: otherRunId }, artifacts: [],
            });

            clearAllRunCheckpoints(testDir, runId);

            // Original run checkpoints should be gone
            expect(loadEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 0, 'tool1', 'task1')).status).toBe('empty');
            expect(loadEngineeringCheckpoint(testDir, engineeringCheckpointKey(runId, 1, 'tool2', 'task2')).status).toBe('empty');

            // Other run checkpoints should remain
            expect(loadEngineeringCheckpoint(testDir, engineeringCheckpointKey(otherRunId, 0, 'tool', 'task')).status).toBe('ok');
        });
    });

    describe('corrupt checkpoint handling', () => {
        it('detects and rejects corrupt checkpoints', () => {
            const key = engineeringCheckpointKey(runId, 0, 'test', 'test');
            const dir = path.join(testDir, '.engineering-checkpoints');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${key}.json`), 'not valid json');

            const result = loadEngineeringCheckpoint(testDir, key);
            expect(result.status).toBe('failed');
            expect(result.reason).toBeDefined();
        });
    });
});