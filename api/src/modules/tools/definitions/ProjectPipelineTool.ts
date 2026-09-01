import { ToolDefinition, ToolPermission } from '../types';
import { isWithinRoot } from '../path-containment';
import fs from 'fs';
import path from 'path';
import { executeTool } from '../../services/ToolService';
import { workspaceService } from '../../services/WorkspaceService';
import { isArabicReply, say as pick } from '../../../shared/reply-language';
import { brandFrom } from '../../../core/design/page-head';
import { scopeReport } from '../../../core/quality/scope-audit';
import { verifyProviderDirect } from '../../../core/llm/intelligent-router';
import { detectStart, missingRuntimeDependencies, reconcileMissingRuntimeTarget } from './ProjectRunTool';
import { auditBuiltApp, AppAudit } from '../../../core/quality/app-audit';
import { readJoeProjectForRun } from '../../../api/page-store';

const MAX_PIPELINE_LOGS = 192;
const MAX_PIPELINE_LOG_CHARS = 2_000;
const MAX_DELIVERY_FILES = 120;
const MAX_DELIVERY_FILE_DEPTH = 6;

function listSourceFiles(projectRoot: string): string[] {
    const root = path.resolve(String(projectRoot || ''));
    if (!root || !fs.existsSync(root)) return [];
    const sourceRoot = fs.existsSync(path.join(root, 'src')) ? path.join(root, 'src') : root;
    const files: string[] = [];
    const walk = (directory: string, depth: number) => {
        if (depth > MAX_DELIVERY_FILE_DEPTH || files.length >= MAX_DELIVERY_FILES) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            if (files.length >= MAX_DELIVERY_FILES || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
                continue;
            }
            if (!entry.isFile()) continue;
            files.push(path.relative(root, fullPath).split(path.sep).join('/'));
        }
    };
    walk(sourceRoot, 0);
    return files;
}

export interface PipelineDecisionEvidence {
    finalVerified: boolean;
    browserQaFailed: boolean;
    scopeCoverageFailed: boolean;
    verificationUnavailable: boolean;
    liveUrl: string | null;
    done: number;
    total: number;
    honestBlocker: string | null;
}

/** A domain-fidelity failure is final evidence, never a scope-only partial. */
export function hasRequestFidelityMismatch(results: unknown): boolean {
    if (!Array.isArray(results)) return false;
    return results.some((result: any) => (
        result?.error === 'request_fidelity_mismatch'
        || result?.primaryError === 'request_fidelity_mismatch'
        || result?.output?.fidelityMismatch === true
        || result?.output?.delivery?.fidelityMismatch === true
    ));
}

/** Missing evidence for a known engine is also final evidence, not a partial. */
export function hasRequestFidelityEvidenceUnavailable(results: unknown): boolean {
    if (!Array.isArray(results)) return false;
    return results.some((result: any) => (
        result?.error === 'fidelity_unverifiable'
        || result?.primaryError === 'fidelity_unverifiable'
        || result?.output?.delivery?.fidelityEvidenceUnavailable === true
    ));
}

/**
 * Additive, current-run decision evidence for the delivery boundary. This
 * function never changes a verdict; it only names the facts already computed
 * by the pipeline so a report cannot collapse into an unexplained 0/N.
 */
export function buildPipelineDecisionEvidence(input: {
    finalVerified: boolean;
    browserQaFailed: boolean;
    scopeCoverageFailed: boolean;
    liveUrl?: string;
    done: number;
    total: number;
    finalHonestBlocker: boolean;
    verificationFailed?: boolean;
    verificationUnavailable?: boolean;
    liveRunVerificationFailed?: boolean;
    liveRunError?: string;
    scopeAudit?: { built?: number; requested?: number; missing?: string[] };
    phaseResults?: any[];
}): PipelineDecisionEvidence {
    const results = Array.isArray(input.phaseResults) ? input.phaseResults : [];
    const verificationUnavailable = input.verificationUnavailable === true || results.some((result: any) => (
        result?.verificationUnavailable === true
        || result?.output?.verificationUnavailable === true
    ));
    const failedPhase = results.find((result: any) => (
        result?.verificationFailed === true
        || result?.verificationUnavailable === true
        || result?.ok === false
        || (result?.status && result.status !== 'completed')
    ));
    const phaseName = String(failedPhase?.phaseName || failedPhase?.name || failedPhase?.phaseNumber || '').trim();
    const phaseError = String(failedPhase?.primaryError || failedPhase?.error || '').trim();
    let honestBlocker: string | null = null;
    if (input.liveRunError) {
        honestBlocker = `live_run: ${String(input.liveRunError).slice(0, 420)}`;
    } else if (input.browserQaFailed) {
        honestBlocker = 'browser_qa_failed';
    } else if (verificationUnavailable) {
        honestBlocker = 'verification_unavailable';
    } else if (input.scopeCoverageFailed && input.scopeAudit?.requested) {
        honestBlocker = `scope_coverage: ${Number(input.scopeAudit.built || 0)}/${Number(input.scopeAudit.requested)}`;
    } else if (phaseName || phaseError) {
        honestBlocker = [phaseName, phaseError].filter(Boolean).join(': ').slice(0, 520);
    } else if (input.verificationFailed || input.liveRunVerificationFailed) {
        honestBlocker = 'verification_failed';
    } else if (input.finalHonestBlocker) {
        honestBlocker = 'pipeline_marked_honest_blocker';
    }
    return {
        finalVerified: input.finalVerified,
        browserQaFailed: input.browserQaFailed,
        scopeCoverageFailed: input.scopeCoverageFailed,
        verificationUnavailable,
        liveUrl: String(input.liveUrl || '').trim() || null,
        done: Number(input.done || 0),
        total: Number(input.total || 0),
        honestBlocker,
    };
}

/**
 * Preserve the exact importer/specifier pairs emitted by ProjectRunTool. The
 * repair planner must receive these as obligations, not as vague prose, so it
 * can inspect each edge and either repair the proven module or stop honestly.
 */
export function extractMissingLocalRuntimeImportLedger(failureText: unknown): string[] {
    const text = String(failureText || '');
    const match = text.match(/local\s+runtime\s+imports\s+missing\s*\(([^)]*)\)/iu);
    if (!match?.[1]) return [];
    return match[1]
        .split(/\s*;\s*/u)
        .map(item => item.trim())
        .filter(item => /^.+?\s*->\s*\.\/?[^\s]+$/u.test(item))
        .slice(0, 24);
}

function appendBoundedPipelineLog(logs: string[], line: unknown): void {
    const text = String(line ?? '').slice(0, MAX_PIPELINE_LOG_CHARS);
    if (logs.length < MAX_PIPELINE_LOGS) {
        logs.push(text);
        return;
    }
    logs[0] = '[ProjectPipeline] ... older pipeline logs truncated; recent evidence retained ...';
    logs.splice(1, 1);
    logs.push(text);
}

function appendBoundedPipelineLogs(logs: string[], values: unknown): void {
    if (!Array.isArray(values)) return;
    for (const value of values) appendBoundedPipelineLog(logs, value);
}

