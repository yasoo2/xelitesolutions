
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

// Configuration
const API_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080/ws';
const JWT_SECRET = 'change-me'; // Default

// Helpers
const token = jwt.sign({ sub: 'tester', role: 'OWNER' }, JWT_SECRET);
const headers = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log('\n🔍 INITIALIZING FULL SYSTEM TEST SUITE\n');
    console.log('Target API:', API_URL);

    // 1. Health Check
    try {
        const res = await fetch(`${API_URL}/health`);
        const data = await res.json();
        if (data.status === 'OK') console.log('✅ Health Check Passed');
        else throw new Error('Health check failed');
    } catch (e) {
        console.error('❌ API is not running or unreachable.');
        process.exit(1);
    }

    // 2. Provider Verification Logic
    console.log('\n🧪 Testing AI Provider Verification Endpoint...');
    
    // 2.1 Test Default Provider (Should Pass)
    try {
        const res = await fetch(`${API_URL}/runs/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ provider: 'llm' })
        });
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            if (res.ok && data.status === 'ok') {
                console.log('✅ Default Provider (Joe System) Verified');
            } else {
                console.error('❌ Default Provider Failed:', data);
            }
        } catch (e) {
            console.error('❌ Default Provider Failed to Parse JSON. Status:', res.status);
            console.error('   Response Body:', text.substring(0, 200));
        }
    } catch (e) { console.error('❌ Default Provider Error:', e); }

    // 2.2 Test External Provider with Bad Key (Should Fail gracefully)
    try {
        const res = await fetch(`${API_URL}/runs/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
                provider: 'openai', 
                apiKey: 'sk-invalid-test-key-123',
                model: 'gpt-4o'
            })
        });
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            if (!res.ok) { // We expect failure
                console.log(`✅ External Provider Auth Check Passed (Correctly rejected invalid key: ${res.status})`);
            } else {
                console.warn('⚠️ External Provider accepted invalid key? (Unexpected)', data);
            }
        } catch (e) {
            console.error('❌ External Provider Failed to Parse JSON. Status:', res.status);
            console.error('   Response Body:', text.substring(0, 200));
        }
    } catch (e) { console.error('❌ External Provider Test Error:', e); }


    // 3. Tool Execution Tests (Direct)
    console.log('\n🛠️  Testing Individual Tools...');
    
    const toolsToTest = [
        { 
            name: 'echo', 
            input: { text: 'ping' }, 
            check: (res: any) => res.output?.text === 'ping' 
        },
        { 
            name: 'ls', 
            input: { path: '.' }, 
            check: (d: any) => d.ok && d.output.files.length > 0 
        },
        { 
            name: 'file_write', 
            input: { filename: 'system_test.txt', content: 'test_content' }, 
            check: (res: any) => res.ok === true 
        },
        { 
            name: 'file_read', 
            input: { filename: 'system_test.txt' }, 
            check: (res: any) => res.output?.content === 'test_content' 
        },
    ];

    for (const t of toolsToTest) {
        try {
            process.stdout.write(`   Testing ${t.name}... `);
            const res = await fetch(`${API_URL}/tools/${t.name}/execute`, {
                method: 'POST',
                headers,
                body: JSON.stringify(t.input)
            });
            const data = await res.json();
            if (t.check(data)) {
                console.log('OK ✅');
            } else {
                console.log('FAILED ❌');
                console.error('   Output:', JSON.stringify(data, null, 2));
            }
        } catch (e) {
            console.log('ERROR ❌');
            console.error(e);
        }
    }

    // Cleanup test file
    try { fs.unlinkSync(path.join(process.cwd(), 'system_test.txt')); } catch {}


    // 4. End-to-End Run Simulation
    console.log('\n🤖 Testing Full Agent Run (WebSocket Flow)...');
    
    try {
        const ws = new WebSocket(WS_URL);
        
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout waiting for run completion')), 8000);

            ws.on('open', async () => {
                console.log('   WebSocket Connected. Starting Run...');
                
                // Start a run that uses a tool
                const res = await fetch(`${API_URL}/runs/start`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ 
                        text: 'echo "Hello World"',
                        sessionId: 'test-session-1'
                    })
                });
                const data = await res.json();
                console.log(`   Run Started (ID: ${data.runId || 'mock'})`);
            });

            ws.on('message', (msg) => {
                const event = JSON.parse(msg.toString());
                if (event.type === 'step_started') {
                    // console.log(`   [Step] ${event.data.name}`);
                }
                if (event.type === 'text') {
                     console.log(`   [Agent Reply] ${event.data.substring(0, 50)}...`);
                }
                if (event.type === 'step_done' && event.data.name.includes('echo')) {
                    console.log('   ✅ Tool execution verified in run flow');
                    clearTimeout(timer);
                    ws.close();
                    resolve();
                }
            });
            
            ws.on('error', reject);
        });

    } catch (e) {
        console.error('❌ Run Simulation Failed:', e);
    }

    console.log('\n✨ FULL SYSTEM TEST COMPLETE ✨\n');
}

main();
