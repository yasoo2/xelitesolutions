import OpenAI from "openai";
import { tools } from "./tools/registry";
import path from "path";
import {
  freeIntelligenceOptimizer,
  generateSmartResponse,
} from "./llm/free-intelligence-optimizer";
import { GroqProvider } from "./llm/providers/groq";

const groq = new GroqProvider();
const GROQ_AVAILABLE = !!process.env.GROQ_API_KEY;

// Enterprise Systems (Global Requires to avoid ReferenceErrors across scopes)
import intelligentRouter from "./llm/intelligent-router";
const {
  advancedAnalyzeTask,
  routeToModel,
  selectBestModel,
  generateActionPlan,
} = intelligentRouter;
const {
  buildConversationContext,
  analyzeContextualIntent,
  matchPatternWithContext,
} = require("./llm/context-engine");
const { longTermMemory } = require("./memory/long-term-memory");
const { orchestrator } = require("./agents/orchestrator");
const { analyzeContext } = require("./intelligence/context-analyzer");

// Initialize OpenAI client
let apiKey = process.env.OPENAI_API_KEY;
if (apiKey) {
  console.info("LLM: OpenAI API Key configured from environment.");
} else {
  console.warn("LLM: No OpenAI API Key found in environment variables.");
}

// Support for dynamic API key from requests (Scoped by User ID)
const userApiKeys = new Map<string, string>();

// Helper to extract JSON tool call from messy LLM text
export function extractToolCallFromText(text: string): { name: string; input: any; reasoning?: string } | null {
  if (!text || text.length < 5) return null;

  // 1. Try to find JSON block in markdown
  const markdownJsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownJsonMatch) {
    try {
      const json = JSON.parse(markdownJsonMatch[1].trim());
      if (json.name && json.input) return json;
    } catch (e) { }
  }

  // 2. Try to find reasoning/thought block to preserve it
  let reasoning: string | undefined = undefined;
  const thoughtMatch = text.match(/<thought>([\s\S]*?)<\/thought>/i) ||
    text.match(/:::thought([\s\S]*?):::/i) ||
    text.match(/<think>([\s\S]*?)<\/think>/i);
  if (thoughtMatch) {
    reasoning = thoughtMatch[1].trim();
  }

  // 3. Try to find the largest valid JSON structure containing "name" and "input"
  try {
    const bracePairs: { start: number; end: number }[] = [];
    let stack = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (stack === 0) start = i;
        stack++;
      } else if (text[i] === '}') {
        stack--;
        if (stack === 0 && start !== -1) {
          bracePairs.push({ start, end: i });
        }
      }
    }

    // Try blocks from largest to smallest
    const candidates = bracePairs
      .sort((a, b) => (b.end - b.start) - (a.end - a.start))
      .map(p => text.substring(p.start, p.end + 1));

    for (const cand of candidates) {
      try {
        const json = JSON.parse(cand);
        if (json.name && json.input) {
          if (reasoning && !json.reasoning) json.reasoning = reasoning;
          return json;
        }
      } catch { }
    }
  } catch (e) { }

  // 4. Final fallback: simple regex for when LLM misses a brace
  try {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.substring(firstBrace, lastBrace + 1);
      const json = JSON.parse(candidate);
      if (json.name && json.input) return json;
    }
  } catch (e) { }

  return null;
}

export function setDynamicOpenAIKey(userId: string, key: string) {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!userId) {
    console.error("LLM: Attempted to set dynamic key without userId");
    return;
  }
  if (!trimmed) {
    userApiKeys.delete(userId);
    return;
  }
  userApiKeys.set(userId, trimmed);
  console.info(
    `LLM: Dynamic OpenAI API Key set for user ${userId.slice(0, 4)}...`,
  );
}

export function getDynamicOpenAIKey(userId: string): string | null {
  if (!userId) return null;
  return userApiKeys.get(userId) || null;
}

// Helper to get key for a specific user, falling back to env
export const getApiKeyForUser = (userId: string) => {
  return userApiKeys.get(userId) || apiKey || "";
};

const openai = new OpenAI({
  apiKey: apiKey || "dummy", // Default client uses env key
  baseURL: process.env.OPENAI_BASE_URL,
});

const MAX_PROVIDER_TOOLS = Number(process.env.MAX_PROVIDER_TOOLS) || 256;
const PRIORITY_TOOL_NAMES: string[] = [
  "echo",
  "project_detect",
  "analyze_codebase",
  "website_full_pipeline",
  "read_file",
  "write_file",
  "file_edit",
  "scaffold_project",
  "scaffold_full_stack",
  "read_file_tree",
  "ls",
  "grep_search",
  "fs_glob",
  "check_syntax",
  "generate_tests",
  "generate_docs",
  "db_inspect",
  "quality_run",
  "git_ops",
  "command_policy_check",
  "tool_create_shell",
  "shell_execute",
  "product_search",
  "web_search",
  "http_fetch",
  "central_answer",
  "knowledge_search",
  "html_extract",
  "github_create_repo",
  "image_generate",
  "deep_research",
  "dependency_graph",
  "business_logic",
  "chaos_testing",
  "compliance_validator",
  "cost_estimator",
  "ambiguity_resolver",
  "multi_agent_debate",
  "self_confidence",
  "terraform_ops",
  "kubernetes_ops",
  "db_schema_migrator",
  "sonar_analysis",
  "security_scan_repo",
];

export function selectToolDefsForProvider(
  all: typeof tools,
  limit: number,
  messages: {
    role: "user" | "assistant" | "system";
    content: string | any[];
  }[],
) {
  const byName = new Map(all.map((t) => [t.name, t] as const));
  const selected: typeof tools = [];
  const seen = new Set<string>();

  // Use context analyzer if available
  let contextInfo: any = null;
  try {
    contextInfo = analyzeContext(messages);
  } catch { }

  const routingTextRaw = messages
    .slice(-10)
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : JSON.stringify(m.content || ""),
    )
    .join("\n");
  const routingText = routingTextRaw.toLowerCase();

  // Detect Browser Task Category
  const isBrowserTask =
    /https?:\/\//i.test(routingTextRaw) ||
    /browser|browsing|website|login|url/i.test(routingTextRaw);

  const isArabic = /[\u0600-\u06FF]/.test(routingTextRaw);
  const normalizeRouting = (input: string) => {
    let s = String(input || "");
    try {
      s = s.normalize("NFKC");
    } catch { }
    s = s
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه");
    s = s
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return s;
  };
  const routingNorm = normalizeRouting(routingTextRaw);

  // Smart URL/Label Detection: Relaxed to catch simple site names like 'github' or 'google'
  const hasUrl =
    /https?:\/\/\S+/i.test(routingTextRaw) ||
    /(?:^|\s)(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?(?:\s|$)/i.test(
      routingTextRaw,
    ) ||
    /\b(github|google|openai|facebook|youtube|instagram|twitter|amazon|chatgpt|linkedin|whatsapp|gmail|xelite|xelitesolutions)\b/i.test(
      routingTextRaw,
    ) ||
    /(جيتهاب|جيت\s+هاب|جت\s+هاب|غيت\s+هاب|جوجل|قوقل|يوتيوب|فيسبوك|تويتر|لينكد\s*ان|لينكد\s*ان|واتساب|امازون|أمازون)/i.test(
      routingNorm,
    );

  const wantsBrowser =
    hasUrl ||
    /\b(browser|browse|web|website|open|visit|goto|nav|navigate)\b/i.test(
      routingTextRaw,
    ) ||
    (/(متصفح|تصفح|موقع|رابط|داخل\s+المتصفح|ادخل|اذهب|روح|زور|وديني|ودني|ودنا|اذهب\s+الى|اذهب\s+إلى|انتقل\s+إلى|انتقل\s+الى|افتحلي|افتح\s+لي|خلني|خليني|بدي|عايز|عاوز|ابي|ابغى|اختبر|شيك|جرّب|تأكد)/i.test(
      routingNorm,
    ) &&
      !/(ملف|كود|مجلد|مجلدات|برمجة)/i.test(routingNorm));
  const wantsSearch =
    /\b(search|research|find|lookup|web_search|deep_research|knowledge)\b/i.test(
      routingTextRaw,
    ) || /ابحث|بحث|مصدر|مراجع|معلومات/i.test(routingNorm);
  const wantsFs =
    /\b(file|folder|directory|path|read|write|edit|tree|glob|grep)\b/i.test(
      routingTextRaw,
    ) ||
    /ملف|مجلد|مسار|اقرا|اقرأ|اكتب|عدل|عدّل|ابحث\s+في\s+الكود/i.test(
      routingNorm,
    );
  const wantsShell =
    /\b(terminal|command|shell|npm|pnpm|yarn|pip|python|node|run)\b/i.test(
      routingTextRaw,
    ) || /ترمينال|طرفيه|طرفية|امر|أمر|تشغيل/i.test(routingNorm);
  const wantsQuality =
    /\b(lint|eslint|typecheck|tsc|test|jest|build|ci)\b/i.test(
      routingTextRaw,
    ) || /اختبار|اختبر|lint|بناء|typecheck|تحقق/i.test(routingNorm);
  const wantsGit =
    /\b(git|github|commit|pr|pull request|diff|branch)\b/i.test(
      routingTextRaw,
    ) ||
    /جيت|جيتهاب|جيت\s+هاب|جت\s+هاب|غيت\s+هاب|فرع|كوميت|طلب\s+دمج/i.test(
      routingNorm,
    );
  const wantsImage =
    /\b(image|png|jpg|jpeg|generate image)\b/i.test(routingTextRaw) ||
    /صورة|صور/i.test(routingTextRaw);

  let computedLimit = 72;
  if (routingTextRaw.length < 140) computedLimit = 56;
  if (routingTextRaw.length > 700) computedLimit = 96;
  if (wantsBrowser) computedLimit = Math.max(computedLimit, 88);
  if (wantsSearch) computedLimit = Math.max(computedLimit, 80);
  if (wantsFs) computedLimit = Math.max(computedLimit, 80);
  if (wantsQuality) computedLimit = Math.max(computedLimit, 80);
  if (wantsGit) computedLimit = Math.max(computedLimit, 72);
  if (wantsImage) computedLimit = Math.max(computedLimit, 72);
  const effectiveLimit = Math.max(
    PRIORITY_TOOL_NAMES.length,
    Math.min(limit, computedLimit),
  );

  for (const name of PRIORITY_TOOL_NAMES) {
    const t = byName.get(name);
    if (!t) continue;
    selected.push(t);
    seen.add(t.name);
    // Allow the loop to continue to fill with scored tools even if priority list is large
    if (selected.length >= effectiveLimit) break;
  }

  const isGeneratedName = (name: string) =>
    name.startsWith("code_find_") ||
    name.startsWith("code_search_") ||
    name.startsWith("noop_");

  const scoreTool = (t: any) => {
    const tags: string[] = Array.isArray(t?.tags) ? t.tags : [];
    const name = String(t?.name || "").toLowerCase();
    const desc = String(t?.description || "").toLowerCase();
    const hay = `${name} ${desc} ${tags.join(" ")}`;
    let score = 0;

    // Base importance scores
    if (tags.includes("agent")) score += 50;
    if (tags.includes("browser")) score += 45;
    if (tags.includes("fs")) score += 35;
    if (tags.includes("shell")) score += 35;
    if (tags.includes("search")) score += 25;
    if (tags.includes("knowledge")) score += 20;
    if (tags.includes("code")) score += 10;

    // Context-aware scoring (major boost for relevant tools)
    if (
      wantsBrowser &&
      (tags.includes("browser") || name.startsWith("browser_"))
    )
      score += 120;
    if (
      wantsSearch &&
      (tags.includes("search") ||
        tags.includes("knowledge") ||
        name.includes("search") ||
        name.includes("research"))
    )
      score += 85;
    if (
      wantsFs &&
      (tags.includes("fs") ||
        name.includes("file_") ||
        name.includes("read") ||
        name.includes("write") ||
        name.includes("grep") ||
        name.includes("glob"))
    )
      score += 80;
    if (
      wantsShell &&
      (tags.includes("shell") ||
        name.includes("shell") ||
        name.includes("command"))
    )
      score += 70;
    if (
      wantsQuality &&
      (name.includes("lint") ||
        name.includes("test") ||
        name.includes("type") ||
        name.includes("quality") ||
        tags.includes("quality"))
    )
      score += 75;
    if (
      wantsGit &&
      (name.includes("git") || name.includes("github") || tags.includes("git"))
    )
      score += 70;
    if (wantsImage && (name.includes("image") || tags.includes("image")))
      score += 70;

    // URL and language context
    if (
      hasUrl &&
      (name.includes("http") ||
        name.includes("html") ||
        tags.includes("browser"))
    )
      score += 30;
    if (isArabic) {
      if (/(arabic|ar)\b/.test(hay)) score += 10;
    }

    // Task complexity boost
    const isComplexTask =
      routingTextRaw.length > 500 ||
      /(comprehensive|detailed|full|complete|entire)/.test(routingTextRaw);

    // Penalize filesystem tools during browser tasks
    if (
      isBrowserTask &&
      (tags.includes("fs") ||
        name.startsWith("file_") ||
        name.startsWith("ls") ||
        name.startsWith("grep") ||
        name.startsWith("read_file_tree"))
    ) {
      score -= 1000;
    }

    if (
      isComplexTask &&
      (tags.includes("analysis") ||
        name.includes("analyze") ||
        name.includes("scaffold"))
    ) {
      score += 40;
    }

    // CONTEXT ANALYZER BOOST (actually use it!)
    if (contextInfo) {
      // Boost tools suggested by context analyzer
      const suggested = Array.isArray(contextInfo.suggestedTools)
        ? contextInfo.suggestedTools
        : [];
      if (suggested.includes(name)) {
        score += 60; // Major boost for context-suggested tools
      }

      // Task type specific boosts
      if (
        contextInfo.taskType === "coding" &&
        (tags.includes("fs") || tags.includes("shell") || name.includes("file"))
      ) {
        score += 35;
      }
      if (
        contextInfo.taskType === "research" &&
        (tags.includes("search") || tags.includes("knowledge"))
      ) {
        score += 35;
      }
      if (contextInfo.taskType === "browsing" && tags.includes("browser")) {
        score += 35;
      }
      if (
        contextInfo.taskType === "debugging" &&
        (name.includes("test") ||
          name.includes("quality") ||
          name.includes("lint"))
      ) {
        score += 35;
      }

      // Complexity boost
      if (
        contextInfo.complexity === "complex" &&
        (tags.includes("agent") ||
          tags.includes("scaffold") ||
          tags.includes("analysis"))
      ) {
        score += 25;
      }
    }

    const boostKeywords = [
      "scaffold",
      "analyze",
      "repo",
      "project",
      "deploy",
      "migration",
      "db",
      "auth",
      "payments",
    ];
    for (const kw of boostKeywords) {
      if (routingText.includes(kw) && hay.includes(kw)) score += 10;
    }
    return score;
  };

  const preferred = all
    .filter((t) => !seen.has(t.name) && !isGeneratedName(t.name))
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
  sessionId?: string; // For enterprise context and memory
  workspaceId?: string; // Target workspace ID
  userText?: string; // Clean user text (no context)
  fullPromptText?: string; // Prompt with context/instructions
  onThought?: (chunk: string) => void;
  onProgress?: (msg: string) => void;
}

