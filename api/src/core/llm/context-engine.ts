/**
 * Context-Aware Pattern Matching Engine
 * Understands conversation context and multi-turn interactions
 */
import { AR_START, AR_START_NOUN, wordsPattern, wordsRegex } from '../../shared/arabic-word-boundary';

// Every Arabic alternative below sat behind ASCII `\b` and never matched
// (eval round 15). English keeps `\b`; Arabic gets Unicode boundaries.
const TRAILING_JOIN = new RegExp(`${wordsPattern(['and', 'then'], ['و', 'ثم'], AR_START)}.*$`, 'iu');
const DEPENDENCY = new RegExp(`(${wordsPattern(['install', 'add', 'package', 'library'], ['مكتب[ةه]', 'تثبيت'], AR_START_NOUN)})\\s+([\\w@/-]+)`, 'giu');
const ARABIC_LANGUAGE = wordsRegex([], ['جافا\\s*سكر[يِ]?بت', 'بايثون', 'تايب\\s*سكر[يِ]?بت', 'ري?[اأإآ]كت'], 'gi');
const WEB_PROJECT = wordsRegex(['website', 'web\\s*app', 'landing\\s*page'], ['موقع', 'تطبيق\\s*ويب', 'صفح[ةه]', 'سايت'], 'i', AR_START_NOUN);
const API_PROJECT = wordsRegex(['api', 'endpoint', 'rest', 'graphql'], ['واجه[ةه]\\s*برمجي[ةه]'], 'i', AR_START_NOUN);
const MOBILE_PROJECT = wordsRegex(['mobile\\s*app', 'android', 'ios', 'react\\s*native', 'flutter'], ['تطبيق\\s*جوال', 'موبايل'], 'i', AR_START_NOUN);
const CORRECTION = wordsRegex(['i mean', 'actually'], ['[اأ]قصد', 'بالعكس', 'العكس']);
const CLICK = wordsRegex(['click'], ['انقر', 'اضغط', 'دوس']);
const TYPE = wordsRegex(['type'], ['[اأ]كتب', '[اأ]مل[أا]', '[اأ]دخل']);
const SCROLL = wordsRegex(['scroll'], ['مرر', '[اأ]نزل', 'طلع']);
const EXTRACT = wordsRegex(['extract'], ['استخرج', '[اأ]نسخ', 'خذ']);
const ADD_MORE = wordsRegex(['add', 'also need', 'also want'], ['[اأ]ضف', 'زيد', 'كمان', 'بعد']);
const REFERENCE = wordsRegex(['that', 'this', 'it', 'the one'], ['هذا', 'هذه', 'هاذا', 'اللي', 'الذي', 'ذاك', 'ذلك']);
const SEQUENCE = wordsRegex(['then', 'after\\s*that', 'and\\s*then', 'and', 'followed by'], ['ثم', 'بعد\\s*ذلك', 'و', 'كمان', 'يليه']);
const CAPABILITY = wordsRegex(['can you', 'you able'], ['هل\\s*تستطيع', 'تقدر', 'قادر', 'ممكن']);
const PREFERENCE = wordsRegex(['prefer', 'better', 'best', 'which'], ['[اأ]فضل', '[اأ]حسن', 'الأفضل', 'الأحسن', 'أي', 'ايه']);

export interface SpecificationContext {
    specificationId: string;
    requirements: any[]; // Requirement[]
    constraints: any[]; // Constraint[]
    implicitRequirements: any[]; // ImplicitRequirement[]
    acceptanceCriteria: any[]; // AcceptanceCriterion[]
    constraintInteractions: any[]; // ConstraintInteraction[]
    currentPhase: number;
    currentPhaseName: string;
    requirementCoverage: Map<string, RequirementCoverage>;
    phaseProgress: Map<number, PhaseProgress>;
    activeTensionResolutions: Map<string, string>; // constraintId -> resolution approach
}

export interface RequirementCoverage {
    requirementId: string;
    status: 'pending' | 'in_progress' | 'implemented' | 'verified' | 'failed';
    implementedIn: string[];
    verifiedBy: string[];
    lastUpdated: number;
    phaseNumber?: number;
    taskIds?: string[];
}

