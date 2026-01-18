
import * as http from 'http';

const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3000;
const EMAIL = process.env.ADMIN_EMAIL || 'tester@test.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'password123';

function request(method: string, path: string, body: any, token?: string): Promise<{ status: number, data: any }> {
    return new Promise((resolve, reject) => {
        const options: http.RequestOptions = {
            hostname: API_HOST,
            port: API_PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        if (token && options.headers) (options.headers as any)['Authorization'] = `Bearer ${token}`;

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode || 500, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode || 500, data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log('🚀 Starting KFC Agent Test (Auto-Approve, /runs/start)...');

    // 1. Login
    console.log('🔑 Logging in...');
    let token = '';
    try {
        const res = await request('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
        if (res.status !== 200) throw new Error('Login failed: ' + JSON.stringify(res.data));
        token = res.data.token || res.data.accessToken;
        console.log('✅ Logged in.');
    } catch (e: any) {
        console.error('❌ Login error:', e.message);
        process.exit(1);
    }

    // 2. Create Session
    console.log('📝 Creating Session...');
    let sessionId = '';
    try {
        const res = await request('POST', '/sessions', { title: 'KFC Build Test', kind: 'agent' }, token);
        if (res.status !== 200) throw new Error('Create session failed: ' + JSON.stringify(res.data));
        sessionId = res.data._id;
        console.log(`✅ Session Created: ${sessionId}`);
    } catch (e: any) {
        console.error('❌ Create session error:', e.message);
        process.exit(1);
    }

    // 3. Send Prompt (Using /runs/start)
    console.log('📢 Sending Prompt via /runs/start...');
    await request('POST', '/runs/start', {
        sessionId,
        text: 'Build a huge KFC website with online ordering stuff, products like buckets and burgers, and a cart system.'
    }, token);

    // 4. Poll for Completion & Auto-Approve
    console.log('👀 Monitoring & Auto-Approving...');
    const start = Date.now();
    let foundScaffold = false;
    let lastMsgCount = 0;
    let didReview = false;

    while (Date.now() - start < 300000) { // 5 minutes
        const res = await request('GET', `/sessions/${sessionId}/messages`, null, token);
        if (res.status === 200 && Array.isArray(res.data)) {
            const msgs = res.data;
            if (msgs.length > lastMsgCount) {
                console.log(`📨 New messages: ${msgs.length} total.`);

                // Check new messages
                for (let i = lastMsgCount; i < msgs.length; i++) {
                    const m = msgs[i];
                    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

                    if (content.includes('scaffold_project') || content.includes('ecommerce-store')) {
                        if (!foundScaffold) {
                            console.log('🎉 SCAFFOLD DETECTED!');
                            foundScaffold = true;
                        }
                    }

                    const promptForReview = (m.role === 'assistant' &&
                        (content.includes('Proposed') || content.includes('Plan') || content.includes('approval') || content.includes('Review')));

                    if (promptForReview && !didReview) {
                        console.log('👍 Detecting Plan. Sending Auto-Approval "yes"...');
                        await sleep(3000);
                        // Approve via /runs/start
                        await request('POST', '/runs/start', { sessionId, text: 'yes' }, token);
                        didReview = true;
                    }
                }

                lastMsgCount = msgs.length;
            }

            // Success condition
            if (foundScaffold) {
                const allContent = JSON.stringify(msgs);
                // Check if npm install ran or it says done
                if (allContent.includes('npm_install') || allContent.includes('Done') || msgs.length > 25) {
                    console.log('✅ Agent progressed significantly.');
                    break;
                }
            }
        }
        await sleep(5000);
    }

    if (foundScaffold) {
        console.log('✅ Test Passed: Agent attempted to scaffold.');
        process.exit(0);
    } else {
        console.error('❌ Test Failed: No scaffold detected within timeout.');
        process.exit(1);
    }
}

main();
