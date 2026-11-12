/**
 * THE USER'S CODE NEVER SEES JOE'S SECRETS.
 *
 * Joe's own process holds what Joe needs to be Joe: JWT_SECRET, the Mongo
 * address, the model providers' keys, ADMIN_EMAIL/ADMIN_PASSWORD and
 * SECRETS_MASTER_KEY (the key that encrypts the owner's stored secrets). A
 * child process that inherits them hands them to whatever it runs: a preview
 * of code the model wrote, that app's tests, an install script of a package,
 * a build, an imported third-party repository. A generated `/debug` route, a
 * crash page or one log line then shows them, and an app's own ADMIN_* seed
 * picks up Joe's.
 *
 * So the kernel (kernel/ExecutionEngine.ts, every spawn route) builds each
 * child's environment with projectEnvironment(): the machine's environment
 * WITHOUT Joe's secrets and WITHOUT the settings of Joe's own process, then
 * the caller's own values. The only way out is an explicit
 * `joeInfrastructure: true` execution option, for Joe's own infrastructure
 * that needs Joe's credentials or settings; every file that uses it is named
 * in JOE_INFRASTRUCTURE_SITES with the reason, and a test fails on any use
 * outside that list.
 *
 * No tool is imported here, so both the kernel and the tools can import it.
 */

const WINDOWS = process.platform === 'win32';

/* ───────────────────────── the machine's settings stay ───────────────────────── */

/**
 * THE MACHINE'S OWN SETTINGS, WHICH EVERY CHILD KEEPS.
 *
 * Where programs are, where temporary files go, the user's profile, the
 * locale, the proxy and the npm registry of this machine (with their
 * credentials: an install behind a company proxy or a private registry needs
 * them), the agent sockets git and ssh ask for a password through. They are
 * the machine's, not Joe's, and they are checked BEFORE the secret rule,
 * because several of them carry a word that rule looks for (NODE_AUTH_TOKEN,
 * SSH_AUTH_SOCK, GIT_ASKPASS, DBUS_SESSION_BUS_ADDRESS, a proxy address with
 * a password).
 *
 * The known price, stated: a registry token reaches an install script, as it
 * does on any developer's machine.
 */
export const MACHINE_ENV = new RegExp('^(?:'
    + 'PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|TMPDIR'
    + '|USERPROFILE|HOME|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMDATA'
    + '|PROGRAMFILES(?:\\(X86\\))?|PROGRAMW6432|COMMONPROGRAMFILES(?:\\(X86\\))?|COMMONPROGRAMW6432'
    + '|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|PYTHONPATH'
    + '|(?:HTTPS?|ALL|NO)_PROXY'
    + '|npm_config_(?:registry|cafile|ca|strict[_-]ssl|https?[_-]proxy|proxy|noproxy)'
    + '|npm_config_(?:@[^:]+:registry|\\/\\/.+:_authToken)'
    + '|NODE_AUTH_TOKEN|NPM_TOKEN'
    + '|SSH_AUTH_SOCK|GIT_ASKPASS|SSH_ASKPASS|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS'
    + '|LANG|LANGUAGE|LC_\\w+|TZ'
    + ')$', 'iu');

/** A setting of the machine itself, which a child keeps whatever it is called or holds. */
export function isMachineEnv(name: string): boolean {
    return MACHINE_ENV.test(name);
}

/* ───────────────────────── what is a secret ───────────────────────── */

const SECRET_ENV_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASS|PRIVATE|CREDENTIAL|COOKIE|SESSION|AUTH|MONGO|DATABASE/iu;
/**
 * Names that say nothing of the words above and are still Joe's own: who the
 * administrator is, the mail server Joe sends through, Joe's payment and
 * error-reporting accounts.
 */
const SECRET_ENV_NAME_WHOLE = /^(?:(?:\w+_)?ADMIN_(?:EMAIL|USER|USERNAME|NAME)|SMTP_\w+|STRIPE_\w+|SENTRY_DSN)$/iu;
/** The address of a data store: `REDIS_URL`, `DB_URI`, `QUEUE_DSN`, `POSTGRES_URL`. */
const STORE_WORD = /^(?:DB|DATABASE|MONGO|MONGODB|POSTGRES|POSTGRESQL|PG|MYSQL|REDIS|AMQP|RABBIT|RABBITMQ|QUEUE)$/iu;
const ADDRESS_WORD = /^(?:URI|URL|DSN)$/iu;

function isStoreAddressName(name: string): boolean {
    const words = name.split('_').filter(Boolean);
    if (words.length < 2 || !ADDRESS_WORD.test(words[words.length - 1])) return false;
    return words.slice(0, -1).some(word => STORE_WORD.test(word));
}

/** An address that carries a password: `postgres://user:pw@host`, a proxy with credentials. */
const CREDENTIAL_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]*:[^\s/@]+@/iu;
/**
 * A value shaped like a credential, whatever the variable is called: the
 * published prefixes of API keys and tokens (the `sk-` model API keys,
 * GitHub `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`/`github_pat_`, Groq `gsk_`,
 * Hugging Face `hf_`, Slack `xox?-`, AWS `AKIA`/`ASIA`, Google `AIza`), a
 * signed JWT, and a PEM private key.
 */
