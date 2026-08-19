import { ToolDefinition, ToolPermission } from '../types';
import { ExecutionGateway } from '../../../kernel/ExecutionGateway';
import { NpmManagerTool } from './SystemTools';
import { workspaceService } from '../../services/WorkspaceService';
import { isPortOpen } from '../../../shared/utils/network';
import { isArabicReply, say as pick } from '../../../shared/reply-language';
import * as fs from 'fs';
import * as path from 'path';
import { builtinModules } from 'module';
import { persistJoeProjects } from '../../../api/page-store';

/**
 * project_run / project_stop — actually RUN a built system, not just render a
 * static page.
 *
 * A web PAGE previews by loading an HTML file. A SYSTEM (a Node/Express backend,
 * a React/Vite app, a full-stack project) is a PROGRAM: it must be started, kept
 * alive on a port, and only then can the user open it, click its buttons, and
 * see its database respond. The project pipeline built and tested systems but
 * never ran them — so a finished system sat inert on disk. This closes that gap.
 *
 * Windows-first: a free port is found by probing, the process is started through
 * the sanctioned ExecutionGateway (never child_process), and project_stop kills
 * the whole tree with taskkill on Windows / the process group on POSIX.
 */

// Live processes, keyed by the workspace (or session) so one project owns one
// server: starting again stops the previous one instead of leaking ports.
interface RunningServer { pid: number; port: number; cwd: string; command: string; startedAt: number; }
const RUNNING: Map<string, RunningServer> = new Map();

// Ports frameworks commonly bind to when they ignore our PORT hint. Probed
// after the chosen port so we DISCOVER the real one instead of guessing.
const COMMON_DEV_PORTS = [5173, 5174, 3000, 3001, 4173, 8080, 8000];

/**
 * Local servers are allowed to bind either loopback family. Node's
 * `server.listen(port, 'localhost')` commonly resolves to ::1 on Linux, while
 * the previous probe only checked 127.0.0.1 and therefore called a healthy
 * server dead. Probe both families in parallel; this is still local evidence
 * and never broadens discovery to a public or LAN address.
 */
export async function isLoopbackPortOpen(port: number, timeoutMs = 1000): Promise<boolean> {
    const [ipv4, ipv6] = await Promise.all([
        isPortOpen('127.0.0.1', port, timeoutMs),
        isPortOpen('::1', port, timeoutMs),
    ]);
    return ipv4 || ipv6;
}

/**
 * A common port that was already occupied before launch belongs to somebody
 * else until proven otherwise. Keep it out of post-launch discovery; otherwise
 * a failed `npm start` could accidentally report an old localhost server as the
 * newly started project. The preferred free port is always retained because it
 * is the only port we intentionally selected for this launch.
 */
export function buildProbeList(preferredPort: number, forced: boolean, preExistingPorts: readonly number[] = []): number[] {
    if (forced) return [preferredPort];
    const occupied = new Set(preExistingPorts);
    return [preferredPort, ...COMMON_DEV_PORTS.filter(p => p !== preferredPort && !occupied.has(p))];
}

async function findFreePort(start = 4300): Promise<number> {
    for (let p = start; p < start + 200; p++) {
        if (!(await isLoopbackPortOpen(p, 250))) return p;
    }
    return start;
}

/**
 * An open TCP port is not a running project.
 *
 * The recorded address survives a Joe restart, which is what makes adoption
 * worth having — but so does the possibility that something else took that
 * port meanwhile. A port that accepts a connection proves only that SOMEONE
 * is listening; an HTTP answer proves it is a web server, and that is the
 * least we should know before calling it «your system».
 */
async function answersHttp(url: string, timeoutMs = 2500): Promise<boolean> {
    try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), timeoutMs);
        const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
        clearTimeout(t);
        return res.status < 500;
    } catch {
        return false;
    }
}

function sameExistingPath(a: string, b: string): boolean {
    if (!a || !b || !fs.existsSync(a) || !fs.existsSync(b)) return false;
    try {
        return fs.realpathSync(a) === fs.realpathSync(b);
    } catch {
        return path.resolve(a) === path.resolve(b);
    }
}

/**
 * A persisted live URL is adoptable only when it still belongs to a live
 * process whose working directory is the project we just resolved. A port and
 * an HTTP 200 are deliberately insufficient: an orphan from an older run can
 * answer both while serving a deleted workspace copy.
 */
export function canAdoptRecordedLive(record: any, expectedCwd: string): boolean {
    const pid = Number(record?.pid);
    const recordedCwd = String(record?.cwd || '').trim();
    if (!Number.isInteger(pid) || pid <= 0 || !sameExistingPath(recordedCwd, expectedCwd)) return false;
    try {
        process.kill(pid, 0);
    } catch {
        return false;
    }
    if (process.platform !== 'win32') {
        const procCwd = `/proc/${pid}/cwd`;
        try {
            if (!fs.existsSync(procCwd) || !sameExistingPath(fs.realpathSync(procCwd), expectedCwd)) return false;
        } catch {
            return false;
        }
    }
    return true;
}

function runKey(context?: any): string {
    return String(context?.workspaceId || context?.sessionId || 'default');
}

/** Keep the verified server address attached to the session's active project. */
function rememberLiveProject(context: any, cwd: string, live: { url: string; port: number; pid: number }): void {
    const sessionId = String(context?.sessionId || '').trim();
    if (!sessionId || !cwd || !live.url || !live.port) return;
    const sessionKey = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
    const previous = projects[sessionKey] || {};
    projects[sessionKey] = {
        ...previous,
        ...(previous.dir ? {} : { dir: cwd, type: 'runtime' }),
        live: { url: live.url, port: live.port, pid: live.pid, cwd, at: Date.now() },
        updatedAt: Date.now(),
    };
    persistJoeProjects();
}

/**
 * THE PORT WE ANNOUNCE MUST BE THE PORT IT BINDS.
 *
 * What he saw on his screen, after Joe said «على المنفذ 4300»:
 *
 *     > dar-al-rifq@0.1.0 dev
 *     > vite
 *     Port 5173 is in use, trying another one...
 *     ➜  Local:   http://localhost:5174/
 *
 * Three separate lies in five lines. Vite does not read `PORT` — it reads
 * `--port` — so the environment variable we set was ignored and it went to
 * its own default. That default was already taken by a PREVIOUS run of the
 * same project that nobody stopped, so it drifted again, silently. And the
 * URL Joe handed him, `http://localhost:4300/`, pointed at nothing at all:
 * that is the `ERR_CONNECTION_REFUSED` he reported.
 *
 * A hint that a framework is free to ignore is not a decision. Each dev
 * server is now told its port in the flag IT reads, and Vite is additionally
 * told `--strictPort`: bind this port or fail loudly. Drifting to a port
 * nobody was told about is worse than not starting.
 */
function devServerPortFlags(cwd: string, port: number): string {
    const has = (f: string) => fs.existsSync(path.join(cwd, f));
    let deps: Record<string, string> = {};
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
        deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    } catch { /* malformed package.json — fall through to the file probe */ }

    if (deps.vite || has('vite.config.js') || has('vite.config.ts')) {
        return ` -- --port ${port} --strictPort --host localhost`;
    }
    if (deps.next || has('next.config.js') || has('next.config.mjs')) {
        return ` -- --port ${port} --hostname localhost`;
    }
    // Create React App, Parcel, Angular and plain `node` servers all read PORT
    // from the environment, which is already set.
    return '';
}

function isFrontendStartScript(script: string): boolean {
    return /(?:react-scripts\s+start|\bvite(?:\s|$)|\bnext\s+(?:dev|start)(?:\s|$)|\bparcel(?:\s|$))/iu.test(String(script || '').trim());
}

/**
 * A generated full-stack project can accidentally inherit a frontend lifecycle
 * script while also writing one backend entrypoint. Prefer that backend only
 * when the evidence is unambiguous: exactly one reachable server entrypoint,
 * and it is under a conventional backend directory. A frontend-only project is
 * left on its declared start script, and ambiguous layouts are never guessed.
 */
