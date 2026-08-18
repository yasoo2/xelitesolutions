import OpenAI from 'openai';

// Models available on Pollinations (OpenAI compatible)
export const POLLINATIONS_MODELS = {
    GPT4O: 'gpt-4o', // Mapped to whatever pollinations uses
    DEFAULT: 'openai'
};

const BASE_URL = 'https://text.pollinations.ai/openai';

export interface PollinationsRequestOptions {
    /** Abort the queued or in-flight proxy request when the router ends the turn. */
    signal?: AbortSignal;
    /** Bounded provider deadline. The router also supplies an AbortSignal. */
    timeoutMs?: number;
    /** Engineering calls may use the router's longer bounded fallback deadline. */
    engineering?: boolean;
}

function abortError(): Error {
    const error = new Error('Pollinations request aborted');
    error.name = 'AbortError';
    return error;
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw abortError();
}

function delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            callback();
        };
        const onAbort = () => finish(() => reject(abortError()));
        const timer = setTimeout(() => finish(resolve), Math.max(0, ms));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
    });
}

function waitForQueue(previous: Promise<void>, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (!signal) return previous;
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            callback();
        };
        const onAbort = () => finish(() => reject(abortError()));
        previous.then(
            () => finish(resolve),
            () => finish(resolve),
        );
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
    });
}

export class PollinationsProvider {
    private client: OpenAI;
    private requestQueue: Promise<void> = Promise.resolve();

    constructor() {
        this.client = new OpenAI({
            apiKey: 'dummy', // No key required
            baseURL: BASE_URL,
        });
    }

    async chatComplete(
        messages: any[],
        model: string = 'openai',
        retries: number = 0,
        tools?: any[],
        options?: PollinationsRequestOptions,
    ): Promise<string> {
        const signal = options?.signal;
        throwIfAborted(signal);

        // Keep the anonymous proxy single-filed, but make cancellation release a
        // queued turn immediately. Previously a timed-out router call stayed in
        // this chain and continued making upstream requests after run_finished.
        const previous = this.requestQueue;
        let release!: () => void;
        const current = new Promise<void>(resolve => {
            release = resolve;
        });
        this.requestQueue = previous.then(() => current, () => current);

        try {
            await waitForQueue(previous, signal);
            await delayWithSignal(250, signal);
            return await this.executeChat(messages, model, retries, tools, options);
        } catch (error: any) {
            if (error?.name !== 'AbortError') {
                console.error('[Pollinations Queue Error]:', error?.message || error);
            }
            return '';
        } finally {
            release();
        }
    }

    private async executeChat(
        messages: any[],
        model: string = 'openai',
        retries: number = 0,
        tools?: any[],
        options?: PollinationsRequestOptions,
    ): Promise<string> {
        const signal = options?.signal;
        try {
            throwIfAborted(signal);
            const body: any = {
                model: model,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })) as any,
            };

            if (tools && tools.length > 0) {
                body.tools = tools;
                body.tool_choice = 'auto';
            }

            // This is a last-resort anonymous proxy. Ordinary chat stays short,
            // while engineering calls get the router's bounded deadline so a real
            // build/recovery prompt is not aborted before the proxy can answer.
            const configuredTimeout = Number(options?.timeoutMs);
            const maxTimeout = options?.engineering ? 90_000 : 5_000;
            const timeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0
                ? Math.min(maxTimeout, Math.floor(configuredTimeout))
                : maxTimeout;
            const completion = await this.client.chat.completions.create(
                body,
                { timeout, ...(signal ? { signal } : {}) } as any,
            );

            throwIfAborted(signal);
            const response = completion.choices[0]?.message?.content || '';
            const toolCalls = completion.choices[0]?.message?.tool_calls;

            if (toolCalls && toolCalls.length > 0) {
                return JSON.stringify({ tool_calls: toolCalls });
            }

            if (!response || response.length < 2) {
                if (retries > 0) {
                    console.warn(`[Pollinations] Empty response, retrying... (${retries} left)`);
                    await delayWithSignal(250, signal);
                    return this.executeChat(messages, model, retries - 1, tools, options);
                }
            }
            return response;
        } catch (error: any) {
            if (error?.name === 'AbortError' || signal?.aborted) {
                return '';
            }
            const isRetryable = (error.status === 503 || error.message?.includes('timeout')) && error.status !== 402 && error.status !== 429;
            if (isRetryable && retries > 0) {
                const delay = 1000;
                console.warn(`[Pollinations] Failed (${error.status || 'timeout'}), retrying in ${delay / 1000}s... (${retries} left)`);
                await delayWithSignal(delay, signal);
                return this.executeChat(messages, model, retries - 1, tools, options);
            }
            console.error(`Pollinations Chat Failed: ${error.status || error.message}`);
            return ''; // Return empty string to trigger router fallback immediately
        }
    }
}
