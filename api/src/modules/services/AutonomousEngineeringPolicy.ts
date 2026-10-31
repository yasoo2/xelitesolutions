import path from 'path';
import { types } from 'util';
import { autonomousIdentity } from './AutonomousDevelopmentPolicy';
import { redactSecretsFromString } from '../../shared/utils/redaction';
import { transportRequestText } from '../../core/orchestrator/large-request-contract';
import { normalizeLocalBaseUrlForSdk } from '../../core/llm/explicit-local-selection';

const TTL_MS = 300_000;
const scopes = new WeakMap<object, Scope>();
const evidenceOwners = new WeakMap<object, object>();
const scopeKey = Symbol('owned engineering planning run');
const executionKey = Symbol('owned isolated engineering execution');
const executions = new WeakMap<object, { scope: Scope; phases: readonly any[]; evidence: any }>();
const taskKey = Symbol('owned isolated engineering task');
const taskAuthorities = new WeakMap<object, { lease: object; name: string; input: any }>();
const executionGateways = new WeakMap<object, () => Promise<boolean>>();

interface Scope {
    readonly userId: string; readonly sessionId: string; readonly workspaceId: string;
    readonly runId: string; readonly root: string; readonly request: string;
    readonly model: string; readonly baseUrl: string; readonly expires: number; readonly cancelled: () => boolean;
}

function record(value: unknown, keys: readonly string[], required = keys): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) throw Error('invalid_engineering_input');
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw Error('invalid_engineering_input');
    const data = Object.getOwnPropertyDescriptors(value), copy: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(data)) {
        if (typeof key !== 'string' || !keys.includes(key) || !('value' in data[key]) || !data[key].enumerable) throw Error('invalid_engineering_input');
        copy[key] = data[key].value;
    }
    if (required.some(key => !Object.prototype.hasOwnProperty.call(copy, key))) throw Error('invalid_engineering_input');
    return Object.freeze(copy);
}

/** Read only own data descriptors; never invoke model-config getters. */
function engineeringModel(value: unknown): Readonly<{ provider: 'local'; model: string; baseUrl: string }> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const d = Object.getOwnPropertyDescriptors(value);
    if (['provider', 'model', 'baseUrl'].some(key => !d[key] || !('value' in d[key]))) return null;
    const model = d.model.value;
    if (typeof model !== 'string' || !/^[a-z0-9][a-z0-9._:/-]*$/i.test(model) || /^(?:auto|mock|free|default)$/i.test(model) || /(?:^|[-:])cloud(?:$|[-:])/i.test(model)
        || d.provider.value !== 'local') return null;
    const baseUrl = normalizeLocalBaseUrlForSdk(d.baseUrl.value);
    return baseUrl ? Object.freeze({ provider: 'local', model, baseUrl }) : null;
}

export function exactEngineeringModel(value: unknown): boolean {
    // Server configuration is checked when authority is issued. Later checks
    // use the immutable issued identity, so a configuration refresh cannot swap it.
    return engineeringModel(value)?.model === String(process.env.LOCAL_LLM_MODEL || 'qwen2.5-coder:7b').trim();
}

export function engineeringRunId(context: any, ambient: any): string | null {
    const runId = autonomousIdentity(context?.runId);
    return runId && runId === autonomousIdentity(ambient?.runId) ? runId : null;
}

/** Classification is shared with the real front door; this adds no execution authority. */
export function snapshotEngineeringRequest(input: unknown): Readonly<{ request: string; path: string }> {
    const d = record(input, ['request', 'path'], ['request']);
    const transport = transportRequestText(d.request);
    if (!transport.ok) throw Error(transport.code);
    if (redactSecretsFromString(transport.text) !== transport.text) throw Error('invalid_engineering_request');
    const { isBuildRequest, isExistingSoftwareRepairRequest } = require('../../core/intelligence/intent-classifier');
    if (!isBuildRequest(d.request).isBuild && !(typeof isExistingSoftwareRepairRequest === 'function' && isExistingSoftwareRepairRequest(d.request))) throw Error('autonomous_engineering_not_supported');
    const target = d.path === undefined ? '.' : d.path;
    if (typeof target !== 'string' || !target.trim() || target.length > 2048) throw Error('invalid_workspace_path');
    return Object.freeze({ request: transport.text, path: target });
}