function backendEntrypointForFrontendScript(cwd: string, script: string): string | null {
    if (!isFrontendStartScript(script)) return null;
    const candidates = serverEntrypointCandidates(cwd);
    if (candidates.length !== 1) return null;
    const candidate = candidates[0].replace(/\\/g, '/');
    const parts = candidate.split('/');
    const conventionalDirectory = new Set(['server', 'api', 'backend', 'service', 'services']);
    const hasBackendDirectory = parts.length > 1 && conventionalDirectory.has(parts[0].toLowerCase());
    const conventionalEntry = /(?:^|\/)(?:server|app|main|index)\.(?:js|mjs|cjs|ts|tsx)$/iu.test(candidate);
    return hasBackendDirectory || conventionalEntry ? candidate : null;
}

/**
 * How THIS project starts, from its files — not a guess.
 *
 * `forced` says whether the port is a COMMAND, not a hope: a flag the
 * framework must obey, or a static server we point ourselves. It decides
 * whether readiness may go looking on other ports (see below).
 */
export function detectStart(cwd: string, port: number): { command: string; kind: string; expectPort: number; forced: boolean } {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
        let manifest: Record<string, any> = {};
        let scripts: Record<string, string> = {};
        try {
            manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) || {};
            scripts = manifest.scripts || {};
        } catch { /* malformed */ }

        // Expo's generic `start` command launches the native/dev dashboard;
        // Browser QA needs the declared web target. Pass the port through the
        // script contract so readiness can only accept the web server we chose.
        const expoWebScript = String(scripts.web || '').trim();
        const dependencies = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
        if (dependencies.expo && /\b(?:npx\s+)?expo\s+start\b/iu.test(expoWebScript) && /--web\b/iu.test(expoWebScript)) {
            return { command: `npm run web -- --port ${port}`, kind: 'expo-web', expectPort: port, forced: true };
        }

        // A generic start script is normally the packaged contract. If it is
        // visibly a frontend-only command but the project also contains exactly
        // one proven backend entrypoint, use that observed server instead of
        // launching a missing/irrelevant frontend dependency and hiding stderr.
        const backendEntrypoint = backendEntrypointForFrontendScript(cwd, String(scripts.start || ''));
        if (backendEntrypoint) {
            return { command: `node ${backendEntrypoint}`, kind: 'node-entry', expectPort: port, forced: false };
        }
        if (scripts.start) return { command: 'npm start', kind: 'npm-start', expectPort: port, forced: false };
        // A frontend dev server (Vite/Next/CRA) — told its port in the flag it
        // actually reads, so the announcement below is true.
        if (scripts.dev) {
            const flags = devServerPortFlags(cwd, port);
            return { command: `npm run dev${flags}`, kind: 'dev-server', expectPort: port, forced: !!flags };
        }
    }
    // A bare Node server entry that listens.
    for (const entry of [
        'server.js', 'app.js', 'index.js', 'main.js',
        'server/server.js', 'server/index.js', 'server/app.js',
        'src/server.js', 'src/index.js',
    ]) {
        const f = path.join(cwd, entry);
        if (fs.existsSync(f)) {
            try {
                if (/\.listen\s*\(/.test(fs.readFileSync(f, 'utf-8'))) {
                    return { command: `node ${entry}`, kind: 'node-entry', expectPort: port, forced: false };
                }
            } catch { /* unreadable */ }
        }
    }
    // A TypeScript service may be intentionally file-level and have no package
    // manifest yet. Accept it only when the project proves both a TS config and
    // a conventional entrypoint; `tsx` is the portable local launcher and the
    // normal readiness probe still decides whether the entrypoint is an HTTP app.
    if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
        for (const entry of ['src/index.ts', 'src/main.ts', 'src/server.ts', 'src/app.ts', 'index.ts', 'main.ts', 'server.ts', 'app.ts']) {
            if (fs.existsSync(path.join(cwd, entry))) {
                return { command: `npx -y tsx ${entry}`, kind: 'tsx-entry', expectPort: port, forced: false };
            }
        }
    }
    // A static site — serve the folder deterministically on our port.
    if (fs.existsSync(path.join(cwd, 'index.html'))) {
        return { command: `npx -y serve -l ${port} -s . --no-clipboard`, kind: 'static', expectPort: port, forced: true };
    }
    // Last resort: try npm start and let readiness probing sort it out.
    return { command: 'npm start', kind: 'unknown', expectPort: port, forced: false };
}

/**
 * Resolve a runnable project below a workspace root without guessing.  A
 * workspace is a container, not itself necessarily a Node/static project.
 * The user may name a project in the request (normally quoted by the UI), so
 * we prefer that exact human label; an unqualified request is accepted only
 * when there is exactly one runnable child.
 */
type RunnableProjectResolution =
    | { cwd: string; candidates: string[]; matched: boolean }
    | { cwd: null; candidates: string[]; matched: false };

const PROJECT_MARKERS = [
    'package.json', 'index.html', 'server.js', 'app.py', 'main.py', 'index.js',
    'server/server.js', 'server/index.js', 'server/app.js',
    'src/index.js', 'src/main.js', 'src/server.js', 'src/app.js',
    'src/index.mjs', 'src/main.mjs', 'src/server.mjs', 'src/app.mjs',
    'src/index.cjs', 'src/main.cjs', 'src/server.cjs', 'src/app.cjs',
];
const TYPESCRIPT_ENTRYPOINTS = [
    'src/index.ts', 'src/main.ts', 'src/server.ts', 'src/app.ts',
    'src/index.tsx', 'src/main.tsx', 'src/server.tsx', 'src/app.tsx',
    'index.ts', 'main.ts', 'server.ts', 'app.ts',
];
const IGNORED_PROJECT_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);

function hasProjectMarker(dir: string): boolean {
    if (PROJECT_MARKERS.some(marker => fs.existsSync(path.join(dir, marker)))) return true;
    return fs.existsSync(path.join(dir, 'tsconfig.json'))
        && TYPESCRIPT_ENTRYPOINTS.some(entry => fs.existsSync(path.join(dir, entry)));
}

/**
 * An active directory is authoritative only when it is runnable, or when the
 * caller did not name a project and therefore explicitly asked for the active
 * session project. A named request must be resolved against the workspace when
 * the active directory is still an incomplete scaffold.
 */
export function shouldUseActiveProjectDirectly(activeProjectDir: string, projectQuery?: unknown): boolean {
    const named = requestedProjectLabel(projectQuery);
    return !!activeProjectDir && (hasProjectMarker(activeProjectDir) || !named);
}

function normalizeProjectLabel(value: unknown): string {
    return String(value || '')
        .trim()
        .replace(/^(?:react|vite|next|node|app|project)[-_\s]*/iu, '')
        .replace(/[-_][a-f0-9]{4,}$/iu, '')
        .replace(/[-_]+/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
        .toLocaleLowerCase();
}

function projectLabel(dir: string): string {
    return normalizeProjectLabel(path.basename(dir));
}

function projectPackageLabel(dir: string): string {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
        return normalizeProjectLabel(pkg?.name || '');
    } catch {
        return '';
    }
}

function projectLabels(dir: string): string[] {
    return Array.from(new Set([projectLabel(dir), projectPackageLabel(dir)].filter(Boolean)));
}

