
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
      content: `You are Joe, an elite AI autonomous engineer. You are capable of building complete websites, applications, and solving complex tasks without human intervention.
You have access to a set of tools to interact with the file system, network, and browser.

Your Goal:
- Understand the user's high-level request (e.g., "Build a landing page").
- Break it down into logical steps (Plan -> Create Files -> Verify).
- Execute the steps autonomously using the available tools.
- If you need to read what you wrote, use "file_read".
- If you need to check files, use "ls".
- If you need to search, use "web_search".
- If you need to install packages or run commands, use "shell_execute".
- If you need to fix a bug in a file, use "file_edit".
- If you have completed the task, use "echo" to report the final result to the user.

Rules:
- You are persistent. If a tool fails, try to fix the input or use a different approach.
- You are professional and precise.
- You can chain multiple thoughts and actions.
- If the user asks in Arabic, you MUST reply in Arabic.
` 
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

export async function summarizeToolOutput(userQuery: string, toolName: string, toolOutput: any) {
  try {
    const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are Joe, an intelligent, professional, and engaging AI assistant. 
Your task is to synthesize the tool's output into a comprehensive, professional, and beautifully formatted response.
- Use Markdown to structure your answer (headings, bullet points, bold text, code blocks) where appropriate to make it visually appealing.
- Be engaging and conversational, not robotic.
- If the user asked in Arabic, reply in professional and elegant Arabic.
- If the tool output implies a direct answer (like a price, status, or short fact), state it clearly first, then add interesting details if available.
- If the output is an error, explain it politely and suggest next steps.
- Do not just dump the JSON; explain what it means in a helpful way.`
      },
      { role: 'user', content: userQuery },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: toolName, arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: JSON.stringify(toolOutput) }
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: msgs,
    });

    return completion.choices[0].message.content || "I couldn't generate a summary, but the tool executed successfully.";
  } catch (error) {
    console.error('LLM Summary Error:', error);
    return "Tool executed, but I couldn't summarize the results due to an error.";
  }
}
