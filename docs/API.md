# Joe Enterprise API Documentation

## Quick Start

```typescript
// 1. Multi-Model Chat
import { routeToModel, analyzeTask } from './llm/intelligent-router';

const messages = [
  { role: 'user', content: 'Explain quantum computing' }
];

const analysis = analyzeTask(messages[0].content);
// → { type: 'complex_reasoning', complexity: 'high', ... }

const response = await routeToModel(messages, analysis);
// → Uses Llama 3.1 70B for complex reasoning
```

```typescript
// 2. Context-Aware Conversations
import { buildConversationContext, analyzeContextualIntent } from './llm/context-engine';

const context = buildConversationContext('user123', 'session456', history);
const intent = analyzeContextualIntent('then click submit', context);
// → { primary: 'browser_continue', secondary: 'browser_click', confidence: 0.9 }
```

```typescript
// 3. Long-Term Memory
import { longTermMemory } from './memory/long-term-memory';

// Store memory
await longTermMemory.remember('user123', {
  type: 'preference',
  content: 'Prefers TypeScript over JavaScript',
  metadata: {},
  importance: 0.8
});

// Recall relevant memories
const memories = await longTermMemory.recall('user123', 'typescript project', 5);

// Get user profile
const profile = await longTermMemory.getProfile('user123');
// → { name: 'Ahmed', preferences: { programmingLanguages: ['typescript'] }, ... }
```

```typescript
// 4. Agent Orchestration
import { orchestrator } from './agents/orchestrator';

const result = await orchestrator.buildApplication('Build a React todo app with tests');
// → {
//   plan: { projectType: 'web', tasks: [...], techStack: {...} },
//   results: [...],
//   totalFiles: 17
// }
```

```typescript
// 5. Browser Intelligence
import { analyzePage, planInteraction } from './browser/intelligence';

const html = await fetchPageHTML('https://example.com/login');
const analysis = analyzePage(html, 'https://example.com/login');
// → { pageType: 'form', forms: [...], interactiveElements: [...] }

const steps = planInteraction('login with username and password', analysis);
// → ['Type username in input[name="email"]', 'Type password in...', ...]
```

```typescript
// 6. Code Generation
import { codeGenerator } from './codegen/large-scale-generator';

const { files, structure } = await codeGenerator.generateProject({
  name: 'my-store',
  type: 'fullstack',
  framework: 'react',
  features: ['auth', 'payments'],
  database: 'mongodb'
});

// files.size → 25+
// structure → "frontend/\n  ├── src/\n  ..."

for (const [path, content] of files) {
  await writeFile(path, content);
}
```

```typescript
// 7. Vision Support
import { analyzeImage, screenshotToCode } from './vision/image-analyzer';

const analysis = await analyzeImage('./screenshot.png');
// → { type: 'ui', components: [...], colors: [...] }

const code = await screenshotToCode('./screenshot.png', 'react');
// → "import React from 'react';\n\nfunction Component() { ... }"
```

```typescript
// 8. Voice Interface
import { transcribeAudio, synthesizeSpeech, detectVoiceCommand } from './voice/interface';

const transcription = await transcribeAudio(audioBuffer);
// → { text: 'Open Google and search', confidence: 0.95, ... }

const command = detectVoiceCommand(transcription.text);
// → { isCommand: true, command: 'open', parameters: {...} }

const speech = await synthesizeSpeech('تم فتح جوجل بنجاح', { language: 'ar' });
// → Buffer (audio file)
```

```typescript
// 9. Enterprise Integration (All Systems)
import { processEnterpriseRequest } from './enterprise/integration';

const response = await processEnterpriseRequest({
  userId: 'user123',
  sessionId: 'session456',
  message: 'Build me a todo app',
  history: []
});

// → {
//   text: 'Building your todo app with React...',
//   tool: 'build_application',
//   artifacts: ['src/App.tsx', 'src/Todo.tsx', ...],
//   confidence: 0.9
// }
```

## Environment Variables

```bash
# .env file
GROQ_API_KEY=gsk_...          # For Llama/Mixtral/Gemma (optional but recommended)
OPENAI_API_KEY=sk-...         # For GPT-4 Vision (optional)
ANTHROPIC_API_KEY=sk-ant-...  # For Claude (optional)
```

## Testing

```bash
npm install
npm test
```

All 15+ automated tests should pass.

## Examples

See `docs/JOE_ENTERPRISE.md` for comprehensive examples and use cases.

## License

MIT
