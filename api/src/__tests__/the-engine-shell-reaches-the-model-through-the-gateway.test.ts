/**
 * THE MODEL'S shell_* TOOLS ARE THE REGISTERED engine_shell_* TOOLS, THROUGH THE GATEWAY.
 *
 * The engine's model sees four short names. Each must arrive at its
 * registered definition through ToolService.executeTool (the policy and
 * execution gateway), carry the run's folder and cancellation from Joe's
 * context rather than from the model, and come back as a ToolOutcome whose
 * facts the run state can keep. The process registry the loop holds, and the
 * machine facts the prompt states, are measured here too.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { tools } from '../modules/tools/registry';
import * as ToolService from '../modules/services/ToolService';
import {
    createProcessRegistry, parseShellLogsArgs, parseShellRunArgs, parseShellStartArgs, parseShellStopArgs,
    shellLogsTool, shellRunTool, shellStartTool, shellStopTool, shellTools, toolContextFor,
} from '../core/engine/tools/shell';
import { machineFacts, stopAllForRun } from '../modules/tools/definitions/EngineShellTools';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import type { ToolContext } from '../core/engine/types';

jest.setTimeout(180_000);

const WINDOWS = process.platform === 'win32';
const TMP = process.env.JOE_TEST_TMP_ROOT || os.tmpdir();
let base: string;
let root: string;
const runs = new Set<string>();

beforeAll(() => {
    base = fs.mkdtempSync(path.join(TMP, 'joe-eng-shell-gateway-'));
    root = path.join(base, 'app');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'eng-shell-forever.js'),
        'require("fs").writeFileSync(process.argv[2], String(process.pid));\nsetInterval(() => {}, 1000);\n');
    fs.writeFileSync(path.join(root, 'eng-shell-server.js'), [
        'const http = require("http");',
        'const server = http.createServer((req, res) => res.end("ok"));',
        'server.listen(0, "127.0.0.1", () => console.log("Server listening on http://127.0.0.1:" + server.address().port + "/"));',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'eng-shell-never-serves.js'), 'setInterval(() => {}, 1000);\n');
});
beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(base); });
afterEach(() => { jest.restoreAllMocks(); });
afterAll(async () => {
    for (const runId of runs) await stopAllForRun(runId);
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

function engineContext(runId: string, toolContext: Record<string, unknown> = {}): { ctx: ToolContext; abort: () => void } {
    runs.add(runId);
    const controller = new AbortController();
    const cancelled = new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true }));
    const ctx = {
        runId, projectDir: root, stateDir: path.join(root, '.joe'), signal: controller.signal, cancelled,
        deadlineAt: Date.now() + 10 * 60_000, language: 'en', request: 'test request',
        processes: undefined as any, browser: () => { throw new Error('no browser here'); },
        state: { plan: { requirements: [], steps: [], revision: 0 }, files: new Map(), commands: [], served: [], pages: [], verifications: [], steps: 0, modelMs: 0, toolMs: 0 },
        emit: () => { /* not observed here */ },
        joe: { toolContext: { userId: 'user-engine-shell', workspaceId: 'ws-engine-shell', runId, projectRoot: root, ...toolContext } },
    } as unknown as ToolContext;
    return { ctx, abort: () => controller.abort() };
}
const inFirewall = <T>(fn: () => Promise<T>) => executionFirewall.runInContext('engine-shell-gateway-test', fn);

describe('the registry carries the engine shell tools', () => {
    it('engine_shell_run, _start, _logs and _stop are registered, runnable, with shell_execute\'s permission', () => {
        const shellExecute: any = tools.find((t: any) => t.name === 'shell_execute');
        for (const name of ['engine_shell_run', 'engine_shell_start', 'engine_shell_logs', 'engine_shell_stop']) {
            const t: any = tools.find((x: any) => x.name === name);
            expect(`${name}:${!!t}`).toBe(`${name}:true`);
            expect(typeof t.execute).toBe('function');
            expect(t.permissions).toEqual(shellExecute.permissions);
            expect(t.inputSchema.type).toBe('object');
        }
        expect((tools.find((x: any) => x.name === 'engine_shell_run') as any).sideEffects).toEqual(shellExecute.sideEffects);
    });
});

