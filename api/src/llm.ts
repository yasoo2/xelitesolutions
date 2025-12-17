
import OpenAI from 'openai';
import { tools } from './tools/registry';

// Initialize OpenAI client
const apiKey = process.env.OPENAI_API_KEY;
if (apiKey) {
  console.log('LLM: OpenAI API Key found (starts with ' + apiKey.slice(0, 7) + '...)');
} else {
  console.warn('LLM: No OpenAI API Key found in environment variables. LLM features will be disabled.');
}

const openai = new OpenAI({
  apiKey: apiKey || 'dummy', 
  baseURL: process.env.OPENAI_BASE_URL,
});

// Filter out noop tools to save tokens and confusion
const activeTools = tools.filter(t => !t.name.startsWith('noop_'));

export async function planNextStep(messages: { role: 'user' | 'assistant' | 'system', content: string }[]) {
  // 1. Prepare tools for OpenAI
  const aiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = activeTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: `Tool: ${t.name}. Tags: ${t.tags.join(', ')}`,
      parameters: t.inputSchema as any,
    },
  }));

  // 2. Add a system prompt if not present
  const msgs = [
    { 
      role: 'system', 
      content: 'You are Joe, an advanced AI agent. You have access to tools. Use them to fulfill the user request. If you just want to reply with text, use the "echo" tool. If you need to fetch data, use http_fetch. If you need to write a file, use file_write.' 
    },
    ...messages
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: msgs,
      tools: aiTools,
      tool_choice: 'auto', 
    });

    const choice = completion.choices[0];
    const toolCall = choice.message.tool_calls?.[0];

    if (toolCall && toolCall.type === 'function') {
      return {
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments),
      };
    }

    // If no tool called, fallback to echo with the content
    return {
      name: 'echo',
      input: { text: choice.message.content || "I'm not sure what to do." },
    };

  } catch (error) {
    console.error('LLM Error:', error);
    // Fallback to simple rule-based if LLM fails (e.g. no key)
    return null;
  }
}
