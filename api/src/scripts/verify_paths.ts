import fs from 'fs';
import path from 'path';

const ROOT_DIRS = [
    path.resolve(__dirname, '../../api/src'),
    path.resolve(__dirname, '../../web/src'),
    path.resolve(__dirname, '../../dashboard/src'),
    path.resolve(__dirname, '../../mission-control/src')
];

let errorCount = 0;

function checkFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Regex to match import/export paths: import ... from 'PATH'; export ... from 'PATH';
    // capturing group 2 is the path
    const regex = /(from|import)\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const importPath = match[2];

        // Skip dependencies (node_modules)
        if (!importPath.startsWith('.')) continue;

        const dir = path.dirname(filePath);
        const absolutePath = path.resolve(dir, importPath);

        // Check extensions: .ts, .tsx, .d.ts, .js, .json, or directory index
        const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.js', '/index.tsx'];
        let found = false;

        for (const ext of extensions) {
            if (fs.existsSync(absolutePath + ext)) {
                found = true;
                break;
            }
        }

        if (!found) {
            console.error(`❌ BROKEN PATH: ${path.relative(process.cwd(), filePath)} -> ${importPath}`);
            errorCount++;
        }
    }
}

function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            checkFile(fullPath);
        }
    }
}

console.log('🔍 Starting Strict Path Validation...');
ROOT_DIRS.forEach(d => scanDir(d));

if (errorCount === 0) {
    console.log('✅ All internal import paths are VALID.');
} else {
    console.log(`\n🚨 Found ${errorCount} broken paths.`);
    process.exit(1);
}
