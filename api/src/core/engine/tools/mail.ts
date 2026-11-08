/**
 * email_watch_replies: the run tells Joe whom it emailed, and Joe watches for
 * their replies in the background (core/devices/mail-watch.ts, read from the
 * phone's mail notifications by modules/services/MailWatchService.ts) and
 * tells the owner in this chat the moment one arrives.
 *
 * The owner, 2026-11-08: «I want Joe to follow, in the background, whether a
 * reply arrives from the people he emailed, and tell me — Joe himself».
 */
import type { EngineTool, ToolContext, ToolOutcome } from '../types';
import { activeWatches, emailAddresses, markChatMessagesRead, stopWatching, unreadChatMessages, watchReplies } from '../../devices/mail-watch';

interface WatchArgs { to: string[]; name?: string; subject?: string; stop?: boolean }

const langOf = (ctx: ToolContext): 'ar' | 'en' | undefined => {
    const l = String(ctx.replyLanguage || ctx.language || '').toLowerCase();
    if (l.startsWith('ar')) return 'ar';
    if (l.startsWith('en')) return 'en';
    return undefined;
};

export const emailWatchTool: EngineTool<WatchArgs> = {
    name: 'email_watch_replies',
    description: 'Watch, in the background, for emails from these people and tell the owner in this chat the moment one arrives (Joe reads his phone\'s mail notifications: nothing on the screen moves). Call it ONCE right after you have checked that an email you sent is in Sent: every recipient address, the name the owner used for the person, and the subject. Call it too when the owner asks to be told when someone writes or replies. Joe watches for 14 days. stop: true stops watching those addresses (or every one from this chat when "to" is empty).',
    parameters: {
        type: 'object',
        properties: {
            to: { type: 'array', items: { type: 'string' }, description: 'The email addresses, as written in the email (name@example.com).' },
            name: { type: 'string', description: 'The person\'s name as the owner calls them («شروق»), when he named them.' },
            subject: { type: 'string', description: 'The subject of the email you sent.' },
            stop: { type: 'boolean', description: 'true to stop watching instead.' },
        },
        required: ['to'],
    },
    parse: raw => {
        const r = (raw || {}) as Record<string, unknown>;
        const list = Array.isArray(r.to) ? r.to : typeof r.to === 'string' ? [r.to] : [];
        const to = emailAddresses(list.map(String).join(' '));
        const stop = r.stop === true;
        if (!to.length && !stop) return { ok: false, error: '"to" must hold the email addresses you wrote to (name@example.com). Read them off the sent email if you do not have them.' };
        return {
            ok: true,
            value: {
                to,
                ...(typeof r.name === 'string' && r.name.trim() ? { name: r.name.trim().slice(0, 80) } : {}),
                ...(typeof r.subject === 'string' && r.subject.trim() ? { subject: r.subject.trim().slice(0, 200) } : {}),
                ...(stop ? { stop } : {}),
            },
        };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const sessionId = String(ctx.joe?.sessionId || '');
        if (a.stop) {
            const n = stopWatching(sessionId, a.to);
            return { ok: true, output: n ? `Stopped watching ${n} address(es). Tell the owner.` : 'Nothing was being watched for those addresses.' };
        }
        const userId = ctx.joe?.userId ? String(ctx.joe.userId) : undefined;
        const added = watchReplies(sessionId, { to: a.to, name: a.name, subject: a.subject, request: ctx.request, lang: langOf(ctx), userId });
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('../../../modules/services/MailWatchService').mailWatchService.wake();
        } catch { /* the service starts with Joe; the watch is kept either way */ }
        const all = activeWatches().map(w => w.to);
        return {
            ok: true,
            output: `Joe now watches, in the background, for replies from ${added.map(w => w.to).join(', ')} (14 days) and will tell the owner in this chat when one arrives. Watching now: ${all.join(', ')}. Say this to the owner in one short sentence in your summary.`,
        };
    },
};

/**
 * THE OWNER ASKS TO BE TOLD WHEN SOMEONE WRITES.
 *
 * «انتظر حتى ترد واعلمني», «اذا رد عليك اخبرني», «خبرني لما يوصلني ايميل من
 * احمد», «تابع ردود شروق», "let me know when she replies": the work is on his
 * phone's mail (operate, the phone), where email_watch_replies is. A word to
 * tell or watch, with a word for a reply or an email.
 */
