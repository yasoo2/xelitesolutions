import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function verifyAutonomousLoop() {
    console.log('🤖 Verifying Autonomous ReAct Loop...');
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
    if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️  SKIPPED: OPENAI_API_KEY is missing. Set it to run this test.');
        process.exit(0);
    }

    const { ProjectManagerAgent } = await import('../../core/agents/ProjectManagerAgent');

    const TEST_DIR = path.join(__dirname, '../../../test_autonomous_loop');

    // Cleanup
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    // Agent init handles mkdir

    const pm = new ProjectManagerAgent('AutoBot', TEST_DIR);
    await pm.init();

    // Challenge: Read-Modify-Write
    // The agent must:
    // 1. Create counter.txt with "1" (or realize it needs to exist first) -> Actually I will say "Create file"
    // 2. Read it.
    // 3. Update to "2".
    const goal = "Create a file named 'counter.txt' with the content '1'. Then, read that file, parse the number, increment it by 1, and overwrite the file with the new number.";

    console.log(`Goal: "${goal}"`);
    const result = await pm.execute(goal);

    console.log('\n--- Execution Finished ---');
    console.log('Status:', result.status);
    console.log('Reasoning:', result.reasoning);
    console.log('History Steps:', result.history?.length);

    const filePath = path.join(TEST_DIR, 'counter.txt');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        console.log(`Final File Content: "${content}"`);

        if (content === '2') {
            console.log('✅ SUCCESS: Agent successfully performed Read-Modify-Write loop!');
            process.exit(0);
        } else {
            console.error(`❌ FAILURE: Content is '${content}', expected '2'.`);
            process.exit(1);
        }
    } else {
        console.error("❌ FAILURE: 'counter.txt' does not exist.");
        process.exit(1);
    }
}

verifyAutonomousLoop().catch(e => {
    console.error(e);
    process.exit(1);
});
