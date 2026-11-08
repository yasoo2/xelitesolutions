/**
 * THE CHAT SO FAR, FOR A RUN THAT ACTS.
 *
 * The owner's chat with Joe, 2026-11-08, read back by the owner himself:
 * «افحص» after a question about the Wi-Fi was answered «check what?»; «send
 * Shoroq a new email» forgot the email Joe had sent her an hour before and
 * took another address; «اجل» after Joe's own question was answered «OK, I
 * will send it» by the chat's answerer, and nothing was sent. Every run began
 * with the request alone. Now a run that acts on a device is given the last
 * turns of its chat — what the owner said and what Joe answered — so «افحص»,
 * «ارسلها», «اجل» and «هذا shoroq…» are read as what they are in the chat.
 *
 * The turns come from the chat's own store (Mongo, or the local store in a
 * single-user install), read the way the session controller reads them.
 */

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/** The chat's last turns, oldest first; none when the store cannot say. */
export async function recentChatTurns(sessionId: unknown, limit = 12): Promise<ChatTurn[]> {
    const id = String(sessionId || '');
    if (!id) return [];
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { usesLocalChatStore } = require('../../api/chat-store');
        let rows: any[];
        if (usesLocalChatStore()) {
            rows = ((global as any).mockMessages || []).filter((m: any) => m && m.sessionId === id);
            rows = rows.slice(-limit);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { Message } = require('../../shared/models/message');
            rows = (await Message.find({ sessionId: id }).sort({ createdAt: -1 }).limit(limit).lean()).reverse();
        }
        return rows
            .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
            .map(m => ({ role: m.role, content: String(m.content) }));
    } catch {
        return [];
    }
}

/**
 * ONE TURN KEPT IN MONGO, WHERE THE CHAT IS READ ON A SERVER.
 *
 * Found on 2026-11-08: on a server with Mongo the run path kept the owner's
 * message only in the local store (routes/run.ts) and Joe's answer only there
 * too (AgentLoopService), so the Message collection — the one the web reads a
 * chat's history from (sessionController listSessionMessages) and the one
 * recentChatTurns reads above — never had either. The chat had no memory and
 * a reload showed an empty chat. The run path now writes each turn here in
 * Mongo mode, exactly once, beside the local-store write it already makes in
 * the other mode, so what the web shows and what a run reads are one record.
 * A failure is reported and never stops the run.
 */
export async function keepChatTurnInDatabase(turn: {
    sessionId: string; role: 'user' | 'assistant'; content: string; runId?: string; attachments?: Array<{ name?: string }>;
}): Promise<boolean> {
    const sessionId = String(turn?.sessionId || '').trim();
    const content = String(turn?.content ?? '');
    if (!sessionId || !content.trim()) return false;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Message } = require('../../shared/models/message');
        //  The model keeps a file's name (its schema has name and href); the chip shows the name.
        const files = (turn.attachments || []).map(a => ({ name: String(a?.name || '').slice(0, 240) })).filter(a => a.name);
        await Message.create({
            sessionId, role: turn.role, content, createdAt: new Date(),
            ...(turn.runId ? { runId: String(turn.runId) } : {}),
            ...(files.length ? { attachments: files } : {}),
        });
        return true;
    } catch (e: any) {
        console.warn('[ChatHistory] the turn could not be kept in the database:', String(e?.message || e).slice(0, 200));
        return false;
    }
}

/**
 * THE OWNER'S OWN WORDS IN A REQUEST.
 *
 * A message with a file is the message plus the file's block
 * (AgentLoopService: goal, then «[ATTACHED FILES — …]»), and a resumed run is
 * the earlier goal, not what he typed («كمل»). Found on 2026-11-08: the
 * 400-character limit on an answer to Joe's question was measured on the
 * message with its file, and the chat so far showed his message twice. What
 * he typed is the context's ownerText when the run carries it; otherwise the
 * request without the file block.
 */
const ATTACHED_BLOCK = '\n\n[ATTACHED FILES — ';

export function ownerWords(request: string, ownerText?: unknown): string {
    const own = typeof ownerText === 'string' ? ownerText.trim() : '';
    if (own) return own;
    const r = String(request || '');
    const cut = r.indexOf(ATTACHED_BLOCK);
    return (cut >= 0 ? r.slice(0, cut) : r).trim();
}

/**
 * THE WORDS JOE'S READERS CLASSIFY: HIS, NEVER A FILE'S.
 *
 * Found on 2026-11-08: «افحص» with a picture whose description said "turn off
 * the guest network" was read with that description — the Wi-Fi scan became
 * a toggle and the run started on device_computers. The device readers read
 * what the owner typed (ownerWords) when the request begins with it; a
 * resumed run («كمل») carries the earlier goal, not his «كمل», so it is read
 * on that goal, still without a file's block.
 */
export function requestWords(request: string, ownerText?: unknown): string {
    const r = String(request || '').trim();
    const own = ownerWords(r, ownerText);
    return own && r.startsWith(own) ? own : ownerWords(r);
}

/**
 * The turns as the run reads them, newest last, each cut short. The message
 * being answered now (the last owner turn, when it is the request) is left
 * out: the request equal to it, or the request that starts with it and goes
 * on with its file's block (2026-11-08: a message with a file was shown twice).
 */
export function chatTurnsText(turns: ChatTurn[], request = '', maxEach = 500): string {
    const list = [...turns];
    const last = list[list.length - 1];
    const req = String(request || '').trim();
    const said = last && last.role === 'user' ? last.content.trim() : '';
    if (said && (req === said || (req.startsWith(said) && /^\s/u.test(req.slice(said.length))))) list.pop();
    if (!list.length) return '';
    const lines = list.map(t => {
        const text = t.content.replace(/\s+/gu, ' ').trim();
        return `${t.role === 'user' ? 'Owner' : 'Joe'}: ${text.length > maxEach ? `${text.slice(0, maxEach)}…` : text}`;
    });
    return `THE CHAT SO FAR (oldest first; the request above is the owner's newest message, and it may answer Joe's last question):\n${lines.join('\n')}`;
}
