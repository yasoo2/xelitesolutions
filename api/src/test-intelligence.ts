// Test Free Intelligence Optimizer
import { generateSmartResponse, freeIntelligenceOptimizer, ADVANCED_FREE_PATTERNS } from './llm/free-intelligence-optimizer';

console.log('=== Testing Free Intelligence Optimizer ===\n');

// Test 1: Identity question in Arabic
console.log('Test 1: من أنت؟');
const test1 = generateSmartResponse('من أنت؟');
console.log('Response:', test1);
console.log('---\n');

// Test 2: Identity question in English
console.log('Test 2: who are you?');
const test2 = generateSmartResponse('who are you?');
console.log('Response:', test2);
console.log('---\n');

// Test 3: Capabilities in Arabic
console.log('Test 3: ماذا تستطيع أن تفعل؟');
const test3 = generateSmartResponse('ماذا تستطيع أن تفعل؟');
console.log('Response:', test3);
console.log('---\n');

// Test 4: Greeting in Arabic
console.log('Test 4: مرحبا');
const test4 = generateSmartResponse('مرحبا');
console.log('Response:', test4);
console.log('---\n');

// Test 5: Random question (should return null)
console.log('Test 5: اشرح لي الفيزياء الكمية');
const test5 = generateSmartResponse('اشرح لي الفيزياء الكمية');
console.log('Response:', test5);
console.log('Expected: null (should use AI model)');
console.log('---\n');

// Test 6: Patterns
console.log('Test 6: Testing patterns');
console.log('Identity pattern test:', ADVANCED_FREE_PATTERNS.questions.identity.test('من أنت'));
console.log('Capabilities pattern test:', ADVANCED_FREE_PATTERNS.questions.capabilities.test('ماذا تستطيع'));
console.log('Greeting pattern test:', ADVANCED_FREE_PATTERNS.greetings[0].test('مرحبا'));
console.log('---\n');

// Test 7: Optimizer
console.log('Test 7: Testing optimizer');
(async () => {
    const opt1 = await freeIntelligenceOptimizer.optimizeRequest('اكتب كود React');
    console.log('Code request optimization:', opt1);

    const opt2 = await freeIntelligenceOptimizer.optimizeRequest('من أنت؟');
    console.log('Simple question optimization:', opt2);

    const stats = freeIntelligenceOptimizer.getStats();
    console.log('Optimizer stats:', stats);
})();
