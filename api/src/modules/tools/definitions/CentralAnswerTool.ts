import { isArabicReply } from '../../../shared/reply-language';
import { ToolDefinition } from '../types';
import { isProviderFailure, isUsableAnswer, routeToModel } from '../../../core/llm/intelligent-router';
import { safeProviderError } from '../../../core/llm/provider-continuity';
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

/** Include the live clock only when the question depends on the present moment. */
function needsClockContext(question: string): boolean {
    const english = /\b(?:what time|current time|local time|time now|date|today|tomorrow|yesterday|weekday|what day|which day|day of the week|tonight|this morning|this afternoon|this evening)\b/i;
    const arabic = /الوقت|الساعة|التاريخ|اليوم|أي يوم|اي يوم|غد[اأً]|أمس|امس|الآن|الان|صباح اليوم|مساء اليوم/;
    return english.test(question) || arabic.test(question);
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

        const baseSystemPrompt = `You are Joe, the AI software engineer at XElite Solutions.
Answer the user's actual question accurately and directly. Follow the user's requested format, length, and language exactly.
Do not add greetings, slogans, sales language, or claims about tools unless relevant or requested. If uncertain, say what is uncertain.`;
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
        const firstName = rawName.split(/\s+/)[0] || '';
        const userName = /^(user|guest|admin|anonymous|unknown|مستخدم)$/i.test(firstName)
            ? '' : firstName;
        const now = new Date();
        const hour = now.getHours();
        const personalFacts = [
            userName ? `The user's first name is «${userName}». Use it only when natural and compatible with the requested format.` : '',
            needsClockContext(question) ? buildTimeBlock(now) : '',
        ].filter(Boolean);
        const personalBlock = personalFacts.length ? '\n\n' + personalFacts.join('\n') : '';
        // Standing instructions from Settings — the user's permanent rules for
        // how Joe should work (e.g. terminal-first building).
        const standingIns = String(context?.systemInstructions || '').trim();
        const standingBlock = standingIns
            ? `\n\nSTANDING USER INSTRUCTIONS (always obey):\n${standingIns.slice(0, 2000)}`
            : '';

        const systemPrompt = (isAr
            ? `${baseSystemPrompt}\n\nCRITICAL INSTRUCTION: اكتب ردّك **بالعربية الفصحى بالكامل**. لا تخلط كلمات إنجليزية داخل الجملة العربية (هذا يُشوّش قراءة النص). عند الحاجة لمصطلح تقني، اكتب مقابله العربي، وإن لزم ضع الإنجليزي بين قوسين بعده — مثال: «الواجهة الأمامية (Frontend)». استثناء وحيد: أسماء الأوامر/الأكواد داخل علامات الكود.`
            : baseSystemPrompt) + personalBlock + standingBlock + memoryBlock;

        // [INSTANT FAST-PATH] Pure greetings / identity / thanks answer IMMEDIATELY
        // with no model call at all — instant even on a slow CPU-only laptop. Only
        // fires for SHORT messages that are ONLY small-talk (anything with a real
        // task like "hi, build me a page" still goes to the model below).
        const instant = ((): string | null => {
            const q = String(question || '').trim();
            const wordCount = q.split(/\s+/).filter(Boolean).length;
            if (q.length > 40 || wordCount > 6) return null;
            // Fast answers are safe only when the entire utterance is small talk.
            // A greeting, thanks, or identity phrase can prefix a real request;
            // matching only its opening silently discards that request.
            const smallTalk = q.toLowerCase()
                .replace(/[\u064B-\u065F\u0670]/g, '')
                .replace(/[إأآ]/g, 'ا')
                .replace(/[!?؟.,،؛:]+/g, ' ')
                .replace(/\s+/g, ' ').trim();
            const isGreeting = /^(?:هلا|مرحبا|سلام|السلام|السلام عليكم|اهلا|اهل|صباح|صباح الخير|مساء|مساء الخير|تحية|تحية طيبة|هاي|hi+|hey|hello|yo|hola)(?: (?:there|joe|جو)| يا (?:joe|جو))?$/.test(smallTalk);
            const isIdentity = /^(?:من انت|من انتا|ما اسمك|عرف عن نفسك|who are you|what(?:'s| is) your name)$/.test(smallTalk);
            const isThanks = /^(?:شكرا|مشكور|يعطيك|يعطيك العافية|تسلم|thanks|thank you|thx|tnx)$/.test(smallTalk);
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
            if (isProviderFailure(text)) {
                return { ok: false, error: text, logs: ['central_answer: provider failed; no answer produced'] };
            }
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
                    if (!isProviderFailure(rt) && rt.length >= 2 && arabicShare(rt) > Math.max(0.5, arabicShare(text))) {
                        logs.push(`central_answer: language enforced — reply was ${Math.round(arabicShare(text) * 100)}% Arabic, rewritten to ${Math.round(arabicShare(rt) * 100)}%`);
                        text = rt;
                    } else {
                        logs.push('central_answer: language rewrite did not comply — kept the original');
                    }
                } catch (e: any) {
                    logs.push(`central_answer: language rewrite failed (${e?.message || e}) — kept the original`);
                }
            }
            if (isUsableAnswer(text)) {
                return {
                    ok: true,
                    output: text,
                    logs
                };
            }
            return {
                ok: false,
                error: 'central_answer: model returned an empty or invalid response',
                logs: ['central_answer: no usable model answer produced']
            };
        } catch (e: any) {
            if (context?.isCancelled?.() || context?.signal?.aborted || String(e?.message || e).includes('run_cancelled_by_owner')) {
                return { ok: false, error: 'run_cancelled_by_owner', logs: ['central_answer: cancelled before answer'] };
            }
            const reason = safeProviderError(e, context?.modelConfig?.apiKey) || 'unknown router error';
            console.warn(`[central_answer] router failed: ${reason}`);
            return {
                ok: false,
                error: `central_answer: router failed: ${reason}`,
                logs: ['central_answer: router failed; no answer produced']
            };
        }
    }
}
