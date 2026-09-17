import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type VerificationMode = 'focused' | 'affected' | 'final';
export type VerificationResult = 'passed' | 'failed' | 'cancelled' | 'timed_out' | 'incomplete';

export interface VerificationReceipt {
    checkId: string;
    fingerprint: string;
    mode: VerificationMode;
    result: VerificationResult;
    tool: string;
    workspaceId: string;
    scopeRoot: string;
    relevantPaths: string[];
    boundary?: string;
    runtimeTarget?: string;
    runtimeRevision?: string;
    toolchain: string;
    command?: string;
    evidenceLocation?: string;
    fingerprintDurationMs: number;
    queueMs: number;
    idleMs: number;
    retryCount: number;
    decisionReason: string;
    durationMs: number;
    recordedAt: number;
}

export interface VerificationDecision {
    checkId: string;
    action: 'selected' | 'reused' | 'invalidated';
    reason: string;
    fingerprint: string;
    at: number;
}

export interface VerificationLedger {
    version: 1;
    receipts: VerificationReceipt[];
    decisions: VerificationDecision[];
    accounting: {
        executions: number;
        selected: number;
        invalidated: number;
        reused: number;
        executedDurationMs: number;
        fingerprintDurationMs: number;
        estimatedSavedDurationMs: number;
        complete: boolean;
    };
}

export interface VerificationDescriptor {
    checkId: string;
    tool: string;
    args?: Record<string, unknown>;
    workspaceId?: string;
    workspaceRoot?: string;
    scopeRoot: string;
    relevantPaths?: string[];
    boundary?: string;
    boundaries?: VerificationBoundaryMap;
    runtimeTarget?: string;
    runtimeRevision?: string;
    mode?: VerificationMode;
}

export interface VerificationBoundary {
    paths: string[];
    dependsOn: string[];
    incomplete?: boolean;
}

export type VerificationBoundaryMap = Record<string, VerificationBoundary>;

export interface VerificationSelection {
    action: 'run' | 'reuse';
    reason: string;
    fingerprint: string;
    descriptor: Required<Pick<VerificationDescriptor, 'checkId' | 'tool' | 'scopeRoot'>> & {
        workspaceId: string;
        relevantPaths: string[];
        boundary?: string;
        runtimeTarget?: string;
        runtimeRevision?: string;
        mode: VerificationMode;
        toolchain: string;
        command?: string;
        fingerprintDurationMs: number;
    };
    cacheable: boolean;
    receipt?: VerificationReceipt;
}

export interface VerificationEvidenceMetrics {
    evidenceLocation?: string;
    queueMs?: number;
    idleMs?: number;
    retryCount?: number;
}

const MAX_RECEIPTS = 96;
const MAX_DECISIONS = 192;
const MAX_FILES = 4_000;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const IGNORED_DIRECTORIES = new Set([
    '.git', '.joe', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache', '.turbo',
]);
const ALWAYS_RELEVANT_FILES = [
    'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock',
    'tsconfig.json', 'tsconfig.build.json', 'vite.config.ts', 'vite.config.js', 'jest.config.ts',
    'jest.config.js', 'eslint.config.js', 'eslint.config.mjs', '.eslintrc', '.eslintrc.json',
];

export function createVerificationLedger(): VerificationLedger {
    return { version: 1, receipts: [], decisions: [], accounting: {
        executions: 0, selected: 0, invalidated: 0, reused: 0,
        executedDurationMs: 0, fingerprintDurationMs: 0,
        estimatedSavedDurationMs: 0, complete: true,
    } };
}

const ACCOUNTING_KEYS = ['executions', 'selected', 'invalidated', 'reused', 'executedDurationMs', 'fingerprintDurationMs', 'estimatedSavedDurationMs'] as const;

function addAccounting(ledger: VerificationLedger, key: typeof ACCOUNTING_KEYS[number], amount: number) {
    if (!Number.isFinite(amount) || amount < 0) { ledger.accounting.complete = false; return; }
    const next = ledger.accounting[key] + amount;
    if (next > Number.MAX_SAFE_INTEGER) ledger.accounting.complete = false;
    ledger.accounting[key] = Math.min(next, Number.MAX_SAFE_INTEGER);
}

