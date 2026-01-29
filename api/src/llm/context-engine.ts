/**
 * Context-Aware Pattern Matching Engine
 * Understands conversation context and multi-turn interactions
 */

export interface ConversationContext {
    userId: string;
    sessionId: string;
    history: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
        timestamp: number;
        tools?: string[];
    }>;
    entities: Map<string, any>; // Extracted entities (names, files, URLs, etc.)
    intent: string | null; // Current conversation intent
    lastToolUsed: string | null;
    browserSessionActive: boolean;
    projectContext: {
        type?: string; // 'web', 'mobile', 'api', etc.
        files?: string[];
        language?: string;
    } | null;
}

export interface ContextualIntent {
    primary: string; // Main intent
    secondary?: string; // Follow-up intent
    confidence: number; // 0-1
    requiresClarification: boolean;
    suggestedAction: string;
    entities: Record<string, any>;
}

/**
 * Extract entities from conversation
 */
export function extractEntities(text: string, history?: any[]): Record<string, any> {
    const entities: Record<string, any> = {};

    // Names (Arabic & English)
    const namePatterns = [
        /(?:اسمي|انا|أنا|name is|i am|i'm)\s+([أ-يa-z]+(?:\s+[أ-يa-z]+)?)/gi,
        /(?:call me|ناديني|سمني)\s+([أ-يa-z]+)/gi
    ];

    for (const pattern of namePatterns) {
        const matches = [...text.matchAll(pattern)];
        const first = matches.find(m => (m[1] || '').trim().length > 0);
        if (first?.[1]) {
            const raw = first[1].trim();
            const cleaned = raw
                .replace(/\b(and|then|و|ثم)\b.*$/i, '')
                .replace(/[^\p{L}\s-]/gu, '')
                .trim();
            entities.userName = cleaned;
            break;
        }
    }

    // File paths
    const filePaths = text.match(/(?:\/[\w.-]+)+\.\w+|[\w.-]+\.(?:js|ts|tsx|jsx|py|java|go|rs|cpp|c|h|css|html|json|yml|yaml|md)/gi);
    if (filePaths) {
        entities.files = filePaths;
    }

    // URLs
    const urls = text.match(/https?:\/\/[^\s"'<>]+/gi);
    if (urls) {
        entities.urls = urls;
    }

    // Dependencies (npm/python)
    const depPatterns = /\b(install|add|package|library|مكتبة|تثبيت)\s+([\w@/-]+)/gi;
    const deps = [...text.matchAll(depPatterns)].map(m => m[2]);
    if (deps.length > 0) {
        entities.dependencies = deps;
    }

    // Programming languages
    const langPatterns = [
        /\b(javascript|typescript|python|java|golang|rust|c\+\+|react|vue|angular|node|express|django|flask|spring)\b/gi,
        /\b(جافا\s*سكريبت|بايثون|تايب\s*سكريبت|ري?اكت)\b/gi
    ];

    for (const pattern of langPatterns) {
        const langs = text.match(pattern);
        if (langs) {
            entities.programmingLanguages = langs.map(l => l.toLowerCase());
        }
    }

    // Project types
    if (/\b(website|web\s*app|landing\s*page|موقع|تطبيق\s*ويب|صفحة|سايت)\b/i.test(text)) {
        entities.projectType = 'web';
    } else if (/\b(api|endpoint|rest|graphql|واجهة\s*برمجية)\b/i.test(text)) {
        entities.projectType = 'api';
    } else if (/\b(mobile\s*app|android|ios|react\s*native|flutter|تطبيق\s*جوال|موبايل)\b/i.test(text)) {
        entities.projectType = 'mobile';
    }

    return entities;
}

/**
 * Analyze conversation context to understand intent
 */
export function analyzeContextualIntent(
    currentMessage: string,
    context: ConversationContext
): ContextualIntent {

    const msg = currentMessage.toLowerCase();
    const history = context.history || [];
    const lastMessages = history.slice(-3);

    // Check for continuation patterns
    const isContinuation = /^(و|و\s*بعد|ثم|then|after|also|next|كمان|also|too|وكذلك|ايضا|أيضا)/.test(msg) ||
        /^(continue|استمر|كمل|تابع|واصل|go on|keep going)$/i.test(msg.trim());

    // Check for clarification/correction
    const isCorrection = /^(no|لا|مش|ليس|not|نعم\s*لكن|yes\s*but)/.test(msg) ||
        /\b(اقصد|أقصد|i mean|actually|بالعكس|العكس)\b/i.test(msg);

    // Contextual intent detection
    let primary = 'unknown';
    let secondary: string | undefined;
    let confidence = 0.5;
    let requiresClarification = false;
    let suggestedAction = '';
    const entities = extractEntities(currentMessage, history);

    // 1. Browser context continuation
    if (context.browserSessionActive && isContinuation) {
        primary = 'browser_continue';
        confidence = 0.9;
        suggestedAction = 'Continue with current browser session';

        // Detect specific actions
        if (/\b(click|انقر|اضغط|دوس)\b/i.test(msg)) {
            secondary = 'browser_click';
        } else if (/\b(type|اكتب|املأ|ادخل)\b/i.test(msg)) {
            secondary = 'browser_type';
        } else if (/\b(scroll|مرر|انزل|طلع)\b/i.test(msg)) {
            secondary = 'browser_scroll';
        } else if (/\b(extract|استخرج|انسخ|خذ)\b/i.test(msg)) {
            secondary = 'browser_extract';
        }
    }

    // 2. Code generation context
    else if (context.lastToolUsed === 'file_write' || context.projectContext?.type) {
        if (isContinuation || /\b(add|اضف|زيد|also need|also want|كمان|بعد)\b/i.test(msg)) {
            primary = 'code_continuation';
            confidence = 0.85;
            suggestedAction = `Continue building ${context.projectContext?.type || 'project'}`;
        }
    }

    // 3. Correction/refinement
    else if (isCorrection) {
        primary = 'correction';
        confidence = 0.9;
        requiresClarification = false;
        suggestedAction = 'Adjust previous response based on correction';
    }

    // 4. Reference to previous conversation
    else if (/\b(that|this|it|the one|هذا|هذه|هاذا|اللي|الذي|ذاك|ذلك)\b/i.test(msg) && history.length > 0) {
        primary = 'reference_previous';
        confidence = 0.7;
        requiresClarification = true;
        suggestedAction = 'Understand reference to previous context';
    }

    // 5. Ambiguous short responses
    else if (msg.trim().length < 10 && history.length > 0) {
        const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
            primary = 'short_response';
            confidence = 0.6;
            requiresClarification = true;
            suggestedAction = 'Request clarification or assume continuation';
        }
    }

    // 6. Multi-step requests
    else if (/\b(then|ثم|بعد\s*ذلك|after\s*that|and\s*then|and|و|كمان|followed by|يليه)\b/i.test(msg) && msg.length > 30) {
        primary = 'multi_step';
        confidence = 0.8;
        suggestedAction = 'Break down into sequential steps';

        // Extract steps (improved splitting)
        const steps = msg.split(/(?:then|ثم|بعد\s*ذلك|after\s*that|and\s*then|followed by|يليه)/i);
        entities.steps = steps.map(s => s.trim()).filter(s => s.length > 3);
    }

    // 7. Question about capabilities
    else if (/\b(can you|هل\s*تستطيع|تقدر|you able|قادر|ممكن)\b/i.test(msg)) {
        primary = 'capability_question';
        confidence = 0.9;
        suggestedAction = 'Explain capabilities and confirm if possible';
    }

    // 8. Preference/opinion
    else if (/\b(prefer|افضل|احسن|better|best|الأفضل|الأحسن|which|أي|ايه)\b/i.test(msg)) {
        primary = 'preference_question';
        confidence = 0.8;
        suggestedAction = 'Provide recommendation based on context';
    }

    return {
        primary,
        secondary,
        confidence,
        requiresClarification,
        suggestedAction,
        entities
    };
}

/**
 * Build context from conversation history
 */
export function buildConversationContext(
    userId: string,
    sessionId: string,
    history: any[]
): ConversationContext {

    const context: ConversationContext = {
        userId,
        sessionId,
        history: history.map(h => ({
            role: h.role,
            content: typeof h.content === 'string' ? h.content : JSON.stringify(h.content),
            timestamp: Date.now(),
            tools: h.tools || []
        })),
        entities: new Map(),
        intent: null,
        lastToolUsed: null,
        browserSessionActive: false,
        projectContext: null
    };

    // Extract all entities from history
    for (const msg of history) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const entities = extractEntities(content, history);

        for (const [key, value] of Object.entries(entities)) {
            context.entities.set(key, value);
        }

        // Check for browser session
        if (content.includes('browser') || content.includes('متصفح')) {
            context.browserSessionActive = true;
        }
    }

    // Detect last tool used
    const lastMsg = [...history].reverse().find(m => m.role === 'assistant' || m.role === 'tool');
    if (lastMsg && lastMsg.tools && lastMsg.tools.length > 0) {
        context.lastToolUsed = lastMsg.tools[0];
    }

    // Detect project context
    if (context.entities.has('projectType')) {
        context.projectContext = {
            type: context.entities.get('projectType'),
            language: context.entities.get('programmingLanguages')?.[0],
            files: context.entities.get('files')
        };
    }

    return context;
}

/**
 * Smart pattern matching with context awareness
 */
export function matchPatternWithContext(
    userMessage: string,
    context: ConversationContext
): {
    matched: boolean;
    action: string | null;
    params: Record<string, any>;
    confidence: number;
} {

    const intent = analyzeContextualIntent(userMessage, context);

    // Handle based on contextual intent
    switch (intent.primary) {
        case 'browser_continue':
            return {
                matched: true,
                action: 'browser_run',
                params: {
                    sessionId: context.sessionId,
                    instructionText: userMessage,
                    continueSession: true
                },
                confidence: intent.confidence
            };

        case 'code_continuation':
            return {
                matched: true,
                action: 'code_generation',
                params: {
                    request: userMessage,
                    projectType: context.projectContext?.type,
                    existingFiles: context.projectContext?.files,
                    language: context.projectContext?.language
                },
                confidence: intent.confidence
            };

        case 'correction':
            return {
                matched: true,
                action: 'refine_previous',
                params: {
                    correction: userMessage,
                    lastAction: context.lastToolUsed
                },
                confidence: intent.confidence
            };

        case 'multi_step':
            return {
                matched: true,
                action: 'multi_step_execution',
                params: {
                    steps: intent.entities.steps || [],
                    fullRequest: userMessage
                },
                confidence: intent.confidence
            };

        default:
            return {
                matched: false,
                action: null,
                params: {},
                confidence: 0
            };
    }
}

export default {
    extractEntities,
    analyzeContextualIntent,
    buildConversationContext,
    matchPatternWithContext
};
