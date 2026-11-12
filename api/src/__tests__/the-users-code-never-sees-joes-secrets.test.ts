/**
 * THE USER'S CODE NEVER SEES JOE'S SECRETS.
 *
 * Real child processes through the kernel's own routes, with Joe's secrets
 * planted in Joe's environment: each child writes down every variable it can
 * read, and the claims below are about what it wrote. Then the same routes
 * with `joeInfrastructure: true`, the same routes handed a copy of Joe's whole
 * environment as "overrides", and the source itself: who may ask for Joe's
 * environment, and where a dev server listens.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { executionEngine } from '../kernel/ExecutionEngine';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import {
    JOE_INFRASTRUCTURE_SITES, MACHINE_ENV, childEnvironment, isHiddenFromProject, isJoeProcessEnv, isMachineEnv, isSecretEnv, projectEnvironment,
} from '../shared/child-environment';
import * as shell from '../modules/tools/definitions/EngineShellTools';
import { PREVIEW_PROXY_DIALS, previewBindHost } from '../shared/utils/network';

jest.setTimeout(180_000);

const TMP = process.env.JOE_TEST_TMP_ROOT || os.tmpdir();
const SRC = path.join(__dirname, '..');
const inFirewall = <T>(fn: () => Promise<T>) => executionFirewall.runInContext('users-code-never-sees-joes-secrets', fn);

/** Long values no machine has by chance; the claims are about these values. */
const SECRETS: Record<string, string> = {
    JWT_SECRET: 'r39-jwt-7f3c9a1e5b2d4f6a8c0e-sentinel-value',
    SECRETS_MASTER_KEY: 'r39-master-1a2b3c4d5e6f7a8b9c0d-sentinel-value',
    MONGO_URI: 'mongodb://r39user:r39-mongo-pw-5d6e7f8a@r39-db.example/joe',
    ADMIN_EMAIL: 'r39-owner-4b5c6d7e@joe-sentinel.example',
    ADMIN_PASSWORD: 'r39-admin-pw-9e8d7c6b5a4f-sentinel',
    ANTHROPIC_API_KEY: 'sk-ant-r39-0a1b2c3d4e5f6a7b8c9d0e1f2a3b',
    R39_INNOCENT_NAME: `ghp_${'r3K9'.repeat(9)}`,
    JOE_DATA_DIR: path.join(TMP, 'r39-joe-data-dir-sentinel-3c4d5e'),
    PORT: '59391',
    SMTP_HOST: 'r39-smtp-sentinel-6f7a8b.example',
    STRIPE_WEBHOOK_ID: 'r39-stripe-sentinel-2d3e4f5a',
    SENTRY_DSN: 'https://r39-sentry-sentinel-8b9c0d.example/7',
    REDIS_URL: 'redis://r39-redis-sentinel-1e2f3a.example:6379',
};
const MACHINE: Record<string, string> = {
    HTTPS_PROXY: 'http://r39proxyuser:r39-proxy-pw-4a5b6c@r39-proxy.example:8080',
    NPM_CONFIG_REGISTRY: 'https://r39-registry-sentinel-7d8e9f.example/',
    NODE_AUTH_TOKEN: 'r39-registry-token-0f1e2d3c4b5a-sentinel',
    R39_PLAIN_SETTING: 'r39-plain-visible-6a7b8c',
};

let dir: string;
let savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(TMP, 'joe-r39-env-'));
    //  Writes every variable it can read to the file it is given.
    fs.writeFileSync(path.join(dir, 'dump.js'), 'require("fs").writeFileSync(process.argv[2], JSON.stringify(process.env));\n');
});
afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