function requestedProjectLabel(query: unknown): string {
    const text = String(query || '').trim();
    const quoted = text.match(/[«“"]\s*([^»”"]+?)\s*[»”"]/u)?.[1];
    // The chat composer normally sends a natural sentence rather than a quoted
    // path. Accept an explicit name after Arabic/English naming phrases, but do
    // not infer a label from a generic run request.
    const named = text.match(/(?:\b(?:named|called)\b|باسم|اسمه|اسمها|يسمى|تسمى)\s*(?:المشروع\s*)?([A-Za-z0-9_\-\u0600-\u06FF]+)/iu)?.[1];
    return normalizeProjectLabel(quoted || named || '');
}

/** Exported for direct regression tests; this function never starts a process. */
export function resolveRunnableProject(workspaceRoot: string, projectQuery?: unknown): RunnableProjectResolution {
    if (!workspaceRoot || !fs.existsSync(workspaceRoot)) return { cwd: null, candidates: [], matched: false };

    // A workspace may itself be runnable (for example Joe's own repository),
    // but an explicit project name is stronger evidence than that root marker.
    // Resolve the named child first; otherwise a request for a newly scaffolded
    // project silently started the agent repository that contains it.
    const requested = requestedProjectLabel(projectQuery);
    const rootIsRunnable = hasProjectMarker(workspaceRoot);
    if (!requested && rootIsRunnable) return { cwd: workspaceRoot, candidates: [workspaceRoot], matched: true };

    const candidates: string[] = [];
    if (rootIsRunnable) candidates.push(workspaceRoot);
    try {
        for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith('.') || IGNORED_PROJECT_DIRS.has(entry.name)) continue;
            const candidate = path.join(workspaceRoot, entry.name);
            if (hasProjectMarker(candidate)) candidates.push(candidate);
        }
    } catch {
        return { cwd: null, candidates: [], matched: false };
    }

    candidates.sort((a, b) => a.localeCompare(b));
    if (!requested) {
        if (candidates.length === 1) return { cwd: candidates[0], candidates, matched: true };
        return { cwd: null, candidates, matched: false };
    }

    /**
     * A SCAFFOLD FOLDER IS OFTEN THE NAME, CUT SHORT.
     *
     * The generator bounds a directory name, so «Joe System Validation and Nexus
     * Development» lands on disk as `Joe-System-Validation-and-Nexus-Developm`.
     * Matching only forwards (`label.includes(requested)`) cannot see that, and
     * the pipeline could not start the very project it had just built.
     *
     * The reverse direction used to be the unbounded `requested.includes(label)`,
     * which is genuinely unsafe: a folder called `api` matches any sentence
     * containing the word. Truncation produces a PREFIX, so that is what is
     * accepted — and only when the label is long enough to identify something.
     */
    const TRUNCATION_FLOOR = 8;
    const matches = candidates.filter(candidate => projectLabels(candidate).some(label =>
        label === requested
        || label.includes(requested)
        || (label.length >= TRUNCATION_FLOOR && requested.startsWith(label))));
    if (!matches.length) return { cwd: null, candidates, matched: false };

    // A generated retry folder ends in a short hexadecimal suffix.  Prefer the
    // stable project directory when both it and a retry copy match the name.
    matches.sort((a, b) => {
        const aGenerated = /[-_][a-f0-9]{4,}$/iu.test(path.basename(a)) ? 1 : 0;
        const bGenerated = /[-_][a-f0-9]{4,}$/iu.test(path.basename(b)) ? 1 : 0;
        return aGenerated - bGenerated || a.localeCompare(b);
    });
    return { cwd: matches[0], candidates, matched: true };
}

function runtimeTargetFromScript(script: string): string {
    const match = String(script || '').match(/\b(?:node|tsx|ts-node)\s+(?:(?:--[^\s]+)\s+)*["']?([^\s"';&|]+)["']?/u);
    return String(match?.[1] || '').trim();
}

function hasServerStartEvidence(source: string): boolean {
    return /\.listen\s*\(|\bcreateServer\s*\(|\b(?:express|fastify|koa)\s*\(/u.test(source);
}

/**
 * Generated projects sometimes inherit npm's placeholder lifecycle commands:
 * `echo "Error: no test specified" && exit 1` or
 * `echo "Build script not specified" && exit 1`. They look like declared
 * engineering checks, but they are deliberate failures and cannot be accepted
 * as evidence. Do not require every project to have tests/build scripts; reject
 * only explicit placeholders that advertise a check while guaranteeing failure.
 */
export function placeholderLifecycleScriptError(cwd: string): string | null {
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg?.scripts || {};
        for (const name of ['test', 'build']) {
            const script = String(scripts?.[name] || '').trim();
            if (!script) continue;
            const isPlaceholder = /(?:no\s+test\s+specified|test\s+script\s+(?:not|wasn['’]t)\s+specified|build\s+script\s+(?:not|wasn['’]t)\s+specified|script\s+not\s+specified)/iu.test(script)
                && /\bexit\s+1\b/iu.test(script);
            if (isPlaceholder) return `launchability: scripts.${name} is a failing placeholder, not a real check`;
        }
    } catch {
        return 'launchability: package.json is missing or malformed';
    }
    return null;
}

/**
 * A manifest is not a runnable contract by itself. Before spending the full
 * readiness window, verify that npm's selected runtime target exists and is a
 * JavaScript/TypeScript server with observable listen evidence. This stays
 * generic: it does not prescribe a framework or a project template.
 */
export function launchabilityError(cwd: string, detected: { command: string; kind: string }): string | null {
    if (detected.kind === 'static' || detected.kind === 'override') return null;

    const placeholderError = placeholderLifecycleScriptError(cwd);
    if (placeholderError) return placeholderError;

    let target = '';
    if (detected.kind === 'npm-start' || detected.kind === 'dev-server') {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
            const scripts = pkg?.scripts || {};
            const script = detected.kind === 'npm-start' ? scripts.start : scripts.dev;
            target = runtimeTargetFromScript(String(script || ''));
        } catch {
            return 'launchability: package.json is missing or malformed';
        }
    } else if (detected.kind === 'node-entry' || detected.kind === 'tsx-entry') {
        target = String(detected.command).replace(/^(?:node|npx -y tsx)\s+/u, '').trim();
    }

    if (!target) return null;
    const safeTarget = target.replace(/^\.\//u, '');
    const targetPath = path.resolve(cwd, safeTarget);
    const relativeTarget = path.relative(cwd, targetPath);
    if (!relativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        return `launchability: runtime target escapes project root (${target})`;
    }
    if (!fs.existsSync(targetPath)) {
        return `launchability: runtime target is missing (${target})`;
    }
    if (!/\.(?:js|mjs|cjs|ts|tsx)$/iu.test(targetPath)) {
        return `launchability: runtime target is not JavaScript/TypeScript (${target})`;
    }
    try {
        const source = fs.readFileSync(targetPath, 'utf-8');
        if (!hasServerStartEvidence(source)) {
            return `launchability: runtime target has no observable server listen (${target})`;
        }
    } catch {
        return `launchability: runtime target cannot be read (${target})`;
    }
    const missingLocal = missingLocalRuntimeImports(cwd, detected);
    if (missingLocal.length) {
        return `launchability: local runtime imports missing (${missingLocal.join('; ')})`;
    }
    return null;
}

function serverEntrypointScore(value: string): number {
    const normalized = value.toLowerCase();
    if (/^src\/index\.(?:js|mjs|cjs|ts|tsx)$/u.test(normalized)) return 0;
    if (/^server\/(?:server|index|app)\.(?:js|mjs|cjs|ts|tsx)$/u.test(normalized)) return 1;
    if (/^src\/(?:server|app)\.(?:js|mjs|cjs|ts|tsx)$/u.test(normalized)) return 2;
    if (/^(?:index|server|app)\.(?:js|mjs|cjs|ts|tsx)$/u.test(normalized)) return 3;
    return 4;
}

function serverEntrypointCandidates(cwd: string): string[] {
    const candidates: string[] = [];
    const ignored = new Set(['.git', 'node_modules', 'coverage', 'dist', 'build', 'public', 'docs', 'test', 'tests', 'data']);
    const extensions = /\.(?:js|mjs|cjs|ts|tsx)$/iu;
    const walk = (directory: string, depth: number): void => {
        if (depth > 3) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(absolute, depth + 1);
                continue;
            }
            if (!entry.isFile() || !extensions.test(entry.name)) continue;
            try {
                const source = fs.readFileSync(absolute, 'utf-8');
                if (hasServerStartEvidence(source)) {
                    candidates.push(path.relative(cwd, absolute).replace(/\\/g, '/'));
                }
            } catch { /* unreadable files are not evidence */ }
        }
    };
    walk(cwd, 0);
    return candidates.sort((a, b) => serverEntrypointScore(a) - serverEntrypointScore(b) || a.localeCompare(b));
}

/**
 * Repair only a proven manifest-to-entrypoint mismatch. This is deliberately
 * narrower than asking an LLM to rewrite a project: it changes package.json
 * only when the declared node target is missing and exactly one best server
 * entrypoint already exists on disk. The implementation remains the user's
 * existing artifact; Joe merely reconciles the manifest with observed evidence.
 */
