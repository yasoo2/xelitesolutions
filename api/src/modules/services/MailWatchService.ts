/**
 * JOE'S WATCH ON THE REPLIES TO HIS EMAILS, IN THE BACKGROUND, ON HIS OWN.
 *
 * The owner, 2026-11-08: «I want Joe to follow, in the background and
 * automatically, whether a reply arrives from the people he emailed, and tell
 * me» — «not you watching: Joe himself».
 *
 * Started with Joe (api/index.ts). While someone is watched (core/devices/
 * mail-watch.ts: every person Joe emailed, for 14 days), it reads the phone's
 * notifications every 30 seconds (EngineAndroidTool.phoneNotificationsNow:
 * reads only, nothing on the screen moves, no model is paid), and for every
 * new mail from one of them it tells the owner:
 *   - in the chat the email was asked in: a message from Joe, kept with the
 *     chat's history, shown at once when that chat is open;
 *   - wherever he is in Joe: a «joe_notice» event, addressed to him alone,
 *     that the page shows in its header (web JoeNoticeBanner);
 *   - and in that chat's device memory, so «اقرأ الرد» goes to the phone.
 * The adb call runs as the owner's own system task, the way the live phone
 * screen does (api/routes/devices.ts): a fixed read, no command from anyone.
 *
 * JOE_MAIL_WATCH=off turns it off; JOE_MAIL_WATCH_EVERY_MS sets the pace.
 */
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';
import { activeWatches, MAIL_APPS, newReplies, notePhoneLost, parseMailNotices, phoneLostTold, replyMessage, type MailNotice, type MailReply, type MailWatch } from '../../core/devices/mail-watch';

/** The mail notices on the phones online through the Joe app, as the watch reads them. */
function appMailNotices(): MailNotice[] {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { phoneLinks } = require('../../core/devices/phone-link');
        return phoneLinks.notices()
            .filter((x: any) => MAIL_APPS[x.notice.pkg])
            .map((x: any) => ({ ...x.notice, app: MAIL_APPS[x.notice.pkg], key: `app:${x.phoneId}:${x.notice.key}` }));
    } catch { return []; }
}
import { backfillWatchesFromChats, type ChatLine } from '../../core/engine/tools/mail';

/** The chats' messages of the last 14 days, from the store this Joe keeps them in, with each chat's owner. */
async function chatLinesOfTwoWeeks(now = Date.now()): Promise<ChatLine[]> {
    const since = now - 14 * 24 * 60 * 60_000;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const chat = require('../../api/chat-store');
    const line = (m: any, owners: Map<string, string>): ChatLine => ({
        id: String(m?._id || ''), sessionId: String(m?.sessionId || ''), role: String(m?.role || ''),
        content: String(m?.content || ''), at: new Date(m?.createdAt || 0).getTime(),
        ...(owners.get(String(m?.sessionId || '')) ? { userId: owners.get(String(m?.sessionId || '')) } : {}),
    });
    if (chat.usesLocalChatStore()) {
        try { chat.loadChatStores?.(); } catch { /* already in memory */ }
        const owners = new Map<string, string>(((global as any).mockSessions || []).map((s: any) => [String(s?._id || s?.id || ''), String(s?.userId || '')]));
        return ((global as any).mockMessages || []).map((m: any) => line(m, owners)).filter((l: ChatLine) => l.at >= since);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Message } = require('../../shared/models/message');
    const rows: any[] = await Message.find({ createdAt: { $gte: new Date(since) } }).sort({ createdAt: 1 }).limit(20000).lean();
    const owners = new Map<string, string>();
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Session } = require('../../shared/models/session');
        const ids = [...new Set(rows.map(r => String(r.sessionId || '')))].filter(Boolean);
        for (const s of await Session.find({ _id: { $in: ids } }).select({ userId: 1 }).lean()) owners.set(String(s._id), String(s.userId || ''));
    } catch { /* the owner is found when Joe tells him (session-identity) */ }
    return rows.map(r => line(r, owners));
}

