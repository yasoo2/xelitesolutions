/**
 * Real Test: Prove Context Analyzer Actually Works
 */

import { analyzeContext } from '../intelligence/context-analyzer';

console.log('='.repeat(60));
console.log('REAL TEST: Context Analyzer Integration');
console.log('='.repeat(60));

// Test 1: Coding Task
const codingMessages = [
    { role: 'user', content: 'build a React todo app with TypeScript and add tests' }
];

console.log('\n📝 Test 1: Coding Task');
console.log('Input:', codingMessages[0].content);
const result1 = analyzeContext(codingMessages);
console.log('Detected Task Type:', result1.taskType);
console.log('Complexity:', result1.complexity);
console.log('Suggested Tools:', result1.suggestedTools.slice(0, 5));
console.log('Required Capabilities:', result1.requiredCapabilities);

// Test 2: Research Task
const researchMessages = [
    { role: 'user', content: 'ابحث عن أفضل مكتبات React للجداول وقارن بينها' }
];

console.log('\n🔍 Test 2: Research Task (Arabic)');
console.log('Input:', researchMessages[0].content);
const result2 = analyzeContext(researchMessages);
console.log('Detected Task Type:', result2.taskType);
console.log('Complexity:', result2.complexity);
console.log('Suggested Tools:', result2.suggestedTools.slice(0, 5));

// Test 3: Browser Task
const browserMessages = [
    { role: 'user', content: 'open github.com and login to my account' }
];

console.log('\n🌐 Test 3: Browser Task');
console.log('Input:', browserMessages[0].content);
const result3 = analyzeContext(browserMessages);
console.log('Detected Task Type:', result3.taskType);
console.log('Complexity:', result3.complexity);
console.log('Suggested Tools:', result3.suggestedTools.slice(0, 5));

// Test 4: Debugging Task
const debugMessages = [
    { role: 'user', content: 'there is a bug in the login function, tests are failing' }
];

console.log('\n🐛 Test 4: Debugging Task');
console.log('Input:', debugMessages[0].content);
const result4 = analyzeContext(debugMessages);
console.log('Detected Task Type:', result4.taskType);
console.log('Complexity:', result4.complexity);
console.log('Suggested Tools:', result4.suggestedTools.slice(0, 5));

// Test 5: Tool Selection Integration
console.log('\n' + '='.repeat(60));
console.log('Test 5: Tool Selection Integration');
console.log('='.repeat(60));

// Import actual tool selection function
const llmModule = require('../llm');

const testMessages = [
    { role: 'system', content: 'You are Joe' },
    { role: 'user', content: 'create a new React component for displaying user profiles' }
];

console.log('\nInput:', testMessages[1].content);
console.log('Calling selectToolDefsForProvider...');

// This will use context analyzer internally now
const selectedTools = (llmModule as any).selectToolDefsForProvider?.(
    llmModule.tools || [],
    100,
    testMessages
);

if (selectedTools && selectedTools.length > 0) {
    console.log('\n✅ Tool Selection Works!');
    console.log('Top 10 Selected Tools:');
    selectedTools.slice(0, 10).forEach((tool: any, i: number) => {
        console.log(`  ${i + 1}. ${tool.name} - ${tool.description?.slice(0, 50)}...`);
    });
} else {
    console.log('\n❌ Tool Selection Failed');
}

console.log('\n' + '='.repeat(60));
console.log('VERDICT: Does Context Analyzer Work?');
console.log('='.repeat(60));

const allPassed =
    result1.taskType === 'coding' &&
    result2.taskType === 'research' &&
    result3.taskType === 'browsing' &&
    result4.taskType === 'debugging' &&
    selectedTools && selectedTools.length > 0;

if (allPassed) {
    console.log('\n✅ YES - Context Analyzer is WORKING');
    console.log('   - Task detection: ACCURATE');
    console.log('   - Tool suggestions: GENERATED');
    console.log('   - Integration: FUNCTIONAL');
    console.log('\nProof: This is NOT just "حكي" - it actually runs and produces results.');
} else {
    console.log('\n❌ NO - Still broken');
    console.log('Failed tests:');
    if (result1.taskType !== 'coding') console.log('  - Coding detection failed');
    if (result2.taskType !== 'research') console.log('  - Research detection failed');
    if (result3.taskType !== 'browsing') console.log('  - Browser detection failed');
    if (result4.taskType !== 'debugging') console.log('  - Debug detection failed');
    if (!selectedTools || selectedTools.length === 0) console.log('  - Tool selection broken');
}

console.log('\n');
