import { ToolDefinition, ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';
import { isWithinRoot } from '../path-containment';
import { persistJoeProjects, samePipelineRun, writeJoeProject } from '../../../api/page-store';
import { workspaceService } from '../../services/WorkspaceService';

import { recoverMissingNpmLauncher } from '../npm-launcher-recovery';
export { recoverMissingNpmLauncher } from '../npm-launcher-recovery';
import { executeTool } from '../../services/ToolService';
import { normalizeConceptualArtifactPath } from '../runtime-artifact-path';
import { compactApiSelectionArtifact } from '../../../core/api-discovery/integration-profiles';
import type { ApiSelectionArtifact } from '../../../core/api-discovery/types';
import { capabilityProfilesFor } from '../../../core/capabilities/decision-profiles';
import {
    compactVerificationLedger,
    isVerificationTool,
    recordVerification,
    selectVerification,
    verificationResultFrom,
    verificationResultFromToolResult,
    summarizeVerificationLedger,
    type VerificationSelection,
} from '../../../core/quality/verification-ledger';
import { loadEngineeringCheckpoint, saveEngineeringCheckpoint, checkpointPhase, checkpointTool, engineeringCheckpointKey, loadAllRunCheckpoints, clearAllRunCheckpoints } from '../../../core/resume/engineering-checkpoint';

type PhaseDeliveryEvidence = {
    accepted?: boolean;
    blockers?: string[];
    askedButMissing?: string[];
    fidelityMismatch?: boolean;
    acceptanceBlocked?: boolean;
    acceptanceUnmet?: string[];
    requestedVisualAudit?: boolean;
    visualAuditUnavailable?: boolean;
};

type CapabilityDecisionEvidence = {
    version: 1;
    family: string;
    selected: { id: string; route: string; setup: string; reliability: string } | null;
    requiredUserAction: string | null;
};

/** Rebuild decision evidence from Joe-maintained profiles before it leaves a phase. */
function compactCapabilityDecisionEvidence(value: any): CapabilityDecisionEvidence | null {
    const receipt = value?.receipt;
    const family = String(receipt?.family || '').trim().toLowerCase();
    if (receipt?.version !== 1 || !family) return null;
    const selectedId = String(receipt?.selected?.id || '').trim();
    const selected = capabilityProfilesFor(family).find(candidate => candidate.id === selectedId);
    if (!selected) return {
        version: 1, family, selected: null, requiredUserAction: null,
    };
    const requiredUserAction = receipt?.requiredUserAction === selected.setup && selected.setup !== 'ZERO_SETUP'
        ? selected.setup : null;
    return {
        version: 1,
        family,
        selected: { id: selected.id, route: selected.route, setup: selected.setup, reliability: selected.reliability },
        requiredUserAction,
    };
}

/**
 * Carry only the bounded acceptance/fidelity contract across the executor
 * boundary. Builder messages, file lists, and arbitrary output remain at the
 * tool boundary; the orchestrator receives the exact verdict fields needed for
 * a controlled repair or an honest blocker.
 */
function compactPhaseDeliveryEvidence(value: unknown): PhaseDeliveryEvidence | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const raw = value as Record<string, unknown>;
    const out: PhaseDeliveryEvidence = {};
    const copyList = (key: 'blockers' | 'askedButMissing' | 'acceptanceUnmet') => {
        if (!Array.isArray(raw[key])) return;
        const items = raw[key]
            .map(item => String(item ?? '').trim())
            .filter(Boolean)
            .slice(0, 20);
        if (items.length) out[key] = items;
    };
    copyList('blockers');
    copyList('askedButMissing');
    copyList('acceptanceUnmet');
    for (const key of ['accepted', 'fidelityMismatch', 'acceptanceBlocked', 'requestedVisualAudit', 'visualAuditUnavailable'] as const) {
        if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
    }
    return Object.keys(out).length ? out : undefined;
}

function mergePhaseDeliveryEvidence(
    current: PhaseDeliveryEvidence | undefined,
    next: PhaseDeliveryEvidence | undefined,
): PhaseDeliveryEvidence | undefined {
    if (!current) return next;
    if (!next) return current;
    const merged: PhaseDeliveryEvidence = { ...current, ...next };
    for (const key of ['blockers', 'askedButMissing', 'acceptanceUnmet'] as const) {
        const values = [...(current[key] || []), ...(next[key] || [])];
        if (values.length) merged[key] = Array.from(new Set(values)).slice(0, 20);
    }
    return merged;
}

import { resolveToolPath } from '../utils';
import { resolvePlannedTool, unrunnableShellStep, adaptPlannedArgs, adaptPlannedArgsFromDescription, plannedArgsIssue, LATE_BOUND_PLAN_FIELDS } from '../../../core/orchestrator/plan-tools';

const FILE_MUTATION_TOOLS = new Set([
    'write_file', 'ai_write_file', 'file_edit', 'file_edit_advanced', 'bulk_file_generator',
]);

function mutationPathsFor(toolName: string, args: Record<string, any>): string[] {
    if (!FILE_MUTATION_TOOLS.has(toolName)) return [];
    const direct = [args.path, args.filename, args.filePath, args.targetPath]
        .map(value => String(value || '').trim())
        .filter(Boolean);
    const nested = Array.isArray(args.files)
        ? args.files.flatMap((item: any) => [item?.path, item?.filename, item?.filePath]
            .map(value => String(value || '').trim()).filter(Boolean))
        : [];
    return Array.from(new Set([...direct, ...nested])).slice(0, 64);
}

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

/**
 * A preview server is a different kind of success from a finite shell command:
 * it succeeds when its declared project answers HTTP, not when npm exits. Keep
 * that distinction at the phase boundary. The server contract is explicit in
 * the task description; the command text alone (especially the word `dev`) is
 * never enough to opt into it.
 */
export function reactProjectServerFallback(
    command: unknown,
    taskDescription: unknown,
    taskArgs: Record<string, any> = {},
    projectContext?: Record<string, any>,
    workspaceId?: string,
): { cwd: string; script: string } | null {
    const rawCommand = String(command || '').trim();
    const description = String(taskDescription || '').trim();
    const serverTask = /(?:\b(?:start|launch|serve|preview|open)\b|\b(?:development|dev|live)\s+server\b|تشغيل|شغّل|ابدأ|الخادم|خادم|معاينة|افتح)/iu.test(description);
    if (!serverTask) return null;

    // Only a single, manifest-backed npm script is eligible. Chained shell
    // commands remain ordinary shell work and retain their exit semantics.
    const commandMatch = rawCommand.match(/^npm\s+(?:(?:run|run-script)\s+([A-Za-z0-9:_-]+)|start)(?:\s+--\s+.*)?$/iu);
    const script = commandMatch?.[1] || (commandMatch ? 'start' : '');
    if (!script) return null;

    const runtimeRoot = projectContext?.projectRootRuntimeBound === true
        ? String(projectContext?.projectRoot || '').trim()
        : '';
    const candidate = runtimeRoot
        || String(taskArgs.cwd || taskArgs.projectPath || projectContext?.projectRoot || '').trim()
        || (() => {
            try { return String(workspaceService.getActiveRoot(workspaceId) || '').trim(); } catch { return ''; }
        })();
    if (!candidate) return null;

    // A runtime-bound root was established by the evidence binder and is already
    // constrained to the active workspace. Do not consult the mutable workspace
    // cache again for that trusted path; unbound candidates still require the
    // ordinary workspace containment check.
    const workspaceRoot = runtimeRoot ? '' : (() => {
        try { return path.resolve(String(workspaceService.getActiveRoot(workspaceId) || '').trim()); } catch { return ''; }
    })();
    const projectRoot = path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : path.resolve(workspaceRoot || process.cwd(), candidate);
    if (!runtimeRoot && workspaceRoot && !isWithinRoot(projectRoot, workspaceRoot)) return null;

    const manifestPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (typeof manifest?.scripts?.[script] !== 'string' || !manifest.scripts[script].trim()) return null;
    } catch { return null; }

    return { cwd: projectRoot, script };
}

export const RUNTIME_ARTIFACT_SOURCE_KEYS = new Set([
    'path', 'filename', 'filePath', 'sourceFile', 'targetPath',
    'schemaPath', 'databasePath',
]);

export const RUNTIME_ARTIFACT_SOURCE_ARRAY_KEYS = new Set(['files', 'filePaths', 'sourceFiles', 'paths']);

export const RUNTIME_LOGICAL_SOURCE_TOOLS = new Set([
    // The generator validates a logical destination and resolves it inside its delegated runtime context.
    'ai_write_file',
    // execute() consumes `code`; filePath is optional provenance metadata only.
    'pattern_recognize',
    // Initial discovery selects the active workspace before a generated artifact exists.
    'project_detect',
    // Selects and inspects the active workspace/project before planning.
    'engineering_discovery',
    // Returns the caller-selected project root for the overall orchestration pipeline.
    'project_pipeline',
    // Imports or clones a local folder into the active workspace.
    'import_project',
    // Uses nested files[].path relative to each entry's own cwd; the shallow mapper is not its contract.
    'bulk_file_generator',
    // Queries dot-notation inside an in-memory JSON value, not a filesystem path.
    'json_query',
    // Stores a knowledge-document label, not a project filesystem path.
    'knowledge_add',
    // Names the output file in the screenshots area, not an input artifact source.
    'screenshot',
    // Names an optional generated HTML output file, not an input artifact source.
    'web_page_builder',
    // Self-coding file access is constrained to Joe's current repository root.
    'repo_read_file',
    // Self-coding search is constrained to Joe's current repository root.
    'repo_search',
    // Self-coding patches target Joe's current repository root.
    'repo_apply_patch',
    // Legacy declaration; the registered search path is intentionally redirected elsewhere.
    'grep_search',
]);

