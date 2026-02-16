import { broadcast } from './ws';
import { planNextStep } from './llm';

// Mock broadcast to capture events
const events: any[] = [];
jest.mock('../api/src/ws', () => ({
    broadcast: (ev: any) => events.push(ev)
}));

async function test() {
    console.log('Testing planNextStep event emission...');

    await planNextStep([{ role: 'user', content: 'Say hello' }], {
        onProgress: (p) => broadcast({ type: 'thought', data: `> ${p}` }),
        onThought: (t) => broadcast({ type: 'thought', data: t })
    });

    console.log('Captured Events:', JSON.stringify(events, null, 2));

    const hasThoughts = events.some(e => e.type === 'thought');
    if (hasThoughts) {
        console.log('✅ PASS: Thought events emitted.');
    } else {
        console.log('❌ FAIL: No thought events found.');
    }
}

test().catch(console.error);
