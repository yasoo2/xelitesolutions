import fs from 'fs';
import path from 'path';
import { isMachineStateDirectory } from '../../shared/utils/project-tree';

/**
 *  ⛔ A SCRIPT RUNS A PROGRAM THE MANIFEST NEVER DECLARED.
 *
 *  P001-landing-ar (run500, run-1793027826564). The plan scaffolded
 *
 *      "scripts": { "dev": "vite", "build": "vite build" },
 *      "dependencies": { "vue": "^3.4.0" }
 *
 *  and a vite.config.js that begins `import { defineConfig } from 'vite'`.
 *  `npm install` installed what the manifest named, `vite` was still not in
 *  node_modules/.bin, and both readers stopped: the npm preflight with «npm
 *  preflight completed but local binary is still missing: vite», project_run
 *  with «I will not install or invent an undeclared package». Self-fix had no
 *  file to repair; the build ended 0/5.
 *
 *  The manifest is not the only evidence. A project file importing the
 *  package by that exact name is the project's own statement of which package
 *  it means, and the registry says whether that package ships the executable
 *  (npm_manager `providesBin`). Both are required: the program name alone is
 *  not enough — `tsc` on the registry is not TypeScript, and nobody imports it.
 */

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/iu;
const BUILD_OUTPUT_DIRECTORIES = new Set(['dist', 'build', 'out']);
const VALID_UNSCOPED_PACKAGE = /^[a-z0-9][a-z0-9._~-]*$/u;
const MAX_FILES = 400;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_DEPTH = 4;

export interface ScriptBinaryProvider {
    packageName: string;
    /** Imported only from tool configuration, so it belongs in devDependencies. */
    dev: boolean;
    /** Project-relative files that import the package. */
    importedBy: string[];
}

function importedPackageNames(source: string): Set<string> {
    const names = new Set<string>();
    const patterns = [
        /\bfrom\s*['"]([^'"\n]+)['"]/gu,
        /\bimport\s*['"]([^'"\n]+)['"]/gu,
        /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/gu,
        /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/gu,
    ];
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            const specifier = match[1].trim();
            if (!specifier || /^[./#]/u.test(specifier) || specifier.includes(':')) continue;
            names.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
        }
    }
    return names;
}

function projectSourceFiles(root: string): string[] {
    const files: string[] = [];
    const walk = (dir: string, depth: number): void => {
        if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (files.length >= MAX_FILES) return;
            if (entry.isDirectory()) {
                if (isMachineStateDirectory(entry.name) || BUILD_OUTPUT_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue;
                walk(path.join(dir, entry.name), depth + 1);
            } else if (entry.isFile() && SOURCE_FILE.test(entry.name)) {
                files.push(path.join(dir, entry.name));
            }
        }
    };
    walk(root, 0);
    return files;
}

function isToolConfigFile(relative: string): boolean {
    const base = path.basename(relative);
    return !relative.includes('/') && /^[\w.-]+\.config\.[cm]?[jt]s$/iu.test(base);
}

/**
 * The package a manifest script's missing program comes from, when a project
 * file imports a package of that exact name and the manifest does not declare
 * it. Null for anything else: a path, a scoped or invalid name, a declared
 * package (that is the install's job), or no import naming it.
 */
export function importedPackageForScriptBinary(projectRoot: string, binary: string): ScriptBinaryProvider | null {
    const name = String(binary || '').trim();
    if (!VALID_UNSCOPED_PACKAGE.test(name)) return null;
    let manifest: any;
    try { manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')); } catch { return null; }
    const declared = new Set<string>([
        ...Object.keys(manifest?.dependencies || {}),
        ...Object.keys(manifest?.devDependencies || {}),
        ...Object.keys(manifest?.optionalDependencies || {}),
        ...Object.keys(manifest?.peerDependencies || {}),
    ]);
    if (declared.has(name)) return null;

    const importedBy: string[] = [];
    for (const file of projectSourceFiles(projectRoot)) {
        let source = '';
        try {
            if (fs.statSync(file).size > MAX_FILE_BYTES) continue;
            source = fs.readFileSync(file, 'utf8');
        } catch { continue; }
        if (importedPackageNames(source).has(name)) importedBy.push(path.relative(projectRoot, file).replace(/\\/g, '/'));
    }
    if (!importedBy.length) return null;
    return { packageName: name, dev: importedBy.every(isToolConfigFile), importedBy };
}

/** The npm_manager input that installs it from the release that declares the program. */
export function scriptBinaryInstallInput(projectRoot: string, binary: string, provider: ScriptBinaryProvider) {
    return {
        command: 'install',
        packages: [provider.packageName],
        dev: provider.dev,
        cwd: projectRoot,
        projectPath: projectRoot,
        providesBin: binary,
    };
}
