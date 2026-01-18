
import * as http from 'http';

const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3000;
// Using the specific user credentials requested by the user
const EMAIL = 'info@orlakjari.com';
const PASSWORD = 'younis2025';

// Detailed prompt based on the user's audio description
const PROMPT = `
Create a website for a company called KFC.
It should have:
- KFC images and logo.
- A food menu list with offers.
- Each list item should have a price and a meal description.
- A cart system to order meals and deliver to home.
I want you to monitor how the system works, verify the steps, and fix any errors automatically.
Make it a full working system without human intervention.
`;

function request(method: string, path: string, body: any, token?: string): Promise<{ status: number, data: any }> {
    return new Promise((resolve, reject) => {
        const options: http.RequestOptions = {
            hostname: API_HOST,
            port: API_PORT,
            path: path,
            method: method,
            headers: {
                'Authorization': `Bearer ${process.env.TEST_AUTH_TOKEN || 'test-token'}`,
                'Content-Type': 'application/json'
            } as any
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
    console.log('🚀 Starting "You Try It" Simulation (KFC Scenario)...');

    // 1. Login
    console.log(`🔑 Logging in as ${EMAIL}...`);
    let token = '';
    try {
        const res = await request('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
        if (res.status !== 200) throw new Error('Login failed: ' + JSON.stringify(res.data));
        token = res.data.token || res.data.accessToken;
        console.log('✅ Logged in successfully.');
    } catch (e: any) {
        console.error('❌ Login error:', e.message);
        process.exit(1);
    }

    // 2. Create Session
    console.log('📝 Creating Session...');
    let sessionId = '';
    try {
        const res = await request('POST', '/sessions', { title: 'KFC Full Build', kind: 'agent' }, token);
        if (res.status !== 200) throw new Error('Create session failed: ' + JSON.stringify(res.data));
        sessionId = res.data._id;
        console.log(`✅ Session Created: ${sessionId}`);
    } catch (e: any) {
        console.error('❌ Create session error:', e.message);
        process.exit(1);
    }

    // 3. Send Prompt
    console.log('📢 Sending Detailed Prompt...');
    console.log(`   "${PROMPT.trim().split('\n')[0]}..."`);

    await request('POST', '/runs/start', {
        sessionId,
        text: PROMPT
    }, token);

    // 4. Monitor & Auto-Approve
    console.log('👀 Monitoring Agent Progress...');
    const start = Date.now();
    let foundScaffold = false;
    let lastMsgCount = 0;
    let didReview = false;

    while (Date.now() - start < 300000) { // 5 minutes monitoring
        const res = await request('GET', `/sessions/${sessionId}/messages`, null, token);
        if (res.status === 200 && Array.isArray(res.data)) {
            const msgs = res.data;
            if (msgs.length > lastMsgCount) {
                console.log(`📨 [User Info] New activity detected. Total messages: ${msgs.length}`);

                for (let i = lastMsgCount; i < msgs.length; i++) {
                    const m = msgs[i];
                    if (m.role === 'assistant') {
                        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

                        // Detect Scaffolding
                        if (content.includes('scaffold_project') || content.includes('ecommerce-store')) {
                            if (!foundScaffold) {
                                console.log('🏗️  Agent is scaffolding the project structure...');
                                foundScaffold = true;
                            }
                        }

                        // Detect Planning/Approval
                        const promptForReview = (content.includes('Proposed') || content.includes('Plan') || content.includes('approval') || content.includes('Review'));
                        if (promptForReview && !didReview) {
                            console.log('📋 Agent proposed a plan. Auto-approving to continue...');
                            await sleep(3000);
                            await request('POST', '/runs/start', { sessionId, text: 'yes, proceed immediately' }, token);
                            didReview = true;
                            console.log('✅ Plan approved.');
                        }

                        // Log interesting steps
                        if (content.includes('npm install')) console.log('📦 Installing dependencies...');
                        if (content.includes('browser')) console.log('🌐 Agent is browsing/verifying...');
                    }
                }
                lastMsgCount = msgs.length;
            }

            if (foundScaffold && msgs.length > 20) {
                console.log('✅ Simulation Successful: Agent accepted the task and is working.');
                break;
            }
        }
        await sleep(3000);
    }
    process.exit(0);
}

main();
