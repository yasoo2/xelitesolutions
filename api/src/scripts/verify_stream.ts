import WebSocket from 'ws';
// import { v4 as uuidv4 } from 'uuid'; // REMOVED
// import mongoose from 'mongoose'; // REMOVED
import dotenv from 'dotenv';
import path from 'path';
// import { Session } from '../models/session'; // REMOVED

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function verifyStream() {
    console.log('📡 Testing Browser Stream WebSocket...');

    // 1. Get Token
    const port = process.env.PORT || 3000;
    const baseUrl = `http://localhost:${port}`;
    console.log(`🔑 Authenticating with ${baseUrl}/auth/dev ...`);

    // @ts-ignore
    const authRes = await fetch(`${baseUrl}/auth/dev`, { method: 'POST' });
    if (!authRes.ok) {
        throw new Error(`Auth failed: ${authRes.status} ${authRes.statusText}`);
    }
    // @ts-ignore
    const { token } = await authRes.json();
    console.log('✅ Got Token');

    // 2. Generate Session ID
    const sessionId = 'test-session-' + Date.now();
    console.log(`✅ Using Session ID: ${sessionId}`);

    // 3. Connect to WebSocket
    const wsUrl = `ws://localhost:${port}/ws/browser?sessionId=${sessionId}`;
    console.log(`🔌 Connecting to: ${wsUrl}`);

    return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
            console.error('❌ Timeout waiting for stream events');
            ws.close();
            reject(new Error('Timeout'));
        }, 10000); // Increased timeout

        ws.on('open', async () => {
            console.log('✅ WebSocket Connected!');

            // 4. Trigger Action
            console.log('🚀 Triggering browser_open action...');
            try {
                // @ts-ignore
                const triggerRes = await fetch(`${baseUrl}/tools/browser_open/execute`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId,
                        url: 'https://google.com'
                    })
                });
                console.log(`Trigger status: ${triggerRes.status}`);
                // @ts-ignore
                const body = await triggerRes.json();
                console.log('📦 Trigger Response:', JSON.stringify(body, null, 2));

                if (!body.ok) {
                    console.error('❌ Action Failed:', body.error || 'Unknown error');
                }
            } catch (e: any) {
                console.error('Trigger failed:', e.message);
            }
        });

        ws.on('message', (data: any) => {
            const str = data.toString();
            // console.log('📩 RX:', str.slice(0, 200)); 

            try {
                const msg = JSON.parse(str);

                // Detailed logging for debug
                if (msg.type === 'stream_frame') {
                    console.log(`📸 Frame received (size: ${msg.jpegBase64?.length})`);
                    clearTimeout(timeout);
                    ws.close();
                    console.log('🎉 Stream verification passed!');
                    resolve();
                } else if (msg.type === 'session_status') {
                    console.log(`ℹ️ Status: ${msg.workerStatus}`);
                } else {
                    console.log(`📩 Event: ${msg.type}`);
                }
            } catch (e) {
                console.log('⚠️ Received non-JSON');
            }
        });

        ws.on('error', (err: any) => {
            console.error('❌ WebSocket Error:', err.message);
            clearTimeout(timeout);
            reject(err);
        });

        ws.on('close', (code: any, reason: any) => {
            console.log(`Connection closed: ${code} ${reason}`);
        });
    });
}

verifyStream().then(async () => {
    // await mongoose.disconnect();
    process.exit(0);
}).catch(async (e) => {
    console.error('FAILED:', e);
    // await mongoose.disconnect();
    process.exit(1);
});
