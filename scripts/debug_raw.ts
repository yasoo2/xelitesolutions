
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000';

async function debugResponse() {
    console.log('🐞 Debugging Raw Response...');

    try {
        const res = await fetch(`${API_URL}/api/runs/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'run_start',
                text: 'Hello',
                sessionId: 'debug_' + Date.now(),
                provider: 'openai'
            })
        });

        const rawText = await res.text();
        console.log('--- RAW RESPONSE START ---');
        console.log(rawText);
        console.log('--- RAW RESPONSE END ---');

        console.log(`Status: ${res.status}`);
        console.log(`Headers:`, res.headers.raw());

    } catch (e) {
        console.error('❌ Network Error:', e);
    }
}

debugResponse();
