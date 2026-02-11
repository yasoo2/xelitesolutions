
import { freeIntelligenceOptimizer } from './src/llm/free-intelligence-optimizer';

async function testOptimizer() {
    console.log('--- Optimizer Benchmark ---');

    const probes = [
        { text: 'hi joe', expectedSkip: true, label: 'Simple Greeting' },
        { text: 'build me a complex banking application with microservices', expectedSkip: false, label: 'Complex Build Request' },
        { text: 'how do i register a new user using the auth api?', expectedSkip: false, label: 'Technical Question' },
        { text: 'من انت', expectedSkip: true, label: 'Arabic Identity Check' },
        { text: 'سو لي موقع تجارة الكترونية متكامل بفيزا وماستركارد', expectedSkip: false, label: 'Complex Arabic Request' }
    ];

    for (const probe of probes) {
        const result = await freeIntelligenceOptimizer.optimizeRequest(probe.text, []);
        const passed = result.skipPlanner === probe.expectedSkip;
        console.log(`[${passed ? 'PASS' : 'FAIL'}] ${probe.label}`);
        console.log(`   Input: "${probe.text}"`);
        console.log(`   SkipPlanner: ${result.skipPlanner} (Expected: ${probe.expectedSkip})`);
        console.log(`   Model: ${result.suggestedModel}`);
        console.log('---');
    }
}

testOptimizer().catch(console.error);
