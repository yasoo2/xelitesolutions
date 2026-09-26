/**
 * REPO CONTEXT PACK — the filesystem evidence the generator prompt assumes.
 *
 * The artifact prompt already orders the model to "inspect the verified
 * project context and existing filesystem layout supplied to this task" — but
 * nothing supplied the layout, so the model guessed import paths from
 * convention and invented folders that do not exist. This module builds a
 * small, bounded, read-only snapshot instead:
 *   - a two-level directory tree (capped entries, boring folders skipped),
 *   - sibling files of the generation target (head-capped source excerpts),
 *   - the root manifest excerpt (package name, module type, dependency keys).
 *
 * Safety: everything resolves inside the workspace root; symlinks escaping it
 * are skipped; secret-looking files (.env*, *.pem, *.key, *secret*,
 * *credential*) and binary files are never read. The whole builder never
 * throws — worst case is an empty pack and generation proceeds as before.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface ContextPackOptions {
    /** Total character budget for the pack. Default 6000. */
    maxChars?: number;
    /** Maximum sibling files to excerpt. Default 8. */
    maxFiles?: number;
    /** Tree depth below the root. Default 2. */
    maxDepth?: number;
    /** Tree entry cap. Default 60. */
    maxEntries?: number;
    /** Per-file excerpt cap. Default 800. */
    maxFileChars?: number;
}

export interface ContextPack {
    text: string;
    files: string[];
    truncated: boolean;
}

const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out',
    'vendor', '__pycache__', '.venv', 'venv', 'target', '.idea', '.vscode', 'tmp',
]);

const SECRET_NAME = /(\.env(\..*)?$|\.pem$|\.key$|secret|credential|private_key)/i;

const BINARY_EXT = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.woff', '.woff2',
    '.ttf', '.eot', '.otf', '.mp3', '.mp4', '.wav', '.ogg', '.pdf', '.zip',
    '.tar', '.gz', '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.sqlite', '.db',
]);

