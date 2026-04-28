import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent Manual Verification Script for Autonomous JOE Self-Healing Loop (Failure Path).
 */
async function verifySelfHealingLoop() {
    console.log('🧪 Starting Self-Healing Failure Loop Verification...');

    // 1. Initialize environment for test
    process.env.JOE_PRO_ALPHA = '1';
    process.env.OFFLINE_MODE = 'true'; 
    
    const projectsRoot = path.join(process.cwd(), 'data/tests/failure_path');
    process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

    if (fs.existsSync(projectsRoot)) {
        fs.rmSync(projectsRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(projectsRoot, { recursive: true });

    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

    const sessionId = 'test-session-' + Date.now();
    const workspaceId = 'test-failure-workspace';
    const userId = 'test-user';

    const testWorkspacePath = path.join(projectsRoot, workspaceId);
    fs.mkdirSync(testWorkspacePath, { recursive: true });

    fs.writeFileSync(path.join(testWorkspacePath, 'package.json'), JSON.stringify({ 
        name: 'test-project', 
        scripts: { build: 'echo building...' } 
    }));

    // 2. Create a plan with a phase that ALWAYS fails (exit 1)
    const plannerResult = {
        ok: true,
        output: {
            projectName: 'Self-Healing Failure Test',
            totalPhases: 1,
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Failing Phase',
                    tasks: [
                        {
                            task: 'Simulate persistent error',
                            tool: 'shell_execute',
                            args: {
                                command: 'echo "Error: persistent failure" && exit 1'
                            },
                            required: true,
                            priority: 'high'
                        }
                    ]
                }
            ]
        }
    };

    console.log('🚀 Triggering Orchestrated Pipeline...');
    
    const result: any = await (AgentLoopService as any).runPlannedPhasesIfPresent({
        sessionId,
        runId: 'test-failure-run',
        userId,
        workspaceId,
        plannerResult
    });

    console.log('\n--- Execution Results ---');
    console.log('Overall Pipeline OK:', result.ok);
    console.log('Completed Phases:', result.completedPhases);
    
    let testPassed = true;

    if (result.ok === false && result.completedPhases === 0) {
        console.log('✅ SUCCESS: System stopped after failed repair attempt as expected.');
    } else {
        console.error('❌ FAILURE: System did not stop on failure or reported incorrect status.');
        testPassed = false;
    }

    if (result.repairTicket) {
        console.log('✅ repairTicket generated');
    } else {
        console.error('❌ FAILURE: repairTicket NOT generated');
        testPassed = false;
    }

    if (result.selfFixPlan) {
        console.log('✅ selfFixPlan generated');
    } else {
        console.error('❌ FAILURE: selfFixPlan NOT generated');
        testPassed = false;
    }

    console.log('\n✨ Verification Complete. Status:', testPassed ? 'PASSED' : 'FAILED');
    
    if (!testPassed) process.exit(1);
}

verifySelfHealingLoop().catch(e => {
    console.error('💥 Test Crashed:', e);
    process.exit(1);
});