export function reconcileMissingRuntimeTarget(cwd: string, failureText: string): { repaired: boolean; message: string } {
    if (!/runtime target is missing/iu.test(String(failureText || ''))) {
        return { repaired: false, message: 'not an evidenced missing-runtime-target failure' };
    }
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) return { repaired: false, message: 'package.json is missing' };
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg?.scripts || {};
        const start = String(scripts.start || '').trim();
        const targetMatch = start.match(/\bnode\s+(?:(?:--[^\s]+)\s+)*["']?([^\s"';&|]+)["']?/u);
        const declaredTarget = String(targetMatch?.[1] || '').replace(/^\.\//u, '').trim();
        if (!declaredTarget) return { repaired: false, message: 'start script has no direct node target to reconcile' };
        if (fs.existsSync(path.resolve(cwd, declaredTarget))) {
            return { repaired: false, message: `declared target already exists (${declaredTarget})` };
        }
        const candidates = serverEntrypointCandidates(cwd);
        if (!candidates.length) return { repaired: false, message: 'no existing server entrypoint evidence found' };
        const best = candidates[0];
        const bestScore = serverEntrypointScore(best);
        const equallyRanked = candidates.filter(candidate => serverEntrypointScore(candidate) === bestScore);
        if (equallyRanked.length > 1) {
            return { repaired: false, message: `multiple equally ranked server entrypoints: ${equallyRanked.slice(0, 4).join(', ')}` };
        }
        const relativeTarget = best.replace(/^\.\//u, '');
        const nextStart = start.replace(targetMatch![1], relativeTarget);
        const nextPkg = { ...pkg, main: pkg.main === declaredTarget || !pkg.main ? relativeTarget : pkg.main, scripts: { ...scripts, start: nextStart } };
        fs.writeFileSync(pkgPath, `${JSON.stringify(nextPkg, null, 2)}\n`, 'utf-8');
        return { repaired: true, message: `reconciled package.json start/main from ${declaredTarget} to ${relativeTarget}` };
    } catch (error: any) {
        return { repaired: false, message: `manifest reconciliation failed: ${String(error?.message || error).slice(0, 240)}` };
    }
}

function normalizedRuntimeStem(value: string): string {
    const stem = path.basename(String(value || '').replace(/\.(?:js|mjs|cjs|ts|tsx|jsx)$/iu, ''))
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '');
    return stem.replace(/(?:routes?|controllers?|handlers?|services?|routers?|modules?)$/u, '');
}

function uniqueSiblingRuntimeCandidate(importerFile: string, specifier: string): string | null {
    if (!specifier.startsWith('.')) return null;
    const specifierPath = path.resolve(path.dirname(importerFile), specifier);
    const directory = path.dirname(specifierPath);
    const requestedStem = path.basename(specifierPath).replace(/\.(?:js|mjs|cjs|ts|tsx|jsx)$/iu, '');
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return null; }

    const sourceFiles = entries
        .filter(entry => entry.isFile() && RUNTIME_SOURCE_EXTENSIONS.test(entry.name))
        .map(entry => path.join(directory, entry.name));
    const exact = sourceFiles.filter(candidate =>
        path.basename(candidate).replace(/\.(?:js|mjs|cjs|ts|tsx|jsx)$/iu, '').toLocaleLowerCase()
        === requestedStem.toLocaleLowerCase());
    const requestedNormalized = normalizedRuntimeStem(requestedStem);
    const similar = requestedNormalized
        ? sourceFiles.filter(candidate => normalizedRuntimeStem(path.basename(candidate)) === requestedNormalized)
        : [];
    const matches = Array.from(new Set((exact.length ? exact : similar).map(candidate => path.resolve(candidate))));
    return matches.length === 1 ? matches[0] : null;
}

function replaceQuotedRuntimeSpecifier(source: string, specifier: string, replacement: string): string {
    let updated = source;
    for (const quote of ["'", '"']) {
        updated = updated.split(`${quote}${specifier}${quote}`).join(`${quote}${replacement}${quote}`);
    }
    return updated;
}

/**
 * Reconcile only a proven local-import naming mismatch. This is intentionally
 * narrower than self-generating a route: the importer must already be
 * reachable, the replacement must be a single sibling source file, and the
 * normalized stem may differ only by a conventional suffix such as Routes.
 */
export function reconcileMissingRuntimeImports(
    cwd: string,
    detected: { command: string; kind: string },
): { repaired: boolean; message: string; changes: string[] } {
    if (detected.kind === 'static' || detected.kind === 'override') {
        return { repaired: false, message: 'local-import reconciliation is not applicable', changes: [] };
    }
    const target = runtimeEntrypoint(cwd, detected).replace(/^\.\//u, '');
    const entrypoint = target ? path.resolve(cwd, target) : '';
    if (!entrypoint || !fs.existsSync(entrypoint)) {
        return { repaired: false, message: 'runtime entrypoint is unavailable for local-import reconciliation', changes: [] };
    }

    const visited = new Set<string>();
    const changes: string[] = [];
    const ambiguous: string[] = [];
    const visit = (file: string, depth: number): void => {
        if (depth > 8 || visited.has(file) || !fs.existsSync(file)) return;
        const relative = path.relative(cwd, file).replace(/\\/g, '/') || path.basename(file);
        if (relative.split('/').some(part => RUNTIME_SOURCE_IGNORES.has(part))) return;
        visited.add(file);
        let source = '';
        try { source = fs.readFileSync(file, 'utf-8'); } catch { return; }
        let updated = source;
        for (const specifier of runtimeImportSpecifiers(source)) {
            if (!specifier.startsWith('.') || resolveLocalRuntimeImport(file, specifier)) {
                const local = resolveLocalRuntimeImport(file, specifier);
                if (local) visit(local, depth + 1);
                continue;
            }
            const candidate = uniqueSiblingRuntimeCandidate(file, specifier);
            if (!candidate) {
                const candidateDirectory = path.dirname(path.resolve(path.dirname(file), specifier));
                let siblingCount = 0;
                try {
                    siblingCount = fs.readdirSync(candidateDirectory, { withFileTypes: true })
                        .filter(entry => entry.isFile() && RUNTIME_SOURCE_EXTENSIONS.test(entry.name)).length;
                } catch { /* no evidence */ }
                if (siblingCount > 1) ambiguous.push(`${relative} -> ${specifier}`);
                continue;
            }
            const replacement = `./${path.relative(path.dirname(file), candidate).replace(/\\/g, '/')}`;
            const next = replaceQuotedRuntimeSpecifier(updated, specifier, replacement);
            if (next === updated) continue;
            updated = next;
            changes.push(`${relative}: ${specifier} -> ${replacement}`);
            visit(candidate, depth + 1);
        }
        if (updated !== source) {
            try { fs.writeFileSync(file, updated, 'utf-8'); } catch { /* leave the evidence for self-fix */ }
        }
    };
    visit(entrypoint, 0);

    if (changes.length) {
        return {
            repaired: true,
            message: `reconciled ${changes.length} local runtime import${changes.length === 1 ? '' : 's'} (${changes.join('; ')})`,
            changes,
        };
    }
    return {
        repaired: false,
        message: ambiguous.length
            ? `did not reconcile ambiguous local runtime imports (${ambiguous.slice(0, 4).join('; ')})`
            : 'no unique local runtime import match found',
        changes: [],
    };
}

const NODE_BUILTIN_MODULES = new Set<string>([
    ...builtinModules,
    ...builtinModules.map((name) => name.startsWith('node:') ? name : `node:${name}`),
]);
const RUNTIME_SOURCE_EXTENSIONS = /\.(?:js|mjs|cjs|ts|tsx|jsx)$/iu;
const RUNTIME_ASSET_IMPORT_EXTENSIONS = /\.(?:css|scss|sass|less|svg|png|jpg|jpeg|gif|ico|webp|avif|woff|woff2|ttf|eot|json|mp4|mp3|wav|webm)$/iu;
const RUNTIME_SOURCE_IGNORES = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'public', 'docs', 'test', 'tests', '__tests__', 'data']);

/**
 * Windows resolves paths case-insensitively, while the deployed filesystem may
 * not. Check every path segment against the directory's literal entry names so
 * an import of `./styles/app.css` cannot silently accept `styles/App.css`.
 */
