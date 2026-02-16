
import { runBrowserInstruction } from '../src/browser/runner';
import { getBrowserSession } from '../src/browser/manager';

async function main() {
    console.log("🚀 Starting Real System Verification for Joe Browser...");

    const sessionId = `verify-${Date.now()}`;
    const userId = "tester-123";

    const instruction = "Open https://the-internet.herokuapp.com/login. Use Username: 'tomsmith' and Password: 'SuperSecretPassword!' to login, then logout. Report success.";

    console.log(`📝 Instruction: ${instruction}`);

    try {
        const result = await runBrowserInstruction({
            userId,
            sessionId,
            instructionText: instruction,
            mode: 'browser_test'
        });

        console.log("\n📊 Execution Result:");
        console.log(JSON.stringify(result, null, 2));

        if (result.ok) {
            console.log("\n✅ SUCCESS: Joe Browser executed the autonomy test perfectly!");
        } else {
            console.log("\n❌ FAILED: Joe Browser encountered an issue.");
            process.exit(1);
        }
    } catch (e: any) {
        console.error("\n💥 CRASH:", e.message);
        process.exit(1);
    } finally {
        // We keep it open if needed, but for script we might want to close.
        // runBrowserInstruction handles session stopping if env is set.
    }
}

main();
