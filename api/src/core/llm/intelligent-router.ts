/**
 * Intelligent Model Router
 * Automatically selects the best AI model based on task type and complexity  
 * Supports: Llama 3.3 70B, Llama 3.1 8B (all via Groq - FREE!)
 */

import { pollinationsProvider, openRouterProvider, groqProvider, localProvider, geminiProvider, deepSeekProvider, openAIProvider, cerebrasProvider, mistralProvider, huggingfaceProvider, llm7Provider, duckAIProvider } from './providers/registry';
import { LLMCacheTool } from '../../modules/tools/definitions/LLMCacheTool';
import { OpenAIProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { OpenRouterProvider } from './providers/openrouter';
import { pickLocalModel } from './local-brain';
import OpenAI from 'openai';

let hack: any = pollinationsProvider;
let openrouter: any = openRouterProvider;

export interface ModelConfig {
    name: string;
    provider: 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'hack';
    model: string;
    maxTokens: number;
    temperature: number;
    cost: 'free' | 'low' | 'medium' | 'high';
    strengths: string[];
}

// TaskAnalysis interface moved to bottom with vision support

/**
 * Flatten multimodal messages for text-only providers
 * Converts content arrays with images into text descriptions
 */
export function flattenMultimodalMessages(messages: any[]): any[] {
    return messages.map(m => {
        if (Array.isArray(m.content)) {
            const textParts = m.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text || '')
                .join('\n');

            const imageParts = m.content.filter((c: any) => c.type === 'image_url');
            const fileParts = m.content.filter((c: any) => c.type === 'file' || c.type === 'document');

            let finalContent = textParts;

            if (imageParts.length > 0) {
                finalContent += `\n\n[📷 ${imageParts.length} صورة/صور مرفقة - يرجى تحليلها بناءً على السياق المتوفر]`;
            }

            if (fileParts.length > 0) {
                finalContent += `\n\n[📄 ${fileParts.length} ملف/ملفات مرفقة]`;
            }

            return { ...m, content: finalContent || m.content };
        }
        return m;
    });
}

// Available models configuration

export const MODELS: Record<string, ModelConfig> = {
    // Free tier - Always available.
    // NOTE: Groq DECOMMISSIONED llama-3.1-70b-versatile, mixtral-8x7b-32768 and
    // gemma2-9b-it — calling them returns a permanent 400, which sidelined Groq
    // for whole sessions. The registry keys are kept (they're referenced across
    // the router) but every entry now points at a model Groq actually serves.
    'llama-3.1-70b': {
        name: 'Llama 3.3 70B',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        maxTokens: 8000,
        temperature: 0.7,
        cost: 'free',
        strengths: ['general_chat', 'reasoning', 'multilingual', 'fast']
    },

    'llama-3.1-8b': {
        name: 'Llama 3.1 8B',
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        maxTokens: 8000,
        temperature: 0.7,
        cost: 'free',
        strengths: ['simple_chat', 'speed', 'low_latency']
    },

    'mixtral-8x7b': {
        name: 'Llama 3.3 70B (long context)',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        maxTokens: 32000,
        temperature: 0.7,
        cost: 'free',
        strengths: ['long_context', 'code', 'reasoning']
    },

    'gemma-2-9b': {
        name: 'Llama 3.1 8B (code/math)',
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        maxTokens: 8000,
        temperature: 0.7,
        cost: 'free',
        strengths: ['code', 'math', 'reasoning']
    },

    'pollinations': {
        name: 'Pollinations (Fallback)',
        provider: 'hack',
        model: 'openai',
        maxTokens: 4000,
        temperature: 0.7,
        cost: 'free',
        strengths: ['fallback', 'always_available']
    },

    // Premium tier - Requires API keys
    'claude-3.5-sonnet': {
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 8000,
        temperature: 0.7,
        cost: 'medium',
        strengths: ['code', 'reasoning', 'analysis', 'creative', 'best_quality']
    },

    'gpt-4o': {
        name: 'GPT-4o',
        provider: 'openai',
        model: 'gpt-4o',
        maxTokens: 16000,
        temperature: 0.7,
        cost: 'high',
        strengths: ['multimodal', 'tools', 'function_calling', 'creative']
    },
    'deepseek-v3': {
        name: 'DeepSeek V3',
        provider: 'hack',
        model: 'deepseek-chat',
        maxTokens: 8000,
        temperature: 0.7,
        cost: 'free',
        strengths: ['code', 'reasoning', 'low_latency', 'fallback']
    }
};

/**
 * Analyze user message to determine task type and complexity (Regex Fallback)
 */
// analyzeTask function moved to bottom with vision support

/**
 * Advanced Task Analysis using LLM
 * Uses a lightweight model to deeply understand the task
 */
export async function advancedAnalyzeTask(userMessage: string, history?: any[], onProgress?: (msg: string) => void, onThought?: (msg: string) => void): Promise<TaskAnalysis> {
    if (process.env.MOCK_LLM === 'true') {
        return analyzeTask(userMessage, history);
    }
    const hasGroq = !!(process.env.GROQ_API_KEY?.trim());

    const systemPrompt = `Analyze the following user request and return a JSON object.
Be extremely strict with complexity:
- "extreme": Building full applications, complex systems, multi-step deployment, or "from scratch" projects.
- "high": Complex coding tasks, deep analysis, or multi-module changes.
- "medium": Browser automation, explaining complex concepts, single component logic, or multi-step file operations.
- "low": Simple questions, greetings, or basic file reads.

Task Types:
- "complex_reasoning": For "How does X work?", architecture discussions, or planning.
- "code_generation": For any request involving writing code, file operations, or system commands.
- "browser_task": For any web-based automation or search.

Return exactly this JSON structure:
{
  "type": "simple_chat" | "complex_reasoning" | "code_generation" | "creative" | "data_analysis" | "browser_task",
  "complexity": "low" | "medium" | "high" | "extreme",
  "requiresTools": boolean,
  "language": "ar" | "en" | "mixed",
  "shortSummary": "string"
}`;

    try {
        // [OPTIMIZATION] If query is short, skip LLM-based analysis
        if (userMessage.length < 120) {
            console.info('[IntelligentRouter] Short message - using fast regex analysis');
            return analyzeTask(userMessage);
        }

        if (!hasGroq) {
            // Attempt Gemini if Groq is missing
            const { geminiProvider } = require('./providers/gemini');
            if (geminiProvider.isAvailable()) {
                console.info('[IntelligentRouter] 🌟 Using Gemini for advanced task analysis');
                const result = await geminiProvider.chatComplete([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ]);
                const jsonMatch = result.match(/\{[\s\S]*\}/);
                if (jsonMatch) return JSON.parse(jsonMatch[0]);
            }
            return analyzeTask(userMessage, history);
        }

        console.info('[IntelligentRouter] ⚡ Using Groq (Llama 3) for instant analysis');
        const analyst = 'llama-3.1-8b-instant';

        const responseText = await callGroq(analyst, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ]);

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            return { ...analysis, estimatedTokens: userMessage.length * 10 };
        }
    } catch (err) {
        console.warn('[IntelligentRouter] Advanced analysis failed, falling back to regex:', err);
    }

    return analyzeTask(userMessage, history);
}

/**
 * Generate a multi-step execution plan for complex tasks
 */
