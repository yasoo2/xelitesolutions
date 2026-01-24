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
        // English Defaults
        this.train('hello', 'Hello! How can I help you today?');
        this.train('hi', 'Hi there! Ready to build something?');
        this.train('active provider', 'Use the settings menu to check your active provider.');

        // Arabic Defaults
        this.train('مرحبا', 'أهلاً بك! كيف يمكنني مساعدتك اليوم؟');
        this.train('السلام عليكم', 'وعليكم السلام ورحمة الله! أنا جاهز للمساعدة.');
        this.train('اهلا', 'يا أهلاً! تفضل، أنا معك.');
        this.train('كيف حالك', 'أنا نظام ذكاء اصطناعي، ودائماً بأفضل حال ومستعد لخدمتك! 🚀');
        this.train('من انت', 'أنا Joe، مساعدك الذكي لتطوير البرمجيات وإدارة المهام.');
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
     * Main optimization entry point
     * Decides if we can skip the heavy lifting
     */
    public async optimizeRequest(userText: string, context: any[]): Promise<OptimizationResult> {
        const cleanText = userText.toLowerCase().trim();

        // 1. Check Smart Cache (Exact & Fuzzy)
        // Exact match
        if (this.cache.has(cleanText)) {
            const hit = this.cache.get(cleanText)!;
            hit.hits++;
            hit.lastUsed = Date.now();
            return {
                shouldUseCache: true,
                cachedResponse: hit.response,
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
        if (hit) return hit.response;
        return null;
    }
}

export const freeIntelligenceOptimizer = new FreeIntelligenceOptimizer();
export const generateSmartResponse = freeIntelligenceOptimizer.generateSmartResponse.bind(freeIntelligenceOptimizer);