/** Only ToolService calls this after current owner, role, physical-root and cancellation checks. */
export function issueEngineeringContext(context: any, verified: {
    userId: string; sessionId: string; workspaceId: string; runId: string; root: string; request: string;
}, cancelled: () => boolean, now = Date.now()): any {
    const d = record(verified, ['userId', 'sessionId', 'workspaceId', 'runId', 'root', 'request']);
    for (const key of ['userId', 'sessionId', 'workspaceId', 'runId']) {
        if (!autonomousIdentity(d[key]) || autonomousIdentity(d[key]) !== d[key]) throw Error('trusted_context_required');
    }
    const model = engineeringModel(context?.modelConfig);
    if (!model || !exactEngineeringModel(context?.modelConfig) || typeof cancelled !== 'function' || !Number.isFinite(now)) throw Error('engineering_scope_invalid');
    if (typeof d.root !== 'string' || !path.isAbsolute(d.root) || path.resolve(d.root) === path.parse(d.root).root
        || !transportRequestText(d.request).ok) throw Error('engineering_scope_invalid');
    if (cancelled() !== false) throw Error('cancelled');
    const token = Object.freeze({});
    scopes.set(token, Object.freeze({
        userId: d.userId as string, sessionId: d.sessionId as string, workspaceId: d.workspaceId as string,
        runId: d.runId as string, root: d.root as string, request: d.request as string,
        model: model.model, baseUrl: model.baseUrl, expires: now + TTL_MS, cancelled,
    }));
    return { ...context, userId: d.userId, sessionId: d.sessionId, workspaceId: d.workspaceId, runId: d.runId,
        [scopeKey]: token, modelConfig: model };
}

export function hasEngineeringToken(context: any): boolean {
    if (!context || typeof context !== 'object' || types.isProxy(context)) return false;
    const d = Object.getOwnPropertyDescriptor(context, scopeKey);
    return !!d && 'value' in d && typeof d.value === 'object' && d.value !== null && scopes.has(d.value);
}

export function engineeringScope(context: any, now = Date.now()): Scope | null {
    if (!context || typeof context !== 'object' || types.isProxy(context)) return null;
    const d = Object.getOwnPropertyDescriptors(context);
    if ([scopeKey, 'userId', 'sessionId', 'workspaceId', 'runId', 'modelConfig'].some(key => !d[key as any] || !('value' in d[key as any]))) return null;
    const token = d[scopeKey as any].value, scope = token && scopes.get(token);
    if (!scope || !Number.isFinite(now) || now < scope.expires - TTL_MS || now >= scope.expires
        || d.userId.value !== scope.userId || d.sessionId.value !== scope.sessionId || d.workspaceId.value !== scope.workspaceId
        || d.runId.value !== scope.runId || engineeringModel(d.modelConfig.value)?.baseUrl !== scope.baseUrl
        || engineeringModel(d.modelConfig.value)?.model !== scope.model) return null;
    try {
        if (scope.cancelled() !== false || context.signal?.aborted === true) return null;
        if (context.isCancelled != null && (typeof context.isCancelled !== 'function' || context.isCancelled() !== false)) return null;
    } catch { return null; }
    return scope;
}

export function scopedEngineeringTool(name: string, context: any): boolean {
    return ((name === 'engineering_discovery' || name === 'project_planner') && !!engineeringScope(context))
        || (name === 'phase_executor' && !!engineeringExecution(context))
        || !!engineeringExecutionTask(name, context);
}