export async function generateActionPlan(userMessage: string, analysis: TaskAnalysis): Promise<string[]> {
    if (analysis.complexity === 'low' && !analysis.requiresTools) return [];

    try {
        const systemPrompt = `You are an Elite Technical Planner. Break down the user's request into 3-5 logical, high-impact steps.
Use relevant emojis for each step (e.g., 🔍, 🏗️, 🛡️, ✨).
Respond ONLY with a numbered list of steps. Ensure the steps sound professional and encouraging.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        // Use a stronger model for planning if possible
        const response = await routeToModel(messages, { ...analysis, complexity: 'medium' });
        console.log('[IntelligentRouter] Planning response:', response);
        const steps = response.split('\n')
            .map(line => line.trim())
            .filter(line => /^\d+[\.\)-]/.test(line)); // More flexible regex for steps (1., 1), 1-)

        console.info(`[IntelligentRouter] Parsed ${steps.length} steps from plan`);
        return steps;
    } catch (err: any) {
        console.warn('[IntelligentRouter] Action plan generation failed:', err.message);
        return [];
    }
}

/**
 * Select the best model based on task analysis
 */
export interface TaskAnalysis {
    type: 'simple_chat' | 'complex_reasoning' | 'code_generation' | 'creative' | 'data_analysis' | 'browser_task';
    complexity: 'low' | 'medium' | 'high' | 'extreme';
    requiresTools: boolean;
    estimatedTokens: number;
    language: 'ar' | 'en' | 'mixed';
    shortSummary?: string;
    hasImages?: boolean;
    suggestedModel?: string;
}



export function analyzeTask(userMessage: string, conversationHistory?: any[]): TaskAnalysis {
    const msg = userMessage.toLowerCase();
    const length = userMessage.length;

    // Check for images in history (New Vision Logic)
    let hasImages = false;
    if (conversationHistory && conversationHistory.length > 0) {
        const lastMsg = conversationHistory[conversationHistory.length - 1];
        if (Array.isArray(lastMsg?.content)) {
            hasImages = lastMsg.content.some((c: any) => c.type === 'image_url');
        }
    }

    // Detect language: Stronger Arabic detection
    const arabicChars = (userMessage.match(/[\u0600-\u06FF]/g) || []).length;
    const arabicRatio = arabicChars / (userMessage.length || 1);
    const hasArabicWords = /(أنا|أنت|هو|هي|نحن|في|من|على|إلى|عن|مع|هل|كيف|لماذا|متى|أين|ماذا|كم|يونس|جو)/.test(userMessage);

    // If there's ANY Arabic and it's substantial (more than 2 chars or high ratio)
    const language: 'ar' | 'en' | 'mixed' =
        (arabicChars > 2 || arabicRatio > 0.1 || hasArabicWords) ? 'ar' :
            arabicRatio > 0.05 ? 'mixed' : 'en';

    // SPEED OPTIMIZATION: Check for Fast Lane candidates immediately
    const isShortQuestion = length < 60 && /(ما|من|كيف|اين|متى|what|who|how|where|when)/i.test(msg);

    // Task type detection
    let taskType: TaskAnalysis['type'] = 'simple_chat';
    let requiresTools = false;

    const hasBuildVerb = /(build|create|implement|develop|generate|scaffold|ابن[يى]?|انش[ئأؤا]?|نفذ|صم[مم]|برم?ج|سو[يى]|عمل|اعمل)/i.test(msg);
    const hasDevObject = /(website|site|web\s*app|application|app|landing|dashboard|admin|api|backend|frontend|game|calculator|tool|utility|موق[عق]|تطب[قي]ق|منص[هة]|لوح[هة]|واجه[هة]|متجر|سل[هة]|دفع|حاسبة|لعبة|أداة)/i.test(msg);
    const isBuildIntent = hasBuildVerb && hasDevObject;

    // File/System Operations
    if (/(file|folder|directory|system|terminal|command|ملف|مجلد|نظام|امر)/i.test(msg) && /(create|write|read|edit|delete|run|execute|list|انشئ|اكتب|اقرأ|عدل|احذف|شغل|نفذ|اعرض)/i.test(msg)) {
        taskType = 'code_generation';
        requiresTools = true;
    }
    // Build / large project creation
    else if (isBuildIntent) {
        taskType = 'code_generation';
        requiresTools = true;
    }
    // Browser/automation tasks
    else if (/(open|af[ت|ح]ح|browse|متصفح|click|anقر|اضغط|extract|استخرج|تصفح|ادخل|روح|زور|search|ابحث|بحث)/i.test(msg)) {
        taskType = 'browser_task';
        requiresTools = true;
    }
    // Code generation & Building
    else if (/(code|كود|function|دالة|class|كلاس|api|endpoint|implement|نفذ|build|ابني|create|انشئ|أنشئ|app|application|برمج|سوي|اعمل|صمم|نظام|منصة|backend|frontend|database|auth|login|payment|دفع|مصادقة|قاعدة\s*بيانات)/i.test(msg)) {
        taskType = 'code_generation';
        requiresTools = length > 40; // Lower threshold to ensure tools are triggered for build requests
    }
    // Creative writing
    else if (/(write.*story|اكتب.*قصة|poem|قصيدة|article|مقال|essay|موضوع|creative|إبداعي)/i.test(msg)) {
        taskType = 'creative';
    }
    // Data analysis
    else if (/(analyze|حلل|statistics|إحصائيات|data|بيانات|chart|رسم|graph|مخطط)/i.test(msg)) {
        taskType = 'data_analysis';
    }
    // Complex reasoning & Factual Identification
    else if (/(explain|اشرح|why|لماذا|how.*work|كيف.*يعمل|design|تصميم|architecture|معمارية|plan|خطة)/i.test(msg)) {
        taskType = 'complex_reasoning';
    }
    else if (/(who\s*is|what\s*is|man\s*huwa|president|ruler|king|minister|من\s*هو|من\s*هي|رئيس|حاكم|ملك|وزير|الحالي|ماهو|ماذا|اين|متى)/i.test(msg)) {
        taskType = 'complex_reasoning'; // Treat as reasoning to get better models
        requiresTools = true; // Proactively trigger search
    }

    // Complexity detection
    let complexity: TaskAnalysis['complexity'] = 'low';

    if (length > 500 || taskType === 'data_analysis') complexity = 'high';
    else if (length > 200 || taskType === 'code_generation' || taskType === 'complex_reasoning') complexity = 'medium';
    else if (taskType === 'browser_task') complexity = 'medium';

    // Check for extremely complex tasks
    if (/(build.*(application|website|app|system|ecommerce|fullstack)|ابني.*تطبيق|full.*system|نظام.*كامل|million|مليون|large.*scale|واسع.*النطاق)/i.test(msg)) {
        complexity = 'extreme';
        requiresTools = true;
    }

    // Force Vision Logic
    if (hasImages) {
        taskType = 'complex_reasoning'; // Force reasoning mode for images
        complexity = complexity === 'low' ? 'medium' : complexity; // Bump complexity
    }

    return {
        type: taskType,
        complexity,
        requiresTools,
        estimatedTokens: Math.min(length * 10, 8000),
        language,
        hasImages
    };
}

/**
 * Select the best model based on task analysis
 */
export function selectBestModel(analysis: TaskAnalysis, availableKeys?: {
    anthropic?: string;
    openai?: string;
}): ModelConfig {
    const hasGroq = !!(process.env.GROQ_API_KEY?.trim());

    // Vision Support: valid keys required
    if (analysis.hasImages) {
        console.info('[IntelligentRouter] 📷 Image detected in request - Switching to Vision Model');
        return MODELS['pollinations'];
    }

    // Fallback logic for FREE models
    if (!hasGroq) {
        // If user wants free, we don't force GPT-4o here.
        // We will default to the best free strategy in routeToModel.
        console.info('[IntelligentRouter] Groq key missing. defaulting to Free Model Strategy.');
        return MODELS['mixtral-8x7b']; // Placeholder config, will be handled by fallback loop
    }

    // 🔥 WEAK MODEL OPTIMIZATION: استخدام Mixtral للمشاريع الضخمة (32K context!)
    if (analysis.complexity === 'extreme' || analysis.estimatedTokens > 6000) {
        console.info('[IntelligentRouter] 🚀 Large project detected - Using Mixtral 8x7B (32K context)');
        return MODELS['mixtral-8x7b'];
    }

    // Task-specific selection (free tier)
    switch (analysis.type) {
        case 'code_generation':
            // استخدم Mixtral للمشاريع المعقدة بدلاً من Llama
            if (analysis.complexity === 'high') {
                return MODELS['mixtral-8x7b']; // 32K context أفضل للمشاريع الكبيرة
            }
            return MODELS['gemma-2-9b'];

        case 'complex_reasoning':
            // Arabic reasoning ALWAYS gets the big model
            if (analysis.language === 'ar') return MODELS['llama-3.1-70b'];
            return MODELS['llama-3.1-70b'];

        case 'creative':
            return MODELS['llama-3.1-70b'];

        case 'data_analysis':
            return MODELS['gemma-2-9b'];

        case 'browser_task':
            return MODELS['llama-3.1-8b']; // Fast for quick decisions

        case 'simple_chat':
        default:
            // Arabic reasoning gets a strong model
            if (analysis.language === 'ar') return MODELS['llama-3.1-70b'];

            // Prefer DeepSeek V3 for complex free tasks if Groq is slow
            if (analysis.complexity === 'high' || analysis.complexity === 'medium') {
                return MODELS['deepseek-v3'];
            }

            return MODELS['llama-3.1-70b'];
    }
}

/**
 * Make API call to Groq (free Llama/Mixtral/Gemma models)
 */
/**
 * Make API call to Groq (free Llama/Mixtral/Gemma models)
 */
/** Rough token estimate (~4 chars/token) for deciding when a Groq request is at
 *  risk of the free-tier 413 "request too large" limit. */
function approxTokens(messages: any[]): number {
    try {
        let chars = 0;
        for (const m of messages) chars += String(m?.content ?? '').length;
        return Math.ceil(chars / 4);
    } catch { return 0; }
}

/** Keep the system message + the most recent turns, dropping the long middle of
 *  the history so a heavy browser-observation prompt fits inside Groq's limit.
 *  Never invents content — it only DROPS older turns. */
function trimMessagesForGroq(messages: any[], keepRecent = 4): any[] {
    if (!Array.isArray(messages) || messages.length <= keepRecent + 1) return messages;
    const system = messages.filter(m => m?.role === 'system');
    const nonSystem = messages.filter(m => m?.role !== 'system');
    const recent = nonSystem.slice(-keepRecent);
    return [...system, ...recent];
}

async function callGroq(model: string, messages: any[], onPartial?: (delta: string) => void, tools?: any[]): Promise<string> {
    const GROQ_API_KEY = process.env.GROQ_API_KEY || 'gsk_placeholder';

    try {
        const stream = !!onPartial;

        // Groq's FREE tier rejects a request when (input + max_tokens) exceeds the
        // model's tokens-per-minute budget — HTTP 413 "request too large". The old
        // max_tokens (8000) alone blew past a 6000 TPM model and 413'd the WHOLE
        // call, which then fell back to the slow local CPU brain (the ~50s stalls
        // the user saw on the browser-login task). Size the completion budget to
        // fit UNDER the tier limit given the actual input, so it passes first try.
        const desiredMax = model.includes('mixtral') ? 8000 : 4000;
        const tierBudget = parseInt(String(process.env.GROQ_TPM_BUDGET || '5600').trim(), 10) || 5600;
        const inputTokens = approxTokens(messages);
        const maxTokensForModel = Math.max(512, Math.min(desiredMax, tierBudget - inputTokens));

        const body: any = {
            model,
            messages,
            temperature: 0.7,
            max_tokens: maxTokensForModel,
            stream
        };

        if (tools && tools.length > 0) {
            body.tools = tools.map((t: any) => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description || "",
                    parameters: t.inputSchema || { type: "object", properties: {} },
                },
            }));
            body.tool_choice = "auto";
        }

        let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        // 413 "request too large": retry ONCE with a trimmed prompt + smaller
        // completion budget. This is what lets a heavy browser-login step keep
        // using fast Groq instead of collapsing to the 50s local fallback.
        if (response.status === 413) {
            const errText = await response.text().catch(() => '');
            console.warn(`[Groq] 413 request too large (~${inputTokens} input tokens, max_tokens=${maxTokensForModel}). Retrying trimmed. ${errText.slice(0, 200)}`);
            const trimmed = trimMessagesForGroq(messages);
            const retryMax = Math.max(512, Math.min(1500, tierBudget - approxTokens(trimmed)));
            const retryBody = { ...body, messages: trimmed, max_tokens: retryMax };
            response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(retryBody)
            });
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`Groq API error: ${response.status}${errText ? ` — ${errText.slice(0, 160)}` : ''}`);
        }

        if (stream && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullText = '';
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;

                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed === 'data: [DONE]') continue;
                        if (trimmed.startsWith('data: ')) {
                            try {
                                const json = JSON.parse(trimmed.slice(6));
                                const content = json.choices[0]?.delta?.content || '';
                                if (content) {
                                    fullText += content;
                                    onPartial?.(content);
                                }
                            } catch { }
                        }
                    }
                }
            } catch (err) {
                console.error('Stream reading failed', err);
            }
            return fullText;
        } else {
            const data = await response.json();
            return data.choices[0]?.message?.content || '';
        }

    } catch (err: any) {
        console.error('[Groq] API call failed:', err.message);
        throw err;
    }
}

/**
 * Intelligent routing with automatic fallback
 * Works WITHOUT API keys - uses Pollinations as free fallback
 */
// Remembers custom-provider routes (provider+key+model) that failed with an
// auth/config error (400/401/403 / invalid key). Without this a bad key entered
// in the UI is retried on EVERY call - four failed Gemini attempts per step -
// which silently makes Joe extremely slow. Once blocked, we skip straight to the
// FREE provider mesh for the rest of the process.
const failedCustomRoutes = new Set<string>();

// Remembers FREE-mesh providers that just failed or timed out, so we skip them for
// a short cooldown instead of paying a full (often long) round-trip through a dead
// gateway on EVERY request. Example: DuckAI returns 418 and Pollinations returns
// empty right now — without this, each step wastes ~18s+6s hitting them again before
// reaching the one that works. The cooldown is short (RECENT_FAIL_TTL_MS) so a
// provider that recovers is retried soon, and Local (Auto) is NEVER skipped (the
// local brain is the user's primary engine and may just be loading a cold model).
const recentlyFailedProviders = new Map<string, number>(); // name -> retry-after epoch ms
const RECENT_FAIL_TTL_MS = Math.max(
    1000,
    parseInt(String(process.env.PROVIDER_FAIL_COOLDOWN_MS || '').trim(), 10) || 60000
);
export function isProviderCoolingDown(name: string): boolean {
    if (name === 'Local (Auto)') return false; // never skip the local brain
    const until = recentlyFailedProviders.get(name);
    if (!until) return false;
    if (Date.now() >= until) { recentlyFailedProviders.delete(name); return false; }
    return true;
}
export function markProviderFailed(name: string): void {
    if (name === 'Local (Auto)') return;
    recentlyFailedProviders.set(name, Date.now() + RECENT_FAIL_TTL_MS);
}
export function markProviderOk(name: string): void {
    recentlyFailedProviders.delete(name);
}
/** Test/diagnostics only: order a provider list fresh-first, cooled-last (the exact
 *  ordering the fallback mesh uses). */
export function orderByCooldown<T extends { name: string }>(providers: T[]): T[] {
    const fresh = providers.filter(p => !isProviderCoolingDown(p.name));
    const cooled = providers.filter(p => isProviderCoolingDown(p.name));
    return [...fresh, ...cooled];
}

export async function routeToModel(
    messages: any[],
    analysis?: TaskAnalysis,
    availableKeys?: { anthropic?: string; openai?: string; groq?: string; },
    onPartial?: (delta: string) => void,
    onProgress?: (msg: string) => void,
    onThought?: (msg: string) => void,
    tools?: any[],
    context?: any
): Promise<string> {

    if (process.env.MOCK_LLM === 'true') {
        const promptText = JSON.stringify(messages);
        console.log(`[MOCK ROUTER] Intercepted call (length: ${promptText.length}): ${promptText.substring(0, 120)}...`);
        
        // 0. Plan evaluation mock
        if (promptText.includes('adjust the plan')) {
            console.log('✨ [MOCK ROUTER] Matched: Plan Evaluator');
            return JSON.stringify({ shouldReplan: false });
        }

        // 1. Intent parser mock
        if (promptText.includes('Senior Strategic Intent Analyst')) {
            console.log('✨ [MOCK ROUTER] Matched: Intent Parser');
            return JSON.stringify({
                primary: promptText.includes('dashboard') ? 'Create a premium, modern dashboard web page in a file named dashboard.html' : 'Create a file named welcome.txt',
                domain: 'Dev',
                complexity: 'medium',
                riskLevel: 'low',
                requirements: ['write_file'],
                successCriteria: [promptText.includes('dashboard') ? 'dashboard.html created with beautiful styling' : 'welcome.txt created successfully'],
                suggestedAgent: 'Dev'
            });
        }

        // 2. Planning engine mock
        if (promptText.includes('Professional Software Architecture Planner')) {
            console.log('✨ [MOCK ROUTER] Matched: Planning Engine');
            return JSON.stringify([
                {
                    id: promptText.includes('dashboard') ? 'write_dashboard_page' : 'write_welcome_file',
                    description: promptText.includes('dashboard') ? 'Create the premium dashboard HTML page with glassmorphism CSS styling.' : 'Create the welcome file.',
                    tool: 'write_file',
                    agent: 'Dev',
                    input: {},
                    dependsOn: []
                }
            ]);
        }

        // 3. Task complexity/risk analyzer mock
        if (promptText.includes('Complexity and Risk') || promptText.includes('Task Complexity and Risk')) {
            console.log('✨ [MOCK ROUTER] Matched: Complexity/Risk Analyzer');
            return JSON.stringify({
                complexity: 'medium',
                riskLevel: 'low',
                type: 'code_generation',
                requiresTools: true,
                estimatedTokens: 1000,
                language: 'en'
            });
        }

        // 4. Agent dispatcher mock
        if (promptText.includes('Dispatcher for a Multi-Agent System')) {
            console.log('✨ [MOCK ROUTER] Matched: Agent Dispatcher');
            return 'Dev';
        }

        // 5. JoeAgent task executor tool selection mock
        if (promptText.includes('Professional AI Agent') || promptText.includes('Choose the single best tool')) {
            console.log('✨ [MOCK ROUTER] Matched: Tool Selector');
            if (promptText.includes('dashboard')) {
                const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Joe Premium Task Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #08090c;
            --bg-secondary: #0f111a;
            --accent-primary: #8b5cf6;
            --accent-secondary: #ec4899;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --glass-bg: rgba(255, 255, 255, 0.02);
            --glass-border: rgba(255, 255, 255, 0.05);
            --glow-color: rgba(139, 92, 246, 0.15);
            --font-main: 'Outfit', sans-serif;
            --font-mono: 'JetBrains Mono', monospace;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background-color: var(--bg-primary); color: var(--text-primary); font-family: var(--font-main); min-height: 100vh; display: flex; overflow: hidden; }
        .sidebar { width: 280px; background: var(--bg-secondary); border-right: 1px solid var(--glass-border); display: flex; flex-direction: column; padding: 24px; }
        .logo-section { display: flex; align-items: center; gap: 12px; margin-bottom: 40px; }
        .logo-icon { width: 36px; height: 36px; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: white; }
        .logo-text { font-size: 20px; font-weight: 800; background: linear-gradient(to right, #ffffff, var(--text-secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .main-content { flex: 1; padding: 40px; overflow-y: auto; position: relative; }
        .welcome-title { font-size: 32px; font-weight: 800; margin-bottom: 6px; }
        .welcome-subtitle { color: var(--text-secondary); font-size: 15px; }
        .tasks-container { background: var(--glass-bg); border: 1px solid var(--glass-border); backdrop-filter: blur(12px); border-radius: 20px; padding: 32px; margin-top: 30px; }
        .task-list { display: flex; flex-direction: column; gap: 16px; margin-top: 20px; }
        .task-item { display: flex; align-items: center; justify-content: space-between; padding: 20px; background: rgba(255, 255, 255, 0.01); border: 1px solid var(--glass-border); border-radius: 12px; }
    </style>
</head>
<body>
    <aside class="sidebar">
        <div class="logo-section"><div class="logo-icon">J</div><span class="logo-text">Joe Systems</span></div>
    </aside>
    <main class="main-content">
        <h1 class="welcome-title">System Dashboard</h1>
        <p class="welcome-subtitle">Workspace Overview & Active Tasks</p>
        <section class="tasks-container">
            <h2>Priority Tasks</h2>
            <div class="task-list">
                <div class="task-item"><span>Run guard validation suite</span><strong>High</strong></div>
                <div class="task-item"><span>Configure API health check alerts</span><strong>Medium</strong></div>
            </div>
        </section>
    </main>
</body>
</html>`;
                return JSON.stringify({
                    tool: 'write_file',
                    args: {
                        filename: 'dashboard.html',
                        content: dashboardHtml
                    },
                    reasoning: 'Creating the premium dashboard HTML page with glassmorphism CSS layout.'
                });
            } else {
                return JSON.stringify({
                    tool: 'write_file',
                    args: {
                        filename: 'welcome.txt',
                        content: 'System tested successfully'
                    },
                    reasoning: 'Creating the welcome.txt file with success content.'
                });
            }
        }
        
        return "System is running and ready to handle tasks in Mock Mode!";
    }

    // Flatten multimodal messages for text-only providers (and for analysis)
    const flatMessages = flattenMultimodalMessages(messages);

    // Helper to extract thinking tokens and forward them, then clean output
    const extractAndForwardThoughts = (text: string): void => {
        if (!onThought) return;
        const patterns = [
            /:::thought([\s\S]*?):::/g,
            /<thought>([\s\S]*?)<\/thought>/g,
            /<think>([\s\S]*?)<\/think>/g,
        ];
        for (const pattern of patterns) {
            for (const match of text.matchAll(pattern)) {
                const thought = match[1]?.trim();
                if (thought && thought.length > 2) {
                    onThought(thought);
                }
            }
        }
    };

    const cleanOutput = (text: string) => {
        extractAndForwardThoughts(text);
        return text
            .replace(/:::thought[\s\S]*?:::/g, '')
            .replace(/<thought>[\s\S]*?<\/thought>/g, '')
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .trim();
    };

    // Check for user-selected provider overrides in context
    if (context?.modelConfig) {
        const { provider: cfgProvider, model: cfgModel, apiKey: cfgApiKey, baseUrl: cfgBaseUrl } = context.modelConfig;
        // A provider selected WITHOUT a real key (placeholder 'auto-mode'/'free-mode'
        // or blank) must route through the free-first mesh — NOT be sent to the real
        // provider API with a fake key (which is why the free non-Auto providers like
        // Groq/Cerebras/Mistral "didn't connect"). Only a real, non-placeholder key
        // takes the custom route.
        const keyStr = String(cfgApiKey || '').trim();
        // A real API key is ASCII only. A key containing non-ASCII characters (e.g. an
        // Arabic letter pasted by mistake) would crash header building
        // ("Cannot convert argument to a ByteString"), so treat it as invalid and route
        // through the free/local mesh instead of failing every request.
        const nonAsciiKey = /[^\x00-\x7F]/.test(keyStr);
        if (nonAsciiKey) {
            console.warn('[IntelligentRouter] Ignoring custom API key: it contains non-ASCII characters (likely pasted wrong). Using FREE/Local providers.');
        }
        const placeholderKey = !keyStr || nonAsciiKey || keyStr === 'auto-mode' || keyStr === 'free-mode' || keyStr === 'free' || keyStr === 'dummy';
        const isAuto = !cfgProvider || cfgProvider === 'mock' || cfgProvider === 'auto' || cfgProvider === 'free' || cfgProvider === 'default' || placeholderKey;
        if (!isAuto) {
          const routeKey = `${cfgProvider}:${String(cfgApiKey || '').slice(0, 12)}:${cfgModel || ''}`;
          if (failedCustomRoutes.has(routeKey)) {
            console.log(`[IntelligentRouter] Skipping known-bad custom route ${cfgProvider}/${cfgModel} (previously failed auth/config) - using FREE providers.`);
          } else {
            console.log(`✨ [IntelligentRouter] Custom Route: Provider=${cfgProvider}, Model=${cfgModel}, HasKey=${!!cfgApiKey}, HasUrl=${!!cfgBaseUrl}`);
            
            const effectiveApiKey = (cfgApiKey && cfgApiKey !== 'auto-mode') ? cfgApiKey.trim() : 
                (cfgProvider === 'openai' ? process.env.OPENAI_API_KEY :
                 cfgProvider === 'gemini' || cfgProvider === 'google' ? (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) :
                 cfgProvider === 'openrouter' ? process.env.OPENROUTER_API_KEY : '');

            // [ELITE FIX] If Gemini/Google selected but no key, fallback to free DeepSeek/Pollinations immediately
            if ((cfgProvider === 'gemini' || cfgProvider === 'google') && !effectiveApiKey) {
                console.warn(`[IntelligentRouter] Gemini selected but no key found. Falling back to DeepSeek (Free).`);
                try {
                    const res = await deepSeekProvider.chatComplete(flatMessages, undefined, tools);
                    if (res) return res;
                    console.warn(`[IntelligentRouter] DeepSeek returned empty, trying Pollinations...`);
                    return await pollinationsProvider.chatComplete(flatMessages, undefined, 3, tools);
                } catch (e) {
                    console.error(`[IntelligentRouter] Fallback failed, trying Pollinations...`);
                    return await pollinationsProvider.chatComplete(flatMessages, undefined, 3, tools);
                }
            }
                 
            const effectiveBaseUrl = cfgBaseUrl?.trim() || 
                (cfgProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
                 cfgProvider === 'gemini' || cfgProvider === 'google' ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : undefined);

            try {
                if (cfgProvider === 'gemini' || cfgProvider === 'google') {
                    console.log(`[IntelligentRouter] Routing via GeminiProvider with sanitized schemas...`);
                    const gProvider = new GeminiProvider(effectiveApiKey);
                    const rawModel = cfgModel || 'gemini-2.0-flash';
                    const answer = await gProvider.chatComplete(messages, rawModel, tools);
                    if (answer && answer.length > 0) {
                        return cleanOutput(answer);
                    }
                    throw new Error('Gemini returned empty response');
                } else {
                    // OpenAI, OpenRouter, or other OpenAI-compatible endpoint
                    const client = new OpenAI({
                        apiKey: effectiveApiKey || 'dummy',
                        baseURL: effectiveBaseUrl
                    });
                    const completion = await client.chat.completions.create({
                        model: cfgModel || (cfgProvider === 'openai' ? 'gpt-4o' : 'google/gemma-2-9b-it:free'),
                        messages: flatMessages as any,
                        tools: tools as any,
                        tool_choice: tools ? 'auto' : undefined,
                    });
                    const message = completion.choices[0]?.message;
                    if (message?.tool_calls && message.tool_calls.length > 0) {
                        return JSON.stringify({
                            type: 'tool_calls',
                            tool_calls: message.tool_calls,
                        });
                    }
                    return cleanOutput(message?.content || '');
                }
            } catch (err: any) {
                console.error(`[IntelligentRouter] Direct custom provider routing failed: ${err.message}. Falling back to default routing.`);
                const status = (err && (err.status || err.statusCode)) || 0;
                const msg = String(err?.message || '');
                if (status === 400 || status === 401 || status === 403 || /\b(400|401|403)\b|api[_ -]?key|invalid|unauthor|permission/i.test(msg)) {
                    failedCustomRoutes.add(routeKey);
                    console.warn(`[IntelligentRouter] Custom route ${cfgProvider}/${cfgModel} DISABLED for this session (auth/config error). Joe will use FREE providers only - fix or remove the key in the model settings.`);
                }
            }
          }
        }
    }

    // [SPEED UP] If we already have a direct provider, skip heavy analysis
    const taskAnalysis = (analysis || (context?.modelConfig?.provider ? { complexity: 'medium' } : await advancedAnalyzeTask(
        flatMessages.find(m => m.role === 'user')?.content || '',
        messages,
        onProgress,
        onThought
    ))) as any;

    // Select best model
    const suggested = analysis?.suggestedModel ? MODELS[analysis.suggestedModel] : undefined;
    let selectedModel = suggested && suggested.cost === 'free' ? suggested : selectBestModel(taskAnalysis, availableKeys);

    if (selectedModel.cost !== 'free') {
        selectedModel = MODELS['llama-3.1-70b'];
    }

    // [SPEED UP] If we already have a selected model from the fast analysis, use it and skip.
    if (!selectedModel) {
        // Fallback safety
    }

    // [VISION SUPPORT] Determine which messages to use
    // If model is GPT-4o or Claude 3.5 Sonnet, use ORIGINAL messages (with images)
    // Otherwise, use FLATTENED messages (text placeholders)
    const isVisionCapable = selectedModel.model.includes('gpt-4o') ||
        selectedModel.model.includes('claude-3-5-sonnet') ||
        selectedModel.model.includes('gemini');

    const effectiveMessages = isVisionCapable ? messages : flatMessages;

    const cacheDisabled = String(process.env.LLM_CACHE_DISABLE || '').trim() === '1';
    const cacheKeyPayload = JSON.stringify({
        messages: flatMessages,
        analysis: taskAnalysis,
        selectedModel: selectedModel.model
    });
    const cacheText = flatMessages
        .map(m => (typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content || '')))
        .join('\n');
    const hasSensitive = /(sk-[a-z0-9]{10,}|api[_-]?key|authorization:\s*bearer|-----begin\s+[a-z ]+-----)/i.test(cacheText);
    if (!cacheDisabled && !hasSensitive) {
        const cached = await LLMCacheTool.checkCache(cacheKeyPayload, selectedModel.model);
        if (cached) return cached;
    }

    // Check if Groq API key available
    const hasGroqKey = !!(process.env.GROQ_API_KEY?.trim());
    const hasOpenRouterKey = !!(process.env.OPENROUTER_API_KEY?.trim());
    const hasLocal =
        localProvider.isConfigured() &&
        String(process.env.LOCAL_LLM_DISABLE || '').trim() !== '1';
    const localStrict = String(process.env.LOCAL_LLM_STRICT || '').trim() === '1';

    // ============================================================================
    // FREE-FIRST Multi-Provider Mesh ("Chain of Steel")
    // ----------------------------------------------------------------------------
    // Joe is designed to run primarily on FREE intelligence. The mesh is ordered so
    // the strongest FREE providers are tried first; paid providers only act as a
    // deep fallback, and keyless proxies are the very last resort.
    //
    // Priority (each step is skipped automatically if its key is absent):
    //   0. Forced provider (LLM_PROVIDER env override)
    //   1. Local  (self-hosted Ollama / LM Studio — zero cost, private)
    //   2. Gemini    (FREE — strongest free model, 1500 req/day, 1M context)
    //   3. Groq      (FREE — fastest inference, Llama 3.3 70B)
    //   4. Cerebras  (FREE — ~1M tokens/day, ultra-fast)
    //   5. OpenRouter(FREE — one key, ~30 free models)
    //   6. Mistral   (FREE — ~1B tokens/month, strong multilingual/code)
    //   7. HuggingFace (FREE — open models inference)
    //   8. OpenAI    (PAID — deep fallback only)
    //   9. DeepSeek / Pollinations (keyless proxy — last resort)
    // ============================================================================

    const meshProviders: Array<{ name: string; run: () => Promise<string> }> = [];
    const preferredProvider = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();

    // 0. [PRIORITY] Forced provider via env
    if (preferredProvider === 'pollinations') {
        meshProviders.push({
            name: 'Pollinations (Forced)',
            run: async () => {
                const res = await pollinationsProvider.chatComplete(effectiveMessages, 'gpt-4o', 3, tools);
                if (!res || res.length < 5) throw new Error('Pollinations response too short');
                return res;
            }
        });
    }

    // 1. Local self-hosted (zero cost, fully private)
    if (hasLocal) {
        meshProviders.push({
            name: 'Local (Auto)',
            run: async () => {
                // Task-based model routing: build/code tasks get the strongest
                // installed coder model; chat gets the fast small model. Falls back
                // to LOCAL_LLM_MODEL when detection hasn't run.
                const localModel = pickLocalModel(taskAnalysis?.type);
                // Pass onPartial so the local brain streams tokens live to the panel.
                const res = await localProvider.chatComplete(flatMessages, localModel, onPartial);
                if (!res || res.length < 2) throw new Error('Local response too short');
                return res;
            }
        });
    }

    // 2. Gemini — strongest FREE provider (prioritized above paid providers)
    if (geminiProvider.isAvailable()) {
        meshProviders.push({
            name: 'Gemini (Free)',
            run: async () => {
                return await geminiProvider.chatComplete(effectiveMessages, process.env.GEMINI_MODEL || 'models/gemini-flash-latest', tools);
            }
        });
    }

    // 3. Groq — fastest FREE inference (Llama 3.3 70B)
    if (hasGroqKey) {
        meshProviders.push({
            name: 'Groq (Free)',
            run: async () => {
                const model = (selectedModel.provider === 'groq' && selectedModel.model) ? selectedModel.model : 'llama-3.3-70b-versatile';
                return await callGroq(model, flatMessages, onPartial, tools);
            }
        });
    }

    // 4. Cerebras — FREE, ~1M tokens/day, ultra-fast
    if (cerebrasProvider.isAvailable()) {
        meshProviders.push({
            name: 'Cerebras (Free)',
            run: async () => {
                return await cerebrasProvider.chatComplete(effectiveMessages, undefined, tools);
            }
        });
    }

    // 5. OpenRouter — one FREE key unlocks ~30 free models
    if (hasOpenRouterKey) {
        meshProviders.push({
            name: 'OpenRouter (Free)',
            run: async () => {
                return await openRouterProvider.chatComplete(flatMessages, 'moonshotai/kimi-k2:free', tools);
            }
        });
    }

    // 6. Mistral — FREE tier, ~1B tokens/month
    if (mistralProvider.isAvailable()) {
        meshProviders.push({
            name: 'Mistral (Free)',
            run: async () => {
                return await mistralProvider.chatComplete(effectiveMessages, undefined, tools);
            }
        });
    }

    // 7. HuggingFace — FREE open-model inference
    if (huggingfaceProvider.isAvailable()) {
        meshProviders.push({
            name: 'HuggingFace (Free)',
            run: async () => {
                const res = await huggingfaceProvider.chatComplete(flatMessages);
                if (!res || res.length < 2) throw new Error('HuggingFace response too short');
                return res;
            }
        });
    }

    // 8. OpenAI — PAID, deep fallback only
    if (openAIProvider.isAvailable()) {
        meshProviders.push({
            name: 'OpenAI (Direct)',
            run: async () => {
                return await openAIProvider.chatComplete(effectiveMessages, 'gpt-4o', tools);
            }
        });
    }

    // 9. KEYLESS tier — no API key required. Primary brain when no keys are set.
    //    LLM7 first (anonymous OpenAI-compatible gateway), then Pollinations proxies.
    if (llm7Provider.isAvailable()) {
        meshProviders.push({
            name: 'LLM7 (Keyless)',
            run: async () => {
                const res = await llm7Provider.chatComplete(effectiveMessages, undefined, tools);
                if (!res || res.length < 2) throw new Error('LLM7 response too short');
                return res;
            }
        });
    }

    // 9b. DuckDuckGo AI — additional KEYLESS brain (GPT-4o-mini / Llama 3.3 70B).
    if (duckAIProvider.isAvailable()) {
        meshProviders.push({
            name: 'DuckAI (Keyless)',
            run: async () => {
                const res = await duckAIProvider.chatComplete(flatMessages, undefined, tools);
                if (!res || res.length < 2) throw new Error('DuckAI response too short');
                return res;
            }
        });
    }

    meshProviders.push({
        name: 'DeepSeek (Pollinations)',
        run: async () => {
            return await deepSeekProvider.chatComplete(flatMessages, undefined, tools);
        }
    });

    if (!localStrict) {
        meshProviders.push({
            name: 'Pollinations (Backup)',
            run: async () => {
                const res = await pollinationsProvider.chatComplete(flatMessages, 'openai', 3, tools);
                if (!res || res.length < 5) throw new Error('Pollinations response too short');
                return res;
            }
        });
    }
    let lastError = '';

    // 1. Try Selected Model First (Happy Path)
    // Skip Groq here when it's cooling down (e.g. it just hit a 429 rate limit) —
    // otherwise EVERY request re-hammers Groq, eats a 429, and only then falls back,
    // which is the repeated "Groq 429 → LLM7" storm the user saw. When cooled down we
    // go straight to the mesh (which also defers Groq) until the limit resets.
    try {
        if (selectedModel.provider === 'groq' && hasGroqKey && !isProviderCoolingDown('Groq (Free)')) {
            // Groq is fast, but let's give it 15s
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000));
            const rawAns = await Promise.race([callGroq(selectedModel.model, effectiveMessages, onPartial, tools), timeoutPromise]) as string;
            const ans = cleanOutput(rawAns);
            markProviderOk('Groq (Free)'); // it worked — clear any cooldown
            if (!cacheDisabled && !hasSensitive && ans && ans.length > 20) {
                await LLMCacheTool.saveToCache(cacheKeyPayload, ans, selectedModel.model);
            }
            return ans;
        }

        // If not Groq or Groq fails, fall through to the Chain of Steel
    } catch (e: any) {
        console.warn(`[IntelligentRouter] Primary choice ${selectedModel.name} failed: ${e.message} `);
        // A 429 (rate limit) or 413 means Groq is temporarily unusable — cool it down
        // so neither the happy path nor the mesh keeps hammering it this minute.
        if (/\b(429|rate limit|413)\b/i.test(String(e?.message || ''))) markProviderFailed('Groq (Free)');
        lastError = e.message;
    }

    // 2. The Chain of Steel (Fallback Mesh)
    // PRIMARY-BRAIN ORDERING: the mesh is built with Local (Auto) FIRST, which is
    // right for an OFFLINE machine — but when a fast CLOUD brain is configured
    // (Groq/Gemini/Cerebras/Mistral key present) the local CPU model is only the
    // offline backup. Leaving it first makes a weak laptop grind through the slow
    // local model (up to LOCAL_LLM_TIMEOUT, minutes) before ever reaching Groq —
    // which is exactly why "Groq feels slow/fake": the system is really running
    // Local, not Groq. So push Local to the END whenever a cloud brain exists.
    const hasFastCloud = hasGroqKey || geminiProvider.isAvailable() || cerebrasProvider.isAvailable() || mistralProvider.isAvailable();
    if (hasFastCloud) {
        const localIdx = meshProviders.findIndex(p => p.name === 'Local (Auto)');
        if (localIdx >= 0) {
            const [local] = meshProviders.splice(localIdx, 1);
            meshProviders.push(local); // offline backup, tried only after cloud/keyless
        }
    }

    // Move providers that are in cooldown (recently failed) to the END of the order
    // rather than dropping them entirely — so if EVERY provider is cooling down we
    // still try them (best-effort) instead of falling through to the error. Fresh
    // providers are attempted first; cooled-down ones only as a last resort.
    const orderedProviders = orderByCooldown(meshProviders);
    const cooledNow = meshProviders.filter(p => isProviderCoolingDown(p.name));
    if (cooledNow.length) {
        console.info(`[IntelligentRouter] ⏭️  Deferring (cooldown): ${cooledNow.map(p => p.name).join(', ')}`);
    }

    for (const p of orderedProviders) {
        try {
            console.info(`[IntelligentRouter] 🔄 Attempting provider: ${p.name}...`);

            // Dynamic Timeout: Optimized for speed
            let timeoutValue = 8000; // Base 8s

            if (taskAnalysis?.complexity === 'high' || taskAnalysis?.complexity === 'extreme') {
                timeoutValue = 20000;
            }
            if (p.name === 'Local (Auto)') {
                // Local CPU inference — especially the first (cold) request that loads
                // the model into RAM — can take far longer than a network call. Give it
                // generous room (override with LOCAL_LLM_TIMEOUT ms) so Joe actually uses
                // the local brain instead of timing out and falling back to a weaker
                // keyless gateway. It still returns as soon as the model responds.
                const envT = parseInt(String(process.env.LOCAL_LLM_TIMEOUT || '').trim(), 10);
                timeoutValue = Number.isFinite(envT) && envT > 0 ? envT : 180000;
            }
            if (p.name === 'LLM7 (Keyless)' || p.name === 'DuckAI (Keyless)') {
                // Keyless gateways can be slower; give the keyless brains room.
                timeoutValue = taskAnalysis?.complexity === 'high' || taskAnalysis?.complexity === 'extreme' ? 25000 : 18000;
            }
            if (p.name === 'Pollinations (Backup)' || p.name === 'DeepSeek (Pollinations)') {
                timeoutValue = 6000;
            }

            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutValue));
            const rawAns = await Promise.race([p.run(), timeoutPromise]) as string;

            const ans = cleanOutput(rawAns);

            if (ans && ans.length > 2) {
                console.info(`[IntelligentRouter] ✅ Success via ${p.name} `);
                markProviderOk(p.name); // clear any prior cooldown — it works again
                if (!cacheDisabled && !hasSensitive && ans.length > 20) {
                    await LLMCacheTool.saveToCache(cacheKeyPayload, ans, selectedModel.model);
                }
                return ans;
            }
            // Empty/too-short answer counts as a soft failure — cool it down too so we
            // don't keep waiting on a gateway that returns nothing useful.
            markProviderFailed(p.name);
        } catch (e: any) {
            console.warn(`[IntelligentRouter] ${p.name} failed or timed out: ${e.message} `);
            markProviderFailed(p.name);
            lastError = e.message;
        }
    }

    // Final catch-all (Guarantee a response)
    try {
        if (localStrict) {
            return lastError || 'LOCAL_LLM_FAILED';
        }
        
        const promptText = flatMessages.map(m => String(m.content || '')).join('\n');
        const pLower = promptText.toLowerCase();

        // If asking for tool choice or JSON, generate structured JSON fallback
        if (promptText.includes('Choose the single best tool') || promptText.includes('JSON Format') || tools?.length) {
            if (pLower.includes('browser') || pLower.includes('web') || pLower.includes('متصفح') || pLower.includes('افتح') || pLower.includes('ابحث')) {
                return JSON.stringify({ tool: "browser_run", args: { instructionText: promptText }, reasoning: "Emergency offline routing for browser" });
            }
            if (pLower.includes('read') || pLower.includes('اقرأ') || pLower.includes('عرض')) {
                return JSON.stringify({ tool: "read_file", args: { path: "package.json" }, reasoning: "Emergency offline routing for read" });
            }
            if (pLower.includes('write') || pLower.includes('create') || pLower.includes('أنشئ') || pLower.includes('اكتب')) {
                return JSON.stringify({ tool: "write_file", args: { path: "output.txt", content: promptText }, reasoning: "Emergency offline routing for write" });
            }
            return JSON.stringify({ tool: "central_answer", args: { question: promptText }, reasoning: "Emergency offline routing for general" });
        }

        // Standard text fallback
        console.error(`[IntelligentRouter] CRITICAL: All LLM providers failed. Returning honest error.`);
        return "⚠️ تعذّر الوصول إلى محرّك الذكاء (لم يستجب أي مزوّد). لم أستطع تنفيذ الطلب. "
            + "الحل: شغّل Ollama محلياً (افتح تطبيق Ollama أو نفّذ: ollama serve) ثم أعد المحاولة، "
            + "أو تحقّق من اتصال الإنترنت لاستخدام الذكاء المجّاني. (لن أدّعي أنني نفّذت شيئاً لم يُنفَّذ.)";
    } catch (e: any) {
        return "⚠️ تعذّر الوصول إلى محرّك الذكاء ولم يُنفَّذ الطلب. شغّل Ollama محلياً أو تحقّق من الإنترنت ثم أعد المحاولة.";
    }
}

