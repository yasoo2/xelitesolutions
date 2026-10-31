jest.mock('../core/intelligence/intent-classifier', () => ({ isBuildRequest: (goal: string) => ({ isBuild: /^Build\b/u.test(goal) }) }));
import path from 'path';
import { engineeringRunId, engineeringScope, exactEngineeringModel, issueEngineeringContext, sealEngineeringEvidence, scopedEngineeringTool, snapshotEngineeringChild, snapshotEngineeringRequest } from '../modules/services/AutonomousEngineeringPolicy';
const request = 'Build a local agent. Keep all existing files untouched.';
const root = path.resolve('D:/owned-project');
const base = () => ({ userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' } });
function scope(cancelled: () => boolean = () => false, now = 1000) {
    const ctx = base(); return issueEngineeringContext(ctx, { userId: ctx.userId, sessionId: ctx.sessionId, workspaceId: ctx.workspaceId, runId: ctx.runId, root, request }, cancelled, now);
}
test('only the exact local route is admitted, independent of config getters', () => {
    expect(exactEngineeringModel(base().modelConfig)).toBe(true);
    for (const config of [{ provider: 'auto', model: 'qwen2.5-coder:7b' }, { provider: 'nvidia', model: 'qwen2.5-coder:7b' }, { provider: 'local', model: 'originalLocal qwen2.5-coder7B' }, null, {}]) expect(exactEngineeringModel(config)).toBe(false);
    const getter = jest.fn(() => 'local'); expect(exactEngineeringModel(Object.defineProperty({ model: 'qwen2.5-coder:7b' }, 'provider', { get: getter, enumerable: true }))).toBe(false); expect(getter).not.toHaveBeenCalled();
});
test('model proxies and prototype getters never run', () => {
    const trap = jest.fn(); expect(exactEngineeringModel(new Proxy(base().modelConfig, { getOwnPropertyDescriptor: trap }))).toBe(false); expect(trap).not.toHaveBeenCalled();
    const getter = jest.fn(); expect(exactEngineeringModel(Object.create(Object.defineProperty({}, 'provider', { get: getter })))).toBe(false); expect(getter).not.toHaveBeenCalled();
});
test('only a matching current ambient run can issue the planning boundary', () => {
    expect(engineeringRunId(base(), { runId: 'run' })).toBe('run'); expect(engineeringRunId(base(), { runId: 'foreign' })).toBeNull(); expect(engineeringRunId({}, {})).toBeNull();
});
test('input is immutable data and preserves original request bytes', () => {
    const source = { request, path: '.' }; const copy = snapshotEngineeringRequest(source); source.request = 'Build something else'; expect(copy.request).toBe(request); expect(Object.isFrozen(copy)).toBe(true);
    expect(() => snapshotEngineeringRequest({ request, workspaceId: 'foreign' })).toThrow('invalid_engineering_input');
});
test('request accessors, inherited fields and proxies are rejected before access', () => {
    const getter = jest.fn(() => request); expect(() => snapshotEngineeringRequest(Object.defineProperty({}, 'request', { get: getter, enumerable: true }))).toThrow(); expect(getter).not.toHaveBeenCalled();
    expect(() => snapshotEngineeringRequest(Object.create({ request }))).toThrow();
    const trap = jest.fn(); expect(() => snapshotEngineeringRequest(new Proxy({ request }, { getOwnPropertyDescriptor: trap }))).toThrow(); expect(trap).not.toHaveBeenCalled();
});
test('existing Unicode transport limit is retained without a smaller engineering cap', () => {
    const large = 'Build ' + 'ع😀'.repeat(12000) + ' preserve this final requirement';
    expect(snapshotEngineeringRequest({ request: large }).request).toBe(large);
    expect(() => snapshotEngineeringRequest({ request: 'Build ' + '😀'.repeat(60000) })).toThrow('large_request_over_bound');
    expect(() => snapshotEngineeringRequest({ request: 'Explain an agent.' })).toThrow('autonomous_engineering_not_supported');
});
test('JSON, caller flags and copies cannot forge a scope', () => {
    const ctx = scope(); expect(engineeringScope(ctx, 1000)?.request).toBe(request);
    expect(engineeringScope(JSON.parse(JSON.stringify(ctx)), 1000)).toBeNull();
    expect(scopedEngineeringTool('project_planner', { ...base(), engineeringScope: true, autoApproveAll: true })).toBe(false);
});
test.each(['userId', 'sessionId', 'workspaceId', 'runId'])('token cannot authorize a different %s', key => {
    const ctx = scope(); expect(engineeringScope({ ...ctx, [key]: 'foreign' }, 1000)).toBeNull();
});
test('expired, rollback-time and nonfinite-time scopes fail closed', () => {
    const ctx = scope(); expect(engineeringScope(ctx, 300_999)).not.toBeNull(); expect(engineeringScope(ctx, 301_000)).toBeNull(); expect(engineeringScope(ctx, 999)).toBeNull(); expect(engineeringScope(ctx, NaN)).toBeNull();
});
test('captured cancellation cannot be undone by a caller callback', () => {
    let cancelled = false; const ctx = scope(() => cancelled); expect(engineeringScope(ctx, 1000)).not.toBeNull(); cancelled = true;
    expect(engineeringScope({ ...ctx, isCancelled: () => false }, 1000)).toBeNull();
});
test('invalid captured cancellation stops issuance', () => {
    expect(() => scope(() => undefined as any)).toThrow('cancelled'); expect(() => scope(() => true)).toThrow('cancelled');
});
test('issued model is frozen and cannot become paid or Auto', () => {
    const ctx = scope(); expect(Object.isFrozen(ctx.modelConfig)).toBe(true); expect(engineeringScope({ ...ctx, modelConfig: { provider: 'auto', model: 'qwen2.5-coder:7b' } }, 1000)).toBeNull();
});
test('scope context accessor cannot obtain authority or run', () => {
    const ctx = scope(); const getter = jest.fn(() => 'owner'); Object.defineProperty(ctx, 'userId', { get: getter }); expect(engineeringScope(ctx, 1000)).toBeNull(); expect(getter).not.toHaveBeenCalled();
});
test('only exact read-only engineering children can borrow the token', () => {
    const ctx = scope(() => false, Date.now()); expect(scopedEngineeringTool('engineering_discovery', ctx)).toBe(true); expect(scopedEngineeringTool('project_planner', ctx)).toBe(true);
    for (const name of ['phase_executor', 'builder_execute', 'shell_execute', 'npm_manager', 'project_run', 'delete_file', 'deploy', 'shell']) expect(scopedEngineeringTool(name, ctx)).toBe(false);
});
test('discovery inputs retain root/request and reject coercion or caller authority', () => {
    const ctx = scope(() => false, Date.now()); expect(snapshotEngineeringChild('engineering_discovery', { request, path: root }, ctx)).toEqual({ request, path: root });
    expect(() => snapshotEngineeringChild('engineering_discovery', { request, path: path.resolve(root, '..') }, ctx)).toThrow();
    const coercion = jest.fn(() => root); expect(() => snapshotEngineeringChild('engineering_discovery', { request, path: { toString: coercion } }, ctx)).toThrow(); expect(coercion).not.toHaveBeenCalled();
});
test('only immutable evidence from the same scoped discovery reaches planner', () => {
    const ctx = scope(() => false, Date.now()); const evidence = sealEngineeringEvidence(ctx, { facts: [{ statement: 'observed' }] });
    expect(Object.isFrozen(evidence.facts[0])).toBe(true); expect(snapshotEngineeringChild('project_planner', { projectDescription: request, evidence }, ctx).evidence).toBe(evidence);
    expect(() => snapshotEngineeringChild('project_planner', { projectDescription: request, evidence: { ...evidence } }, ctx)).toThrow('engineering_evidence_untrusted');
    const other = scope(() => false, Date.now()); expect(() => snapshotEngineeringChild('project_planner', { projectDescription: request, evidence }, other)).toThrow('engineering_evidence_untrusted');
});
test('cyclic and accessor evidence is rejected, without invoking getters', () => {
    const ctx = scope(() => false, Date.now()); const cycle: any = {}; cycle.self = cycle; expect(() => sealEngineeringEvidence(ctx, cycle)).toThrow();
    const getter = jest.fn(); expect(() => sealEngineeringEvidence(ctx, Object.defineProperty({}, 'facts', { get: getter, enumerable: true }))).toThrow(); expect(getter).not.toHaveBeenCalled();
});
