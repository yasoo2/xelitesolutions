/**
 * WHEN THE BUILD SAYS IT IS MISSING A TOOL, GO AND GET IT.
 *
 * «واذا لم يستطع بناء اي جزء منه ان يذهب الى الانترنت وينزل اي اداة تساعده في
 * البناء ويكمل البناء حتى ينتهي بشكل كامل واحترافي».
 *
 * A build that stops at «Failed to resolve import "recharts"» is not a build
 * that failed — it is a build that is one `npm install` away from finishing,
 * and stopping there is the difference between a delivered system and a
 * folder of files. The bundler already says exactly what it needs, by name.
 * Reading that and fetching it is the whole idea.
 *
 * Deliberately narrow, because installing whatever a log mentions is how a
 * machine gets owned:
 *   - only names the BUNDLER itself reported as unresolvable
 *   - never a relative path, never a node: builtin, never an absolute path
 *   - never a name that is already a dependency (that is a different bug —
 *     a broken install — and installing it again hides it)
 *   - a bounded number per build, and one retry, so a genuinely broken
 *     project cannot loop
 */

/** How every bundler in this stack words it. */
const PATTERNS: RegExp[] = [
    /Failed to resolve import ["']([^"']+)["']/gi,          // vite
    /Cannot find module ["']([^"']+)["']/gi,                // node / ts
    /Can't resolve ["']([^"']+)["']/gi,                     // webpack
    /Cannot find package ["']([^"']+)["']/gi,               // node ESM
    /Could not resolve ["']([^"']+)["']/gi,                 // esbuild/rollup
    /Module not found:.*?["']([^"']+)["']/gi,
];

const BUILTINS = new Set([
    'fs', 'path', 'os', 'http', 'https', 'crypto', 'stream', 'util', 'url', 'zlib', 'events',
    'child_process', 'net', 'tls', 'dns', 'assert', 'buffer', 'querystring', 'readline', 'worker_threads',
    'perf_hooks', 'timers', 'string_decoder', 'v8', 'vm', 'cluster', 'module', 'process', 'console',
]);

/** «@scope/name/deep/path» → «@scope/name»; «lodash/merge» → «lodash». */
export function packageRoot(specifier: string): string {
    const s = String(specifier || '').trim();
    if (!s) return '';
    const parts = s.split('/');
    return s.startsWith('@') && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

export function isInstallable(specifier: string): boolean {
    const s = String(specifier || '').trim();
    if (!s) return false;
    if (s.startsWith('.') || s.startsWith('/') || s.startsWith('\\')) return false;   // a file of ours
    if (/^[a-zA-Z]:[\\/]/.test(s)) return false;                                      // C:\… on Windows
    if (s.startsWith('node:') || s.startsWith('data:') || s.startsWith('http')) return false;
    if (s.startsWith('virtual:') || s.startsWith('\0')) return false;                 // bundler internals
    const root = packageRoot(s);
    if (!root || BUILTINS.has(root)) return false;
    // npm's own name rules, loosely: no spaces, no uppercase-only oddities
    return /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(root);
}

/**
 * The packages this build asked for and could not find.
 *
 * `already` is the project's declared dependencies: a name in there that still
 * cannot be resolved means a damaged node_modules, not a missing package, and
 * re-installing it would paper over the real fault.
 */
export function missingPackagesFrom(buildLog: string, already: string[] = [], limit = 6): string[] {
    const text = String(buildLog || '');
    const have = new Set(already.map(String));
    const found = new Set<string>();
    for (const re of PATTERNS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            const spec = m[1];
            if (!isInstallable(spec)) continue;
            const root = packageRoot(spec);
            if (have.has(root)) continue;
            found.add(root);
            if (found.size >= limit) return [...found];
        }
    }
    return [...found];
}