function boundedText(value: unknown, max = 500): string {
    return String(value ?? '').trim().slice(0, max);
}

function redactedText(value: unknown, max = 500): string {
    return boundedText(value, max)
        .replace(/(authorization|bearer|token|password|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
        .replace(/gh[pousr]_[A-Za-z0-9_-]{16,}/gu, '[REDACTED]');
}

function normaliseMode(value: unknown): VerificationMode {
    return value === 'final' || value === 'affected' ? value : 'focused';
}

function normaliseResult(value: unknown): VerificationResult {
    return value === 'passed' || value === 'failed' || value === 'cancelled'
        || value === 'timed_out' || value === 'incomplete'
        ? value
        : 'incomplete';
}

function resolvedInside(root: string, candidate: string): string | null {
    const resolvedRoot = path.resolve(root);
    const resolved = path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : path.resolve(resolvedRoot, candidate);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return resolved;
    return null;
}

function readableContainedPath(root: string, candidate: string): boolean {
    const resolved = resolvedInside(root, candidate);
    if (!resolved) return false;
    try {
        const realRoot = fs.realpathSync(root);
        if (!resolvedInside(realRoot, fs.realpathSync(resolved))) return false;
        // Checking only the leaf misses a junction in an ancestor directory.
        let current = path.resolve(root);
        if (fs.lstatSync(current).isSymbolicLink()) return false;
        for (const part of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
            current = path.join(current, part);
            if (fs.lstatSync(current).isSymbolicLink()) return false;
        }
        return true;
    } catch { return false; }
}

function compactReceipt(value: unknown): VerificationReceipt | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const checkId = boundedText(raw.checkId, 240);
    const fingerprint = boundedText(raw.fingerprint, 128);
    const tool = boundedText(raw.tool, 120);
    const scopeRoot = boundedText(raw.scopeRoot, 1_000);
    if (!checkId || !fingerprint || !tool || !scopeRoot) return null;
    return {
        checkId,
        fingerprint,
        mode: normaliseMode(raw.mode),
        result: normaliseResult(raw.result),
        tool,
        workspaceId: boundedText(raw.workspaceId, 240),
        scopeRoot,
        relevantPaths: Array.isArray(raw.relevantPaths)
            ? raw.relevantPaths.map(item => boundedText(item, 1_000)).filter(Boolean).slice(0, 64)
            : [],
        ...(boundedText(raw.boundary, 160) ? { boundary: boundedText(raw.boundary, 160) } : {}),
        ...(boundedText(raw.runtimeTarget, 1_000) ? { runtimeTarget: boundedText(raw.runtimeTarget, 1_000) } : {}),
        ...(boundedText(raw.runtimeRevision, 240) ? { runtimeRevision: boundedText(raw.runtimeRevision, 240) } : {}),
        toolchain: boundedText(raw.toolchain, 500),
        ...(boundedText(raw.command, 1_000) ? { command: boundedText(raw.command, 1_000) } : {}),
        ...(boundedText(raw.evidenceLocation, 1_000) ? { evidenceLocation: boundedText(raw.evidenceLocation, 1_000) } : {}),
        fingerprintDurationMs: Math.max(0, Math.min(Number(raw.fingerprintDurationMs) || 0, 60_000)),
        queueMs: Math.max(0, Math.min(Number(raw.queueMs) || 0, 24 * 60 * 60 * 1_000)),
        idleMs: Math.max(0, Math.min(Number(raw.idleMs) || 0, 24 * 60 * 60 * 1_000)),
        retryCount: Math.max(0, Math.min(Math.floor(Number(raw.retryCount) || 0), 100)),
        decisionReason: boundedText(raw.decisionReason, 500),
        durationMs: Math.max(0, Math.min(Number(raw.durationMs) || 0, 24 * 60 * 60 * 1_000)),
        recordedAt: Math.max(0, Number(raw.recordedAt) || 0),
    };
}

export function compactVerificationLedger(value: unknown): VerificationLedger {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return createVerificationLedger();
    const raw = value as Record<string, unknown>;
    const receipts = Array.isArray(raw.receipts)
        ? raw.receipts.map(compactReceipt).filter((item): item is VerificationReceipt => Boolean(item)).slice(-MAX_RECEIPTS)
        : [];
    const decisions = Array.isArray(raw.decisions)
        ? raw.decisions.flatMap((item): VerificationDecision[] => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
            const decision = item as Record<string, unknown>;
            const action = decision.action === 'reused' || decision.action === 'invalidated'
                ? decision.action
                : 'selected';
            const checkId = boundedText(decision.checkId, 240);
            const fingerprint = boundedText(decision.fingerprint, 128);
            if (!checkId || !fingerprint) return [];
            return [{
                checkId,
                action,
                reason: boundedText(decision.reason, 500),
                fingerprint,
                at: Math.max(0, Number(decision.at) || 0),
            }];
        }).slice(-MAX_DECISIONS)
        : [];
    // Receipts are a bounded reuse cache, not an execution history. Keep the
    // cumulative counters separately so replacement/eviction cannot erase cost.
    const accounting = createVerificationLedger().accounting;
    const saved = raw.accounting as Record<string, unknown> | undefined;
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        accounting.complete = saved.complete === true;
        for (const key of ACCOUNTING_KEYS) {
            const amount = saved[key];
            if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && amount <= Number.MAX_SAFE_INTEGER) {
                accounting[key] = amount;
            } else accounting.complete = false;
        }
    } else {
        // Older persisted ledgers cannot reconstruct overwritten attempts.
        accounting.complete = receipts.length === 0 && decisions.length === 0;
        accounting.executions = receipts.length;
        for (const decision of decisions) accounting[decision.action]++;
        accounting.executedDurationMs = receipts.reduce((sum, receipt) => sum + receipt.durationMs, 0);
        accounting.fingerprintDurationMs = receipts.reduce((sum, receipt) => sum + receipt.fingerprintDurationMs, 0);
    }
    return { version: 1, receipts, decisions, accounting };
}