function localFileExistsWithExactCase(filePath: string): boolean {
    const absolute = path.resolve(filePath);
    const root = path.parse(absolute).root;
    const relative = path.relative(root, absolute);
    if (!relative) return false;
    const segments = relative.split(path.sep).filter(Boolean);
    let current = root;
    try {
        for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            const entries = fs.readdirSync(current);
            if (!entries.includes(segment)) return false;
            current = path.join(current, segment);
            if (index < segments.length - 1 && !fs.statSync(current).isDirectory()) return false;
        }
        return fs.statSync(current).isFile();
    } catch {
        return false;
    }
}

function packageNameFromSpecifier(specifier: string): string {
    const value = String(specifier || '').trim();
    if (value.startsWith('@')) return value.split('/').slice(0, 2).join('/');
    return value.split('/')[0];
}

function runtimeImportSpecifiers(source: string): string[] {
    const found = new Set<string>();
    const patterns = [
        /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
        /\b(?:import|export)\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/gu,
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    ];
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            const specifier = String(match[1] || '').trim();
            if (specifier) found.add(specifier);
        }
    }
    return [...found];
}

function resolveLocalRuntimeImport(fromFile: string, specifier: string): string | null {
    if (!specifier.startsWith('.')) return null;
    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [
        base,
        ...['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].map((extension) => `${base}${extension}`),
        ...['index.js', 'index.mjs', 'index.cjs', 'index.ts', 'index.tsx', 'index.jsx'].map((entry) => path.join(base, entry)),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile() && RUNTIME_SOURCE_EXTENSIONS.test(candidate)) || null;
}

function isRuntimePackageAvailable(cwd: string, packageName: string): boolean {
    try {
        require.resolve(packageName, { paths: [cwd] });
        return true;
    } catch {
        // Jest sandboxes and some package loaders do not refresh their resolver
        // map after npm creates node_modules during this process. The filesystem
        // is the stronger local fact for this preflight: walk the project and
        // its bounded workspace ancestors, never arbitrary package guesses.
    }
    let probe = path.resolve(cwd);
    for (let depth = 0; depth < 12; depth += 1) {
        const candidate = path.join(probe, 'node_modules', packageName);
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                let packageManifest: any = {};
                try { packageManifest = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf-8')); } catch { }
                const entryCandidates = [packageManifest.main, packageManifest.module, 'index.js', 'index.mjs', 'index.cjs', 'index.json']
                    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
                    .map((entry) => path.resolve(candidate, entry));
                if (entryCandidates.some((entry) => entry === candidate || entry.startsWith(`${candidate}${path.sep}`) && fs.existsSync(entry) && fs.statSync(entry).isFile())) return true;
            }
        } catch { /* continue to the next trusted ancestor */ }
        const parent = path.dirname(probe);
        if (parent === probe) break;
        probe = parent;
    }
    return false;
}

function collectRuntimeSourceFiles(entrypoint: string): string[] {
    const visited = new Set<string>();
    const files: string[] = [];
    const visit = (file: string, depth: number): void => {
        if (depth > 8 || visited.has(file) || !fs.existsSync(file)) return;
        const relative = path.relative(path.dirname(entrypoint), file);
        if (relative.split(path.sep).some((part) => RUNTIME_SOURCE_IGNORES.has(part))) return;
        visited.add(file);
        files.push(file);
        let source = '';
        try { source = fs.readFileSync(file, 'utf-8'); } catch { return; }
        for (const specifier of runtimeImportSpecifiers(source)) {
            const local = resolveLocalRuntimeImport(file, specifier);
            if (local) visit(local, depth + 1);
        }
    };
    visit(entrypoint, 0);
    return files;
}

/**
 * A runtime target can exist while one of its local modules does not. This is
 * a different failure from an undeclared npm package: npm cannot repair
 * `require('./routes/auth')` when the actual evidence is `src/routes/auth.js`.
 * Walk only the reachable runtime graph and report the exact importing file and
 * specifier. The bounded repair planner can then inspect the real layout rather
 * than inventing a route folder or copying a product-specific template.
 */
export function missingLocalRuntimeImports(cwd: string, detected: { command: string; kind: string }): string[] {
    if (detected.kind === 'static' || detected.kind === 'override') return [];
    const target = runtimeEntrypoint(cwd, detected).replace(/^\.\//u, '');
    if (!target) return [];
    const entrypoint = path.resolve(cwd, target);
    if (!fs.existsSync(entrypoint)) return [];

    const visited = new Set<string>();
    const missing = new Set<string>();
    const visit = (file: string, depth: number): void => {
        if (depth > 8 || visited.has(file) || !fs.existsSync(file)) return;
        const relative = path.relative(cwd, file).replace(/\\/g, '/') || path.basename(file);
        if (relative.split('/').some((part) => RUNTIME_SOURCE_IGNORES.has(part))) return;
        visited.add(file);
        let source = '';
        try { source = fs.readFileSync(file, 'utf-8'); } catch { return; }
        for (const specifier of runtimeImportSpecifiers(source)) {
            if (!specifier.startsWith('.')) continue;
            // Frontend bundlers intentionally import local assets that are not
            // executable JS/TS modules. They are still real local edges: only
            // report the edge when the declared asset is absent on disk.
            if (RUNTIME_ASSET_IMPORT_EXTENSIONS.test(specifier)) {
                const assetPath = path.resolve(path.dirname(file), specifier);
                if (localFileExistsWithExactCase(assetPath)) continue;
            }
            const local = resolveLocalRuntimeImport(file, specifier);
            if (local) {
                visit(local, depth + 1);
                continue;
            }
            missing.add(`${relative} -> ${specifier}`);
        }
    };
    visit(entrypoint, 0);
    return [...missing].sort().slice(0, 24);
}

function runtimeEntrypoint(cwd: string, detected: { command: string; kind: string }): string {
    if (detected.kind === 'npm-start' || detected.kind === 'dev-server') {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
            const scripts = pkg?.scripts || {};
            return runtimeTargetFromScript(String(detected.kind === 'npm-start' ? scripts.start : scripts.dev || ''));
        } catch { return ''; }
    }
    if (detected.kind === 'node-entry' || detected.kind === 'tsx-entry') {
        return String(detected.command).replace(/^(?:node|npx -y tsx)\s+/u, '').trim();
    }
    return '';
}

/**
 * Inspect only the source reachable from the selected runtime entrypoint. A
 * declared package is not enough: `npm install` cannot install an import that
 * the manifest forgot, and a detached launch would otherwise fail silently
 * after project_run discarded stderr. This is evidence, not a package guess;
 * the bounded repair planner still decides how to reconcile the manifest.
 */
export function missingRuntimeDependencies(cwd: string, detected: { command: string; kind: string }): string[] {
    if (detected.kind === 'static' || detected.kind === 'override') return [];
    const target = runtimeEntrypoint(cwd, detected).replace(/^\.\//u, '');
    if (!target) return [];
    const entrypoint = path.resolve(cwd, target);
    if (!fs.existsSync(entrypoint)) return [];
    let pkg: any = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')); } catch { return []; }
    const declared = new Set<string>([
        ...Object.keys(pkg?.dependencies || {}),
        ...Object.keys(pkg?.devDependencies || {}),
        ...Object.keys(pkg?.optionalDependencies || {}),
    ]);
    const missing = new Set<string>();
    for (const file of collectRuntimeSourceFiles(entrypoint)) {
        let source = '';
        try { source = fs.readFileSync(file, 'utf-8'); } catch { continue; }
        for (const specifier of runtimeImportSpecifiers(source)) {
            /**
             * `node:` IS the evidence. npm forbids «:» in package names, so a
             * node:-prefixed specifier can only ever be a Node builtin — and
             * `builtinModules` deliberately omits the prefix-only ones
             * (node:sqlite, node:test), so deriving the set from it left a
             * hole. Measured: every API this repository generates opens its
             * database with `require('node:sqlite')`, and this gate refused
             * to start all of them with «node:sqlite is missing from
             * node_modules» — a dependency nobody could ever install.
             */
            if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')
                || specifier.startsWith('node:') || NODE_BUILTIN_MODULES.has(specifier)) continue;
            const packageName = packageNameFromSpecifier(specifier);
            if (!packageName || NODE_BUILTIN_MODULES.has(packageName)) continue;
            const resolved = isRuntimePackageAvailable(cwd, packageName);
            if (!declared.has(packageName) || !resolved) missing.add(packageName);
        }
    }
    return [...missing].sort().slice(0, 12);
}

