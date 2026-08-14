import { ToolDefinition, ToolPermission } from '../types';
import { resolveToolPath } from '../utils';
import { isProviderFailure } from '../../../core/llm/intelligent-router';
import fs from 'fs';
import path from 'path';

type ArtifactProfile = {
    kind: 'markdown_document' | 'structured_data' | 'source_code' | 'frontend_asset' | 'text_document';
    instructions: string;
};

/**
 * The destination is evidence too.  A plan can request an architecture document
 * and a general-purpose model can still answer with a polished landing page if
 * the prompt says "UI/UX designer" unconditionally.  Classify only from the
 * file extension — never from product names — and make the expected artifact
 * explicit in every generation request.
 */
function artifactProfileFor(filePath: string): ArtifactProfile {
    const ext = path.extname(filePath).toLowerCase();
    if (['.md', '.mdx', '.rst', '.adoc'].includes(ext)) {
        return {
            kind: 'markdown_document',
            instructions: 'This is a technical document. Return Markdown prose, headings, tables, lists, and code blocks only when they document a concrete interface or command. Do not return an HTML page, CSS, visual mock-up, or UI implementation. Ground each section in the supplied requirements and state assumptions or open decisions explicitly.',
        };
    }
    if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext)) {
        return {
            kind: 'structured_data',
            instructions: 'This is a structured configuration or data artifact. Return syntactically valid content in the destination format only. Do not return HTML, CSS, prose explanations, or placeholder values unless the requirements explicitly require them.',
        };
    }
    if (['.html', '.htm', '.css', '.scss', '.sass', '.jsx', '.tsx', '.vue', '.svelte'].includes(ext)) {
        return {
            kind: 'frontend_asset',
            instructions: 'This is a frontend artifact. Apply visual and responsive-design guidance only when it serves the supplied requirements; do not invent product features, framework dependencies, or placeholder content.',
        };
    }
    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.rb', '.php', '.sh', '.sql'].includes(ext)) {
        return {
            kind: 'source_code',
            instructions: 'This is source code. Return only executable source for the destination language, with concrete interfaces and error handling required by the supplied requirements. Do not return an HTML page or prose document unless the destination language requires it.',
        };
    }
    return {
        kind: 'text_document',
        instructions: 'Return the exact text artifact implied by the destination and supplied requirements. Do not assume a web application, visual design, framework, or deployment target.',
    };
}

function artifactMismatch(filePath: string, content: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    const looksLikeHtmlDocument = /<!doctype\s+html|<html\b|<\/(?:head|body|html)>/i.test(content);
    if (['.md', '.mdx', '.rst', '.adoc'].includes(ext) && looksLikeHtmlDocument) {
        return `artifact_type_mismatch: ${filePath} requires a technical document, but the model returned an HTML document`;
    }
    if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext) && looksLikeHtmlDocument) {
        return `artifact_type_mismatch: ${filePath} requires structured data, but the model returned an HTML document`;
    }
    return null;
}

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
        const artifact = artifactProfileFor(filePath);
        const frontendGuidance = artifact.kind === 'frontend_asset'
            ? `\nFRONTEND QUALITY RULES:\n- Use accessible, responsive implementation only where the requirements call for a user interface.\n- Follow the selected style direction if supplied; otherwise favour clear, maintainable UI over decorative effects.\n- Support ${input.language === 'ar' ? 'Arabic with RTL layout' : 'the requested language'} when user-facing text is required.\n`
            : '';
        const systemPrompt = `You are an engineering artifact author. Generate one complete, production-ready file that satisfies the supplied, evidenced requirements.

ARTIFACT CONTRACT (${artifact.kind}):
${artifact.instructions}
${isRepair ? `\nREPAIR MODE ACTIVE:\n- Fix only the documented defect using the supplied repair evidence.\n- Preserve the existing architecture and avoid unrelated changes.\n` : ''}
${frontendGuidance}
GENERAL RULES:
- Treat the supplied requirements as authoritative; do not invent a product, framework, build command, or visual interface.
- Do not use placeholders. Write concrete content, and mark genuinely unresolved decisions as explicit assumptions only in documentation artifacts.
- Do not include explanations outside the destination file content.
- Output only the content of the requested file. Use Markdown fences only when the requested file is itself a Markdown document.`;

        const userPrompt = `Generate the content for the file: "${filePath}"

Artifact contract:
${artifact.instructions}

Task requirements:
${input.description}

Verified project and requirements context:
${input.context || 'No additional project context was provided. Do not assume a web development environment.'}
${artifact.kind === 'frontend_asset' ? `\nVisual direction (use only if relevant):\n${input.aestheticMode || 'Use a clear, maintainable visual style consistent with the requirements.'}` : ''}

Primary language for user-facing content: ${input.language === 'ar' ? 'Arabic (RTL where applicable)' : 'English (LTR where applicable)'}

Return the complete file content now.`;

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
            const mismatch = artifactMismatch(filePath, finalContent);
            if (mismatch) {
                return { ok: false, error: mismatch, logs: [...logs, 'generated content violated the destination artifact contract; nothing was written'] };
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