const MANIFEST_FILES = ['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'composer.json'];

function isWithin(root: string, candidate: string): boolean {
    const rel = path.relative(root, candidate);
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function safeRealpath(filePath: string): string | null {
    try {
        return fs.realpathSync(filePath);
    } catch {
        return null;
    }
}

function readExcerpt(absPath: string, maxChars: number): string | null {
    try {
        const stat = fs.statSync(absPath);
        if (!stat.isFile() || stat.size <= 0 || stat.size > 1024 * 1024) return null;
        const buffer = Buffer.alloc(Math.min(stat.size, maxChars + 64));
        const fd = fs.openSync(absPath, 'r');
        try {
            fs.readSync(fd, buffer, 0, buffer.length, 0);
        } finally {
            fs.closeSync(fd);
        }
        if (buffer.includes(0)) return null; // binary sniff
        return buffer.toString('utf-8').slice(0, maxChars);
    } catch {
        return null;
    }
}

function excerptable(relPath: string): boolean {
    const base = path.basename(relPath);
    if (SECRET_NAME.test(base)) return false;
    return !BINARY_EXT.has(path.extname(base).toLowerCase());
}

function buildTree(root: string, maxDepth: number, maxEntries: number): { lines: string[]; truncated: boolean } {
    const lines: string[] = [];
    let truncated = false;
    let count = 0;
    const walk = (dir: string, prefix: string, depth: number): void => {
        if (depth > maxDepth) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        const names = entries
            .map(entry => entry.name)
            .filter(name => name !== '.' && name !== '..')
            .sort((a, b) => a.localeCompare(b));
        for (const name of names) {
            if (count >= maxEntries) {
                truncated = true;
                return;
            }
            const abs = path.join(dir, name);
            let isDir = false;
            try {
                const stat = fs.lstatSync(abs);
                if (stat.isSymbolicLink()) {
                    const real = safeRealpath(abs);
                    if (!real || !isWithin(root, real)) continue;
                    isDir = fs.statSync(real).isDirectory();
                } else {
                    isDir = stat.isDirectory();
                }
            } catch {
                continue;
            }
            if (depth === 1 && isDir && SKIP_DIRS.has(name)) continue;
            count++;
            lines.push(`${prefix}${name}${isDir ? '/' : ''}`);
            if (isDir) walk(abs, `${prefix}${name}/`, depth + 1);
            if (truncated) return;
        }
    };
    walk(root, '', 1);
    return { lines, truncated };
}

function manifestExcerpt(root: string): string | null {
    for (const name of MANIFEST_FILES) {
        const abs = path.join(root, name);
        if (!isWithin(root, abs)) continue;
        const text = readExcerpt(abs, 600);
        if (text === null) continue;
        if (name === 'package.json') {
            try {
                const parsed = JSON.parse(fs.readFileSync(abs, 'utf-8'));
                const keys = (obj: any): string => obj && typeof obj === 'object' ? Object.keys(obj).join(', ') : '';
                return [
                    `package ${parsed.name || '(unnamed)'}${parsed.type ? ` [type: ${parsed.type}]` : ''}`,
                    `dependencies: ${keys(parsed.dependencies) || '(none)'}`,
                    `devDependencies: ${keys(parsed.devDependencies) || '(none)'}`,
                ].join('\n');
            } catch {
                return text;
            }
        }
        return `${name}:\n${text}`;
    }
    return null;
}

/**
 * Build the bounded repo snapshot for generating targetRelPath inside rootDir.
 * Never throws: any failure yields an empty pack.
 */
export function buildContextPack(rootDir: string, targetRelPath: string, opts: ContextPackOptions = {}): ContextPack {
    const empty: ContextPack = { text: '', files: [], truncated: false };
    try {
        const maxChars = Math.max(500, Math.min(20000, Math.floor(opts.maxChars ?? 6000)));
        const maxFiles = Math.max(1, Math.min(20, Math.floor(opts.maxFiles ?? 8)));
        const maxDepth = Math.max(1, Math.min(4, Math.floor(opts.maxDepth ?? 2)));
        const maxEntries = Math.max(10, Math.min(200, Math.floor(opts.maxEntries ?? 60)));
        const maxFileChars = Math.max(200, Math.min(4000, Math.floor(opts.maxFileChars ?? 800)));

        const root = path.resolve(rootDir);
        if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return empty;

        const sections: string[] = [];
        let truncated = false;
        const files: string[] = [];

        const tree = buildTree(root, maxDepth, maxEntries);
        truncated = truncated || tree.truncated;
        if (tree.lines.length) {
            sections.push(`Directory layout (2 levels, ${tree.lines.length} entries):\n${tree.lines.join('\n')}`);
        }

        const manifest = manifestExcerpt(root);
        if (manifest) sections.push(`Project manifest:\n${manifest}`);

        // Sibling excerpts: same directory as the target, deterministic order.
        const targetDir = path.dirname(path.resolve(root, targetRelPath));
        if (isWithin(root, targetDir) || targetDir === root) {
            let names: string[] = [];
            try {
                names = fs.readdirSync(targetDir).filter(name => name !== '.' && name !== '..').sort((a, b) => a.localeCompare(b));
            } catch {
                names = [];
            }
            for (const name of names) {
                if (files.length >= maxFiles) {
                    truncated = true;
                    break;
                }
                const rel = path.relative(root, path.join(targetDir, name)).split(path.sep).join('/');
                if (rel === targetRelPath.split(path.sep).join('/')) continue;
                if (!excerptable(rel)) continue;
                const abs = path.join(targetDir, name);
                if (!isWithin(root, abs)) continue;
                const excerpt = readExcerpt(abs, maxFileChars);
                if (excerpt === null) continue;
                files.push(rel);
                sections.push(`--- ${rel} (excerpt) ---\n${excerpt}`);
            }
        }

        let text = sections.join('\n\n');
        if (text.length > maxChars) {
            truncated = true;
            text = text.slice(0, maxChars);
        }
        if (!text.trim()) return empty;
        return { text, files, truncated };
    } catch {
        return empty;
    }
}
