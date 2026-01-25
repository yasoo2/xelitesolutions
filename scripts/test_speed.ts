
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000';

async function testLatency() {
    console.log('🏎️ Turbo Speed Test Initiated...');

    // 1. Warmup / Reflex Test
    const start = Date.now();
    try {
        const res = await fetch(`${API_URL}/api/runs/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'run_start',
                text: 'من انت؟',
                sessionId: 'turbo_test_' + Date.now(),
                provider: 'openai'
            })
        });
        const end = Date.now();
        const duration = end - start;

        if (res.ok) {
            console.log(`✅ Request Success. Duration: ${duration}ms`);
            const data = await res.json();
            console.log('Data:', JSON.stringify(data).slice(0, 100) + '...');
        } else {
            console.error('❌ Request Failed:', res.status);
        }
    } catch (e) {
        console.error('❌ Network Error:', e);
    }
}

testLatency();