export function compactVerificationBoundaries(value: unknown): VerificationBoundaryMap {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const output: VerificationBoundaryMap = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [rawName, rawBoundary] of entries.slice(0, 64)) {
        const name = boundedText(rawName, 160);
        if (!name || !rawBoundary || typeof rawBoundary !== 'object' || Array.isArray(rawBoundary)) continue;
        const boundary = rawBoundary as Record<string, unknown>;
        const paths = Array.isArray(boundary.paths)
            ? boundary.paths.map(item => boundedText(item, 1_000)).filter(Boolean).slice(0, 64)
            : [];
        const dependsOn = Array.isArray(boundary.dependsOn)
            ? boundary.dependsOn.map(item => boundedText(item, 160)).filter(Boolean).slice(0, 32)
            : [];
        const incomplete = boundary.incomplete === true || entries.length > 64 || rawName !== name
            || !Array.isArray(boundary.paths) || boundary.paths.length > 64
            || boundary.paths.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 1_000)
            || (boundary.dependsOn !== undefined && (!Array.isArray(boundary.dependsOn)
                || boundary.dependsOn.length > 32
                || boundary.dependsOn.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 160)));
        if (paths.length) output[name] = { paths, dependsOn, ...(incomplete ? { incomplete: true } : {}) };
    }
    return output;
}

function boundaryPaths(boundaries: VerificationBoundaryMap, boundaryName: string): { paths: string[]; complete: boolean } {
    const paths: string[] = [];
    const seen = new Set<string>();
    let complete = true;
    const visit = (name: string) => {
        if (seen.has(name)) return;
        seen.add(name);
        const boundary = boundaries[name];
        if (!boundary || boundary.incomplete) { complete = false; return; }
        paths.push(...boundary.paths);
        for (const dependency of boundary.dependsOn) visit(dependency);
    };
    if (boundaryName) visit(boundaryName);
    return { paths: Array.from(new Set(paths)), complete };
}

