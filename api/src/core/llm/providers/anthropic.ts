/**
 *  A REAL ANTHROPIC PROVIDER, BECAUSE THE ROUTER NAMED ONE AND NOBODY BUILT IT.
 *
 *  The owner: «I want to run Joe on a Claude provider through the providers
 *  button — what do you think?»
 *
 *  Measured before answering him:
 *
 *      intelligent-router.ts:21    provider: 'groq'|'openrouter'|'anthropic'|…
 *      intelligent-router.ts:2520  case 'anthropic': → 'no_key: مزوّد مدفوع'
 *      core/llm/providers/         no anthropic.ts at all
 *      intelligent-router.ts:1544  new OpenAI({ apiKey, baseURL })
 *
 *  ⛔ So the name existed in three places and the thing existed in none. And
 *  the custom route speaks the OpenAI wire protocol, which Anthropic's API is
 *  not — so choosing «anthropic» with a real key would have failed for a
 *  reason that looks like a bad key and is not.
 *
 *  A name in a union type is not a provider. That is this repository's most
 *  repeated class in its purest form: something declared, referenced, and
 *  never actually there.
 *
 *  This speaks the Messages API directly: `x-api-key`, `anthropic-version`,
 *  a top-level `system` string rather than a system message, and `max_tokens`
 *  as a REQUIRED field — three details that make an OpenAI-shaped client fail
 *  even when it reaches the right host.
 */

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const API_VERSION = '2023-06-01';
const BASE = 'https://api.anthropic.com/v1/messages';

export class AnthropicProvider {
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    }

    isAvailable(): boolean {
        return !!this.apiKey && this.apiKey !== 'dummy' && this.apiKey !== 'free-mode';
    }

    /**
     *  ⛔ THE SYSTEM MESSAGE IS NOT A MESSAGE HERE.
     *
     *  Anthropic takes the system prompt as a top-level string. Passing it in
     *  the array — the way every other provider in this folder does — is a 400
     *  that reads like a malformed request rather than like «you put it in the
     *  wrong place», so it is split out explicitly instead of being trusted to
     *  pass through.
     */
    private split(messages: any[]): { system: string; turns: any[] } {
        const list = Array.isArray(messages) ? messages : [];
        const system = list
            .filter(m => String(m?.role) === 'system')
            .map(m => String(m?.content ?? ''))
            .join('\n\n')
            .slice(0, 60_000);
        const turns = list
            .filter(m => String(m?.role) !== 'system')
            .map(m => ({
                role: String(m?.role) === 'assistant' ? 'assistant' : 'user',
                content: String(m?.content ?? ''),
            }))
            .filter(m => m.content.trim());
        //  The API refuses an empty conversation; an empty turn list is a
        //  caller's mistake, not something to paper over with a fake message.
        return { system, turns };
    }

    async chatComplete(
        messages: any[],
        model: string = DEFAULT_MODEL,
        opts?: { maxTokens?: number; timeoutMs?: number },
    ): Promise<string> {
        if (!this.isAvailable()) {
            throw new Error('Anthropic: no API key — set it in the provider field or ANTHROPIC_API_KEY');
        }
        const { system, turns } = this.split(messages);
        if (!turns.length) throw new Error('Anthropic: nothing to send — every message was empty or system-only');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(5_000, opts?.timeoutMs ?? 120_000));
        try {
            const res = await fetch(BASE, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': API_VERSION,
                },
                body: JSON.stringify({
                    model: model || DEFAULT_MODEL,
                    //  ⛔ REQUIRED by this API, unlike every other provider here.
                    //  Omitting it is a 400, and a caller used to OpenAI would
                    //  never think to send it.
                    max_tokens: Math.max(256, opts?.maxTokens ?? 8192),
                    ...(system ? { system } : {}),
                    messages: turns,
                }),
            });

            if (!res.ok) {
                //  The body carries the real reason — a bad key, an unknown
                //  model, a rate limit. Losing it would turn every failure into
                //  «the provider did not work», which is the kind of report
                //  this repository refuses to produce.
                const detail = await res.text().catch(() => '');
                throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 400)}`);
            }

            const data: any = await res.json();
            const text = Array.isArray(data?.content)
                ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => String(b?.text ?? '')).join('')
                : '';
            if (!text.trim()) {
                //  A stop_reason with no text is a real answer about a refusal
                //  or a truncation, and it must not be reported as success.
                throw new Error(`Anthropic returned no text (stop_reason: ${String(data?.stop_reason || 'unknown')})`);
            }
            return text;
        } finally {
            clearTimeout(timer);
        }
    }
}

export const anthropicProvider = new AnthropicProvider();
