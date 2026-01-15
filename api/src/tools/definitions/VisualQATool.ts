import { ToolDefinition } from '../types';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// Helper to encode image to base64
function encodeImage(imagePath: string): string {
    const image = fs.readFileSync(imagePath);
    return Buffer.from(image).toString('base64');
}

export const VisualQATool: ToolDefinition = {
    name: 'visual_qa',
    version: '1.0.0',
    tags: ['vision', 'qa', 'ui', 'critique'],
    description: 'Analyze a screenshot or image file to provide UI/UX critique and code fixes using GPT-4o-Vision.',
    inputSchema: {
        type: 'object',
        properties: {
            imagePath: { type: 'string', description: 'Absolute path to the screenshot/image.' },
            focus: { type: 'string', description: 'Specific element or area to focus on (optional).' }
        },
        required: ['imagePath']
    },
    outputSchema: {
        type: 'object',
        properties: {
            critique: { type: 'string' },
            fixes: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        issue: { type: 'string' },
                        suggestion: { type: 'string' },
                        css_fix: { type: 'string' }
                    }
                }
            }
        }
    },
    permissions: ['read', 'internet'],
    sideEffects: [],
    rateLimitPerMinute: 5, // Vision is expensive/rate-limited
    auditFields: ['imagePath'],
    mockSupported: true,
    execute: async (input) => {
        const filePath = input.imagePath;
        if (!fs.existsSync(filePath)) {
            return { ok: false, error: `Image not found at: ${filePath}`, logs: [] };
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const base64Image = encodeImage(filePath);
        const dataUrl = `data:image/png;base64,${base64Image}`; // Assuming PNG for now from screenshots

        const prompt = `You are an Expert UI/UX Designer and Frontend Engineer.
Critique this screenshot of a web application.
Focus: ${input.focus || 'General Layout, Aesthetics, and Professionalism'}.

Provide a list of issues and CONCRETE CSS/Code fixes.
Return JSON format:
{
  "critique": "Overall summary...",
  "fixes": [
    { "issue": "Button alignment", "suggestion": "Center vertically", "css_fix": "align-items: center;" }
  ]
}`;

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            {
                                type: "image_url",
                                image_url: {
                                    url: dataUrl,
                                },
                            },
                        ],
                    },
                ],
                response_format: { type: "json_object" },
                max_tokens: 1000,
            });

            const content = response.choices[0].message.content || '{}';
            const result = JSON.parse(content);

            return {
                ok: true,
                output: result,
                logs: [`Analyzed image: ${path.basename(filePath)}`]
            };

        } catch (err: any) {
            return { ok: false, error: `Vision API failed: ${err.message}`, logs: [err.toString()] };
        }
    }
};
