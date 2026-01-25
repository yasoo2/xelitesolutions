/**
 * Intelligent Model Router
 * Automatically selects the best AI model based on task type and complexity  
 * Supports: Llama 3.1 70B, Mixtral 8x7B, Gemma 2 9B (all via Groq - FREE!)
 */

// Use dynamic import to avoid circular dependency
let hack: any = null;
let openrouter: any = null;

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
export async function advancedAnalyzeTask(userMessage: string, history?: any[], onProgress?: (msg: string) => void): Promise<TaskAnalysis> {
    onProgress?.('🧠 تحليل عميق لطلبك... (Neural Analysis)');
    const hasGroq = !!(process.env.GROQ_API_KEY?.trim());
    const hasOpenAI = !!(process.env.OPENAI_API_KEY?.trim());

    try {
        // [OPTIMIZATION] If query is short, skip LLM-based analysis to save TBT (Time to Bot Talk)
        if (userMessage.length < 120) {
            console.info('[IntelligentRouter] Short message - using fast regex analysis');
            return analyzeTask(userMessage);
        }

        let analyst = 'openai';
        let provider = 'hack'; // Default to Pollinations

        if (hasGroq) {
            console.info('[IntelligentRouter] ⚡ Using Groq (Llama 3) for instant analysis');
            analyst = 'llama-3.1-8b-instant';
            provider = 'groq';
        } else if (hasOpenAI) {
            analyst = 'gpt-4o-mini'; // Faster/Cheaper for analysis
            provider = 'openai';
        }

        const systemPrompt = `Analyze the following user request and return a JSON object.
Be extremely strict with complexity:
- "extreme": Building full applications, complex systems, multi-step deployment, or "from scratch" projects.
- "high": Complex coding tasks, deep analysis, or multi-module changes.
- "medium": Browser automation, explaining complex concepts (like Kubernetes), single component logic, or multi-step file operations.
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
} - Do not add any talk before or after JSON.`;

        onProgress?.('🔍 تحديد نوع المهمة ومدى تعقيدها... (Task Classification)');


        let responseText = "";
        if (provider === 'groq') {
            responseText = await callGroq(analyst, [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }]);
        } else if (provider === 'openai') {
            const llm = require('../llm');
            responseText = await llm.callLLM(userMessage, [{ role: 'system', content: systemPrompt }], 'system_analyst');
        } else {
            if (!hack) {
                // Use require to bypass TS1323 and handle circular dependency
                const llm = require('../llm');
                hack = llm.pollinationsProvider;
            }
            responseText = await hack.chatComplete([{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], 'openai');
        }

        // Clean JSON response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            return {
                ...analysis,
                estimatedTokens: userMessage.length * 10
            };
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
        const systemPrompt = `You are a technical planner. Break down the user's request into 3-5 logical steps. 
Respond ONLY with a numbered list of steps.`;

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
    const arabicRatio = (userMessage.match(/[\u0600-\u06FF]/g) || []).length / (userMessage.length || 1);
    const hasArabicWords = /(أنا|أنت|هو|هي|نحن|في|من|على|إلى|عن|مع|هل|كيف|لماذا|متى|أين|ماذا|كم)/.test(userMessage);
    const language: 'ar' | 'en' | 'mixed' =
        arabicRatio > 0.5 || (arabicRatio > 0.1 && hasArabicWords) ? 'ar' :
            arabicRatio > 0.1 ? 'mixed' : 'en';

    // SPEED OPTIMIZATION: Check for Fast Lane candidates immediately
    const isShortQuestion = length < 60 && /(ما|من|كيف|اين|متى|what|who|how|where|when)/i.test(msg);

    // Task type detection
    let taskType: TaskAnalysis['type'] = 'simple_chat';
    let requiresTools = false;

    // Browser/automation tasks
    if (/(open|افتح|browse|متصفح|click|انقر|extract|استخرج)/i.test(msg)) {
        taskType = 'browser_task';
        requiresTools = true;
    }
    // File/System Operations
    else if (/(file|folder|directory|system|terminal|command|ملف|مجلد|نظام|امر)/i.test(msg) && /(create|write|read|edit|delete|run|execute|list|انشئ|اكتب|اقرأ|عدل|احذف|شغل|نفذ|اعرض)/i.test(msg)) {
        taskType = 'code_generation';
        requiresTools = true;
    }
    // Code generation
    else if (/(code|كود|function|دالة|class|كلاس|api|endpoint|implement|نفذ|build|ابني|create|انشئ|app|تطبيق)/i.test(msg)) {
        taskType = 'code_generation';
        requiresTools = length > 100; // Complex code needs tools
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
    if (/(build.*application|ابني.*تطبيق|full.*system|نظام.*كامل|million|مليون|large.*scale|واسع.*النطاق)/i.test(msg)) {
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
        if (availableKeys?.openai || process.env.OPENAI_API_KEY) return MODELS['gpt-4o'];
        if (availableKeys?.anthropic || process.env.ANTHROPIC_API_KEY) return MODELS['claude-3.5-sonnet'];
        // Fallback to Pollinations (which uses OpenAI) if no keys
        return MODELS['pollinations'];
    }

    // Fallback logic for FREE models
    if (!hasGroq) {
        // If user wants free, we don't force GPT-4o here.
        // We will default to the best free strategy in routeToModel.
        console.info('[IntelligentRouter] Groq key missing. defaulting to Free Model Strategy.');
        return MODELS['mixtral-8x7b']; // Placeholder config, will be handled by fallback loop
    }

    // For extreme complexity with available premium keys
    if (analysis.complexity === 'extreme') {
        if (availableKeys?.anthropic) return MODELS['claude-3.5-sonnet'];
        if (availableKeys?.openai) return MODELS['gpt-4o'];
    }

    // Task-specific selection (free tier)
    switch (analysis.type) {
        case 'code_generation':
            if (analysis.complexity === 'high') return MODELS['mixtral-8x7b'];
            return MODELS['gemma-2-9b'];

        case 'complex_reasoning':
            // Arabic reasoning ALWAYS gets the big model
            if (analysis.language === 'ar') return MODELS['llama-3.1-70b'];
            return MODELS['llama-3.1-70b'];

        case 'creative':
            if (availableKeys?.openai) return MODELS['gpt-4o'];
            return MODELS['llama-3.1-70b'];

        case 'data_analysis':
            return MODELS['gemma-2-9b'];

        case 'browser_task':
            return MODELS['llama-3.1-8b']; // Fast for quick decisions

        case 'simple_chat':
        default:
            // SPEED OPTIMIZATION: Use 8B Instant for simple Arabic queries
            const isFactual = /(who\s*is|what\s*is|man\s*huwa|president|ruler|king|minister|من\s*هو|من\s*هي|رئيس|حاكم|ملك|وزير|الحالي|عاصمة|ماهي|ماهو)/i.test(analysis.shortSummary || '');

            if (analysis.language === 'ar') {
                if (!isFactual && (analysis.complexity === 'low' || analysis.estimatedTokens < 500)) {
                    return MODELS['llama-3.1-8b']; // FAST LANE ⚡
                }
                return MODELS['llama-3.1-70b'];
            }

            if (isFactual) return MODELS['llama-3.1-70b'];
            if (analysis.estimatedTokens > 16000) return MODELS['mixtral-8x7b'];
            return MODELS['llama-3.1-70b'];
    }
}

/**
 * Make API call to Groq (free Llama/Mixtral/Gemma models)
 */
/**
 * Make API call to Groq (free Llama/Mixtral/Gemma models)
 */
async function callGroq(model: string, messages: any[], onPartial?: (delta: string) => void): Promise<string> {
    const GROQ_API_KEY = process.env.GROQ_API_KEY || 'gsk_placeholder';

    try {
        const stream = !!onPartial;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.7,
                max_tokens: 8000,
                stream
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status}`);
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
    onProgress?: (msg: string) => void
): Promise<string> {

    // Flatten multimodal messages for text-only providers (and for analysis)
    const flatMessages = flattenMultimodalMessages(messages);

    // Analyze if not provided (using flat messages for analysis)
    const taskAnalysis = analysis || analyzeTask(
        flatMessages.find(m => m.role === 'user')?.content || ''
    );

    // Select best model
    const selectedModel = analysis?.suggestedModel ? MODELS[analysis.suggestedModel] || MODELS['llama-3.1-70b'] : selectBestModel(taskAnalysis, availableKeys);

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

    // Check if Groq API key available
    const hasGroqKey = !!(process.env.GROQ_API_KEY?.trim());

    // Unified Multi-Provider Mesh for Auto Mode

    // Order: OpenAI (if key) -> Groq (Free) -> OpenRouter (Free) -> Pollinations (Backup)
    const providers = [
        {
            name: 'OpenAI',
            run: async () => {
                if (selectedModel.provider === 'openai' || selectedModel.provider === 'anthropic') {
                    if (process.env.OPENAI_API_KEY) {
                        // Use standard invocation (implied by not throwing here)
                        // But we need to actually CALL it.
                        // existing logic below handles "if provider === 'openai' ..."
                        // To fit into loop, we refactor slighty or just use the loop for FALLBACKs.
                        throw new Error('Pass-through to main logic');
                    }
                    throw new Error('No OpenAI Key');
                }
                throw new Error('Not OpenAI model');
            }
        },
        {
            name: 'Groq (Free)',
            run: async () => {
                if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'gsk_placeholder') {
                    throw new Error('Skipping Groq: No API Key');
                }
                try {
                    const model = selectedModel.provider === 'groq' ? selectedModel.model : MODELS['llama-3.1-70b'].model;
                    // Llama is text-only, so force flatMessages if selecting Llama, otherwise effectiveMessages (if we add Llama vision later)
                    // For now, Groq models are text only.
                    return await callGroq(model, flatMessages, onPartial);
                } catch (e: any) { throw e; }
            }
        },
        {
            name: 'OpenRouter (Free)',
            run: async () => {
                if (!process.env.OPENROUTER_API_KEY) {
                    throw new Error('Skipping OpenRouter: No API Key');
                }
                if (!openrouter) {
                    const llm = require('../llm');
                    openrouter = llm.openRouterProvider;
                }
                // Try a very smart free model
                return await openrouter.chatComplete(effectiveMessages, 'google/gemma-2-9b-it:free');
            }
        },
        {
            name: 'Pollinations (Backup)',
            run: async () => {
                if (!hack) {
                    const llm = require('../llm');
                    hack = llm.pollinationsProvider;
                }
                return await hack.chatComplete(effectiveMessages, 'openai');
            }
        }
    ];

    let lastError = '';

    // 1. Try Selected Model First (Happy Path)
    try {
        if (selectedModel.provider === 'groq' && hasGroqKey) {
            // Groq is fast, but let's give it 15s
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000));
            return await Promise.race([callGroq(selectedModel.model, flatMessages, onPartial), timeoutPromise]) as string;
        }
        if (selectedModel.provider === 'openai' && process.env.OPENAI_API_KEY) {
            throw new Error('UseLegacyOpenAIPath');
        }
    } catch (e: any) {
        if (e.message !== 'UseLegacyOpenAIPath') {
            console.warn(`[IntelligentRouter] Primary choice ${selectedModel.name} failed: ${e.message}`);
        }
    }

    // 2. The Chain of Steel (Fallback Mesh)
    for (const p of providers) {
        try {
            // Skip OpenAI in loop if we know we want free/auto fallback
            if (p.name === 'OpenAI') continue;

            onProgress?.(`🛰️ محاولة عبر المزود: ${p.name}...`);
            console.info(`[IntelligentRouter] 🔄 Attempting provider: ${p.name}...`);

            // Dynamic Timeout: Complex tasks need more time (up to 60s for the mesh)
            let timeoutValue = 10000; // Base 10s
            if (analysis?.complexity === 'high' || analysis?.complexity === 'extreme') {
                timeoutValue = 30000; // 30s for complex
            }
            if (p.name === 'Pollinations (Backup)') {
                timeoutValue = 60000; // 60s for the ultimate fallback
            }

            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutValue));
            const ans = await Promise.race([p.run(), timeoutPromise]) as string;

            if (ans) {
                console.info(`[IntelligentRouter] ✅ Success via ${p.name}`);
                return ans;
            }
        } catch (e: any) {
            console.warn(`[IntelligentRouter] ${p.name} failed or timed out: ${e.message}`);
            lastError = e.message;
        }
    }

    // Final catch-all (Guarantee a response to avoid "empty model output" error)
    try {
        if (!hack) {
            const llm = require('../llm');
            hack = llm.pollinationsProvider;
        }
        const finalAns = await hack.chatComplete(messages, 'openai');
        return finalAns || "أعتذر، حدثت مشكلة في الاتصال. كيف يمكنني مساعدتك؟";
    } catch {
        return "أعتذر، جميع مزودات الـ AI مشغولة حالياً. يرجى المحاولة بعد لحظات.";
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
Analyze the error and suggest a correction (alternative tool or modified parameters).
Respond ONLY with a JSON object: { "name": "tool_name", "input": { } } or { "no_correction": true }`;

        const userMessage = `Task: ${originalTask}\nFailed Tool: ${failedTool}\nError: ${JSON.stringify(error)}`;

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
