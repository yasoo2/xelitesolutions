/**
 * THE ENGINE'S shell_run SAYS HOW A COMMAND ENDED, AND ONLY WHAT IT SAW.
 *
 * Real processes in a real project folder, through the same gateway the
 * engine uses (ExecutionGateway.startManaged inside the orchestration
 * firewall). Every claim below is measured from what a child process did:
 * the exit code it chose, the lines it printed, the variables it could read,
 * the folder it ran in, whether it was still alive after a cancel.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    KERNEL_BACKSTOP_MS, childEnvironment, installFoldersOf, isInstallCommand, isJoeProcessEnv, isSecretEnv, runShellCommand, secretFileNamedIn,
} from '../modules/tools/definitions/EngineShellTools';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { NETWORK_INSTALL_TIMEOUTS } from '../shared/network-install-timeouts';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import * as ws from '../api/ws';

jest.setTimeout(120_000);

const WINDOWS = process.platform === 'win32';
const TMP = process.env.JOE_TEST_TMP_ROOT || os.tmpdir();
let base: string;
let root: string;

beforeAll(() => {
    base = fs.mkdtempSync(path.join(TMP, 'joe-eng-shell-run-'));
    root = path.join(base, 'shop');
    fs.mkdirSync(path.join(root, 'client'), { recursive: true });
    fs.mkdirSync(path.join(root, 'empty-suite'), { recursive: true });
    fs.mkdirSync(path.join(root, 'suite'), { recursive: true });
    fs.mkdirSync(path.join(root, 'skipped-suite'), { recursive: true });
    fs.writeFileSync(path.join(root, 'notes.txt'), 'not a folder');
    fs.writeFileSync(path.join(root, 'eng-shell-print500.js'), 'for (let i = 1; i <= 500; i++) console.log("line " + i);\n');
    fs.writeFileSync(path.join(root, 'eng-shell-longline.js'), 'console.log("x".repeat(5000)); console.log("end");\n');
    fs.writeFileSync(path.join(root, 'eng-shell-forever.js'),
        'require("fs").writeFileSync(process.argv[2], String(process.pid));\nsetInterval(() => {}, 1000);\n');
    fs.writeFileSync(path.join(root, 'eng-shell-envdump.js'), [
        'const e = process.env;',
        'console.log(JSON.stringify({',
        '  key: e.ENG_SHELL_PLANTED_API_KEY ?? null,',
        '  db: e.ENG_SHELL_PLANTED_DB ?? null,',
        '  dsn: e.ENG_SHELL_PLANTED_ADDRESS ?? null,',
        '  token: e.ENG_SHELL_PLANTED_UPSTREAM ?? null,',
        '  jwt: e.JWT_SECRET ?? null,',
        '  plain: e.ENG_SHELL_PLAIN ?? null,',
        '  port: e.PORT ?? null, mode: e.NODE_ENV ?? null, host: e.HOST ?? null,',
        '  ci: e.CI ?? null, browser: e.BROWSER ?? null, color: e.FORCE_COLOR ?? null, yes: e.npm_config_yes ?? null,',
        '  names: Object.keys(e).filter(n => /PLANTED|JWT/i.test(n)),',
        '  joe: Object.keys(e).filter(n => /^JOE_/i.test(n)),',
        '  omit: e.npm_config_omit ?? null, script: e.npm_lifecycle_event ?? null, pkg: e.npm_package_name ?? null,',
        '  registry: e.npm_config_registry ?? null,',
        '}));',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'suite', 'eng-shell-real.test.js'),
        'const test = require("node:test");\ntest("adds", () => { if (1 + 1 !== 2) throw new Error("math"); });\n');
    fs.writeFileSync(path.join(root, 'skipped-suite', 'eng-shell-skipped.test.js'),
        'const test = require("node:test");\ntest.skip("later", () => {});\n');
});
beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(base); });
afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => { fs.rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

const context = (extra: Record<string, unknown> = {}) => ({ projectRoot: root, workspaceId: 'ws-engine-shell', runId: 'run-engine-shell', ...extra });
const run = (input: any, extra: Record<string, unknown> = {}): Promise<any> =>
    executionFirewall.runInContext('engine-shell-run-test', () => runShellCommand(input, context(extra)));
const shownLines = (text: string) => text.split('\n');

/** True once no process has this pid (waits up to five seconds). */
async function gone(pid: number): Promise<boolean> {
    for (let i = 0; i < 50; i++) {
        try { process.kill(pid, 0); } catch { return true; }
        await new Promise(res => setTimeout(res, 100));
    }
    return false;
}