function safeRuntimeTarget(value: unknown): string {
    const text = boundedText(value, 1_000);
    if (!text) return '';
    try {
        const parsed = new URL(text);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.slice(0, 1_000);
    } catch {
        return text;
    }
}

function safeRuntimeRevision(value: unknown): string {
    const text = boundedText(value, 1_000);
    return text ? `sha256:${crypto.createHash('sha256').update(text).digest('hex')}` : '';
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    const volatile = new Set(['sessionId', 'runId', 'traceId', 'browserSessionId', 'onProgress', 'onThought']);
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !volatile.has(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)]));
}

type FingerprintBudget = { bytes: number; overflow: boolean; incomplete: boolean };

function collectFiles(target: string, root: string, files: string[], budget: FingerprintBudget) {
    if (budget.overflow || files.length >= MAX_FILES) {
        budget.overflow = true;
        return;
    }
    if (!readableContainedPath(root, target)) { budget.incomplete = true; return; }
    let stat: fs.Stats;
    try { stat = fs.lstatSync(target); } catch { budget.incomplete = true; return; }
    if (stat.isSymbolicLink()) { budget.incomplete = true; return; }
    if (stat.isFile()) {
        budget.bytes += stat.size;
        if (budget.bytes > MAX_TOTAL_BYTES) {
            budget.overflow = true;
            return;
        }
        files.push(target);
        return;
    }
    if (!stat.isDirectory()) { budget.incomplete = true; return; }
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(target, { withFileTypes: true }); } catch { budget.incomplete = true; return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
        collectFiles(path.join(target, entry.name), root, files, budget);
        if (budget.overflow) return;
    }
}

// Process-local HMAC avoids persisting environment values or guessable secret
// hashes. A process restart conservatively invalidates prior environment proof.
const environmentFingerprintKey = crypto.randomBytes(32);
function environmentIdentity(): string {
    const digest = crypto.createHmac('sha256', environmentFingerprintKey);
    for (const key of Object.keys(process.env).sort()) {
        digest.update(JSON.stringify([key, process.env[key]]));
    }
    return digest.digest('hex');
}