/** Only an explicit requirements/specification reference binds planning to a local source file. */
export function requestRequiresLocalSpecification(request: string): boolean {
    return /(?:اقرأ|قراءة)\s*(?:ال)?(?:مواصف(?:ة|ات)?|متطلبات|ملف\s+(?:المواصف|المتطلبات))|(?:read|inspect|review)\s+(?:(?:the|a|local|attached)\s+)*(?:spec(?:ification)?|requirements?|brief|prd|document)\b|(?:read|inspect|review)\s+(?:(?:the|a|local|attached)\s+)*[^\s"'`]+(?:spec|require|brief|prd)[^\s"'`]*/i.test(String(request || ''));
}

/**
 * Keep bounded scope-repair failures actionable. The UI report intentionally
 * stays concise, but the pipeline log must retain enough structured evidence
 * to distinguish planner failure, phase failure, and self-fix failure without
 * dumping the full prompt or model transcript.
 */
export function summarizeScopeRepairPipeline(scopePipeline: any): string {
    const results = Array.isArray(scopePipeline?.results) ? scopePipeline.results : [];
    const summarize = (value: any) => ({
        phaseName: String(value?.phaseName || value?.name || '').slice(0, 180),
        status: String(value?.status || '').slice(0, 80),
        ok: value?.ok === true,
        primaryError: String(value?.primaryError || value?.error || '').slice(0, 420),
        verificationFailed: value?.verificationFailed === true,
        honestBlocker: value?.honestBlocker === true,
        completedTasks: Number.isFinite(Number(value?.completedTasks)) ? Number(value.completedTasks) : undefined,
        totalTasks: Number.isFinite(Number(value?.totalTasks)) ? Number(value.totalTasks) : undefined,
    });
    return JSON.stringify({
        ok: scopePipeline?.ok === true,
        completedPhases: Number(scopePipeline?.completedPhases || 0),
        error: String(scopePipeline?.error || '').slice(0, 420),
        honestBlocker: scopePipeline?.honestBlocker === true,
        results: results.slice(-8).map(summarize),
        selfFixExecution: scopePipeline?.selfFixExecution
            ? String(scopePipeline.selfFixExecution?.error || scopePipeline.selfFixExecution?.status || '').slice(0, 420)
            : undefined,
    }).slice(0, 3_600);
}

function boundedPipelineLogs(...sources: unknown[]): string[] {
    const logs: string[] = [];
    for (const source of sources) appendBoundedPipelineLogs(logs, source);
    return logs;
}

/**
 * A builder may return a long, useful delivery message.  Credentials are a
 * one-time handoff, however, so they must not depend on where the builder's
 * prose lands in the bounded report.  Extract only the explicit owner-account
 * forms emitted by ApiProjectTool; never infer or recover a password from a
 * hash or from project files.
 */
function deliveryCredentialFromMessage(message: unknown): { email: string; password: string } | null {
    const text = String(message || '').trim();
    if (!text) return null;

    const clean = (value: string): string => String(value || '').replace(/[),.;`]+$/u, '').trim();
    const arabicEmail = text.match(/البريد:\s*([^\s]+)/u)?.[1];
    const arabicPassword = text.match(/كلمة المرور:\s*([^\s]+)/u)?.[1];
    if (arabicEmail && arabicPassword) {
        const email = clean(arabicEmail);
        const password = clean(arabicPassword);
        if (email.includes('@') && password) return { email, password };
    }

    const english = text.match(/Owner account(?:\s*\([^)]*\))?:\s*([^\s/]+)\s*\/\s*([^\s]+)/iu);
    if (english) {
        const email = clean(english[1]);
        const password = clean(english[2]);
        if (email.includes('@') && password) return { email, password };
    }
    return null;
}

function trustedRuntimeProjectRoot(sessionId: unknown, workspaceId: unknown, runId: unknown): string {
    const key = String(sessionId || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
    const candidateRaw = String(readJoeProjectForRun(key, runId)?.dir || '').trim();
    if (!candidateRaw) return '';
    const workspaceRoot = path.resolve(workspaceService.getActiveRoot(String(workspaceId || '')));
    const candidate = path.resolve(candidateRaw);
    const inside = isWithinRoot(candidate, workspaceRoot);
    return inside && fs.existsSync(path.join(candidate, 'package.json')) ? candidate : '';
}

/**
 * ProjectPipelineTool — the production bridge to the canonical pipeline.
 *
 * The audit that created this file found the AGENTS.md chain — Plan →
 * PhaseExecutor → QualityGate → RepairTicket → SelfFix → Rerun — fully built,
 * tested by six manual verification harnesses… and called by NOTHING in
 * production. A user asking for a complete multi-file project got either a
 * single HTML page (build fast-path) or an unverified pile of write_file
 * steps from the generic DAG. Files that were never executed are not a
 * delivered project; they are a hope.
 *
 * This tool IS the missing call: plan the project (planner-only tool), then
 * hand the phases to AgentLoopService.runPlannedPhasesIfPresent, which
 * executes each phase with verification tasks, auto build checks after code
 * phases, and the repair-ticket/self-fix loop when a phase fails.
 */

/**
 * THE PLAN A DEAD MESH CAN STILL PRODUCE.
 *
 * Nothing here matches a product name or a business domain — it reads the
 * two things the request states out loud: what is being built (scope) and
 * which entities it names. A page needs no server; a system with its own
 * rows does, and its interface depends on it. Those are engineering
 * relations, not a stored template, and they hold for a plant nursery, a
 * freight company and a domain nobody has thought of yet.
 *
 * Exported so the gate that guards it can measure it directly.
 */
function normalizeProjectSegment(value: unknown): string {
    return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//u, '').replace(/\/$/u, '');
}

function projectPathVariants(identity: string): string[] {
    const normalized = normalizeProjectSegment(identity);
    if (!normalized) return [];
    const slug = normalized.replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');
    return [normalized, normalized.replace(/[-_]+/gu, ' '), slug]
        .map(value => value.trim())
        .filter((value, index, values) => value && values.indexOf(value) === index);
}

function rewriteProjectPath(value: string, oldPrefixes: string[], nextIdentity: string): string {
    let result = String(value || '').replace(/\\/g, '/');
    const next = normalizeProjectSegment(nextIdentity);
    for (const prefix of oldPrefixes) {
        const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
        const re = new RegExp(`(^|[\\s\"'/:=])${escaped}(?=$|[/\\s\"'&|;])`, 'giu');
        result = result.replace(re, (_match, lead) => `${lead}${next}`);
    }
    return result;
}

function prefixGreenfieldRelativePath(value: string, identity: string): string {
    const normalized = String(value || '').replace(/\\/g, '/').trim();
    const next = normalizeProjectSegment(identity);
    if (!normalized || !next || path.isAbsolute(normalized)) return normalized;
    if (/^(?:[a-z][a-z0-9+.-]*:|\\$|%[^%]+%)/iu.test(normalized)) return normalized;
    let relative = normalized.replace(/^\.\//u, '');
    if (!relative || relative === '.') return next;

    // A model can already have prefixed a path with the accepted identity and
    // then add its slug once more (for example `TaskFlow AI/taskflow-ai/src`)
    // while planning different phases. Keep one canonical project root rather
    // than letting phase-local prefixes create a non-existent nested project.
    const identityVariants = new Set(projectPathVariants(next).map(item => item.toLocaleLowerCase()));
    const segments = relative.split('/').filter(Boolean);
    while (segments.length > 1
        && segments[0].toLocaleLowerCase() === next.toLocaleLowerCase()
        && identityVariants.has(segments[1].toLocaleLowerCase())) {
        segments.splice(1, 1);
    }
    relative = segments.join('/');
    if (!relative || relative === next || relative.startsWith(`${next}/`)) return relative || next;
    return `${next}/${relative}`;
}

function rewriteGreenfieldTaskPaths(task: any, oldPrefixes: string[], nextIdentity: string): void {
    if (!task || typeof task !== 'object') return;
    const args = task.args && typeof task.args === 'object' ? { ...task.args } : null;
    if (!args) return;
    const tool = String(task.tool || task.name || '').toLowerCase();
    const pathKeys = new Set(['path', 'cwd', 'baseDir', 'projectName', 'name', 'projectPath', 'filePath', 'targetPath', 'directory', 'dir', 'projectQuery', 'schemaPath', 'databasePath']);
    const relativeArtifactKeys = new Set(['path', 'cwd', 'projectPath', 'filePath', 'targetPath', 'directory', 'dir', 'schemaPath', 'databasePath']);
    // Verification and analysis tools commonly receive source targets as arrays
    // (`code_reviewer.files`, `auto_tester.files`, etc.). Treat each entry like
    // a scalar artifact path so a greenfield wrapper cannot leave stale paths
    // such as `WeatherGo-new/src/App.js` after the accepted identity is
    // normalized to `WeatherGo`.
    const arrayPathKeys = new Set(['files', 'filePaths', 'sourceFiles', 'paths']);
    for (const [key, value] of Object.entries(args)) {
        if (typeof value === 'string') {
            if (pathKeys.has(key)) {
                const rewritten = rewriteProjectPath(value, oldPrefixes, nextIdentity);
                args[key] = relativeArtifactKeys.has(key)
                    ? prefixGreenfieldRelativePath(rewritten, nextIdentity)
                    : rewritten;
            } else if (key === 'command' && (tool === 'shell_execute' || tool === 'shell_exec' || tool === 'run_command')) {
                args[key] = rewriteProjectPath(value, oldPrefixes, nextIdentity);
            }
            continue;
        }
        if (arrayPathKeys.has(key) && Array.isArray(value)) {
            args[key] = value.map(entry => {
                if (typeof entry !== 'string') return entry;
                const rewritten = rewriteProjectPath(entry, oldPrefixes, nextIdentity);
                return prefixGreenfieldRelativePath(rewritten, nextIdentity);
            });
        }
    }
    task.args = args;
}

/**
 * Resolve the project identity from the user's explicit naming language before
 * trusting a model-written label. Evaluation wrappers frequently contain a
 * quoted test/template name before the actual product name; brandFrom already
 * encodes the general semantic-name rule used by the deterministic builders.
 */
export function resolveProjectIdentity(request: string, proposed?: unknown): string {
    const explicit = brandFrom(request, /[؀-ۿ]/u.test(String(request || '')));
    if (explicit) return explicit;
    const candidate = String(proposed || '').trim();
    return candidate || 'project';
}

/**
 * Keep a greenfield scaffold and the later project_run call pointed at the
 * same user-named artifact. This only normalizes identity and repeated path
 * prefixes; it does not invent files, frameworks, or implementation tasks.
 */
export function alignGreenfieldPlanIdentity(plan: any, request: string, isGreenfield: boolean): any {
    if (!isGreenfield || !plan || typeof plan !== 'object') return plan;
    const explicit = brandFrom(request, /[؀-ۿ]/u.test(String(request || '')));
    if (!explicit) return plan;

    const previousIdentity = normalizeProjectSegment(plan.projectName);
    plan.projectName = explicit;
    const phases = Array.isArray(plan.phases) ? plan.phases : [];
    const allTasks = phases.flatMap((phase: any) => [
        ...(Array.isArray(phase?.tasks) ? phase.tasks : []),
        ...(phase?.verificationTask ? [phase.verificationTask] : []),
    ]);

    // Do not infer the artifact root independently per phase. A planner may
    // call it `taskflow-ai` in one phase, `TaskFlow-AI--Joe-Live-Test-` in
    // another, and omit baseDir entirely while putting the root only in a file
    // path. Phase-local rewriting used to preserve all of those wrappers after
    // prefixing them with the accepted identity, producing paths such as
    // `TaskFlow AI/taskflow-ai/src/...` and making the very first verification
    // fail with `File not found`.
    const pathKeys = new Set([
        'path', 'cwd', 'baseDir', 'projectName', 'name', 'projectPath',
        'filePath', 'targetPath', 'directory', 'dir', 'projectQuery',
        'schemaPath', 'databasePath',
    ]);
    const arrayPathKeys = new Set(['files', 'filePaths', 'sourceFiles', 'paths']);
    const sourceDirectoryNames = new Set([
        'src', 'server', 'client', 'api', 'app', 'lib', 'tests', 'test',
        '__tests__', 'spec', 'docs', 'public', 'dist', 'build', 'coverage',
        'node_modules', '.git',
    ]);
    const oldPrefixes = new Set<string>([
        ...projectPathVariants(previousIdentity),
    ]);
    const collectRootCandidates = (value: unknown): void => {
        let raw = String(value || '').replace(/\\/g, '/').trim().replace(/^\.\//u, '');
        // `projectQuery` is often written as `"Old Project"`; the quotes are
        // syntax around the query, not part of the artifact-root identity.
        // Treating the wrapped value as a prefix would consume both quotes when
        // rewriteProjectPath replaces it and silently change the query contract.
        raw = raw.replace(/^(["'])(.*)\1$/u, '$2');
        if (!raw || path.isAbsolute(raw) || /^(?:[a-z][a-z0-9+.-]*:|\\$|%[^%]+%)/iu.test(raw)) return;
        const segments = raw.split('/').filter(Boolean);
        for (const segment of segments) {
            const candidate = normalizeProjectSegment(segment);
            if (!candidate || sourceDirectoryNames.has(candidate.toLocaleLowerCase())
                || /\.[a-z0-9]{1,8}$/iu.test(candidate)) continue;
            // Project wrappers generated by evaluators and model slugs are
            // normally visibly named (`TaskFlow-AI--...`, `taskflow-ai`).
            // Avoid treating a conventional source directory as a project.
            if (/[-_\s]/u.test(candidate)) oldPrefixes.add(candidate);
        }
    };
    for (const task of allTasks) {
        const args = { ...(task?.args || {}), ...(task?.input || {}) };
        for (const [key, value] of Object.entries(args)) {
            if (typeof value === 'string' && pathKeys.has(key)) {
                collectRootCandidates(value);
            } else if (arrayPathKeys.has(key) && Array.isArray(value)) {
                for (const entry of value) {
                    if (typeof entry === 'string') collectRootCandidates(entry);
                }
            }
        }
    }
    const stableOldPrefixes = [...oldPrefixes]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

    for (const phase of phases) {
        const tasks = Array.isArray(phase?.tasks) ? phase.tasks : [];
        for (const task of tasks) {
            if (String(task?.tool || '').toLowerCase() !== 'scaffold_project') continue;
            const args = { ...(task.args || {}) };
            const oldBase = normalizeProjectSegment(args.baseDir || args.projectName || args.name || previousIdentity);
            const prefixes = [oldBase, previousIdentity, ...stableOldPrefixes]
                .filter(Boolean)
                .filter((value, index, values) => values.indexOf(value) === index);
            const structure = args.structure;
            if (structure && typeof structure === 'object' && !Array.isArray(structure)) {
                const rewritten: Record<string, any> = {};
                for (const [rawPath, content] of Object.entries(structure)) {
                    let relativePath = normalizeProjectSegment(rawPath);
                    const prefix = prefixes.find(value => relativePath === value || relativePath.startsWith(`${value}/`));
                    if (prefix) relativePath = relativePath === prefix ? '' : relativePath.slice(prefix.length + 1);
                    rewritten[relativePath] = content;
                }
                args.structure = rewritten;
            }
            args.baseDir = explicit;
            if (Object.prototype.hasOwnProperty.call(args, 'projectName')) args.projectName = explicit;
            if (Object.prototype.hasOwnProperty.call(args, 'name')) args.name = explicit;
            task.args = args;
        }

        // A model can choose write_file/file_edit/shell tasks instead of the
        // scaffold primitive. Those tasks still need the same artifact root;
        // otherwise project_run correctly refuses to guess after files were
        // written into an evaluation-wrapper directory.
        for (const task of tasks) rewriteGreenfieldTaskPaths(task, stableOldPrefixes, explicit);
        if (phase?.verificationTask) {
            rewriteGreenfieldTaskPaths(phase.verificationTask, stableOldPrefixes, explicit);
        }
    }
    return plan;
}

export function deterministicPhasesFor(request: string): {
    projectName: string; reason: string; phases: Array<{ name: string; tasks: any[] }>;
} | null {
    const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
    if (!PlanningEngine.looksLikeBuild(request)) return null;
    const scope: 'page' | 'app' | 'system' = PlanningEngine.classifyBuildScope(request);

    let projectName = 'project';
    try { projectName = resolveProjectIdentity(request, require('../../../core/design/subject-phrase').subjectPhrase(request, 48)); } catch { /* naming is cosmetic */ }

    if (scope === 'system') {
        // The interface depends on the service that holds the rows — declared
        // as an ordered pair of phases, so the dependency is enforced by the
        // plan rather than left to whoever executes it.
        return {
            projectName,
            reason: 'declared entities require their own data service, and the interface depends on it',
            phases: [
                { name: 'Data service and schema', tasks: [{ tool: 'api_project', description: `Backend and database for: ${request}`, args: { request } }] },
                { name: 'Interface on the service', tasks: [{ tool: 'react_project', description: `Interface for: ${request}`, args: { request } }] },
            ],
        };
    }
    return {
        projectName,
        reason: scope === 'page' ? 'a single page was asked for; no data service is implied' : 'an application was asked for with no declared data service',
        phases: [{
            name: scope === 'page' ? 'Page' : 'Application',
            tasks: [{ tool: scope === 'page' ? 'web_page_builder' : 'react_project', description: request, args: { request } }],
        }],
    };
}

/**
 * A deterministic rescue is deliberately narrow. It may keep a short, direct
 * build request alive when the planner is unavailable, but it must not turn a
 * long evaluation brief, multi-phase specification, or acceptance contract
 * into the generic api_project/react_project pair. That would hide the loss of
 * engineering reasoning behind a plausible-looking template.
 */
export function buildPlannerEvidence(evidence: any, specificationSources: any[] = []): any {
    const directReferences = Array.isArray(evidence?.referenceProjects) ? evidence.referenceProjects : undefined;
    const wrappedReferences = [
        evidence?.evidence?.referenceProjects,
        evidence?.output?.evidence?.referenceProjects,
        evidence?.discovery?.referenceProjects,
        evidence?.discovery?.evidence?.referenceProjects,
    ].find(Array.isArray);
    // A greenfield request has no existing project to inspect. Sending the
    // entire workspace catalogue (417 projects in the live audit) only bloats
    // the local planning prompt and can starve Ollama of time to produce the
    // actual plan. Keep the catalogue for existing-project work, where it is
    // evidence, but omit it from a new-project planning handoff.
    const referenceProjects = evidence?.constraints?.createsNewProject === true
        ? []
        : directReferences || wrappedReferences || [];
    return {
        ...(evidence || {}),
        referenceProjects,
        ...(specificationSources.length ? { specificationSources } : {}),
    };
}

/**
 * WHEN NO PLAN EXISTS AT ALL, THE BAR IS DIFFERENT.
 *
 * The TaskFlow AI live test, verbatim: a six-thousand-character production
 * brief arrived, every planner provider was down, and the strict gate below
 * (length > 1800, two structural signals) forbade the deterministic rescue —
 * so a request the engine plainly recognises as a task-management system
 * ended as «Planning stopped honestly» with NOTHING built. The strict gate
 * exists to stop a live planner's WRONG plan from being papered over with a
 * template; when the planner is dead or answered empty, the alternative it
 * is protecting is the empty set.
 *
 * So a dead planner rescues whenever the engine genuinely recognises the
 * request as a build it owns. Honesty is kept by the gates that cannot be
 * bypassed: the scope audit names every asked-for area the engine did not
 * build, and the delivery reports PARTIAL — named, never silently shrunk.
 */
/**
 * THE PAIR'S DOOR IS THE API.
 *
 * A deterministic full-stack pair shares one suffix on disk —
 * react-taskflow-ai-9304 ↔ api-taskflow-ai-9304 — and the api serves the
 * BUILT interface at «/» while answering /api/* on the same origin. Round 6,
 * measured: live-run picked the interface's dev server instead, and the
 * final Browser QA counted the app's own /api/health calls as 8×404 — two
 * blocking findings about a topology mistake, not about the system.
 */
export function apiSiblingOf(projectRoot: string): string | null {
    try {
        const root = String(projectRoot || '').trim();
        if (!root) return null;
        const base = path.basename(root);
        if (!/^react-/.test(base)) return null;
        const sibling = path.join(path.dirname(root), base.replace(/^react-/, 'api-'));
        return fs.existsSync(path.join(sibling, 'server.js')) ? sibling : null;
    } catch { return null; }
}

/**
 *  A PLANNER THAT SUCCEEDS REPLACED THE ENGINE THAT KNOWS HIM.
 *
 *  The same sentence, twice, on his own machine:
 *
 *      run 1  [pipeline] no planner available — planning deterministically
 *             → react-الفواتير: his three columns, in Arabic, with real
 *               add/edit/delete, search, totals and durable storage
 *
 *      run 2  LLM planning completed → Plan created: 3 phases
 *             → invoice-manager: 34 lines, in English, three invented
 *               rows (INV-001, 100.00, 2023-01-01), no function at all
 *
 *  The WORSE build is the one where the planner worked. When it fails,
 *  Joe falls back on his own engine, which reads the request; when it
 *  succeeds, a model's guess takes the engine's place.
 *
 *  deterministicPhasesFor was written as a RESCUE for a dead planner.
 *  It is not a rescue. For a request that declares its own schema it
 *  is the right answer, and asking a model what to build instead is
 *  asking a question that was already answered — by him.
 *
 *  So the test is not «did the planner work». It is «did HE say what
 *  the thing holds». derivedColumns answers that from his sentence
 *  alone, with no catalogue, and when it answers, the planner is not
 *  consulted about WHAT to build. Everything else still goes to the
 *  planner exactly as before: a request that declares no schema is
 *  one where a model genuinely has something to decide.
 */
export function heDeclaredWhatItHolds(request: string): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { columnsAnywhereInHisRequest } = require('../../../core/design/app-blueprints');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
        if (!PlanningEngine.looksLikeBuild(request)) return false;
        const columns = columnsAnywhereInHisRequest(request);
        //  No floor of my own: derivedColumns already refuses one noun
        //  after «جدول» as a subject rather than a column, and two floors
        //  for one rule is how they come apart. A mutation proved this
        //  one could never decide anything.
        return Array.isArray(columns) && columns.length > 0;
    } catch { return false; }
}

export function deterministicRescueForDeadPlanner(request: string): boolean {
    if (deterministicRescueAllowed(request)) return true;
    try {
        const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
        if (!PlanningEngine.looksLikeBuild(request)) return false;
        const { detectAppKind, stripDeclaredOptions } = require('../../../core/design/app-blueprints');
        return !!detectAppKind(stripDeclaredOptions(request));
    } catch { return false; }
}

export function deterministicRescueAllowed(request: string): boolean {
    const text = String(request || '').trim();
    if (!text || text.length > 1800) return false;
    const structuralSignals = [
        /\bphase(?:s|d)?\b/i,
        /acceptance\s+criteria|definition\s+of\s+done/i,
        /(?:api|integration)\s+contract|openapi|json\s+schema/i,
        /(?:contract|integration|e2e|regression)\s+test/i,
        /final\s+audit|evidence\s+matrix|verification\s+report/i,
        /(?:first|then|after that|finally)\s+(?:inspect|implement|test|verify|document)/i,
    ];
    const signalCount = structuralSignals.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
    return signalCount < 2;
}

/**
 * A greenfield interactive application must reach the real UI builder.
 * A generic scaffold is not equivalent: it can satisfy the runnable contract
 * while silently producing a landing page or an empty shell, which is exactly
 * how the first CalcPro run passed planning but failed independent acceptance.
 * This guard is semantic: it applies only to an application-shaped request with
 * browser/UI signals and a known app blueprint. Long briefs are still handled by
 * the evidence-backed planner; this guard only replaces a plan that omitted the
 * concrete UI builder.
 */
export function interactiveAppNeedsReactBuilder(request: string): boolean {
    const text = String(request || '').trim();
    try {
        const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
        const { detectAppKind, stripDeclaredOptions } = require('../../../core/design/app-blueprints');
        if (!PlanningEngine.looksLikeBuild(text)) return false;
        const scope = PlanningEngine.classifyBuildScope(text);
        // A short app with explicit persistence is classified as `system`; that
        // must not demote its UI to a generic scaffold. The known blueprint is
        // the evidence boundary — long/unknown engineering briefs still stay
        // with the planner and its honest gates.
        const kind = detectAppKind(stripDeclaredOptions(text));
        if (!kind || (scope !== 'app' && scope !== 'system')) return false;
        return /\b(?:web|browser|frontend|front[ -]?end|responsive|mobile|ui|interface|application|app|dashboard|portal|calculator|notes?|tracker|weather|shop|form|button|crud|tasks?)\b/i.test(text)
            || kind === 'productivity';
    } catch {
        return false;
    }
}

export function planContainsReactBuilder(phases: any[]): boolean {
    return (Array.isArray(phases) ? phases : []).some((phase: any) =>
        [...(Array.isArray(phase?.tasks) ? phase.tasks : []), ...(phase?.verificationTask ? [phase.verificationTask] : [])]
            .some((task: any) => String(task?.tool || '').trim().toLowerCase() === 'react_project'));
}

export function planContainsTool(phases: any[], toolName: string): boolean {
    const expected = String(toolName || '').trim().toLowerCase();
    if (!expected) return false;
    return (Array.isArray(phases) ? phases : []).some((phase: any) =>
        [...(Array.isArray(phase?.tasks) ? phase.tasks : []), ...(phase?.verificationTask ? [phase.verificationTask] : [])]
            .some((task: any) => String(task?.tool || '').trim().toLowerCase() === expected));
}

/**
 * A browser application may consume a public API without owning a backend.
 * If the planner nevertheless inserts api_project into an `app` plan, the
 * presence of a react_project sibling is not enough: the API phase can create
 * a different artifact and make the pipeline lose the application's identity.
 * Keep explicit backend/database systems untouched, but rescue this hallucinated
 * backend before any project files are written.
 */
export function planContainsUnrequestedApiBuilder(request: string, phases: any[]): boolean {
    if (!interactiveAppNeedsReactBuilder(request)) return false;
    try {
        const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
        return PlanningEngine.classifyBuildScope(String(request || '')) === 'app'
            && planContainsTool(phases, 'api_project');
    } catch {
        return false;
    }
}

/**
 * A build is not delivered merely because its phase tools returned ok.  The
 * final acceptance contract requires a confirmed live URL when the canonical
 * pipeline claims a runnable system.  This pure reducer keeps the rule
 * testable and prevents a spawned-but-dead process or a missing entrypoint
 * from becoming a success message.
 */
export function applyLiveRunOutcome(
    initiallyVerified: boolean,
    runResult: any,
): { verified: boolean; liveUrl: string; verificationFailed: boolean; error?: string } {
    if (!initiallyVerified) return { verified: false, liveUrl: '', verificationFailed: false };
    const liveUrl = String(runResult?.output?.url || '').trim();
    if (runResult?.ok === true && liveUrl) {
        return { verified: true, liveUrl, verificationFailed: false };
    }
    return {
        verified: false,
        liveUrl: '',
        verificationFailed: true,
        error: String(runResult?.error || runResult?.output?.message || 'project_run did not confirm a live URL'),
    };
}

export interface ScopeGateOutcome {
    verified: boolean;
    liveUrl: string;
    verificationFailed: boolean;
    error?: string;
    scopeAudit: {
        requested: number;
        built: number;
        coverage: number;
        missing: string[];
    };
    scopeCoverageFailed?: boolean;
}

export interface ProjectQualityContract {
    ok: boolean;
    failures: string[];
}

/**
 * A full-stack pair has two different roots with two different jobs: the
 * React root is the source/evidence root, while the API sibling is the live
 * door. Keep both roots in the audit ledger so runtime topology cannot make
 * the quality gate inspect the wrong package.json or miss UI capabilities.
 */
export function projectAuditRoots(sourceRoot: string, runtimeRoot: string): string[] {
    const source = String(sourceRoot || '').trim();
    const runtime = String(runtimeRoot || '').trim();
    const roots: string[] = [];
    const add = (candidate: string) => {
        const value = String(candidate || '').trim();
        if (value && !roots.includes(value)) roots.push(value);
    };
    add(source);
    if (!source && runtime && /^api-/i.test(path.basename(runtime))) {
        add(path.join(path.dirname(runtime), path.basename(runtime).replace(/^api-/i, 'react-')));
    }
    add(runtime);
    return roots;
}

export function projectAuditDirectory(roots: string[]): string {
    for (const root of roots.map(value => String(value || '').trim()).filter(Boolean)) {
        if (fs.existsSync(path.join(root, 'index.html'))) return root;
        if (fs.existsSync(path.join(root, 'dist', 'index.html'))) return path.join(root, 'dist');
        if (fs.existsSync(path.join(root, 'public', 'index.html'))) return path.join(root, 'public');
    }
    return roots.map(value => String(value || '').trim()).find(Boolean) || '';
}

const PLACEHOLDER_SCRIPT = /^(?:echo\b.*(?:not\s+(?:implemented|specified|available)|no\s+tests?|placeholder|todo).*|(?:true|:|exit\s+0))$/iu;

/**
 * A declared lifecycle check is part of the delivery contract. A script that
 * exits zero while saying "not implemented" is not evidence of a build or a
 * test; accepting it turns a truthful command requirement into a green lie.
 * This reducer is intentionally manifest/domain neutral and only rejects
 * explicit placeholders or missing checks when the request asks for them.
 */
export function inspectProjectQualityContract(projectRoot: string, request = ''): ProjectQualityContract {
    const root = String(projectRoot || '').trim();
    const manifestPath = root ? path.join(root, 'package.json') : '';
    if (!manifestPath || !fs.existsSync(manifestPath)) return { ok: true, failures: [] };
    let manifest: any;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error: any) {
        return { ok: false, failures: [`package.json is unreadable: ${String(error?.message || error).slice(0, 240)}`] };
    }
    const scripts = manifest?.scripts && typeof manifest.scripts === 'object' ? manifest.scripts : {};
    const failures: string[] = [];
    for (const name of ['build', 'test']) {
        if (typeof scripts[name] === 'string' && PLACEHOLDER_SCRIPT.test(scripts[name].trim())) {
            failures.push(`${name} script is a placeholder: ${scripts[name].trim()}`);
        }
    }
    const asksForChecks = /(?:\b(?:npm\s+)?(?:run\s+)?(?:build|test|tests)\b|بناء|اختبار)/iu.test(String(request || ''));
    if (asksForChecks) {
        for (const name of ['build', 'test']) {
            if (typeof scripts[name] !== 'string' || !scripts[name].trim()) {
                failures.push(`package.json has no truthful ${name} script although the request requires it`);
            }
        }
    }
    return { ok: failures.length === 0, failures };
}

export function applyProjectQualityContractOutcome(
    projectRoot: string,
    request: string,
    liveOutcome: { verified: boolean; liveUrl: string; verificationFailed: boolean; error?: string },
): { verified: boolean; liveUrl: string; verificationFailed: boolean; error?: string } {
    if (!liveOutcome.verified) return liveOutcome;
    const quality = inspectProjectQualityContract(projectRoot, request);
    if (quality.ok) return liveOutcome;
    return {
        ...liveOutcome,
        verified: false,
        verificationFailed: true,
        error: `project quality contract failed — ${quality.failures.slice(0, 4).join('; ')}`,
    };
}

/**
 * A live HTTP response proves reachability, not that the requested system was
 * built.  Keep this gate domain-neutral: scope-audit extracts named
 * capabilities from the original request and looks for evidence in the exact
 * artifact root that project_run started.  An underspecified request remains
 * admissible; a request with named scope cannot be delivered with any named capability missing.
 */
export function applyScopeAuditOutcome(
    request: string,
    projectRoot: string | string[],
    liveOutcome: { verified: boolean; liveUrl: string; verificationFailed: boolean; error?: string },
): ScopeGateOutcome {
    const roots = (Array.isArray(projectRoot) ? projectRoot : [projectRoot])
        .map(root => String(root || '').trim())
        .filter(Boolean);
    if (!liveOutcome.verified) {
        return { ...liveOutcome, scopeAudit: { requested: 0, built: 0, coverage: 0, missing: [] } };
    }
    if (!roots.length) {
        return {
            ...liveOutcome,
            verified: false,
            verificationFailed: true,
            error: 'project_run confirmed a live URL but did not identify the artifact root for scope verification',
            scopeAudit: { requested: 0, built: 0, coverage: 0, missing: [] },
        };
    }

    const report = scopeReport(request, roots);
    const coverage = report.requested.length
        ? report.built.length / report.requested.length
        : 1;
    const missing = report.missing.map(capability => capability.en);
    const scopeAudit = {
        requested: report.requested.length,
        built: report.built.length,
        coverage,
        missing,
    };
    if (missing.length > 0) {
        const missingText = missing.slice(0, 8).join(', ') || 'named capabilities';
        return {
            ...liveOutcome,
            verified: false,
            verificationFailed: true,
            error: `artifact coverage ${Math.round(coverage * 100)}% — missing: ${missingText}`,
            scopeAudit,
            scopeCoverageFailed: true,
        };
    }
    return { ...liveOutcome, scopeAudit };
}

export class ProjectPipelineTool implements ToolDefinition {
    name = 'project_pipeline';
    version = '1.0.0';
    description = 'Build a complete multi-file project through the canonical engineering pipeline: plan phases, execute each with verification and auto build checks, self-heal failures, and report honestly.';
    tags = ['execution', 'project', 'pipeline', 'builder', 'quality'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string' as const, description: 'The full project request, in the user\'s own words' },
            // The blocking message below tells the caller to select a project
            // root. It has to arrive somewhere: discovery accepts `path`, and
            // before this the pipeline never forwarded it, so the remedy it
            // printed was an instruction with no wire behind it.
            path: { type: 'string' as const, description: 'Workspace-relative project root to operate on. Answers a select_project_root decision.' },
        },
        required: ['request'],
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            projectName: { type: 'string' as const },
            completedPhases: { type: 'number' as const },
            totalPhases: { type: 'number' as const },
            verified: { type: 'boolean' as const },
            summary: { type: 'string' as const },
            report: { type: 'object' as const },
        },
    };

    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];

    rateLimitPerMinute = 3;
    auditFields = ['request'];
    mockSupported = false;

    async execute(input: { request: string; path?: string }, context?: any) {
        const logs: string[] = [];
        const request = String(input?.request || '').trim();
        if (!request) return { ok: false, error: 'request is required', logs };

        const say = (m: string) => { appendBoundedPipelineLog(logs, m); context?.onProgress?.(m); };

        /**
         * ONE RUN, ONE LANGUAGE — AND THE PIPELINE WAS STILL DEAF TO IT.
         *
         * His English prompt, with Joe switched to English, produced a trace
         * in two languages at once:
         *
         *     [pipeline] plan ready: Build a complete system … — 3 phases
         *     ⚙️ المرحلة 1/3 — Backend & database
         *     ✅ اكتملت المرحلة 1/3 وتحقَّقت
         *     ▶️ أُشغّل النظام لتراه حيّاً…
         *
         * The rule lives in one file now; this tool simply never asked it.
         * Worse, the delivery report below defaulted to `'ar'` when the
         * interface said nothing, so silence meant Arabic — which is a guess
         * about the reader, not a fact. The request's own script is the fact.
         */
        const isAr = isArabicReply({ language: context?.language, text: request });
        // A live capability-test harness may wrap the real product request with
        // instructions addressed to the evaluator. Discovery and planning must
        // reason about the embedded engineering brief, not the harness itself.
        // When no explicit boundary exists this is a no-op for ordinary user
        // requests, preserving the general-purpose nature of the pipeline.
        const productRequest = this.extractEmbeddedProductRequest(request);
        if (productRequest !== request) {
            appendBoundedPipelineLog(logs, `pipeline.embedded_product_request_extracted chars=${productRequest.length}`);
        }

        // Discovery is mandatory before any engineering write. Product names and
        // business nouns are evidence only; they never select a named foundation.
        say(pick(isAr,
            '[pipeline] أستكشف مساحة العمل والمشروع والاختبارات قبل اختيار أي تنفيذ…',
            '[pipeline] Discovering the workspace, project, and declared checks before selecting implementation…'));
        const projectPath = String(input?.path || '').trim();
        const discoveryResult = await executeTool('engineering_discovery',
            projectPath ? { request: productRequest, path: projectPath } : { request: productRequest }, context);
        if (!discoveryResult?.ok || !discoveryResult?.output?.evidence) {
            const message = discoveryResult?.error || 'Engineering discovery did not return usable evidence.';
            return {
                ok: false,
                error: message,
                output: {
                    projectName: 'engineering-task', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'blocked', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    // The canonical pipeline evaluated this request and ended it;
                    // the outer orchestrator must surface this evidence, not invent
                    // a second generic repair plan from the error text.
                    pipelineFinal: true,
                    summary: pick(isAr, `## ⚠️ توقف قبل الكتابة\n\nتعذر جمع أدلة مساحة العمل: ${message}`, `## ⚠️ Stopped before writing\n\nWorkspace evidence could not be collected: ${message}`),
                },
                logs: boundedPipelineLogs(logs, discoveryResult?.logs),
            };
        }
        const evidence = discoveryResult.output.evidence;
        appendBoundedPipelineLogs(logs, discoveryResult.logs);
        if (evidence.constraints?.readOnly === true) {
            const summary = pick(isAr,
                '## ⏸️ توقف آمن قبل التخطيط\n\nهذا الطلب للقراءة والتحقق فقط. لم يُخطط Joe لأي كتابة أو تثبيت أو تشغيل. حدّد مسار المشروع صراحةً لاستدعاء أداة التحليل للقراءة فقط.',
                '## ⏸️ Safely stopped before planning\n\nThis request is read-only. Joe did not plan any write, install, or run action. Provide an explicit project path to invoke a read-only analysis tool.');
            say('[pipeline] read-only intent detected — blocking planning and execution');
            return {
                ok: true,
                output: {
                    projectName: 'read-only-audit', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'not_started', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    pipelineFinal: true, stopReason: 'read_only_request', requiresUserDecision: true,
                    evidence, summary,
                },
                logs,
            };
        }
        if (evidence.mode === 'remote_repository' || evidence.mode === 'ambiguous' || (Array.isArray(evidence.blockers) && evidence.blockers.length > 0)) {
            const details = (evidence.blockers || []).map((blocker: any) => `- ${blocker.message}${blocker.remedy ? ` (${blocker.remedy})` : ''}`).join('\n') || 'Select the project root and retry discovery.';
            const summary = pick(isAr,
                `## ⚠️ توقف قبل الكتابة لأن الدليل غير مكتمل\n\n${details}\n\nلم يُنشئ Joe قالباً بديلاً ولم يعدّل أي ملف.`,
                `## ⚠️ Stopped before writing because evidence is incomplete\n\n${details}\n\nJoe did not create a substitute template or modify files.`);
            say('[pipeline] evidence is incomplete — blocking writes honestly');
            return {
                ok: false,
                error: summary,
                output: {
                    projectName: 'engineering-task', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'not_started', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    // A discovery blocker is a product decision boundary, not an
                    // execution fault. The orchestrator must surface it to the user
                    // rather than inventing repair work or guessing a project root.
                    requiresUserDecision: true,
                    pipelineFinal: true,
                    stopReason: 'evidence_incomplete',
                    decision: {
                        kind: 'select_project_root',
                        blockers: evidence.blockers || [],
                        // Name the input that carries the answer back, so the
                        // caller can act on this instead of re-reading it.
                        answerWith: { tool: 'project_pipeline', field: 'path' },
                        candidates: (evidence.facts || [])
                            .filter((fact: any) => fact.id === 'workspace.multiple_projects')
                            .map((fact: any) => fact.statement),
                    },
                    evidence, summary,
                },
                logs,
            };
        }
        const specification = await this.readRequestedSpecifications(productRequest, evidence, context, logs, say, isAr);
        if (specification.error) {
            const summary = pick(isAr,
                `## ⚠️ توقف قبل التخطيط\n\n${specification.error}\n\nلم يُخمّن Joe محتوى مواصفة أو أمر اختبار من دون مصدر مقروء.`,
                `## ⚠️ Stopped before planning\n\n${specification.error}\n\nJoe did not guess a specification or test command without a source it had read.`);
            return {
                ok: false,
                error: summary,
                output: {
                    projectName: 'engineering-task', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'not_started', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    pipelineFinal: true, honestBlocker: true, evidence, summary,
                },
                logs,
            };
        }
        // The specification is always read in full before planning, but a very
        // large document must not be copied wholesale into a single provider call.
        // That turns a documented local requirement into a timeout and makes the
        // planner less reliable, not more informed. The deterministic brief below
        // preserves scope, headings, and binding constraints with its source files;
        // the complete text remains recorded as read evidence and is carried as
        // bounded context to file-generation tasks after a plan is accepted.
        const requirementsContext = this.buildRequirementsContext(productRequest, specification.content);
        const planningRequest = specification.content
            ? `${productRequest}\n\n--- COMPACT REQUIREMENTS EVIDENCE (derived from complete local files read through read_file; do not invent beyond it) ---\n${requirementsContext}\n--- END COMPACT REQUIREMENTS EVIDENCE ---`
            : productRequest;
        if (requirementsContext) appendBoundedPipelineLog(logs, `pipeline.planning_requirements_brief_chars=${requirementsContext.length}`);
        const plannerEvidence = buildPlannerEvidence(evidence, specification.sources);

        // Provider health is an execution prerequisite, not a late planner error.
        // Probe the exact configured provider (or the auto mesh) before spending a
        // long engineering-run budget. Tests may explicitly opt out; production
        // callers cannot silently convert an unavailable model into fake progress.
        const modelConfig = context?.modelConfig || {};
        const providerHealth = context?.skipProviderPreflight === true
            ? { ok: true, provider: String(modelConfig.provider || 'auto'), detail: 'skipped_by_test_harness' }
            : await verifyProviderDirect(String(modelConfig.provider || 'auto'), {
                apiKey: modelConfig.apiKey,
                baseUrl: modelConfig.baseUrl,
                model: modelConfig.model,
            });
        appendBoundedPipelineLog(logs, `[pipeline] provider preflight ${providerHealth.provider}: ${providerHealth.ok ? 'ok' : 'blocked'} (${providerHealth.detail})`);
        if (!providerHealth.ok) {
            const summary = pick(isAr,
                `## ⚠️ توقف قبل التخطيط لأن مزود الذكاء الاصطناعي غير متاح\n\nالمزود: ${providerHealth.provider}\nالتفصيل: ${providerHealth.detail}\n\nلم ينشئ Joe ملفات ولم يبدأ مراحل طويلة من دون مزود صالح.`,
                `## ⚠️ Stopped before planning because the AI provider is unavailable\n\nProvider: ${providerHealth.provider}\nDetail: ${providerHealth.detail}\n\nJoe did not write files or start a long phase run without a healthy provider.`,
            );
            return {
                ok: false,
                error: summary,
                output: {
                    projectName: 'engineering-task', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'blocked', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    pipelineFinal: true, honestBlocker: true, stopReason: 'provider_unavailable',
                    providerHealth, evidence, summary,
                },
                logs,
            };
        }

        // Preserve the root selected by discovery as execution evidence. A project
        // can be locally real but incomplete (for example src/tests without a
        // manifest); naming it from the request is not enough to find that root.
        // ProjectRunTool still owns runnable-marker validation and may refuse it.
        const isGreenfield = evidence?.constraints?.createsNewProject === true;
        // Greenfield discovery deliberately has no write target. If a stale
        // selectedProject leaks through, it is usually Joe's own repository;
        // only existing-project work may seed the planner with that root.
        const discoveredProjectRoot = isGreenfield ? '' : String(evidence?.selectedProject?.root || '').trim();
        const plannerReferenceProjects = Array.isArray(plannerEvidence.referenceProjects) ? plannerEvidence.referenceProjects : [];
        const plannerReferenceManifests = plannerReferenceProjects.reduce((count: number, project: any) =>
            count + (Array.isArray(project?.manifests) ? project.manifests.length : 0), 0);
        appendBoundedPipelineLog(logs, `[pipeline] planner_evidence referenceProjects=${plannerReferenceProjects.length} manifests=${plannerReferenceManifests}`);

        say(pick(isAr,
            `[pipeline] دليل جاهز: ${evidence.mode}${evidence.selectedProject ? ` — ${evidence.selectedProject.root}` : ''}`,
            `[pipeline] Evidence ready: ${evidence.mode}${evidence.selectedProject ? ` — ${evidence.selectedProject.root}` : ''}`));

        // 1 — Plan from the evidence. A valid plan may choose a framework or a
        // foundation only when it records a reason grounded in requirements or
        // inspected workspace facts; no deterministic request classifier owns it.
        /**
         *  HE ALREADY SAID WHAT IT HOLDS — SO NOTHING IS ASKED ABOUT IT.
         *
         *  See heDeclaredWhatItHolds above for the two runs of the same
         *  sentence that produced two different products, the worse one
         *  being the run where the planner succeeded.
         *
         *  This is not «skip the planner». It is: when his sentence
         *  names the columns, WHAT to build is settled, and a model has
         *  nothing left to decide about it. Requests that declare no
         *  schema fall straight through to the planner as before — those
         *  are the ones where a model genuinely has a question to answer.
         */
        let hisPlan: any = null;
        const hisOwnSchema = evidence?.constraints?.createsNewProject
            && heDeclaredWhatItHolds(productRequest)
            ? deterministicPhasesFor(productRequest)
            : null;
        if (hisOwnSchema) {
            say(pick(isAr,
                `[pipeline] الطلب يصرّح بأعمدته — أبني منه مباشرة بلا أن أسأل نموذجاً ما المطلوب: ${hisOwnSchema.reason}`,
                `[pipeline] the request declares its own columns — building from it directly, with no model asked what to build: ${hisOwnSchema.reason}`));
            hisPlan = {
                ok: true,
                output: {
                    projectName: hisOwnSchema.projectName,
                    phases: hisOwnSchema.phases,
                    deterministic: true,
                    plannedWithoutModel: true,
                },
                logs: [],
            };
        }

        say('[pipeline] planning evidence-backed engineering phases…');
        // A greenfield engineering plan is the one operation that may legitimately
        // produce a large, evidence-backed JSON graph. Give it an explicit bounded
        // deadline and mark the call as an engineering pipeline so the planner's
        // one recovery pass is available after a transient gateway failure. The
        // normal chat route keeps its shorter deadline.
        const plannerTimeoutMs = Number(context?.plannerTimeoutMs) > 0
            ? Number(context.plannerTimeoutMs)
            : 180_000;
        //  When his sentence settled it, the planner is not called at all.
        let plannerResult: any = hisPlan || await executeTool('project_planner',
            { projectDescription: planningRequest, evidence: plannerEvidence },
            {
                ...(context || {}),
                requireRunnableContract: true,
                engineeringPipeline: true,
                plannerTimeoutMs,
            },
        );
        if (!plannerResult?.ok || plannerResult?.output?.fallback) {
            const blocker = plannerResult?.output?.blocker?.message || plannerResult?.error || 'The planner did not produce a valid evidence-backed plan.';

            /**
             * A RESCUE THAT RE-CALLS THE THING THAT JUST FAILED IS NOT A RESCUE.
             *
             * When every provider is down, the planner returns nothing — and
             * the rescue plan upstream routes here, into a tool whose first
             * real step is that same planner. Measured on a clean workspace
             * with every provider unreachable: 0/0 phases, zero files, «توقف
             * التخطيط بصدق». The circle closed on the exact case the rescue
             * exists for.
             *
             * The answer is NOT a product-name template. It is to plan from
             * what the REQUEST ITSELF declares — the same shape path the rest
             * of this system uses: the entities he listed become the data
             * model, the scope decides whether that needs a server, and the
             * deterministic builders do work that never needed a model. If
             * the request declares too little to plan from, this falls through
             * and stops honestly, exactly as before.
             */
            const deterministic = evidence?.constraints?.createsNewProject && deterministicRescueForDeadPlanner(productRequest)
                ? deterministicPhasesFor(productRequest)
                : null;
            if (deterministic) {
                say(pick(isAr,
                    `[pipeline] لا مخطِّط متاح — أخطّط حتمياً مما صرّح به الطلب: ${deterministic.reason}`,
                    `[pipeline] no planner available — planning deterministically from what the request declares: ${deterministic.reason}`));
                plannerResult = {
                    ok: true,
                    output: { projectName: deterministic.projectName, phases: deterministic.phases, deterministic: true, plannedWithoutModel: true },
                    logs: boundedPipelineLogs(plannerResult?.logs),
                };
            } else {
            const summary = pick(isAr,
                `## ⚠️ توقف التخطيط بصدق\n\n${blocker}\n\nلم يُنشئ Joe مشروعاً أو قالباً كتعويض عن خطة مفقودة.`,
                `## ⚠️ Planning stopped honestly\n\n${blocker}\n\nJoe did not create a project or template as a substitute for a missing plan.`);
            return {
                ok: false,
                error: summary,
                output: {
                    projectName: plannerResult?.output?.projectName || 'engineering-task', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'not_started', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    pipelineFinal: true,
                    evidence, summary,
                },
                logs: boundedPipelineLogs(logs, plannerResult?.logs),
            };
            }
        }
        /**
         * A PLAN OF ZERO PHASES IS A MISSING PLAN WEARING ok:true.
         *
         * The rescue above fires when the planner FAILS. A planner that
         * answers successfully with an empty `phases` array walked straight
         * past it into this exit — same outcome for the user, nothing built,
         * and the deterministic plan that could have run sitting one branch
         * away. Both are the same fact: no plan arrived.
         */
        if ((!Array.isArray(plannerResult?.output?.phases) || plannerResult.output.phases.length === 0)
            && evidence?.constraints?.createsNewProject) {
            const rescue = deterministicRescueForDeadPlanner(productRequest) ? deterministicPhasesFor(productRequest) : null;
            if (rescue) {
                say(pick(isAr,
                    `[pipeline] الخطة عادت فارغة — أخطّط حتمياً مما صرّح به الطلب: ${rescue.reason}`,
                    `[pipeline] the plan came back empty — planning deterministically from what the request declares: ${rescue.reason}`));
                plannerResult = {
                    ok: true,
                    output: { projectName: rescue.projectName, phases: rescue.phases, deterministic: true, plannedWithoutModel: true },
                    logs: boundedPipelineLogs(plannerResult?.logs),
                };
            }
        }

        /**
         * A PLAN MADE ONLY OF PAPER IS NOT A PLAN FOR AN APPLICATION.
         *
         * The two rescues above catch a planner that fails and a planner that
         * answers with nothing. The MyBudget field run found the third shape:
         * a planner that answers CONFIDENTLY with five template phases —
         * Technical Stack, Database, Business Logic, Testing, Deployment —
         * whose every task is ai_write_file. Ten loose .ts files were written,
         * each phase «verified» by project_detect (which counts projects and
         * proves nothing about them), and six minutes later the delivery gate
         * said honestly that no runnable application existed. The user watched
         * an empty preview the whole time.
         *
         * The measurable test is the fishing law's: a plan for a NEW
         * application that never invokes anything able to build or run one —
         * no builder, no scaffold, no shell, no npm, no run — did not read the
         * request; it recited a template. The deterministic chain that plans
         * from what the request itself declares is sitting one branch up, and
         * it is the same rescue both earlier shapes already use.
         */
        {
            const CAN_BUILD_OR_RUN = new Set(['api_project', 'react_project', 'web_page_builder', 'scaffold_project',
                'scaffold_full_stack', 'shell_execute', 'npm_manager', 'project_run', 'project_edit']);
            const planPhases = Array.isArray(plannerResult?.output?.phases) ? plannerResult.output.phases : [];
            const touchesRunnable = planPhases.some((phase: any) =>
                [...(Array.isArray(phase?.tasks) ? phase.tasks : []),
                 ...(phase?.verificationTask ? [phase.verificationTask] : [])]
                    .some((t: any) => CAN_BUILD_OR_RUN.has(String(t?.tool || ''))));
            const requiresConcreteUiBuilder = interactiveAppNeedsReactBuilder(productRequest);
            const missingConcreteUiBuilder = requiresConcreteUiBuilder && !planContainsReactBuilder(planPhases);
            const unrequestedApiBuilder = planContainsUnrequestedApiBuilder(productRequest, planPhases);
            const requiresDeterministicRescue = !touchesRunnable || missingConcreteUiBuilder || unrequestedApiBuilder;
            if (planPhases.length > 0 && requiresDeterministicRescue
                && evidence?.constraints?.createsNewProject
                && plannerResult?.output?.deterministic !== true
                && (deterministicRescueAllowed(productRequest) || requiresConcreteUiBuilder)) {
                const rescue = deterministicPhasesFor(productRequest);
                if (rescue) {
                    const reason = missingConcreteUiBuilder
                        ? 'the interactive application plan omitted the concrete React UI builder'
                        : unrequestedApiBuilder
                            ? 'the app plan introduced an unrequested backend builder'
                            : 'the plan is all paper — files written, nothing built or run';
                    say(pick(isAr,
                        `[pipeline] ${reason} — أخطّط حتمياً مما صرّح به الطلب: ${rescue.reason}`,
                        `[pipeline] ${reason}; planning deterministically from what the request declares: ${rescue.reason}`));
                    plannerResult = {
                        ok: true,
                        output: { projectName: rescue.projectName, phases: rescue.phases, deterministic: true, plannedWithoutModel: true },
                        logs: boundedPipelineLogs(plannerResult?.logs),
                    };
                }
            }
        }

        const phases = plannerResult?.output?.phases;
        if (!Array.isArray(phases) || phases.length === 0) {
            return {
                ok: false,
                error: plannerResult?.error || 'planner returned no phases',
                output: {
                    pipelineFinal: true,
                    executionStatus: 'not_started',
                    verificationStatus: 'not_run',
                    deliveryStatus: 'blocked',
                },
                logs,
            };
        }
        // Normalize the greenfield plan before accepting its display/root identity.
        // Otherwise a stale model/fallback label can overwrite the corrected name
        // after all task paths have already been rewritten.
        if (isGreenfield) alignGreenfieldPlanIdentity(plannerResult.output, request, true);
        const acceptedProjectName = resolveProjectIdentity(request, plannerResult.output.projectName);
        plannerResult.output.projectName = acceptedProjectName;

        // Each file-generation task runs later with only a short task description.
        // Carry the same bounded evidence brief that grounded the accepted plan so
        // workers cannot substitute a familiar template for a documented artifact.
        plannerResult.output.requirementsContext = requirementsContext;
        plannerResult.output.createsNewProject = isGreenfield;
        if (discoveredProjectRoot) plannerResult.output.projectRoot = discoveredProjectRoot;
        say(`[pipeline] evidence-backed plan ready: ${plannerResult.output.projectName || 'project'} — ${phases.length} phases`);

        // 2 — Execute through the canonical pipeline (verification tasks, auto
        // build checks, repair tickets, one self-fix attempt, honest stop).
        // Lazy require: ToolService -> definitions -> AgentLoopService -> ToolService
        // is a cycle if imported at module load.
        const { AgentLoopService } = require('../../services/AgentLoopService');
        const pipeline = await AgentLoopService.runPlannedPhasesIfPresent({
            sessionId: context?.sessionId || `pipeline-${Date.now()}`,
            runId: context?.runId || `run-${Date.now()}`,
            userId: context?.userId || 'anonymous',
            workspaceId: context?.workspaceId || context?.sessionId || 'default',
            // Preserve the visible browser panel through the canonical phase pipeline.
            // Without this, PhaseExecutor fell back to the chat session and the
            // first real browser verification was rejected by the ownership gate.
            browserSessionId: context?.browserSessionId,
            // Keep the local engineering boundary explicit across the pipeline
            // handoff. PhaseExecutor uses this trusted marker to skip an
            // unapproved public expose_port task while retaining localhost QA.
            engineeringPipeline: true,
            purpose: 'internal',
            plannerResult,
            modelConfig: context?.modelConfig,
            // Preserve the engineering LLM budget across the planner -> phase
            // handoff. PhaseExecutor already carries these fields downstream;
            // dropping them here silently restores LLM7's 30s default and turns
            // a transient provider delay into a false phase failure.
            providerTimeoutMs: context?.providerTimeoutMs ?? plannerTimeoutMs,
            plannerTimeoutMs,
            plannerMaxCompletionTokens: context?.plannerMaxCompletionTokens,
            plannerReasoningEffort: context?.plannerReasoningEffort,
            // The phase announcements are the loudest lines in the trace, and
            // they were the ones speaking the wrong language.
            language: isAr ? 'ar' : 'en',
            // The live voice: phase-by-phase progress reaches the same panel
            // stream the orchestrator wired into this tool's context.
            onProgress: (m: string) => say(m),
        });

        /**
         * Phase execution can create the runnable artifact even when the initial
         * greenfield discovery intentionally has no selectedProject. The old
         * handoff kept the planner's empty projectRoot and later fell back to a
         * projectQuery such as "nexus", which correctly refused to guess when
         * the on-disk folder was named differently. Re-bind the current artifact
         * using the existing repair-aware discovery contract before project_run;
         * this is evidence, not a name-based fallback, and it also covers a
         * manifest that was written during the final phase.
         */
        const runtimeProjectRoot = trustedRuntimeProjectRoot(
            context?.sessionId,
            context?.workspaceId || context?.sessionId || 'default',
            context?.runId,
        );
        if (pipeline?.ok === true && !String(plannerResult?.output?.projectRoot || '').trim() && runtimeProjectRoot) {
            plannerResult.output.projectRoot = runtimeProjectRoot;
            appendBoundedPipelineLog(logs, `[pipeline] runtime phase evidence bound projectRoot=${runtimeProjectRoot}`);
            say(pick(isAr,
                `📍 ثبّتُ جذر المشروع الذي سجّلته المراحل: ${runtimeProjectRoot}`,
                `📍 Bound the runtime project root recorded by the phases: ${runtimeProjectRoot}`));
        }
        if (pipeline?.ok === true && !String(plannerResult?.output?.projectRoot || '').trim() && !runtimeProjectRoot) {
            try {
                const postPhaseDiscoveryRequest = [
                    'Inspect the current workspace after the implementation phases completed.',
                    'Select the exact existing artifact root that the phases wrote and that project_run should execute.',
                    'This is read-only binding evidence; do not rewrite files, create a template, or choose by product name.',
                ].join(' ');
                const postPhaseDiscovery = await executeTool(
                    'engineering_discovery',
                    projectPath
                        ? { request: postPhaseDiscoveryRequest, path: projectPath }
                        : { request: postPhaseDiscoveryRequest },
                    { ...(context || {}), engineeringPipeline: true, language: isAr ? 'ar' : 'en' },
                );
                const evidenceRoot = String(postPhaseDiscovery?.output?.evidence?.selectedProject?.root || '').trim();
                const candidateRoots = [
                    ...(Array.isArray(postPhaseDiscovery?.output?.nodeProjects) ? postPhaseDiscovery.output.nodeProjects : []),
                    ...(Array.isArray(postPhaseDiscovery?.output?.pythonProjects) ? postPhaseDiscovery.output.pythonProjects : []),
                    ...(Array.isArray(postPhaseDiscovery?.output?.goProjects) ? postPhaseDiscovery.output.goProjects : []),
                ].map((root: unknown) => String(root || '').trim()).filter(Boolean);
                const runtimeProjectRoot = evidenceRoot || (candidateRoots.length === 1 ? candidateRoots[0] : '');
                if (runtimeProjectRoot) {
                    plannerResult.output.projectRoot = runtimeProjectRoot;
                    appendBoundedPipelineLog(logs, `[pipeline] post-phase discovery bound projectRoot=${runtimeProjectRoot}`);
                    say(pick(isAr,
                        `📍 ثبّتُ جذر artifact الذي أنشأته المراحل قبل التشغيل: ${runtimeProjectRoot}`,
                        `📍 Bound the artifact root created by the phases before live-run: ${runtimeProjectRoot}`));
                } else {
                    appendBoundedPipelineLogs(logs, postPhaseDiscovery?.logs);
                    say(pick(isAr,
                        '⚠️ اكتشاف ما بعد التنفيذ لم يثبت جذراً وحيداً قابلاً للتشغيل؛ لن أخمّن مشروعاً آخر.',
                        '⚠️ Post-phase discovery did not prove one runnable root; I will not guess another project.'));
                }
            } catch (postPhaseDiscoveryError: any) {
                appendBoundedPipelineLog(logs, `[pipeline] post-phase discovery failed: ${String(postPhaseDiscoveryError?.message || postPhaseDiscoveryError).slice(0, 420)}`);
            }
        }

        // 3 — Report with the numbers as they are. A partial delivery announced
        // as partial is engineering; announced as done, it is a lie.
        //
        // This summary IS what lands in the chat: extractAnswer picks the
        // `summary` field of the final node's output. Before this report
        // existed, a completed multi-phase build surfaced as ONE terse line
        // and the whole story (phases, files, how to run) was discarded.
        const total = Number(plannerResult.output.totalPhases || phases.length);
        const done = Number(pipeline?.completedPhases || 0);
        const requestFidelityMismatch = hasRequestFidelityMismatch(pipeline?.results);
        const requestFidelityEvidenceUnavailable = hasRequestFidelityEvidenceUnavailable(pipeline?.results);
        const requestFidelityBlocked = requestFidelityMismatch || requestFidelityEvidenceUnavailable;
        const verified = pipeline?.ok === true && !requestFidelityBlocked;
        let finalVerified = verified;
        // `ok` is retained as the compatibility success signal, but the report
        // must not force a reader to infer whether code ran, verification ran,
        // or a deliverable is usable. These are separate engineering facts.
        // A pipeline-level failure can already be a final, evidence-backed
        // verdict from phase execution. Carry the machine-readable marker out
        // to AgentOrchestrator so it cannot reopen a generative recovery loop.
        const verificationUnavailable = Array.isArray(pipeline?.results)
            && pipeline.results.some((result: any) => (
                result?.verificationUnavailable === true
                || result?.output?.verificationUnavailable === true
            ));
        const verificationFailed = requestFidelityBlocked || (Array.isArray(pipeline?.results)
            && pipeline.results.some((result: any) => result?.verificationFailed === true));
        let liveRunVerificationFailed = false;
        let browserQaFailed = false;
        let browserQa: AppAudit | null = null;
        const honestBlocker = pipeline?.honestBlocker === true || verificationFailed || verificationUnavailable;
        let finalHonestBlocker = honestBlocker;
        // Compatibility facts for phase execution; live-run may still veto delivery.
        const executionStatus = verified ? 'completed' : done > 0 ? 'partial' : 'failed';
        const verificationStatus = requestFidelityBlocked
            ? requestFidelityEvidenceUnavailable ? 'fidelity_unverifiable' : 'request_fidelity_mismatch'
            : verificationUnavailable ? 'not_verified'
                : verified ? 'passed' : String(pipeline?.verificationStatus || 'failed');
        const deliveryStatus = requestFidelityBlocked
            ? 'blocked'
            : verificationUnavailable ? 'not_verified'
                : verified ? 'delivered' : done > 0 ? 'partial' : 'blocked';
        if (requestFidelityBlocked) {
            appendBoundedPipelineLog(logs, requestFidelityEvidenceUnavailable
                ? '[pipeline] fidelity_unverifiable is final delivery evidence; partial delivery disabled'
                : '[pipeline] request_fidelity_mismatch is final delivery evidence; partial delivery disabled');
            say(pick(isAr,
                requestFidelityEvidenceUnavailable
                    ? '⛔ أوقفتُ التسليم: دليل وفاء التطبيق المطلوب غير قابل للتحقق، ولن أصفه كتسليم جزئي.'
                    : '⛔ أوقفْتُ التسليم: المصدر المولّد لا يطابق محرك التطبيق المطلوب، ولن أصفه كتسليم جزئي.',
                requestFidelityEvidenceUnavailable
                    ? '⛔ Delivery blocked: requested application fidelity could not be verified; it will not be labelled partial.'
                    : '⛔ Delivery blocked: the generated source does not match the requested application engine; it will not be labelled partial.'));
        }

        // 3 — The last mile: a VERIFIED system is RUN, not left inert on disk.
        // No button — the pipeline starts it and the live preview opens itself.
        // A runnable project that cannot be confirmed live is not delivered.
        // This is deliberately a hard acceptance gate: no guessed URL and no
        // "start it manually" success after the pipeline claimed verification.
        let liveUrl = '';
        let liveRunError = '';
        let liveRunResult: any = null;
        let liveRepairAttempted = false;
        let liveRepairStatus = 'not_attempted';
        let browserQaRepairAttempted = false;
        let browserQaRepairStatus = 'not_attempted';
        let scopeRepairAttempted = false;
        let scopeRepairStatus = 'not_attempted';
        let scopeCoverageFailed = false;
        let scopeAudit: ScopeGateOutcome['scopeAudit'] | undefined;
        if (verified) {
            try {
                say(pick(isAr, '▶️ أُشغّل النظام لتراه حيّاً…', '▶️ Starting the system so you can see it live…'));
                // …and it speaks the run's language, not the interface default.
                // The phase executor's scaffold evidence names the artifact through the planner's
                // projectName. Carry that identity into project_run; an empty request fallback
                // would be unsafe because a workspace may contain an older folder with the same
                // business noun (for example, a stale "NEXUS" directory). ProjectRunTool then
                // resolves the named artifact by evidence and still refuses to guess if it cannot
                // find a unique match.
                const plannedProjectName = String(plannerResult?.output?.projectName || '').trim();
                const plannedProjectRoot = String(plannerResult?.output?.projectRoot || discoveredProjectRoot || '').trim();
                const runInput: Record<string, string> = {};
                if (plannedProjectRoot) runInput.cwd = plannedProjectRoot;
                // The pair's door is the API (it serves the built interface
                // AND answers /api/* on one origin) — running the interface's
                // dev server measured its own health calls as 404s (round 6).
                const pairDoor = apiSiblingOf(runInput.cwd || discoveredProjectRoot || '');
                if (pairDoor) runInput.cwd = pairDoor;
                if (!runInput.cwd && plannedProjectName) {
                    // ProjectRunTool deliberately extracts names from an explicit
                    // quoted selector. Quote the planner identity at this boundary;
                    // do not pass the full request, which could select an unrelated
                    // stale directory by a shared business noun.
                    runInput.projectQuery = `"${plannedProjectName.replace(/"/gu, '\\"')}"`;
                }
                const runRes = await executeTool('project_run', runInput, { ...context, language: isAr ? 'ar' : 'en' });
                liveRunResult = runRes;
                const liveOutcome = applyLiveRunOutcome(finalVerified, runRes);
                const liveRuntimeRoot = String(
                    runRes?.output?.cwd || runInput.cwd || plannedProjectRoot || discoveredProjectRoot || ''
                ).trim();
                const liveSourceRoot = String(
                    plannedProjectRoot || discoveredProjectRoot || liveRuntimeRoot || ''
                ).trim();
                const liveAuditRoots = projectAuditRoots(liveSourceRoot, liveRuntimeRoot);
                const qualityCheckedLiveOutcome = applyProjectQualityContractOutcome(liveSourceRoot || liveRuntimeRoot, productRequest, liveOutcome);
                const scopedLiveOutcome = applyScopeAuditOutcome(productRequest, liveAuditRoots, qualityCheckedLiveOutcome);
                scopeAudit = scopedLiveOutcome.scopeAudit;
                scopeCoverageFailed = scopedLiveOutcome.scopeCoverageFailed === true;
                finalVerified = scopedLiveOutcome.verified;
                liveUrl = scopedLiveOutcome.liveUrl;
                if (scopedLiveOutcome.verificationFailed) {
                    liveRunError = scopedLiveOutcome.error || 'project_run did not pass live acceptance';
                    liveRunVerificationFailed = true;
                    say(pick(isAr,
                        `⛔ لم أعتبر النظام مسلّماً: فشل قبول التشغيل الحي أو مطابقة نطاق الطلب. ${liveRunError}`,
                        `⛔ I did not mark the system delivered: live acceptance or requested-scope verification failed. ${liveRunError}`));
                }
            } catch (e: any) {
                liveRunError = String(e?.message || e);
                finalVerified = false;
                liveRunVerificationFailed = true;
                say(pick(isAr,
                    `⛔ لم أعتبر النظام مسلّماً: تعذّر تأكيد التشغيل الحي. ${liveRunError}`,
                    `⛔ I did not mark the system delivered: live execution could not be confirmed. ${liveRunError}`));
            }
        }

        // A scope failure is different from a launchability failure: the app is
        // reachable, but the source does not yet prove every requested capability.
        // Give the existing artifact one bounded, evidence-led implementation pass
        // before declaring the delivery blocked. This is deliberately separate from
        // runnable repair, and it never weakens applyScopeAuditOutcome.
        const attemptScopeRepair = async (): Promise<void> => {
            if (!scopeCoverageFailed || scopeRepairAttempted || !scopeAudit?.missing?.length) return;
            scopeRepairAttempted = true;
            const missingCapabilities = scopeAudit.missing.slice(0, 12);
            const artifactRoot = String(
                plannerResult?.output?.projectRoot ||
                discoveredProjectRoot ||
                liveRunResult?.output?.cwd ||
                ''
            ).trim();
            const runtimeRoot = String(liveRunResult?.output?.cwd || '').trim();
            if (!artifactRoot) {
                scopeRepairStatus = 'scope_repair_no_trusted_root';
                appendBoundedPipelineLog(logs, '[pipeline] scope repair skipped: no trusted artifact root');
                return;
            }
            try {
                const missingText = missingCapabilities.join(', ').slice(0, 1200);
                say(pick(isAr,
                    `🔬 التشغيل حيّ لكن دليل النطاق ناقص (${missingText}). سأصلح القدرات المفقودة داخل نفس artifact مرة واحدة فقط.`,
                    `🔬 Runtime is live but scope evidence is missing (${missingText}). I will repair the missing capabilities in the same artifact once.`));
                const scopeDiscoveryRequest = [
                    'Inspect the existing project in place for a bounded scope-repair pass after a successful live run.',
                    `Trusted artifact root: ${artifactRoot}`,
                    `Missing capabilities reported by the deterministic scope audit: ${missingText}`,
                    'Do not create a second project and do not redesign working features.',
                ].join('\\n');
                const scopeDiscovery = await executeTool(
                    'engineering_discovery',
                    { request: scopeDiscoveryRequest, path: artifactRoot },
                    { ...(context || {}), scopeRepairAttempted: true, language: isAr ? 'ar' : 'en' },
                );
                const scopeEvidence = scopeDiscovery?.output?.evidence || plannerEvidence;
                const scopeRepairRequest = [
                    scopeDiscoveryRequest,
                    'The deterministic scope audit is the acceptance evidence; implement every listed missing capability, not a generic explanation.',
                    'Inspect the current source and tests first. Modify only the existing project in place with concrete file-level tasks.',
                    'Preserve the current start contract. Run existing local build/tests and then perform one real restart/readiness check.',
                    `Missing capability ledger: ${missingCapabilities.map((item, index) => `R${index + 1}: ${item}`).join(' | ')}`,
                ].join('\\n');
                const scopePlanner = await executeTool(
                    'project_planner',
                    { projectDescription: scopeRepairRequest, evidence: scopeEvidence },
                    {
                        ...(context || {}),
                        repairMode: false,
                        scopeRepairMode: true,
                        scopeRepairTargets: missingCapabilities,
                        scopeRepairAttempted: true,
                        engineeringPipeline: true,
                        requireRunnableContract: false,
                        plannerTimeoutMs,
                        language: isAr ? 'ar' : 'en',
                    },
                );
                const scopePhases = scopePlanner?.output?.phases;
                if (!(scopePlanner?.ok === true && Array.isArray(scopePhases) && scopePhases.length > 0)) {
                    scopeRepairStatus = 'scope_repair_plan_unavailable';
                    appendBoundedPipelineLog(logs, `[pipeline] scope repair planner unavailable: ${String(scopePlanner?.error || '').slice(0, 360)}`);
                    return;
                }
                scopePlanner.output.projectName = plannerResult?.output?.projectName || scopePlanner.output.projectName;
                scopePlanner.output.projectRoot = artifactRoot;
                scopePlanner.output.requirementsContext = requirementsContext;
                const scopePipeline = await AgentLoopService.runPlannedPhasesIfPresent({
                    sessionId: context?.sessionId || `pipeline-${Date.now()}`,
                    runId: context?.runId || `run-${Date.now()}`,
                    userId: context?.userId || 'anonymous',
                    workspaceId: context?.workspaceId || context?.sessionId || 'default',
                    browserSessionId: context?.browserSessionId,
                    plannerResult: scopePlanner,
                    modelConfig: context?.modelConfig,
                    providerTimeoutMs: context?.providerTimeoutMs ?? plannerTimeoutMs,
                    plannerTimeoutMs,
                    plannerMaxCompletionTokens: context?.plannerMaxCompletionTokens,
                    plannerReasoningEffort: context?.plannerReasoningEffort,
                    language: isAr ? 'ar' : 'en',
                    onProgress: (m: string) => say(m),
                });
                appendBoundedPipelineLogs(logs, scopePipeline?.logs);
                if (scopePipeline?.ok !== true) {
                    scopeRepairStatus = 'scope_repair_pipeline_failed';
                    appendBoundedPipelineLog(logs, '[pipeline] scope repair phases did not verify successfully');
                    appendBoundedPipelineLog(logs, `[pipeline] scope repair evidence: ${summarizeScopeRepairPipeline(scopePipeline)}`);
                    return;
                }
                const scopeRetryResult = await executeTool(
                    'project_run',
                    { cwd: apiSiblingOf(artifactRoot) || artifactRoot },
                    { ...(context || {}), scopeRepairAttempted: true, language: isAr ? 'ar' : 'en' },
                );
                liveRunResult = scopeRetryResult;
                const scopeRetryLive = applyLiveRunOutcome(true, scopeRetryResult);
                const scopeRetryRuntimeRoot = String(scopeRetryResult?.output?.cwd || apiSiblingOf(artifactRoot) || artifactRoot || runtimeRoot).trim();
                const scopeRetryAuditRoots = projectAuditRoots(artifactRoot, scopeRetryRuntimeRoot);
                const qualityCheckedScopeRetry = applyProjectQualityContractOutcome(artifactRoot || scopeRetryRuntimeRoot, productRequest, scopeRetryLive);
                const scopeRetryOutcome = applyScopeAuditOutcome(productRequest, scopeRetryAuditRoots, qualityCheckedScopeRetry);
                scopeAudit = scopeRetryOutcome.scopeAudit;
                scopeCoverageFailed = scopeRetryOutcome.scopeCoverageFailed === true;
                finalVerified = scopeRetryOutcome.verified;
                liveUrl = scopeRetryOutcome.liveUrl;
                liveRunVerificationFailed = scopeRetryOutcome.verificationFailed;
                liveRunError = scopeRetryOutcome.error || '';
                scopeRepairStatus = finalVerified ? 'repaired_and_running' : 'repair_completed_scope_still_missing';
                say(pick(isAr,
                    finalVerified ? '✅ أصلحتُ القدرات المفقودة وأعدت تشغيل artifact؛ اجتاز scope audit.' : `⛔ اكتملت محاولة scope-repair لكن الدليل ما زال ناقصاً: ${liveRunError}`,
                    finalVerified ? '✅ Missing capabilities were repaired and the artifact passed scope audit after restart.' : `⛔ Scope repair completed but the evidence is still incomplete: ${liveRunError}`));
            } catch (scopeRepairError: any) {
                scopeRepairStatus = 'scope_repair_error';
                const message = String(scopeRepairError?.message || scopeRepairError).slice(0, 420);
                liveRunError = `${liveRunError}; scope repair: ${message}`.slice(0, 900);
                appendBoundedPipelineLog(logs, `[pipeline] scope repair error: ${message}`);
            }
        };

        if (scopeCoverageFailed && !finalVerified && context?.scopeRepairAttempted !== true) {
            await attemptScopeRepair();
        }

        // A live-run failure is evidence about the current artifact, not a reason
        // to stop before Joe has had one bounded chance to repair it. Re-discover
        // the workspace so the repair planner sees files created by the phases,
        // then plan only the missing runnable contract. This is intentionally
        // inside project_pipeline (not a generic recovery loop): one attempt,
        // same project identity, same workspace, and no product-specific template.
        if (!finalVerified && liveRunVerificationFailed && !scopeCoverageFailed && context?.liveRepairAttempted !== true) {
            liveRepairAttempted = true;
            try {
                const failureText = String(
                    liveRunError || liveRunResult?.error || liveRunResult?.output?.message || 'project_run did not confirm a live URL'
                ).slice(0, 1400);
                const missingRuntimeImportLedger = extractMissingLocalRuntimeImportLedger(failureText);
                const runtimeImportRepairInstruction = missingRuntimeImportLedger.length
                    ? [
                        'MISSING LOCAL RUNTIME IMPORT LEDGER — every item below is a mandatory evidence-backed repair obligation; inspect the importer and filesystem before editing:',
                        missingRuntimeImportLedger.map((item, index) => `R${index + 1}: ${item}`).join(' | '),
                        'For every ledger item, include a concrete file-level task that either repairs the exact existing import edge or creates the smallest real module required by that exact proven contract. Do not create placeholders, unrelated files, guessed dependencies, or a second project. Verify syntax, build/tests, and one real readiness check after all ledger items are addressed.',
                    ].join('\\n')
                    : '';
                const qualityContractRepair = /(?:project\s+quality\s+contract|truthful\s+test\s+script|missing\s+test\s+script|real\s+(?:local\s+)?tests?)/iu.test(failureText);
                const qualityRepairInstruction = qualityContractRepair
                    ? 'QUALITY-CONTRACT REPAIR IS REQUIRED: the current implementation is reachable, but the declared quality contract is not truthful. Preserve working features, add a real local test script to the existing package manifest when absent, add at least one deterministic test file that exercises existing behavior, run that test command and the existing build, then make one real start/readiness check. Never use echo, true, :, exit 0, a placeholder, or documentation as test evidence.'
                    : '';
                say(pick(isAr,
                    `🔧 أُعيد اكتشاف المشروع لإصلاح دليل التشغيل الحي فقط: ${failureText}`,
                    `🔧 Re-discovering the current project to repair only the live-run evidence: ${failureText}`));
                // Rediscovery must carry the CURRENT repair intent, not the original
                // greenfield brief. The original request may say "build NEXUS", which
                // correctly selects no existing project during the first pass; using it
                // again here makes EngineeringDiscovery classify the partially-written
                // workspace as a read-only reference and drops selectedProject.root.
                // A repair request is an existing-project mutation by contract, so the
                // incomplete root (src/tests without a manifest) becomes repair evidence.
                const repairDiscoveryRequest = [
                    'Repair the current project in place after a failed live-run acceptance check.',
                    'Treat the existing workspace root as the write target for this bounded repair.',
                    `Original build request: ${productRequest.slice(0, 1200)}`,
                    `Observed live-run failure: ${failureText}`,
                    runtimeImportRepairInstruction,
                ].filter(Boolean).join('\\n');
                const trustedRepairRoot = String(
                    plannerResult?.output?.projectRoot ||
                    discoveredProjectRoot ||
                    liveRunResult?.output?.cwd ||
                    projectPath ||
                    ''
                ).trim();
                const repairDiscoveryInput = trustedRepairRoot
                    ? { request: repairDiscoveryRequest, path: trustedRepairRoot }
                    : { request: repairDiscoveryRequest };
                const repairDiscovery = await executeTool(
                    'engineering_discovery',
                    repairDiscoveryInput,
                    { ...(context || {}), liveRepairAttempted: true, language: isAr ? 'ar' : 'en' },
                );
                const repairEvidence = repairDiscovery?.output?.evidence || plannerEvidence;
                const repairRequest = [
                    repairDiscoveryRequest,
                    'Do not redesign, regenerate, or replace working features. Do not create a template or a second project.',
                    'Inspect the current workspace and fix only the evidence-backed runnable contract: entrypoint, package manifest, start/build command, or the smallest dependency/configuration issue required for the existing implementation to build and start.',
                    qualityRepairInstruction,
                    runtimeImportRepairInstruction,
                    'If the observed failure names a missing runtime import, trace that exact import from the selected entrypoint to the filesystem before editing. For a local specifier such as ./routes/auth, inspect whether the real evidence is routes/auth.js, src/routes/auth.js, or another existing file. If no matching file exists, create the smallest concrete module required by the importer and the original requirements, implementing its actual exported contract; this is allowed only for the exact proven specifier and must be followed by syntax, build/test, and readiness checks. Never create a no-op placeholder, copy an unrelated template, change an import merely to hide the failure, or guess a package dependency.',
                    'Run the existing build/tests, run node --check for JavaScript entrypoints when applicable, and then make one real start/readiness check. Return executable phases only.',
                    `Original project identity: ${String(plannerResult?.output?.projectName || 'project').slice(0, 160)}.`,
                ].join('\\n');
                const repairPlanner = await executeTool(
                    'project_planner',
                    { projectDescription: repairRequest, evidence: repairEvidence },
                                        { ...(context || {}),
                        ...(missingRuntimeImportLedger.length ? { runtimeImportLedger: missingRuntimeImportLedger } : {}),
                        repairMode: true,
                        scopeRepairMode: qualityContractRepair,
                        ...(qualityContractRepair ? {
                            scopeRepairTargets: [
                                'a truthful local test script in the existing package manifest',
                                'at least one deterministic test file exercising existing implementation behavior',
                            ],
                        } : {}),
                        engineeringPipeline: true,
                        requireRunnableContract: !qualityContractRepair,
                        liveRepairAttempted: true,
                        plannerTimeoutMs,
                        language: isAr ? 'ar' : 'en',
                    },
                );
                const repairRootForEvidence = String(
                    repairEvidence?.selectedProject?.root || plannerResult?.output?.projectRoot || discoveredProjectRoot || ''
                ).trim();
                const manifestReconciliation = repairRootForEvidence
                    ? reconcileMissingRuntimeTarget(repairRootForEvidence, failureText)
                    : { repaired: false, message: 'no trusted repair root available' };
                if (manifestReconciliation.repaired) {
                    appendBoundedPipelineLog(logs, `[pipeline] ${manifestReconciliation.message}`);
                    say(pick(isAr,
                        `🧭 أصلحتُ عقد التشغيل من دليل موجود على القرص: ${manifestReconciliation.message}`,
                        `🧭 Reconciled the runnable contract from on-disk evidence: ${manifestReconciliation.message}`));
                } else if (/runtime target is missing/iu.test(failureText)) {
                    appendBoundedPipelineLog(logs, `[pipeline] manifest reconciliation not applied: ${manifestReconciliation.message}`);
                }
                const repairPhases = repairPlanner?.output?.phases;
                if ((repairPlanner?.ok === true && Array.isArray(repairPhases) && repairPhases.length > 0) || manifestReconciliation.repaired) {
                    const repairProjectRoot = String(repairEvidence?.selectedProject?.root || plannerResult?.output?.projectRoot || discoveredProjectRoot || '').trim();
                    let repairPipeline: any = { ok: false };
                    if (!manifestReconciliation.repaired) {
                        repairPlanner.output = repairPlanner.output || {};
                        repairPlanner.output.projectName = plannerResult?.output?.projectName || repairPlanner.output.projectName;
                        repairPlanner.output.requirementsContext = requirementsContext;
                        if (repairProjectRoot) repairPlanner.output.projectRoot = repairProjectRoot;
                        repairPipeline = await AgentLoopService.runPlannedPhasesIfPresent({
                            sessionId: context?.sessionId || `pipeline-${Date.now()}`,
                            runId: context?.runId || `run-${Date.now()}`,
                            userId: context?.userId || 'anonymous',
                            workspaceId: context?.workspaceId || context?.sessionId || 'default',
                            browserSessionId: context?.browserSessionId,
                            plannerResult: repairPlanner,
                            modelConfig: context?.modelConfig,
                            providerTimeoutMs: context?.providerTimeoutMs ?? plannerTimeoutMs,
                            plannerTimeoutMs,
                            plannerMaxCompletionTokens: context?.plannerMaxCompletionTokens,
                            plannerReasoningEffort: context?.plannerReasoningEffort,
                            language: isAr ? 'ar' : 'en',
                            onProgress: (m: string) => say(m),
                        });
                    }
                    let boundedRepairReady = manifestReconciliation.repaired || repairPipeline?.ok === true;
                    // A repair phase can write the missing entrypoint successfully but
                    // still fail its immediate project_run because the selected project
                    // has declared dependencies and no node_modules yet. It can also
                    // reveal an import that the generated manifest forgot entirely.
                    // Both are bounded, evidence-backed runtime prerequisites: install
                    // only declared packages or exact packages reached from the runtime
                    // entrypoint, never an arbitrary guessed bundle.
                    if (/launchability|runtime target is missing|cannot start the project safely|runtime dependencies missing or undeclared/i.test(failureText)) {
                        const bootstrapRoot = String(
                            repairPlanner?.output?.projectRoot || repairProjectRoot || plannerResult?.output?.projectRoot || discoveredProjectRoot || ''
                        ).trim();
                        const manifestPath = bootstrapRoot ? path.join(bootstrapRoot, 'package.json') : '';
                        const dependencyRoot = bootstrapRoot ? path.join(bootstrapRoot, 'node_modules') : '';
                        let declaredDependencyCount = 0;
                        if (manifestPath && fs.existsSync(manifestPath) && !fs.existsSync(dependencyRoot)) {
                            try {
                                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                                declaredDependencyCount = ['dependencies', 'devDependencies', 'optionalDependencies']
                                    .reduce((count, bucket) => count + (
                                        manifest && manifest[bucket] && typeof manifest[bucket] === 'object'
                                            ? Object.keys(manifest[bucket]).length
                                            : 0
                                    ), 0);
                            } catch (manifestError: any) {
                                appendBoundedPipelineLog(logs, `[pipeline] bounded dependency evidence unreadable: ${String(manifestError?.message || manifestError).slice(0, 240)}`);
                            }
                        }
                        let missingRuntime = [] as string[];
                        if (bootstrapRoot && fs.existsSync(manifestPath)) {
                            try {
                                missingRuntime = missingRuntimeDependencies(bootstrapRoot, detectStart(bootstrapRoot, 4300));
                            } catch (dependencyError: any) {
                                appendBoundedPipelineLog(logs, `[pipeline] runtime dependency evidence unreadable: ${String(dependencyError?.message || dependencyError).slice(0, 240)}`);
                            }
                        }
                        if (bootstrapRoot && (declaredDependencyCount > 0 || missingRuntime.length > 0)) {
                            const installCommand = missingRuntime.length
                                ? `install ${missingRuntime.join(' ')} --no-audit --no-fund`
                                : 'install --ignore-scripts --no-audit --no-fund';
                            say(pick(isAr,
                                missingRuntime.length
                                    ? `📦 وجدت imports تشغيل مفقودة من manifest (${missingRuntime.join('، ')}); سأثبت الحزم المطابقة مرة واحدة داخل المشروع قبل إعادة التحقق.`
                                    : `📦 دليل التشغيل يثبت اعتماديات معلنة بلا node_modules؛ أثبّتها مرة واحدة داخل ${bootstrapRoot} قبل إعادة التحقق.`,
                                missingRuntime.length
                                    ? `📦 Runtime imports are missing from the manifest (${missingRuntime.join(', ')}); installing only those exact packages once before re-verification.`
                                    : `📦 Runtime evidence proves declared dependencies without node_modules; installing them once in ${bootstrapRoot} before re-verification.`));
                            const bootstrapResult = await executeTool(
                                'npm_manager',
                                { command: installCommand, cwd: bootstrapRoot },
                                { ...(context || {}), language: isAr ? 'ar' : 'en', liveRepairAttempted: true },
                            );
                            appendBoundedPipelineLogs(logs, bootstrapResult?.logs);
                            boundedRepairReady = bootstrapResult?.ok === true;
                            if (!boundedRepairReady) {
                                const bootstrapError = String(bootstrapResult?.error || bootstrapResult?.output?.message || 'npm install failed').slice(0, 420);
                                liveRunError = `${liveRunError}; bounded dependency bootstrap: ${bootstrapError}`.slice(0, 900);
                                appendBoundedPipelineLog(logs, `[pipeline] bounded dependency bootstrap failed: ${bootstrapError}`);
                            }
                        }
                    }
                    if (boundedRepairReady) {
                        const repairProjectName = String(repairPlanner?.output?.projectName || plannerResult?.output?.projectName || '').trim();
                        const repairProjectRoot = String(repairPlanner?.output?.projectRoot || plannerResult?.output?.projectRoot || discoveredProjectRoot || '').trim();
                        const retryInput: Record<string, string> = {};
                        if (repairProjectRoot) retryInput.cwd = apiSiblingOf(repairProjectRoot) || repairProjectRoot;
                        else if (repairProjectName) retryInput.projectQuery = `"${repairProjectName.replace(/"/gu, '\\\"')}"`;
                        const retryRunResult = await executeTool(
                            'project_run',
                            retryInput,
                            { ...(context || {}), language: isAr ? 'ar' : 'en', liveRepairAttempted: true },
                        );
                        liveRunResult = retryRunResult;
                        const retryOutcome = applyLiveRunOutcome(true, retryRunResult);
                        const retryRuntimeRoot = String(
                            retryRunResult?.output?.cwd || retryInput.cwd || repairProjectRoot || discoveredProjectRoot || ''
                        ).trim();
                        const retrySourceRoot = repairProjectRoot || discoveredProjectRoot || retryRuntimeRoot;
                        const retryAuditRoots = projectAuditRoots(retrySourceRoot, retryRuntimeRoot);
                        const qualityCheckedRetryOutcome = applyProjectQualityContractOutcome(retrySourceRoot || retryRuntimeRoot, productRequest, retryOutcome);
                        const scopedRetryOutcome = applyScopeAuditOutcome(productRequest, retryAuditRoots, qualityCheckedRetryOutcome);
                        scopeAudit = scopedRetryOutcome.scopeAudit;
                        scopeCoverageFailed = scopedRetryOutcome.scopeCoverageFailed === true;
                        finalVerified = scopedRetryOutcome.verified;
                        liveUrl = scopedRetryOutcome.liveUrl;
                        liveRunVerificationFailed = scopedRetryOutcome.verificationFailed;
                        liveRunError = scopedRetryOutcome.error || '';
                        liveRepairStatus = finalVerified ? 'repaired_and_running' : 'repair_completed_but_live_run_failed';
                        say(pick(isAr,
                            finalVerified ? '✅ نجحت محاولة الإصلاح المحدودة وأصبح التشغيل الحي مؤكداً.' : `⛔ اكتملت محاولة الإصلاح لكن التشغيل الحي ما زال غير مؤكّد: ${liveRunError}`,
                            finalVerified ? '✅ The bounded repair succeeded and live execution is confirmed.' : `⛔ The repair completed but live execution is still unconfirmed: ${liveRunError}`));
                    } else {
                        liveRepairStatus = 'repair_pipeline_failed';
                        say(pick(isAr, '⛔ فشلت خطة إصلاح دليل التشغيل؛ أحتفظ بالتوقف الصادق.', '⛔ The runnable-artifact repair plan failed; keeping the honest stop.'));
                    }
                } else {
                    liveRepairStatus = 'repair_plan_unavailable';
                    say(pick(isAr, '⛔ لم تُنتج الأدلة خطة إصلاح قابلة للتنفيذ؛ أحتفظ بالتوقف الصادق.', '⛔ Evidence did not produce an executable repair plan; keeping the honest stop.'));
                }
            } catch (repairError: any) {
                liveRepairStatus = 'repair_error';
                const repairMessage = String(repairError?.message || repairError).slice(0, 420);
                liveRunError = `${liveRunError}; repair: ${repairMessage}`.slice(0, 900);
                say(pick(isAr, `⛔ تعذرت محاولة إصلاح التشغيل المحدودة: ${repairMessage}`, `⛔ Bounded live-run repair failed: ${repairMessage}`));
            }
        }

        if (scopeCoverageFailed && !finalVerified && !scopeRepairAttempted && context?.scopeRepairAttempted !== true) {
            await attemptScopeRepair();
        }

        /**
         * FINAL ACCEPTANCE: a live URL proves reachability, not usability.
         *
         * project_run can finish green while the Browser panel is still blank,
         * because reachability and visible quality are separate facts. Run the
         * same real app audit after every bounded repair/restart, against the
         * final live URL and the exact artifact root selected by project_run.
         * A skipped audit is an honest verification failure: Joe must not call
         * an unmeasured application delivered.
         */
        if (liveUrl) {
            try {
                const runtimeRoot = String(liveRunResult?.output?.cwd || '').trim();
                const artifactRoot = String(
                    plannerResult?.output?.projectRoot ||
                    discoveredProjectRoot ||
                    runtimeRoot ||
                    ''
                ).trim();
                const auditRoots = projectAuditRoots(artifactRoot, runtimeRoot);
                const auditDir = projectAuditDirectory(auditRoots);
                const { PANEL_BROWSER_SID } = require('./BrowserSmartTools');
                const panelSid = String(context?.browserSessionId || PANEL_BROWSER_SID || process.env.PANEL_BROWSER_SID || '').trim();
                const { broadcast } = require('../../../api/ws');
                try {
                    broadcast({ type: 'panel_focus', sessionId: context?.sessionId, data: { panel: 'browser', reason: 'pipeline_qa' } } as any);
                } catch { /* visible panel is best effort; audit remains mandatory */ }
                try { require('../../browser/manager').warmBrowserSession(panelSid); } catch { /* audit reports private fallback */ }
                try {
                    const { waitForPanelWatcher } = require('../../browser/wsHub');
                    const watching = await waitForPanelWatcher(panelSid, 4000);
                    say(pick(isAr,
                        watching ? '👁️ أبدأ فحص الجودة المرئي الآن داخل لوحة المتصفح…' : '🔒 لا توجد مشاهدة للوحة؛ سأجري الفحص الخاص وأذكر ذلك صراحةً…',
                        watching ? '👁️ Starting visible Browser QA in the Browser panel…' : '🔒 No Browser watcher is attached; I will run private QA and say so explicitly…'));
                    appendBoundedPipelineLog(logs, `[pipeline] browser QA watcher=${watching ? 'attached' : 'not_attached'}`);
                } catch {
                    appendBoundedPipelineLog(logs, '[pipeline] browser QA watcher status unavailable');
                }
                const progress = (phase: string) => {
                    if (phase.startsWith('private')) {
                        const why = phase.slice('private'.length).replace(/^:/, '').trim();
                        say(pick(isAr,
                            `🔒 تعذّر استعارة لوحة المتصفح؛ يعمل QA في متصفح خاص${why ? `: ${why}` : ''}.`,
                            `🔒 The Browser panel could not be borrowed; QA is running privately${why ? `: ${why}` : ''}.`));
                    } else if (phase === 'watching') {
                        say(pick(isAr, '👁️ المتصفح المرئي ينفذ الفحص الآن…', '👁️ The visible Browser panel is executing QA now…'));
                    } else if (phase.startsWith('inspecting:') || phase === 'pressing' || phase === 'inspected') {
                        appendBoundedPipelineLog(logs, `[pipeline] browser QA ${phase}`);
                    }
                };
                browserQa = await auditBuiltApp(auditDir, {
                    watchSessionId: panelSid || undefined,
                    serveUrl: liveUrl,
                    artifactRootDir: artifactRoot || auditDir || runtimeRoot,
                    timeoutMs: 45_000,
                    onProgress: progress,
                });
                if (browserQa.skipped) {
                    browserQaFailed = true;
                    finalVerified = false;
                    finalHonestBlocker = true;
                    liveRunVerificationFailed = true;
                    liveRunError = `browser QA skipped: ${browserQa.skipped}`;
                    say(pick(isAr,
                        `⛔ لم أسلّم النظام: فحص Browser QA لم يُجرَ (${browserQa.skipped}).`,
                        `⛔ I did not deliver the system: Browser QA did not run (${browserQa.skipped}).`));
                } else {
                    let blocking = browserQa.findings.filter((finding) => finding.severity === 'high');
                    appendBoundedPipelineLog(logs, `[pipeline] browser QA score=${browserQa.score} findings=${browserQa.findings.length} blocking=${blocking.length}`);
                    if (blocking.length > 0 && !browserQaRepairAttempted) {
                        browserQaRepairAttempted = true;
                        const repairProjectRoot = artifactRoot || runtimeRoot;
                        browserQaRepairStatus = repairProjectRoot && auditDir
                            ? 'attempted'
                            : 'no_trusted_artifact_or_audit_root';
                        if (repairProjectRoot && auditDir) {
                            say(pick(isAr,
                                `🔧 كشف Browser QA ${blocking.length} مشكلة حرجة؛ سأصلح الأدلة القابلة للإصلاح داخل المشروع نفسه مرة واحدة ثم أعيد الفحص المرئي.`,
                                `🔧 Browser QA found ${blocking.length} blocking issue(s); I will repair the evidence-backed issues in the same project once, then re-run visible QA.`));
                            appendBoundedPipelineLog(logs, `[pipeline] browser QA bounded repair start root=${repairProjectRoot}`);
                            try {
                                const repairResult = await executeTool(
                                    'project_repair',
                                    {
                                        projectDir: repairProjectRoot,
                                        auditDir,
                                        serveUrl: liveUrl,
                                        artifactRootDir: repairProjectRoot,
                                        watchSessionId: panelSid || undefined,
                                    },
                                    { ...(context || {}), browserQaRepairAttempted: true, language: isAr ? 'ar' : 'en' },
                                );
                                appendBoundedPipelineLogs(logs, repairResult?.logs);
                                browserQaRepairStatus = repairResult?.ok === true ? 'repair_tool_completed' : 'repair_tool_failed';
                                appendBoundedPipelineLog(logs, `[pipeline] browser QA bounded repair result=${browserQaRepairStatus}`);
                                if (repairResult?.ok === true) {
                                    const recheck = await auditBuiltApp(auditDir, {
                                        watchSessionId: panelSid || undefined,
                                        serveUrl: liveUrl,
                                        artifactRootDir: repairProjectRoot,
                                        timeoutMs: 45_000,
                                        onProgress: progress,
                                    });
                                    if (!recheck?.skipped) {
                                        browserQa = recheck;
                                        blocking = browserQa.findings.filter((finding) => finding.severity === 'high');
                                        appendBoundedPipelineLog(logs, `[pipeline] browser QA recheck score=${browserQa.score} findings=${browserQa.findings.length} blocking=${blocking.length}`);
                                        browserQaRepairStatus = blocking.length === 0 ? 'repaired_and_verified' : 'repaired_blockers_remain';
                                    } else {
                                        browserQaRepairStatus = `recheck_skipped:${String(recheck?.skipped || 'unknown')}`;
                                    }
                                }
                            } catch (repairError: any) {
                                browserQaRepairStatus = 'repair_tool_error';
                                appendBoundedPipelineLog(logs, `[pipeline] browser QA bounded repair error: ${String(repairError?.message || repairError).slice(0, 420)}`);
                            }
                        }
                    }
                    blocking = browserQa.findings.filter((finding) => finding.severity === 'high');
                    if (blocking.length > 0) {
                        browserQaFailed = true;
                        finalVerified = false;
                        finalHonestBlocker = true;
                        liveRunVerificationFailed = true;
                        liveRunError = `browser QA found ${blocking.length} blocking finding(s)`;
                        say(pick(isAr,
                            `⛔ كشف Browser QA المرئي ${blocking.length} مشكلة حرجة بعد محاولة إصلاح bounded؛ لم أعتبر التطبيق مسلّماً.`,
                            `⛔ Visible Browser QA still found ${blocking.length} blocking issue(s) after the bounded repair attempt; the application is not delivered.`));
                    } else {
                        browserQaFailed = false;
                        // Browser QA proves usability, but it must not erase a
                        // deterministic scope failure measured earlier.
                        finalVerified = !scopeCoverageFailed;
                        finalHonestBlocker = false;
                        liveRunVerificationFailed = false;
                        liveRunError = '';
                        say(pick(isAr,
                            `✅ اجتاز التطبيق Browser QA بعد الإصلاح (score: ${browserQa.score}).`,
                            `✅ The application passed Browser QA after repair (score: ${browserQa.score}).`));
                    }
                }
            } catch (qaError: any) {
                browserQaFailed = true;
                finalVerified = false;
                finalHonestBlocker = true;
                liveRunVerificationFailed = true;
                const message = String(qaError?.message || qaError).slice(0, 420);
                liveRunError = `browser QA error: ${message}`;
                appendBoundedPipelineLog(logs, `[pipeline] browser QA error: ${message}`);
                say(pick(isAr, `⛔ تعذّر إكمال Browser QA: ${message}`, `⛔ Browser QA could not complete: ${message}`));
            }
        }

        /**
         * A LIVE, QUALITY-TRUE, QA-PASSED SYSTEM MISSING SOME OF WHAT WAS
         * ASKED IS A PARTIAL DELIVERY — NOT A BLOCKED ONE.
         *
         * TaskFlow round 5, measured: the engine built the full-stack system
         * fresh, the visible audit pressed its buttons, filled its forms and
         * REPAIRED it 83→94, the server answered live — and the scope audit
         * (rightly) counted kanban, the AI assistant and the notifications
         * centre as missing. The old policy turned that into ok:false, and
         * the user was handed NOTHING while a working system sat on disk.
         *
         * Partial rides ONLY on this exact shape: the live URL is confirmed,
         * the quality contract passed (a failed contract zeroes `verified`
         * BEFORE the scope gate, so scopeCoverageFailed stays false and a
         * stub can never ride this), visible Browser QA raised no blocking
         * finding, and the ONLY failure is named scope coverage. `verified`
         * stays false — the missing list is the headline, never a footnote.
         */
        const partialDelivery = !requestFidelityBlocked && !finalVerified && scopeCoverageFailed && !browserQaFailed && !!liveUrl;
        if (partialDelivery) {
            const missingText = (scopeAudit?.missing || []).slice(0, 8).join(', ');
            say(pick(isAr,
                `📦 تسليم جزئي: النظام يعمل حيّاً واجتاز فحص الجودة، ولم أبنِ بعد: ${missingText}`,
                `📦 Partial delivery: the system runs live and passed QA; not yet built: ${missingText}`));
        }
        const finalExecutionStatus = finalVerified ? 'completed' : done > 0 ? 'partial' : 'failed';
        const finalVerificationStatus = requestFidelityBlocked
            ? requestFidelityEvidenceUnavailable ? 'fidelity_unverifiable' : 'request_fidelity_mismatch'
            : verificationUnavailable ? 'not_verified'
                : finalVerified ? 'passed' : browserQaFailed ? 'browser_qa_failed' : String(pipeline?.verificationStatus || 'failed');
        const finalDeliveryStatus = requestFidelityBlocked
            ? 'blocked'
            : verificationUnavailable ? 'not_verified'
                : finalVerified ? 'delivered' : (partialDelivery || done > 0) ? 'partial' : 'blocked';
        const decisionEvidence = buildPipelineDecisionEvidence({
            finalVerified,
            browserQaFailed,
            scopeCoverageFailed,
            liveUrl,
            done,
            total,
            finalHonestBlocker,
            verificationFailed,
            verificationUnavailable,
            liveRunVerificationFailed,
            liveRunError,
            scopeAudit,
            phaseResults: pipeline?.results,
        });

        const summary = this.buildDeliveryReport({
            language: isAr ? 'ar' : 'en',
            projectName: String(plannerResult.output.projectName || 'project'),
            phases, pipeline, done, total, verified: finalVerified, liveUrl, liveRunError, liveRepairStatus, scopeAudit, scopeRepairStatus, browserQa, decisionEvidence, verificationUnavailable,
        });
        say(`[pipeline] ${finalVerified ? `✅ ${done}/${total}` : `⚠️ ${done}/${total}`} — delivery report ready`);

        return {
            ok: finalVerified || partialDelivery,
            error: (finalVerified || partialDelivery) ? undefined : summary,
            output: {
                projectName: plannerResult.output.projectName,
                completedPhases: done,
                totalPhases: total,
                verified: finalVerified,
                executionStatus: finalExecutionStatus,
                verificationStatus: finalVerificationStatus,
                deliveryStatus: finalDeliveryStatus,
                decisionEvidence,
                ...(verificationFailed ? { verificationFailed: true } : {}),
                ...(verificationUnavailable ? { verificationUnavailable: true } : {}),
                ...(requestFidelityMismatch ? { requestFidelityMismatch: true } : {}),
                ...(requestFidelityEvidenceUnavailable ? { fidelityUnverifiable: true } : {}),
                ...(liveRunVerificationFailed ? { verificationFailed: true } : {}),
                ...(browserQaFailed ? { browserQaFailed: true } : {}),
                ...(finalHonestBlocker ? { honestBlocker: true } : {}),
                ...(liveRunVerificationFailed ? { honestBlocker: true } : {}),
                ...(liveRepairAttempted ? { liveRepairAttempted: true, liveRepairStatus } : {}),
                ...(browserQaRepairAttempted ? { browserQaRepairAttempted: true, browserQaRepairStatus } : {}),
                ...(scopeRepairAttempted ? { scopeRepairAttempted: true, scopeRepairStatus } : {}),
                ...(scopeCoverageFailed ? { scopeCoverageFailed: true } : {}),
                ...(partialDelivery ? { partialDelivery: true } : {}),
                ...(scopeAudit ? { scopeAudit } : {}),
                // `project_pipeline` already performed discovery, planning,
                // verification, and its bounded self-healing attempt. A false
                // result is therefore final evidence, not an invitation for the
                // outer generic recovery planner to guess a different project type.
                pipelineFinal: true,
                summary,
                liveUrl: liveUrl || undefined,
                report: pipeline?.engineeringReport,
                reportMarkdown: pipeline?.engineeringReportMarkdown,
                ...(browserQa ? { browserQa } : {}),
                results: pipeline?.results,
                repairTicket: pipeline?.repairTicket,
                ...(liveRunError ? { liveRunError } : {}),
            },
            logs,
        };
    }

    /**
     * The delivery report the user actually reads in the chat — markdown, in
     * the run's language, built ONLY from what provably happened: the phases
     * that ran, the files the plan wrote, and a run hint only when an entry
     * file is really there to run. No invented claims.
     */
    /**
     * A request to read a local specification is a binding source requirement,
     * not a suggestion for the language model.  We first identify only files
     * that discovery has actually observed, then read every page through Joe's
     * own read_file tool.  The planner receives the complete text or nothing.
     */
    private async readRequestedSpecifications(request: string, evidence: any, context: any, logs: string[], say: (message: string) => void, isAr: boolean): Promise<{ content: string; sources: Array<{ path: string; lineCount: number }>; error?: string }> {
        const asksToRead = requestRequiresLocalSpecification(request);
        const asksToExecute = /(?:نف[ّذذ]|ابن|طو[ّو]ر|طبق|execute|implement|build|develop|create|run)/i.test(request);
        if (!asksToRead || !asksToExecute) return { content: '', sources: [] };

        const files = Array.isArray(evidence?.instructionFiles) ? evidence.instructionFiles : [];
        const named = files.filter((file: any) => /(?:spec|require|brief|مواصف|متطلبات)/i.test(String(file?.relativePath || '')));
        const selected = named.length ? named : files.length === 1 ? files : [];
        if (!selected.length) {
            return {
                content: '',
                sources: [],
                error: pick(isAr,
                    'طلبتَ قراءة مواصفة محلية قبل التنفيذ، لكن الاستكشاف لم يثبت ملف مواصفة واحداً يمكن قراءته بأمان. حدّد اسم الملف أو ضعه في مساحة العمل ثم أعد الطلب.',
                    'You asked Joe to read a local specification before execution, but discovery did not establish one safe specification file. Name the file or place it in the workspace, then retry.'),
            };
        }

        const sections: string[] = [];
        const sources: Array<{ path: string; lineCount: number }> = [];
        const workspaceRoot = String(evidence?.workspaceRoot || evidence?.selectedProject?.root || '').trim();
        for (const file of selected) {
            const suppliedPath = String(file?.relativePath || '').trim();
            const expectedLines = Number(file?.lineCount || 0);
            if (!suppliedPath || !Number.isFinite(expectedLines) || expectedLines < 1) continue;
            const relativePath = this.safeWorkspaceRelativePath(suppliedPath, workspaceRoot);
            if (!relativePath) {
                return {
                    content: '', sources: [],
                    error: pick(isAr,
                        `رفض Joe مسار المواصفة «${suppliedPath}» لأنه ليس مساراً نسبياً آمناً داخل مساحة العمل المكتشفة.`,
                        `Joe refused specification path “${suppliedPath}” because it is not a safe workspace-relative path.`),
                };
            }
            say(pick(isAr, `[pipeline] أقرأ المواصفة كاملة: ${relativePath}`, `[pipeline] Reading complete local specification: ${relativePath}`));
            const chunks: string[] = [];
            for (let startLine = 1; startLine <= expectedLines; startLine += 1000) {
                const readResult = await executeTool('read_file', {
                    path: relativePath,
                    startLine,
                    endLine: Math.min(startLine + 999, expectedLines),
                }, context);
                if (!readResult?.ok || typeof readResult?.output?.content !== 'string') {
                    return {
                        content: '', sources: [],
                        error: pick(isAr,
                            `تعذّر قراءة المواصفة المثبتة «${relativePath}» كاملة: ${readResult?.error || 'لم تُرجع أداة القراءة محتوى صالحاً'}.`,
                            `Joe could not fully read the established specification “${relativePath}”: ${readResult?.error || 'the read tool returned no valid content'}.`),
                    };
                }
                chunks.push(readResult.output.content);
                appendBoundedPipelineLogs(logs, readResult.logs);
            }
            const content = chunks.join('\n');
            sections.push(`SOURCE: ${relativePath}\n${content}`);
            sources.push({ path: relativePath, lineCount: expectedLines });
            appendBoundedPipelineLog(logs, `pipeline.specification_read=${relativePath} lines=1-${expectedLines}`);
        }
        if (!sources.length) {
            return { content: '', sources: [], error: pick(isAr, 'لم تتوفر مواصفة مقروءة كاملة للتخطيط الآمن.', 'No complete specification was available for safe planning.') };
        }
        return { content: sections.join('\n\n'), sources };
    }

    /**
     * Extract an explicitly delimited product/engineering brief from a live
     * evaluation harness. This is intentionally structural: it does not infer
     * a product from names, headings, or vocabulary, and it is a no-op unless a
     * matching start and end marker are both present. The complete original
     * request remains available to the outer audit; only engineering decisions
     * use the bounded product request.
     */
    private extractEmbeddedProductRequest(request: string): string {
        const source = String(request || '').replace(/\r\n?/g, '\n').trim();
        if (!source) return source;
        const lines = source.split('\n');
        const startIndex = lines.findIndex((line) => /^(?:give\s+joe\s+this\s+exact\s+prompt|exact\s+prompt\s+to\s+give\s+joe)\s*:?$/i.test(line.trim()));
        if (startIndex < 0) return source;
        const endIndex = lines.findIndex((line, index) => index > startIndex && /^(?:end\s+of\s+(?:joe\s+)?challenge|end\s+of\s+product\s+spec(?:ification)?|end\s+of\s+embedded\s+(?:product\s+)?(?:prompt|brief))\s*$/i.test(line.trim()));
        if (endIndex <= startIndex) return source;
        const body = lines
            .slice(startIndex + 1, endIndex)
            .filter((line, index, values) => {
                const trimmed = line.trim();
                if (!trimmed) return true;
                // Remove only divider lines around the explicit boundary; all
                // product prose, headings, and constraints remain untouched.
                const atEdge = index < 4 || index >= values.length - 4;
                return !(atEdge && /^[-=*_]{3,}$/.test(trimmed));
            })
            .join('\n')
            .trim();
        return body.length >= 200 ? body : source;
    }

    /**
     * Compatibility boundary for persisted discovery evidence created before
     * instruction files became relative-only. A matching absolute path is
     * converted to a portable relative path; every escape is rejected.
     */
    private safeWorkspaceRelativePath(suppliedPath: string, workspaceRoot: string): string {
        const raw = String(suppliedPath || '').trim().replace(/\\/g, '/');
        if (!raw) return '';
        const normalisedRoot = String(workspaceRoot || '').trim();
        let relativePath = raw;
        if (path.isAbsolute(raw)) {
            if (!normalisedRoot) return '';
            relativePath = path.relative(normalisedRoot, raw).replace(/\\/g, '/');
        }
        relativePath = relativePath.replace(/^\.\//, '');
        if (!relativePath || relativePath.startsWith('/') || /^[a-zA-Z]:\//.test(relativePath)) return '';
        if (relativePath.split('/').some(segment => segment === '..')) return '';
        return relativePath;
    }

    /**
     * Produce a portable, bounded evidence brief for downstream workers.  The
     * complete specification is read and preserved as execution evidence; the
     * planner and individual workers receive this portable brief, which preserves
     * the request, opening scope, headings, and binding constraints without
     * sending an unbounded document to a single model request.
     */
    private buildRequirementsContext(request: string, specification: string): string {
        const source = String(specification || request || '').replace(/\r\n?/g, '\n').trim();
        if (!source) return '';
        const lines = source.split('\n');
        const chosen: string[] = [];
        const add = (line: string) => {
            const value = String(line || '').trim();
            if (value && !chosen.includes(value)) chosen.push(value);
        };

        // Preserve the introductory scope verbatim, then retain every section
        // marker, its immediate local intent, and binding constraints. This is a
        // deterministic compression of inspected evidence, not a product-specific
        // template and not an LLM summary that could omit an inconvenient rule.
        lines.slice(0, 60).forEach(add);
        for (let index = 0; index < lines.length; index += 1) {
            const value = lines[index].trim();
            if (!value) continue;
            const isHeading = /^(?:#{1,6}\s+|\d+(?:\.\d+)*[.)]\s+|[A-Z][A-Z0-9 &/_-]{5,})/.test(value);
            const isBinding = /\b(must|must not|never|required|approval|audit|security|tenant|lifecycle|rollback|health|metrics|traces|acceptance|deliverable)\b/i.test(value);
            if (isHeading) {
                add(value);
                // Preserve nearby explanation and acceptance notes, not just an
                // orphan heading, while keeping the request bounded.
                let captured = 0;
                for (let next = index + 1; next < lines.length && captured < 4; next += 1) {
                    const local = lines[next].trim();
                    if (!local) continue;
                    if (/^(?:#{1,6}\s+|\d+(?:\.\d+)*[.)]\s+)/.test(local)) break;
                    add(local);
                    captured += 1;
                }
            }
            if (isBinding) add(value);
            if (chosen.join('\n').length >= 12000) break;
        }
        const brief = chosen.join('\n').slice(0, 12000);
        return `AUTHORITATIVE REQUIREMENTS EVIDENCE (derived from the complete local specification; do not invent beyond it):\n${brief}`;
    }

    private buildDeliveryReport(args: {
        language: 'ar' | 'en';
        projectName: string;
        phases: any[];
        pipeline: any;
        done: number;
        total: number;
            verified: boolean;
        liveUrl?: string;
        liveRunError?: string;
        liveRepairStatus?: string;
        scopeAudit?: ScopeGateOutcome['scopeAudit'];
        scopeRepairStatus?: string;
        browserQa?: AppAudit | null;
        decisionEvidence?: PipelineDecisionEvidence;
        verificationUnavailable?: boolean;
    }): string {
        const { language: lang, projectName, phases, pipeline, done, total, verified, liveUrl, liveRunError, liveRepairStatus, scopeAudit, scopeRepairStatus, browserQa, decisionEvidence, verificationUnavailable } = args;
        const ar = lang === 'ar';
        const lines: string[] = [];
        /**
         * ORDER IS THE MESSAGE.
         *
         * His words: «اريد اعادة الترتيب للناتج الذي يظهر الذي يعطي الفائدة
         * للمستخدم وليس كل ما هب ودب». The report was assembled in the order
         * the code happened to compute things, and it showed: six internal gate
         * booleans sat directly under the headline — three of them `false`,
         * which is to say «nothing wrong here» printed as if it were news —
         * while «ماذا حدث», the only section that says WHY the build stopped,
         * was eleventh, behind a 3500-character cap that cut it off mid-path.
         *
         * So the two are collected apart from the narrative and placed by
         * value, not by computation order: the reason first, the internals
         * last, where a person who wants them can still find them.
         */
        const whatHappened: string[] = [];
        const techDetails: string[] = [];
        const phaseResults: any[] = Array.isArray(pipeline?.results) ? pipeline.results : [];
        const credentials: Array<{ email: string; password: string }> = [];
        for (const phase of phaseResults) {
            for (const result of (Array.isArray(phase?.results) ? phase.results : [])) {
                const credential = deliveryCredentialFromMessage(result?.message);
                if (credential && !credentials.some(item => item.email === credential.email && item.password === credential.password)) {
                    credentials.push(credential);
                }
            }
        }

        lines.push(verified
            ? (ar ? `## ✅ اكتمل المشروع: ${projectName}` : `## ✅ Project delivered: ${projectName}`)
            : verificationUnavailable
                ? (ar ? `## ⚠️ لم أستطع التحقق من المشروع: ${projectName}` : `## ⚠️ Project could not be verified: ${projectName}`)
                : (ar ? `## ⚠️ توقف البناء بصدق: ${projectName}` : `## ⚠️ Build stopped honestly: ${projectName}`));

        if (credentials.length) {
            lines.push('');
            lines.push(ar ? '### 🔑 بيانات الدخول الاختبارية (تظهر مرة واحدة)' : '### 🔑 Test account credentials (shown once)');
            for (const credential of credentials) {
                lines.push(ar
                    ? `- البريد: ${credential.email}\n  كلمة المرور: ${credential.password}`
                    : `- ${credential.email} / ${credential.password}`);
            }
        }

        // The live system, front and center — it is RUNNING, not just built.
        if (verified && liveUrl) {
            lines.push('');
            lines.push(ar
                ? `### 🟢 نظامك يعمل الآن\nالمعاينة الحية مفتوحة على: **${liveUrl}**\nيمكنك استخدامه الآن. لإيقافه قل: «أوقف المشروع».`
                : `### 🟢 Your system is live\nOpen at: **${liveUrl}**\nUse it now. To stop it, say: "stop the project".`);
        }
        lines.push(verificationUnavailable
            ? (ar
                ? `**المراحل:** ${done}/${total} نُفِّذت، لكن لم يكتمل فحص القبول؛ النتيجة **غير متحقَّقة** وليست حكماً على المنتج.`
                : `**Phases:** ${done}/${total} executed, but the acceptance checker could not complete; the result is **not verified**, not a product-failure verdict.`)
            : ar
                ? `**المراحل:** ${done}/${total} نُفِّذت وتحقَّقت (تنفيذ فعلي + فحوص، لا مجرد كتابة ملفات).`
                : `**Phases:** ${done}/${total} executed and verified (real execution + checks, not just written files).`);
        // Everything the reader needs first is inserted here at the end, once
        // the sections below have been computed.
        const reasonAt = lines.length;

        if (decisionEvidence) {
            techDetails.push('');
            techDetails.push(ar ? '### تفاصيل تقنية (للمراجعة)' : '### Technical details (for review)');
            techDetails.push(ar
                ? `- finalVerified: \`${decisionEvidence.finalVerified}\`؛ browserQaFailed: \`${decisionEvidence.browserQaFailed}\`؛ scopeCoverageFailed: \`${decisionEvidence.scopeCoverageFailed}\``
                : `- finalVerified: \`${decisionEvidence.finalVerified}\`; browserQaFailed: \`${decisionEvidence.browserQaFailed}\`; scopeCoverageFailed: \`${decisionEvidence.scopeCoverageFailed}\``);
            techDetails.push(ar
                ? `- liveUrl: \`${decisionEvidence.liveUrl || 'null'}\`؛ done/total: \`${decisionEvidence.done}/${decisionEvidence.total}\`؛ honestBlocker: \`${decisionEvidence.honestBlocker || 'null'}\``
                : `- liveUrl: \`${decisionEvidence.liveUrl || 'null'}\`; done/total: \`${decisionEvidence.done}/${decisionEvidence.total}\`; honestBlocker: \`${decisionEvidence.honestBlocker || 'null'}\``);
        }

        if (browserQa) {
            lines.push('');
            if (browserQa.skipped) {
                lines.push(ar
                    ? `### Browser QA المرئي: **لم يُجرَ** — ${browserQa.skipped}`
                    : `### Visible Browser QA: **not run** — ${browserQa.skipped}`);
            } else {
                const high = browserQa.findings.filter((finding) => finding.severity === 'high').length;
                lines.push(ar
                    ? `### Browser QA المرئي: **${browserQa.score}/100** — ${browserQa.findings.length} ملاحظة، ${high} حرجة، ${browserQa.pressed ?? 0} تفاعلاً مقاساً.`
                    : `### Visible Browser QA: **${browserQa.score}/100** — ${browserQa.findings.length} finding(s), ${high} blocking, ${browserQa.pressed ?? 0} interaction(s) measured.`);
                if (browserQa.findings.length) {
                    for (const finding of browserQa.findings.slice(0, 8)) {
                        lines.push(`- ${finding.severity.toUpperCase()}: ${finding.detailEn || finding.detail}`);
                    }
                }
            }
        }

        // Phase-by-phase, from the pipeline's own results.
        if (phaseResults.length) {
            lines.push('');
            lines.push(ar ? '### المراحل' : '### Phases');
            for (const p of phaseResults) {
                const okMark = p?.status === 'completed' ? '✅' : '❌';
                const name = String(p?.phaseName || `Phase ${p?.phaseNumber ?? '?'}`);
                const tasks = `${p?.completedTasks ?? '?'}/${p?.totalTasks ?? '?'}`;
                const healed = p?.selfFixExecution?.ok ? (ar ? ' — أُصلحت ذاتياً 🔧' : ' — self-healed 🔧') : '';
                lines.push(`- ${okMark} ${name} (${ar ? 'مهام' : 'tasks'}: ${tasks})${healed}`);
            }
        }

        /**
         * AND WHAT THE BUILDERS THEMSELVES SAID — INCLUDING WHAT THEY DID NOT
         * BUILD.
         *
         * His prompt ended: «At the end, show me plainly what you actually
         * built and what you did not». He got three phase names.
         *
         * The answer existed the whole time. `react_project` writes it: the
         * abilities the application really has, the two QA scores with every
         * finding named, the owner account — and an explicit «⚠️ You also
         * asked for things this step did NOT build» listing the live
         * streaming, the video calls, the AI diagnosis from photos and the
         * automatic vaccination recommendations. That message reached the
         * phase executor and was dropped there, and this report had nothing
         * to carry.
         *
         * A report that summarises phases instead of relaying what was
         * measured is a table of contents for a book nobody printed.
         */
        const spoken: string[] = [];
        for (const p of phaseResults) {
            for (const t of (Array.isArray(p?.results) ? p.results : [])) {
                const msg = String(t?.message || '').trim();
                if (msg && !spoken.includes(msg)) spoken.push(msg);
            }
        }
        if (spoken.length) {
            lines.push('');
            lines.push(ar ? '### ما بُني بالضبط — بكلام المحرّكات نفسها' : '### Exactly what was built — in the engines\' own words');
            for (const m of spoken) { lines.push(''); lines.push(m); }
        }

        // The delivery report must describe the artifact on disk, not only the
        // planner's intended paths. Runtime-bound roots are evidence propagated
        // by PhaseExecutor/AgentLoop; a plan-only fallback is explicitly marked.
        const writeTools = new Set(['write_file', 'ai_write_file', 'file_write', 'create_file', 'write_to_file']);
        const planFiles: string[] = [];
        for (const ph of phases) {
            for (const t of (Array.isArray(ph?.tasks) ? ph.tasks : [])) {
                if (!writeTools.has(String(t?.tool || ''))) continue;
                const p = String(t?.args?.path || t?.args?.filename || t?.input?.path || t?.input?.filename || '').trim();
                if (p && !planFiles.includes(p)) planFiles.push(p);
            }
        }
        const artifactCandidates = phaseResults.flatMap((result: any) => [
            result?.projectRoot,
            result?.extras?.projectRoot,
            result?.output?.projectRoot,
            result?.output?.extras?.projectRoot,
            ...(Array.isArray(result?.results) ? result.results.flatMap((task: any) => [task?.projectRoot, task?.extras?.projectRoot]) : []),
        ]).map((candidate: any) => String(candidate || '').trim()).filter(Boolean);
        const artifactRoot = artifactCandidates.find(candidate => fs.existsSync(candidate)) || '';
        const files = artifactRoot
            ? listSourceFiles(artifactRoot)
            : planFiles.map(file => `${file} *(unverified)*`);
        if (files.length || artifactRoot) {
            lines.push('');
            lines.push(ar ? '### الملفات' : '### Files');
            if (artifactRoot) lines.push(ar ? `- جذر الناتج الفعلي: \`${artifactRoot}\`` : `- Actual artifact root: \`${artifactRoot}\``);
            for (const f of files.slice(0, 15)) lines.push(`- \`${f}\``);
            if (files.length > 15) lines.push(ar ? `- … و${files.length - 15} ملفات أخرى` : `- … and ${files.length - 15} more`);
            if (!artifactRoot && planFiles.length) lines.push(ar ? '- ملاحظة: هذه مسارات الخطة فقط — لم يتحقق وجودها على القرص.' : '- Note: these are plan paths only — disk presence is unverified.');
        }

        // Run hints retain the existing plan contract; only the Files evidence
        // block above is changed to distinguish observed from unverified paths.
        const entry = planFiles.find(f => /(^|\/)(index|main|app|server)\.(js|mjs|cjs|ts)$/i.test(f));
        const wrotePackageJson = planFiles.some(f => /(^|\/)package\.json$/i.test(f));
        if (verified && (entry || wrotePackageJson)) {
            lines.push('');
            lines.push(ar ? '### التشغيل' : '### Run it');
            if (wrotePackageJson) lines.push(ar ? '```\nnpm install\nnpm start\n```' : '```\nnpm install\nnpm start\n```');
            else if (entry) lines.push(`\`\`\`\nnode ${entry}\n\`\`\``);
        }

        // On failure: name the failed phase and the real error head, plus what
        // the self-fix tried — the user deserves the diagnosis, not a shrug.
        if (!verified) {
            const failedPhase = phaseResults.find(p => p?.status !== 'completed');
            const ticket = pipeline?.repairTicket;
            whatHappened.push('');
            whatHappened.push(ar ? '### ماذا حدث' : '### What happened');
            if (failedPhase) {
                whatHappened.push(ar
                    ? `- المرحلة المتعثرة: **${failedPhase.phaseName || failedPhase.phaseNumber}**`
                    : `- Failed phase: **${failedPhase.phaseName || failedPhase.phaseNumber}**`);
            }
            if (verificationUnavailable) {
                whatHappened.push(ar
                    ? '- لم أستطع الحكم: أداة فحص المتصفح لم تكتمل، لذلك لا أنسب العطل إلى التطبيق ولا أعتبره مقبولاً.'
                    : '- Could not verify: the browser acceptance checker did not complete, so this does not blame the product and is not accepted as delivered.');
            }
            if (ticket?.primaryError) {
                whatHappened.push((ar ? '- الخطأ: ' : '- Error: ') + '`' + String(ticket.primaryError).slice(0, 220) + '`');
            }
            if (liveRunError) {
                whatHappened.push(ar
                    ? '- دليل فشل التشغيل الحي: `' + String(liveRunError).slice(0, 420) + '`'
                    : '- Live-run evidence: `' + String(liveRunError).slice(0, 420) + '`');
            }
            if (liveRepairStatus && liveRepairStatus !== 'not_attempted') {
                whatHappened.push(ar
                    ? '- حالة محاولة إصلاح التشغيل المحدودة: `' + String(liveRepairStatus).slice(0, 180) + '`'
                    : '- Bounded live-repair status: `' + String(liveRepairStatus).slice(0, 180) + '`');
            }
            if (scopeAudit && scopeAudit.requested > 0) {
                whatHappened.push(ar
                    ? `- تدقيق نطاق الطلب: ${scopeAudit.built}/${scopeAudit.requested} (${Math.round(scopeAudit.coverage * 100)}%)${scopeAudit.missing.length ? `؛ المتبقي: ${scopeAudit.missing.slice(0, 6).join('، ')}` : ''}`
                    : `- Requested-scope audit: ${scopeAudit.built}/${scopeAudit.requested} (${Math.round(scopeAudit.coverage * 100)}%)${scopeAudit.missing.length ? `; remaining: ${scopeAudit.missing.slice(0, 6).join(', ')}` : ''}`);
            }
            if (scopeRepairStatus && scopeRepairStatus !== 'not_attempted') {
                whatHappened.push(ar
                    ? '- حالة إصلاح النطاق المحدود: `' + String(scopeRepairStatus).slice(0, 180) + '`'
                    : '- Bounded scope-repair status: `' + String(scopeRepairStatus).slice(0, 180) + '`');
            }
            const sfFailureReason = phaseResults.map((result: any) => (
                result?.selfFixFailureReason
                || result?.extras?.selfFixFailureReason
                || result?.output?.selfFixFailureReason
                || result?.output?.extras?.selfFixFailureReason
            )).map((value: any) => String(value || '').trim()).find(Boolean);
            const sfReason = pipeline?.selfFixExecution?.reason || pipeline?.selfFixPlan?.reason;
            if (sfFailureReason) {
                whatHappened.push((ar ? '- سبب فشل إعادة التشغيل: ' : '- Rerun failure reason: ') + '`' + sfFailureReason.slice(0, 220) + '`');
            } else if (sfReason) {
                whatHappened.push((ar ? '- محاولة الإصلاح الذاتي: ' : '- Self-fix attempt: ') + String(sfReason).slice(0, 220));
            }
            whatHappened.push(ar
                ? `- ما اكتمل قبل التوقف (${done}/${total}) سليمٌ ومتحقَّق منه.`
                : `- Everything completed before the stop (${done}/${total}) is verified and intact.`);
        }

        // The reason first — right under the phase count, where the eye lands —
        // and the internals last. Both were computed above; only the order changed.
        if (whatHappened.length) lines.splice(reasonAt, 0, ...whatHappened);
        lines.push(...techDetails);
        return lines.join('\n').slice(0, 3500);
    }
}
