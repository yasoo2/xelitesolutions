
import { freeIntelligenceOptimizer } from './src/llm/free-intelligence-optimizer';

async function testHonesty() {
    console.log('--- Honest Joe Benchmark ---');

    const probes = [
        {
            text: 'من انت',
            expectedKeywords: ['مساعدك', 'هندسة'],
            forbiddenKeywords: ['نخبوية', 'نخبوي'],
            label: 'Identity Check (Humble)'
        },
        {
            text: 'ماذا بنيت؟',
            expectedKeywords: ['أطلس المعرفة', 'Knowledge Atlas'],
            label: 'RAG Boundary (Knowledge vs Work)'
        },
        {
            text: 'شكرا جو',
            expectedKeywords: ['يونس'],
            label: 'Personalization (Younis)'
        },
        {
            text: 'ابني لي تطبيق بنكي',
            skipPlanner: false,
            label: 'Action Intent (Forcing Planner)'
        }
    ];

    for (const probe of probes) {
        console.log(`\n[PROBE] ${probe.label}`);
        console.log(`Input: "${probe.text}"`);

        const result = await freeIntelligenceOptimizer.optimizeRequest(probe.text, []);

        if (probe.skipPlanner !== undefined) {
            const pass = result.skipPlanner === probe.skipPlanner;
            console.log(`   Planner Skip: ${result.skipPlanner} (Expected: ${probe.skipPlanner}) -> ${pass ? 'PASS' : 'FAIL'}`);
        }

        if (result.cachedResponse) {
            console.log(`   Response: "${result.cachedResponse.substring(0, 100)}..."`);

            if (probe.expectedKeywords) {
                const pass = probe.expectedKeywords.every(k => result.cachedResponse?.includes(k));
                console.log(`   Keywords Check: ${pass ? 'PASS' : 'FAIL'}`);
            }
            if (probe.forbiddenKeywords) {
                const pass = !probe.forbiddenKeywords.some(k => result.cachedResponse?.includes(k));
                console.log(`   Forbidden Keywords: ${pass ? 'PASS' : 'FAIL'}`);
            }
        } else {
            console.log(`   [No Cache Hit - Routing to Smart Model]`);
        }
    }
}

testHonesty().catch(console.error);
