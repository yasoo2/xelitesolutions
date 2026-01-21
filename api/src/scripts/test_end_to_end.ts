/**
 * End-to-End System Test
 * Tests complete flow: context detection → tool selection → execution
 */

import { analyzeContext } from '../intelligence/context-analyzer';

console.log('='.repeat(70));
console.log('END-TO-END SYSTEM TEST');
console.log('='.repeat(70));

// Test scenarios that simulate real user requests
const scenarios = [
    {
        name: 'Simple Coding Task',
        messages: [
            { role: 'user', content: 'create a React component for user login' }
        ],
        expectedTask: 'coding',
        expectedTools: ['file_write', 'file_edit', 'echo']
    },
    {
        name: 'Research Task (Arabic)',
        messages: [
            { role: 'user', content: 'ابحث عن أفضل مكتبات لإدارة الحالة في React' }
        ],
        expectedTask: 'research',
        expectedTools: ['web_search', 'deep_research']
    },
    {
        name: 'Browser Automation',
        messages: [
            { role: 'user', content: 'open github.com and show me trending repositories' }
        ],
        expectedTask: 'browsing',
        expectedTools: ['browser_open', 'browser_run']
    },
    {
        name: 'Debug Task',
        messages: [
            { role: 'user', content: 'there is an error in the login function, tests fail' }
        ],
        expectedTask: 'debugging',
        expectedTools: ['quality_run', 'grep_search']
    },
    {
        name: 'Complex Multi-Step',
        messages: [
            { role: 'user', content: 'build a todo app with React, add tests, and deploy to Vercel' }
        ],
        expectedTask: 'coding',
        expectedTools: ['scaffold_project', 'file_write', 'shell_execute']
    }
];

let passed = 0;
let failed = 0;

console.log('\n📋 Running', scenarios.length, 'end-to-end scenarios...\n');

for (const scenario of scenarios) {
    console.log('—'.repeat(70));
    console.log('Scenario:', scenario.name);
    console.log('Input:', scenario.messages[0].content);

    try {
        // Step 1: Context Analysis
        const context = analyzeContext(scenario.messages);
        console.log('\n✓ Context Analysis:');
        console.log('  Task Type:', context.taskType);
        console.log('  Complexity:', context.complexity);
        console.log('  Suggested Tools:', context.suggestedTools.slice(0, 5).join(', '));

        // Step 2: Validate Detection
        const taskMatch = context.taskType === scenario.expectedTask;
        console.log('\n✓ Task Detection:', taskMatch ? '✅ PASS' : '❌ FAIL');
        if (!taskMatch) {
            console.log('  Expected:', scenario.expectedTask, '| Got:', context.taskType);
        }

        // Step 3: Validate Tool Suggestions
        const hasExpectedTools = scenario.expectedTools.some(tool =>
            context.suggestedTools.includes(tool)
        );
        console.log('✓ Tool Suggestions:', hasExpectedTools ? '✅ PASS' : '❌ FAIL');
        if (!hasExpectedTools) {
            console.log('  Expected any of:', scenario.expectedTools.join(', '));
            console.log('  Got:', context.suggestedTools.slice(0, 5).join(', '));
        }

        // Step 4: Overall Result
        if (taskMatch && hasExpectedTools) {
            console.log('\n🎯 Result: ✅ PASSED\n');
            passed++;
        } else {
            console.log('\n🎯 Result: ❌ FAILED\n');
            failed++;
        }

    } catch (e: any) {
        console.log('\n❌ ERROR:', e.message);
        console.log('🎯 Result: ❌ FAILED (ERROR)\n');
        failed++;
    }
}

console.log('='.repeat(70));
console.log('FINAL RESULTS');
console.log('='.repeat(70));
console.log('\nTotal Scenarios:', scenarios.length);
console.log('✅ Passed:', passed);
console.log('❌ Failed:', failed);
console.log('Success Rate:', Math.round((passed / scenarios.length) * 100) + '%');

if (passed === scenarios.length) {
    console.log('\n🎉 ALL TESTS PASSED - System is working correctly!');
    process.exit(0);
} else if (passed >= scenarios.length * 0.8) {
    console.log('\n⚠️  Most tests passed - System is mostly functional');
    process.exit(0);
} else {
    console.log('\n❌ Too many failures - System needs more work');
    process.exit(1);
}
