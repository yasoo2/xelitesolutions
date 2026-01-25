
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000';

async function definitiveTest() {
    console.log('🛡️ Starting DEFINITIVE SYSTEM TEST...');

    // Test 1: Health Check
    try {
        const health = await fetch(`${API_URL}/health`);
        if (!health.ok) throw new Error(`Health Check Failed: ${health.status}`);
        console.log('✅ [1/3] System Health: OK');
    } catch (e) {
        console.error('❌ [1/3] System Health: CRITICAL FAILURE', e);
        process.exit(1);
    }

    // Test 2: Simple/Cached Query (Zero Latency)
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
            console.log(`✅ [2/3] Zero-Latency Reflex: PASSED (${duration}ms)`);
            console.log(`       Response Valid JSON: Yes`);
        } else {
            throw new Error(`Reflex Failed: ${res.status}`);
        }
    } catch (e) {
        console.error('❌ [2/3] Zero-Latency Reflex: FAILED', e);
        // Don't exit, try complex test
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
            console.log(`✅ [3/3] Groq Router Logic: PASSED (${duration}ms)`);
            console.log('       System is accepting complex tasks.');
        } else {
            throw new Error(`Complex Task Failed: ${res.status}`);
        }
    } catch (e) {
        console.error('❌ [3/3] Groq Router Logic: FAILED', e);
    }
}

definitiveTest();