/**
 * Syntax is a cheap foreground fact to collect before a detached process hides
 * its stderr. `node --check` is intentionally limited to JavaScript-family
 * targets; TypeScript must be checked by its project toolchain instead.
 */
async function runtimeSyntaxError(cwd: string, detected: { command: string; kind: string }): Promise<string | null> {
    if (detected.kind === 'static' || detected.kind === 'override') return null;
    const target = runtimeEntrypoint(cwd, detected).replace(/^\.\//u, '');
    if (!target || !/\.(?:js|mjs|cjs)$/iu.test(target)) return null;
    const result = await ExecutionGateway.execute({
        id: `project-run-syntax-${Date.now()}`,
        type: 'shell',
        payload: {
            command: 'node',
            args: ['--check', target],
            options: { cwd, timeout: 8000, shell: false, stdio: 'pipe' },
        },
        priority: 'high',
    });
    const data = result.data || {};
    if (result.success && data.ok !== false && data.exitCode === 0) return null;
    const detail = String(data.error || result.error || data.output || 'node --check failed').trim().replace(/\s+/gu, ' ').slice(0, 700);
    return `launchability: runtime syntax check failed (${target}): ${detail}`;
}

export function launchPrerequisiteError(cwd: string, detected: { command: string; kind: string }): string | null {
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath) || !/^npm (?:start|run dev)\b/u.test(detected.command)) return null;

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg?.scripts || {};
        const selectedScript = detected.command.startsWith('npm start') ? scripts.start : scripts.dev;
        const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
        const needsVite = !!deps.vite || /(?:^|\s)vite(?:\s|$)/u.test(String(selectedScript || ''))
            || fs.existsSync(path.join(cwd, 'vite.config.js')) || fs.existsSync(path.join(cwd, 'vite.config.ts'));
        const viteInstalled = fs.existsSync(path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite'));
        if (needsVite && !viteInstalled) return 'vite';
        const missingRuntime = missingRuntimeDependencies(cwd, detected);
        if (missingRuntime.length) return `runtime dependencies missing or undeclared: ${missingRuntime.join(', ')}`;
    } catch { /* The actual launcher will surface malformed package errors. */ }
    return null;
}

/**
 * Return the exact dependency names that npm can install from the project's own
 * manifest to repair a launch preflight failure. We never turn an undeclared
 * runtime import into an invented `npm install <guess>`: the manifest is the
 * evidence boundary, and the normal npm_manager keeps registry/version/peer
 * recovery in one place.
 */
export function declaredLaunchPrerequisitePackages(cwd: string, prerequisite: string): string[] | null {
    const raw = String(prerequisite || '').trim();
    let manifest: any;
    try {
        manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
    } catch {
        return null;
    }
    const declared = new Set<string>([
        ...Object.keys(manifest?.dependencies || {}),
        ...Object.keys(manifest?.devDependencies || {}),
        ...Object.keys(manifest?.optionalDependencies || {}),
    ]);
    if (raw === 'vite') return declared.has('vite') ? ['vite'] : null;
    const match = raw.match(/^runtime dependencies missing or undeclared:\s*(.+)$/iu);
    if (!match?.[1]) return null;
    const names = match[1].split(',').map((name) => name.trim()).filter(Boolean);
    return names.length > 0 && names.every((name) => declared.has(name)) ? names : null;
}

