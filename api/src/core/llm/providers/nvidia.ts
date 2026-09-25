/**
 * NVIDIA NIM is OpenAI-compatible, but its quota headers are important routing
 * evidence. This provider preserves Retry-After in a redacted error so the
 * router can cool down one legitimate project credential without retry storms.
 */
export const NVIDIA_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const NVIDIA_NEMOTRON_DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

export class NvidiaProvider {
    constructor(
        private readonly apiKey = String(process.env.NVIDIA_API_KEY || '').trim(),
        private readonly baseUrl = String(process.env.NVIDIA_NIM_BASE_URL || NVIDIA_NIM_BASE_URL).trim(),
    ) {}

    isAvailable(): boolean {
        return !!this.apiKey && this.apiKey !== 'dummy';
    }

    async chatComplete(messages: any[], model = String(process.env.NVIDIA_NIM_MODEL || NVIDIA_NEMOTRON_DEFAULT_MODEL).trim(), tools?: any[], signal?: AbortSignal): Promise<string> {
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
                max_tokens: 4096,
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
            const retryAfter = String(response.headers.get('retry-after') || '').trim();
            const body = (await response.text()).slice(0, 240);
            const retryNote = retryAfter ? `; retry-after: ${retryAfter} seconds` : '';
            throw new Error(`NVIDIA NIM API Error (${response.status})${retryNote}: ${body}`);
        }
        const data: any = await response.json();
        const message = data?.choices?.[0]?.message;
        if (message?.tool_calls?.length) return JSON.stringify({ type: 'tool_calls', tool_calls: message.tool_calls });
        return String(message?.content || '');
    }
}

export const nvidiaProvider = new NvidiaProvider();