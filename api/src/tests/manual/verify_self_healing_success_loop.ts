import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Permanent Manual Verification Script for Autonomous JOE Self-Healing Loop (Success Path).
 */
async function verifySelfHealingSuccessLoop() {
    console.log('🧪 Starting Self-Healing Success Loop Verification...');

    // 1. Initialize environment for test
    process.env.JOE_PRO_ALPHA = '1';
    process.env.OFFLINE_MODE = 'true'; 
    
    const projectsRoot = path.join(process.cwd(), 'data/tests/success_path');
    process.env.EXTERNAL_PROJECTS_DIR = projectsRoot;

    if (fs.existsSync(projectsRoot)) {
        fs.rmSync(projectsRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(projectsRoot, { recursive: true });

    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');

    const sessionId = 'test-session-' + Date.now();
    const workspaceId = 'test-success-workspace'; 
    const userId = 'test-user';

    const testWorkspacePath = path.join(projectsRoot, workspaceId);
    fs.mkdirSync(testWorkspacePath, { recursive: true });

    // Mock package.json
    fs.writeFileSync(path.join(testWorkspacePath, 'package.json'), JSON.stringify({ 
        name: 'test-project', 
        scripts: { build: 'echo building...' } 
    }));

    // 2. Create a plan with a phase that fails because of a missing file
    // We use 'node -e' for a cross-platform check that is in the tool whitelist
    const plannerResult = {
        ok: true,
        output: {
            projectName: 'Self-Healing Success Test',
            totalPhases: 1,
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Conditional Phase',
                    tasks: [
                        {
                            task: 'Check for essential file',
                            tool: 'shell_execute',
                            args: {
                                command: 'node -e "if (!require(\'fs\').existsSync(\'required_file.txt\')) { console.error(\'MISSING_FILE: required_file.txt\'); process.exit(1); }"'
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
        runId: 'test-success-run',
        userId,
        workspaceId,
        plannerResult
    });

    console.log('\n--- Execution Results ---');
    console.log('Overall Pipeline OK:', result.ok);
    console.log('Completed Phases:', result.completedPhases);
    
    let testPassed = true;

    if (result.ok === true && result.completedPhases === 1) {
        console.log('✅ SUCCESS: Pipeline completed after self-healing!');
    } else {
        console.error('❌ FAILURE: Pipeline did not complete successfully.');
        testPassed = false;
    }

    const firstPhaseResult = result.results?.[0];
    if (firstPhaseResult?.status === 'completed') {
        console.log('✅ Phase status is "completed"');
    } else {
        console.error('❌ FAILURE: Phase status is ' + firstPhaseResult?.status);
        testPassed = false;
    }

    if (firstPhaseResult?.selfFixExecution?.ok === true) {
        console.log('✅ selfFixExecution.ok is true');
    } else {
        console.error('❌ FAILURE: selfFixExecution failed');
        testPassed = false;
    }

    if (fs.existsSync(path.join(testWorkspacePath, 'required_file.txt'))) {
        console.log('✅ Repair action verified: required_file.txt was created.');
    } else {
        console.error('❌ FAILURE: Repair action did not create the file.');
        testPassed = false;
    }

    console.log('\n✨ Verification Complete. Status:', testPassed ? 'PASSED' : 'FAILED');
    
    if (!testPassed) process.exit(1);
}

verifySelfHealingSuccessLoop().catch(e => {
    console.error('💥 Test Crashed:', e);
    process.exit(1);
});