/*
 * EVERY 30 SECONDS. Outlook takes a mail's notification off the phone as soon
 * as he reads it anywhere — on his computer too — and Android here keeps no
 * archive of removed notifications (2026-11-08: Shurouq's reply, read before
 * the watch on her began, left nothing to find). A look is one short adb read
 * and runs only while someone is watched; looking twice as often halves the
 * time a read mail can slip by.
 */
const everyMs = (): number => {
    const n = Number(process.env.JOE_MAIL_WATCH_EVERY_MS);
    return Number.isFinite(n) && n >= 5_000 ? n : 30_000;
};

export type NoticeReader = () => Promise<{ ok: true; dumps: Array<{ serial: string; text: string }> } | { ok: false; code: string; error: string }>;
export type OwnerTeller = (reply: MailReply, text: string) => Promise<void>;
/** The phone was lost while someone is watched, or came back: say so to each owner, in his latest watched chat. */
export type PhoneTeller = (state: 'lost' | 'back', watches: MailWatch[]) => Promise<void>;

const PHONE_WORDS = {
    ar: {
        lost: '📵 لا أرى هاتفك الآن (انفصل الكابل، أو انطفأ «تصحيح الأخطاء»)، فلا أستطيع مراقبة ردود الإيميل حتى يعود. صِله من جديد، أو اربطه بتطبيق جو فلا ينقطع، وأكمل المراقبة وحدي.',
        back: '📱 عاد هاتفك متصلًا، وعدت أراقب ردود الإيميل.',
    },
    en: {
        lost: '📵 I cannot see your phone now (the cable came out, or debugging is off), so I cannot watch for email replies until it is back. Connect it again, or link it with the Joe app so it stays connected, and I go on watching by myself.',
        back: '📱 Your phone is connected again, and I am watching for email replies again.',
    },
};

/*
 * A WATCH THAT CANNOT SEE THE PHONE SAYS SO.
 *
 * The owner, 2026-11-08: the phone came off the computer while Joe was
 * watching for Shoroq's reply, and nothing told him — he would have waited
 * for a message that could not come. After a minute without the phone (two
 * looks), each owner with a watch is told once, in his latest watched chat
 * and in the header; and told again when it is back.
 */
async function sayPhoneStateInJoe(state: 'lost' | 'back', watches: MailWatch[]): Promise<void> {
    const latest = new Map<string, MailWatch>();
    for (const w of watches) {
        const key = w.userId || w.sessionId;
        const old = latest.get(key);
        if (!old || w.sentAt > old.sentAt) latest.set(key, w);
    }
    for (const w of latest.values()) {
        await postFromJoe(w.sessionId, w.userId || '', PHONE_WORDS[w.lang === 'en' ? 'en' : 'ar'][state], { kind: state === 'lost' ? 'phone_lost' : 'phone_back', chatId: w.sessionId });
    }
}

function defaultReader(): NoticeReader {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return () => require('../tools/definitions/EngineAndroidTool').phoneNotificationsNow();
}

