/**
 * JOE WATCHES FOR THE REPLIES TO THE EMAILS HE SENT, AND TELLS THE OWNER.
 *
 * The owner, 2026-11-08: «I want Joe to follow, in the background and on his
 * own, whether a reply arrives from the people he emailed, and tell me» —
 * and then: «not you watching: Joe himself».
 *
 * Joe sends the owner's email from the owner's phone (Outlook, Gmail). The
 * phone already knows when mail arrives: its mail app posts a notification
 * with the sender, the subject and the first lines. Joe reads those
 * notifications through adb («dumpsys notification --noredact»): nothing on
 * the phone's screen moves, no app is opened, no model is paid.
 *
 * What is kept (data/mail-watch.json, small):
 *  - one WATCH per person Joe emailed: the address, the name the owner used,
 *    the subject, the chat it came from, from when and until when (14 days);
 *  - the notices already told, so a notice is told once.
 *
 * A notice answers a watch when it came from the mail app after the email
 * was sent, and its sender or text names that person: the address itself,
 * a part of the address («shoroq.suwan» → «Shoroq Suwan»), the name the
 * owner used, or the subject of Joe's email (a reply keeps it: «RE: …»).
 *
 * Nothing here runs a command: the background service (mail-watch-service.ts)
 * reads the phone and calls this file. Kept to fs and path, so the chat's
 * answerer can read the watch list on every question.
 */
import fs from 'fs';
import path from 'path';

export interface MailNotice {
    pkg: string;
    app: string;
    key: string;
    title: string;
    text: string;
    bigText: string;
    subText: string;
    lines: string[];
    at: number;
}

export interface MailWatch {
    id: string;
    sessionId: string;
    /** The owner of that chat: Joe tells him, and only him. */
    userId?: string;
    to: string;
    name?: string;
    subject?: string;
    lang: 'ar' | 'en';
    sentAt: number;
    until: number;
}

export interface MailReply { watch: MailWatch; notice: MailNotice; why: 'address' | 'sender' | 'name' | 'subject' }

/** Mail apps on Android, by package. */
export const MAIL_APPS: Record<string, string> = {
    'com.microsoft.office.outlook': 'Outlook',
    'com.google.android.gm': 'Gmail',
    'com.google.android.gm.lite': 'Gmail Go',
    'com.samsung.android.email.provider': 'Samsung Email',
    'com.android.email': 'Email',
    'com.yahoo.mobile.client.android.mail': 'Yahoo Mail',
    'ch.protonmail.android': 'Proton Mail',
    'me.proton.android.mail': 'Proton Mail',
    'com.readdle.spark': 'Spark',
    'com.easilydo.mail': 'Edison Mail',
    'com.fsck.k9': 'K-9 Mail',
    'com.huawei.email': 'Huawei Email',
};

const WATCH_DAYS = (): number => {
    const n = Number(process.env.JOE_MAIL_WATCH_DAYS);
    return Number.isFinite(n) && n > 0 ? n : 14;
};
const SEEN_MS = 30 * 24 * 60 * 60_000;

// ── Reading the phone's notifications ────────────────────────────────────

const DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
const asciiDigits = (s: string): string => s.replace(/[٠-٩۰-۹]/gu, d => DIGITS[d] || d);

