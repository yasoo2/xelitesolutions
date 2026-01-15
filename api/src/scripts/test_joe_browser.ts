
import { tools } from '../tools/registry';
import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
    console.log('Starting Joe Browser Test (Direct Actions Mode)...');

    const browserTool = tools.find(t => t.name === 'browser_run');
    if (!browserTool) {
        console.error('ERROR: browser_run tool not found in registry!');
        process.exit(1);
    }

    // Bypass LLM planning and send raw actions to test the Worker infrastructure directly
    const actions = [
        { type: 'goto', url: 'https://example.com' },
        { type: 'wait', ms: 1000 },
        { type: 'scroll', direction: 'down' },
        { type: 'assert', text: 'Example Domain' }
    ];

    const input = {
        sessionId: 'test-session-infra-' + Date.now(),
        userId: 'test-user',
        actions: actions, // Direct actions
        // instructionText: ... // Skipped to avoid LLM requirement for this infra test
    };

    console.log('Executing browser_run with actions:', JSON.stringify(actions, null, 2));

    try {
        // @ts-ignore
        const result = await browserTool.execute(input);

        console.log('---------------------------------------------------');
        console.log('Test Result Success:', result.ok);
        console.log('Summary:', result.output?.summary);
        if (result.error) console.log('Error:', result.error);
        if (result.output?.screenshotHref) console.log('Screenshot:', result.output.screenshotHref);
        console.log('Logs:', result.logs?.join('\n'));
        console.log('---------------------------------------------------');

        if (result.ok) {
            console.log('✅ Joe Browser Infrastructure is ONLINE and executing actions!');
            process.exit(0);
        } else {
            console.error('❌ Joe Browser failed to execute actions.');
            process.exit(1);
        }

    } catch (error: any) {
        console.error('CRITICAL FAILURE:', error);
        process.exit(1);
    }
}

runTest();
