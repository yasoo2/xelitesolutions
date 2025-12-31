
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import path from 'path';

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const WS_URL = 'ws://localhost:8080/ws';
const JWT_SECRET = 'change-me'; 
const token = jwt.sign({ sub: 'test-user', role: 'OWNER' }, JWT_SECRET);

if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = "sk-mock";

function runTest() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL, { headers: { 'Authorization': `Bearer ${token}` } });
        
        const timeout = setTimeout(() => {
            console.error('TIMEOUT: No response in 15s');
            ws.close();
            reject('Timeout');
        }, 15000);

        ws.on('open', () => {
            console.log('Connected to WS');
            
            console.log('\n--- TEST: Web Search (Global Topic) ---');
            ws.send(JSON.stringify({
                type: 'run_tool',
                tool: 'web_search',
                input: { query: 'Latest developments in Quantum Computing' },
                id: 'test-search-1'
            }));
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            console.log('Received message type:', msg.type);
            
            if (msg.type === 'tool_result' && msg.id === 'test-search-1') {
                clearTimeout(timeout);
                console.log('Result OK:', msg.result.ok);
                if (msg.result.ok) {
                    const output = msg.result.output;
                    const results = typeof output === 'string' ? JSON.parse(output) : output;
                    console.log(`Received ${results.length} results`);
                    results.slice(0, 3).forEach((r: any, i: number) => {
                        console.log(`[${i}] ${r.title}`);
                    });
                } else {
                    console.error('Tool failed:', msg.result.error);
                }
                ws.close();
                resolve(true);
            } else if (msg.type === 'error') {
                console.error('Error:', msg.message);
                clearTimeout(timeout);
                ws.close();
                reject(msg.message);
            }
        });
        
        ws.on('error', (e) => {
            console.error('WS Error:', e);
            clearTimeout(timeout);
            reject(e);
        });
    });
}

runTest().catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
});
