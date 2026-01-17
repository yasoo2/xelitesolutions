
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import path from 'path';
import fs from 'fs';
import { Analyst } from '../../system/Analyst';
import { OpenAI } from 'openai'; // Peer dep, or import dynamic? Copy logic from registry

// Helper reuse
function repoRoot() {
    const cwd = process.cwd();
    return path.basename(cwd) === 'api' ? path.resolve(cwd, '..') : cwd;
}
function resolveToolPath(p: string) {
    const root = repoRoot();
    const val = String(p ?? '').trim();
    if (!val || val === '.') return root;
    if (path.isAbsolute(val)) return val;
    const fromCwd = path.resolve(process.cwd(), val);
    if (fs.existsSync(fromCwd)) return fromCwd;
    return path.resolve(root, val);
}

export class AnalyzeProjectTool extends BaseTool {
    name = 'analyze_project';
    version = '1.0.0';
    tags = ['analysis', 'structure', 'architect'];
    inputSchema = { type: 'object' as const, properties: { path: { type: 'string' } }, required: [] };
    outputSchema = { type: 'object' as const, properties: { summary: { type: 'string' } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    async execute(input: any) {
        const root = String(input?.path || process.cwd()).trim();
        try {
            const result = Analyst.analyze(root);
            return { ok: true, output: result, logs: [`analyst.analyze.success=${root}`] };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}

export class AnalyzeCodebaseTool extends BaseTool {
    name = 'analyze_codebase';
    version = '1.0.0';
    tags = ['analysis', 'fs', 'llm'];
    inputSchema = { type: 'object' as const, properties: { path: { type: 'string' } }, required: [] };
    outputSchema = { type: 'object' as const, properties: { summary: { type: 'string' } } };
    permissions: ToolPermission[] = ['read', 'internet']; // LLM access
    sideEffects: ToolPermission[] = [];

    async execute(input: any) {
        const p = String(input?.path || '.');
        const root = resolveToolPath(p);
        const logs: string[] = [];

        if (!fs.existsSync(root)) return { ok: false, error: 'Path not found', logs };

        logs.push(`analyze.root=${root}`);

        // 1. Structure
        const getStructure = (dir: string, depth: number): string[] => {
            if (depth > 3) return [];
            try {
                const items = fs.readdirSync(dir, { withFileTypes: true });
                let res: string[] = [];
                for (const item of items) {
                    if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist' || item.name === 'build' || item.name === 'coverage') continue;
                    if (item.isDirectory()) {
                        res.push(`${item.name}/`);
                        const subs = getStructure(path.join(dir, item.name), depth + 1);
                        res = res.concat(subs.map(s => `${item.name}/${s}`));
                    } else {
                        res.push(item.name);
                    }
                }
                return res;
            } catch { return []; }
        };
        const allFiles = getStructure(root, 0);
        const structure = allFiles
            .filter(f => !f.includes('test/') && !f.includes('__tests__/'))
            .slice(0, 60)
            .join('\n');

        // 2. Key Files
        const keyFiles = ['package.json', 'README.md', 'tsconfig.json', 'Dockerfile', 'docker-compose.yml', 'go.mod', 'requirements.txt', 'Cargo.toml', 'Gemfile', 'pyproject.toml'];
        const fileContents: string[] = [];
        for (const kf of keyFiles) {
            const kp = path.join(root, kf);
            if (fs.existsSync(kp)) {
                const content = fs.readFileSync(kp, 'utf-8');
                if (kf === 'package.json') {
                    try {
                        const pkg = JSON.parse(content);
                        const slim = { name: pkg.name, version: pkg.version, scripts: pkg.scripts, dependencies: pkg.dependencies, devDependencies: pkg.devDependencies };
                        fileContents.push(`=== ${kf} ===\n${JSON.stringify(slim, null, 2)}\n`);
                    } catch {
                        fileContents.push(`=== ${kf} ===\n${content.slice(0, 1000)}\n`);
                    }
                } else {
                    fileContents.push(`=== ${kf} ===\n${content.slice(0, 1500)}\n`);
                }
            }
        }

        // 3. LLM Summary
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return { ok: true, output: { summary: `## Structure\n${structure}\n\n## Files\n${fileContents.map(f => f.split('\n')[0]).join('\n')}` }, logs };
        }

        try {
            // Determine client (Assuming OpenAI direct usage as per registry)
            const OpenAIConstructor = (await import('openai')).default;
            const client = new OpenAIConstructor({ apiKey, baseURL: process.env.OPENAI_BASE_URL });

            const completion = await client.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: 'You are a Senior Software Architect. Analyze the provided codebase context and generate a high-level architectural summary. Focus on: Tech Stack, Key Components, Entry Points, and Project Structure. Be concise.' },
                    { role: 'user', content: `File Structure (partial):\n${structure}\n\nKey File Contents:\n${fileContents.join('\n')}` }
                ]
            });
            const summary = completion.choices[0].message.content || 'Analysis failed';
            return { ok: true, output: { summary }, logs };
        } catch (e: any) {
            logs.push(`analyze.llm_error=${e.message}`);
            return { ok: true, output: { summary: `## Structure\n${structure}\n\n## Files (LLM Failed)\n${fileContents.map(f => f.split('\n')[0]).join('\n')}` }, logs };
        }
    }
}