describe('shell_run reports the exit code the command itself chose', () => {
    it('a failing command keeps its own code and its output', async () => {
        const r = await run({ command: 'node -e "console.log(\'hello from the child\'); process.exit(3)"' });
        expect(r.ok).toBe(false);
        expect(r.output.command).toMatchObject({ exitCode: 3, cwd: '.' });
        expect(r.output.text).toMatch(/Exit code 3 after \d+\.\d s\./);
        expect(r.output.text).toContain('hello from the child');
        expect(r.error).toMatch(/exited with code 3/);
    });

    it('a passing command is ok with code 0; the last command decides, as in a POSIX shell', async () => {
        const ok = await run({ command: 'node -e "process.exit(2)"; node -e "console.log(\'second ran\')"' });
        expect(ok.ok).toBe(true);
        expect(ok.output.command.exitCode).toBe(0);
        expect(ok.output.text).toContain('second ran');
        const failLast = await run({ command: 'node -e "console.log(\'first ran\')"; node -e "process.exit(4)"' });
        expect(failLast.output.command.exitCode).toBe(4);
    });

    it('an explicit exit keeps its code, and stderr is part of what it said', async () => {
        expect((await run({ command: 'exit 7' })).output.command.exitCode).toBe(7);
        const err = await run({ command: 'node -e "console.error(\'written to stderr\')"' });
        expect(err.ok).toBe(true);
        expect(err.output.text).toContain('written to stderr');
    });

    (WINDOWS ? it : it.skip)('Windows PowerShell: a failed cmdlet is 1, and `&&` earns a hint because nothing ran', async () => {
        const cmdlet = await run({ command: 'Get-Item ./definitely-missing-file' });
        expect(cmdlet.output.command.exitCode).toBe(1);
        const andAnd = await run({ command: 'node -v && node -v' });
        expect(andAnd.ok).toBe(false);
        expect(andAnd.output.text).toMatch(/Hint: Windows PowerShell 5\.1 has no `&&`/);
    });

    it('Arabic output arrives intact', async () => {
        const r = await run({ command: 'node -e "console.log(\'مرحبا بالعالم\')"' });
        expect(r.output.text).toContain('مرحبا بالعالم');
        if (WINDOWS) {
            const own = await run({ command: "Write-Output 'تم الحفظ'" });
            expect(own.output.text).toContain('تم الحفظ');
        }
    });
});

