
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import path from 'path';
import fs from 'fs';
import { Analyst } from '../../../system/Analyst';
import { resolveToolPath as sharedResolveToolPath } from '../utils';
import { routeToModel } from '../../../core/llm/intelligent-router';
// import { OpenAI } from 'openai'; // Peer dep, or import dynamic? Copy logic from registry

/**
 * Anchor and contain an analysis path.
 *
 * This file, too, had a private resolver of this name, and it was the weakest of
 * the four: `if (path.isAbsolute(val)) return val;` returned anything absolute
 * untouched, and the relative branch had NO containment check at all — it just
 * resolved and handed the path back.
 *
 * "Read-only" does not make that harmless. analyze_codebase walks the directory
 * it is given and sends what it finds to a model, so an unchecked path is a way
 * to read /root/.ssh and then post it to a provider.
 *
 * Resolution keeps the old convenience — a path that exists relative to the
 * process cwd wins, which is how the repo gets analysed from inside `api/` —
 * but the answer now goes through the one shared containment rule either way.
 */
function resolveToolPath(p: string, workspaceId?: string) {
    const val = String(p ?? '').trim();
    if (!val || val === '.') return sharedResolveToolPath('', { workspaceId });

    if (!path.isAbsolute(val)) {
        const fromCwd = path.resolve(process.cwd(), val);
        if (fs.existsSync(fromCwd)) return sharedResolveToolPath(fromCwd, { workspaceId });
    }
    return sharedResolveToolPath(val, { workspaceId });
}

/** The resolver throws on an escape; a tool must refuse, not crash. */
type SafePath = { ok: true; path: string } | { ok: false; error: string };
function safePath(p: string, workspaceId?: string): SafePath {
    try { return { ok: true, path: resolveToolPath(p, workspaceId) }; }
    catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}

