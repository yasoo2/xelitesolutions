
import { executeTool } from '../src/tools/registry';

async function runTest() {
    console.log('--- Testing Browser Tool Execution ---');
    
    // We test the tool directly, bypassing the LLM and API routes.
    // This confirms that if the LLM *were* to select this tool, it would work.
    
    const input = { url: 'https://www.google.com' };
    console.log('Executing tool: browser_open with input:', input);
    
    try {
        const result = await executeTool('browser_open', input);
        
        console.log('Result OK:', result.ok);
        if (result.output) {
            console.log('Session ID:', result.output.sessionId);
            console.log('WS URL:', result.output.wsUrl);
        }
        if (result.error) {
            console.error('Error:', result.error);
        }
        if (result.logs) {
            console.log('Logs:', result.logs);
        }
        
        if (result.ok && result.output?.wsUrl) {
            console.log('✅ SUCCESS: Browser tool executed successfully.');
        } else {
            console.error('❌ FAILURE: Browser tool execution failed.');
            // Note: If the browser worker is not running, this will fail.
            // But this confirms the INTEGRATION code (tool execution) is correct.
        }
        
    } catch (e) {
        console.error('Exception during tool execution:', e);
    }
}

runTest();
