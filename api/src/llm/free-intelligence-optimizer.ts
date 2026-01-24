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
        if (!fs.existsSync(knowledgeDir)) return null;

        const lowerQuery = query.toLowerCase();
        let bestMatch = '';

        // Map topics to files
        const topicMap: Record<string, string> = {
            'react': 'web_modern_stack.md',
            'next': 'web_modern_stack.md',
            'tailwind': 'web_modern_stack.md',
            'web': 'web_modern_stack.md',

            'native': 'mobile_architecture.md',
            'mobile': 'mobile_architecture.md',
            'expo': 'mobile_architecture.md',
            'ios': 'mobile_architecture.md',
            'android': 'mobile_architecture.md',

            'backend': 'backend_systems.md',
            'database': 'backend_systems.md',
            'sql': 'backend_systems.md',
            'redis': 'backend_systems.md',
            'cache': 'backend_systems.md',
            'microservice': 'backend_systems.md',

            'docker': 'devops_pipelines.md',
            'k8s': 'devops_pipelines.md',
            'kubernetes': 'devops_pipelines.md',
            'ci': 'devops_pipelines.md',
            'pipeline': 'devops_pipelines.md',
            'devops': 'devops_pipelines.md',

            // Phase 2: Advanced Engineering
            'security': 'cybersecurity_essentials.md',
            'cyber': 'cybersecurity_essentials.md',
            'auth': 'cybersecurity_essentials.md',
            'jwt': 'cybersecurity_essentials.md',
            'owasp': 'cybersecurity_essentials.md',
            'hack': 'cybersecurity_essentials.md',
            'penetration': 'cybersecurity_essentials.md',

            'ai': 'ai_engineering_guide.md',
            'llm': 'ai_engineering_guide.md',
            'rag': 'ai_engineering_guide.md',
            'vector': 'ai_engineering_guide.md',
            'embedding': 'ai_engineering_guide.md',
            'gpt': 'ai_engineering_guide.md',
            'agent': 'ai_engineering_guide.md',

            'cloud': 'cloud_architecture_mastery.md',
            'aws': 'cloud_architecture_mastery.md',
            'azure': 'cloud_architecture_mastery.md',
            'serverless': 'cloud_architecture_mastery.md',
            'lambda': 'cloud_architecture_mastery.md',
            'architect': 'cloud_architecture_mastery.md',

            // Phase 3: Future Tech & Deep Science
            'blockchain': 'blockchain_web3.md',
            'web3': 'blockchain_web3.md',
            'solidity': 'blockchain_web3.md',
            'smart contract': 'blockchain_web3.md',
            'defi': 'blockchain_web3.md',
            'crypto': 'blockchain_web3.md',
            'wallet': 'blockchain_web3.md',

            'data': 'data_science_analytics.md',
            'science': 'data_science_analytics.md',
            'analytics': 'data_science_analytics.md',
            'pandas': 'data_science_analytics.md',
            'spark': 'data_science_analytics.md',
            'python': 'data_science_analytics.md',
            'visualization': 'data_science_analytics.md',

            'optimize': 'performance_optimization.md',
            'performance': 'performance_optimization.md',
            'memory': 'performance_optimization.md',
            'cpu': 'performance_optimization.md',
            'fast': 'performance_optimization.md',
            'algorithm': 'performance_optimization.md',
            'complexity': 'performance_optimization.md',
            'scale': 'performance_optimization.md',

            // Floor 4: Mission-Critical & Legacy Systems
            'bank': 'fintech_banking_architecture.md',
            'fintech': 'fintech_banking_architecture.md',
            'payment': 'fintech_banking_architecture.md',
            'transaction': 'fintech_banking_architecture.md',
            'ledger': 'fintech_banking_architecture.md',
            'money': 'fintech_banking_architecture.md',

            'resilience': 'resilience_disaster_recovery.md',
            'failover': 'resilience_disaster_recovery.md',
            'recovery': 'resilience_disaster_recovery.md',
            'availability': 'resilience_disaster_recovery.md',
            'circuit': 'resilience_disaster_recovery.md',
            'chaos': 'resilience_disaster_recovery.md',

            'legacy': 'legacy_modernization.md',
            'monolith': 'legacy_modernization.md',
            'migrate': 'legacy_modernization.md',
            'modernize': 'legacy_modernization.md',
            'strangler': 'legacy_modernization.md',
            'ddd': 'legacy_modernization.md',

            // Floor 5: Aesthetic Design Mastery
            'design': 'aesthetic_design_systems.md',
            'ui': 'ui_ux_patterns_library.md',
            'ux': 'ui_ux_patterns_library.md',
            'color': 'aesthetic_design_systems.md',
            'style': 'aesthetic_design_systems.md',
            'css': 'aesthetic_design_systems.md',
            'beautiful': 'aesthetic_design_systems.md',
            'aesthetic': 'aesthetic_design_systems.md',
            'typography': 'aesthetic_design_systems.md',
            'font': 'aesthetic_design_systems.md',
            'interaction': 'ui_ux_patterns_library.md',
            'animation': 'ui_ux_patterns_library.md',
            'animate': 'ui_ux_patterns_library.md',
            'framer': 'ui_ux_patterns_library.md',
            'brand': 'branding_visual_identity.md',
            'logo': 'branding_visual_identity.md',
            'identity': 'branding_visual_identity.md',
            'icon': 'branding_visual_identity.md',
            'accessible': 'branding_visual_identity.md'
        };

        // Find relevant file
        const foundTopic = Object.keys(topicMap).find(t => lowerQuery.includes(t));
        if (foundTopic) {
            try {
                const content = fs.readFileSync(path.join(knowledgeDir, topicMap[foundTopic]), 'utf-8');
                return `\n\n📚 **Knowledge Base (${topicMap[foundTopic]}):**\n` + content.substring(0, 1500) + '... [Read more]';
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
