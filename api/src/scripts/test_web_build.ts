import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080/ws';
const JWT_SECRET = 'change-me'; 

const token = jwt.sign({ sub: 'test-user', role: 'OWNER' }, JWT_SECRET);
const authHeaders = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
};

async function main() {
  console.log('\n🚀 Starting Joe Capabilities Test (Web Build)...\n');

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

    // 2. Request Web Build
    console.log('\n2️⃣  Requesting: "Build a single-file landing page for Xelite Coffee..."');
    const ws = new WebSocket(WS_URL);
    
    await new Promise<void>((resolve, reject) => {
        // Longer timeout for generation
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for completion')), 60000);

        ws.on('open', async () => {
            console.log('   📡 WebSocket Connected');
            
            await fetch(`${API_URL}/runs/start`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ 
                    text: "Create a modern, single-file HTML landing page for 'Xelite Coffee'. It should have a dark theme, a hero section with a headline 'Code & Caffeine', a features section, and a footer. Save it as 'xelite.html'.", 
                    sessionId 
                })
            });
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            
            if (msg.type === 'text') {
                console.log(`   💬 Joe says: ${msg.data.slice(0, 100).replace(/\n/g, ' ')}...`);
            }
            
            if (msg.type === 'step_started') {
                console.log(`   ➡️  Working on: ${msg.data.name}`);
            }

            if (msg.type === 'step_done') {
                if (msg.data.plan && msg.data.plan.name === 'file_write') {
                    console.log(`   ✅ File Created: ${msg.data.plan.input.filename}`);
                }
            }

            if (msg.type === 'run_completed') {
                clearTimeout(timeout);
                console.log('   🏁 Task Completed');
                resolve();
            }
        });
        
        ws.on('error', (e) => reject(e));
    });
    
    ws.close();

    // 3. Verify Artifact
    console.log('\n3️⃣  Verifying Artifact...');
    const artifactPath = '/tmp/joe-artifacts/xelite.html';
    if (fs.existsSync(artifactPath)) {
        const stats = fs.statSync(artifactPath);
        console.log(`   ✅ File found: ${artifactPath}`);
        console.log(`   📏 Size: ${stats.size} bytes`);
        console.log(`   👀 Preview content:`);
        const content = fs.readFileSync(artifactPath, 'utf-8');
        console.log(content.slice(0, 200));
        console.log('   ...');
    } else {
        console.error(`   ❌ File NOT found at ${artifactPath}`);
        process.exit(1);
    }

    console.log('\n✨ CAPABILITIES TEST PASSED ✨\n');

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

main();