export class ProjectRunTool implements ToolDefinition {
    name = 'project_run';
    version = '1.0.0';
    description = 'Run the built project as a LIVE server (Node/React/full-stack/static), wait until it responds, and open its live preview. Use to actually start and view a system, not just a static page.';
    tags = ['run', 'server', 'preview', 'live'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            cwd: { type: 'string' as const, description: 'Project directory. Defaults to the active workspace root.' },
            command: { type: 'string' as const, description: 'Override the start command (auto-detected otherwise).' },
            port: { type: 'number' as const, description: 'Preferred port (a free one is chosen otherwise).' },
            projectQuery: { type: 'string' as const, description: 'Original user request, used only to select a named project within a workspace.' },
        },
    };
    outputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const }, port: { type: 'number' as const }, ready: { type: 'boolean' as const } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 10;
    auditFields = ['cwd', 'command'];
    mockSupported = false;

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const say = (m: string) => { logs.push(m); context?.onProgress?.(m); };
        // The run lines land in the same trace as the build's — so they follow
        // the same language. There is no request text here, so the interface's
        // setting is the only evidence, and English is what «unset» means for a
        // machine-shaped line like «dev-server on port 4300».
        const isAr = isArabicReply({ language: context?.language });
        // [AUDIT INTEGRATION] «شغّل المشروع» right after a scaffold/import
        // used to start the WORKSPACE ROOT, not the project the session just
        // created — the two stores never talked. The session's active
        // project is the default now; an explicit cwd still wins.
        const activeProj = (global as any).joeProjects?.[String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_')];
        const namedProjectQuery = requestedProjectLabel(input?.projectQuery);
        const activeProjectLabel = activeProj?.dir
            ? projectLabel(String(activeProj.dir))
            : normalizeProjectLabel(activeProj?.lastRequest);
        const activeProjectMatchesQuery = !namedProjectQuery
            || activeProjectLabel === namedProjectQuery
            || activeProjectLabel.includes(namedProjectQuery)
            || namedProjectQuery.includes(activeProjectLabel);

        /**
         * RUN THE SYSTEM, NOT ITS SOURCE FOLDER.
         *
         * The React build ends by copying its compiled interface into the API
         * server's `public/` — «one origin, one npm start», the folder he can
         * upload to a domain. Then the pipeline called project_run, which took
         * the session's active project (the React SOURCE directory) and started
         * `vite`. So what opened was a developer's hot-reload server for the
         * source code, on a port nobody chose, with NO backend behind it — the
         * database, the sign-in, the admin panel and every table were in the
         * server that was never started.
         *
         * He asked «ما هذا الذي فتحه جو؟» about exactly that window, and the
         * honest answer was: the wrong half of his own system.
         *
         * When the interface has been packaged into its server, the SERVER is
         * the project. It serves the same interface at `/` and answers its own
         * API on the same origin.
         */
        const packagedInto = String(activeProj?.packagedInto || activeProj?.linkedApiDir || '').trim();
        const packagedIsWhole = !!packagedInto
            && fs.existsSync(path.join(packagedInto, 'public', 'index.html'))
            && fs.existsSync(path.join(packagedInto, 'package.json'));

        const explicitCwd = String(input?.cwd || '').trim();
        const activeProjectDir = activeProjectMatchesQuery && activeProj?.dir && fs.existsSync(activeProj.dir)
            ? String(activeProj.dir)
            : '';
        const workspaceRoot = workspaceService.getActiveRoot(context?.workspaceId);
        /**
         * A scaffold folder can become the session's active project before the
         * final manifest/entrypoint is written. Treating that incomplete folder
         * as authoritative makes a completed build fail even when the same
         * workspace already contains the named runnable artifact. An explicit
         * project identity is stronger evidence: rediscover the container and
         * match the runnable marker/package name there. Explicit cwd and a
         * packaged whole-system directory remain authoritative.
         */
        const useActiveProjectDirectly = shouldUseActiveProjectDirectly(activeProjectDir, input?.projectQuery);
        const baseCwd = explicitCwd
            || (packagedIsWhole ? packagedInto : '')
            || (useActiveProjectDirectly ? activeProjectDir : '')
            || workspaceRoot;
        // An explicitly supplied cwd and a packaged/known runnable project are
        // authoritative. An incomplete active scaffold is a container lookup
        // case, not a runnable project, when the request names an artifact.
        const discovered = !explicitCwd && !packagedIsWhole && !useActiveProjectDirectly
            ? resolveRunnableProject(workspaceRoot, input?.projectQuery)
            : { cwd: baseCwd, candidates: [baseCwd], matched: true };
        // A quoted project identity is an assertion, not a hint. Never fall
        // through to the workspace root (which may be Joe itself) when that
        // named artifact was not found among runnable projects.
        if (!explicitCwd && !packagedIsWhole && !useActiveProjectDirectly && namedProjectQuery && !discovered.cwd) {
            return {
                ok: false,
                error: pick(isAr,
                    `لم أجد مشروعاً قابلاً للتشغيل باسم «${namedProjectQuery}» داخل مساحة العمل؛ لن أشغّل مستودعاً آخر بالتخمين.`,
                    `No runnable project named “${namedProjectQuery}” was found in the workspace; I will not guess and start another repository.`),
                logs,
            };
        }
        const cwd = String(discovered.cwd || baseCwd);
        if (!discovered.cwd && discovered.candidates.length > 1) {
            const choices = discovered.candidates.map(candidate => path.basename(candidate)).join('، ');
            return {
                ok: false,
                error: pick(isAr,
                    `توجد عدة مشاريع قابلة للتشغيل في مساحة العمل (${choices}). حدّد اسم المشروع بين علامتي اقتباس أو مرّر cwd؛ لن أخمّن مشروعاً وأشغّله.`,
                    `Several runnable projects exist in the workspace (${choices}). Name the project in quotes or pass cwd; I will not guess which project to run.`),
                logs,
            };
        }
        if (discovered.cwd && discovered.cwd !== baseCwd) {
            logs.push(`project_run: discovered workspace project (${cwd})`);
        }
        if (!input?.cwd && packagedIsWhole) {
            say(pick(isAr,
                `📦 الواجهة محزومة داخل الخادم — أُشغّل النظام كاملاً (${path.basename(packagedInto)}) لا مجلّد الشيفرة.`,
                `📦 The interface is packaged inside the server — starting the whole system (${path.basename(packagedInto)}), not the source folder.`));
        }
        if (!fs.existsSync(cwd)) return { ok: false, error: `مسار المشروع غير موجود: ${cwd}`, logs };
        if (activeProj?.dir === cwd) logs.push(`project_run: using the session's active project (${cwd})`);
        // Falling back to the workspace root is deliberate — «شغّل المشروع»
        // right after a build must work with no arguments. But a root that
        // holds no project at all is not a project: without this, an empty
        // call spawned `npm start` in a folder with nothing to start, and
        // waited 45s for a server that was never coming.
        if (!input?.command && !hasProjectMarker(cwd)) {
            return { ok: false, error: `لا يوجد مشروع قابل للتشغيل في ${cwd} — ابنِ مشروعاً أولاً أو مرّر cwd.`, logs };
        }

        /**
         * Adoption happens only after project resolution. The previous version
         * adopted any answering persisted URL before it knew which cwd belonged
         * to this request; after an API restart that could be a server from a
         * deleted archive. The PID/cwd gate makes the evidence belong to this
         * exact artifact, not merely to a live port.
         */
        const live = activeProj?.live;
        const liveUrl = String(live?.url || (live?.port ? `http://localhost:${live.port}/` : ''));
        if (!input?.cwd && !input?.command && liveUrl && canAdoptRecordedLive(live, cwd) && await answersHttp(liveUrl)) {
            rememberLiveProject(context, cwd, {
                url: liveUrl, port: Number(live.port), pid: Number(live.pid),
            });
            say(pick(isAr,
                `✅ نظامك يعمل بالفعل — المعاينة الحية: ${liveUrl}`,
                `✅ Your system is already running — live preview: ${liveUrl}`));
            try {
                const { broadcast } = require('../../../api/ws');
                broadcast({
                    type: 'preview_ready', sessionId: context?.sessionId,
                    data: { url: liveUrl, previewUrl: liveUrl, port: Number(live.port), live: true },
                } as any);
            } catch { /* panel optional */ }
            return {
                ok: true,
                output: {
                    url: liveUrl, previewUrl: liveUrl, port: Number(live.port),
                    ready: true, pid: live.pid, cwd, adopted: true, kind: 'already-running',
                },
                logs,
            };
        }
        if (!input?.cwd && !input?.command && liveUrl) {
            logs.push(`project_run: ignored stale or unowned live record (${liveUrl})`);
        }

        const key = runKey(context);
        // One project, one server: stop a previous run before starting again.
        await stopServer(key, logs).catch(() => {});

        const port = Number(input?.port) || await findFreePort();
        let detected = input?.command
            ? { command: String(input.command), kind: 'override', expectPort: port, forced: false }
            : detectStart(cwd, port);
        let launchability = launchabilityError(cwd, detected);
        if (launchability && !input?.command && /runtime target is missing/iu.test(launchability)) {
            const reconciliation = reconcileMissingRuntimeTarget(cwd, launchability);
            logs.push(`project_run: ${reconciliation.message}`);
            if (reconciliation.repaired) {
                say(pick(isAr,
                    `🔧 أصلحتُ target التشغيل من entrypoint مثبت على القرص قبل الإطلاق: ${reconciliation.message}`,
                    `🔧 Reconciled the missing runtime target from a verified on-disk entrypoint before launch: ${reconciliation.message}`));
                detected = detectStart(cwd, port);
                launchability = launchabilityError(cwd, detected);
            }
        }
        if (launchability && /local runtime imports missing/iu.test(launchability)) {
            const reconciliation = reconcileMissingRuntimeImports(cwd, detected);
            logs.push(`project_run: ${reconciliation.message}`);
            if (reconciliation.repaired) {
                say(pick(isAr,
                    `🔧 وجدتُ ملفاً محلياً مطابقاً وأصلحتُ الاستيراد قبل التشغيل: ${reconciliation.changes.join('؛ ')}`,
                    `🔧 I found a unique matching local file and repaired the import before launch: ${reconciliation.changes.join('; ')}`));
                launchability = launchabilityError(cwd, detected);
            }
        }
        if (launchability) {
            const launchabilityMessage = pick(isAr,
                `تعذّر تشغيل المشروع بأمان: ${launchability}. أصلح target الخادم أو manifest أولاً؛ لم أنتظر على منفذ غير قابل للتشغيل.`,
                `Cannot start the project safely: ${launchability}. Fix the server target or manifest first; I will not wait on a project that cannot be launched.`,
            );
            logs.push(launchability);
            return {
                ok: false,
                error: launchabilityMessage,
                output: {
                    cwd,
                    command: detected.command,
                    ready: false,
                    verificationFailed: true,
                    preflight: 'launchability',
                    message: launchabilityMessage,
                },
                logs,
            };
        }
        let missingPrerequisite = launchPrerequisiteError(cwd, detected);
        let prerequisiteRecovery = '';
        const installablePackages = missingPrerequisite
            ? declaredLaunchPrerequisitePackages(cwd, missingPrerequisite)
            : null;
        if (installablePackages?.length) {
            say(pick(isAr,
                `📦 التبعية ${installablePackages.join('، ')} معلنة في manifest لكنها غير مثبتة؛ أُشغّل npm install مرة واحدة قبل الإطلاق…`,
                `📦 ${installablePackages.join(', ')} is declared in the manifest but missing locally; running npm install once before launch…`));
            let installResult: any;
            try {
                installResult = await new NpmManagerTool().execute({ command: 'install', cwd }, context);
            } catch (error: any) {
                installResult = { ok: false, error: String(error?.message || error) };
            }
            if (installResult?.ok) {
                const missingAfterInstall = launchPrerequisiteError(cwd, detected);
                if (!missingAfterInstall) {
                    missingPrerequisite = null;
                    logs.push(`project_run: auto npm install succeeded (${installablePackages.join(', ')})`);
                    say(pick(isAr,
                        `✅ اكتمل تثبيت الاعتماديات المعلنة؛ أتابع تشغيل المشروع.`,
                        `✅ Declared dependencies installed; continuing with project launch.`));
                } else {
                    missingPrerequisite = missingAfterInstall;
                    prerequisiteRecovery = `npm install completed but preflight still reports ${missingAfterInstall}`;
                    logs.push(`project_run: auto npm install incomplete (${missingAfterInstall})`);
                }
            } else {
                const installError = String(installResult?.error || 'npm install failed').trim().replace(/\s+/gu, ' ').slice(0, 700);
                prerequisiteRecovery = `npm install failed: ${installError}`;
                logs.push(`project_run: auto npm install failed (${installError})`);
            }
        }
        if (missingPrerequisite) {
            const detail = prerequisiteRecovery ? ` ${prerequisiteRecovery}.` : '';
            const prerequisiteMessage = pick(isAr,
                `تعذّر تشغيل المشروع بأمان: ${missingPrerequisite}.${detail} لا أستطيع تثبيت حزمة غير معلنة أو التخمين باسمها.`,
                `Cannot start the project safely: ${missingPrerequisite}.${detail} I will not install or invent an undeclared package.`);
            logs.push(missingPrerequisite);
            return {
                ok: false,
                error: prerequisiteMessage,
                output: {
                    cwd,
                    command: detected.command,
                    ready: false,
                    verificationFailed: true,
                    preflight: 'runtime-dependencies',
                    message: prerequisiteMessage,
                },
                logs,
            };
        }
        const syntaxFailure = await runtimeSyntaxError(cwd, detected);
        if (syntaxFailure) {
            const syntaxMessage = pick(isAr,
                `تعذّر تشغيل المشروع بأمان قبل الإطلاق المنفصل: ${syntaxFailure}`,
                `The project failed the foreground runtime syntax check before detached launch: ${syntaxFailure}`);
            logs.push(syntaxFailure);
            return {
                ok: false,
                error: syntaxMessage,
                output: { cwd, command: detected.command, ready: false, verificationFailed: true, preflight: 'node --check', message: syntaxMessage },
                logs,
            };
        }
        say(pick(isAr,
            `▶️ أُشغّل المشروع (${detected.kind}) على المنفذ ${port}…`,
            `▶️ Starting the project (${detected.kind}) on port ${port}…`));

        // Snapshot common ports before launch. A port already occupied here is
        // not evidence that this child started there (it may be an old server).
        const preExistingCommonPorts = detected.forced
            ? []
            : (await Promise.all(COMMON_DEV_PORTS
                .filter(p => p !== port)
                .map(async p => (await isLoopbackPortOpen(p, 250)) ? p : null)))
                .filter((p): p is number => p !== null);
        if (preExistingCommonPorts.length) {
            logs.push(`project_run: ignored pre-existing loopback ports (${preExistingCommonPorts.join(', ')})`);
        }

        // Detached start through the sanctioned gateway — never child_process.
        const res = await ExecutionGateway.execute(detected.command, [], {
            cwd,
            env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', BROWSER: 'none', CI: '1' },
            detached: true,
            shell: true,
            stdio: 'ignore',
        });
        if (!res.success || res.data?.ok === false) {
            return { ok: false, error: `تعذّر تشغيل الخادم: ${res.error || res.data?.error || 'unknown'}`, logs };
        }
        const pid = res.data?.pid;

        /**
          * Readiness — and the trap in «discover where it bound».
          *
          * Probing the common framework ports was written to find a server
          * that drifted. But a drifted server is indistinguishable from
          * SOMEONE ELSE'S: his «Port 5173 is in use» was a Vite from an
          * earlier run that nobody stopped, and a probe of 5173 would have
          * reported that orphan as «the project is running» and opened its
          * stale interface as the new one.
          *
          * So the search is only allowed where the port was a hope. When we
          * FORCED it — a flag the framework must obey, or a static server we
          * point ourselves — the answer is that port or nothing.
          */
        const probeList = buildProbeList(port, detected.forced, preExistingCommonPorts);
        let livePort = 0;
        const deadline = Date.now() + 45000; // weak machines + npm cold start
        while (Date.now() < deadline && !livePort) {
            await new Promise(r => setTimeout(r, 700));
            for (const p of probeList) {
                if (await isLoopbackPortOpen(p, 750)) { livePort = p; break; }
            }
        }

        if (pid) RUNNING.set(key, { pid, port: livePort || port, cwd, command: detected.command, startedAt: Date.now() });

        if (!livePort) {
            /**
             * AND WHEN NOTHING ANSWERED, SAY SO — DO NOT HAND OVER AN ADDRESS.
             *
             * This used to return `url: http://localhost:${port}/` for a port
             * that had just been probed for 45 seconds and found dead. That
             * link went into the delivery report and into his browser, and
             * came back «ERR_CONNECTION_REFUSED» — Joe inventing an address
             * for a server he had failed to confirm.
             *
             * A URL is a promise that something is there. With no `url`, the
             * pipeline's `if (runRes.output?.url)` leaves the report silent
             * about a live link instead of advertising a dead one, and he
             * gets the command to run it himself.
             */
            const readinessMessage = pick(isAr,
                `بدأ الخادم لكنه لم يستجب على أي منفذ خلال ٤٥ ثانية — لن أعطيك رابطاً لم أتحقّق منه. شغّله بنفسك: «${detected.command}» داخل ${cwd}`,
                `The server started but answered on no port within 45s — I will not hand you a link I could not confirm. Run it yourself: «${detected.command}» in ${cwd}`);
            say(`⏳ ${readinessMessage}`);
            // A spawned process is not delivery evidence. Returning ok:true here
            // made the DAG mark the node completed and the chat announce a live
            // preview although this exact tool had just proved no port answered.
            return {
                ok: false,
                error: readinessMessage,
                output: {
                    port, ready: false, pid, cwd, command: detected.command,
                    note: 'started_not_confirmed',
                    verificationFailed: true,
                    message: readinessMessage,
                },
                logs,
            };
        }

        const url = `http://localhost:${livePort}/`;
        rememberLiveProject(context, cwd, { url, port: livePort, pid: Number(pid) });
        say(pick(isAr,
            `✅ المشروع يعمل الآن — المعاينة الحية: ${url}`,
            `✅ The project is running — live preview: ${url}`));
        // The preview panel opens automatically on this event.
        try {
            const { broadcast } = require('../../../api/ws');
            broadcast({ type: 'preview_ready', sessionId: context?.sessionId, data: { url, previewUrl: url, port: livePort, live: true } });
        } catch { /* panel optional */ }

        return {
            ok: true,
            output: {
                url, previewUrl: url, port: livePort, ready: true, pid, cwd,
                command: detected.command, startedAt: Date.now(), kind: detected.kind,
            },
            logs,
        };
    }
}