const AR_TAIL_W = '[\\u0621-\\u064A\\u064B-\\u0652]*';
const AR_B = '(?:^|[\\s،,.؟?!])[وفل]?';
const AR_E = '(?=[\\s،,.؟?!]|$)';
/** To watch («تابع», «راقب», «انتظر»): enough with a reply or an email, unless he is writing one. */
const WATCH = new RegExp(`${AR_B}(?:تابع|راقب|انتظر|استن[اى])${AR_TAIL_W}${AR_E}|\\b(?:watch\\s+for|wait\\s+for|keep\\s+an\\s+eye\\s+on|monitor)\\b`, 'iu');
/** To be told («اخبرني», "let me know"): only with WHEN it happens («اذا», «لما», "when"). */
const TELL = new RegExp(`${AR_B}(?:[اأ]خبرني|خبّ?رني|[اأ]علمني|علّ?مني|نبّ?هني|بلّ?غني|ذكّ?رني)${AR_TAIL_W}${AR_E}|\\b(?:let\\s+me\\s+know|tell\\s+me|notify\\s+me|alert\\s+me)\\b`, 'iu');
const WHEN = new RegExp(`${AR_B}(?:[اإ]ذا|لو|لمّ?ا|عندما|حين|متى|حتى|[أا]ول\\s+ما|بس)${AR_E}|\\b(?:when|if|once|as\\s+soon\\s+as|whenever)\\b`, 'iu');
const A_REPLY = new RegExp(`${AR_B}(?:ال)?(?:ردّ?|ردود|يردّ?|تردّ?|يردون|يردوا|ايميل|إيميل|ايميلات|إيميلات|بريد|رسال[هة]|مسج|يوصل|توصل|وصل|يصل|تصل|يراسل|تراسل)${AR_TAIL_W}${AR_E}`
    + '|\\b(?:repl(?:y|ies|ied)|respond(?:s|ed)?|e-?mails?|mail|writes?\\s+(?:back|to\\s+me))\\b', 'iu');
const COMPOSE = new RegExp(`${AR_B}(?:اكتب|كتابة|[اأإ]رسل|[اإ]رسال|ابعث|صغ|صياغة)${AR_TAIL_W}${AR_E}|\\b(?:write|compose|draft|send)\\b`, 'iu');

export function isMailWatchRequest(text: string): boolean {
    const t = String(text || '');
    if (t.length > 300 || !A_REPLY.test(t)) return false;
    return (WATCH.test(t) && !COMPOSE.test(t)) || (TELL.test(t) && WHEN.test(t));
}

/**
 * The same, kept even when the run forgot the tool: a run that was asked to
 * SEND an email and was done and checked leaves a watch for every address in
 * the request or the run's summary — unless one was just made for it.
 */
const SEND_EMAIL = /(?:ارسل|أرسل|إرسل|ابعث|ابعت|راسل|بعتل|send|write|email\s+to|mail\s+to|reply)/iu;
const EMAIL_WORD = /(?:ايميل|إيميل|إيميلات|ايميلات|بريد|رساله\s+على\s+الايميل|e-?mail|mail)/iu;

export function watchAfterSentEmail(sessionId: unknown, request: string, summary: string, lang?: 'ar' | 'en', userId?: string, now = Date.now()): string[] {
    const text = String(request || '');
    if (!SEND_EMAIL.test(text) || !EMAIL_WORD.test(text)) return [];
    const recent = new Set(activeWatches(now).filter(w => now - w.sentAt < 30 * 60_000).map(w => w.to));
    const to = emailAddresses(`${text} ${summary || ''}`).filter(a => !recent.has(a));
    if (!to.length) return [];
    return watchReplies(sessionId, { to, request: text, lang, userId, auto: true }, now).map(w => w.to);
}

