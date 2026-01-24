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
    private dynamicIndex: Map<string, string[]> = new Map(); // filename -> keywords[]
    private cachePath: string;

    constructor() {
        this.cachePath = path.join(__dirname, '../../../.smart_reflex_cache.json');
        this.loadCache();
        this.buildDynamicIndex();

        // Seed basic common patterns if empty
        if (this.cache.size === 0) {
            this.seedDefaults();
        }
    }

    /**
     * UNIVERSAL KNOWLEDGE INDEXER (Singularity Core)
     * Scans the knowledge directory and builds a keyword-to-file map
     */
    private buildDynamicIndex() {
        try {
            const knowledgeDir = path.join(__dirname, '../knowledge');
            if (!fs.existsSync(knowledgeDir)) return;

            const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md'));

            for (const file of files) {
                // Extract keywords from filename (e.g. 'high_performance_computing.md' -> ['high', 'performance', 'computing'])
                const nameWithoutExt = file.replace('.md', '');
                const keywords = nameWithoutExt.split(/[_-]/).filter(k => k.length > 2);
                this.dynamicIndex.set(file, keywords);
            }
            console.log(`[Optimizer] Universal Index Ready: ${this.dynamicIndex.size} Engineering Atlases mapped.`);
        } catch (e) {
            console.warn('[Optimizer] Failed to build dynamic index', e);
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

        // --- LAYER 3: INFINITE MASTERY (The "Big 4" & Meta-Templates) ---

        // 6. Enterprise Frameworks (Spring Boot, Django, Laravel, .NET)
        // Java / Spring Boot
        const springContext = "مشروع Spring Boot يحتاج لتنظيم دقيق. سأبدأ بإنشاء الهيكل: Controller لطلبات API، و Service للمنطق، و Repository للداتا (JPA). سأستخدم Maven للإدارة. في ثانية واحدة سيكون لديك REST API كامل.";
        this.train('spring boot', springContext);
        this.train('java api', springContext);
        this.train('microservice', "للميكروسرفيسز، Spring Boot مع Spring Cloud هو الملك. سأضيف Eureka للـ Discovery و Config Server. تصميم يخدم الملايين!");

        // Python / Django
        const djangoContext = "Django هو إطار العمل للمحترفين (Batteries Included). سأبدأ المشروع (startproject) وأنشئ تطبيقاً (startapp). سأقوم بإعداد الـ Models والـ Admin Panel فوراً. هل نستخدم PostgreSQL؟";
        this.train('django', djangoContext);
        this.train('python web', djangoContext);
        this.train('flask', "Flask ممتاز للمشاريع الخفيفة والسريعة. سأكتب لك ملف `app.py` واحد يقوم بكل شي. هل تريد API أم HTML Rendering؟");

        // PHP / Laravel
        const laravelContext = "Laravel هو فخر الـ PHP. سأستخدم Artisan لإنشاء الـ Controllers والـ Migrations. سأتبع نمط MVC بدقة. هل نستخدم Blade أم Vue.js للواجهة؟";
        this.train('laravel', laravelContext);
        this.train('php', laravelContext);
        this.train('artisan', "أوامر Artisan في جيبي: `make:model`, `make:controller`, `migrate`. فقط قل لي ماذا تريد أن تبني!");

        // C# / .NET
        const dotnetContext = "بيئة .NET وعالم Microsoft. سأقوم بإنشاء Web API باستخدام ASP.NET Core الحديث. سأستخدم Entity Framework للتعامل مع SQL Server. أداء وسرعة خيالية.";
        this.train('.net', dotnetContext);
        this.train('c#', dotnetContext);
        this.train('asp.net', dotnetContext);

        // 7. ALGORITHMIC SPEED & DATA STRUCTURES (Computer Science Brain)
        this.train('sort', "للترتيب السريع، سأستخدم QuickSort (O(n log n)) في معظم الحالات، أو MergeSort للبيانات الضخمة جداً لضمان الاستقرار.");
        this.train('search', "للبحث في بيانات مرتبة، Binary Search هو الحل (O(log n)). أما للبيانات غير المرتبة، سأستخدم Hash Map للوصول الفوري (O(1)).");
        this.train('optimize', "التحسين مجالي! سأقلل الـ Time Complexity، أمنع الـ Nested Loops، وأستخدم Caching (Memoization) لتسريع الكود 100 مرة.");

        // 8. HYPER-SPEED TOOLS (CLI Mastery)
        this.train('clean', "لتنظيف المشروع فوراً: `rm -rf node_modules && npm cache clean --force`. (احذر! سأمسح كل شيء لتبدأ من جديد ونظيف).");
        this.train('large files', "لإيجاد الملفات الضخمة التي تلتهم المساحة: `find . -type f -size +100M`. سأكشفها لك فوراً.");
        this.train('network', "لفحص الشبكة والبورتاث: `netstat -tulpn` أو `lsof -i`. سأخبرك من يستمع على أي بورت.");
        this.train('kill', "لقتل عملية (Process) عنيدة: `kill -9 <PID>` أو `pkill -f <name>`. لا رحمة مع العمليات العالقة!");
        this.train('logs', "لمراقبة اللوجز بشكل مباشر: `tail -f error.log`. سأبقي عيني مفتوحة على كل سطر جديد.");

        // 9. ARCHITECTURAL WISDOM (Smart Reflex++)
        this.train('scaling', "للـ Scaling السلس، نستخدم Horizontal scaling مع Load Balancer (NGINX) و Stateless Services. هل نطبق الـ Caching في الـ Layer الأمامي؟");
        this.train('latency', "لتقليل الـ Latency، يجب تفعيل Redis Caching، ضغط الصور (WebP)، واستخدم CDN مثل Cloudflare. سأقوم بفحص الـ Network Waterfall لك.");
        this.train('redundancy', "النسخ الاحتياطي (Redundancy) ضروري. سنقوم بإعداد Multi-AZ Deployment لضمان عمل النظام حتى في حال سقوط داتا سنتر كامل.");
        this.train('security audit', "سأقوم بفحص الكود بحثاً عن SQL Injection، XSS، و NoSQL Injection. الحماية هي لعبتنا المفضلة يا هندسة.");

        // --- LAYER 4: BUSINESS AGILITY ---
        this.train('mvp', "لبناء MVP ناجح، سنركز على الـ Core Features فقط بأعلى جودة بصرية وأداء. السرعة في الـ Go-to-market هي الأهم هنا.");
        this.train('startup', "مشروع Startup يحتاج مرونة. سأستخدم تقنيات Serverless و NoSQL لنتحرك بسرعة البرق وبأقل تكلفة تشغيل.");
        this.train('enterprise', "للمشاريع الضخمة، سنعتمد معمارية Micro-frontend و Event-driven باستخدام Kafka لضمان فصل المهام (Separation of Concerns).");
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
     * Safety Valve: Detects if the user wants an ACTION (Tool) rather than INFO (RAG)
     */
    private isHighStakesAction(text: string): boolean {
        const actionVerbs = [
            'create', 'write', 'generate', 'build', 'deploy', 'run', 'execute',
            'fix', 'debug', 'delete', 'remove', 'install', 'update', 'upgrade',
            // Arabic actions
            'أنشئ', 'اكتب', 'ابني', 'شغل', 'نفذ', 'صلح', 'احذف', 'ركب', 'حدث'
        ];
        // Check if starts with verb or contains strong command pattern
        const words = text.split(' ');
        const firstWord = words[0];

        return actionVerbs.some(v => text.includes(v)); // Simple contains check for safety
    }

    // === LIBRARY OF ALEXANDRIA (RAG-lite) ===
    public getRealKnowledge(query: string): string | null {
        // [INTENT GUARD] If user wants to CREATE/WRITE, do NOT use RAG.
        if (this.isHighStakesAction(query.toLowerCase())) {
            return null; // Force Planner
        }

        const knowledgeDir = path.join(__dirname, '../knowledge');
        if (!fs.existsSync(knowledgeDir) || this.dynamicIndex.size === 0) return null;

        const lowerQuery = query.toLowerCase();
        let bestFile: string | null = null;
        let highestScore = 0;

        // Perform semantic scoring against dynamic index
        for (const [file, keywords] of this.dynamicIndex.entries()) {
            let score = 0;
            for (const kw of keywords) {
                if (lowerQuery.includes(kw.toLowerCase())) {
                    score += kw.length; // Longer matches carry more weight
                }
            }

            if (score > highestScore) {
                highestScore = score;
                bestFile = file;
            }
        }

        // Only return if we have a significant match (e.g. at least one full keyword)
        if (bestFile && highestScore > 3) {
            try {
                const content = fs.readFileSync(path.join(knowledgeDir, bestFile), 'utf-8');
                return `\n\n📚 **Universal Engineering Atlas (${bestFile}):**\n` + content.substring(0, 2000) + '... [Full Atlas Synced]';
            } catch (e) {
                console.error('[Optimizer] Knowledge read error', e);
            }
        }
        return null;
    }

    /**
     * Main optimization entry point
     */
    public async optimizeRequest(userText: string, context: any[]): Promise<OptimizationResult> {
        const cleanText = userText.toLowerCase().trim();
        const userName = 'يونس'; // Hardcoded for this session

        // 0. Check Real Knowledge (RAG) - Priority over static strings
        // ENHANCEMENT: Allow RAG even with attachments if query is purely descriptive
        const realKnowledge = this.getRealKnowledge(cleanText);
        if (realKnowledge) {
            return {
                shouldUseCache: true,
                cachedResponse: this.injectPersona(realKnowledge, userName),
                suggestedModel: 'fast',
                skipPlanner: true
            };
        }

        // 1. Check Smart Cache (Exact & Fuzzy)
        // Fuzzy: Check if any trigger word exists in the text for high-importance patterns
        for (const [trigger, res] of this.cache.entries()) {
            if (cleanText === trigger || (trigger.length > 5 && cleanText.includes(trigger))) {
                res.hits++;
                res.lastUsed = Date.now();
                return {
                    shouldUseCache: true,
                    cachedResponse: this.injectPersona(res.response, userName),
                    suggestedModel: 'fast',
                    skipPlanner: true
                };
            }
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
