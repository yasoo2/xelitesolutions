import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../../..'); // xelitesolutions-1 root
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'CODE_MAP.md');

const EXCLUDED_DIRS = [
    'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.gemini'
];

const INCLUDED_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.json', '.yml', '.yaml', '.css', '.md'
];

function scanDir(dir: string, depth: number = 0): string[] {
    const results: string[] = [];
    const indent = '  '.repeat(depth);

    try {
        const files = fs.readdirSync(dir);

        // Sort: directories first, then files
        const sortedFiles = files.sort((a, b) => {
            const aPath = path.join(dir, a);
            const bPath = path.join(dir, b);
            const aIsDir = fs.statSync(aPath).isDirectory();
            const bIsDir = fs.statSync(bPath).isDirectory();
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        });

        for (const file of sortedFiles) {
            if (EXCLUDED_DIRS.includes(file)) continue;

            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                results.push(`${indent}- **/${file}**`);
                results.push(...scanDir(fullPath, depth + 1));
            } else {
                const ext = path.extname(file);
                if (INCLUDED_EXTENSIONS.includes(ext) || file === 'Dockerfile') {
                    // Try to get a one-line summary (e.g. first line comment)
                    let summary = '';
                    if (stat.size < 50000) { // Limit read size
                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            // Look for top-level class or function exports
                            const exports = content.match(/export (class|function|const|interface) ([a-zA-Z0-9_]+)/g);
                            if (exports) {
                                summary = ` (Exports: ${exports.map(e => e.split(' ')[2]).slice(0, 3).join(', ')}${exports.length > 3 ? '...' : ''})`;
                            }
                        } catch { }
                    }
                    results.push(`${indent}- [${file}]${summary}`);
                }
            }
        }
    } catch (e) {
        console.error(`Error scanning ${dir}:`, e);
    }
    return results;
}

function generateMap() {
    console.log(`Scanning codebase at: ${ROOT_DIR}`);
    const lines = [
        '# Xelite Solutions Code Map',
        `Generated on: ${new Date().toISOString()}`,
        '',
        '## Directory Structure',
        ''
    ];

    lines.push(...scanDir(ROOT_DIR));

    fs.writeFileSync(OUTPUT_FILE, lines.join('\n'));
    console.log(`✅ Code map generated at: ${OUTPUT_FILE}`);
}

generateMap();
