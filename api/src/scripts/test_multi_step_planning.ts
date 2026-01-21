import { advancedAnalyzeTask, generateActionPlan } from '../llm/intelligent-router';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runTests() {
    console.log('🚀 Starting Multi-Step Planning Tests...\n');

    const testCases = [
        {
            name: 'Complex App Deployment',
            prompt: 'How do I deploy a full-stack Next.js app to Vercel with a PostgreSQL database?',
            expectedMinSteps: 3
        },
        {
            name: 'System Optimization Request',
            prompt: 'My API is slow when handling large files. Analyze the system and suggest optimizations.',
            expectedMinSteps: 3
        },
        {
            name: 'Multi-Language Feature',
            prompt: 'أضف دعم اللغة العربية للموقع ووزع العناصر من اليمين لليسار.',
            expectedMinSteps: 2
        }
    ];

    for (const test of testCases) {
        console.log(`Testing: "${test.name}"`);
        console.log(`Prompt: "${test.prompt}"`);

        try {
            const analysis = await advancedAnalyzeTask(test.prompt);
            console.log(`Detected Complexity: ${analysis.complexity}`);

            const plan = await generateActionPlan(test.prompt, analysis);
            console.log('Generated Plan:', JSON.stringify(plan, null, 2));

            if (plan.length >= test.expectedMinSteps) {
                console.log('✅ PASS\n');
            } else {
                console.log(`❌ FAIL: Expected at least ${test.expectedMinSteps} steps, got ${plan.length}\n`);
            }
        } catch (err: any) {
            console.error(`❌ ERROR: ${err.message}\n`);
        }
    }
}

runTests().catch(console.error);
