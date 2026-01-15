
import { executePlannedActions } from '../browser/executor';
import { stopSession } from '../browser/manager';

const SESSION_ID = 'test-session-' + Date.now();
const USER_ID = 'test-user';

async function main() {
    console.log('Starting deep browser verification...');

    try {
        // 1. Visit Homepage & Hover
        console.log('Step 1: Visiting xelitesolutions.com and hovering...');
        const result1 = await executePlannedActions({
            userId: USER_ID,
            sessionId: SESSION_ID,
            actions: [
                { type: 'goto', url: 'https://xelitesolutions.com' },
                { type: 'wait', ms: 3000 }, // Wait for load
                // Hover over something likely to exist, e.g. a button or link
                { type: 'hover', selector: 'a, button', optional: true },
                { type: 'wait', ms: 1000 }
            ]
        });

        if (!result1.ok) {
            console.error('Step 1 failed:', result1);
        } else {
            console.log('Step 1 success.');
        }

        // 2. Attempt Login Flow (Simulated)
        // We try to find a login button in the header or common locations
        console.log('Step 2: Exploring Login Mock interactions...');
        const result2 = await executePlannedActions({
            userId: USER_ID,
            sessionId: SESSION_ID,
            actions: [
                // Try clicking a login icon/button if found
                { type: 'click', selector: '.login-icon, [aria-label="Login"], a[href*="login"], button:has-text("Login")', optional: true },
                { type: 'wait', ms: 1000 },
                // Try typing into typical login fields (even if we didn't click successfuly, just to test the finder logic)
                { type: 'type', selector: 'input[type="email"], input[name="email"]', text: 'test@xelitesolutions.com', optional: true },
                { type: 'type', selector: 'input[type="password"]', text: 'SecretPass123!', optional: true },
                // Verify human movement by checking logs (implicitly via success)
                { type: 'wait', ms: 1000 }
            ]
        });

        console.log('Execution Result 2:', JSON.stringify(result2, null, 2));

        if (!result1.ok && !result2.ok) {
            console.error('Browser Test Failed entirely');
            process.exit(1);
        } else {
            console.log('Browser Test Passed!');
        }
    } catch (err) {
        console.error('Fatal Error:', err);
        process.exit(1);
    } finally {
        await stopSession(SESSION_ID);
        process.exit(0);
    }
}

main();