/**
 * Suggest a correction after a tool failure
 */
export async function suggestCorrection(
    error: any,
    failedTool: string,
    originalTask: string,
    analysis?: TaskAnalysis
): Promise<{ action: string; input: any } | null> {
    try {
        const taskAnalysis = analysis || analyzeTask(originalTask);
        const systemPrompt = `The AI was trying to execute a task but the tool failed. 
Analyze the error and suggest a correction(alternative tool or modified parameters).
Respond ONLY with a JSON object: { "name": "tool_name", "input": { } } or { "no_correction": true } `;

        const userMessage = `Task: ${originalTask} \nFailed Tool: ${failedTool} \nError: ${JSON.stringify(error)} `;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        const responseText = await routeToModel(messages, taskAnalysis);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const correction = JSON.parse(jsonMatch[0]);
            if (correction.no_correction) return null;
            return { action: correction.name, input: correction.input };
        }
    } catch { }
    return null;
}

/**
 * HONEST per-provider verification. Tests the SPECIFIC provider the user selected
 * — never the whole free mesh — so a GREEN dot means THAT provider actually
 * answered. A key-required provider with no key reports "needs a key" instead of
 * borrowing another provider's success (which is what the old mesh-routed verify
 * did, making every free provider look connected even when it wasn't).
 */