function toolchainIdentity(root: string, budget: FingerprintBudget): string {
    let packageManager = '';
    const manifestPath = path.join(root, 'package.json');
    try {
        fs.lstatSync(manifestPath);
        if (readableContainedPath(root, manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            packageManager = boundedText(manifest?.packageManager, 120);
        } else budget.incomplete = true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') budget.incomplete = true;
    }
    return `node=${process.version};modules=${process.versions.modules || ''};platform=${process.platform}-${process.arch};packageManager=${packageManager};environment=${environmentIdentity()}`;
}

function scopePaths(descriptor: VerificationDescriptor): { paths: string[]; narrowedSafe: boolean } {
    const root = path.resolve(descriptor.scopeRoot);
    const workspaceRoot = path.resolve(descriptor.workspaceRoot || root);
    const mode = normaliseMode(descriptor.mode);
    const boundaryScope = boundaryPaths(
        compactVerificationBoundaries(descriptor.boundaries),
        boundedText(descriptor.boundary, 160),
    );
    const explicit = mode === 'final'
        ? []
        : [...(Array.isArray(descriptor.relevantPaths) ? descriptor.relevantPaths : []), ...boundaryScope.paths];
    const explicitResolved = explicit.map(item => {
        if (path.isAbsolute(item)) {
            const absolute = resolvedInside(root, item);
            return absolute && fs.existsSync(absolute) ? absolute : null;
        }
        const candidates = [
            resolvedInside(root, path.resolve(workspaceRoot, item)),
            resolvedInside(root, path.resolve(root, item)),
        ].filter((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));
        const unique = Array.from(new Set(candidates.map(candidate => path.resolve(candidate))));
        return unique.length === 1 ? unique[0] : null;
    });
    // A model-written path outside the trusted scope must make reuse more
    // conservative, never narrower. Fingerprint the whole project instead of
    // silently dropping the unsafe path and accidentally reusing stale proof.
    const narrowedSafe = mode === 'final' || (boundaryScope.complete && (!explicit.length || explicitResolved.every(Boolean)));
    const resolved = mode !== 'final' && explicit.length && narrowedSafe
        ? explicitResolved.filter((item): item is string => Boolean(item))
        : [root];
    for (const config of ALWAYS_RELEVANT_FILES) {
        const candidate = path.join(root, config);
        if (fs.existsSync(candidate)) resolved.push(candidate);
    }
    return {
        paths: Array.from(new Set(resolved.map(item => path.resolve(item)))).sort(),
        narrowedSafe,
    };
}

export function fingerprintVerification(descriptor: VerificationDescriptor): VerificationSelection {
    const fingerprintStartedAt = Date.now();
    const scopeRoot = path.resolve(descriptor.scopeRoot);
    const workspaceRoot = descriptor.workspaceRoot ? path.resolve(descriptor.workspaceRoot) : '';
    const trustedScope = workspaceRoot && readableContainedPath(workspaceRoot, scopeRoot);
    const mode = normaliseMode(descriptor.mode);
    const boundary = boundedText(descriptor.boundary, 160);
    const runtimeTarget = safeRuntimeTarget(descriptor.runtimeTarget);
    const runtimeRevision = safeRuntimeRevision(descriptor.runtimeRevision);
    const command = boundedText((descriptor.args || {}).command, 1_000);
    const baseToolchain = `node=${process.version};modules=${process.versions.modules || ''};platform=${process.platform}-${process.arch}`;
    if (!trustedScope) {
        const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
            checkId: boundedText(descriptor.checkId, 240),
            tool: boundedText(descriptor.tool, 120),
            workspaceId: boundedText(descriptor.workspaceId, 240),
            scopeRoot,
            workspaceRoot,
            nonce: Date.now(),
        })).digest('hex');
        return {
            action: 'run',
            reason: 'selected: trusted workspace containment is unavailable, so reuse and filesystem fingerprinting are disabled',
            fingerprint,
            cacheable: false,
            descriptor: {
                checkId: boundedText(descriptor.checkId, 240),
                tool: boundedText(descriptor.tool, 120),
                workspaceId: boundedText(descriptor.workspaceId, 240),
                scopeRoot,
                relevantPaths: [],
                ...(boundary ? { boundary } : {}),
                ...(runtimeTarget ? { runtimeTarget } : {}),
                ...(runtimeRevision ? { runtimeRevision } : {}),
                mode,
                toolchain: baseToolchain,
                ...(command ? { command } : {}),
                fingerprintDurationMs: Math.max(0, Date.now() - fingerprintStartedAt),
            },
        };
    }
    const scoped = scopePaths(descriptor);
    const relevant = scoped.paths;
    const files: string[] = [];
    const budget: FingerprintBudget = { bytes: 0, overflow: false, incomplete: false };
    for (const target of relevant) collectFiles(target, scopeRoot, files, budget);
    const toolchain = toolchainIdentity(scopeRoot, budget);
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify({
        checkId: boundedText(descriptor.checkId, 240),
        tool: boundedText(descriptor.tool, 120),
        args: stableValue(descriptor.args || {}),
        workspaceId: boundedText(descriptor.workspaceId, 240),
        scopeRoot,
        relevantPaths: relevant.map(item => path.relative(scopeRoot, item).replace(/\\/g, '/') || '.'),
        boundary,
        runtimeTarget,
        // Display-safe URLs omit query/fragment state, but reuse must not.
        // A process-local keyed digest retains identity without exposing tokens.
        runtimeTargetIdentity: crypto.createHmac('sha256', environmentFingerprintKey)
            .update(String(descriptor.runtimeTarget || '')).digest('hex'),
        runtimeRevision,
        mode,
        toolchain,
    }));
    if (budget.overflow) {
        hash.update(`overflow:${Date.now()}:${files.length}:${budget.bytes}`);
    } else {
        for (const file of files.sort()) {
            if (!readableContainedPath(scopeRoot, file)) { budget.incomplete = true; continue; }
            try {
                const content = fs.readFileSync(file);
                // Length framing prevents bytes moving across file boundaries
                // from producing the same input stream for different projects.
                hash.update(JSON.stringify([path.relative(scopeRoot, file).replace(/\\/g, '/'), content.length]));
                hash.update(content);
            } catch { budget.incomplete = true; }
        }
    }
    const browserStateNeedsRevision = /^(?:browser_|visual_qa$)/u.test(String(descriptor.tool || '').trim().toLowerCase())
        && (!runtimeTarget || !runtimeRevision);
    return {
        action: 'run',
        reason: browserStateNeedsRevision
            ? 'selected: browser verification has no trusted target revision, so stale visual evidence cannot be reused'
            : budget.incomplete
            ? 'selected: fingerprint inputs contain unsupported links or unreadable files, so reuse is disabled'
            : !scoped.narrowedSafe
            ? 'selected: declared verification paths were missing or ambiguous, so narrowed reuse is disabled'
            : budget.overflow
            ? 'selected: fingerprint budget exceeded, so reuse is disabled'
            : 'selected: no matching passing receipt',
        fingerprint: hash.digest('hex'),
        cacheable: !budget.overflow && !budget.incomplete && !browserStateNeedsRevision && scoped.narrowedSafe,
        descriptor: {
            checkId: boundedText(descriptor.checkId, 240),
            tool: boundedText(descriptor.tool, 120),
            workspaceId: boundedText(descriptor.workspaceId, 240),
            scopeRoot,
            relevantPaths: relevant.map(item => path.relative(scopeRoot, item).replace(/\\/g, '/') || '.'),
            ...(boundary ? { boundary } : {}),
            ...(runtimeTarget ? { runtimeTarget } : {}),
            ...(runtimeRevision ? { runtimeRevision } : {}),
            mode,
            toolchain,
            ...(command ? { command } : {}),
            fingerprintDurationMs: Math.max(0, Date.now() - fingerprintStartedAt),
        },
    };
}

