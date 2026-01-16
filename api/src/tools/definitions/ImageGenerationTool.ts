
import { OpenAI } from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
        if (!OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is missing');
        }
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        console.log(`🎨 Generating image for: "${input.prompt}"`);

        try {
            const response = await openai.images.generate({
                model: "dall-e-3",
                prompt: input.prompt,
                n: 1,
                size: "1024x1024",
                response_format: "url"
            });

            const url = response.data?.[0]?.url;
            return { ok: true, output: { url }, logs: [] };
        } catch (e: any) {
            console.error('Image Gen failed:', e);
            throw new Error(`Image Generation Failed: ${e.message}`);
        }
    }
};
