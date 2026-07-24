import OpenAI from 'openai';

export class LocalProvider {
    private baseUrl(): string | null {
        const raw = String(process.env.LOCAL_LLM_BASE_URL || '').trim();
        if (!raw) return null;
        const trimmed = raw.endsWith('/') ? raw.slice(0, -1) : raw;
        try {
            const u = new URL(trimmed);
            const pathname = String(u.pathname || '').trim();
            if (pathname === '' || pathname === '/') {
                u.pathname = '/v1';
                return u.toString().replace(/\/$/, '');
            }
        } catch {
            // Ignore invalid URLs and return raw string
        }
        return trimmed;
    }

    private model(): string {
        const m = String(process.env.LOCAL_LLM_MODEL || '').trim();
        return m || 'llama3.1';
    }

    private apiKey(): string {
        const k = String(process.env.LOCAL_LLM_API_KEY || '').trim();
        return k || 'dummy';
    }

    isConfigured(): boolean {
        return !!this.baseUrl();
    }

    async chatComplete(messages: any[], model?: string): Promise<string> {
        const baseURL = this.baseUrl();
        if (!baseURL) throw new Error('LOCAL_LLM_BASE_URL not configured');

        // Local CPU inference of a 7-8B model — especially the first (cold) request
        // that loads the model into RAM — easily exceeds 20s. Use a generous timeout
        // (override with LOCAL_LLM_TIMEOUT ms) and no retries so Joe waits for the
        // local brain instead of aborting and falling back to a weaker provider.
        const timeoutMs = (() => {
            const t = parseInt(String(process.env.LOCAL_LLM_TIMEOUT || '').trim(), 10);
            return Number.isFinite(t) && t > 0 ? t : 180000;
        })();

        const client = new OpenAI({
            apiKey: this.apiKey(),
            baseURL,
            timeout: timeoutMs,
            maxRetries: 0,
        });

        // keep_alive: -1 tells Ollama to keep the model resident in RAM instead of
        // unloading it after ~5 min idle — so the SECOND and later requests skip the
        // slow cold-load. Harmless on non-Ollama OpenAI servers (ignored).
        const completion = await client.chat.completions.create({
            model: model || this.model(),
            messages: messages.map(m => ({ role: m.role, content: m.content })) as any,
            keep_alive: -1,
        } as any, { timeout: timeoutMs });

        return completion.choices[0]?.message?.content || '';
    }
}
