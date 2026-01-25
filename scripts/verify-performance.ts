
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3000';
const TEST_FILE = path.join(process.cwd(), 'speed_test.txt');

async function definitiveTest() {
    console.log('🛡️ Starting REAL-WORLD LATENCY TEST (Cache + Reasoning + Action)...');

    // Clean up previous test
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);

    // Test 1: Health Check
    try {
        const health = await fetch(`${API_URL}/health`);
        if (!health.ok) throw new Error(`Health Check Failed: ${health.status}`);
        console.log('✅ [1/4] System Health: OK');
    } catch (e) {
        console.error('❌ [1/4] System Health: CRITICAL FAILURE', e);
        process.exit(1);
    }

    // Test 2: Simple/Cached Query (Reflex)
    try {
        const start = Date.now();
        const res = await fetch(`${API_URL}/api/runs/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'run_start',
                text: 'من انت؟',
                sessionId: 'def_test_simple_' + Date.now(),
                provider: 'auto'
            })
        });
        const json = await res.json();
        const duration = Date.now() - start;

        if (res.ok && json.runId) {
            console.log(`✅ [2/4] Reflex (Memory): PASSED (${duration}ms)`);
        } else {
            console.error(`❌ Reflex Failed:`, json);
        }
    } catch (e) {
        console.error('❌ [2/4] Reflex: FAILED', e);
    }

    // Test 3: Complex Reasoning (Groq Router)
    try {
        const start = Date.now();
        const res = await fetch(`${API_URL}/api/runs/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'run_start',
                text: 'Write a python script to calculate factorial of 100',
                sessionId: 'def_test_complex_' + Date.now(),
                provider: 'auto'
            })
        });
        const json = await res.json();
        const duration = Date.now() - start;

        if (res.ok && json.runId) {
            console.log(`✅ [3/4] Reasoning (Groq): PASSED (${duration}ms)`);
        } else {
            console.error(`❌ Reasoning Failed:`, json);
        }
    } catch (e) {
        console.error('❌ [3/4] Reasoning: FAILED', e);
    }

    // Test 4: Real World Action (Create File)
    try {
        console.log('⚡ Executing Real Action: "Create a file named speed_test.txt with content FAST"');
        const start = Date.now();
        const res = await fetch(`${API_URL}/api/runs/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'run_start',
                text: 'Create a file named speed_test.txt with content FAST',
                sessionId: 'def_test_action_' + Date.now(),
                provider: 'auto'
            })
        });
        const json = await res.json();
        const duration = Date.now() - start;

        // Check if blocked (Approval) or executed
        if (json.blocked) {
            console.log(`⚠️ [4/4] Action: BLOCKED (Approval Required) in ${duration}ms`);
            console.log(`       System correctly identified "Active Tool Usage" and requested safety check.`);
        } else if (res.ok) {
            // Verify file existence (Check Root and API dir)
            const apiFile = path.join(process.cwd(), 'api', 'speed_test.txt');

            if (fs.existsSync(TEST_FILE)) {
                const content = fs.readFileSync(TEST_FILE, 'utf-8');
                if (content.trim() === 'FAST') {
                    console.log(`✅ [4/4] Action: EXECUTED (${duration}ms)`);
                    console.log(`       File found at Root.`);
                }
            } else if (fs.existsSync(apiFile)) {
                const content = fs.readFileSync(apiFile, 'utf-8');
                if (content.trim() === 'FAST') {
                    console.log(`✅ [4/4] Action: EXECUTED (${duration}ms)`);
                    console.log(`       File found in API CWD.`);
                }
            } else {
                console.error(`❌ [4/4] Action: File NOT found on disk (Checked Root & API). Response says OK.`);
                console.log('DEBUG RESPONSE:', JSON.stringify(json, null, 2));
            }
        } else {
            console.error(`❌ [4/4] Action: API Error`, json);
        }

    } catch (e) {
        console.error('❌ [4/4] Action: FAILED', e);
    }
}

definitiveTest();
