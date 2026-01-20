/**
 * Analyzes request complexity to determine the best AI provider
 */

export type Complexity = 'simple' | 'medium' | 'complex';

interface ComplexityScore {
    level: Complexity;
    confidence: number;
    reasoning: string;
}

/**
 * Analyze message complexity
 */
export function analyzeComplexity(message: string): ComplexityScore {
    const msg = message.toLowerCase();
    const length = message.length;

    // Simple patterns (greetings, basic questions)
    const simplePatterns = [
        /^(hi|hello|hey|مرحبا|السلام|اهلا)\b/i,
        /^(how are you|كيف حالك|شلونك)/i,
        /^(thanks|شكرا|thank you)/i,
        /^(yes|no|نعم|لا|ok|okay|حسنا)\s*$/i,
    ];

    // Complex patterns (architecture, analysis, planning)
    const complexPatterns = [
        /\b(architect|design|structure|معمارية|تصميم|هيكل)\b/i,
        /\b(analyze|analysis|تحليل|audit|review|مراجعة)\b/i,
        /\b(implement|build|create.*system|إنشاء.*نظام|بناء)\b/i,
        /\b(optimize|performance|أداء|تحسين|تطوير)\b/i,
        /\b(database|schema|migration|قاعدة\s+بيانات)\b/i,
        /\b(security|authentication|أمان|مصادقة)\b/i,
    ];

    // Medium patterns (coding, translation, moderate tasks)
    const mediumPatterns = [
        /\b(write.*function|اكتب.*دالة|code|كود|برمجة)\b/i,
        /\b(translate|ترجم|convert|حول)\b/i,
        /\b(explain|اشرح|وضح|describe)\b/i,
        /\b(fix|repair|أصلح|debug)\b/i,
    ];

    // Check for simple first
    if (simplePatterns.some(p => p.test(msg)) && length < 50) {
        return {
            level: 'simple',
            confidence: 0.9,
            reasoning: 'Short greeting or basic question'
        };
    }

    // Check for complex
    const complexMatches = complexPatterns.filter(p => p.test(msg)).length;
    if (complexMatches >= 2 || (complexMatches >= 1 && length > 200)) {
        return {
            level: 'complex',
            confidence: 0.85,
            reasoning: 'Multiple complex keywords or long detailed request'
        };
    }

    // Check for medium
    const mediumMatches = mediumPatterns.filter(p => p.test(msg)).length;
    if (mediumMatches >= 1 || length > 100) {
        return {
            level: 'medium',
            confidence: 0.75,
            reasoning: 'Coding task or moderate complexity request'
        };
    }

    // Default to simple for very short messages
    if (length < 30) {
        return {
            level: 'simple',
            confidence: 0.6,
            reasoning: 'Very short message, likely simple'
        };
    }

    // Default to medium
    return {
        level: 'medium',
        confidence: 0.5,
        reasoning: 'Default classification for moderate length'
    };
}

/**
 * Select the best provider based on complexity and available providers
 */
export function selectAutoProvider(
    message: string,
    availableProviders: {
        pollinations: boolean;
        openrouter: boolean;
        openrouterHasKey: boolean;
        openai: boolean;
        anthropic: boolean;
    }
): string {
    const analysis = analyzeComplexity(message);

    // Simple tasks: Use Pollinations (always free and fast)
    if (analysis.level === 'simple' && availableProviders.pollinations) {
        return 'joe'; // Pollinations
    }

    // Medium tasks: Use OpenRouter free or Pollinations
    if (analysis.level === 'medium') {
        if (availableProviders.openrouter) {
            return 'openrouter';
        }
        if (availableProviders.pollinations) {
            return 'joe';
        }
    }

    // Complex tasks: Use best available paid provider
    if (analysis.level === 'complex') {
        if (availableProviders.openrouter && availableProviders.openrouterHasKey) {
            return 'openrouter'; // Will use premium model
        }
        if (availableProviders.anthropic) {
            return 'anthropic';
        }
        if (availableProviders.openai) {
            return 'openai';
        }
        // Fallback to OpenRouter free
        if (availableProviders.openrouter) {
            return 'openrouter';
        }
    }

    // Ultimate fallback
    return 'joe';
}