export interface PhaseProgress {
    phaseNumber: number;
    name: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    requirementsCovered: string[];
    startedAt?: number;
    completedAt?: number;
    taskResults?: any[];
}

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
    specificationContext?: SpecificationContext;
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
                .replace(TRAILING_JOIN, '')
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
    const depPatterns = DEPENDENCY;
    const deps = [...text.matchAll(depPatterns)].map(m => m[2]);
    if (deps.length > 0) {
        entities.dependencies = deps;
    }

    // Programming languages
    const langPatterns = [
        /\b(javascript|typescript|python|java|golang|rust|c\+\+|react|vue|angular|node|express|django|flask|spring)\b/gi,
        ARABIC_LANGUAGE
    ];

    for (const pattern of langPatterns) {
        const langs = text.match(pattern);
        if (langs) {
            entities.programmingLanguages = langs.map(l => l.toLowerCase());
        }
    }

    // Project types
    if (WEB_PROJECT.test(text)) {
        entities.projectType = 'web';
    } else if (API_PROJECT.test(text)) {
        entities.projectType = 'api';
    } else if (MOBILE_PROJECT.test(text)) {
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
        CORRECTION.test(msg);

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
        if (CLICK.test(msg)) {
            secondary = 'browser_click';
        } else if (TYPE.test(msg)) {
            secondary = 'browser_type';
        } else if (SCROLL.test(msg)) {
            secondary = 'browser_scroll';
        } else if (EXTRACT.test(msg)) {
            secondary = 'browser_extract';
        }
    }

    // 2. Code generation context
    else if (context.lastToolUsed === 'file_write' || context.projectContext?.type) {
        if (isContinuation || ADD_MORE.test(msg)) {
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
    else if (REFERENCE.test(msg) && history.length > 0) {
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
    else if (SEQUENCE.test(msg) && msg.length > 30) {
        primary = 'multi_step';
        confidence = 0.8;
        suggestedAction = 'Break down into sequential steps';

        // Extract steps (improved splitting)
        const steps = msg.split(/(?:then|ثم|بعد\s*ذلك|after\s*that|and\s*then|followed by|يليه)/i);
        entities.steps = steps.map(s => s.trim()).filter(s => s.length > 3);
    }

    // 7. Question about capabilities
    else if (CAPABILITY.test(msg)) {
        primary = 'capability_question';
        confidence = 0.9;
        suggestedAction = 'Explain capabilities and confirm if possible';
    }

    // 8. Preference/opinion
    else if (PREFERENCE.test(msg)) {
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
                action: 'genesis_build',
                params: {
                    goal: userMessage,
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

export function analyzeSpecificationProgress(
    currentMessage: string,
    context: ConversationContext
): SpecificationContextUpdate | null {
    if (!context.specificationContext) return null;

    const spec = context.specificationContext;
    const msg = currentMessage.toLowerCase();

    // Check for phase completion signals
    const phaseCompletePatterns = [
        /phase\s+\d+\s+(complete|done|finished)/i,
        /completed\s+phase\s+\d+/i,
        /phase\s+\d+\s+verified/i
    ];
    
    const isPhaseComplete = phaseCompletePatterns.some(p => p.test(msg));

    // Check for requirement implementation signals
    const requirementPatterns = [
        /implemented\s+(req|requirement)\s+[\w-]+/i,
        /requirement\s+[\w-]+\s+(done|complete|implemented)/i,
        /finished\s+implementing\s+[\w-]+/i
    ];
    
    const isRequirementDone = requirementPatterns.some(p => p.test(msg));

    // Check for constraint resolution
    const tensionPatterns = [
        /resolved\s+(tension|constraint)\s+[\w-]+/i,
        /(performance|security|availability)\s+(vs|versus)\s+(security|performance|simplicity|flexibility)\s+resolved/i
    ];
    
    const isTensionResolved = tensionPatterns.some(p => p.test(msg));

    // Build update
    const update: SpecificationContextUpdate = {
        specificationId: context.specificationContext!.specificationId,
        phaseAdvanced: false,
        requirementsUpdated: [],
        tensionsResolved: [],
        newImplicitRequirements: []
    };

    if (isPhaseComplete) {
        update.phaseAdvanced = true;
    }

    // Check for specific requirement mentions
    const reqIdPattern = /(req|requirement|req-?)\s*(\d+)/gi;
    const reqMatches = currentMessage.matchAll(reqIdPattern);
    for (const match of reqMatches) {
        const reqId = match[2] ? `REQ-${match[2].padStart(3, '0')}` : match[1];
        if (!update.requirementsUpdated.includes(reqId)) {
            update.requirementsUpdated.push(reqId);
        }
    }

    if (isTensionResolved) {
        const tensionIds = context.specificationContext!.constraintInteractions
            .filter(c => c.resolutionStrategy && 
                currentMessage.toLowerCase().includes(c.resolutionStrategy.toLowerCase()))
            .map(c => c.constraintIds.join('_'));
        update.tensionsResolved.push(...tensionIds);
    }

    return update;
}

export interface SpecificationContextUpdate {
    specificationId: string;
    phaseAdvanced: boolean;
    requirementsUpdated: string[];
    tensionsResolved: string[];
    newImplicitRequirements: string[];
}

export function updateSpecificationContext(
    context: ConversationContext,
    update: SpecificationContextUpdate
): void {
    if (!context.specificationContext) return;

    const spec = context.specificationContext!;
    
    // Update requirement coverage
    for (const reqId of update.requirementsUpdated) {
        const coverage = spec.requirementCoverage.get(reqId);
        if (coverage) {
            coverage.status = 'implemented';
            coverage.lastUpdated = Date.now();
            spec.requirementCoverage.set(reqId, coverage);
        }
    }

    // Update tension resolutions
    for (const tensionKey of update.tensionsResolved) {
        const tensions = spec.constraintInteractions.filter(
            c => c.constraintIds.join('_') === tensionKey
        );
        for (const tension of tensions) {
            tension.resolutionStrategy = 'resolved';
        }
    }

    // Advance phase if needed
    if (update.phaseAdvanced) {
        const currentPhase = spec.currentPhase;
        const nextPhase = currentPhase + 1;
        spec.currentPhase = nextPhase;
        spec.currentPhaseName = `Phase ${nextPhase}`;
        
        // Initialize next phase progress
        const phaseProgress = spec.phaseProgress.get(nextPhase) || {
            phaseNumber: nextPhase,
            name: `Phase ${nextPhase}`,
            status: 'in_progress',
            requirementsCovered: []
        };
        phaseProgress.status = 'in_progress';
        phaseProgress.startedAt = Date.now();
        spec.phaseProgress.set(nextPhase, phaseProgress);

        // Mark previous phase as completed
        const prevProgress = spec.phaseProgress.get(currentPhase);
        if (prevProgress) {
            prevProgress.status = 'completed';
            prevProgress.completedAt = Date.now();
        }
    }
}

export default {
    extractEntities,
    analyzeContextualIntent,
    buildConversationContext,
    matchPatternWithContext,
    analyzeSpecificationProgress,
    updateSpecificationContext
};
