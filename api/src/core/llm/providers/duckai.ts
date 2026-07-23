/**
 * DuckDuckGo AI Provider (KEYLESS) - free anonymous chat gateway (duckduckgo.com/duckchat).
 * Offers strong models (GPT-4o-mini, Llama 3.3 70B, Mixtral, o3-mini) with NO API key.
 * Best-effort: if the anonymous handshake is unavailable (some networks/data-centres
 * block it) it throws and the router simply falls back to another free provider.
 *
 * Overrides: DUCKAI_MODEL, DUCKAI_DISABLE=1
 */

const DUCKAI_STATUS = 'https://duckduckgo.com/duckchat/v1/status';
const DUCKAI_CHAT = 'https://duckduckgo.com/duckchat/v1/chat';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Keyless chat models exposed by the gateway (strongest first).
const DUCKAI_MODELS = [
    'gpt-4o-mini',
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'claude-3-haiku-20240307',
];

export class DuckAIProvider {
    private vqd: string | null = null;
    private vqdAt = 0;
    private cooldownUntil = 0; // set on 429 (rate limit)

    isAvailable(): boolean {
        if (String(process.env.DUCKAI_DISABLE || '').trim() === '1') return false;
        if (Date.now() < this.cooldownUntil) return false;
        return true;
    }

    /** Fetch (and cache) the anonymous x-vqd-4 token required to chat. */
    private async getVqd(force = false): Promise<string> {
        const now = Date.now();
        if (!force && this.vqd && (now - this.vqdAt) < 120000) return this.vqd;
        const res = await fetch(DUCKAI_STATUS, {
            headers: { 'x-vqd-accept': '1', 'User-Agent': UA, 'Accept': 'text/event-stream', 'Cache-Control': 'no-store' },
        } as any);
        if (!res.ok) throw new Error(`DuckAI status ${res.status}`);
        const vqd = res.headers.get('x-vqd-4') || res.headers.get('x-vqd-hash-1');
        if (!vqd) throw new Error('DuckAI: no vqd token (anonymous handshake unavailable)');
        this.vqd = vqd;
        this.vqdAt = now;
        return vqd;
    }

    /**
     * Flatten messages to DuckAI's shape: it only accepts user/assistant roles,
     * so we fold any system prompt into the first user turn.
     */
    private buildMessages(messages: any[]): Array<{ role: string; content: string }> {
        const out: Array<{ role: string; content: string }> = [];
        let systemPreamble = '';
        for (const m of messages) {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            if (m.role === 'system') { systemPreamble += (systemPreamble ? '\n\n' : '') + content; continue; }
            out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content });
        }
        if (systemPreamble) {
            const firstUser = out.find(x => x.role === 'user');
            if (firstUser) firstUser.content = `${systemPreamble}\n\n${firstUser.content}`;
            else out.unshift({ role: 'user', content: systemPreamble });
        }
        if (out.length === 0) out.push({ role: 'user', content: ' ' });
        return out;
    }

    private async chatOnce(model: string, messages: any[]): Promise<string> {
        const vqd = await this.getVqd();
        const res = await fetch(DUCKAI_CHAT, {
            method: 'POST',
            headers: {
                'x-vqd-4': vqd,
                'Content-Type': 'application/json',
                'User-Agent': UA,
                'Accept': 'text/event-stream',
                'Origin': 'https://duckduckgo.com',
                'Referer': 'https://duckduckgo.com/',
            },
            body: JSON.stringify({ model, messages: this.buildMessages(messages) }),
        } as any);

        // Refresh the token for the next call if the gateway rotated it.
        const nextVqd = res.headers.get('x-vqd-4');
        if (nextVqd) { this.vqd = nextVqd; this.vqdAt = Date.now(); }

        if (res.status === 429) {
            this.cooldownUntil = Date.now() + 60000;
            throw new Error('DuckAI 429 rate limited');
        }
        if (res.status === 401 || res.status === 403) {
            // Token likely stale — drop it so the next attempt re-handshakes.
            this.vqd = null;
            throw new Error(`DuckAI ${res.status}`);
        }
        if (!res.ok) throw new Error(`DuckAI chat ${res.status}`);

        const raw = await res.text();
        let answer = '';
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                const obj = JSON.parse(payload);
                if (typeof obj.message === 'string') answer += obj.message;
            } catch { /* skip malformed SSE chunk */ }
        }
        return answer.trim();
    }

    async chatComplete(messages: any[], model?: string, _tools?: any[]): Promise<string> {
        // DuckAI has no function-calling; tools are ignored (used as a text fallback).
        const forced = (model && DUCKAI_MODELS.includes(model)) ? model : (process.env.DUCKAI_MODEL || '').trim();
        const candidates = forced ? [forced, ...DUCKAI_MODELS.filter(m => m !== forced)] : [...DUCKAI_MODELS];
        let lastErr: any = null;
        for (const m of candidates.slice(0, 3)) {
            try {
                const ans = await this.chatOnce(m, messages);
                if (ans && ans.length >= 2) return ans;
                lastErr = new Error('DuckAI empty response');
            } catch (e: any) {
                lastErr = e;
                if (String(e?.message || '').includes('429')) break; // cooling down
                // On auth/token errors, force a fresh handshake for the next model.
                if (/40[13]/.test(String(e?.message || ''))) { try { await this.getVqd(true); } catch { /* ignore */ } }
            }
        }
        throw new Error(`DuckAI keyless failed: ${lastErr?.message || 'unknown error'}`);
    }
}

export const duckAIProvider = new DuckAIProvider();