/** One extras entry starts «android.title=String (»; arrays print «CharSequence[] (2)» then «[0] …» lines. */
const ENTRY = /^\s*([A-Za-z][\w.]*)=([\w.$\[\]]+)(?: \((.*))?$/u;
const ITEM = /^\s*\[(\d+)\] ?(.*)$/u;
const LOOSE = /^\s*[A-Za-z][\w.]*=/u;

function parseExtras(lines: string[]): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {};
    let key = '';
    let type = '';
    let buf: string[] = [];
    let open = false;
    const close = () => {
        if (!key) return;
        if (type.endsWith('[]')) { if (!Array.isArray(out[key])) out[key] = []; }
        else {
            let v = buf.join('\n');
            if (v.endsWith(')')) v = v.slice(0, -1);
            out[key] = v;
        }
        key = ''; type = ''; buf = []; open = false;
    };
    for (const line of lines) {
        const item = key && type.endsWith('[]') ? ITEM.exec(line) : null;
        if (item) { (out[key] as string[]).push(item[2]); continue; }
        // A new entry starts when the line looks like «name=…» and the value before it is closed.
        if (LOOSE.test(line) && (!open || buf.join('\n').endsWith(')'))) {
            close();
            const m = ENTRY.exec(line);
            if (!m) continue; // an entry this file does not read: «android.largeIcon=Icon(typ=BITMAP …)»
            key = m[1]; type = m[2];
            if (type.endsWith('[]')) { out[key] = []; continue; }
            buf = [m[3] ?? ''];
            open = m[3] !== undefined;
            continue;
        }
        if (open) buf.push(line);
    }
    close();
    return out;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The notices of the mail apps in «dumpsys notification --noredact».
 * Others (WhatsApp, the system…) are skipped here, never stored.
 */
export function parseMailNotices(dump: string, apps: Record<string, string> = MAIL_APPS): MailNotice[] {
    const out: MailNotice[] = [];
    const blocks = String(dump || '').split(/^\s*NotificationRecord\(/mu).slice(1);
    for (const raw of blocks) {
        // The last record runs into the next sections. A mail's lines are printed raw, at column 0,
        // so the record is cut at those sections by name, never at the first unindented line.
        const tail = raw.search(/^(?: {2}m(?:UseAttentionLight|HasLight|Archive|NotificationPulseEnabled|SoundNotificationKey)=| {2}Snoozed notifications:| {2}Ranking Config:|PackagePreferences:)/mu);
        const block = tail < 0 ? raw : raw.slice(0, tail);
        const pkg = /pkg=(\S+)/u.exec(block)?.[1] || '';
        if (!apps[pkg]) continue;
        const lines = block.split(/\r?\n/u);
        const key = /^\s+key=(\S+)/mu.exec(block)?.[1] || /key=(\S+?):/u.exec(block)?.[1] || '';
        const times = ['mCreationTimeMs', 'mUpdateTimeMs', 'mRankingTimeMs']
            .map(n => Number(asciiDigits(new RegExp(`${n}=([0-9٠-٩]+)`, 'u').exec(block)?.[1] || '')))
            .filter(n => Number.isFinite(n) && n > 0);
        const at = times.length ? Math.max(...times) : 0;
        // The first extras block is the notification's own (publicNotification may have another).
        const start = lines.findIndex(l => /^\s*extras=\{\s*$/u.test(l));
        if (start < 0) continue;
        const indent = (lines[start].match(/^\s*/u) || [''])[0].length;
        let end = start + 1;
        while (end < lines.length && !(new RegExp(`^\\s{${indent}}\\}\\s*$`, 'u').test(lines[end]))) end++;
        const extras = parseExtras(lines.slice(start + 1, end));
        const notice: MailNotice = {
            pkg,
            app: apps[pkg],
            key,
            title: str(extras['android.title']) || str(extras['android.title.big']) || str(extras['android.conversationTitle']),
            text: str(extras['android.text']),
            bigText: str(extras['android.bigText']),
            subText: str(extras['android.subText']) || str(extras['android.summaryText']),
            lines: Array.isArray(extras['android.textLines']) ? (extras['android.textLines'] as string[]) : [],
            at,
        };
        if (!notice.title && !notice.text && !notice.lines.length) continue;
        out.push(notice);
    }
    return out;
}

// ── Matching a notice to a person Joe emailed ────────────────────────────

/** Lower case, no accents, no Arabic marks or letter variants, no direction marks. */
export function normalizeForMatch(s: string): string {
    return String(s || '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/gu, '')
        .replace(/[​-‏‪-‮⁦-⁩؜﻿]/gu, '')
        .replace(/[ً-ٰٟـ]/gu, '')
        .replace(/[أإآٱ]/gu, 'ا')
        .replace(/ة/gu, 'ه')
        .replace(/ى/gu, 'ي')
        .toLowerCase()
        .replace(/\s+/gu, ' ')
        .trim();
}

/** Parts of an address that name a person: «shoroq.suwan@gmail.com» → shoroq, suwan. */
const GENERIC = new Set(['info', 'mail', 'email', 'admin', 'support', 'contact', 'sales', 'office', 'team', 'hello', 'service', 'services', 'noreply', 'reply', 'help', 'jobs', 'account', 'accounts', 'billing', 'news', 'newsletter', 'notifications', 'notification', 'hr', 'the', 'and', 'mr', 'mrs', 'dr']);
export function addressParts(address: string): string[] {
    const local = String(address || '').toLowerCase().split('@')[0] || '';
    return [...new Set(local.split(/[^a-z؀-ۿ]+/u).filter(t => t.length >= 3 && !GENERIC.has(t)))];
}

function nameParts(name?: string): string[] {
    return [...new Set(normalizeForMatch(name || '').split(/[^\p{L}]+/u).filter(t => t.length >= 3 && !GENERIC.has(t)))];
}

/** A word inside a text, whole: «ali» is in «Ali Saleh», not in «Natalie». */
function hasWord(text: string, word: string): boolean {
    if (!word) return false;
    const esc = word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'u').test(text);
}

const REPLY_PREFIX = /^\s*((re|aw|sv|rv|antw|r|ref|رد|ر)\s*[:：]\s*)+/iu;
const bareSubject = (s: string): string => normalizeForMatch(s).replace(REPLY_PREFIX, '').trim();

/** The best watch this notice answers, or null. */
export function matchReply(notice: MailNotice, watches: MailWatch[], now = Date.now()): MailReply | null {
    const sender = normalizeForMatch(notice.title);
    const lines = notice.lines.map(normalizeForMatch);
    const body = normalizeForMatch([notice.title, notice.text, notice.bigText, ...notice.lines].join(' \n '));
    const subjects = [notice.text, notice.bigText.split('\n')[0], ...notice.lines].map(bareSubject).filter(Boolean);
    let best: MailReply | null = null;
    const rank = { address: 4, sender: 3, name: 2, subject: 1 } as const;
    for (const w of watches) {
        if (now > w.until) continue;
        // Only mail that came after Joe's email (a minute's grace for the phone's clock).
        if (notice.at && notice.at < w.sentAt - 60_000) continue;
        let why: MailReply['why'] | null = null;
        const address = w.to.toLowerCase();
        if (address && body.includes(address)) why = 'address';
        else {
            const parts = addressParts(address);
            const inSender = (t: string) => hasWord(sender, t) || lines.some(l => hasWord(l, t));
            if (parts.length && parts.some(inSender)) why = 'sender';
            else if (nameParts(w.name).some(inSender)) why = 'name';
            else if (w.subject) {
                const want = bareSubject(w.subject);
                if (want.length >= 4 && subjects.some(s => s === want || s.startsWith(want) || (want.length >= 8 && s.includes(want)))) why = 'subject';
            }
        }
        if (why && (!best || rank[why] > rank[best.why])) best = { watch: w, notice, why };
    }
    return best;
}

// ── The watch list, kept on disk ─────────────────────────────────────────

/**
 * own: the owner's own mail accounts, read off the notices («subText»: the
 * account the mail came to). A run's summary may name his own address
 * («sent from younis@…»); watching it would match every mail he gets.
 */
interface Store { watches: MailWatch[]; seen: Record<string, number>; own: string[] }
let store: Store | null = null;

function storeFile(): string | null {
    if (process.env.JOE_MAIL_WATCH_FILE) return process.env.JOE_MAIL_WATCH_FILE;
    if (process.env.JEST_WORKER_ID) return null;
    return path.join(process.cwd(), 'data', 'mail-watch.json');
}

function load(): Store {
    if (store) return store;
    store = { watches: [], seen: {}, own: [] };
    const f = storeFile();
    if (f) {
        try {
            const j = JSON.parse(fs.readFileSync(f, 'utf8'));
            store = {
                watches: Array.isArray(j?.watches) ? j.watches.filter((w: MailWatch) => w && typeof w.to === 'string') : [],
                seen: j && typeof j.seen === 'object' && j.seen ? j.seen : {},
                own: Array.isArray(j?.own) ? j.own.filter((a: unknown) => typeof a === 'string').slice(0, 20) : [],
            };
        } catch { /* no file yet, or unreadable: start empty */ }
    }
    return store;
}

function save(now = Date.now()): void {
    const s = load();
    s.watches = s.watches.filter(w => now <= w.until);
    for (const [k, at] of Object.entries(s.seen)) if (now - at > SEEN_MS) delete s.seen[k];
    const f = storeFile();
    if (!f) return;
    try {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const tmp = `${f}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(s));
        fs.renameSync(tmp, f);
    } catch { /* the watch helps; it never stops a run */ }
}

export function reloadMailWatch(): void { store = null; }

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu;
export const emailAddresses = (text: string): string[] => [...new Set((String(text || '').match(EMAIL) || []).map(a => a.replace(/[.'-]+$/u, '').toLowerCase()))];

const ARABIC = /[؀-ۿ]/u;

/** Joe emailed these people from this chat: watch for their replies (a new email to the same person renews it). */
export function watchReplies(sessionId: unknown, w: { to: string[]; name?: string; subject?: string; request?: string; lang?: 'ar' | 'en'; userId?: string }, now = Date.now()): MailWatch[] {
    const id = String(sessionId || '');
    const s = load();
    const lang: 'ar' | 'en' = w.lang || (ARABIC.test(`${w.request || ''} ${w.name || ''}`) ? 'ar' : 'en');
    const own = new Set(s.own);
    const added: MailWatch[] = [];
    for (const raw of w.to) {
        const to = String(raw || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(to) || own.has(to)) continue;
        const old = s.watches.find(x => x.to === to);
        const next: MailWatch = {
            id: old?.id || `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            sessionId: id || old?.sessionId || '',
            ...((w.userId || old?.userId) ? { userId: String(w.userId || old?.userId) } : {}),
            to,
            name: (w.name || old?.name || '').slice(0, 80) || undefined,
            subject: (w.subject || old?.subject || '').slice(0, 200) || undefined,
            lang,
            sentAt: now,
            until: now + WATCH_DAYS() * 24 * 60 * 60_000,
        };
        s.watches = s.watches.filter(x => x.to !== to).concat(next);
        added.push(next);
    }
    if (added.length) save(now);
    return added;
}

/** Stop watching these addresses (or every one from this chat when none is named). */
export function stopWatching(sessionId: unknown, to: string[] = [], now = Date.now()): number {
    const s = load();
    const id = String(sessionId || '');
    const want = new Set(to.map(a => String(a).trim().toLowerCase()));
    const before = s.watches.length;
    s.watches = s.watches.filter(w => (want.size ? !want.has(w.to) : w.sessionId !== id));
    if (s.watches.length !== before) save(now);
    return before - s.watches.length;
}

export function activeWatches(now = Date.now()): MailWatch[] {
    return load().watches.filter(w => now <= w.until);
}

const noticeId = (n: MailNotice): string => `${n.pkg}|${n.key}|${normalizeForMatch(n.title)}|${normalizeForMatch(n.text).slice(0, 120)}`;

/**
 * The replies among these notices that were not told yet; each is marked
 * told. A notice that answers no watch is not marked, so a watch made a
 * moment later can still take it if it came after Joe's email.
 */
export function newReplies(notices: MailNotice[], now = Date.now()): MailReply[] {
    const s = load();
    // The accounts the mail comes TO are the owner's own: never a person to watch.
    const before = s.own.length;
    for (const n of notices) for (const a of emailAddresses(n.subText)) if (!s.own.includes(a)) s.own = [...s.own, a].slice(-20);
    const own = new Set(s.own);
    if (s.own.length !== before) { s.watches = s.watches.filter(w => !own.has(w.to)); save(now); }
    const watches = activeWatches(now);
    if (!watches.length) return [];
    const out: MailReply[] = [];
    for (const n of notices) {
        const id = noticeId(n);
        if (s.seen[id]) continue;
        const r = matchReply(n, watches, now);
        if (!r) continue;
        s.seen[id] = now;
        out.push(r);
    }
    if (out.length) save(now);
    return out;
}

// ── The words Joe tells the owner ────────────────────────────────────────

const clip = (s: string, n: number): string => {
    const t = String(s || '').replace(/[‎‏‪-‮⁦-⁩]/gu, '').replace(/\s+/gu, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function replyMessage(r: MailReply): string {
    const { watch: w, notice: n } = r;
    const who = clip(n.title, 80) || w.name || w.to;
    const subject = clip(n.text || n.lines[0] || '', 160);
    const firstLine = (n.bigText.split('\n')[0] || '').trim();
    let preview = n.bigText ? n.bigText.slice(n.bigText.startsWith(firstLine) && firstLine === n.text.trim() ? firstLine.length : 0) : '';
    preview = clip(preview, 400);
    if (w.lang === 'ar') {
        return [
            `📩 وصل إيميل من **${who}**${w.name && !normalizeForMatch(who).includes(normalizeForMatch(w.name)) ? ` (${w.name})` : ''} — ممن راسلتهم${w.subject ? ` عن «${clip(w.subject, 120)}»` : ''}.`,
            subject ? `العنوان: ${subject}` : '',
            preview ? `بدايته: ${preview}` : '',
            `وصل إلى ${n.app} على هاتفك. إن أردت قل «اقرأ الرد» وأقرؤه لك كاملًا، أو «رد عليه» وأكتب الرد.`,
        ].filter(Boolean).join('\n');
    }
    return [
        `📩 An email arrived from **${who}**${w.name && !normalizeForMatch(who).includes(normalizeForMatch(w.name)) ? ` (${w.name})` : ''}, someone I emailed${w.subject ? ` about «${clip(w.subject, 120)}»` : ''}.`,
        subject ? `Subject: ${subject}` : '',
        preview ? `It begins: ${preview}` : '',
        `It is in ${n.app} on your phone. Say «read the reply» and I will read it in full, or «reply to it» and I will write the answer.`,
    ].filter(Boolean).join('\n');
}

/** For the chat's answerer and the operate run: whom Joe is watching. */
export function mailWatchFacts(now = Date.now()): string {
    const list = activeWatches(now);
    if (!list.length) return '';
    const lines = list.slice(-10).map(w => {
        const days = Math.max(0, Math.round((w.until - now) / (24 * 60 * 60_000)));
        return `- ${w.to}${w.name ? ` (${w.name})` : ''}${w.subject ? `, about «${w.subject}»` : ''}: watching for ${days} more day(s)`;
    });
    return `\n\nJOE IS WATCHING THE OWNER'S PHONE MAIL, IN THE BACKGROUND, FOR REPLIES FROM (facts; he is told in the chat the moment one arrives):\n${lines.join('\n')}`;
}
