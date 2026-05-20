import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { AgentLoopService } from '../../modules/services/AgentLoopService';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function runTestPrompt() {
    console.log('🧪 Starting End-to-End Prompt Test...');
    
    // Enable offline mode to bypass DB connection requirements for a quick test
    process.env.OFFLINE_MODE = 'true';
    
    const prompt = "Please list the files in the current directory and explain what the main orchestrator does.";
    console.log(`\n🗣️  User Prompt: "${prompt}"\n`);
    
    try {
        const result = await AgentLoopService.execute(prompt, {
            sessionId: 'test-prompt-session-' + Date.now(),
            userId: 'test-admin'
        });
        
        console.log('\n✅ Execution Finished successfully!');
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('\n❌ Execution Failed:', error);
    }
}

runTestPrompt();
