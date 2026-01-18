
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { GenesisAgent } from '../agents/GenesisAgent';

async function testSmartAgent() {
    console.log('🤖 Testing Smart Agent Autonomy...\n');

    const agent = new GenesisAgent();

    // Scenario 1: Security Request
    const goal = "Audit the security of the src/index.ts file and review the code quality.";
    console.log(`📝 Goal: "${goal}"`);

    try {
        const result = await agent.orchestrate(goal);

        console.log('\n🧠 Agent Plan:');
        console.log('-----------------------------------');
        console.log(result.plan);
        console.log('-----------------------------------\n');

        console.log('🛠️  Generated Steps:');
        result.steps.forEach((step, i) => {
            console.log(`[${i + 1}] Tool: ${step.tool.padEnd(15)} | Function: ${step.name}`);
            if (step.tool === 'security_scan' || step.tool === 'code_review') {
                console.log(`    ✅ SUCCESS: Agent autonomously selected ${step.tool}!`);
            }
        });

    } catch (error) {
        console.error('❌ Test Failed:', error);
    }
}

testSmartAgent();
