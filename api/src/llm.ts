import OpenAI from 'openai';
import { tools } from './tools/registry';

// Initialize OpenAI client
const apiKey = process.env.OPENAI_API_KEY;
if (apiKey) {
  console.info('LLM: OpenAI API Key configured.');
} else {
  console.warn('LLM: No OpenAI API Key found in environment variables. LLM features will be disabled.');
}

const openai = new OpenAI({
  apiKey: apiKey || 'dummy', 
  baseURL: process.env.OPENAI_BASE_URL,
});

// Filter out noop tools to save tokens and confusion
const activeTools = tools.filter(t => !t.name.startsWith('noop_'));

export interface PlanOptions {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  throwOnError?: boolean;
}

export const SYSTEM_PROMPT = `You are Joe, an elite AI autonomous engineer. You are capable of building complete websites, applications, and solving complex tasks without human intervention.

## CORE INSTRUCTIONS:
1. **Think Before Acting**: You are a "Reasoning Engine". Before every action, verify if you have enough information. If not, use a tool to get it.
2. **Tool First**: Do not guess. If asked about a library, file, or real-world fact, use the appropriate tool (grep_search, browser_open, search) immediately.
3. **Conversational Queries**: 
   - If the user greets you or asks personal questions (e.g. "how are you"), **reply naturally with text only**. Do NOT use any tools.
   - **Identity**: If asked "who are you", reply that you are Joe, an elite AI autonomous engineer. **NEVER** search for "who are you".
4. **Browser Usage**: The "browser_open" tool is your window to the world. Use it for:
   - Verifying documentation.
   - Checking live website status.
   - Searching for up-to-date information when internal knowledge is stale.
   - **Visual Verification**: Use it to see what you built.
4. **Language Protocol**: 
   - **Input**: Understand any language.
   - **Thinking**: You can reason in English or the user's language.
   - **Output**: **STRICTLY FOLLOW THE USER'S LANGUAGE**. If the user asks in Arabic, you MUST reply in "Eloquent & Engaging Arabic" (لغة عربية فصحى سلسة وجميلة).
   - **Translation**: Never give a "machine translation" vibe. Use natural, professional phrasing.

## RESPONSE STYLE - CRITICAL:
- **Concise & Direct**: Give the answer immediately. Do not fluff. Do not apologize unnecessarily.
- **No Over-Explanation**: Only explain if asked or if the topic is complex.
- **Visuals**: Use tables, lists, and code blocks liberally.
- **Follow-up**: At the very end of your final response, you MUST provide 3 relevant follow-up options in a hidden JSON block.

## RESPONSE FORMATTING:
- **Visual Hierarchy**: Use Markdown headers (##, ###) to structure your response.
- **Lists**: Use bullet points for readability.
- **Code**: Use code blocks with language tags (e.g., \`\`\`typescript).
- **Tone**: Professional, confident, yet helpful.
- **Synthesized Answers**: When reporting search/browser results, synthesize them into a coherent narrative. Do not just dump data.

## FOLLOW-UP OPTIONS FORMAT:
Append this EXACT format at the end of your message (invisible to user, parsed by UI):
:::options
[
  { "label": "Short Label 1", "query": "Full question for option 1" },
  { "label": "Short Label 2", "query": "Full question for option 2" },
  { "label": "Short Label 3", "query": "Full question for option 3" }
]
:::

## CRITICAL RULES:
- **Persistent Context**: Always check for ".joe/context.json" to understand project history.
- **Error Handling**: If a tool fails, analyze the error, fix the input, and RETRY. Do not give up easily.
- **Efficiency**: Do not repeat the same tool call if it was successful.
- **Artifacts**: If you generated an artifact (image, file), use "echo" to confirm it.
`;

export async function callLLM(prompt: string, context: any[] = []): Promise<string> {
    const msgs = [
        { role: 'system', content: 'You are a helpful assistant.' },
        ...context,
        { role: 'user', content: prompt }
    ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    try {
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: msgs,
        });
        return completion.choices[0]?.message?.content || '';
    } catch (e: any) {
        throw new Error(`LLM call failed: ${e.message}`);
    }
}

