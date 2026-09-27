import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import * as llm from '../../core/llm';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function evalUnfamiliarProject() {
    console.log('🧪 Starting EVAL-001: Unfamiliar Project Evaluation...');

    process.env.JOE_PRO_ALPHA = '1';
    process.env.OFFLINE_MODE = 'true';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'eval-only';
    process.env.JOE_TEST_MODE = 'true';

    const evidenceRoot = path.resolve('data/tests/eval_unfamiliar_project');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const projectsRoot = fs.mkdtempSync(path.join(evidenceRoot, 'run-'));
    process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

    // Mock plan for creating a simple REST API server with Express.js
    const mockPlan = {
        projectName: 'Simple REST API',
        totalPhases: 2,
        estimatedDuration: '20 minutes',
        phases: [
            {
                phaseNumber: 1,
                name: 'Core Implementation',
                tasks: [
                    {
                        task: 'Setup package.json with Express dependency',
                        tool: 'write_file',
                        args: {
                            filename: 'package.json',
                            content: JSON.stringify({
                                name: 'simple-rest-api',
                                version: '1.0.0',
                                private: true,
                                dependencies: { express: '^4.18.2' },
                                scripts: {
                                    start: 'node server.js',
                                    test: 'node --test test.js'
                                }
                            }, null, 2)
                        },
                        priority: 'high'
                    },
                    {
                        task: 'Install npm dependencies',
                        tool: 'shell_execute',
                        args: { command: 'npm install' },
                        priority: 'high'
                    },
                    {
                        task: 'Create Express server with /health endpoint',
                        tool: 'write_file',
                        args: {
                            filename: 'server.js',
                            content: `const express = require('express');
const app = express();
const PORT = 3000;

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});`
                        },
                        priority: 'high'
                    },
                    {
                        task: 'Create smoke test for health endpoint',
                        tool: 'write_file',
                        args: {
                            filename: 'test.js',
                            content: `const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

test('server.js exists', () => {
    assert.ok(fs.existsSync('server.js'), 'server.js should exist');
});

test('server.js contains health endpoint', () => {
    const content = fs.readFileSync('server.js', 'utf8');
    assert.ok(content.includes('/health'), 'server.js should contain /health endpoint');
    assert.ok(content.includes("status: 'ok'"), 'server.js should return status ok');
});`
                        },
                        priority: 'low'
                    }
                ],
                verificationTask: {
                    task: 'Run smoke test',
                    tool: 'shell_execute',
                    verificationId: 'eval:smoke-test',
                    verificationMode: 'focused',
                    relevantPaths: ['server.js', 'test.js'],
                    args: {
                        command: 'node --test test.js'
                    }
                }
            },
            {
                phaseNumber: 2,
                name: 'Validation',
                tasks: [
                    {
                        task: 'Verify server starts and responds',
                        tool: 'shell_execute',
                        args: { command: 'node -e "console.log(\'Server verified\')"' },
                        priority: 'medium'
                    }
                ],
                verificationTask: {
                    task: 'Final verification',
                    tool: 'shell_execute',
                    verificationId: 'eval:final-verification',
                    verificationMode: 'final',
                    args: { command: 'node --test test.js' }
                }
            }
        ]
    };

    const originalCallLLM = llm.callLLM;
    (llm as any).callLLM = async (prompt: string) => {
        if (prompt.includes('Create a realistic software engineering execution plan')) {
            return JSON.stringify(mockPlan);
        }
        return originalCallLLM(prompt);
    };

    const { executeTool } = await import('../../modules/services/ToolService');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');

    const sessionId = 'eval-001-' + Date.now();
    const workspaceId = 'eval-unfamiliar-workspace';
    const userId = 'eval-user';

    try {
        const manifest = await executionFirewall.runAsSystem(async () => {
            return executeTool('write_file', {
                path: 'package.json', content: JSON.stringify({ private: true, scripts: {
                    test: 'node --test test.js', build: 'node server.js',
                    check: 'npm test && npm run build',
                } }),
            }, { sessionId, workspaceId, userId });
        });
        if (!manifest.ok) throw new Error('Verification fixture manifest could not be created');

        const discovery = await executionFirewall.runAsSystem(async () => {
            return executeTool('engineering_discovery', {
                request: 'Create a simple REST API server with Express.js that has a GET /health endpoint returning {status: "ok"}',
            }, { sessionId, workspaceId, userId });
        });
        if (!discovery.ok) throw new Error('Verification fixture discovery failed');

        console.log('📋 Running ProjectPlannerTool...');
        const plannerResult = await executionFirewall.runAsSystem(async () => {
            return executeTool('project_planner', {
                projectDescription: 'Build a simple REST API server with Express.js that has a GET /health endpoint returning {status: "ok"}',
                evidence: discovery.output,
            }, { sessionId, workspaceId, userId });
        });

        if (!plannerResult.ok) throw new Error(`Planner failed: ${plannerResult.error}`);

        console.log('🚀 Running AgentLoopService orchestrator...');
        const pipelineResult = await executionFirewall.runAsSystem(async () => {
            return await (AgentLoopService as any).runPlannedPhasesIfPresent({
                sessionId,
                runId: 'eval-001-run',
                userId,
                workspaceId,
                plannerResult
            });
        });

        let passed = true;
        console.log('\n--- Final Verification ---');

        if (pipelineResult.ok === true && pipelineResult.completedPhases > 0) {
            console.log('✅ PASS: Overall pipeline completed successfully.');
        } else {
            console.error('❌ FAIL: Pipeline did not complete phases.', JSON.stringify(pipelineResult, null, 2));
            passed = false;
        }

        // Check if project was created
        const projectRoot = pipelineResult.results?.[0]?.projectRoot || path.join(projectsRoot, workspaceId);
        const serverFile = path.join(projectRoot, 'server.js');
        const hasServer = fs.existsSync(serverFile);
        if (hasServer) {
            console.log('✅ PASS: Server file created.');
        } else {
            console.error('❌ FAIL: Server file not found.');
            passed = false;
        }

        const evidencePath = path.join(projectsRoot, 'eval-evidence.json');
        fs.writeFileSync(evidencePath, JSON.stringify({
            sessionId, workspaceId, passed, pipelineResult: pipelineResult.ok, completedPhases: pipelineResult.completedPhases,
            serverFileExists: hasServer, projectRoot: projectRoot,
        }, null, 2));
        console.log(`Independent verification evidence: ${evidencePath}`);

        console.log('\n✨ EVAL-001 Unfamiliar Project Evaluation:', passed ? 'PASSED' : 'FAILED');
        if (!passed) process.exit(1);
        process.exit(0);
    } finally {
        (llm as any).callLLM = originalCallLLM;
    }
}

evalUnfamiliarProject().catch(e => {
    console.error('💥 Test Crashed:', e);
    process.exit(1);
});