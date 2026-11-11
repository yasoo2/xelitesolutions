/**
 * THE ENGINE'S FILE TOOLS SPEAK TO THE MODEL, THROUGH JOE'S GATEWAY.
 *
 * core/engine/tools/files.ts: file_read, file_write, file_edit, file_list and
 * file_search as the model sees them. Their schemas keep a fixed key order
 * (the tool list is part of every prompt's cached prefix), their arguments are
 * normalised from the names other agents use, every call goes through
 * ToolService.executeTool with Joe's tool context, a write or an edit
 * reports facts.filesChanged, and ToolService's per-minute limit (one bucket
 * per tool name, every run together) leaves room for the pace a run reads
 * at: a refused call would cost the run a step it cannot wait out. Last, the
 * real loop runs them for a scripted model and delivers what they wrote.
 */
import path from 'path';
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';
import type { EngineModel, EngineTool, ModelStep, ToolContext, VerificationReport } from '../core/engine/types';

jest.setTimeout(180_000);

let fx: FileToolsFixture;
let files: typeof import('../core/engine/tools/files');
let firewall: typeof import('../orchestration/AgentExecutionFirewall')['executionFirewall'];
beforeAll(() => {
    fx = fileToolsFixture('adapters');
    files = require('../core/engine/tools/files');
    firewall = require('../orchestration/AgentExecutionFirewall').executionFirewall;
    fx.put('src/app.js', 'export const a = 1;\n');
    fx.put('redos.txt', `${'a'.repeat(40)}!\n`);
});
afterAll(() => fx.cleanup());

function ctx(over: Partial<ToolContext> = {}): ToolContext {
    return {
        runId: String(fx.context.runId), projectDir: fx.project, stateDir: path.join(fx.project, '.joe'),
        signal: new AbortController().signal, cancelled: new Promise<void>(() => undefined), deadlineAt: Date.now() + 600_000,
        language: 'en', request: 'test', processes: {} as any, browser: () => { throw new Error('no browser here'); },
        state: {} as any, emit: () => undefined, joe: { toolContext: fx.context }, ...over,
    };
}

/** Parse as the loop does, then run inside the firewall context the engine runs in. */
async function call(tool: EngineTool, args: unknown, over: Partial<ToolContext> = {}) {
    const parsed = tool.parse(args);
    if (!parsed.ok) throw new Error(`parse failed: ${parsed.error}`);
    return firewall.runInContext(`adapter-${tool.name}`, () => tool.run(parsed.value, ctx(over)), {
        userId: String(fx.context.userId), sessionId: String(fx.context.sessionId), runId: String(fx.context.runId),
    });
}

describe('what the model reads is fixed, short and exact', () => {
    it('five tools, in this order, each a schema whose keys never move', () => {
        expect(files.fileTools.map(t => t.name)).toEqual(['file_read', 'file_write', 'file_edit', 'file_list', 'file_search']);
        const shape = files.fileTools.map(t => [t.name, Object.keys(t.parameters), Object.keys((t.parameters as any).properties), (t.parameters as any).required ?? null]);
        expect(shape).toEqual([
            ['file_read', ['type', 'properties', 'required'], ['path', 'offset', 'limit'], ['path']],
            ['file_write', ['type', 'properties', 'required'], ['path', 'content'], ['path', 'content']],
            ['file_edit', ['type', 'properties', 'required'], ['path', 'old_text', 'new_text', 'replace_all'], ['path', 'old_text', 'new_text']],
            ['file_list', ['type', 'properties'], ['path', 'pattern', 'depth'], null],
            ['file_search', ['type', 'properties', 'required'], ['pattern', 'path', 'glob', 'ignore_case', 'literal'], ['pattern']],
        ]);
    });

    it('descriptions are plain English sentences a small model can follow', () => {
        for (const t of files.fileTools) {
            expect([t.name, /^[\x20-\x7e]+$/u.test(t.description), t.description.length <= 450]).toEqual([t.name, true, true]);
            for (const [key, spec] of Object.entries((t.parameters as any).properties)) {
                expect([t.name, key, typeof (spec as any).description === 'string' && (spec as any).description.length > 10]).toEqual([t.name, key, true]);
            }
        }
    });
});