export function mapRuntimeArtifactSourceArguments(
    toolName: string,
    planned: Record<string, any>,
    projectContext?: Record<string, any>,
    logs?: string[],
): Record<string, any> {
    const runtimeProjectRoot = String(projectContext?.projectRoot || '').trim();
    if (projectContext?.projectRootRuntimeBound !== true || !runtimeProjectRoot) return planned;

    const mapRuntimeArtifactSource = (value: unknown, key: string): string => {
        const existing = String(value || '').trim();
        if (!existing || path.isAbsolute(existing)) return existing;
        const projectName = String(projectContext?.projectName || '').trim();
        const logicalPath = normalizeConceptualArtifactPath(existing, projectName);
        const projectSegmentMatches = logicalPath !== existing;
        const candidate = path.resolve(runtimeProjectRoot, logicalPath);
        if (!isWithinRoot(candidate, runtimeProjectRoot)) return existing;
        logs?.push(projectSegmentMatches
            ? `[PhaseExecutor] ${toolName}: mapped conceptual ${key} onto runtime-bound artifact (${candidate.slice(0, 240)})`
            : `[PhaseExecutor] ${toolName}: resolved relative ${key} under runtime-bound artifact (${candidate.slice(0, 240)})`);
        return candidate;
    };

    if (RUNTIME_LOGICAL_SOURCE_TOOLS.has(toolName)) return planned;
    for (const [key, value] of Object.entries(planned)) {
        if (RUNTIME_ARTIFACT_SOURCE_KEYS.has(key) && typeof value === 'string') {
            planned[key] = mapRuntimeArtifactSource(value, key);
        } else if (RUNTIME_ARTIFACT_SOURCE_ARRAY_KEYS.has(key) && Array.isArray(value)) {
            planned[key] = value.map(entry => typeof entry === 'string'
                ? mapRuntimeArtifactSource(entry, key)
                : entry);
        }
    }
    return planned;
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
    // Source-oriented tools use a different vocabulary from discovery tools:
    // their target is usually `filePath`/`filename`, and reviewers often pass
    // arrays such as `files`. Once a builder has established the real artifact,
    // resolve these model-written paths at this trusted boundary so a leftover
    // `WeatherGo/src/App.jsx` cannot fall back to the workspace root. The key
    // sets below are the criterion: do not maintain a second tool-name whitelist.
    //
    // The key sets and logical exception set are exported so a registry census can
    // assert that every declared path input is intentionally classified.
    const runtimeLogicalSourceTools = RUNTIME_LOGICAL_SOURCE_TOOLS;
    const runtimeArtifactSourceKeys = RUNTIME_ARTIFACT_SOURCE_KEYS;
    const runtimeArtifactSourceArrayKeys = RUNTIME_ARTIFACT_SOURCE_ARRAY_KEYS;

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

    // quality_run and deploy_project may omit their project root in the plan
    // because the builder establishes it only at runtime. Carry the trusted
    // root into each tool's own vocabulary before schema validation; never
    // guess a workspace root and never overwrite an explicit path.
    if (toolName === 'quality_run' && !String(planned.path || '').trim()) {
        planned.path = runtimeProjectRoot;
        logs?.push(`[PhaseExecutor] quality_run: inherited path from runtime-bound project root (${runtimeProjectRoot.slice(0, 240)})`);
    }
    const deployProjectPathField = LATE_BOUND_PLAN_FIELDS.deploy_project?.[0];
    if (toolName === 'deploy_project' && deployProjectPathField) {
        const existingProjectPath = String(planned[deployProjectPathField] || '').trim();
        if (!existingProjectPath) {
            planned[deployProjectPathField] = runtimeProjectRoot;
            logs?.push(`[PhaseExecutor] deploy_project: inherited ${deployProjectPathField} from runtime-bound project root (${runtimeProjectRoot.slice(0, 240)})`);
        } else if (!path.isAbsolute(existingProjectPath)) {
            const normaliseSegment = (value: string) => value
                .replace(/\\/g, '/')
                .replace(/^\.\//u, '')
                .replace(/[-_]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLocaleLowerCase();
            const projectName = String(projectContext?.projectName || '').trim();
            const rawSegments = existingProjectPath.replace(/\\/g, '/').split('/').filter(Boolean);
            const firstSegment = rawSegments[0] || '';
            const projectSegmentMatches = !!projectName && !!firstSegment
                && normaliseSegment(firstSegment) === normaliseSegment(projectName);
            const relativeSegments = projectSegmentMatches ? rawSegments.slice(1) : rawSegments;
            const candidate = path.resolve(runtimeProjectRoot, relativeSegments.join(path.sep) || '.');
            if (isWithinRoot(candidate, runtimeProjectRoot)) {
                planned[deployProjectPathField] = candidate;
                logs?.push(`[PhaseExecutor] deploy_project: resolved ${deployProjectPathField} under runtime-bound root (${candidate.slice(0, 240)})`);
            }
        }
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

    mapRuntimeArtifactSourceArguments(toolName, planned, projectContext, logs);

    const cwdInheritedTools = new Set(['npm_manager', 'shell_execute', 'terminal_manager', 'auto_tester']);
    if (cwdInheritedTools.has(toolName)) {
        const explicitCwd = String(planned.cwd || planned.projectPath || '').trim();
        // npm always operates on the package-bearing runtime artifact. A model
        // may leave the conceptual project label (for example `WeatherGo`) in
        // cwd after react_project has rebound the real artifact. Passing that
        // label through reaches safePath as a missing directory and produces
        // the misleading `/bin/sh ENOENT` seen in a live repair rerun.
        if (toolName === 'npm_manager' && runtimeProjectRoot) {
            if (!explicitCwd || path.resolve(explicitCwd) !== path.resolve(runtimeProjectRoot)) {
                planned.cwd = runtimeProjectRoot;
                delete planned.projectPath;
                logs?.push(explicitCwd
                    ? `[PhaseExecutor] ${toolName}: replaced stale cwd with runtime-bound project root (${runtimeProjectRoot.slice(0, 240)})`
                    : `[PhaseExecutor] ${toolName}: inherited cwd from runtime-bound project root (${runtimeProjectRoot.slice(0, 240)})`);
            } else {
                planned.cwd = runtimeProjectRoot;
            }
        } else if (!explicitCwd) {
            planned.cwd = runtimeProjectRoot;
            logs?.push(`[PhaseExecutor] ${toolName}: inherited cwd from runtime-bound project root (${runtimeProjectRoot.slice(0, 240)})`);
        } else if (runtimeProjectRoot) {
            let resolvedExplicit = '';
            try {
                resolvedExplicit = path.isAbsolute(explicitCwd)
                    ? path.resolve(explicitCwd)
                    : path.resolve(runtimeProjectRoot, explicitCwd);
            } catch { /* fall through to the trusted artifact root */ }
            if (!resolvedExplicit || !isWithinRoot(resolvedExplicit, runtimeProjectRoot) || !fs.existsSync(resolvedExplicit)) {
                planned.cwd = runtimeProjectRoot;
                delete planned.projectPath;
                logs?.push(`[PhaseExecutor] ${toolName}: replaced stale or missing cwd with runtime-bound project root (${runtimeProjectRoot.slice(0, 240)})`);
            }
        }
    }

    // 051: General fallback normalization for fields not handled by a tool's
    // established contract. The fallback never invents a missing field and
    // never rewrites a source path whose owner resolves relative paths itself.
    if (projectContext?.projectRootRuntimeBound === true && projectContext?.projectRoot) {
        const root = String(projectContext.projectRoot).trim();
        if (root) {
            let workspaceRoot = '';
            const workspaceId = String(projectContext?.workspaceId || '').trim();
            if (workspaceId) {
                try {
                    workspaceRoot = path.resolve(workspaceService.getActiveRoot(workspaceId));
                } catch { /* use the trusted runtime root below */ }
            }
            for (const field of ['path', 'cwd', 'projectPath'] as const) {
                if (!Object.prototype.hasOwnProperty.call(planned, field)) continue;
                const current = String(planned[field] || '').trim();
                if (!current || path.isAbsolute(current)) continue;
                if (field === 'path' && runtimeLogicalSourceTools.has(toolName)) continue;
                if (current === '..' || current.startsWith('../') || current.startsWith('..\\')) continue;
                if (toolName === 'deploy_project' && field === 'projectPath') continue;

                const candidateUnderRoot = path.resolve(root, current);
                let resolvesOnDisk = false;
                try {
                    resolvesOnDisk = fs.existsSync(candidateUnderRoot)
                        || (!!workspaceRoot && fs.existsSync(path.resolve(workspaceRoot, current)));
                } catch { /* keep false */ }
                if (resolvesOnDisk) continue;

                // A multi-segment relative path is an intentional source or
                // nested target for the owning tool; only a single conceptual
                // path label (for example "WeatherGo") is safe to normalize.
                if (field === 'path' && /[\\/]/u.test(current)) continue;
                planned[field] = root;
                logs?.push(`[PhaseExecutor] ${toolName}: normalized conceptual ${field} onto runtime-bound artifact root (${root.slice(0, 120)})`);
            }
        }
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

//  ONE READER FOR ONE SECURITY QUESTION — see utils.isWithinRoot. Three
//  copies disagreed on three of seven measured cases on win32.

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

    // Greenfield plans commonly write a server entrypoint before the manifest.
    // A browser UI file such as src/App.tsx is not identity evidence: React
    // phases often write it before the scaffold/manifest is bound, and accepting
    // it would let a stale named directory become the runtime root. This is
    // deliberately narrow and accepts only server-shaped entrypoints.
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
    const runtimeEvidence = /(?:^|\/)(?:server|index|main)\.(?:js|mjs|cjs|ts)$/iu.test(relativeInsideChild);
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
    pipelineRunId: unknown,
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
    writeJoeProject(key, {
        ...previous,
        dir: candidate,
        type: previous.type || 'scaffold',
        updatedAt: Date.now(),
        lastRequest: String(projectContext?.projectName || path.basename(candidate)).slice(0, 120),
    }, pipelineRunId);
    try { persistJoeProjects(); } catch { /* binding remains useful for this run */ }
    projectContext.projectRoot = candidate;
    projectContext.projectRootRuntimeBound = true;
    logs.push(`[PhaseExecutor] runtime project evidence bound ${key} -> ${candidate}`);
}

export function canSyncRuntimeProjectContext(projectContext: Record<string, any>, active: Record<string, any> | undefined, pipelineRunId: unknown): boolean {
    return samePipelineRun(pipelineRunId, active?.pipelineRunId);
}

function syncRuntimeProjectContext(projectContext: Record<string, any>, pipelineRunId: unknown, logs: string[]): void {
    const key = sessionProjectKey(projectContext?.sessionId);
    const active = (global as any).joeProjects?.[key];
    if (!canSyncRuntimeProjectContext(projectContext, active, pipelineRunId)) {
        logs.push('[PhaseExecutor] refused to synchronize active project root without a matching pipeline run');
        return;
    }
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

/**
 * Rebase only stale absolute evidence that is demonstrably an older artifact
 * with the same canonical project label. A failed tool can preserve its planned
 * path verbatim even after this phase has bound a fresh runtime artifact; that
 * path must not send SelfFix back into `my-workspace/WeatherGo`. Never rewrite
 * paths outside the active workspace or paths without an exact project-label
 * segment: those are not proven to belong to this run.
 */
/**
 * Return only an absolute path already proven to belong to this run's bound
 * artifact. Older code rebased a path from a previous project onto the new
 * root, which made an efb3 failure look like evidence from the current run.
 * That is unsafe: the path may describe a different source file entirely.
 */
function rebaseStaleRuntimeEvidencePath(value: unknown, projectContext?: Record<string, any>): string {
    const raw = String(value ?? '').trim();
    const runtimeRoot = String(projectContext?.projectRoot || '').trim();
    if (!raw || !runtimeRoot || projectContext?.projectRootRuntimeBound !== true || !path.isAbsolute(raw)) return raw;

    const boundRoot = path.resolve(runtimeRoot);
    const resolved = path.resolve(raw);
    return isWithinRoot(resolved, boundRoot) ? resolved : '';
}

/**
 * Stale-run classification belongs to structured evidence, never to prose.
 *
 * Older code scanned the complete diagnostic and replaced any absolute path
 * outside the current artifact with `[STALE_RUN_EVIDENCE_DROPPED]`. That
 * silently corrupted runtime-contract diagnostics such as `manifest:` paths,
 * which then made a valid package manifest look unreadable and produced a
 * false undeclared-`react` failure. Keep the original diagnostic untouched;
 * classify stale evidence only when a tool/result explicitly supplies a
 * status, mismatched run identity, or a separately structured project root.
 */
export function classifyStructuredRuntimeEvidence(
    toolResult: any,
    toolArgs: Record<string, any> = {},
    projectContext?: Record<string, any>,
    currentRunId?: unknown,
): {
    evidenceStatus: 'current_run' | 'stale_run_dropped';
    staleEvidence?: string;
} {
    const output = toolResult?.output && typeof toolResult.output === 'object'
        ? toolResult.output
        : {};
    const explicitStatus = String(toolResult?.evidenceStatus || output.evidenceStatus || '').trim().toLowerCase();
    const runId = String(currentRunId || projectContext?.runId || '').trim();
    const structuredRunIds = [toolResult?.runId, output.runId, toolArgs?.runId]
        .map(value => String(value || '').trim())
        .filter(Boolean);
    const mismatchedRun = !!runId && structuredRunIds.some(candidate => candidate !== runId);

    let workspaceRoot = '';
    try { workspaceRoot = path.resolve(workspaceService.getActiveRoot(projectContext?.workspaceId)); } catch { /* no workspace evidence */ }
    const runtimeRoot = projectContext?.projectRootRuntimeBound === true
        ? String(projectContext?.projectRoot || '').trim()
        : '';
    const boundRoot = runtimeRoot ? path.resolve(runtimeRoot) : '';
    const structuredRoots = [
        toolResult?.projectRoot,
        output.projectRoot,
        toolArgs?.projectRoot,
        toolArgs?.cwd,
        toolArgs?.projectPath,
    ].map(value => String(value || '').trim())
        .filter(value => !!value && path.isAbsolute(value));
    const staleRoot = !!workspaceRoot && !!boundRoot && structuredRoots.some(candidate => {
        try {
            const resolved = path.resolve(candidate);
            return isWithinRoot(resolved, workspaceRoot) && !isWithinRoot(resolved, boundRoot);
        } catch {
            return false;
        }
    });
    const stale = explicitStatus === 'stale_run_dropped'
        || mismatchedRun
        || staleRoot;
    if (!stale) return { evidenceStatus: 'current_run' };

    const staleDiagnostic = boundedRepairEvidence(
        toolResult?.error || output.error || toolResult?.message || output.message || '',
        4000,
    );
    return {
        evidenceStatus: 'stale_run_dropped',
        ...(staleDiagnostic ? { staleEvidence: staleDiagnostic } : {}),
    };
}

function fileFailureEvidence(toolName: string, args: Record<string, any>, projectContext?: Record<string, any>): Record<string, string> {
    const cwd = rebaseStaleRuntimeEvidencePath(args?.cwd ?? args?.projectPath, projectContext);
    const evidence: Record<string, string> = cwd ? { cwd: cwd.slice(0, 1000) } : {};
    const explicitRepairFile = rebaseStaleRuntimeEvidencePath(args?.repairFile, projectContext);
    const fileTools = new Set(['write_file', 'ai_write_file', 'file_edit', 'file_edit_advanced', 'auto_tester']);
    if (!fileTools.has(toolName)) {
        return {
            ...evidence,
            ...(explicitRepairFile ? { repairFile: explicitRepairFile.slice(0, 1000) } : {}),
        };
    }
    const file = rebaseStaleRuntimeEvidencePath(
        args?.filename ?? args?.filePath ?? args?.path ?? args?.targetPath
        ?? (Array.isArray(args?.files) ? args.files[0] : ''),
        projectContext,
    );
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
        ...(explicitRepairFile ? { repairFile: explicitRepairFile.slice(0, 1000) } : {}),
        ...(find ? { find: find.slice(0, 4000) } : {}),
        ...(replace ? { replace: replace.slice(0, 4000) } : {}),
        ...(description ? { description } : {}),
        ...(artifactContext ? { artifactContext } : {}),
    };
}

/**
 * Builder tools can reject a model-authored asset before a file tool is visible
 * to the phase executor. Preserve the one explicit generated destination from
 * their structured output so SelfFix can make its single evidenced attempt.
 */
function generatedArtifactFailureEvidence(
    toolName: string,
    output: Record<string, any>,
    projectContext?: Record<string, any>,
): Record<string, string> {
    if (toolName !== 'react_project') return {};
    const authoredFiles = Array.isArray(output?.authoredFiles) ? output.authoredFiles : [];
    if (authoredFiles.length !== 1 || typeof authoredFiles[0] !== 'string') return {};
    const root = rebaseStaleRuntimeEvidencePath(output?.path ?? output?.projectDir, projectContext);
    if (!root) return {};
    const file = path.resolve(root, authoredFiles[0]);
    if (!path.relative(root, file) || !isWithinRoot(file, root)) return {};
    return { repairFile: file.slice(0, 1000) };
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
            executedTasks: { type: 'number' as const },
            skippedTasks: { type: 'number' as const },
            reusedTasks: { type: 'number' as const },
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

    /**
     * Parallel group definition for adaptive DAG planner integration.
     */
    private static ParallelGroup = {
        stepIds: [] as string[],
        canRunInParallel: false,
        reason: ''
    } as const;

    /**
     * Detect independent steps that can run in parallel (adapted from adaptive-dag-planner).
     * Only groups tasks explicitly marked as parallel: true.
     */
    private static detectParallelGroups(steps: { id: string; dependsOn: string[]; tool: string; parallel?: boolean }[]): Array<{ stepIds: string[]; canRunInParallel: boolean; reason: string }> {
        const groups: Array<{ stepIds: string[]; canRunInParallel: boolean; reason: string }> = [];
        const visited = new Set<string>();
        const adjacency = new Map<string, Set<string>>();
        const reverseAdjacency = new Map<string, Set<string>>();

        // Build dependency graph
        for (const step of steps) {
            if (!adjacency.has(step.id)) adjacency.set(step.id, new Set());
            if (!reverseAdjacency.has(step.id)) reverseAdjacency.set(step.id, new Set());
            for (const dep of step.dependsOn) {
                adjacency.get(dep)?.add(step.id);
                reverseAdjacency.get(step.id)?.add(dep);
            }
        }

        // Find all steps with no dependencies AND explicitly marked as parallel (can start immediately)
        const noDeps = steps.filter(s => s.dependsOn.length === 0 && s.parallel === true).map(s => s.id);
        if (noDeps.length > 1) {
            groups.push({
                stepIds: noDeps,
                canRunInParallel: true,
                reason: 'No dependencies and marked parallel - can start concurrently'
            });
        }

        // Find independent branches at each level (only parallel-marked steps)
        const processed = new Set(noDeps);
        let currentLevel = noDeps;

        while (currentLevel.length > 0) {
            const nextLevel: string[] = [];
            for (const stepId of currentLevel) {
                for (const next of adjacency.get(stepId) || []) {
                    const nextStep = steps.find(s => s.id === next);
                    if (!nextStep || nextStep.parallel !== true) continue;
                    const allDepsProcessed = Array.from(reverseAdjacency.get(next) || []).every(d => processed.has(d));
                    if (allDepsProcessed && !processed.has(next)) {
                        nextLevel.push(next);
                    }
                }
            }
            if (nextLevel.length > 1) {
                groups.push({
                    stepIds: nextLevel,
                    canRunInParallel: true,
                    reason: 'All dependencies satisfied and marked parallel - branch can run in parallel'
                });
            }
            for (const id of nextLevel) processed.add(id);
            currentLevel = nextLevel;
        }

        // Check for tool-type parallelism (same tool type, different inputs) - only for parallel-marked steps
        const toolGroups = new Map<string, string[]>();
        for (const step of steps) {
            if (step.parallel !== true) continue;
            if (!toolGroups.has(step.tool)) toolGroups.set(step.tool, []);
            toolGroups.get(step.tool)!.push(step.id);
        }
        for (const [tool, stepIds] of toolGroups) {
            if (stepIds.length > 1) {
                // Check if they're truly independent (no shared dependencies)
                const independent = stepIds.every(id =>
                    steps.find(s => s.id === id)?.dependsOn.every(d => !stepIds.includes(d)) !== false
                );
                if (independent) {
                    groups.push({
                        stepIds,
                        canRunInParallel: true,
                        reason: `Same tool (${tool}) with independent inputs`
                    });
                }
            }
        }

        return groups;
    }

    /**
     * Group tasks into parallel execution groups.
     * Tasks with parallel=true and no shared dependencies can run concurrently.
     */
    private static groupTasksForParallelExecution(tasks: any[]): any[][] {
        const groups: any[][] = [];
        let currentGroup: any[] = [];

        for (const task of tasks) {
            const isParallel = task.parallel === true;
            const hasDeps = Array.isArray(task.dependsOn) && task.dependsOn.length > 0;

            if (isParallel && !hasDeps) {
                currentGroup.push(task);
            } else {
                if (currentGroup.length > 0) {
                    groups.push([...currentGroup]);
                    currentGroup = [];
                }
                groups.push([task]);
            }
        }

        if (currentGroup.length > 0) {
            groups.push([...currentGroup]);
        }

        return groups;
    }

    /**
     * Build execution groups from tasks and parallel group detection.
     * Returns an array of groups, where each group is an array of tasks that can run in parallel.
     */
    private static buildExecutionGroups(
        tasks: any[],
        executionSteps: any[],
        parallelGroups: Array<{ stepIds: string[]; canRunInParallel: boolean; reason: string }>
    ): any[][] {
        const groups: any[][] = [];
        const taskById = new Map(tasks.map((t, i) => [executionSteps[i].id, t]));
        const processed = new Set<string>();

        // First, add parallel groups
        for (const pg of parallelGroups) {
            if (!pg.canRunInParallel) continue;
            const groupTasks = pg.stepIds
                .map(id => taskById.get(id))
                .filter(Boolean);
            if (groupTasks.length > 1) {
                groups.push(groupTasks);
                for (const id of pg.stepIds) processed.add(id);
            }
        }

        // Then add remaining tasks sequentially
        for (const step of executionSteps) {
            if (!processed.has(step.id)) {
                const task = taskById.get(step.id);
                if (task) groups.push([task]);
            }
        }

        return groups;
    }

    /**
     * Execute a single task with full error handling, verification, and checkpointing.
     */
    private static async executeSingleTask(
        task: any,
        taskIndex: number,
        totalTasks: number,
        formatTaskDesc: (desc: string) => string,
        deps: {
            phase: any;
            projectContext: any;
            executionContext: any;
            logs: string[];
            appendLog: (line: unknown) => void;
            results: any[];
            completedCount: { value: number };
            changedPhaseFiles: string[];
            verificationLedger: any;
            apiSelection: any;
            capabilityDecision: any;
            phaseDelivery: any;
            liveExecutionContext: () => any;
            trustedWorkspaceRoot: string;
            runtimeTargetFor: (toolName: string, args: Record<string, any>) => string;
            runtimeRevisionFor: (toolName: string) => string;
            bindRuntimeProjectFromEvidence: (toolName: string, toolArgs: Record<string, any>, toolResult: any, projectContext: any, runId: unknown, logs: string[]) => void;
            syncRuntimeProjectContext: (projectContext: any, runId: unknown, logs: string[]) => void;
            mutationPathsFor: (toolName: string, args: Record<string, any>) => string[];
            compactPhaseDeliveryEvidence: (value: unknown) => PhaseDeliveryEvidence | undefined;
            mergePhaseDeliveryEvidence: (current: PhaseDeliveryEvidence | undefined, next: PhaseDeliveryEvidence | undefined) => PhaseDeliveryEvidence | undefined;
            classifyStructuredRuntimeEvidence: (toolResult: any, toolArgs: Record<string, any>, projectContext: any, currentRunId?: unknown) => { evidenceStatus: 'current_run' | 'stale_run_dropped'; staleEvidence?: string };
            boundedRepairEvidence: (value: unknown, max?: number) => string;
            recoverMissingNpmLauncher: (command: string, taskDesc: string, cwd: string, workspaceId: string, background?: boolean) => any;
            fileFailureEvidence: (toolName: string, args: Record<string, any>, projectContext: any) => Record<string, string>;
            generatedArtifactFailureEvidence: (toolName: string, output: Record<string, any>, projectContext: any) => Record<string, string>;
            executeTool: (toolName: string, toolArgs: Record<string, any>, executionContext: any) => Promise<any>;
            context: any;
            verificationMetricsFrom: (result: any, timing: { selectedAt?: number; startedAt?: number; lastActivityAt?: number; finishedAt?: number; retryCount?: number }) => { evidenceLocation: string; queueMs: number; idleMs: number; retryCount: number };
        }
    ): Promise<{
        results: any[];
        completedCount: { value: number };
        verificationLedger: any;
        apiSelection: any;
        capabilityDecision: any;
        phaseDelivery: any;
        shouldBreak: boolean;
    }> {
        const {
            phase,
            projectContext,
            executionContext,
            logs,
            appendLog,
            results,
            completedCount,
            changedPhaseFiles,
            verificationLedger: initVerificationLedger,
            apiSelection: initApiSelection,
            capabilityDecision: initCapabilityDecision,
            phaseDelivery: initPhaseDelivery,
            liveExecutionContext,
            trustedWorkspaceRoot,
            runtimeTargetFor,
            runtimeRevisionFor,
            bindRuntimeProjectFromEvidence,
            syncRuntimeProjectContext,
            mutationPathsFor,
            compactPhaseDeliveryEvidence,
            mergePhaseDeliveryEvidence,
            classifyStructuredRuntimeEvidence,
            boundedRepairEvidence,
            recoverMissingNpmLauncher,
            fileFailureEvidence,
            generatedArtifactFailureEvidence,
            executeTool,
            context,
        } = deps;

        // Local mutable copies of values that may be updated during execution
        let verificationLedger = initVerificationLedger;
        let apiSelection = initApiSelection;
        let capabilityDecision = initCapabilityDecision;
        let phaseDelivery = initPhaseDelivery;
        const verificationMetricsFrom = deps.verificationMetricsFrom;

        const assertRunActive = () => {
            if (typeof context?.isCancelled === 'function' && context.isCancelled()) {
                throw new Error('run_cancelled_by_owner');
            }
        };

        const askedFor = String(task.tool || '').trim();
        const taskDesc = String(task.task || task.description || `Task ${taskIndex + 1}`);

        if (!askedFor || askedFor === 'manual') {
            appendLog(`[PhaseExecutor] Task ${taskIndex + 1}: "${taskDesc}" — skipped (manual/no tool)`);
            results.push({ task: taskDesc, tool: 'manual', ok: true, execution: 'skipped' });
            return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: false };
        }

        const resolved = resolvePlannedTool(askedFor);
        if (!resolved.tool) {
            appendLog(`[PhaseExecutor] ⏭️ Task ${taskIndex + 1}: "${taskDesc}" — «${askedFor}» ليست أداة في هذا النظام` +
                `${(resolved as any).why === 'not_software' ? ' (عمل تنظيمي بشري)' : ''}. تخطّيتُها ولم أوقف البناء.`);
            results.push({ task: taskDesc, tool: 'manual', ok: true, execution: 'skipped' });
            return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: false };
        }

        let toolName = resolved.tool;
        let rawTaskArgs: any = { ...(task.args || {}), ...(task.input || {}) };
        const browserStart = (toolName === 'shell_execute' || toolName === 'terminal_manager')
            ? reactProjectStartFallback(rawTaskArgs.command, taskDesc, rawTaskArgs, projectContext, executionContext.workspaceId)
            : null;
        const serverStart = !browserStart && (toolName === 'shell_execute' || toolName === 'terminal_manager')
            ? reactProjectServerFallback(rawTaskArgs.command, taskDesc, rawTaskArgs, projectContext, executionContext.workspaceId)
            : null;
        if (browserStart) {
            toolName = 'project_run';
            rawTaskArgs = { ...rawTaskArgs, cwd: browserStart.cwd };
            delete rawTaskArgs.command;
            delete rawTaskArgs.background;
            appendLog(`[PhaseExecutor] ↪️ Task ${taskIndex + 1}: replaced direct Node TypeScript launch with project_run (${browserStart.cwd.slice(0, 240)})`);
        } else if (serverStart) {
            toolName = 'project_run';
            rawTaskArgs = { ...rawTaskArgs, cwd: serverStart.cwd, command: `npm run ${serverStart.script}` };
            delete rawTaskArgs.background;
            appendLog(`[PhaseExecutor] ↪️ Task ${taskIndex + 1}: declared preview server uses project_run (${serverStart.cwd.slice(0, 240)})`);
        }
        if (toolName !== askedFor) {
            appendLog(`[PhaseExecutor] ↪️ «${askedFor}» تعني ${toolName} — نفّذتُ الأداة الحقيقية.`);
        }

        if (toolName === 'shell_execute' || toolName === 'terminal_manager') {
            const why = unrunnableShellStep(rawTaskArgs.command);
            if (why) {
                appendLog(`[PhaseExecutor] ⏭️ Task ${taskIndex + 1}: "${taskDesc}" — ${why}`);
                results.push({ task: taskDesc, tool: 'manual', ok: true, execution: 'skipped' });
                return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: false };
            }
        }

        appendLog(`[PhaseExecutor] Task ${taskIndex + 1}/${totalTasks}: "${taskDesc}" — executing tool: ${toolName}`);

        const planned: any = { ...rawTaskArgs };
        if (executionContext.sessionId && typeof planned.sessionId !== 'string') planned.sessionId = executionContext.sessionId;
        if (executionContext.workspaceId && typeof planned.workspaceId !== 'string') planned.workspaceId = executionContext.workspaceId;
        const requirementsContext = String(projectContext?.requirementsContext || '').trim();
        if (['api_project', 'react_project'].includes(toolName)) {
            const taskRequest = String(planned.request || '').trim();
            const evidenceMarker = 'COMPACT REQUIREMENTS EVIDENCE';
            const canonicalRequest = projectContext?.createsNewProject === true
                ? String(projectContext?.request || '').trim()
                : '';
            if (canonicalRequest) {
                planned.request = canonicalRequest;
            }
            if (requirementsContext
                && !taskRequest.includes(evidenceMarker)
                && !taskRequest.includes(requirementsContext.slice(0, 160))) {
                const baseRequest = canonicalRequest || taskRequest;
                planned.request = baseRequest
                    ? `${baseRequest}\n\n${requirementsContext}`
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
            if (!String(planned.description || '').trim()) planned.description = taskDesc;
        }

        if (['api_project', 'react_project'].includes(toolName)
            && projectContext?.createsNewProject === true
            && String(projectContext?.projectName || '').trim()
            && !String(planned.projectName || '').trim()) {
            planned.projectName = String(projectContext.projectName).trim();
            appendLog(`[PhaseExecutor] ${toolName}: inherited canonical project identity (${planned.projectName})`);
        }

        if (toolName === 'react_project' && apiSelection) {
            planned.apiSelection = apiSelection;
            appendLog(`[PhaseExecutor] react_project: received trusted API selection (${apiSelection.providerName})`);
        }
        if ((toolName === 'inspect_api' || toolName === 'validate_api')
            && apiSelection
            && !String(planned.apiId || '').trim()) {
            planned.apiId = apiSelection.apiId;
            appendLog(`[PhaseExecutor] ${toolName}: received trusted API id (${apiSelection.apiId})`);
        }

        const originalPlannedEvidence = { ...planned };
        applyPhaseExecutionEvidence(toolName, planned, projectContext, logs);
        inheritRuntimeProjectArguments(toolName, planned, projectContext, logs);

        const repairDescription = ['react_project', 'api_project'].includes(toolName)
            ? boundedRepairEvidence(planned.request || planned.description || taskDesc)
            : '';
        const repairContext = ['react_project', 'api_project'].includes(toolName)
            ? boundedRepairEvidence(planned.context || projectContext?.requirementsContext || '')
            : '';

        const adaptedPlanned = adaptPlannedArgs(toolName, planned);
        const toolArgs = adaptPlannedArgsFromDescription(toolName, adaptedPlanned, taskDesc);

        const requestedPublicExposure = toolName === 'deploy_project'
            && String(toolArgs?.action || '').trim().toLowerCase() === 'expose_port';
        const explicitlyApprovedPublicExposure = toolArgs?.allowPublicExposure === true
            || toolArgs?.approvedPublicExposure === true
            || projectContext?.allowPublicExposure === true
            || executionContext?.allowPublicExposure === true;
        if (requestedPublicExposure
            && executionContext.engineeringPipeline === true
            && !explicitlyApprovedPublicExposure) {
            appendLog(`[PhaseExecutor] ⏭️ Task ${taskIndex + 1}: "${taskDesc}" — skipped public expose_port during local engineering QA; project_run/localhost remains the verification path.`);
            results.push({
                task: taskDesc,
                tool: toolName,
                ok: true,
                execution: 'skipped',
                message: 'Skipped unapproved public exposure in the local engineering pipeline; use the verified loopback project_run URL.',
            });
            return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: false };
        }

        const argsIssue = plannedArgsIssue(toolName, toolArgs);
        if (argsIssue) {
            appendLog(`[PhaseExecutor] ⏭️ Task ${taskIndex + 1}: "${taskDesc}" — ${argsIssue}`);
            results.push({ task: taskDesc, tool: 'manual', ok: true, execution: 'skipped', message: argsIssue });
            return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: false };
        }

        const dependencyPreflight = await ensureNpmScriptDependencies(
            toolName,
            toolArgs,
            projectContext,
            liveExecutionContext(),
            appendLog,
        );
        assertRunActive();
        if (!dependencyPreflight.ok) {
            const preflightError = dependencyPreflight.error;
            appendLog(`[PhaseExecutor] ❌ Task ${taskIndex + 1} blocked by npm preflight: ${preflightError}`);
            results.push({
                task: taskDesc,
                tool: toolName,
                ok: false,
                execution: 'ran',
                error: preflightError,
                ...(toolName === 'shell_execute' && typeof toolArgs.command === 'string'
                    ? { command: toolArgs.command.slice(0, 1000) }
                    : {}),
                ...(typeof (toolArgs.cwd || toolArgs.projectPath) === 'string' ? { cwd: String(toolArgs.cwd || toolArgs.projectPath).slice(0, 1000) } : {}),
            });
            if (task.priority === 'high' || task.required === true) {
                return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: true };
            }
            return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: false };
        }

        let verificationSelection: VerificationSelection | undefined;
        let verificationStartedAt = 0;
        let verificationSelectedAt = 0;
        let verificationLastActivityAt = 0;
        const explicitlyMarkedVerification = Boolean(
            task.verificationId
            || task.verificationMode
            || task.verificationBoundary
            || rawTaskArgs.verificationId
            || rawTaskArgs.verificationMode
            || rawTaskArgs.verificationBoundary,
        );
        if (isVerificationTool(toolName, toolArgs, explicitlyMarkedVerification)) {
            const scopeRoot = String(
                toolArgs.cwd
                || toolArgs.projectPath
                || toolArgs.path
                || (executionContext?.projectRootRuntimeBound === true ? executionContext?.projectRoot : '')
                || (projectContext?.projectRootRuntimeBound === true ? projectContext?.projectRoot : '')
                || workspaceService.getActiveRoot(executionContext.workspaceId)
                || '',
            ).trim();
            console.error('[DEBUG PhaseExecutor] scopeRoot calculation:', { cwd: toolArgs.cwd, projectPath: toolArgs.projectPath, path: toolArgs.path, executionContextProjectRootRuntimeBound: executionContext?.projectRootRuntimeBound, executionContextProjectRoot: executionContext?.projectRoot, projectContextProjectRootRuntimeBound: projectContext?.projectRootRuntimeBound, projectContextProjectRoot: projectContext?.projectRoot, workspaceRoot: workspaceService.getActiveRoot(executionContext.workspaceId), finalScopeRoot: scopeRoot });
            const verificationId = String(
                task.verificationId
                || rawTaskArgs.verificationId
                || `${toolName}:${taskDesc}`,
            ).trim().slice(0, 240);
            const relevantPaths = [
                ...(Array.isArray(task.relevantPaths) ? task.relevantPaths : []),
                ...(Array.isArray(rawTaskArgs.verificationRelevantPaths) ? rawTaskArgs.verificationRelevantPaths : []),
            ].map((item: unknown) => String(item || '').trim()).filter(Boolean);
            const mode = task.verificationMode
                || rawTaskArgs.verificationMode
                || (projectContext?.isFinalPhase === true ? 'final' : 'focused');
            const boundary = String(task.verificationBoundary || rawTaskArgs.verificationBoundary || '').trim();
            if (!relevantPaths.length && !boundary) relevantPaths.push(...changedPhaseFiles);
            const runtimeRevision = runtimeRevisionFor(toolName);
            delete toolArgs.verificationId;
delete toolArgs.verificationMode;
            delete toolArgs.verificationBoundary;
            delete toolArgs.verificationRelevantPaths;
            delete toolArgs.verificationRuntimeRevision;
            if (scopeRoot) {
                const selected = selectVerification(verificationLedger, {
                    checkId: verificationId,
                    tool: toolName,
                    args: toolArgs,
                    workspaceId: String(executionContext.workspaceId || ''),
                    workspaceRoot: trustedWorkspaceRoot,
                    scopeRoot,
                    relevantPaths,
                    boundary,
                    boundaries: projectContext?.verificationBoundaries,
                    runtimeTarget: runtimeTargetFor(toolName, toolArgs),
                    runtimeRevision,
                    mode,
                });
                verificationLedger = selected.ledger;
                verificationSelection = selected.selection;
                appendLog(`[PhaseExecutor] verification ${selected.selection.action}: ${verificationId} — ${selected.selection.reason}`);
                if (selected.selection.action === 'reuse') {
                    results.push({
                        task: taskDesc,
                        tool: toolName,
                        ok: true,
                        execution: 'reused',
                        message: selected.selection.reason,
                    });
                    completedCount.value++;
                    return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: false };
                }
                verificationSelectedAt = Date.now();
            }
        }

        try {
            if (verificationSelection) {
                verificationStartedAt = Date.now();
                verificationLastActivityAt = verificationStartedAt;
            }
            const toolResult = await executeTool(toolName, toolArgs, {
                ...liveExecutionContext(),
                onProgress: (m: string) => {
                    if (verificationSelection) verificationLastActivityAt = Date.now();
                    context?.onProgress?.(`[${toolName}] ${m}`);
                },
            });
            assertRunActive();
            const verificationOutcome = verificationSelection
                ? verificationResultFromToolResult(toolResult)
                : undefined;

            // Checkpoint the tool execution (always, for resumption tracking)
            const workspaceRoot = executionContext.workspaceId
                ? String(workspaceService.getActiveRoot(executionContext.workspaceId) || '').trim()
                : '';
            // Use workspace root as stable artifact directory; project root may change when project is bound
            const artifactDir = String(workspaceRoot || executionContext.projectRoot || projectContext?.projectRoot || '');
            if (artifactDir && executionContext.runId) {
                checkpointTool(
                    artifactDir,
                    executionContext.runId,
                    phase.phaseNumber,
                    toolName,
                    taskDesc,
                    toolArgs,
                    toolResult,
                    projectContext,
                    executionContext
                );
            }

            if (toolResult.ok && (!verificationOutcome || verificationOutcome === 'passed')) {
                if (verificationSelection) {
                    verificationLedger = recordVerification(
                        verificationLedger,
                        verificationSelection,
                        verificationOutcome || 'passed',
                        Date.now() - verificationStartedAt,
                        Date.now(),
                        verificationMetricsFrom(toolResult, {
                            selectedAt: verificationSelectedAt,
                            startedAt: verificationStartedAt,
                            lastActivityAt: verificationLastActivityAt,
                        }),
                    );
                }
                const output = (toolResult as any)?.output || {};
                if (toolName === 'search_public_apis') {
                    apiSelection = compactApiSelectionArtifact(output.selection);
                    if (apiSelection) appendLog(`[PhaseExecutor] API selection captured for builder handoff: ${apiSelection.providerName}`);
                }
                if (toolName === 'decide_capability_route') {
                    capabilityDecision = compactCapabilityDecisionEvidence(output);
                    if (capabilityDecision?.selected) appendLog(`[PhaseExecutor] Capability decision captured: ${capabilityDecision.selected.route}`);
                }
                if (toolName === 'validate_api'
                    && apiSelection
                    && String(toolArgs.apiId || '').trim() === apiSelection.apiId
                    && output.api
                    && String(output.api.id || '').trim() === apiSelection.apiId) {
                    apiSelection = compactApiSelectionArtifact({
                        ...apiSelection,
                        health: output.api.health,
                        warnings: Array.from(new Set([
                            ...apiSelection.warnings,
                            ...(output.api.healthDetail ? [String(output.api.healthDetail)] : []),
                        ])),
                    });
                    if (apiSelection?.health === 'UNAVAILABLE') {
                        const validationError = `selected_api_unavailable:${apiSelection.apiId}`;
                        appendLog(`[PhaseExecutor] API_VALIDATION blocked integration: ${apiSelection.apiId} is unavailable`);
                        results.push({
                            task: taskDesc,
                            tool: toolName,
                            ok: false,
                            execution: 'ran',
                            error: validationError,
                        });
                        return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: true };
                    }
                    if (apiSelection) appendLog(`[PhaseExecutor] API selection health refreshed: ${apiSelection.health}`);
                }
                const stdout = String(output.stdout || '').trim();
                const stderr = String(output.stderr || '').trim();
                const terminalReport = toolName === 'shell_execute' && (stdout || stderr)
                    ? `${stdout}${stdout && stderr ? '\n' : ''}${stderr ? `stderr: ${stderr}` : ''}`
                    : '';
                const said = String(output.message || terminalReport).trim();
                results.push({
                    task: formatTaskDesc(taskDesc), tool: toolName, ok: true, execution: 'ran',
                    ...(said ? { message: said.slice(0, 8000) } : {}),
                });
                completedCount.value++;
                appendLog(`[PhaseExecutor] ✅ Task ${taskIndex + 1} completed: ${toolName}`);
                bindRuntimeProjectFromEvidence(toolName, toolArgs, toolResult, projectContext, executionContext.runId, logs);
                syncRuntimeProjectContext(projectContext, executionContext.runId, logs);
                changedPhaseFiles.push(...mutationPathsFor(toolName, toolArgs));
                if (changedPhaseFiles.length > 64) changedPhaseFiles.splice(0, changedPhaseFiles.length - 64);
                if (!verificationSelection && /^(?:browser_|visual_qa$)/u.test(toolName)) {
                    projectContext.browserRuntimeRevision = `interaction:${executionContext.runId || 'run'}:${Date.now()}:${taskIndex}`;
                }
                return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: false };
            } else {
                if (verificationSelection) {
                    verificationLedger = recordVerification(
                        verificationLedger,
                        verificationSelection,
                        verificationResultFromToolResult(toolResult),
                        Date.now() - verificationStartedAt,
                        Date.now(),
                        verificationMetricsFrom(toolResult, {
                            selectedAt: verificationSelectedAt,
                            startedAt: verificationStartedAt,
                            lastActivityAt: verificationLastActivityAt,
                        }),
                    );
                }
                bindRuntimeProjectFromEvidence(toolName, toolArgs, toolResult, projectContext, executionContext.runId, logs);
                syncRuntimeProjectContext(projectContext, executionContext.runId, logs);
                const errMsg = String(
                    toolResult.error
                    || (verificationOutcome ? `Verification ${verificationOutcome}` : '')
                    || 'Unknown error',
                );
                const failedOutput = (toolResult as any)?.output || {};
                const deliveryEvidence = compactPhaseDeliveryEvidence(failedOutput.delivery);
                const newPhaseDelivery = mergePhaseDeliveryEvidence(phaseDelivery, deliveryEvidence);
                const failureText = `${errMsg}\n${String(failedOutput.stderr || '')}\n${String(failedOutput.stdout || '')}`;
                const runEvidenceId = String(executionContext.runId || projectContext?.runId || '').trim();
                const runEvidenceRoot = projectContext?.projectRootRuntimeBound === true && String(projectContext?.projectRoot || '').trim()
                    ? path.resolve(String(projectContext.projectRoot))
                    : '';
                const evidenceClassification = classifyStructuredRuntimeEvidence(
                    toolResult,
                    originalPlannedEvidence,
                    projectContext,
                    runEvidenceId,
                );
                const currentRunError = errMsg;
                const staleRunEvidenceDropped = evidenceClassification.evidenceStatus === 'stale_run_dropped';
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
                            assertRunActive();
                            if (launcherResult.ok) {
                                appendLog(`[PhaseExecutor] ✅ Manifest-aware launcher recovery succeeded: npm run ${launcher.script}`);
                                results.push({ task: formatTaskDesc(taskDesc), tool: toolName, ok: true, execution: 'ran', message: `Used package.json script ${launcher.script} after the requested npm script was absent.` });
                                completedCount.value++;
                                return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery: newPhaseDelivery, shouldBreak: false };
                            }
                            appendLog(`[PhaseExecutor] ⚠️ Manifest-aware launcher recovery failed: ${String(launcherResult.error || 'unknown error')}`);
                        } catch (launcherError: any) {
                            appendLog(`[PhaseExecutor] ⚠️ Manifest-aware launcher recovery threw: ${String(launcherError?.message || launcherError)}`);
                        }
                    }
                }
                const failedMessage = String(failedOutput.message || '').trim();
                const repairKind = failedOutput.repairKind === 'regenerate_engine'
                    || failedOutput.repairKind === 'code_fix'
                    ? failedOutput.repairKind
                    : undefined;
                const repairFile = repairKind === 'code_fix' && typeof failedOutput.repairFile === 'string'
                    ? failedOutput.repairFile.slice(0, 1000)
                    : undefined;
                appendLog(`[PhaseExecutor] ❌ Task ${taskIndex + 1} failed: ${toolName} — ${errMsg}`);
                results.push({
                    task: formatTaskDesc(taskDesc),
                    tool: toolName,
                    ok: false,
                    execution: 'ran',
                    error: currentRunError,
                    ...((toolResult as any)?.recoverable === true ? { recoverable: true } : {}),
                    ...(failedMessage ? { message: failedMessage.slice(0, 8000) } : {}),
                    ...(repairKind ? { repairKind } : {}),
                    ...(repairFile ? { repairFile } : {}),
                    ...(runEvidenceId ? { runId: runEvidenceId } : {}),
                    ...(runEvidenceRoot ? { projectRoot: runEvidenceRoot } : {}),
                    ...(staleRunEvidenceDropped
                        ? { evidenceStatus: 'stale_run_dropped' as const }
                        : { evidenceStatus: 'current_run' as const }),
                    ...(evidenceClassification.staleEvidence
                        ? { staleEvidence: evidenceClassification.staleEvidence }
                        : {}),
                    ...(toolName === 'shell_execute' && typeof toolArgs.command === 'string'
                        ? { command: toolArgs.command.slice(0, 1000) }
                        : {}),
                    ...(!staleRunEvidenceDropped && typeof (toolArgs.cwd || toolArgs.projectPath || failedOutput.cwd || failedOutput.projectPath) === 'string'
                        ? { cwd: String(toolArgs.cwd || toolArgs.projectPath || failedOutput.cwd || failedOutput.projectPath).slice(0, 1000) }
                        : {}),
                    ...(toolName === 'shell_execute' && typeof toolArgs.background === 'boolean'
                        ? { background: toolArgs.background }
                        : {}),
                    ...(!staleRunEvidenceDropped ? fileFailureEvidence(toolName, toolArgs, projectContext) : {}),
                    ...(!staleRunEvidenceDropped ? generatedArtifactFailureEvidence(toolName, failedOutput, projectContext) : {}),
                    ...(deliveryEvidence ? {
                        delivery: deliveryEvidence,
                        ...(deliveryEvidence.acceptanceUnmet ? { acceptanceUnmet: deliveryEvidence.acceptanceUnmet } : {}),
                        ...(typeof deliveryEvidence.fidelityMismatch === 'boolean' ? { fidelityMismatch: deliveryEvidence.fidelityMismatch } : {}),
                    } : {}),
                    ...(repairDescription ? { description: repairDescription } : {}),
                    ...(repairContext ? { artifactContext: repairContext } : {}),
                });

                const recoverableFailure = (toolResult as any)?.recoverable === true;
                if (recoverableFailure) {
                    appendLog('[PhaseExecutor] ↪️ Recoverable task failure recorded; continuing so downstream verification and self-fix can use the exact evidence.');
                    return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery: newPhaseDelivery, shouldBreak: false };
                } else if (!verificationSelection && (task.priority === 'high' || task.required === true)) {
                    appendLog('[PhaseExecutor] ⚠️ High-priority task failed. Retrying once...');
                    try {
                        assertRunActive();
                        const retryResult = await executeTool(toolName, toolArgs, {
                            ...liveExecutionContext(),
                            onProgress: (m: string) => context?.onProgress?.(`[${toolName} RETRY] ${m}`),
                        });
                        assertRunActive();
                        if (retryResult.ok) {
                            appendLog(`[PhaseExecutor] ✅ Retry succeeded for task ${taskIndex + 1}: ${toolName}`);
                            results[results.length - 1] = { task: formatTaskDesc(taskDesc), tool: toolName, ok: true, execution: 'ran' };
                            completedCount.value++;
                            return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery: newPhaseDelivery, shouldBreak: false };
                        } else {
                            appendLog('[PhaseExecutor] ⛔ Retry also failed. Stopping phase.');
                            return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery: newPhaseDelivery, shouldBreak: true };
                        }
                    } catch (retryErr: any) {
                        if (context?.isCancelled?.() || String(retryErr?.message || retryErr).includes('run_cancelled_by_owner')) {
                            throw new Error('run_cancelled_by_owner');
                        }
                        appendLog(`[PhaseExecutor] ⛔ Retry threw error: ${retryErr?.message}. Stopping phase.`);
                        return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery: newPhaseDelivery, shouldBreak: true };
                    }
                }
                return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery: newPhaseDelivery, shouldBreak: false };
            }
        } catch (toolError: any) {
            if (verificationSelection) {
                verificationLedger = recordVerification(
                    verificationLedger,
                    verificationSelection,
                    verificationResultFrom(toolError, false),
                    Date.now() - verificationStartedAt,
                    Date.now(),
                    verificationMetricsFrom(undefined, {
                        selectedAt: verificationSelectedAt,
                        startedAt: verificationStartedAt,
                        lastActivityAt: verificationLastActivityAt,
                    }),
                );
            }
            const errMsg = String(toolError?.message || toolError || 'Execution error');
            if (context?.isCancelled?.() || errMsg.includes('run_cancelled_by_owner')) {
                throw new Error('run_cancelled_by_owner');
            }
            const runEvidenceId = String(executionContext.runId || projectContext?.runId || '').trim();
            const runEvidenceRoot = projectContext?.projectRootRuntimeBound === true && String(projectContext?.projectRoot || '').trim()
                ? path.resolve(String(projectContext.projectRoot))
                : '';
            const evidenceClassification = classifyStructuredRuntimeEvidence(
                { error: errMsg },
                originalPlannedEvidence,
                projectContext,
                runEvidenceId,
            );
            const currentRunError = errMsg;
            const staleRunEvidenceDropped = evidenceClassification.evidenceStatus === 'stale_run_dropped';
            appendLog(`[PhaseExecutor] ❌ Task ${taskIndex + 1} threw: ${currentRunError}`);
            results.push({
                task: formatTaskDesc(taskDesc),
                tool: toolName,
                ok: false,
                execution: 'ran',
                error: currentRunError,
                ...(runEvidenceId ? { runId: runEvidenceId } : {}),
                ...(runEvidenceRoot ? { projectRoot: runEvidenceRoot } : {}),
                ...(staleRunEvidenceDropped
                    ? { evidenceStatus: 'stale_run_dropped' as const }
                    : { evidenceStatus: 'current_run' as const }),
                ...(evidenceClassification.staleEvidence
                    ? { staleEvidence: evidenceClassification.staleEvidence }
                    : {}),
                ...(toolName === 'shell_execute' && typeof toolArgs.command === 'string'
                    ? { command: toolArgs.command.slice(0, 1000) }
                    : {}),
                ...(!staleRunEvidenceDropped && typeof (toolArgs.cwd || toolArgs.projectPath) === 'string'
                    ? { cwd: String(toolArgs.cwd || toolArgs.projectPath).slice(0, 1000) }
                    : {}),
                ...(toolName === 'shell_execute' && typeof toolArgs.background === 'boolean'
                    ? { background: toolArgs.background }
                    : {}),
                ...(!staleRunEvidenceDropped ? fileFailureEvidence(toolName, toolArgs, projectContext) : {}),
                ...(repairDescription ? { description: repairDescription } : {}),
                ...(repairContext ? { artifactContext: repairContext } : {}),
            });

            if (task.priority === 'high' || task.required === true) {
                appendLog('[PhaseExecutor] ⛔ Critical task threw. Stopping phase.');
                return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: true };
            }
            return { results, completedCount, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, shouldBreak: false };
        }
    }

    async execute(input: { phase: any; projectContext?: any; repairCriteria?: string[] }, context?: any) {
        const { phase, projectContext, repairCriteria } = input;
        const assertRunActive = () => {
            if (typeof context?.isCancelled === 'function' && context.isCancelled()) {
                throw new Error('run_cancelled_by_owner');
            }
        };
        const MAX_PHASE_LOGS = 128;
        const MAX_PHASE_LOG_CHARS = 2_000;
        const logs: string[] = [];
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
            execution?: 'ran' | 'skipped' | 'reused';
            error?: string;
            message?: string;
            command?: string;
            cwd?: string;
            background?: boolean;
            recoverable?: boolean;
            runId?: string;
            projectRoot?: string;
            evidenceStatus?: 'current_run' | 'stale_run_dropped';
            staleEvidence?: string;
            delivery?: PhaseDeliveryEvidence;
            acceptanceUnmet?: string[];
            fidelityMismatch?: boolean;
        }> = [];
        let completedCount = { value: 0 };
        let phaseDelivery: PhaseDeliveryEvidence | undefined;
        let verificationLedger = compactVerificationLedger(projectContext?.verificationLedger);
        let apiSelection: ApiSelectionArtifact | null = compactApiSelectionArtifact(projectContext?.apiSelection);
        let capabilityDecision: CapabilityDecisionEvidence | null = compactCapabilityDecisionEvidence(projectContext?.capabilityDecision);

        const executionContext = {
            runId: context?.runId || projectContext?.runId,
            sessionId: context?.sessionId || projectContext?.sessionId,
            browserSessionId: context?.browserSessionId || projectContext?.browserSessionId,
            workspaceId: context?.workspaceId || projectContext?.workspaceId,
            userId: context?.userId || projectContext?.userId,
            projectRoot: projectContext?.projectRootRuntimeBound === true && projectContext?.projectRoot
                ? projectContext.projectRoot
                : (context?.projectRoot || projectContext?.projectRoot),
            projectName: context?.projectName || projectContext?.projectName,
            createsNewProject: context?.createsNewProject ?? projectContext?.createsNewProject,
            projectRootRuntimeBound: projectContext?.projectRootRuntimeBound ?? context?.projectRootRuntimeBound,
            repairCriteria: repairCriteria && repairCriteria.length
                ? repairCriteria
                : (context?.repairCriteria || projectContext?.repairCriteria),
            modelConfig: context?.modelConfig || projectContext?.modelConfig,
            purpose: context?.purpose || projectContext?.purpose,
            engineeringPipeline: context?.engineeringPipeline ?? projectContext?.engineeringPipeline,
            allowPublicExposure: context?.allowPublicExposure === true || projectContext?.allowPublicExposure === true,
            providerTimeoutMs: context?.providerTimeoutMs ?? projectContext?.providerTimeoutMs,
            plannerTimeoutMs: context?.plannerTimeoutMs ?? projectContext?.plannerTimeoutMs,
            plannerMaxCompletionTokens: context?.plannerMaxCompletionTokens ?? projectContext?.plannerMaxCompletionTokens,
            plannerReasoningEffort: context?.plannerReasoningEffort ?? projectContext?.plannerReasoningEffort,
            language: context?.language || projectContext?.language,
            terminalLinesEmitted: context?.terminalLinesEmitted,
            onThought: (m: string) => context?.onThought?.(m),
            onProgress: (m: string) => context?.onProgress?.(m),
            isCancelled: context?.isCancelled,
            cancellation: context?.cancellation,
        };
        const trustedWorkspaceRoot = executionContext.workspaceId
            ? String(workspaceService.getActiveRoot(executionContext.workspaceId) || '').trim()
            : '';
        const runtimeTargetFor = (toolName: string, args: Record<string, any>) => {
            if (!/^(?:browser_|visual_qa$)/u.test(toolName)) return '';
            return String(args.url || args.previewUrl || args.baseUrl || executionContext.browserSessionId || '').trim();
        };
        const runtimeRevisionFor = (toolName: string) => {
            if (!/^(?:browser_|visual_qa$)/u.test(toolName)) return '';
            const activeProject = (global as any).joeProjects?.[sessionProjectKey(projectContext?.sessionId)];
            const acceptedProjectRevision = samePipelineRun(executionContext.runId, activeProject?.pipelineRunId)
                ? activeProject?.updatedAt
                : '';
            const activePage = (global as any).joePages?.[sessionProjectKey(projectContext?.sessionId)];
            return String(projectContext?.browserRuntimeRevision || acceptedProjectRevision || activePage?.updatedAt || '').trim();
        };
        const verificationMetricsFrom = (
            result: any,
            timing: { selectedAt?: number; startedAt?: number; lastActivityAt?: number; finishedAt?: number; retryCount?: number } = {},
        ) => {
            const finishedAt = timing.finishedAt || Date.now();
            const suppliedQueue = result?.output?.telemetry?.queueMs ?? result?.output?.queueMs ?? result?.queueMs;
            const suppliedIdle = result?.output?.telemetry?.idleMs ?? result?.output?.idleMs ?? result?.idleMs;
            const suppliedRetries = result?.output?.telemetry?.retryCount ?? result?.output?.retryCount ?? result?.retryCount;
            return {
                evidenceLocation: String(result?.output?.evidenceLocation || result?.output?.reportPath || result?.output?.url || '').trim(),
                queueMs: suppliedQueue == null ? Math.max(0, Number(timing.startedAt || 0) - Number(timing.selectedAt || timing.startedAt || 0)) : Number(suppliedQueue),
                idleMs: suppliedIdle == null ? Math.max(0, finishedAt - Number(timing.lastActivityAt || timing.startedAt || finishedAt)) : Number(suppliedIdle),
                retryCount: suppliedRetries == null ? Number(timing.retryCount || 0) : Number(suppliedRetries),
            };
        };

        const plannedPhaseFiles: string[] = [];
        const changedPhaseFiles: string[] = [];
        const liveExecutionContext = () => ({
            ...executionContext,
            projectRoot: projectContext?.projectRootRuntimeBound === true && projectContext?.projectRoot
                ? projectContext.projectRoot
                : executionContext.projectRoot,
            projectRootRuntimeBound: projectContext?.projectRootRuntimeBound ?? executionContext.projectRootRuntimeBound,
            plannedPhaseFiles,
        });

        try {
            assertRunActive();
            const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
            const totalTasks = tasks.length;
            const phaseFilePaths: string[] = tasks
                .filter((candidate: any) => String((resolvePlannedTool(String(candidate?.tool || '').trim()) as any).tool || '') === 'ai_write_file')
                .map((candidate: any) => {
                    const args = { ...(candidate?.args || {}), ...(candidate?.input || {}) };
                    return String(args.path || args.filePath || args.filename || '').trim();
                })
                .filter(Boolean);
            plannedPhaseFiles.splice(0, plannedPhaseFiles.length, ...Array.from(new Set<string>(phaseFilePaths)));

            if (!executionContext.sessionId) appendLog('[PhaseExecutor] Warning: missing sessionId in execution context');
            if (!executionContext.workspaceId) appendLog('[PhaseExecutor] Warning: missing workspaceId in execution context');
            if (!executionContext.userId) appendLog('[PhaseExecutor] Warning: missing userId in execution context');

            const phaseNo = Number.isFinite(Number(phase?.phaseNumber)) && String(phase?.phaseNumber ?? '').trim() !== ''
                ? String(phase.phaseNumber)
                : '';
            const phaseTag = phaseNo || `«${String(phase?.name || 'unnamed').slice(0, 60)}»`;

            appendLog(`[PhaseExecutor] Starting Phase ${phaseNo ? `${phaseNo}: ${phase.name}` : phaseTag} (${totalTasks} tasks)`);

            // Convert tasks to ExecutionStep format for parallel group detection
            const executionSteps = tasks.map((task: any, index: number) => ({
                id: String(task.id || `task_${index}`),
                description: String(task.task || task.description || `Task ${index + 1}`),
                tool: String(task.tool || '').trim(),
                agent: 'General',
                input: { ...(task.args || {}), ...(task.input || {}) },
                dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(String) : [],
                parallel: task.parallel === true,
                reasoning: task.reasoning || ''
            }));

            // Detect parallel groups using adaptive DAG planner
            const parallelGroups = PhaseExecutorTool.detectParallelGroups(executionSteps);
            appendLog(`[PhaseExecutor] Detected ${parallelGroups.length} parallel execution groups`);

            // Build execution groups
            const executionGroups = PhaseExecutorTool.buildExecutionGroups(tasks, executionSteps, parallelGroups);

            // Checkpoint resumption: load completed tasks from checkpoints and skip them
            const completedTaskKeys = new Set<string>();
            let failurePointIndex = -1; // Index of first failed task in execution order
            if (executionContext.runId && phase.phaseNumber !== undefined) {
                // For greenfield projects, use workspace root as artifact directory
                const workspaceRoot = executionContext.workspaceId
                    ? String(workspaceService.getActiveRoot(executionContext.workspaceId) || '').trim()
                    : '';
                // Use workspace root as stable artifact directory; project root may change when project is bound
                const artifactDir = String(workspaceRoot || executionContext.projectRoot || projectContext?.projectRoot || '');
                console.log(`[DEBUG] Checkpoint artifactDir: ${artifactDir}, runId: ${executionContext.runId}`);
                if (artifactDir) {
                    const runCheckpoints = loadAllRunCheckpoints(artifactDir, executionContext.runId);
                    console.log(`[DEBUG] Loaded ${runCheckpoints.length} checkpoints for run`);
                    // Build ordered list of checkpoints for this phase
                    const phaseCheckpoints: Array<{ taskKey: string; output: any; order: number }> = [];
                    let order = 0;
                    for (const cp of runCheckpoints) {
                        if (cp.phaseIndex === phase.phaseNumber && cp.toolName && cp.toolName !== 'phase') {
                            const taskKey = `${cp.toolName}:${cp.taskDescription}`;
                            // Find the order of this task in the current phase's tasks
                            const taskOrder = tasks.findIndex((t: any) => 
                                String(t.tool || '').trim() === cp.toolName && 
                                String(t.task || t.description || '').trim() === cp.taskDescription
                            );
                            phaseCheckpoints.push({ taskKey: `${cp.toolName}:${cp.taskDescription}`, output: cp.output, order: taskOrder >= 0 ? taskOrder : order++ });
                        }
                    }
                    // Sort by execution order
                    phaseCheckpoints.sort((a, b) => a.order - b.order);
                    // Find first failure point
                    for (const cp of phaseCheckpoints) {
                        const toolResult = cp.output;
                        const isFailed = toolResult && (toolResult.ok === false);
                        if (isFailed) {
                            failurePointIndex = cp.order;
                            break;
                        }
                    }
                    // Only mark tasks before the failure point as completed
                    for (const cp of phaseCheckpoints) {
                        if (failurePointIndex === -1 || cp.order < failurePointIndex) {
                            completedTaskKeys.add(cp.taskKey);
                        }
                    }
                    if (completedTaskKeys.size > 0) {
                        appendLog(`[PhaseExecutor] Resuming from checkpoints: ${completedTaskKeys.size} task(s) before failure point will be skipped`);
                    }
                }
            }

            let shouldBreak = false;
            for (const group of executionGroups) {
                assertRunActive();
                if (group.length === 1) {
                    const task = group[0];
                    // Checkpoint resumption: skip already-completed tasks
                    const currentTaskKey = `${String(task.tool || '').trim()}:${String(task.task || task.description || '').trim()}`;
                    console.log(`[DEBUG] Task key: ${currentTaskKey}, in completedTaskKeys: ${completedTaskKeys.has(currentTaskKey)}`);
                    if (completedTaskKeys.has(currentTaskKey)) {
                        const taskDesc = String(task.task || task.description || `Task ${totalTasks}`);
                        appendLog(`[PhaseExecutor] ⏭️ Task "${taskDesc}" — skipped (resumed from checkpoint)`);
                        results.push({ task: taskDesc, tool: String(task.tool || '').trim(), ok: true, execution: 'reused', message: 'Resumed from checkpoint' });
                        completedCount.value++;
                        continue;
                    }
                    const taskResult = await PhaseExecutorTool.executeSingleTask(
                        task,
                        group.indexOf(task),
                        totalTasks,
                        taskDesc => taskDesc,
                        { phase, projectContext, executionContext, logs, appendLog, results, completedCount, changedPhaseFiles, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, liveExecutionContext, trustedWorkspaceRoot, runtimeTargetFor, runtimeRevisionFor, bindRuntimeProjectFromEvidence, syncRuntimeProjectContext, mutationPathsFor, compactPhaseDeliveryEvidence, mergePhaseDeliveryEvidence, classifyStructuredRuntimeEvidence, boundedRepairEvidence, recoverMissingNpmLauncher, fileFailureEvidence, generatedArtifactFailureEvidence, executeTool, context, verificationMetricsFrom }
                    );
                    verificationLedger = taskResult.verificationLedger;
                    apiSelection = taskResult.apiSelection;
                    capabilityDecision = taskResult.capabilityDecision;
                    phaseDelivery = taskResult.phaseDelivery;
                    if (taskResult.shouldBreak) { shouldBreak = true; break; }
                } else {
                    // Filter out already-completed tasks for parallel execution
                    const filteredGroup = group.filter(task => {
                        const currentTaskKey = `${String(task.tool || '').trim()}:${String(task.task || task.description || '').trim()}`;
                        console.log(`[DEBUG] Parallel task key: ${currentTaskKey}, in completedTaskKeys: ${completedTaskKeys.has(currentTaskKey)}`);
                        if (completedTaskKeys.has(currentTaskKey)) {
                            const taskDesc = String(task.task || task.description || `Task ${totalTasks}`);
                            appendLog(`[PhaseExecutor] ⏭️ Task "${taskDesc}" — skipped (resumed from checkpoint)`);
                            results.push({ task: taskDesc, tool: String(task.tool || '').trim(), ok: true, execution: 'reused', message: 'Resumed from checkpoint' });
                            completedCount.value++;
                            return false;
                        }
                        return true;
                    });
                    if (filteredGroup.length === 0) {
                        continue;
                    }
                    appendLog(`[PhaseExecutor] Executing ${filteredGroup.length} tasks in parallel`);
                    const parallelResults = await Promise.all(
                        filteredGroup.map((task, idx) => PhaseExecutorTool.executeSingleTask(
                            task,
                            idx,
                            totalTasks,
                            taskDesc => `${taskDesc} (parallel)`,
                            { phase, projectContext, executionContext, logs, appendLog, results: [], completedCount: { value: 0 }, changedPhaseFiles, verificationLedger, apiSelection, capabilityDecision, phaseDelivery, liveExecutionContext, trustedWorkspaceRoot, runtimeTargetFor, runtimeRevisionFor, bindRuntimeProjectFromEvidence, syncRuntimeProjectContext, mutationPathsFor, compactPhaseDeliveryEvidence, mergePhaseDeliveryEvidence, classifyStructuredRuntimeEvidence, boundedRepairEvidence, recoverMissingNpmLauncher, fileFailureEvidence, generatedArtifactFailureEvidence, executeTool, context, verificationMetricsFrom }
                        ))
                    );
                    for (const pr of parallelResults) {
                        results.push(...pr.results);
                        completedCount.value += pr.completedCount.value;
                        verificationLedger = pr.verificationLedger;
                        apiSelection = pr.apiSelection;
                        capabilityDecision = pr.capabilityDecision;
                        phaseDelivery = mergePhaseDeliveryEvidence(phaseDelivery, pr.phaseDelivery);
                        if (pr.shouldBreak) { shouldBreak = true; break; }
                    }
                    if (shouldBreak) break;
                }
            }

            // Checkpoint the completed phase
            const workspaceRoot = executionContext.workspaceId
                ? String(workspaceService.getActiveRoot(executionContext.workspaceId) || '').trim()
                : '';
            const artifactDir = String(projectContext?.projectRoot || executionContext.projectRoot || workspaceRoot || '');
            if (artifactDir && executionContext.runId && phase.phaseNumber !== undefined) {
                const phaseResult = {
                    ok: true,
                    output: {
                        phaseNumber: phase.phaseNumber,
                        phaseName: phase.name,
                        results,
                    }
                };
                checkpointPhase(
                    artifactDir,
                    executionContext.runId,
                    phase.phaseNumber,
                    phase.name,
                    phaseResult,
                    projectContext,
                    executionContext
                );
            }

            const taskResults = results.slice();
const skippedCount = taskResults.filter(r => r.execution === 'skipped').length;
            const reusedCount = taskResults.filter(r => r.execution === 'reused').length;
            const executedCount = taskResults.filter(r => r.execution === 'ran').length;
            const failedCount = taskResults.filter(r => r.execution === 'ran' && !r.ok).length;
            const allOk = taskResults.length > 0 && taskResults.every(r => r.ok);
            // When all tasks are reused from checkpoints, the phase is effectively completed (just reused)
            const allReused = (reusedCount === totalTasks && executedCount === 0);
            let status = allOk && (skippedCount === 0 || allReused)
                ? 'completed'
                : (skippedCount > 0 && executedCount === 0
                    ? 'skipped'
                    : (skippedCount > 0 || completedCount.value > 0 ? 'partial' : 'failed'));
            // Determine phase execution type: 'reused' if all tasks were reused from checkpoints
            const phaseExecution = (reusedCount === totalTasks && executedCount === 0) ? 'reused' : 'ran';
            let verificationFailed = false;
            let verificationUnavailable = false;

            appendLog(`[PhaseExecutor] Phase ${phaseTag} ${status}: ${executedCount}/${totalTasks} executed · ${skippedCount} skipped · ${reusedCount} reused${failedCount ? ` · ${failedCount} failed` : ''}`);

            if (phase.verificationTask && allOk && (executedCount + reusedCount) > 0) {
                assertRunActive();
                const vTask = phase.verificationTask;
                const requestedVerificationTool = String(vTask.tool || '').trim();
                const vToolName = resolvePlannedTool(requestedVerificationTool).tool || requestedVerificationTool;
                const vTaskDesc = String(vTask.task || 'Verify phase output');
                appendLog(`[PhaseExecutor] 🧪 Running verification: "${vTaskDesc}" with ${vToolName}`);
                let phaseVerificationSelection: VerificationSelection | undefined;
                let phaseVerificationStartedAt = 0;
                let phaseVerificationSelectedAt = 0;
                let phaseVerificationLastActivityAt = 0;

                try {
                    const plannedVerification: any = { ...(vTask.args || {}), ...(vTask.input || {}) };
                    if (executionContext.sessionId && typeof plannedVerification.sessionId !== 'string') plannedVerification.sessionId = executionContext.sessionId;
                    if (executionContext.workspaceId && typeof plannedVerification.workspaceId !== 'string') plannedVerification.workspaceId = executionContext.workspaceId;
                    if (vToolName === 'code_reviewer') {
                        const suppliedScore = Number(plannedVerification.minimumScore);
                        plannedVerification.minimumScore = Number.isFinite(suppliedScore)
                            ? Math.max(70, suppliedScore)
                            : 70;
                        plannedVerification.failOnCritical = true;
                    }
                    applyPhaseExecutionEvidence(vToolName, plannedVerification, projectContext, logs);
                    inheritRuntimeProjectArguments(vToolName, plannedVerification, projectContext, logs);
                    const adaptedVerification = adaptPlannedArgs(vToolName, plannedVerification);
                    const verificationArgs = adaptPlannedArgsFromDescription(vToolName, adaptedVerification, vTaskDesc);
                    const verificationRelevantPaths = [
                        ...(Array.isArray(vTask.relevantPaths) ? vTask.relevantPaths : []),
                        ...(Array.isArray(verificationArgs.verificationRelevantPaths) ? verificationArgs.verificationRelevantPaths : []),
                    ].map((item: unknown) => String(item || '').trim()).filter(Boolean);
                    const verificationMode = vTask.verificationMode
                        || verificationArgs.verificationMode
                        || (projectContext?.isFinalPhase === true ? 'final' : 'affected');
                    const verificationBoundary = String(vTask.verificationBoundary || verificationArgs.verificationBoundary || '').trim();
                    if (!verificationRelevantPaths.length && !verificationBoundary) {
                        verificationRelevantPaths.push(...changedPhaseFiles);
                    }
                    const runtimeRevision = runtimeRevisionFor(vToolName);
                    const verificationId = String(
                        vTask.verificationId
                        || verificationArgs.verificationId
                        || `${vToolName}:${vTaskDesc}`,
                    ).trim().slice(0, 240);
                    delete verificationArgs.verificationId;
                    delete verificationArgs.verificationMode;
                    delete verificationArgs.verificationBoundary;
                    delete verificationArgs.verificationRelevantPaths;
                    delete verificationArgs.verificationRuntimeRevision;
                    const verificationArgsIssue = !isVerificationTool(requestedVerificationTool, verificationArgs)
                        || !isVerificationTool(vToolName, verificationArgs)
                        ? 'verification_unavailable: unsupported verification tool contract'
                        : plannedArgsIssue(vToolName, verificationArgs);
                    if (verificationArgsIssue) {
                        appendLog(`[PhaseExecutor] ⚠️ Verification input invalid: ${verificationArgsIssue}`);
                        const checkerError = vToolName === 'browser_run'
                            ? `verification_unavailable: ${verificationArgsIssue}`
                            : verificationArgsIssue;
                        results.push({ task: vTaskDesc, tool: vToolName, ok: false, execution: 'ran', error: checkerError });
                        verificationFailed = true;
                        verificationUnavailable = vToolName === 'browser_run';
                        status = 'partial';
                    } else {
                        const scopeRoot = String(
                            verificationArgs.cwd
                            || verificationArgs.projectPath
                            || verificationArgs.path
                            || workspaceService.getActiveRoot(executionContext.workspaceId)
                            || '',
                        ).trim();
                        const selected = scopeRoot
                            ? selectVerification(verificationLedger, {
                                checkId: verificationId,
                                tool: vToolName,
                                args: verificationArgs,
                                workspaceId: String(executionContext.workspaceId || ''),
                                workspaceRoot: trustedWorkspaceRoot,
                                scopeRoot,
                                relevantPaths: verificationRelevantPaths,
                                boundary: verificationBoundary,
                                boundaries: projectContext?.verificationBoundaries,
                                runtimeTarget: runtimeTargetFor(vToolName, verificationArgs),
                                runtimeRevision,
                                mode: verificationMode,
                            })
                            : undefined;
                        if (selected) {
                            verificationLedger = selected.ledger;
                            phaseVerificationSelection = selected.selection;
                            appendLog(`[PhaseExecutor] verification ${selected.selection.action}: ${verificationId} — ${selected.selection.reason}`);
                        }
                        if (selected?.selection.action === 'reuse') {
                            appendLog(`[PhaseExecutor] ✅ Verification reused for Phase ${phaseTag}`);
                            results.push({ task: vTaskDesc, tool: vToolName, ok: true, execution: 'reused', message: selected.selection.reason });
                        } else {
                            phaseVerificationSelectedAt = Date.now();
                            const startedAt = Date.now();
                            phaseVerificationStartedAt = startedAt;
                            phaseVerificationLastActivityAt = startedAt;
                            const vResult = await executeTool(vToolName, verificationArgs, {
                                ...executionContext,
                                onProgress: (message: string) => {
                                    phaseVerificationLastActivityAt = Date.now();
                                    executionContext.onProgress?.(message);
                                },
                            });
                            if (selected) {
                                verificationLedger = recordVerification(
                                    verificationLedger,
                                    selected.selection,
                                    verificationResultFromToolResult(vResult),
                                    Date.now() - startedAt,
                                    Date.now(),
                                    verificationMetricsFrom(vResult, {
                                        selectedAt: phaseVerificationSelectedAt,
                                        startedAt: phaseVerificationStartedAt,
                                        lastActivityAt: phaseVerificationLastActivityAt,
                                    }),
                                );
                            }

                            const verificationOutcome = verificationResultFromToolResult(vResult);
                            if (vResult.ok && verificationOutcome === 'passed') {
                                appendLog(`[PhaseExecutor] ✅ Verification passed for Phase ${phaseTag}`);
                                results.push({ task: vTaskDesc, tool: vToolName, ok: true, execution: 'ran' });
                            } else {
                                const vErr = String(vResult.error || 'Verification failed');
                                const checkerUnavailable = vToolName === 'browser_run'
                                    && /^(?:browser_unavailable|unauthorized|forbidden|missing_secrets|login_2fa_required|login_not_completed)$/i.test(vErr.trim());
                                appendLog(checkerUnavailable
                                    ? `[PhaseExecutor] ⚠️ Verification unavailable: ${vErr}`
                                    : `[PhaseExecutor] ⚠️ Verification failed: ${vErr}`);
                                results.push({ task: vTaskDesc, tool: vToolName, ok: false, execution: 'ran', error: checkerUnavailable ? `verification_unavailable: ${vErr}` : vErr });
                                verificationFailed = true;
                                verificationUnavailable = checkerUnavailable;
                                status = 'partial';
                            }
                        }
                    }
                } catch (vError: any) {
                    if (phaseVerificationSelection && phaseVerificationStartedAt) {
                        verificationLedger = recordVerification(
                            verificationLedger,
                            phaseVerificationSelection,
                            verificationResultFrom(vError, false),
                            Date.now() - phaseVerificationStartedAt,
                            Date.now(),
                            verificationMetricsFrom(undefined, {
                                selectedAt: phaseVerificationSelectedAt,
                                startedAt: phaseVerificationStartedAt,
                                lastActivityAt: phaseVerificationLastActivityAt,
                            }),
                        );
                    }
                    appendLog(`[PhaseExecutor] ⚠️ Verification error: ${vError.message}`);
                    results.push({ task: vTaskDesc, tool: vToolName, ok: false, execution: 'ran', error: vError.message });
                    verificationFailed = true;
                    status = 'partial';
                }
            }

            const hasCodeTasks = tasks.some((t: any) =>
                ['ai_write_file', 'write_file', 'file_edit', 'file_edit_advanced', 'scaffold_project'].includes(String(t.tool || ''))
            );
            if (hasCodeTasks && !phase.verificationTask && allOk && executedCount > 0 && executionContext.workspaceId) {
                const writtenPaths = tasks
                    .map((t: any) => String(t?.args?.path || t?.args?.filename || t?.input?.path || t?.input?.filename || ''))
                    .filter(Boolean);
                const pkgPath = writtenPaths.find((p: string) => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/')));
                if (!pkgPath) {
                    appendLog('[PhaseExecutor] ℹ️ Auto-build check skipped honestly: this phase wrote no package.json, so there is no build to run.');
                } else {
                    const projectDir = pkgPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
                    appendLog(`[PhaseExecutor] 🔍 Auto-running build check in ${projectDir || 'workspace root'}...`);
                    let buildSelection: VerificationSelection | undefined;
                    let buildSelectedAt = 0;
                    let buildStartedAt = 0;
                    try {
                        const buildArgs = {
                            command: 'npm run --if-present build 2>&1 || echo BUILD_CHECK_FAILED',
                            ...(projectDir ? { cwd: projectDir } : {}),
                            timeout: 300000,
                        };
                        const buildRoot = projectDir
                            ? path.resolve(String(projectDir))
                            : String(projectContext?.projectRoot || workspaceService.getActiveRoot(executionContext.workspaceId) || '').trim();
                        const selected = buildRoot
                            ? selectVerification(verificationLedger, {
                                checkId: `auto-build:${buildRoot}`,
                                tool: 'shell_execute',
                                args: buildArgs,
                                workspaceId: String(executionContext.workspaceId || ''),
                                workspaceRoot: trustedWorkspaceRoot,
                                scopeRoot: buildRoot,
                                mode: 'affected',
                            })
                            : undefined;
                        buildSelection = selected?.selection;
                        if (selected) {
                            verificationLedger = selected.ledger;
                            appendLog(`[PhaseExecutor] verification ${selected.selection.action}: auto-build — ${selected.selection.reason}`);
                        }
                        if (selected?.selection.action === 'reuse') {
                            appendLog('[PhaseExecutor] ✅ Auto-build check reused from matching content evidence');
                        } else {
                            buildSelectedAt = Date.now();
                            buildStartedAt = Date.now();
                            const buildResult = await executeTool('shell_execute', buildArgs, executionContext);
                            const buildOutput = String((buildResult as any)?.output?.stdout || (buildResult as any)?.output || '');
                            if (buildOutput.includes('BUILD_CHECK_FAILED') || !buildResult.ok) {
                                const buildError = String((buildResult as any)?.error || 'Auto-build check failed');
                                if (selected) verificationLedger = recordVerification(
                                    verificationLedger,
                                    selected.selection,
                                verificationResultFrom(buildError, false),
                                Date.now() - buildStartedAt,
                                Date.now(),
                                verificationMetricsFrom(buildResult, {
                                    selectedAt: buildSelectedAt,
                                    startedAt: buildStartedAt,
                                    lastActivityAt: buildStartedAt,
                                }),
                                );
                                appendLog(`[PhaseExecutor] ⚠️ Auto-build check found issues — orchestrator should route to self-fix: ${buildError}`);
                                results.push({ task: 'Auto-build check', tool: 'shell_execute', ok: false, execution: 'ran', error: buildError });
                                verificationFailed = true;
                                status = 'partial';
                            } else {
                                if (selected) verificationLedger = recordVerification(
                                    verificationLedger,
                                    selected.selection,
                                'passed',
                                Date.now() - buildStartedAt,
                                Date.now(),
                                verificationMetricsFrom(buildResult, {
                                    selectedAt: buildSelectedAt,
                                    startedAt: buildStartedAt,
                                    lastActivityAt: buildStartedAt,
                                }),
                                );
                                appendLog('[PhaseExecutor] ✅ Auto-build check passed');
                            }
                        }
                    } catch (buildFailure: any) {
                        const buildError = String(buildFailure?.message || 'Auto-build check failed unexpectedly');
                        if (buildSelection && buildStartedAt) {
                            verificationLedger = recordVerification(
                                verificationLedger,
                                buildSelection,
                                verificationResultFrom(buildFailure, false),
                                Date.now() - buildStartedAt,
                                Date.now(),
                                verificationMetricsFrom(undefined, {
                                    selectedAt: buildSelectedAt,
                                    startedAt: buildStartedAt,
                                    lastActivityAt: buildStartedAt,
                                }),
                            );
                        }
                        appendLog(`[PhaseExecutor] ⚠️ Auto-build check errored — treated as a failed verification: ${buildError}`);
                        results.push({ task: 'Auto-build check', tool: 'shell_execute', ok: false, execution: 'ran', error: buildError });
                        verificationFailed = true;
                        status = 'partial';
                    }
                }
            }

            const ok = status === 'completed'
                || (status === 'partial' && executedCount > 0 && allOk && !verificationFailed && !verificationUnavailable);
            const primaryError = ok ? undefined : (results.find(r => !r.ok)?.error || (status === 'partial' ? 'Phase completed only partially' : 'Phase failed'));
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
                    execution: phaseExecution,
                    completedTasks: completedCount.value,
                    executedTasks: executedCount,
                    skippedTasks: skippedCount,
                    reusedTasks: reusedCount,
                    totalTasks,
                    results,
                    nextPhase: phase.phaseNumber + 1,
                    deliverables: phase.deliverables || [],
                    estimatedTime: phase.estimatedTime || 'unknown',
                    ...(verificationFailed ? { verificationFailed: true } : {}),
                    ...(verificationUnavailable ? { verificationUnavailable: true } : {}),
                    ...(phaseDelivery ? { delivery: phaseDelivery } : {}),
                    ...(apiSelection ? { apiSelection } : {}),
                    ...(capabilityDecision ? { capabilityDecision } : {}),
                    verificationLedger,
                    verificationMetrics: summarizeVerificationLedger(verificationLedger),
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
                    completedTasks: completedCount.value,
                    executedTasks: results.filter(r => r.execution === 'ran').length,
                    skippedTasks: results.filter(r => r.execution === 'skipped').length,
                    reusedTasks: results.filter(r => r.execution === 'reused').length,
                    totalTasks: Array.isArray(phase?.tasks) ? phase.tasks.length : 0,
                    results,
                    nextPhase: phase?.phaseNumber,
                    ...(phaseDelivery ? { delivery: phaseDelivery } : {}),
                    ...(apiSelection ? { apiSelection } : {}),
                    ...(capabilityDecision ? { capabilityDecision } : {}),
                    verificationLedger,
                    verificationMetrics: summarizeVerificationLedger(verificationLedger),
                },
                logs
            };
        }
    }
}
