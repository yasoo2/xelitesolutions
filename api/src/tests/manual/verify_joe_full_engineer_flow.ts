import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import * as llm from '../../core/llm';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent E2E verification test for Joe as a complete software engineer.
 *
 * Verifies:
 * - planner path
 * - orchestrated phase execution
 * - verification gate
 * - one-attempt self-healing
 * - rerun and continuation
 * - engineering report attachment for user-visible observability
 */
async function verifyJoeFullEngineerFlow() {
    console.log('🧪 Starting Joe Full Engineer Flow Verification...');

    process.env.JOE_PRO_ALPHA = '1';
    process.env.OFFLINE_MODE = 'true';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'engineer-flow-only';
    
    const evidenceRoot = path.resolve('data/tests/full_engineer_flow');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const projectsRoot = fs.mkdtempSync(path.join(evidenceRoot, 'run-'));
    process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

    // Count real child executions independently of the ledger. Runtime traces
    // live under .joe so observing a check does not invalidate its source.
    const executionTrace = (check: string) => `
const traceStarted = performance.now();
process.on('exit', exitCode => {
  fs.mkdirSync('.joe', { recursive: true });
  fs.appendFileSync('.joe/check-executions.jsonl', JSON.stringify({
    check: ${JSON.stringify(check)}, exitCode,
    durationMs: Math.max(0, performance.now() - traceStarted)
  }) + '\\n');
});
`;

    // Mock plan: Use a setup script that only writes the file if it's missing.
    // This allows the self-fix patch to persist through the phase rerun.
    const mockPlan = {
        projectName: 'Task Manager Pro',
        totalPhases: 2,
        estimatedDuration: '20 minutes',
        phases: [
            {
                phaseNumber: 1,
                name: 'Core Implementation',
                tasks: [
                    {
                        task: 'Setup tasks file',
                        tool: 'shell_execute',
                        args: {
                            command: 'node -e "const fs = require(\'fs\'); if (!fs.existsSync(\'tasks.ts\')) fs.writeFileSync(\'tasks.ts\', \'export const taskLimit: number = \\\"10\\\";\\\\n\');"'
                        },
                        priority: 'high'
                    },
                    {
                        task: 'Create build checker',
                        tool: 'write_file',
                        args: {
                            filename: 'check.js',
                            content: `
const fs = require('fs');
${executionTrace('build')}
if (!fs.existsSync('tasks.ts')) { console.error('tasks.ts missing'); process.exit(1); }
const content = fs.readFileSync('tasks.ts', 'utf8');
if (content.includes('number = "10"')) {
  console.error("tasks.ts(1,31): error TS2322: Type 'string' is not assignable to type 'number'.");
  console.error('export const taskLimit: number = "10";');
  process.exit(1);
}
                            `
                        },
                        priority: 'low'
                    },
                    {
                        task: 'Create checker-presence smoke test',
                        tool: 'write_file',
                        args: {
                            filename: 'smoke.test.js',
                            content: "const test = require('node:test'); const assert = require('node:assert'); const fs = require('fs');\n"
                                + executionTrace('smoke')
                                + "test('checker exists', () => assert.equal(fs.existsSync('check.js'), true));\n"
                        },
                        priority: 'low'
                    },
                    {
                        task: 'Run unchanged checker-presence smoke test',
                        tool: 'shell_execute',
                        verificationId: 'engineer-flow:checker-smoke',
                        verificationMode: 'focused',
                        relevantPaths: ['check.js', 'smoke.test.js'],
                        args: {
                            command: 'node --test smoke.test.js'
                        },
                        priority: 'low'
                    }
                ],
                verificationTask: {
                    task: 'Build Check',
                    tool: 'shell_execute',
                    verificationId: 'engineer-flow:failed-build',
                    verificationMode: 'affected',
                    relevantPaths: ['tasks.ts', 'check.js'],
                    args: {
                        command: 'npm run build'
                    }
                }
            },
            {
                phaseNumber: 2,
                name: 'Validation',
                tasks: [
                    {
                        task: 'Final build verification',
                        tool: 'shell_execute',
                        args: { command: 'node -e "console.log(\'Build verified\')"' },
                        priority: 'medium'
                    }
                ],
                verificationTask: {
                    task: 'Final full project gate',
                    tool: 'shell_execute',
                    verificationId: 'engineer-flow:final-matrix',
                    verificationMode: 'final',
                    args: { command: 'npm run check' }
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

    const sessionId = 'test-session-e2e-' + Date.now();
    const workspaceId = 'task-manager-workspace';
    const userId = 'engineer-joe';

    try {
        const pipelineResult = await executionFirewall.runAsSystem(async () => {
            const manifest = await executeTool('write_file', {
                path: 'package.json', content: JSON.stringify({ private: true, scripts: {
                    test: 'node --test smoke.test.js', build: 'node check.js',
                    check: 'npm test && npm run build',
                } }),
            }, { sessionId, workspaceId, userId });
            if (!manifest.ok) throw new Error('Verification fixture manifest could not be created');
            const discovery = await executeTool('engineering_discovery', {
                request: 'Implement the task manager in this existing local project.',
            }, { sessionId, workspaceId, userId });
            if (!discovery.ok) throw new Error('Verification fixture discovery failed');
            console.log('📋 Running ProjectPlannerTool...');
            const plannerResult = await executeTool('project_planner', {
                projectDescription: 'Build a small task manager app.',
                evidence: discovery.output,
            }, { sessionId, workspaceId, userId });

            if (!plannerResult.ok) throw new Error(`Planner failed: ${plannerResult.error}`);

            console.log('🚀 Running AgentLoopService orchestrator...');
            return await (AgentLoopService as any).runPlannedPhasesIfPresent({
                sessionId,
                runId: 'full-flow-run',
                userId,
                workspaceId,
                plannerResult
            });
        });

        let passed = true;
        console.log('\n--- Final Verification ---');
        
        if (pipelineResult.ok === true && pipelineResult.completedPhases === 2) {
            console.log('✅ PASS: Overall pipeline completed successfully.');
        } else {
            console.error('❌ FAIL: Pipeline did not complete all phases.', JSON.stringify(pipelineResult, null, 2));
            passed = false;
        }

        const phase1Result = pipelineResult.results?.[0];
        if (phase1Result?.selfFixExecution?.ok === true) {
            console.log('✅ PASS: Self-fix was triggered and succeeded for Phase 1.');
        } else {
            console.error('❌ FAIL: Self-fix failed:', phase1Result?.selfFixExecution?.reason);
            passed = false;
        }

        if (phase1Result?.reusedTasks === 1 && phase1Result?.verificationMetrics?.reused >= 1) {
            console.log('✅ PASS: The unchanged passing smoke check was reused during the repair rerun.');
        } else {
            console.error('❌ FAIL: A passing focused check was duplicated during repair:', phase1Result?.verificationMetrics);
            passed = false;
        }

        const phase2Result = pipelineResult.results?.[1];
        const finalLog = Array.isArray(phase2Result?.logs) ? phase2Result.logs.join('\n') : '';
        if (finalLog.includes('engineer-flow:final-matrix') && finalLog.includes('Verification passed for Phase 2')) {
            console.log('✅ PASS: A distinct final whole-project gate ran and passed once.');
        } else {
            console.error('❌ FAIL: The final whole-project verification gate is missing:', finalLog);
            passed = false;
        }

        const tracePath = path.join(projectsRoot, workspaceId, '.joe/check-executions.jsonl');
        const executions: Array<{ check: string; exitCode: number; durationMs: number }> =
            fs.existsSync(tracePath)
                ? fs.readFileSync(tracePath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
                : [];
        const expectedExecutions = [
            { check: 'smoke', exitCode: 0 },
            { check: 'build', exitCode: 1 },
            { check: 'build', exitCode: 0 },
            { check: 'smoke', exitCode: 0 },
            { check: 'build', exitCode: 0 },
        ];
        const actualExecutions = executions.map(({ check, exitCode }) => ({ check, exitCode }));
        const countsVerified = JSON.stringify(actualExecutions) === JSON.stringify(expectedExecutions)
            && executions.every(row => Number.isFinite(row.durationMs) && row.durationMs >= 0);
        if (countsVerified) {
            console.log('PASS: Independent trace proves smoke once during editing, failed build plus one successful rerun, and both final checks exactly once.');
        } else {
            console.error('FAIL: Actual check executions differ from the required sequence:', actualExecutions);
            passed = false;
        }
        const evidencePath = path.join(projectsRoot, 'verification-evidence.json');
        fs.writeFileSync(evidencePath, JSON.stringify({
            sessionId, workspaceId, countsVerified, executions, expectedExecutions,
            phase1Metrics: phase1Result?.verificationMetrics,
            phase2Metrics: phase2Result?.verificationMetrics,
            pipelineOk: pipelineResult.ok,
            limitation: 'Controlled planner and synthetic TypeScript diagnostic; final gate covers this fixture, not the repository AGENTS matrix or live UI.',
        }, null, 2));
        console.log(`Independent verification evidence: ${evidencePath}`);

        if (pipelineResult.engineeringReport?.status === 'pipeline_completed') {
            console.log('✅ PASS: engineeringReport is attached and reflects pipeline completion.');
        } else {
            console.error('❌ FAIL: engineeringReport missing or wrong:', pipelineResult.engineeringReport);
            passed = false;
        }

        if (
            typeof pipelineResult.engineeringReportMarkdown === 'string'
            && pipelineResult.engineeringReportMarkdown.includes('Joe Engineering Execution Report')
            && pipelineResult.engineeringReportMarkdown.includes('Current pipeline summary')
        ) {
            console.log('✅ PASS: engineeringReportMarkdown is present and user-visible.');
        } else {
            console.error('❌ FAIL: engineeringReportMarkdown missing or incomplete:', pipelineResult.engineeringReportMarkdown);
            passed = false;
        }

        const tasksFilePath = path.join(projectsRoot, workspaceId, 'tasks.ts');
        if (fs.existsSync(tasksFilePath)) {
            const content = fs.readFileSync(tasksFilePath, 'utf8');
            if (content.includes('export const taskLimit: number = 10;')) {
                console.log('✅ PASS: tasks.ts was correctly repaired.');
            } else {
                console.error('❌ FAIL: tasks.ts content is wrong:', content);
                passed = false;
            }
        } else {
            console.error('❌ FAIL: tasks.ts missing.');
            passed = false;
        }

        console.log('\n✨ Full Engineer Flow Verification:', passed ? 'PASSED' : 'FAILED');
        if (!passed) process.exit(1);
        process.exit(0);
    } finally {
        (llm as any).callLLM = originalCallLLM;
    }
}

verifyJoeFullEngineerFlow().catch(e => {
    console.error('💥 Test Crashed:', e);
    process.exit(1);
});
