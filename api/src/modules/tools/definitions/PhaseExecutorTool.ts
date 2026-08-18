import { ToolDefinition, ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';
import { persistJoeProjects } from '../../../api/page-store';
import { workspaceService } from '../../services/WorkspaceService';

import { recoverMissingNpmLauncher } from '../npm-launcher-recovery';
export { recoverMissingNpmLauncher } from '../npm-launcher-recovery';
import { executeTool } from '../../services/ToolService';
import { resolveToolPath } from '../utils';
import { resolvePlannedTool, unrunnableShellStep, adaptPlannedArgs, adaptPlannedArgsFromDescription, plannedArgsIssue } from '../../../core/orchestrator/plan-tools';

/**
 * Add only trusted project evidence to a phase-level project_run call.
 * An accepted plan's projectName is an explicit selection signal; it is not a
 * filesystem guess. ProjectRunTool remains responsible for matching it against
 * runnable candidates and refusing when the evidence is insufficient.
 */
export function reactProjectStartFallback(
    command: unknown,
    taskDescription: unknown,
    taskArgs: Record<string, any> = {},
    projectContext?: Record<string, any>,
    workspaceId?: string,
): { cwd: string } | null {
    const rawCommand = String(command || '').trim();
    const description = String(taskDescription || '').trim();
    // A browser project must be launched through its declared dev/start script.
    // `node src/index.ts` is not a portable launcher: Node cannot execute TS/TSX
    // without a declared transpiler, and it bypasses Vite/Next/Expo readiness.
    if (!/\bnode(?:\.exe)?\s+(?:(?:--[^\s]+)\s+)*["']?[^"'\s]+\.(?:ts|tsx|jsx)["']?(?:\s|$)/iu.test(rawCommand)) return null;
    if (!/(?:\b(?:start|launch|serve|preview|open|dev)\b|\brun\s+(?:the\s+)?(?:project|app|application|server)\b|تشغيل|شغّل|ابدأ|المشروع|التطبيق|الخادم)/iu.test(description)) return null;

    const candidate = String(
        taskArgs.cwd
        || taskArgs.projectPath
        || projectContext?.projectRoot
        || workspaceService.getActiveRoot(workspaceId)
        || '',
    ).trim();
    if (!candidate) return null;
    const workspaceRoot = String(workspaceService.getActiveRoot(workspaceId) || '').trim();
    const projectRoot = path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : path.resolve(workspaceRoot || process.cwd(), candidate);
    const manifestPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(manifestPath)) return null;

    let manifest: any;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return null; }
    const dependencyNames = Object.keys({
        ...(manifest?.dependencies && typeof manifest.dependencies === 'object' ? manifest.dependencies : {}),
        ...(manifest?.devDependencies && typeof manifest.devDependencies === 'object' ? manifest.devDependencies : {}),
    });
    const scriptText = Object.values(manifest?.scripts || {}).filter(value => typeof value === 'string').join(' ');
    const browserRuntime = dependencyNames.some(name => /^(?:react|react-dom|next|vite|expo|@vitejs\/plugin-react|react-scripts)$/iu.test(name))
        && /(?:vite|next|expo|react-scripts|webpack|parcel)/iu.test(`${dependencyNames.join(' ')} ${scriptText}`);
    if (!browserRuntime) return null;
    return { cwd: projectRoot };
}