beforeEach(() => {
    savedEnv = Object.fromEntries([...Object.keys(SECRETS), ...Object.keys(MACHINE)].map(name => [name, process.env[name]]));
    Object.assign(process.env, SECRETS, MACHINE);
});
afterEach(() => {
    for (const [name, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
});

type Seen = Record<string, string>;
const get = (seen: Seen, wanted: string): string | undefined => {
    const name = Object.keys(seen).find(n => n.toLowerCase() === wanted.toLowerCase());
    return name === undefined ? undefined : seen[name];
};

async function readDump(file: string): Promise<{ seen: Seen; text: string }> {
    const full = path.join(dir, file);
    for (let i = 0; i < 300; i++) {
        try {
            const text = fs.readFileSync(full, 'utf8');
            return { seen: JSON.parse(text), text };
        } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    throw new Error(`the child never wrote ${file}`);
}

/** The kernel's routes, each starting the same dump program. */
const ROUTES: Record<string, (out: string, options: Record<string, unknown>) => Promise<void>> = {
    'execute with argv (runArgv)': async (out, options) => {
        const r = await executionEngine.runArgv(process.execPath, ['dump.js', out], { cwd: dir, timeout: 60_000, ...options });
        expect(r.ok).toBe(true);
    },
    'execute with a command line, through the gateway': async (out, options) => {
        const r = await inFirewall(() => ExecutionGateway.execute(`node dump.js ${out}`, [], { cwd: dir, timeout: 60_000, ...options }));
        expect(r.success).toBe(true);
    },
    'execute in the background': async (out, options) => {
        const r = await executionEngine.runArgv(process.execPath, ['dump.js', out], { cwd: dir, background: true, stdio: 'ignore', ...options });
        expect(r.pid).toBeGreaterThan(0);
    },
    'runArgvStreaming': async (out, options) => {
        const r = await executionEngine.runArgvStreaming(process.execPath, ['dump.js', out], { cwd: dir, timeout: 60_000, ...options }).done;
        expect(r.ok).toBe(true);
    },
    'startManaged, as a preview is started': async (out, options) => {
        const handle = await inFirewall(async () => ExecutionGateway.startManaged(process.execPath, ['dump.js', out], { cwd: dir, timeout: 60_000, windowsHide: true, ...options }));
        expect((await handle.done).ok).toBe(true);
    },
    'runDetached': async (out, options) => {
        const r = executionEngine.runDetached(process.execPath, ['dump.js', out], { cwd: dir, ...options });
        expect(r.ok).toBe(true);
    },
};

function expectNoSecret(seen: Seen, text: string): void {
    for (const [name, value] of Object.entries(SECRETS)) {
        expect(`${name} is in the child: ${get(seen, name) !== undefined}`).toBe(`${name} is in the child: false`);
        //  JSON doubles a backslash, so the value is looked for as JSON spells it.
        expect(`${name}'s value is in the child: ${text.includes(JSON.stringify(value).slice(1, -1))}`).toBe(`${name}'s value is in the child: false`);
    }
    expect(Object.keys(seen).filter(name => /^JOE_/iu.test(name))).toEqual([]);
    expect(get(seen, 'NODE_ENV')).toBeUndefined();
}

function expectTheMachine(seen: Seen): void {
    expect(get(seen, 'PATH')).toBe(process.env.PATH ?? process.env.Path);
    for (const [name, value] of Object.entries(MACHINE)) expect(`${name}=${get(seen, name)}`).toBe(`${name}=${value}`);
    for (const name of ['SystemRoot', 'TEMP', 'USERPROFILE', 'HOME']) {
        if (process.env[name] !== undefined) expect(`${name}=${get(seen, name)}`).toBe(`${name}=${process.env[name]}`);
    }
}

describe('a process the kernel starts does not get Joe\'s secrets or Joe\'s own settings', () => {
    let n = 0;
    for (const [route, start] of Object.entries(ROUTES)) {
        it(`${route}: no secret, no JOE_*, no PORT or NODE_ENV of Joe's; the machine's PATH, proxy, registry and registry token stay`, async () => {
            expect(process.env.JWT_SECRET).toBe(SECRETS.JWT_SECRET);
            expect(process.env.NODE_ENV).toBe('test');
            const out = `default-${++n}.json`;
            await start(out, {});
            const { seen, text } = await readDump(out);
            expectNoSecret(seen, text);
            expectTheMachine(seen);
        });

        it(`${route}: a caller that hands back Joe's whole environment still gives no secret, and its own PORT and API_JWT_SECRET arrive`, async () => {
            const out = `spread-${++n}.json`;
            await start(out, { env: { ...process.env, PORT: '4321', API_JWT_SECRET: 'r39-the-apps-own-jwt-secret-5c6d7e' } });
            const { seen, text } = await readDump(out);
            for (const [name, value] of Object.entries(SECRETS)) {
                if (name === 'PORT') continue;
                expect(`${name} is in the child: ${get(seen, name) !== undefined}`).toBe(`${name} is in the child: false`);
                expect(`${name}'s value is in the child: ${text.includes(JSON.stringify(value).slice(1, -1))}`).toBe(`${name}'s value is in the child: false`);
            }
            expect(get(seen, 'PORT')).toBe('4321');
            expect(get(seen, 'API_JWT_SECRET')).toBe('r39-the-apps-own-jwt-secret-5c6d7e');
            expect(get(seen, 'NODE_ENV')).toBeUndefined();
            expectTheMachine(seen);
        });

        it(`${route}: with joeInfrastructure they all arrive`, async () => {
            const out = `infrastructure-${++n}.json`;
            await start(out, { joeInfrastructure: true });
            const { seen } = await readDump(out);
            for (const [name, value] of Object.entries(SECRETS)) expect(`${name}=${get(seen, name)}`).toBe(`${name}=${value}`);
            expect(get(seen, 'NODE_ENV')).toBe('test');
            expectTheMachine(seen);
        });
    }

    it('only `true` opts out: a truthy word is not Joe\'s infrastructure', async () => {
        await ROUTES['execute with argv (runArgv)']('truthy.json', { joeInfrastructure: 'yes' });
        const { seen, text } = await readDump('truthy.json');
        expectNoSecret(seen, text);
    });

    it('what the engine\'s shell and a preview ask for arrives on top: CHILD_SETTINGS and the named port', async () => {
        await ROUTES['runArgvStreaming']('child-settings.json', { env: childEnvironment({ PORT: '4555' }) });
        const { seen, text } = await readDump('child-settings.json');
        for (const [name, value] of Object.entries(SECRETS)) {
            if (name !== 'PORT') expect(`${name}: ${text.includes(JSON.stringify(value).slice(1, -1))}`).toBe(`${name}: false`);
        }
        expect(get(seen, 'PORT')).toBe('4555');
        expect(get(seen, 'HOST')).toBe('127.0.0.1');
        expect(get(seen, 'CI')).toBe('1');
        expectTheMachine(seen);
    });
});

describe('the rule itself', () => {
    const base = (): NodeJS.ProcessEnv => ({
        PATH: '/usr/bin', HOME: '/home/joe', LANG: 'ar_SA.UTF-8', EDITOR: 'vi',
        JWT_SECRET: 'joes-own-jwt', MONGO_URI: 'mongodb://mongo:27017/joe', GROQ_API_KEY: 'joes-groq',
        ADMIN_EMAIL: 'owner@joe.example', SMTP_HOST: 'mail.joe.example', STRIPE_ACCOUNT: 'acct_1', SENTRY_DSN: 'https://sentry.example/1',
        REDIS_URL: 'redis://cache:6379', APP_DB_DSN: 'plain', QUEUE_URI: 'plain',
        PORT: '5002', NODE_ENV: 'production', JOE_DATA_DIR: '/var/joe', npm_package_name: 'joe-api',
        HTTPS_PROXY: 'http://u:p@proxy:8080', NODE_AUTH_TOKEN: 'registry-token', SSH_AUTH_SOCK: '/run/agent.sock', GIT_ASKPASS: '/usr/bin/askpass',
        DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/bus', npm_config_registry: 'https://registry.example/',
        'npm_config_//registry.example/:_authToken': 'registry-token-2',
    });

    it('with no overrides: the machine stays, Joe\'s secrets and settings go', () => {
        expect(projectEnvironment(base())).toEqual({
            PATH: '/usr/bin', HOME: '/home/joe', LANG: 'ar_SA.UTF-8', EDITOR: 'vi',
            HTTPS_PROXY: 'http://u:p@proxy:8080', NODE_AUTH_TOKEN: 'registry-token', SSH_AUTH_SOCK: '/run/agent.sock', GIT_ASKPASS: '/usr/bin/askpass',
            DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/bus', npm_config_registry: 'https://registry.example/',
            'npm_config_//registry.example/:_authToken': 'registry-token-2',
        });
    });

    it('an inherited copy is removed, a value the caller chose is kept, undefined removes', () => {
        const b = base();
        const env = projectEnvironment(b, { ...b, PORT: '4000', API_JWT_SECRET: 'the-apps-own', JWT_SECRET: 'the-apps-own-jwt', EDITOR: undefined });
        expect(env.JWT_SECRET).toBe('the-apps-own-jwt');
        expect(env.API_JWT_SECRET).toBe('the-apps-own');
        expect(env.PORT).toBe('4000');
        for (const name of ['MONGO_URI', 'GROQ_API_KEY', 'ADMIN_EMAIL', 'SMTP_HOST', 'STRIPE_ACCOUNT', 'SENTRY_DSN', 'REDIS_URL', 'APP_DB_DSN', 'QUEUE_URI',
            'NODE_ENV', 'JOE_DATA_DIR', 'npm_package_name', 'EDITOR']) {
            expect(`${name} in the child: ${name in env}`).toBe(`${name} in the child: false`);
        }
        expect(env.PATH).toBe('/usr/bin');
        expect(env.HTTPS_PROXY).toBe('http://u:p@proxy:8080');
    });

    it('a setting the caller names alone is the caller\'s, even when it equals Joe\'s: NODE_ENV=production for a build', () => {
        const env = projectEnvironment(base(), { NODE_ENV: 'production', JOE_STATIC_STRICT: '1', PORT: '5002' });
        expect(env.NODE_ENV).toBe('production');
        expect(env.JOE_STATIC_STRICT).toBe('1');
        expect(env.PORT).toBe('5002');
        //  A secret that equals Joe's is Joe's, however it was handed over.
        expect('JWT_SECRET' in projectEnvironment(base(), { JWT_SECRET: 'joes-own-jwt' })).toBe(false);
    });

    it('the names: the wider secrets, the machine\'s own, and the old rules unchanged', () => {
        for (const name of ['ADMIN_EMAIL', 'ADMIN_USER', 'ADMIN_USERNAME', 'ADMIN_NAME', 'SMTP_HOST', 'SMTP_USER', 'STRIPE_PRICE_ID', 'SENTRY_DSN',
            'REDIS_URL', 'DB_URI', 'APP_DB_URL', 'POSTGRES_URL', 'PG_DSN', 'MYSQL_URL', 'AMQP_URL', 'RABBIT_URI', 'QUEUE_URL',
            'JWT_SECRET', 'SECRETS_MASTER_KEY', 'MONGO_URI', 'DATABASE_URL', 'ANTHROPIC_API_KEY', 'ADMIN_PASSWORD']) {
            expect(`${name}:${isSecretEnv(name, 'plain')}`).toBe(`${name}:true`);
        }
        for (const name of ['API_BASE_URL', 'PUBLIC_URL', 'FEEDBACK_URL', 'UPGRADE_URL', 'ADMIN_PANEL', 'EDITOR', 'PATH', 'LANG', 'HOSTNAME']) {
            expect(`${name}:${isSecretEnv(name, 'https://example.com/v1')}`).toBe(`${name}:false`);
        }
        for (const name of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'windir', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA',
            'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'PYTHONPATH',
            'HTTP_PROXY', 'https_proxy', 'ALL_PROXY', 'NO_PROXY', 'npm_config_registry', 'NPM_CONFIG_REGISTRY', 'npm_config_cafile', 'npm_config_strict_ssl',
            'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'npm_config_//registry.npmjs.org/:_authToken', 'SSH_AUTH_SOCK', 'GIT_ASKPASS', 'SSH_ASKPASS', 'XAUTHORITY',
            'DBUS_SESSION_BUS_ADDRESS', 'LANG', 'LC_ALL', 'TZ']) {
            expect(`${name}:${isMachineEnv(name)}`).toBe(`${name}:true`);
            expect(`${name}:${isHiddenFromProject(name, 'http://user:pw@host/')}`).toBe(`${name}:false`);
        }
        for (const name of ['JWT_SECRET', 'GITHUB_TOKEN', 'AUTH_TOKEN', 'JOE_DATA_DIR', 'PORT', 'NODE_ENV', 'npm_config_prefix', 'SESSION_SECRET']) {
            expect(`${name}:${isMachineEnv(name)}`).toBe(`${name}:false`);
            expect(`${name}:${isHiddenFromProject(name, 'x')}`).toBe(`${name}:true`);
        }
        expect(MACHINE_ENV.flags).toContain('i');
        expect(isJoeProcessEnv('JOE_ENGINE_MODEL')).toBe(true);
    });

    it('the engine\'s shell exports the same functions it always has', () => {
        expect(shell.isSecretEnv).toBe(isSecretEnv);
        expect(shell.isJoeProcessEnv).toBe(isJoeProcessEnv);
        expect(shell.childEnvironment).toBe(childEnvironment);
        const overrides = childEnvironment({ PORT: '4321' });
        //  Kernel-only overrides: undefined removes, and the machine's PATH is not in it.
        expect(overrides.JWT_SECRET).toBeUndefined();
        expect('JWT_SECRET' in overrides).toBe(true);
        expect(Object.keys(overrides).some(name => name.toLowerCase() === 'path')).toBe(false);
        expect('NODE_AUTH_TOKEN' in overrides).toBe(false);
    });
});

/* ───────────────────────── the source ───────────────────────── */

function sourceFiles(folder: string, found: string[] = []): string[] {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) {
            if (['node_modules', 'dist', '__tests__', '__mocks__', 'tests'].includes(entry.name)) continue;
            sourceFiles(full, found);
        } else if (/\.(?:ts|js|mjs|cjs)$/u.test(entry.name)) found.push(full);
    }
    return found;
}
const relative = (file: string) => path.relative(SRC, file).split(path.sep).join('/');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('who may ask for Joe\'s own environment', () => {
    /** Where the option is defined and explained, not used. */
    const DEFINED_IN = ['kernel/ExecutionEngine.ts', 'shared/child-environment.ts'];
    const files = sourceFiles(SRC);

    it('every file that says joeInfrastructure is in the allowlist, with a reason; every listed file uses it', () => {
        const allowed = JOE_INFRASTRUCTURE_SITES.map(site => site.file);
        expect(new Set(allowed).size).toBe(allowed.length);
        for (const site of JOE_INFRASTRUCTURE_SITES) expect(`${site.file}: ${site.reason.trim().length > 20}`).toBe(`${site.file}: true`);
        const users = files.filter(file => /joeInfrastructure/u.test(fs.readFileSync(file, 'utf8'))).map(relative).filter(rel => !DEFINED_IN.includes(rel));
        expect(users.sort()).toEqual([...allowed].sort());
        for (const rel of allowed) {
            const text = read(rel);
            //  Only the literal `joeInfrastructure: true`: never a variable, never passed through from an input.
            expect(`${rel}: ${text.match(/joeInfrastructure(?!: true\b)/gu)?.length ?? 0}`).toBe(`${rel}: 0`);
            expect(text).toMatch(/joeInfrastructure: true\b/u);
        }
    });

    it('the kernel builds every child\'s environment in one place, and only the opt-out copies Joe\'s', () => {
        const engine = read('kernel/ExecutionEngine.ts');
        expect(engine.match(/env: isolatedExecutionEnv\((?:options|rest)\.env, (?:options|rest)\)/gu)?.length).toBe(7);
        expect(engine).toContain('const env = isolatedExecutionEnv(overrides);');
        expect(engine.match(/\.\.\.process\.env/gu)?.length).toBe(1);
        expect(engine).toMatch(/opts\?\.joeInfrastructure === true\s*\? \{ \.\.\.process\.env, \.\.\.overrides \}\s*: projectEnvironment\(process\.env, overrides\)/u);
        expect(read('kernel/ExecutionGateway.ts')).not.toMatch(/process\.env/u);
    });

    it('outside Joe\'s infrastructure no file hands Joe\'s whole environment to anything', () => {
        const spreads = files.filter(file => /\.\.\.process\.env/u.test(fs.readFileSync(file, 'utf8'))).map(relative).sort();
        const expected = [
            'kernel/ExecutionEngine.ts',
            'api/routes/ping-deploy.ts', 'modules/services/DeployManager.ts', 'modules/tools/definitions/GitTools.ts',
            //  Not a child process: the model settings of one request.
            'api/routes/run.ts',
            //  The text of a generated project's own test file, which copies ITS environment, not Joe's.
            'modules/tools/definitions/ApiProjectTool.ts',
        ].sort();
        expect(spreads).toEqual(expected);
        for (const rel of ['modules/tools/definitions/ProjectRunTool.ts', 'core/quality/terminal-audit.ts', 'modules/tools/definitions/WebDevelopmentTools.ts',
            'modules/tools/definitions/DeadCodeTool.ts', 'modules/tools/definitions/OrionBusinessFoundationTool.ts']) {
            expect(`${rel}: ${/\.\.\.process\.env/u.test(read(rel))}`).toBe(`${rel}: false`);
        }
    });
});

