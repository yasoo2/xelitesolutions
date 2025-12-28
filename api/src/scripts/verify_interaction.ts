
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
// import fetch from 'node-fetch'; // Native fetch is available in Node 18+

const API_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080/ws';
const JWT_SECRET = 'change-me'; // Default

// Generate Token
const token = jwt.sign({ sub: 'tester', role: 'OWNER' }, JWT_SECRET);
const headers = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
};

async function waitForApi(timeoutMs: number) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const res = await fetch(`${API_URL}/health`);
            if (res.ok) {
                const data: any = await res.json().catch(() => null);
                if (data?.status === 'OK') return;
            }
        } catch {}
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('API health check timeout');
}

async function runInteraction(testName: string, provider: string | undefined, apiKey: string | undefined, message: string) {
    console.log(`\n\n🔹 TEST: ${testName}`);
    console.log(`   Provider: ${provider || 'DEFAULT (Joe)'}`);
    console.log(`   Message: "${message}"`);

    const ws = new WebSocket(WS_URL);

    return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error('   ❌ TIMEOUT waiting for response');
            ws.close();
            resolve();
        }, 15000);

        ws.on('open', async () => {
            // console.log('   (WS Connected)');
            
            // Start Run
            try {
                const payload: any = {
                    text: message,
                    sessionId: `test-${Date.now()}`,
                    provider,
                    model: 'gpt-4o' // just in case
                };
                if (apiKey) payload.apiKey = apiKey;

                const res = await fetch(`${API_URL}/runs/start`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                
                if (!res.ok) {
                    const txt = await res.text();
                    console.log(`   ⚠️ API Error: ${res.status} - ${txt}`);
                    // If it's an expected auth error, we count it as a "result"
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                    return;
                }

                const data: any = await res.json();
                console.log(`   ✅ Run Started: ${data.runId}`);
            } catch (e) {
                console.error('   ❌ Failed to start run:', e);
                clearTimeout(timeout);
                ws.close();
                resolve();
            }
        });

        ws.on('message', (data) => {
            try {
                const event = JSON.parse(data.toString());
                
                if (event.type === 'text') {
                    if (typeof event.id === 'string' && event.id.startsWith('system_prompt:')) return;
                    console.log(`   🤖 Agent says: "${event.data.replace(/\n/g, ' ')}"`);
                    // Success!
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                    return;
                }
                
                if (event.type === 'step_done') {
                    console.log(`   🛠️  Step Done: ${event.data.name}`);
                }

                // If we see a "text" response, we can consider it "working"
                // But let's wait a bit to see if multiple chunks come
            } catch (e) {}
        });
        
        // Wait for 5 seconds of silence or until timeout to finish
    });
}

async function main() {
    console.log('🚀 STARTING INTERACTION TESTS');
    await waitForApi(15000);

    // 1. Test Joe (Local/Heuristic)
    await runInteraction('Joe (Local) - Greeting', 'llm', undefined, 'مرحبا يا جو');

    // 1b. Test Joe (Local/Heuristic) - Weather (Tool Use)
    await runInteraction('Joe (Local) - Weather', 'llm', undefined, 'ما حالة الطقس اليوم في اسطنبول؟');

    // 2. Test Joe (Local/Heuristic) - Command
    await runInteraction('Joe (Local) - Command', 'llm', undefined, 'status');

    // 3. Test Joe (Local) - Build Site Command
    await runInteraction('Joe (Local) - Build Site', 'llm', undefined, 'ابني موقع landing.html');

    // 4. Test OpenAI (No Key - Should Fail or Warn)
    // Note: If env key is missing, server logs warning. Request might fail if logic enforces key.
    await runInteraction('OpenAI (Missing Key)', 'openai', undefined, 'Hello OpenAI');

    // 5. Test OpenAI (Invalid Key - Should Fail Gracefully)
    await runInteraction('OpenAI (Invalid Key)', 'openai', 'invalid-key', 'Hello OpenAI');

    console.log('\n✅ DONE');
    process.exit(0);
}

main();
