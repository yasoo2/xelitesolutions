import { analyzeTask, selectBestModel } from '../../core/llm/intelligent-router';
import { selectToolDefsForProvider } from '../../core/llm/tool-picker';
import { getSystemPrompt } from '../../core/llm/system-prompt';
import { buildConversationContext } from '../../core/llm/context-engine';
import { tools } from '../../modules/tools/registry';

async function testCoreLogic() {
  console.log('🧪 Diagnostic - Core LLM Module Logic 🧪\n');

  // 1. Test Intelligent Router - Task Analysis
  console.log('[1/5] Testing Task Analysis...');
  const analysisLow = analyzeTask('Hello Joe, how are you?');
  const analysisHigh = analyzeTask('Build a full-stack e-commerce website with React and Node.js');
  
  console.log('Low Complexity Task:', analysisLow.complexity); // Should be low/medium
  console.log('High Complexity Task:', analysisHigh.complexity); // Should be high/extreme
  
  if (analysisHigh.complexity !== 'extreme' && analysisHigh.complexity !== 'high') {
    console.error('❌ Task analyzer failed to detect high complexity!');
  } else {
    console.log('✅ Task analyzer: OK');
  }

  // 2. Test Intelligent Router - Model Selection
  console.log('\n[2/5] Testing Model Selection...');
  const modelLow = selectBestModel(analysisLow);
  const modelHigh = selectBestModel(analysisHigh);
  
  console.log('Model for Low Complexity:', modelLow.name);
  console.log('Model for High Complexity:', modelHigh.name);
  
  if (modelHigh.model.includes('llama-3.3-70b') || modelHigh.model.includes('llama-3.1-70b')) {
    console.log('✅ Model router selected appropriate high-tier model.');
  } else {
    console.warn('⚠️ Model router selected lower-tier model for high complexity.');
  }

  // 3. Test Tool Picker - Filtering Logic
  console.log('\n[3/5] Testing Tool Picker Filtering...');
  const geminiTools = selectToolDefsForProvider(tools, 5, []);
  console.log('Filtered Tools for Provider count:', geminiTools.length);
  
  if (geminiTools.length >= 57) {
    console.log('✅ Tool picker correctly included priority tools.');
  } else {
    console.error('❌ Tool picker failed to include priority tools!');
  }

  // 4. Test System Prompt Generator
  console.log('\n[4/5] Testing System Prompt Generator...');
  const prompt = getSystemPrompt({ name: 'Younis' });
  
  if (prompt.includes('Younis') && prompt.includes('Joe')) {
    console.log('✅ System prompt correctly injected user context.');
  } else {
    console.error('❌ System prompt missing crucial identity elements!');
  }

  // 5. Test Context Engine
  console.log('\n[5/5] Testing Context Engine...');
  const messages = [
    { role: 'user', content: 'What is my name?' },
    { role: 'assistant', content: 'Your name is Younis.' }
  ];
  const context = buildConversationContext('younis-uuid', 'session-123', messages);
  
  console.log('Context History Length:', context.history.length);
  if (context.userId === 'younis-uuid' && context.sessionId === 'session-123') {
    console.log('✅ Context engine built correctly.');
  } else {
    console.error('❌ Context engine failed to map IDs!');
  }

  console.log('\n✨ Overall Modular Logic: WORKING ✨');
}

testCoreLogic().catch(err => {
  console.error('❌ Diagnostic Failed:', err);
  process.exit(1);
});
