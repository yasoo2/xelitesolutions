import { ProjectManagerAgent } from '../agents/ProjectManagerAgent';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function verifyBrain() {
    console.log('🧠 Verifying Cognitive Execution...');

    const TEST_DIR = path.join(__dirname, '../../test_brain_output');

    // Cleanup previous run
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }

    const pm = new ProjectManagerAgent('BrainTester', TEST_DIR);
    await pm.init();

    const goal = "Create a simple Node.js script named 'hello.js' that prints 'Hello World'. Also create a README.md explaining it.";

    console.log(`Target: ${goal}`);
    const result = await pm.execute(goal);

    console.log('Execution Result:', JSON.stringify(result, null, 2));

    // Verification Logic
    const helloPath = path.join(TEST_DIR, 'hello.js');
    const readmePath = path.join(TEST_DIR, 'README.md');

    if (fs.existsSync(helloPath) && fs.existsSync(readmePath)) {
        console.log('✅ SUCCESS: Brain successfully created physical files!');
        console.log('Files found:', fs.readdirSync(TEST_DIR));
        process.exit(0);
    } else {
        console.error('❌ FAILURE: Files were not created.');
        process.exit(1);
    }
}

verifyBrain().catch(console.error);
