import { advancedAnalyzeTask } from '../llm/intelligent-router';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runTests() {
    console.log('🚀 Starting Advanced Task Analysis Tests...\n');

    const testCases = [
        {
            name: 'Simple Greeting',
            prompt: 'Hi, how are you?',
            expectedComplexity: 'low',
            expectedType: 'simple_chat'
        },
        {
            name: 'Complex Coding Request',
            prompt: 'Create a full-stack e-commerce application with React, Node.js, and MongoDB. Include authentication and payment processing.',
            expectedComplexity: 'extreme',
            expectedType: 'code_generation'
        },
        {
            name: 'Browser Automation',
            prompt: 'Open Google, search for "latest technology news", and extract the titles of the first 5 articles.',
            expectedComplexity: 'medium',
            expectedType: 'browser_task'
        },
        {
            name: 'Arabic Technical Request',
            prompt: 'اشرح لي كيف يعمل الـ Kubernetes وكيف أقدر أستخدمه في مشروعي؟',
            expectedComplexity: 'medium',
            expectedType: 'complex_reasoning'
        }
    ];

    for (const test of testCases) {
        console.log(`Testing: "${test.name}"`);
        console.log(`Prompt: "${test.prompt}"`);

        try {
            const result = await advancedAnalyzeTask(test.prompt);
            console.log('Result:', JSON.stringify(result, null, 2));

            const complexityMatch = result.complexity === test.expectedComplexity;
            const typeMatch = result.type === test.expectedType;

            if (complexityMatch && typeMatch) {
                console.log('✅ PASS\n');
            } else {
                console.log('❌ FAIL');
                if (!complexityMatch) console.log(`   - Expected Complexity: ${test.expectedComplexity}, Got: ${result.complexity}`);
                if (!typeMatch) console.log(`   - Expected Type: ${test.expectedType}, Got: ${result.type}`);
                console.log('');
            }
        } catch (err: any) {
            console.error(`❌ ERROR: ${err.message}\n`);
        }
    }
}

runTests().catch(console.error);