describe('the model\'s tools say what they are', () => {
    it('short names; shell_run waits for the end and sends servers to shell_start; the shell is named', () => {
        expect(shellTools.map(t => t.name)).toEqual(['shell_run', 'shell_start', 'shell_logs', 'shell_stop']);
        expect(shellRunTool.description).toMatch(/wait until it ENDS/);
        expect(shellRunTool.description).toMatch(/never use it to start a server[^.]*: use shell_start for those/);
        expect(shellStartTool.description).toMatch(/actually ANSWERED an HTTP request, never a guess/);
        if (WINDOWS) {
            expect(shellRunTool.description).toMatch(/The shell is Windows PowerShell 5\.1: chain commands with `;` \(it has no `&&` or `\|\|`\)/);
            expect(shellStartTool.description).toMatch(/Windows PowerShell 5\.1/);
        } else {
            expect(shellRunTool.description).toMatch(/The shell is bash/);
        }
        for (const t of shellTools) expect(Object.keys((t.parameters as any).properties)[0]).toBe(t.name === 'shell_run' ? 'command' : 'name');
    });

    it('arguments are checked, and every error says what to change', () => {
        expect(parseShellRunArgs({})).toMatchObject({ ok: false, error: expect.stringMatching(/needs a "command"/) });
        expect(parseShellRunArgs({ command: 'npm test', timeout_seconds: -1 })).toMatchObject({ ok: false, error: expect.stringMatching(/positive number/) });
        expect(parseShellRunArgs({ command: ' npm test ', timeout_seconds: '120', projectRoot: '/etc' }))
            .toEqual({ ok: true, value: { command: 'npm test', timeout_seconds: 120 } });
        expect(parseShellStartArgs({ name: 'bad name!', command: 'npm run dev' })).toMatchObject({ ok: false, error: expect.stringMatching(/needs a "name"/) });
        expect(parseShellStartArgs({ name: 'web', command: 'npm run dev', port: 70000 })).toMatchObject({ ok: false, error: expect.stringMatching(/between 1 and 65535/) });
        expect(parseShellStartArgs({ name: 'web', command: 'npm run dev', port: '5173', cwd: 'client' }))
            .toEqual({ ok: true, value: { name: 'web', command: 'npm run dev', cwd: 'client', port: 5173 } });
        expect(parseShellLogsArgs({ name: 'web', lines: 0 })).toMatchObject({ ok: false });
        expect(parseShellStopArgs('web')).toMatchObject({ ok: false });
        expect(parseShellStopArgs({ name: 'web' })).toEqual({ ok: true, value: { name: 'web' } });
    });
});

describe('a call reaches its registered tool through the gateway', () => {
    it('shell_run → engine_shell_run via executeTool, with the run\'s folder from Joe\'s context; the outcome carries the command fact', async () => {
        const gateway = jest.spyOn(ToolService, 'executeTool');
        const { ctx } = engineContext('run-gateway-a');
        const out = await inFirewall(() => shellRunTool.run({ command: 'node -e "console.log(\'through the gateway\')"' }, ctx));
        expect(out.ok).toBe(true);
        expect(out.output).toContain('through the gateway');
        expect(out.facts?.command).toMatchObject({ exitCode: 0, cwd: '.', command: 'node -e "console.log(\'through the gateway\')"' });
        expect(gateway).toHaveBeenCalledTimes(1);
        const [name, input, context] = gateway.mock.calls[0] as any[];
        expect(name).toBe('engine_shell_run');
        expect(input).toMatchObject({ command: expect.any(String), deadline_at: ctx.deadlineAt });
        expect(input.projectRoot).toBeUndefined();
        expect(context).toMatchObject({ projectRoot: root, runId: 'run-gateway-a', workspaceId: 'ws-engine-shell' });
    });

    it('the engine\'s own cancellation reaches the command: the gateway stops waiting, and the child is gone', async () => {
        const { ctx, abort } = engineContext('run-gateway-b');
        const pidFile = path.join(root, 'eng-shell-gateway.pid');
        const poll = setInterval(() => { if (fs.existsSync(pidFile)) { clearInterval(poll); abort(); } }, 100);
        const out = await inFirewall(() => shellRunTool.run({ command: 'node eng-shell-forever.js eng-shell-gateway.pid', timeout_seconds: 60 }, ctx));
        clearInterval(poll);
        expect(out).toEqual({ ok: false, output: 'shell_run was stopped: the run was cancelled.' });
        const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
        let gone = false;
        for (let i = 0; i < 150 && !gone; i++) {
            try { process.kill(childPid, 0); await new Promise(res => setTimeout(res, 100)); } catch { gone = true; }
        }
        expect(gone).toBe(true);
    });

    it('a folder and a run missing from Joe\'s context are the engine\'s own, never the model\'s', () => {
        const { ctx } = engineContext('run-gateway-c', { projectRoot: undefined, runId: undefined });
        const joined = toolContextFor(ctx);
        expect(joined.projectRoot).toBe(root);
        expect(joined.runId).toBe('run-gateway-c');
        expect(typeof joined.cancellation.then).toBe('function');
        expect(joined.isCancelled()).toBe(false);
    });

    it('a refusal by the gateway itself is reported as a refusal', async () => {
        jest.spyOn(ToolService, 'executeTool').mockResolvedValue({ ok: false, error: 'rate_limited', output: { retryAfterMs: 5 }, logs: [] } as any);
        const { ctx } = engineContext('run-gateway-d');
        const out = await shellStopTool.run({ name: 'web' }, ctx);
        expect(out).toEqual({ ok: false, output: 'shell_stop was refused by Joe\'s tool gateway: rate_limited' });
    });
});

