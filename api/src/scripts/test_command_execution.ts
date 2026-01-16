/**
 * Direct API Test for Command Execution
 * Tests sending a command directly to the API to create a calculator app
 */

const API = 'http://localhost:3000';

async function testCommandExecution() {
    console.log('=== Testing Command Execution via API ===\n');

    // Step 1: Login to get token
    console.log('1. Logging in...');
    const loginRes = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'curltest@test.com', password: 'Test123!' }),
    });
    const { token } = await loginRes.json();
    console.log(`✅ Token obtained\n`);

    // Step 2: Create a session
    console.log('2. Creating a new chat session...');
    const sessionRes = await fetch(`${API}/sessions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ kind: 'agent' }),
    });
    const session = await sessionRes.json();
    console.log(`✅ Session created: ${session.id}\n`);

    // Step 3: Send the command
    const command = `أنشئ تطبيق ويب بسيط لحساب الأرقام (Calculator) باستخدام HTML, CSS, و JavaScript. يجب أن يحتوي على:
- واجهة جميلة مع أزرار للأرقام من 0-9
- عمليات حسابية أساسية (+, -, *, /)
- شاشة عرض للنتائج
- تصميم عصري بألوان جميلة
احفظ الملفات في مجلد جديد اسمه "calculator-app"`;

    console.log('3. Sending command to create calculator app...');
    console.log(`Command: ${command.slice(0, 100)}...`);

    const runRes = await fetch(`${API}/runs/start`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            text: command,
            sessionId: session.id,
            sessionKind: 'agent',
        }),
    });

    if (!runRes.ok) {
        console.error(`❌ Run request failed: ${runRes.status}`);
        const errorText = await runRes.text();
        console.error(`Error: ${errorText.slice(0, 500)}`);
        return;
    }

    console.log(`✅ Run request accepted (${runRes.status})\n`);

    // Step 4: Monitor execution via polling
    console.log('4. Monitoring execution...\n');

    let attempts = 0;
    const maxAttempts = 30; // 30 seconds
    let completed = false;

    while (attempts < maxAttempts && !completed) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        attempts++;

        const statusRes = await fetch(`${API}/sessions/${session.id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const sessionData = await statusRes.json();

        console.log(`[${attempts}] Checking status...`);

        // Check for messages
        if (sessionData.messages && sessionData.messages.length > 0) {
            const lastMessage = sessionData.messages[sessionData.messages.length - 1];
            console.log(`  Latest message from: ${lastMessage.role}`);
            if (lastMessage.role === 'assistant') {
                console.log(`  Content: ${JSON.stringify(lastMessage.content).slice(0, 200)}...`);
                completed = true;
            }
        }
    }

    // Step 5: Get final session state
    console.log('\n5. Retrieving final session state...');
    const finalRes = await fetch(`${API}/sessions/${session.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    const finalSession = await finalRes.json();

    console.log('\n=== RESULTS ===');
    console.log(`Session ID: ${finalSession.id}`);
    console.log(`Messages: ${finalSession.messages?.length || 0}`);

    if (finalSession.messages && finalSession.messages.length > 0) {
        console.log('\nMessages:');
        finalSession.messages.forEach((msg: any, i: number) => {
            console.log(`\n${i + 1}. ${msg.role}:`);
            console.log(`   ${JSON.stringify(msg.content).slice(0, 300)}...`);
        });
    }

    // Step 6: Check for created files
    console.log('\n6. Checking for created files in calculator-app...');
    try {
        const filesRes = await fetch(`${API}/files?path=calculator-app`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (filesRes.ok) {
            const files = await filesRes.json();
            console.log(`Files created: ${JSON.stringify(files, null, 2)}`);
        }
    } catch (e) {
        console.log(`Could not fetch files: ${e}`);
    }

    console.log('\n=== Test Complete ===');
}

testCommandExecution().catch(console.error);
