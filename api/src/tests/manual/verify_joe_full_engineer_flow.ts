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
    
    const projectsRoot = path.join(process.cwd(), 'data/tests/full_engineer_flow');
    process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

    if (fs.existsSync(projectsRoot)) {
        fs.rmSync(projectsRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(projectsRoot, { recursive: true });

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
                    }
                ],
                verificationTask: {
                    task: 'Build Check',
                    tool: 'shell_execute',
                    args: {
                        command: 'node check.js'
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
                ]
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
            console.log('📋 Running ProjectPlannerTool...');
            const plannerResult = await executeTool('project_planner', {
                projectDescription: 'Build a small task manager app.'
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