describe('the run\'s process registry', () => {
    it('start, list, logs, stop and stopAll, for the run its context names', async () => {
        const { ctx } = engineContext('run-gateway-e');
        const registry = createProcessRegistry((ctx.joe as any).toolContext);
        const web = await inFirewall(() => registry.start({ name: 'web', command: 'node eng-shell-server.js', cwd: '.' }));
        expect(web.running).toBe(true);
        expect(web.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect(web.output).toMatch(/It answered at/);
        expect(registry.list()).toEqual([expect.objectContaining({ name: 'web', running: true, url: web.url })]);
        const read = registry.logs('web', 5);
        expect(read?.output).toContain('Server listening on');
        expect(registry.logs('nope')).toBeUndefined();
        expect(await inFirewall(() => registry.stop('web'))).toBe(true);
        expect(registry.list()).toEqual([expect.objectContaining({ name: 'web', running: false })]);

        const slow = await inFirewall(() => registry.start({ name: 'slow', command: 'node eng-shell-never-serves.js', cwd: '.', readyTimeoutMs: 2000 }));
        expect(slow.running).toBe(true);
        expect(slow.url).toBeUndefined();
        expect(slow.output).toMatch(/not serving yet/);
        await registry.stopAll();
        expect(registry.list()).toEqual([]);
    });

    it('a registry needs the run: a tool context without a runId is refused, never keyed by nothing', () => {
        for (const toolContext of [{ projectRoot: root, workspaceId: 'ws-engine-shell' }, { runId: '   ' }, undefined]) {
            expect(() => createProcessRegistry(toolContext)).toThrow(/needs the run's tool context with its runId/);
        }
        expect(createProcessRegistry({ runId: 'run-gateway-g' }).list()).toEqual([]);
    });

    it('the shell_start, shell_logs and shell_stop tools carry the served process as a fact', async () => {
        const { ctx } = engineContext('run-gateway-f');
        const started = await inFirewall(() => shellStartTool.run({ name: 'api', command: 'node eng-shell-server.js' }, ctx));
        expect(started.ok).toBe(true);
        expect(started.facts?.served).toMatchObject({ name: 'api', running: true, url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/$/) });
        const read = await inFirewall(() => shellLogsTool.run({ name: 'api' }, ctx));
        expect(read.facts?.served?.url).toBe(started.facts?.served?.url);
        const stopped = await inFirewall(() => shellStopTool.run({ name: 'api' }, ctx));
        expect(stopped.ok).toBe(true);
        expect(stopped.facts?.served).toMatchObject({ name: 'api', running: false });
    });
});

describe('the machine, as the prompt states it', () => {
    it('platform, the shell, and node and npm versions, asked once', async () => {
        const facts = await inFirewall(() => machineFacts());
        expect(facts.platform).toBe(process.platform);
        expect(facts.shell).toMatch(WINDOWS ? /^Windows PowerShell 5\.\d$/ : /^(?:bash|sh)$/);
        expect(facts.node).toMatch(/^\d+\.\d+\.\d+$/);
        expect(facts.npm).toMatch(/^\d+\.\d+\.\d+$/);
        if (facts.python !== undefined) expect(facts.python).toMatch(/^3\.\d+/);
        const probes = jest.spyOn(ExecutionGateway, 'execute');
        expect(await inFirewall(() => machineFacts())).toBe(facts);
        expect(probes).not.toHaveBeenCalled();
    });

    it('an answer the firewall cut short is not kept: the next call asks again', async () => {
        let isolated: any;
        let firewall: any;
        jest.isolateModules(() => {
            isolated = require('../modules/tools/definitions/EngineShellTools');
            firewall = require('../orchestration/AgentExecutionFirewall').executionFirewall;
        });
        const outside = await isolated.machineFacts();
        expect(outside.platform).toBe(process.platform);
        expect(outside.node).toBeUndefined();
        expect(outside.npm).toBeUndefined();
        const inside = await firewall.runInContext('engine-shell-facts', () => isolated.machineFacts());
        expect(inside.node).toMatch(/^\d+\.\d+\.\d+$/);
    });
});
