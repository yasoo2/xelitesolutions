
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';

// Configuration
const API_URL = process.env.API_URL || `http://127.0.0.1:${config.port}`;
const WS_URL = process.env.WS_URL || `ws://127.0.0.1:${config.port}/ws`;
const JWT_SECRET = process.env.JWT_SECRET || config.jwtSecret;

// Helpers
const token = jwt.sign({ sub: 'tester', role: 'OWNER' }, JWT_SECRET);
const headers = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
};

function makeObjectIdLike() {
    return crypto.randomBytes(12).toString('hex');
}

async function expectOkJson(res: any) {
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 250)}`);
    }
    return data;
}

async function startRun(payload: any) {
    const res = await fetch(`${API_URL}/runs/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const data = await expectOkJson(res);
    return data as {
        runId: string;
        sessionId: string;
        blocked?: boolean;
        approvalId?: string;
        secretRequired?: boolean;
        secret?: { provider?: string; key?: string; label?: string };
        systemPrompt?: string;
        systemPromptId?: string;
    };
}

async function waitForWsEvent(
    ws: WebSocket,
    predicate: (ev: any) => boolean,
    timeoutMs: number
) {
    return await new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for WebSocket event')), timeoutMs);
        const handler = (msg: WebSocket.RawData) => {
            try {
                const ev = JSON.parse(msg.toString());
                if (!predicate(ev)) return;
                clearTimeout(timer);
                ws.off('message', handler);
                resolve(ev);
            } catch {}
        };
        ws.on('message', handler);
    });
}

async function getHistory(sessionId: string) {
    const res = await fetch(`${API_URL}/sessions/${sessionId}/history`, { headers });
    return await expectOkJson(res);
}

async function getContext(sessionId: string) {
    const res = await fetch(`${API_URL}/sessions/${sessionId}/context`, { headers });
    return await expectOkJson(res);
}

async function getRun(runId: string) {
    const res = await fetch(`${API_URL}/run/${runId}`, { headers });
    return await expectOkJson(res);
}

async function decideApproval(id: string, decision: 'approved' | 'denied') {
    const res = await fetch(`${API_URL}/approvals/${id}/decision`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ decision }),
    });
    return await expectOkJson(res);
}

