/**
 * A DEATH WITH NO NOTE, AND A REPAIR THAT REPEATS ITSELF.
 *
 *     [!] Joe stopped (exit code: -1). Restarting in 3 seconds...
 *     [3/3] Starting Joe (attempt #9)
 *
 * Eight deaths and no reason anywhere — nothing in the process listened for
 * the two events that kill a Node server, so `data/crash.log` did not exist
 * and the supervisor printed only the exit code it had.
 *
 *     Node init failed: … `no_url`  → a 21-node "Fix and continue" plan
 *     Node read_config failed: File not found → a 27-node one
 *     Node read_config_file failed: File not found → max retries
 *
 * Fifty steps chasing a file that never existed, invented twice from the same
 * sentence. Both are pinned here.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { crashLogPath, noteActivity, writeCrashNote } from '../shared/crash-log';

const ORCH = () => fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');

describe('every death leaves a note', () => {
    const prev = process.cwd();
    let work = '';

    beforeEach(() => {
        work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-crashlog-'));
        fs.mkdirSync(path.join(work, 'api'), { recursive: true });
        process.chdir(path.join(work, 'api'));
    });
    afterEach(() => {
        process.chdir(prev);
        try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    it('writes the reason, the stack and the moment', () => {
        writeCrashNote('UNCAUGHT EXCEPTION', new Error('boom'));
        const note = fs.readFileSync(crashLogPath(), 'utf-8');
        expect(note).toMatch(/UNCAUGHT EXCEPTION/);
        expect(note).toMatch(/السبب: boom/);
        expect(note).toMatch(/at .+/);
        expect(note).toMatch(/pid=\d+ +node=v/);
        expect(note).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('and what Joe was doing when it happened', () => {
        noteActivity('building a react project');
        writeCrashNote('UNHANDLED REJECTION', new Error('x'));
        expect(fs.readFileSync(crashLogPath(), 'utf-8')).toMatch(/آخر ما كان يفعله جو: building a react project/);
    });

    it('survives a non-Error being thrown', () => {
        expect(() => writeCrashNote('X', 'just a string')).not.toThrow();
        expect(fs.readFileSync(crashLogPath(), 'utf-8')).toMatch(/just a string/);
    });

    it('a restart loop cannot fill the disk with its own diary', () => {
        for (let i = 0; i < 400; i++) writeCrashNote('LOOP', new Error(`n${i} ${'x'.repeat(500)}`));
        const size = fs.statSync(crashLogPath()).size;
        expect(size).toBeLessThan(400 * 1024);
        // …and the newest death is still the one you can read.
        expect(fs.readFileSync(crashLogPath(), 'utf-8')).toMatch(/n399/);
    });

    it('lives beside the other things Joe remembers', () => {
        expect(crashLogPath().replace(/\\/g, '/')).toMatch(/api\/data\/crash\.log$/);
    });
});

describe('the recorder is installed before anything can throw', () => {
    it('at the very top of main(), not after the server is up', () => {
        const entry = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.ts'), 'utf-8');
        const at = entry.indexOf('installCrashRecorder(logger)');
        expect(at).toBeGreaterThan(0);
        expect(at).toBeLessThan(entry.indexOf('createApp()'));
    });

    it('and a rejected promise no longer kills the server', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'crash-log.ts'), 'utf-8');
        const handler = src.slice(src.indexOf("process.on('unhandledRejection'"), src.indexOf("process.on('uncaughtException'"));
        expect(handler).toMatch(/writeCrashNote/);
        expect(handler).not.toMatch(/process\.exit/);
        // …while an uncaught exception still stops deliberately.
        expect(src.slice(src.indexOf("process.on('uncaughtException'"))).toMatch(/process\.exit\(1\)/);
    });

    it('and a deliberate stop is not filed as a crash', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'crash-log.ts'), 'utf-8');
        expect(src).toMatch(/'SIGINT', 'SIGTERM'/);
        expect(src).toMatch(/process\.exit\(0\)/);
    });

    it('and the supervisor shows the note instead of swallowing it', () => {
        const ps = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'start-joe.ps1'), 'utf-8');
        expect(ps).toMatch(/Get-Content \$crashLog -Tail/);
        // A note from an earlier run must not be presented as today's reason.
        expect(ps).toMatch(/\$stamp -ge \$startedAt/);
    });
});

describe('a repair does not re-derive the same hallucination', () => {
    it('refuses to plan twice for the same failure shape', async () => {
        const { AgentOrchestrator } = require('../orchestration/AgentOrchestrator');
        const orch: any = new AgentOrchestrator();
        const node = { id: 'read_config', task: 'Read the configuration file', agent: 'Dev', status: 'failed' };
        const memory: any = { sessionId: 's', getHistory: () => [] };
        await orch.attemptRecovery(node, new Error('File not found'), memory, { nodes: [] });
        const again = await orch.attemptRecovery(node, new Error('File not found'), memory, { nodes: [] });
        expect(again).toEqual({ recovered: false, newNodes: [] });
    }, 25_000);

    it('and treats the same failure with different numbers and paths as the same failure', async () => {
        const { AgentOrchestrator } = require('../orchestration/AgentOrchestrator');
        const orch: any = new AgentOrchestrator();
        const node = { id: 'n', task: 't', agent: 'Dev', status: 'failed' };
        const memory: any = { sessionId: 's', getHistory: () => [] };
        await orch.attemptRecovery(node, new Error('ENOENT: no such file C:\\Users\\home\\a\\b.json (attempt 1)'), memory, { nodes: [] });
        const again = await orch.attemptRecovery(node, new Error('ENOENT: no such file C:\\Users\\home\\c\\d.json (attempt 2)'), memory, { nodes: [] });
        expect(again.recovered).toBe(false);
    }, 25_000);

    it('but a genuinely different failure is still repaired', async () => {
        const { AgentOrchestrator } = require('../orchestration/AgentOrchestrator');
        const orch: any = new AgentOrchestrator();
        const node = { id: 'n', task: 't', agent: 'Dev', status: 'failed' };
        const memory: any = { sessionId: 's', getHistory: () => [] };
        await orch.attemptRecovery(node, new Error('File not found'), memory, { nodes: [] });
        const other = await orch.attemptRecovery(node, new Error('port 5002 already in use'), memory, { nodes: [] });
        // It may or may not produce nodes (no provider in the suite) — what it
        // must NOT do is refuse it as a repeat.
        expect(other).toBeDefined();
        expect(orch.repairedSignatures.size).toBe(2);
    }, 25_000);

    it('and one failed step never buys a twenty-one-node plan', () => {
        const src = ORCH();
        expect(src).toMatch(/const MAX_REPAIR_NODES = \d+;/);
        const cap = Number((src.match(/const MAX_REPAIR_NODES = (\d+);/) || [])[1]);
        expect(cap).toBeGreaterThan(0);
        expect(cap).toBeLessThanOrEqual(10);
        expect(src).toMatch(/planned\.slice\(0, MAX_REPAIR_NODES\)/);
        // …and what was dropped is said out loud, not dropped silently.
        expect(src).toMatch(/أبقيتُ أول \$\{kept\.length\}/);
    });
});
