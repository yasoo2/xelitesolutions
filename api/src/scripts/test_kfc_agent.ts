
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function main() {
    console.log('🚀 Starting KFC Agent Test...');

    // 1. Login
    console.log('🔑 Logging in...');
    let token = '';
    try {
        const res = await axios.post(`${API_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
        token = res.data.token || res.data.accessToken;
        console.log('✅ Logged in.');
    } catch (e: any) {
        console.error('❌ Login failed:', e.message);
        process.exit(1);
    }

    // 2. Create Session
    console.log('📝 Creating Session...');
    let sessionId = '';
    try {
        const res = await axios.post(
            `${API_URL}/sessions`,
            { title: 'KFC Build Test', kind: 'agent' },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        sessionId = res.data._id;
        console.log(`✅ Session Created: ${sessionId}`);
    } catch (e: any) {
        console.error('❌ Create session failed:', e.message);
        process.exit(1);
    }

    // 3. Configure Session (Auto-Approve)
    console.log('⚙️ Configuring Session (Auto-Approve)...');
    try {
        // We set a dummy key to trigger the config update side-effect in sessions.ts
        // or we assume the default admin agent settings might strictly require approval unless we override.
        // Based on code reading, we can set LLM_API_KEY to update config.
        await axios.post(
            `${API_URL}/sessions/${sessionId}/secrets`,
            { key: 'LLM_API_KEY', value: 'sk-dummy-because-using-env', provider: 'openai' },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        // We also need to explicitly enable auto-approve if the endpoint supports it directly or via side channel.
        // The previous code showed setSessionRunConfig is called when LLM_API_KEY is set.
        // Let's assume the default behavior for 'agent' kind might still need explicit auto-approve.
        // There is no direct endpoint shown to set config, but the secrets endpoint does it using existing config values.
        // We will rely on the agent's default behavior or the fact that we are 'admin'.

    } catch (e: any) {
        console.warn('⚠️ Config update warning:', e.message);
    }

    // 4. Connect to WebSocket for Real-time Monitoring
    console.log('🔌 Connecting to WebSocket...');
    const socket = io(API_URL, {
        extraHeaders: { Authorization: `Bearer ${token}` }
    });

    socket.on('connect', () => {
        console.log('✅ WebSocket Connected');
        socket.emit('join', sessionId);
    });

    socket.on('message', (msg) => {
        // console.log('📩 WS Message:', msg);
        if (msg.type === 'step_done' || msg.type === 'step_started') {
            const data = msg.data || {};
            const name = data.name || '';
            console.log(`🛠️ Agent Step: ${msg.type} - ${name}`);
            if (msg.type === 'step_done' && name.includes('scaffold_project')) {
                console.log('🎉 SCAFFOLD DETECTED!');
            }
        }
        if (msg.type === 'text') {
            console.log(`🤖 Agent: ${String(msg.data).slice(0, 100)}...`);
        }
    });

    // 5. Send The Prompt
    console.log('📢 Sending Prompt: "Build a huge KFC website..."');
    try {
        await axios.post(
            `${API_URL}/sessions/${sessionId}/messages`,
            { content: 'Build a huge KFC website with online ordering stuff, products like buckets and burgers, and a cart system.' },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log('✅ Prompt Sent.');
    } catch (e: any) {
        console.error('❌ Send message failed:', e.message);
        process.exit(1);
    }

    // 6. Monitor Loop
    console.log('👀 Monitoring for 60 seconds...');

    // Wait loop
    await new Promise(resolve => setTimeout(resolve, 60000));

    console.log('🛑 Test Finished (Time limit reached).');

    // Check if file exists (if we ran scaffold locally)
    // Since we are running on the server, we can check the fs directly if we know where it writes.
    // It normally writes to process.cwd() or a subfolder.
    // The Run code usually uses `scaffold_project` which writes to disk.

    process.exit(0);
}

main();
