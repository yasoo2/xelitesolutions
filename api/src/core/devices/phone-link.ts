/**
 * THE PHONES ONLINE THROUGH THE JOE APP, AND HOW JOE ASKS THEM.
 *
 * Each linked phone (linked-phones.ts) holds one socket to Joe while its app
 * runs. Joe asks with a JSON line {t:'req', id, op, args}; the app answers
 * {t:'res', id, ok, data | error}. What the phone's apps post as notifications
 * the app pushes by itself ({t:'notif', …} and a full {t:'notifs', list} on
 * connect), so Joe's email-reply watch hears a reply the moment it arrives,
 * with no cable, no polling and no adb (MailWatchService).
 *
 * The operations are the ones the adb phone has (EngineAndroidTool): read,
 * look, tap, swipe, type, clear, key, open, uri, email, apps, panel, screen —
 * so every android_ tool works the same on a phone on the cable and on a
 * phone anywhere with the app.
 */
import { EventEmitter } from 'events';

export interface PhoneSocket {
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', fn: (data: unknown) => void): unknown;
    on(event: 'close', fn: () => void): unknown;
}

export interface AppNotice {
    pkg: string;
    key: string;
    title: string;
    text: string;
    bigText: string;
    subText: string;
    lines: string[];
    at: number;
}

interface OnlinePhone {
    id: string;
    ownerId: string;
    name: string;
    model: string;
    android: string;
    since: number;
    socket: PhoneSocket;
    waiting: Map<string, { resolve: (r: PhoneAnswer) => void; timer: ReturnType<typeof setTimeout> }>;
    /** The notifications on the phone now, by key (the app sends the whole list on connect, then each change). */
    notices: Map<string, AppNotice>;
}

export interface PhoneAnswer { ok: boolean; data?: any; error?: string }

const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);

function notice(raw: any): AppNotice | null {
    if (!raw || typeof raw !== 'object') return null;
    const n: AppNotice = {
        pkg: str(raw.pkg, 200), key: str(raw.key, 300), title: str(raw.title, 300), text: str(raw.text, 1000),
        bigText: str(raw.bigText, 4000), subText: str(raw.subText, 300),
        lines: Array.isArray(raw.lines) ? raw.lines.slice(0, 20).map((l: unknown) => str(l, 500)) : [],
        at: Number(raw.at) || Date.now(),
    };
    return n.pkg && n.key ? n : null;
}

export class PhoneLinks extends EventEmitter {
    private online = new Map<string, OnlinePhone>();
    private seq = 0;

    /** A linked phone called in with its key: it is online until its socket closes. */
    attach(socket: PhoneSocket, kept: { id: string; ownerId: string; name: string }, hello: { model?: unknown; android?: unknown } = {}, now = Date.now()): OnlinePhone {
        const old = this.online.get(kept.id);
        if (old) { try { old.socket.close(4409, 'replaced by a newer connection'); } catch { /* gone */ } this.drop(old, 'replaced'); }
        const p: OnlinePhone = {
            id: kept.id, ownerId: kept.ownerId, name: kept.name, model: str(hello.model, 80), android: str(hello.android, 20),
            since: now, socket, waiting: new Map(), notices: new Map(),
        };
        this.online.set(p.id, p);
        socket.on('message', data => this.heard(p, data));
        socket.on('close', () => { if (this.online.get(p.id) === p) this.drop(p, 'closed'); });
        this.emit('online', p.id);
        return p;
    }

    private drop(p: OnlinePhone, why: string): void {
        if (this.online.get(p.id) === p) this.online.delete(p.id);
        for (const [, w] of p.waiting) { clearTimeout(w.timer); w.resolve({ ok: false, error: `the phone «${p.name}» went offline (${why})` }); }
        p.waiting.clear();
        this.emit('offline', p.id);
    }

    private heard(p: OnlinePhone, data: unknown): void {
        let m: any;
        try { m = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data)); } catch { return; }
        if (!m || typeof m !== 'object') return;
        if (m.t === 'res' && typeof m.id === 'string') {
            const w = p.waiting.get(m.id);
            if (!w) return;
            p.waiting.delete(m.id);
            clearTimeout(w.timer);
            w.resolve(m.ok === true ? { ok: true, data: m.data } : { ok: false, error: str(m.error || 'the phone refused', 500) });
            return;
        }
        if (m.t === 'notifs' && Array.isArray(m.list)) {
            p.notices.clear();
            for (const raw of m.list.slice(0, 200)) { const n = notice(raw); if (n) p.notices.set(n.key, n); }
            this.emit('notices', p.id);
            return;
        }
        if (m.t === 'notif') {
            const n = notice(m);
            if (!n) return;
            if (m.removed === true) p.notices.delete(n.key); else p.notices.set(n.key, n);
            this.emit('notices', p.id);
        }
    }

    /** Asks the phone to do one operation; answers within the timeout or says why not. */
    ask(id: string, op: string, args: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<PhoneAnswer> {
        const p = this.online.get(id);
        if (!p) return Promise.resolve({ ok: false, error: 'this phone is not online now: its Joe app is closed, or it has no internet' });
        const reqId = `r${++this.seq}`;
        return new Promise<PhoneAnswer>(resolve => {
            const timer = setTimeout(() => { p.waiting.delete(reqId); resolve({ ok: false, error: `the phone did not answer «${op}» in ${Math.round(timeoutMs / 1000)} s` }); }, timeoutMs);
            p.waiting.set(reqId, { resolve, timer });
            try { p.socket.send(JSON.stringify({ t: 'req', id: reqId, op, args })); } catch (e: any) {
                clearTimeout(timer); p.waiting.delete(reqId); resolve({ ok: false, error: `could not reach the phone: ${e?.message || e}` });
            }
        });
    }

    /** The owner's phones online now. */
    list(ownerId?: string): Array<{ id: string; name: string; model: string; android: string; since: number; ownerId: string }> {
        return [...this.online.values()].filter(p => !ownerId || p.ownerId === ownerId)
            .map(p => ({ id: p.id, name: p.name, model: p.model, android: p.android, since: p.since, ownerId: p.ownerId }));
    }

    isOnline(id: string): boolean { return this.online.has(id); }

    /** Every online phone's notifications now (for the email-reply watch). */
    notices(): Array<{ phoneId: string; ownerId: string; notice: AppNotice }> {
        return [...this.online.values()].flatMap(p => [...p.notices.values()].map(n => ({ phoneId: p.id, ownerId: p.ownerId, notice: n })));
    }

    /** The owner forgot this phone: tell its app to unlink itself, then close. */
    forget(id: string): void {
        const p = this.online.get(id);
        if (!p) return;
        try { p.socket.send(JSON.stringify({ t: 'forget' })); } catch { /* gone */ }
        setTimeout(() => { try { p.socket.close(4404, 'not linked to Joe any more'); } catch { /* gone */ } }, 300);
    }
}

export const phoneLinks = new PhoneLinks();
