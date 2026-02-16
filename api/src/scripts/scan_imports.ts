
import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../../..');
const API_SRC = path.join(ROOT_DIR, 'api/src');

function getAllFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                results = results.concat(getAllFiles(fullPath));
            }
        } else {
            if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
                results.push(fullPath);
            }
        }
    });
    return results;
}

function checkImports() {
    console.log('🔍 Starting Ghost Import Scan...');
    const files = getAllFiles(API_SRC);
    const errors: string[] = [];
    let checked = 0;

    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'api/package.json'), 'utf-8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    files.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        const importRegex = /from\s+['"](.*?)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            checked++;

            if (importPath.startsWith('.')) {
                // Local import
                const resolved = path.resolve(path.dirname(file), importPath);
                // Try extensions
                const extensions = ['.ts', '.js', '/index.ts', '/index.js', ''];
                const exists = extensions.some(ext => fs.existsSync(resolved + ext));
                if (!exists) {
                    errors.push(`❌ ${path.relative(ROOT_DIR, file)}: Import '${importPath}' not found.`);
                }
            } else {
                // Package import
                // Handle @/ or similar aliases if any (none in default node)
                // Handle subpaths like 'lodash/get'
                const pkgName = importPath.startsWith('@')
                    ? importPath.split('/').slice(0, 2).join('/')
                    : importPath.split('/')[0];

                // Allow built-ins
                const builtIns = ['fs', 'path', 'util', 'os', 'child_process', 'crypto', 'http', 'https', 'events', 'stream', 'net', 'url', 'zlib'];
                if (builtIns.includes(pkgName)) continue;

                if (!deps[pkgName]) {
                    // Check if installed manually in node_modules even if not in package.json (Ghost dependency)
                    if (!fs.existsSync(path.join(ROOT_DIR, 'api/node_modules', pkgName))) {
                        errors.push(`💀 ${path.relative(ROOT_DIR, file)}: Ghost Dependency '${pkgName}' (Not in package.json/node_modules)`);
                    }
                }
            }
        }
    });

    console.log(`✅ Checked ${checked} imports across ${files.length} files.`);
    if (errors.length > 0) {
        console.error(`🚨 Found ${errors.length} Broken Imports:`);
        errors.forEach(e => console.error(e));
        process.exit(1);
    } else {
        console.log('✨ No ghost imports found.');
    }
}

checkImports();