/*
 * WHAT HE ASKED BEFORE JOE COULD WATCH IS NOT FORGOTTEN.
 *
 * The owner, 2026-11-08: «Shoroq's email arrived and Joe did not tell me,
 * though I told him last night: send the email and watch whether Shoroq
 * replies». At 00:33 Joe sent it to shoroq.suwan@gmail.com; at 00:36 he wrote
 * «اذا وصل اي ايميل من شروق اعلمني بذلك مباشره», and was told Joe cannot work
 * in the background — true that night. The watch was built that morning, and
 * nothing went back to what he had asked: her reply came at 10:38 and Joe was
 * silent.
 *
 * Each time the watch starts, Joe reads the chats of the last 14 days. A
 * message of his that asked to be told when someone writes, or to send an
 * email, becomes a watch from THAT moment, on the addresses the chat around
 * it names (the hour before and the two after: the address Joe found or he
 * gave, the one Joe wrote to). An address named as the account mail was sent
 * FROM («the account younes@…») is his own, not a person. Each message is read
 * once, so a watch he stopped stays stopped.
 */
export interface ChatLine { id: string; sessionId: string; role: string; content: string; at: number; userId?: string }

const BACKFILL_MS = 14 * 24 * 60 * 60_000;
const BEFORE_MS = 60 * 60_000;
const AFTER_MS = 2 * 60 * 60_000;
/** «الحساب younes@…», "account younes@…", "from younes@…": the account it was sent from, his own. */
const ACCOUNT_BEFORE = /(?:الحساب|حسابك|حسابه|حساب|account|from|signed\s+in\s+as|sender)\s*[:(«"'‏‎]*\s*$/iu;
const AR_WORD_STOP = new Set(['ايميل', 'إيميل', 'بريد', 'البريد', 'رسالة', 'رساله', 'هاتفي', 'الهاتف', 'جوالي', 'حسابي', 'اي', 'أي', 'التي', 'الذي', 'قبل', 'بعد', 'هذا', 'هذه']);

/** The person he named («من شروق», «لشروق», «الى احمد»), when one is named in Arabic. */
function nameIn(text: string): string | undefined {
    for (const m of String(text || '').matchAll(/(?:^|\s)(?:من|إلى|الى|لـ?)\s*([ء-ي]{3,14})/gu)) {
        const w = m[1];
        if (!AR_WORD_STOP.has(w)) return w;
    }
    return undefined;
}

/** The addresses a chat text names as people, not as the account mail went out from. */
function peopleAddresses(text: string): string[] {
    const out: string[] = [];
    for (const m of String(text || '').matchAll(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu)) {
        if (ACCOUNT_BEFORE.test(String(text).slice(Math.max(0, (m.index || 0) - 30), m.index))) continue;
        out.push(m[0].replace(/[.'-]+$/u, '').toLowerCase());
    }
    return [...new Set(out)];
}

/** Turns what he asked in the last 14 days into watches; returns what it added. */
export function backfillWatchesFromChats(lines: ChatLine[], now = Date.now()): Array<{ sessionId: string; to: string[]; at: number }> {
    const recent = lines.filter(l => l && l.id && l.sessionId && Number.isFinite(l.at) && now - l.at <= BACKFILL_MS);
    const asks = recent.filter(l => l.role === 'user' && (isMailWatchRequest(l.content) || (SEND_EMAIL.test(l.content) && EMAIL_WORD.test(l.content))));
    const fresh = new Set(unreadChatMessages(asks.map(l => l.id)));
    const added: Array<{ sessionId: string; to: string[]; at: number }> = [];
    for (const ask of asks.filter(l => fresh.has(l.id)).sort((a, b) => a.at - b.at)) {
        const around = recent.filter(l => l.sessionId === ask.sessionId && l.at >= ask.at - BEFORE_MS && l.at <= ask.at + AFTER_MS);
        const to = [...new Set(around.flatMap(l => peopleAddresses(l.content)))];
        if (!to.length) continue;
        const made = watchReplies(ask.sessionId, {
            to, name: nameIn(ask.content), request: ask.content, auto: true,
            ...(ask.userId ? { userId: ask.userId } : {}),
        }, ask.at);
        if (made.length) added.push({ sessionId: ask.sessionId, to: made.map(w => w.to), at: ask.at });
    }
    markChatMessagesRead([...fresh], now);
    return added;
}