function addDecision(ledger: VerificationLedger, decision: VerificationDecision) {
    addAccounting(ledger, decision.action, 1);
    ledger.decisions.push(decision);
    if (ledger.decisions.length > MAX_DECISIONS) ledger.decisions.splice(0, ledger.decisions.length - MAX_DECISIONS);
}

export function selectVerification(
    ledgerValue: unknown,
    descriptor: VerificationDescriptor,
    now = Date.now(),
): { ledger: VerificationLedger; selection: VerificationSelection } {
    const ledger = compactVerificationLedger(ledgerValue);
    const selection = fingerprintVerification(descriptor);
    addAccounting(ledger, 'fingerprintDurationMs', selection.descriptor.fingerprintDurationMs);
    const previous = [...ledger.receipts].reverse().find(receipt => receipt.checkId === selection.descriptor.checkId);
    if (selection.cacheable && previous?.result === 'passed' && previous.fingerprint === selection.fingerprint) {
        selection.action = 'reuse';
        selection.reason = 'reused: passing receipt matches all relevant inputs';
        selection.receipt = previous;
        addAccounting(ledger, 'estimatedSavedDurationMs', previous.durationMs);
        addDecision(ledger, {
            checkId: selection.descriptor.checkId,
            action: 'reused',
            reason: selection.reason,
            fingerprint: selection.fingerprint,
            at: now,
        });
        return { ledger, selection };
    }
    if (previous && previous.fingerprint !== selection.fingerprint) {
        selection.reason = 'invalidated: relevant content, configuration, arguments, workspace, environment, or toolchain changed';
        addDecision(ledger, {
            checkId: selection.descriptor.checkId,
            action: 'invalidated',
            reason: selection.reason,
            fingerprint: selection.fingerprint,
            at: now,
        });
    } else if (previous && previous.result !== 'passed') {
        selection.reason = `selected: previous ${previous.result} result is never reusable`;
        addDecision(ledger, {
            checkId: selection.descriptor.checkId,
            action: 'selected',
            reason: selection.reason,
            fingerprint: selection.fingerprint,
            at: now,
        });
    } else {
        addDecision(ledger, {
            checkId: selection.descriptor.checkId,
            action: 'selected',
            reason: selection.reason,
            fingerprint: selection.fingerprint,
            at: now,
        });
    }
    return { ledger, selection };
}

