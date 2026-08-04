import { ToolDefinition, ToolPermission } from '../types';
import { resolveToolPath } from '../utils';
import { isProviderFailure } from '../../../core/llm/intelligent-router';
import fs from 'fs';
import path from 'path';

/**
 * Lazily resolve the LLM to avoid a circular import.
 *
 * This used to answer a load failure with
 * `async () => "Error: LLM not available in Elite Tools context"` — a stand-in
 * that returns an error message SHAPED LIKE AN ANSWER. The caller writes the
 * return value to disk, so the error text became the file's contents.
 */
const getLLM = () => {
    let mod: any;
    try {
        mod = require('../../../core/llm');
    } catch (e: any) {
        throw new Error(`LLM module unavailable: ${e?.message || e}`);
    }
    const fn = mod.callLLM || mod.default?.callLLM;
    if (typeof fn !== 'function') throw new Error('LLM module exports no callLLM function');
    return fn;
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
        // Both fields are `required` in the schema, and the schema was the only
        // thing enforcing them. Called with nothing, this tool went straight to
        // the model and spent a full generation on an empty brief before dying
        // on an undefined path — the sandboxed audit caught it burning a real
        // LLM call for a request that could never be written anywhere.
        const filePath = String(input?.path ?? '').trim();
        const description = String(input?.description ?? '').trim();
        if (!filePath || !description) {
            return {
                ok: false,
                error: 'ai_write_file needs both a path and a description of what the file should contain — no model was called.',
                logs,
            };
        }
        const contextWorkspaceId = context?.workspaceId;
        let callLLM: any;
        try { callLLM = getLLM(); }
        catch (e: any) { return { ok: false, error: String(e?.message || e), logs }; }

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

            // When no provider answers, the router returns an apology STRING
            // rather than throwing. Writing it would put "تعذّر الوصول إلى محرّك
            // الذكاء" into the user's source file as its contents.
            if (isProviderFailure(content)) {
                return { ok: false, error: String(content), logs: [...logs, 'no LLM provider answered; nothing was written'] };
            }

            // Clean content (remove potential LLM-added backticks if any)
            let finalContent = String(content ?? '').trim();
            if (finalContent.startsWith('```') && finalContent.endsWith('```')) {
                const lines = finalContent.split('\n');
                finalContent = lines.slice(1, -1).join('\n').trim();
            }
            // An empty completion is a failed generation. Writing it would
            // replace an existing file with nothing and report success.
            if (!finalContent) {
                return { ok: false, error: 'the model returned no content, so nothing was written', logs };
            }

            // resolveToolPath keeps the write inside the workspace and throws on
            // escape. `path.isAbsolute(p) ? p : resolve(root, p)` meant any
            // absolute path the model produced was written verbatim, anywhere on
            // the machine — proven, not theorised: the same pattern in the
            // unreachable twin of this tool created /etc/joe-owned.txt in a test.
            const absPath = resolveToolPath(filePath, { workspaceId: contextWorkspaceId });
            fs.mkdirSync(path.dirname(absPath), { recursive: true });
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
