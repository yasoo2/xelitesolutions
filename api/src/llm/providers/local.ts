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

        const client = new OpenAI({
            apiKey: this.apiKey(),
            baseURL,
        });

        const completion = await client.chat.completions.create({
            model: model || this.model(),
            messages: messages.map(m => ({ role: m.role, content: m.content })) as any,
        }, { timeout: 20000 });

        return completion.choices[0]?.message?.content || '';
    }
}