export async function planNextStep(
  messages: { role: 'user' | 'assistant' | 'system', content: string | any[] }[],
  options?: PlanOptions
) {
  // Determine client to use
  let client = openai;
  if (options?.apiKey) {
    client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl || process.env.OPENAI_BASE_URL,
    });
  }

  // 0. Mock Mode (for local testing without API Key)
  if ((process.env.MOCK_DB === '1' || process.env.MOCK_DB === 'true') && !options?.apiKey && !process.env.OPENAI_API_KEY) {
      console.info('[LLM] Using Mock Planner');
      const lastMsg = messages[messages.length - 1];
      const rawText =
        typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content || '');
      const content = rawText.toLowerCase();
      
      // Check history for actions
      const historyStr = JSON.stringify(messages).toLowerCase();
      const hasOpened =
        historyStr.includes('tool call: browser_open') || historyStr.includes('tool call: browser_run');
      const hasClicked = historyStr.includes('tool call: browser_run') && historyStr.includes('click');
      const hasAnalyzed = historyStr.includes('tool call: browser_get_state');

      const urlMatch = rawText.match(/https?:\/\/[^\s"'<>]+/i);
      let url = urlMatch?.[0];
      const wantsOpen =
        /\bopen\b/i.test(rawText) ||
        /افتح|افتحي|افتحوا|افتح المتصفح|افتح الموقع/i.test(rawText);

      if (wantsOpen) {
        if (!url) {
          if (/youtube|يوتيوب/i.test(rawText)) url = 'https://www.youtube.com';
        }
        if (!hasOpened) {
          return {
            name: 'browser_open',
            input: { url: url || 'https://www.google.com' },
          };
        }
        return {
          name: 'echo',
          input: { text: 'I have already opened the browser.' },
        };
      }

      // Simple Heuristics for the GitHub Test
      if (historyStr.includes('github.com') && historyStr.includes('open') && !historyStr.includes('package.json')) {
          if (hasOpened) {
              return {
                  name: 'echo',
                  input: { text: "I have already opened the browser." }
              };
          }
          return {
              name: 'browser_open',
              input: { url: 'https://github.com/yasoo2/xelitesolutions' }
          };
      }
      if (historyStr.includes('package.json')) {
           if (!hasOpened) {
                return {
                    name: 'browser_open',
                    input: { url: 'https://github.com/yasoo2/xelitesolutions' }
                };
           }
           if (!hasClicked) {
               // Extract sessionId from history
               const match = JSON.stringify(messages).match(/"sessionId":"([^"]+)"/);
               const sessionId = match ? match[1] : 'mock-session-id';

               return {
                   name: 'browser_run',
                   input: { 
                       sessionId,
                       actions: [{ type: 'click', selector: 'a[title="package.json"]' }]
                   }
               };
           }
           if (!hasAnalyzed) {
               // Extract sessionId from history
               // Look for "sessionId":"..." in the history
               const match = JSON.stringify(messages).match(/"sessionId":"([^"]+)"/);
               const sessionId = match ? match[1] : 'mock-session-id';
               
               return {
                   name: 'browser_get_state',
                   input: { sessionId }
               };
           }
           return {
               name: 'echo',
               input: { text: "I have analyzed the package.json content." }
           };
      }
      
      // Yahoo flow (Mock)
      if (content.includes('yahoo') || historyStr.includes('yahoo')) {
          const hasYahooOpen = historyStr.includes('tool call: browser_open') && historyStr.includes('yahoo.com');
          const hasYahooExtract = historyStr.includes('tool call: html_extract') && historyStr.includes('yahoo.com');
          if (!hasYahooOpen) {
              return {
                  name: 'browser_open',
                  input: { url: 'https://www.yahoo.com' }
              };
          }
          if (!hasYahooExtract) {
              return {
                  name: 'html_extract',
                  input: { url: 'https://www.yahoo.com' }
              };
          }
          return {
              name: 'echo',
              input: { text: "Yahoo analyzed." }
          };
      }
      
      // Default fallback
      return {
          name: 'echo',
          input: { text: "I'm running in MOCK mode. I saw: " + content }
      };
  }

  // 1. Prepare tools for OpenAI
  const aiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = activeTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || `Tool: ${t.name}. Tags: ${t.tags.join(', ')}`,
      parameters: t.inputSchema as any,
    },
  }));

  // 2. Add a system prompt if not present
  const msgs = [
    { 
      role: 'system', 
      content: SYSTEM_PROMPT 
    },
    ...messages
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  try {
    const completion = await client.chat.completions.create({
      model: options?.model || process.env.OPENAI_MODEL || 'gpt-4o',
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
    const msg = error instanceof Error ? error.message : String(error);
    console.error('LLM Error:', msg);
    if (options?.throwOnError) {
      throw error;
    }
    // No heuristics allowed - fail if LLM fails
    throw error;
  }
}

export async function generateSessionTitle(messages: { role: string; content: string }[]) {
  if (!messages || messages.length === 0) return 'New Session';
  
  const msgs = [
    {
      role: 'system',
      content: 'You are a helpful assistant. Generate a short, concise title (max 6 words) for a chat session based on the following conversation start. The title should summarize the main topic. If the user speaks Arabic, the title MUST be in Arabic. Do not include quotes.'
    },
    ...messages.slice(0, 5).map(m => ({ role: 'user', content: String(m.content).slice(0, 500) }))
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: msgs,
      max_tokens: 20,
    });
    return completion.choices[0]?.message?.content?.trim() || 'New Session';
  } catch (e) {
    console.error('Title generation failed', e);
    return 'New Session';
  }
}

export async function generateSummary(messages: { role: string; content: string }[]) {
  if (!messages || messages.length === 0) return 'No content to summarize.';
  
  const msgs = [
    {
      role: 'system',
      content: 'You are a helpful assistant. Summarize the following conversation in a concise paragraph. Focus on the main goal, what was achieved, and any pending items. If the conversation is in Arabic, the summary MUST be in Arabic.'
    },
    {
      role: 'user',
      content: messages.map(m => `${m.role}: ${String(m.content).slice(0, 1000)}`).join('\n\n')
    }
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: msgs,
    });
    return completion.choices[0]?.message?.content?.trim() || 'Summary generation failed.';
  } catch (e) {
    console.error('Summary generation failed', e);
    return 'Summary generation failed due to an error.';
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
