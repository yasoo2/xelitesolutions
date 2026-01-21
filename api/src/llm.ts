import OpenAI from 'openai';
import { tools } from './tools/registry';
import path from 'path';

// Initialize OpenAI client
let apiKey = process.env.OPENAI_API_KEY;
if (apiKey) {
  console.info('LLM: OpenAI API Key configured from environment.');
} else {
  console.warn('LLM: No OpenAI API Key found in environment variables.');
}

// Support for dynamic API key from requests (Scoped by User ID)
const userApiKeys = new Map<string, string>();

export function setDynamicOpenAIKey(userId: string, key: string) {
  const trimmed = typeof key === 'string' ? key.trim() : '';
  if (!userId) {
    console.error('LLM: Attempted to set dynamic key without userId');
    return;
  }
  if (!trimmed) {
    userApiKeys.delete(userId);
    return;
  }
  userApiKeys.set(userId, trimmed);
  console.info(`LLM: Dynamic OpenAI API Key set for user ${userId.slice(0, 4)}...`);
}

export function getDynamicOpenAIKey(userId: string): string | null {
  if (!userId) return null;
  return userApiKeys.get(userId) || null;
}

// Helper to get key for a specific user, falling back to env
export const getApiKeyForUser = (userId: string) => {
  return userApiKeys.get(userId) || apiKey || '';
};

const openai = new OpenAI({
  apiKey: apiKey || 'dummy', // Default client uses env key
  baseURL: process.env.OPENAI_BASE_URL,
});



const MAX_PROVIDER_TOOLS = 128;
const PRIORITY_TOOL_NAMES: string[] = [
  'echo',
  'project_detect',
  'analyze_codebase',
  'website_full_pipeline',
  'file_read',
  'file_write',
  'file_edit',
  'scaffold_project',
  'scaffold_full_stack',
  'read_file_tree',
  'ls',
  'grep_search',
  'fs_glob',
  'check_syntax',
  'generate_tests',
  'generate_docs',
  'db_inspect',
  'quality_run',
  'git_ops',
  'command_policy_check',
  'tool_create_shell',
  'shell_execute',
  'product_search',
  'web_search',
  'http_fetch',
  'central_answer',
  'knowledge_search',
  'html_extract',
  'github_create_repo',
  'image_generate',
  'deep_research',
];

