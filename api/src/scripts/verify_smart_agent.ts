
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { runBrowserInstruction } from '../browser/runner';
import { Session } from '../models/session'; // Ensure correct case

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function verifySmartAgent() {
    console.log('🧠 Starting Smart Agent Verification...');

    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/joe';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUri);
        }

        // Create dummy session
        const userId = 'smart_test_user';
        const session = await Session.create({
            kind: 'agent',
            title: 'Verify Smart Agent Test',
            userId: 'test-user',
            messages: []
        } as any);
        const sessionId = String((session as any)._id);
        console.log(`Created session: ${sessionId}`);

        // Test Command: "Go to YouTube and find the Sign In button"
        // This relies on the new COMPILER_SYSTEM to find the button semantically.
        const instruction = "Go to YouTube, wait for it to load, and then finding and clicking the Sign in button.";

        console.log(`\n🗣️ Instruction: "${instruction}"`);
        console.log('Running browser agent...');

        const result = await runBrowserInstruction({
            userId,
            sessionId,
            instructionText: instruction
        });

        console.log('\n--- Result ---');
        if (result.ok) {
            console.log('✅ Success!');
            console.log('Actions taken:', result.debug?.action_count);
            console.log('Compiled Plan:', JSON.stringify(result.debug?.compiled_plan_json, null, 2));
        } else {
            console.error('❌ Failed:', result.error);
            if (result.detail) console.error('Detail:', result.detail);
            console.error('Stop Reason:', result.debug?.stop_reason);
        }

        // Cleanup
        await Session.findByIdAndDelete(sessionId);
        await mongoose.disconnect();
        process.exit(0);

    } catch (e: any) {
        console.error('❌ Exception:', e);
        process.exit(1);
    }
}

verifySmartAgent();
