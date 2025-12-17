import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

const API_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080/ws';
const JWT_SECRET = 'change-me'; 

const token = jwt.sign({ sub: 'test-user', role: 'OWNER' }, JWT_SECRET);
const authHeaders = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
};

async function main() {
  console.log('\n🚀 Starting Reproduction Script...\n');

  try {
    // 1. Init Session
    console.log('1️⃣  Initializing Session...');
    const startRes = await fetch(`${API_URL}/runs/start`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ text: 'init' })
    });
    
    const sessionsRes = await fetch(`${API_URL}/sessions`, { headers: authHeaders });
    const sessionsData = await sessionsRes.json();
    const session = sessionsData.sessions[0];
    const sessionId = session.id || session._id;
    console.log(`   Session ID: ${sessionId}`);

    // 2. Connect WS
    const ws = new WebSocket(WS_URL);
    
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for response')), 10000);

        ws.on('open', async () => {
            console.log('   📡 WebSocket Connected');
            
            // 3. Send "Hello" to trigger fallback
            console.log('   ➡️  Sending "Hello"...');
            await fetch(`${API_URL}/runs/start`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ 
                    text: "Hello", 
                    sessionId 
                })
            });
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            // console.log('   📩 Received:', msg);
            
            if (msg.type === 'text') {
                console.log(`   ✅ Received Text Event: "${msg.data}"`);
                clearTimeout(timeout);
                resolve();
                ws.close();
            }
            if (msg.type === 'step_done' && msg.data.plan?.name === 'echo') {
                 console.log('   ℹ️  Echo tool executed.');
            }
        });
        
        ws.on('error', (e) => {
            console.error('WS Error:', e);
            reject(e);
        });
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();