function selectToolDefsForProvider(
  all: typeof tools,
  limit: number,
  messages: { role: 'user' | 'assistant' | 'system'; content: string | any[] }[]
) {
  const byName = new Map(all.map(t => [t.name, t] as const));
  const selected: typeof tools = [];
  const seen = new Set<string>();

  const routingTextRaw = messages
    .slice(-10)
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')))
    .join('\n');
  const routingText = routingTextRaw.toLowerCase();
  const isArabic = /[\u0600-\u06FF]/.test(routingTextRaw);

  const hasUrl =
    /https?:\/\/\S+/i.test(routingTextRaw) ||
    /(?:^|\s)(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?(?:\s|$)/i.test(routingTextRaw);
  const wantsBrowser =
    hasUrl ||
    /\b(browser|browse|web|website|open)\b/i.test(routingTextRaw) ||
    /(متصفح|موقع|رابط|داخل\s+المتصفح|افتح|ادخل|اذهب|روح|زور|وديني|ودني|ودنا|خلني|خليني|بدي|عايز|عاوز|ابي|ابغى|اختبر|شيك|جرّب|تأكد)/i.test(
      routingTextRaw,
    );
  const wantsSearch =
    /\b(search|research|find|lookup|web_search|deep_research|knowledge)\b/i.test(routingTextRaw) ||
    /ابحث|بحث|مصدر|مراجع|معلومات/i.test(routingTextRaw);
  const wantsFs =
    /\b(file|folder|directory|path|read|write|edit|tree|glob|grep)\b/i.test(routingTextRaw) ||
    /ملف|مجلد|مسار|اقرأ|اكتب|عدل|عدّل|ابحث\s+في\s+الكود/i.test(routingTextRaw);
  const wantsShell =
    /\b(terminal|command|shell|npm|pnpm|yarn|pip|python|node|run)\b/i.test(routingTextRaw) ||
    /ترمينال|طرفية|أمر|تشغيل/i.test(routingTextRaw);
  const wantsQuality =
    /\b(lint|eslint|typecheck|tsc|test|jest|build|ci)\b/i.test(routingTextRaw) ||
    /اختبار|اختبر|lint|بناء|typecheck|تحقق/i.test(routingTextRaw);
  const wantsGit =
    /\b(git|github|commit|pr|pull request|diff|branch)\b/i.test(routingTextRaw) ||
    /جيت|جيتهاب|فرع|كوميت|طلب\s+دمج/i.test(routingTextRaw);
  const wantsImage = /\b(image|png|jpg|jpeg|generate image)\b/i.test(routingTextRaw) || /صورة|صور/i.test(routingTextRaw);

  let computedLimit = 72;
  if (routingTextRaw.length < 140) computedLimit = 56;
  if (routingTextRaw.length > 700) computedLimit = 96;
  if (wantsBrowser) computedLimit = Math.max(computedLimit, 88);
  if (wantsSearch) computedLimit = Math.max(computedLimit, 80);
  if (wantsFs) computedLimit = Math.max(computedLimit, 80);
  if (wantsQuality) computedLimit = Math.max(computedLimit, 80);
  if (wantsGit) computedLimit = Math.max(computedLimit, 72);
  if (wantsImage) computedLimit = Math.max(computedLimit, 72);
  const effectiveLimit = Math.max(PRIORITY_TOOL_NAMES.length, Math.min(limit, computedLimit));

  for (const name of PRIORITY_TOOL_NAMES) {
    const t = byName.get(name);
    if (!t) continue;
    selected.push(t);
    seen.add(t.name);
    if (selected.length >= effectiveLimit) return selected;
  }

  const isGeneratedName = (name: string) =>
    name.startsWith('code_find_') ||
    name.startsWith('code_search_') ||
    name.startsWith('noop_');

  const scoreTool = (t: any) => {
    const tags: string[] = Array.isArray(t?.tags) ? t.tags : [];
    const name = String(t?.name || '').toLowerCase();
    const desc = String(t?.description || '').toLowerCase();
    const hay = `${name} ${desc} ${tags.join(' ')}`;
    let score = 0;
    if (tags.includes('agent')) score += 50;
    if (tags.includes('browser')) score += 45;
    if (tags.includes('fs')) score += 35;
    if (tags.includes('shell')) score += 35;
    if (tags.includes('search')) score += 25;
    if (tags.includes('knowledge')) score += 20;
    if (tags.includes('code')) score += 10;

    if (wantsBrowser && (tags.includes('browser') || name.startsWith('browser_'))) score += 90;
    if (wantsSearch && (tags.includes('search') || tags.includes('knowledge') || name.includes('search') || name.includes('research'))) score += 65;
    if (wantsFs && (tags.includes('fs') || name.includes('file_') || name.includes('read') || name.includes('write') || name.includes('grep') || name.includes('glob'))) score += 65;
    if (wantsShell && (tags.includes('shell') || name.includes('shell') || name.includes('command'))) score += 55;
    if (wantsQuality && (name.includes('lint') || name.includes('test') || name.includes('type') || name.includes('quality') || tags.includes('quality'))) score += 60;
    if (wantsGit && (name.includes('git') || name.includes('github') || tags.includes('git'))) score += 55;
    if (wantsImage && (name.includes('image') || tags.includes('image'))) score += 55;

    if (hasUrl && (name.includes('http') || name.includes('html') || tags.includes('browser'))) score += 20;
    if (isArabic) {
      if (/(arabic|ar)\b/.test(hay)) score += 5;
    }

    const boostKeywords = [
      'scaffold',
      'analyze',
      'repo',
      'project',
      'deploy',
      'migration',
      'db',
      'auth',
      'payments',
    ];
    for (const kw of boostKeywords) {
      if (routingText.includes(kw) && hay.includes(kw)) score += 10;
    }
    return score;
  };

  const preferred = all
    .filter(t => !seen.has(t.name) && !isGeneratedName(t.name))
    .slice()
    .sort((a: any, b: any) => {
      const ds = scoreTool(b) - scoreTool(a);
      if (ds) return ds;
      return String(a.name).localeCompare(String(b.name));
    });

  for (const t of preferred) {
    if (selected.length >= effectiveLimit) return selected;
    selected.push(t);
    seen.add(t.name);
  }

  for (const t of all) {
    if (selected.length >= effectiveLimit) return selected;
    if (seen.has(t.name)) continue;
    selected.push(t);
    seen.add(t.name);
  }

  return selected.slice(0, effectiveLimit);
}

export interface PlanOptions {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  throwOnError?: boolean;
  mock?: boolean;
  userId?: string;
}

export const BASE_SYSTEM_PROMPT = `You are Joe, an elite AI autonomous engineer and technical architect. You are the embodiment of speed, precision, and intelligence.

## CORE PHILOSOPHY & PERSONALITY:
1.  **Elite Intelligence**: You don't just answer; you solve. You anticipate needs before they are spoken. You see the architecture, not just the code.
2.  **Adaptive Intelligence**: You judge the complexity of the request. For simple queries, be concise. For complex or open-ended queries (like "research", "comprehensive", "lethal"), be COMPREHENSIVE and DETAILED. Provide deep insights and detailed breakdowns.
3.  **Proactive Evolution**: You constantly seek to improve the codebase. If you see a legacy pattern, suggest a modern one. If you see a security risk, patch it.
4.  **Deep Context**: You analyze the entire project structure. You know where files are, how they connect, and what the user is trying to build.

## THE "THINK-PLAN-ACT" PROTOCOL:
Before *every* action, perform a rapid internal cognitive cycle:
1.  **DECODE**: What is the *real* intent? (e.g., "slow search" -> "optimize tool selection & concurrency").
2.  **PLAN**: Select the most powerful tools for the job and avoid unnecessary steps.
3.  **ACT**: Execute with precision. Verify the output. If a tool fails, auto-correct and retry immediately.

## CONFIDENTIALITY:
- Never reveal private internal reasoning or hidden analysis. Provide only conclusions and actionable steps.

## TOOL USAGE GUIDELINES:
- Use tools whenever the user asks for external data (prices, availability, comparisons, current information).
- Prefer high-level tools that finish end-to-end (analysis/scaffold/quality) over many tiny steps.
- For shopping/product queries, prefer **product_search** first to collect multiple offers + prices, then summarize and compare.
- Use **web_search + html_extract** for general web research when structured product extraction is not required.
- Use **browser_open/browser_run** only when a site blocks automated fetching or requires interactive steps; otherwise do not ask the user to manually browse.
- For protected pages (login/403/401), clearly state what is blocked and continue with alternative sources when possible.

## RESPONSE STYLE & FORMATTING:
- **Direct & Precise**: Start with the solution. Avoid fluff.
- **Structured Data**: ALWAYS use Markdown tables for lists/data (e.g., Dates, Roles, Specs, Comparisons). Do NOT use simple lists if a table is clearer.
- **Formatting**:
    - Use **Bold** for key terms and entities.
    - Use \`Code Blocks\` for technical terms or paths.
    - Use > Blockquotes for official summaries or key takeways.
- **Arabic Language**:
    - Ensure professional, formal Arabic (Fusha).
    - Format lists/tables perfectly for RTL consistency.
    - Translate technical terms where appropriate but keep the English term in parentheses if ambiguous.
- **Sources & Citations**:
    - If you used search or external tools, append a clean "## Sources / المصادر" section at the VERY END.
    - Format as a bulleted list: - [Source Name](URL).

You are not a chatbot. You are an engine of creation. Act like one.`;

export const getSystemPrompt = () => {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
  return BASE_SYSTEM_PROMPT + `\n\nToday's Date: ${date}\nCurrent Time: ${time}`;
};


// Deprecated: Use getSystemPrompt() instead
export const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;


import { PollinationsProvider } from './llm/providers/pollinations';
import { OpenRouterProvider } from './llm/providers/openrouter';

const hackProvider = new PollinationsProvider();
const openRouterProvider = new OpenRouterProvider();

// In-memory store for user provider preference
// 'joe' = Pollinations (Free)
// 'openrouter' = OpenRouter (Free/Paid)
// 'auto' = Intelligent Auto-Selection
// 'gemini' = Google Gemini (Official)
// 'openai' = Standard OpenAI
const activeProviders = new Map<string, string>();

export function setActiveProvider(userId: string, provider: string) {
  const p = provider.toLowerCase();
  if (['joe', 'hack', 'pollinations'].includes(p)) activeProviders.set(userId, 'joe');
  else if (['openrouter'].includes(p)) activeProviders.set(userId, 'openrouter');
  else if (['auto', 'intelligent'].includes(p)) activeProviders.set(userId, 'auto');
  else if (['gemini', 'google'].includes(p)) activeProviders.set(userId, 'gemini');
  else activeProviders.set(userId, 'openai');
  console.log(`LLM: User ${userId.slice(0, 4)} switched to provider: ${activeProviders.get(userId)}`);
}

export function getActiveProvider(userId: string): string {
  return activeProviders.get(userId) || (process.env.LLM_PROVIDER?.includes('hack') ? 'joe' : 'openai');
}

export async function callLLM(prompt: string, context: any[] = [], userId?: string): Promise<string> {
  const currentProvider = userId ? getActiveProvider(userId) : 'openai';

  // Hack Provider (Joe)
  if (currentProvider === 'joe') {
    console.log('LLM: Using Hack Provider (Joe/Pollinations)');
    const msgs = [
      { role: 'system', content: 'You are a helpful assistant.' },
      ...context,
      { role: 'user', content: prompt }
    ];
    return hackProvider.chatComplete(msgs, 'openai');
  }

  // Determine configuration for Official Providers (OpenAI / Gemini)
  let forcedBaseUrl = process.env.OPENAI_BASE_URL;
  let forcedModel = process.env.OPENAI_MODEL;

  if (currentProvider === 'gemini') {
    forcedBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/';
    forcedModel = 'gemini-1.5-flash';
  }

  const key = userId ? getApiKeyForUser(userId) : (apiKey || '');

  if (!String(key).trim()) {
    throw new Error('NO_API_KEY_CONFIGURED');
  }

  const msgs = [
    { role: 'system', content: 'You are a helpful assistant.' },
    ...context,
    { role: 'user', content: prompt }
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  try {
    // If we have a specific user key, use a new client instance, otherwise use default
    let client = openai;

    // Always create fresh client if using Gemini or dynamic key
    if ((userId && userApiKeys.has(userId)) || currentProvider === 'gemini') {
      client = new OpenAI({
        apiKey: userId ? userApiKeys.get(userId) : key,
        baseURL: forcedBaseUrl || process.env.OPENAI_BASE_URL
      });
    } else if (apiKey && !forcedBaseUrl) {
      // use default client
    } else {
      client = new OpenAI({ apiKey: key, baseURL: forcedBaseUrl || process.env.OPENAI_BASE_URL });
    }

    const completion = await client.chat.completions.create({
      model: forcedModel || process.env.OPENAI_MODEL || 'gpt-4o',
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
): Promise<{ name: string; input: any; thought?: string | null } | null> {
  const providerKey = String(options?.provider || '').trim().toLowerCase();

  // Resolve Key: Option > UserMap > Env
  let resolvedKey = options?.apiKey;
  if (!resolvedKey && options?.userId) {
    resolvedKey = getApiKeyForUser(options.userId);
  }
  if (!resolvedKey) {
    resolvedKey = process.env.OPENAI_API_KEY;
  }

  const optKey = String(resolvedKey || '').trim();
  const envKey = String(process.env.OPENAI_API_KEY || '').trim();
  const forceMock = String(process.env.LLM_PLAN_MOCK || '').trim() === '1';
  const shouldMock = forceMock || options?.mock === true;



  if (providerKey.includes('joe') || providerKey.includes('hack') || providerKey.includes('pollinations')) {
    console.info('[LLM] Planning with Hack Provider (Joe/Pollinations)');

    // Anti-Loop Check: If the last message was a tool output (from our previous echo), we assume we're done.
    const lastMsg = messages[messages.length - 1];
    const role = lastMsg ? (lastMsg.role as string) : '';
    if (role === 'tool' || role === 'function') {
      console.info('[LLM] Joe Hack: Detected tool output, ending turn to avoid loop.');
      return null;
    }

    try {
      // Pollinations is text-only, so we treat it as an interaction that returns an echo/response
      // This satisfies the connection verification check
      const msgs = [
        { role: 'system', content: 'You are a helpful assistant.' },
        ...messages
      ];
      const text = await hackProvider.chatComplete(msgs, 'openai');
      return { name: 'echo', input: { text: text || 'Connected to Joe!' } };
    } catch (err: any) {
      console.error('[LLM] Joe Hack Provider Failed:', err);
      throw new Error('JOE_CONNECTION_FAILED: ' + (err.message || String(err)));
    }
  }

  // OpenRouter Provider
  if (providerKey.includes('openrouter')) {
    console.info('[LLM] Planning with OpenRouter Provider');

    const lastMsg = messages[messages.length - 1];
    const role = lastMsg ? (lastMsg.role as string) : '';
    if (role === 'tool' || role === 'function') {
      console.info('[LLM] OpenRouter: Detected tool output, ending turn.');
      return null;
    }

    try {
      const msgs = [
        { role: 'system', content: 'You are a helpful assistant.' },
        ...messages
      ];
      const text = await openRouterProvider.chatComplete(msgs, options?.model || 'google/gemma-2-9b-it:free');
      return { name: 'echo', input: { text: text || 'Connected to OpenRouter!' } };
    } catch (err: any) {
      console.error('[LLM] OpenRouter Provider Failed:', err);
      throw new Error('OPENROUTER_CONNECTION_FAILED: ' + (err.message || String(err)));
    }
  }

  // Auto Mode - Enterprise Intelligence (Multi-Model Router)
  if (providerKey.includes('auto')) {
    console.info('[LLM] 🚀 Auto Mode Enterprise - Intelligent Multi-Model System');

    const lastMsg = messages[messages.length - 1];
    const role = lastMsg ? (lastMsg.role as string) : '';
    if (role === 'tool' || role === 'function') {
      console.info('[LLM] Auto Mode: Tool output detected, ending turn.');
      return null;
    }

    const userMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = typeof userMsg?.content === 'string' ? userMsg.content : '';

    // Import intelligent router
    const { analyzeTask, routeToModel, selectBestModel } = await import('./llm/intelligent-router');

    // Analyze the task
    const analysis = analyzeTask(userText, messages);
    const selectedModel = selectBestModel(analysis);

    console.info(`[Auto Enterprise] Task: ${analysis.type} | Complexity: ${analysis.complexity} | Model: ${selectedModel.name}`);

    // === Smart Pattern Detection (for tool routing) ===

    // Browser patterns
    const browserPatterns = {
      open: /(open|افتح|ادخل|زور|اذهب|visit|go to|browse|شوف|طالع|ودني|وديني|خلني|بدي|ابغى|عايز)\s+(https?:\/\/|www\.|google|youtube|github|facebook|twitter|x\.com|instagram|tiktok|linkedin)/i,
      hasUrl: /https?:\/\/[^\s]+/i,
      multiStep: /(then|ثم|بعد|بعدها|وبعدين|click|انقر|اضغط|دوس|type|اكتب|املأ|extract|استخرج|لخص|انسخ)/i
    };

    // Search patterns (expanded)
    const searchPatterns = /(ابحث|بحث|search|find|lookup|دور|فتش|شوف|طالع|لاقي|اطلع|ابغى|عايز|بدي)\s+(عن|على|for|about|في|بـ)/i;

    // File patterns (expanded)
    const filePatterns = {
      read: /(read|اقرأ|قراءة|شوف|طالع|اعرض|افتح)\s+(file|ملف|الملف)/i,
      write: /(write|اكتب|create|انشئ|سوي|اعمل|كون)\s+(file|ملف)/i,
      list: /(list|show|عرض|اعرض|شوف|طالع|ls)\s+(files|الملفات|ملفات)/i
    };

    // Code generation patterns (expanded)
    const codePatterns = /(اكتب|كود|code|function|دالة|class|كلاس|component|كومبوننت|api|endpoint|script|سكريبت|program|برنامج|تطبيق|application|app|نظام|system|sوي|اعمل|ابني|انشئ|طور|build|create|develop|implement|نفذ)/i;

    try {
      // 1. Browser requests
      if (browserPatterns.open.test(userText) || browserPatterns.hasUrl.test(userText)) {
        const urlMatch = userText.match(/https?:\/\/[^\s]+/);
        const url = urlMatch ? urlMatch[0] :
          userText.match(/google/i) ? 'https://www.google.com' :
            userText.match(/youtube/i) ? 'https://www.youtube.com' :
              userText.match(/github/i) ? 'https://github.com' :
                userText.match(/facebook/i) ? 'https://www.facebook.com' :
                  userText.match(/instagram/i) ? 'https://www.instagram.com' :
                    userText.match(/twitter|x\.com/i) ? 'https://x.com' : '';

        if (url) {
          if (browserPatterns.multiStep.test(userText)) {
            console.info('[Auto Enterprise] → Browser Multi-Step Task');
            return {
              name: 'browser_run',
              input: {
                sessionId: `browser_${Date.now()}`,
                instructionText: userText
              }
            };
          } else {
            console.info('[Auto Enterprise] → Browser Open');
            return {
              name: 'browser_open',
              input: {
                url,
                sessionId: `browser_${Date.now()}`
              }
            };
          }
        }
      }

      // 2. Web search requests
      if (searchPatterns.test(userText)) {
        console.info('[Auto Enterprise] → Web Search');
        return {
          name: 'web_search',
          input: { query: userText }
        };
      }

      // 3. File operations
      if (filePatterns.read.test(userText)) {
        const fileMatch = userText.match(/(read|اقرأ|قراءة|شوف|طالع|اعرض|افتح)\s+(file|ملف|الملف)\s+(.+)/i);
        const filePath = fileMatch?.[3]?.trim() || '.';
        console.info('[Auto Enterprise] → Read File');
        return {
          name: 'file_read',
          input: { filePath }
        };
      }

      if (filePatterns.list.test(userText) || /^ls$/i.test(userText.trim())) {
        console.info('[Auto Enterprise] → List Files');
        return {
          name: 'ls',
          input: { path: '.' }
        };
      }

      // 4. Code generation (let the intelligent model handle it via echo)
      if (codePatterns.test(userText) && analysis.type === 'code_generation') {
        console.info('[Auto Enterprise] → Code Generation via Intelligent Model');
        const msgs = [
          { role: 'system', content: 'You are an expert software engineer. Generate clean, production-ready code with best practices.' },
          ...messages
        ];
        const codeResponse = await routeToModel(msgs, analysis);
        return {
          name: 'echo',
          input: { text: codeResponse }
        };
      }

      // 5. General chat/questions - Use intelligent router
      console.info(`[Auto Enterprise] → Intelligent Chat via ${selectedModel.name}`);
      const msgs = [
        {
          role: 'system', content: `You are Joe, an advanced AI assistant. Be helpful, accurate, and concise. 
Respond in ${analysis.language === 'ar' ? 'Arabic' : analysis.language === 'mixed' ? 'the same language as the user' : 'English'}.`
        },
        ...messages
      ];

      const response = await routeToModel(msgs, analysis);
      return {
        name: 'echo',
        input: { text: response || 'مرحباً! كيف يمكنني مساعدتك؟' }
      };

    } catch (err: any) {
      console.error('[Auto Enterprise] Failed:', err);
      // Fallback to simple chat
      try {
        const msgs = [{ role: 'system', content: 'You are a helpful assistant.' }, ...messages];
        const text = await hackProvider.chatComplete(msgs, 'openai');
        return { name: 'echo', input: { text: text || 'Response from Joe (Free)' } };
      } catch {
        throw new Error('AUTO_MODE_FAILED: ' + (err.message || String(err)));
      }
    }
  }

  if (!shouldMock) {
    if (providerKey === 'llm') throw new Error('PROVIDER_LLM_DISABLED');
    if (!optKey) throw new Error('NO_API_KEY_CONFIGURED');
  }

  // Determine client to use
  let client = openai;
  if (!shouldMock) {
    // Always create a fresh client if we have a specific key that might differ from default
    // Or if checking logic...
    // Simplest: If we have a resolved key, use it.
    if (optKey) {
      client = new OpenAI({
        apiKey: optKey,
        baseURL: options?.baseUrl || process.env.OPENAI_BASE_URL,
      });
    }
  }

  if (shouldMock) {
    console.info('[LLM] Using Mock Planner');
    const lastMsg = messages[messages.length - 1];
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user') || lastMsg;
    const rawText =
      typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content || '');
    const content = rawText.toLowerCase();

    // Check history for actions
    const historyTextRaw = messages
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')))
      .join('\n');
    const historyStr = historyTextRaw.toLowerCase();
    const extractLatestToolOutput = (toolName: string) => {
      const marker = `tool call: ${toolName}`.toLowerCase();
      const idx = historyStr.lastIndexOf(marker);
      if (idx < 0) return null;
      const tail = historyTextRaw.slice(idx);
      const m = tail.match(/Output:\s*(.+)/i);
      const raw = String(m?.[1] || '').trim();
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return raw; }
    };

    const wantsWeather = /(?:\bweather\b|forecast|temperature|الطقس|حالة\s+الطقس|درجة\s+الحرارة|حراره|الحرارة|الجو|الأجواء|الاجواء)/i.test(rawText);
    const wantsNow = /(?:\bnow\b|\bcurrent\b|الآن|الان|حاليا|حالياً)/i.test(rawText);
    const wantsToday = /(?:\btoday\b|اليوم)/i.test(rawText);
    const isArabicInput = /[\u0600-\u06FF]/.test(rawText);
    const hasWebSearch =
      historyStr.includes('tool call: web_search') ||
      historyStr.includes(`tool 'web_search' executed`) ||
      historyStr.includes('"name":"web_search"');

    if (wantsWeather) {
      const city =
        /(?:istanbul|إسطنبول|اسطنبول)/i.test(rawText)
          ? 'Istanbul'
          : (() => {
            const m =
              rawText.match(/(?:in|في)\s+([a-zA-Z\u0600-\u06FF][a-zA-Z\u0600-\u06FF\s-]{1,40})/i) ||
              rawText.match(/([a-zA-Z\u0600-\u06FF][a-zA-Z\u0600-\u06FF\s-]{1,40})\s+(?:weather|الطقس|حالة\s+الطقس)/i);
            return String(m?.[1] || 'Istanbul').trim();
          })();

      if (!hasWebSearch) {
        const cityQuery =
          /istanbul/i.test(city) ? (isArabicInput ? 'إسطنبول' : 'Istanbul') : city;
        const q = isArabicInput
          ? `${wantsNow ? 'درجة الحرارة الآن' : 'حالة الطقس اليوم'} في ${cityQuery}`
          : `${wantsNow ? 'current temperature' : 'current weather'} ${cityQuery} ${wantsNow ? 'now' : wantsToday ? 'today' : 'today'}`;
        return { name: 'web_search', input: { query: q } };
      }

      const out: any = extractLatestToolOutput('web_search');
      const results = Array.isArray(out?.results) ? out.results : [];
      const top = results[0];
      if (top?.description && top?.url) {
        const desc = String(top.description).replace(/^\s*\*\*ANSWER\*\*:\s*/i, '').trim();
        return {
          name: 'echo',
          input: {
            text: `${wantsNow ? 'درجة الحرارة الآن' : 'حالة الطقس اليوم'} في ${/istanbul/i.test(city) ? 'إسطنبول' : city} بحسب ${String(top.title || 'المصدر')}:\n${desc}\nالمصدر: ${String(top.url)}`
          }
        };
      }
      if (top?.url) {
        return {
          name: 'echo',
          input: {
            text: `لم أستطع استخراج تفاصيل دقيقة من النتائج، لكن هذه أفضل نتيجة متاحة الآن:\n${String(top.title || '')}\n${String(top.url)}`
          }
        };
      }
      return { name: 'echo', input: { text: 'تعذّر الحصول على نتائج طقس حالياً.' } };
    }
    const hasOpened =
      historyStr.includes('tool call: browser_open') ||
      historyStr.includes(`tool 'browser_open' executed`) ||
      historyStr.includes('tool call: browser_run') ||
      historyStr.includes(`tool 'browser_run' executed`) ||
      historyStr.includes('"name":"browser_open"') ||
      historyStr.includes('"name":"browser_run"');
    const hasClicked =
      (historyStr.includes('tool call: browser_run') || historyStr.includes(`tool 'browser_run' executed`) || historyStr.includes('"name":"browser_run"')) &&
      historyStr.includes('click');
    const hasAnalyzed =
      historyStr.includes('tool call: browser_get_state') ||
      historyStr.includes(`tool 'browser_get_state' executed`) ||
      historyStr.includes('"name":"browser_get_state"');
    const sessionIdMatch =
      historyTextRaw.match(/"sessionId"\s*:\s*"([^"]+)"/) ||
      historyTextRaw.match(/\bsessionId\b\s*[:=]\s*["']([^"']+)["']/i);
    const sessionId = sessionIdMatch?.[1];

    const extractUrlCandidate = (s: string) => {
      const http = s.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
      if (http) return http;
      const m = s.match(/(?:^|\s)(?:url\s*[:=]\s*)?((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?)/i);
      const candidate = (m?.[1] || '').replace(/[)\].,;:!?]+$/g, '').trim();
      if (!candidate) return undefined;
      const isLocal =
        /^localhost(?::\d+)?(?:\/|$)/i.test(candidate) ||
        /^127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(candidate) ||
        /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(candidate);
      return `${isLocal ? 'http' : 'https'}://${candidate.replace(/^\/\//, '')}`;
    };
    let url = extractUrlCandidate(rawText);

    const extractQuoted = (s: string) => {
      const m = s.match(/["“”'`]\s*([^"“”'`]+?)\s*["“”'`]/);
      return m?.[1];
    };

    const writeEn =
      rawText.match(/write\s+(?:a\s+)?file\s+(?:named|called)\s+([^\s"'`]+)(?:\s+with\s+content\s+(.+))?/i) ||
      rawText.match(/create\s+(?:a\s+)?file\s+(?:named|called)\s+([^\s"'`]+)(?:\s+with\s+content\s+(.+))?/i);
    const writeAr =
      rawText.match(/(?:اكتب|انشئ|أنشئ|سوي|سوِّ|قم\s+بإنشاء)\s+(?:ملف|فايل)\s*(?:باسم|اسم)\s+([^\s"'`]+)(?:\s+(?:بمحتوى|محتوى)\s+(.+))?/i);
    const write = writeEn || writeAr;
    if (write) {
      const filename = String(write[1] || 'verify.txt').trim();
      const tail = String(write[2] || '').trim();
      const quoted = tail ? extractQuoted(tail) : undefined;
      const contentValue = String(quoted || tail || 'verified');
      return { name: 'file_write', input: { filename, content: contentValue } };
    }

    const readEn = rawText.match(/read\s+(?:the\s+)?file\s+([^\s"'`]+)/i);
    const readAr = rawText.match(/(?:اقرأ|اقراء|اعرض|افتح)\s+(?:ملف|فايل)\s+([^\s"'`]+)/i);
    const read = readEn || readAr;
    if (read) {
      const filename = String(read[1] || '').trim();
      if (filename) return { name: 'file_read', input: { filename } };
    }

    const saveAs =
      rawText.match(/save\s+(?:it\s+)?as\s+["“”'`]\s*([^"“”'`]+?)\s*["“”'`]/i) ||
      rawText.match(/(?:احفظ|حفظ|قم\s+بحفظ)(?:ه|ها|هذا)?\s*(?:باسم|اسم)\s*["“”'`]\s*([^"“”'`]+?)\s*["“”'`]/i);
    if (saveAs) {
      const filename = String(saveAs[1] || '').trim();
      if (filename) {
        const wantsHtml =
          /\.html?$/i.test(filename) ||
          /single-file\s+html|landing\s+page|<html/i.test(rawText);
        const artifactDir = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
        const full = path.isAbsolute(filename) ? filename : path.join(artifactDir, filename);
        if (wantsHtml) {
          const html = [
            '<!doctype html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="utf-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
            '  <title>Xelite Coffee</title>',
            '  <style>',
            '    :root {',
            '      --bg: #0b0e14;',
            '      --panel: #121827;',
            '      --text: #e6e9ef;',
            '      --muted: #aab3c5;',
            '      --accent: #7c5cff;',
            '      --accent2: #20c997;',
            '      --border: rgba(255,255,255,0.10);',
            '      --shadow: 0 20px 60px rgba(0,0,0,0.45);',
            '    }',
            '    * { box-sizing: border-box; }',
            '    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, Noto Sans, sans-serif; background: radial-gradient(1000px 600px at 20% -10%, rgba(124,92,255,0.35), transparent 60%), radial-gradient(900px 600px at 100% 0%, rgba(32,201,151,0.18), transparent 55%), var(--bg); color: var(--text); }',
            '    a { color: inherit; }',
            '    .container { max-width: 1100px; margin: 0 auto; padding: 28px 18px 56px; }',
            '    .nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; border: 1px solid var(--border); background: rgba(18,24,39,0.6); backdrop-filter: blur(10px); border-radius: 16px; }',
            '    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: 0.2px; }',
            '    .dot { width: 10px; height: 10px; border-radius: 999px; background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 0 0 6px rgba(124,92,255,0.12); }',
            '    .nav a { text-decoration: none; padding: 10px 12px; border-radius: 12px; color: var(--muted); }',
            '    .nav a:hover { background: rgba(255,255,255,0.06); color: var(--text); }',
            '    .hero { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 18px; margin-top: 18px; }',
            '    @media (max-width: 860px) { .hero { grid-template-columns: 1fr; } }',
            '    .card { border: 1px solid var(--border); background: rgba(18,24,39,0.62); border-radius: 22px; padding: 26px; box-shadow: var(--shadow); }',
            '    .kicker { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); font-size: 13px; }',
            '    h1 { margin: 14px 0 8px; font-size: clamp(34px, 4.3vw, 54px); line-height: 1.06; letter-spacing: -0.6px; }',
            '    .subtitle { margin: 0; color: var(--muted); font-size: 16px; line-height: 1.6; max-width: 62ch; }',
            '    .cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }',
            '    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: rgba(255,255,255,0.05); color: var(--text); text-decoration: none; font-weight: 600; }',
            '    .btn.primary { background: linear-gradient(135deg, rgba(124,92,255,0.95), rgba(32,201,151,0.75)); border-color: rgba(255,255,255,0.14); }',
            '    .btn:hover { filter: brightness(1.05); }',
            '    .panel { display: grid; gap: 12px; }',
            '    .stat { border: 1px solid var(--border); background: rgba(11,14,20,0.35); border-radius: 18px; padding: 14px; }',
            '    .stat b { display: block; font-size: 14px; }',
            '    .stat span { color: var(--muted); font-size: 13px; }',
            '    .features { margin-top: 18px; }',
            '    .features h2 { margin: 0 0 10px; font-size: 20px; }',
            '    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }',
            '    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }',
            '    .feature { border: 1px solid var(--border); background: rgba(11,14,20,0.32); border-radius: 18px; padding: 16px; }',
            '    .feature h3 { margin: 0 0 6px; font-size: 15px; }',
            '    .feature p { margin: 0; color: var(--muted); font-size: 13.5px; line-height: 1.55; }',
            '    footer { margin-top: 18px; color: var(--muted); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }',
            '    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; }',
            '  </style>',
            '</head>',
            '<body>',
            '  <div class="container">',
            '    <div class="nav">',
            '      <div class="brand"><span class="dot"></span><span>Xelite Coffee</span></div>',
            '      <div style="display:flex; gap:6px; flex-wrap:wrap;">',
            '        <a href="#features">Features</a>',
            '        <a href="#menu">Menu</a>',
            '        <a href="#visit">Visit</a>',
            '      </div>',
            '    </div>',
            '',
            '    <section class="hero">',
            '      <div class="card">',
            '        <div class="kicker"><span class="mono">☕</span><span>Dark roast. Bright ideas.</span></div>',
            '        <h1>Code &amp; Caffeine</h1>',
            '        <p class="subtitle">A modern coffee experience designed for builders. Rich espresso, calm ambience, fast Wi‑Fi, and a space that respects focus.</p>',
            '        <div class="cta">',
            '          <a class="btn primary" href="#visit">Get your first cup</a>',
            '          <a class="btn" href="#features">Explore features</a>',
            '        </div>',
            '      </div>',
            '      <div class="card panel">',
            '        <div class="stat"><b>Signature</b><span>Espresso + oat + cocoa, perfectly balanced.</span></div>',
            '        <div class="stat"><b>Speed</b><span>Order ahead and pick up in under 2 minutes.</span></div>',
            '        <div class="stat"><b>Vibe</b><span>Low-noise seating, warm lighting, and power at every table.</span></div>',
            '      </div>',
            '    </section>',
            '',
            '    <section id="features" class="features card">',
            '      <h2>Features</h2>',
            '      <div class="grid">',
            '        <div class="feature"><h3>Developer-Friendly</h3><p>Comfortable seating, outlets everywhere, and a layout built for deep work.</p></div>',
            '        <div class="feature"><h3>Quality Beans</h3><p>Small-batch roasts with consistent flavor—every cup is crafted, not rushed.</p></div>',
            '        <div class="feature"><h3>Fast Service</h3><p>Clean, efficient workflows so you get coffee quickly and keep momentum.</p></div>',
            '      </div>',
            '    </section>',
            '',
            '    <footer class="card" id="visit">',
            '      <div>© <span id="y"></span> Xelite Coffee. All rights reserved.</div>',
            '      <div class="mono">Open daily • 7:00–22:00 • Downtown</div>',
            '    </footer>',
            '  </div>',
            '  <script>document.getElementById(\"y\").textContent=String(new Date().getFullYear());</script>',
            '</body>',
            '</html>',
            '',
          ].join('\\n');
          return { name: 'file_write', input: { filename: full, content: html } };
        }
      }
    }

    const wantsLs =
      /(?:list|show)\s+files/i.test(rawText) ||
      /(?:ls\b)/i.test(rawText) ||
      /(?:اعرض|اظهر|أظهر)\s+(?:ال)?ملفات/i.test(rawText) ||
      /قائمة\s+الملفات/i.test(rawText);
    if (wantsLs) return { name: 'ls', input: { path: '.' } };
    const wantsOpen =
      /\bopen\b/i.test(rawText) ||
      /افتح|افتحي|افتحوا|ادخل|اذهب|روح|زور|وديني|ودني|ودنا|خلني|خليني|بدي|عايز|عاوز|ابي|ابغى|افتح المتصفح|افتح الموقع|واجهة الوكيل/i.test(
        rawText,
      );

    const wantsYouTube = /youtube|يوتيوب/i.test(rawText) || historyStr.includes('youtube.com');
    const wantsSearch =
      /ابحث|بحث|search/i.test(rawText) ||
      /ضيعة\s+ضايعة/i.test(rawText) ||
      /شغل|شغّل|تشغيل|play/i.test(rawText);

    if (wantsYouTube && wantsSearch) {
      const qMatch =
        rawText.match(/ابحث(?:\s+عن)?\s+(.+?)(?:\s+(?:وشغل|وشغّل|وشغل|شغل|تشغيل)|$)/i) ||
        rawText.match(/search\s+for\s+(.+?)(?:\s+and\s+play|$)/i);
      const query = String(qMatch?.[1] || 'ضيعة ضايعة').trim() || 'ضيعة ضايعة';
      return { name: 'echo', input: { text: `ميزة التصفح القديمة أزيلت. سأحتاج تشغيل نظام المتصفح الجديد لتنفيذ: ${query}` } };
    }

    if (wantsOpen) {
      const explicitBrowser = /(\b(browser|web)\b|متصفح)/i.test(rawText);
      const githubKeyword = /(github|جيتهاب|كتهاب|كيتهاب)/i.test(rawText);
      const analysisKeyword = /(كود|code|repo|repository|مستودع|ملفات|files|اختبر|تحقق|راجع|audit|lint|build|typecheck|تحليل)/i.test(rawText);
      if (githubKeyword && analysisKeyword && !explicitBrowser && !url) {
        return {
          name: 'echo',
          input: { text: 'سأقوم بتحليل الكود محلياً دون فتح المتصفح.' },
        };
      }
      if (!url) {
        if (/youtube|يوتيوب/i.test(rawText)) url = 'https://www.youtube.com';
      }

      return {
        name: 'echo',
        input: { text: 'ميزة التصفح القديمة أزيلت. استخدم واجهة المتصفح الجديدة لتنفيذ خطوات داخل موقع.' },
      };
    }

    // Simple Heuristics for the GitHub Test
    if (historyStr.includes('github.com') && historyStr.includes('open') && !historyStr.includes('package.json')) {
      return {
        name: 'echo',
        input: { text: 'سأحلل ملفات المشروع محلياً بدون استخدام المتصفح.' }
      };
    }
    if (historyStr.includes('package.json')) {
      return {
        name: 'echo',
        input: { text: 'سأقرأ package.json من ملفات المشروع مباشرة.' }
      };
    }

    // Yahoo flow (Mock)
    if (content.includes('yahoo') || historyStr.includes('yahoo')) {
      const hasYahooExtract =
        (historyStr.includes('tool call: html_extract') || historyStr.includes(`tool 'html_extract' executed`) || historyStr.includes('"name":"html_extract"')) &&
        historyStr.includes('yahoo.com');
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
  const activeTools = tools.filter(t => !t.name.startsWith('noop_'));
  const selectedToolDefs = selectToolDefsForProvider(activeTools, MAX_PROVIDER_TOOLS, messages);
  const aiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = selectedToolDefs.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || `Tool: ${t.name}. Tags: ${(Array.isArray((t as any).tags) ? (t as any).tags : []).join(', ')}`,
      parameters: (() => {
        if (t.name === 'browser_run') {
          console.log('DEBUG_SCHEMA: browser_run schema:', JSON.stringify(t.inputSchema, null, 2));
        }
        return t.inputSchema as any;
      })(),
    },
  }));

  // 2. Add a system prompt if not present
  let msgs = [
    {
      role: 'system',
      content: getSystemPrompt()
    },
    ...messages
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  // Token Optimization Logic:
  // Estimate total characters to prevent 429 Rate Limit errors (approx 4 chars/token).
  // If we exceed ~80,000 chars (approx 20k tokens), we must truncate older messages.
  const CHAR_LIMIT = 80000;

  // Strategy 0: Aggressively prune OLD tool outputs (keep only the last 2 tool outputs full)
  // This is critical for "Chat" speed where old file reads are irrelevant.
  const toolOutputIndices: number[] = [];
  msgs.forEach((m, idx) => {
    // In OpenAI format, tool output has role 'tool'
    if (m.role === 'tool' || (m.role === 'function' as any)) {
      toolOutputIndices.push(idx);
    }
  });

  // Keep the last 3 tool outputs intact, truncate older ones
  const KEEP_TOOL_OUTPUTS = 3;
  if (toolOutputIndices.length > KEEP_TOOL_OUTPUTS) {
    const indicesToTruncate = toolOutputIndices.slice(0, toolOutputIndices.length - KEEP_TOOL_OUTPUTS);
    const truncateSet = new Set(indicesToTruncate);

    msgs = msgs.map((m, idx) => {
      if (truncateSet.has(idx)) {
        return {
          ...m,
          content: '(Tool output suppressed to save context)'
        };
      }
      return m;
    });
  }

  let currentChars = msgs.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length), 0);

  if (currentChars > CHAR_LIMIT) {
    console.warn(`[LLM] Context too large (${currentChars} chars). Truncating history...`);

    // Strategy 1: Truncate very long individual messages (likely tool outputs)
    msgs = msgs.map(m => {
      if (m.role === 'system') return m; // Keep system prompt intact

      let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const MAX_MSG_LEN = 60000;
      if (content.length > MAX_MSG_LEN) {
        // Keep start and end to preserve some context
        content = content.slice(0, 25000) + `\n\n...[Content Truncated (${content.length - MAX_MSG_LEN} chars removed) to save tokens]...\n\n` + content.slice(-25000);
      }
      return { ...m, content };
    });

    // Recalculate
    currentChars = msgs.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length), 0);

    // Strategy 2: If still too large, remove middle messages (sliding window)
    if (currentChars > CHAR_LIMIT) {
      const keepCount = 6; // Keep first system + last 5 messages
      if (msgs.length > keepCount) {
        const removedCount = msgs.length - keepCount;
        const system = msgs[0];
        const recent = msgs.slice(-5);
        msgs = [
          system,
          { role: 'system', content: `(System Note: ${removedCount} previous messages were removed from context to fit within token limits.)` },
          ...recent
        ];
      }
    }
  }

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
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch (e: any) {
        return {
          name: 'echo',
          input: { text: `Tool arguments parse failed for ${toolCall.function.name}.` },
        };
      }
      return {
        name: toolCall.function.name,
        input: parsedArgs,
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
    return null;
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
    const completion = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: msgs,
      max_tokens: 20,
    });
    return completion.choices[0]?.message?.content?.trim() || 'New Session';
  } catch (e) {
    console.error('Title generation failed', e);
    return 'New Session';
  }
}// Update OpenAI client when API key changes
// Update OpenAI client when API key changes
function getOpenAIClient() {
  return new OpenAI({
    apiKey: apiKey || 'dummy',
    baseURL: process.env.OPENAI_BASE_URL,
  });
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
    const completion = await getOpenAIClient().chat.completions.create({
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
