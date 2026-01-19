
import { ProjectManagerAgent } from '../agents/ProjectManagerAgent';
import fs from 'fs';
import path from 'path';

// Mock OpenAI
class MockOpenAI {
    chat = {
        completions: {
            create: async (params: any) => {
                const prompt = params.messages[1].content;
                let thought = '';
                let tool = '';
                let args = {};
                let done = false;

                // Simple state machine simulation
                if (prompt.includes('History:\n[]')) {
                    // Step 1: Create file
                    thought = "I need to create the file first.";
                    tool = "file_write";
                    args = { path: "counter.txt", content: "1" };
                } else if (prompt.includes("file_write") && prompt.includes("success\": true")) {
                    // Step 2: Read file
                    thought = "File created. Now I read it.";
                    tool = "safe_read_file";
                    // Fallback since safe_read_file might call cat which is shell_execute
                    if (!tool) tool = "shell_execute";
                    args = { command: "cat counter.txt" }; // simulating access
                    // Wait, let's use actual tools. shell_execute "cat"
                    tool = "shell_execute";
                } else if (prompt.includes("cat counter.txt") && prompt.includes("output\": \"1")) {
                    // Step 3: Increment and Write
                    thought = "Read 1. Incrementing to 2.";
                    tool = "file_write";
                    args = { path: "counter.txt", content: "2" };
                } else if (prompt.includes("content\": \"2")) {
                    // Step 4: Done
                    thought = "Task complete.";
                    done = true;
                } else {
                    // Default fallback
                    thought = "Thinking...";
                    done = true;
                }

                return {
                    choices: [{
                        message: {
                            content: JSON.stringify({ thought, tool, args, done })
                        }
                    }]
                };
            }
        }
    }
}

async function runMockTest() {
    console.log('🤖 Starting MOCK Autonomous Loop Verification...');
    const TEST_DIR = path.join(__dirname, '../../test_autonomous_mock');

    // Inject Mock
    const pm = new ProjectManagerAgent('MockBot', TEST_DIR);
    (pm as any).openai = new MockOpenAI(); // Force inject

    await pm.init();

    const goal = "Mock Goal";
    console.log(`Goal: ${goal}`);

    // Run
    const result = await pm.execute(goal);

    console.log('\n--- Mock Execution Result ---');
    console.log('Status:', result.status);
    console.log('History Steps:', result.history?.length);

    // Validate File System Reality
    const filePath = path.join(TEST_DIR, 'counter.txt');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        console.log(`Physical File Content: "${content}"`);
        if (content === '2') {
            console.log('✅ SUCCESS: Logic Loop correctly manipulated file system!');
            process.exit(0);
        }
    }

    console.log('❌ FAILURE: Logic loop did not produce expected file state.');
    process.exit(1);

}

runMockTest().catch(console.error);
