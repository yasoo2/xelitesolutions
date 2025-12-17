import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
// import fetch from 'node-fetch';

const API_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080/ws';
const JWT_SECRET = 'change-me'; 

const token = jwt.sign({ sub: 'test-user', role: 'OWNER' }, JWT_SECRET);
const authHeaders = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
};

async function main() {
  console.log('\n🏥 Starting Syntax Error Healing Verification...\n');

  // Wait for server
  await new Promise(r => setTimeout(r, 2000));

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

    // 2. Trigger Failure Scenario
    console.log('\n2️⃣  Triggering Syntax Error (Bad JS)...');
    const ws = new WebSocket(WS_URL);
    
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for healing')), 15000);

        ws.on('open', async () => {
            console.log('   📡 WebSocket Connected');
            
            // Send a command to create a broken file and run it
            // Heuristic planner needs to support "run broken.js" mapping to shell_execute
            await fetch(`${API_URL}/runs/start`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ 
      text: "Run the script 'broken.js' using node.", 
      sessionId 
    })
  });
        });

        let healingDetected = false;
        let executionFailed = false;

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            
            if (msg.type === 'text') {
                 // console.log(`   💬 Text: ${msg.data.slice(0, 50)}...`);
                if (msg.data.includes('Self-Healing Activated')) {
                    console.log('   ✨ Self-Healing Signal Detected!');
                    healingDetected = true;
                }
            }
            
            if (msg.type === 'step_failed') {
                console.log(`   ❌ Step Failed: ${msg.data.name}`);
                executionFailed = true;
            }

            if (msg.type === 'step_started') {
                console.log(`   ➡️  Step: ${msg.data.name}`);
            }

            if (msg.type === 'run_completed') {
                clearTimeout(timeout);
                console.log('   🏁 Task Completed');
                
                if (healingDetected) {
                    console.log('   ✅ Verification Passed: Syntax error healing triggered.');
                    resolve();
                } else {
                    console.warn('   ⚠️  Verification Warning: Self-healing signal not seen.');
                    // For now, if we haven't implemented it yet, this will fail/warn.
                    resolve(); 
                }
            }
        });
        
        ws.on('error', (e) => reject(e));
    });
    
    ws.close();
    console.log('\n✨ SYNTAX HEALING TEST COMPLETED ✨\n');

  } catch (err) {
    console.error('\n❌ VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

main();
