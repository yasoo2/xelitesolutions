
import axios from 'axios';

async function testAI() {
    console.log('🧪 Testing Joe AI Intelligence...');
    const prompt = "Can you create a detailed plan to build a website about Falcons? I want a homepage and a gallery.";

    try {
        // 1. Create Run
        console.log('1. Creating Session...');
        // We use a random session ID to ensure fresh memory
        const sessionId = `test_ai_${Date.now()}`;

        // 2. Chat
        console.log(`2. Sending Prompt: "${prompt}"`);
        console.log('   (Waiting for Joe to think...)\n');

        const res = await axios.post('http://localhost:3000/runs/start', {
            text: prompt,
            sessionId: sessionId,
            userId: 'test_user',
            sessionKind: 'chat',
            provider: 'pollinations'
        });

        console.log('✅ Response Received!');
        // The response structure depends on the API. Usually it returns the run object or the latest message?
        // Let's assume standard response.
        console.log('---------------------------------------------------');
        if (res.data && res.data.message) {
            console.log('🤖 Joe Says:\n', res.data.message);
        } else {
            console.log('📦 Raw Output:', JSON.stringify(res.data, null, 2));
        }
        console.log('---------------------------------------------------');
        console.log('✅ AI Test Passed: The system thought and replied.');

    } catch (err: any) {
        console.error('❌ AI Test Failed:', err.message);
        if (err.response) {
            console.error('   Status:', err.response.status);
            console.error('   Data:', JSON.stringify(err.response.data));
        }
    }
}

testAI();
