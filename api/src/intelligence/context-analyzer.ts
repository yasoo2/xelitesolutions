/**
 * Context Analyzer
 * Analyzes conversation context to determine task type, complexity, and required capabilities
 */

export interface ConversationContext {
    taskType: 'coding' | 'research' | 'debugging' | 'browsing' | 'planning' | 'mixed';
    complexity: 'simple' | 'medium' | 'complex';
    phase: 'planning' | 'execution' | 'verification' | 'learning';
    intent: string[];
    projectType?: 'web' | 'api' | 'mobile' | 'fullstack' | 'library' | 'unknown';
    requiredCapabilities: string[];
    suggestedTools: string[];
}

/**
 * Analyze messages to determine conversation context
 */
export function analyzeContext(messages: Array<{ role: string; content: string | any[] }>): ConversationContext {
    const recentMessages = messages.slice(-5);
    const fullText = recentMessages
        .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
        .join('\n')
        .toLowerCase();

    // Detect task type
    const taskType = detectTaskType(fullText);

    // Detect complexity
    const complexity = detectComplexity(fullText, messages.length);

    // Detect phase
    const phase = detectPhase(fullText, messages);

    // Extract intent signals
    const intent = extractIntent(fullText);

    // Detect project type
    const projectType = detectProjectType(fullText);

    // Determine required capabilities
    const requiredCapabilities = determineCapabilities(fullText, taskType);

    // Suggest optimal tools
    const suggestedTools = suggestTools(taskType, requiredCapabilities, fullText);

    return {
        taskType,
        complexity,
        phase,
        intent,
        projectType,
        requiredCapabilities,
        suggestedTools
    };
}

function detectTaskType(text: string): ConversationContext['taskType'] {
    const patterns = {
        coding: /(code|implement|build|create|function|class|component|file|edit|refactor|optimize)/,
        research: /(research|find|search|learn|what is|how does|compare|analyze|investigate)/,
        debugging: /(bug|error|fail|crash|fix|debug|issue|problem|not working|broken)/,
        browsing: /(browser|website|web|open|login|click|navigate|scrape|automation)/,
        planning: /(plan|design|architect|structure|organize|strategy|approach)/
    };

    const scores: Record<string, number> = {};

    for (const [type, pattern] of Object.entries(patterns)) {
        const matches = text.match(pattern);
        scores[type] = matches ? matches.length : 0;
    }

    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return 'mixed';

    const dominantTypes = Object.entries(scores).filter(([_, score]) => score === maxScore);

    if (dominantTypes.length > 2) return 'mixed';

    return dominantTypes[0][0] as ConversationContext['taskType'];
}

function detectComplexity(text: string, messageCount: number): ConversationContext['complexity'] {
    const complexitySignals = {
        simple: /(quick|simple|just|only|small|single)/,
        complex: /(complex|comprehensive|detailed|full|complete|entire|all|multiple|scalable|production)/
    };

    const hasComplexSignals = complexitySignals.complex.test(text);
    const hasSimpleSignals = complexitySignals.simple.test(text);

    // Long conversations tend to be complex
    if (messageCount > 10) return 'complex';

    // Text length indicator
    if (text.length > 500) {
        return hasSimpleSignals ? 'medium' : 'complex';
    }

    if (hasComplexSignals) return 'complex';
    if (hasSimpleSignals) return 'simple';

    return 'medium';
}