async function stopServer(key: string, logs: string[]): Promise<boolean> {
    const server = RUNNING.get(key);
    if (!server?.pid) return false;
    const pid = server.pid;
    try {
        if (process.platform === 'win32') {
            // Kills the whole process tree (npm -> the framework it spawned).
            await ExecutionGateway.execute(`taskkill /F /T /PID ${pid}`, [], { shell: true, stdio: 'ignore' });
        } else {
            // Detached start makes the child a group leader; -pid kills the group.
            try { process.kill(-pid, 'SIGTERM'); } catch { process.kill(pid, 'SIGTERM'); }
        }
        logs.push(`stopped pid=${pid} port=${server.port}`);
    } catch (e: any) {
        logs.push(`stop_failed pid=${pid}: ${e?.message || e}`);
    }
    RUNNING.delete(key);
    return true;
}

export class ProjectStopTool implements ToolDefinition {
    name = 'project_stop';
    version = '1.0.0';
    description = 'Stop the live server started by project_run for the current project.';
    tags = ['run', 'server', 'stop'];
    inputSchema = { type: 'object' as const, properties: {} };
    outputSchema = { type: 'object' as const, properties: { stopped: { type: 'boolean' as const } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 20;
    auditFields = [];
    mockSupported = false;

    async execute(_input: any, context?: any) {
        const logs: string[] = [];
        const key = runKey(context);
        const server = RUNNING.get(key);
        if (!server) return { ok: true, output: { stopped: false, message: 'لا يوجد خادم يعمل لهذا المشروع.' }, logs };
        await stopServer(key, logs);
        return { ok: true, output: { stopped: true, message: `تم إيقاف الخادم (المنفذ ${server.port}).`, port: server.port }, logs };
    }
}

// Exposed so the pipeline can auto-run after a verified build.
export { RUNNING as _runningServers };
