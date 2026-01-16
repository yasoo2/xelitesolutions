
export { };
import { tools } from '../tools/registry';

async function main() {
    console.log('--- Tool Registry Verification ---');
    console.log(`Total tools found: ${tools.length}`);

    if (tools.length < 200) {
        console.error(`❌ FAILED: Start check failed. Expected > 200 tools, found ${tools.length}`);
    } else {
        console.log(`✅ SUCCESS: Tool count requirement met (>200).`);
    }

    // Validate structure
    let validCount = 0;
    for (const tool of tools) {
        if (tool.name && tool.description && tool.inputSchema && typeof tool.execute === 'function') {
            validCount++;
        } else {
            console.warn(`WARNING: Tool ${tool.name} is missing required fields.`);
        }
    }
    console.log(`Valid tools: ${validCount}/${tools.length}`);

    // Test a simple tool if exists
    const echoTool = tools.find(t => t.name === 'echo');
    if (echoTool) {
        console.log('Testing "echo" tool...');
        try {
            if (!echoTool.execute) throw new Error("Execute method missing");
            const res = await echoTool.execute({ text: 'Hello JOE' });
            if (res.ok && res.output?.text === 'Hello JOE') {
                console.log('✅ "echo" tool executed successfully.');
            } else {
                console.error('❌ "echo" tool failed:', res);
            }
        } catch (e) {
            console.error('❌ "echo" tool threw exception:', e);
        }
    } else {
        console.warn('⚠️ "echo" tool not found for testing.');
    }
}

main().catch(console.error);
