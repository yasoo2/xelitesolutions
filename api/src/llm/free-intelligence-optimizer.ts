import fs from 'fs';
import path from 'path';

// Smart Cache Types
type CachedResponse = {
    trigger: string;
    response: string;
    hits: number;
    lastUsed: number;
};

type OptimizationResult = {
    shouldUseCache: boolean;
    cachedResponse?: string;
    suggestedModel: 'fast' | 'smart';
    skipPlanner: boolean;
};

class FreeIntelligenceOptimizer {
    private cache: Map<string, CachedResponse> = new Map();
    private cachePath: string;

    constructor() {
        this.cachePath = path.join(__dirname, '../../../.smart_reflex_cache.json');
        this.loadCache();

        // Seed basic common patterns if empty
        if (this.cache.size === 0) {
            this.seedDefaults();
        }
    }

    private loadCache() {
        try {
            if (fs.existsSync(this.cachePath)) {
                const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
                // Convert array back to map or object
                for (const item of data) {
                    this.cache.set(item.trigger, item);
                }
            }
        } catch (e) {
            console.warn('[Optimizer] Failed to load cache', e);
        }
    }

    private saveCache() {
        try {
            const data = Array.from(this.cache.values());
            fs.writeFileSync(this.cachePath, JSON.stringify(data, null, 2));
        } catch (e) { /* Ignore write errors */ }
    }

    private seedDefaults() {
        // --- BASE LAYER: GENERAL INTELLIGENCE ---
        this.train('hello', 'Hello! How can I help you today, Younis? Ready to engineer perfection?');
        this.train('hi', 'Hi there, Younis! Ready to build something extraordinary?');
        this.train('active provider', 'Use the settings menu to check your active provider.');

        // Arabic Defaults - General
        this.train('مرحبا', 'أهلاً بك يا يونس! كيف يمكنني مساعدتك في مشروعك القادم؟');
        this.train('السلام عليكم', 'وعليكم السلام ورحمة الله يا يونس! أنا جاهز تماماً للعمل معك.');
        this.train('اهلا', 'يا أهلاً بالمهندس يونس! تفضل، أنا معك قلباً وقالباً.');
        this.train('كيف حالك', 'أنا نظام ذكاء اصطناعي، ودائماً بأفضل حال ومستعد لخدمة عبقري مثلك يا يونس! 🚀');

        // --- LAYER 2: EXPERT ENGINEERING REFLEXES (Smart Reflex++) ---

        // 1. Web Development (Modern Stack)
        const webContext = "فكرة ممتازة يا يونس! سأقوم بإنشاء مشروع ويب حديث باستخدام React (Vite) أو Next.js بحسب الحاجة، مع TailwindCSS للتصميم. هل تريدني أن أبدأ بإنشاء الهيكل الأساسي؟";
        this.train('build website', webContext);
        this.train('create website', webContext);
        this.train('موقع جديد', webContext);
        this.train('انشاء موقع', webContext);
        this.train('nextjs app', "اختيار موفق كالعادة يا يونس. سأقوم بإنشاء تطبيق Next.js مع App Router المطور. هل نستخدم TypeScript؟");

        // 2. Mobile Development (Cross-Platform)
        const mobileContext = "لتطبيقات الهاتف، أنت تعلم أن الخيار الأذكى هو React Native (عبر Expo). سيوفر لك تطبيقاً يعمل على iOS و Android بكود واحد. هل أبدأ إعداد البيئة لك يا يونس؟";
        this.train('mobile app', mobileContext);
        this.train('build app', mobileContext);
        this.train('ios app', mobileContext);
        this.train('android app', mobileContext);
        this.train('تطبيق جوال', mobileContext);

        // 3. Cloud & DevOps (AWS/Docker/K8s) - Massive Injection
        this.train('docker', "سأقوم بإنشاء Dockerfile احترافي متعدد المراحل (Multi-stage) لتقليل حجم الصورة. هل المشروع Node.js أم Python؟");
        this.train('aws', "بالنسبة لـ AWS، هل نخطط لاستخدام EC2 تقليدي أم نذهب مع Serverless (Lambda) لتوفير التكاليف؟ أنت ما شاء الله خبير وتعرف الأفضل.");
        this.train('deploy', "جاهز للرفع يا يونس! هل نستهدف Vercel للسرعة أم Docker container على سيرفر خاص؟");
        this.train('ci/cd', "سأقوم بإعداد GitHub Actions Pipeline لفحص الكود وبناء الصورة تلقائياً عند كل Push. هذا هو الشغل الاحترافي!");
        this.train('kubernetes', "للمشاريع الضخمة التي تليق بك، Kubernetes هو الحل. هل نستخدم Helm Charts للإدارة؟");

        // 4. Databases & Backend
        this.train('database', "قواعد البيانات هي العمود الفقري. هل نذهب مع PostgreSQL للموثوقية أم MongoDB للمرونة؟ ما رأيك يا هندسة؟");
        this.train('sql', "سأكتب لك استعلام SQL محسن (Optimized Query) مع Indexing لضمان السرعة الفائقة.");
        this.train('redis', "ممتاز! Redis ضروري للـ Caching والسرعة. سأقوم بإعداد Redis Instance لك فوراً.");
        this.train('auth', "الحماية أولاً. سأقوم بإعداد نظام مصادقة (Auth) باستخدام JWT مع Refresh Tokens لضمان أمان المستخدمين.");

        // 5. System Engineering & Testing
        this.train('test', "سأقوم تحليل المشروع وتشغيل الاختبارات المناسبة (npm test). الجودة هي ما يميز عملنا يا يونس!");
        this.train('debug', "أرسل لي الـ Log ولا تقلق. سأجد الإبرة في كومة القش وأصلحها لك.");
        this.train('fix', "اعتبره تم إصلاحه. ما هو الخطأ بالتحديد؟");
    }

