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

export interface TaskAnalysis {
    type: 'simple_chat' | 'complex_reasoning' | 'code_generation' | 'creative' | 'data_analysis' | 'browser_task';
    complexity: 'low' | 'medium' | 'high' | 'extreme';
    requiresTools: boolean;
    estimatedTokens: number;
    language: 'ar' | 'en' | 'mixed';
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
export function analyzeTask(userMessage: string, conversationHistory?: any[]): TaskAnalysis {
    const msg = userMessage.toLowerCase();
    const length = userMessage.length;

    // Detect language
    const arabicRatio = (userMessage.match(/[\u0600-\u06FF]/g) || []).length / userMessage.length;
    const language: 'ar' | 'en' | 'mixed' =
        arabicRatio > 0.7 ? 'ar' : arabicRatio > 0.3 ? 'mixed' : 'en';

    // Task type detection
    let taskType: TaskAnalysis['type'] = 'simple_chat';
    let requiresTools = false;

    // Browser/automation tasks
    if (/(open|افتح|browse|متصفح|click|انقر|extract|استخرج)/i.test(msg)) {
        taskType = 'browser_task';
        requiresTools = true;
    }

    // Code generation
    else if (/(code|كود|function|دالة|class|كلاس|api|endpoint|implement|نفذ|build|ابني|create.*app|انشئ.*تطبيق)/i.test(msg)) {
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

    // Complex reasoning
    else if (/(explain|اشرح|why|لماذا|how.*work|كيف.*يعمل|design|تصميم|architecture|معمارية|plan|خطة)/i.test(msg)) {
        taskType = 'complex_reasoning';
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

    return {
        type: taskType,
        complexity,
        requiresTools,
        estimatedTokens: Math.min(length * 10, 8000),
        language
    };
}

/**
 * Advanced Task Analysis using LLM
 * Uses a lightweight model to deeply understand the task
 */
export async function advancedAnalyzeTask(userMessage: string, history?: any[]): Promise<TaskAnalysis> {
    const hasGroq = !!(process.env.GROQ_API_KEY?.trim());
    const length = userMessage.length;

    // CRITICAL: Skip LLM analysis for simple/short messages to avoid double-hitting free rate limits
    // Also skip if it's clearly a greeting or very short question
    if (length < 100 || (!hasGroq && length < 250) || /^(hi|hello|مرحبا|اهلا|سلام)/i.test(userMessage)) {
        console.info('[IntelligentRouter] Skipping LLM analysis for simple/short request');
        return analyzeTask(userMessage, history);
    }

    try {
        const analyst = hasGroq ? 'llama-3.1-8b-instant' : 'openai'; // Use Pollinations if no Groq
        const provider = hasGroq ? 'groq' : 'hack';

        const systemPrompt = `Analyze the following user request and return a JSON object with:
{
  "type": "simple_chat" | "complex_reasoning" | "code_generation" | "creative" | "data_analysis" | "browser_task",
  "complexity": "low" | "medium" | "high" | "extreme",
  "requiresTools": boolean,
  "language": "ar" | "en" | "mixed",
  "shortSummary": "string"
}`;

        let responseText = "";
        if (provider === 'groq') {
            responseText = await callGroq(analyst, [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }]);
        } else {
            if (!hack) {
                const llm = await import('../llm');
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
    if (analysis.complexity === 'low' || analysis.type === 'simple_chat') return [];

    try {
        const systemPrompt = `You are a technical planner. Break down the user's request into 3-5 logical steps. 
Respond ONLY with a numbered list of steps.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        // Use a stronger model for planning if possible
        const response = await routeToModel(messages, { ...analysis, complexity: 'medium' });
        return response.split('\n').filter(line => /^\d+\./.test(line.trim()));
    } catch {
        return [];
    }
}

/**
 * Select the best model based on task analysis
 */
export function selectBestModel(analysis: TaskAnalysis, availableKeys?: {
    anthropic?: string;
    openai?: string;
}): ModelConfig {

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
            if (analysis.estimatedTokens > 16000) return MODELS['mixtral-8x7b'];
            return MODELS['llama-3.1-70b'];
    }
}

/**
 * Make API call to Groq (free Llama/Mixtral/Gemma models)
 */
async function callGroq(model: string, messages: any[]): Promise<string> {
    const GROQ_API_KEY = process.env.GROQ_API_KEY || 'gsk_placeholder'; // We'll add free key

    try {
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
                max_tokens: 8000
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
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
    availableKeys?: { anthropic?: string; openai?: string; groq?: string; }
): Promise<string> {

    // Analyze if not provided
    const taskAnalysis = analysis || analyzeTask(
        messages.find(m => m.role === 'user')?.content || ''
    );

    // Select best model
    const selectedModel = selectBestModel(taskAnalysis, availableKeys);

    console.info(`[IntelligentRouter] Selected: ${selectedModel.name} for ${taskAnalysis.type} (${taskAnalysis.complexity})`);

    // Check if Groq API key available
    const hasGroqKey = !!(process.env.GROQ_API_KEY?.trim());

    // If no Groq key and selected model needs it → use Pollinations directly
    if (!hasGroqKey && selectedModel.provider === 'groq') {
        console.info('[IntelligentRouter] No Groq key - using FREE Pollinations instead');
        if (!hack) {
            const llm = await import('../llm');
            hack = llm.pollinationsProvider;
        }
        return await hack.chatComplete(messages, 'openai');
    }

    try {
        // Route to appropriate provider
        if (selectedModel.provider === 'groq') {
            return await callGroq(selectedModel.model, messages);
        }

        if (selectedModel.provider === 'hack') {
            if (!hack) {
                const llm = await import('../llm');
                hack = llm.pollinationsProvider;
            }
            return await hack.chatComplete(messages, 'openai');
        }

        if (selectedModel.provider === 'openrouter') {
            if (!openrouter) {
                const llm = await import('../llm');
                openrouter = llm.openRouterProvider;
            }
            return await openrouter.chatComplete(messages, selectedModel.model);
        }

        // For Anthropic/OpenAI - would need separate implementation
        throw new Error(`Provider ${selectedModel.provider} not yet implemented`);

    } catch (error: any) {
        console.error(`[IntelligentRouter] ${selectedModel.name} failed, using fallback...`);

        // Fallback cascade: Try Groq models if key available, otherwise Pollinations
        if (hasGroqKey) {
            try {
                if (selectedModel.model !== MODELS['llama-3.1-70b'].model) {
                    console.info('[IntelligentRouter] Fallback to Llama 3.1 70B');
                    return await callGroq(MODELS['llama-3.1-70b'].model, messages);
                }
            } catch { }

            try {
                console.info('[IntelligentRouter] Fallback to Llama 3.1 8B');
                return await callGroq(MODELS['llama-3.1-8b'].model, messages);
            } catch { }
        }

        // Final fallback - Always available (FREE)
        console.info('[IntelligentRouter] Final fallback to Pollinations (FREE)');
        if (!hack) {
            const llm = await import('../llm');
            hack = llm.pollinationsProvider;
        }
        return await hack.chatComplete(messages, 'openai');
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
Respond ONLY with a JSON object: { "name": "tool_name", "input": { ... } } or { "no_correction": true }`;

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
