import { AgentOrchestrator } from './src/orchestration/AgentOrchestrator';
import { ExecutionMemory } from './src/core/orchestrator/ExecutionMemory';

async function verifyDynamicPlanning() {
    console.log("🧪 Starting Test 1: Dynamic Behavior Verification");
    const orchestrator = new AgentOrchestrator();
    const goal = "Optimize system performance and security audit";
    
    const dags = [];
    for (let i = 1; i <= 3; i++) {
        console.log(`\n--- Plan iteration ${i} ---`);
        const dag = await orchestrator.plan(goal);
        console.log(`Plan ID: ${dag.id}`);
        console.log(`Steps: ${dag.nodes.map(n => n.task).join(' -> ')}`);
        dags.push(dag);
    }

    const tasksMatch = dags[0].nodes.map(n => n.task).join(',') === dags[1].nodes.map(n => n.task).join(',');
    
    if (!tasksMatch) {
        console.log("\n✅ SUCCESS: DAGs are dynamic and varied!");
    } else {
        console.warn("\n⚠️ WARNING: DAGs are identical. Entropy may be low.");
    }
}

verifyDynamicPlanning().catch(console.error);