describe('arguments are read the way other agents write them', () => {
    it('aliases, numbers in strings and true in a string are normalised', () => {
        expect(files.fileReadTool.parse({ file_path: 'src/app.js', offset: '3' })).toEqual({ ok: true, value: { path: 'src/app.js', offset: 3 } });
        expect(files.fileEditTool.parse({ file: 'x.js', old_string: 'a', new_string: 'b', replaceAll: 'true' }))
            .toEqual({ ok: true, value: { path: 'x.js', old_text: 'a', new_text: 'b', replace_all: true } });
        expect(files.fileSearchTool.parse({ query: 'useState', include: '*.jsx', case_insensitive: true }))
            .toEqual({ ok: true, value: { pattern: 'useState', glob: '*.jsx', ignore_case: true } });
        expect(files.fileListTool.parse(undefined)).toEqual({ ok: true, value: {} });
    });

    it('a .json file given as an object is that object\'s JSON', () => {
        expect(files.fileWriteTool.parse({ path: 'p.json', content: { a: 1 } })).toEqual({ ok: true, value: { path: 'p.json', content: '{\n  "a": 1\n}\n' } });
    });

    it('what cannot be read is refused with what to send instead', () => {
        expect(files.fileReadTool.parse(null)).toEqual({ ok: false, error: 'file_read takes an object: {"path": "src/App.jsx", "offset": 1, "limit": 400}.' });
        expect(files.fileReadTool.parse({})).toEqual({ ok: false, error: 'file_read needs "path": the file to read, relative to the project folder.' });
        expect(files.fileReadTool.parse({ path: 'a', limit: 'all' })).toEqual({ ok: false, error: 'file_read: "limit" must be a number (got "all").' });
        expect(files.fileWriteTool.parse({ path: 'a.js' })).toEqual({ ok: false, error: 'file_write needs "content": the complete text of the file.' });
        expect(files.fileWriteTool.parse({ path: 'a.js', content: { a: 1 } })).toEqual({ ok: false, error: 'file_write: "content" must be a string (got object).' });
        expect(files.fileEditTool.parse({ path: 'a.js', new_text: 'b' })).toMatchObject({ ok: false, error: expect.stringMatching(/^file_edit needs "old_text"/u) });
        expect(files.fileSearchTool.parse({ path: 'src' })).toMatchObject({ ok: false, error: expect.stringMatching(/^file_search needs "pattern"/u) });
    });
});

describe('every call goes through executeTool, and a change is a fact', () => {
    it('a write reports created, then modified, with its bytes', async () => {
        const first = await call(files.fileWriteTool, { path: 'src/b.js', content: 'export const b = 1;\n' });
        expect(first).toEqual({ ok: true, output: 'Wrote src/b.js (created, 20 bytes).\nJavaScript syntax OK.', facts: { filesChanged: [{ path: 'src/b.js', change: 'created', bytes: 20 }] } });
        const second = await call(files.fileWriteTool, { path: 'src/b.js', content: 'export const b = 22;\n' });
        expect(second.facts).toEqual({ filesChanged: [{ path: 'src/b.js', change: 'modified', bytes: 21 }] });
    });

    it('an edit is a modification; a read, a list and a search change nothing', async () => {
        const edited = await call(files.fileEditTool, { path: 'src/app.js', old_text: 'a = 1', new_text: 'a = 2' });
        expect(edited.facts).toEqual({ filesChanged: [{ path: 'src/app.js', change: 'modified', bytes: 20 }] });
        const read = await call(files.fileReadTool, { path: 'src/app.js' });
        expect(read).toEqual({ ok: true, output: '     1\texport const a = 2;\n[src/app.js: lines 1-1 of 1, the whole file.]' });
        expect((await call(files.fileListTool, { path: 'src' })).facts).toBeUndefined();
        expect((await call(files.fileSearchTool, { pattern: 'const' })).output).toContain('src/app.js:1: export const a = 2;');
    });

    it('a refusal comes back as the tool\'s own sentence', async () => {
        expect(await call(files.fileReadTool, { path: 'src/missing.js' })).toEqual({ ok: false, output: 'src/missing.js does not exist. src/ has: app.js, b.js.' });
    });

    it('the search\'s deadline never outlives the run\'s', async () => {
        const r = await call(files.fileSearchTool, { pattern: '(a+)+$', path: 'redos.txt' }, { deadlineAt: Date.now() + 1_500 });
        expect(r.ok).toBe(false);
        expect(r.output).toMatch(/^The search stopped after 1\.[0-5] s with 0 of 1 file searched/u);
    });
});

describe('a run is not throttled at the pace it works', () => {
    it('150 reads in one minute are all answered: ToolService\'s per-minute limit leaves room for a run', async () => {
        const refused: string[] = [];
        for (let i = 0; i < 150; i++) {
            const r = await call(files.fileReadTool, { path: 'src/app.js' });
            if (!r.ok) refused.push(r.output);
        }
        expect(refused).toEqual([]);
    });
});

