
import { freeIntelligenceOptimizer } from '../api/src/llm/free-intelligence-optimizer';

async function prove() {
    console.log('🕵️‍♀️ Monitoring Brain Growth...');

    // 1. Snapshot Start
    const startCount = freeIntelligenceOptimizer.getReflexCount();
    console.log(`[T=0s] Initial Reflex Count: ${startCount}`);

    console.log('⏳ Waiting 35 seconds for next training cycle...');
    await new Promise(r => setTimeout(r, 35000));

    // 2. Snapshot End
    const endCount = freeIntelligenceOptimizer.getReflexCount();
    console.log(`[T=35s] Final Reflex Count: ${endCount}`);

    const growth = endCount - startCount;
    if (growth > 0) {
        console.log(`✅ PROOF POSITIVE: System learned ${growth} new reflexes in 35s.`);
        console.log('The Infinite Loop is REAL and ACTIVE.');
    } else {
        console.log('❌ NO GROWTH DETECTED. Loop might be stalled.');
    }
}

prove().catch(console.error);
