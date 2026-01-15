import { VectorMemory } from '../memory/VectorMemory';

async function main() {
    console.log('🧠 Starting Memory Verification...');

    try {
        const memory = new VectorMemory();
        await memory.init();

        const testId = 'test_mem_' + Date.now();
        const testText = 'Joe Agent is capable of autonomous coding and uses LanceDB for long-term memory.';

        console.log('1️⃣  Storing memory:', testText);
        await memory.add(testId, testText, { source: 'verification_script' });

        console.log('2️⃣  Searching for: "What does Joe use for memory?"');
        const results = await memory.search('What does Joe use for memory?', 1);

        const topDoc = results.documents[0][0];
        const topScore = results.distances ? results.distances[0][0] : -1;

        console.log(`   Found: "${topDoc}" (Score: ${topScore})`);

        if (topDoc === testText) {
            console.log('✅ Memory Verified: Storage and Semantic Retrieval successful.');
        } else {
            console.error('❌ Memory Failed: Retrieved text does not match.');
            process.exit(1);
        }

    } catch (err) {
        console.error('❌ Verification Error:', err);
        process.exit(1);
    }
}

main();
