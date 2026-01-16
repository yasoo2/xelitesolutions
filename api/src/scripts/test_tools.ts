/**
 * Tool Execution Test Script
 * Tests multiple tools to ensure they are working correctly
 */

export { };
const API = 'http://localhost:3000';

async function getToken() {
    // Try login first, then register if needed
    let res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'tooltest@test.com', password: 'Test123!' }),
    });

    let data = await res.json();
    if (data.token) return data.token;

    // Try register
    res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'tooltest@test.com', password: 'Test123!' }),
    });

    data = await res.json();
    return data.token || '';
}

async function testTool(token: string, toolName: string, input: any) {
    console.log(`\n--- Testing: ${toolName} ---`);
    console.log(`Input: ${JSON.stringify(input).slice(0, 200)}`);

    try {
        const res = await fetch(`${API}/tools/${toolName}/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(input),
        });

        const raw = await res.text();
        let data: any;
        try { data = JSON.parse(raw); } catch { data = { raw }; }

        const ok = data?.ok === true;
        const error = data?.error;

        console.log(`Status: ${res.status}`);
        console.log(`OK: ${ok}`);
        if (error) console.log(`Error: ${error}`);
        console.log(`Output: ${JSON.stringify(data?.output || data).slice(0, 300)}`);

        return { toolName, ok, error, status: res.status };
    } catch (e: any) {
        console.log(`Exception: ${e.message}`);
        return { toolName, ok: false, error: e.message, status: 0 };
    }
}

async function main() {
    console.log('=== Tool Execution Test ===\n');

    const token = await getToken();
    if (!token) {
        console.log('ERROR: Could not get authentication token');
        process.exit(1);
    }
    console.log('Token obtained successfully');

    const results: any[] = [];

    // Test 1: echo tool
    results.push(await testTool(token, 'echo', { text: 'Hello from test!' }));

    // Test 2: browser_open tool (the one we just added)
    results.push(await testTool(token, 'browser_open', {
        url: 'https://example.com',
        sessionId: 'test-session-123'
    }));

    // Test 3: file_read tool
    results.push(await testTool(token, 'file_read', {
        path: '/Users/younissowadi/xelitesolutions-1/package.json'
    }));

    // Test 4: shell_execute tool
    results.push(await testTool(token, 'shell_execute', {
        command: 'echo "shell test"',
        cwd: '/tmp'
    }));

    // Test 5: grep_search tool
    results.push(await testTool(token, 'grep_search', {
        query: 'browser_open',
        path: '/Users/younissowadi/xelitesolutions-1/api/src/tools',
        include: '*.ts'
    }));

    // Test 6: task_loop tool
    results.push(await testTool(token, 'task_loop', {
        goal: 'Test goal',
        tasks: [{ name: 'step1', description: 'First step' }]
    }));

    // Summary
    console.log('\n\n=== SUMMARY ===');
    const passed = results.filter(r => r.ok || (r.status === 200 && !r.error?.includes('unknown_tool')));
    const failed = results.filter(r => r.error === 'unknown_tool');
    const other = results.filter(r => !r.ok && r.error !== 'unknown_tool');

    console.log(`Passed: ${passed.length}`);
    console.log(`Unknown Tool Errors: ${failed.length}`);
    console.log(`Other Errors: ${other.length}`);

    if (failed.length > 0) {
        console.log('\nTools with unknown_tool error:');
        failed.forEach(r => console.log(`  - ${r.toolName}`));
    }

    if (other.length > 0) {
        console.log('\nTools with other errors:');
        other.forEach(r => console.log(`  - ${r.toolName}: ${r.error}`));
    }

    console.log('\n=== Test Complete ===');
}

main().catch(console.error);