describe('a dev server Joe starts listens on this machine only', () => {
    const tool = read('modules/tools/definitions/WebDevelopmentTools.ts');

    it('vite, the vite config it writes, and serve are all given the bind address; 0.0.0.0 is nowhere a server is told to listen', () => {
        expect(tool.match(/npx --yes vite --host \$\{bindHost\} --port \$\{port\}/gu)?.length).toBe(2);
        expect(tool).toContain('server: { host: \'${bindHost}\', allowedHosts: true }');
        expect(tool).toContain('npx -y serve -l tcp://${bindHost}:${port} -s . --no-clipboard');
        expect(tool).toContain('env: { PORT: String(port), HOST: bindHost, BROWSER: \'none\' }');
        expect(tool).toContain('const bindHost = previewBindHost(isProductionHost());');
        expect(tool).not.toMatch(/--host 0\.0\.0\.0|host: '0\.0\.0\.0'|HOST: '0\.0\.0\.0'|host: string = '0\.0\.0\.0'/u);
        expect(tool).not.toMatch(/serve -l \$\{port\}/u);
    });

    it('the address is 127.0.0.1, except on the production host that owns the address its nginx dials', () => {
        const bridge = { docker0: [{ address: PREVIEW_PROXY_DIALS }] } as any;
        const lan = { eth0: [{ address: '10.0.0.5' }, { address: '203.0.113.9' }] } as any;
        expect(previewBindHost(false)).toBe('127.0.0.1');
        expect(previewBindHost(false, 'linux', bridge)).toBe('127.0.0.1');
        expect(previewBindHost(true, 'win32', bridge)).toBe('127.0.0.1');
        expect(previewBindHost(true, 'linux', lan)).toBe('127.0.0.1');
        expect(previewBindHost(true, 'linux', bridge)).toBe(PREVIEW_PROXY_DIALS);
        //  The address is the one the shipped proxy dials for /preview/<port>/.
        const nginx = fs.readFileSync(path.join(SRC, '..', '..', 'infra', 'nginx', 'conf.d', 'app.conf'), 'utf8');
        expect(nginx).toContain(`proxy_pass http://${PREVIEW_PROXY_DIALS}:$p_port;`);
    });
});