/** A message from Joe in a chat (kept, live if open) and a notice to its owner wherever he is in Joe. */
async function postFromJoe(sessionId: string, userIdIn: string, text: string, notice: Record<string, unknown>): Promise<void> {
    let userId = userIdIn;
    if (!userId && sessionId) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            userId = String((await require('./session-identity').resolveAutonomousSessionIdentity(sessionId))?.userId || '');
        } catch { /* told in the chat only */ }
    }
    await executionFirewall.runAsSystem(async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ws = require('../../api/ws');
        if (sessionId && userId) ws.registerSessionOwner(sessionId, userId);
        if (sessionId) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { usesLocalChatStore, flushChatStores } = require('../../api/chat-store');
                if (usesLocalChatStore()) {
                    const store: any[] = (global as any).mockMessages || ((global as any).mockMessages = []);
                    store.push({ _id: `mw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId, role: 'assistant', content: text, createdAt: new Date() });
                    flushChatStores();
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const { Message } = require('../../shared/models/message');
                    await Message.create({ sessionId, role: 'assistant', content: text, createdAt: new Date() });
                }
            } catch (e: any) { console.warn('[MailWatch] the message could not be kept in the chat:', e?.message || e); }
            ws.broadcast({ type: 'text', sessionId, data: { text, sessionId } } as any);
        }
        if (userId) ws.broadcast({ type: 'joe_notice', id: `${String(notice.kind)}:${sessionId}:${Date.now()}`, userId, data: { ...notice, at: Date.now() } } as any);
    }, { userId, sessionId });
}

/** The message goes into the chat (kept, and live if open), a notice to the owner wherever he is, and the chat's device memory. */
async function tellOwnerInJoe(reply: MailReply, text: string): Promise<void> {
    const sessionId = reply.watch.sessionId;
    let userId = reply.watch.userId || '';
    if (!userId && sessionId) {
        //  A watch made before its owner was kept: the chat's own owner, from the store.
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const id = await require('./session-identity').resolveAutonomousSessionIdentity(sessionId);
            userId = String(id?.userId || '');
        } catch { /* told in the chat; the notice needs an owner and is skipped */ }
    }
    await executionFirewall.runAsSystem(async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ws = require('../../api/ws');
        if (sessionId && userId) ws.registerSessionOwner(sessionId, userId);
        if (sessionId) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { usesLocalChatStore, flushChatStores } = require('../../api/chat-store');
                if (usesLocalChatStore()) {
                    const store: any[] = (global as any).mockMessages || ((global as any).mockMessages = []);
                    store.push({ _id: `mw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId, role: 'assistant', content: text, createdAt: new Date() });
                    //  Written before the notice: the page reads the chat again when it arrives.
                    flushChatStores();
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const { Message } = require('../../shared/models/message');
                    await Message.create({ sessionId, role: 'assistant', content: text, createdAt: new Date() });
                }
            } catch (e: any) { console.warn('[MailWatch] the message could not be kept in the chat:', e?.message || e); }
        }
        if (sessionId) ws.broadcast({ type: 'text', sessionId, data: { text, sessionId } } as any);
        //  No session on it: it reaches the owner in whichever chat he has open, and him alone
        //  (ws.ts resolves «joe_notice» to its userId; the page shows it in the header: JoeNoticeBanner).
        if (userId) {
            ws.broadcast({
                type: 'joe_notice',
                id: `mail_reply:${reply.notice.pkg}:${reply.notice.key}:${reply.notice.at}`,
                userId,
                data: { kind: 'mail_reply', chatId: sessionId, who: reply.notice.title, address: reply.watch.to, subject: reply.notice.text, app: reply.notice.app, at: reply.notice.at || Date.now() },
            } as any);
        }
        if (sessionId) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const work = require('../../core/engine/device-work');
                work.noteOperateResult(sessionId, { target: 'phone', request: `(Joe, in the background) a reply from ${reply.watch.to} arrived`, summary: text, ok: true });
                work.setWorking(sessionId, { target: 'phone', at: Date.now(), request: `the reply from ${reply.watch.to} in ${reply.notice.app}` });
            } catch { /* the memory helps the next message; the owner is told either way */ }
        }
    }, { userId, sessionId });
}

export class MailWatchService {
    private timer: NodeJS.Timeout | null = null;
    private running: Promise<MailReply[]> | null = null;
    private lastProblem = '';

    /** Looks in a row that could not read the phone; whether the owners were told it is lost. */
    private misses = 0;
    /** Kept in the watch's store (mail-watch.ts): a Joe restarted while the phone is away does not say it again. */
    private get toldLost(): boolean { return phoneLostTold(); }
    private set toldLost(v: boolean) { notePhoneLost(v ? Date.now() : null); }

    constructor(
        private readonly read: NoticeReader = defaultReader(),
        private readonly tell: OwnerTeller = tellOwnerInJoe,
        private readonly sayPhone: PhoneTeller = sayPhoneStateInJoe,
    ) {}

