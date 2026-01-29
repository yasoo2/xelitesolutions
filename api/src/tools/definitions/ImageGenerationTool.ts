
import OpenAI from 'openai';

export const ImageGenerationTool = {
    name: 'generate_image',
    version: '1.0.0',
    tags: ['image', 'creative', 'design', 'dall-e'],
    description: 'Generate an image based on a text prompt.',
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
    mockSupported: true, // We can mock it if needed

    execute: async (input: { prompt: string, size?: string }) => {
        const prompt = String(input.prompt || '').trim();
        if (!prompt) return { ok: false, error: 'prompt is required', logs: [] };

        const size = String(input.size || '1024x1024');
        const [wRaw, hRaw] = size.split('x');
        const width = Math.max(64, Number.parseInt(wRaw || '1024', 10) || 1024);
        const height = Math.max(64, Number.parseInt(hRaw || '1024', 10) || 1024);

        const openAiKey = String(process.env.OPENAI_API_KEY || '').trim();

        console.log(`🎨 Generating image for: "${prompt}"`);

        if (openAiKey) {
            try {
                const openai = new OpenAI({ apiKey: openAiKey, baseURL: process.env.OPENAI_BASE_URL });
                const response = await openai.images.generate({
                    model: "dall-e-3",
                    prompt,
                    n: 1,
                    size: `${width}x${height}` as any,
                    response_format: "url"
                });

                const url = response.data?.[0]?.url;
                return { ok: true, output: { url }, logs: ['Generated via OpenAI'] };
            } catch (e: any) {
                console.error('Image Gen failed:', e);
            }
        }

        const seed = Math.floor(Date.now() % 1000000);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
        return { ok: true, output: { url }, logs: ['Generated via Pollinations'] };
    }
};
