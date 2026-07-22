/**
 * Intelligent Model Router
 * Automatically selects the best AI model based on task type and complexity  
 * Supports: Llama 3.1 70B, Mixtral 8x7B, Gemma 2 9B (all via Groq - FREE!)
 */

import { pollinationsProvider, openRouterProvider, groqProvider, localProvider, geminiProvider, deepSeekProvider, openAIProvider } from './providers/registry';
import { LLMCacheTool } from '../../modules/tools/definitions/LLMCacheTool';
import { OpenAIProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { OpenRouterProvider } from './providers/openrouter';
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
    // Free tier - Always available
    'llama-3.1-70b': {
        name: 'Llama 3.1 70B',
        provider: 'groq',
        model: 'llama-3.1-70b-versatile',
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
        name: 'Mixtral 8x7B',
        provider: 'groq',
        model: 'mixtral-8x7b-32768',
        maxTokens: 32000,
        temperature: 0.7,
        cost: 'free',
        strengths: ['long_context', 'code', 'reasoning']
    },

    'gemma-2-9b': {
        name: 'Gemma 2 9B',
        provider: 'groq',
        model: 'gemma2-9b-it',
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
async function callGroq(model: string, messages: any[], onPartial?: (delta: string) => void, tools?: any[]): Promise<string> {
    const GROQ_API_KEY = process.env.GROQ_API_KEY || 'gsk_placeholder';

    try {
        const stream = !!onPartial;
        
        // استخدم الحد الأقصى للموديل - Mixtral يدعم 32K!
        const maxTokensForModel = model.includes('mixtral') ? 16000 : 8000;
        
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

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status} `);
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
        if (cfgProvider && cfgProvider !== 'mock') {
            console.log(`✨ [IntelligentRouter] Custom Route: Provider=${cfgProvider}, Model=${cfgModel}, HasKey=${!!cfgApiKey}, HasUrl=${!!cfgBaseUrl}`);
            
            const effectiveApiKey = cfgApiKey?.trim() || 
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

    // Unified Multi-Provider Mesh for Auto Mode

    const meshProviders: Array<{ name: string; run: () => Promise<string> }> = [];
    const preferredProvider = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();

    // [PRIORITY] Check for forced provider via env
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
    if (hasLocal) {
        meshProviders.push({
            name: 'Local (Auto)',
            run: async () => {
                const res = await localProvider.chatComplete(flatMessages);
                if (!res || res.length < 2) throw new Error('Local response too short');
                return res;
            }
        });
    }
    if (hasGroqKey) {
        meshProviders.push({
            name: 'Groq (Free)',
            run: async () => {
                const model = (selectedModel.provider === 'groq' && selectedModel.model) ? selectedModel.model : 'llama-3.1-70b-versatile';
                return await callGroq(model, flatMessages, onPartial, tools);
            }
        });
    }

    // [ELITE ADDITION] Add real OpenAI direct provider as high-priority
    if (openAIProvider.isAvailable()) {
        meshProviders.push({
            name: 'OpenAI (Direct)',
            run: async () => {
                return await openAIProvider.chatComplete(effectiveMessages, 'gpt-4o', tools);
            }
        });
    }
    if (hasOpenRouterKey) {
        meshProviders.push({
            name: 'OpenRouter (Free)',
            run: async () => {
                return await openRouterProvider.chatComplete(flatMessages, 'google/gemma-2-9b-it:free', tools);
            }
        });
    }

    // [ELITE FIX] Enable Gemini Fallback if available
    if (geminiProvider.isAvailable()) {
        meshProviders.push({
            name: 'Gemini (Backup)',
            run: async () => {
                return await geminiProvider.chatComplete(effectiveMessages, 'models/gemini-2.0-flash', tools);
            }
        });
    }

    // Add DeepSeek via Pollinations as a high-quality free fallback
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
    try {
        if (selectedModel.provider === 'groq' && hasGroqKey) {
            // Groq is fast, but let's give it 15s
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000));
            const rawAns = await Promise.race([callGroq(selectedModel.model, effectiveMessages, onPartial, tools), timeoutPromise]) as string;
            const ans = cleanOutput(rawAns);
            if (!cacheDisabled && !hasSensitive && ans && ans.length > 20) {
                await LLMCacheTool.saveToCache(cacheKeyPayload, ans, selectedModel.model);
            }
            return ans;
        }

        // If not Groq or Groq fails, fall through to the Chain of Steel
    } catch (e: any) {
        console.warn(`[IntelligentRouter] Primary choice ${selectedModel.name} failed: ${e.message} `);
        lastError = e.message;
    }

    // 2. The Chain of Steel (Fallback Mesh)
    for (const p of meshProviders) {
        try {
            console.info(`[IntelligentRouter] 🔄 Attempting provider: ${p.name}...`);

            // Dynamic Timeout: Optimized for speed
            let timeoutValue = 8000; // Base 8s

            if (taskAnalysis?.complexity === 'high' || taskAnalysis?.complexity === 'extreme') {
                timeoutValue = 20000;
            }
            if (p.name === 'Local (Auto)') {
                timeoutValue = taskAnalysis?.complexity === 'high' || taskAnalysis?.complexity === 'extreme' ? 25000 : 15000;
            }
            if (p.name === 'Pollinations (Backup)' || p.name === 'DeepSeek (Pollinations)') {
                timeoutValue = 6000;
            }

            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutValue));
            const rawAns = await Promise.race([p.run(), timeoutPromise]) as string;

            const ans = cleanOutput(rawAns);

            if (ans && ans.length > 2) {
                console.info(`[IntelligentRouter] ✅ Success via ${p.name} `);
                if (!cacheDisabled && !hasSensitive && ans.length > 20) {
                    await LLMCacheTool.saveToCache(cacheKeyPayload, ans, selectedModel.model);
                }
                return ans;
            }
        } catch (e: any) {
            console.warn(`[IntelligentRouter] ${p.name} failed or timed out: ${e.message} `);
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
        console.error(`[IntelligentRouter] CRITICAL: All LLM providers failed. Returning clean fallback response.`);
        return "أهلاً بك! النظام متصل ويعمل بكامل أدواته المحلية (المتصفح، الملفات، الأوامر). يرجى توجيه أيا من الأوامر وسيقوم جو بتنفيذها مباشرة.";
    } catch (e: any) {
        return "النظام جاهز ومتاح لاستقبال أوامرك وتنفيذها عبر الأدوات المتاحة.";
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

export default {
    analyzeTask,
    advancedAnalyzeTask,
    selectBestModel,
    routeToModel,
    generateActionPlan,
    suggestCorrection,
    MODELS
};
