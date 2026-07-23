import { ToolDefinition } from '../types';
import { routeToModel } from '../../../core/llm/intelligent-router';

/**
 * CentralAnswerTool - A simple Q&A tool for general questions
 * This tool is used when the agent needs to answer a question directly
 * without executing complex workflows.
 */
export class CentralAnswerTool implements ToolDefinition {
    name = 'central_answer';
    version = '1.0.0';
    description = 'Answer a general question or provide information directly to the user';
    tags = ['qa', 'general'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            question: {
                type: 'string' as const,
                description: 'The question to answer'
            }
        },
        required: ['question']
    };

    outputSchema = {
        type: 'string' as const
    };

    // Legacy compatibility
    get parameters() {
        return this.inputSchema;
    }

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 0;
    auditFields = [];
    mockSupported = false;

    async execute(input: { question: string }, context?: any) {
        const { question } = input;
        const lang = context?.language || 'en';
        const isAr = lang.startsWith('ar') || /[؟\u0600-\u06FF]/.test(question);

        const baseSystemPrompt = `You are **Joe**, the Elite AI Engine of **XElite Solutions**.
You are a world-class specialist in **Web Development, App Architecture, and Complex System Engineering**.
Your responses should be **powerful, enticing, and professional**. Use language that captivates the user and demonstrates superior expertise ("Elite", "Advanced", "Premium State-of-the-Art").
You have full autonomous capabilities (Files, Terminal, Browser).
Always identify as **Joe**. Never mention ChatGPT or OpenAI.
Your goal is to build the extraordinary.`;
        const systemPrompt = isAr
            ? `${baseSystemPrompt}\n\nCRITICAL INSTRUCTION: You MUST respond in **ARABIC** (اللغة العربية) ONLY. Use professional, technical Arabic terminology. Do NOT use English unless for code or specific technical terms that are better in English.`
            : baseSystemPrompt;

        // Deterministic reply so a conversational turn NEVER fails into the
        // orchestrator's diagnostic "recovery" loop (the duplicated neural-thinking
        // the user reported) even if every free provider is momentarily unavailable.
        const fallbackReply = (): string => {
            const low = String(question || '').toLowerCase();
            const isGreeting = /مرحب|سلام|أهل|اهل|صباح|مساء|hello|\bhi\b|\bhey\b/.test(low);
            const isIdentity = /من ?ان?ت|من ?أنت|who are you|عرّ?ف|ما ?اسمك|what are you/.test(low);
            if (isAr) {
                if (isIdentity) return 'أنا **جو (Joe)** — محرّك الذكاء الهندسي المتقدّم من **XElite Solutions**. متخصص في تطوير الويب وهندسة الأنظمة والتطبيقات، وأملك أدوات كاملة (الملفات، الطرفية، المتصفح). كيف أخدمك اليوم؟';
                if (isGreeting) return 'مرحباً بك! 👋 أنا **جو**، مساعدك الهندسي من XElite. جاهز لبناء أي شيء تريده — أخبرني بما تحتاج.';
                return 'أنا **جو** من XElite، جاهز لمساعدتك. أخبرني بتفاصيل ما تريد إنجازه.';
            }
            if (isIdentity) return "I'm **Joe** — the elite engineering AI by **XElite Solutions** (web, apps, and complex systems) with full tools: files, terminal, browser. How can I help?";
            if (isGreeting) return "Hi! 👋 I'm **Joe**, your engineering assistant by XElite. Tell me what you'd like to build.";
            return "I'm **Joe** by XElite, ready to help. Tell me what you need.";
        };

        try {
            const answer = await routeToModel([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: question }
            ], undefined, undefined, undefined, undefined, undefined, undefined, context);

            const text = (typeof answer === 'string' ? answer : '').trim();
            if (text && text.length >= 2) {
                return {
                    ok: true,
                    output: text,
                    logs: ['central_answer: Answered via router']
                };
            }
            // Empty/invalid router response -> deterministic reply (still a success).
            return {
                ok: true,
                output: fallbackReply(),
                logs: ['central_answer: fallback (empty router response)']
            };
        } catch (e: any) {
            // Never turn a simple conversational reply into a failure/recovery loop.
            console.warn(`[central_answer] router failed, using deterministic reply: ${e?.message}`);
            return {
                ok: true,
                output: fallbackReply(),
                logs: [`central_answer: fallback (router error: ${e?.message})`]
            };
        }
    }
}
