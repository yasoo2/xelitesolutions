import { ToolDefinition, ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';

// Helper to get LLM function lazily to avoid circular dependency
const getLLM = () => {
    try {
        // Correct path to core/llm
        const mod = require('../../../core/llm');
        return mod.callLLM || mod.default?.callLLM;
    } catch (e) {
        return async () => "Error: LLM not available in Elite Tools context";
    }
};

/**
 * AIGeneratorTool - Advanced AI-driven file generator
 * 
 * Unlike standard write_file, this tool uses the LLM to generate substantial, 
 * high-quality content based on a requirements prompt.
 */
export class AIGeneratorTool implements ToolDefinition {
    name = 'ai_write_file';
    version = '1.0.0';
    description = 'Generate and write high-quality, professional file content using AI based on a description.';
    tags = ['generation', 'ai', 'write', 'elite', 'code'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string', description: 'Destination file path relative to workspace root' },
            description: { type: 'string', description: 'Detailed description of what the file should contain' },
            aestheticMode: { type: 'string', enum: ['glass', 'neon', 'minimal', 'corporate'], description: 'Visual style direction' },
            language: { type: 'string', enum: ['ar', 'en', 'dual'], description: 'Primary language for content' },
            context: { type: 'string', description: 'Additional technical context (e.g., framework versions, project goal)' }
        },
        required: ['path', 'description']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            bytes: { type: 'number' },
            summary: { type: 'string' }
        }
    };

    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 10;
    auditFields = ['path'];
    mockSupported = false;

    async execute(input: {
        path: string;
        description: string;
        aestheticMode?: string;
        language?: string;
        context?: string
    }, context?: any) {
        const logs: string[] = [];
        const filePath = input.path;
        const callLLM = getLLM();
        const contextWorkspaceId = context?.workspaceId;

        const isRepair = input.context?.includes('repairTicket') || input.context?.includes('buildContext');
        const systemPrompt = `You are an ELITE Software Engineer and UI/UX Designer. 
Your task is to generate complete, ultra-high-quality, production-ready code for a single file.

${isRepair ? `REPAIR MODE ACTIVE:
- You are fixing a specific bug or build error.
- Use the provided buildContext and repairTicket to identify the exact line and cause of failure.
- Patch the code surgically. Ensure the fix is correct and doesn't break other logic.
- Preserve the existing project style and architecture.` : ''}

CRITICAL DESIGN RULES (IF UI/FRONTEND):
- AESTHETICS ARE PARAMOUNT. The design MUST be stunning, modern, and feel premium.
- Use advanced CSS techniques: Glassmorphism (backdrop-filter: blur), subtle multi-layered drop shadows, vibrant but professional gradients.
- Typography: Use elegant sans-serif fonts (like Inter, Roboto, or Tajawal/Cairo for Arabic).
- Animations: Add micro-interactions and smooth transitions (e.g., hover lifts, fade-ins).
- Never use generic placeholder styling. Make it look like an award-winning site.
- Support ${input.language === 'ar' ? 'Arabic (RTL layout: use dir="rtl", proper alignments)' : 'the requested language'} natively.

GENERAL RULES:
- DO NOT use placeholders like "<!-- content goes here -->". Write the actual content.
- DO NOT include explanations, only the file content.
- Ensure the code is robust, well-formatted, and responsive (mobile-first).
- Output ONLY the content of the file. No markdown code blocks unless the file is a markdown file.
- If it is code (html, css, js, ts), return ONLY the code.`;

        const userPrompt = `Generate the content for the file: "${filePath}"
        
Description of requirements:
${input.description}

Technical Context:
${input.context || 'Standard web development environment.'}

Aesthetic Direction:
${input.aestheticMode || 'Ultra-modern, glassmorphism, stunning gradients, and professional.'}

Primary Language:
${input.language === 'ar' ? 'Arabic (RTL)' : 'English (LTR)'}

IMPORTANT: Provide the FULL, production-ready content of the file. No generic designs. Make it visually breathtaking.`;

        try {
            const content = await callLLM(userPrompt, [{ role: 'system', content: systemPrompt }]);

            // Resolve absolute path
            const { workspaceService } = require('../../services/WorkspaceService');
            const root = workspaceService.getActiveRoot(contextWorkspaceId);
            const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);

            // Ensure directory exists
            fs.mkdirSync(path.dirname(absPath), { recursive: true });

            // Clean content (remove potential LLM-added backticks if any)
            let finalContent = content.trim();
            if (finalContent.startsWith('```') && finalContent.endsWith('```')) {
                const lines = finalContent.split('\n');
                finalContent = lines.slice(1, -1).join('\n').trim();
            }

            fs.writeFileSync(absPath, finalContent, 'utf-8');

            const stats = fs.statSync(absPath);
            logs.push(`AI file generation successful: ${filePath} (${stats.size} bytes)`);

            return {
                ok: true,
                output: {
                    path: filePath,
                    bytes: stats.size,
                    summary: `Generated high-quality content for ${filePath}`
                },
                logs
            };

        } catch (e: any) {
            return {
                ok: false,
                error: `AI Generation failed: ${e.message}`,
                logs: [e.message]
            };
        }
    }
}