async function main() {
    console.log('\n🔍 INITIALIZING FULL SYSTEM TEST SUITE\n');
    console.log('Target API:', API_URL);

    // 1. Health Check
    try {
        const startedAt = Date.now();
        const maxWaitMs = 15000;
        while (true) {
            try {
                const res = await fetch(`${API_URL}/health`);
                const data = await res.json();
                if (data.status === 'OK') {
                    console.log('✅ Health Check Passed');
                    break;
                }
            } catch {}
            if (Date.now() - startedAt > maxWaitMs) throw new Error('Health check timeout');
            await new Promise((r) => setTimeout(r, 500));
        }
    } catch (e) {
        console.error('❌ API is not running or unreachable.');
        process.exit(1);
    }

    // 2. Provider Verification Logic
    console.log('\n🧪 Testing AI Provider Verification Endpoint...');
    
    // 2.1 Test Default Provider (Should Reject)
    try {
        const res = await fetch(`${API_URL}/runs/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ provider: 'llm' })
        });
        if (res.status === 400) console.log('✅ Default Provider correctly rejected (Local intelligence disabled)');
        else console.warn('⚠️ Unexpected verify status:', res.status, (await res.text()).slice(0, 200));
    } catch (e) { console.error('❌ Default Provider Error:', e); }

    // 2.2 Test External Provider with Bad Key (Should Fail gracefully)
    try {
        const res = await fetch(`${API_URL}/runs/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
                provider: 'openai', 
                apiKey: 'invalid-key',
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


    // 4. WebSocket + Run Flow
    console.log('\n🤖 Testing WebSocket Flow (run_finished)...');
    
    try {
        const ws = new WebSocket(WS_URL);
        
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout waiting for WebSocket connection')), 8000);
            ws.on('open', () => {
                clearTimeout(timer);
                resolve();
            });
            ws.on('error', reject);
        });

        const sessionId = makeObjectIdLike();
        console.log('   WebSocket Connected. Starting Run with sessionId:', sessionId);

        const runFinishedAnyPromise = waitForWsEvent(
            ws,
            (ev) => ev?.type === 'run_finished',
            12000
        ).catch((e) => ({ __error: e }));

        const runData = await startRun({ text: 'list files', sessionId });
        if (!runData?.runId) throw new Error('runId missing');

        const runFinishedEv: any = await runFinishedAnyPromise;
        if (runFinishedEv?.__error) throw runFinishedEv.__error;
        if (String(runFinishedEv?.runId || '') !== String(runData.runId)) {
            throw new Error(`run_finished runId mismatch: got=${String(runFinishedEv?.runId || '')} expected=${String(runData.runId)}`);
        }
        console.log('   ✅ run_finished verified');

        ws.close();

    } catch (e) {
        console.error('❌ Run Simulation Failed:', e);
    }

    // 5. Chat + Agent SessionKind (API + history/context)
    console.log('\n💬 Testing chat vs agent session kinds (history/context)...');
    try {
        const chatSessionId = makeObjectIdLike();
        const chat = await startRun({ text: 'echo "chat"', sessionKind: 'chat', sessionId: chatSessionId });
        if (!chat.sessionId) throw new Error('chat sessionId missing');
        if (!chat.runId) throw new Error('chat runId missing');
        if (typeof chat.systemPrompt !== 'string' || !chat.systemPrompt.includes('You are Joe')) throw new Error('chat systemPrompt missing');

        const chatHistory = await getHistory(chat.sessionId);
        if (!Array.isArray(chatHistory?.events) || chatHistory.events.length < 2) throw new Error('chat history too short');
        const first = chatHistory.events[0];
        if (String(first?.type) !== 'user_input') {
            throw new Error('chat history does not start with user_input');
        }
        const chatCtx = await getContext(chat.sessionId);
        if (typeof chatCtx?.systemPrompt !== 'string' || !chatCtx.systemPrompt.includes('You are Joe')) throw new Error('chat context systemPrompt missing');
        console.log('   ✅ chat: session + history + context verified');

        const agentSessionId = makeObjectIdLike();
        const agent = await startRun({ text: 'echo "agent"', sessionKind: 'agent', sessionId: agentSessionId });
        if (!agent.sessionId) throw new Error('agent sessionId missing');
        if (!agent.runId) throw new Error('agent runId missing');
        if (typeof agent.systemPrompt !== 'string' || !agent.systemPrompt.includes('You are Joe')) throw new Error('agent systemPrompt missing');

        const agentHistory = await getHistory(agent.sessionId);
        if (!Array.isArray(agentHistory?.events) || agentHistory.events.length < 2) throw new Error('agent history too short');
        const firstAgent = agentHistory.events[0];
        if (String(firstAgent?.type) !== 'user_input') {
            throw new Error('agent history does not start with user_input');
        }
        const agentCtx = await getContext(agent.sessionId);
        if (typeof agentCtx?.systemPrompt !== 'string' || !agentCtx.systemPrompt.includes('You are Joe')) throw new Error('agent context systemPrompt missing');
        console.log('   ✅ agent: session + history + context verified');
    } catch (e) {
        console.error('❌ chat/agent verification failed:', e);
    }

    // 6. Approval Gate (risky text)
    console.log('\n🛡️  Testing approval_required gate...');
    try {
        const ws = new WebSocket(WS_URL);
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout waiting for WebSocket connection')), 8000);
            ws.on('open', () => { clearTimeout(timer); resolve(); });
            ws.on('error', reject);
        });
        const sessionId = makeObjectIdLike();
        const approvalPromise = waitForWsEvent(
            ws,
            (ev) => ev?.type === 'approval_required' && typeof ev?.data?.id === 'string' && typeof ev?.data?.risk === 'string',
            8000
        );
        const data = await startRun({ text: 'delete; ls', sessionId });
        if (!data.blocked) throw new Error('Expected blocked=true');
        if (!data.approvalId) throw new Error('Expected approvalId');
        const approvalEv = await approvalPromise;
        if (typeof approvalEv?.data?.id !== 'string') throw new Error('approval event missing id');
        if (approvalEv.data.id !== data.approvalId) throw new Error('approval event id mismatch');
        console.log('   ✅ approval_required verified');

        const approvalResultApprovedPromise = waitForWsEvent(
            ws,
            (ev) => ev?.type === 'approval_result' && ev?.runId === data.runId && ev?.data?.id === data.approvalId && ev?.data?.decision === 'approved',
            12000
        );
        const runFinishedApprovedPromise = waitForWsEvent(
            ws,
            (ev) => ev?.type === 'run_finished' && ev?.runId === data.runId && ev?.data?.ok === true,
            12000
        );
        await decideApproval(data.approvalId, 'approved');
        await approvalResultApprovedPromise;
        await runFinishedApprovedPromise;
        const approvedRun = await getRun(data.runId);
        const approvedStatus = String(approvedRun?.run?.status || '');
        if (!approvedStatus || approvedStatus === 'blocked') throw new Error(`approved run status invalid: ${approvedStatus}`);
        console.log('   ✅ approval approve flow verified');

        const sessionId2 = makeObjectIdLike();
        const approvalPromise2 = waitForWsEvent(
            ws,
            (ev) => ev?.type === 'approval_required' && typeof ev?.data?.id === 'string',
            8000
        );
        const data2 = await startRun({ text: 'delete; ls', sessionId: sessionId2 });
        if (!data2.blocked) throw new Error('Expected blocked=true (deny test)');
        if (!data2.approvalId) throw new Error('Expected approvalId (deny test)');
        const approvalEv2 = await approvalPromise2;
        if (approvalEv2?.data?.id !== data2.approvalId) throw new Error('approval event id mismatch (deny test)');

        const approvalResultDeniedPromise = waitForWsEvent(
            ws,
            (ev) => ev?.type === 'approval_result' && ev?.runId === data2.runId && ev?.data?.id === data2.approvalId && ev?.data?.decision === 'denied',
            12000
        );
        const runFinishedDeniedPromise = waitForWsEvent(
            ws,
            (ev) => ev?.type === 'run_finished' && ev?.runId === data2.runId && ev?.data?.ok === false,
            12000
        );
        await decideApproval(data2.approvalId, 'denied');
        await approvalResultDeniedPromise;
        await runFinishedDeniedPromise;
        const deniedRun = await getRun(data2.runId);
        const deniedStatus = String(deniedRun?.run?.status || '');
        if (!deniedStatus || deniedStatus === 'blocked') throw new Error(`denied run status invalid: ${deniedStatus}`);
        console.log('   ✅ approval deny flow verified');

        ws.close();
    } catch (e) {
        console.error('❌ approval_required test failed:', e);
    }

    // 7. Secret Prompt (GitHub Token)
    console.log('\n🔑 Testing secret_required gate (GitHub token prompt)...');
    try {
        const ws = new WebSocket(WS_URL);
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout waiting for WebSocket connection')), 8000);
            ws.on('open', () => { clearTimeout(timer); resolve(); });
            ws.on('error', reject);
        });

        const sessionId = makeObjectIdLike();
        const secretPromise = waitForWsEvent(
            ws,
            (ev) =>
                ev?.type === 'secret_required' &&
                String(ev?.data?.key || '') === 'GITHUB_TOKEN' &&
                typeof ev?.data?.runId === 'string',
            12000
        ).catch((e) => ({ __error: e }));

        const data = await startRun({ text: 'انشئ ريبو جديد على github سميه vivos', sessionId, sessionKind: 'agent' });
        if (!data.blocked) throw new Error('Expected blocked=true (secret_required test)');
        if (!data.secretRequired) throw new Error('Expected secretRequired=true (secret_required test)');
        if (data.secret?.key && data.secret.key !== 'GITHUB_TOKEN') {
            throw new Error(`Expected secret.key=GITHUB_TOKEN, got ${String(data.secret.key)}`);
        }

        const secretEv: any = await secretPromise;
        if (secretEv?.__error) throw secretEv.__error;
        if (String(secretEv?.data?.runId || '') !== String(data.runId || '')) {
            throw new Error('secret_required event runId mismatch');
        }
        console.log('   ✅ secret_required (GITHUB_TOKEN) verified');

        ws.close();
    } catch (e) {
        console.error('❌ secret_required test failed:', e);
    }

    console.log('\n✨ FULL SYSTEM TEST COMPLETE ✨\n');
}

main();
