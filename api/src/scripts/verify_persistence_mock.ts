
import { ProjectManagerAgent } from '../agents/ProjectManagerAgent';
import { CortexState } from '../services/CortexState';
import fs from 'fs';
import path from 'path';

// Mock OpenAI
class MockOpenAI {
    chat = {
        completions: {
            create: async (params: any) => {
                // Always return a simple tool call
                return {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                thought: "Simulating step...",
                                tool: "shell_execute",
                                args: { command: "echo step" }
                            })
                        }
                    }]
                };
            }
        }
    }
}

async function verifyPersistence() {
    console.log('💾 Verifying Persistence & Resume Capability...');

    const TEST_DIR = path.join(__dirname, '../../test_persistence');
    const TASK_ID = 'test_task_persistence_123';

    // Cleanup DB
    const dbPath = path.join(__dirname, '../../cortex.json');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

    // --- SESSION 1: Run for 3 steps then crash ---
    console.log('\n--- Session 1: Run & Crash ---');
    const pm1 = new ProjectManagerAgent('PersistBot', TEST_DIR, TASK_ID);
    (pm1 as any).openai = new MockOpenAI();

    // We hack the execute method to stop after 3 steps for testing
    // or we just trust the loop. 
    // Actually, ProjectManagerAgent doesn't have a "stop at 3" flag.
    // Let's modify the Cortex State manually to simulate a "mid-flight" state.

    await pm1.init();

    // Manually inject state
    const cortex = CortexState.getInstance();
    cortex.saveTask({
        id: TASK_ID,
        goal: "Persistence Test",
        status: 'running',
        step: 3,
        history: [{ step: 1 }, { step: 2 }, { step: 3 }],
        rootDir: TEST_DIR,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });

    console.log('Simulated State: Agent is at Step 3.');

    // --- SESSION 2: Resume ---
    console.log('\n--- Session 2: Resume ---');
    const pm2 = new ProjectManagerAgent('PersistBot', TEST_DIR, TASK_ID); // Same ID
    (pm2 as any).openai = new MockOpenAI();

    // We override the loop to just run 1 iteration then exit
    // Or we just check if it LOGS "Resuming..."

    // We intercept console.log
    const originalLog = console.log;
    let resumedMsgFound = false;
    console.log = (...args) => {
        originalLog(...args);
        if (args.join(' ').includes("Resuming existing task (Step 3)")) {
            resumedMsgFound = true;
        }
    };

    // Run execute - it should see the state and say "Resuming..."
    // We mock execute to throw error instantly to stop it, just to check init logic
    try {
        // We actually want to run it, but we need to stop it fast.
        // We can rely on the fact that MockOpenAI returns a valid tool, 
        // so it will run step 3 (index 3).
        // We'll throw an error in the mock to stop execution?
        const result = await pm2.execute("Persistence Test");
    } catch (e) {
        // Ignore loop error
    }

    console.log = originalLog;

    if (resumedMsgFound) {
        console.log('✅ SUCCESS: Agent detected previous state and resumed!');

        // Verify Financials
        const balance = cortex.getBalance();
        console.log(`Financial Balance: $${balance} (Should be < 100)`);
        if (balance < 100) {
            console.log('✅ SUCCESS: Financial transaction recorded.');
            process.exit(0);
        } else {
            console.log('❌ FAILURE: No cost deducted.');
            process.exit(1);
        }
    } else {
        console.log('❌ FAILURE: Agent did not resume from Step 3.');
        process.exit(1);
    }
}

verifyPersistence().catch(console.error);