    start(): void {
        if (this.timer || process.env.JOE_MAIL_WATCH === 'off') return;
        this.timer = setInterval(() => { void this.tick(); }, everyMs());
        this.timer.unref?.();
        //  What he asked in the chats of the last 14 days — before Joe could watch, or in a run that
        //  forgot the tool — becomes a watch first (tools/mail.ts backfillWatchesFromChats); then a
        //  reply that came while Joe was off, still in the phone's list, is looked for soon after.
        setTimeout(() => { void this.backfill().then(() => this.tick()); }, 20_000).unref?.();
        //  A phone with the Joe app says when its notifications change: Joe looks at once.
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('../../core/devices/phone-link').phoneLinks.on('notices', () => { void this.tick(); });
        } catch { /* no app phones on this Joe */ }
        console.log(`[MailWatch] started: ${activeWatches().length} person(s) watched, every ${Math.round(everyMs() / 1000)} s`);
    }

    /** Reads the chats once for watches he asked for and Joe does not hold yet. */
    async backfill(lines?: ChatLine[], now = Date.now()): Promise<number> {
        try {
            const made = backfillWatchesFromChats(lines || await chatLinesOfTwoWeeks(now), now);
            for (const m of made) console.log(`[MailWatch] from the chat ${m.sessionId} (${new Date(m.at).toISOString()}): watching ${m.to.join(', ')}`);
            return made.length;
        } catch (e: any) {
            console.warn('[MailWatch] the chats could not be read for watches:', e?.message || e);
            return 0;
        }
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** A watch was just made: look in a few seconds, and keep looking. */
    wake(): void {
        this.start();
        setTimeout(() => { void this.tick(); }, 5_000).unref?.();
    }

    /** One look at the phone; the replies told. Never two at once; nothing to do when nobody is watched. */
    tick(now = Date.now()): Promise<MailReply[]> {
        if (this.running) return this.running;
        if (!activeWatches(now).length) return Promise.resolve([]);
        this.running = (async () => {
            try {
                const r0 = await executionFirewall.runAsSystem(() => this.read());
                //  Phones linked through the Joe app push their notifications themselves (phone-link.ts):
                //  they are read beside the cable phone's, and keep the watch going without one.
                const fromApps = appMailNotices();
                const r: typeof r0 = !r0.ok && fromApps.length ? { ok: true, dumps: [] } : r0;
                if (!r.ok) {
                    if (r.code !== this.lastProblem) console.warn(`[MailWatch] cannot read the phone now (${r.code}): ${r.error}`);
                    this.lastProblem = r.code;
                    //  Two looks without the phone (a minute): the owners are told, once.
                    if (++this.misses >= 2 && !this.toldLost && (r.code === 'no_phone' || r.code === 'no_adb')) {
                        this.toldLost = true;
                        try { await this.sayPhone('lost', activeWatches(now)); } catch (e: any) { console.warn('[MailWatch] telling the phone is lost failed:', e?.message || e); }
                    }
                    return [];
                }
                this.lastProblem = '';
                this.misses = 0;
                if (this.toldLost) {
                    this.toldLost = false;
                    try { await this.sayPhone('back', activeWatches(now)); } catch (e: any) { console.warn('[MailWatch] telling the phone is back failed:', e?.message || e); }
                }
                const notices = [...r.dumps.flatMap(d => parseMailNotices(d.text)), ...fromApps];
                const replies = newReplies(notices, now);
                for (const reply of replies) {
                    const text = replyMessage(reply);
                    console.log(`[MailWatch] a reply from ${reply.watch.to} (${reply.why}) in ${reply.notice.app}: telling the owner in chat ${reply.watch.sessionId}`);
                    try { await this.tell(reply, text); } catch (e: any) { console.warn('[MailWatch] telling the owner failed:', e?.message || e); }
                }
                return replies;
            } catch (e: any) {
                console.warn('[MailWatch] look failed:', e?.message || e);
                return [];
            } finally {
                this.running = null;
            }
        })();
        return this.running;
    }
}

export const mailWatchService = new MailWatchService();
