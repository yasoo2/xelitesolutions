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
        const question = String(input?.question ?? '').trim();
        const lang = context?.language || 'en';
        const isAr = lang.startsWith('ar') || /[؟\u0600-\u06FF]/.test(question);
        // Called with no question (a tool-picker that emitted empty args), this
        // used to send a message with NO content to the provider — a 400 that
        // cascaded into the entire provider chain being declared dead. Fail here,
        // honestly and cheaply, before any model call.
        if (!question) {
            return {
                ok: false,
                error: isAr ? 'لم يصل أي سؤال إلى أداة الإجابة (استدعاء ناقص).' : 'central_answer was called without a question.',
                logs: ['central_answer: empty question — refused before any model call'],
            };
        }

        const baseSystemPrompt = `You are **Joe**, the Elite AI Engine of **XElite Solutions**.
You are a world-class specialist in **Web Development, App Architecture, and Complex System Engineering**.
Your responses should be **powerful, enticing, and professional**. Use language that captivates the user and demonstrates superior expertise ("Elite", "Advanced", "Premium State-of-the-Art").
You have full autonomous capabilities (Files, Terminal, Browser).
Always identify as **Joe**. Never mention ChatGPT or OpenAI.
Your goal is to build the extraordinary.`;
        // [PERSISTENT MEMORY] Inject what Joe remembers about this user/project so
        // replies are personalised and consistent across sessions.
        const memoryContext = String(context?.memoryContext || '').trim();
        const memoryBlock = memoryContext
            ? `\n\nWHAT YOU ALREADY KNOW ABOUT THIS USER/PROJECT (use it naturally, do not repeat it verbatim):\n${memoryContext.slice(0, 800)}`
            : '';

        // [PERSONAL TOUCH] Joe runs on the user's own machine, so the server clock
        // IS the user's local clock — the time-of-day greeting is honest, not a guess.
        // Generic placeholder names («User», «anonymous») are never used as names.
        const rawName = String(context?.userName || '').trim();
        // First name only — a greeting says «يا يونس», not the full legal name.
        const userName = /^(user|admin|anonymous|unknown|مستخدم)$/i.test(rawName)
            ? '' : (rawName.split(/\s+/)[0] || '');
        const hour = new Date().getHours();
        const dayPartEn = hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 15 ? 'midday'
            : hour < 18 ? 'afternoon' : 'evening';
        const dayPartAr = hour < 5 ? 'وقت متأخر من الليل' : hour < 12 ? 'الصباح' : hour < 15 ? 'الظهيرة'
            : hour < 18 ? 'العصر' : 'المساء';
        const personalBlock = `\n\nPERSONAL TOUCH:\n`
            + (userName
                ? `- The user's name is «${userName}». Address them by name naturally now and then (in Arabic: «يا ${userName}») — warm, never in every sentence.\n`
                : `- The user's name is unknown — do NOT invent one.\n`)
            + `- Local time of day right now: ${dayPartEn} (${dayPartAr}). If the user greets you or a greeting fits, use the matching one (صباح الخير/مساء الخير/Good ${dayPartEn === 'morning' ? 'morning' : 'evening'}) and vary your phrasing between conversations.`;

        // Standing instructions from Settings — the user's permanent rules for
        // how Joe should work (e.g. terminal-first building).
        const standingIns = String(context?.systemInstructions || '').trim();
        const standingBlock = standingIns
            ? `\n\nSTANDING USER INSTRUCTIONS (always obey):\n${standingIns.slice(0, 2000)}`
            : '';

        const systemPrompt = (isAr
            ? `${baseSystemPrompt}\n\nCRITICAL INSTRUCTION: اكتب ردّك **بالعربية الفصحى بالكامل**. لا تخلط كلمات إنجليزية داخل الجملة العربية (هذا يُشوّش قراءة النص). عند الحاجة لمصطلح تقني، اكتب مقابله العربي، وإن لزم ضع الإنجليزي بين قوسين بعده — مثال: «الواجهة الأمامية (Frontend)». استثناء وحيد: أسماء الأوامر/الأكواد داخل علامات الكود.`
            : baseSystemPrompt) + personalBlock + standingBlock + memoryBlock;

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

        // [INSTANT FAST-PATH] Pure greetings / identity / thanks answer IMMEDIATELY
        // with no model call at all — instant even on a slow CPU-only laptop. Only
        // fires for SHORT messages that are ONLY small-talk (anything with a real
        // task like "hi, build me a page" still goes to the model below).
        const instant = ((): string | null => {
            const q = String(question || '').trim();
            const wordCount = q.split(/\s+/).filter(Boolean).length;
            if (q.length > 40 || wordCount > 6) return null;
            const low = q.toLowerCase();
            // NOTE: JS \b only recognises ASCII word chars, so it never matches after
            // an Arabic letter. Match Arabic roots on the raw text (no \b) and keep
            // \b only for the Latin alternatives.
            const isGreeting = /^(هلا|مرحب|سلام|السلام|أهل|اهل|صباح|مساء|تحية|هاي)/.test(q) || /^(hi|hii|hey|hello|yo|hola)\b/i.test(low);
            const isIdentity = /^(من ?ان?ت|من ?أنت|ما ?اسمك|عرّ?ف عن نفسك|عرف عن نفسك)/.test(q) || /^(who are you|what('?s| is) your name)/i.test(low);
            const isThanks = /^(شكرا|شكراً|مشكور|يعطيك|تسلم)/.test(q) || /^(thanks|thank you|thx|tnx)\b/i.test(low);
            // Reject if it also contains a task verb (build/create/open/write/...).
            const hasTask = /(ابن|انش|اعمل|صمم|برمج|افتح|اكتب|اقرأ|احذف|شغل|نفذ|ابحث|build|create|make|open|write|read|delete|run|search|fix|add)/i.test(low);
            if (hasTask) return null;
            if (isThanks) return isAr ? 'على الرحب والسعة! 🙌 أنا **جو** جاهز لأي مهمة تالية.' : "You're welcome! 🙌 I'm **Joe**, ready for the next task.";
            if (isIdentity) return isAr
                ? 'أنا **جو (Joe)** — محرّك الذكاء الهندسي المتقدّم من **XElite Solutions**، وأملك أدوات كاملة (الملفات، الطرفية، المتصفح). كيف أخدمك؟'
                : "I'm **Joe** — the elite engineering AI by **XElite Solutions**, with full tools: files, terminal, browser. How can I help?";
            if (isGreeting) {
                // Time-aware, name-aware, and VARIED: the variant rotates with the
                // day of the year, so the greeting differs day to day — real logic,
                // not a random flicker.
                const nameAr = userName ? ` يا ${userName}` : '';
                const nameEn = userName ? `, ${userName}` : '';
                const day = Math.floor(Date.now() / 86_400_000);
                const saluteAr = hour < 5
                    ? [`سهرة موفقة${nameAr}!`, `ما زلنا مستيقظين${nameAr}؟ ممتاز — أفضل الأفكار تولد ليلاً.`]
                    : hour < 12
                        ? [`صباح الخير${nameAr}! ☀️`, `صباح النور${nameAr}! يوم جديد وفكرة جديدة؟`, `أسعد الله صباحك${nameAr}!`]
                        : hour < 18
                            ? [`مساء الخير${nameAr}!`, `أهلاً بك${nameAr}! عصرٌ مناسب لإنجاز شيء جميل.`]
                            : [`مساء الخير${nameAr}! 🌙`, `مساء النور${nameAr}! ما الذي سنصنعه الليلة؟`, `أهلاً${nameAr}! الليل وقت الصنّاع.`];
                const saluteEn = hour < 12
                    ? [`Good morning${nameEn}! ☀️`, `Morning${nameEn} — fresh day, fresh ideas.`]
                    : hour < 18
                        ? [`Good afternoon${nameEn}!`, `Hello${nameEn}!`]
                        : [`Good evening${nameEn}! 🌙`, `Evening${nameEn} — a maker's favorite hour.`];
                const pick = (arr: string[]) => arr[day % arr.length];
                return isAr
                    ? `${pick(saluteAr)} أنا **جو**، مهندسك البرمجي. أخبرني بما تريد بناءه.`
                    : `${pick(saluteEn)} I'm **Joe**, your software engineer. Tell me what you'd like to build.`;
            }
            return null;
        })();
        if (instant) {
            return { ok: true, output: instant, logs: ['central_answer: instant fast-path (no model call)'] };
        }

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
