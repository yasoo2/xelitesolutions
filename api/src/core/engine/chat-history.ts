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
 * The turns as the run reads them, newest last, each cut short. The message
 * being answered now (the last owner turn, when it is the request) is left out.
 */
export function chatTurnsText(turns: ChatTurn[], request = '', maxEach = 500): string {
    const list = [...turns];
    const last = list[list.length - 1];
    if (last && last.role === 'user' && last.content.trim() === String(request || '').trim()) list.pop();
    if (!list.length) return '';
    const lines = list.map(t => {
        const text = t.content.replace(/\s+/gu, ' ').trim();
        return `${t.role === 'user' ? 'Owner' : 'Joe'}: ${text.length > maxEach ? `${text.slice(0, maxEach)}…` : text}`;
    });
    return `THE CHAT SO FAR (oldest first; the request above is the owner's newest message, and it may answer Joe's last question):\n${lines.join('\n')}`;
}
