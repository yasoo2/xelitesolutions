const mockExecuteTool = jest.fn();
jest.mock('../modules/services/ToolService', () => ({ executeTool: (...args: any[]) => mockExecuteTool(...args) }));
import path from 'path';
import { EngineeringDiscoveryTool } from '../modules/tools/definitions/EngineeringDiscoveryTool';
import { issueEngineeringContext, snapshotEngineeringChild } from '../modules/services/AutonomousEngineeringPolicy';

const root = path.resolve('D:/owned-scoped-project');
const request = 'Fix the existing Node.js function in sum.mjs; preserve sum.test.mjs and run the declared tests.';
const file = (name: string, size = 128) => ({ name, type: 'file', size });
const dir = (name: string) => ({ name, type: 'directory', size: 0 });
let cancelled = false;
let listing: any[], manifest: string, directories: Record<string, any[]>;
function context() {
    const model = String(process.env.LOCAL_LLM_MODEL || 'qwen2.5-coder:7b');
    return issueEngineeringContext({ modelConfig: { provider: 'local', model, baseUrl: 'http://127.0.0.1:11434/v1' } },
        { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', root, request }, () => cancelled);
}
const run = (ctx = context(), input = { request, path: root }) => new EngineeringDiscoveryTool().execute(input, ctx) as Promise<any>;
beforeEach(() => {
    cancelled = false; listing = [file('package.json'), file('sum.mjs'), file('sum.test.mjs')]; directories = {};
    manifest = JSON.stringify({ name: 'counter', scripts: { test: 'node --test', build: 'node build.mjs', 'test:unit': 'node --test unit.test.mjs' } });
    mockExecuteTool.mockReset().mockImplementation(async (name, args, ctx) => {
        expect(ctx.workspaceId).toBe('workspace'); expect(ctx.userId).toBe('owner');
        if (name === 'inspect_directory') {
            expect(args.depth).toBe(1);
            const rel = path.relative(root, args.path).replace(/\\/g, '/');
            if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('unexpected foreign root');
            return { ok: true, output: { tree: rel ? directories[rel] || [] : listing, truncated: false }, logs: [] };
        }
        expect(name).toBe('read_file'); expect(args.path).toBe(path.join(root, 'package.json'));
        return { ok: true, output: manifest, logs: [] };
    });
});

test('valid current manifest and observed source/tests form a sealed existing project with exact checks', async () => {
    const ctx = context(), result = await run(ctx), ev = result.output.evidence;
    expect(result.ok).toBe(true); expect(ev.mode).toBe('existing_workspace');
    expect(ev.selectedProject).toMatchObject({ root, projectKinds: ['node'], sourceFiles: ['sum.mjs', 'sum.test.mjs'], testFiles: ['sum.test.mjs'], git: {} });
    expect(ev.selectedProject.candidateChecks).toEqual([
        { kind: 'test', command: 'npm run test', source: 'package.json' },
        { kind: 'build', command: 'npm run build', source: 'package.json' },
        { kind: 'test', command: 'npm run test:unit', source: 'package.json' },
    ]);
    expect(Object.isFrozen(ev.selectedProject.manifests[0].scripts)).toBe(true);
    expect(snapshotEngineeringChild('project_planner', { projectDescription: request, evidence: ev }, ctx).evidence).toBe(ev);
    expect(ev.blockers).toContainEqual(expect.objectContaining({ code: 'execution_capability_unavailable' }));
    expect(mockExecuteTool.mock.calls.map(call => call[0])).toEqual(['inspect_directory', 'read_file']);
});
test('nested source/test inventory uses guarded depth-one child calls; absent paths are never invented', async () => {
    listing = [file('package.json'), dir('src'), dir('tests'), dir('dist')];
    directories = { src: [file('index.ts'), dir('lib')], 'src/lib': [file('計算.ts')], tests: [file('calculation.spec.ts')] };
    const ev = (await run()).output.evidence;
    expect(ev.selectedProject.sourceFiles).toEqual(['src/index.ts', 'tests/calculation.spec.ts', 'src/lib/計算.ts']);
    expect(ev.selectedProject.likelyEntrypoints).toEqual(['src/index.ts']);
    expect(ev.selectedProject.testFiles).toEqual(['tests/calculation.spec.ts']);
    expect(ev.selectedProject.sourceFiles).not.toContain('missing.ts');
    expect(mockExecuteTool.mock.calls.filter(call => call[0] === 'inspect_directory').map(call => call[1].path))
        .toEqual([root, path.join(root, 'src'), path.join(root, 'tests'), path.join(root, 'src/lib')]);
});
test.each(['{', '[]', 'null', '{"scripts":[]}', '{"scripts":null}', '{"scripts":{"test":42}}', '{"scripts":{"test":""}}', '{"scripts":{"test;evil":"node --test"}}'])('invalid manifest fails closed without selecting a project: %s', async text => {
    manifest = text; const ev = (await run()).output.evidence;
    expect(ev.mode).toBe('ambiguous'); expect(ev.selectedProject).toBeUndefined();
    expect(ev.blockers).toContainEqual(expect.objectContaining({ code: 'discovery_manifest_invalid' }));
});
test('test files alone do not prove a script, runner or Node project', async () => {
    listing = [file('sum.mjs'), file('sum.test.mjs')];
    const ev = (await run()).output.evidence; expect(ev.selectedProject).toBeUndefined(); expect(mockExecuteTool).toHaveBeenCalledTimes(1);
});
test('a valid manifest without scripts selects observed Node files but invents no test command', async () => {
    manifest = '{"name":"counter"}'; expect((await run()).output.evidence.selectedProject.candidateChecks).toEqual([]);
});
test.each([16385, -1, 1.5, NaN])('oversized or invalid manifest size is not read: %s', async size => {
    listing = [file('package.json', size), file('sum.mjs')];
    const result = await run(); expect(result.output?.evidence?.selectedProject).toBeUndefined();
    expect(mockExecuteTool.mock.calls.some(call => call[0] === 'read_file')).toBe(false);
});
test('secret-bearing manifest is excluded from project and prompt evidence', async () => {
    manifest = '{"scripts":{"test":"node --test"},"key":"sk-secretvalue123456789"}';
    const ev = (await run()).output.evidence; expect(ev.selectedProject).toBeUndefined();
    expect(JSON.stringify(ev)).not.toContain('secretvalue');
    expect(ev.blockers).toContainEqual(expect.objectContaining({ code: 'discovery_sensitive_content' }));
});
test.each(['../foreign', 'C:\\foreign', '/foreign', '.', '..', 'file\u0000.mjs', '.env', 'secret.key'])('unsafe listing name fails closed before reads: %s', async name => {
    listing = [file('package.json'), file(name)]; const result = await run();
    expect(result.ok).toBe(false); expect(result.error).toBe('engineering_discovery_listing_invalid');
    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
});
test('duplicate directory receipts are rejected', async () => {
    listing = [file('package.json'), file('package.json')]; expect((await run()).ok).toBe(false);
});
test('truncated listing withholds project/check authority', async () => {
    mockExecuteTool.mockImplementationOnce(async () => ({ ok: true, output: { tree: listing, truncated: true } }));
    const ev = (await run()).output.evidence; expect(ev.selectedProject).toBeUndefined();
    expect(ev.blockers).toContainEqual(expect.objectContaining({ code: 'discovery_coverage_limited' }));
});
test('directory step budget stays bounded and withholds incomplete selection', async () => {
    listing = [file('package.json'), ...Array.from({ length: 20 }, (_, n) => dir(`dir${n}`))];
    const ev = (await run()).output.evidence; expect(ev.selectedProject).toBeUndefined();
    expect(mockExecuteTool.mock.calls.filter(call => call[0] === 'inspect_directory')).toHaveLength(12);
});
test('cancelled discovery cannot dispatch a manifest read after listing', async () => {
    mockExecuteTool.mockImplementationOnce(async () => { cancelled = true; return { ok: true, output: { tree: listing } }; });
    const result = await run(); expect(result.error).toBe('engineering_scope_invalid'); expect(mockExecuteTool).toHaveBeenCalledTimes(1);
});
test('cancelled manifest result cannot seal project evidence', async () => {
    mockExecuteTool.mockImplementationOnce(async () => ({ ok: true, output: { tree: listing } }))
        .mockImplementationOnce(async () => { cancelled = true; return { ok: true, output: manifest }; });
    expect((await run()).error).toBe('engineering_scope_invalid');
});
test('foreign owner, altered input root and foreign evidence cannot borrow the scope', async () => {
    const ctx = context(); expect((await run({ ...ctx, workspaceId: 'foreign' })).ok).toBe(false);
    expect((await run(ctx, { request, path: path.resolve(root, '..') })).ok).toBe(false); expect(mockExecuteTool).not.toHaveBeenCalled();
    const ev = (await run(ctx)).output.evidence;
    expect(() => snapshotEngineeringChild('project_planner', { projectDescription: request, evidence: ev }, context())).toThrow('engineering_evidence_untrusted');
});
test('failed guarded manifest read and non-string or over-bound content never produce evidence', async () => {
    for (const receipt of [{ ok: false }, { ok: true, output: {} }, { ok: true, output: 'x'.repeat(16385) }]) {
        mockExecuteTool.mockImplementationOnce(async () => ({ ok: true, output: { tree: listing } })).mockImplementationOnce(async () => receipt);
        expect((await run()).ok).toBe(false);
    }
});