export function inheritRuntimeProjectArguments(
    toolName: string,
    planned: Record<string, any>,
    projectContext?: Record<string, any>,
    logs?: string[],
): Record<string, any> {
    const runtimeProjectRoot = String(projectContext?.projectRoot || '').trim();
    const runtimePathTools = new Set([
        'inspect_directory', 'search_files', 'search_text',
        'project_detect', 'analyze_project', 'analyze_codebase', 'quality_run',
    ]);

    /**
     * GREENFIELD HAS NO ARTIFACT ROOT YET.
     *
     * The planner is allowed to describe its first read-only phase using the
     * product label (`WeatherGo`) even though that directory does not exist.
     * Resolving that label as a filesystem path makes discovery fail before the
     * builder ever gets a chance to create the artifact. At this boundary the
     * only honest target is the active workspace root: it lets discovery read
     * existing reference projects without pretending that the new product
     * already exists. Once a builder writes a real artifact,
     * `projectRootRuntimeBound` becomes true and the stricter mapping below
     * takes over.
     */
    if (projectContext?.createsNewProject === true
        && projectContext?.projectRootRuntimeBound !== true
        && runtimePathTools.has(toolName)
        && toolName !== 'quality_run') {
        let workspaceRoot = '';
        try {
            workspaceRoot = path.resolve(workspaceService.getActiveRoot(projectContext?.workspaceId));
        } catch { /* leave the planner's arguments untouched if no root is available */ }
        if (workspaceRoot && fs.existsSync(workspaceRoot)) {
            const requestedPath = String(planned.path || '').trim();
            planned.path = workspaceRoot;
            logs?.push(requestedPath
                ? `[PhaseExecutor] ${toolName}: mapped pre-artifact greenfield path (${requestedPath.slice(0, 160)}) to workspace root (${workspaceRoot.slice(0, 240)})`
                : `[PhaseExecutor] ${toolName}: inherited workspace root for pre-artifact greenfield discovery (${workspaceRoot.slice(0, 240)})`);
        }
    }

    if (projectContext?.projectRootRuntimeBound !== true || !runtimeProjectRoot) return planned;

    // quality_run's real contract names the project as `path`, not `cwd` or
    // `projectPath`. A phase plan often omits it because the builder has only
    // established the root at runtime. Carry the trusted runtime-bound root
    // into the tool's own vocabulary before schema validation; never guess a
    // workspace root and never overwrite an explicit path.
    if (toolName === 'quality_run' && !String(planned.path || '').trim()) {
        planned.path = runtimeProjectRoot;
        logs?.push(`[PhaseExecutor] quality_run: inherited path from runtime-bound project root (${runtimeProjectRoot.slice(0, 240)})`);
    }

    if (runtimePathTools.has(toolName)) {
        const existingPath = String(planned.path || '').trim();
        const projectName = String(projectContext?.projectName || '').trim();
        const normaliseSegment = (value: string) => {
            const slashNormalised = value.replace(/\\/g, '/');
            const withoutDotSlash = slashNormalised.startsWith('./') ? slashNormalised.slice(2) : slashNormalised;
            return withoutDotSlash
                .replace(/[-_]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLocaleLowerCase();
        };
        const rawSegments = existingPath.replace(/\\/g, '/').split('/').filter(Boolean);
        const firstSegment = rawSegments[0] || '';
        const projectSegmentMatches = !!projectName && !!firstSegment
            && normaliseSegment(firstSegment) === normaliseSegment(projectName);
        if (!existingPath) {
            planned.path = runtimeProjectRoot;
            logs?.push(`[PhaseExecutor] ${toolName}: inherited path from runtime-bound project root (${runtimeProjectRoot.slice(0, 240)})`);
        } else if (!path.isAbsolute(existingPath)) {
            const relativeSegments = projectSegmentMatches ? rawSegments.slice(1) : rawSegments;
            const candidate = path.resolve(runtimeProjectRoot, relativeSegments.join(path.sep) || '.');
            if (isWithinRoot(candidate, runtimeProjectRoot)) {
                planned.path = candidate;
                logs?.push(projectSegmentMatches
                    ? `[PhaseExecutor] ${toolName}: mapped conceptual project path onto runtime-bound root (${candidate.slice(0, 240)})`
                    : `[PhaseExecutor] ${toolName}: resolved relative path under runtime-bound root (${candidate.slice(0, 240)})`);
            }
        }
    }

    const cwdInheritedTools = new Set(['npm_manager', 'shell_execute', 'terminal_manager', 'auto_tester']);
    if (cwdInheritedTools.has(toolName) && !String(planned.cwd || planned.projectPath || '').trim()) {
        planned.cwd = runtimeProjectRoot;
        logs?.push(`[PhaseExecutor] ${toolName}: inherited cwd from runtime-bound project root (${runtimeProjectRoot.slice(0, 240)})`);
    }
    return planned;
}

export function applyPhaseExecutionEvidence(
    toolName: string,
    planned: Record<string, any>,
    projectContext?: Record<string, any>,
    logs?: string[],
): Record<string, any> {
    if (toolName !== 'project_run') return planned;

    const projectRoot = String(projectContext?.projectRoot || '').trim();
    const projectName = String(projectContext?.projectName || '').trim();
    const existingCwd = String(planned.cwd || '').trim();
    const existingProjectQuery = String(planned.projectQuery || '').trim();
    const normaliseLabel = (value: string) =>
        value
        .replace(/\\/g, '/')
        .split('/')
        .pop()!
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
    const rootLabel = projectRoot ? normaliseLabel(projectRoot) : '';
    const requestedLabel = projectName ? normaliseLabel(projectName) : '';
    const cwdLabel = existingCwd ? normaliseLabel(existingCwd) : '';
    const labelsMatch = !!rootLabel && !!requestedLabel && (
        rootLabel === requestedLabel
        || rootLabel.includes(requestedLabel)
        || requestedLabel.includes(rootLabel)
    );
    const cwdMatchesProject = !!cwdLabel && !!requestedLabel && (
        cwdLabel === requestedLabel
        || cwdLabel.includes(requestedLabel)
        || requestedLabel.includes(cwdLabel)
    );
    const runtimeBound = projectContext?.projectRootRuntimeBound === true;
    let workspaceRoot = '';
    if ((projectContext?.createsNewProject === true || runtimeBound) && existingCwd) {
        try { workspaceRoot = String(workspaceService.getActiveRoot(projectContext?.workspaceId) || '').trim(); } catch { /* best effort */ }
    }
    const resolvedCwd = existingCwd && workspaceRoot
        ? path.resolve(workspaceRoot, existingCwd)
        : '';
    const cwdIsInsideWorkspace = !!resolvedCwd && isWithinRoot(resolvedCwd, workspaceRoot);

    // A runtime-bound artifact is stronger evidence than a model-written cwd.
    // This protects both greenfield and repair phases from an old workspace-root
    // argument that would make project_run execute `src/index.js` outside the
    // artifact Joe just wrote.
    if (runtimeBound && projectRoot) {
        const resolvedRoot = path.resolve(projectRoot);
        if (!existingCwd || path.resolve(resolvedCwd || existingCwd) !== resolvedRoot) {
            planned.cwd = projectRoot;
            delete planned.projectQuery;
            logs?.push(`[PhaseExecutor] project_run: replaced stale cwd with runtime-bound project root (${projectRoot.slice(0, 240)})`);
        }
        return planned;
    }

    // Greenfield discovery intentionally has no selected project yet. If the
    // planner nevertheless writes the workspace root (or another in-workspace
    // directory) into project_run, honoring it turns the generated app's
    // `node src/index.js` into `/workspace/src/index.js`. Remove only that
    // unsafe in-workspace cwd; keep an explicit cwd outside the workspace as a
    // deliberate caller choice and keep a cwd whose label matches the accepted
    // project identity.
    const staleGreenfieldCwd = projectContext?.createsNewProject === true
        && !runtimeBound
        && !!existingCwd
        && cwdIsInsideWorkspace
        && !cwdMatchesProject;
    if (staleGreenfieldCwd) {
        delete planned.cwd;
        logs?.push(`[PhaseExecutor] project_run: ignored stale greenfield cwd (${existingCwd}); using accepted project evidence instead`);
    } else if (existingCwd || existingProjectQuery) {
        return planned;
    }

    // Discovery intentionally has no selected project for greenfield work. A
    // stale root here is usually Joe's own repository, not the artifact the
    // preceding phases are creating. Also handle older callers that do not yet
    // carry createsNewProject: a named project that disagrees with the root is
    // not safe evidence for an explicit cwd. Runtime-bound evidence wins.
    const preCreationRootMismatch = !!projectRoot
        && (projectContext?.createsNewProject === true || !labelsMatch);
    if (projectRoot && !preCreationRootMismatch) {
        planned.cwd = projectRoot;
        logs?.push(`[PhaseExecutor] project_run: using discovery-selected project root (${projectRoot.slice(0, 240)})`);
        return planned;
    }
    if (projectName && !/^unknown(?: project)?$/iu.test(projectName)) {
        planned.projectQuery = `run the project named "${projectName}"`;
        logs?.push(preCreationRootMismatch
            ? `[PhaseExecutor] project_run: ignored pre-creation root and used accepted project query (${projectName})`
            : `[PhaseExecutor] project_run: using accepted plan project evidence (${projectName})`);
    }
    return planned;
}

function sessionProjectKey(sessionId: unknown): string {
    return String(sessionId || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
}

function isWithinRoot(child: string, parent: string): boolean {
    const c = path.resolve(child);
    const p = path.resolve(parent);
    return c === p || c.startsWith(p.endsWith(path.sep) ? p : `${p}${path.sep}`);
}

/**
 * A runtime project may be incomplete while its first server-shaped write is
 * still the strongest identity evidence available. The fileRoot is produced by
 * projectRootFromWrittenFile, so callers must not pass an arbitrary directory
 * here. A manifest remains sufficient evidence for later writes.
 */
export function canBindRuntimeProjectEvidence(
    candidate: string,
    workspaceRoot: string,
    fileRoot: string,
    hasManifest: boolean,
): boolean {
    const resolvedCandidate = path.resolve(String(candidate || ''));
    const resolvedWorkspace = path.resolve(String(workspaceRoot || ''));
    const fromWrittenFile = !!fileRoot && resolvedCandidate === path.resolve(fileRoot);
    if (!resolvedCandidate || !resolvedWorkspace || resolvedCandidate === resolvedWorkspace
        || !isWithinRoot(resolvedCandidate, resolvedWorkspace)) return false;
    return hasManifest || fromWrittenFile;
}

export function projectRootFromWrittenFile(filePath: unknown, workspaceRoot: string, projectName?: unknown): string {
    const raw = String(filePath || '').trim();
    if (!raw) return '';
    let candidate: string;
    try { candidate = path.resolve(workspaceRoot, raw); } catch { return ''; }
    if (!isWithinRoot(candidate, workspaceRoot)) return '';
    let current = fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
        ? candidate
        : path.dirname(candidate);
    const workspace = path.resolve(workspaceRoot);
    while (isWithinRoot(current, workspace)) {
        // A nested write such as `NEXUS/package.json` must not inherit an
        // unrelated package.json at the workspace root. The workspace itself
        // is valid evidence only when this write directly targets its manifest;
        // otherwise a package-bearing ancestor has not been proven yet.
        if (current === workspace) {
            const rootManifest = path.dirname(candidate) === workspace && path.basename(candidate).toLowerCase() === 'package.json'
                && fs.existsSync(path.join(current, 'package.json'))
                ? current
                : '';
            if (rootManifest) return rootManifest;
            break;
        }
        if (fs.existsSync(path.join(current, 'package.json'))) return current;
        current = path.dirname(current);
    }

    // Greenfield plans commonly write the server entrypoint before the
    // manifest. If the path is a direct child project whose label matches the
    // accepted plan identity, that is stronger evidence than falling back to
    // an old active project or the workspace root. This is deliberately narrow:
    // it accepts only an existing project-name directory and a server-shaped
    // JavaScript/TypeScript entrypoint, never an arbitrary source file.
    const requestedLabel = String(projectName || '')
        .trim()
        .replace(/\\/g, '/')
        .split('/')
        .pop()!
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
    const relative = path.relative(workspace, candidate);
    const firstSegment = relative.split(path.sep).filter(Boolean)[0] || '';
    const directChild = firstSegment ? path.join(workspace, firstSegment) : '';
    const directChildLabel = firstSegment.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    const relativeInsideChild = directChild ? path.relative(directChild, candidate).replace(/\\/g, '/') : '';
    const runtimeEvidence = /(?:^|\/)(?:server|app|index|main)\.(?:js|mjs|cjs|ts|tsx)$/iu.test(relativeInsideChild);
    const labelsMatch = !!requestedLabel && !!directChildLabel && (
        requestedLabel === directChildLabel
        || requestedLabel.includes(directChildLabel)
        || directChildLabel.includes(requestedLabel)
    );
    if (directChild && fs.existsSync(directChild) && fs.statSync(directChild).isDirectory() && labelsMatch && runtimeEvidence) {
        return directChild;
    }
    return '';
}

/** Bind only a real package-bearing artifact written by the current phase. */
function bindRuntimeProjectFromEvidence(
    toolName: string,
    toolArgs: Record<string, any>,
    toolResult: any,
    projectContext: Record<string, any>,
    logs: string[],
): void {
    if (!projectContext || !['scaffold_project', 'react_project', 'api_project', 'scaffold_full_stack', 'write_file', 'ai_write_file', 'file_edit', 'file_edit_advanced'].includes(toolName)) return;
    const workspaceRoot = path.resolve(workspaceService.getActiveRoot(projectContext?.workspaceId));
    if (!workspaceRoot || !fs.existsSync(workspaceRoot)) return;
    const outputRoot = String(toolResult?.output?.projectDir || toolResult?.output?.projectRoot || toolResult?.output?.path || '').trim();
    const fileRoot = projectRootFromWrittenFile(
        toolArgs?.path || toolArgs?.filename || toolArgs?.filePath || toolResult?.output?.path,
        workspaceRoot,
        projectContext?.projectName,
    );
    const candidate = outputRoot && isWithinRoot(outputRoot, workspaceRoot)
        ? path.resolve(outputRoot)
        : fileRoot;
    const candidateFromWrittenFile = !!fileRoot && !!candidate && path.resolve(fileRoot) === path.resolve(candidate);
    const hasManifest = !!candidate && fs.existsSync(path.join(candidate, 'package.json'));
    // A greenfield phase may write the server-shaped entrypoint before its
    // manifest. That file is still identity evidence: projectRootFromWrittenFile
    // accepts only a direct child whose label matches projectName and whose
    // relative path is server/app/index/main-shaped. Bind that bounded artifact
    // now, otherwise project_run falls back to an unrelated workspace root and
    // reports its dependencies as if they belonged to the new project. Never
    // accept an arbitrary output directory without a manifest or file evidence.
    if (!candidate || !fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()
        || !canBindRuntimeProjectEvidence(candidate, workspaceRoot, fileRoot, hasManifest)) return;
    /**
     * THE WORKSPACE ROOT IS NEVER A PROJECT.
     *
     * Every project Joe builds is a CHILD of the workspace — that is the
     * architecture, and every other tool assumes it. Measured on the MyBudget
     * field run: a repair phase wrote package.json into the workspace root
     * itself, this binding then adopted the root — twenty-four real projects
     * suddenly inside «the active project» — and every later discovery read
     * the whole workspace as one ambiguous artifact. Refusing here keeps one
     * bad write from re-labelling everything the user ever built.
     */
    if (path.resolve(candidate) === workspaceRoot) {
        logs.push('[PhaseExecutor] refused to bind the workspace root as a project — a project is a child of the workspace, never the workspace itself');
        return;
    }

    const key = sessionProjectKey(projectContext?.sessionId);
    const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
    const previous = projects[key] || {};
    projects[key] = {
        ...previous,
        dir: candidate,
        type: previous.type || 'scaffold',
        updatedAt: Date.now(),
        lastRequest: String(projectContext?.projectName || path.basename(candidate)).slice(0, 120),
    };
    try { persistJoeProjects(); } catch { /* binding remains useful for this run */ }
    projectContext.projectRoot = candidate;
    projectContext.projectRootRuntimeBound = true;
    logs.push(`[PhaseExecutor] runtime project evidence bound ${key} -> ${candidate}`);
}

function syncRuntimeProjectContext(projectContext: Record<string, any>, logs: string[]): void {
    const key = sessionProjectKey(projectContext?.sessionId);
    const active = (global as any).joeProjects?.[key];
    const candidate = String(active?.dir || '').trim();
    if (!candidate || !fs.existsSync(candidate)) return;
    const workspaceRoot = path.resolve(workspaceService.getActiveRoot(projectContext?.workspaceId));
    if (!isWithinRoot(candidate, workspaceRoot)) return;
    // An old active project is not evidence for the new greenfield artifact.
    // bindRuntimeProjectFromEvidence is the only path allowed to establish it.
    if (projectContext?.createsNewProject === true && projectContext?.projectRootRuntimeBound !== true) return;
    if (!projectContext.projectRoot || projectContext.projectRootRuntimeBound === true) {
        projectContext.projectRoot = path.resolve(candidate);
        projectContext.projectRootRuntimeBound = true;
        logs.push(`[PhaseExecutor] synchronized active project root (${path.resolve(candidate)})`);
    }
}

/**
 * Preserve deterministic file facts needed for a safe recovery.
 *
 * A failed generator is still actionable: artifact validation can reject the
 * content while the destination path is perfectly valid. If that path is
 * discarded here, RepairTicketService cannot identify the failed artifact and
 * SelfFixService falls through to its conservative generic source target
 * (`src/index.ts`). That is not a repair; it is evidence loss.
 */
function boundedRepairEvidence(value: unknown, max = 6000): string {
    return String(value ?? '').slice(0, max)
        .replace(/(authorization|bearer|token|password|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/giu, '$1: [REDACTED]')
        .replace(/(gh[pousr]_[A-Za-z0-9_-]{16,})/gu, '[REDACTED]');
}

function fileFailureEvidence(toolName: string, args: Record<string, any>): Record<string, string> {
    const cwd = String(args?.cwd ?? args?.projectPath ?? '').trim();
    const evidence: Record<string, string> = cwd ? { cwd: cwd.slice(0, 1000) } : {};
    const fileTools = new Set(['write_file', 'ai_write_file', 'file_edit', 'file_edit_advanced', 'auto_tester']);
    if (!fileTools.has(toolName)) return evidence;
    const file = String(args?.filename ?? args?.filePath ?? args?.path ?? args?.targetPath
        ?? (Array.isArray(args?.files) ? args.files[0] : '') ?? '').trim();
    const find = String(args?.find ?? args?.search ?? args?.old_string ?? '');
    const replace = String(args?.replace ?? args?.new_string ?? '');
    const description = toolName === 'ai_write_file' && typeof args?.description === 'string'
        ? boundedRepairEvidence(args.description)
        : '';
    const artifactContext = toolName === 'ai_write_file' && typeof args?.context === 'string'
        ? boundedRepairEvidence(args.context)
        : '';
    return {
        ...evidence,
        ...(file ? { file: file.slice(0, 1000) } : {}),
        ...(find ? { find: find.slice(0, 4000) } : {}),
        ...(replace ? { replace: replace.slice(0, 4000) } : {}),
        ...(description ? { description } : {}),
        ...(artifactContext ? { artifactContext } : {}),
    };
}

const NON_LOCAL_SCRIPT_COMMANDS = new Set([
    'node', 'npm', 'npx', 'sh', 'bash', 'cmd', 'powershell', 'pwsh',
    'echo', 'true', 'false', 'cd', 'set', 'export', 'env', 'cross-env-shell',
]);

function npmScriptNameFromCommand(command: unknown): string {
    const raw = String(command || '').trim();
    if (!raw) return '';
    const named = raw.match(/\bnpm\s+(?:run-script|run)\s+([A-Za-z0-9:_-]+)/iu);
    if (named?.[1]) return named[1];
    const shorthand = raw.match(/\bnpm\s+(start|test|stop|restart)\b/iu);
    return shorthand?.[1] || '';
}

function npmScriptCandidatesForTool(toolName: string, toolArgs: Record<string, any>): string[] {
    if (toolName === 'shell_execute' || toolName === 'terminal_manager') {
        const name = npmScriptNameFromCommand(toolArgs?.command);
        return name ? [name] : [];
    }
    if (toolName !== 'auto_tester') return [];
    switch (String(toolArgs?.testType || '').trim().toLowerCase()) {
        case 'build': return ['build'];
        case 'unit': return ['test', 'test:unit', 'unit'];
        case 'integration': return ['test:integration', 'test:e2e', 'integration', 'e2e', 'test:int'];
        default: return [];
    }
}

function firstScriptCommand(segment: string): string {
    let value = String(segment || '').trim();
    value = value.replace(/^(?:(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+)\s+)+/u, '').trim();
    return value.split(/\s+/u)[0] || '';
}

function localScriptBinaries(script: unknown): string[] {
    const binaries: string[] = [];
    for (const segment of String(script || '').split(/&&|\|\||[|;]/u)) {
        const token = firstScriptCommand(segment).replace(/^['"]|['"]$/gu, '');
        if (!token || token.startsWith('-')) continue;
        const base = path.basename(token).replace(/\.(?:cmd|ps1|exe)$/iu, '');
        if (!base || NON_LOCAL_SCRIPT_COMMANDS.has(base.toLowerCase()) || token.includes('://')) continue;
        binaries.push(token);
    }
    return Array.from(new Set(binaries));
}

function localBinaryExists(projectRoot: string, token: string): boolean {
    const candidates = token.includes('/') || token.includes('\\')
        ? [path.resolve(projectRoot, token)]
        : [
            path.join(projectRoot, 'node_modules', '.bin', token),
            path.join(projectRoot, 'node_modules', '.bin', `${token}.cmd`),
            path.join(projectRoot, 'node_modules', '.bin', `${token}.ps1`),
        ];
    return candidates.some(candidate => fs.existsSync(candidate));
}

function resolvedProjectCwd(raw: unknown, projectContext: Record<string, any>, workspaceId?: string): string {
    const requested = String(raw || projectContext?.projectRoot || '').trim();
    if (!requested) return '';
    try {
        const resolved = resolveToolPath(requested, { workspaceId });
        const workspaceRoot = path.resolve(workspaceService.getActiveRoot(workspaceId));
        return isWithinRoot(resolved, workspaceRoot) ? path.resolve(resolved) : '';
    } catch {
        return '';
    }
}

/**
 * A generated project can have a correct package.json while node_modules is
 * absent or incomplete. Running `npm run build` in that state reports only
 * `vite: not found`, and the phase self-fix has no evidence that an install was
 * required. Before any planned shell/terminal npm script, inspect the script's
 * local binaries and install from the project's own manifest when one is
 * missing. This is capability-level behaviour: it applies to Vite, Jest,
 * TypeScript, Expo and any other package-provided executable.
 */
async function ensureNpmScriptDependencies(
    toolName: string,
    toolArgs: Record<string, any>,
    projectContext: Record<string, any> | undefined,
    executionContext: Record<string, any>,
    appendLog: (line: unknown) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!['shell_execute', 'terminal_manager', 'auto_tester'].includes(toolName)) return { ok: true };
    const scriptCandidates = npmScriptCandidatesForTool(toolName, toolArgs);
    if (!scriptCandidates.length) return { ok: true };
    const projectRoot = resolvedProjectCwd(toolArgs?.cwd || toolArgs?.projectPath, projectContext || {}, executionContext.workspaceId);
    if (!projectRoot) return { ok: true };
    const manifestPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(manifestPath)) return { ok: true };

    let manifest: any;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return { ok: true }; }
    const scriptName = scriptCandidates.find(candidate => typeof manifest?.scripts?.[candidate] === 'string' && manifest.scripts[candidate].trim()) || '';
    if (!scriptName) return { ok: true };
    const script = manifest.scripts[scriptName];
    const missing = localScriptBinaries(script).filter(binary => !localBinaryExists(projectRoot, binary));
    if (!missing.length) return { ok: true };

    appendLog(`[PhaseExecutor] npm preflight: ${scriptName} requires missing local binary${missing.length === 1 ? '' : 'ies'} (${missing.join(', ')}); installing dependencies in ${projectRoot.slice(0, 240)}`);
    const installResult = await executeTool('npm_manager', {
        command: 'install',
        cwd: projectRoot,
        projectPath: projectRoot,
        workspaceId: executionContext.workspaceId,
        sessionId: executionContext.sessionId,
    }, executionContext);
    if (!installResult?.ok) {
        const error = String(installResult?.error || 'npm_install_failed');
        appendLog(`[PhaseExecutor] npm preflight failed: ${error}`);
        return { ok: false, error: `npm preflight install failed before ${scriptName}: ${error}` };
    }
    const stillMissing = missing.filter(binary => !localBinaryExists(projectRoot, binary));
    if (stillMissing.length) {
        const error = `npm preflight completed but local binary is still missing: ${stillMissing.join(', ')}`;
        appendLog(`[PhaseExecutor] npm preflight failed: ${error}`);
        return { ok: false, error };
    }
    appendLog(`[PhaseExecutor] npm preflight installed dependencies for npm run ${scriptName}`);
    return { ok: true };
}

/**
 * PhaseExecutorTool - Executes a single phase from a project plan.
 *
 * This is the bridge between planning and doing. It must execute with a trusted
 * context (userId, workspaceId, sessionId) so ToolService can enforce ownership,
 * approvals, and workspace isolation consistently.
 */
export class PhaseExecutorTool implements ToolDefinition {
    name = 'phase_executor';
    version = '2.1.1';
    description = 'Execute a single phase of a project plan by running each task\'s tool with trusted execution context';
    tags = ['execution', 'project', 'phase', 'builder'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            phase: {
                type: 'object' as const,
                description: 'The phase to execute',
                properties: {
                    phaseNumber: { type: 'number' as const },
                    name: { type: 'string' as const },
                    description: { type: 'string' as const },
                    tasks: { type: 'array' as const, items: { type: 'object' as const } }
                },
                required: ['phaseNumber', 'name', 'tasks']
            },
            projectContext: {
                type: 'object' as const,
                description: 'Context about the overall project',
                properties: {
                    projectName: { type: 'string' as const },
                    totalPhases: { type: 'number' as const },
                    sessionId: { type: 'string' as const },
                    workspaceId: { type: 'string' as const },
                    userId: { type: 'string' as const },
                    requirementsContext: { type: 'string' as const, description: 'Bounded evidence brief derived from the inspected request or specification' },
                    projectRoot: { type: 'string' as const, description: 'Evidence-backed local root selected by engineering discovery' }
                }
            }
        },
        required: ['phase']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            phaseNumber: { type: 'number' as const },
            status: { type: 'string' as const },
            completedTasks: { type: 'number' as const },
            totalTasks: { type: 'number' as const },
            results: { type: 'array' as const },
            nextPhase: { type: 'number' as const }
        }
    };

    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];

    rateLimitPerMinute = 10;
    auditFields = ['phase', 'projectContext'];
    mockSupported = false;

    async execute(input: { phase: any; projectContext?: any }, context?: any) {
        const { phase, projectContext } = input;
        const MAX_PHASE_LOGS = 128;
        const MAX_PHASE_LOG_CHARS = 2_000;
        const logs: string[] = [];
        // A phase log is live evidence for the panel, not an unbounded transcript.
        // Keep the most recent lines (where verification/build failures appear)
        // and one explicit marker when older progress has been evicted.
        const appendLog = (line: unknown) => {
            const text = String(line ?? '').slice(0, MAX_PHASE_LOG_CHARS);
            if (logs.length < MAX_PHASE_LOGS) {
                logs.push(text);
                return;
            }
            logs[0] = '[PhaseExecutor] ... older phase logs truncated; recent evidence retained ...';
            logs.splice(1, 1);
            logs.push(text);
        };
        const results: Array<{
            task: string;
            tool: string;
            ok: boolean;
            error?: string;
            message?: string;
            command?: string;
            cwd?: string;
            background?: boolean;
        }> = [];
        let completedCount = 0;

        const executionContext = {
            sessionId: context?.sessionId || projectContext?.sessionId,
            // Phase tasks may invoke browser tools; retain the panel identifier
            // from the parent run instead of falling back to the chat session.
            browserSessionId: context?.browserSessionId || projectContext?.browserSessionId,
            workspaceId: context?.workspaceId || projectContext?.workspaceId,
            userId: context?.userId || projectContext?.userId,
            // Delegated artifact writers need the same trusted project identity
            // as project_run. Without it, a model can see only a broad workspace
            // and silently switch a Vite/React product to React Native or another
            // undeclared stack between phases.
            projectRoot: projectContext?.projectRootRuntimeBound === true && projectContext?.projectRoot
                ? projectContext.projectRoot
                : (context?.projectRoot || projectContext?.projectRoot),
            projectName: context?.projectName || projectContext?.projectName,
            createsNewProject: context?.createsNewProject ?? projectContext?.createsNewProject,
            projectRootRuntimeBound: projectContext?.projectRootRuntimeBound ?? context?.projectRootRuntimeBound,
            // Preserve the canonical engineering-routing contract across the
            // executor boundary. AgentLoopService marks the pipeline as an
            // internal engineering run, but the old narrowed context dropped
            // these fields before delegated tools reached callLLM; generation
            // then fell back to ordinary chat deadlines and dead-brain policy.
            modelConfig: context?.modelConfig || projectContext?.modelConfig,
            purpose: context?.purpose || projectContext?.purpose,
            engineeringPipeline: context?.engineeringPipeline ?? projectContext?.engineeringPipeline,
            providerTimeoutMs: context?.providerTimeoutMs ?? projectContext?.providerTimeoutMs,
            plannerTimeoutMs: context?.plannerTimeoutMs ?? projectContext?.plannerTimeoutMs,
            plannerMaxCompletionTokens: context?.plannerMaxCompletionTokens ?? projectContext?.plannerMaxCompletionTokens,
            plannerReasoningEffort: context?.plannerReasoningEffort ?? projectContext?.plannerReasoningEffort,
            onThought: (m: string) => context?.onThought?.(m),
            onProgress: (m: string) => context?.onProgress?.(m),
        };

        // `executionContext` is created before the first builder task runs, but
        // the builder may establish the real artifact root later in the same
        // phase. Always expose the current trusted root to delegated tools;
        // otherwise ai_write_file validates against the old workspace root while
        // npm_manager/auto_tester operate inside the newly created project.
        const liveExecutionContext = () => ({
            ...executionContext,
            projectRoot: projectContext?.projectRootRuntimeBound === true && projectContext?.projectRoot
                ? projectContext.projectRoot
                : executionContext.projectRoot,
            projectRootRuntimeBound: projectContext?.projectRootRuntimeBound ?? executionContext.projectRootRuntimeBound,
        });

        try {
            const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
            const totalTasks = tasks.length;

            if (!executionContext.sessionId) appendLog('[PhaseExecutor] Warning: missing sessionId in execution context');
            if (!executionContext.workspaceId) appendLog('[PhaseExecutor] Warning: missing workspaceId in execution context');
            if (!executionContext.userId) appendLog('[PhaseExecutor] Warning: missing userId in execution context');

            appendLog(`[PhaseExecutor] Starting Phase ${phase.phaseNumber}: ${phase.name} (${totalTasks} tasks)`);

            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                const askedFor = String(task.tool || '').trim();
                const taskDesc = String(task.task || task.description || `Task ${i + 1}`);

                if (!askedFor || askedFor === 'manual') {
                    appendLog(`[PhaseExecutor] Task ${i + 1}: "${taskDesc}" — skipped (manual/no tool)`);
                    results.push({ task: taskDesc, tool: 'manual', ok: true });
                    completedCount++;
                    continue;
                }

                /**
                 * DEFENCE IN DEPTH — the planner already snaps names onto real
                 * tools, but a phase can reach this executor from anywhere (a
                 * repair ticket, a hand-written plan, an older stored plan), and
                 * the field log that motivated this reads:
                 *
                 *   Task 1/2: "Create project repository" — executing tool: Git
                 *   ❌ Task 1 failed: Git — unknown_tool: "Git"
                 *
                 * A name nobody can execute is a defect of the PLAN. Executing it
                 * cannot be attempted, so it is not counted as an attempt that
                 * failed: it is recorded, skipped, and the build carries on.
                 */
                const resolved = resolvePlannedTool(askedFor);
                if (!resolved.tool) {
                    appendLog(`[PhaseExecutor] ⏭️ Task ${i + 1}: "${taskDesc}" — «${askedFor}» ليست أداة في هذا النظام` +
                        `${(resolved as any).why === 'not_software' ? ' (عمل تنظيمي بشري)' : ''}. تخطّيتُها ولم أوقف البناء.`);
                    results.push({ task: taskDesc, tool: 'manual', ok: true });
                    completedCount++;
                    continue;
                }
                let toolName = resolved.tool;
                let rawTaskArgs: any = { ...(task.args || {}), ...(task.input || {}) };
                const browserStart = (toolName === 'shell_execute' || toolName === 'terminal_manager')
                    ? reactProjectStartFallback(rawTaskArgs.command, taskDesc, rawTaskArgs, projectContext, executionContext.workspaceId)
                    : null;
                if (browserStart) {
                    toolName = 'project_run';
                    rawTaskArgs = { ...rawTaskArgs, cwd: browserStart.cwd };
                    delete rawTaskArgs.command;
                    delete rawTaskArgs.background;
                    appendLog(`[PhaseExecutor] ↪️ Task ${i + 1}: replaced direct Node TypeScript launch with project_run (${browserStart.cwd.slice(0, 240)})`);
                }
                if (toolName !== askedFor) {
                    appendLog(`[PhaseExecutor] ↪️ «${askedFor}» تعني ${toolName} — نفّذتُ الأداة الحقيقية.`);
                }

                // The same run also tried `sudo apt-get install git -y` on
                // Windows, moments after `git --version` answered exit 0. An
                // impossible command is not a task that failed; it is a task
                // that was never possible, and retrying it burns the run.
                if (toolName === 'shell_execute' || toolName === 'terminal_manager') {
                    const why = unrunnableShellStep(rawTaskArgs.command);
                    if (why) {
                        appendLog(`[PhaseExecutor] ⏭️ Task ${i + 1}: "${taskDesc}" — ${why}`);
                        results.push({ task: taskDesc, tool: 'manual', ok: true });
                        completedCount++;
                        continue;
                    }
                }

                appendLog(`[PhaseExecutor] Task ${i + 1}/${totalTasks}: "${taskDesc}" — executing tool: ${toolName}`);

                // A plan's arguments are model-written too: «Git» came with
                // `{action:'status'}` and git_ops declares `operation`, so the
                // renamed tool still failed on its first real run. Speak the
                // tool's own vocabulary.
                // The session goes in BEFORE the adapter runs: an audit with no
                // address is completed from what THIS session just built, and
                // the adapter cannot find that without knowing whose it is.
                const planned: any = { ...rawTaskArgs };
                if (executionContext.sessionId && typeof planned.sessionId !== 'string') planned.sessionId = executionContext.sessionId;
                if (executionContext.workspaceId && typeof planned.workspaceId !== 'string') planned.workspaceId = executionContext.workspaceId;
                const requirementsContext = String(projectContext?.requirementsContext || '').trim();
                if (['api_project', 'react_project'].includes(toolName) && requirementsContext) {
                    // Builder tools receive their semantics through `request`,
                    // not through the narrowed execution context. Preserve the
                    // planner's request, then append the bounded evidence brief
                    // that was derived from the fully read specification. This
                    // keeps the handoff evidence-first without inventing a
                    // product template or replacing an explicit builder brief.
                    const taskRequest = String(planned.request || '').trim();
                    const evidenceMarker = 'COMPACT REQUIREMENTS EVIDENCE';
                    if (!taskRequest.includes(evidenceMarker) && !taskRequest.includes(requirementsContext.slice(0, 160))) {
                        planned.request = taskRequest
                            ? `${taskRequest}\n\n${requirementsContext}`
                            : requirementsContext;
                    }
                }
                if (toolName === 'ai_write_file') {
                    if (requirementsContext) {
                        const taskContext = String(planned.context || '').trim();
                        planned.context = taskContext
                            ? `${taskContext}\n\n${requirementsContext}`
                            : requirementsContext;
                    }
                    // A task title is a real planning datum; use it as a final
                    // fallback so an otherwise valid write never reaches the
                    // generator with an empty semantic requirement.
                    if (!String(planned.description || '').trim()) planned.description = taskDesc;
                }

                if (toolName === 'react_project'
                    && projectContext?.createsNewProject === true
                    && String(projectContext?.projectName || '').trim()
                    && !String(planned.projectName || '').trim()) {
                    planned.projectName = String(projectContext.projectName).trim();
                    appendLog(`[PhaseExecutor] react_project: inherited canonical project identity (${planned.projectName})`);
                }

                applyPhaseExecutionEvidence(toolName, planned, projectContext, logs);

                // Builder tools establish the artifact identity for the rest of
                // the phase. Downstream package/install commands must execute
                // inside that artifact, not silently fall back to the workspace
                // root when the planner omitted cwd/projectPath.
                inheritRuntimeProjectArguments(toolName, planned, projectContext, logs);

                const adaptedPlanned = adaptPlannedArgs(toolName, planned);
                const toolArgs = adaptPlannedArgsFromDescription(toolName, adaptedPlanned, taskDesc);
                const argsIssue = plannedArgsIssue(toolName, toolArgs);
                if (argsIssue) {
                    appendLog(`[PhaseExecutor] ⏭️ Task ${i + 1}: "${taskDesc}" — ${argsIssue}`);
                    results.push({ task: taskDesc, tool: 'manual', ok: true, message: argsIssue });
                    completedCount++;
                    continue;
                }

                const dependencyPreflight = await ensureNpmScriptDependencies(
                    toolName,
                    toolArgs,
                    projectContext,
                    liveExecutionContext(),
                    appendLog,
                );
                if (!dependencyPreflight.ok) {
                    const preflightError = dependencyPreflight.error;
                    appendLog(`[PhaseExecutor] ❌ Task ${i + 1} blocked by npm preflight: ${preflightError}`);
                    results.push({
                        task: taskDesc,
                        tool: toolName,
                        ok: false,
                        error: preflightError,
                        ...(toolName === 'shell_execute' && typeof toolArgs.command === 'string'
                            ? { command: toolArgs.command.slice(0, 1000) }
                            : {}),
                        ...(typeof (toolArgs.cwd || toolArgs.projectPath) === 'string' ? { cwd: String(toolArgs.cwd || toolArgs.projectPath).slice(0, 1000) } : {}),
                    });
                    if (task.priority === 'high' || task.required === true) break;
                    continue;
                }

                try {
                    const toolResult = await executeTool(toolName, toolArgs, {
                        ...liveExecutionContext(),
                        onProgress: (m: string) => context?.onProgress?.(`[${toolName}] ${m}`),
                    });

                    if (toolResult.ok) {
                        appendLog(`[PhaseExecutor] ✅ Task ${i + 1} completed: ${toolName}`);
                        bindRuntimeProjectFromEvidence(toolName, toolArgs, toolResult, projectContext, logs);
                        syncRuntimeProjectContext(projectContext, logs);
                        /**
                         * THE BUILDER'S OWN WORDS SURVIVE THE PHASE.
                         *
                         * His prompt ended with «At the end, show me plainly
                         * what you actually built and what you did not» — and
                         * he got a list of three phase names. The answer he
                         * asked for was WRITTEN: `react_project` composes a
                         * message naming the live streaming, the video calls
                         * and the AI diagnosis it did NOT build, the two QA
                         * scores, and the owner account. This line threw all
                         * of it away — `{task, tool, ok}` and nothing else —
                         * so the pipeline's report had nothing to carry.
                         *
                         * Bounded, because a report is read, not scrolled.
                         */
                        const output = (toolResult as any)?.output || {};
                        // Most builder tools return a prose message, while shell tools
                        // deliberately return structured stdout/stderr. Preserve both
                        // contracts so a successful terminal task is visible in the
                        // phase report instead of looking like an empty completion.
                        const stdout = String(output.stdout || '').trim();
                        const stderr = String(output.stderr || '').trim();
                        const terminalReport = toolName === 'shell_execute' && (stdout || stderr)
                            ? `${stdout}${stdout && stderr ? '\n' : ''}${stderr ? `stderr: ${stderr}` : ''}`
                            : '';
                        const said = String(output.message || terminalReport).trim();
                        results.push({
                            task: taskDesc, tool: toolName, ok: true,
                            ...(said ? { message: said.slice(0, 8000) } : {}),
                        });
                        completedCount++;
                    } else {
                        const errMsg = String(toolResult.error || 'Unknown error');
                        const failedOutput = (toolResult as any)?.output || {};
                        const failureText = `${errMsg}\n${String(failedOutput.stderr || '')}\n${String(failedOutput.stdout || '')}`;

                        // Evidence-aware launcher recovery. Do not invent a
                        // `server` script and do not rewrite arbitrary npm
                        // commands: inspect the manifest and retry only when
                        // the repository proves a valid launcher exists.
                        if (toolName === 'shell_execute' && /missing script/i.test(failureText)) {
                            const launcher = recoverMissingNpmLauncher(
                                toolArgs.command,
                                taskDesc,
                                toolArgs.cwd,
                                executionContext.workspaceId,
                                toolArgs.background,
                            );
                            if (launcher) {
                                const launcherArgs = { ...toolArgs, ...launcher };
                                appendLog(`[PhaseExecutor] 🔎 Missing npm script detected; package evidence at ${launcher.manifest} selects npm run ${launcher.script}.`);
                                try {
                                    const launcherResult = await executeTool(toolName, launcherArgs, {
                                        ...liveExecutionContext(),
                                        onProgress: (m: string) => context?.onProgress?.(`[${toolName} MANIFEST RECOVERY] ${m}`),
                                    });
                                    if (launcherResult.ok) {
                                        appendLog(`[PhaseExecutor] ✅ Manifest-aware launcher recovery succeeded: npm run ${launcher.script}`);
                                        results.push({ task: taskDesc, tool: toolName, ok: true, message: `Used package.json script ${launcher.script} after the requested npm script was absent.` });
                                        completedCount++;
                                        continue;
                                    }
                                    appendLog(`[PhaseExecutor] ⚠️ Manifest-aware launcher recovery failed: ${String(launcherResult.error || 'unknown error')}`);
                                } catch (launcherError: any) {
                                    appendLog(`[PhaseExecutor] ⚠️ Manifest-aware launcher recovery threw: ${String(launcherError?.message || launcherError)}`);
                                }
                            }
                        }
                        // A blocked delivery can still provide a live draft, a
                        // preview link and the precise QA evidence. Keep that
                        // report visible instead of reducing it to one error line.
                        const failedMessage = String(failedOutput.message || '').trim();
                        appendLog(`[PhaseExecutor] ❌ Task ${i + 1} failed: ${toolName} — ${errMsg}`);
                        results.push({
                            task: taskDesc,
                            tool: toolName,
                            ok: false,
                            error: errMsg,
                            ...(failedMessage ? { message: failedMessage.slice(0, 8000) } : {}),
                            ...(toolName === 'shell_execute' && typeof toolArgs.command === 'string'
                                ? { command: toolArgs.command.slice(0, 1000) }
                                : {}),
                            ...(typeof (toolArgs.cwd || toolArgs.projectPath || failedOutput.cwd || failedOutput.projectPath) === 'string'
                                ? { cwd: String(toolArgs.cwd || toolArgs.projectPath || failedOutput.cwd || failedOutput.projectPath).slice(0, 1000) }
                                : {}),
                            ...(toolName === 'shell_execute' && typeof toolArgs.background === 'boolean'
                                ? { background: toolArgs.background }
                                : {}),
                            ...fileFailureEvidence(toolName, toolArgs),
                        });

                        if (task.priority === 'high' || task.required === true) {
                            appendLog('[PhaseExecutor] ⚠️ High-priority task failed. Retrying once...');
                            try {
                                const retryResult = await executeTool(toolName, toolArgs, {
                                    ...liveExecutionContext(),
                                    onProgress: (m: string) => context?.onProgress?.(`[${toolName} RETRY] ${m}`),
                                });
                                if (retryResult.ok) {
                                    appendLog(`[PhaseExecutor] ✅ Retry succeeded for task ${i + 1}: ${toolName}`);
                                    results[results.length - 1] = { task: taskDesc, tool: toolName, ok: true };
                                    completedCount++;
                                } else {
                                    appendLog('[PhaseExecutor] ⛔ Retry also failed. Stopping phase.');
                                    break;
                                }
                            } catch (retryErr: any) {
                                appendLog(`[PhaseExecutor] ⛔ Retry threw error: ${retryErr?.message}. Stopping phase.`);
                                break;
                            }
                        }
                    }
                } catch (toolError: any) {
                    const errMsg = String(toolError?.message || toolError || 'Execution error');
                    appendLog(`[PhaseExecutor] ❌ Task ${i + 1} threw: ${errMsg}`);
                    results.push({
                        task: taskDesc,
                        tool: toolName,
                        ok: false,
                        error: errMsg,
                        ...(toolName === 'shell_execute' && typeof toolArgs.command === 'string'
                            ? { command: toolArgs.command.slice(0, 1000) }
                            : {}),
                        ...(typeof (toolArgs.cwd || toolArgs.projectPath) === 'string'
                            ? { cwd: String(toolArgs.cwd || toolArgs.projectPath).slice(0, 1000) }
                            : {}),
                        ...(toolName === 'shell_execute' && typeof toolArgs.background === 'boolean'
                            ? { background: toolArgs.background }
                            : {}),
                        ...fileFailureEvidence(toolName, toolArgs),
                    });

                    if (task.priority === 'high' || task.required === true) {
                        appendLog('[PhaseExecutor] ⛔ Critical task threw. Stopping phase.');
                        break;
                    }
                }
            }

            const allOk = results.length > 0 && results.every(r => r.ok);
            let status = allOk ? 'completed' : (completedCount > 0 ? 'partial' : 'failed');
            // This is evidence, not merely an English error message. Downstream
            // orchestration must distinguish a code task that failed to run from
            // a phase whose explicit acceptance check disproved delivery.
            let verificationFailed = false;

            appendLog(`[PhaseExecutor] Phase ${phase.phaseNumber} ${status}: ${completedCount}/${totalTasks} tasks completed`);

            if (phase.verificationTask && allOk) {
                const vTask = phase.verificationTask;
                // Same law as the tasks: a verification step that names a tool
                // nobody has verifies nothing. project_detect always exists and
                // answers the only question that matters — is it really there?
                const vToolName = resolvePlannedTool(String(vTask.tool || '').trim()).tool || 'project_detect';
                const vTaskDesc = String(vTask.task || 'Verify phase output');
                appendLog(`[PhaseExecutor] 🧪 Running verification: "${vTaskDesc}" with ${vToolName}`);

                try {
                    // Verification is a real tool invocation, not privileged prose.
                    // Apply the same context injection and argument adaptation used
                    // for ordinary phase tasks so `code_reviewer` and file tools
                    // observe the selected workspace rather than the API process cwd.
                    const plannedVerification: any = { ...(vTask.args || {}), ...(vTask.input || {}) };
                    if (executionContext.sessionId && typeof plannedVerification.sessionId !== 'string') plannedVerification.sessionId = executionContext.sessionId;
                    if (executionContext.workspaceId && typeof plannedVerification.workspaceId !== 'string') plannedVerification.workspaceId = executionContext.workspaceId;
                    // A reviewer that merely ran is not proof that its output is
                    // acceptable. Keep exploratory reviews informative, but make a
                    // review selected as a phase acceptance check enforce a clear,
                    // conservative quality floor unless the evidence-backed plan
                    // explicitly asks for a stricter one.
                    if (vToolName === 'code_reviewer') {
                        const suppliedScore = Number(plannedVerification.minimumScore);
                        plannedVerification.minimumScore = Number.isFinite(suppliedScore)
                            ? Math.max(70, suppliedScore)
                            : 70;
                        plannedVerification.failOnCritical = true;
                    }
                    // Verification calls are still planned tool calls. Apply the
                    // same accepted project identity used by ordinary tasks so a
                    // live check never falls back silently to the workspace root.
                    applyPhaseExecutionEvidence(vToolName, plannedVerification, projectContext, logs);
                    const adaptedVerification = adaptPlannedArgs(vToolName, plannedVerification);
                    const verificationArgs = adaptPlannedArgsFromDescription(vToolName, adaptedVerification, vTaskDesc);
                    const verificationArgsIssue = plannedArgsIssue(vToolName, verificationArgs);
                    if (verificationArgsIssue) {
                        appendLog(`[PhaseExecutor] ⚠️ Verification input invalid: ${verificationArgsIssue}`);
                        results.push({ task: vTaskDesc, tool: vToolName, ok: false, error: verificationArgsIssue });
                        verificationFailed = true;
                        status = 'partial';
                    } else {
                        const vResult = await executeTool(vToolName, verificationArgs, executionContext);

                        if (vResult.ok) {
                        appendLog(`[PhaseExecutor] ✅ Verification passed for Phase ${phase.phaseNumber}`);
                        results.push({ task: vTaskDesc, tool: vToolName, ok: true });
                        } else {
                            const vErr = String(vResult.error || 'Verification failed');
                            appendLog(`[PhaseExecutor] ⚠️ Verification failed: ${vErr}`);
                            results.push({ task: vTaskDesc, tool: vToolName, ok: false, error: vErr });
                            verificationFailed = true;
                            status = 'partial';
                        }
                    }
                } catch (vError: any) {
                    appendLog(`[PhaseExecutor] ⚠️ Verification error: ${vError.message}`);
                    results.push({ task: vTaskDesc, tool: vToolName, ok: false, error: vError.message });
                    verificationFailed = true;
                    status = 'partial';
                }
            }

            const hasCodeTasks = tasks.some((t: any) =>
                ['ai_write_file', 'write_file', 'file_edit', 'file_edit_advanced', 'scaffold_project'].includes(String(t.tool || ''))
            );
            if (hasCodeTasks && !phase.verificationTask && allOk && executionContext.workspaceId) {
                // The check must run WHERE the project lives and ONLY when there
                // is build tooling to check. The old version ran `npm run build`
                // at the workspace ROOT: generated projects live in subfolders,
                // so npm found no package.json, printed an error, and every
                // code phase was falsely marked partial — self-fix churn over a
                // build that never existed. The project dir is derived from the
                // plan's own written package.json path; no package.json written
                // means nothing to build, and skipping is the honest verdict.
                const writtenPaths = tasks
                    .map((t: any) => String(t?.args?.path || t?.args?.filename || t?.input?.path || t?.input?.filename || ''))
                    .filter(Boolean);
                const pkgPath = writtenPaths.find((p: string) => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/')));
                if (!pkgPath) {
                    appendLog('[PhaseExecutor] ℹ️ Auto-build check skipped honestly: this phase wrote no package.json, so there is no build to run.');
                } else {
                    const projectDir = pkgPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
                    appendLog(`[PhaseExecutor] 🔍 Auto-running build check in ${projectDir || 'workspace root'}...`);
                    try {
                        const buildResult = await executeTool('shell_execute', {
                            // --if-present: a project without a build script is
                            // NOT a failure (most simple Node apps have none).
                            command: 'npm run --if-present build 2>&1 || echo BUILD_CHECK_FAILED',
                            ...(projectDir ? { cwd: projectDir } : {}),
                            timeout: 300000,
                        }, executionContext);
                        const buildOutput = String((buildResult as any)?.output?.stdout || (buildResult as any)?.output || '');
                        if (buildOutput.includes('BUILD_CHECK_FAILED') || !buildResult.ok) {
                            const buildError = String((buildResult as any)?.error || 'Auto-build check failed');
                            appendLog(`[PhaseExecutor] ⚠️ Auto-build check found issues — orchestrator should route to self-fix: ${buildError}`);
                            results.push({ task: 'Auto-build check', tool: 'shell_execute', ok: false, error: buildError });
                            verificationFailed = true;
                            status = 'partial';
                        } else {
                            appendLog('[PhaseExecutor] ✅ Auto-build check passed');
                        }
                    } catch {
                        appendLog('[PhaseExecutor] ℹ️ Auto-build check errored — treated as skipped, not as failure');
                    }
                }
            }

            // A partial phase contains useful artefacts, but it is not verified
            // delivery. Propagating ok:true here previously let pipeline and chat
            // callers mistake a failed check for a completed engineering phase.
            const ok = status === 'completed';
            const primaryError = ok ? undefined : (results.find(r => !r.ok)?.error || (status === 'partial' ? 'Phase completed only partially' : 'Phase failed'));
            // ToolService may serialize the phase result before AgentLoop starts
            // the next phase. Carry only the root already proven by this executor
            // so later phases and self-fix reruns cannot fall back to the workspace
            // parent. This is evidence propagation, not a guessed project path.
            const runtimeProjectEvidence = projectContext?.projectRootRuntimeBound === true
                && String(projectContext?.projectRoot || '').trim()
                ? {
                    projectRoot: path.resolve(String(projectContext.projectRoot)),
                    projectRootRuntimeBound: true,
                }
                : {};

            return {
                ok,
                error: primaryError,
                output: {
                    ...runtimeProjectEvidence,
                    phaseNumber: phase.phaseNumber,
                    phaseName: phase.name,
                    status,
                    completedTasks: completedCount,
                    totalTasks,
                    results,
                    nextPhase: phase.phaseNumber + 1,
                    deliverables: phase.deliverables || [],
                    estimatedTime: phase.estimatedTime || 'unknown',
                    ...(verificationFailed ? { verificationFailed: true } : {})
                },
                logs
            };

        } catch (error: any) {
            appendLog(`[PhaseExecutor] Fatal error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                output: {
                    ...(projectContext?.projectRootRuntimeBound === true && String(projectContext?.projectRoot || '').trim()
                        ? {
                            projectRoot: path.resolve(String(projectContext.projectRoot)),
                            projectRootRuntimeBound: true,
                        }
                        : {}),
                    phaseNumber: phase?.phaseNumber,
                    status: 'fatal_error',
                    completedTasks: completedCount,
                    totalTasks: Array.isArray(phase?.tasks) ? phase.tasks.length : 0,
                    results,
                    nextPhase: phase?.phaseNumber
                },
                logs
            };
        }
    }
}