export const BASE_SYSTEM_PROMPT = `You are "Joe" (also known as Manus in autonomous mode), a professional and collaborative AI Autonomous Engineering System.

### 🔥 PRIME DIRECTIVE: CONTINUOUS AUTONOMOUS EXECUTION 🔥
You operate within a continuous agent loop. **You are NOT a conversational chatbot. You are an autonomous builder.**
When given a task, you MUST chain multiple tools together iteratively until the ENTIRE task is completely finished.
**DO NOT use the \`echo\` tool to casually reply to the user or give partial updates.**
**ONLY use \`echo\` when you are 100% finished with the final goal.** Using \`echo\` will terminate your autonomous loop.

### MANDATORY TOOL CALL FORMAT:
If you decide to take an action, you MUST output a JSON block like this (and ONLY this, do not add conversational text before/after if you are acting):
{
  "name": "tool_name",
  "input": { "param1": "value" },
  "reasoning": "Brief explanation of why this action is taken"
}

### 🔄 THE AUTONOMOUS CYCLE:
1. **THINK (Reasoning)**: Analyze the current state and what needs to be done next.
2. **EXPLORE**: Discover the environment. Use \`ls\`, \`grep_search\`, \`read_file\`, or \`project_detect\`.
3. **PLAN & EXECUTE**: Call the exact right tool to make progress. (e.g., \`shell_execute\`, \`file_edit\`, \`npm_install\`).
4. **VERIFY**: Did it work? If a command fails, DO NOT give up and tell the user. You must self-heal! Analyze the error and try a different approach.
5. **FINISH**: ONLY when the entire user's request is demonstrably complete, use the \`echo\` tool to output your final report.

### 🧠 BEHAVIORAL STYLE & EXPERTISE:
- **Relentless**: If you hit an error, you automatically read the logs and fix it without bothering the user.
- **Silent Worker**: Do not narrate your every move to the user via \`echo\`. Just do the work. The user can see your tool calls in the UI.
- **Scalable**: Write clean, enterprise-grade, production-ready code.
- **Personalized**: Refer to the user naturally (e.g. "Younis, I have finished...") when you use \`echo\` at the very end.
- **Multilingual**: When you finally output via \`echo\`, match the user's language (Arabic or English).

### 🛠️ TOOL CALLING RULES:
- If a tool fails, read the error and try again.
- Do not make assumptions about directory structures. Always \`ls\` or view files first.
- To execute terminal commands, use \`shell_execute\`.
- **CRITICAL**: To stop working and conclude the conversation, output an \`echo\` tool call.

### 📋 TASK MANAGEMENT PROTOCOL:
For complex, multi-step tasks, you MUST:
1. Create a \`todo.md\` file in the workspace root at the start of the task.
2. Use markdown checkboxes (\`- [ ]\`, \`- [x]\`) to list each step.
3. Update the checkboxes immediately after completing each step (use \`file_edit\`).
4. When the task is complete, verify all items in \`todo.md\` are checked off.

### 📡 COMMUNICATION PROTOCOL:
- **\`notify_user\`**: Use this to send non-blocking progress updates (e.g., "Installing dependencies…"). This does NOT stop your execution loop.
- **\`echo\`**: Use this ONLY when the ENTIRE task is 100% complete. This STOPS your execution loop.
- **NEVER use \`echo\` for intermediate updates.** Use \`notify_user\` instead.

### 🐍 COMPUTATION PROTOCOL:
- For mathematical calculations, data analysis, or any computation requiring precision: use the \`execute_python\` tool.
- **NEVER attempt mental math.** Write a Python script and execute it.
- For simple calculations, use \`execute_python\` with a short script (e.g., \`print(2**32)\`).

### 📄 LARGE DOCUMENT STRATEGY:
When writing large files, articles, or documentation (>500 lines):
1. Generate each section as a separate file (e.g., \`draft_part1.md\`, \`draft_part2.md\`).
2. After all sections are complete, use \`shell_execute\` to concatenate them (e.g., \`cat draft_part*.md > final_document.md\`).
3. This prevents context window overflow and ensures completeness.
`;

export const getSystemPrompt = (user?: {
  name?: string;
  systemInstructions?: string;
  workspaceRoot?: string;
  workspaceName?: string;
}) => {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  let systemPromptOutput =
    BASE_SYSTEM_PROMPT + `\n\nToday's Date: ${date}\nCurrent Time: ${time}`;

  if (user?.name) {
    systemPromptOutput += `\n\nUSER CONTEXT:\nUser Name: ${user.name}\nINSTRUCTION: meaningful interactions should include the user's name naturally (e.g., "Certainly, ${user.name}", "I can help with that, ${user.name}").`;
  }

  // Auto-inject Workspace Context
  let root = user?.workspaceRoot;
  let wName = user?.workspaceName;
  try {
    if (!root) {
      const { workspaceService } = require('./services/WorkspaceService');
      root = workspaceService.getActiveRoot();
    }
    if (root && !wName) {
      wName = require('path').basename(root);
    }
  } catch (e) {
     // Ignore missing workspace gracefully
  }

  if (root) {
    systemPromptOutput += `\n\nWORKSPACE CONTEXT:\nPath: ${root}\nName: ${wName || 'Default'}\nCRUCIAL INSTRUCTION: You are currently operating inside this workspace directory. When analyzing the project, reading files, or writing code, assume this is your absolute root path. DO NOT ask the user "which file to edit" if they request changes to this project—just use the tools directly on the files inside this path.`;
  }

  if (user?.systemInstructions && user.systemInstructions.trim()) {
    systemPromptOutput += `\n\nUSER CUSTOM INSTRUCTIONS:\n${user.systemInstructions.trim()}`;
  }
  return systemPromptOutput;
};

// Deprecated: Use getSystemPrompt() instead
export const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;

import {
  pollinationsProvider,
  openRouterProvider,
  huggingfaceProvider,
  deepSeekProvider,
} from "./llm/providers/registry";
import { LLMCacheTool } from "./tools/definitions/LLMCacheTool";

// Export for use in intelligent-router
export { pollinationsProvider, openRouterProvider, huggingfaceProvider, deepSeekProvider };

// In-memory store for user provider preference
const activeProviders = new Map<string, string>();

export function setActiveProvider(userId: string, provider: string) {
  const p = provider.toLowerCase();
  if (["openrouter"].includes(p)) activeProviders.set(userId, "openrouter");
  else if (["auto", "intelligent"].includes(p))
    activeProviders.set(userId, "auto");
  else if (["huggingface", "hf"].includes(p))
    activeProviders.set(userId, "huggingface");
  else if (["gemini", "google"].includes(p))
    activeProviders.set(userId, "gemini");
  else if (["deepseek"].includes(p))
    activeProviders.set(userId, "deepseek");
  else activeProviders.set(userId, "openai");
  console.log(
    `LLM: User ${userId.slice(0, 4)} switched to provider: ${activeProviders.get(userId)}`,
  );
}