describe('a long output is cut to its head and tail, and the full log keeps every line', () => {
    it('500 lines: the first 20 and the last 60 are shown, the 420 between are counted, the log has all', async () => {
        const r = await run({ command: 'node eng-shell-print500.js' });
        expect(r.ok).toBe(true);
        const lines = shownLines(r.output.text);
        expect(lines).toContain('line 1');
        expect(lines).toContain('line 20');
        expect(lines).not.toContain('line 21');
        expect(lines).not.toContain('line 440');
        expect(lines).toContain('line 441');
        expect(lines).toContain('line 500');
        expect(r.output.text).toContain('[… 420 lines left out …]');
        expect(r.output.text).toMatch(/Output: 500 lines; the first 20 and the last 60 are shown, 420 in between are left out\./);
        expect(r.output.log).toMatch(/^\.joe\/logs\/\d{4}-node-eng-shell-print500-js\.log$/);
        expect(r.output.text).toContain(`Full log: ${r.output.log}`);
        const saved = fs.readFileSync(path.join(root, r.output.log), 'utf8').split(/\r?\n/);
        const numbered = saved.filter(l => /^line \d+$/.test(l));
        expect(numbered.length).toBe(500);
        expect(numbered[0]).toBe('line 1');
        expect(numbered[499]).toBe('line 500');
    });

    it('a very long line is clipped for the model and kept whole in the log', async () => {
        const r = await run({ command: 'node eng-shell-longline.js' });
        expect(r.output.text).toMatch(/x{300} … \[4700 more characters\]/);
        const saved = fs.readFileSync(path.join(root, r.output.log), 'utf8');
        expect(saved).toContain('x'.repeat(5000));
    });

    it('each command gets its own log; numbering continues what the folder holds', async () => {
        const a = await run({ command: 'node -e "console.log(1)"' });
        const b = await run({ command: 'node -e "console.log(2)"' });
        const n = (rel: string) => Number(path.basename(rel).split('-')[0]);
        expect(n(b.output.log)).toBe(n(a.output.log) + 1);
    });
});

