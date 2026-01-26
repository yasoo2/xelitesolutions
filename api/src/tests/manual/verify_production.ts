/**
 * Production Monitoring Script
 * Run this to verify system is working in production
 */

console.log('🔍 Production System Verification\n');

// 1. Check Environment
console.log('1️⃣ Environment Check:');
const hasOpenAI = !!process.env.OPENAI_API_KEY;
console.log('   OpenAI Key:', hasOpenAI ? '✅ Configured' : '❌ Missing');
console.log('   Node Version:', process.version);
console.log('   Platform:', process.platform);

// 2. Check Core Modules Load
console.log('\n2️⃣ Module Loading:');
try {
    require('../llm');
    console.log('   LLM Module: ✅ Loaded');
} catch (e: any) {
    console.log('   LLM Module: ❌ Failed -', e.message);
}

try {
    require('../intelligence/context-analyzer');
    console.log('   Context Analyzer: ✅ Loaded');
} catch (e: any) {
    console.log('   Context Analyzer: ❌ Failed -', e.message);
}

try {
    require('../tools/registry');
    console.log('   Tool Registry: ✅ Loaded');
} catch (e: any) {
    console.log('   Tool Registry: ❌ Failed -', e.message);
}

// 3. Test Context Analyzer in Production
console.log('\n3️⃣ Context Analyzer Production Test:');
try {
    const { analyzeContext } = require('../intelligence/context-analyzer');
    const testResult = analyzeContext([
        { role: 'user', content: 'create a React app' }
    ]);
    console.log('   Detection:', testResult.taskType === 'coding' ? '✅ Works' : '⚠️  Unexpected');
    console.log('   Task Type:', testResult.taskType);
    console.log('   Tools Suggested:', testResult.suggestedTools.length);
} catch (e: any) {
    console.log('   Test: ❌ Failed -', e.message);
}

// 4. Test Tool Selection
console.log('\n4️⃣ Tool Selection Test:');
try {
    const llm = require('../llm');
    const tools = llm.tools || [];
    console.log('   Available Tools:', tools.length);
    console.log('   Sample Tools:', tools.slice(0, 5).map((t: any) => t.name).join(', '));
} catch (e: any) {
    console.log('   Tools: ❌ Failed -', e.message);
}

// 5. System Prompt Check
console.log('\n5️⃣ System Prompt:');
try {
    const { getSystemPrompt, BASE_SYSTEM_PROMPT } = require('../llm');
    const prompt = getSystemPrompt();
    console.log('   Length:', prompt.length, 'chars');
    console.log('   Has Task Awareness:', prompt.includes('TASK-AWARE') ? '✅' : '❌');
    console.log('   Has Error Handling:', prompt.includes('ERROR HANDLING') ? '✅' : '❌');
    console.log('   Dynamic Date:', prompt.includes('Today') ? '✅' : '❌');
} catch (e: any) {
    console.log('   Prompt: ❌ Failed -', e.message);
}

console.log('\n' + '='.repeat(50));
console.log('Production Verification Complete');
console.log('='.repeat(50));
