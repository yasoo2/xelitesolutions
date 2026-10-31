import path from 'path';
import { classifyExplicitLocalSelection } from '../core/llm/explicit-local-selection';
import { engineeringScope, exactEngineeringModel, issueEngineeringContext } from '../modules/services/AutonomousEngineeringPolicy';

const selected = (baseUrl: unknown = 'http://127.0.0.1:11434') => ({ provider: 'local', model: 'qwen2.5-coder:7b', baseUrl });
const context = (modelConfig: any = selected()) => ({ userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', modelConfig });
const verified = { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', root: path.resolve('D:/owned-project'), request: 'Build a local task agent.' };
const issue = (config: any = selected()) => issueEngineeringContext(context(config), verified, () => false, 1000);

test.each(['http://127.0.0.1:11434', 'http://localhost:11434/', 'http://[::1]:11434/v1/'])('actual router classifier accepts the scoped selected endpoint %s', baseUrl => {
    const scoped = issue(selected(baseUrl));
    const decision = classifyExplicitLocalSelection(scoped.modelConfig);
    expect(decision).toMatchObject({ kind: 'eligible-local', eligible: true, model: 'qwen2.5-coder:7b' });
    expect(scoped.modelConfig.baseUrl).toBe(decision.normalizedBaseUrl);
    expect(Object.isFrozen(scoped.modelConfig)).toBe(true);
    expect(engineeringScope(scoped, 1000)).not.toBeNull();
});

test.each([undefined, null, {}, 11434, '', 'https://localhost:11434', 'http://localhost:5000', 'http://remote.invalid:11434', 'http://127.1:11434', 'http://user@localhost:11434', 'http://localhost:11434/v1?', 'http://localhost:11434/other/../v1'])('invalid or missing endpoint is rejected before any dispatch: %p', baseUrl => {
    const config = selected(baseUrl);
    if (baseUrl === undefined) delete (config as any).baseUrl;
    expect(exactEngineeringModel(config)).toBe(false);
    expect(() => issue(config)).toThrow('engineering_scope_invalid');
});

test.each(['provider', 'model', 'baseUrl'])('model-config getter %s is never invoked', key => {
    const getter = jest.fn(() => selected()[key as keyof ReturnType<typeof selected>]);
    const config = Object.defineProperty(selected(), key, { get: getter });
    expect(exactEngineeringModel(config)).toBe(false);
    expect(() => issue(config)).toThrow();
    expect(getter).not.toHaveBeenCalled();
});

test('Proxy and inherited endpoint cannot obtain a model scope', () => {
    const traps = jest.fn();
    expect(exactEngineeringModel(new Proxy(selected(), { get: traps, getOwnPropertyDescriptor: traps }))).toBe(false);
    expect(traps).not.toHaveBeenCalled();
    expect(exactEngineeringModel(Object.create(selected()))).toBe(false);
});

test('scoped configuration drops private and arbitrary values without reading them', () => {
    const getter = jest.fn(() => 'private-value');
    const config = Object.defineProperty({ ...selected(), apiKey: 'private-value', temperature: 1 }, 'unrelated', { get: getter });
    const scoped = issue(config);
    expect(Object.keys(scoped.modelConfig).sort()).toEqual(['baseUrl', 'model', 'provider']);
    expect(getter).not.toHaveBeenCalled();
});

test('changing selected canonical host invalidates the same token', () => {
    const scoped = issue();
    expect(engineeringScope({ ...scoped, modelConfig: selected('http://localhost:11434/v1') }, 1000)).toBeNull();
});

test('equivalent root versus /v1 spelling preserves the same normalized endpoint', () => {
    const scoped = issue();
    expect(engineeringScope({ ...scoped, modelConfig: selected('http://127.0.0.1:11434/') }, 1000)).not.toBeNull();
});

test('changing model or provider cannot borrow endpoint admission', () => {
    const scoped = issue();
    for (const modelConfig of [{ ...selected(), provider: 'auto' }, { ...selected(), provider: 'meta' }, { ...selected(), model: 'qwen2.5-coder:7b-cloud' }]) {
        expect(engineeringScope({ ...scoped, modelConfig }, 1000)).toBeNull();
        expect(() => issue(modelConfig)).toThrow();
    }
});