const CREDENTIAL_VALUE = /^(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gsk_[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|A(?:KIA|SIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+)$|-----BEGIN [A-Z ]*PRIVATE KEY-----/u;

/** A variable a child must not see: its name says it is a secret, or its value is one (an address with a password, a token). */
export function isSecretEnv(name: string, value: string | undefined): boolean {
    if (SECRET_ENV_NAME.test(name) || SECRET_ENV_NAME_WHOLE.test(name) || isStoreAddressName(name)) return true;
    if (typeof value !== 'string') return false;
    const v = value.trim();
    return CREDENTIAL_URL.test(v) || CREDENTIAL_VALUE.test(v);
}

/* ───────────────────────── what is Joe's own process ───────────────────────── */

/**
 * JOE'S OWN PROCESS SETTINGS ARE NOT THE PROJECT'S.
 *
 * Joe is started with its own port and mode (start-joe.ps1 sets PORT=5002
 * and NODE_ENV=development; a server sets NODE_ENV=production), and npm, when
 * it starts Joe (`npm start`), describes that invocation in npm_* variables:
 * Joe's package, its script, and the install settings it was given. A child
 * that inherits them is configured as Joe: a generated server's
 * `process.env.PORT || 3000` binds Joe's own port and dies with EADDRINUSE,
 * and `npm install` under NODE_ENV=production (or npm_config_omit=dev) leaves
 * out devDependencies, so the project's build tools are never installed.
 * Joe's JOE_* settings name Joe's own folders (its data and chat store) and
 * policies; a project has no use for them. A child gets PORT only when the
 * caller names a port, and the project decides its own mode.
 *
 * npm's configuration of the MACHINE stays: its registry, a proxy, a CA
 * (NPM_CONFIG_REGISTRY on a server behind a mirror). An install needs it, and
 * it is the machine's, not Joe's. Only the npm settings that decide what an
 * install writes and where are removed.
 */
const JOE_PROCESS_ENV = /^(?:PORT|NODE_ENV|INIT_CWD|JOE_.*|npm_(?:lifecycle_.*|package_.*|command|execpath|node_execpath)|npm_config_(?:prefix|local_prefix|cache|global|production|omit|include|only|argv|workspaces?))$/iu;

/** A variable that describes Joe's own process rather than the machine. */
export function isJoeProcessEnv(name: string): boolean {
    return JOE_PROCESS_ENV.test(name);
}

/** What a project's process does not inherit from Joe: a secret, or a setting of Joe's own process. The machine's settings are never it. */
export function isHiddenFromProject(name: string, value: string | undefined): boolean {
    if (isMachineEnv(name)) return false;
    return isSecretEnv(name, value) || isJoeProcessEnv(name);
}

/* ───────────────────────── the environment of a project's process ───────────────────────── */

/** The name `wanted` as `env` spells it: Windows names are case-insensitive, so `Path` and `PATH` are one variable. */
function namesLike(env: NodeJS.ProcessEnv, wanted: string): string[] {
    if (!WINDOWS) return wanted in env ? [wanted] : [];
    const lower = wanted.toLowerCase();
    return Object.keys(env).filter(name => name.toLowerCase() === lower);
}

function valueIn(env: NodeJS.ProcessEnv, wanted: string): string | undefined {
    const [name] = namesLike(env, wanted);
    return name === undefined ? undefined : env[name];
}

/**
 * Whether `overrides` is a copy of Joe's whole environment with a few names
 * changed (a spread of process.env plus a PORT): it repeats most of what Joe has.
 */
function repeatsTheBase(base: NodeJS.ProcessEnv, overrides: NodeJS.ProcessEnv): boolean {
    const names = Object.keys(base).filter(name => base[name] !== undefined);
    if (names.length === 0) return false;
    let same = 0;
    for (const name of names) if (overrides[name] === base[name]) same += 1;
    return same * 2 > names.length;
}

/**
 * THE ENVIRONMENT OF A PROCESS THAT RUNS THE USER'S PROJECT.
 *
 * `base` is Joe's own environment (process.env); `overrides` is what the
 * caller asked for. The result is the whole environment the child gets:
 *
 *   1. `base` without every secret and every setting of Joe's own process
 *      (isHiddenFromProject); the machine's settings stay (MACHINE_ENV).
 *   2. the caller's `overrides` on top. `undefined` removes a name.
 *
 * AN INHERITED COPY IS STILL REMOVED. Many callers spread the whole of
 * process.env and add a PORT, which hands every secret back as an
 * "override". An override whose name is a secret and whose value is exactly
 * Joe's own is such a copy and is removed; so is a copy of a setting of Joe's
 * process (PORT, NODE_ENV, JOE_*) when the overrides repeat Joe's environment.
 * A value the caller chose (a generated API's own API_JWT_SECRET, the app's
 * own PORT, NODE_ENV=production for a build) differs from Joe's or stands
 * alone, and is kept.
 */
export function projectEnvironment(base: NodeJS.ProcessEnv, overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(base)) {
        if (value === undefined || isHiddenFromProject(name, value)) continue;
        env[name] = value;
    }
    if (!overrides) return env;
    const copied = repeatsTheBase(base, overrides);
    for (const [name, value] of Object.entries(overrides)) {
        if (value === undefined) {
            for (const other of namesLike(env, name)) delete env[other];
            continue;
        }
        if (!isMachineEnv(name) && valueIn(base, name) === value) {
            //  Joe's own value, handed back: a secret always, a process
            //  setting when the caller copied the whole environment.
            if (isSecretEnv(name, value) || (copied && isJoeProcessEnv(name))) continue;
        }
        for (const other of namesLike(env, name)) if (other !== name) delete env[other];
        env[name] = value;
    }
    return env;
}

/* ───────────────────────── what an agent's commands add ───────────────────────── */

/**
 * Non-interactive, colourless, UTF-8, and on loopback: what an agent's
 * commands need, whatever runs them. HOST keeps a server a command starts off
 * the network (a host Joe was started with, 0.0.0.0 on a server, would expose
 * every generated app). The kernel does NOT add these: a caller that wants
 * them (the engine's shell, a preview) asks through childEnvironment().
 */
export const CHILD_SETTINGS: Readonly<Record<string, string>> = Object.freeze({
    CI: '1',
    BROWSER: 'none',
    FORCE_COLOR: '0',
    HOST: '127.0.0.1',
    npm_config_yes: 'true',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    npm_config_update_notifier: 'false',
    //  A package already in npm's cache is used without asking the registry again; one that is
    //  missing is still fetched. The ladder, 2026-11-09: `npm install` took 4–8 minutes in
    //  L143, L147 and L149 for packages installed many times before.
    npm_config_prefer_offline: 'true',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
});

/**
 * KERNEL-ONLY OVERRIDES, NEVER A FULL ENVIRONMENT.
 *
 * What this returns is passed as the `env` option of a kernel route and
 * nowhere else: a name set to undefined means "remove it from the child", and
 * the machine's own variables (PATH…) are not in it at all, because the
 * kernel starts from them. A secret, and a setting of Joe's own process, is
 * set to undefined, which removes it from the child's environment entirely (a
 * child of a clean machine sees no such name, so a project's own
 * `process.env.SESSION_SECRET ?? 'dev'` and `process.env.PORT || 3000`
 * fallbacks still work). Then CHILD_SETTINGS, then the caller's extras.
 */
export function childEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    const names = Object.keys(process.env);
    for (const name of names) {
        if (isHiddenFromProject(name, process.env[name])) env[name] = undefined;
    }
    for (const [name, value] of Object.entries({ ...CHILD_SETTINGS, ...extra })) {
        env[name] = value;
        //  Windows names are case-insensitive: a differently cased copy of the
        //  same variable must not keep its old value beside the new one.
        if (WINDOWS) {
            for (const other of names) if (other !== name && other.toLowerCase() === name.toLowerCase()) env[other] = value;
        }
    }
    return env;
}

