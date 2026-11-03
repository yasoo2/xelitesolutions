const mockExecuteTool = jest.fn(), mockCallLLM = jest.fn();
jest.mock('../modules/services/ToolService', () => ({ TOOL_ALIASES: {}, executeTool: (...args: any[]) => mockExecuteTool(...args) }));
jest.mock('../core/llm', () => ({ callLLM: (...args: any[]) => mockCallLLM(...args) }));
jest.mock('../core/llm/intelligent-router', () => ({ isProviderFailure: () => false, retryAfterMsFrom: () => 0, verifyProviderDirect: jest.fn() }));
jest.mock('../modules/tools/registry', () => ({ tools: [] }));
import path from 'path';
import fs from 'fs';
import { ProjectPipelineTool } from '../modules/tools/definitions/ProjectPipelineTool';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { EngineeringDiscoveryTool } from '../modules/tools/definitions/EngineeringDiscoveryTool';
import { issueEngineeringContext, sealEngineeringEvidence, snapshotEngineeringChild, snapshotEngineeringRequest } from '../modules/services/AutonomousEngineeringPolicy';
import { SafeReadFileTool } from '../modules/tools/definitions/TaskInteractionTools';
import { snapshotAutonomousFileInput, validateAutonomousFileOperation } from '../modules/services/AutonomousFilePolicy';
import { workspaceService } from '../modules/services/WorkspaceService';

