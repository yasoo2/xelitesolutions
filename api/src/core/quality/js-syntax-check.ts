/**
 * A PROJECT WITH NO LINT SCRIPT STILL HAS A PARSER.
 *
 * P001 (run500, 2026-10-25): a plain-JavaScript landing page — package.json
 * with only `start` — reached its final phase, whose plan said «Lint and
 * syntax check codebase» through quality_run. The tool looked for npm
 * scripts, found none, skipped every check and failed the whole build with
 * «No requested quality checks were available to execute». The code was
 * never read; the build died for a missing word in a manifest.
 *
 * Node itself is the toolchain of such a project, and its parser is a real
 * check: it can fail, and when it fails it names the file and the token.
 *
 * `node --check file.js` IS NOT A SYNTAX CHECK ON ITS OWN. Measured on Node
 * 24.18 while writing this: `import x from "./a.js";\nconst = 1;` in a `.js`
 * file with no `"type": "module"` exits ZERO — the script parse fails, the
 * module retry swallows the error. The same bytes as `.mjs` exit 1. So the
 * goal is forced, as terminal-audit does: each source is copied to a temp
 * file whose extension states its goal, and that copy is what is checked.
 */
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache', 'out']);
const PARSEABLE = /\.(?:js|mjs|cjs)$/iu;

export interface JsSyntaxResult {
    /** Project-relative paths that were parsed. */
    files: string[];
    /** The first file that failed and the parser's own words, or null. */
    failure: { file: string; error: string } | null;
}

export function listJavaScriptSources(projectDir: string): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!IGNORED_DIRS.has(entry.name)) walk(full);
                continue;
            }
            if (entry.isFile() && PARSEABLE.test(entry.name)) found.push(path.relative(projectDir, full).split(path.sep).join('/'));
        }
    };
    walk(projectDir);
    return found.sort();
}

function moduleGoal(file: string, text: string, packageType: string): boolean {
    if (/\.mjs$/iu.test(file)) return true;
    if (/\.cjs$/iu.test(file)) return false;
    return packageType === 'module' || /^\s*(?:import|export)[\s{*]/mu.test(text);
}

function nodeCheck(probe: string, timeoutMs: number): Promise<{ ok: boolean; out: string }> {
    return new Promise(resolve => {
        execFile(process.execPath, ['--check', probe], { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
            resolve({ ok: !error, out: `${stderr || ''}${stdout || ''}${error && !stderr ? error.message : ''}` });
        });
    });
}

export async function checkJavaScriptSyntax(projectDir: string, timeoutMs = 15_000): Promise<JsSyntaxResult> {
    const files = listJavaScriptSources(projectDir);
    if (!files.length) return { files, failure: null };
    let packageType = '';
    try { packageType = String(JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8')).type || ''); }
    catch { /* no manifest — the source decides its own goal */ }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-syntax-'));
    try {
        for (const [index, file] of files.entries()) {
            const text = fs.readFileSync(path.join(projectDir, file), 'utf-8');
            const probe = path.join(tmp, `${index}-${file.replace(/[^\w.-]/gu, '_')}.${moduleGoal(file, text, packageType) ? 'mjs' : 'cjs'}`);
            fs.writeFileSync(probe, text, 'utf-8');
            const result = await nodeCheck(probe, timeoutMs);
            if (!result.ok) {
                const said = result.out.split(/\r?\n/u).find(line => /Error/u.test(line)) || 'syntax error';
                const where = result.out.split(/\r?\n/u).find(line => line.startsWith(probe));
                const lineNo = where ? where.slice(probe.length).replace(/^:/u, '') : '';
                return { files, failure: { file: lineNo ? `${file}:${lineNo}` : file, error: said.trim().slice(0, 300) } };
            }
        }
        return { files, failure: null };
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
    }
}