/* ───────────────────────── Joe's own infrastructure ───────────────────────── */

/**
 * THE ONLY FILES THAT MAY ASK FOR JOE'S OWN ENVIRONMENT.
 *
 * `joeInfrastructure: true` on a kernel route gives the child Joe's whole
 * environment, as every child had before. It is for Joe's own infrastructure,
 * which needs Joe's credentials or settings and runs none of the user's
 * project code as its job. A file not named here must not pass the option
 * (the-users-code-never-sees-joes-secrets.test.ts reads every file under
 * api/src). Paths are relative to api/src.
 */
export const JOE_INFRASTRUCTURE_SITES: ReadonlyArray<{ file: string; reason: string }> = Object.freeze([
    { file: 'modules/tools/definitions/GitTools.ts', reason: 'git push/fetch/pull/clone with the owner\'s GitHub token: the askpass helper reads the token from the environment' },
    { file: 'modules/tools/definitions/GitLocalWorkflowTool.ts', reason: 'git on the owner\'s repository with his identity and credential settings (GIT_AUTHOR_*, GIT_SSH_COMMAND…)' },
    { file: 'modules/services/DeployManager.ts', reason: 'Joe deploying Joe: git pull, the build, and the restart of Joe\'s own API, which needs Joe\'s whole configuration' },
    { file: 'api/routes/ping-deploy.ts', reason: 'Joe deploying Joe from the deploy ping: the same pull, build and restart of Joe\'s own API' },
    { file: 'api/routes/system.ts', reason: 'the updater (update-joe) and its `git fetch` of Joe\'s own repository: it restarts Joe with Joe\'s settings (JOE_*)' },
    { file: 'api/routes/admin.ts', reason: 'Joe\'s own maintenance from the admin page: the backup of Joe\'s own database' },
    { file: 'core/quality/ensure-chromium.ts', reason: 'installing Joe\'s own Chromium for its browser checks, where Joe\'s Playwright settings say to put it' },
    { file: 'modules/tools/definitions/EngineAndroidTool.ts', reason: 'the adb bridge to the owner\'s phone: adb\'s own keys and server settings (ADB_VENDOR_KEYS, ANDROID_*)' },
]);