const root = path.resolve('D:/owned-space/nested/project');
let request: string, documents: Record<string, string>, sizes: Record<string, number>, cancelled: boolean, readNumber: number;
const projectFiles: Record<string, string> = {
    'package.json': '{"name":"counter","scripts":{"test":"node --test"}}',
    'counter.mjs': 'export const counter = value => value + 1;',
    'counter.test.mjs': "import {counter} from './counter.mjs';\nimport assert from 'node:assert/strict';\nassert.equal(counter(1), 2);",
};
const file = (name: string, size: number) => ({ name, type: 'file', size });
function context() { return issueEngineeringContext({ language: 'en', modelConfig: { provider: 'local', model: String(process.env.LOCAL_LLM_MODEL || 'qwen2.5-coder:7b'), baseUrl: 'http://127.0.0.1:11434/v1' } },
    { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', root, request }, () => cancelled); }
const run = (ctx = context()) => new ProjectPipelineTool().execute({ request, path: root }, ctx) as Promise<any>;
const plannerCalls = () => mockExecuteTool.mock.calls.filter(call => call[0] === 'project_planner');
beforeEach(() => {
    request = 'Build a Node API. Read the local specification requirements.txt before implementation.';
    documents = { 'requirements.txt': 'Implement a counter with strict input validation.\nKeep the existing tests.' }; sizes = {}; cancelled = false; readNumber = 0;
    mockCallLLM.mockReset().mockRejectedValue(new Error('INERT_MODEL_PROMPT_CAPTURE_ONLY'));
    mockExecuteTool.mockReset().mockImplementation(async (name, args, ctx) => {
        if (name === 'engineering_discovery') return new EngineeringDiscoveryTool().execute(args, ctx);
        if (name === 'inspect_directory') return { ok: true, output: { tree: [...Object.entries(projectFiles), ...Object.entries(documents)]
            .map(([name, text]) => file(name, sizes[name] ?? Buffer.byteLength(text))), truncated: false } };
        if (name === 'read_file') {
            const rel = path.relative(root, args.path).replace(/\\/g, '/');
            expect(args.path).toBe(path.join(root, rel)); expect(ctx.workspaceId).toBe('workspace');
            // Document pagination counters must not include the independently
            // required manifest/source/test snapshots read by the runtime.
            if (Object.prototype.hasOwnProperty.call(documents, rel)) readNumber++;
            const text = documents[rel] ?? projectFiles[rel]; if (text === undefined) return { ok: false, error: 'missing' };
            const lines = text.split('\n'), end = Math.min(args.endLine ?? 1000, lines.length);
            return { ok: true, output: { content: lines.slice((args.startLine ?? 1) - 1, end).join('\n'), totalLines: lines.length, truncated: lines.length > end } };
        }
        expect(name).toBe('project_planner');
        expect(snapshotEngineeringChild(name, args, ctx).evidence).toBe(args.evidence);
        // This suite verifies source intake only. The deliberately empty plan
        // must stop at the finite execution lease, before native execution.
        return { ok: true, output: { phases: [{ phaseNumber: 1, tasks: [] }] }, logs: [] };
    });
});
afterEach(() => {
    expect(mockExecuteTool.mock.calls.every(call => ['engineering_discovery', 'inspect_directory', 'read_file', 'project_planner'].includes(call[0]))).toBe(true);
});
test.each([
    'Build a Node API. Read the local specification requirements.txt before implementation.',
    'ابن نظام Node. اقرأ المواصفات requirements.txt ثم طبقها.',
])('complete EN/AR source is read twice at scoped subroot before planner; original request stays exact: %s', async goal => {
    request = goal; const ctx = context(), result = await run(ctx);
    expect(result.error).toBe('isolated_plan_budget'); expect(plannerCalls()).toHaveLength(1);
    expect(readNumber).toBe(2); const args = plannerCalls()[0][1];
    expect(args.projectDescription).toBe(goal); expect(args.evidence.requiredSpecification.content).toContain(documents['requirements.txt']);
    expect(Object.isFrozen(args.evidence.requiredSpecification)).toBe(true);
    expect(args.evidence.sourceEvidence.files).toEqual(Object.entries(projectFiles).map(([path, content]) => ({ path, content, lineCount: content.split('\n').length })));
    for (const relative of Object.keys(projectFiles)) {
        const snapshots = mockExecuteTool.mock.calls.filter(call => call[0] === 'read_file' && call[1].path === path.join(root, relative) && call[1].endLine === 10000);
        expect(snapshots).toHaveLength(2);
    }
    const names = mockExecuteTool.mock.calls.map(call => call[0]); expect(names.lastIndexOf('read_file')).toBeLessThan(names.indexOf('project_planner'));
});
test('requirements past line1000 remain complete and appear verbatim in initial and recovery planner prompts', async () => {
    documents['requirements.txt'] = '\n'.repeat(1001) + 'TAIL_REQUIREMENT_KEEP_DECIMAL_PRECISION';
    const ctx = context(); await run(ctx); expect(readNumber).toBe(4);
    const args = plannerCalls()[0][1], planner: any = new ProjectPlannerTool();
    await planner.execute(args, ctx); expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(mockCallLLM.mock.calls[0][0]).toContain('TAIL_REQUIREMENT_KEEP_DECIMAL_PRECISION');
    expect(mockCallLLM.mock.calls[0][0]).not.toContain('discovery evidence truncated');
    const recovery = planner.createCompactRecoveryPlanningPrompt(request, 'Invalid JSON', undefined, false, false, [], args.evidence);
    expect(recovery).toContain('TAIL_REQUIREMENT_KEEP_DECIMAL_PRECISION');
});
test('an explicitly named md document is selected instead of an unrelated document', async () => {
    request = 'Build a Node API. Read the local specification design.md before implementation.';
    documents = { 'design.md': 'Build the requested API.', 'other.md': 'Unrelated evidence.' };
    await run(); expect(plannerCalls()[0][1].evidence.requiredSpecification.content).toContain('SOURCE: design.md');
    expect(plannerCalls()[0][1].evidence.requiredSpecification.content).not.toContain('Unrelated');
});
test.each(['../requirements.txt', '/requirements.txt', 'C:\\requirements.txt', 'missing.md'])('unsafe or unobserved named source stops before planner: %s', async name => {
    request = `Build a Node API. Read the local specification ${name} before implementation.`;
    const result = await run(); expect(result.ok).toBe(false); expect(plannerCalls()).toHaveLength(0); expect(readNumber).toBe(0);
});
test('unnamed ambiguous documents stop before planner', async () => {
    request = 'Build a Node API. Read the local specification before implementation.';
    documents = { 'requirements.txt': 'One', 'specification.md': 'Two' };
    expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0);
});
test('no document or unsupported extension does not substitute package.json or README', async () => {
    request = 'Build a Node API. Read the local specification design.pdf before implementation.';
    expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0);
});
test.each(['sk-examplekey12345678', 'password=privatevalue', '-----BEGIN PRIVATE KEY-----'])('sensitive source is rejected without planner: %s', async text => {
    documents['requirements.txt'] = text; expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0);
});
test.each([128 * 1024 + 1, -1, 1.5])('invalid/over-limit observed size prevents planner: %s', async size => {
    sizes['requirements.txt'] = size; expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0);
});
test('source budget rejection never dispatches the planner', async () => {
    documents['requirements.txt'] = 'x'.repeat(9100); expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0);
});
test('full evidence budget includes discovery facts and rejects before planner', async () => {
    documents['requirements.txt'] = 'x'.repeat(8500); expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0);
});
test.each(['total', 'truncated', 'missingContent', 'failedRead', 'changedContent'])('inconsistent/failed page receipts stop before planner: %s', async defect => {
    const real = mockExecuteTool.getMockImplementation()!;
    mockExecuteTool.mockImplementation(async (name, args, ctx) => {
        const receipt: any = await real(name, args, ctx);
        if (name === 'read_file' && args.path.endsWith('requirements.txt')) {
            if (defect === 'total' && readNumber === 2) receipt.output.totalLines++;
            if (defect === 'truncated') receipt.output.truncated = true;
            if (defect === 'missingContent') delete receipt.output.content;
            if (defect === 'failedRead') receipt.ok = false;
            if (defect === 'changedContent' && readNumber === 2) receipt.output.content = receipt.output.content.replace('counter', 'COUNTER');
        }
        return receipt;
    });
    expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0);
});
test('line-count limit and cancellation between pages stop before planner', async () => {
    documents['requirements.txt'] = '\n'.repeat(10000); expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0);
    documents['requirements.txt'] = '\n'.repeat(1001) + 'tail'; const real = mockExecuteTool.getMockImplementation()!;
    mockExecuteTool.mockImplementation(async (name, args, ctx) => { const receipt = await real(name, args, ctx); if (name === 'read_file' && args.path.endsWith('requirements.txt')) cancelled = true; return receipt; });
    expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0);
});
test('foreign scope cannot obtain source evidence or planner dispatch', async () => {
    const ctx = context(); expect((await run({ ...ctx, workspaceId: 'foreign' })).ok).toBe(false); expect(mockExecuteTool).not.toHaveBeenCalled();
});
test('a discovery receipt sealed by another scope cannot be relabeled to the current owner', async () => {
    const current = context(), foreign = context();
    const evidence = sealEngineeringEvidence(foreign, { workspaceRoot: root, documentFiles: [{ relativePath: 'requirements.txt', size: Buffer.byteLength(documents['requirements.txt']) }], blockers: [] });
    mockExecuteTool.mockImplementationOnce(async () => ({ ok: true, output: { evidence } }));
    expect((await run(current)).error).toBe('engineering_evidence_untrusted'); expect(readNumber).toBe(0); expect(plannerCalls()).toHaveLength(0);
});
test('planner independently rejects mandatory evidence exceeding budget before provider', async () => {
    const ctx = context(), evidence: any = sealEngineeringEvidence(ctx, { version: 1, mode: 'ambiguous', workspaceRoot: root,
        facts: [], blockers: [], instructionFiles: [], requiredSpecification: { content: 'x'.repeat(9100), sources: [{ path: 'requirements.txt', lineCount: 1 }] } });
    const result: any = await new ProjectPlannerTool().execute({ projectDescription: request, evidence }, ctx);
    expect(result.error).toBe('specification_planner_budget_exceeded'); expect(mockCallLLM).not.toHaveBeenCalled();
});
test('actual guarded file leaf reports complete totalLines and both page states beyond line1000 without changing bytes', async () => {
    const packet = 'D:/Joe/coordination/verification-audits/team-recovery-20261008/capability-development-v1/scoped-discovery-evidence-v1';
    const owned = fs.mkdtempSync(path.join(packet, 'physical-leaf-'));
    const target = path.join(owned, 'requirements.md'), source = 'value\n'.repeat(1001) + 'PHYSICAL_TAIL';
    fs.writeFileSync(target, source);
    const resolver = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(owned);
    try {
        const leaf = new SafeReadFileTool(), receipts: any[] = [];
        for (const [startLine, endLine] of [[1, 1000], [1001, 1002]]) {
            const input = snapshotAutonomousFileInput('read_file', { path: target, startLine, endLine });
            const validated = validateAutonomousFileOperation('read_file', input, owned, path.dirname(owned));
            receipts.push(await leaf.execute(validated, { workspaceId: 'physical-fixture' }));
        }
        expect(receipts[0]).toMatchObject({ ok: true, output: { totalLines: 1002, truncated: true } });
        expect(receipts[0].output.content.split('\n')).toHaveLength(1000);
        expect(receipts[1]).toMatchObject({ ok: true, output: { totalLines: 1002, truncated: false, content: 'value\nPHYSICAL_TAIL' } });
        expect(receipts.map(receipt => receipt.output.content).join('\n')).toBe(source);
        expect(fs.readFileSync(target, 'utf8')).toBe(source);
        fs.writeFileSync(path.join(owned, 'receipts.json'), JSON.stringify({ bytes: Buffer.byteLength(source), totalLines: 1002,
            pages: receipts.map(receipt => ({ totalLines: receipt.output.totalLines, truncated: receipt.output.truncated, lines: receipt.output.content.split('\n').length })) }, null, 2));
    } finally { resolver.mockRestore(); }
});
test('actual physical guard rejects oversized, secret-bearing, foreign and over-line-bound inputs before file leaf', () => {
    const packet = 'D:/Joe/coordination/verification-audits/team-recovery-20261008/capability-development-v1/scoped-discovery-evidence-v1';
    const owned = fs.mkdtempSync(path.join(packet, 'physical-negative-'));
    const huge = path.join(owned, 'large.md'), secret = path.join(owned, 'sensitive.md');
    fs.writeFileSync(huge, 'x'.repeat(128 * 1024 + 1)); fs.writeFileSync(secret, 'password=syntheticvalue');
    expect(() => validateAutonomousFileOperation('read_file', { path: huge }, owned, path.dirname(owned))).toThrow('file_size_limit');
    expect(() => validateAutonomousFileOperation('read_file', { path: secret }, owned, path.dirname(owned))).toThrow('sensitive_or_binary_file');
    expect(() => validateAutonomousFileOperation('read_file', { path: path.join(path.dirname(owned), 'foreign.md') }, owned, path.dirname(owned))).toThrow('path_outside_workspace');
    expect(() => snapshotAutonomousFileInput('read_file', { path: secret, startLine: 1, endLine: 10001 })).toThrow('invalid_file_input');
});
test.each([
    'Fix the existing parser code in parser.ts. Read the local specification requirements.txt before modification.',
    'Repair the existing Node.js function. Read the local specification requirements.txt before repair.',
    'أصلح الدالة الحالية. اقرأ المواصفات requirements.txt قبل الإصلاح.',
    'عدّل كود parser.ts. اقرأ المتطلبات requirements.txt قبل تعديل الكود.',
])('every admitted repair reads its required specification even without a build/run verb: %s', async goal => {
    request = goal; expect(snapshotEngineeringRequest({ request: goal, path: root }).request).toBe(goal);
    await run(); expect(readNumber).toBe(2); expect(plannerCalls()).toHaveLength(1);
    expect(plannerCalls()[0][1].evidence.requiredSpecification.content).toContain(documents['requirements.txt']);
});
test.each([
    'Fix the existing parser code. Read the local specification missing.txt before modification.',
    'أصلح الدالة الحالية. اقرأ المواصفات missing.txt قبل الإصلاح.',
])('missing required source stops admitted repairs before planning: %s', async goal => {
    request = goal; expect(snapshotEngineeringRequest({ request: goal, path: root }).request).toBe(goal);
    expect((await run()).ok).toBe(false); expect(plannerCalls()).toHaveLength(0); expect(mockCallLLM).not.toHaveBeenCalled();
});
test('ordinary password length requirements are diagnosed separately from literal credentials', async () => {
    documents['requirements.txt'] = 'Password: minimum eight characters';
    const packet = 'D:/Joe/coordination/verification-audits/team-recovery-20261008/capability-development-v1/scoped-discovery-evidence-v1';
    const owned = fs.mkdtempSync(path.join(packet, 'physical-requirement-false-positive-'));
    const target = path.join(owned, 'requirements.md'); fs.writeFileSync(target, documents['requirements.txt']);
    const resolver = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(owned);
    try {
        const validated = validateAutonomousFileOperation('read_file', { path: target }, owned, path.dirname(owned));
        const receipt: any = await new SafeReadFileTool().execute(validated, { workspaceId: 'physical-fixture' });
        expect(receipt.output.content).toBe(documents['requirements.txt']);
        await run(); expect(plannerCalls()).toHaveLength(1);
        expect(plannerCalls()[0][1].evidence.requiredSpecification.content).toContain(receipt.output.content);
    } finally { resolver.mockRestore(); }
});
test.each(['Windows CRLF requirements\r\nKeep UTF8: متطلبات\r\nTAIL', '\ufeffUTF8 BOM requirements\r\nمتطلبات عربية\r\nTAIL'])('actual Windows CRLF/BOM leaf preserves bytes and source intake: %s', async source => {
    const packet = 'D:/Joe/coordination/verification-audits/team-recovery-20261008/capability-development-v1/scoped-discovery-evidence-v1';
    const owned = fs.mkdtempSync(path.join(packet, 'physical-windows-'));
    const target = path.join(owned, 'requirements.md'); fs.writeFileSync(target, source, 'utf8');
    const resolver = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(owned);
    try {
        const validated = validateAutonomousFileOperation('read_file', { path: target, startLine: 1, endLine: 1000 }, owned, path.dirname(owned));
        const receipt: any = await new SafeReadFileTool().execute(validated, { workspaceId: 'physical-fixture' });
        expect(receipt.output).toMatchObject({ content: source, totalLines: 3, truncated: false });
        expect(Buffer.from(receipt.output.content, 'utf8')).toEqual(fs.readFileSync(target));
        documents['requirements.txt'] = receipt.output.content; await run();
        expect(plannerCalls()[0][1].evidence.requiredSpecification.content).toContain(source);
        fs.writeFileSync(path.join(owned, 'receipt.json'), JSON.stringify({ utf8Bytes: Buffer.byteLength(source), totalLines: receipt.output.totalLines,
            crlfRetained: receipt.output.content.includes('\r\n'), bomRetained: receipt.output.content.startsWith('\ufeff'), byteIdentical: true }, null, 2));
    } finally { resolver.mockRestore(); }
});
test('assembled source retains a code fence from page1 and rejects an apparent requirement on page2', async () => {
    documents['requirements.txt'] = '```yaml\n' + '\n'.repeat(1000) + 'password: minimum eight characters\n```';
    expect((await run()).error).toBe('engineering_specification_failed');
    expect(readNumber).toBe(2); expect(plannerCalls()).toHaveLength(0); expect(mockCallLLM).not.toHaveBeenCalled();
});
