import { ToolDefinition, ToolPermission } from '../types';
import { DeliveryLedger, deliveryVerdict, mayRunBrowserQa, verifiedLiveUrl, browserQaTargetUrl, type DeliveryInstrument } from '../../../core/quality/delivery-verdict';
import { backendRequestedFor, collectServerEvidence, coverageError, coverageUnverified, identifiersFor, judgeRequestCoverage, probePathsFor, probeServedResources, requestCoverageRepairTask, requestedRecords, requestedTestsRoot, runRequestedTests, testsRequestedIn, testTreeFingerprint, type ProbeResult, type RequestCoverageReport, type RequestedTestsRun } from '../../../core/quality/request-coverage';
import { RepairTicketService } from '../../services/RepairTicketService';
import { deliveryPartsForRun } from '../../../core/quality/delivery-parts';
import { staticSiteRoot } from '../preview-site';
import { bindRunCancellation } from '../../../core/session/attended-run';
import { ensurePlanFinalVerification } from '../../../core/quality/plan-verification';
import { isWithinRoot } from '../path-containment';
import fs from 'fs';
import path from 'path';
import { executeTool } from '../../services/ToolService';
import { workspaceService } from '../../services/WorkspaceService';
import { isArabicReply, say as pick } from '../../../shared/reply-language';
import { brandFrom } from '../../../core/design/page-head';
import { scopeReport } from '../../../core/quality/scope-audit';
import { verifyProviderDirect } from '../../../core/llm/intelligent-router';
import { detectStart, missingRuntimeDependencies, reconcileMissingRuntimeTarget, resolveRunnableProject } from './ProjectRunTool';
import { auditBuiltApp, AppAudit, findingText } from '../../../core/quality/app-audit';
import { readJoeProjectForRun } from '../../../api/page-store';
import { hasExplicitRecordSchema, isCliRequest as isCliRequestFn } from '../../../core/design/app-blueprints';
import { requestedArtifact } from '../../../core/design/requested-artifact';
import { guardUnverifiedBuilderClaims } from '../../../core/api-discovery/reporting';
import { publicUrlFor } from '../../../shared/utils/publicUrl';
import { integrationProfile } from '../../../core/api-discovery/integration-profiles';
import { isWorkspaceOverviewRequest } from '../../../core/orchestrator/workspace-overview';
import { engineeringScope, hasEngineeringToken, sealEngineeringEvidence, snapshotEngineeringChild } from '../../services/AutonomousEngineeringPolicy';
import { engineeringExecution, issueEngineeringExecution } from '../../services/AutonomousEngineeringPolicy';
import { autonomousFileTextIsSafe } from '../../services/AutonomousFilePolicy';
import { DISCOVERY_EVIDENCE_MAX_CHARS } from '../../../core/orchestrator/large-request-contract';
import { namedTargetFile } from '../../../core/orchestrator/file-intent';
import { servedByLocalModel } from '../../../core/llm/served-local-selection';
import { localPlanDeadlineMs } from '../../../core/orchestrator/planner-run-boundary';
export { isWorkspaceOverviewRequest } from '../../../core/orchestrator/workspace-overview';

const MAX_PIPELINE_LOGS = 192;
const MAX_PIPELINE_LOG_CHARS = 2_000;
const MAX_DELIVERY_FILES = 120;
const MAX_DELIVERY_FILE_DEPTH = 6;

