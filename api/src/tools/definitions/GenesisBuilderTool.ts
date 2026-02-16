
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';

export class GenesisBuilderTool extends BaseTool {
    name = 'genesis_builder';
    description = 'High-stakes autonomous builder. Generates massive enterprise directory structures and complete file content in a single operation.';
    version = '1.0.0';
    tags = ['genesis', 'construction', 'god-mode'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            mission: { type: 'string', description: 'Total system goal' },
            structure: {
                type: 'object',
                description: 'Key: path, Value: content. Support thousands of paths.'
            },
            baseDir: { type: 'string' }
        },
        required: ['mission', 'structure']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            totalFiles: { type: 'number' },
            directoriesCreated: { type: 'number' },
            errors: { type: 'array' }
        }
    };

    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];

    async execute(input: any) {
        const logs: string[] = [];
        const structure = input.structure || {};
        const baseDir = input.baseDir || process.cwd();
        const resolvedBase = path.isAbsolute(baseDir) ? baseDir : path.resolve(process.cwd(), baseDir);

        let fileCount = 0;
        let dirCount = 0;
        const errors: string[] = [];

        logs.push(`🪐 Genesis Builder Initialized: ${input.mission}`);

        for (const [relPath, content] of Object.entries(structure)) {
            const fullPath = path.join(resolvedBase, relPath);
            try {
                const dir = path.dirname(fullPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    dirCount++;
                }

                fs.writeFileSync(fullPath, String(content), 'utf-8');
                fileCount++;
            } catch (e: any) {
                errors.push(`${relPath}: ${e.message}`);
            }
        }

        return {
            ok: errors.length === 0,
            output: {
                totalFiles: fileCount,
                directoriesCreated: dirCount,
                errors
            },
            logs
        };
    }
}
