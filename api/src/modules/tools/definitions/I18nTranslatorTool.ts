import { ToolDefinition, ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';

export class I18nTranslatorTool implements ToolDefinition {
    name = 'i18n_translator';
    version = '1.0.0';
    tags = ['i18n', 'language', 'translation', 'localization'];
    description = 'Translate a JSON language file to multiple target languages automatically using AI. Preserves keys and structure.';

    inputSchema: any = {
        type: 'object',
        properties: {
            sourceFile: { type: 'string', description: 'Path to source JSON file (e.g. locales/en.json)' },
            targetLanguages: { type: 'array', items: { type: 'string' }, description: 'List of target language codes (e.g. ["ar", "fr", "es"])' }
        },
        required: ['sourceFile', 'targetLanguages']
    };

    outputSchema: any = {
        type: 'object',
        properties: {
            translatedFiles: { type: 'array', items: { type: 'string' } }
        }
    };

    permissions: ToolPermission[] = ['read', 'write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 5; // AI heavy
    auditFields = ['sourceFile'];
    mockSupported = false;

    async execute(input: { sourceFile: string; targetLanguages: string[]; workspaceId?: string }) {
        const logs: string[] = [];
        
        try {
            // Lazy load the LLM to avoid cyclic dependency issues
            const mod = require('../../llm');
            const callLLM = mod.callLLM || mod.default?.callLLM;

            const { workspaceService } = require('../../services/WorkspaceService');
            const root = workspaceService.getActiveRoot(input.workspaceId);
            
            const sourcePath = path.isAbsolute(input.sourceFile) ? input.sourceFile : path.resolve(root, input.sourceFile);
            
            if (!fs.existsSync(sourcePath)) {
                return { ok: false, error: `Source file not found: ${input.sourceFile}`, logs: [] };
            }

            const sourceContent = fs.readFileSync(sourcePath, 'utf8');
            const sourceObj = JSON.parse(sourceContent); // Validate JSON

            const translatedFiles: string[] = [];

            for (const lang of input.targetLanguages) {
                logs.push(`Translating to ${lang}...`);
                
                const prompt = `Translate the following JSON object values to language "${lang}". 
                CRITICAL RULES:
                1. DO NOT translate keys, only the values.
                2. Preserve all brackets, braces, and JSON structure perfectly.
                3. Return ONLY valid JSON, without any markdown formatting, no \`\`\`json wrappers.
                
                SOURCE JSON:
                ${sourceContent}`;

                let response = await callLLM(prompt, [{ role: 'system', content: 'You are an elite software localizer. Return pure JSON only.' }]);
                
                // Cleanup common LLM markdown artifacts
                if (response.startsWith('```')) {
                    response = response.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
                }

                try {
                    // Verify the AI returned valid JSON
                    JSON.parse(response);
                    
                    const p = path.parse(sourcePath);
                    const outPath = path.join(p.dir, `${lang}.json`);
                    
                    fs.writeFileSync(outPath, response);
                    translatedFiles.push(path.relative(root, outPath));
                    logs.push(`✅ Saved: ${lang}.json`);
                    
                } catch (pe: any) {
                    logs.push(`❌ Translation failed for ${lang} (Invalid JSON from AI)`);
                }
            }

            return {
                ok: translatedFiles.length > 0,
                output: { translatedFiles },
                logs
            };

        } catch (e: any) {
            logs.push(`Execution error: ${e.message}`);
            return { ok: false, error: e.message, logs };
        }
    }
}
