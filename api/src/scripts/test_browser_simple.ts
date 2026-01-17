
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

// We bypass the full registry to avoiding loading VectorMemory which is crashing
import { BrowserRunTool } from '../tools/definitions/BrowserRunTool';

async function run() {
    console.log('Starting Isolated Browser Test...');

    // Check if BrowserRunTool can be instantiated
    try {
        const tool = new BrowserRunTool();
        console.log('BrowserRunTool instantiated successfully.');

        // Attempt execution
        console.log('Attempting to run browser action...');
        const result = await tool.execute({
            sessionId: 'test-session-iso-' + Date.now(),
            actions: [
                { type: 'goto', url: 'https://example.com', waitUntil: 'domcontentloaded' }
            ]
        });

        console.log('Tool Executed.');
        console.log('Success:', result.ok);
        if (result.ok) {
            console.log('Output:', JSON.stringify(result.output, null, 2));
            console.log('✅ BROWSER WORKING');
        } else {
            console.error('❌ BROWSER FAILED');
            console.error('Error:', result.error);
        }

    } catch (error: any) {
        console.error('❌ EXCEPTION:', error);
        if (error.code === 'MODULE_NOT_FOUND') {
            console.error('Dependency missing. This might be a deeper environment issue.');
        }
    }

    process.exit(0);
}

run();
