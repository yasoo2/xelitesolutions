import fs from 'fs';
import path from 'path';
import { workspaceService } from '../../modules/services/WorkspaceService';

export interface WorkspaceEvidence {
    workspaceRoot: string;
    projectRoot: string;
    projectPath: string;
    files: string[];
    scripts: Record<string, string>;
}

const SKIP_DIRS = new Set([
    '.git', '.joe', 'node_modules', 'dist', 'build', 'coverage', '.next',
    '.turbo', '.cache', '__pycache__', '.venv', 'venv',
]);
const MAX_FILES = 80;

function sessionKey(context?: any): string {
    const raw = String(context?.sessionId || context?.browserSessionId || '').trim();
    return raw.replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
}

function isWithin(child: string, parent: string): boolean {
    const c = path.resolve(child);
    const p = path.resolve(parent);
    return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

function activeProjectDir(context: any, workspaceRoot: string): string | undefined {
    const g: any = global as any;
    const key = sessionKey(context);
    const entry = g.joeProjects?.[key] || g.joeProjects?.[String(context?.sessionId || '')];
    const candidate = String(entry?.dir || '').trim();
    if (!candidate) return undefined;

    try {
        const resolved = fs.realpathSync(candidate);
        if (!isWithin(resolved, workspaceRoot) || !fs.statSync(resolved).isDirectory()) return undefined;
        return resolved;
    } catch {
        return undefined;
    }
}

function collectFiles(root: string): string[] {
    const output: string[] = [];
    const visit = (dir: string, depth: number) => {
        if (output.length >= MAX_FILES || depth > 6) return;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (output.length >= MAX_FILES) return;
            if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
            const absolute = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) visit(absolute, depth + 1);
                continue;
            }
            if (!entry.isFile()) continue;
            const relative = path.relative(root, absolute).split(path.sep).join('/');
            if (relative) output.push(relative);
        }
    };
    visit(root, 0);
    return output;
}

function readScripts(root: string): Record<string, string> {
    const manifest = path.join(root, 'package.json');
    try {
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        const scripts = pkg && typeof pkg.scripts === 'object' ? pkg.scripts : {};
        return Object.fromEntries(Object.entries(scripts)
            .filter(([, value]) => typeof value === 'string' && value.trim())
            .map(([key, value]) => [key, String(value)]));
    } catch {
        return {};
    }
}

/**
 * Return bounded, workspace-relative evidence for planner-side argument filling.
 * Active imported/scaffolded projects win, but only when they are inside the
 * trusted workspace root. Empty evidence stays empty: callers must not invent
 * a project path or test type just to make a tool invocation look complete.
 */
export function discoverWorkspaceEvidence(context?: any): WorkspaceEvidence | null {
    let workspaceRoot: string;
    try {
        workspaceRoot = path.resolve(workspaceService.getActiveRoot(context?.workspaceId));
    } catch {
        return null;
    }
    if (!workspaceRoot || !fs.existsSync(workspaceRoot)) return null;

    const projectRoot = activeProjectDir(context, workspaceRoot) || workspaceRoot;
    const files = collectFiles(projectRoot);
    const relativeProject = path.relative(workspaceRoot, projectRoot).split(path.sep).join('/');

    return {
        workspaceRoot,
        projectRoot,
        projectPath: relativeProject || '.',
        files,
        scripts: readScripts(projectRoot),
    };
}

function inferTestType(text: string, evidence: WorkspaceEvidence): string | undefined {
    const lower = text.toLowerCase();
    if (/(?:syntax|صيغ|صياغ|syntax check|parse|تحقق من الملف)/i.test(text)) return 'syntax';
    if (/(?:integration|e2e|end[- ]?to[- ]?end|تكامل|شامل|تفاعلي)/i.test(text)) return 'integration';
    if (/(?:unit|test:unit|اختبار وحدات|اختبارات الوحدة|وحدات)/i.test(text)) return 'unit';
    if (/(?:build|compile|بناء|ترجمة|تجميع)/i.test(text)) return 'build';
    if (Object.keys(evidence.scripts).some(name => ['test:integration', 'test:e2e', 'integration', 'e2e', 'test:int'].includes(name))) return 'integration';
    if (Object.keys(evidence.scripts).some(name => ['test', 'test:unit', 'unit'].includes(name))) return 'unit';
    if (evidence.scripts.build) return 'build';
    return evidence.files.some(file => /\.(?:[cm]?[jt]sx?|json)$/i.test(file)) ? 'syntax' : undefined;
}

/**
 * Enrich only evidence-backed arguments after the model has produced a step.
 * This is intentionally narrow: it repairs omitted context, not bad intent.
 */
export function enrichWorkspaceToolInput(toolName: string, input: Record<string, any>, goal: string, context?: any): Record<string, any> {
    if (toolName !== 'code_reviewer' && toolName !== 'auto_tester') return input;
    const evidence = discoverWorkspaceEvidence(context);
    if (!evidence) return input;

    const next = { ...(input || {}) };
    if (!String(next.projectPath || '').trim()) next.projectPath = evidence.projectPath;

    if (toolName === 'code_reviewer') {
        if (!Array.isArray(next.files) || next.files.length === 0) {
            const sourceFiles = evidence.files.filter(file => /\.(?:[cm]?[jt]sx?|py|go|rs|java|rb|php|json)$/i.test(file));
            if (sourceFiles.length) next.files = sourceFiles.slice(0, 20);
        }
        return next;
    }

    if (!String(next.testType || '').trim()) {
        const inferred = inferTestType(`${goal}\n${String(input?.request || '')}`, evidence);
        if (inferred) next.testType = inferred;
    }
    if (String(next.testType || '').trim() === 'syntax' && (!Array.isArray(next.files) || next.files.length === 0)) {
        const syntaxFiles = evidence.files.filter(file => /\.(?:[cm]?[jt]sx?|json)$/i.test(file));
        if (syntaxFiles.length) next.files = syntaxFiles.slice(0, 20);
    }
    return next;
}