export function recordVerification(
    ledgerValue: unknown,
    selection: VerificationSelection,
    result: VerificationResult,
    durationMs: number,
    now = Date.now(),
    evidence: VerificationEvidenceMetrics = {},
): VerificationLedger {
    const ledger = compactVerificationLedger(ledgerValue);
    const receipt: VerificationReceipt = {
        ...selection.descriptor,
        fingerprint: selection.fingerprint,
        result,
        ...(boundedText(evidence.evidenceLocation, 1_000)
            ? { evidenceLocation: boundedText(evidence.evidenceLocation, 1_000) }
            : {}),
        queueMs: Math.max(0, Number(evidence.queueMs) || 0),
        idleMs: Math.max(0, Number(evidence.idleMs) || 0),
        retryCount: Math.max(0, Math.floor(Number(evidence.retryCount) || 0)),
        decisionReason: selection.reason,
        durationMs: Math.max(0, Math.round(durationMs || 0)),
        recordedAt: now,
    };
    ledger.receipts = ledger.receipts.filter(existing => existing.checkId !== receipt.checkId);
    addAccounting(ledger, 'executions', 1);
    addAccounting(ledger, 'executedDurationMs', durationMs);
    ledger.receipts.push(receipt);
    if (ledger.receipts.length > MAX_RECEIPTS) ledger.receipts.splice(0, ledger.receipts.length - MAX_RECEIPTS);
    return ledger;
}

export function verificationResultFrom(error: unknown, ok: boolean): VerificationResult {
    if (ok) return 'passed';
    const text = String((error as any)?.message || error || '').toLowerCase();
    if (/cancel(?:led|ation)|run_cancelled_by_owner/u.test(text)) return 'cancelled';
    if (/timed?\s*out|timeout/u.test(text)) return 'timed_out';
    return text ? 'failed' : 'incomplete';
}

export function verificationResultFromToolResult(value: unknown): VerificationResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'incomplete';
    const raw = value as Record<string, any>;
    const output = raw.output && typeof raw.output === 'object' ? raw.output : {};
    const status = String(output.status || raw.status || '').trim().toLowerCase();
    const error = output.error || raw.error || output.stderr || raw.stderr;
    if (/cancel(?:led|ation)|run_cancelled_by_owner/u.test(status) || output.cancelled === true) return 'cancelled';
    if (/timed?[_\s-]*out|timeout/u.test(status) || output.timedOut === true || raw.timedOut === true) return 'timed_out';
    if (raw.ok !== true || output.verificationFailed === true || /^(?:failed|error|partial|incomplete|blocked|fatal_error)$/u.test(status)) {
        return verificationResultFrom(error || status, false);
    }
    if (status && !/^(?:completed|passed|success|succeeded|ok)$/u.test(status)) return 'incomplete';
    return 'passed';
}

export function summarizeVerificationLedger(value: unknown) {
    const ledger = compactVerificationLedger(value);
    const latestReceipts = new Map<string, VerificationReceipt>();
    for (const receipt of ledger.receipts) latestReceipts.set(receipt.checkId, receipt);
    const receipts = Array.from(latestReceipts.values());
    return {
        receipts: receipts.length,
        passed: receipts.filter(receipt => receipt.result === 'passed').length,
        failed: receipts.filter(receipt => receipt.result === 'failed').length,
        cancelled: receipts.filter(receipt => receipt.result === 'cancelled').length,
        timedOut: receipts.filter(receipt => receipt.result === 'timed_out').length,
        incomplete: receipts.filter(receipt => receipt.result === 'incomplete').length,
        selected: ledger.accounting.selected,
        invalidated: ledger.accounting.invalidated,
        reused: ledger.accounting.reused,
        executions: ledger.accounting.executions,
        accountingComplete: ledger.accounting.complete,
        executedDurationMs: ledger.accounting.executedDurationMs,
        fingerprintDurationMs: ledger.accounting.fingerprintDurationMs,
        estimatedSavedDurationMs: ledger.accounting.estimatedSavedDurationMs,
    };
}

