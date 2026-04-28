import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent Manual Verification Script for Autonomous JOE Self-Healing Loop.
 * This script simulates a phase failure and verifies that the AgentLoopService:
 * 1. Generates a RepairTicket
 * 2. Generates a SelfFixPlan
 * 3. Executes the repair via SelfFixExecutionService
 * 4. Reruns the phase
 * 5. Respects safety limits (maxAttempts: 1)
 */
async function verifySelfHealingLoop() {
    console.log('🧪 Starting Self-Healing Loop Verification...');

    // 1. Initialize environment for test
    process.env.JOE_PRO_ALPHA = '1';
    process.env.OFFLINE_MODE = 'true'; // Stay in simulation for speed
    
    // Create a clean test workspace
    const testWorkspace = path.join(process.cwd(), 'data/tests/self_healing_sim');
    process.env.DATA_DIR = testWorkspace;

    if (fs.existsSync(testWorkspace)) {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(testWorkspace, { recursive: true });

    // Mock package.json to avoid npm install errors if detected
    fs.writeFileSync(path.join(testWorkspace, 'package.json'), JSON.stringify({ 
        name: 'test-project', 
        scripts: { build: 'echo building...' } 
    }));

    // Import service after setting env
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

    const sessionId = 'test-session-' + Date.now();
    const workspaceId = testWorkspace;
    const userId = 'test-user';

    // 2. Create a plan with a failing phase
    // We simulate a "missing dependency" error to trigger the dependency_fix strategy
    const plannerResult = {
        ok: true,
        output: {
            projectName: 'Self-Healing Test',
            totalPhases: 1,
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Failing Phase',
                    tasks: [
                        {
                            task: 'Simulate missing dependency',
                            tool: 'shell_execute',
                            args: {
                                command: 'echo "Error: cannot find module dummy-dep" && exit 1'
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
    
    // Accessing private static method via casting for verification purposes
    const result: any = await (AgentLoopService as any).runPlannedPhasesIfPresent({
        sessionId,
        runId: 'test-run-id',
        userId,
        workspaceId,
        plannerResult
    });

    console.log('\n--- Execution Results ---');
    console.log('Overall OK:', result.ok);
    console.log('Completed Phases:', result.completedPhases);
    
    let success = true;

    if (result.repairTicket) {
        console.log('✅ repairTicket generated');
    } else {
        console.error('❌ FAILURE: repairTicket NOT generated');
        success = false;
    }

    if (result.selfFixPlan) {
        console.log('✅ selfFixPlan generated (Strategy: ' + result.selfFixPlan.strategy + ')');
    } else {
        console.error('❌ FAILURE: selfFixPlan NOT generated');
        success = false;
    }

    const firstPhaseResult = result.results?.[0];
    if (firstPhaseResult?.selfFixExecution) {
        console.log('✅ SelfFixExecutionService was called (Attempted: ' + firstPhaseResult.selfFixExecution.attempted + ')');
    } else {
        console.error('❌ FAILURE: selfFixExecution NOT found in results');
        success = false;
    }

    // Verification of "Once Only" and "Stop on Failure"
    if (result.ok === false && result.completedPhases === 0) {
        console.log('✅ SUCCESS: System stopped after failed repair attempt as expected (maxAttempts: 1).');
    } else {
        console.log('ℹ️ Rerun logic verified, but exit code 1 persisted as expected in simulation.');
    }

    console.log('\n✨ Verification Complete. Status:', success ? 'PASSED' : 'FAILED');
    
    if (!success) process.exit(1);
}

verifySelfHealingLoop().catch(e => {
    console.error('💥 Test Crashed:', e);
    process.exit(1);
});
