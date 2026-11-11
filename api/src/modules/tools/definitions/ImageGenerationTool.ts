import { ToolDefinition } from '../types';
import { providerAllowedByCost } from '../../../core/llm/provider-continuity';
import { admitLocalModelCall } from '../../../core/resources/local-model-call';

export const ImageGenerationTool: ToolDefinition = {
    name: 'generate_image',
    version: '1.0.0',
    tags: ['image', 'creative', 'design', 'dall-e'],
    description: 'Generate an image based on a text prompt. Uses free providers first; paid providers only when explicitly allowed.',
    inputSchema: {
        type: 'object',
        properties: {
            prompt: { type: 'string', description: 'The text prompt to generate image from' },
            size: { type: 'string', enum: ['256x256', '512x512', '1024x1024'], default: '1024x1024' }
        },
        required: ['prompt']
    },
    outputSchema: {
        type: 'object',
        properties: {
            url: { type: 'string' }
        }
    },
    permissions: ['execute', 'internet'],
    sideEffects: ['execute'],
    rateLimitPerMinute: 5,
    auditFields: ['prompt'],
    mockSupported: true,

    execute: async (input: { prompt: string, size?: string }) => {
        const prompt = String(input.prompt || '').trim();
        if (!prompt) return { ok: false, error: 'prompt is required', logs: [] };

        const size = String(input.size || '1024x1024');
        const [wRaw, hRaw] = size.split('x');
        const width = Math.max(64, Number.parseInt(wRaw || '1024', 10) || 1024);
        const height = Math.max(64, Number.parseInt(hRaw || '1024', 10) || 1024);

        const seed = Math.floor(Date.now() % 1000000);
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

        console.log(`🎨 Generating image for: "${prompt}"`);

        // FREE-FIRST: Try Pollinations first (free provider)
        try {
            console.log(`🎨 Trying Pollinations (free provider)...`);
            // Verify Pollinations URL is actually accessible via HEAD request
            const verifyResponse = await fetch(pollinationsUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
            if (verifyResponse.ok) {
                console.log(`🎨 Pollinations URL verified accessible`);
                return { ok: true, output: { url: pollinationsUrl }, logs: ['Generated via Pollinations (free, verified)'] };
            } else {
                console.error(`Pollinations returned HTTP ${verifyResponse.status}: ${verifyResponse.statusText}`);
            }
        } catch (e: any) {
            console.error('Pollinations failed:', e);
        }

        // PAID PROVIDER: Only if explicitly allowed by cost policy
        const openAiKey = String(process.env.OPENAI_API_KEY || '').trim();
        const costPolicy = String(process.env.AI_COST_POLICY || '').trim().toLowerCase();
        const allowPaid = costPolicy === 'allow_paid';

        // Check if OpenAI is allowed by cost policy
        const openaiAllowed = providerAllowedByCost('openai', 'dall-e-3');

        if (allowPaid && openAiKey && openaiAllowed) {
            try {
                const { default: OpenAI } = await import('openai');
                const openai = new OpenAI({ apiKey: openAiKey, baseURL: process.env.OPENAI_BASE_URL });
                // OPENAI_BASE_URL at an image server on this machine is a local model
                // call, admitted for its whole run (second review of round 21).
                const response = await admitLocalModelCall(process.env.OPENAI_BASE_URL, () => openai.images.generate({
                    model: "dall-e-3",
                    prompt,
                    n: 1,
                    size: `${width}x${height}` as any,
                    response_format: "url"
                }), { kind: 'local-image-generation' });

                const url = response.data?.[0]?.url;
                if (url) {
                    return { ok: true, output: { url }, logs: ['Generated via OpenAI DALL-E-3 (paid, AI_COST_POLICY=allow_paid)'] };
                }
            } catch (e: any) {
                console.error('OpenAI Image Gen failed:', e);
            }
        } else if (openAiKey && !allowPaid) {
            console.log('🎨 OPENAI_API_KEY present but AI_COST_POLICY=free_only (default) — skipping paid provider');
        }

        // FAIL CLOSED: No free provider succeeded and paid not allowed
        return { ok: false, error: 'All free image generation providers failed. Set AI_COST_POLICY=allow_paid to enable paid providers.', logs: ['Pollinations failed', `AI_COST_POLICY=${costPolicy || 'free_only (default)'}`] };
    }
};