describe('a command that outlives its limit is stopped, and the output says after how long', () => {
    it('timeout_seconds ends it with 124, and nothing it started is left running', async () => {
        const started = Date.now();
        const r = await run({ command: 'node eng-shell-forever.js eng-shell-timeout.pid', timeout_seconds: 4 });
        expect(r.ok).toBe(false);
        expect(r.output.command).toMatchObject({ exitCode: 124, timedOut: true });
        expect(r.output.text).toMatch(/Timed out after \d+\.\d s and was stopped \(the limit was 4 s\)\. Exit code 124\./);
        expect(Date.now() - started).toBeLessThan(30_000);
        const pidFile = path.join(root, 'eng-shell-timeout.pid');
        if (fs.existsSync(pidFile)) expect(await gone(Number(fs.readFileSync(pidFile, 'utf8')))).toBe(true);
    }, 45_000);

    it('the run\'s deadline is a ceiling too, and a passed deadline starts nothing', async () => {
        const r = await run({ command: 'node eng-shell-forever.js eng-shell-deadline.pid', deadline_at: Date.now() + 4_000 });
        expect(r.output.command.exitCode).toBe(124);
        expect(r.output.text).toMatch(/the time left before the run's deadline/);
        const pidFile = path.join(root, 'eng-shell-deadline.pid');
        if (fs.existsSync(pidFile)) expect(await gone(Number(fs.readFileSync(pidFile, 'utf8')))).toBe(true);
        const start = jest.spyOn(ExecutionGateway, 'startManaged');
        const late = await run({ command: 'node -e "console.log(1)"', deadline_at: Date.now() - 1 });
        expect(late.ok).toBe(false);
        expect(late.output.text).toMatch(/deadline has passed; the command was not started/);
        expect(start).not.toHaveBeenCalled();
    }, 45_000);
});

describe('a stopped run stops its command', () => {
    it('the cancel promise ends it with 130, and the child process is gone afterwards', async () => {
        const pidFile = path.join(root, 'eng-shell-cancel.pid');
        let cancel: () => void = () => {};
        const cancellation = new Promise<void>(resolve => { cancel = resolve; });
        const poll = setInterval(() => { if (fs.existsSync(pidFile)) { clearInterval(poll); cancel(); } }, 100);
        const r = await run({ command: 'node eng-shell-forever.js eng-shell-cancel.pid' }, { cancellation });
        clearInterval(poll);
        expect(r.ok).toBe(false);
        expect(r.output.command.exitCode).toBe(130);
        expect(r.output.text).toMatch(/Cancelled after \d+\.\d s: the run was stopped, and so was the command\. Exit code 130\./);
        const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
        expect(childPid).toBeGreaterThan(0);
        expect(await gone(childPid)).toBe(true);
    }, 45_000);

    it('a run that is already stopped starts nothing', async () => {
        const start = jest.spyOn(ExecutionGateway, 'startManaged');
        const r = await run({ command: 'node -e "console.log(1)"' }, { isCancelled: () => true });
        expect(r.ok).toBe(false);
        expect(start).not.toHaveBeenCalled();
    });

    it('a run stopped while the command was getting ready starts nothing', async () => {
        const start = jest.spyOn(ExecutionGateway, 'startManaged');
        //  Not stopped when the call begins; stopped by the time the log is open.
        let asked = 0;
        const r = await run({ command: 'node -e "console.log(1)"' }, { isCancelled: () => ++asked > 1 });
        expect(asked).toBeGreaterThanOrEqual(2);
        expect(r.ok).toBe(false);
        expect(r.output.text).toBe('The run was stopped; the command was not started.');
        expect(start).not.toHaveBeenCalled();
    });
});

describe('the child sees none of Joe\'s secrets, and none of Joe\'s own process settings', () => {
    const planted: Record<string, string> = {
        ENG_SHELL_PLANTED_API_KEY: 'planted-key-1234567',
        ENG_SHELL_PLANTED_DB: 'mongodb://joe:hunter2@db.example/app',
        ENG_SHELL_PLANTED_ADDRESS: 'postgres://owner:pw-4567@db.example/app',
        ENG_SHELL_PLANTED_UPSTREAM: `ghp_${'a1B2'.repeat(9)}`,
        ENG_SHELL_PLAIN: 'visible-789',
        //  What start-joe.ps1 and `npm start` give Joe's own process.
        PORT: '5002',
        HOST: '0.0.0.0',
        npm_lifecycle_event: 'start',
        npm_package_name: 'joe-api',
        npm_config_omit: 'dev',
        JOE_ENG_PLANTED_DIR: 'C:\\joe\\data',
        //  The machine's own npm configuration, which an install needs.
        npm_config_registry: 'https://registry.example.test/',
    };
    let saved: Record<string, string | undefined> = {};
    beforeEach(() => { saved = Object.fromEntries(Object.keys(planted).map(k => [k, process.env[k]])); });
    afterEach(() => {
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    });

    it('planted keys, credential addresses, a token-shaped value, JWT_SECRET, Joe\'s port, mode, npm invocation and JOE_* settings are absent; ordinary variables, the machine\'s npm registry, HOST=127.0.0.1 and the CI settings are there', async () => {
        Object.assign(process.env, planted);
        expect(process.env.JWT_SECRET).toBeTruthy();
        expect(process.env.NODE_ENV).toBe('test');
        expect(Object.keys(process.env).filter(n => /^JOE_/i.test(n)).length).toBeGreaterThan(1);
        const r = await run({ command: 'node eng-shell-envdump.js' });
        expect(r.ok).toBe(true);
        const line = shownLines(r.output.text).find(l => l.startsWith('{"key"'));
        expect(line).toBeDefined();
        const seen = JSON.parse(line!);
        expect(seen).toEqual({
            key: null, db: null, dsn: null, token: null, jwt: null, plain: 'visible-789',
            port: null, mode: null, host: '127.0.0.1',
            ci: '1', browser: 'none', color: '0', yes: 'true', names: [], joe: [],
            omit: null, script: null, pkg: null, registry: 'https://registry.example.test/',
        });
        expect(r.output.text).not.toContain('planted-key-1234567');
    });

    it('the rules: names that say secret, values that are credentials, and Joe\'s own settings', () => {
        for (const name of ['GROQ_API_KEY', 'GITHUB_TOKEN', 'JWT_SECRET', 'DB_PASSWORD', 'PGPASS', 'SSH_PRIVATE_KEY', 'AWS_CREDENTIALS',
            'SESSION_COOKIE', 'EXPRESS_SESSION', 'OAUTH_CLIENT', 'MONGO_URI', 'DATABASE_URL']) {
            expect(`${name}:${isSecretEnv(name, 'x')}`).toBe(`${name}:true`);
        }
        expect(isSecretEnv('REDIS_URL', 'redis://:p4ss@cache:6379')).toBe(true);
        expect(isSecretEnv('UPSTREAM', 'https://user:pw@example.com/x')).toBe(true);
        for (const value of [`sk-${'x'.repeat(40)}`, `sk-ant-api03-${'y'.repeat(40)}`, `gsk_${'z'.repeat(52)}`, `github_pat_${'q'.repeat(40)}`,
            'AKIAIOSFODNN7EXAMPLE', `AIza${'k'.repeat(35)}`, `xoxb-${'1'.repeat(24)}`, `hf_${'h'.repeat(34)}`,
            'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl', '-----BEGIN RSA PRIVATE KEY-----\nMIIE']) {
            expect(`${value.slice(0, 12)}:${isSecretEnv('SOME_SETTING', value)}`).toBe(`${value.slice(0, 12)}:true`);
        }
        for (const name of ['PATH', 'HOME', 'USERPROFILE', 'TEMP', 'SystemRoot', 'NODE_ENV', 'LANG']) {
            expect(`${name}:${isSecretEnv(name, 'C:\\Windows')}`).toBe(`${name}:false`);
        }
        expect(isSecretEnv('API_BASE', 'https://example.com/v1')).toBe(false);
        expect(isSecretEnv('GREETING', 'sk-is-not-a-key')).toBe(false);
        for (const name of ['PORT', 'NODE_ENV', 'INIT_CWD', 'npm_lifecycle_event', 'npm_lifecycle_script', 'npm_package_name', 'npm_execpath',
            'npm_config_omit', 'npm_config_production', 'npm_config_local_prefix', 'npm_config_global', 'NPM_CONFIG_PREFIX', 'JOE_DATA_DIR', 'JOE_CHAT_STORE_DIR']) {
            expect(`${name}:${isJoeProcessEnv(name)}`).toBe(`${name}:true`);
        }
        for (const name of ['PATH', 'HOME', 'HOSTNAME', 'NODE_PATH', 'NVM_DIR', 'JAVA_HOME', 'HTTPS_PROXY', 'REPORT',
            'npm_config_registry', 'NPM_CONFIG_REGISTRY', 'npm_config_https_proxy', 'npm_config_cafile', 'npm_config_strict_ssl']) {
            expect(`${name}:${isJoeProcessEnv(name)}`).toBe(`${name}:false`);
        }
        const env = childEnvironment({ PORT: '4321' });
        expect(env.PORT).toBe('4321');
        expect(env.HOST).toBe('127.0.0.1');
        expect(env.CI).toBe('1');
    });
});

describe('a command runs only in a folder inside the project', () => {
    it('cwd is a folder relative to the project folder', async () => {
        const r = await run({ command: 'node -e "console.log(process.cwd())"', cwd: 'client' });
        expect(r.ok).toBe(true);
        expect(r.output.command.cwd).toBe('client');
        expect(r.output.text.toLowerCase()).toContain(fs.realpathSync(path.join(root, 'client')).toLowerCase());
    });

    it('a folder outside, a file, a missing folder, and a project outside the workspace are refused, and nothing starts', async () => {
        const start = jest.spyOn(ExecutionGateway, 'startManaged');
        const cases: Array<[any, Record<string, unknown>, RegExp]> = [
            [{ command: 'node -v', cwd: '..' }, {}, /outside the project folder/],
            [{ command: 'node -v', cwd: base }, {}, /outside the project folder/],
            [{ command: 'node -v', cwd: 'notes.txt' }, {}, /is a file, not a folder/],
            [{ command: 'node -v', cwd: 'missing' }, {}, /does not exist/],
            [{ command: 'node -v' }, { projectRoot: os.tmpdir() }, /not inside this workspace/],
            [{ command: 'node -v' }, { projectRoot: undefined }, /No project folder/],
            [{ command: 'node -v' }, { projectRoot: base }, /not inside this workspace/],
            [{ command: '   ' }, {}, /needs a "command"/],
        ];
        for (const [input, extra, why] of cases) {
            const r = await run(input, extra);
            expect(`${JSON.stringify(input)} ${r.ok}`).toBe(`${JSON.stringify(input)} false`);
            expect(r.output.text).toMatch(why);
        }
        expect(start).not.toHaveBeenCalled();
    });

    it('a command that names a secret file is refused like the file tools refuse it', async () => {
        const start = jest.spyOn(ExecutionGateway, 'startManaged');
        for (const command of ['type .env', 'cat ./config/.env.production', 'Get-Content -Path .\\.env.local', 'cp key.pem backup']) {
            const r = await run({ command });
            expect(`${command}:${r.ok}`).toBe(`${command}:false`);
            expect(r.output.text).toMatch(/holds secrets/);
        }
        expect(start).not.toHaveBeenCalled();
        expect(secretFileNamedIn('cat .env.example')).toBeNull();
        expect(secretFileNamedIn('node server.js --env production')).toBeNull();
    });
});

describe('a test command that ran no test is not a pass', () => {
    it('node --test in a folder with no tests exits 0 and is reported as running nothing', async () => {
        const r = await run({ command: 'node --test', cwd: 'empty-suite' });
        expect(r.output.command.exitCode).toBe(0);
        expect(r.ok).toBe(false);
        expect(r.output.text).toMatch(/Test run: NOT a pass\. It exited 0, but the test command ran no tests \(node --test: /);
        expect(r.error).toMatch(/ran no tests/);
    });

    it('a suite whose only test is skipped ran nothing either', async () => {
        const r = await run({ command: 'node --test eng-shell-skipped.test.js', cwd: 'skipped-suite' });
        expect(r.output.command.exitCode).toBe(0);
        expect(r.ok).toBe(false);
        expect(r.output.text).toContain('Test run: NOT a pass.');
    });

    it('a suite that ran a test passes', async () => {
        const r = await run({ command: 'node --test eng-shell-real.test.js', cwd: 'suite' });
        expect(r.ok).toBe(true);
        expect(r.output.text).toContain('Test run: passed.');
    });
});

describe('the owner sees the command in the terminal panel', () => {
    it('a prompt line, the live lines, then the exit line, all addressed to the run\'s session', async () => {
        const sent: Array<[string | undefined, string]> = [];
        jest.spyOn(ws, 'broadcastTerminalLine').mockImplementation((sid, line) => { sent.push([sid, line]); });
        const r = await run({ command: 'node -e "console.log(\'panel line\')"' }, { sessionId: 'session-engine-shell' });
        expect(r.ok).toBe(true);
        expect(sent.length).toBeGreaterThan(0);
        expect(sent.every(([sid]) => sid === 'session-engine-shell')).toBe(true);
        const all = sent.map(([, line]) => line).join('');
        const prompt = all.indexOf('shop $ node -e');
        const line = all.indexOf('panel line');
        const exit = all.search(/→ exit 0 · \d+\.\ds/);
        expect(prompt).toBeGreaterThanOrEqual(0);
        expect(line).toBeGreaterThan(prompt);
        expect(exit).toBeGreaterThan(line);
        expect(r.logsStreamedLive).toBe(true);
    });
});

describe('an install is bounded by its progress, not only by its silence', () => {
    it('npm/pnpm/yarn install|ci|add and pip install are installs; a build is not', () => {
        for (const c of ['npm install', 'npm i -D vite', 'npm ci', 'pnpm add react', 'yarn', 'yarn add zod', 'cd client; npm install --no-audit',
            'pip install flask', 'python -m pip install -r requirements.txt', 'py -3 -m pip install requests']) {
            expect(`${c}:${isInstallCommand(c)}`).toBe(`${c}:true`);
        }
        for (const c of ['npm run build', 'npm init -y', 'npm test', 'node install.js', 'pip list', 'yarn build']) {
            expect(`${c}:${isInstallCommand(c)}`).toBe(`${c}:false`);
        }
    });

    /** The kernel options of each command, with nothing actually run. */
    function recordLaunches(): any[] {
        const seen: any[] = [];
        jest.spyOn(ExecutionGateway, 'startManaged').mockImplementation((_file: string, _args?: string[], options?: any) => {
            seen.push(options);
            return { done: Promise.resolve({ ok: true, exitCode: 0 }), kill: () => {}, pid: undefined } as any;
        });
        return seen;
    }

    it('an install gets the network budget and the idle bound with the progress probe; other commands get 300 s', async () => {
        const seen = recordLaunches();
        await run({ command: 'npm install --no-audit --no-fund' });
        await run({ command: 'npm run build' });
        //  The limit is kept by the tool; the kernel's own ceiling stands a fixed backstop behind it.
        expect(seen[0].timeout).toBe(NETWORK_INSTALL_TIMEOUTS.absoluteMs + KERNEL_BACKSTOP_MS);
        expect(seen[0].idleTimeout).toBe(NETWORK_INSTALL_TIMEOUTS.idleMs);
        expect(typeof seen[0].idleProgress).toBe('function');
        expect(typeof await seen[0].idleProgress()).toBe('string');
        expect(seen[1].timeout).toBe(300_000 + KERNEL_BACKSTOP_MS);
        expect(seen[1].idleTimeout).toBeUndefined();
        expect(seen[1].idleProgress).toBeUndefined();
        for (const o of seen) expect(o.windowsHide).toBe(true);
    });

    it('the folder an install writes into is found in the command: cd, Set-Location, --prefix, -C; never outside the project', () => {
        const r = fs.realpathSync(root);
        const client = path.join(r, 'client');
        expect(installFoldersOf(r, r, 'npm install')).toEqual([r]);
        expect(installFoldersOf(r, r, 'cd client; npm install')).toEqual([r, client]);
        expect(installFoldersOf(r, r, 'npm install --prefix client')).toEqual([r, client]);
        expect(installFoldersOf(r, r, 'npm install --prefix=client')).toEqual([r, client]);
        expect(installFoldersOf(r, r, 'pnpm -C client add react')).toEqual([r, client]);
        expect(installFoldersOf(r, r, 'yarn --cwd client add zod')).toEqual([r, client]);
        expect(installFoldersOf(r, r, 'Set-Location -Path "client"; npm ci')).toEqual([r, client]);
        expect(installFoldersOf(r, r, 'cd client; cd ui; npm install')).toEqual([r, client, path.join(client, 'ui')]);
        expect(installFoldersOf(r, client, 'cd ..; npm install')).toEqual([client, r]);
        expect(installFoldersOf(r, r, 'cd ..; npm install')).toEqual([r]);
        expect(installFoldersOf(r, r, `cd ${path.dirname(r)}; npm install`)).toEqual([r]);
        expect(installFoldersOf(r, r, 'cd $env:TEMP; npm install')).toEqual([r]);
        expect(installFoldersOf(r, r, 'pip install -c constraints.txt flask')).toEqual([r]);
    });

    it('files that `cd client; npm install` writes into client/node_modules are progress, so its silence is not idleness', async () => {
        const seen = recordLaunches();
        await run({ command: 'cd client; npm install --no-audit --no-fund' });
        const probe = seen[0].idleProgress as () => Promise<string>;
        const before = await probe();
        expect(await probe()).toBe(before);
        const pkg = path.join(root, 'client', 'node_modules', 'left-pad');
        fs.mkdirSync(pkg, { recursive: true });
        fs.writeFileSync(path.join(pkg, 'index.js'), 'module.exports = 1;\n');
        expect(await probe()).not.toBe(before);
        fs.rmSync(path.join(root, 'client', 'node_modules'), { recursive: true, force: true });
    });
});