export function snapshotEngineeringChild(name: string, input: unknown, context: any): Record<string, unknown> {
    const execution = engineeringExecution(context);
    if (name === 'phase_executor' && execution) {
        const d = record(input, ['phase', 'projectContext', 'repairCriteria'], ['phase']);
        if (!execution.phases.includes(d.phase)) throw Error('isolated_phase_untrusted');
        return Object.freeze({ phase: d.phase, projectContext: d.projectContext });
    }
    const task = engineeringExecutionTask(name, context);
    if (task) {
        if (input !== task.input) throw Error('isolated_task_input_changed');
        return task.input;
    }
    const scope = engineeringScope(context);
    if (!scope) throw Error('engineering_scope_invalid');
    if (name === 'engineering_discovery') {
        const d = record(input, ['request', 'path'], ['request']);
        if (d.request !== scope.request || d.path !== undefined && (typeof d.path !== 'string' || path.resolve(d.path) !== scope.root)) throw Error('engineering_scope_mismatch');
        return Object.freeze({ request: scope.request, path: scope.root });
    }
    if (name === 'project_planner') {
        const d = record(input, ['projectDescription', 'evidence']);
        if (d.projectDescription !== scope.request || !d.evidence || typeof d.evidence !== 'object'
            || evidenceOwners.get(d.evidence) !== context[scopeKey]) throw Error('engineering_evidence_untrusted');
        return Object.freeze({ projectDescription: scope.request, evidence: d.evidence });
    }
    throw Error('tool_not_admitted');
}

/** Planning authority never admits execution. Only the canonical pipeline seals this finite plan. */
export function issueEngineeringExecution(context: any, evidence: any, plan: any): any {
    const scope = engineeringScope(context);
    if (!scope || evidenceOwners.get(evidence) !== context[scopeKey]
        || evidence.mode !== 'existing_workspace' || evidence.selectedProject?.root !== scope.root
        || evidence.constraints?.createsNewProject !== false || evidence.constraints?.readOnly === true
        || !evidence.selectedProject?.projectKinds?.includes('node')) throw Error('isolated_existing_node_evidence_required');
    const phases = plan?.phases;
    if (!Array.isArray(phases) || phases.length < 1 || phases.length > 3) throw Error('isolated_plan_budget');
    let taskCount = 0;
    const frozen = phases.map((phase: any, index: number) => {
        const d = record(phase, ['phaseNumber', 'name', 'tasks', 'verificationTask', 'verificationCriteria', 'description', 'dependsOn',
            'deliverables', 'estimatedTime', 'requirementsCovered', 'verificationNote'], ['tasks']);
        if (!Array.isArray(d.tasks) || d.tasks.length < 1 || d.tasks.length > 12) throw Error('isolated_plan_budget');
        const tasks = (d.tasks as any[]).map(task => {
            if (++taskCount > 12) throw Error('isolated_plan_budget');
            const t = record(task, ['tool', 'args', 'input', 'task', 'description', 'id', 'dependsOn', 'parallel', 'priority', 'realisticMinutes'], ['tool']);
            if (!['read_file', 'file_edit', 'shell_execute'].includes(t.tool as string) || t.parallel === true
                || (t.args !== undefined && t.input !== undefined)) throw Error('isolated_tool_not_admitted');
            const supplied = t.input ?? t.args;
            const args = t.tool === 'shell_execute'
                ? record(supplied, ['command', 'cwd', 'background'], ['command'])
                : require('./AutonomousFilePolicy').snapshotAutonomousFileInput(t.tool, supplied);
            if (t.tool === 'shell_execute' && (args.background === true || !/^(?:npm (?:run )?test|node --test)$/u.test(String(args.command)))) throw Error('isolated_test_command_not_admitted');
            return Object.freeze({ tool: t.tool, input: args, task: String(t.task ?? t.description ?? t.tool).slice(0, 256) });
        });
        // Every accepted phase ends in an actual test, not an unverified edit-only success.
        if (tasks[tasks.length - 1].tool !== 'shell_execute') throw Error('isolated_phase_test_required');
        if (tasks.slice(0, -1).some(task => task.tool === 'shell_execute')) throw Error('isolated_phase_one_final_test_required');
        return Object.freeze({ phaseNumber: index + 1, name: String(d.name ?? `Phase ${index + 1}`).slice(0, 128), tasks: Object.freeze(tasks) });
    });
    const token = Object.freeze({});
    executions.set(token, { scope, phases: Object.freeze(frozen), evidence });
    return { ...context, [executionKey]: token };
}