export function verificationEvidenceDetails(value: unknown) {
    const ledger = compactVerificationLedger(value);
    return {
        checks: ledger.receipts.slice(-24).map(receipt => ({
            checkId: receipt.checkId,
            mode: receipt.mode,
            result: receipt.result,
            tool: receipt.tool,
            boundary: receipt.boundary,
            runtimeTarget: receipt.runtimeTarget,
            runtimeRevision: receipt.runtimeRevision,
            command: redactedText(receipt.command, 500) || undefined,
            evidenceLocation: redactedText(receipt.evidenceLocation, 500) || undefined,
            durationMs: receipt.durationMs,
            fingerprintDurationMs: receipt.fingerprintDurationMs,
            queueMs: receipt.queueMs,
            idleMs: receipt.idleMs,
            retryCount: receipt.retryCount,
            reason: receipt.decisionReason,
        })),
        decisions: ledger.decisions.slice(-32).map(decision => ({
            checkId: decision.checkId,
            action: decision.action,
            reason: decision.reason,
            at: decision.at,
        })),
    };
}

export function isVerificationTool(tool: string, args: Record<string, unknown> = {}, explicitlyMarked = false): boolean {
    const name = String(tool || '').trim().toLowerCase();
    if (new Set([
        'quality_run', 'auto_tester', 'code_reviewer', 'browser_console_scan', 'browser_ui_audit',
        'browser_contrast_audit', 'browser_check_links', 'browser_performance', 'dependency_audit',
        'secrets_scan_repo', 'browser_run', 'browser_responsive_check', 'visual_qa',
    ]).has(name)) return true;
    if (name === 'shell_execute') {
        const command = String(args.command || '').trim();
        // Deliberately accept only a single, expansion-free invocation. Quotes,
        // shell operators and environment prefixes require uncached execution.
        if (!/^[A-Za-z0-9_./:@=+-]+(?:[ \t]+[A-Za-z0-9_./:@=+-]+)*$/u.test(command)) return false;
        const words = command.split(/[ \t]+/u);
        if (words.some(word => /^(?:--(?:help|version|dry-run|listTests|list|showConfig|passWithNoTests|watch(?:All)?|fix(?:-dry-run)?|if-present|script-shell|eval|print|test-only)|-[hvep])(?:=|$)/iu.test(word))) return false;
        const executable = words.shift();
        const testArgs = (args: string[]) => args.every(word => !word.startsWith('-')
            || /^(?:--runInBand|--ci|--coverage|--silent|--runTestsByPath)$/u.test(word));
        if (executable === 'npm' || executable === 'pnpm' || executable === 'yarn') {
            if (words[0] === 'run') words.shift();
            const script = words.shift();
            if (words[0] === '--') words.shift();
            return /^(?:test|lint|build|typecheck|check|guard)(?::[\w:-]+)?$/u.test(script || '') && testArgs(words);
        }
        if (executable === 'node') return words.shift() === '--test' && words.every(word => !word.startsWith('-')
            || /^--test-(?:concurrency=[1-9][0-9]*|reporter=(?:spec|tap))$/u.test(word));
        const checker = executable === 'npx' ? words.shift() : executable;
        if (checker === 'playwright' || checker === 'cypress') return words.shift() === (checker === 'playwright' ? 'test' : 'run') && testArgs(words);
        if (checker === 'vitest') return words.shift() === 'run' && testArgs(words);
        if (checker === 'tsc') return words.length === 1 && words[0] === '--noEmit';
        if (checker === 'eslint') return words.length > 0 && words.every(word => !word.startsWith('-'));
        return checker === 'jest' && testArgs(words);
    }
    // Untrusted plan metadata cannot certify an arbitrary tool as a checker.
    return false;
}
