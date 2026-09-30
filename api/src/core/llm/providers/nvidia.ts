/**
 * NVIDIA NIM is OpenAI-compatible. Provider errors deliberately retain only
 * status and reset information because the router logs them for diagnosis.
 */
export const NVIDIA_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const NVIDIA_NEMOTRON_DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

function retryAfterSeconds(value: string | null): number | null {
    const raw = String(value || '').trim();
    if (/^\d+$/.test(raw)) return Math.max(0, Number.parseInt(raw, 10));
    const at = Date.parse(raw);
    if (Number.isFinite(at)) return Math.max(0, Math.ceil((at - Date.now()) / 1000));
    return null;
}

export class NvidiaProvider {
    constructor(
        private readonly apiKey = String(process.env.NVIDIA_API_KEY || '').trim(),
        private readonly baseUrl = String(process.env.NVIDIA_NIM_BASE_URL || NVIDIA_NIM_BASE_URL).trim(),
    ) {}

    isAvailable(): boolean {
        const key = this.apiKey.trim();
        return !!key && key !== 'dummy';
    }

    async chatComplete(
        messages: any[],
        model = String(process.env.NVIDIA_NIM_MODEL || NVIDIA_NEMOTRON_DEFAULT_MODEL).trim(),
        tools?: any[],
        signal?: AbortSignal,
        maxTokens = 4096,
    ): Promise<string> {
        if (!this.isAvailable()) throw new Error('NVIDIA_API_KEY not configured');
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            signal,
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.7,
                max_tokens: maxTokens,
                ...(tools?.length ? {
                    tools: tools.map((tool: any) => ({
                        type: 'function',
                        function: {
                            name: tool.name,
                            description: tool.description || '',
                            parameters: tool.inputSchema || { type: 'object', properties: {} },
                        },
                    })),
                    tool_choice: 'auto',
                } : {}),
            }),
        });
        if (!response.ok) {
            const retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
            const retryNote = retryAfter === null ? '' : `; retry-after: ${retryAfter} seconds`;
            throw new Error(`NVIDIA NIM API Error (${response.status})${retryNote}`);
        }
        const data: any = await response.json();
        const message = data?.choices?.[0]?.message;
        if (message?.tool_calls?.length) return JSON.stringify({ type: 'tool_calls', tool_calls: message.tool_calls });
        return String(message?.content || '');
    }

    async healthCheck(signal?: AbortSignal): Promise<boolean> {
        const answer = await this.chatComplete(
            [{ role: 'user', content: 'Reply with exactly: OK' }],
            undefined,
            undefined,
            signal,
            8,
        );
        return answer.trim().length > 0;
    }
}

export const nvidiaProvider = new NvidiaProvider();
