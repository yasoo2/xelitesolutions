import { types } from 'util';
import { parseRuntimeDiagnosticFacts, RuntimeDiagnosticFact } from '../../core/orchestrator/runtime-diagnostic-contract';
import { redactSecretsFromString } from '../../shared/utils/redaction';

const authorityKey = Symbol('ToolService runtime diagnostics');
const authorities = new WeakMap<object, { input: RuntimeDiagnosticInput; root: string; identity: Record<string, string>; expires: number; guard: () => boolean; used: boolean }>();
export interface RuntimeDiagnosticInput { readonly request: string; readonly path: string; readonly facts: readonly RuntimeDiagnosticFact[]; }

/** Capture JSON data without invoking caller getters, iterators or proxy traps. */
export function snapshotRuntimeDiagnosticInput(input: unknown): RuntimeDiagnosticInput {
    if (!input || typeof input !== 'object' || Array.isArray(input) || types.isProxy(input)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw Error('invalid_runtime_diagnostic_input');
    const descriptors = Object.getOwnPropertyDescriptors(input), copy: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = typeof key === 'string' ? descriptors[key] : undefined;
        if (!descriptor || !['request', 'path', 'facts'].includes(key as string) || !('value' in descriptor) || !descriptor.enumerable) throw Error('invalid_runtime_diagnostic_input');
        copy[key as string] = descriptor.value;
    }
    if (typeof copy.request !== 'string' || !copy.request.trim() || copy.request.length > 8192
        || copy.path !== undefined && copy.path !== '.') throw Error('invalid_runtime_diagnostic_request');
    if (redactSecretsFromString(copy.request) !== copy.request
        || /\b(?:nvapi-|gsk_|AIza)[A-Za-z0-9_-]{12,}|-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH)/u.test(copy.request)) throw Error('sensitive_runtime_diagnostic_request');
    const supplied = copy.facts;
    if (!Array.isArray(supplied) || types.isProxy(supplied) || Object.getPrototypeOf(supplied) !== Array.prototype) throw Error('invalid_runtime_diagnostic_facts');
    const data = Object.getOwnPropertyDescriptors(supplied) as unknown as Record<string, PropertyDescriptor>, length = data.length?.value;
    if (!Number.isSafeInteger(length) || length < 1 || length > 2
        || Reflect.ownKeys(data).some(key => typeof key !== 'string' || key !== 'length' && !/^[01]$/.test(key))) throw Error('invalid_runtime_diagnostic_facts');
    const facts: RuntimeDiagnosticFact[] = [];
    for (let index = 0; index < length; index++) {
        const item = data[String(index)];
        if (!item || !('value' in item) || !item.enumerable || !['node_version', 'workspace_path'].includes(item.value) || facts.includes(item.value)) throw Error('invalid_runtime_diagnostic_facts');
        facts.push(item.value);
    }
    const requested = parseRuntimeDiagnosticFacts(copy.request);
    if (!requested || requested.length !== facts.length || requested.some((fact, index) => fact !== facts[index])) throw Error('runtime_diagnostic_request_mismatch');
    return Object.freeze({ request: copy.request, path: '.', facts: Object.freeze(facts) });
}

/** Only ToolService issues this after fresh identity, read permission and physical-root checks. */
export function issueRuntimeDiagnosticContext(context: any, input: RuntimeDiagnosticInput, root: string, guard: () => boolean): any {
    if (typeof root !== 'string' || !root || typeof guard !== 'function' || guard() !== true) throw Error('runtime_diagnostic_authority_changed');
    const identity: Record<string, string> = Object.create(null);
    for (const key of ['userId', 'sessionId', 'workspaceId']) {
        const descriptor = Object.getOwnPropertyDescriptor(context, key);
        if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string' || !descriptor.value.trim()) throw Error('runtime_diagnostic_authority_changed');
        identity[key] = descriptor.value;
    }
    const token = Object.freeze({});
    authorities.set(token, { input, root, identity: Object.freeze(identity), expires: Date.now() + 15_000, guard, used: false });
    return { ...context, [authorityKey]: token };
}

/** A registered leaf cannot expose workspace facts through direct or forged calls. */
export function executeRuntimeDiagnostics(input: unknown, context: any) {
    const fail = (reason: string) => ({ ok: false, error: 'policy_blocked', output: { status: 'failed', reason }, logs: [] });
    if (!context || typeof context !== 'object' || types.isProxy(context)) return fail('runtime_diagnostic_gateway_required');
    const descriptor = Object.getOwnPropertyDescriptor(context, authorityKey);
    if (!descriptor || !('value' in descriptor) || !descriptor.value || typeof descriptor.value !== 'object') return fail('runtime_diagnostic_gateway_required');
    const scope = authorities.get(descriptor.value);
    if (!scope || scope.used || Date.now() >= scope.expires || Date.now() < scope.expires - 15_000) return fail('runtime_diagnostic_gateway_required');
    try {
        if (Object.keys(scope.identity).some(key => { const d = Object.getOwnPropertyDescriptor(context, key); return !d || !('value' in d) || d.value !== scope.identity[key]; })) return fail('runtime_diagnostic_authority_changed');
        if (scope.guard() !== true) return fail('runtime_diagnostic_authority_changed');
        if (!input || typeof input !== 'object' || types.isProxy(input)
            || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail('invalid_runtime_diagnostic_input');
        const values = Object.getOwnPropertyDescriptors(input);
        if (Reflect.ownKeys(values).some(key => typeof key !== 'string' || !['request', 'facts', 'path', 'userId'].includes(key)
            || !('value' in values[key]) || !values[key].enumerable)
            || values.userId !== undefined && values.userId.value !== scope.identity.userId
            || values.request?.value !== scope.input.request || values.facts?.value !== scope.input.facts || values.path?.value !== scope.root) return fail('runtime_diagnostic_input_changed');
        scope.used = true;
        const facts = scope.input.facts.map(id => ({ id, value: id === 'node_version' ? process.version : scope.root,
            source: id === 'node_version' ? 'api_process' : 'authorized_workspace' }));
        if (facts.some(fact => typeof fact.value !== 'string' || !fact.value)
            || facts.some(fact => fact.id === 'node_version' && !/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(fact.value))
            || scope.guard() !== true) return fail('runtime_diagnostic_authority_changed');
        return { ok: true, output: { status: 'completed', kind: 'runtime_diagnostics', runtimeScope: 'joe_api_process', executedCommands: false, facts }, logs: [] };
    } catch { return fail('runtime_diagnostic_authority_changed'); }
}
