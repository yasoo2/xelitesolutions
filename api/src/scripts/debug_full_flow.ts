/**
 * Comprehensive Debugging Script for JOE System
 * Tests the entire flow with detailed logging
 */

const API = 'http://localhost:3000';

async function debugFullFlow() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   JOE System Deep Debugging Test          ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // Step 1: Check API Health
    console.log('1️⃣  Checking API Health...');
    try {
        const healthRes = await fetch(`${API}/health`);
        const health = await healthRes.json();
        console.log(`   ✅ API is healthy: ${JSON.stringify(health)}\n`);
    } catch (e) {
        console.log(`   ❌ API health check failed: ${e}\n`);
        return;
    }

    // Step 2: Login
    console.log('2️⃣  Authenticating...');
    let token: string;
    try {
        const loginRes = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'curltest@test.com', password: 'Test123!' }),
        });
        const loginData = await loginRes.json();
        token = loginData.token;
        if (!token) throw new Error('No token received');
        console.log(`   ✅ Authenticated (token: ${token.slice(0, 20)}...)\n`);
    } catch (e: any) {
        console.log(`   ❌ Authentication failed: ${e.message}\n`);
        return;
    }

    // Step 3: Create Session
    console.log('3️⃣  Creating Session...');
    let sessionId: string;
    try {
        const sessionRes = await fetch(`${API}/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ kind: 'agent', title: 'Debug Test Session' }),
        });
        const sessionData = await sessionRes.json();
        sessionId = sessionData.id || sessionData._id;
        console.log(`   ✅ Session created: ${sessionId}\n`);
        console.log(`   📋 Session data: ${JSON.stringify(sessionData).slice(0, 200)}...\n`);
    } catch (e: any) {
        console.log(`   ❌ Session creation failed: ${e.message}\n`);
        return;
    }

    // Step 4: Test Simple Echo Command First
    console.log('4️⃣  Testing Simple Echo Command...');
    try {
        const echoRes = await fetch(`${API}/runs/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                text: 'echo Hello from debug test',
                sessionId,
                sessionKind: 'agent',
            }),
        });

        console.log(`   📡 Response status: ${echoRes.status}`);
        const echoText = await echoRes.text();
        console.log(`   📄 Response body: ${echoText.slice(0, 500)}\n`);
    } catch (e: any) {
        console.log(`   ❌ Echo command failed: ${e.message}\n`);
    }

    // Wait for processing
    console.log('   ⏳ Waiting 5 seconds for processing...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 5: Check Session Messages
    console.log('5️⃣  Checking Session Messages...');
    try {
        const sessionRes = await fetch(`${API}/sessions/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const sessionData = await sessionRes.json();
        console.log(`   📊 Session ID: ${sessionData.id || sessionData._id}`);
        console.log(`   📨 Total Messages: ${sessionData.messages?.length || 0}`);

        if (sessionData.messages && sessionData.messages.length > 0) {
            console.log('\n   📬 Messages:');
            sessionData.messages.forEach((msg: any, i: number) => {
                console.log(`\n   [${i + 1}] ${msg.role.toUpperCase()}:`);
                const content = typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content);
                console.log(`       ${content.slice(0, 300)}${content.length > 300 ? '...' : ''}`);
            });
        } else {
            console.log('   ⚠️  No messages found in session');
        }
        console.log();
    } catch (e: any) {
        console.log(`   ❌ Failed to fetch session: ${e.message}\n`);
    }

    // Step 6: Test File Creation Command
    console.log('6️⃣  Testing File Creation Command...');
    const fileCommand = `اكتب ملف HTML بسيط اسمه test.html يحتوي على "Hello World"`;

    try {
        const fileRes = await fetch(`${API}/runs/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                text: fileCommand,
                sessionId,
                sessionKind: 'agent',
            }),
        });

        console.log(`   📡 Response status: ${fileRes.status}`);
        const fileText = await fileRes.text();
        console.log(`   📄 Response: ${fileText.slice(0, 300)}\n`);
    } catch (e: any) {
        console.log(`   ❌ File creation command failed: ${e.message}\n`);
    }

    // Wait for processing
    console.log('   ⏳ Waiting 10 seconds for file creation...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Step 7: Final Session State
    console.log('7️⃣  Final Session State...');
    try {
        const finalRes = await fetch(`${API}/sessions/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const finalData = await finalRes.json();

        console.log(`   📊 Final Message Count: ${finalData.messages?.length || 0}`);
        console.log(`   📋 Session Title: ${finalData.title || 'N/A'}`);
        console.log(`   🕐 Last Updated: ${finalData.updatedAt || 'N/A'}`);

        if (finalData.messages && finalData.messages.length > 0) {
            const lastMsg = finalData.messages[finalData.messages.length - 1];
            console.log(`\n   📨 Last Message (${lastMsg.role}):`);
            const content = typeof lastMsg.content === 'string'
                ? lastMsg.content
                : JSON.stringify(lastMsg.content);
            console.log(`   ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`);
        }
    } catch (e: any) {
        console.log(`   ❌ Failed to fetch final state: ${e.message}`);
    }

    // Step 8: Check for created files
    console.log('\n8️⃣  Checking for Created Files...');
    try {
        const fs = await import('fs');
        const path = await import('path');
        const cwd = process.cwd();
        const parentDir = path.resolve(cwd, '..');

        // Check for test.html
        const testHtml = path.join(parentDir, 'test.html');
        if (fs.existsSync(testHtml)) {
            console.log(`   ✅ Found: ${testHtml}`);
            const content = fs.readFileSync(testHtml, 'utf-8');
            console.log(`   📄 Content: ${content.slice(0, 200)}`);
        } else {
            console.log(`   ⚠️  File not found: ${testHtml}`);
        }

        // Check for calculator-app directory
        const calcDir = path.join(parentDir, 'calculator-app');
        if (fs.existsSync(calcDir)) {
            console.log(`   ✅ Found directory: ${calcDir}`);
            const files = fs.readdirSync(calcDir);
            console.log(`   📁 Files: ${files.join(', ')}`);
        } else {
            console.log(`   ⚠️  Directory not found: ${calcDir}`);
        }
    } catch (e: any) {
        console.log(`   ⚠️  File check error: ${e.message}`);
    }

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   Debugging Test Complete                 ║');
    console.log('╚════════════════════════════════════════════╝');
}

debugFullFlow().catch(e => {
    console.error('\n💥 Fatal Error:', e);
    process.exit(1);
});
