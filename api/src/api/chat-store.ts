/**
 * CHAT DURABILITY — conversations survive the restart.
 *
 * In JSON/offline mode every session and message lived in
 * global.mockSessions / global.mockMessages — RAM only. The user updates
 * Joe with update-joe.ps1 constantly, and every update silently erased
 * every conversation, while the boot log promised «JSON Persistence mode
 * enabled: Data will be saved to api/data/db». This module makes that
 * promise true: the stores load from disk at boot and every mutation
 * schedules a debounced write. Best-effort throughout — a failed disk
 * write must never break a chat.
 */
import fs from 'fs';
import path from 'path';

/** Keep the store bounded — the newest N messages survive, forever-growing files do not. */
const MAX_PERSISTED_MESSAGES = 4000;
const DEBOUNCE_MS = 800;

function storeDir(): string {
    return String(process.env.JOE_CHAT_STORE_DIR || '').trim()
        || path.join(process.cwd(), 'data', 'db');
}
const sessionsFile = () => path.join(storeDir(), 'chat-sessions.json');
const messagesFile = () => path.join(storeDir(), 'chat-messages.json');

/**
 * Load persisted stores into the globals — only where the global is still
 * empty, so a live process never has its state clobbered.
 */
export function loadChatStores(): void {
    try {
        const g: any = global as any;
        if ((!g.mockSessions || g.mockSessions.length === 0) && fs.existsSync(sessionsFile())) {
            const v = JSON.parse(fs.readFileSync(sessionsFile(), 'utf-8'));
            if (Array.isArray(v)) g.mockSessions = v;
        }
        if ((!g.mockMessages || g.mockMessages.length === 0) && fs.existsSync(messagesFile())) {
            const v = JSON.parse(fs.readFileSync(messagesFile(), 'utf-8'));
            if (Array.isArray(v)) g.mockMessages = v.slice(-MAX_PERSISTED_MESSAGES);
        }
        const s = (g.mockSessions || []).length, m = (g.mockMessages || []).length;
        if (s || m) console.info(`[ChatStore] 💾 restored ${s} session(s) and ${m} message(s) from disk — conversations survive restarts.`);
    } catch (e: any) {
        console.warn(`[ChatStore] could not restore chat history (${String(e?.message || e).slice(0, 120)}) — starting fresh.`);
    }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced write of both stores. Call after ANY mutation. */
export function persistChatStores(): void {
    if (timer) return;
    timer = setTimeout(() => {
        timer = null;
        try {
            const g: any = global as any;
            fs.mkdirSync(storeDir(), { recursive: true });
            fs.writeFileSync(sessionsFile(), JSON.stringify(g.mockSessions || [], null, 0), 'utf-8');
            fs.writeFileSync(messagesFile(), JSON.stringify((g.mockMessages || []).slice(-MAX_PERSISTED_MESSAGES), null, 0), 'utf-8');
        } catch (e: any) {
            console.warn(`[ChatStore] persist failed (${String(e?.message || e).slice(0, 120)}) — chat continues in memory.`);
        }
    }, DEBOUNCE_MS);
    (timer as any).unref?.();
}

/** Test/shutdown hook: write NOW, no debounce. */
export function flushChatStores(): void {
    if (timer) { clearTimeout(timer); timer = null; }
    try {
        const g: any = global as any;
        fs.mkdirSync(storeDir(), { recursive: true });
        fs.writeFileSync(sessionsFile(), JSON.stringify(g.mockSessions || [], null, 0), 'utf-8');
        fs.writeFileSync(messagesFile(), JSON.stringify((g.mockMessages || []).slice(-MAX_PERSISTED_MESSAGES), null, 0), 'utf-8');
    } catch { /* best-effort */ }
}