function summarizeReadme(content: string): string {
    const lines = String(content || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const headings = lines.filter(line => /^(?:#{1,6}\s+|[A-Z][A-Za-z0-9 _-]{2,}:$)/.test(line)).slice(0, 12);
    const prose = lines.filter(line => !/^```|^[-*]\s|^#{1,6}\s/.test(line)).slice(0, 8);
    return [...headings, ...prose].join('\n').slice(0, 1800);
}

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
    specVerificationFailed?: boolean;
    specVerificationCoverage?: number;
    requestCoverageFailed?: boolean;
    requestCoverageMissing?: string[];
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
    if (input.requestCoverageFailed && input.requestCoverageMissing?.length) {
        // Missing requested records are named before any other blocker.
        honestBlocker = `requested_records_missing: ${input.requestCoverageMissing.slice(0, 12).join(', ')}`;
    } else if (input.liveRunError) {
        honestBlocker = `live_run: ${String(input.liveRunError).slice(0, 420)}`;
    } else if (input.browserQaFailed) {
        honestBlocker = 'browser_qa_failed';
    } else if (verificationUnavailable) {
        honestBlocker = 'verification_unavailable';
    } else if (input.scopeCoverageFailed && input.scopeAudit?.requested) {
        honestBlocker = `scope_coverage: ${Number(input.scopeAudit.built || 0)}/${Number(input.scopeAudit.requested)}`;
    } else if (input.specVerificationFailed) {
        honestBlocker = `spec_verification: ${Math.round((input.specVerificationCoverage || 0) * 100)}% coverage`;
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
    const text = redactDeliveryCredentials(String(line ?? '')).slice(0, MAX_PIPELINE_LOG_CHARS);
    if (logs.length < MAX_PIPELINE_LOGS) {
        logs.push(text);
        return;
    }
    logs[0] = '[ProjectPipeline] ... older pipeline logs truncated; recent evidence retained ...';
    logs.splice(1, 1);
    logs.push(text);
}

/**
 * Runtime credentials are handed to the browser-QA context directly. They
 * must never be copied into the user-visible activity stream or delivery
 * report, where a transcript may be retained long after the local run ends.
 */
function redactDeliveryCredentials(value: unknown): string {
    return String(value ?? '')
        .replace(/(Owner account(?:\s*\([^)]*\))?:\s*[^\s/]+\s*\/\s*)[^\s]+/giu, '$1[redacted]')
        .replace(/(كلمة المرور:\s*)[^\s]+/gu, '$1[محجوبة]');
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

interface TrustedRuntimeProjectHandoff {
    sourceRoot: string;
    runtimeRoot: string;
    durablePreviewUrl?: string;
    runtimeAuth?: { email: string; password: string; loginPath?: string; tokenStorageKey?: string; route?: string };
    externalApi?: {
        capability: 'weather' | 'currency' | 'ip';
        integrationProfileId: string;
        providerName: string;
        auth: string;
        pricing: string;
        health: 'HEALTHY' | 'UNKNOWN' | 'DEGRADED' | 'UNAVAILABLE';
    };
}

export function durablePreviewEligible(input: {
    projectType: unknown;
    hasDist: boolean;
    hasPackagedRuntime: boolean;
    integrationProfileId: unknown;
}): boolean {
    return String(input.projectType || '') === 'react'
        && input.hasDist
        && !input.hasPackagedRuntime
        && Boolean(integrationProfile(String(input.integrationProfileId || '').trim()));
}

export function externalApiExpectationFromRecord(input: any): TrustedRuntimeProjectHandoff['externalApi'] {
    const integrationProfileId = String(input?.integrationProfileId || '').trim();
    const capability = String(input?.capability || '').trim();
    const profile = integrationProfile(integrationProfileId);
    if (!['weather', 'currency', 'ip'].includes(capability) || !profile || profile.capability !== capability) return undefined;
    const health = ['HEALTHY', 'UNKNOWN', 'DEGRADED', 'UNAVAILABLE'].includes(String(input?.health || ''))
        ? String(input.health) as 'HEALTHY' | 'UNKNOWN' | 'DEGRADED' | 'UNAVAILABLE'
        : 'UNKNOWN';
    return {
        capability: capability as 'weather' | 'currency' | 'ip',
        integrationProfileId,
        providerName: profile.providerName,
        auth: profile.auth,
        pricing: profile.pricing,
        health,
    };
}

function trustedRuntimeProjectHandoff(sessionId: unknown, workspaceId: unknown, runId: unknown): TrustedRuntimeProjectHandoff | null {
    const key = String(sessionId || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
    const record = readJoeProjectForRun(key, runId);
    const candidateRaw = String(record?.dir || '').trim();
    if (!candidateRaw) return null;
    const workspaceRoot = path.resolve(workspaceService.getActiveRoot(String(workspaceId || '')));
    const candidate = path.resolve(candidateRaw);
    const inside = isWithinRoot(candidate, workspaceRoot);
    if (!inside || !fs.existsSync(path.join(candidate, 'package.json'))) return null;

    const packagedRaw = String(record?.packagedInto || '').trim();
    const packaged = packagedRaw ? path.resolve(packagedRaw) : '';
    const packagedIsTrusted = !!packaged
        && isWithinRoot(packaged, workspaceRoot)
        && fs.existsSync(path.join(packaged, 'package.json'))
        && fs.existsSync(path.join(packaged, 'server.js'))
        && fs.existsSync(path.join(packaged, 'public', 'index.html'));
    const auth = record?.runtimeAuth;
    const runtimeAuth = auth?.email && auth?.password
        ? {
            email: String(auth.email),
            password: String(auth.password),
            ...(auth.loginPath ? { loginPath: String(auth.loginPath) } : {}),
            ...(auth.tokenStorageKey ? { tokenStorageKey: String(auth.tokenStorageKey) } : {}),
            ...(auth.route ? { route: String(auth.route) } : {}),
        }
        : undefined;
    const integrationRecordPath = path.join(candidate, '.joe', 'external-api.json');
    let integrationProfileId = '';
    let externalApi: TrustedRuntimeProjectHandoff['externalApi'];
    try {
        const integrationRecord = JSON.parse(fs.readFileSync(integrationRecordPath, 'utf8'));
        integrationProfileId = String(integrationRecord?.integrationProfileId || '').trim();
        externalApi = externalApiExpectationFromRecord(integrationRecord);
    } catch { /* not a maintained external-API project */ }
    const durablePreviewUrl = durablePreviewEligible({
        projectType: record?.type,
        hasDist: fs.existsSync(path.join(candidate, 'dist', 'index.html')),
        hasPackagedRuntime: packagedIsTrusted,
        integrationProfileId,
    })
        ? publicUrlFor(`/project-preview/${encodeURIComponent(key)}/index.html?v=${Date.now()}`)
        : '';
    return {
        sourceRoot: candidate,
        runtimeRoot: packagedIsTrusted ? packaged : candidate,
        ...(durablePreviewUrl ? { durablePreviewUrl } : {}),
        ...(runtimeAuth ? { runtimeAuth } : {}),
        ...(externalApi ? { externalApi } : {}),
    };
}

export function finalBrowserQaUrl(liveUrl: unknown, durablePreviewUrl: unknown): string {
    return String(durablePreviewUrl || liveUrl || '').trim();
}

const BROWSER_QA_INFRASTRUCTURE_FINDINGS = new Set([
    'viewport_emulation_failed',
    'browser_unavailable',
    'qa_target_unavailable',
]);

export function hasOnlyBrowserQaInfrastructureFindings(findings: Array<{ id?: unknown; code?: unknown }> = []): boolean {
    return findings.length > 0 && findings.every((finding) =>
        BROWSER_QA_INFRASTRUCTURE_FINDINGS.has(String(finding?.code || finding?.id || '')));
}

function trustedRuntimeProjectRoot(sessionId: unknown, workspaceId: unknown, runId: unknown): string {
    return trustedRuntimeProjectHandoff(sessionId, workspaceId, runId)?.sourceRoot || '';
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

/**
 * ⛔ A TEMPLATE IS A SKELETON, NOT THE PROGRAM HE ASKED FOR (CLAUDE.md law 4).
 *
 * Eval L3-cli, 2026-10-22: «Write a Node.js command-line tool wordcount.js that
 * takes a file path argument and prints the number of words in that file» was
 * delivered as src/index.ts holding a JSON property=value FILTER, a test that
 * filters Alice/Bob/Charlie, and no wordcount.js — the same program every CLI
 * request received, whatever it asked for.
 *
 * So the language skeleton (manifest, config, entry file name) still comes from
 * here, but: the file he names is the entry; the stock filter/convert body is
 * kept only when that IS what he asked for; otherwise the entry and its test are
 * authored from his request. His text is also flattened before it is embedded,
 * because a quote or newline in it broke package.json and the comment lines.
 */
const CLI_LANGUAGE_BY_EXTENSION: Record<string, ReturnType<typeof detectLanguage>> = {
    '.js': 'javascript', '.cjs': 'javascript', '.mjs': 'javascript', '.ts': 'typescript',
    '.py': 'python', '.sh': 'bash', '.go': 'go', '.rs': 'rust',
};
const CLI_RUNNER: Record<string, string> = { javascript: 'node', python: 'python', bash: 'bash' };

function buildCliScaffold(request: string, projectName: string): {
    projectName: string; reason: string; phases: Array<{ phaseNumber: number; name: string; tasks: any[] }>;
} {
    const named = namedTargetFile(request);
    const namedExt = named ? path.extname(named).toLowerCase() : '';
    // The file he named decides the language before any keyword guess does.
    const lang = CLI_LANGUAGE_BY_EXTENSION[namedExt] || detectLanguage(request);
    const format = detectInputFormat(request);
    const flat = request.replace(/[\r\n\t]+/g, ' ').replace(/["\\`$]/g, "'").trim();

    const scaffold = generateCliScaffold(lang, format, flat, projectName);
    const { pkgJson, tsconfigJson, sampleFile } = scaffold;
    let { entryPoint, entryPointContent, testFile, testFileName } = scaffold;
    let manifest = pkgJson;
    // A named entry replaces the default one wherever the manifest runs it.
    // Interpreted languages only: compiled targets keep their build layout.
    // Only a SOURCE file in the program's language is an entry: «تكتب الأسطر
    // الخاطئة في ملف errors.csv» names what the program writes, and taking it
    // as the entry wrote the Python program into errors.csv, which the program
    // then overwrote with its own output (eval round 19, P301). A named data
    // file reaches the program through the request text, never the structure.
    const runner = CLI_RUNNER[lang];
    const namedIsSource = CLI_LANGUAGE_BY_EXTENSION[namedExt] === lang;
    if (named && namedIsSource && runner && named !== entryPoint) {
        try {
            const pkg = JSON.parse(manifest);
            pkg.main = named;
            pkg.scripts = { ...(pkg.scripts || {}), start: `${runner} ${named}` };
            manifest = JSON.stringify(pkg, null, 2);
            entryPoint = named;
        } catch { /* keep the default entry when the stock manifest is unreadable */ }
    }
    // A Python program's tests are named after it and run by the standard
    // library: a test script that needs pytest made the verdict depend on the
    // machine (this laptop has no pytest), not on the program (eval round 19).
    if (lang === 'python') {
        testFileName = `test_${path.basename(entryPoint, '.py').replace(/[^A-Za-z0-9_]/g, '_')}.py`;
        testFile = generatePythonTest(entryPoint, format === 'csv');
        try {
            const pkg = JSON.parse(manifest);
            pkg.scripts = { ...(pkg.scripts || {}), test: pythonTestCommand([testFileName], true) };
            manifest = JSON.stringify(pkg, null, 2);
        } catch { /* keep the stock manifest */ }
    }

    const asksForFilter = /\bfilter(?:s|ing)?\b|property\s*=\s*value|matching\s+entries|فلتر|تصفية|يصفي/i.test(request);
    const asksForCsvToJson = format === 'csv' && /\bjson\b/i.test(request);
    const templateServesRequest = asksForFilter || asksForCsvToJson;

    const structure: Record<string, string> = { 'package.json': manifest, [entryPoint]: entryPointContent };
    if (templateServesRequest) {
        structure[testFileName] = testFile;
        structure['sample.json'] = sampleFile;
    }
    // Only include tsconfig.json for TypeScript projects
    if (tsconfigJson) {
        // For TypeScript, use tsconfig.json; for Go, it's a placeholder for go.mod
        const tsconfigName = lang === 'go' ? 'go.mod' : 'tsconfig.json';
        (structure as any)[tsconfigName] = tsconfigJson;
    }

    const tasks: any[] = [{
        tool: 'scaffold_project',
        description: `CLI tool scaffold for: ${request}`,
        args: { request, structure },
    }];
    if (!templateServesRequest) {
        const runCommand = runner ? `${runner} ${entryPoint}` : `the project's start script`;
        tasks.push({
            tool: 'ai_write_file',
            description: `Write ${entryPoint} from the request`,
            args: {
                path: entryPoint,
                description: `${request}\n\nWrite the complete ${lang} program in ${entryPoint}. It is run as \`${runCommand} <arguments>\`. `
                    + 'Implement exactly the behaviour requested above, read inputs from the command-line arguments, print results to stdout, '
                    + 'print a short usage line and exit with a non-zero code when arguments are missing or a file cannot be read.',
            },
        }, {
            tool: 'ai_write_file',
            description: `Write ${testFileName} for the requested behaviour`,
            args: {
                path: testFileName,
                description: cliTestBrief(entryPoint, runCommand, request, lang),
            },
        });
    }

    return {
        projectName,
        reason: templateServesRequest
            ? `a CLI/utility/script was asked for; file-level scaffolding with ${lang} structure`
            : `a CLI/utility/script was asked for; ${lang} skeleton, then ${entryPoint} authored from the request`,
        phases: [{
            phaseNumber: 1,
            name: 'CLI Scaffold',
            tasks,
        }]
    };
}

function detectLanguage(request: string): 'typescript' | 'python' | 'bash' | 'go' | 'rust' | 'javascript' | 'unknown' {
    const req = request.toLowerCase();
    
    // Explicit language mentions (TypeScript first for specificity)
    if (/\bpython\b/.test(req)) return 'python';
    if (/\btypescript\b|\bts\b/.test(req)) return 'typescript';
    if (/\bbash\b|\bshell\b|\bsh\b/.test(req)) return 'bash';
    if (/\bgo\b|\bgolang\b/.test(req)) return 'go';
    if (/\brust\b/.test(req)) return 'rust';
    if (/\bjavascript\b/.test(req)) return 'javascript';
    
    // Framework/tool hints (Node.js ecosystem defaults to TypeScript)
    if (/django|flask|fastapi|pandas|numpy|pip|conda|virtualenv/.test(req)) return 'python';
    if (/node|npm|yarn|pnpm|express|fastify|nestjs|react|vue|next/.test(req)) return 'typescript';
    if (/cargo|rustup|tokio|actix/.test(req)) return 'rust';
    if (/go\.mod|gin|echo|fiber/.test(req)) return 'go';
    
    return 'typescript'; // default fallback
}

function detectInputFormat(request: string): 'csv' | 'json' | 'text' | 'unknown' {
    const req = request.toLowerCase();
    
    if (/\bcsv\b|\bcomma.separated/.test(req)) return 'csv';
    if (/\btsv\b|\btab.separated/.test(req)) return 'csv'; // treat TSV as CSV
    if (/\bjson\b|\.json\b/.test(req)) return 'json';
    if (/\bxml\b/.test(req)) return 'text';
    if (/\btext\b|\.txt\b/.test(req)) return 'text';
    
    return 'unknown';
}

function generateCliScaffold(lang: string, format: string, request: string, projectName: string): {
    pkgJson: string;
    tsconfigJson: string;
    entryPoint: string;
    entryPointContent: string;
    testFile: string;
    sampleFile: string;
    testFileName: string;
} {
    const isCsv = format === 'csv';
    
    switch (lang) {
        case 'python':
            return generatePythonScaffold(request, projectName, isCsv);
        case 'bash':
            return generateBashScaffold(request, projectName, isCsv);
        case 'go':
            return generateGoScaffold(request, projectName, isCsv);
        case 'rust':
            return generateRustScaffold(request, projectName, isCsv);
        case 'javascript':
            return generateJavaScriptScaffold(request, projectName, isCsv);
        case 'typescript':
        default:
            return generateTypeScriptScaffold(request, projectName, isCsv);
    }
}

function generateTypeScriptScaffold(request: string, projectName: string, isCsv: boolean) {
    const deps = `"typescript": "^5.0.0",\n    "@types/node": "^20.0.0"${isCsv ? ',\n    "csv-parse": "^5.5.0"' : ''}`;
    const pkgJson = `{\n  "name": "${projectName}",\n  "version": "1.0.0",\n  "description": "${request}",\n  "main": "dist/index.js",\n  "scripts": {\n    "build": "tsc",\n    "start": "node dist/index.js",\n    "test": "node --test test.js"\n  },\n  "devDependencies": {\n    ${deps}\n  }\n}`;
    const tsconfigJson = `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "module": "commonjs",\n    "outDir": "./dist",\n    "rootDir": "./src",\n    "strict": true,\n    "esModuleInterop": true,\n    "skipLibCheck": true,\n    "forceConsistentCasingInFileNames": true\n  },\n  "include": ["src/**/*"]\n}`;
    const entryPoint = 'src/index.ts';
    const entryPointContent = generateTypeScriptEntry(request);
    const testFile = generateTypeScriptTest();
    const sampleFile = generateSampleData();
    return { pkgJson, tsconfigJson, entryPoint: 'src/index.ts', entryPointContent, testFile, sampleFile, testFileName: 'test.js' };
}

function generatePythonScaffold(request: string, projectName: string, isCsv: boolean) {
    // A Python program's dependencies are not npm packages: the manifest only
    // says how it starts and how its standard-library tests run.
    const pkgJson = `{\n  "name": "${projectName}",\n  "version": "1.0.0",\n  "description": "${request}",\n  "main": "main.py",\n  "scripts": {\n    "start": "python main.py",\n    "test": "python -m unittest -v test_main.py"\n  }\n}`;
    const entryPoint = 'main.py';
    const entryPointContent = generatePythonEntry(request, isCsv);
    const testFile = generatePythonTest('main.py', isCsv);
    const sampleFile = generateSampleData();
    return { pkgJson: pkgJson, tsconfigJson: '', entryPoint: 'main.py', entryPointContent, testFile, sampleFile, testFileName: 'test_main.py' };
}

function generateBashScaffold(request: string, projectName: string, isCsv: boolean) {
    const pkgJson = `{\n  "name": "${projectName}",\n  "version": "1.0.0",\n  "description": "${request}",\n  "main": "main.sh",\n  "scripts": {\n    "start": "bash main.sh",\n    "test": "bash test.sh"\n  }\n}`;
    const entryPoint = 'main.sh';
    const entryPointContent = generateBashEntry(request, isCsv);
    const testFile = generateBashTest();
    const sampleFile = generateSampleData();
    return { pkgJson: pkgJson, tsconfigJson: '', entryPoint: 'main.sh', entryPointContent, testFile, sampleFile, testFileName: 'test.sh' };
}

function generateGoScaffold(request: string, projectName: string, isCsv: boolean) {
    const deps = isCsv ? '"github.com/gocarina/gocsv": "^0.0.0"' : '';
    const pkgJson = `{\n  "name": "${projectName}",\n  "version": "1.0.0",\n  "description": "${request}",\n  "main": "main.go",\n  "scripts": {\n    "build": "go build -o dist/main .",\n    "start": "./dist/main",\n    "test": "go test ./..."\n  },\n  "dependencies": {\n    ${deps}\n  }\n}`;
    const tsconfigJson = `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "module": "commonjs",\n    "outDir": "./dist",\n    "rootDir": "./src",\n    "strict": true,\n    "esModuleInterop": true,\n    "skipLibCheck": true,\n    "forceConsistentCasingInFileNames": true\n  },\n  "include": ["src/**/*"]\n}`; // placeholder for go.mod
    const entryPoint = 'main.go';
    const entryPointContent = generateGoEntry(request, isCsv);
    const testFile = generateGoTest();
    const sampleFile = generateSampleData();
    return { pkgJson: pkgJson, tsconfigJson: tsconfigJson, entryPoint: 'main.go', entryPointContent, testFile, sampleFile, testFileName: 'test.go' };
}

function generateRustScaffold(request: string, projectName: string, isCsv: boolean) {
    const deps = isCsv ? '"csv": "1.3"' : '';
    const pkgJson = `{\n  "name": "${projectName}",\n  "version": "1.0.0",\n  "description": "${request}",\n  "main": "src/main.rs",\n  "scripts": {\n    "build": "cargo build --release",\n    "start": "./target/release/${projectName}",\n    "test": "cargo test"\n  },\n  "dependencies": {\n    ${deps}\n  }\n}`;
    const entryPoint = 'src/main.rs';
    const entryPointContent = generateRustEntry(request, isCsv);
    const testFile = generateRustTest();
    const sampleFile = generateSampleData();
    return { pkgJson: pkgJson, tsconfigJson: '', entryPoint: 'src/main.rs', entryPointContent, testFile, sampleFile, testFileName: 'src/test.rs' };
}

function generateJavaScriptScaffold(request: string, projectName: string, isCsv: boolean) {
    const pkgJson = `{\n  "name": "${projectName}",\n  "version": "1.0.0",\n  "description": "${request}",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js",\n    "test": "node --test test.js"\n  },\n  "devDependencies": {\n    ${isCsv ? '"csv-parse": "^5.5.0",' : ''}\n  }\n}`;
    const entryPoint = 'index.js';
    const entryPointContent = generateJavaScriptEntry(request);
    const testFile = generateJavaScriptTest();
    const sampleFile = generateSampleData();
    return { pkgJson: pkgJson, tsconfigJson: '', entryPoint: 'index.js', entryPointContent, testFile, sampleFile, testFileName: 'test.js' };
}

function generateTypeScriptEntry(request: string): string {
    const isCsv = /\bcsv\b|\bcomma.separated/i.test(request);
    if (isCsv) {
        return `// ${request}\nimport fs from 'fs';\nimport path from 'path';\nimport { parse } from 'csv-parse/sync';\n\nconst args: string[] = process.argv.slice(2);\nconst filePath: string = args[0];\n\nif (!filePath) {\n  console.error('Usage: node dist/index.js <csv-file>');\n  process.exit(1);\n}\n\ntry {\n  const content: string = fs.readFileSync(filePath, 'utf-8');\n  const records = parse(content, { columns: true, skip_empty_lines: true });\n  console.log(JSON.stringify(records, null, 2));\n} catch (err) {\n  console.error('Error:', err.message);\n  process.exit(1);\n}`;
    }
    return `// ${request}\nimport fs from 'fs';\nimport path from 'path';\n\nfunction filterJson(data: any[], filter: string): any[] {\n  const [prop, value] = filter.split('=');\n  if (!prop || !value) {\n    throw new Error('Filter must be in format: property=value');\n  }\n  return data.filter(item => item[prop] == value);\n}\n\nconst args: string[] = process.argv.slice(2);\nconst filePath: string = args[0];\nconst filter: string = args[1]; // format: property=value\n\nif (!filePath || !filter) {\n  console.error('Usage: node dist/index.js <json-file> <property=value>');\n  process.exit(1);\n}\n\ntry {\n  const content: string = fs.readFileSync(filePath, 'utf-8');\n  const data: any[] = JSON.parse(content);\n  if (!Array.isArray(data)) {\n    console.error('JSON file must contain an array');\n    process.exit(1);\n  }\n  const filtered = filterJson(data, filter);\n  console.log(JSON.stringify(filtered, null, 2));\n} catch (err) {\n  console.error('Error:', err.message);\n  process.exit(1);\n}\n\nexport { filterJson };`;
}

function generatePythonEntry(request: string, isCsv: boolean): string {
    if (isCsv) {
        return `# ${request}\nimport csv\nimport json\nimport sys\n\n\ndef main():\n    if len(sys.argv) < 2:\n        print("Usage: python main.py <csv-file>", file=sys.stderr)\n        sys.exit(1)\n    try:\n        with open(sys.argv[1], newline='', encoding='utf-8') as f:\n            rows = list(csv.DictReader(f))\n    except OSError as e:\n        print(f"Error: {e}", file=sys.stderr)\n        sys.exit(1)\n    print(json.dumps(rows, indent=2, ensure_ascii=False))\n\n\nif __name__ == "__main__":\n    main()`;
    }
    return `# ${request}\nimport json\nimport sys\n\ndef filter_json(data, filter_str):\n    prop, value = filter_str.split('=')\n    if not prop or not value:\n        raise ValueError("Filter must be in format: property=value")\n    return [item for item in data if str(item.get(prop, '')) == value]\n\ndef main():\n    if len(sys.argv) < 3:\n        print("Usage: python main.py <json-file> <property=value>")\n        sys.exit(1)\n    \n    file_path = sys.argv[1]\n    filter_str = sys.argv[2]\n    \n    try:\n        with open(file_path, 'r') as f:\n            data = json.load(f)\n        if not isinstance(data, list):\n            raise ValueError("JSON file must contain an array")\n        filtered = filter_json(data, filter_str)\n        print(json.dumps(filtered, indent=2))\n    except Exception as e:\n        print(f"Error: {e}")\n        sys.exit(1)\n\nif __name__ == "__main__":\n    main()`;
}

function generateBashEntry(request: string, isCsv: boolean): string {
    if (isCsv) {
        return `#!/bin/bash\n# ${request}\n\nif [ \$# -lt 1 ]; then\n    echo "Usage: \$0 <csv-file>"\n    exit 1\nfi\n\nCSV_FILE="\$1"\n\n# Use csvtool or awk to convert CSV to JSON\nif command -v csvtool &> /dev/null; then\n    csvtool -u JSON "\$CSV_FILE"\nelif command -v python3 &> /dev/null; then\n    python3 -c \"\nimport csv, json, sys\nwith open(sys.argv[1]) as f:\n    reader = csv.DictReader(f)\n    print(json.dumps(list(reader), indent=2))\n\" \"\$CSV_FILE\"\nelse\n    echo \"Error: csvtool or python3 required\" >&2\n    exit 1\nfi`;
    }
    return `#!/bin/bash\n# ${request}\n\nif [ \$# -lt 2 ]; then\n    echo "Usage: \$0 <json-file> <property=value>"\n    exit 1\nfi\n\nJSON_FILE="\$1"\nFILTER="\$2"\n\nif ! command -v jq &> /dev/null; then\n    echo "Error: jq required" >&2\n    exit 1\nfi\n\njq --arg filter "\$FILTER" 'map(select(.\$filter | split(\"=\") | .[0] as \$k | .[1] as \$v | .[\$k] == \$v))' "\$JSON_FILE"`;
}

function generateGoEntry(request: string, isCsv: boolean): string {
    if (isCsv) {
        return `// ${request}\npackage main\n\nimport (\n\t"encoding/csv"\n\t"encoding/json"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tif len(os.Args) < 2 {\n\t\tfmt.Println("Usage: go run main.go <csv-file>")\n\t\tos.Exit(1)\n\t}\n\t\n\tfile, err := os.Open(os.Args[1])\n\tif err != nil {\n\t\tfmt.Fprintf(os.Stderr, "Error: %v\\n", err)\n\t\tos.Exit(1)\n\t}\n\tdefer file.Close()\n\n\treader := csv.NewReader(file)\n\trecords, err := reader.ReadAll()\n\tif err != nil {\n\t\tfmt.Fprintf(os.Stderr, "Error: %v\\n", err)\n\t\tos.Exit(1)\n\t}\n\n\tif len(records) == 0 {\n\t\treturn\n\t}\n\n\theaders := records[0]\n\tvar results []map[string]string\n\tfor _, row := range records[1:] {\n\t\trecord := make(map[string]string)\n\t\tfor i, h := range headers {\n\t\t\trecord[h] = row[i]\n\t\t}\n\t\tresults = append(results, record)\n\t}\n\n\toutput, _ := json.MarshalIndent(results, "", "  ")\n\tfmt.Println(string(output))\n}`;
    }
    return `// ${request}\npackage main\n\nimport (\n\t"encoding/json"\n\t"os"\n)\n\nfunc main() {\n\tif len(os.Args) < 3 {\n\t\tfmt.Println("Usage: go run main.go <json-file> <property=value>")\n\t\tos.Exit(1)\n\t}\n\n\tfilePath := os.Args[1]\n\tfilter := os.Args[2]\n\n\tcontent, err := os.ReadFile(filePath)\n\tif err != nil {\n\t\tfmt.Fprintf(os.Stderr, "Error: %v\\n", err)\n\t\tos.Exit(1)\n\t}\n\n\tvar data []map[string]interface{}\n\tif err := json.Unmarshal(content, &data); err != nil {\n\t\tfmt.Fprintf(os.Stderr, "Error: %v\\n", err)\n\t\tos.Exit(1)\n\t}\n\n\tprop, value, _ := strings.Cut(filter, "=")\n\tvar filtered []map[string]interface{}\n\tfor _, item := range data {\n\t\tif val, ok := item[prop].(string); ok && val == value {\n\t\t\tfiltered = append(filtered, item)\n\t\t}\n\t}\n\n\toutput, _ := json.MarshalIndent(filtered, "", "  ")\n\tfmt.Println(string(output))\n}`;
}

function generateRustEntry(request: string, isCsv: boolean): string {
    if (isCsv) {
        return `// ${request}\nuse std::env;\nuse std::fs::File;\nuse std::io::BufReader;\n\nfn main() {\n    let args: Vec<String> = env::args().collect();\n    if args.len() < 2 {\n        eprintln!("Usage: {} <csv-file>", args[0]);\n        std::process::exit(1);\n    }\n\n    let file = File::open(&args[1]).expect("Failed to open file");\n    let mut reader = csv::Reader::from_reader(BufReader::new(file));\n    \n    let mut results = Vec::new();\n    for result in reader.deserialize() {\n        let record: serde_json::Value = result.expect("CSV parse error");\n        results.push(record);\n    }\n    \n    println!("{}", serde_json::to_string_pretty(&results).unwrap());\n}\n\n// Cargo.toml needs:\n// [dependencies]\n// csv = "1.3"\n// serde = { version = "1.0", features = ["derive"] }\n// serde_json = "1.0"`;
    }
    return `// ${request}\nuse std::env;\nuse std::fs;\nuse serde_json::Value;\n\nfn main() {\n    let args: Vec<String> = env::args().collect();\n    if args.len() < 3 {\n        eprintln!("Usage: {} <json-file> <property=value>", args[0]);\n        std::process::exit(1);\n    }\n\n    let file_path = &args[1];\n    let filter = &args[2];\n    let parts: Vec<&str> = filter.split('=').collect();\n    if parts.len() != 2 {\n        eprintln!("Filter must be in format: property=value");\n        std::process::exit(1);\n    }\n    let (prop, value) = (parts[0], parts[1]);\n\n    let content = fs::read_to_string(file_path).expect("Failed to read file");\n    let data: Vec<Value> = serde_json::from_str(&content).expect("Invalid JSON");\n    \n    let filtered: Vec<Value> = data.into_iter()\n        .filter(|item| item.get(&prop).map(|v| v.as_str()) == Some(value))\n        .collect();\n    \n    println!("{}", serde_json::to_string_pretty(&filtered).unwrap());\n}`;
}

function generateJavaScriptEntry(request: string): string {
    return `// ${request}\nconst fs = require('fs');\nconst path = require('path');\n\nfunction filterJson(data, filter) {\n  const [prop, value] = filter.split('=');\n  if (!prop || !value) {\n    throw new Error('Filter must be in format: property=value');\n  }\n  return data.filter(item => item[prop] == value);\n}\n\nconst args = process.argv.slice(2);\nconst filePath = args[0];\nconst filter = args[1]; // format: property=value\n\nif (!filePath || !filter) {\n  console.error('Usage: node index.js <json-file> <property=value>');\n  process.exit(1);\n}\n\ntry {\n  const content = fs.readFileSync(filePath, 'utf-8');\n  const data = JSON.parse(content);\n  if (!Array.isArray(data)) {\n    console.error('JSON file must contain an array');\n    process.exit(1);\n  }\n  const filtered = filterJson(data, filter);\n  console.log(JSON.stringify(filtered, null, 2));\n} catch (err) {\n  console.error('Error:', err.message);\n  process.exit(1);\n}\n\nexport { filterJson };`;
}

function generateTypeScriptTest(): string {
    const cp = 'child_process';
    const ex = 'execSync';
    return `// Test for CLI filter tool\nconst { ${ex} } = require('${cp}');\nconst fs = require('fs');\nconst path = require('path');\n\nconst testFile = path.join(__dirname, 'sample.json');\nconst testData = [\n  { name: 'Alice', age: 30, city: 'NYC' },\n  { name: 'Bob', age: 25, city: 'LA' },\n  { name: 'Charlie', age: 35, city: 'NYC' }\n];\nfs.writeFileSync(testFile, JSON.stringify(testData, null, 2));\n\nconst output = ${ex}('node dist/index.js sample.json city=NYC', { encoding: 'utf-8' });\nconst result = JSON.parse(output.trim());\nif (result.length !== 2) throw new Error('Expected 2 results');\nif (result[0].name !== 'Alice') throw new Error('Expected Alice');\nif (result[1].name !== 'Charlie') throw new Error('Expected Charlie');\nconsole.log('Test passed!');`;
}

/** The stock program's own test, as a standard-library unittest case run against its entry. */
function generatePythonTest(entry = 'main.py', isCsv = false): string {
    const head = `import json\nimport os\nimport subprocess\nimport sys\nimport unittest\n\nHERE = os.path.dirname(os.path.abspath(__file__))\nENTRY = os.path.join(HERE, ${JSON.stringify(entry)})\n\n\n`;
    const body = isCsv
        ? `class CsvToJsonTest(unittest.TestCase):\n    def test_converts_every_row(self):\n        sample = os.path.join(HERE, 'sample.csv')\n        with open(sample, 'w', encoding='utf-8', newline='') as f:\n            f.write('name,city\\nAlice,NYC\\nBob,LA\\n')\n        result = subprocess.run([sys.executable, ENTRY, sample], capture_output=True, text=True)\n        self.assertEqual(result.returncode, 0, result.stderr)\n        self.assertEqual(json.loads(result.stdout), [{'name': 'Alice', 'city': 'NYC'}, {'name': 'Bob', 'city': 'LA'}])\n`
        : `class FilterToolTest(unittest.TestCase):\n    def test_filters_by_property(self):\n        sample = os.path.join(HERE, 'sample.json')\n        with open(sample, 'w', encoding='utf-8') as f:\n            json.dump([{"name": "Alice", "age": 30, "city": "NYC"}, {"name": "Bob", "age": 25, "city": "LA"}, {"name": "Charlie", "age": 35, "city": "NYC"}], f, indent=2)\n        result = subprocess.run([sys.executable, ENTRY, sample, 'city=NYC'], capture_output=True, text=True)\n        self.assertEqual(result.returncode, 0, result.stderr)\n        self.assertEqual([item['name'] for item in json.loads(result.stdout)], ['Alice', 'Charlie'])\n`;
    return `${head}${body}\n\nif __name__ == '__main__':\n    unittest.main()\n`;
}

/**
 * How a Python program's tests run. Tests Joe authors are standard-library
 * unittest cases, run by the standard library on every machine. Tests the
 * model planned may be pytest-style: pytest runs them where it is installed,
 * and unittest is the fallback — so the command never needs a package the
 * machine may not have, and an empty run still fails (Python ≥ 3.12 exits 5).
 */
export function pythonTestCommand(files: string[], authoredByJoe: boolean): string {
    const list = files.join(' ');
    if (authoredByJoe) return `python -m unittest -v ${list}`;
    return `python -c "import importlib.util,subprocess,sys;m=['pytest','-v'] if importlib.util.find_spec('pytest') else ['unittest','-v'];sys.exit(subprocess.call([sys.executable,'-m',*m,*sys.argv[1:]]))" ${list}`;
}

function generateBashTest(): string {
    return `#!/bin/bash\n# Test for CLI filter tool\n\nTEST_FILE="sample.json"\nTEST_DATA='[\n  {"name": "Alice", "age": 30, "city": "NYC"},\n  {"name": "Bob", "age": 25, "city": "LA"},\n  {"name": "Charlie", "age": 35, "city": "NYC"}\n]'\necho "$TEST_DATA" > "$TEST_FILE"\n\nOUTPUT=$(bash main.sh "$TEST_FILE" 'city=NYC')\nRESULT_COUNT=$(echo "$OUTPUT" | jq length)\nif [ "$RESULT_COUNT" -ne 2 ]; then\n    echo "Expected 2 results, got $RESULT_COUNT"\n    exit 1\nfi\n\nNAME_0=$(echo "$OUTPUT" | jq -r '.[0].name')\nif [ "$NAME_0" != "Alice" ]; then\n    echo "Expected Alice, got $NAME_0"\n    exit 1\nfi\n\nNAME_1=$(echo "$OUTPUT" | jq -r '.[1].name')\nif [ "$NAME_1" != "Charlie" ]; then\n    echo "Expected Charlie, got $NAME_1"\n    exit 1\nfi\n\necho "Test passed!"`;
}

function generateGoTest(): string {
    return `package main\n\nimport (\n\t"encoding/json"\n\t"os"\n\t"testing"\n)\n\nfunc TestCLIFilter(t *testing.T) {\n\ttestData := []map[string]interface{}{\n\t\t{"name": "Alice", "age": 30, "city": "NYC"},\n\t\t{"name": "Bob", "age": 25, "city": "LA"},\n\t\t{"name": "Charlie", "age": 35, "city": "NYC"},\n\t}\n\n\ttestFile := "sample.json"\n\tdata, _ := json.MarshalIndent(testData, "", "  ")\n\tos.WriteFile(testFile, data, 0644)\n\n\toutput, _ := exec.Command("go", "run", "main.go", "sample.json", "city=NYC").Output()\n\tvar result []map[string]interface{}\n\tjson.Unmarshal(output, &result)\n\n\tif len(result) != 2 {\n\t\tt.Fatalf("Expected 2 results, got %d", len(result))\n\t}\n\tif result[0]["name"] != "Alice" {\n\t\tt.Fatalf("Expected Alice, got %v", result[0]["name"])\n\t}\n\tif result[1]["name"] != "Charlie" {\n\t\tt.Fatalf("Expected Charlie, got %v", result[1]["name"])\n\t}\n}\n`;
}

function generateRustTest(): string {
    return `#[cfg(test)]\nmod tests {\n    use std::process::Command;\n    \n    #[test]\n    fn test_cli_filter() {\n        let test_data = r#"[\n  {"name": "Alice", "age": 30, "city": "NYC"},\n  {"name": "Bob", "age": 25, "city": "LA"},\n  {"name": "Charlie", "age": 35, "city": "NYC"}\n]"#;\n    \n    std::fs::write("sample.json", test_data).unwrap();\n    \n    let output = Command::new("cargo")\n        .args(["run", "--", "sample.json", "city=NYC"])\n        .output()\n        .expect("Failed to execute command");\n    \n    let output = String::from_utf8_lossy(&output.stdout);\n    let result: Vec<serde_json::Value> = serde_json::from_str(&output).unwrap();\n    \n    assert_eq!(result.len(), 2);\n    assert_eq!(result[0]["name"], "Alice");\n    assert_eq!(result[1]["name"], "Charlie");\n}\n}`;
}

function generateJavaScriptTest(): string {
    const cp = 'child_process';
    const ex = 'execSync';
    return `const { ${ex} } = require('${cp}');\nconst fs = require('fs');\nconst path = require('path');\n\nconst testFile = path.join(__dirname, 'sample.json');\nconst testData = [\n  { name: 'Alice', age: 30, city: 'NYC' },\n  { name: 'Bob', age: 25, city: 'LA' },\n  { name: 'Charlie', age: 35, city: 'NYC' }\n];\nfs.writeFileSync(testFile, JSON.stringify(testData, null, 2));\n\nconst output = ${ex}('node index.js sample.json city=NYC', { encoding: 'utf-8' });\nconst result = JSON.parse(output.trim());\nif (result.length !== 2) throw new Error('Expected 2 results');\nif (result[0].name !== 'Alice') throw new Error('Expected Alice');\nif (result[1].name !== 'Charlie') throw new Error('Expected Charlie');\nconsole.log('Test passed!');`;
}

function generateSampleData(): string {
    return `[\n  { "name": "Alice", "age": 30, "city": "NYC" },\n  { "name": "Bob", "age": 25, "city": "LA" },\n  { "name": "Charlie", "age": 35, "city": "NYC" }\n]`;
}

/**
 * ⛔ ONE ANSWER TO «IS THIS A COMMAND-LINE PROGRAM?» — for the router and for
 * the delivery gate alike.
 *
 * Eval round 19: deterministicPhasesFor built a CLI scaffold for «a Python CLI
 * that reads invoices», «a bash script that backs up my PostgreSQL database»
 * and P347 «… لـموقع أخبار», while requestedDeliveryRoles judged the same
 * requests as a server (a claim noun) or an interface (a domain noun) — so a
 * correct CLI could never be delivered. Both now ask this predicate: the
 * object of the verb when the lexicon knows it, otherwise the command-line /
 * CSV-input fallback for a request classified as file-level.
 */
export function routesToCliScaffold(request: string, artifact = requestedArtifact(request)): boolean {
    if (artifact.kind === 'cli') return true;
    if (artifact.kind) return false;
    const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
    return PlanningEngine.classifyBuildScope(request) === 'page' && isCliRequestFn(request);
}

export function deterministicPhasesFor(request: string): {
    projectName: string; reason: string; phases: Array<{ phaseNumber: number; name: string; tasks: any[] }>;
} | null {
    const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
    if (!PlanningEngine.looksLikeBuild(request)) return null;
    const classifiedScope: 'page' | 'app' | 'system' = PlanningEngine.classifyBuildScope(request);
    const artifact = requestedArtifact(request);
    // A declared record schema is an interaction contract, even when its
    // wording does not happen to include one of the broad "application"
    // keywords.  Treating it as a page discarded the form, storage, and record
    // actions that the same schema reader later builds in React.  Do not
    // downgrade a real system: its explicit service boundary remains stronger.
    // A presentation page (landing, portfolio, «هبوط», «تعريفي») is a document:
    // its feature list is not a schema (eval round 15: 25/25 English landings
    // went to react_project, 25/25 Arabic ones to the page builder).
    const scope: 'page' | 'app' | 'system' = classifiedScope === 'page' && hasExplicitRecordSchema(request) && !artifact.evidence.presentation
        ? 'app'
        : classifiedScope;

    let projectName = 'project';
    try { projectName = resolveProjectIdentity(request, require('../../../core/design/subject-phrase').subjectPhrase(request, 48)); } catch { /* naming is cosmetic */ }

    /**
     * ⛔ WHAT HE SAID THE SYSTEM IS MADE OF IS PART OF THE REQUEST (law 4).
     *
     * Eval round 15 (2026-10-24): «React frontend, Node backend … each staff
     * member only sees their own records» (P151) scored as an app and was
     * rescued into ONE frontend phase — the declared backend, and the
     * per-user ownership that needs it, silently dropped. «أنشئ واجهة برمجية
     * REST …» (P101) asked for an API and got an unrequested React interface
     * beside it. A declared backend makes it a system; an API with no
     * interface for people gets no interface phase.
     */
    const apiOnly = buildObjectIsAnApi(request);
    const effectiveScope: 'page' | 'app' | 'system' = scope === 'app' && artifact.needsServer ? 'system' : scope;

    // A command-line tool is a file-level project whatever data it reads or
    // server it talks to — decided BEFORE the system branch, from the object of
    // the verb (eval round 15: P333/P337, Arabic CLIs over «الزبائن» and
    // «الحجوزات», became api_project + react_project). An object the lexicon
    // does not know keeps the old command-line / CSV-input fallback for a page.
    if (routesToCliScaffold(request, artifact)) {
        return buildCliScaffold(request, projectName);
    }

    if (effectiveScope === 'system') {
        // The interface depends on the service that holds the rows — declared
        // as an ordered pair of phases, so the dependency is enforced by the
        // plan rather than left to whoever executes it.
        const service = { phaseNumber: 1, name: 'Data service and schema', tasks: [{ tool: 'api_project', description: `Backend and database for: ${request}`, args: { request } }] };
        if (apiOnly) {
            return {
                projectName,
                reason: 'an API was asked for and no interface for people, so none is built',
                phases: [service],
            };
        }
        return {
            projectName,
            reason: scope === 'system'
                ? 'declared entities require their own data service, and the interface depends on it'
                : 'the request declares its own backend, and the interface depends on it',
            phases: [
                service,
                { phaseNumber: 2, name: 'Interface on the service', tasks: [{ tool: 'react_project', description: `Interface for: ${request}`, args: { request } }] },
            ],
        };
    }

    return {
        projectName,
        reason: scope === 'page' ? 'a single page was asked for; no data service is implied' : 'an application was asked for with no declared data service',
        phases: [{
            phaseNumber: 1,
            name: scope === 'page' ? 'Page' : 'Application',
            tasks: [{ tool: scope === 'page' ? 'web_page_builder' : 'react_project', description: request, args: { request } }],
        }],
    };
}

/**
 * An existing project with an explicit mutation has a known execution shape
 * even when the planning provider is unavailable. This is deliberately not a
 * product template: the edit tool still reads the selected files, produces a
 * constrained diff, runs its syntax/build gates, and the pipeline continues
 * into its normal runtime and browser verification gates.
 */
export function deterministicExistingEditPhasesFor(request: string, dir: string): {
    projectName: string; reason: string; phases: Array<{ name: string; tasks: any[] }>;
} | null {
    const text = String(request || '').trim();
    const root = String(dir || '').trim();
    if (!text || !root || !PlanningEngineLooksLikeMutation(text)) return null;
    return {
        projectName: path.basename(root) || 'existing project',
        reason: 'the request names an existing project and an explicit change; the evidence-selected editor owns the diff',
        phases: [{
            name: 'Evidence-bound project edit',
            tasks: [{ tool: 'project_edit', description: text, args: { request: text, dir: root } }],
        }],
    };
}

function PlanningEngineLooksLikeMutation(request: string): boolean {
    return /\b(?:add|change|modify|update|edit|remove|delete|implement|repair|fix)\b|أضف|غيّر|غير|عدّل|عدل|تعديل|حذف|إزالة|ازالة|أصلح|اصلح|إصلاح|اصلاح|صلّح|صلح|عالج/iu.test(String(request || ''));
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
    const referenceProjects = (evidence?.constraints?.createsNewProject === true || evidence?.mode === 'greenfield')
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
        // Read from the artifact reader in both languages: an English-only
        // word list sent «ابني متجر إلكتروني …» (P201) past this rescue while
        // its English twin was caught (eval round 19).
        const artifact = requestedArtifact(text);
        return artifact.interfaceNamed
            || ['app', 'store', 'booking', 'game'].includes(String(artifact.kind))
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
    // «React frontend, Node backend» asked for that backend (eval round 15, P151).
    if (requestDeclaresOwnBackend(request)) return false;
    try {
        const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
        return PlanningEngine.classifyBuildScope(String(request || '')) === 'app'
            && planContainsTool(phases, 'api_project');
    } catch {
        return false;
    }
}

const NEGATED_INTERFACE = /\b(?:no|without|not)\s+(?:(?:a|an|any)\s+)?(?:(?:web|user|graphical)\s+)?(?:front[- ]?end|ui|gui|user\s+interface|interface|pages?|screens?|dashboard)\b|(?:بدون|دون|بلا|من\s+غير)\s+(?:أي\s+)?(?:واجهة(?:\s+(?:مستخدم|المستخدم|أمامية|امامية|رسومية))?|صفحات|شاشات)/giu;
/**
 * Does the request ask for something people look at — an interface, pages, a
 * dashboard? Read by the artifact reader: the deliverable itself, or an
 * interface named beside it. A keyword anywhere made «… لـموقع أخبار» (P147)
 * an API WITH an unrequested React interface, and «… pages from a website» a
 * CLI with an interface (eval round 19).
 */
export function requestNamesAnInterface(request: string): boolean {
    return requestedArtifact(String(request || '')).interfaceNamed;
}

/**
 * The object of the build verb is an API — and nothing in the request is an
 * interface for people. The API head is authoritative: «a GitHub API
 * dashboard», «a REST API client app» and «an API testing tool» are things
 * ABOUT an API, and get their interface (eval round 15 review).
 */
export function buildObjectIsAnApi(request: string): boolean {
    const artifact = requestedArtifact(String(request || ''));
    return artifact.kind === 'api' && !artifact.interfaceNamed;
}

/**
 * The request claims something only a server keeps: a declared backend, sign-in,
 * accounts, roles, a database, data one party writes and another reads, or an
 * owned API — read by requestedArtifact, negations masked.
 */
export function requestDeclaresOwnBackend(request: string): boolean {
    return requestedArtifact(String(request || '')).needsServer;
}

/**
 * A greenfield application that claims its own server, which
 * deterministicPhasesFor builds as api_project + react_project. Eval round 20:
 * P251 «… the owner sees all bookings» went to a browser-only plan, and the
 * full-stack prompts to a 40–70 minute local model plan, while the builders
 * that cover them were one branch away.
 */
export function serverClaimingApplication(request: string): boolean {
    const artifact = requestedArtifact(String(request || ''));
    return artifact.needsServer
        && ['app', 'booking', 'store', 'system'].includes(String(artifact.kind))
        && deterministicRescueAllowed(request);
}

const SERVER_SOURCE = /(?:^|\/)(?:server|backend|api)(?:\/|\.(?:[cm]?[jt]s|py)$)|(?:^|\/)(?:routes?|controllers?|endpoints)\/|(?:^|\/)(?:manage|wsgi|asgi)\.py$/i;
const SERVER_FRAMEWORK = /["'](?:express|fastify|koa|hono|@nestjs\/core|@hapi\/hapi|restify)["']\s*:|\b(?:npm|pnpm|yarn)\s+(?:install|i|add)\b[^\n]*\b(?:express|fastify|koa|hono|@nestjs\/core)\b|\b(?:pip|pip3)\s+install\b[^\n]*\b(?:flask|fastapi|django)\b|^\s*(?:flask|fastapi|django)\b/im;

/** Does this plan build a server: a service builder, server source, or a server framework it installs? */
export function planBuildsAServer(request: string, phases: any[]): boolean {
    const list = Array.isArray(phases) ? phases : [];
    if (planContainsTool(list, 'api_project') || planContainsTool(list, 'scaffold_full_stack')) return true;
    const tasks = list.flatMap((phase: any) => [...(Array.isArray(phase?.tasks) ? phase.tasks : []), ...(phase?.verificationTask ? [phase.verificationTask] : [])]);
    const structured = tasks.flatMap((task: any) => {
        const structure = task?.args?.structure && typeof task.args.structure === 'object' ? task.args.structure : {};
        return Object.keys(structure).map(key => key.replace(/\\/g, '/'));
    });
    const paths = [...plannedFilePaths(list), ...structured];
    if (paths.some(file => SERVER_SOURCE.test(file))) return true;
    const texts = tasks.flatMap((task: any) => {
        const args = task?.args || {};
        const structure = args.structure && typeof args.structure === 'object' ? Object.values(args.structure) : [];
        return [args.content, args.command, ...structure].filter(value => typeof value === 'string') as string[];
    });
    if (texts.some(text => SERVER_FRAMEWORK.test(text))) return true;
    // The deliverable IS the service: its own source is the server.
    return requestedArtifact(String(request || '')).kind === 'api' && paths.some(file => /\.(?:[cm]?[jt]s|py|go|rb|php)$/i.test(file));
}

/**
 * The plan with the service its request claims, or null when it builds one
 * already (or claims none). Never delivered browser-only: «… the owner sees
 * all bookings» kept in each customer's browser is a front end with nowhere
 * to put a row. The model's phases are kept; the service phase comes first
 * because the interface depends on it.
 */
export function planWithRequestedService(request: string, phases: any[]): any[] | null {
    const text = String(request || '');
    const artifact = requestedArtifact(text);
    if (!artifact.needsServer || routesToCliScaffold(text, artifact)) return null;
    if (!Array.isArray(phases) || phases.length === 0 || planBuildsAServer(text, phases)) return null;
    const service = {
        phaseNumber: 1,
        name: 'Data service and schema',
        description: `The request claims its own server (${artifact.evidence.serverClaims.slice(0, 3).join('; ')}): build the data service the interface depends on.`,
        tasks: [{ tool: 'api_project', description: `Backend and database for: ${text}`, args: { request: text } }],
    };
    return [service, ...phases.map((phase: any, index: number) => ({ ...phase, phaseNumber: index + 2 }))];
}

const PLANNED_SOURCE_WRITERS = new Set(['ai_write_file', 'write_file', 'file_write', 'create_file']);
const PLANNED_TEST_FILE = /(?:^|\/)(?:__tests__|tests?|spec)\/|(?:^|\/)test_[^/]+\.py$|(?:^|\/)[^/]+_test\.py$|\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const WEB_ARTIFACT_FILE = /\.(?:html?|jsx|tsx|vue|svelte|css|scss|sass|less)$/i;
const RUNNABLE_SOURCE: Array<{ ext: RegExp; lang: keyof typeof CLI_RUNNER }> = [
    { ext: /\.py$/i, lang: 'python' },
    { ext: /\.(?:mjs|cjs|js)$/i, lang: 'javascript' },
    { ext: /\.sh$/i, lang: 'bash' },
];

function plannedFilePaths(phases: any[]): string[] {
    return (Array.isArray(phases) ? phases : [])
        .flatMap((phase: any) => Array.isArray(phase?.tasks) ? phase.tasks : [])
        .filter((task: any) => PLANNED_SOURCE_WRITERS.has(String(task?.tool || '').toLowerCase()))
        .map((task: any) => String(task?.args?.path || task?.args?.filePath || task?.input?.path || '').replace(/\\/g, '/').replace(/^\.\//, '').trim())
        .filter(Boolean);
}

function commonDirectory(files: string[]): string {
    const dirs = files.map(file => path.posix.dirname(file).split('/').filter(segment => segment && segment !== '.'));
    const first = dirs[0] || [];
    let depth = 0;
    while (depth < first.length && dirs.every(segments => segments[depth] === first[depth])) depth++;
    return first.slice(0, depth).join('/') || '.';
}

/** The test brief both CLI paths hand the file author: its own fixture, the exact output. */
function cliTestBrief(entry: string, runCommand: string, request: string, lang = ''): string {
    const runner = lang === 'python'
        ? 'Write it as a standard-library unittest.TestCase class with test_ methods (no pytest), runnable as `python -m unittest -v <this file>`; run the program with sys.executable through subprocess. '
        : lang === 'javascript' || lang === 'typescript'
            ? 'Write it with node:test and node:assert, runnable by `node --test`. '
            : lang === 'bash'
                ? 'Write it as a bash script that exits non-zero on the first failed check. '
                : '';
    return `A small self-contained test for the program in ${entry} (${request}). `
        + `Create its own input fixture, run \`${runCommand}\` on it, and assert the exact output the request implies. `
        + runner
        + 'Use only the standard library of the language; no placeholder assertions.';
}

/**
 * The phase that makes a paper plan runnable with the plan's own files, or
 * null when the plan has nothing that can run: a package manifest (install,
 * then its own tests), or a program in a language the CLI path already runs
 * (an entry, a test authored with its own fixture when the plan wrote none,
 * and the same runner manifest the CLI scaffold ships).
 */
function paperPlanRunPhase(request: string, files: string[], tests: string[]): { phase: any; projectDir: string } | null {
    const manifest = files.filter(file => /(?:^|\/)package\.json$/i.test(file)).sort((a, b) => a.length - b.length)[0];
    if (manifest) {
        const projectDir = path.posix.dirname(manifest);
        return {
            projectDir,
            phase: {
                name: 'Install, test and run',
                description: 'Install what the plan\'s own package.json declares and run its own tests; the pipeline then starts it live.',
                tasks: [{ task: 'Install the declared dependencies', tool: 'npm_manager', args: { command: 'install', cwd: projectDir } }],
                ...(tests.length ? { verificationTask: { task: 'Run the project\'s own tests', tool: 'quality_run', args: { path: projectDir, tasks: ['test'] } } } : {}),
            },
        };
    }
    const sources = files.filter(file => !PLANNED_TEST_FILE.test(file));
    const lang = RUNNABLE_SOURCE.find(kind => sources.some(file => kind.ext.test(file)))?.lang;
    if (!lang) return null;
    const runner = CLI_RUNNER[lang];
    const ext = RUNNABLE_SOURCE.find(kind => kind.lang === lang)!.ext;
    const programs = sources.filter(file => ext.test(file));
    const named = programs
        .filter(file => /^(?:main|cli|__main__|app|index|run)\.[a-z]+$/i.test(path.posix.basename(file)))
        .sort((a, b) => a.split('/').length - b.split('/').length)[0];
    const entryFile = named || (programs.length === 1 ? programs[0] : '');
    if (!entryFile) return null;
    const projectDir = commonDirectory(files);
    const within = (file: string) => projectDir === '.' ? file : path.posix.relative(projectDir, file);
    const entry = within(entryFile);
    const runCommand = `${runner} ${entry}`;
    const tasks: any[] = [];
    let testFiles = tests.filter(file => ext.test(file)).map(within);
    const authoredByJoe = !testFiles.length;
    if (authoredByJoe) {
        const authored = lang === 'python' ? `test_${path.posix.basename(entry, '.py')}.py` : lang === 'bash' ? 'test.sh' : 'test.js';
        testFiles = [authored];
        tasks.push({
            task: `Write ${authored} for the requested behaviour`,
            tool: 'ai_write_file',
            args: { path: projectDir === '.' ? authored : `${projectDir}/${authored}`, description: cliTestBrief(entry, runCommand, request, lang) },
        });
    }
    const testCommand = lang === 'python' ? pythonTestCommand(testFiles, authoredByJoe)
        : lang === 'bash' ? testFiles.map(file => `bash ${file}`).join(' && ')
            : `node --test ${testFiles.join(' ')}`;
    const name = (projectDir === '.' ? 'program' : path.posix.basename(projectDir)).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'program';
    tasks.push({
        task: 'Declare how the program starts and how its tests run',
        tool: 'write_file',
        args: {
            path: projectDir === '.' ? 'package.json' : `${projectDir}/package.json`,
            content: JSON.stringify({ name, version: '1.0.0', private: true, description: request.replace(/\s+/g, ' ').trim().slice(0, 300), main: entry, scripts: { start: runCommand, test: testCommand } }, null, 2),
        },
    });
    return {
        projectDir,
        phase: {
            name: 'Run and verify the program',
            description: `Run the program the plan wrote (${runCommand}) through its own tests.`,
            tasks,
            verificationTask: { task: 'Run the program\'s tests', tool: 'quality_run', args: { path: projectDir, tasks: ['test'] } },
        },
    };
}

/**
 * ⛔ A PLAN THAT READ THE REQUEST IS COMPLETED, NOT REPLACED (law 4).
 *
 * The paper-plan rescue swapped a model plan for the deterministic chain
 * whenever the plan wrote files but ran nothing. Eval round 15 measured what
 * that costs when the chain does not build what was asked:
 *   - P101 «واجهة برمجية REST … المرضى والمواعيد والعلاجات … واختبارات آلية»:
 *     the model planned patients/appointments/treatments routes and their
 *     tests; the rescue built the stock bookings API — no requested entity,
 *     no test — and it was scored a pass;
 *   - P301 «أداة سطر أوامر بلغة Python»: the model planned the Python files;
 *     the rescue built a ten-section landing page.
 * So before a substitution: when the plan's artifact is a program and the
 * rescue would build a web page, when the stock engine does not cover what
 * the request names, or when the plan writes its own tests, the plan is kept
 * and completed with the steps that make it run. Null means the substitution
 * stands (the chain covers the request, or the plan has nothing to run).
 */
export function completePaperPlan(request: string, phases: any[], rescue: { phases: any[] } | null): { phases: any[]; reasons: string[]; projectDir: string } | null {
    const files = plannedFilePaths(phases);
    if (!files.length) return null;
    const rescueTools = (rescue?.phases || []).flatMap((phase: any) => (phase?.tasks || []).map((task: any) => String(task?.tool || '')));
    const tests = files.filter(file => PLANNED_TEST_FILE.test(file));
    const reasons: string[] = [];
    const webRescue = rescueTools.some(tool => tool === 'web_page_builder' || tool === 'react_project');
    if (!files.some(file => WEB_ARTIFACT_FILE.test(file)) && !requestNamesAnInterface(request)) {
        reasons.push(webRescue || !rescue
            ? 'the plan builds a program, and the deterministic chain would build a different kind of artifact'
            : 'the plan already holds the program\'s own files, which the deterministic chain would re-author from nothing');
    }
    if (rescueTools.some(tool => tool === 'api_project' || tool === 'react_project' || tool === 'web_page_builder')) {
        let gaps: string[] = [];
        try { gaps = require('../../../core/design/app-blueprints').stockEngineGaps(request, rescueTools.includes('api_project')); } catch { gaps = []; }
        if (gaps.length) reasons.push(`the stock engine does not cover: ${gaps.slice(0, 6).join(' · ')}`);
    }
    if (tests.length) reasons.push(`the plan writes its own tests (${tests.slice(0, 3).join(', ')})`);
    if (!reasons.length) return null;
    const run = paperPlanRunPhase(request, files, tests);
    if (!run) return null;
    return {
        reasons,
        projectDir: run.projectDir,
        phases: [...phases, { phaseNumber: phases.length + 1, ...run.phase }],
    };
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

/**
 * After a repair, an ADOPTED server is not proof: project_run answers
 * «already running» for the recorded process, which still holds the
 * pre-repair code (round 15 review). Post-repair runs ask for a restart; an
 * answer that adopted anyway is a live-run failure, never a pass.
 */
export function postRepairRunOutcome(runResult: any): any {
    const output = runResult?.output || {};
    if (runResult?.ok === true && (output.adopted === true || output.kind === 'already-running')) {
        return {
            ...runResult,
            ok: false,
            error: 'the post-repair run adopted the pre-repair server instead of restarting it, so the repair was never measured',
        };
    }
    return runResult;
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

/**
 * THE FOLDER A PART SERVES TO PEOPLE, or ''.
 *
 * Round 20 review: only index.html, dist/ and public/ counted, so a build-free
 * site Joe writes into src/ (P001: src/index.html, served by project_run's
 * strict loopback server from src/) was «no interface» — and blocked while it
 * was live on screen. src/index.html and the static-site classifier the
 * loopback server itself uses now count too.
 */
export function servedInterfaceDirectory(root: string): string {
    const dir = String(root || '').trim();
    if (!dir) return '';
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
    if (fs.existsSync(path.join(dir, 'dist', 'index.html'))) return path.join(dir, 'dist');
    if (fs.existsSync(path.join(dir, 'public', 'index.html'))) return path.join(dir, 'public');
    if (fs.existsSync(path.join(dir, 'src', 'index.html'))) return path.join(dir, 'src');
    try { return staticSiteRoot(dir, { servedAtRoot: true }) || ''; } catch { return ''; }
}

export function projectAuditDirectory(roots: string[]): string {
    for (const root of roots.map(value => String(value || '').trim()).filter(Boolean)) {
        const served = servedInterfaceDirectory(root);
        if (served) return served;
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
/** A build step this part really has: a bundler/framework config, or TypeScript it compiles. */
function rootHasBuildStep(root: string, manifest: any): boolean {
    const configs = /^(?:vite|webpack|next|nuxt|svelte|astro|rollup|remix|vue)\.config\.[cm]?[jt]s$|^angular\.json$/iu;
    let names: string[] = [];
    try { names = fs.readdirSync(root); } catch { return false; }
    if (names.some(name => configs.test(name))) return true;
    const deps = { ...(manifest?.dependencies || {}), ...(manifest?.devDependencies || {}) };
    return names.includes('tsconfig.json') && Object.prototype.hasOwnProperty.call(deps, 'typescript');
}

/** The request names a build as a step to run — never the imperative «Build …» or the noun in «بناء نظام». */
const BUILD_COMMAND_NAMED = /\bnpm\s+run\s+build\b|\brun\s+(?:the\s+)?build\b|\bbuild\s+(?:step|script|command)\b|\bcompil(?:e|es|ing|ation)\b|خطوة\s+(?:ال)?بناء|سكربت\s+(?:ال)?بناء|أمر\s+(?:ال)?بناء/iu;

/**
 * ONE CONTRACT FOR EVERY DELIVERED ROOT — THE PRIMARY ONE INCLUDED.
 *
 * Round 20 review: the primary root kept a reader (asksForChecks) that matched
 * every imperative «Build …», every «بناء» and every «tests», and then demanded
 * BOTH a build and a test script. With one verdict that no later instrument can
 * clear, that blocked every English «Build …» app whose manifest has no test
 * script, and every API-only delivery (a plain Node server has no build step) —
 * pushing a repair toward a fake «build» script. The rule now reads what the
 * request asks of the part: a test script when the request asks for tests
 * (testsRequestedIn — the same reader the record gate uses), a build script when
 * the part really has a build step or the request names the build command.
 * Placeholder scripts («exit 0», «true», «echo no tests») are refused on every
 * root, always. `additionalRoot` only changes the wording.
 */
export function inspectProjectQualityContract(
    projectRoot: string,
    request = '',
    opts: { additionalRoot?: boolean; testsRequested?: boolean } = {},
): ProjectQualityContract {
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
    const has = (name: string) => typeof scripts[name] === 'string' && scripts[name].trim().length > 0;
    const testsAsked = typeof opts.testsRequested === 'boolean' ? opts.testsRequested : !!testsRequestedIn(String(request || ''));
    const where = opts.additionalRoot ? 'this part' : 'the project';
    if (testsAsked && !has('test')) {
        failures.push(`package.json has no truthful test script although the request asks for tests (${where})`);
    }
    const buildNamed = BUILD_COMMAND_NAMED.test(String(request || ''));
    if ((rootHasBuildStep(root, manifest) || buildNamed) && !has('build')) {
        failures.push(buildNamed
            ? `package.json has no truthful build script although the request names the build (${where})`
            : `package.json has no truthful build script although ${where} has a build step`);
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

/**
 * The steps that BUILD or RUN the artifact a plan is for. A plan with none of
 * them is «all paper» and gets the deterministic rescue.
 *
 * Not the registry's sideEffects 'execute': that set also holds browser_run,
 * dead_code_detector and specification_verification, which execute something
 * without building or running the project, so a paper plan verified by a
 * browser step would escape the rescue. quality_run belongs here: it runs the
 * project's own build/test scripts, and the plan-recovery repair now emits it
 * for «npm test» / «npm run build» (round 15) — leaving it out judged a plan
 * that runs its own tests as paper and replaced it.
 */
export const PLAN_STEPS_THAT_BUILD_OR_RUN = new Set(['api_project', 'react_project', 'web_page_builder', 'scaffold_project',
    'scaffold_full_stack', 'shell_execute', 'npm_manager', 'project_run', 'project_edit', 'quality_run']);

/**
 * WHICH PARTS THE REQUEST ASKED FOR (round 15 review, C2).
 *
 * service: the request names an API as something to build or use as its
 * backend, its own backend/server, or an API «with» the app. interface:
 * asked for unless explicitly negated («without a UI») or the build's object
 * is an API and nothing for people is named — a CLI word never un-requests an
 * interface when a web word is present. program: a CLI/script with no web
 * word and no service. Roles decide which instruments must prove delivery;
 * they never relax a measured failure.
 */
export function requestedDeliveryRoles(request: string): { service: boolean; interface: boolean; program: boolean } {
    const text = String(request || '');
    const artifact = requestedArtifact(text);
    // What the router builds as a command-line program is proven as one, by
    // its own tests — whatever data it reads («invoices», «a PostgreSQL
    // database») or site it reads from (eval round 19). Only an interface
    // named beside it adds a second instrument.
    if (routesToCliScaffold(text, artifact)) return { service: false, interface: artifact.interfaceNamed, program: true };
    const apiWithApp = /\bwith\s+(?:an?\s+)?(?:[\w./+-]+\s+){0,2}api\b|(?:مع|و)\s*واجهة\s+(?:برمجية|برمجة|خلفية)/iu.test(text);
    // The API object and the server claims come from the one artifact reader
    // the router also uses: roles and routing can never disagree on them.
    const service = artifact.kind === 'api' || artifact.needsServer || apiWithApp;
    if (artifact.kind === 'api') return { service, interface: artifact.interfaceNamed, program: false };
    // «a web tool» is for people: a bare «web»/«browser» is a web word too.
    const webWord = artifact.interfaceNamed || /\b(?:web|browser)\b|(?:ويب|المتصفح|متصفح)/iu.test(text.replace(new RegExp(NEGATED_INTERFACE.source, 'giu'), ' '));
    const negatedInterface = new RegExp(NEGATED_INTERFACE.source, 'iu').test(text);
    return { service, interface: !(negatedInterface && !webWord), program: false };
}

/**
 * Does the confirmed live address serve a page at «/»? A server-rendered or
 * framework interface (Next.js, SvelteKit, Flask templates) has no index.html
 * on disk; the page it answers is the evidence. Loopback only (project_run's
 * own address), GET only, bounded by project_run's own answer timeout.
 */
export async function servesHtmlAtRoot(liveUrl: unknown): Promise<boolean> {
    const raw = String(liveUrl || '').trim();
    if (!raw) return false;
    let url: URL;
    try { url = new URL('/', raw); } catch { return false; }
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)) return false;
    let timeoutMs = 2500;
    try { timeoutMs = Number(require('./ProjectRunTool').HTTP_ANSWER_TIMEOUT_MS) || 2500; } catch { /* default */ }
    const http = require('http');
    return await new Promise<boolean>(resolve => {
        const req = http.get(url, { timeout: timeoutMs, headers: { Accept: 'text/html' } }, (res: any) => {
            const ok = Number(res.statusCode) >= 200 && Number(res.statusCode) < 300 && /text\/html/i.test(String(res.headers?.['content-type'] || ''));
            res.resume();
            resolve(ok);
        });
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

/**
 * A REQUEST THAT NEEDS A SERVER IS NOT DELIVERED BY A BROWSER-ONLY BUILD.
 *
 * Round 20 review (P251): «customers … book …, and the owner sees all bookings»
 * claims data one party writes and another reads — only a server keeps it. A
 * React-only plan built it in the browser: each customer's booking lived in
 * that customer's browser, the owner could never see one, and nothing at
 * delivery measured the missing server. Returns the failure naming the server
 * claims, or '' when no server was asked for, an api_project part was bound,
 * or a delivered root registers server routes.
 */
export function missingRequestedServer(request: string, roots: string[], parts: Array<{ tool?: string }>): string {
    if (!requestedDeliveryRoles(request).service) return '';
    if ((Array.isArray(parts) ? parts : []).some(part => String(part?.tool || '') === 'api_project')) return '';
    if (collectServerEvidence(roots, []).routes.length > 0) return '';
    let claims: string[] = [];
    try { claims = requestedArtifact(String(request || '')).evidence.serverClaims || []; } catch { claims = []; }
    return `the request needs a server (${claims.join(', ') || 'an API it serves'}), but no delivered part registers server routes`;
}

export function planTouchesRunnable(phases: unknown): boolean {
    return (Array.isArray(phases) ? phases : []).some((phase: any) =>
        [...(Array.isArray(phase?.tasks) ? phase.tasks : []),
         ...(phase?.verificationTask ? [phase.verificationTask] : [])]
            .some((t: any) => PLAN_STEPS_THAT_BUILD_OR_RUN.has(String(t?.tool || ''))));
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
        const scopedFinal = (output: any) => ({ ...(output && typeof output === 'object' ? output : {}), pipelineFinal: true });
        const planningScope = engineeringScope(context);
        if (hasEngineeringToken(context) && !planningScope) return { ok: false, error: 'engineering_scope_invalid', output: scopedFinal({ status: 'failed', reason: 'engineering_scope_invalid', executed: false }), logs: [] };
        if (planningScope) {
            if (input.request !== planningScope.request || input.path !== planningScope.root) return { ok: false, error: 'engineering_scope_mismatch', output: scopedFinal({ status: 'failed', reason: 'engineering_scope_mismatch', executed: false }), logs: [] };
            context?.onProgress?.('Inspecting the selected workspace through the guarded tools.');
            const discovery = await executeTool('engineering_discovery', { request: planningScope.request, path: planningScope.root }, context);
            if (!discovery.ok || !discovery.output?.evidence || !engineeringScope(context)) return { ok: false, error: 'engineering_discovery_failed', output: scopedFinal({ status: 'failed', reason: 'engineering_discovery_failed', executed: false, discoveryResult: discovery.output }), logs: discovery.logs || [] };
            const productRequest = planningScope.request, evidence = discovery.output.evidence;
            try { snapshotEngineeringChild('project_planner', { projectDescription: productRequest, evidence }, context); }
            catch { return { ok: false, error: 'engineering_evidence_untrusted', output: scopedFinal({ status: 'failed',
                reason: 'engineering_evidence_untrusted', executed: false }), logs: discovery.logs || [] }; }
            const logs: string[] = [...(discovery.logs || [])];
            const say = (message: string) => { appendBoundedPipelineLog(logs, message); context?.onProgress?.(message); };
            const isAr = isArabicReply({ language: context?.language, text: productRequest });
            const specification = await this.readRequestedSpecifications(productRequest, evidence, context, logs, say, isAr);
            if (specification.error || !engineeringScope(context)) return { ok: false, error: 'engineering_specification_failed',
                output: scopedFinal({ status: 'failed', reason: 'engineering_specification_failed', executed: false, message: specification.error || 'The scoped source read was cancelled.' }), logs };
            // Literal edits cannot be planned from filenames alone. Read every
            // admitted Node source/test completely through the same file gateway.
            const sourceNames = evidence.mode === 'existing_workspace' && evidence.selectedProject?.projectKinds?.includes('node')
                ? [...new Set<string>(['package.json', ...(evidence.selectedProject.sourceFiles || []), ...(evidence.selectedProject.testFiles || [])])] : [];
            if (!sourceNames.length || sourceNames.length > 7) return { ok: false, error: 'isolated_source_context_budget',
                output: scopedFinal({ status: 'failed', executed: false, reason: 'isolated_source_context_budget' }), logs };
            const codeSources: Array<{ path: string; content: string; lineCount: number }> = [];
            for (const relative of sourceNames) {
                if (!engineeringScope(context) || !/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/u.test(relative)
                    || relative.split('/').some(part => !part || part === '.' || part === '..')) return { ok: false, error: 'isolated_source_context_invalid', output: scopedFinal({ status: 'failed', executed: false }), logs };
                const reads: any[] = [];
                for (let snapshot = 0; snapshot < 2; snapshot++) {
                    const read = await executeTool('read_file', { path: path.join(planningScope.root, relative), startLine: 1, endLine: 10000 }, context);
                    if (!read.ok || typeof read.output?.content !== 'string' || read.output.truncated !== false
                        || !Number.isInteger(read.output.totalLines) || read.output.totalLines < 1 || read.output.totalLines > 10000
                        || read.output.content.split('\n').length !== read.output.totalLines
                        || !autonomousFileTextIsSafe(read.output.content)) return { ok: false, error: 'isolated_source_context_incomplete', output: scopedFinal({ status: 'failed', executed: false }), logs };
                    reads.push(read.output);
                }
                if (reads[0].content !== reads[1].content || reads[0].totalLines !== reads[1].totalLines) return { ok: false, error: 'isolated_source_context_changed', output: scopedFinal({ status: 'failed', executed: false }), logs };
                codeSources.push({ path: relative, content: reads[0].content, lineCount: reads[0].totalLines });
            }
            const fullContext = [specification.content, ...codeSources.map(source => `COMPLETE SOURCE: ${source.path}\n${source.content}`)].filter(Boolean).join('\n\n');
            const plannerEvidence = sealEngineeringEvidence(context, { ...evidence, sourceEvidence: { files: codeSources },
                requiredSpecification: { content: fullContext, sources: [...specification.sources, ...codeSources.map(source => ({ path: source.path, lineCount: source.lineCount }))] } });
            if (JSON.stringify(plannerEvidence, null, 2).length > DISCOVERY_EVIDENCE_MAX_CHARS)
                return { ok: false, error: 'specification_planner_budget_exceeded', output: scopedFinal({ status: 'failed',
                    reason: 'specification_planner_budget_exceeded', executed: false, message: 'Complete required-source evidence exceeds the bounded planner intake.' }), logs };
            context?.onProgress?.('Planning the requested project with the selected local model.');
            const plan = await executeTool('project_planner', { projectDescription: planningScope.request, evidence: plannerEvidence }, {
                // The scope's model is local by construction: a sized local plan, not a
                // fixed 120 s (eval round 5, 2026-10-23: [LocalDeadline] requested 119977 ms
                // for a plan sized at 48 min), still inside the scope's lifetime.
                ...context, engineeringPipeline: false, plannerTimeoutMs: Math.min(localPlanDeadlineMs(planningScope.request), Math.max(1, planningScope.expires - Date.now())),
            });
            if (!plan.ok || !Array.isArray(plan.output?.phases) || plan.output.phases.length === 0 || !engineeringScope(context)) return { ok: false, error: 'engineering_planning_failed', output: scopedFinal({ status: 'failed', reason: 'engineering_planning_failed', executed: false, evidence: discovery.output.evidence, plannerResult: plan.output }), logs: [...(discovery.logs || []), ...(plan.logs || [])] };
            try {
                const isolatedContext = issueEngineeringExecution(context, plannerEvidence, plan.output);
                const sealed = engineeringExecution(isolatedContext)!;
                const { AgentLoopService } = await import('../../services/AgentLoopService');
                const result = await AgentLoopService.runPlannedPhasesIfPresent({
                    sessionId: planningScope.sessionId, runId: planningScope.runId, userId: planningScope.userId,
                    workspaceId: planningScope.workspaceId, request: planningScope.request, modelConfig: context.modelConfig,
                    isCancelled: context.isCancelled, cancellation: context.cancellation, language: context.language,
                    onProgress: context.onProgress, isolatedEngineeringContext: isolatedContext,
                    plannerResult: { ok: true, output: { projectName: plan.output.projectName,
                        projectRoot: planningScope.root, createsNewProject: false, phases: sealed.phases, totalPhases: sealed.phases.length } },
                });
                return { ok: result.ok === true, ...(result.ok === true ? {} : { error: (result as any).error || 'isolated_execution_failed' }),
                    output: scopedFinal({ ...result, status: result.ok === true ? 'completed' : 'failed',
                        executed: true, verified: result.ok === true, evidence: discovery.output.evidence }), logs };
            } catch (error: any) {
                return { ok: false, error: error.message || 'isolated_plan_not_supported',
                    output: scopedFinal({ status: 'failed', executed: false, reason: error.message || 'isolated_plan_not_supported',
                        evidence: discovery.output.evidence, plannerResult: plan.output }), logs };
            }
        }
        const logs: string[] = [];
        const request = String(input?.request || '').trim();
        if (!request) return { ok: false, error: 'request is required', output: scopedFinal({ status: 'failed', executed: false, reason: 'request_required' }), logs };

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

        const projectPath = String(input?.path || '').trim();

        // A workspace overview is not an engineering task.  In particular, do
        // not run project discovery first: it can enumerate every project in a
        // large workspace before learning that no project needs to be selected.
        // Keep this bounded to a one-level listing and an optional README at
        // that exact root, with every read still travelling through ToolService.
        if (isWorkspaceOverviewRequest(productRequest)) {
            say(pick(isAr,
                '[pipeline] أقرأ جذر مساحة العمل وREADME دون اختيار مشروع أو تنفيذ تعديل',
                '[pipeline] Reading workspace root and README without selecting a project or executing a mutation'));
            const listing = await executeTool('inspect_directory', {
                path: projectPath || '.', depth: 1,
            }, context);
            if (!listing?.ok || listing?.output?.truncated === true) {
                const message = String(listing?.error || (listing?.output?.truncated ? 'directory_entry_limit' : 'The workspace root could not be read.'));
                return {
                    ok: false,
                    error: message,
                    output: {
                        projectName: 'read-only-workspace-overview', completedPhases: 0, totalPhases: 1,
                        verified: false, executionStatus: 'blocked', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                        pipelineFinal: true,
                        summary: pick(isAr, `## ⚠️ تعذر قراءة جذر مساحة العمل\n\n${message}`, `## ⚠️ Could not read the workspace root\n\n${message}`),
                    },
                    logs: boundedPipelineLogs(logs, listing?.logs),
                };
            }
            const tree = Array.isArray(listing?.output?.tree) ? listing.output.tree : [];
            const root = path.resolve(projectPath || workspaceService.getActiveRoot(context?.workspaceId));
            const rootReadme = tree.find((entry: any) => entry?.type === 'file' && /^readme(?:\.[a-z0-9_-]+)?$/i.test(String(entry?.name || '')));
            let readmeSummary = '';
            if (rootReadme?.name) {
                const readme = await executeTool('read_file', { path: path.join(root, rootReadme.name) }, context);
                if (!readme?.ok) {
                    const message = String(readme?.output?.reason || readme?.error || 'README could not be read.');
                    return { ok: false, error: message,
                        output: { status: 'failed', verified: false, executionStatus: 'blocked', verificationStatus: 'not_run',
                            deliveryStatus: 'blocked', pipelineFinal: true,
                            summary: pick(isAr, `تعذر إكمال قراءة README: ${message}`, `README inspection could not complete: ${message}`) },
                        logs: boundedPipelineLogs(logs, readme?.logs) };
                }
                readmeSummary = summarizeReadme(String(readme?.output?.content || ''));
                appendBoundedPipelineLogs(logs, readme?.logs);
            }
            const names = tree.map((entry: any) => `${entry?.type === 'directory' ? '[dir] ' : ''}${entry?.name || ''}`.trim()).filter(Boolean);
            const directoryCount = tree.filter((entry: any) => entry?.type === 'directory').length;
            const fileCount = tree.filter((entry: any) => entry?.type === 'file').length;
            const overview = {
                root,
                topLevelEntries: names,
                readme: rootReadme?.name || null,
                readmeSummary: readmeSummary || null,
            };
            logs.push(`workspace.overview.entries=${names.length} directories=${directoryCount} files=${fileCount}`);
            logs.push(`workspace.overview.top_level=${names.join(' | ').slice(0, MAX_PIPELINE_LOG_CHARS)}`);
            logs.push(`workspace.overview.readme=${rootReadme?.name || 'missing at workspace root'}`);
            // Names are part of the requested result, even when UI log filters
            // suppress structured discovery lines. Keep filenames literal.
            const entryListing = names.map((name: string) => `- ${name.replace(/([\\`*_\[\]<>])/g, '\\$1')}`).join('\n');
            const summary = pick(isAr,
                `## ✅ نظرة قراءة فقط على مساحة العمل\n\nقرأتُ جذر مساحة العمل **${root}** ووجدتُ **${names.length}** عنصرًا (${directoryCount} مجلدًا و${fileCount} ملفًا).\n\n**الملفات والمجلدات:**\n\n${entryListing || 'الجذر فارغ.'}\n\n**README:** ${rootReadme?.name || 'لا يوجد README في جذر مساحة العمل.'}${readmeSummary ? `\n\n**الخلاصة:**\n${readmeSummary}` : ''}\n\nلم أكتب أو أعدّل أو أشغّل أي شيء.`,
                `## ✅ Read-only workspace overview\n\nI inspected the workspace root **${root}** and found **${names.length}** top-level entries (${directoryCount} directories and ${fileCount} files).\n\n**Files and directories:**\n\n${entryListing || 'The root is empty.'}\n\n**README:** ${rootReadme?.name || 'No README exists at the workspace root.'}${readmeSummary ? `\n\n**Summary:**\n${readmeSummary}` : ''}\n\nNo files were written, modified, or executed.`);
            return {
                ok: true,
                output: {
                    status: 'completed',
                    projectName: 'read-only-workspace-overview', completedPhases: 1, totalPhases: 1,
                    verified: true, executionStatus: 'completed', verificationStatus: 'verified', deliveryStatus: 'delivered',
                    pipelineFinal: true, stopReason: 'read_only_request', overview, summary,
                },
                logs,
            };
        }

        // Discovery is mandatory before any engineering write. Product names and
        // business nouns are evidence only; they never select a named foundation.
        say(pick(isAr,
            '[pipeline] أستكشف مساحة العمل والمشروع والاختبارات قبل اختيار أي تنفيذ…',
            '[pipeline] Discovering the workspace, project, and declared checks before selecting implementation…'));
        // A fresh chat gets its own empty workspace id, but an explicit
        // continuation such as «آخر مشروع Science Museum» refers to the
        // user's persisted local project area. Bind only that explicit latest
        // project request to the default root; ordinary requests retain the
        // session-scoped root and its isolation boundary.
        const latestProjectRequest = /(?:آخر|اخر|last|latest)\s+(?:مشروع|project)/iu.test(productRequest);
        const persistedUserRoot = latestProjectRequest
            ? path.join(path.dirname(path.resolve(workspaceService.getActiveRoot())), 'my-workspace')
            : '';
        let discoveryPath = projectPath || persistedUserRoot;
        if (!projectPath && latestProjectRequest && discoveryPath) {
            const resolved = resolveRunnableProject(discoveryPath, productRequest);
            if (resolved.matched && resolved.cwd) discoveryPath = resolved.cwd;
        }
        const discoveryResult = await executeTool('engineering_discovery',
            discoveryPath ? { request: productRequest, path: discoveryPath } : { request: productRequest }, context);
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

        // Provider health is an execution prerequisite for model planning. An
        // existing, unambiguous edit has a narrower evidence-bound route below
        // that does not invent a plan when the planner gateway is down.
        // `mode` is the discovery verdict. A workspace root is always present
        // in local development and must not turn a declared greenfield request
        // into an existing-project edit that waits for an LLM plan.
        const isGreenfield = evidence?.constraints?.createsNewProject === true || evidence?.mode === 'greenfield';
        const discoveredProjectRoot = isGreenfield ? '' : String(evidence?.selectedProject?.root || '').trim();
        const deterministicExistingEdit = !isGreenfield
            ? deterministicExistingEditPhasesFor(productRequest, discoveredProjectRoot)
            : null;
        const { hasWorkflowApplicationContract } = require('../../../core/design/app-blueprints');
        const deterministicWorkflow = hasWorkflowApplicationContract(productRequest);
        // CLI/CSV requests are file-level projects, not web apps. They should
        // use the deterministic scaffold path even without an explicit schema.
        const isCliOrCsv = isCliRequestFn(productRequest);
        // A greenfield application that claims its own server is built by
        // api_project + react_project; the stock-coverage check below still
        // decides whether a model plans it instead (eval round 20, P251/P151).
        const claimsOwnServer = !hasExplicitRecordSchema(productRequest) && !deterministicWorkflow && !isCliOrCsv
            && serverClaimingApplication(productRequest);
        const stockPhases = isGreenfield
            && (hasExplicitRecordSchema(productRequest) || deterministicWorkflow || isCliOrCsv || claimsOwnServer)
            ? deterministicPhasesFor(productRequest)
            : null;
        /**
         * ⛔ A STOCK ENGINE ONLY WHEN IT COVERS WHAT HE ASKED (law 4).
         *
         * Eval run500, 2026-10-23: «an admin dashboard … with a summary page
         * showing totals and a chart» took the stock records engine, and the
         * gap surfaced only after the build as requested_features_not_proven.
         * When the request names something the stock engine cannot build and a
         * model can plan, plan from the request; with no healthy model the stock
         * engine still builds and the delivery report names the gaps honestly.
         */
        const stockGaps: string[] = stockPhases && !isCliOrCsv && !deterministicWorkflow && context?.skipProviderPreflight !== true
            ? (() => { try {
                // When the stock path builds its own API, what a backend covers is covered.
                const withBackend = stockPhases.phases.some((ph: any) => (ph.tasks || []).some((t: any) => t?.tool === 'api_project'));
                return require('../../../core/design/app-blueprints').stockEngineGaps(productRequest, withBackend);
            } catch { return []; } })()
            : [];
        const gapPlannerHealth = stockGaps.length
            ? await verifyProviderDirect(String(context?.modelConfig?.provider || 'auto'), {
                apiKey: context?.modelConfig?.apiKey, baseUrl: context?.modelConfig?.baseUrl, model: context?.modelConfig?.model,
            })
            : null;
        if (stockGaps.length) {
            appendBoundedPipelineLog(logs, `[pipeline] stock engine does not cover: ${stockGaps.slice(0, 6).join(' · ')} → ${gapPlannerHealth?.ok ? 'planning from the request' : 'model unavailable, stock engine with honest gaps'}`);
        }
        const hisOwnSchema = stockGaps.length && gapPlannerHealth?.ok ? null : stockPhases;
        // The provider is a prerequisite for model planning, not for an
        // evidence-backed plan the request has already made deterministic.
        // Otherwise a clear form request waits behind a weak Ollama even though
        // neither its schema nor its phase graph needs an LLM decision.
        const requiresModelPlanning = !hisOwnSchema && !deterministicExistingEdit;
        const modelConfig = context?.modelConfig || {};
        const providerHealth = gapPlannerHealth && hisOwnSchema === null
            ? gapPlannerHealth
            : context?.skipProviderPreflight === true
            ? { ok: true, provider: String(modelConfig.provider || 'auto'), detail: 'skipped_by_test_harness' }
            : !requiresModelPlanning
                ? { ok: true, provider: 'deterministic', detail: 'request_contract_complete' }
                : await verifyProviderDirect(String(modelConfig.provider || 'auto'), {
                apiKey: modelConfig.apiKey,
                baseUrl: modelConfig.baseUrl,
                model: modelConfig.model,
            });
        appendBoundedPipelineLog(logs, `[pipeline] provider preflight ${providerHealth.provider}: ${providerHealth.ok ? 'ok' : 'blocked'} (${providerHealth.detail})`);
        if (!providerHealth.ok && requiresModelPlanning) {
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
        // Greenfield discovery deliberately has no write target. If a stale
        // selectedProject leaks through, it is usually Joe's own repository;
        // only existing-project work may seed the planner with that root.
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
         *  See hasExplicitRecordSchema for the single canonical decision used
         *  by both application classification and pipeline routing.
         *  Two runs of the same sentence once produced different products, the worse one
         *  being the run where the planner succeeded.
         *
         *  This is not «skip the planner». It is: when his sentence
         *  names the columns, WHAT to build is settled, and a model has
         *  nothing left to decide about it. Requests that declare no
         *  schema fall straight through to the planner as before — those
         *  are the ones where a model genuinely has a question to answer.
         */
        let hisPlan: any = null;
        if (hisOwnSchema) {
            say(pick(isAr,
                deterministicWorkflow
                    ? `[pipeline] الطلب يصرّح بسير عمل مترابط — أبني عقد النظام الكامل مباشرة: ${hisOwnSchema.reason}`
                    : claimsOwnServer
                        ? `[pipeline] الطلب يطلب خادمه الخاص وتغطيه أدوات البناء — أبني الخدمة والواجهة مباشرة: ${hisOwnSchema.reason}`
                        : `[pipeline] الطلب يصرّح بأعمدته — أبني منه مباشرة بلا أن أسأل نموذجاً ما المطلوب: ${hisOwnSchema.reason}`,
                deterministicWorkflow
                    ? `[pipeline] the request declares a coordinated workflow — building its full-system contract directly: ${hisOwnSchema.reason}`
                    : claimsOwnServer
                        ? `[pipeline] the request claims its own server and the builders cover it — building its service and interface directly: ${hisOwnSchema.reason}`
                        : `[pipeline] the request declares its own columns — building from it directly, with no model asked what to build: ${hisOwnSchema.reason}`));
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
        // 180 s is this pipeline's DEFAULT for a cloud plan. A plan the LOCAL model
        // serves gets a default sized to it and to this machine's measured speed
        // (eval run500 P101, 2026-10-23: a compact local plan was cut at 180 s);
        // the number then reaches every downstream planner call as-is.
        const plannerTimeoutMs = Number(context?.plannerTimeoutMs) > 0
            ? Number(context.plannerTimeoutMs)
            : servedByLocalModel(context) ? localPlanDeadlineMs(productRequest) : 180_000;
        const plannerTimeoutDefaulted = !(Number(context?.plannerTimeoutMs) > 0);
        //  When his sentence settled it, the planner is not called at all.
        let plannerResult: any = hisPlan || (deterministicExistingEdit
            ? {
                ok: true,
                output: { projectName: deterministicExistingEdit?.projectName || 'existing project', phases: deterministicExistingEdit?.phases || [], deterministic: true, plannedWithoutModel: true, projectRoot: discoveredProjectRoot },
                logs: providerHealth.ok ? [] : [`planner bypassed: ${providerHealth.provider} unavailable; existing edit is evidence-bound`],
            }
            : await executeTool('project_planner',
            { projectDescription: planningRequest, evidence: plannerEvidence },
            {
                ...(context || {}),
                requireRunnableContract: true,
                engineeringPipeline: true,
                plannerTimeoutMs,
                plannerTimeoutDefaulted,
            },
        ));
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
            const deterministic = isGreenfield && deterministicRescueForDeadPlanner(productRequest)
                ? deterministicPhasesFor(productRequest)
                : null;
            if (deterministic) {
                // A planner that ANSWERED with a blocked plan is not «no planner»
                // (eval round 15, P151: the log said so after a 44-minute plan).
                const plannerBlocker = plannerResult?.output?.blocker;
                const blockedCode = String(plannerBlocker?.code || '').trim();
                say(blockedCode
                    ? pick(isAr,
                        `[pipeline] خطة المخطِّط حُجبت (${blockedCode}: ${String(plannerBlocker?.message || '').slice(0, 200)}) — أخطّط حتمياً مما صرّح به الطلب: ${deterministic.reason}`,
                        `[pipeline] the planner's plan was blocked (${blockedCode}: ${String(plannerBlocker?.message || '').slice(0, 200)}) — planning deterministically from what the request declares: ${deterministic.reason}`)
                    : pick(isAr,
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
            && isGreenfield) {
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
            const planPhases = Array.isArray(plannerResult?.output?.phases) ? plannerResult.output.phases : [];
            const touchesRunnable = planTouchesRunnable(planPhases);
            const requiresConcreteUiBuilder = interactiveAppNeedsReactBuilder(productRequest);
            const missingConcreteUiBuilder = requiresConcreteUiBuilder && !planContainsReactBuilder(planPhases);
            const unrequestedApiBuilder = planContainsUnrequestedApiBuilder(productRequest, planPhases);
            const requiresDeterministicRescue = !touchesRunnable || missingConcreteUiBuilder || unrequestedApiBuilder;
            if (planPhases.length > 0 && requiresDeterministicRescue
                && isGreenfield
                && plannerResult?.output?.deterministic !== true
                && (deterministicRescueAllowed(productRequest) || requiresConcreteUiBuilder)) {
                const rescue = deterministicPhasesFor(productRequest);
                const paperOnly = !touchesRunnable && !missingConcreteUiBuilder && !unrequestedApiBuilder;
                const completed = paperOnly ? completePaperPlan(productRequest, planPhases, rescue) : null;
                if (completed) {
                    say(pick(isAr,
                        `[pipeline] الخطة كتبت ملفات ولم تشغّل شيئاً — أكملتُها بخطوات تشغيلها بدلاً من استبدالها، لأن ${completed.reasons.join('؛ ')}`,
                        `[pipeline] the plan writes files but runs nothing — completing it with the steps that run it instead of replacing it, because ${completed.reasons.join('; ')}`));
                    plannerResult.output.phases = completed.phases;
                    plannerResult.output.totalPhases = completed.phases.length;
                } else if (rescue) {
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

        // Whatever planned it — the model, a rescue or the stock path — a plan
        // for a request that claims its own server builds that server: the
        // model's phases are kept and the service phase is added before them
        // (eval round 20, P251: a browser-only plan for «the owner sees all
        // bookings»).
        if (isGreenfield && Array.isArray(plannerResult?.output?.phases) && plannerResult.output.phases.length > 0) {
            const withService = planWithRequestedService(productRequest, plannerResult.output.phases);
            if (withService) {
                say(pick(isAr,
                    '[pipeline] الطلب يطلب خادماً والخطة لا تبني واحداً — أضفتُ مرحلة الخدمة قبل مراحلها',
                    '[pipeline] the request claims a server and the plan builds none — adding the service phase before its phases'));
                plannerResult.output.phases = withService;
                plannerResult.output.totalPhases = withService.length;
            }
        }

        // Rescue branches can replace the planner output above. Enforce the
        // same final evidence contract on the plan actually sent to execution.
        if (plannerResult?.output) plannerResult.output = ensurePlanFinalVerification(plannerResult.output);
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
            // Keep the complete product request separate from model-authored
            // task descriptions. A planner may summarize a task for display;
            // the builder must still receive every user-declared capability.
            request: productRequest,
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
            isCancelled: context?.isCancelled,
            cancellation: context?.cancellation,
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
        const runtimeProjectHandoff = trustedRuntimeProjectHandoff(
            context?.sessionId,
            context?.workspaceId || context?.sessionId || 'default',
            context?.runId,
        );
        const runtimeProjectRoot = runtimeProjectHandoff?.sourceRoot || '';
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
        let browserQaCoverageRetryAttempted = false;
        let browserQaCoverageRetryStatus = 'not_attempted';
        let browserQaInfrastructureRetryAttempted = false;
        let browserQaInfrastructureRetryStatus = 'not_attempted';
        let scopeRepairAttempted = false;
        let requestCoverageRepairStatus = 'not_attempted';
        let requestCoverageRepairAttempted = false;
        let scopeRepairStatus = 'not_attempted';
        let scopeCoverageFailed = false;
        let scopeAudit: ScopeGateOutcome['scopeAudit'] | undefined;
        /**
         * Every instrument records its own measurement; the verdict is a pure
         * function of all of them (core/quality/delivery-verdict). Before
         * round 15 the last instrument to run decided: a passing Browser QA
         * re-derived the verdict from the scope flag alone, over a failed
         * quality contract measured a moment earlier.
         */
        const ledger = new DeliveryLedger();
        const liveRunNotes: string[] = [];
        const deliveryRoles = requestedDeliveryRoles(productRequest);
        // A program asked for on its own (a CLI, a script) has no URL: its own
        // passing test run proves it runs, not project_run.
        const sessionPartsKey = String(context?.sessionId || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
        /** Every root a phase bound in this run, plus the roots of the last live run. */
        const deliveredRoots = (extra: string[] = []) => Array.from(new Set([
            ...deliveryPartsForRun(sessionPartsKey, context?.runId).map(part => part.root),
            ...extra,
        ].map(root => String(root || '').trim()).filter(root => root && fs.existsSync(root)).map(root => path.resolve(root))));
        const programRootCandidate = String(plannerResult?.output?.projectRoot || discoveredProjectRoot || runtimeProjectHandoff?.sourceRoot || '').trim();
        // Round 20 review: a «tool» the router read as a CLI but that came out
        // with a page is judged like any interface — live run, quality, scope,
        // records and Browser QA — never by its own test run alone.
        const programServesAPage = deliveredRoots([programRootCandidate]).some(root => !!servedInterfaceDirectory(root));
        const programOnly = deliveryRoles.program && !deliveryRoles.interface && !deliveryRoles.service && !programServesAPage;
        if (deliveryRoles.program && !deliveryRoles.interface && !deliveryRoles.service && programServesAPage) {
            appendBoundedPipelineLog(logs, '[pipeline] the program serves a page, so it is proven live like an interface, not by its own tests alone');
        }
        let requestCoverage: RequestCoverageReport | undefined;
        let requestCoverageFailed = false;
        // A program's own test run proves it runs; its manifest must still pass
        // the same contract as any delivery (a «test»: «exit 0» proves nothing).
        let deliveryRequired: DeliveryInstrument[] = programOnly ? ['quality'] : [];
        const syncFromLedger = (final = false) => {
            const verdict = deliveryVerdict({
                phaseVerified: verified,
                requestFidelityBlocked,
                measurements: ledger.all(),
                required: final ? deliveryRequired : [],
                primary: programOnly ? 'program' : 'live',
            });
            finalVerified = verdict.verified;
            scopeCoverageFailed = verdict.failures.some(m => m.instrument === 'scope');
            requestCoverageFailed = verdict.coverageFailed;
            // In flight every failure blocks; only the final verdict may call a
            // scope-only shape partial.
            const blocking = verdict.failures.length > 0 && !(final && verdict.partial);
            liveRunVerificationFailed = blocking;
            finalHonestBlocker = honestBlocker || blocking;
            liveRunError = blocking
                ? [verdict.firstError, ...liveRunNotes].filter(Boolean).join('; ').slice(0, 900)
                : (final && (verdict.unread.length || verdict.unverified.length) && !verdict.verified)
                    // Unread: his words produced no record. Unverified: read, but no
                    // instrument could measure it — never told as «could not be read».
                    ? [
                        verdict.unread.length ? `requested items could not be read, so their delivery is not verified: ${verdict.unread.join(', ')}` : '',
                        verdict.unverified.length ? `not measured, so their delivery is not verified: ${verdict.unverified.join('; ')}` : '',
                    ].filter(Boolean).join('; ').slice(0, 900)
                    : '';
            return verdict;
        };
        const noteLiveRunError = (note: string) => {
            liveRunNotes.push(String(note || '').slice(0, 420));
            syncFromLedger();
        };
        const measured = (instrument: DeliveryInstrument, ok: boolean) =>
            ledger.all().some(m => m.instrument === instrument && m.ok === ok);
        /**
         * The records the request named, measured on the delivered tree and the
         * live server: served (a backend was asked for or the tree has one),
         * tested (tests were asked for), present (a static build). Judged
         * whenever project_run confirmed a live URL — even when the quality or
         * scope gate already failed — so missing records are always named.
         */
        /** One executed run of his tests per unchanged tree: a re-measurement after an edit re-runs them, an idle one does not. */
        const requestedTestRuns = new Map<string, RequestedTestsRun>();
        const measureRequestedRecords = async (runRes: any, roots: string[]) => {
            ledger.forget('coverage');
            ledger.forget('tests');
            // The gate's own fact — a server the request asks for (a backend, a
            // database, sign-in, accounts, roles, an API) — not every claim the
            // router reads as needing a server (round 20: an invoice in a list of
            // records made P080's actions «unread records»).
            const backendRequested = backendRequestedFor(productRequest);
            const records = requestedRecords(productRequest, { backendRequested });
            if (!records.entities.length && !records.unread.length && !(records.capabilities || []).length && !records.testsRequested) {
                requestCoverage = undefined;
                return;
            }
            const runRoot = String(runRes?.output?.cwd || '').trim();
            const deliveredRoots = Array.from(new Set([runRoot, ...roots].filter(Boolean)));
            const evidence = collectServerEvidence(deliveredRoots, records.entities);
            const servedApplies = backendRequested || evidence.routes.length > 0;
            let probe: Record<string, ProbeResult> | undefined;
            const probeDetails: Record<string, string[]> = {};
            const base = verifiedLiveUrl(ledger.all());
            if (servedApplies && base && records.entities.length) {
                const bound = bindRunCancellation(context?.cancellation, context?.signal);
                try {
                    // project_run's own bound for one HTTP answer — no new constant.
                    const { HTTP_ANSWER_TIMEOUT_MS } = require('./ProjectRunTool');
                    probe = await probeServedResources(base, evidence.prefixes,
                        records.entities.map(record => {
                            const ids = identifiersFor(record, evidence.labelKeys[record.key] || []);
                            // The exact path each record's own route registers — never a guessed prefix.
                            return { key: record.key, ids, paths: probePathsFor(evidence, ids) };
                        }),
                        { signal: bound.signal, timeoutMs: Number(HTTP_ANSWER_TIMEOUT_MS) || 2500, details: probeDetails });
                } finally {
                    bound.dispose();
                }
            }
            // «Tested» means his tests RAN and passed (round 20: a word in a
            // skipped test, or a file no test script collects, counted as tested).
            let testsRun: RequestedTestsRun | undefined;
            if (records.testsRequested) {
                const testsRoot = requestedTestsRoot(evidence, runRoot, deliveredRoots);
                const fingerprint = `${testsRoot}|${testTreeFingerprint(testsRoot, evidence)}`;
                testsRun = requestedTestRuns.get(fingerprint);
                if (!testsRun) {
                    say(pick(isAr, '▶️ أشغّل الاختبارات التي طلبتها لأثبت أنها تنجح…', '▶️ Running the tests you asked for, to prove they pass…'));
                    testsRun = await runRequestedTests(testsRoot, (tool, input) =>
                        executeTool(tool, input, { ...(context || {}), language: isAr ? 'ar' : 'en' }));
                    requestedTestRuns.set(fingerprint, testsRun);
                }
                deliveryRequired = Array.from(new Set<DeliveryInstrument>([...deliveryRequired, 'tests']));
                // No runner Joe knows: 'tests' stays required and unmeasured — not verified, never passed.
                if (!testsRun.noRunner) {
                    ledger.record({
                        instrument: 'tests',
                        target: testsRun.root,
                        ok: testsRun.passed,
                        error: testsRun.passed ? undefined
                            : `the requested tests ${testsRun.ran ? 'did not pass' : 'could not run'} in ${path.basename(testsRun.root || '.')}: ${String(testsRun.error || '').slice(0, 400)}`,
                    });
                }
            }
            requestCoverage = judgeRequestCoverage({ records, evidence, probe, probeDetails, backendRequested, testsRun });
            const unverified = coverageUnverified(requestCoverage);
            ledger.record({
                instrument: 'coverage',
                ok: requestCoverage.missing.length === 0,
                error: requestCoverage.missing.length ? coverageError(requestCoverage) : undefined,
                unread: requestCoverage.unread,
                unverified,
            });
            appendBoundedPipelineLog(logs, `[pipeline] request coverage checked=${requestCoverage.checked} missing=${requestCoverage.missing.map(r => r.key).join(',') || 'none'} unread=${requestCoverage.unread.join(',') || 'none'} unverified=${unverified.length} capabilities=${(requestCoverage.capabilities || []).length} tests=${testsRun ? (testsRun.passed ? 'passed' : testsRun.ran ? 'failed' : testsRun.noRunner ? 'no runner' : 'not run') : 'not requested'}`);
        };
        /** live, quality, scope and records for one project_run result — measured separately, never folded into one flag. */
        let lastAcceptanceRoots: { qualityRoot: string; auditRoots: string[] } = { qualityRoot: '', auditRoots: [] };
        const recordLiveAcceptance = async (runRes: any, qualityRoot: string, auditRoots: string[]) => {
            lastAcceptanceRoots = { qualityRoot, auditRoots };
            const live = applyLiveRunOutcome(true, runRes);
            ledger.record({ instrument: 'live', ok: live.verified, url: live.liveUrl, error: live.error });
            liveUrl = live.verified ? live.liveUrl : '';
            if (!live.verified) {
                ledger.forget('quality');
                ledger.forget('scope');
                ledger.forget('coverage');
                scopeAudit = { requested: 0, built: 0, coverage: 0, missing: [] };
                return syncFromLedger();
            }
            ledger.forget('quality');
            const quality = inspectProjectQualityContract(qualityRoot, productRequest);
            ledger.record({
                instrument: 'quality',
                ok: quality.ok,
                error: quality.ok ? undefined : `project quality contract failed — ${quality.failures.slice(0, 4).join('; ')}`,
            });
            // Every other delivered part with a manifest answers for what the
            // request asks of it — never the primary root's broad contract.
            const testsAsked = !!testsRequestedIn(productRequest);
            const primary = path.resolve(String(qualityRoot || '.'));
            const otherRoots = deliveredRoots([String(runRes?.output?.cwd || '').trim(), ...auditRoots])
                .filter(root => root !== primary && fs.existsSync(path.join(root, 'package.json')));
            for (const root of otherRoots) {
                const part = inspectProjectQualityContract(root, productRequest, { additionalRoot: true, testsRequested: testsAsked });
                ledger.record({
                    instrument: 'quality',
                    target: root,
                    ok: part.ok,
                    error: part.ok ? undefined : `project quality contract failed in ${path.basename(root)} — ${part.failures.slice(0, 4).join('; ')}`,
                });
            }
            const scoped = applyScopeAuditOutcome(productRequest, auditRoots, { verified: true, liveUrl: live.liveUrl, verificationFailed: false });
            scopeAudit = scoped.scopeAudit;
            if (scoped.verified || scoped.scopeCoverageFailed === true) {
                ledger.record({ instrument: 'scope', ok: scoped.verified, error: scoped.error });
            } else {
                // No artifact root to audit is a live-acceptance gap, not missing scope.
                ledger.forget('scope');
                ledger.record({ instrument: 'live', ok: false, url: live.liveUrl, error: scoped.error });
            }
            await measureRequestedRecords(runRes, deliveredRoots(auditRoots));
            return syncFromLedger();
        };
        /** A program's proof: its own tests, run through quality_run on the project root. */
        const recordProgramProof = async () => {
            const programRoot = programRootCandidate;
            if (!programRoot || !fs.existsSync(programRoot)) {
                ledger.record({ instrument: 'program', ok: false, error: 'no program root was bound, so its own tests could not be run' });
                return syncFromLedger();
            }
            // The same contract the live path applies — placeholders refused,
            // the scripts the request asks for present — measured before the run.
            const quality = inspectProjectQualityContract(programRoot, productRequest);
            ledger.record({
                instrument: 'quality',
                ok: quality.ok,
                error: quality.ok ? undefined : `project quality contract failed — ${quality.failures.slice(0, 4).join('; ')}`,
            });
            say(pick(isAr, '▶️ أشغّل اختبارات البرنامج نفسه لأثبت أنه يعمل…', '▶️ Running the program\'s own tests to prove it works…'));
            try {
                const run = await executeTool('quality_run', { path: programRoot, tasks: ['test'] }, { ...(context || {}), language: isAr ? 'ar' : 'en' });
                const executed = Array.isArray(run?.output?.results) ? run.output.results.filter((r: any) => r?.skipped === false) : [];
                const passed = run?.ok === true && executed.length > 0;
                ledger.record({
                    instrument: 'program',
                    ok: passed,
                    target: programRoot,
                    error: passed ? undefined : `the program's own tests did not pass: ${String(run?.error || (executed.length ? 'tests failed' : 'no test script to run')).slice(0, 400)}`,
                });
            } catch (programError: any) {
                ledger.record({ instrument: 'program', ok: false, target: programRoot, error: `the program's own tests could not run: ${String(programError?.message || programError).slice(0, 300)}` });
            }
            return syncFromLedger();
        };
        const liveRepairDue = () => measured('live', false) || measured('quality', false);
        const scopeRepairDue = () => measured('scope', false) && !liveRepairDue();
        if (verified && programOnly) {
            await recordProgramProof();
        } else if (verified) {
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
                if (runtimeProjectHandoff?.runtimeRoot) {
                    runInput.cwd = runtimeProjectHandoff.runtimeRoot;
                } else if (plannedProjectRoot) {
                    runInput.cwd = plannedProjectRoot;
                }
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
                const liveRuntimeRoot = String(
                    runRes?.output?.cwd || runInput.cwd || plannedProjectRoot || discoveredProjectRoot || ''
                ).trim();
                const liveSourceRoot = String(
                    plannedProjectRoot || discoveredProjectRoot || liveRuntimeRoot || ''
                ).trim();
                const liveAuditRoots = projectAuditRoots(liveSourceRoot, liveRuntimeRoot);
                await recordLiveAcceptance(runRes, liveSourceRoot || liveRuntimeRoot, liveAuditRoots);
                if (liveRunVerificationFailed) {
                    say(pick(isAr,
                        `⛔ لم أعتبر النظام مسلّماً: فشل قبول التشغيل الحي أو مطابقة نطاق الطلب. ${liveRunError}`,
                        `⛔ I did not mark the system delivered: live acceptance or requested-scope verification failed. ${liveRunError}`));
                }
            } catch (e: any) {
                ledger.record({ instrument: 'live', ok: false, error: String(e?.message || e) });
                syncFromLedger();
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
                    isCancelled: context?.isCancelled,
                    cancellation: context?.cancellation,
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
                    { cwd: apiSiblingOf(artifactRoot) || artifactRoot, restart: true },
                    { ...(context || {}), scopeRepairAttempted: true, language: isAr ? 'ar' : 'en' },
                );
                liveRunResult = scopeRetryResult;
                const scopeRetryRuntimeRoot = String(scopeRetryResult?.output?.cwd || apiSiblingOf(artifactRoot) || artifactRoot || runtimeRoot).trim();
                const scopeRetryAuditRoots = projectAuditRoots(artifactRoot, scopeRetryRuntimeRoot);
                await recordLiveAcceptance(postRepairRunOutcome(scopeRetryResult), artifactRoot || scopeRetryRuntimeRoot, scopeRetryAuditRoots);
                scopeRepairStatus = finalVerified ? 'repaired_and_running' : 'repair_completed_scope_still_missing';
                say(pick(isAr,
                    finalVerified ? '✅ أصلحتُ القدرات المفقودة وأعدت تشغيل artifact؛ اجتاز scope audit.' : `⛔ اكتملت محاولة scope-repair لكن الدليل ما زال ناقصاً: ${liveRunError}`,
                    finalVerified ? '✅ Missing capabilities were repaired and the artifact passed scope audit after restart.' : `⛔ Scope repair completed but the evidence is still incomplete: ${liveRunError}`));
            } catch (scopeRepairError: any) {
                scopeRepairStatus = 'scope_repair_error';
                const message = String(scopeRepairError?.message || scopeRepairError).slice(0, 420);
                noteLiveRunError(`scope repair: ${message}`);
                appendBoundedPipelineLog(logs, `[pipeline] scope repair error: ${message}`);
            }
        };

        if (scopeRepairDue() && context?.scopeRepairAttempted !== true) {
            await attemptScopeRepair();
        }

        // A live-run failure is evidence about the current artifact, not a reason
        // to stop before Joe has had one bounded chance to repair it. Re-discover
        // the workspace so the repair planner sees files created by the phases,
        // then plan only the missing runnable contract. This is intentionally
        // inside project_pipeline (not a generic recovery loop): one attempt,
        // same project identity, same workspace, and no product-specific template.
        if (liveRepairDue() && context?.liveRepairAttempted !== true) {
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
                            isCancelled: context?.isCancelled,
                            cancellation: context?.cancellation,
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
                                noteLiveRunError(`bounded dependency bootstrap: ${bootstrapError}`);
                                appendBoundedPipelineLog(logs, `[pipeline] bounded dependency bootstrap failed: ${bootstrapError}`);
                            }
                        }
                    }
                    if (boundedRepairReady) {
                        const repairProjectName = String(repairPlanner?.output?.projectName || plannerResult?.output?.projectName || '').trim();
                        const repairProjectRoot = String(repairPlanner?.output?.projectRoot || plannerResult?.output?.projectRoot || discoveredProjectRoot || '').trim();
                        const retryInput: Record<string, any> = { restart: true };
                        if (repairProjectRoot) retryInput.cwd = apiSiblingOf(repairProjectRoot) || repairProjectRoot;
                        else if (repairProjectName) retryInput.projectQuery = `"${repairProjectName.replace(/"/gu, '\\\"')}"`;
                        const retryRunResult = await executeTool(
                            'project_run',
                            retryInput,
                            { ...(context || {}), language: isAr ? 'ar' : 'en', liveRepairAttempted: true },
                        );
                        liveRunResult = retryRunResult;
                        const retryRuntimeRoot = String(
                            retryRunResult?.output?.cwd || retryInput.cwd || repairProjectRoot || discoveredProjectRoot || ''
                        ).trim();
                        const retrySourceRoot = repairProjectRoot || discoveredProjectRoot || retryRuntimeRoot;
                        const retryAuditRoots = projectAuditRoots(retrySourceRoot, retryRuntimeRoot);
                        await recordLiveAcceptance(postRepairRunOutcome(retryRunResult), retrySourceRoot || retryRuntimeRoot, retryAuditRoots);
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
                noteLiveRunError(`repair: ${repairMessage}`);
                say(pick(isAr, `⛔ تعذرت محاولة إصلاح التشغيل المحدودة: ${repairMessage}`, `⛔ Bounded live-run repair failed: ${repairMessage}`));
            }
        }

        if (scopeRepairDue() && !scopeRepairAttempted && context?.scopeRepairAttempted !== true) {
            await attemptScopeRepair();
        }

        /**
         * A MISSING RECORD IS REPAIRED, NOT ONLY FAILED.
         *
         * One evidence-bound pass per dimension — served first, then tested —
         * through the same SelfFix contract phases use: a repair ticket whose
         * target is the server file that already serves resources (or the
         * project's test file), the records he named as structured context,
         * then a RESTART (never adoption) and the same gates again. A server
         * that no longer starts after the edit gets the file back byte for byte.
         */
        const attemptRequestCoverageRepair = async (): Promise<void> => {
            if (requestCoverageRepairAttempted || context?.requestCoverageRepairAttempted === true) return;
            requestCoverageRepairAttempted = true;
            for (const dimension of ['served', 'tested'] as const) {
                if (!requestCoverageFailed || !requestCoverage?.missing.length) return;
                if (!measured('live', true) || measured('live', false)) return;
                const serverRoot = String(liveRunResult?.output?.cwd || '').trim();
                const task = requestCoverageRepairTask(requestCoverage, {
                    request: productRequest,
                    serverRoot,
                    testFiles: requestCoverage.testFiles || [],
                });
                if (!task || task.dimension !== dimension) continue;
                const trustedRoots = Array.from(new Set([serverRoot, ...lastAcceptanceRoots.auditRoots].filter(Boolean)));
                if (!serverRoot || !trustedRoots.some(root => isWithinRoot(task.repairFile, root))) {
                    requestCoverageRepairStatus = 'request_coverage_repair_no_trusted_target';
                    return;
                }
                const ticket = RepairTicketService.build({
                    phase: { phaseNumber: total + 1, name: isAr ? 'السجلات المطلوبة' : 'Requested records' },
                    phaseStatus: 'failed',
                    phaseResult: { ok: false, output: { status: 'failed', results: [{
                        task: task.task, tool: 'request_coverage', ok: false, error: task.error,
                        repairKind: 'code_fix', repairFile: task.repairFile, cwd: serverRoot,
                        description: task.description, artifactContext: task.artifactContext,
                    }] } },
                    projectName: plannerResult?.output?.projectName,
                    sessionId: context?.sessionId,
                    workspaceId: context?.workspaceId || context?.sessionId,
                    projectRoot: serverRoot,
                    runId: context?.runId,
                } as any);
                const { SelfFixService } = require('../../services/SelfFixService');
                const plan = SelfFixService.plan(ticket);
                if (!plan?.allowed || !plan?.suggestedTool || plan?.strategy === 'manual_review') {
                    requestCoverageRepairStatus = `request_coverage_repair_unplanned:${String(plan?.strategy || plan?.reason || 'none').slice(0, 80)}`;
                    return;
                }
                const existed = fs.existsSync(task.repairFile);
                const snapshot = existed ? fs.readFileSync(task.repairFile) : null;
                say(pick(isAr,
                    `🔧 ${dimension === 'served' ? 'سجلات طلبتها غير مخدومة' : 'سجلات طلبتها بلا اختبار'}: ${requestCoverage.missing.map(r => r.ar || r.key).join('، ')} — أصلحها مرة واحدة في ${path.basename(task.repairFile)} ثم أعيد التشغيل والفحص.`,
                    `🔧 ${dimension === 'served' ? 'Requested records are not served' : 'Requested records are untested'}: ${requestCoverage.missing.map(r => r.key).join(', ')} — repairing once in ${path.basename(task.repairFile)}, then restarting and re-checking.`));
                try {
                    const repairResult = await executeTool(plan.suggestedTool, {
                        ...(plan.suggestedInput || {}),
                        sessionId: context?.sessionId,
                        workspaceId: context?.workspaceId || context?.sessionId,
                    }, { ...(context || {}), requestCoverageRepairAttempted: true, language: isAr ? 'ar' : 'en' });
                    appendBoundedPipelineLogs(logs, repairResult?.logs);
                    if (repairResult?.ok !== true) {
                        requestCoverageRepairStatus = `request_coverage_repair_tool_failed:${dimension}`;
                        noteLiveRunError(`request-coverage repair (${dimension}): ${String(repairResult?.error || 'repair tool failed').slice(0, 300)}`);
                        return;
                    }
                    const coverageRerun = await executeTool('project_run', { cwd: serverRoot, restart: true },
                        { ...(context || {}), requestCoverageRepairAttempted: true, language: isAr ? 'ar' : 'en' });
                    liveRunResult = coverageRerun;
                    await recordLiveAcceptance(postRepairRunOutcome(coverageRerun), lastAcceptanceRoots.qualityRoot, lastAcceptanceRoots.auditRoots);
                    if (measured('live', false)) {
                        // The edit broke the server: put the file back exactly and start it again.
                        if (snapshot) fs.writeFileSync(task.repairFile, snapshot);
                        else fs.rmSync(task.repairFile, { force: true });
                        const restoredRun = await executeTool('project_run', { cwd: serverRoot, restart: true },
                            { ...(context || {}), requestCoverageRepairAttempted: true, language: isAr ? 'ar' : 'en' });
                        liveRunResult = restoredRun;
                        await recordLiveAcceptance(postRepairRunOutcome(restoredRun), lastAcceptanceRoots.qualityRoot, lastAcceptanceRoots.auditRoots);
                        requestCoverageRepairStatus = 'request_coverage_repair_restored';
                        noteLiveRunError(`request-coverage repair (${dimension}) broke the server; ${path.basename(task.repairFile)} was restored`);
                        return;
                    }
                    requestCoverageRepairStatus = requestCoverageFailed ? `repair_completed_records_still_missing:${dimension}` : 'repaired_and_served';
                } catch (coverageRepairError: any) {
                    requestCoverageRepairStatus = 'request_coverage_repair_error';
                    noteLiveRunError(`request-coverage repair: ${String(coverageRepairError?.message || coverageRepairError).slice(0, 300)}`);
                    return;
                }
            }
        };
        if (requestCoverageFailed && measured('live', true) && !measured('live', false)) {
            await attemptRequestCoverageRepair();
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
        /**
         * An interface is judged in a browser — when one was delivered. An API
         * or a program with no page has nothing for Browser QA to open, and its
         * «no index.html to audit» used to block every API-only delivery
         * (round 15, P101). A requested interface that no part serves is a
         * failure of its own, named.
         */
        const interfaceRoots = deliveredRoots([...lastAcceptanceRoots.auditRoots, String(liveRunResult?.output?.cwd || '').trim()]);
        // A request that needs a server is never delivered by a browser-only build.
        if (verified && !programOnly) {
            const serverGap = missingRequestedServer(productRequest, interfaceRoots, deliveryPartsForRun(sessionPartsKey, context?.runId));
            if (serverGap) {
                ledger.record({ instrument: 'service', ok: false, error: serverGap });
                syncFromLedger();
            }
        }
        const interfaceDelivered = interfaceRoots.some(root => !!servedInterfaceDirectory(root))
            || String(liveRunResult?.output?.kind || '') === 'static-site'
            || await servesHtmlAtRoot(verifiedLiveUrl(ledger.all()));
        if (!interfaceDelivered && verifiedLiveUrl(ledger.all()) && deliveryRoles.interface) {
            ledger.record({ instrument: 'browser', ok: false, error: 'the request asks for an interface, but no delivered part serves one (no page is served at the live address)' });
            syncFromLedger();
        }
        // Browser QA never runs to "rescue" an outcome already measured as
        // failed, and a durable preview stands in only for a CONFIRMED live
        // URL — a failed or never-run pipeline is not judged on a preview.
        const browserQaTarget = interfaceDelivered && mayRunBrowserQa(ledger.all())
            ? browserQaTargetUrl(verifiedLiveUrl(ledger.all()), runtimeProjectHandoff?.durablePreviewUrl)
            : '';
        if (!browserQaTarget && (liveUrl || runtimeProjectHandoff?.durablePreviewUrl)) {
            appendBoundedPipelineLog(logs, `[pipeline] browser QA not run: an earlier measurement already failed (${liveRunError || 'no confirmed live run'})`);
        }
        if (browserQaTarget) {
            liveUrl = browserQaTarget;
            if (runtimeProjectHandoff?.durablePreviewUrl) {
                appendBoundedPipelineLog(logs, `[pipeline] browser QA target=durable_project_preview url=${liveUrl}`);
            }
            try {
                const runtimeRoot = String(liveRunResult?.output?.cwd || '').trim();
                const artifactRoot = String(
                    plannerResult?.output?.projectRoot ||
                    discoveredProjectRoot ||
                    runtimeRoot ||
                    ''
                ).trim();
                const auditRoots = projectAuditRoots(artifactRoot, runtimeRoot);
                // The delivered interface may be any part this run built.
                const auditDir = projectAuditDirectory(Array.from(new Set([...auditRoots, ...interfaceRoots])));
                const { PANEL_BROWSER_SID } = require('./BrowserSmartTools');
                const panelSid = String(context?.browserSessionId || PANEL_BROWSER_SID || process.env.PANEL_BROWSER_SID || '').trim();
                const { broadcast } = require('../../../api/ws');
                try {
                    broadcast({ type: 'panel_focus', sessionId: context?.sessionId, data: { panel: 'browser', reason: 'pipeline_qa' } } as any);
                } catch { /* visible panel is best effort; audit remains mandatory */ }
                try { require('../../browser/manager').warmBrowserSession(panelSid); } catch { /* audit reports private fallback */ }
                try {
                    const { waitForPanelWatcher } = require('../../browser/wsHub');
                    // The Browser panel is lazy-loaded. Give the UI enough
                    // time to mount after panel_focus before declaring that
                    // visible QA has no audience.
                    const watching = await waitForPanelWatcher(panelSid, 15_000);
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
                    request: productRequest,
                    watchSessionId: panelSid || undefined,
                    serveUrl: liveUrl,
                    artifactRootDir: artifactRoot || auditDir || runtimeRoot,
                    // Delivery QA is a visible user-facing proof. Do not
                    // silently replace it with a private headless run when
                    // the panel is disconnected or still loading.
                    requireVisibleBrowser: true,
                    ...(runtimeProjectHandoff?.externalApi ? { externalApi: runtimeProjectHandoff.externalApi } : {}),
                    ...(runtimeProjectHandoff?.runtimeAuth ? { credentials: runtimeProjectHandoff.runtimeAuth } : {}),
                    timeoutMs: 45_000,
                    onProgress: progress,
                });
                if (browserQa.skipped) {
                    browserQaFailed = true;
                    ledger.record({ instrument: 'browser', ok: false, error: `browser QA skipped: ${browserQa.skipped}` });
                    syncFromLedger();
                    say(pick(isAr,
                        `⛔ لم أسلّم النظام: فحص Browser QA لم يُجرَ (${browserQa.skipped}).`,
                        `⛔ I did not deliver the system: Browser QA did not run (${browserQa.skipped}).`));
                } else {
                    // A coverage timeout is an instrumentation limit, not an
                    // application defect. Give the exploratory walker one
                    // larger, still bounded pass before spending the single
                    // source-repair attempt on real findings.
                    const coverageTimedOut = browserQa.findings.some((finding: any) => finding.id === 'qa_budget_exhausted');
                    if (coverageTimedOut && !browserQaCoverageRetryAttempted) {
                        browserQaCoverageRetryAttempted = true;
                        browserQaCoverageRetryStatus = 'attempted';
                        say(pick(isAr,
                            '🔎 لم تكتمل تغطية المتصفح؛ سأعيد الاستكشاف بمهلة موسّعة ومحدودة قبل إصلاح الملفات.',
                            '🔎 Browser coverage was incomplete; I will rerun bounded exploration with a larger budget before editing files.'));
                        appendBoundedPipelineLog(logs, '[pipeline] browser QA coverage retry start timeoutMs=90000');
                        const coverageRetry = await auditBuiltApp(auditDir, {
                            request: productRequest,
                            watchSessionId: panelSid || undefined,
                            serveUrl: liveUrl,
                            artifactRootDir: artifactRoot || auditDir || runtimeRoot,
                            requireVisibleBrowser: true,
                            ...(runtimeProjectHandoff?.externalApi ? { externalApi: runtimeProjectHandoff.externalApi } : {}),
                            ...(runtimeProjectHandoff?.runtimeAuth ? { credentials: runtimeProjectHandoff.runtimeAuth } : {}),
                            timeoutMs: 90_000,
                            onProgress: progress,
                        });
                        if (!coverageRetry?.skipped) {
                            browserQa = coverageRetry;
                            browserQaCoverageRetryStatus = browserQa.findings.some((finding: any) => finding.id === 'qa_budget_exhausted')
                                ? 'still_incomplete' : 'complete';
                            appendBoundedPipelineLog(logs, `[pipeline] browser QA coverage retry result=${browserQaCoverageRetryStatus} score=${browserQa.score} findings=${browserQa.findings.length}`);
                        } else {
                            browserQaCoverageRetryStatus = `skipped:${String(coverageRetry?.skipped || 'unknown')}`;
                            appendBoundedPipelineLog(logs, `[pipeline] browser QA coverage retry skipped=${String(coverageRetry?.skipped || 'unknown')}`);
                        }
                    }
                    // A viewport/controller failure says nothing about the app.
                    // Re-run the same visible audit once after the first run has
                    // released its browser instrumentation. A repeated failure
                    // remains a hard delivery blocker and never edits the project.
                    if (hasOnlyBrowserQaInfrastructureFindings(browserQa.findings)
                        && !browserQaInfrastructureRetryAttempted) {
                        browserQaInfrastructureRetryAttempted = true;
                        browserQaInfrastructureRetryStatus = 'attempted';
                        say(pick(isAr,
                            '🔎 تعثرت أداة قياس المتصفح؛ سأعيد القياس المرئي مرة واحدة قبل الحكم على التطبيق.',
                            '🔎 Browser measurement instrumentation failed; I will rerun the visible measurement once before judging the application.'));
                        appendBoundedPipelineLog(logs, '[pipeline] browser QA infrastructure retry start timeoutMs=45000');
                        const infrastructureRetry = await auditBuiltApp(auditDir, {
                            request: productRequest,
                            watchSessionId: panelSid || undefined,
                            serveUrl: liveUrl,
                            artifactRootDir: artifactRoot || auditDir || runtimeRoot,
                            requireVisibleBrowser: true,
                            ...(runtimeProjectHandoff?.externalApi ? { externalApi: runtimeProjectHandoff.externalApi } : {}),
                            ...(runtimeProjectHandoff?.runtimeAuth ? { credentials: runtimeProjectHandoff.runtimeAuth } : {}),
                            timeoutMs: 45_000,
                            onProgress: progress,
                        });
                        if (!infrastructureRetry?.skipped) {
                            browserQa = infrastructureRetry;
                            browserQaInfrastructureRetryStatus = hasOnlyBrowserQaInfrastructureFindings(browserQa.findings)
                                ? 'still_failed' : 'completed';
                            appendBoundedPipelineLog(logs, `[pipeline] browser QA infrastructure retry result=${browserQaInfrastructureRetryStatus} score=${browserQa.score} findings=${browserQa.findings.length}`);
                        } else {
                            browserQaInfrastructureRetryStatus = `skipped:${String(infrastructureRetry?.skipped || 'unknown')}`;
                            appendBoundedPipelineLog(logs, `[pipeline] browser QA infrastructure retry skipped=${String(infrastructureRetry?.skipped || 'unknown')}`);
                        }
                    }
                    // Every measured finding is open work. Treating only
                    // "high" severity as blocking let coverage, accessibility,
                    // responsive, and visual defects pass the gate unchanged.
                    let blocking = browserQa.findings.slice();
                    // Instrumentation failures belong to Joe's browser rig,
                    // never to the application under test. Sending these to
                    // project_repair made Joe rewrite valid project files in
                    // response to a viewport controller race. They still stop
                    // delivery, but cannot authorize a user-project edit.
                    const projectRepairFindings = blocking.filter((finding: any) =>
                        !BROWSER_QA_INFRASTRUCTURE_FINDINGS.has(String(finding?.code || finding?.id || '')));
                    appendBoundedPipelineLog(logs, `[pipeline] browser QA score=${browserQa.score} findings=${browserQa.findings.length} blocking=${blocking.length}`);
                    if (projectRepairFindings.length > 0 && !browserQaRepairAttempted) {
                        browserQaRepairAttempted = true;
                        const repairProjectRoot = artifactRoot || runtimeRoot;
                        browserQaRepairStatus = repairProjectRoot && auditDir
                            ? 'attempted'
                            : 'no_trusted_artifact_or_audit_root';
                        if (repairProjectRoot && auditDir) {
                            say(pick(isAr,
                                `🔧 كشف Browser QA ${projectRepairFindings.length} مشكلة قابلة للإصلاح داخل المشروع؛ سأصلحها مرة واحدة ثم أعيد الفحص المرئي.`,
                                `🔧 Browser QA found ${projectRepairFindings.length} project issue(s); I will repair them once, then re-run visible QA.`));
                            appendBoundedPipelineLog(logs, `[pipeline] browser QA bounded repair start root=${repairProjectRoot}`);
                            try {
                                const repairResult = await executeTool(
                                    'project_repair',
                                    {
                                        request: productRequest,
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
                                        request: productRequest,
                                        watchSessionId: panelSid || undefined,
                                        serveUrl: liveUrl,
                                        artifactRootDir: repairProjectRoot,
                                        ...(runtimeProjectHandoff?.externalApi ? { externalApi: runtimeProjectHandoff.externalApi } : {}),
                                        ...(runtimeProjectHandoff?.runtimeAuth ? { credentials: runtimeProjectHandoff.runtimeAuth } : {}),
                                        timeoutMs: 45_000,
                                        onProgress: progress,
                                    });
                                    if (!recheck?.skipped) {
                                        browserQa = recheck;
                                        blocking = browserQa.findings.slice();
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
                    blocking = browserQa.findings.slice();
                    if (blocking.length > 0) {
                        browserQaFailed = true;
                        ledger.record({ instrument: 'browser', ok: false, error: `browser QA found ${blocking.length} blocking finding(s)` });
                        syncFromLedger();
                        say(pick(isAr,
                            `⛔ كشف Browser QA المرئي ${blocking.length} مشكلة حرجة بعد محاولة إصلاح bounded؛ لم أعتبر التطبيق مسلّماً.`,
                            `⛔ Visible Browser QA still found ${blocking.length} blocking issue(s) after the bounded repair attempt; the application is not delivered.`));
                    } else {
                        browserQaFailed = false;
                        // Browser QA records its own pass and clears nothing
                        // another instrument measured (round 15).
                        ledger.record({ instrument: 'browser', ok: true });
                        syncFromLedger();
                        say(pick(isAr,
                            `✅ اجتاز التطبيق Browser QA بعد الإصلاح (score: ${browserQa.score}).`,
                            `✅ The application passed Browser QA after repair (score: ${browserQa.score}).`));
                    }
                }
            } catch (qaError: any) {
                browserQaFailed = true;
                const message = String(qaError?.message || qaError).slice(0, 420);
                ledger.record({ instrument: 'browser', ok: false, error: `browser QA error: ${message}` });
                syncFromLedger();
                appendBoundedPipelineLog(logs, `[pipeline] browser QA error: ${message}`);
                say(pick(isAr, `⛔ تعذّر إكمال Browser QA: ${message}`, `⛔ Browser QA could not complete: ${message}`));
            }
        }

        // 3.5 — Specification Verification: verify all requirements from the
        // specification are satisfied in the built artifact. This runs after
        // Browser QA passes and before the final delivery decision.
        let specVerificationFailed = false;
        let specVerificationCoverage = 0;
        let specVerificationResults: any = null;
        if (finalVerified && specification?.content) {
            try {
                say(pick(isAr,
                    '📋 التحقق من متطلبات المواصفة...',
                    '📋 Verifying specification requirements...'));
                appendBoundedPipelineLog(logs, '[pipeline] Starting specification verification');

                const specVerifyResult = await executeTool('specification_verification', {
                    specificationId: specification.specificationId,
                    projectRoot: String(plannerResult?.output?.projectRoot || discoveredProjectRoot || '').trim(),
                    userId: context?.userId || 'anonymous',
                }, { ...(context || {}), language: isAr ? 'ar' : 'en' });

                if (specVerifyResult?.ok && specVerifyResult?.output) {
                    specVerificationResults = specVerifyResult.output;
                    specVerificationCoverage = specVerifyResult.output.coverage || 0;
                    if (!specVerifyResult.output.verified) {
                        specVerificationFailed = true;
                        ledger.record({ instrument: 'spec', ok: false, error: `specification verification failed: ${specVerifyResult.output.missingRequirements?.join(', ') || 'requirements not met'}` });
                        syncFromLedger();
                        say(pick(isAr,
                            `⛔ التحقق من المواصفة فشل: ${specVerifyResult.output.missingRequirements?.join(', ')}`,
                            `⛔ Specification verification failed: ${specVerifyResult.output.missingRequirements?.join(', ')}`));
                    } else {
                        ledger.record({ instrument: 'spec', ok: true });
                        syncFromLedger();
                        say(pick(isAr,
                            `✅ التحقق من المواصفة نجح (${Math.round(specVerificationCoverage * 100)}% تغطية)`,
                            `✅ Specification verification passed (${Math.round(specVerificationCoverage * 100)}% coverage)`));
                    }
                } else {
                    specVerificationFailed = true;
                    const msg = specVerifyResult?.error || 'specification verification tool failed';
                    ledger.record({ instrument: 'spec', ok: false, error: `specification verification error: ${msg}` });
                    syncFromLedger();
                    appendBoundedPipelineLog(logs, `[pipeline] specification verification error: ${msg}`);
                    say(pick(isAr,
                        `⛔ تعذّر التحقق من المواصفة: ${msg}`,
                        `⛔ Specification verification error: ${msg}`));
                }
            } catch (specVerifyError: any) {
                specVerificationFailed = true;
                const message = String(specVerifyError?.message || specVerifyError).slice(0, 420);
                ledger.record({ instrument: 'spec', ok: false, error: `specification verification error: ${message}` });
                syncFromLedger();
                appendBoundedPipelineLog(logs, `[pipeline] specification verification error: ${message}`);
                say(pick(isAr,
                    `⛔ تعذّر التحقق من المواصفة: ${message}`,
                    `⛔ Specification verification error: ${message}`));
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
        // Browser QA is a required instrument whenever it was able to run.
        if (browserQaTarget) deliveryRequired = Array.from(new Set<DeliveryInstrument>([...deliveryRequired, 'browser']));
        const finalDeliveryVerdict = verified
            ? syncFromLedger(true)
            : deliveryVerdict({ phaseVerified: false, requestFidelityBlocked, measurements: ledger.all() });
        const partialDelivery = finalDeliveryVerdict.partial;
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
                : finalVerified ? 'passed'
                    : requestCoverageFailed ? 'requested_records_missing'
                        : browserQaFailed ? 'browser_qa_failed' : String(pipeline?.verificationStatus || 'failed');
        const finalDeliveryStatus = requestFidelityBlocked
            ? 'blocked'
            : verificationUnavailable ? 'not_verified'
                : finalVerified ? 'delivered'
                    // A requested record measured missing blocks — it is never a partial delivery.
                    : finalDeliveryVerdict.coverageFailed ? 'blocked'
                    : ((finalDeliveryVerdict.unread.length || finalDeliveryVerdict.unverified.length) && !finalDeliveryVerdict.failures.length) ? 'not_verified'
                        : (partialDelivery || done > 0) ? 'partial' : 'blocked';
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
            specVerificationFailed,
            specVerificationCoverage,
            requestCoverageFailed,
            requestCoverageMissing: (requestCoverage?.missing || []).map(record => record.key),
        });

        const summary = this.buildDeliveryReport({
            language: isAr ? 'ar' : 'en',
            projectName: String(plannerResult.output.projectName || 'project'),
            phases, pipeline, done, total, verified: finalVerified, liveUrl, liveRunError, liveRepairStatus, scopeAudit, scopeRepairStatus, browserQa, requestCoverage,
            externalApi: runtimeProjectHandoff?.externalApi,
            decisionEvidence, verificationUnavailable,
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

                ...(specVerificationFailed ? { specVerificationFailed: true } : {}),
                ...(specVerificationResults ? { specVerificationResults } : {}),
                ...(finalHonestBlocker ? { honestBlocker: true } : {}),
                ...(liveRunVerificationFailed ? { honestBlocker: true } : {}),
                ...(liveRepairAttempted ? { liveRepairAttempted: true, liveRepairStatus } : {}),
                ...(browserQaRepairAttempted ? { browserQaRepairAttempted: true, browserQaRepairStatus } : {}),
                ...(browserQaCoverageRetryAttempted ? { browserQaCoverageRetryAttempted: true, browserQaCoverageRetryStatus } : {}),
                ...(browserQaInfrastructureRetryAttempted ? { browserQaInfrastructureRetryAttempted: true, browserQaInfrastructureRetryStatus } : {}),
                ...(scopeRepairAttempted ? { scopeRepairAttempted: true, scopeRepairStatus } : {}),
                ...(scopeCoverageFailed ? { scopeCoverageFailed: true } : {}),
                ...(partialDelivery ? { partialDelivery: true } : {}),
                ...(scopeAudit ? { scopeAudit } : {}),
                ...(requestCoverage ? { requestCoverage } : {}),
                ...(requestCoverageFailed ? { requestCoverageFailed: true } : {}),
                ...(requestCoverageRepairAttempted ? { requestCoverageRepairAttempted: true, requestCoverageRepairStatus } : {}),
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
    private async readRequestedSpecifications(request: string, evidence: any, context: any, logs: string[], say: (message: string) => void, isAr: boolean): Promise<{ content: string; sources: Array<{ path: string; lineCount: number }>; error?: string; specificationId: string }> {
        const asksToRead = requestRequiresLocalSpecification(request);
        // The issued scope already admitted build/repair work. Its required
        // sources remain binding even when the user says fix/edit rather than build.
        if (asksToRead && hasEngineeringToken(context)) return this.readScopedSpecifications(request, evidence, context, logs, say, isAr);
        const asksToExecute = /(?:نف[ّذذ]|ابن|طو[ّو]ر|طبق|execute|implement|build|develop|create|run)/i.test(request);
        if (!asksToRead || !asksToExecute) return { content: '', sources: [], specificationId: '' };

        const files = Array.isArray(evidence?.instructionFiles) ? evidence.instructionFiles : [];
        const named = files.filter((file: any) => /(?:spec|require|brief|مواصف|متطلبات)/i.test(String(file?.relativePath || '')));
        const selected = named.length ? named : files.length === 1 ? files : [];
        if (!selected.length) {
            return {
                content: '',
                sources: [],
                specificationId: '',
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
                    content: '', sources: [], specificationId: '',
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
                        content: '', sources: [], specificationId: '',
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
            return { content: '', sources: [], specificationId: '', error: pick(isAr, 'لم تتوفر مواصفة مقروءة كاملة للتخطيط الآمن.', 'No complete specification was available for safe planning.') };
        }
        // Generate a specification ID from the first source
        const specificationId = `spec_${Date.now()}_${sources[0]?.path?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown'}`;
        return { content: sections.join('\n\n'), sources, specificationId };
    }

    /** Complete, bounded source intake for the immutable current engineering owner. */
    private async readScopedSpecifications(request: string, evidence: any, context: any, logs: string[], say: (message: string) => void, isAr: boolean): Promise<{ content: string; sources: Array<{ path: string; lineCount: number }>; error?: string; specificationId: string }> {
        const fail = (error: string) => ({ content: '', sources: [], specificationId: '', error });
        const scope = engineeringScope(context);
        if (!scope || evidence?.workspaceRoot !== scope.root) return fail('engineering_scope_invalid');
        const documents = Array.isArray(evidence.documentFiles) ? evidence.documentFiles : [];
        if (evidence.blockers?.some((item: any) => item.code === 'discovery_coverage_limited')) return fail('specification_discovery_incomplete');
        const readingClauses = Array.from(request.matchAll(/(?:read|inspect|review|اقرأ|قراءة)[^\n;!?؟]*/giu), match => match[0]).join('\n');
        const mentionedFiles = Array.from(readingClauses.matchAll(/[^\s"'`<>]+\.[A-Za-z0-9]{1,12}\b/gu), match => match[0]);
        if (mentionedFiles.some(name => !/\.(?:txt|md)$/iu.test(name))) return fail('specification_extension_unsupported');
        const mentions = mentionedFiles;
        const cleanPath = (value: unknown): string => {
            if (typeof value !== 'string' || !value || /[\\\u0000-\u001f\u007f:]/u.test(value) || value.startsWith('/')) return '';
            const normalized = value.replace(/^\.\//u, '');
            if (normalized.split('/').some(part => !part || part === '.' || part === '..') || !/\.(?:txt|md)$/iu.test(normalized)) return '';
            return normalized;
        };
        if (mentions.some(name => !cleanPath(name))) return fail('specification_path_invalid');
        const named = [...new Set(mentions.map(cleanPath))];
        const selected = named.length ? named.map(relativePath => documents.find((file: any) => file.relativePath === relativePath))
            : documents.filter((file: any) => /(?:spec|require|brief|prd|مواصف|متطلبات)/iu.test(file.relativePath));
        if (!selected.length || selected.some((file: any) => !file) || !named.length && selected.length !== 1 || selected.length > 4)
            return fail('specification_missing_or_ambiguous');
        const sections: string[] = [], sources: Array<{ path: string; lineCount: number }> = [];
        for (const file of selected) {
            const relativePath = cleanPath(file.relativePath);
            if (!relativePath || !Number.isInteger(file.size) || file.size < 0 || file.size > 128 * 1024) return fail('specification_file_limit');
            const absolute = path.join(scope.root, relativePath);
            if (!isWithinRoot(absolute, scope.root)) return fail('specification_path_invalid');
            say(pick(isAr, `[pipeline] أقرأ المواصفة كاملة: ${relativePath}`, `[pipeline] Reading complete local specification: ${relativePath}`));
            const snapshots: string[] = [];
            let expectedLines = 0;
            for (let pass = 0; pass < 2; pass++) {
                const chunks: string[] = [];
                let total = 0;
                for (let startLine = 1; startLine <= (total || 1); startLine += 1000) {
                    if (!engineeringScope(context)) return fail('engineering_scope_invalid');
                    const read = await executeTool('read_file', { path: absolute, startLine, endLine: Math.min(startLine + 999, total || 1000) }, context);
                    if (!engineeringScope(context)) return fail('engineering_scope_invalid');
                    const output = read?.output;
                    if (!read?.ok || !output || typeof output.content !== 'string' || !Number.isInteger(output.totalLines)
                        || output.totalLines < 1 || output.totalLines > 10000 || typeof output.truncated !== 'boolean') return fail('specification_read_incomplete');
                    if (total && output.totalLines !== total || expectedLines && output.totalLines !== expectedLines) return fail('specification_changed');
                    total = output.totalLines;
                    const end = Math.min(startLine + 999, total);
                    if (output.truncated !== (total > end) || output.content.split('\n').length !== end - startLine + 1) return fail('specification_read_incomplete');
                    chunks.push(output.content);
                    if (Buffer.byteLength(chunks.join('\n'), 'utf8') > 128 * 1024 || JSON.stringify(chunks.join('\n')).length > DISCOVERY_EVIDENCE_MAX_CHARS)
                        return fail('specification_planner_budget_exceeded');
                    appendBoundedPipelineLogs(logs, read.logs);
                }
                const completeSnapshot = chunks.join('\n');
                // Description/code-fence semantics require the whole document;
                // a page must never forget a fence or JSON object opened earlier.
                if (!autonomousFileTextIsSafe(completeSnapshot, { allowRequirementDescriptions: true })) return fail('specification_sensitive_content');
                expectedLines = total; snapshots.push(completeSnapshot);
            }
            if (snapshots[0] !== snapshots[1] || Buffer.byteLength(snapshots[0], 'utf8') !== file.size) return fail('specification_changed');
            sections.push(`SOURCE: ${relativePath}\n${snapshots[0]}`); sources.push({ path: relativePath, lineCount: expectedLines });
            if (JSON.stringify({ content: sections.join('\n\n'), sources }).length > DISCOVERY_EVIDENCE_MAX_CHARS) return fail('specification_planner_budget_exceeded');
            appendBoundedPipelineLog(logs, `pipeline.specification_read=${relativePath} lines=1-${expectedLines}`);
        }
        return { content: sections.join('\n\n'), sources, specificationId: 'scoped-current-source' };
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
        requestCoverage?: RequestCoverageReport;
        externalApi?: TrustedRuntimeProjectHandoff['externalApi'];
        decisionEvidence?: PipelineDecisionEvidence;
        verificationUnavailable?: boolean;
    }): string {
        const { language: lang, projectName, phases, pipeline, done, total, verified, liveUrl, liveRunError, liveRepairStatus, scopeAudit, scopeRepairStatus, browserQa, externalApi, decisionEvidence, verificationUnavailable, requestCoverage } = args;
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
        lines.push(verified
            ? (ar ? `## ✅ اكتمل المشروع: ${projectName}` : `## ✅ Project delivered: ${projectName}`)
            : verificationUnavailable
                ? (ar ? `## ⚠️ لم أستطع التحقق من المشروع: ${projectName}` : `## ⚠️ Project could not be verified: ${projectName}`)
                : (ar ? `## ⚠️ توقف البناء بصدق: ${projectName}` : `## ⚠️ Build stopped honestly: ${projectName}`));

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
            : verified
                ? (ar
                    ? `**المراحل:** ${done}/${total} نُفِّذت وتحقَّقت (تنفيذ فعلي + فحوص، لا مجرد كتابة ملفات).`
                    : `**Phases:** ${done}/${total} executed and verified (real execution + checks, not just written files).`)
                : (ar
                    ? `**المراحل:** ${done}/${total} نُفِّذت، لكن تحقق التسليم الحي لم ينجح.`
                    : `**Phases:** ${done}/${total} executed, but live delivery verification did not pass.`));
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

        if (requestCoverage) {
            // What he named, record by record. «0 checked» is said as such —
            // never as «all built».
            // «not measured» is said as such — a record the probe could not see is never counted as proven.
            const applies = (value: boolean | null, measuredHere: boolean) => measuredHere || value !== null;
            const mark = (value: boolean | null, measuredHere: boolean, yes: string, no: string) => !applies(value, measuredHere) ? ''
                : value === null ? (ar ? `${yes}: لم يُقَس` : `${yes}: not measured`) : value ? yes : no;
            const unverifiedCount = (requestCoverage.unverified || []).length;
            lines.push('');
            lines.push(ar
                ? `### السجلات التي طلبتها: ${requestCoverage.checked - requestCoverage.missing.length - unverifiedCount}/${requestCoverage.checked} مثبتة`
                : `### The records you named: ${requestCoverage.checked - requestCoverage.missing.length - unverifiedCount}/${requestCoverage.checked} proven`);
            for (const record of requestCoverage.records.slice(0, 24)) {
                const facts = [
                    mark(record.served, requestCoverage.servedApplies, ar ? 'مخدوم' : 'served', ar ? 'غير مخدوم' : 'not served'),
                    mark(record.tested, !!requestCoverage.testsRequested, ar ? 'مختبر' : 'tested', ar ? 'بلا اختبار' : 'untested'),
                    mark(record.present, !requestCoverage.servedApplies, ar ? 'مبني' : 'built', ar ? 'غير مبني' : 'not built'),
                ].filter(Boolean).join(ar ? '، ' : ', ');
                lines.push(`- ${record.ar && record.ar !== record.key ? `${record.ar} (${record.key})` : record.key}: ${facts}`);
            }
            if (requestCoverage.testsRun) {
                const run = requestCoverage.testsRun;
                lines.push(ar
                    ? `- اختباراتك (${run.runner || 'tests'}): ${run.passed ? 'شُغّلت ونجحت' : run.ran ? 'شُغّلت وفشلت' : 'لم تُشغَّل'}`
                    : `- Your tests (${run.runner || 'tests'}): ${run.passed ? 'ran and passed' : run.ran ? 'ran and failed' : 'did not run'}`);
            }
            if (requestCoverage.unread.length) {
                lines.push(ar
                    ? `- لم أستطع قراءتها كسجلات، فلم أتحقق من تسليمها: ${requestCoverage.unread.join('، ')}`
                    : `- Could not read these as records, so their delivery is not verified: ${requestCoverage.unread.join(', ')}`);
            }
            if ((requestCoverage.capabilities || []).length) {
                lines.push(ar
                    ? `- قاعدة طلبتها ولم يقِسها فحص حي بعد، فلم أتحقق منها: ${(requestCoverage.capabilities || []).join('، ')}`
                    : `- A rule you stated that no live check measures yet, so it is not verified: ${(requestCoverage.capabilities || []).join(', ')}`);
            }
        }

        if (browserQa) {
            lines.push('');
            if (browserQa.skipped) {
                lines.push(ar
                    ? `### Browser QA المرئي: **لم يُجرَ** — ${browserQa.skipped}`
                    : `### Visible Browser QA: **not run** — ${browserQa.skipped}`);
            } else {
                const high = browserQa.findings.filter((finding) => finding.severity === 'high').length;
                const measuredActions = browserQa.exploratoryActions ?? browserQa.pressed ?? 0;
                lines.push(ar
                    ? `### Browser QA المرئي: **${browserQa.score}/100** — ${browserQa.findings.length} ملاحظة، ${high} حرجة، ${measuredActions} فعلاً استكشافياً عبر ${browserQa.statesVisited ?? 0} حالة.`
                    : `### Visible Browser QA: **${browserQa.score}/100** — ${browserQa.findings.length} finding(s), ${high} blocking, ${measuredActions} exploratory action(s) across ${browserQa.statesVisited ?? 0} discovered state(s).`);
                const apiProof = browserQa.externalApiRuntime;
                if (apiProof) {
                    const apiMeta = externalApi;
                    if (apiMeta) {
                        const runtimeStatus = apiProof.successfulRequests > 0 && apiProof.responseMatchedRenderedResult
                            ? (ar ? 'مثبت أثناء التشغيل' : 'runtime verified')
                            : (ar ? 'غير مثبت أثناء التشغيل' : 'runtime unverified');
                        lines.push(ar
                            ? `- API خارجي: ${apiMeta.providerName} · المصادقة: ${apiMeta.auth} · صحة الفهرس: ${apiMeta.health.toLowerCase()} · التشغيل: ${runtimeStatus}.`
                            : `- External API: ${apiMeta.providerName} · Auth: ${apiMeta.auth} · Catalog health: ${apiMeta.health.toLowerCase()} · Runtime: ${runtimeStatus}.`);
                    }
                    lines.push(ar
                        ? `- دليل API: ${apiProof.integrationProfileId}؛ ${apiProof.successfulRequests} طلب ناجح؛ تطابق النتيجة=${apiProof.responseMatchedRenderedResult}؛ التحميل=${apiProof.loadingObserved}؛ الخطأ=${apiProof.errorObserved}؛ التعافي=${apiProof.recoveredAfterError}.`
                        : `- API evidence: ${apiProof.integrationProfileId}; ${apiProof.successfulRequests} successful request(s); resultMatched=${apiProof.responseMatchedRenderedResult}; loading=${apiProof.loadingObserved}; error=${apiProof.errorObserved}; recovery=${apiProof.recoveredAfterError}.`);
                    if (apiProof.invalidInputRejected !== undefined || apiProof.selectionChanged !== undefined) {
                        lines.push(ar
                            ? `- مدخل العملة الخاطئ مرفوض=${apiProof.invalidInputRejected}؛ تغيير زوج العملات=${apiProof.selectionChanged}.`
                            : `- Invalid currency input rejected=${apiProof.invalidInputRejected}; currency pair changed=${apiProof.selectionChanged}.`);
                    }
                    if (apiProof.renderedResult) lines.push(ar
                        ? `- النتيجة الحية المرئية: ${apiProof.renderedResult}`
                        : `- Visible live result: ${apiProof.renderedResult}`);
                    if (apiProof.errorText) lines.push(ar
                        ? `- حالة الخطأ المرئية: ${apiProof.errorText}`
                        : `- Visible error state: ${apiProof.errorText}`);
                }
                if (browserQa.findings.length) {
                    for (const finding of browserQa.findings.slice(0, 12)) {
                        const evidence = Array.isArray((finding as any).evidence) ? (finding as any).evidence[0] : null;
                        const target = evidence && typeof evidence === 'object'
                            ? String(evidence.selector || evidence.sel || evidence.label || '').trim()
                            : '';
                        const targetSuffix = target ? (ar ? ` — الهدف: \`${target}\`` : ` — target: \`${target}\``) : '';
                        lines.push(`- ${finding.severity.toUpperCase()}: ${findingText(finding as any, ar)}${targetSuffix}`);
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
                const msg = redactDeliveryCredentials(guardUnverifiedBuilderClaims(String(t?.message || '').trim(), verified, ar));
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