export async function verifyProviderDirect(
    provider: string,
    cfg: { apiKey?: string; baseUrl?: string; model?: string } = {}
): Promise<{ ok: boolean; provider: string; detail: string }> {
    const p = String(provider || '').trim().toLowerCase();
    const probe = [{ role: 'user', content: 'Reply with the single word: OK' }] as any[];
    const key = String(cfg.apiKey || '').trim();
    const hasRealKey = !!key && !/^(free-mode|auto-mode|dummy)$/i.test(key);
    const withTimeout = <T,>(pr: Promise<T>, ms = 20000) => Promise.race([
        pr, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
    const nonEmpty = (s: any) => !!(s && String(s).trim().length > 0);
    const envKey = (...names: string[]) => names.map(n => (process.env[n] || '').trim()).find(Boolean) || '';

    try {
        // AUTO is the free mesh itself — testing the mesh is the honest meaning here.
        if (p === 'auto') {
            const ans = await withTimeout(routeToModel(probe, undefined, undefined, undefined, undefined, undefined, undefined,
                { modelConfig: { provider: 'auto', apiKey: 'auto-mode' } }));
            return { ok: nonEmpty(ans), provider, detail: nonEmpty(ans) ? 'mesh_ok' : 'mesh_empty' };
        }

        // A real user key → test THAT provider directly via the custom (non-mesh) route.
        if (hasRealKey) {
            const ans = await withTimeout(routeToModel(probe, undefined, undefined, undefined, undefined, undefined, undefined,
                { modelConfig: { provider: p, apiKey: key, baseUrl: cfg.baseUrl, model: cfg.model } }));
            return { ok: nonEmpty(ans), provider, detail: nonEmpty(ans) ? 'key_ok' : 'key_empty' };
        }

        // No user key: test the specific provider on its own (its env key, or keyless).
        switch (p) {
            case 'deepseek': {
                const ans = await withTimeout(deepSeekProvider.chatComplete(probe as any));
                return { ok: nonEmpty(ans), provider, detail: 'keyless_pollinations' };
            }
            case 'openrouter': {
                // OpenRouter requires a (free) key even for its free models — the
                // 'dummy' key 401s. Report that honestly instead of a bare failure.
                if (!envKey('OPENROUTER_API_KEY')) return { ok: false, provider, detail: 'no_key: OpenRouter يحتاج مفتاحاً مجانياً من openrouter.ai/keys.' };
                const ans = await withTimeout(openRouterProvider.chatComplete(probe, cfg.model || 'moonshotai/kimi-k2:free'));
                return { ok: nonEmpty(ans), provider, detail: 'env_key' };
            }
            case 'groq': {
                if (!envKey('GROQ_API_KEY')) return { ok: false, provider, detail: 'no_key: ضع مفتاح gsk_ في الحقل بالأعلى، أو اضبط GROQ_API_KEY.' };
                const ans = await withTimeout(groqProvider.chatComplete(probe, cfg.model || 'llama-3.3-70b-versatile'));
                return { ok: nonEmpty(ans), provider, detail: 'env_key' };
            }
            case 'gemini':
            case 'google': {
                if (!envKey('GOOGLE_API_KEY', 'GEMINI_API_KEY')) return { ok: false, provider, detail: 'no_key: يحتاج GOOGLE_API_KEY.' };
                const ans = await withTimeout(geminiProvider.chatComplete(probe as any, cfg.model || 'gemini-2.0-flash'));
                return { ok: nonEmpty(ans), provider, detail: 'env_key' };
            }
            case 'cerebras': {
                if (!envKey('CEREBRAS_API_KEY')) return { ok: false, provider, detail: 'no_key: يحتاج CEREBRAS_API_KEY (مجاني من cloud.cerebras.ai).' };
                const ans = await withTimeout(cerebrasProvider.chatComplete(probe as any, cfg.model || 'llama-3.3-70b'));
                return { ok: nonEmpty(ans), provider, detail: 'env_key' };
            }
            case 'mistral': {
                if (!envKey('MISTRAL_API_KEY')) return { ok: false, provider, detail: 'no_key: يحتاج MISTRAL_API_KEY (مجاني من console.mistral.ai).' };
                const ans = await withTimeout(mistralProvider.chatComplete(probe as any, cfg.model || 'mistral-small-latest'));
                return { ok: nonEmpty(ans), provider, detail: 'env_key' };
            }
            case 'openai':
            case 'anthropic':
            case 'grok':
                return { ok: false, provider, detail: 'no_key: مزوّد مدفوع — ضع مفتاحه في الحقل بالأعلى للتحقّق منه.' };
            default: {
                // Unknown provider name — fall back to an honest mesh probe.
                const ans = await withTimeout(routeToModel(probe, undefined, undefined, undefined, undefined, undefined, undefined,
                    { modelConfig: { provider: p, apiKey: 'free-mode' } }));
                return { ok: nonEmpty(ans), provider, detail: 'mesh_fallback' };
            }
        }
    } catch (e: any) {
        return { ok: false, provider, detail: String(e?.message || e).slice(0, 160) };
    }
}

export default {
    analyzeTask,
    advancedAnalyzeTask,
    selectBestModel,
    routeToModel,
    generateActionPlan,
    suggestCorrection,
    verifyProviderDirect,
    MODELS
};
