
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import path from 'path';
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const API_URL = 'http://127.0.0.1:8080';
const WS_URL = 'ws://127.0.0.1:8080/ws';
const JWT_SECRET = 'change-me'; // Default dev secret

const token = jwt.sign({ sub: 'test-user', role: 'OWNER' }, JWT_SECRET);
const headers = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
};

async function main() {
    console.log('🚀 STARTING SEARCH TEST: iPhone 15 Pro Max');
    console.log('   Env Check:', { 
        hasKey: !!process.env.OPENAI_API_KEY, 
        keyLen: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
        cwd: process.cwd(),
        envPath: path.resolve(__dirname, '../../.env')
    });
    
    const ws = new WebSocket(WS_URL);

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error('   ❌ TIMEOUT waiting for WS connection');
            reject(new Error('WS Timeout'));
        }, 15000);

        ws.on('open', () => {
            clearTimeout(timeout);
            console.log('   (WS Connected)');
            resolve();
        });
        
        ws.on('error', (err) => {
            clearTimeout(timeout);
            console.error('WS Error:', err);
            reject(err);
        });
        
        ws.on('close', () => {
            clearTimeout(timeout);
        });

        if (ws.readyState === WebSocket.OPEN) {
            clearTimeout(timeout);
            console.log('   (WS Connected)');
            resolve();
        }
    });

    // Listen for messages
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'step_started') {
                console.log(`   🔸 Step: ${msg.data?.name}`);
            }
            if (msg.type === 'step_done') {
                console.log(`   ✅ Step Done: ${msg.data?.name}`);
                if (msg.data?.name && (msg.data.name.includes('central_answer') || msg.data.name.includes('web_search'))) {
                     console.log('      Result snippet:', JSON.stringify(msg.data?.result).slice(0, 1000));
                }
            }
            if (msg.type === 'run_finished') {
                console.log('\n✅ RUN FINISHED');
                // console.log('Full Response:', JSON.stringify(msg, null, 2));
                ws.close();
                process.exit(0);
            }
            if (msg.type === 'error') {
                console.error('   ❌ Error:', msg.data);
            }
            if (msg.type === 'text') {
                 console.log('   💬 Joe:', msg.data);
            }
        } catch (e) {
            // ignore parse errors
        }
    });

    // Start Run
    try {
        const payload = {
            text: 'ابحث لي عن سعر iPhone 15 Pro Max في المتاجر السعودية مثل جرير ونون',
            sessionId: `test-search-${Date.now()}`,
            provider: 'openai', // Use OpenAI to trigger real planning
            model: 'gpt-4o',
            apiKey: process.env.OPENAI_API_KEY
        };

        console.log('   Sending run request...');
        try {
            const res = await fetch(`${API_URL}/runs/start`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(600000) // 10 minutes timeout
            });

            if (!res.ok) {
                const txt = await res.text();
                console.error('❌ Run start failed:', res.status, txt);
                process.exit(1);
            }

            const data: any = await res.json();
            console.log('   ✅ Run started via HTTP. Run ID:', data.runId);
        } catch (err: any) {
            const isTimeout = 
                err.code === 'UND_ERR_HEADERS_TIMEOUT' || 
                err.name === 'HeadersTimeoutError' ||
                err.cause?.code === 'UND_ERR_HEADERS_TIMEOUT' ||
                err.cause?.name === 'HeadersTimeoutError';

            if (isTimeout) {
                console.log('   ⚠️ HTTP Headers Timeout (expected for long runs). Waiting for WS completion...');
            } else {
                console.error('Failed to start run:', err);
                process.exit(1);
            }
        }
        
    } catch (e) {
        console.error('Failed to start run:', e);
        process.exit(1);
    }
}

main();
