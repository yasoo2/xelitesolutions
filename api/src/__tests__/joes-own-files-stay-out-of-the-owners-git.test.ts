/**
 *  JOE'S OWN FILES STAY OUT OF THE OWNER'S GIT.
 *
 *  Round 33 lets Joe change the owner's repository in place; every run writes
 *  `.joe/` (logs, result, the conversation's transcript) and `.joe-versions/`
 *  (undo snapshots) into it. In a git checkout they stood in `git status`,
 *  one `git add -A` from a commit — the transcript pushed with the code.
 *  Real git, real repositories: after keepJoeFilesOutOfGit, `git status`
 *  shows the project's change and nothing of Joe's, `.gitignore` is never
 *  written, a linked worktree is covered through its common repository, and
 *  a folder that is no repository is left alone.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { JOE_OWN_PATHS, keepJoeFilesOutOfGit } from '../core/project/git-exclude';

jest.setTimeout(60_000);

function git(cwd: string, ...args: string[]): string {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout;
}

function joeWorks(dir: string): void {
    fs.mkdirSync(path.join(dir, '.joe', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.joe', 'transcript.jsonl'), '{"said":"the owner\'s words"}\n');
    fs.mkdirSync(path.join(dir, '.joe-versions', 'v1'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.joe-versions', 'v1', 'server.js'), 'old');
    fs.writeFileSync(path.join(dir, 'server.js'), 'fixed');
}

let base = '';
beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-git-exclude-')); });
afterEach(() => { fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

function repo(name: string): string {
    const dir = path.join(base, name);
    fs.mkdirSync(dir);
    git(dir, 'init', '-q');
    fs.writeFileSync(path.join(dir, 'server.js'), 'broken');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'start');
    return dir;
}

test('without it, Joe\'s transcript is one `git add -A` from a commit (the fault)', () => {
    const dir = repo('before');
    joeWorks(dir);
    expect(git(dir, 'status', '--porcelain')).toMatch(/\.joe\//u);
});

test('with it, git status shows the change and nothing of Joe\'s; .gitignore is untouched', async () => {
    const dir = repo('after');
    expect(await keepJoeFilesOutOfGit(dir)).toBe('added');
    joeWorks(dir);
    expect(git(dir, 'status', '--porcelain').trim()).toBe('M server.js');
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe('node_modules/\n');
    git(dir, 'add', '-A');
    expect(git(dir, 'diff', '--cached', '--name-only').trim()).toBe('server.js');
    const exclude = fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8');
    for (const p of JOE_OWN_PATHS) expect(exclude).toContain(p);
});

test('twice is once', async () => {
    const dir = repo('twice');
    await keepJoeFilesOutOfGit(dir);
    expect(await keepJoeFilesOutOfGit(dir)).toBe('present');
    const exclude = fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude.split('/.joe/').length - 1).toBe(1);
});

test('a linked worktree is covered through its common repository', async () => {
    const main = repo('main');
    const wt = path.join(base, 'wt');
    git(main, 'worktree', 'add', '-q', wt);
    expect(fs.statSync(path.join(wt, '.git')).isFile()).toBe(true);
    expect(await keepJoeFilesOutOfGit(wt)).toBe('added');
    joeWorks(wt);
    expect(git(wt, 'status', '--porcelain').trim()).toBe('M server.js');
    git(main, 'worktree', 'remove', '--force', wt);
});

test('a folder that is no repository is left alone', async () => {
    const dir = path.join(base, 'plain');
    fs.mkdirSync(dir);
    expect(await keepJoeFilesOutOfGit(dir)).toBe('no-git');
    expect(fs.readdirSync(dir)).toEqual([]);
});

/* ───────────────────────── through the engine's own run ───────────────────────── */

import { runEngine, type EngineDeps } from '../core/engine/loop';
import { planUpdateTool } from '../core/engine/plan';
import { finishTool } from '../core/engine/finish';
import type { EngineModel, EngineTool, ModelStep, ProcessRegistry } from '../core/engine/types';

test('a run in his repository leaves git status with his change only', async () => {
    const dir = repo('engine');
    const turns = [
        { name: 'file_write', args: { path: 'server.js', content: 'fixed' } },
        { name: 'task_finish', args: { summary: 'fixed server.js' } },
    ];
    let i = 0;
    const model: EngineModel = {
        label: 'scripted:test', vision: false, contextTokens: () => 64_000,
        async step(): Promise<ModelStep> {
            const t = turns[Math.min(i, turns.length - 1)];
            i++;
            return { text: '', toolCalls: [{ id: `c${i}`, name: t.name, arguments: JSON.stringify(t.args) }], durationMs: 1 };
        },
    };
    const writeTool: EngineTool<{ path: string; content: string }> = {
        name: 'file_write', description: 'write a file',
        parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
        parse: (a: any) => ({ ok: true, value: { path: a.path, content: a.content } }),
        async run(a, ctx) {
            fs.writeFileSync(path.join(ctx.projectDir, a.path), a.content);
            return { ok: true, output: `wrote ${a.path}`, facts: { filesChanged: [{ path: a.path, change: 'modified', bytes: a.content.length }] } };
        },
    };
    const processes: ProcessRegistry = {
        async start(spec) { return { name: spec.name, command: spec.command, cwd: spec.cwd, running: false, startedAt: 0, output: '' }; },
        logs: () => undefined, stop: async () => true, list: () => [], stopAll: async () => { /* none */ },
    };
    const deps: EngineDeps = {
        model, tools: [planUpdateTool, writeTool, finishTool(async () => ({ passed: true, checks: [], unproven: [], at: 0 }))],
        processes, browser: () => { throw new Error('not used'); },
        machine: { platform: 'linux', shell: 'bash' },
    };
    const result = await runEngine({
        runId: 'run-git', request: 'Fix the server', language: 'en', projectDir: dir,
        deadlineAt: Date.now() + 60_000, signal: new AbortController().signal, emit: () => { /* none */ }, joe: {},
    }, deps);
    expect(fs.existsSync(path.join(dir, '.joe'))).toBe(true);
    expect(result.status).toBe('delivered');
    expect(git(dir, 'status', '--porcelain').trim()).toBe('M server.js');
});
