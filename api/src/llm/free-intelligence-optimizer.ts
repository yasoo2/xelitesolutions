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
     * ENHANCED: Prioritize quality (70B) over speed
     */
    private suggestFreeModel(message: string): string {
        const lower = message.toLowerCase();

        // Code-related - Gemma is EXCELLENT for code
        if (/(code|كود|function|دالة|class|كلاس|component|كومبوننت|bug|خطأ|error|debug|برمجة|programming|script|سكريبت|api|fix|اصلح|صلح|typescript|javascript|python|react|node)/i.test(lower)) {
            console.info('[FREE OPTIMIZER] 💻 Code detected → Using Gemma 2 (code specialist)');
            return 'gemma2-9b-it';
        }

        // VERY long context (>2000 chars) - Mixtral has 32K context window
        if (message.length > 2000 || /(تحليل\s*مفصل|detailed\s*analysis|comprehensive|شامل|كامل)/i.test(lower)) {
            console.info('[FREE OPTIMIZER] 📚 Long context detected → Using Mixtral (32K context)');
            return 'mixtral-8x7b-32768';
        }

        // FAST LANE: Use 8B for short/simple queries (Speed > Quality)
        // But NOT for factual identification
        const isFactual = /(who\s*is|what\s*is|man\s*huwa|president|ruler|king|minister|من\s*هو|من\s*هي|رئيس|حاكم|ملك|وزير|الحالي|عاصمة|ماهي|ماهو)/i.test(lower);

        if (!isFactual && message.length < 100 && !/(plan|design|architecture|explain|why|how|خطط|صمم|معمارية|اشرح|لماذا|كيف)/i.test(lower)) {
            console.info('[FREE OPTIMIZER] ⚡ Fast Lane detected → Using Llama 3.1 8B (Instant)');
            return 'llama-3.1-8b-instant';
        }

        // DEFAULT: ALWAYS use best model (Llama 70B) for MAXIMUM INTELLIGENCE
        // This is the secret sauce - quality over speed!
        console.info('[FREE OPTIMIZER] 🧠 Using Llama 3.1 70B (highest quality)');
        return 'llama-3.1-70b-versatile';
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
 * Enhanced with aggressive matching for maximum coverage
 */
export const ADVANCED_FREE_PATTERNS = {
    // Greetings (all dialects) - REMOVED ^ to match anywhere in text
    greetings: [
        /\b(hi|hello|hey|sup|yo|hiya|howdy)\b/i,
        /(مرحبا|السلام|اهلا|صباح|مساء|أهلا|سلام|هلا|يا\s*هلا|مرحبتين)/i,
        /(كيف\s*حالك|how\s*are\s*you|شلونك|كيفك|عساك|ايش\s*اخبارك|شخبارك|وش\s*الأخبار)/i,
        /(good\s*morning|good\s*evening|good\s*afternoon|صباح\s*الخير|مساء\s*الخير)/i
    ],

    // Questions - MUCH more comprehensive
    questions: {
        identity: [
            /(من\s*أنت|ما\s*اسمك|منو\s*انت|شكون|ياش|مين\s*انت|انت\s*مين)/i,
            /(who\s*are\s*you|what\s*is\s*your\s*name|who\s*r\s*u|whos\s*this)/i,
            /(introduce\s*yourself|عرف\s*نفسك|قدم\s*نفسك)/i
        ],
        capabilities: [
            /(ماذا\s*تستطيع|وش\s*تقدر|شو\s*تقدر|ايش\s*تقدر|ايش\s*تسوي|شو\s*بتسوي)/i,
            /(what\s*can\s*you\s*do|what\s*r\s*u\s*capable|what\s*are\s*your\s*capabilities)/i,
            /(قدراتك|abilities|skills|مهاراتك|امكانياتك)/i
        ],
        help: [
            /\b(help|ساعدني|مساعدة|ساعد|يعينك|ساعدوني|نجدة)\b/i,
            /(how\s*to|كيف|ازاي|كيفية|طريقة)/i
        ]
    },

    // Commands (expanded dialects)
    commands: {
        create: /(اعمل|سوي|كون|انشئ|أنشئ|اكريت|create|make|build|اصنع|ابني|طور|develop|ممكن\s*ت)/i,
        explain: /(اشرح|فسر|explain|وضح|tell\s*me|قول\s*لي|احكي|علمني|عرفني)/i,
        fix: /(صلح|اصلح|fix|solve|حل|صحح|عدل)/i,
        translate: /(ترجم|translate|حول)/i,
        summarize: /(لخص|summarize|اختصر)/i
    },

    // Complex requests
    complex: {
        multiStep: /(ثم|then|بعد|after|وبعدين|و\s*بعد\s*كذا)/i,
        conditional: /(اذا|إذا|if|لو|في\s*حالة)/i,
        comparison: /(افضل|أفضل|احسن|better|best|الأفضل|ايهم|أيهما|ايهما)/i
    }
};

/**
 * Smart response generator for common queries
 * Enhanced with better pattern matching and richer responses
 */
export function generateSmartResponse(message: string, context?: any): string | null {
    const lower = message.toLowerCase();
    const trimmed = message.trim();

    // Helper to test array of patterns
    const testPatterns = (patterns: RegExp | RegExp[]): boolean => {
        if (Array.isArray(patterns)) {
            return patterns.some(p => p.test(lower) || p.test(trimmed));
        }
        return patterns.test(lower) || patterns.test(trimmed);
    };

    // Detect language
    const arabicRatio = (message.match(/[\u0600-\u06FF]/g) || []).length / message.length;
    const isArabic = arabicRatio > 0.3;

    // Identity questions - MORE DETAILED RESPONSE
    if (testPatterns(ADVANCED_FREE_PATTERNS.questions.identity)) {
        if (isArabic) {
            return `أنا Joe، نظام ذكاء اصطناعي متطور من الجيل التالي! 🚀

🎯 **قدراتي الأساسية:**
• 💻 تطوير تطبيقات كاملة (React, Node.js, Python, وأكثر)
• 🤖 ذكاء متعدد النماذج (Llama 3.1 70B، Mixtral، Gemma)
• 🌐 أتمتة المتصفح والتفاعل مع المواقع
• 🧠 ذاكرة طويلة المدى - سأتذكر محادثاتنا السابقة!
• 👁️ تحليل الصور وتحويل Screenshots إلى كود
• 🎤 معالجة صوتية (نص ↔ كلام)
• 🔧 دمج APIs، قواعد بيانات، GitHub

**والأهم: كل هذا مجاني 100%!** 😊`;
        } else {
            return `I'm Joe, a next-generation AI system! 🚀

🎯 **My Core Capabilities:**
• 💻 Full-stack development (React, Node.js, Python, more)
• 🤖 Multi-model intelligence (Llama 3.1 70B, Mixtral, Gemma)
• 🌐 Browser automation & web interaction
• 🧠 Long-term memory - I remember our conversations!
• 👁️ Image analysis & screenshot-to-code
• 🎤 Voice processing (text ↔ speech)
• 🔧 API integration, databases, GitHub

**Best part: 100% FREE!** 😊`;
        }
    }

    // Capabilities - COMPREHENSIVE DETAILED LIST
    if (testPatterns(ADVANCED_FREE_PATTERNS.questions.capabilities)) {
        if (isArabic) {
            return `📋 **القدرات الكاملة لـ Joe AI:**

1️⃣ **تطوير البرمجيات**
   • بناء تطبيقات React كاملة
   • Express.js APIs و backends
   • Full-stack applications
   • كل لغات البرمجة الشائعة

2️⃣ **ذكاء متعدد المستويات**
   • Llama 3.1 70B للمهام المعقدة
   • Mixtral للسياقات الطويلة  
   • Gemma المتخصص في البرمجة
   • اختيار ذكي للنموذج الأنسب

3️⃣ **أتمتة المتصفح**
   • فتح المواقع والتنقل
   • تعبئة النماذج
   • استخراج البيانات
   • تنفيذ مهام متعددة الخطوات

4️⃣ **الذاكرة والسياق**
   • تذكر التفضيلات الشخصية
   • ربط المحادثات السابقة
   • فهم سياقي عميق

5️⃣ **الوسائط المتعددة**
   • تحليل الصور
   • screenshot → كود HTML/CSS
   • معالجة صوتية

6️⃣ **التكامل**
   • GitHub Operations
   • REST APIs
   • قواعد البيانات
   • أنظمة المؤسسات

**كل هذا بدون تكلفة!** 🎉`;
        } else {
            return `📋 **Joe AI - Complete Capabilities:**

1️⃣ **Software Development**
   • Full React applications
   • Express.js APIs & backends
   • Full-stack projects
   • All popular programming languages

2️⃣ **Multi-Level Intelligence**
   • Llama 3.1 70B for complex tasks
   • Mixtral for long contexts
   • Gemma specialized for coding
   • Smart model selection

3️⃣ **Browser Automation**
   • Open & navigate websites
   • Fill forms automatically
   • Extract data
   • Multi-step workflows

4️⃣ **Memory & Context**
   • Remember your preferences
   • Connect past conversations
   • Deep contextual understanding

5️⃣ **Multimodal**
   • Image analysis
   • screenshot → HTML/CSS code
   • Voice processing

6️⃣ **Integration**
   • GitHub operations
   • REST APIs
   • Databases
   • Enterprise systems

**All completely FREE!** 🎉`;
        }
    }

    // Greetings - WARM AND INVITING
    for (const pattern of ADVANCED_FREE_PATTERNS.greetings) {
        if (pattern.test(trimmed)) {
            if (isArabic) {
                const greetings = ['مرحباً!', 'أهلاً وسهلاً!', 'هلا والله!', 'السلام عليكم ورحمة الله!'];
                const greeting = greetings[Math.floor(Math.random() * greetings.length)];
                return `${greeting} 😊

أنا Joe، مساعدك الذكي المجاني! كيف يمكنني مساعدتك اليوم؟

💡 يمكنني:
• بناء تطبيقات كاملة
• كتابة وتحليل الكود
• البحث والتصفح
• والمزيد...

فقط اطلب مني أي شيء!`;
            } else {
                const greetings = ['Hello!', 'Hi there!', 'Hey!', 'Greetings!', 'Welcome!'];
                const greeting = greetings[Math.floor(Math.random() * greetings.length)];
                return `${greeting} 😊

I'm Joe, your FREE AI assistant! How can I help you today?

💡 I can:
• Build complete applications
• Write & analyze code
• Search & browse the web
• And much more...

Just ask me anything!`;
            }
        }
    }

    // Help requests
    if (testPatterns(ADVANCED_FREE_PATTERNS.questions.help)) {
        if (isArabic) {
            return `🆘 **كيف يمكنني مساعدتك؟**

يمكنك أن تطلب مني:

📝 **البرمجة:**
• "اكتب لي React component"
• "صلح الخطأ في الكود"
• "اشرح هذا الكود"

🌐 **التصفح والبحث:**
• "ابحث عن..."
• "افتح google.com"
• "استخرج البيانات من..."

💬 **الأسئلة العامة:**
• "اشرح لي..."
• "ما الفرق بين..."
• "كيف أعمل..."

فقط اسأل بشكل طبيعي! 😊`;
        } else {
            return `🆘 **How Can I Help?**

You can ask me to:

📝 **Programming:**
• "Write a React component"
• "Fix this bug"
• "Explain this code"

🌐 **Browse & Search:**
• "Search for..."
• "Open google.com"
• "Extract data from..."

💬 **General Questions:**
• "Explain..."
• "What's the difference between..."
• "How do I..."

Just ask naturally! 😊`;
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