export function getActiveProvider(userId: string): string {
  const userProvider = activeProviders.get(userId);
  if (userProvider) return userProvider;

  // Smart default: ALWAYS use auto mode (intelligent-router) to ensure robust fallbacks
  // even if an environment key is present but broken.
  return "auto";
}

export async function callLLM(
  prompt: string,
  context: any[] = [],
  userId?: string,
): Promise<string> {
  const resolvedUserId = userId || "anonymous";
  const currentProvider = getActiveProvider(resolvedUserId);

  // Determine configuration for Official Providers (OpenAI / Gemini)
  let forcedBaseUrl = process.env.OPENAI_BASE_URL;
  let forcedModel = process.env.OPENAI_MODEL;

  if (currentProvider === "gemini") {
    forcedBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/";
    forcedModel = "gemini-1.5-flash";
  }

  const msgs = [
    {
      role: "system",
      content: getSystemPrompt({ name: userId ? "Younis" : undefined }),
    },
    ...context,
    { role: "user", content: prompt },
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  try {
    const cacheDisabled =
      String(process.env.LLM_CACHE_DISABLE || "").trim() === "1";
    const modelForCache = forcedModel || process.env.OPENAI_MODEL || "gpt-4o";
    const cacheText = msgs
      .map((m) =>
        typeof (m as any)?.content === "string"
          ? String((m as any).content)
          : JSON.stringify((m as any)?.content || ""),
      )
      .join("\n");
    const hasSensitive =
      /(sk-[a-z0-9]{10,}|api[_-]?key|authorization:\s*bearer|-----begin\s+[a-z ]+-----)/i.test(
        cacheText,
      );
    const cacheKeyPayload = `${resolvedUserId}::${JSON.stringify({
      provider: currentProvider,
      forcedBaseUrl,
      forcedModel,
      messages: msgs,
    })}`;

    if (!cacheDisabled && !hasSensitive) {
      const cached = await LLMCacheTool.checkCache(
        cacheKeyPayload,
        modelForCache,
      );
      if (cached) return cached;
    }

    const key = userId ? getApiKeyForUser(userId) : apiKey || "";
    const hasKey = Boolean(String(key).trim());

    if (currentProvider === "auto" || !hasKey) {
      const response = await routeToModel(msgs);
      if (!cacheDisabled && !hasSensitive && response && response.length > 20) {
        await LLMCacheTool.saveToCache(
          cacheKeyPayload,
          response,
          modelForCache,
        );
      }
      return response || "";
    }

    // If we have a specific user key, use a new client instance, otherwise use default
    let client = openai;

    // Always create fresh client if using Gemini or dynamic key
    if ((userId && userApiKeys.has(userId)) || currentProvider === "gemini") {
      client = new OpenAI({
        apiKey: userId ? userApiKeys.get(userId) : key,
        baseURL: forcedBaseUrl || process.env.OPENAI_BASE_URL,
      });
    } else if (apiKey && !forcedBaseUrl) {
      // use default client
    } else {
      client = new OpenAI({
        apiKey: key,
        baseURL: forcedBaseUrl || process.env.OPENAI_BASE_URL,
      });
    }

    const completion = await client.chat.completions.create({
      model: forcedModel || process.env.OPENAI_MODEL || "gpt-4o",
      messages: msgs,
    });
    const response = completion.choices[0]?.message?.content || "";
    if (!cacheDisabled && !hasSensitive && response && response.length > 20) {
      await LLMCacheTool.saveToCache(cacheKeyPayload, response, modelForCache);
    }
    return response;
  } catch (e: any) {
    throw new Error(`LLM call failed: ${e.message}`);
  }
}

export async function planNextStep(
  messages: {
    role: "user" | "assistant" | "system";
    content: string | any[];
  }[],
  options?: PlanOptions,
): Promise<{ name: string; input: any; reasoning?: string } | null> {
  const provider =
    options?.provider || getActiveProvider(options?.userId || "anonymous");
  const providerKey = String(provider || "")
    .trim()
    .toLowerCase();
  console.info(
    `[LLM] planNextStep entry - Provider: ${provider}, Resolved Key: ${providerKey}`,
  );

  const { workspaceService } = require("./services/WorkspaceService");
  const workspaceRoot = options?.workspaceId ? workspaceService.getActiveRoot(options.workspaceId) : process.cwd();
  const workspaceName = path.basename(workspaceRoot);
  const promptCtx = {
    name: options?.userId ? "Younis" : "User",
    workspaceRoot,
    workspaceName
  };

  const onProgress = options?.onProgress;
  const onThought = options?.onThought;

  onProgress?.("تحليل الطلب…");
  onProgress?.("تجميع سياق سريع…");

  const optimization = await freeIntelligenceOptimizer.optimizeRequest(
    typeof messages.slice(-1)[0].content === "string"
      ? (messages.slice(-1)[0].content as string)
      : JSON.stringify(messages.slice(-1)[0].content),
    messages,
  );

  onProgress?.("مطابقة الأنماط وتحديد المسار…");

  const analysis =
    (optimization as any).analysis ||
    ((optimization as any).skipPlanner
      ? { type: "chat", complexity: "simple", language: "ar" }
      : await advancedAnalyzeTask(
        typeof messages.slice(-1)[0].content === "string"
          ? (messages.slice(-1)[0].content as string)
          : JSON.stringify(messages.slice(-1)[0].content),
        messages,
        onProgress,
      ));

  if ((optimization as any).skipPlanner) {
    // [WAKIL ENFORCEMENT] The user requested a FULL AGENT system.
    // We DISABLE the "skipPlanner" short-circuit to ensure the system ALWAYS
    // uses the robust tool-use path (Enterprise Agent).
    console.info(
      "[Wakil] 🛡️ Short-circuit bypassed. Enforcing full Agent analysis for all queries.",
    );

    // Instead of returning 'echo', we fall through to the planner logic below.
    // This ensures even "Hi" gets analyzed for potential context/intent.
  }

  // Resolve Key: Option > UserMap > Env
  let resolvedKey = options?.apiKey;
  if (!resolvedKey && options?.userId) {
    resolvedKey = getApiKeyForUser(options.userId);
  }
  if (!resolvedKey) {
    resolvedKey = process.env.OPENAI_API_KEY;
  }

  const optKey = String(resolvedKey || "").trim();
  const envKey = String(process.env.OPENAI_API_KEY || "").trim();
  const forceMock = String(process.env.LLM_PLAN_MOCK || "").trim() === "1";
  const shouldMock = forceMock || options?.mock === true;

  // Gemini Provider - Full Tool Calling Support
  if (providerKey.includes("gemini") || providerKey.includes("google")) {
    console.info(
      "[LLM] 🌟 Planning with Google Gemini Provider (Tool Calling Enabled)",
    );
    onProgress?.("الاتصال بـ Google Gemini…");

    const lastMsg = messages[messages.length - 1];
    const role = lastMsg ? (lastMsg.role as string) : "";
    if (role === "tool" || role === "function") {
      console.info("[LLM] Gemini: Detected tool output, continuing planning.");
    }

    try {
      const {
        GeminiProvider,
        geminiProvider: defaultGemini,
      } = require("./llm/providers/gemini");

      // Use the provided key if available, otherwise use the default singleton
      let geminiOverride: any = null;
      if (options?.apiKey) {
        geminiOverride = new GeminiProvider(options.apiKey);
      }

      const activeGemini = geminiOverride || defaultGemini;

      if (!activeGemini.isAvailable()) {
        console.error("[LLM] Gemini: API key not configured");
        // Fall through to auto mode
      } else {
        // Prepare messages with system prompt
        const msgs = [
          {
            role: "system",
            content: getSystemPrompt(promptCtx as any),
          },
          ...messages,
        ];

        // Select tools with a hard cap of 10 for Gemini stability (Google endpoint limit ~10-15 tools)
        const selectedTools = selectToolDefsForProvider(
          tools,
          256,
          messages,
        ).slice(0, 10);
        console.info(
          `[LLM] Gemini: Selected ${selectedTools.length} tools (capped at 10) for this request`,
        );
        onProgress?.(`تجهيز ${selectedTools.length} أداة…`);

        // Convert tools to OpenAI format
        const toolDefs = selectedTools.map((t: any) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description || "",
            parameters: t.inputSchema || { type: "object", properties: {} },
          },
        }));

        // Call Gemini with tool support (streaming if onThought is available)
        let completion: any;
        if (onThought) {
          // Use streaming to power the real-time Neural Interaction
          completion = await activeGemini.chatWithToolsStreaming(
            msgs,
            toolDefs,
            (chunk: string) => {
              // Emit each LLM text delta to the Neural Indicator in real-time
              onThought(chunk);
            },
            options?.model,
          );
        } else {
          // Fallback to non-streaming for callers that don't need live updates
          completion = await activeGemini.chatWithTools(
            msgs,
            toolDefs,
            options?.model,
          );
        }
        const message = completion.choices[0]?.message;

        // Check for tool calls
        if (message?.tool_calls && message.tool_calls.length > 0) {
          const toolCall = message.tool_calls[0];
          const toolName = toolCall.function.name;
          let toolInput = {};

          try {
            toolInput = JSON.parse(toolCall.function.arguments || "{}");
          } catch (e) {
            toolInput = { raw: toolCall.function.arguments };
          }

          console.info(`[LLM] Gemini: Tool call detected - ${toolName}`);
          onProgress?.(`تنفيذ الأداة: ${toolName}…`);

          return { name: toolName, input: toolInput };
        }

        // No native tool call, check if the LLM output the JSON in the text content
        const textContent = message?.content || "";
        if (textContent) {
          const extracted = extractToolCallFromText(textContent);
          if (extracted) {
            console.info(`[LLM] Gemini: Extracted tool call from text - ${extracted.name}`);
            onProgress?.(`تنفيذ الأداة من النص: ${extracted.name}…`);
            return { name: extracted.name, input: extracted.input, reasoning: extracted.reasoning };
          }
          return { name: "echo", input: { text: textContent } };
        }

        return null;
      }
    } catch (err: any) {
      console.error("[LLM] Gemini Provider Failed:", err.message);
      if (options?.throwOnError) throw err;
      onProgress?.("فشل الاتصال، محاولة بديلة…");

      // [Wakil FIX] Avoid infinite recursion by checking provider before fallback
      if (options?.provider === "auto") {
        console.error(
          "[LLM] Critical: Auto-mode fallback failed. Using terminal pollinations fallback.",
        );
        const {
          pollinationsProvider,
        } = require("./llm/providers/pollinations");
        const msgs = [
          { role: "system", content: getSystemPrompt({ name: "Younis" }) },
          ...messages,
        ];
        const text = await pollinationsProvider.chatComplete(msgs, "openai");
        return {
          name: "echo",
          input: { text: text || "Response from Joe (Emergency Fallback)" },
        };
      }

      console.info("[LLM] Gemini failed, falling back to Auto mode...");
      // [Dynamic Fallback] If Gemini fails, try DeepSeek before generic auto mode if available
      if (deepSeekProvider.isAvailable()) {
        console.info("[LLM] High-Performance fallback: Choosing DeepSeek V3");
        return await planNextStep(messages, { ...options, provider: "deepseek" });
      }
      return await planNextStep(messages, { ...options, provider: "auto" });
    }
  }

  // DeepSeek Provider - High performance tool calling support
  if (providerKey.includes("deepseek")) {
    console.info("[LLM] 🚀 Planning with DeepSeek V3 (High-Performance)");
    onProgress?.("الاتصال بـ DeepSeek…");

    try {
      const toolDefs = selectToolDefsForProvider(tools, MAX_PROVIDER_TOOLS, messages);
      const text = await deepSeekProvider.chatComplete(messages as any, undefined, toolDefs);

      const toolCall = extractToolCallFromText(text);
      if (toolCall) {
        console.info(`[LLM] DeepSeek: Tool call detected - ${toolCall.name}`);
        onProgress?.(`تنفيذ الأداة: ${toolCall.name}…`);
        return { name: toolCall.name, input: toolCall.input, reasoning: toolCall.reasoning };
      }

      if (text) {
        return { name: "echo", input: { text: text } };
      }
      return null;
    } catch (err: any) {
      console.error("[LLM] DeepSeek Provider Failed:", err.message);
      if (options?.throwOnError) throw err;
      onProgress?.("خطأ في DeepSeek، محاولة البديل الأقل…");
      return await planNextStep(messages, { ...options, provider: "auto" });
    }
  }

  // OpenRouter Provider
  if (providerKey.includes("openrouter")) {
    console.info("[LLM] Planning with OpenRouter Provider");
    onProgress?.("الاتصال بالمزوّد…");

    const lastMsg = messages[messages.length - 1];
    const role = lastMsg ? (lastMsg.role as string) : "";
    if (role === "tool" || role === "function") {
      console.info("[LLM] OpenRouter: Detected tool output, ending turn.");
      return null;
    }

    try {
      const msgs = [
        {
          role: "system",
          content: getSystemPrompt({ name: options?.userId || "Younis" }),
        },
        ...messages,
      ];
      const text = await openRouterProvider.chatComplete(
        msgs,
        options?.model || "google/gemma-2-9b-it:free",
      );
      return {
        name: "echo",
        input: { text: text || "Connected to OpenRouter!" },
      };
    } catch (err: any) {
      console.error("[LLM] OpenRouter Provider Failed:", err);
      throw new Error(
        "OPENROUTER_CONNECTION_FAILED: " + (err.message || String(err)),
      );
    }
  }

  // HuggingFace Provider
  if (providerKey === "huggingface" || providerKey === "hf") {
    console.info("[LLM] Planning with HuggingFace Provider");
    onProgress?.("الاتصال بالمزوّد…");

    const lastMsg = messages[messages.length - 1];
    const role = lastMsg ? (lastMsg.role as string) : "";
    if (role === "tool" || role === "function") {
      console.info("[LLM] HuggingFace: Tool output detected, ending turn.");
      return null;
    }

    try {
      const msgs = [
        { role: "system", content: getSystemPrompt({ name: "Younis" }) },
        ...messages,
      ];
      const text = await huggingfaceProvider.chatComplete(msgs as any);
      return {
        name: "echo",
        input: { text: text || "Response from HuggingFace" },
      };
    } catch (err: any) {
      console.error("[LLM] HuggingFace Provider Failed:", err);
      throw new Error(
        "HUGGINGFACE_CONNECTION_FAILED: " + (err.message || String(err)),
      );
    }
  }

  // Auto Mode - Enterprise Intelligence (Multi-Model Router + Context + Memory)
  if (providerKey.includes("auto")) {
    console.info("[LLM] 🚀 Auto Mode Enterprise - Full System Activated");
    onProgress?.("تشغيل طبقات الذكاء…");

    const lastMsg = messages[messages.length - 1];
    const role = (lastMsg?.role as string) || "";
    if (role === "tool" || role === "function" || role === "assistant") {
      // Check if assistant actually replied or if it's just a tool call/result marker
      const content =
        typeof lastMsg?.content === "string" ? lastMsg.content : "";
      const hasToolCalls = (lastMsg as any).tool_calls?.length > 0;
      const isToolMarker =
        content.includes("tool call:") ||
        content.includes("Tool Call:") ||
        content.includes("Tool '") ||
        content.includes("FAILED") ||
        content.includes("PROJECT_") ||
        content.includes("WF_START:") ||
        content.includes("ECOMMERCE_PLAN");

      // 1. There's actual content that's NOT a tool marker
      // 2. AND content has any length (> 1 char)
      // 3. AND there are no pending tool calls
      const isRealResponse =
        content.trim().length > 1 && !isToolMarker && !hasToolCalls;

      if (hasToolCalls && !content.trim()) {
        console.info(
          "[LLM] Auto Mode: Assistant waiting for tools, proceeding.",
        );
      } else if (isRealResponse) {
        console.info(
          "[LLM] Auto Mode: Last message was a real assistant response, ending turn.",
        );
        return null;
      } else {
        console.info(
          "[LLM] Auto Mode: Tool result marker detected, continuing planning.",
        );
      }
    }

    // Use options.userText (clean) if available, otherwise get it from messages history
    const userMsg = [...messages].reverse().find((m) => m.role === "user");
    let userText = options?.userText || "";
    if (!userText) {
      if (typeof userMsg?.content === "string") {
        userText = userMsg.content;
      } else if (Array.isArray(userMsg?.content)) {
        userText = userMsg.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");
      }
    }

    // Fallback for prompt instructions (bloated context)
    const fullPromptText = options?.fullPromptText || (typeof userMsg?.content === "string" ? userMsg.content : userText);

    // === ENTERPRISE SYSTEMS ACTIVATION ===
    // === ENTERPRISE SYSTEMS ACTIVATION ===

    // 1. Enterprise systems are now imported at top-level for global scope

    // 2. Build conversation context
    const userId = options?.userId || "anonymous";
    const sessionId = options?.sessionId || "session_" + Date.now();
    const context = buildConversationContext(
      userId,
      sessionId,
      messages as any[],
    );
    onProgress?.("تحديث ذاكرة المحادثة…");

    // 3. Learn from conversation (async, don't block)
    longTermMemory
      .learnFromConversation(userId, messages as any[])
      .catch(console.error);

    // 4. Analyze contextual intent
    const intent = analyzeContextualIntent(userText, context);
    console.info(
      `[Enterprise] Intent: ${intent.primary} (${(intent.confidence * 100).toFixed(0)}%)`,
    );
    onProgress?.("مطابقة الأنماط داخل السياق…");

    // 5. Check for context-aware patterns
    const contextMatch = matchPatternWithContext(userText, context);
    if (contextMatch.matched && contextMatch.confidence > 0.7) {
      console.info(
        `[Enterprise] Context Match: ${contextMatch.action} - executing directly`,
      );
      onProgress?.("اختيار أداة مباشرة…");
      return { name: contextMatch.action!, input: contextMatch.params };
    }

    // === FREE INTELLIGENCE OPTIMIZER ===
    console.info(
      `[Auto Enterprise] 💬 User query (clean): "${userText.substring(0, 100)}${userText.length > 100 ? "..." : ""}"`,
    );

    // 1. Check for instant smart response (no API call needed!)
    console.info(
      "[FREE OPTIMIZER] Checking for instant smart response patterns...",
    );
    const smartResponse = generateSmartResponse(userText, context);
    if (smartResponse) {
      console.info(
        "[FREE OPTIMIZER] ✅ 🚀 INSTANT SMART RESPONSE MATCHED! No API call needed!",
      );
      console.info(
        `[FREE OPTIMIZER] Response preview: "${smartResponse.substring(0, 80)}..."`,
      );
      onProgress?.("إنتاج رد فوري…");
      return { name: "echo", input: { text: smartResponse } };
    }
    console.info(
      "[FREE OPTIMIZER] ❌ No instant pattern match - proceeding with API call",
    );

    // 2. Optimize request for better performance & context
    const optimization = await freeIntelligenceOptimizer.optimizeRequest(
      userText,
      context,
    );
    if (optimization.shouldUseCache && optimization.cachedResponse) {
      console.info(
        "[FREE OPTIMIZER] ✅ 💾 CACHE HIT! Returning cached response",
      );
      onProgress?.("استرجاع إجابة مخزنة…");
      return { name: "echo", input: { text: optimization.cachedResponse } };
    }
    console.info(
      `[FREE OPTIMIZER] 🎯 Model selected: ${optimization.suggestedModel}`,
    );
    onProgress?.("اختيار أفضل مسار…");

    // Context from RAG to be injected into the LLM later if needed
    const ragContext = optimization.cachedResponse
      ? `\n\n## RELATED KNOWLEDGE (10-LAYER CONTEXT):\n${optimization.cachedResponse}`
      : "";

    // 6. Analyze the task (UPGRADED: uses LLM for deep analysis)
    // [OPTIMIZATION] Skip if already analyzed by optimizer
    let analysis = optimization.analysis;
    if (!analysis) {
      analysis = await advancedAnalyzeTask(userText, messages);
    }

    // Select best model (Use optimizer suggestion if available)
    let selectedModel =
      (optimization as any).suggestedModel === "fast"
        ? { name: "Llama 3.1 8B", model: "llama-3.1-8b-instant" }
        : analysis.complexity === "simple"
          ? { name: "Llama 3.1 8B", model: "llama-3.1-8b-instant" }
          : selectBestModel(analysis);

    // [TURBO] Override for fast mode if Groq is available
    if ((optimization as any).suggestedModel === "fast" && GROQ_AVAILABLE) {
      selectedModel = { name: "Groq Llama 3 8B", model: "llama3-8b-8192" };
    }

    console.info(
      `[Auto Enterprise] Task: ${analysis.type} | Complexity: ${analysis.complexity} | Model: ${selectedModel.name}`,
    );

    // 7. Multi-step planning (UPGRADED: generates a roadmap for complex tasks)
    // SPEED FIX: Only plan if complexity is EXTREME
    if (analysis.complexity === "extreme") {
      const planSteps = await generateActionPlan(userText, analysis);
      if (planSteps.length > 0) {
        console.info(
          `[Auto Enterprise] Generated ${planSteps.length} step plan:`,
          planSteps,
        );
      }
    }

    // Unified context injection point

    // === Pattern Detection ===

    // Browser patterns
    const browserPatterns = {
      open: /(open|افتح|ادخل|زور|اذهب|visit|go to|browse|شوف|طالع|ودني|وديني|خلني|بدي|ابغى|عايز)\s+(https?:\/\/|www\.|google|youtube|github|facebook|twitter|x\.com|instagram|tiktok|linkedin)/i,
      hasUrl: /https?:\/\/[^\s]+/i,
      multiStep:
        /(then|ثم|بعد|بعدها|وبعدين|click|انقر|اضغط|دوس|type|اكتب|املأ|extract|استخرج|لخص|انسخ)/i,
      analyze: /(analyze|تحليل|فحص|دراسة)\s+(https?:\/\/|www\.)/i,
    };

    // Search patterns (expanded for weather, news, current events, and people in power)
    const searchPatterns =
      /(ابحث|بحث|search|find|lookup|دور|فتش|شوف|طالع|لاقي|اطلع|ابغى|عايز|بدي|ماهي|ما\s*هي|ما\s*هو|من\s*هو|من\s*هي|رئيس|حاكم|ملك|وزير|من\s*هو\s*رئيس|الحالي|كيف\s*هو|كيف\s*احوال|احوال|درجة\s*حرارة|سعر|now|current|weather|طقس|جو|اخبار|news|price|stock|who\s*is|president|ruler|king|minister|latest|capital\s*of)\s+(عن|على|for|about|في|بـ|هو|هي)?/i;

    // File patterns (expanded)
    const filePatterns = {
      read: /(read|اقرأ|قراءة|شوف|طالع|اعرض|افتح)\s+(file|ملف|الملف)/i,
      write: /(write|اكتب|create|انشئ|سوي|اعمل|كون)\s+(file|ملف)/i,
      list: /(list|show|عرض|اعرض|شوف|طالع|ls)\s+(files|الملفات|ملفات)/i,
    };

    // Code generation patterns (expanded)
    const codePatterns =
      /(اكتب|كود|code|function|دالة|class|كلاس|component|كومبوننت|api|endpoint|script|سكريبت|program|برنامج|تطبيق|application|app|نظام|system|sوي|اعمل|ابني|انشئ|طور|build|create|develop|implement|نفذ)/i;

    try {
      // 1. Browser requests
      if (
        browserPatterns.open.test(userText) ||
        browserPatterns.hasUrl.test(userText)
      ) {
        const urlMatch = userText.match(/https?:\/\/[^\s]+/);
        const url = urlMatch
          ? urlMatch[0]
          : userText.match(/google/i)
            ? "https://www.google.com"
            : userText.match(/youtube/i)
              ? "https://www.youtube.com"
              : userText.match(/github/i)
                ? "https://github.com"
                : userText.match(/facebook/i)
                  ? "https://www.facebook.com"
                  : userText.match(/instagram/i)
                    ? "https://www.instagram.com"
                    : userText.match(/twitter|x\.com/i)
                      ? "https://x.com"
                      : "";

        if (url) {
          if (browserPatterns.analyze.test(userText)) {
            console.info("[Auto Enterprise] → Browser Analysis Task");
            return {
              name: "browser_run",
              input: {
                sessionId: `browser_${Date.now()}`,
                instructionText: `Visit this repository and perform a deep architectural analysis: ${url}`,
              },
            };
          }
          if (browserPatterns.multiStep.test(userText)) {
            console.info("[Auto Enterprise] → Browser Multi-Step Task");
            return {
              name: "browser_run",
              input: {
                sessionId: `browser_${Date.now()}`,
                instructionText: userText,
              },
            };
          } else {
            console.info("[Auto Enterprise] → Browser Open");
            return {
              name: "browser_open",
              input: {
                url,
                sessionId: `browser_${Date.now()}`,
              },
            };
          }
        }
      }

      // 2. Web search requests
      if (searchPatterns.test(userText)) {
        console.info("[Auto Enterprise] → Web Search");
        return {
          name: "web_search",
          input: { query: userText },
        };
      }

      // 3. File operations
      if (filePatterns.read.test(userText)) {
        const fileMatch = userText.match(
          /(read|اقرأ|قراءة|شوف|طالع|اعرض|افتح)\s+(file|ملف|الملف)\s+(.+)/i,
        );
        const filePath = fileMatch?.[3]?.trim() || ".";
        console.info("[Auto Enterprise] → Read File");
        return {
          name: "file_read",
          input: { filePath },
        };
      }

      if (filePatterns.list.test(userText) || /^ls$/i.test(userText.trim())) {
        console.info("[Auto Enterprise] → List Files");
        return {
          name: "ls",
          input: { path: "." },
        };
      }

      // Simple build requests (any app/calculator/game/tool request)
      const simpleBuildPatterns =
        /(build|create|make|ابني|انشئ|أنشئ|سوي|اعمل)\s+(.{0,20})?(calculator|game|todo|app|tool|store|shop|حاسبة|لعبة|مهام|تطبيق|أداة|متجر|دكان)/i;

      // Large-scale build patterns (enterprise systems)
      const largeBuildPatterns =
        /(build|create|develop|implement|ship|launch|ابني|انشئ|أنشئ|طور|نفذ|ابغى|عايز|بدي)\s+(.{0,40})?(system|platform|application|backend|api|service|microservice|dashboard|portal|saas|نظام|منصة|خدمة|ميكروسيرفس)/i;
      const explicitLargeScale =
        /(enterprise|large[\s-]?scale|microservices|multi[\s-]?tenant|kubernetes|docker|terraform|ci\/cd|scalable|ضخم|ضخمة|واسع|واسعة|مؤسسي)/i;

      const isBuildingWebsite =
        /(صفحة|موقع|هبوط|landing|page|website|builder|متجر|دكان|store|shop)/i.test(userText);


      const parseWebsitePipelineInput = () => {
        const text = String(userText || "");
        const lower = text.toLowerCase();
        const nameMatch =
          text.match(/(?:named|called)\s+([a-z0-9_-]{2,})/i) ||
          text.match(/(?:اسم|اسمه|سميه|سَمِّه|سمه)\s+([a-z0-9_-]{2,})/i);
        const name = String(nameMatch?.[1] || "").trim() || "mega-web";

        const isEcom =
          /(ecommerce|e-commerce|shop|store|checkout|cart|stripe|paypal|payments?|سلة|دفع|متجر|تجارة\s*الكترونية)/i.test(
            text,
          );
        const isBlog = /(blog|مدونة|مقال|مقالات|اخبار|أخبار)/i.test(text);
        const type = isEcom ? "ecommerce" : isBlog ? "blog" : "saas";

        const features = Array.from(
          new Set(
            [
              /(auth|login|signup|oauth|jwt|مصادقة|تسجيل\s*الدخول|حسابات)/i.test(
                text,
              )
                ? "auth"
                : null,
              /(admin|dashboard|cms|لوحة|لوحه|تحكم|ادارة|إدارة)/i.test(text)
                ? "admin"
                : null,
              /(payment|checkout|stripe|paypal|دفع|بوابة\s*دفع)/i.test(text)
                ? "payments"
                : null,
              /(search|filter|فلاتر|بحث)/i.test(text) ? "search" : null,
              /(seo|سيو|meta|structured\s*data)/i.test(text) ? "seo" : null,
              /(i18n|multilingual|arabic|english|عربي|انجليزي|ثنائي)/i.test(
                text,
              )
                ? "i18n"
                : null,
            ].filter(Boolean) as string[],
          ),
        );

        const aestheticMode = /(glass|زجاج)/i.test(text)
          ? "glass"
          : /(neon|نيون)/i.test(text)
            ? "neon"
            : /(minimal|مينيمال|بسيط)/i.test(text)
              ? "minimal"
              : /(corporate|رسمي|شركات)/i.test(text)
                ? "corporate"
                : undefined;

        const language =
          analysis?.language === "ar"
            ? "ar"
            : analysis?.language === "mixed"
              ? "dual"
              : "en";

        const qualityTasks = ["lint", "typecheck", "test", "build"];
        return {
          name,
          type,
          features,
          qualityTasks,
          securityChecks: true,
          autoFix: true,
          aestheticMode,
          language,
        };
      };

      // [FIX] Simple build requests → Use standard Orchestrator
      if (!isBuildingWebsite && simpleBuildPatterns.test(userText)) {
        console.info(
          "[Auto Enterprise] → Simple Build Detected: Routing to Agent Orchestrator",
        );
        return {
          name: "website_full_pipeline",
          input: { name: "mega-web", type: "saas", features: [], qualityTasks: ["lint", "typecheck", "test", "build"], securityChecks: true, autoFix: true, language: analysis?.language === "ar" ? "ar" : "en" },
        };
      }

      // Large-scale builds → Agent Orchestrator
      if (
        !isBuildingWebsite &&
        (analysis.type === "code_generation" || codePatterns.test(userText)) &&
        (analysis.complexity === "extreme" ||
          explicitLargeScale.test(userText) ||
          largeBuildPatterns.test(userText))
      ) {
        console.info("[Auto Enterprise] → Large Build Detected: Routing to Agent Orchestrator");
        return {
          name: "website_full_pipeline",
          input: { name: "mega-web", type: "saas", features: ["auth", "admin", "payments"], qualityTasks: ["lint", "typecheck", "test", "build"], securityChecks: true, autoFix: true, language: analysis?.language === "ar" ? "ar" : "en" },
        };
      }

      // 4. Code generation (let the intelligent model handle it via echo)
      if (codePatterns.test(userText) && analysis.type === "code_generation") {
        if (isBuildingWebsite) {
          if (
            analysis.complexity === "extreme" ||
            explicitLargeScale.test(userText) ||
            largeBuildPatterns.test(userText)
          ) {
            console.info(
              "[Auto Enterprise] → Large Website Build Detected: Routing to Agent Orchestrator",
            );
            return {
              name: "website_full_pipeline",
              input: parseWebsitePipelineInput(),
            };
          }
          console.info(
            "[Auto Enterprise] → Detected Website Build Request - using Pipeline",
          );
          return {
            name: "website_full_pipeline",
            input: parseWebsitePipelineInput(),
          };
        }

        console.info(
          "[Auto Enterprise] → Code Generation via Intelligent Model",
        );
        const msgs = [
          {
            role: "system",
            content:
              "You are an expert software engineer. Generate clean, production-ready code with best practices.",
          },
          ...messages,
        ];
        const codeResponse = await routeToModel(
          msgs,
          analysis,
          undefined,
          options?.onThought,
        );
        return {
          name: "echo",
          input: { text: codeResponse },
        };
      }

      // 5. General chat/questions - Use intelligent router with full persona
      console.info(
        `[Auto Enterprise] → Intelligent Chat via ${selectedModel.name}`,
      );

      // [TOOL AWARENESS] Build condensed tool catalog for LLM visibility
      const toolCatalog = tools.map(t => `- **${t.name}**: ${t.description}`).join('\n');
      const toolAwarenessBlock = `\n\n## Available Tools (${tools.length}+)\nIf the user's request requires executing a tool, respond ONLY with JSON: {"name":"<tool_name>","input":{<params>}}\n\n### Strategic Guidance for Agents:\n1. **Discovery Turn**: If you don't know the project structure, start with \`project_detect\`. \n2. **Analysis Turn**: If you already see the structure in history, DO NOT repeat \`project_detect\`. Instead, use \`analyze_codebase\` or \`file_read\` on key files (e.g., package.json, src/index.ts) to understand logic.\n3. **Avoid Loops**: Do not call the same tool with the same inputs multiple times without a clearly different purpose.\n\n${toolCatalog}`;

      const msgs = [
        {
          role: "system",
          content:
            getSystemPrompt({ name: options?.userId || "User" }) + ragContext + toolAwarenessBlock,
        },
        ...messages,
      ];

      let response: string | null = null;

      // [TURBO] Groq Direct Path
      if (selectedModel.name.includes("Groq") && GROQ_AVAILABLE) {
        try {
          const cacheDisabled =
            String(process.env.LLM_CACHE_DISABLE || "").trim() === "1";
          const cacheKeyPayload = JSON.stringify({
            messages: msgs,
            analysis,
            selectedModel: selectedModel.model,
            route: "groq_direct",
          });
          const cacheText = msgs
            .map((m) =>
              typeof (m as any)?.content === "string"
                ? (m as any).content
                : JSON.stringify((m as any)?.content || ""),
            )
            .join("\n");
          const hasSensitive =
            /(sk-[a-z0-9]{10,}|api[_-]?key|authorization:\s*bearer|-----begin\s+[a-z ]+-----)/i.test(
              cacheText,
            );

          if (!cacheDisabled && !hasSensitive) {
            const cached = await LLMCacheTool.checkCache(
              cacheKeyPayload,
              selectedModel.model,
            );
            if (cached) response = cached;
          }

          if (!response) {
            response = await groq.chatComplete(msgs, selectedModel.model);
            if (
              !cacheDisabled &&
              !hasSensitive &&
              response &&
              response.length > 20
            ) {
              await LLMCacheTool.saveToCache(
                cacheKeyPayload,
                response,
                selectedModel.model,
              );
            }
          }
        } catch (e) {
          console.error("[Groq] Failed, falling back to router:", e);
        }
      }

      if (!response) {
        response = await routeToModel(
          msgs,
          analysis,
          undefined,
          options?.onThought,
        );
      }

      console.info(
        `[Auto Enterprise] ✅ Got response from intelligent router (${response?.length || 0} chars)`,
      );

      // Cache good responses for future use
      if (response && response.length > 20) {
        freeIntelligenceOptimizer.train(userText, response);
        console.info("[FREE OPTIMIZER] ✅ Response cached for future use");
      }

      // [Wakil 6.0] Upgraded Robust JSON/Tool Parsing Logic
      const toolCall = extractToolCallFromText(response || "");
      if (toolCall) {
        console.info(
          `[Auto Enterprise] 🛠️ Extracted Tool Call: ${toolCall.name}`,
        );
        return {
          name: toolCall.name,
          input: toolCall.input,
          reasoning: toolCall.reasoning,
        };
      }

      // Check for raw JSON fallback (historical compat)
      try {
        const cleanJson = (response || "")
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "")
          .trim();
        const json = JSON.parse(cleanJson);

        if (json.name && json.input) {
          return {
            name: json.name,
            input: json.input,
            reasoning: (json as any).reasoning,
          };
        }
      } catch (e) { }

      console.info("[Auto Enterprise] No tool call detected, echoing text.");

      const lastMsgContent = messages[messages.length - 1]?.content;
      const lastMsgText =
        typeof lastMsgContent === "string"
          ? lastMsgContent
          : Array.isArray(lastMsgContent)
            ? (lastMsgContent as any[]).map((c) => c.text).join(" ")
            : "";
      const isArabic = /[\u0600-\u06FF]/.test(lastMsgText || "");
      return {
        name: "echo",
        input: {
          text:
            response ||
            (isArabic
              ? "أنا جاهز لمساعدتك. كيف يمكنني تفعيل قدراتي البرمجية لك الآن؟ (Engineering Atlas active)"
              : "Engineering Atlas active. Ready for your instructions."),
        },
      };
    } catch (err: any) {
      if (deepSeekProvider.isAvailable()) {
        try {
          const toolCatalog = tools.map((t) => `- **${t.name}**: ${t.description}`).join("\n");
          const toolAwarenessBlock = `\n\n## Available Tools (${tools.length}+)\nIf the user's request requires executing a tool, respond ONLY with JSON: {"name":"<tool_name>","input":{<params>}}\n\n### Strategic Guidance for Agents:\n1. **Discovery Turn**: If you don't know the project structure, start with \`project_detect\`. \n2. **Analysis Turn**: If you already see the structure in history, DO NOT repeat \`project_detect\`. Instead, use \`analyze_codebase\` or \`file_read\` on key files (e.g., package.json, src/index.ts) to understand logic.\n3. **Avoid Loops**: Do not call the same tool with the same inputs multiple times without a clearly different purpose.\n\n${toolCatalog}`;

          const msgs = [
            {
              role: "system",
              content: getSystemPrompt({ name: "Younis" }) + toolAwarenessBlock,
            },
            ...messages,
          ];

          const text = await (deepSeekProvider as any).chatComplete(msgs);
          if (text) {
            return {
              name: "echo",
              input: { text: text || "Response from Joe (DeepSeek Fallback)" },
            };
          }
        } catch (dsErr) {
          console.error("[LLM] DeepSeek fallback failed, falling back to simple chat:", dsErr);
        }
      }

      console.error("[Auto Enterprise] Failed:", err);
      // Fallback to simple chat
      try {
        const msgs = [
          { role: "system", content: getSystemPrompt({ name: "Younis" }) },
          ...messages,
        ];
        const text = await pollinationsProvider.chatComplete(msgs, "openai");
        return {
          name: "echo",
          input: { text: text || "Response from Joe (Free)" },
        };
      } catch {
        throw new Error("AUTO_MODE_FAILED: " + (err.message || String(err)));
      }
    }
  }

  if (!shouldMock) {
    if (providerKey === "llm") throw new Error("PROVIDER_LLM_DISABLED");
    if (!optKey) {
      return await planNextStep(messages, { ...options, provider: "auto" });
    }
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
    console.info("[LLM] Using Mock Planner");
    const lastMsg = messages[messages.length - 1];
    const lastUserMsg =
      [...messages].reverse().find((m) => m.role === "user") || lastMsg;
    const rawText =
      typeof lastUserMsg.content === "string"
        ? lastUserMsg.content
        : JSON.stringify(lastUserMsg.content || "");
    const content = rawText.toLowerCase();

    // Check history for actions
    const historyTextRaw = messages
      .map((m) =>
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content || ""),
      )
      .join("\n");
    const historyStr = historyTextRaw.toLowerCase();
    const extractLatestToolOutput = (toolName: string) => {
      const marker = `tool call: ${toolName}`.toLowerCase();
      const idx = historyStr.lastIndexOf(marker);
      if (idx < 0) return null;
      const tail = historyTextRaw.slice(idx);
      const m = tail.match(/Output:\s*(.+)/i);
      const raw = String(m?.[1] || "").trim();
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    };

    const wantsWeather =
      /(?:\bweather\b|forecast|temperature|الطقس|حالة\s+الطقس|درجة\s+الحرارة|حراره|الحرارة|الجو|الأجواء|الاجواء)/i.test(
        rawText,
      );
    const wantsNow = /(?:\bnow\b|\bcurrent\b|الآن|الان|حاليا|حالياً)/i.test(
      rawText,
    );
    const wantsToday = /(?:\btoday\b|اليوم)/i.test(rawText);
    const isArabicInput = /[\u0600-\u06FF]/.test(rawText);
    const hasWebSearch =
      historyStr.includes("tool call: web_search") ||
      historyStr.includes(`tool 'web_search' executed`) ||
      historyStr.includes('"name":"web_search"');

    if (wantsWeather) {
      const city = /(?:istanbul|إسطنبول|اسطنبول)/i.test(rawText)
        ? "Istanbul"
        : (() => {
          const m =
            rawText.match(
              /(?:in|في)\s+([a-zA-Z\u0600-\u06FF][a-zA-Z\u0600-\u06FF\s-]{1,40})/i,
            ) ||
            rawText.match(
              /([a-zA-Z\u0600-\u06FF][a-zA-Z\u0600-\u06FF\s-]{1,40})\s+(?:weather|الطقس|حالة\s+الطقس)/i,
            );
          return String(m?.[1] || "Istanbul").trim();
        })();

      if (!hasWebSearch) {
        const cityQuery = /istanbul/i.test(city)
          ? isArabicInput
            ? "إسطنبول"
            : "Istanbul"
          : city;
        const q = isArabicInput
          ? `${wantsNow ? "درجة الحرارة الآن" : "حالة الطقس اليوم"} في ${cityQuery}`
          : `${wantsNow ? "current temperature" : "current weather"} ${cityQuery} ${wantsNow ? "now" : wantsToday ? "today" : "today"}`;
        return { name: "web_search", input: { query: q } };
      }

      const out: any = extractLatestToolOutput("web_search");
      const results = Array.isArray(out?.results) ? out.results : [];
      const top = results[0];
      if (top?.description && top?.url) {
        const desc = String(top.description)
          .replace(/^\s*\*\*ANSWER\*\*:\s*/i, "")
          .trim();
        return {
          name: "echo",
          input: {
            text: `${wantsNow ? "درجة الحرارة الآن" : "حالة الطقس اليوم"} في ${/istanbul/i.test(city) ? "إسطنبول" : city} بحسب ${String(top.title || "المصدر")}:\n${desc}\nالمصدر: ${String(top.url)}`,
          },
        };
      }
      if (top?.url) {
        return {
          name: "echo",
          input: {
            text: `لم أستطع استخراج تفاصيل دقيقة من النتائج، لكن هذه أفضل نتيجة متاحة الآن:\n${String(top.title || "")}\n${String(top.url)}`,
          },
        };
      }
      return {
        name: "echo",
        input: { text: "تعذّر الحصول على نتائج طقس حالياً." },
      };
    }
    const hasOpened =
      historyStr.includes("tool call: browser_open") ||
      historyStr.includes(`tool 'browser_open' executed`) ||
      historyStr.includes("tool call: browser_run") ||
      historyStr.includes(`tool 'browser_run' executed`) ||
      historyStr.includes('"name":"browser_open"') ||
      historyStr.includes('"name":"browser_run"');
    const hasClicked =
      (historyStr.includes("tool call: browser_run") ||
        historyStr.includes(`tool 'browser_run' executed`) ||
        historyStr.includes('"name":"browser_run"')) &&
      historyStr.includes("click");
    const hasAnalyzed =
      historyStr.includes("tool call: browser_get_state") ||
      historyStr.includes(`tool 'browser_get_state' executed`) ||
      historyStr.includes('"name":"browser_get_state"');
    const sessionIdMatch =
      historyTextRaw.match(/"sessionId"\s*:\s*"([^"]+)"/) ||
      historyTextRaw.match(/\bsessionId\b\s*[:=]\s*["']([^"']+)["']/i);
    const sessionId = sessionIdMatch?.[1];

    const extractUrlCandidate = (s: string) => {
      const http = s.match(/https?:\/\/[^\s"'<>`]+/i)?.[0];
      if (http) return http.replace(/[)\]`.,;:!?،؛؟]+$/g, "");
      const m = s.match(
        /(?:^|\s)(?:url\s*[:=]\s*)?((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?)/i,
      );
      const candidate = (m?.[1] || "").replace(/[)\]`.,;:!?،؛؟]+$/g, "").trim();
      if (!candidate) return undefined;
      const isLocal =
        /^localhost(?::\d+)?(?:\/|$)/i.test(candidate) ||
        /^127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(candidate) ||
        /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(candidate);
      return `${isLocal ? "http" : "https"}://${candidate.replace(/^\/\//, "")}`;
    };
    let url = extractUrlCandidate(rawText);

    const extractQuoted = (s: string) => {
      const m = s.match(/["“”'`]\s*([^"“”'`]+?)\s*["“”'`]/);
      return m?.[1];
    };

    const writeEn =
      rawText.match(
        /write\s+(?:a\s+)?file\s+(?:named|called)\s+([^\s"'`]+)(?:\s+with\s+content\s+(.+))?/i,
      ) ||
      rawText.match(
        /create\s+(?:a\s+)?file\s+(?:named|called)\s+([^\s"'`]+)(?:\s+with\s+content\s+(.+))?/i,
      );
    const writeAr = rawText.match(
      /(?:اكتب|انشئ|أنشئ|سوي|سوِّ|قم\s+بإنشاء)\s+(?:ملف|فايل)\s*(?:باسم|اسم)\s+([^\s"'`]+)(?:\s+(?:بمحتوى|محتوى)\s+(.+))?/i,
    );
    const write = writeEn || writeAr;
    if (write) {
      const filename = String(write[1] || "verify.txt").trim();
      const tail = String(write[2] || "").trim();
      const quoted = tail ? extractQuoted(tail) : undefined;
      const contentValue = String(quoted || tail || "verified");
      return { name: "file_write", input: { filename, content: contentValue } };
    }

    const readEn = rawText.match(/read\s+(?:the\s+)?file\s+([^\s"'`]+)/i);
    const readAr = rawText.match(
      /(?:اقرأ|اقراء|اعرض|افتح)\s+(?:ملف|فايل)\s+([^\s"'`]+)/i,
    );
    const read = readEn || readAr;
    if (read) {
      const filename = String(read[1] || "").trim();
      if (filename) return { name: "file_read", input: { filename } };
    }

    const saveAs =
      rawText.match(
        /save\s+(?:it\s+)?as\s+["“”'`]\s*([^"“”'`]+?)\s*["“”'`]/i,
      ) ||
      rawText.match(
        /(?:احفظ|حفظ|قم\s+بحفظ)(?:ه|ها|هذا)?\s*(?:باسم|اسم)\s*["“”'`]\s*([^"“”'`]+?)\s*["“”'`]/i,
      );
    if (saveAs) {
      const filename = String(saveAs[1] || "").trim();
      if (filename) {
        const wantsHtml =
          /\.html?$/i.test(filename) ||
          /single-file\s+html|landing\s+page|<html/i.test(rawText);
        const artifactDir = process.env.ARTIFACT_DIR || "/tmp/joe-artifacts";
        const full = path.isAbsolute(filename)
          ? filename
          : path.join(artifactDir, filename);
        if (wantsHtml) {
          const html = [
            "<!doctype html>",
            '<html lang="en">',
            "<head>",
            '  <meta charset="utf-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
            "  <title>Xelite Coffee</title>",
            "  <style>",
            "    :root {",
            "      --bg: #0b0e14;",
            "      --panel: #121827;",
            "      --text: #e6e9ef;",
            "      --muted: #aab3c5;",
            "      --accent: #7c5cff;",
            "      --accent2: #20c997;",
            "      --border: rgba(255,255,255,0.10);",
            "      --shadow: 0 20px 60px rgba(0,0,0,0.45);",
            "    }",
            "    * { box-sizing: border-box; }",
            "    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, Noto Sans, sans-serif; background: radial-gradient(1000px 600px at 20% -10%, rgba(124,92,255,0.35), transparent 60%), radial-gradient(900px 600px at 100% 0%, rgba(32,201,151,0.18), transparent 55%), var(--bg); color: var(--text); }",
            "    a { color: inherit; }",
            "    .container { max-width: 1100px; margin: 0 auto; padding: 28px 18px 56px; }",
            "    .nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; border: 1px solid var(--border); background: rgba(18,24,39,0.6); backdrop-filter: blur(10px); border-radius: 16px; }",
            "    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: 0.2px; }",
            "    .dot { width: 10px; height: 10px; border-radius: 999px; background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 0 0 6px rgba(124,92,255,0.12); }",
            "    .nav a { text-decoration: none; padding: 10px 12px; border-radius: 12px; color: var(--muted); }",
            "    .nav a:hover { background: rgba(255,255,255,0.06); color: var(--text); }",
            "    .hero { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 18px; margin-top: 18px; }",
            "    @media (max-width: 860px) { .hero { grid-template-columns: 1fr; } }",
            "    .card { border: 1px solid var(--border); background: rgba(18,24,39,0.62); border-radius: 22px; padding: 26px; box-shadow: var(--shadow); }",
            "    .kicker { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); font-size: 13px; }",
            "    h1 { margin: 14px 0 8px; font-size: clamp(34px, 4.3vw, 54px); line-height: 1.06; letter-spacing: -0.6px; }",
            "    .subtitle { margin: 0; color: var(--muted); font-size: 16px; line-height: 1.6; max-width: 62ch; }",
            "    .cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }",
            "    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: rgba(255,255,255,0.05); color: var(--text); text-decoration: none; font-weight: 600; }",
            "    .btn.primary { background: linear-gradient(135deg, rgba(124,92,255,0.95), rgba(32,201,151,0.75)); border-color: rgba(255,255,255,0.14); }",
            "    .btn:hover { filter: brightness(1.05); }",
            "    .panel { display: grid; gap: 12px; }",
            "    .stat { border: 1px solid var(--border); background: rgba(11,14,20,0.35); border-radius: 18px; padding: 14px; }",
            "    .stat b { display: block; font-size: 14px; }",
            "    .stat span { color: var(--muted); font-size: 13px; }",
            "    .features { margin-top: 18px; }",
            "    .features h2 { margin: 0 0 10px; font-size: 20px; }",
            "    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }",
            "    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }",
            "    .feature { border: 1px solid var(--border); background: rgba(11,14,20,0.32); border-radius: 18px; padding: 16px; }",
            "    .feature h3 { margin: 0 0 6px; font-size: 15px; }",
            "    .feature p { margin: 0; color: var(--muted); font-size: 13.5px; line-height: 1.55; }",
            "    footer { margin-top: 18px; color: var(--muted); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }",
            '    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; }',
            "  </style>",
            "</head>",
            "<body>",
            '  <div class="container">',
            '    <div class="nav">',
            '      <div class="brand"><span class="dot"></span><span>Xelite Coffee</span></div>',
            '      <div style="display:flex; gap:6px; flex-wrap:wrap;">',
            '        <a href="#features">Features</a>',
            '        <a href="#menu">Menu</a>',
            '        <a href="#visit">Visit</a>',
            "      </div>",
            "    </div>",
            "",
            '    <section class="hero">',
            '      <div class="card">',
            '        <div class="kicker"><span class="mono">☕</span><span>Dark roast. Bright ideas.</span></div>',
            "        <h1>Code &amp; Caffeine</h1>",
            '        <p class="subtitle">A modern coffee experience designed for builders. Rich espresso, calm ambience, fast Wi‑Fi, and a space that respects focus.</p>',
            '        <div class="cta">',
            '          <a class="btn primary" href="#visit">Get your first cup</a>',
            '          <a class="btn" href="#features">Explore features</a>',
            "        </div>",
            "      </div>",
            '      <div class="card panel">',
            '        <div class="stat"><b>Signature</b><span>Espresso + oat + cocoa, perfectly balanced.</span></div>',
            '        <div class="stat"><b>Speed</b><span>Order ahead and pick up in under 2 minutes.</span></div>',
            '        <div class="stat"><b>Vibe</b><span>Low-noise seating, warm lighting, and power at every table.</span></div>',
            "      </div>",
            "    </section>",
            "",
            '    <section id="features" class="features card">',
            "      <h2>Features</h2>",
            '      <div class="grid">',
            '        <div class="feature"><h3>Developer-Friendly</h3><p>Comfortable seating, outlets everywhere, and a layout built for deep work.</p></div>',
            '        <div class="feature"><h3>Quality Beans</h3><p>Small-batch roasts with consistent flavor—every cup is crafted, not rushed.</p></div>',
            '        <div class="feature"><h3>Fast Service</h3><p>Clean, efficient workflows so you get coffee quickly and keep momentum.</p></div>',
            "      </div>",
            "    </section>",
            "",
            '    <footer class="card" id="visit">',
            '      <div>© <span id="y"></span> Xelite Coffee. All rights reserved.</div>',
            '      <div class="mono">Open daily • 7:00–22:00 • Downtown</div>',
            "    </footer>",
            "  </div>",
            '  <script>document.getElementById(\"y\").textContent=String(new Date().getFullYear());</script>',
            "</body>",
            "</html>",
            "",
          ].join("\\n");
          return {
            name: "file_write",
            input: { filename: full, content: html },
          };
        }
      }
    }

    const wantsLs =
      /(?:list|show)\s+files/i.test(rawText) ||
      /(?:ls\b)/i.test(rawText) ||
      /(?:اعرض|اظهر|أظهر)\s+(?:ال)?ملفات/i.test(rawText) ||
      /قائمة\s+الملفات/i.test(rawText);
    if (wantsLs) return { name: "ls", input: { path: "." } };
    const wantsOpen =
      /\bopen\b/i.test(rawText) ||
      /افتح|افتحي|افتحوا|ادخل|اذهب|روح|زور|وديني|ودني|ودنا|خلني|خليني|بدي|عايز|عاوز|ابي|ابغى|افتح المتصفح|افتح الموقع|واجهة الوكيل/i.test(
        rawText,
      );

    const wantsYouTube =
      /youtube|يوتيوب/i.test(rawText) || historyStr.includes("youtube.com");
    const wantsSearch =
      /ابحث|بحث|search/i.test(rawText) ||
      /ضيعة\s+ضايعة/i.test(rawText) ||
      /شغل|شغّل|تشغيل|play/i.test(rawText);

    if (wantsYouTube && wantsSearch) {
      const qMatch =
        rawText.match(
          /ابحث(?:\s+عن)?\s+(.+?)(?:\s+(?:وشغل|وشغّل|وشغل|شغل|تشغيل)|$)/i,
        ) || rawText.match(/search\s+for\s+(.+?)(?:\s+and\s+play|$)/i);
      const query = String(qMatch?.[1] || "ضيعة ضايعة").trim() || "ضيعة ضايعة";
      return {
        name: "echo",
        input: {
          text: `ميزة التصفح القديمة أزيلت. سأحتاج تشغيل نظام المتصفح الجديد لتنفيذ: ${query}`,
        },
      };
    }

    if (wantsOpen) {
      const explicitBrowser = /(\b(browser|web)\b|متصفح)/i.test(rawText);
      const githubKeyword = /(github|جيتهاب|كتهاب|كيتهاب)/i.test(rawText);
      const analysisKeyword =
        /(كود|code|repo|repository|مستودع|ملفات|files|اختبر|تحقق|راجع|audit|lint|build|typecheck|تحليل)/i.test(
          rawText,
        );
      if (githubKeyword && analysisKeyword && !explicitBrowser && !url) {
        return {
          name: "echo",
          input: { text: "سأقوم بتحليل الكود محلياً دون فتح المتصفح." },
        };
      }
      if (!url) {
        if (/youtube|يوتيوب/i.test(rawText)) url = "https://www.youtube.com";
      }

      return {
        name: "echo",
        input: {
          text: "ميزة التصفح القديمة أزيلت. استخدم واجهة المتصفح الجديدة لتنفيذ خطوات داخل موقع.",
        },
      };
    }

    // Simple Heuristics for the GitHub Test
    if (
      historyStr.includes("github.com") &&
      historyStr.includes("open") &&
      !historyStr.includes("package.json")
    ) {
      return {
        name: "echo",
        input: { text: "سأحلل ملفات المشروع محلياً بدون استخدام المتصفح." },
      };
    }
    if (historyStr.includes("package.json")) {
      return {
        name: "echo",
        input: { text: "سأقرأ package.json من ملفات المشروع مباشرة." },
      };
    }

    // Yahoo flow (Mock)
    if (content.includes("yahoo") || historyStr.includes("yahoo")) {
      const hasYahooExtract =
        (historyStr.includes("tool call: html_extract") ||
          historyStr.includes(`tool 'html_extract' executed`) ||
          historyStr.includes('"name":"html_extract"')) &&
        historyStr.includes("yahoo.com");
      if (!hasYahooExtract) {
        return {
          name: "html_extract",
          input: { url: "https://www.yahoo.com" },
        };
      }
      return {
        name: "echo",
        input: { text: "Yahoo analyzed." },
      };
    }

    // Default fallback
    return {
      name: "echo",
      input: { text: "I'm running in MOCK mode. I saw: " + content },
    };
  }

  // 1. Prepare tools for OpenAI
  const activeTools = tools.filter((t) => !t.name.startsWith("noop_"));
  const selectedToolDefs = selectToolDefsForProvider(
    activeTools,
    MAX_PROVIDER_TOOLS,
    messages,
  );
  const aiTools: OpenAI.Chat.Completions.ChatCompletionTool[] =
    selectedToolDefs.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description:
          t.description ||
          `Tool: ${t.name}. Tags: ${(Array.isArray((t as any).tags) ? (t as any).tags : []).join(", ")}`,
        parameters: (() => {
          if (t.name === "browser_run") {
            console.log(
              "DEBUG_SCHEMA: browser_run schema:",
              JSON.stringify(t.inputSchema, null, 2),
            );
          }
          return t.inputSchema as any;
        })(),
      },
    }));

  // 2. Add a system prompt if not present
  let msgs = [
    {
      role: "system",
      content: getSystemPrompt(),
    },
    ...messages,
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
    if (m.role === "tool" || m.role === ("function" as any)) {
      toolOutputIndices.push(idx);
    }
  });

  // Keep the last 3 tool outputs intact, truncate older ones
  const KEEP_TOOL_OUTPUTS = 3;
  if (toolOutputIndices.length > KEEP_TOOL_OUTPUTS) {
    const indicesToTruncate = toolOutputIndices.slice(
      0,
      toolOutputIndices.length - KEEP_TOOL_OUTPUTS,
    );
    const truncateSet = new Set(indicesToTruncate);

    msgs = msgs.map((m, idx) => {
      if (truncateSet.has(idx)) {
        return {
          ...m,
          content: "(Tool output suppressed to save context)",
        };
      }
      return m;
    });
  }

  let currentChars = msgs.reduce(
    (acc, m) =>
      acc +
      (typeof m.content === "string"
        ? m.content.length
        : JSON.stringify(m.content || "").length),
    0,
  );

  if (currentChars > CHAR_LIMIT) {
    console.warn(
      `[LLM] Context too large (${currentChars} chars). Truncating history...`,
    );

    // Strategy 1: Truncate very long individual messages (likely tool outputs)
    msgs = msgs.map((m) => {
      if (m.role === "system") return m; // Keep system prompt intact

      let content =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      const MAX_MSG_LEN = 60000;
      if (content.length > MAX_MSG_LEN) {
        // Keep start and end to preserve some context
        content =
          content.slice(0, 25000) +
          `\n\n...[Content Truncated (${content.length - MAX_MSG_LEN} chars removed) to save tokens]...\n\n` +
          content.slice(-25000);
      }
      return { ...m, content };
    });

    // Recalculate
    currentChars = msgs.reduce(
      (acc, m) =>
        acc +
        (typeof m.content === "string"
          ? m.content.length
          : JSON.stringify(m.content || "").length),
      0,
    );

    // Strategy 2: If still too large, remove middle messages (sliding window)
    if (currentChars > CHAR_LIMIT) {
      const keepCount = 6; // Keep first system + last 5 messages
      if (msgs.length > keepCount) {
        const removedCount = msgs.length - keepCount;
        const system = msgs[0];
        const recent = msgs.slice(-5);
        msgs = [
          system,
          {
            role: "system",
            content: `(System Note: ${removedCount} previous messages were removed from context to fit within token limits.)`,
          },
          ...recent,
        ];
      }
    }
  }

  try {
    const completion = await client.chat.completions.create({
      model: options?.model || process.env.OPENAI_MODEL || "gpt-4o",
      messages: msgs,
      tools: aiTools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    const toolCall = choice.message.tool_calls?.[0];

    if (toolCall && toolCall.type === "function") {
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch (e: any) {
        return {
          name: "echo",
          input: {
            text: `Tool arguments parse failed for ${toolCall.function.name}.`,
          },
        };
      }
      return {
        name: toolCall.function.name,
        input: parsedArgs,
      };
    }

    // If no tool called, fallback to echo with the content
    return {
      name: "echo",
      input: { text: choice.message.content || "I'm not sure what to do." },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("LLM Error:", msg);
    if (options?.throwOnError) {
      throw error;
    }
    return null;
  }
}

export async function generateSessionTitle(
  messages: { role: string; content: string }[],
) {
  if (!messages || messages.length === 0) return "New Session";

  // [Offline Mode] Deterministic title generation for verification
  if (process.env.OFFLINE_MODE === 'true') {
    const firstUserMsg = messages.find(m => m.role === 'user')?.content || '';
    const isArabic = /[\u0600-\u06FF]/.test(firstUserMsg);
    // Take first 3-5 words
    const words = firstUserMsg.split(/\s+/).slice(0, 5).join(' ');
    console.log('[LLM] Offline Mode: Generated title:', words);
    return words || (isArabic ? "جلسة جديدة" : "New Session");
  }
  const blob = messages.map((m) => String(m.content || "")).join(" ");
  const hasArabic = /[\u0600-\u06FF]/.test(blob);

  const systemContent = hasArabic
    ? "أنت محرك الذكاء XElite. مهمتك هي إنشاء عنوان 'نخبوي' واحترافي ومختصر جداً (3-5 كلمات) لهذه الجلسة بناءً على سياق الحوار. استخدم العربية الفصحى الأنيقة. يجب أن يكون العنوان وصفياً بدقة لموضوع النقاش. تجنب تماماً كلمات مثل 'جلسة'، 'دردشة'، 'سؤال'، 'مساعدة'. ركز على الجوهر التقني أو الموضوعي."
    : "You are the XElite Intelligence Engine. Generate an elite, professional, and extremely concise title (3-5 words) for this session based on the context. Use English only. The title must strictly describe the technical or thematic core of the discussion. ABSOLUTELY AVOID words like 'Session', 'Chat', 'Question', 'Help'. Focus on the subject matter.";

  const msgs = [
    {
      role: "assistant",
      content: systemContent,
    },
    ...messages
      .filter(m => m.role === 'user')
      .slice(0, 5) // Increased context to 5 messages
      .map((m) => ({ role: "user", content: String(m.content).slice(0, 1500) })),
  ];

  try {
    const title = await intelligentRouter.routeToModel(
      msgs,
      {
        type: 'simple_chat',
        complexity: 'low',
        requiresTools: false,
        estimatedTokens: 1000,
        language: hasArabic ? 'ar' : 'en'
      }
    );

    let cleanTitle = (title || "New Session").trim();
    // Cleanup quotes if LLM adds them
    cleanTitle = cleanTitle.replace(/^["']|["']$/g, '');
    // Ensure it's not too long
    if (cleanTitle.length > 100) cleanTitle = cleanTitle.substring(0, 97) + '...';

    return cleanTitle;
  } catch (e) {
    console.error("Title generation failed", e);
    return "New Session";
  }
}
// Update OpenAI client when API key changes
// Update OpenAI client when API key changes
function getOpenAIClient() {
  return new OpenAI({
    apiKey: apiKey || "dummy",
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

export async function generateSummary(
  messages: { role: string; content: string }[],
) {
  if (!messages || messages.length === 0) return "No content to summarize.";

  const msgs = [
    {
      role: "system",
      content:
        "You are the Lead Engineer Joe. Summarize this engineering dialogue with technical precision and professional Arabic/English.",
    },
    {
      role: "user",
      content: messages
        .map((m) => `${m.role}: ${String(m.content).slice(0, 1000)}`)
        .join("\n\n"),
    },
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: msgs,
    });
    return (
      completion.choices[0]?.message?.content?.trim() ||
      "Summary generation failed."
    );
  } catch (e) {
    console.error("Summary generation failed", e);
    return "Summary generation failed due to an error.";
  }
}

export async function summarizeToolOutput(
  userQuery: string,
  toolName: string,
  toolOutput: any,
) {
  try {
    const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are Joe, an intelligent, professional, and engaging AI assistant. 
Your task is to synthesize the tool's output into a comprehensive, professional, and beautifully formatted response.
- Use Markdown to structure your answer (headings, bullet points, bold text, code blocks) where appropriate to make it visually appealing.
- Be engaging and conversational, not robotic.
- If the user asked in Arabic, reply in professional and elegant Arabic.
- If the tool output implies a direct answer (like a price, status, or short fact), state it clearly first, then add interesting details if available.
- If the output is an error, explain it politely and suggest next steps.
- Do not just dump the JSON; explain what it means in a helpful way.`,
      },
      { role: "user", content: userQuery },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: toolName, arguments: "{}" },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: JSON.stringify(toolOutput),
      },
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: msgs,
    });

    return (
      completion.choices[0].message.content ||
      "I couldn't generate a summary, but the tool executed successfully."
    );
  } catch (error) {
    console.error("LLM Summary Error:", error);
    return "Tool executed, but I couldn't summarize the results due to an error.";
  }
}
