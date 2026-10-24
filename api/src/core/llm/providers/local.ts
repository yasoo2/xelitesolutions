import OpenAI from 'openai';
import { isManagedOllamaEndpoint, managedOllamaChat } from './managed-ollama-chat';
import { requestResourceManager } from '../../resources/RequestResourceManager';

export function localReasoningOptions(model: string, baseUrl: string, effort?: 'none'): { reasoning_effort?: 'none' } {
    const noThinking = effort === 'none' || (effort === undefined && String(process.env.LOCAL_LLM_REASONING_EFFORT || '').trim() === 'none');
    if (!noThinking || !/^qwen3(?:\.5)?(?::[a-z0-9][a-z0-9._-]*)?$/i.test(model)) return {};
    const raw = String(baseUrl || '').trim();
    // Only the explicit canonical local Ollama endpoint supports this opt-in.
    if (!/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):11434(?:\/(?:v1\/?)?)?$/i.test(raw)) return {};
    try {
        const endpoint = new URL(raw);
        if (endpoint.protocol !== 'http:' || endpoint.port !== '11434'
            || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
            || !['/', '/v1', '/v1/'].includes(endpoint.pathname)) return {};
        return { reasoning_effort: 'none' };
    } catch { return {}; }
}

export class LocalProvider {
    private assertComplete(reason: unknown): void {
        if (reason === 'length') {
            throw Object.assign(new Error('local_completion_limit_exceeded'), { code: 'LOCAL_COMPLETION_LIMIT' });
        }
    }

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

    private reasoningOptions(model: string, effort?: 'none'): { reasoning_effort?: 'none' } {
        return localReasoningOptions(model, String(process.env.LOCAL_LLM_BASE_URL || '').trim(), effort);
    }

    isConfigured(): boolean {
        return !!this.baseUrl();
    }

    async chatComplete(
        messages: any[],
        model?: string,
        onDelta?: (delta: string) => void,
        signal?: AbortSignal,
        options?: { maxCompletionTokens?: number; reasoningEffort?: 'none'; onAdmitted?: () => void },
    ): Promise<string> {
        const baseURL = this.baseUrl();
        if (!baseURL) throw new Error('LOCAL_LLM_BASE_URL not configured');
        if (isManagedOllamaEndpoint(baseURL)) {
            const result = await managedOllamaChat({
                baseURL, model: model || this.model(), messages, onDelta, signal, onAdmitted: options?.onAdmitted,
                timeoutMs: this.timeoutMs(), maxCompletionTokens: options?.maxCompletionTokens,
                reasoningEffort: options?.reasoningEffort === 'none'
                    || (options?.reasoningEffort === undefined && String(process.env.LOCAL_LLM_REASONING_EFFORT || '').trim() === 'none') ? 'none' : undefined,
            });
            return result.content;
        }
        // Generic compatible servers have no portable context-size parameter.
        // Admission serializes their work without pretending to resize the model.
        return requestResourceManager.withHeavy(
            () => {
                try { options?.onAdmitted?.(); } catch { /* the caller's clock is its own concern */ }
                return this.chatCompleteCompatible(messages, model, onDelta, requestResourceManager.currentSignal() || signal, options);
            },
            { kind: 'compatible-local-inference', signal },
        );
    }

    /**
     * The transport's own backstop. The router arms the real, call-sized deadline
     * through the signal; this must never be SHORTER than it. Eval round 6,
     * 2026-10-23: a compact local plan armed for 30 min ended at exactly 300 s
     * (aborted: false) — LOCAL_LLM_TIMEOUT=1800000 was clamped to 300 000 here.
     * Now: the configured value up to 30 min (the managed transport's limit);
     * unset, at least the operator's local ceiling.
     */
    private timeoutMs(): number {
        const timeout = Number.parseInt(String(process.env.LOCAL_LLM_TIMEOUT || '').trim(), 10);
        if (Number.isFinite(timeout) && timeout > 0) return Math.min(timeout, require('../local-throughput').LOCAL_INFERENCE_HARD_MAX_MS);
        return Math.max(180_000, require('../../orchestrator/planner-run-boundary').localPlannerCeilingMs());
    }

    private async chatCompleteCompatible(
        messages: any[], model?: string, onDelta?: (delta: string) => void, signal?: AbortSignal,
        options?: { maxCompletionTokens?: number; reasoningEffort?: 'none' },
    ): Promise<string> {
        const baseURL = this.baseUrl()!;

        // Local CPU inference of a 7-8B model — especially the first (cold) request
        // that loads the model into RAM — easily exceeds 20s. Use a generous timeout
        // (override with LOCAL_LLM_TIMEOUT ms) and no retries so Joe waits for the
        // local brain instead of aborting and falling back to a weaker provider.
        const timeoutMs = this.timeoutMs();
        const maxCompletionTokens = Number(options?.maxCompletionTokens) > 0
            ? Math.min(12000, Math.floor(Number(options?.maxCompletionTokens)))
            : undefined;

        const client = new OpenAI({
            apiKey: this.apiKey(),
            baseURL,
            timeout: timeoutMs,
            maxRetries: 0,
        });

        const mapped = messages.map(m => ({ role: m.role, content: m.content })) as any;
        // STREAMING PATH: when a delta callback is given, stream tokens as the model
        // produces them (Ollama/OpenAI-compatible `stream:true`) so the panel shows the
        // agent "thinking" live. We still return the full accumulated text at the end,
        // so callers that ignore onDelta behave exactly as before.
        if (onDelta) {
            try {
                const stream = await client.chat.completions.create({
                    model: model || this.model(),
                    messages: mapped,
                    ...this.reasoningOptions(model || this.model(), options?.reasoningEffort),
                    ...(maxCompletionTokens ? { max_tokens: maxCompletionTokens } : {}),
                    stream: true,
                } as any, { timeout: timeoutMs, signal }) as any;
                let full = '';
                for await (const chunk of stream) {
                    this.assertComplete(chunk?.choices?.[0]?.finish_reason);
                    const piece = chunk?.choices?.[0]?.delta?.content || '';
                    if (piece) { full += piece; try { onDelta(piece); } catch { /* panel optional */ } }
                }
                if (full) return full;
                // Empty stream (some servers don't stream): fall through to a normal call.
            } catch (error) {
                // Streaming unsupported/failed — fall back to a single blocking call below.
                // An aborted request must not fall through to a second request: that
                // is how cancelled local calls accumulated behind a slow Ollama model.
                if (signal?.aborted || (error as any)?.code === 'LOCAL_COMPLETION_LIMIT') throw error;
            }
        }

        const completion = await client.chat.completions.create({
            model: model || this.model(),
            messages: mapped,
            ...this.reasoningOptions(model || this.model(), options?.reasoningEffort),
            ...(maxCompletionTokens ? { max_tokens: maxCompletionTokens } : {}),
        } as any, { timeout: timeoutMs, signal });

        this.assertComplete(completion.choices[0]?.finish_reason);
        return completion.choices[0]?.message?.content || '';
    }
}
