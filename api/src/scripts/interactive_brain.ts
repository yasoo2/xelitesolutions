import { freeIntelligenceOptimizer } from '../llm/free-intelligence-optimizer';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.clear();
console.log("\x1b[36m%s\x1b[0m", "🧠 JOE'S INTERACTIVE BRAIN (User Verification Mode)");
console.log("\x1b[90m%s\x1b[0m", "Type any engineering question to test the 'Library of Alexandria' (RAG).");
console.log("\x1b[90m%s\x1b[0m", "Type 'exit' to quit.\n");
console.log("Try asking:");
console.log(" - 'How to secure a smart contract?'");
console.log(" - 'Explain pandas vs spark'");
console.log(" - 'docker multi-stage build'\n");

const ask = () => {
    rl.question('\x1b[33mYou: \x1b[0m', async (query) => {
        if (query.toLowerCase() === 'exit') {
            rl.close();
            return;
        }

        const start = performance.now();
        const result = await freeIntelligenceOptimizer.optimizeRequest(query, []);
        const end = performance.now();
        const latency = (end - start).toFixed(2);

        console.log(`\n\x1b[32mJoe (${latency}ms):\x1b[0m`);

        if (result.shouldUseCache && result.cachedResponse) {
            console.log(result.cachedResponse);
            console.log("\n\x1b[90m[Source: Local RAG Knowledge Base]\x1b[0m");
        } else {
            console.log("I'll need to think about that one (Cache Miss - would call Cloud LLM).");
        }

        console.log("\n" + "-".repeat(50) + "\n");
        ask();
    });
};

ask();
