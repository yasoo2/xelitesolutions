import { freeIntelligenceOptimizer } from '../llm/free-intelligence-optimizer';

const QUESTIONS = [
    // Floor 1: Essentials
    "how to optimize react performance",
    "best practices for mobile architecture using expo",
    "explain backend microservices vs monolith",
    "docker multi-stage build guide",

    // Floor 2: Specialized
    "how to secure jwt authentication",
    "explain rag pipeline architecture",
    "aws well architected framework pillars",

    // Floor 3: God-Tier
    "smart contract reentrancy attack prevention",
    "big data analysis with spark vs pandas",
    "low level memory management optimization"
];

async function runBenchmark() {
    console.log("🚀 Starting Free Intelligence Optimizer Benchmark (10 Questions)\n");

    let totalTime = 0;

    for (let i = 0; i < QUESTIONS.length; i++) {
        const q = QUESTIONS[i];
        console.log(`[${i + 1}/10] Asking: "${q}"`);

        const start = performance.now();
        const result = await freeIntelligenceOptimizer.optimizeRequest(q, []);
        const end = performance.now();

        const duration = end - start;
        totalTime += duration;

        console.log(`   ⏱️  Latency: ${duration.toFixed(2)}ms`);
        if (result.shouldUseCache && result.cachedResponse) {
            console.log(`   ✅ Cache Hit (RAG/Smart Reflex)`);
            console.log(`   📄 Response Length: ${result.cachedResponse.length} chars`);
            console.log(`   🔎 Preview: ${result.cachedResponse.substring(0, 100).replace(/\n/g, ' ')}...`);
        } else {
            console.log(`   ❌ Cache Miss (Using generic LLM)`);
        }
        console.log("-".repeat(50));
    }

    console.log(`\n📊 Average Latency: ${(totalTime / QUESTIONS.length).toFixed(2)}ms`);
    console.log("✅ Benchmark Complete.");
}

runBenchmark().catch(console.error);
