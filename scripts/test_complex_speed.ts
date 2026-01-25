
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000';

async function testComplexLatency() {
    console.log('🧠 Advanced Router Speed Test Initiated...');

    // A long query to bypass Regex optimization (>120 chars)
    // This forces "advancedAnalyzeTask" to run.
    const complexQuery = "I want to calculate the fibonacci sequence up to the 100th number using a python script, but optimize it using dynamic programming so it runs instantly. Can you explain the time complexity?";

    console.log(`Query Length: ${complexQuery.length} chars (Should trigger Advanced Router)`);

    const start = Date.now();
    try {
        const res = await fetch(`${API_URL}/api/runs/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'run_start',
                text: complexQuery,
                sessionId: 'router_test_' + Date.now(),
                provider: 'openai' // Simulating "Auto" mode request
            })
        });
        const end = Date.now();
        const duration = end - start;

        if (res.ok) {
            console.log(`✅ Request Success. Duration: ${duration}ms`);
            const data = await res.json();
            // We check logs manually for "[IntelligentRouter] ⚡ Using Groq..."
        } else {
            console.error('❌ Request Failed:', res.status);
        }
    } catch (e) {
        console.error('❌ Network Error:', e);
    }
}

testComplexLatency();