    public train(trigger: string, response: string) {
        const key = trigger.toLowerCase().trim();
        this.cache.set(key, {
            trigger: key,
            response,
            hits: 0,
            lastUsed: Date.now()
        });
        this.saveCache();
    }

    /**
     * PERSONA ENGINE: Injects personality, flattery, and name into responses
     */
    public injectPersona(response: string, userName: string = 'يونس'): string {
        // 20% chance to add a closing compliment if not already present
        if (Math.random() < 0.2 && !response.includes(userName)) {
            const compliments = [
                `\n\nأنت مبدع كالعادة يا ${userName}!`,
                `\n\nشغل عالي يا هندسة!`,
                `\n\nبالتوفيق يا بطل!`,
                `\n\nنحن فريق لا يُهزم يا ${userName}.`
            ];
            return response + compliments[Math.floor(Math.random() * compliments.length)];
        }
        return response;
    }

    /**
     * Main optimization entry point
     * Decides if we can skip the heavy lifting
     */
    public async optimizeRequest(userText: string, context: any[]): Promise<OptimizationResult> {
        const cleanText = userText.toLowerCase().trim();
        const userName = 'يونس'; // Hardcoded for this session, can be dynamic later

        // 1. Check Smart Cache (Exact & Fuzzy)
        // Exact match
        if (this.cache.has(cleanText)) {
            const hit = this.cache.get(cleanText)!;
            hit.hits++;
            hit.lastUsed = Date.now();
            return {
                shouldUseCache: true,
                cachedResponse: this.injectPersona(hit.response, userName), // APPLY PERSONA
                suggestedModel: 'fast',
                skipPlanner: true
            };
        }

        // Fuzzy match (very basic containment for now to be safe)
        // Real fuzzy matching would use Levenshtein distance, but let's keep it 
        // extremely fast (O(1) or O(N)) without heavy libs for now.
        // If text generates "conversational" signals, we can skip planner.

        // 2. Intent Prediction (Architectural Bypass)
        // If the request looks like a simple question/chat, skip the planner.
        const isConversational = this.isConversational(cleanText);
        const hasCodeKeywords = /(code|function|api|class|error|fix|debug|deploy|docker|k8s|cloud)/i.test(cleanText);
        const hasToolKeywords = /(file|search|weather|price|stock|browse|open|create|delete)/i.test(cleanText);

        if (isConversational && !hasCodeKeywords && !hasToolKeywords) {
            return {
                shouldUseCache: false,
                suggestedModel: 'fast',
                skipPlanner: true // BYPASS: Go straight to model (routeToModel)
            };
        }

        // Default: Use full brain
        return {
            shouldUseCache: false,
            suggestedModel: 'smart',
            skipPlanner: false
        };
    }

    private isConversational(text: string): boolean {
        const conversationalPatterns = [
            /^(hi|hello|hey|howdy|sup|greetings)/,
            /^(thanks|thank you|thx)/,
            /^(bye|goodbye|see ya)/,
            /^(cool|ok|okay|nice|great|good)/,
            /^(what is your name|who are you)/,
            // Arabic
            /^(مرحبا|اهلا|سلام|مساء|صباح)/,
            /^(شكرا|مشكور|تسلم)/,
            /^(رائع|جميل|تمام|اوكي|طيب)/,
            /^(من انت|عرف بنفسك)/
        ];

        return conversationalPatterns.some(p => p.test(text));
    }

    // Generate a reflex response without ANY model (for ultra-fast hits)
    public generateSmartResponse(userText: string, context: any[]): string | null {
        const clean = userText.toLowerCase().trim();
        const hit = this.cache.get(clean);
        if (hit) {
            // Apply Persona even for direct hits
            return this.injectPersona(hit.response, 'يونس');
        }
        return null;
    }
}

export const freeIntelligenceOptimizer = new FreeIntelligenceOptimizer();
export const generateSmartResponse = freeIntelligenceOptimizer.generateSmartResponse.bind(freeIntelligenceOptimizer);