export class AnalyzeProjectTool extends BaseTool {
    name = 'analyze_project';
    description = 'Analyze the project structure and architectural components.';
    version = '1.0.0';
    tags = ['analysis', 'structure', 'architect'];
    inputSchema = { type: 'object' as const, properties: { path: { type: 'string' } }, required: [] };
    outputSchema = { type: 'object' as const, properties: { summary: { type: 'string' } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    async execute(input: any, context?: any) {
        // This used to pass `input.path` straight to the Analyst, with no
        // resolution and no containment — the only one of the three that did not
        // even go through the (broken) local resolver.
        const resolved = safePath(String(input?.path || '.'), context?.workspaceId);
        if (!resolved.ok) return { ok: false, error: resolved.error, logs: [] };
        const root = resolved.path;
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
    description = 'Deep analyze of codebase using file structure and LLM summarization.';
    version = '1.0.0';
    tags = ['analysis', 'fs', 'llm'];
    inputSchema = { type: 'object' as const, properties: { path: { type: 'string' } }, required: [] };
    outputSchema = { type: 'object' as const, properties: { summary: { type: 'string' } } };
    permissions: ToolPermission[] = ['read', 'internet']; // LLM access
    sideEffects: ToolPermission[] = [];

    async execute(input: any, context?: any) {
        const p = String(input?.path || '.').trim();
        const logs: string[] = [];

        // [ELITE FIX] Handle external URLs by suggesting browser_run
        if (/^https?:\/\//i.test(p)) {
            return {
                ok: true,
                output: {
                    summary: `This is a remote repository URL (${p}). Please use the 'browser_run' tool with the following instruction: "Visit this URL and perform a deep architectural analysis: ${p}"`,
                    isRemote: true,
                    suggestedTool: 'browser_run'
                },
                logs: [`analyze_codebase.redirect_to_browser=${p}`]
            };
        }

        const resolved = safePath(p, context?.workspaceId);
        if (!resolved.ok) return { ok: false, error: resolved.error, logs };
        const root = resolved.path;
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
        try {
            const summary = await routeToModel([
                { role: 'system', content: 'You are a Senior Software Architect. Analyze the provided codebase context and generate a high-level architectural summary. Focus on: Tech Stack, Key Components, Entry Points, and Project Structure. Be concise.' },
                { role: 'user', content: `File Structure (partial):\n${structure}\n\nKey File Contents:\n${fileContents.join('\n')}` }
            ],
            //  The provider he chose. `routeToModel` reads it from
            //  `context.modelConfig` and from nowhere else, so a call made
            //  without it routes to the free mesh whatever he picked.
            undefined, undefined, undefined, undefined, undefined, undefined, context);
            return { ok: true, output: { summary: summary || 'Analysis failed' }, logs };
        } catch (e: any) {
            logs.push(`analyze.llm_error=${e.message}`);
            return { ok: true, output: { summary: `## Structure\n${structure}\n\n## Files (LLM Failed)\n${fileContents.map(f => f.split('\n')[0]).join('\n')}` }, logs };
        }
    }
}

export class ProjectDetectTool extends BaseTool {
    name = 'project_detect';
    description = 'Detect common project roots (Node/Python/Go) under a given path. Use this for initial discovery. After identifying project roots, transition to deep analysis tools like "analyze_project" or "analyze_codebase" on specific paths.';
    version = '1.0.1';
    tags = ['analysis', 'detect', 'project'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string', description: 'Root path to scan. Defaults to workspace root.' },
            maxDepth: { type: 'number', description: 'Max directory depth to scan. Defaults to 4.' }
        },
        required: []
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            root: { type: 'string' },
            nodeProjects: { type: 'array', items: { type: 'string' } },
            pythonProjects: { type: 'array', items: { type: 'string' } },
            goProjects: { type: 'array', items: { type: 'string' } },
            hint: { type: 'string' }
        }
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 30;

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const resolved = safePath(String(input?.path || '.'), context?.workspaceId);
        if (!resolved.ok) return { ok: false, error: resolved.error, logs };
        const root = resolved.path;
        const maxDepth = Number.isFinite(input?.maxDepth) ? Math.max(1, Math.min(10, Number(input.maxDepth))) : 4;

        if (!fs.existsSync(root)) return { ok: false, error: 'Path not found', logs };

        const isIgnoredDir = (name: string) =>
            name === 'node_modules' ||
            name === 'dist' ||
            name === 'build' ||
            name === 'coverage' ||
            name === '.git' ||
            name === '.next' ||
            name === '.turbo' ||
            name === '.cache';

        const hasAny = (dir: string, files: string[]) => files.some(f => fs.existsSync(path.join(dir, f)));

        const nodeProjects = new Set<string>();
        const pythonProjects = new Set<string>();
        const goProjects = new Set<string>();

        const scan = (dir: string, depth: number) => {
            if (depth > maxDepth) return;
            let entries: Array<fs.Dirent> = [];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return;
            }

            if (hasAny(dir, ['package.json'])) nodeProjects.add(dir);
            if (hasAny(dir, ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py'])) pythonProjects.add(dir);
            if (hasAny(dir, ['go.mod'])) goProjects.add(dir);

            for (const e of entries) {
                if (!e.isDirectory()) continue;
                if (e.name.startsWith('.') || isIgnoredDir(e.name)) continue;
                scan(path.join(dir, e.name), depth + 1);
            }
        };

        scan(root, 0);

        const toSorted = (s: Set<string>) => Array.from(s).map(p => path.resolve(p)).sort((a, b) => a.localeCompare(b));

        const output = {
            root: path.resolve(root),
            nodeProjects: toSorted(nodeProjects),
            pythonProjects: toSorted(pythonProjects),
            goProjects: toSorted(goProjects),
            hint: 'Next step: Select one of the detected roots for deep analysis using "analyze_project" or "analyze_codebase".'
        };

        logs.push(`project_detect.root=${output.root}`);
        logs.push(`project_detect.count.node=${output.nodeProjects.length}`);
        logs.push(`project_detect.count.python=${output.pythonProjects.length}`);
        logs.push(`project_detect.count.go=${output.goProjects.length}`);
        return { ok: true, output, logs };
    }
}
