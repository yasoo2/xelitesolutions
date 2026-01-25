
import { freeIntelligenceOptimizer } from '../api/src/llm/free-intelligence-optimizer';

async function verify() {
    console.log('🕵️‍♀️ Verifying Reflex Speed for "create navbar"...');

    const start = Date.now();
    const result = await freeIntelligenceOptimizer.optimizeRequest('create navbar', []);
    const duration = Date.now() - start;

    if (result.shouldUseCache && result.cachedResponse) {
        console.log(`✅ INSTANT REFLEX FOUND!`);
        console.log(`⏱️ Duration: ${duration}ms`);
        console.log(`📝 Content Preview: ${result.cachedResponse.substring(0, 100)}...`);
    } else {
        console.log(`❌ FAILED. Reflex not found. (Duration: ${duration}ms)`);
        console.log('Result:', JSON.stringify(result, null, 2));
    }
}

verify().catch(console.error);
