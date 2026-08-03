/**
 * STAGE 5 OF THE WORLD-CLASS ROADMAP — understanding an EXISTING project.
 *
 * Importing a repo is trivial; understanding it is the product. This is the
 * deterministic first read a senior engineer does before touching anything:
 * what stack is this, how does it run, what shape is the code, what does its
 * own README claim. No model call — the facts come from the files, so the
 * summary can never hallucinate a framework that is not in package.json.
 */
import fs from 'fs';
import path from 'path';

export interface ProjectAnalysis {
    name: string;
    stack: string[];
    scripts: Record<string, string>;
    entryPoints: string[];
    /** files by extension, e.g. { '.ts': 120 } */
    filesByExt: Record<string, number>;
    totalFiles: number;
    totalLines: number;
    topDirs: string[];
    readmeHead: string;
    hasGit: boolean;
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', 'vendor', '__pycache__', '.venv', 'venv']);
const CODE_EXT = /\.(m?[jt]sx?|py|go|rs|java|rb|php|cs|vue|svelte|css|scss|html)$/i;

function walk(dir: string, base: string, acc: { files: string[]; dirs: Set<string> }, depth = 0): void {
    if (depth > 6 || acc.files.length > 3000) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.env.example') { if (e.name === '.git') acc.dirs.add('.git'); continue; }
        if (e.isDirectory()) {
            if (SKIP.has(e.name)) continue;
            if (depth === 0) acc.dirs.add(e.name);
            walk(path.join(dir, e.name), path.join(base, e.name), acc, depth + 1);
        } else {
            acc.files.push(path.join(base, e.name).replace(/\\/g, '/'));
        }
    }
}

export function analyzeProject(dir: string): ProjectAnalysis {
    const acc = { files: [] as string[], dirs: new Set<string>() };
    walk(dir, '', acc);

    const stack: string[] = [];
    let scripts: Record<string, string> = {};
    let name = path.basename(dir);
    const entryPoints: string[] = [];

    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            name = pkg.name || name;
            scripts = pkg.scripts || {};
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            const KNOWN: Array<[string, string]> = [
                ['react', 'React'], ['next', 'Next.js'], ['vue', 'Vue'], ['svelte', 'Svelte'],
                ['vite', 'Vite'], ['express', 'Express'], ['fastify', 'Fastify'], ['nest', 'NestJS'],
                ['typescript', 'TypeScript'], ['electron', 'Electron'], ['tailwindcss', 'Tailwind'],
                ['mongoose', 'MongoDB'], ['prisma', 'Prisma'], ['jest', 'Jest'], ['playwright', 'Playwright'],
            ];
            for (const [dep, label] of KNOWN) {
                if (Object.keys(deps).some(d => d === dep || d.startsWith(`${dep}/`) || d === `@${dep}` || d.includes(`/${dep}`))) stack.push(label);
            }
            if (!stack.length) stack.push('Node.js');
            if (pkg.main) entryPoints.push(String(pkg.main));
        } catch { /* a broken package.json is itself a finding, not a crash */ }
    }
    if (fs.existsSync(path.join(dir, 'requirements.txt')) || fs.existsSync(path.join(dir, 'pyproject.toml'))) stack.push('Python');
    if (fs.existsSync(path.join(dir, 'go.mod'))) stack.push('Go');
    if (fs.existsSync(path.join(dir, 'Cargo.toml'))) stack.push('Rust');
    if (!stack.length && acc.files.some(f => f.endsWith('.html'))) stack.push('Static HTML');
    for (const cand of ['src/main.tsx', 'src/main.jsx', 'src/index.ts', 'src/index.js', 'index.html', 'app.py', 'main.py', 'main.go']) {
        if (fs.existsSync(path.join(dir, cand))) entryPoints.push(cand);
    }

    const filesByExt: Record<string, number> = {};
    let totalLines = 0;
    for (const f of acc.files) {
        const ext = path.extname(f).toLowerCase() || '(none)';
        filesByExt[ext] = (filesByExt[ext] || 0) + 1;
        if (CODE_EXT.test(f) && totalLines < 400_000) {
            try { totalLines += fs.readFileSync(path.join(dir, f), 'utf-8').split('\n').length; } catch { /* binary */ }
        }
    }

    let readmeHead = '';
    for (const r of ['README.md', 'readme.md', 'README', 'README.ar.md']) {
        const p = path.join(dir, r);
        if (fs.existsSync(p)) {
            try { readmeHead = fs.readFileSync(p, 'utf-8').split('\n').slice(0, 30).join('\n').slice(0, 2000); } catch { /* skip */ }
            break;
        }
    }

    return {
        name, stack, scripts, entryPoints,
        filesByExt, totalFiles: acc.files.length, totalLines,
        topDirs: [...acc.dirs].filter(d => d !== '.git').sort(),
        readmeHead,
        hasGit: fs.existsSync(path.join(dir, '.git')),
    };
}

/** The understanding, told in Arabic (or English) the owner can act on. */
export function formatAnalysis(a: ProjectAnalysis, isAr: boolean): string {
    const exts = Object.entries(a.filesByExt).sort((x, y) => y[1] - x[1]).slice(0, 6)
        .map(([e, n]) => `${e}×${n}`).join('، ');
    const scripts = Object.entries(a.scripts).slice(0, 6).map(([k, v]) => `   • ${k}: ${String(v).slice(0, 60)}`).join('\n');
    if (isAr) {
        return `📦 فهمت المشروع «${a.name}»:
🧱 التقنيات: ${a.stack.join('، ') || 'غير محددة'}
📂 البنية: ${a.topDirs.slice(0, 8).join('، ') || '(مجلد واحد)'} — ${a.totalFiles} ملفاً، ~${a.totalLines.toLocaleString('en')} سطر برمجي (${exts})
${a.entryPoints.length ? `🚪 نقاط الدخول: ${a.entryPoints.slice(0, 3).join('، ')}` : ''}
${scripts ? `⚙️ أوامر المشروع:\n${scripts}` : ''}
${a.readmeHead ? `📖 من README الخاص به:\n${a.readmeHead.split('\n').slice(0, 6).join('\n')}` : ''}`.replace(/\n{3,}/g, '\n\n').trim();
    }
    return `📦 Understood "${a.name}": ${a.stack.join(', ')} — ${a.totalFiles} files, ~${a.totalLines} lines (${exts}). Dirs: ${a.topDirs.slice(0, 8).join(', ')}.${scripts ? `\nScripts:\n${scripts}` : ''}`;
}