export function engineeringExecution(context: any): { scope: Scope; phases: readonly any[]; evidence: any; token: object } | null {
    const currentScope = engineeringScope(context);
    if (!currentScope) return null;
    const descriptor = Object.getOwnPropertyDescriptor(context, executionKey);
    const token = descriptor && 'value' in descriptor && descriptor.value;
    const lease = token && executions.get(token);
    return lease && lease.scope === currentScope ? { ...lease, token } : null;
}

export function hasEngineeringExecutionToken(context: any): boolean {
    return !!context && typeof context === 'object' && !!Object.getOwnPropertyDescriptor(context, executionKey);
}

/** Installed only by ToolService after current owner and workspace checks. */
export function bindEngineeringExecutionGateway(context: any, check: () => Promise<boolean>): void {
    const lease = engineeringExecution(context);
    if (!lease || typeof check !== 'function') throw Error('isolated_gateway_untrusted');
    executionGateways.set(lease.token, check);
}

export async function recheckEngineeringExecutionGateway(context: any): Promise<boolean | null> {
    const lease = engineeringExecution(context);
    if (!lease) return false;
    const check = executionGateways.get(lease.token);
    if (!check) return null;
    try { return await check() === true && engineeringExecution(context)?.token === lease.token; } catch { return false; }
}

export function forwardEngineeringExecution(source: any, target: any): any {
    if (!engineeringExecution(source)) return target;
    return { ...source, ...target, [executionKey]: source[executionKey], [scopeKey]: source[scopeKey] };
}

/** Called by the scoped PhaseExecutor for one exact sealed task; never issued from LLM input. */
export function issueEngineeringTask(context: any, phase: any, task: any): any {
    const lease = engineeringExecution(context);
    if (!lease || !lease.phases.includes(phase) || !phase.tasks.includes(task)) throw Error('isolated_task_untrusted');
    const token = Object.freeze({});
    taskAuthorities.set(token, { lease: lease.token, name: task.tool, input: task.input });
    return { ...context, [taskKey]: token };
}

export function engineeringExecutionTask(name: string, context: any): { input: any } | null {
    const lease = engineeringExecution(context);
    const descriptor = context && Object.getOwnPropertyDescriptor(context, taskKey);
    const token = descriptor && 'value' in descriptor && descriptor.value;
    const task = token && taskAuthorities.get(token);
    return lease && task?.lease === lease.token && task.name === name ? task : null;
}

/** Evidence must be an immutable result of the scoped discovery, never a model/input object. */
export function sealEngineeringEvidence<T extends object>(context: any, evidence: T): T {
    if (!engineeringScope(context)) throw Error('engineering_scope_invalid');
    const seen = new WeakSet<object>(); let nodes = 0;
    const freeze = (value: any, depth = 0): any => {
        if (!value || typeof value !== 'object') return value;
        if (types.isProxy(value) || seen.has(value) || depth > 8 || ++nodes > 2048) throw Error('invalid_engineering_evidence');
        seen.add(value);
        if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw Error('invalid_engineering_evidence');
        const d = Object.getOwnPropertyDescriptors(value);
        for (const key of Reflect.ownKeys(d)) {
            if (!('value' in d[key as any])) throw Error('invalid_engineering_evidence');
            freeze(d[key as any].value, depth + 1);
        }
        return Object.freeze(value);
    };
    freeze(evidence); evidenceOwners.set(evidence, context[scopeKey]); return evidence;
}
