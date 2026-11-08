/**
 * JOE'S WATCH ON THE REPLIES TO HIS EMAILS, IN THE BACKGROUND, ON HIS OWN.
 *
 * The owner, 2026-11-08: «I want Joe to follow, in the background and
 * automatically, whether a reply arrives from the people he emailed, and tell
 * me» — «not you watching: Joe himself».
 *
 * Started with Joe (api/index.ts). While someone is watched (core/devices/
 * mail-watch.ts: every person Joe emailed, for 14 days), it reads the phone's
 * notifications once a minute (EngineAndroidTool.phoneNotificationsNow:
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
import { activeWatches, newReplies, parseMailNotices, replyMessage, type MailReply } from '../../core/devices/mail-watch';

const everyMs = (): number => {
    const n = Number(process.env.JOE_MAIL_WATCH_EVERY_MS);
    return Number.isFinite(n) && n >= 5_000 ? n : 60_000;
};

export type NoticeReader = () => Promise<{ ok: true; dumps: Array<{ serial: string; text: string }> } | { ok: false; code: string; error: string }>;
export type OwnerTeller = (reply: MailReply, text: string) => Promise<void>;

function defaultReader(): NoticeReader {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return () => require('../tools/definitions/EngineAndroidTool').phoneNotificationsNow();
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

    constructor(private readonly read: NoticeReader = defaultReader(), private readonly tell: OwnerTeller = tellOwnerInJoe) {}

    start(): void {
        if (this.timer || process.env.JOE_MAIL_WATCH === 'off') return;
        this.timer = setInterval(() => { void this.tick(); }, everyMs());
        this.timer.unref?.();
        //  A reply that came while Joe was off is still in the phone's list: look soon after the start.
        setTimeout(() => { void this.tick(); }, 20_000).unref?.();
        console.log(`[MailWatch] started: ${activeWatches().length} person(s) watched, every ${Math.round(everyMs() / 1000)} s`);
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
                const r = await executionFirewall.runAsSystem(() => this.read());
                if (!r.ok) {
                    if (r.code !== this.lastProblem) console.warn(`[MailWatch] cannot read the phone now (${r.code}): ${r.error}`);
                    this.lastProblem = r.code;
                    return [];
                }
                this.lastProblem = '';
                const notices = r.dumps.flatMap(d => parseMailNotices(d.text));
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
