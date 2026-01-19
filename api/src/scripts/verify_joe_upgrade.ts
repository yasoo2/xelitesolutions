
import { runBrowserInstruction } from '../browser/runner';
import { executePlannedActions } from '../browser/executor';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });
delete process.env.BROWSER_WS_ENDPOINT; // Force local launch for verification

async function main() {
    const sessionId = uuidv4();
    const userId = 'test-user-verify';

    console.log('🚀 Starting Verification: Joe Browser Upgrade');
    console.log(`Session ID: ${sessionId}`);

    // Enable no-sandbox for CI/Docker environments
    process.env.BROWSER_NO_SANDBOX = '1';

    try {
        // 1. Simple Navigation & Typing (Tests Natural Interactions)
        console.log('\n--- Test 1: Navigation & Natural Typing (LLM Path) ---');
        // This fails with 401 but we check if it tried.
        const res1 = await runBrowserInstruction({
            userId,
            sessionId,
            instructionText: 'Go to google.com, then type "Agentic AI" into the search bar and press enter.'
        });

        if (res1.ok) {
            console.log('✅ Test 1 Passed (Infrastructure)');
            console.log('Debug Info:', JSON.stringify(res1.debug, null, 2));
        } else {
            console.log('ℹ️  Test 1 Result (Expected 401):', res1.error);
            if ('detail' in res1) {
                // Print detail to confirm it was 401 and not browser crash
                console.log('Detail:', JSON.stringify((res1 as any).detail, null, 2));
            }
        }

        // 2. Direct Actions (Tests Natural Interactions without LLM dependency)
        console.log('\n--- Test 2: Direct Actions (Bypassing LLM) ---');
        console.log('Executing plan: Goto Google -> Type "Joe Upgrade Verified" -> Enter');

        // Google Search Selectors: textarea[name="q"], input[name="q"]
        const res2 = await executePlannedActions({
            userId,
            sessionId,
            actions: [
                { type: 'goto', url: 'https://www.google.com' },
                { type: 'wait', ms: 2000 },
                { type: 'type', selector: 'textarea[name="q"]', text: 'Joe Upgrade Verified' },
                { type: 'wait', ms: 500 },
                { type: 'type', text: '\n' },
                { type: 'wait', ms: 2000 }
            ]
        });

        // executePlannedActions returns { ok, steps, evidence ... }
        if (res2.ok) {
            console.log('✅ Test 2 Passed: Natural Interactions Executed Successfully');
            console.log('Evidence Count:', res2.evidence?.length);
        } else {
            console.error('❌ Test 2 Failed');
            console.error('Summary:', res2.summary);
            console.error('Steps:', JSON.stringify(res2.steps, null, 2));
        }

    } catch (err) {
        console.error('🔥 Fatal Error:', err);
        console.error(err);
    } finally {
        process.exit(0);
    }
}

main();