describe('two ends that must agree are checked, not trusted', () => {
    it('a tool context bound to another folder than the run\'s is refused, and nothing is written', async () => {
        const r = await call(files.fileWriteTool, { path: 'src/c.js', content: 'x\n' }, { projectDir: path.join(fx.workspace, 'another-run') });
        expect(r).toEqual({ ok: false, output: 'Nothing was done: Joe bound the file tools to a different folder than this run\'s project folder. This is a wiring fault in Joe, not in your call.' });
        expect(fx.exists('src/c.js')).toBe(false);
    });

    it('no tool context means no project folder, and a call outside the firewall cannot run', async () => {
        expect(await call(files.fileReadTool, { path: 'src/app.js' }, { joe: {} })).toEqual({ ok: false, output: 'No project folder is bound to this run.' });
        const outside = await files.fileReadTool.run({ path: 'src/app.js' }, ctx());
        expect(outside.ok).toBe(false);
        expect(outside.output).toMatch(/^file_read could not run: /u);
    });

    it('the gateway\'s own refusals are put in words', () => {
        expect(files.outcomeOf('file_read', { ok: false, error: 'rate_limited', output: { retryAfterMs: 2_500 } }).output)
            .toBe('file_read was not run: Joe allows a limited number of these calls per minute; try again in 3 s.');
        expect(files.outcomeOf('file_write', { ok: false, error: 'approval_required', output: { risk: 'high' } }).output)
            .toBe('file_write was not run: Joe asks the owner\'s approval for it first (risk: high).');
        expect(files.outcomeOf('file_edit', { ok: false, error: 'policy_blocked', output: { reason: 'tool_not_admitted' } }).output)
            .toBe('file_edit was not run: Joe\'s policy blocked it (tool_not_admitted).');
    });
});

describe('the loop runs them', () => {
    it('a scripted model writes, edits and reads through them, and the run is delivered with the files it changed', async () => {
        const { runEngine } = require('../core/engine/loop') as typeof import('../core/engine/loop');
        const { planUpdateTool } = require('../core/engine/plan') as typeof import('../core/engine/plan');
        const { finishTool } = require('../core/engine/finish') as typeof import('../core/engine/finish');
        const turns = [
            [{ name: 'file_write', args: { path: 'index.html', content: '<h1>Book</h1>\n' } }],
            [{ name: 'file_edit', args: { path: 'index.html', old_string: '<h1>Book</h1>', new_string: '<h1>Book a table</h1>' } }],
            [{ name: 'file_read', args: { file_path: 'index.html' } }],
            [{ name: 'task_finish', args: { summary: 'A page with a booking heading.' } }],
        ];
        let i = 0;
        const seen: string[] = [];
        const model: EngineModel = {
            label: 'scripted:files', vision: false, contextTokens: () => 64_000,
            async step(messages): Promise<ModelStep> {
                const last = messages[messages.length - 1];
                if (last.role === 'tool') seen.push(String(last.content));
                const calls = turns[Math.min(i++, turns.length - 1)];
                return { text: '', toolCalls: calls.map((c, k) => ({ id: `c${i}_${k}`, name: c.name, arguments: JSON.stringify(c.args) })), durationMs: 1 };
            },
        };
        const verifier = async (c: ToolContext): Promise<VerificationReport> => {
            const passed = require('fs').readFileSync(path.join(c.projectDir, 'index.html'), 'utf8').includes('Book a table');
            return { passed, checks: [{ id: 'files', status: passed ? 'passed' : 'failed', detail: 'index.html' }], unproven: [], at: 0 };
        };
        const result = await firewall.runInContext('adapter-loop', () => runEngine({
            runId: String(fx.context.runId), request: 'Build a booking page', language: 'en', projectDir: fx.project,
            deadlineAt: Date.now() + 600_000, signal: new AbortController().signal, emit: () => undefined, joe: { toolContext: fx.context },
        }, {
            model, tools: [planUpdateTool, ...files.fileTools, finishTool(verifier)],
            processes: { async start() { throw new Error('no processes'); }, logs: () => undefined, async stop() { return false; }, list: () => [], async stopAll() { /* none */ } },
            browser: () => { throw new Error('no browser'); },
            machine: { platform: 'linux', shell: 'bash' },
        }), { userId: String(fx.context.userId), sessionId: String(fx.context.sessionId), runId: String(fx.context.runId) });

        expect(result.status).toBe('delivered');
        expect(result.filesChanged).toEqual([{ path: 'index.html', change: 'modified', bytes: 22 }]);
        expect(seen[0]).toBe('Wrote index.html (created, 14 bytes).');
        expect(seen[2]).toContain('     1\t<h1>Book a table</h1>');
        expect(fx.text('index.html')).toBe('<h1>Book a table</h1>\n');
    });
});
