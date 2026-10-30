import { isArabicReply } from '../../../shared/reply-language';
import { ToolDefinition } from '../types';
import { routeToModel } from '../../../core/llm/intelligent-router';
import { arabicShare } from '../../../shared/utils/language';

/**
 * ONE «NOW», NAMED ONCE.
 *
 * Measured on the owner's own machine, three consecutive turns inside forty
 * seconds: «عصرٌ مناسب لإنجاز شيء جميل» · «الساعة الآن تقريبًا 12:00 ظهرًا» ·
 * «مساء الخير». Three different times of day for one moment. Then «كم الساعة
 * الآن؟» answered «تقريبًا 12:00» twice while his own clock read 14:00.
 *
 * Two causes, and neither was the model's reasoning — in the same session it
 * counted 132 days to New Year correctly and refused a false Monday/Tuesday
 * choice with the right answer:
 *
 *   1. THE PROMPT ANNOUNCED A BAND AND NEVER A CLOCK. It said «Local time of
 *      day right now: midday». Asked for the time, the model had no value to
 *      quote, so it produced the plausible centre of the band it was given —
 *      and produced the same one again, which reads exactly like a frozen
 *      clock. A band is not a time.
 *
 *   2. THE DAY-WORDS DISAGREED WITH EACH OTHER. The band labels cut at 15,
 *      the greeting buckets cut at 18, and one bucket carried «مساء الخير»
 *      beside «عصرٌ مناسب» while its own label was «الظهيرة». Worse, the
 *      instruction offered the model a menu of two — صباح الخير or مساء
 *      الخير — for a band called midday, which is in neither. Told to pick
 *      the matching one from a list that had no match, it picked wrong.
 *
 * So: one function names the moment, every day-word in this file comes from
 * it, and the actual clock is handed over as a value with an explicit ban on
 * approximating one.
 */
export function dayPartFor(hour: number): { en: string; ar: string; greetAr: string; greetEn: string } {
    if (hour < 5) return { en: 'late night', ar: 'وقت متأخر من الليل', greetAr: 'سهرة موفقة', greetEn: 'Good evening' };
    if (hour < 12) return { en: 'morning', ar: 'الصباح', greetAr: 'صباح الخير', greetEn: 'Good morning' };
    if (hour < 15) return { en: 'midday', ar: 'الظهيرة', greetAr: 'طاب يومك', greetEn: 'Good afternoon' };
    if (hour < 18) return { en: 'afternoon', ar: 'العصر', greetAr: 'مساء الخير', greetEn: 'Good afternoon' };
    return { en: 'evening', ar: 'المساء', greetAr: 'مساء الخير', greetEn: 'Good evening' };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function nowFacts(now: Date = new Date()) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const hour = now.getHours();
    return {
        hour,
        part: dayPartFor(hour),
        clock: `${pad(hour)}:${pad(now.getMinutes())}`,
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        weekday: WEEKDAYS[now.getDay()],
    };
}

/**
 * Joe runs on the user's own machine, so the server clock IS his clock. That
 * makes the value quotable — and makes inventing one inexcusable.
 */
export function buildTimeBlock(now: Date = new Date()): string {
    const f = nowFacts(now);
    return `- Right now it is ${f.weekday} ${f.date}, ${f.clock}, on the user's own machine (${f.part.en} — ${f.part.ar}).`
        + ` This is the ONLY clock you have: quote it when the time or the date is asked, and NEVER approximate, round, or invent a time.`
        + ` If a greeting fits, open with the one that matches this moment («${f.part.greetAr}» / «${f.part.greetEn}») and vary only the rest of the sentence.`;
}

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
        /**
         *  A FIFTH PRIVATE ANSWER TO THE SAME QUESTION.
         *
         *  The `||` meant the script of his sentence always won: with the
         *  interface set to English and an Arabic question, this answered in
         *  Arabic — measured live, in a chat whose own greeting on the same
         *  screen read «Good afternoon, Guest».
         *
         *  The rule lives in shared/reply-language and every layer asks it:
         *  the interface he is looking at decides what Joe SAYS, and the
         *  script of what he typed decides only when no interface language
         *  arrived at all.
         */
        const isAr = isArabicReply({ language: context?.language, text: question });
        const lang = isAr ? 'ar' : (String(context?.language || 'en').split('-')[0] || 'en');
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
        const now = new Date();
        const hour = now.getHours();
        const personalBlock = `\n\nPERSONAL TOUCH:\n`
            + (userName
                ? `- The user's name is «${userName}». Address them by name naturally now and then (in Arabic: «يا ${userName}») — warm, never in every sentence.\n`
                : `- The user's name is unknown — do NOT invent one.\n`)
            + buildTimeBlock(now);

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
                // Every variant opens with the SAME day-word the prompt block
                // above announces — see `dayPartFor`. The old buckets carried
                // «مساء الخير» beside «عصرٌ مناسب» under a label that read
                // «الظهيرة», which is how one moment got three names.
                const part = dayPartFor(hour);
                const tailAr = hour < 5 ? 'أفضل الأفكار تولد ليلاً.'
                    : hour < 12 ? 'يوم جديد وفكرة جديدة؟'
                        : hour < 18 ? 'وقتٌ مناسب لإنجاز شيء جميل.'
                            : 'ما الذي سنصنعه الليلة؟';
                const tailEn = hour < 12 ? 'fresh day, fresh ideas.'
                    : hour < 18 ? 'a good stretch for building something.'
                        : "a maker's favorite hour.";
                const saluteAr = [`${part.greetAr}${nameAr}!`, `${part.greetAr}${nameAr} — ${tailAr}`];
                const saluteEn = [`${part.greetEn}${nameEn}!`, `${part.greetEn}${nameEn} — ${tailEn}`];
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

            let text = (typeof answer === 'string' ? answer : '').trim();
            /**
             * ENFORCE THE LANGUAGE BY MEASUREMENT. The system prompt above
             * DEMANDS Arabic — and a weak fallback model answered the user's
             * Arabic question in fluent English anyway (field-reported, with
             * the reply pasted). An instruction is a request; this is the
             * contract: measure the reply's script, and when an Arabic
             * question got a non-Arabic answer, have the model rewrite it
             * once. The rewrite is kept only if it measurably complies.
             */
            const logs = ['central_answer: Answered via router'];
            if (text && isAr && arabicShare(text) < 0.35) {
                try {
                    const rewritten = await routeToModel([
                        {
                            role: 'system',
                            content: 'أعد كتابة النص التالي بالعربية الفصحى بالكامل، بنفس المعنى والتفاصيل والبنية (العناوين والقوائم والترقيم كما هي). لا تضف معلومات ولا تحذف شيئاً. أبقِ أسماء الأوامر والأكواد كما هي داخل علامات الكود. أخرج النص المُعاد كتابته فقط دون أي مقدمة.',
                        },
                        { role: 'user', content: text },
                    ], undefined, undefined, undefined, undefined, undefined, undefined, context);
                    const rt = String(rewritten || '').trim();
                    if (rt.length >= 2 && arabicShare(rt) > Math.max(0.5, arabicShare(text))) {
                        logs.push(`central_answer: language enforced — reply was ${Math.round(arabicShare(text) * 100)}% Arabic, rewritten to ${Math.round(arabicShare(rt) * 100)}%`);
                        text = rt;
                    } else {
                        logs.push('central_answer: language rewrite did not comply — kept the original');
                    }
                } catch (e: any) {
                    logs.push(`central_answer: language rewrite failed (${e?.message || e}) — kept the original`);
                }
            }
            if (text && text.length >= 2) {
                return {
                    ok: true,
                    output: text,
                    logs
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