function detectPhase(text: string, messages: any[]): ConversationContext['phase'] {
    const phasePatterns = {
        planning: /(plan|design|how should|what's the best way|approach|strategy)/,
        execution: /(do it|build|create|implement|make|write|add|update)/,
        verification: /(test|verify|check|validate|ensure|confirm|works)/,
        learning: /(explain|how does|why|what is|teach|learn|understand)/
    };

    for (const [phase, pattern] of Object.entries(phasePatterns)) {
        if (pattern.test(text)) {
            return phase as ConversationContext['phase'];
        }
    }

    // Check if previous messages had tool outputs (likely execution phase)
    const hasToolOutputs = messages.slice(-3).some(m =>
        m.role === 'tool' || (typeof m.content === 'string' && m.content.includes('ok:'))
    );

    if (hasToolOutputs) return 'verification';

    return 'execution';
}

function extractIntent(text: string): string[] {
    const intents: string[] = [];

    const intentPatterns = {
        'file_operations': /(read|write|edit|delete|create) (file|folder)/,
        'web_research': /(search|find|look up|research)/,
        'browser_automation': /(browse|open|login|click|navigate)/,
        'code_generation': /(generate|create|build|scaffold)/,
        'code_analysis': /(analyze|review|check|inspect)/,
        'testing': /(test|verify|validate|ensure)/,
        'deployment': /(deploy|publish|release|build)/,
        'learning': /(explain|how|why|what is)/
    };

    for (const [intent, pattern] of Object.entries(intentPatterns)) {
        if (pattern.test(text)) {
            intents.push(intent);
        }
    }

    return intents;
}

function detectProjectType(text: string): ConversationContext['projectType'] {
    const projectPatterns = {
        web: /(react|vue|next|vite|html|css|frontend|website|web app)/,
        api: /(api|backend|server|express|fastify|endpoint|rest|graphql)/,
        mobile: /(mobile|ios|android|react native|flutter)/,
        fullstack: /(fullstack|full stack|full-stack|frontend.*backend|backend.*frontend)/,
        library: /(library|package|npm|module|sdk)/
    };

    for (const [type, pattern] of Object.entries(projectPatterns)) {
        if (pattern.test(text)) {
            return type as ConversationContext['projectType'];
        }
    }

    return 'unknown';
}

function determineCapabilities(text: string, taskType: string): string[] {
    const capabilities: string[] = [];

    // Based on text patterns
    if (/file|folder|path|directory/.test(text)) capabilities.push('file_system');
    if (/npm|node|shell|command|terminal/.test(text)) capabilities.push('shell');
    if (/browser|web|http|url/.test(text)) capabilities.push('browser');
    if (/test|jest|vitest|cypress/.test(text)) capabilities.push('testing');
    if (/git|github|commit|branch/.test(text)) capabilities.push('git');
    if (/database|db|sql|mongo/.test(text)) capabilities.push('database');
    if (/search|research|find information/.test(text)) capabilities.push('web_search');

    // Based on task type
    if (taskType === 'coding') {
        capabilities.push('file_system', 'shell');
    } else if (taskType === 'research') {
        capabilities.push('web_search');
    } else if (taskType === 'browsing') {
        capabilities.push('browser');
    } else if (taskType === 'debugging') {
        capabilities.push('file_system', 'shell', 'testing');
    }

    return [...new Set(capabilities)];
}

function suggestTools(taskType: string, capabilities: string[], text: string): string[] {
    const tools: string[] = ['echo']; // Always available

    // Add tools based on capabilities
    if (capabilities.includes('file_system')) {
        tools.push('file_read', 'file_write', 'file_edit', 'ls', 'grep_search');
    }

    if (capabilities.includes('shell')) {
        tools.push('shell_execute', 'command_policy_check');
    }

    if (capabilities.includes('browser')) {
        tools.push('browser_run', 'browser_open');
    }

    if (capabilities.includes('web_search')) {
        tools.push('web_search', 'deep_research', 'html_extract');
    }

    if (capabilities.includes('testing')) {
        tools.push('quality_run', 'generate_tests');
    }

    if (capabilities.includes('git')) {
        tools.push('git_ops', 'github_create_repo');
    }

    // Add task-specific tools
    if (taskType === 'coding') {
        tools.push('analyze_codebase', 'scaffold_project', 'check_syntax');
    } else if (taskType === 'research') {
        tools.push('knowledge_search', 'deep_research');
    }

    return [...new Set(tools)];
}

export default {
    analyzeContext
};
