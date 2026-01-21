/**
 * Advanced Free Intelligence Enhancements
 * تحسينات إضافية للذكاء المجاني
 */

export interface AdvancedCapabilities {
    // Real-time response optimization
    streamingEnabled: boolean;

    // Advanced caching
    responseCache: Map<string, any>;

    // Performance metrics
    metrics: {
        totalRequests: number;
        averageResponseTime: number;
        cacheHitRate: number;
    };
}

/**
 * Response caching for common queries
 */
class IntelligentCache {
    private cache = new Map<string, { response: string; timestamp: number; hitCount: number }>();
    private maxCacheSize = 1000;
    private cacheTTL = 3600000; // 1 hour

    getCacheKey(message: string): string {
        // Normalize message for caching
        return message.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    get(message: string): string | null {
        const key = this.getCacheKey(message);
        const cached = this.cache.get(key);

        if (!cached) return null;

        // Check if expired
        if (Date.now() - cached.timestamp > this.cacheTTL) {
            this.cache.delete(key);
            return null;
        }

        // Update hit count
        cached.hitCount++;
        return cached.response;
    }

    set(message: string, response: string): void {
        const key = this.getCacheKey(message);

        // Evict oldest if cache full
        if (this.cache.size >= this.maxCacheSize) {
            const oldest = Array.from(this.cache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            this.cache.delete(oldest[0]);
        }

        this.cache.set(key, {
            response,
            timestamp: Date.now(),
            hitCount: 1
        });
    }

    getStats() {
        const entries = Array.from(this.cache.values());
        const totalHits = entries.reduce((sum, e) => sum + e.hitCount, 0);

        return {
            size: this.cache.size,
            totalHits,
            avgHitsPerEntry: totalHits / (this.cache.size || 1)
        };
    }
}

/**
 * Performance optimizer for free intelligence
 */
export class FreeIntelligenceOptimizer {
    private cache = new IntelligentCache();
    private metrics = {
        totalRequests: 0,
        cacheHits: 0,
        totalResponseTime: 0
    };

    /**
     * Optimize request before sending to model
     */
    async optimizeRequest(message: string, context?: any): Promise<{
        optimizedMessage: string;
        shouldUseCache: boolean;
        suggestedModel: string;
    }> {
        this.metrics.totalRequests++;

        // Check cache first
        const cached = this.cache.get(message);
        if (cached) {
            this.metrics.cacheHits++;
            return {
                optimizedMessage: message,
                shouldUseCache: true,
                suggestedModel: 'cache'
            };
        }

        // Optimize message length
        let optimizedMessage = message;

        // Remove redundant whitespace
        optimizedMessage = optimizedMessage.replace(/\s+/g, ' ').trim();

        // Suggest best free model based on message type
        const suggestedModel = this.suggestFreeModel(optimizedMessage);

        return {
            optimizedMessage,
            shouldUseCache: false,
            suggestedModel
        };
    }

    /**
     * Suggest best free model for the message
     */
    private suggestFreeModel(message: string): string {
        const lower = message.toLowerCase();

        // Code-related - Gemma is specialized for code
        if (/(code|كود|function|دالة|class|كلاس|component|كومبوننت|bug|خطأ|error|debug|برمجة|programming|script|سكريبت|api|fix|اصلح|صلح)/i.test(lower)) {
            return 'gemma-2-9b';
        }

        // Long context or detailed analysis - Mixtral has 32K context
        if (message.length > 1000 || /(analyze|تحليل|explain in detail|اشرح بالتفصيل|compare|قارن|summarize|لخص|detailed|مفصل)/i.test(lower)) {
            return 'mixtral-8x7b';
        }

        // Only use fast model for VERY short simple queries
        if (message.length < 15 && !/(why|how|what|explain|لماذا|كيف|ماذا|اشرح|من|هل)/i.test(lower)) {
            return 'llama-3.1-8b';
        }

        // Default: Use best model (Llama 70B) for all other queries
        // This ensures high-quality responses
        return 'llama-3.1-70b';
    }

    /**
     * Cache response
     */
    cacheResponse(message: string, response: string): void {
        // Only cache if response is good quality
        if (response && response.length > 20) {
            this.cache.set(message, response);
        }
    }

    /**
     * Get performance stats
     */
    getStats() {
        const cacheStats = this.cache.getStats();
        const avgResponseTime = this.metrics.totalResponseTime / (this.metrics.totalRequests || 1);
        const cacheHitRate = (this.metrics.cacheHits / (this.metrics.totalRequests || 1)) * 100;

        return {
            totalRequests: this.metrics.totalRequests,
            cacheHits: this.metrics.cacheHits,
            cacheHitRate: cacheHitRate.toFixed(2) + '%',
            averageResponseTime: avgResponseTime.toFixed(0) + 'ms',
            cacheSize: cacheStats.size,
            cacheTotalHits: cacheStats.totalHits
        };
    }
}

/**
 * Advanced pattern library for free intelligence
 */
export const ADVANCED_FREE_PATTERNS = {
    // Greetings (all dialects)
    greetings: [
        /^(hi|hello|hey|مرحبا|السلام|اهلا|صباح|مساء|أهلا|سلام|هلا|يا\s*هلا)/i,
        /^(كيف\s*حالك|how\s*are\s*you|شلونك|كيفك|عساك|ايش\s*اخبارك)/i,
        /^(good\s*morning|good\s*evening|صباح\s*الخير|مساء\s*الخير)/i
    ],

    // Questions
    questions: {
        identity: /^(من\s*أنت|ما\s*اسمك|who\s*are\s*you|what\s*is\s*your\s*name|شكون|ياش|مين)/i,
        capabilities: /^(ماذا\s*تستطيع|what\s*can\s*you\s*do|شو\s*تقدر|وش\s*تقدر|ايش\s*تقدر)/i,
        help: /^(help|ساعدني|مساعدة|ساعد|يعينك)/i
    },

    // Commands (expanded dialects)
    commands: {
        create: /(اعمل|سوي|كون|انشئ|اكريت|create|make|build|اصنع|ابني)/i,
        explain: /(اشرح|فسر|explain|وضح|tell\s*me|قول\s*لي|احكي)/i,
        fix: /(صلح|اصلح|fix|solve|حل|سحح)/i,
        translate: /(ترجم|translate|حول)/i,
        summarize: /(لخص|summarize|اختصر)/i
    },

    // Complex requests
    complex: {
        multiStep: /(ثم|then|بعد|after|وبعدين|و\s*بعد\s*كذا)/i,
        conditional: /(اذا|if|لو|في\s*حالة)/i,
        comparison: /(افضل|احسن|better|best|الأفضل|ايهم|ايهما)/i
    }
};

/**
 * Smart response generator for common queries
 */
export function generateSmartResponse(message: string, context?: any): string | null {
    const lower = message.toLowerCase();

    // Identity questions
    if (ADVANCED_FREE_PATTERNS.questions.identity.test(lower)) {
        const arabicRatio = (message.match(/[\u0600-\u06FF]/g) || []).length / message.length;
        if (arabicRatio > 0.5) {
            return `أنا Joe، نظام ذكاء اصطناعي متقدم ومجاني 100%! 🚀\n\nأستطيع:\n- بناء تطبيقات كاملة\n- البرمجة بجميع اللغات\n- تشغيل المتصفح\n- تحليل الصور\n- التعامل بالصوت\n\nومعي ذاكرة طويلة المدى، سأتذكرك في المستقبل! 😊`;
        } else {
            return `I'm Joe, an advanced FREE AI system! 🚀\n\nI can:\n- Build complete applications\n- Code in any language\n- Automate browsers\n- Analyze images\n- Handle voice\n\nAnd I have long-term memory - I'll remember you! 😊`;
        }
    }

    // Capabilities
    if (ADVANCED_FREE_PATTERNS.questions.capabilities.test(lower)) {
        const arabicRatio = (message.match(/[\u0600-\u06FF]/g) || []).length / message.length;
        if (arabicRatio > 0.5) {
            return `قدراتي الكاملة:\n\n1. 💻 بناء تطبيقات: React, Express, Fullstack\n2. 🤖 ذكاء متعدد: Llama 70B, Mixtral, Gemma\n3. 🌐 أتمتة المتصفح: تسجيل دخول، بحث، استخراج\n4. 🧠 ذاكرة طويلة: أتذكر تفضيلاتك\n5. 👁️ تحليل صور: screenshot → كود\n6. 🎤 صوت: كلام ↔ نص\n7. 🔧 GitHub, APIs, قواعد بيانات\n\nكل هذا مجاناً! 🎉`;
        } else {
            return `My full capabilities:\n\n1. 💻 Build apps: React, Express, Fullstack\n2. 🤖 Multi-AI: Llama 70B, Mixtral, Gemma\n3. 🌐 Browser automation: login, search, extract\n4. 🧠 Long-term memory: I remember you\n5. 👁️ Vision: screenshot → code\n6. 🎤 Voice: speech ↔ text\n7. 🔧 GitHub, APIs, databases\n\nAll FREE! 🎉`;
        }
    }

    // Greetings
    for (const pattern of ADVANCED_FREE_PATTERNS.greetings) {
        if (pattern.test(message)) {
            const arabicRatio = (message.match(/[\u0600-\u06FF]/g) || []).length / message.length;
            const greetings = arabicRatio > 0.5
                ? ['مرحباً!', 'أهلاً!', 'هلا!', 'السلام عليكم!']
                : ['Hello!', 'Hi there!', 'Hey!', 'Greetings!'];

            return `${greetings[Math.floor(Math.random() * greetings.length)]} ${arabicRatio > 0.5 ? 'كيف يمكنني مساعدتك اليوم؟ 😊' : 'How can I help you today? 😊'}`;
        }
    }

    return null; // No smart response available
}

export const freeIntelligenceOptimizer = new FreeIntelligenceOptimizer();

export default {
    FreeIntelligenceOptimizer,
    ADVANCED_FREE_PATTERNS,
    generateSmartResponse,
    freeIntelligenceOptimizer
};
