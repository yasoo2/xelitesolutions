/**
 * A PLAN MAY ONLY NAME TOOLS THAT EXIST.
 *
 * The field log that produced this file:
 *
 *   [PhaseExecutor] Task 1/2: "Create project repository" — executing tool: Git
 *   [PhaseExecutor] ❌ Task 1 failed: Git — unknown_tool: "Git"
 *   [PhaseExecutor] Task 2/2: "Set up project management board" — executing tool: Jira
 *   [PhaseExecutor] ❌ Task 2 failed: Jira — unknown_tool: "Jira"
 *   ⛔ لم ينجح الإصلاح الذاتي — أتوقف بصدق عند 0/8 مراحل
 *
 * An eight-phase e-commerce build died on its first two tasks because the
 * planner asked a language model, in effect, "what would a senior project
 * manager do?" — and never told it what this machine can actually do. The
 * model answered like a manager: open a repository in Git, open a board in
 * Jira. Both perfectly sensible. Neither is a tool that exists here, and
 * "Jira" is not a thing Joe will ever have, because Joe writes software, it
 * does not staff a department.
 *
 * The repo already forbids this in code — an alias that points at nothing
 * fails the build (wiring-policy). The same law now covers what a MODEL
 * writes, because a plan is code the system is about to run.
 *
 * Three defences, in order:
 *   1. the planner is TOLD the vocabulary, so it rarely invents one
 *   2. whatever it returns is SNAPPED onto a real tool where a real
 *      equivalent exists ("Git" is git_ops; "npm install" is npm_manager)
 *   3. what cannot be snapped is DROPPED with a written reason, never
 *      executed and never allowed to fail a phase — a task nobody can
 *      perform is not a failure of the build, it is a defect of the plan
 */
import { TOOL_ALIASES } from '../../modules/services/ToolService';
import { syntaxFileKind } from '../../shared/syntax-contract';

/**
 * The registry is read LAZILY and cached.
 *
 * registry → tool definitions → PhaseExecutorTool → this file → registry is a
 * cycle. Reading `tools` at module load worked under Jest's module graph and
 * threw «Cannot access 'tools' before initialization» the first time the real
 * process loaded it — caught by the live proof, which is the only reason this
 * comment is here and not a crash on his machine.
 */
let registeredCache: Set<string> | null = null;
function registered(): Set<string> {
    if (registeredCache) return registeredCache;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { tools } = require('../../modules/tools/registry');
    const set = new Set<string>((tools || []).map((t: any) => String(t.name)));
    if (set.size > 0) registeredCache = set;   // don't cache a half-initialised registry
    return set;
}

/**
 * What a project plan is allowed to say.
 *
 * Deliberately a SHORT list, not all 151 registered tools: this text goes into
 * the planner's prompt, and a wall of names buys worse plans, not better ones.
 * These are the tools that actually appear in a build.
 */
export const PLANNER_TOOL_CATALOGUE: Array<{ tool: string; purpose: string }> = [
    { tool: 'scaffold_project', purpose: 'create a new project on disk; REQUIRED args.structure is a non-empty object mapping safe workspace-relative paths to file contents (use null only for empty directories), and optional args.baseDir is the project directory (projectName is accepted as an alias); include source/config/test files when implementation is requested, for example {"package.json":"...","src/index.ts":"..."}; never pass an empty object, absolute path, drive path, or .. segment' },
    { tool: 'scaffold_full_stack', purpose: 'create a full-stack project (frontend + backend together)' },
    { tool: 'react_project', purpose: 'build a real React + Vite application' },
    { tool: 'api_project', purpose: 'build a real Express + SQLite backend with working endpoints' },
    { tool: 'web_page_builder', purpose: 'build a complete website/landing page' },
    { tool: 'ai_write_file', purpose: 'write one source file whose content must be generated' },
    { tool: 'write_file', purpose: 'write one file with content you already know exactly' },
    { tool: 'file_edit', purpose: 'change part of an existing file (search/replace)' },
    { tool: 'project_edit', purpose: 'surgical edit inside an existing project, with a build check' },
    { tool: 'delete_file', purpose: 'remove a file' },
    { tool: 'read_file', purpose: 'read a file before changing it' },
    { tool: 'search_text', purpose: 'find text inside the codebase' },
    { tool: 'inspect_directory', purpose: 'list what is on disk' },
    { tool: 'npm_manager', purpose: 'install or manage npm dependencies' },
    { tool: 'shell_execute', purpose: 'run a build/test command (npm run build, npm test)' },
    { tool: 'git_ops', purpose: 'git: init, add, commit, branch, status' },
    { tool: 'github_repo_manager', purpose: 'create or connect a GitHub repository' },
    { tool: 'github_pr', purpose: 'open a pull request' },
    { tool: 'auto_tester', purpose: 'generate and run tests' },
    { tool: 'test_generator', purpose: 'generate a test suite for existing code' },
    { tool: 'quality_run', purpose: 'run the quality gate (lint, types, build)' },
    { tool: 'code_reviewer', purpose: 'review code for defects' },
    { tool: 'security_scanner', purpose: 'scan for security problems' },
    { tool: 'dependency_audit', purpose: 'audit dependencies for vulnerabilities' },
    { tool: 'db_schema_migrator', purpose: 'execute an existing database schema file or SQL migration; action is REQUIRED and must be exactly migrate, push, reset, or status. Use engine sqlite for an existing .sql migration (execute it against SQLite, never pass it to Prisma); use engine prisma only for an existing .prisma schema. This tool does not create or design schemas; do not use create, design, or generate as an action—write and verify the schema or SQL file first.' },
    { tool: 'auth_builder', purpose: 'add authentication (login, sessions, roles); REQUIRED args.type and args.outputDir (workspace-relative destination)' },
    { tool: 'payments_create_checkout_session', purpose: 'wire a real payment checkout' },
    { tool: 'i18n_translator', purpose: 'add or translate interface languages' },
    { tool: 'swagger_docs', purpose: 'generate API documentation' },
    { tool: 'doc_generator', purpose: 'write project documentation' },
    { tool: 'browser_run', purpose: 'open the built app in a real browser and check it' },
    { tool: 'browser_ui_audit', purpose: 'audit the built UI for visual and accessibility defects' },
    { tool: 'project_detect', purpose: 'verify what was actually created on disk' },
    { tool: 'project_run', purpose: 'start the built project and get a live URL' },
    { tool: 'deploy_project', purpose: 'build, start, or package the project locally for verification; use action build_static, start_server, or package by default. Never use expose_port or publish externally unless the user explicitly requests and approves an external deployment.' },
    { tool: 'mobile_builder', purpose: 'build the mobile application' },
];

/**
 * What models reach for, and what it means here.
 *
 * Every entry is something a real plan actually said, or the obvious sibling
 * of one. A model naming a PRODUCT ("Git", "Docker", "Stripe") means the
 * capability, and the capability has a tool.
 */
const MEANS: Record<string, string> = {
    git: 'git_ops', github: 'github_repo_manager', 'version control': 'git_ops',
    'source control': 'git_ops', gitlab: 'git_ops', bitbucket: 'git_ops',
    'git init': 'git_ops', 'git commit': 'git_ops', repository: 'git_ops', repo: 'git_ops',
    'pull request': 'github_pr', pr: 'github_pr',
    npm: 'npm_manager', yarn: 'npm_manager', pnpm: 'npm_manager', 'package manager': 'npm_manager',
    'npm install': 'npm_manager', dependencies: 'npm_manager',
    bash: 'shell_execute', sh: 'shell_execute', terminal: 'shell_execute',
    cli: 'shell_execute', command: 'shell_execute', 'command line': 'shell_execute',
    jest: 'auto_tester', mocha: 'auto_tester', vitest: 'auto_tester', pytest: 'auto_tester',
    cypress: 'browser_run', playwright: 'browser_run', selenium: 'browser_run',
    testing: 'auto_tester', 'unit tests': 'auto_tester', 'test suite': 'test_generator',
    eslint: 'code_reviewer', prettier: 'code_reviewer', linter: 'code_reviewer',
    sonarqube: 'code_reviewer', 'code review': 'code_reviewer',
    postgres: 'db_schema_migrator', postgresql: 'db_schema_migrator', mysql: 'db_schema_migrator',
    mongodb: 'db_schema_migrator', mongoose: 'db_schema_migrator', prisma: 'db_schema_migrator',
    sqlite: 'db_schema_migrator', database: 'db_schema_migrator', sql: 'db_schema_migrator',
    stripe: 'payments_create_checkout_session', paypal: 'payments_create_checkout_session',
    payment: 'payments_create_checkout_session', payments: 'payments_create_checkout_session',
    checkout: 'payments_create_checkout_session',
    auth0: 'auth_builder', jwt: 'auth_builder', oauth: 'auth_builder',
    authentication: 'auth_builder', login: 'auth_builder',
    react: 'react_project', vite: 'react_project', nextjs: 'react_project', 'next.js': 'react_project',
    vue: 'react_project', angular: 'react_project', frontend: 'react_project',
    express: 'api_project', nodejs: 'api_project', 'node.js': 'api_project',
    backend: 'api_project', api: 'api_project', rest: 'api_project',
    swagger: 'swagger_docs', openapi: 'swagger_docs',
    i18n: 'i18n_translator', localization: 'i18n_translator', translation: 'i18n_translator',
    'react native': 'mobile_builder', flutter: 'mobile_builder', mobile: 'mobile_builder',
    vercel: 'deploy_project', netlify: 'deploy_project', heroku: 'deploy_project',
    deployment: 'deploy_project', deploy: 'deploy_project', hosting: 'deploy_project',
    docker: 'docker_manager', kubernetes: 'kubernetes_ops', terraform: 'terraform_manager',
    'github actions': 'github_actions', ci: 'ci_generate_pipeline', 'ci/cd': 'ci_generate_pipeline',
    documentation: 'doc_generator', readme: 'doc_generator', docs: 'doc_generator',
    'file system': 'write_file', fs: 'write_file', editor: 'file_edit', ide: 'file_edit',
    browser: 'browser_run', lighthouse: 'browser_ui_audit', accessibility: 'browser_ui_audit',
};

/**
 * Things a HUMAN ORGANISATION does. Joe writes software; it does not open
 * tickets, book meetings or run a standup. A plan step for one of these is not
 * a capability Joe is missing — it is a step that does not belong in a build,
 * and pretending otherwise is how «0/8 phases» happens.
 */
const NOT_SOFTWARE = new Set([
    'jira', 'trello', 'asana', 'monday', 'clickup', 'linear', 'notion', 'confluence',
    'slack', 'teams', 'discord', 'email', 'zoom', 'meet', 'calendar', 'figma', 'sketch',
    'miro', 'whiteboard', 'standup', 'kickoff', 'meeting', 'interview', 'hiring',
    'project management board', 'project management', 'kanban', 'scrum', 'sprint planning',
    'stakeholder', 'budget', 'manual', 'human', 'team', 'designer', 'none', 'n/a',
]);

const norm = (v: any) => String(v || '').trim().toLowerCase();

/**
 * A file argument must name one workspace-relative path, not a shell command.
 * Models sometimes put `node src/index.js` (or `npm run dev`) in the path field
 * when they mean an entrypoint command. Treating that value as a filename creates
 * a literal malformed file and hides the runnable-artifact defect until live-run.
 */
export function isShellLikeWorkspacePath(value: unknown): boolean {
    const raw = String(value || '').trim().replace(/\\/g, '/');
    if (!raw) return false;
    if (/(?:&&|\|\||[;&|])/.test(raw)) return true;
    return /^(?:(?:node|nodejs|npm|npx|pnpm|yarn|bun|deno|python|python3|ruby|php|bash|sh|zsh|pwsh|powershell|tsx|ts-node|java|go)(?:\s|$)|(?:\.\/)?node_modules\/\.bin\/[^\s]+\s)/i.test(raw);
}
/** «Set up Project Management Board» and «set_up_project_management_board» are the same words. */
const key = (v: any) => norm(v).replace(/[_\-\s]+/g, ' ').replace(/[^a-z0-9. /]/g, '').trim();
const snake = (v: any) => norm(v).replace(/[\s\-.]+/g, '_').replace(/[^a-z0-9_]/g, '');

/**
 * Infer only semantic required fields from a task sentence.  This deliberately
 * stays local to plan-tools: importing toolCatalog here would create the cycle
 * registry -> PhaseExecutor -> plan-tools -> toolCatalog -> registry.
 */
function inferRequiredPlanArgs(schema: any, goal: string): Record<string, any> | null {
    const properties: Record<string, any> = schema?.properties || {};
    const input: Record<string, any> = {};
    for (const property of Object.keys(properties)) {
        const name = property.toLowerCase();
        if (/^(query|question|text|request|instruction|goal|task|prompt|description|topic|content|input|pattern)$/.test(name)) {
            input[property] = goal;
        }
    }
    const required = Array.isArray(schema?.required) ? schema.required.map(String) : [];
    const requiredAny: string[][] = Array.isArray(schema?.requiredAny)
        ? schema.requiredAny.filter((group: any) => Array.isArray(group) && group.length).map((group: any[]) => group.map(String))
        : [];
    if (required.some((key: string) => input[key] === undefined)) return null;
    if (requiredAny.some((group: string[]) => !group.some(key => input[key] !== undefined))) return null;
    return Object.keys(input).length ? input : null;
}

export type Resolution =
    | { tool: string; how: 'exact' | 'alias' | 'normalised' | 'meaning' | 'nearest' }
    | { tool: null; why: 'not_software' | 'unknown' };

/**
 * One free-text tool name from a plan → a tool that exists, or an honest null.
 * Order matters: the cheapest, most certain answer first.
 */
export function resolvePlannedTool(raw: any): Resolution {
    const name = String(raw || '').trim();
    if (!name) return { tool: null, why: 'unknown' };

    if (registered().has(name)) return { tool: name, how: 'exact' };

    const aliased = TOOL_ALIASES[name] || TOOL_ALIASES[snake(name)];
    if (aliased && registered().has(aliased)) return { tool: aliased, how: 'alias' };

    const s = snake(name);
    if (registered().has(s)) return { tool: s, how: 'normalised' };

    const k = key(name);
    if (NOT_SOFTWARE.has(k)) return { tool: null, why: 'not_software' };
    // «Set up project management board» contains «project management board»
    for (const phrase of NOT_SOFTWARE) {
        if (phrase.includes(' ') && k.includes(phrase)) return { tool: null, why: 'not_software' };
    }

    if (MEANS[k] && registered().has(MEANS[k])) return { tool: MEANS[k], how: 'meaning' };
    // a name that CONTAINS a known product: «Git CLI», «Stripe API»
    for (const [word, target] of Object.entries(MEANS)) {
        if (!registered().has(target)) continue;
        const re = new RegExp(`(^|[^a-z])${word.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&')}([^a-z]|$)`);
        if (re.test(k)) return { tool: target, how: 'meaning' };
    }

    // Last resort: a registered tool whose name is contained in what was asked.
    // Only accepted when it is unambiguous — two candidates means we do not know.
    const near = [...registered()].filter(t => k.includes(t.replace(/_/g, ' ')) || s.includes(t));
    if (near.length === 1) return { tool: near[0], how: 'nearest' };

    return { tool: null, why: 'unknown' };
}

export interface PlanSanitiseBlocker {
    code: string;
    message: string;
    remedy: string;
}

export interface SanitisedPlan {
    phases: any[];
    /** every change made, in the user's log, because a silent rewrite is its own lie */
    notes: string[];
    /** did anything executable survive? */
    executableTasks: number;
    /** a plan-contract failure that must stop planning rather than become a fake deliverable */
    blocker?: PlanSanitiseBlocker;
}

/**
 * Walk a plan and make every task runnable — or gone.
 *
 * A phase left with no executable task is NOT deleted: it is given the one
 * thing Joe can honestly do for it, a written document, so the phase still
 * produces a deliverable instead of a red ❌ nobody can act on.
 */
export interface PlanSanitiseOptions {
    /** Evidence mode from engineering discovery; greenfield has no pre-existing runnable artifact. */
    mode?: 'greenfield' | 'existing' | string;
    /** Greenfield work without a user-selected stack may create only explicit, file-level work. */
    disallowImplicitScaffold?: boolean;
    /** Files discovered in the selected workspace and therefore safe as source inputs. */
    evidencedPaths?: string[];
    /** Exact local check commands declared by an inspected project manifest or test layout. */
    candidateCheckCommands?: string[];
    /** Real test files discovered in the selected workspace; scripts alone are not evidence. */
    testFiles?: string[];
    /** Greenfield plans may not assume a host compiler for native npm addons. */
    disallowUnportableNativeDependencies?: boolean;
    /** Engineering pipelines perform an automatic live-run after phases, so require a runnable artifact contract. */
    requireRunnableContract?: boolean;
    /** Bounded live-repair may edit an existing manifest or entrypoint in place. */
    repairMode?: boolean;
}

export function sanitisePlanPhases(phases: any[], projectDir = '', options: PlanSanitiseOptions = {}): SanitisedPlan {
    const notes: string[] = [];
    let executableTasks = 0;
    const blockers: PlanSanitiseBlocker[] = [];
    const rawHasProjectRun = (Array.isArray(phases) ? phases : []).some((phase: any) =>
        (Array.isArray(phase?.tasks) ? phase.tasks : []).some((task: any) => String(task?.tool || '') === 'project_run')
        || String(phase?.verificationTask?.tool || '') === 'project_run'
    );
    const dir = String(projectDir || '').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40) || 'project';
    const normaliseEvidencePath = (value: unknown) => String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
    /**
     * Keep the planner's runnable contract aligned with ProjectRunTool. A nested
     * feature module such as `src/auth/index.ts` is implementation evidence, not
     * an application entrypoint. A project may be prefixed by one workspace
     * directory (for example `NEXUS/src/index.ts`), while manifests may live in
     * a discovered child project and are therefore accepted at any depth.
     */
    const isRunnableContractPath = (value: unknown): boolean => {
        const candidate = normaliseEvidencePath(value).replace(/^\/+|\/+$/g, '');
        if (!candidate) return false;
        if (/(?:^|\/)package\.json$/i.test(candidate)) return true;
        return /^(?:[^/]+\/)?(?:index\.html|server\.js|app\.py|main\.py|index\.js|index\.ts|main\.ts|server\.ts|app\.ts|src\/(?:index|main|server|app)\.ts)$/i.test(candidate);
    };
    /**
     * A model plan is portable workspace code. Absolute Unix, Windows-drive and
     * UNC paths all bind it to a host and can bypass the selected root; `..`
     * does the same. Reject them before any file-oriented tool sees them.
     */
    const unsafeWorkspacePath = (value: unknown) => {
        const raw = String(value || '').trim().replace(/\\/g, '/');
        return !raw || isShellLikeWorkspacePath(raw) || /^(?:\/|[a-zA-Z]:\/|\/\/)/.test(raw) || raw.split('/').some(segment => segment === '..');
    };
    const evidencedPaths = new Set((options.evidencedPaths || []).map(normaliseEvidencePath).filter(Boolean));
    const candidateCheckCommands = new Set((options.candidateCheckCommands || []).map(command => normaliseShellCommand(command)).filter(Boolean));
    const looksLikeTestPath = (candidate: string) => /(?:^|\/)(?:__tests__|tests?|spec)(?:\/|$)/i.test(candidate)
        || /(?:\.test|\.spec)\.[cm]?[jt]sx?$|_test\.(?:py|go)$/i.test(candidate);
    const discoveredTestPaths = new Set([
        ...(options.testFiles || []),
        ...[...evidencedPaths].filter(looksLikeTestPath),
    ].map(normaliseEvidencePath).filter(Boolean));
    /**
     * Native npm addons are not forbidden in every existing repository, but a
     * greenfield plan must not smuggle in a compiler/toolchain assumption. The
     * current runtime already has a portable SQLite contract (`node:sqlite` or
     * JSON fallback), so these packages are a planning blocker unless the user
     * explicitly required that exact dependency.
     */
    const unportableNativeDependency = (task: any): string | null => {
        const text = [
            task?.task,
            task?.description,
            task?.args?.description,
            JSON.stringify(task?.args || {}),
            JSON.stringify(task?.input || {}),
        ].join('\\n');
        const known = [
            'better-sqlite3', 'sqlite3', 'node-sqlite3', 'bcrypt', 'node-sass',
            'sharp', 'canvas', 'ffi-napi', 'ref-napi', 'isolated-vm',
            '@tensorflow/tfjs-node', 'cpu-features', 'bufferutil', 'utf-8-validate',
        ];
        const hit = known.find(name => new RegExp(`(?:^|[^a-z0-9@/_-])${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?:$|[^a-z0-9@/_-])`, 'i').test(text));
        return hit || (/(?:node-gyp|prebuild-install|binding\\.gyp|native\\s+(?:addon|module)|C\\+\\+\\s+compiler|make(?:file)?\\s+required)/i.test(text) ? 'native addon/toolchain' : null);
    };
    const pathWithinProject = (candidate: unknown, projectPath: unknown) => {
        const candidatePath = normaliseEvidencePath(candidate);
        const scope = normaliseEvidencePath(projectPath);
        if (!candidatePath) return false;
        if (!scope || scope === '.') return true;
        return candidatePath === scope || candidatePath.startsWith(`${scope}/`);
    };
    const hasDeclaredIntegrationCheck = [...candidateCheckCommands].some(command =>
        /(?:^|\s)npm\s+run\s+(?:test:integration|test:e2e|test:int|integration|e2e)(?:\s|$)/i.test(command)
        || /(?:^|\s)(?:pytest|playwright|cypress)(?:\s|$)/i.test(command)
    );
    const testGeneratorOutputPath = (task: any): string => {
        if (String(task?.tool || '') !== 'test_generator') return '';
        const source = normaliseEvidencePath(task?.args?.filePath || task?.input?.filePath);
        if (!source) return '';
        const slash = source.lastIndexOf('/');
        const dir = slash >= 0 ? source.slice(0, slash) : '';
        const filename = slash >= 0 ? source.slice(slash + 1) : source;
        const dot = filename.lastIndexOf('.');
        const stem = dot > 0 ? filename.slice(0, dot) : filename;
        return `${dir ? `${dir}/` : ''}__tests__/${stem}.test.ts`;
    };
    const taskOutputPaths = (tasks: any[]) => tasks
        .flatMap((task: any) => {
            const tool = String(task?.tool || '');
            if (tool === 'test_generator') return [testGeneratorOutputPath(task)];
            if (!['write_file', 'ai_write_file', 'file_edit', 'file_edit_advanced'].includes(tool)) return [];
            return [task?.args?.path || task?.args?.filePath || task?.args?.filename || task?.input?.path || task?.input?.filePath || task?.input?.filename];
        })
        .map(normaliseEvidencePath)
        .filter(Boolean);

    // A phase-level live-run check is meaningful only after the plan has
    // produced a runnable marker. Keep this ledger across phases so a later
    // verification may start a project created by an earlier phase, while a
    // foundation phase cannot accidentally run the workspace root.
    const producedPaths = new Set<string>(evidencedPaths);
    const generatedPaths = new Set<string>();
    // Keep generated manifests separate from manifests discovered in an existing
    // repository. A newly written package.json is not a runnable artifact by
    // itself: it may be only a monorepo wrapper, may point at missing child
    // scripts, or may require dependencies that have not been installed yet.
    // Existing-project evidence remains eligible because discovery has already
    // inspected that project and the user may explicitly ask to run it.
    const generatedRunnableManifests = new Set<string>();
    const generatedPackageLaunchEvidence = (manifestPath: string, phaseTasks: any[]) => {
        const manifest = normaliseEvidencePath(manifestPath);
        const producer = phaseTasks.find((task: any) => {
            const tool = String(task?.tool || '');
            if (!['write_file', 'ai_write_file', 'file_edit', 'file_edit_advanced'].includes(tool)) return false;
            const pathValue = task?.args?.path || task?.args?.filePath || task?.args?.filename || task?.input?.path || task?.input?.filePath || task?.input?.filename;
            return normaliseEvidencePath(pathValue) === manifest;
        });
        if (!producer) return false;
        const raw = producer?.args?.content ?? producer?.input?.content;
        if (typeof raw !== 'string') return false;
        let pkg: any;
        try { pkg = JSON.parse(raw); } catch { return false; }
        const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
        const hasLaunchScript = ['start', 'dev', 'preview', 'serve'].some(name => typeof scripts[name] === 'string' && scripts[name].trim());
        const hasMain = typeof pkg.main === 'string' && pkg.main.trim();
        const hasInstallStep = phaseTasks.some((task: any) => {
            const tool = String(task?.tool || '').toLowerCase();
            const args = { ...(task?.args || {}), ...(task?.input || {}) };
            const action = String(args.action || args.command || '').toLowerCase();
            return (tool === 'npm_manager' && /^(?:install|ci|setup)$/.test(action))
                || (tool === 'shell_execute' && /(?:^|[;&|])\s*npm\s+(?:install|ci)(?:\s|$)/i.test(action));
        });
        return (hasLaunchScript || hasMain) && hasInstallStep;
    };
    const runnableMarker = (candidate: string) => {
        const normalised = normaliseEvidencePath(candidate);
        const segments = normalised.split('/').filter(Boolean);
        // ProjectRunTool resolves the workspace root and its immediate child
        // projects. A deep source entry such as NEXUS/backend/src/index.js is
        // not evidence that NEXUS itself can run.
        if (segments.length > 2) return false;
        if (/(?:^|\/)package\.json$/i.test(normalised)) {
            return !generatedPaths.has(normalised) || generatedRunnableManifests.has(normalised);
        }
        return /(?:^|\/)(?:index\.html|server\.js|app\.py|main\.py|index\.js)$/i.test(normalised);
    };

    const out = (Array.isArray(phases) ? phases : []).map((phase: any, pi: number) => {
        const phaseName = String(phase?.name || `Phase ${pi + 1}`);
        const tasks = Array.isArray(phase?.tasks) ? phase.tasks : [];
        const kept: any[] = [];
        const phaseBlockers: PlanSanitiseBlocker[] = [];
        let hadHardContractDrop = false;

        for (const task of tasks) {
            const asked = String(task?.tool || '').trim();
            const desc = String(task?.task || task?.description || 'task');
            // A task with no tool at all is the planner's own «manual» marker;
            // the executor already skips those without failing.
            if (!asked || key(asked) === 'manual') { kept.push({ ...task, tool: 'manual' }); continue; }

            const r = resolvePlannedTool(asked);
            if (r.tool) {
                // `scaffold_project` is a closed contract.  Do not let the
                // greenfield policy hide a missing structure behind a generic
                // "implicit scaffold" note: that was the round-18 failure mode.
                const rawArgs = { ...(task?.args || {}), ...(task?.input || {}) };
                const adaptedArgs = adaptPlannedArgsFromDescription(r.tool, rawArgs, desc);
                const native = unportableNativeDependency({ ...task, args: adaptedArgs });
                const directNpmInstall = r.tool === 'shell_execute'
                    && /(?:^|[;&|]\s*)npm\s+(?:install|i|ci)\b/i.test(String(adaptedArgs?.command || ''));
                if (native && (options.disallowUnportableNativeDependencies || directNpmInstall)) {
                    const blocker: PlanSanitiseBlocker = {
                        code: directNpmInstall ? 'native_dependency_requires_npm_manager' : 'unportable_native_dependency',
                        message: directNpmInstall
                            ? `المرحلة «${phaseName}» تحاول تثبيت ${native} عبر shell_execute؛ هذا يتجاوز مهلة ورصد npm الآمنين.`
                            : `المرحلة «${phaseName}» اختارت ${native} الذي قد يحتاج node-gyp ومترجم C/C++ غير مثبت؛ لا يمكن افتراض قابلية بنائه محلياً.`,
                        remedy: directNpmInstall
                            ? 'أعد تخطيط التثبيت عبر npm_manager مع package manifest وأدلة toolchain؛ لا تستخدم shell_execute لإخفاء تثبيت dependency داخل أمر مركب.'
                            : 'اختر تبعية portable مدعومة من runtime الحالي (مثل node:sqlite أو JSON fallback)، أو اذكر native dependency صراحةً مع تحقق toolchain قبل التثبيت.',
                    };
                    phaseBlockers.push(blocker);
                    notes.push(`[plan] أوقفتُ «${desc}» — ${blocker.message}`);
                    continue;
                }
                if (r.tool === 'scaffold_project') {
                    const scaffoldIssue = plannedArgsIssue(r.tool, adaptedArgs);
                    if (scaffoldIssue) {
                        phaseBlockers.push({
                            code: 'scaffold_project_contract_invalid',
                            message: `المرحلة «${phaseName}» لا يمكن تنفيذها: ${scaffoldIssue}`,
                            remedy: 'حدّد structure كائناً غير فارغ يحتوي المسارات والملفات المطلوبة، أو ابدأ بمرحلة استكشاف/سؤال تقني صريح قبل البناء.',
                        });
                        notes.push(`[plan] أوقفتُ «${desc}» — ${scaffoldIssue}`);
                        continue;
                    }
                }
                // A greenfield request without an explicit stack is not permission
                // to invent one. A seed tool encodes a framework and dependency
                // decision; retain only precise file-level work until the user or
                // inspected evidence supplies that decision.
                const seedTools = new Set(['scaffold_project', 'scaffold_full_stack', 'react_project', 'api_project', 'web_page_builder', 'mobile_builder']);
                if (options.disallowImplicitScaffold && seedTools.has(r.tool)) {
                    if (r.tool === 'scaffold_project') {
                        phaseBlockers.push({
                            code: 'implicit_scaffold_requires_explicit_stack',
                            message: `المرحلة «${phaseName}» طلبت scaffold_project قبل إثبات تقنية أو إطار صريح لمساحة greenfield.`,
                            remedy: 'استخدم أدلة الاستكشاف أو قيداً تقنياً صريحاً، ثم أرسل structure قابلاً للتنفيذ؛ لن أستبدل ذلك بوثيقة fallback.',
                        });
                    }
                    notes.push(`[plan] أسقطتُ «${desc}» — لا توجد تقنية أو إطار مُختار صراحةً لهذه المساحة الجديدة؛ لن أُنشئ scaffold افتراضياً.`);
                    continue;
                }
                // A recognised name is still not automatically runnable: model
                // arguments must satisfy the real tool contract.  Otherwise an
                // invented action (for example `create` on a migrator that only
                // supports migrate/push/reset/status) reaches execution, fails,
                // and is wrongly treated as a code defect for self-healing.
                const fileArguments = [
                    adaptedArgs?.path,
                    adaptedArgs?.filePath,
                    adaptedArgs?.sourceFile,
                    adaptedArgs?.filename,
                    adaptedArgs?.projectPath,
                    ...(Array.isArray(adaptedArgs?.files) ? adaptedArgs.files : []),
                ].map(value => String(value || '').trim()).filter(Boolean);
                const unsafeFileArgument = fileArguments.find(unsafeWorkspacePath);
                if (unsafeFileArgument) {
                    notes.push(`[plan] أسقطتُ «${desc}» — المسار «${unsafeFileArgument}» ليس مساراً نسبياً آمناً داخل مساحة العمل؛ لن أُمرّره إلى أداة الملفات.`);
                    continue;
                }
                const sourcePath = normaliseEvidencePath(
                    adaptedArgs?.path
                    || adaptedArgs?.filePath
                    || adaptedArgs?.sourceFile
                    || adaptedArgs?.filename
                    || adaptedArgs?.target
                );
                // Generation and review tools all consume source evidence. A review
                // without files is not a harmless empty review: its real contract
                // requires `files`, and executing the model's vague QA request used
                // to crash at `undefined.length` in the live NEXUS quality phase.
                // A read is an evidence operation, not an exploratory guess
                // made by the planner. It may observe discovered evidence or an
                // earlier phase output, exactly like generators and reviews.
                const sourceDependentTools = new Set(['read_file', 'doc_generator', 'test_generator', 'code_reviewer', 'auto_tester', 'file_edit', 'file_edit_advanced']);
                const sourcePaths = (r.tool === 'code_reviewer' || (r.tool === 'auto_tester' && norm(adaptedArgs?.testType) === 'syntax'))
                    ? (Array.isArray(adaptedArgs?.files) ? adaptedArgs.files.map(normaliseEvidencePath).filter(Boolean) : [])
                    : (r.tool === 'auto_tester' ? [] : (sourcePath ? [sourcePath] : []));
                const knownPhaseOutputs = new Set(taskOutputPaths(kept));
                const unprovenSource = sourcePaths.find((candidate: string) => !knownPhaseOutputs.has(candidate) && !producedPaths.has(candidate) && !evidencedPaths.has(candidate));
                // Bounded live repair may reconcile an existing runnable contract
                // whose manifest/entrypoint was discovered on disk by the repair
                // rediscovery, even when that particular path was omitted from the
                // model's evidence list. This is intentionally limited to the
                // manifest and conventional entrypoints; arbitrary source files
                // remain evidence-gated so repair cannot become regeneration.
                const boundedRunnableRepair = Boolean(
                    options.repairMode
                    && sourcePaths.length > 0
                    && sourcePaths.every(isRunnableContractPath)
                );
                const requestedTestType = norm(adaptedArgs?.testType);
                const testProjectPath = adaptedArgs?.projectPath || adaptedArgs?.path || '';
                const testEvidenceCandidates = [...producedPaths, ...knownPhaseOutputs, ...discoveredTestPaths];
                const hasTestEvidence = testEvidenceCandidates.some(candidate =>
                    looksLikeTestPath(normaliseEvidencePath(candidate))
                    && pathWithinProject(candidate, testProjectPath)
                );
                const hasPriorTestGenerator = kept.some(previous => String(previous?.tool || '') === 'test_generator');
                const integrationScriptMissing = requestedTestType === 'integration' && !hasDeclaredIntegrationCheck;
                if (r.tool === 'auto_tester' && (requestedTestType === 'unit' || requestedTestType === 'integration')
                    && ((!hasTestEvidence && !hasPriorTestGenerator) || integrationScriptMissing)) {
                    const reason = integrationScriptMissing
                        ? 'لا يوجد script تكاملي معلن وقابل للتشغيل لهذا المشروع'
                        : 'يحتاج ملف اختبار داخل مسار المشروع أو test_generator سابقاً؛ scripts العامة وحدها ليست دليلاً';
                    notes.push(`[plan] أسقطتُ «${desc}» — auto_tester من نوع ${requestedTestType} ${reason}.`);
                    continue;
                }
                if (sourceDependentTools.has(r.tool) && unprovenSource && !boundedRunnableRepair) {
                    notes.push(`[plan] أسقطتُ «${desc}» — ${r.tool} يحتاج ملفاً مصدرياً أنتجته مهمة سابقة أو سجّل الاستكشاف؛ «${unprovenSource}» غير مثبت، لذا لن أحوّل اسماً متخيلاً إلى إصلاح ذاتي.`);
                    continue;
                }
                const argsIssue = plannedArgsIssue(r.tool, adaptedArgs);
                const shellIssue = r.tool === 'shell_execute'
                    ? unprovenProjectCheckIssue(adaptedArgs?.command, candidateCheckCommands)
                    : null;
                if (argsIssue || shellIssue) {
                    const issue = argsIssue || shellIssue;
                    // A missing schema-required field is a hard plan-contract
                    // defect. It must not be disguised as an informational
                    // documentation phase when this was the only requested work.
                    if (argsIssue && /الحقل الإلزامي|واحداً من/.test(argsIssue)) {
                        hadHardContractDrop = true;
                        phaseBlockers.push({
                            code: 'tool_contract_invalid',
                            message: `المرحلة «${phaseName}» تحتوي ${r.tool} بعقد arguments ناقص: ${argsIssue}`,
                            remedy: 'أكمل جميع الحقول الإلزامية في خطة الأداة قبل التنفيذ؛ لا تُنشئ Joe مخرجاً بديلاً لإخفاء نقص العقد.',
                        });
                    }
                    notes.push(`[plan] أسقطتُ «${desc}» — ${issue}`);
                    continue;
                }
                if (r.how !== 'exact') notes.push(`[plan] «${asked}» → ${r.tool} (${desc})`);
                kept.push({ ...task, tool: r.tool, args: adaptedArgs });
                executableTasks++;
                continue;
            }
            const why = 'why' in r ? r.why : 'unknown';
            notes.push(why === 'not_software'
                ? `[plan] أسقطتُ «${desc}» — «${asked}» عمل تنظيمي بشري، لا شيء يبنيه جو هنا.`
                : `[plan] أسقطتُ «${desc}» — لا أداة اسمها «${asked}» في هذا النظام.`);
        }

        const runnable = kept.filter(t => String(t.tool || 'manual') !== 'manual');
        const nativeDependencyBlocker = phaseBlockers.find(blocker => blocker.code === 'unportable_native_dependency');
        if (nativeDependencyBlocker) {
            blockers.push(nativeDependencyBlocker);
            notes.push(`[plan] أوقفتُ المرحلة «${phaseName}» بعائق portability صريح: ${nativeDependencyBlocker.message}`);
            return {
                ...phase,
                tasks: [],
                verificationTask: undefined,
                deliveryStatus: 'blocked',
                blocker: nativeDependencyBlocker,
            };
        }
        if (phaseBlockers.length && (runnable.length === 0 || taskOutputPaths(kept).length === 0)) {
            const blocker = phaseBlockers[0];
            blockers.push(blocker);
            notes.push(`[plan] أوقفتُ المرحلة «${phaseName}» بعائق تخطيط صريح: ${blocker.message}`);
            return {
                ...phase,
                tasks: [],
                verificationTask: undefined,
                deliveryStatus: 'blocked',
                blocker,
            };
        }
        // A required-field contract failure is not an inspection-only phase and
        // must not be rewritten into a documentation artifact. Keep the phase
        // empty and expose the blocker so planner recovery can repair the plan.
        if (hadHardContractDrop && runnable.length === 0) {
            const blocker = phaseBlockers[0] || {
                code: 'tool_contract_invalid',
                message: `المرحلة «${phaseName}» فقدت حقلاً إلزامياً في عقد إحدى الأدوات.`,
                remedy: 'أكمل arguments المطلوبة قبل التنفيذ.',
            };
            blockers.push(blocker);
            notes.push(`[plan] أوقفتُ المرحلة «${phaseName}» — لن أحول نقص عقد الأداة إلى وثيقة fallback.`);
            return {
                ...phase,
                tasks: [],
                verificationTask: undefined,
                deliveryStatus: 'blocked',
                blocker,
            };
        }
        // Inspection-only work still needs an evidence artefact. Without one, a
        // planner can name a nonexistent source and turn a plan defect into repair.
        const hasConcreteDelivery = taskOutputPaths(kept).length > 0;
        if (runnable.length === 0 || !hasConcreteDelivery) {
            // Not a failure — a deliverable. Write the phase down instead of
            // pretending it ran, and instead of letting it stop the build.
            /**
             * write_file, not ai_write_file, and that is deliberate.
             *
             * The first live run of this fallback produced: «تعذّر الوصول إلى
             * محرّك الذكاء (لم يستجب أي مزوّد)» — the replacement for a failing
             * phase itself needed a model, so with no provider it failed too,
             * which is the same hole one layer down. Everything this document
             * should say is ALREADY KNOWN: the phase's name, its description,
             * its deliverables, and what was dropped from it. Writing what we
             * know needs nobody's permission and never fails.
             */
            const deliverables = Array.isArray(phase?.deliverables) ? phase.deliverables : [];
            const asked = tasks.map((t: any) => `- ${String(t?.task || t?.description || 'task')} (طُلبت أداة: ${String(t?.tool || '—')})`);
            kept.push({
                task: `Document «${phaseName}»`,
                tool: 'write_file',
                args: {
                    // the phase's OWN number, not its position — a plan that
                    // starts at phase 3 must not write a file called 01
                    path: `${dir}/docs/${String(Number(phase?.phaseNumber) || pi + 1).padStart(2, '0')}-${snake(phaseName) || 'phase'}.md`,
                    content: [
                        `# ${phaseName}`,
                        '',
                        String(phase?.description || '').trim(),
                        '',
                        '## ماذا كان مطلوباً في هذه المرحلة',
                        ...(asked.length ? asked : ['- (لا مهام)']),
                        '',
                        '## سجل التنفيذ والأدلة',
                        'هذه المرحلة لم تتضمن مخرجاً مسارياً مثبتاً يمكن التحقق منه، أو احتوت أدوات تعتمد على ملف مصدر غير مثبت.',
                        'لذلك سجّل Joe ما عرفه من المهام والقيود في هذا الملف الحتمي، بدلاً من ادّعاء أن ملفاً متخيلاً موجود أو بدء إصلاح ذاتي تخميني.',
                        '',
                        ...(deliverables.length ? ['## المخرجات المتوقّعة', ...deliverables.map((d: any) => `- ${String(d)}`)] : []),
                        '',
                    ].join('\n'),
                },
                priority: 'medium',
                realisticMinutes: 1,
            });
            executableTasks++;
            notes.push(`[plan] المرحلة «${phaseName}» لم يبق فيها عمل قابل للتنفيذ — حوّلتُها إلى وثيقة حقيقية بدل مرحلة فاشلة.`);
        }

        const phaseProducedPaths = taskOutputPaths(kept);
        phaseProducedPaths.forEach((candidate: string) => {
            producedPaths.add(candidate);
            generatedPaths.add(candidate);
        });
        for (const candidate of phaseProducedPaths) {
            if (/(?:^|\/)package\.json$/i.test(candidate)
                && generatedPackageLaunchEvidence(candidate, kept)) {
                generatedRunnableManifests.add(candidate);
            }
        }

        const v = phase?.verificationTask;
        let verification = v;
        if (v && v.tool) {
            const rv = resolvePlannedTool(v.tool);
            const verificationTool = rv.tool;
            // A verification task is an acceptance observation, never another
            // delivery action. In the first NEXUS run the planner used
            // doc_generator to "verify" an architecture by reading the invented
            // architecture_plan.md. That is neither a check nor a repairable
            // code defect: it is a plan contract violation. It entered the
            // repair loop as File not found and encouraged a speculative write.
            //
            // Prefer observing an explicit output of THIS phase. The path comes
            // from an earlier task in execution order, not from the model's
            // verification prose. If the phase has no named file output, inspect
            // the project instead of inventing one.
            const observedOutputPaths = phaseProducedPaths
                .map((candidate: string) => String(candidate || '').trim())
                .filter((candidate: string) => candidate && !candidate.startsWith('/') && !candidate.includes('..'));
            const observedOutputPath = observedOutputPaths[0];
            const runHasRunnableEvidence = [...producedPaths].some(runnableMarker);
            const generatesInsteadOfObserving = new Set([
                'doc_generator', 'test_generator', 'ai_write_file', 'write_file',
                'file_edit', 'file_edit_advanced', 'scaffold_project', 'react_project',
                'api_project', 'web_page_builder', 'scaffold_full_stack',
            ]);

            const rawVerificationArgs = { ...(v?.args || {}), ...(v?.input || {}) };
            const verificationArgs = verificationTool
                ? adaptPlannedArgs(verificationTool, rawVerificationArgs)
                : rawVerificationArgs;
            const requestedReadPath = String(
                verificationArgs?.path || verificationArgs?.filePath || verificationArgs?.sourceFile || ''
            ).trim().replace(/^\.\//, '');
            // A read is only evidence if it observes a file that this phase has
            // already produced.  Otherwise a model can name architecture.md in
            // the verification prose, get File not found, and wrongly turn a
            // plan-contract error into a speculative repair. Existing workspace
            // evidence belongs in an ordinary read task before the phase, not in
            // an acceptance check for a new phase deliverable.
            const readsUnprovenPhaseOutput = verificationTool === 'read_file'
                && !!requestedReadPath
                && !observedOutputPaths.some((candidate: string) => candidate.replace(/^\.\//, '') === requestedReadPath);
            const runsBeforeRunnableArtifact = verificationTool === 'project_run' && !runHasRunnableEvidence;
            const verificationTestType = norm(verificationArgs?.testType);
            const verificationProjectPath = verificationArgs?.projectPath || verificationArgs?.path || '';
            const verificationTestEvidenceCandidates = [...producedPaths, ...phaseProducedPaths, ...discoveredTestPaths];
            const verificationHasTestEvidence = verificationTestEvidenceCandidates.some(candidate =>
                looksLikeTestPath(normaliseEvidencePath(candidate))
                && pathWithinProject(candidate, verificationProjectPath)
            );
            const verificationNeedsTestEvidence = verificationTool === 'auto_tester'
                && (verificationTestType === 'unit' || verificationTestType === 'integration')
                && !verificationHasTestEvidence
                && !kept.some(task => String(task?.tool || '') === 'test_generator');
            const verificationNeedsIntegrationScript = verificationTool === 'auto_tester'
                && verificationTestType === 'integration'
                && !hasDeclaredIntegrationCheck;

            if (verificationNeedsTestEvidence || verificationNeedsIntegrationScript) {
                verification = undefined;
                const reason = verificationNeedsIntegrationScript
                    ? 'لا يوجد script تكاملي معلن وقابل للتشغيل لهذا المشروع'
                    : 'لا يوجد ملف اختبار مثبت داخل مسار المشروع أو test_generator سابق';
                notes.push(`[plan] أزلتُ تحقق auto_tester من نوع ${verificationTestType} غير المدعوم — ${reason}؛ لن أدّعي نجاح اختبار غير موجود.`);
            } else if (!verificationTool || generatesInsteadOfObserving.has(verificationTool) || readsUnprovenPhaseOutput || runsBeforeRunnableArtifact) {
                verification = observedOutputPath
                    ? {
                        task: `Verify phase output exists: ${observedOutputPath}`,
                        tool: 'read_file',
                        args: { path: observedOutputPath },
                    }
                    : {
                        task: 'Inspect phase output on disk',
                        tool: 'project_detect',
                        args: {},
                    };
                const reason = readsUnprovenPhaseOutput
                    ? 'تحققاً يقرأ ملفاً غير مثبت'
                    : runsBeforeRunnableArtifact
                        ? 'تشغيلاً حياً قبل إنتاج artifact قابل للتشغيل'
                        : 'تحققاً مولّداً';
                notes.push(observedOutputPath
                    ? `[plan] استبدلتُ ${reason} بقراءة المخرج المثبت «${observedOutputPath}»؛ التحقق يلاحظ الناتج ولا ينشئ أو يفترض ملفاً متخيلاً.`
                    : `[plan] استبدلتُ ${reason} بفحص المشروع؛ لا يوجد مخرج مساري مثبت في هذه المرحلة لأفحصه.`);
            } else {
                const verificationIssue = plannedArgsIssue(verificationTool, verificationArgs)
                    || (verificationTool === 'shell_execute'
                        ? unprovenProjectCheckIssue(verificationArgs?.command, candidateCheckCommands)
                        : null);
                verification = verificationIssue
                    ? { task: 'Inspect phase output on disk', tool: 'project_detect', args: {} }
                    : { ...v, tool: verificationTool, args: verificationArgs };
                if (verificationIssue) notes.push(`[plan] استبدلتُ مهمة تحقق غير مكتملة بفحص المشروع — ${verificationIssue}`);
            }
        }

        return { ...phase, tasks: kept, verificationTask: verification };
    });

    const sanitisedTasks = out.flatMap((phase: any) => Array.isArray(phase?.tasks) ? phase.tasks : []);
    const hasProjectRun = rawHasProjectRun
        || sanitisedTasks.some((task: any) => String(task?.tool || '') === 'project_run')
        || out.some((phase: any) => String(phase?.verificationTask?.tool || '') === 'project_run');
    const runnableCreationTools = new Set(['write_file', 'ai_write_file', 'scaffold_project', 'scaffold_full_stack', 'react_project', 'api_project', 'web_page_builder', 'mobile_builder']);
    if (options.repairMode === true) {
        // A live repair may legitimately patch an existing runnable artifact
        // instead of creating a second one. Keep the same path-level contract:
        // only edits that name package.json or a recognized entrypoint qualify.
        runnableCreationTools.add('file_edit');
        runnableCreationTools.add('file_edit_advanced');
    }
    const hasRunnableCreationTask = sanitisedTasks.some((task: any) => runnableCreationTools.has(String(task?.tool || '')) && (() => {
        const args = { ...(task?.args || {}), ...(task?.input || {}) };
        const paths = [args.path, args.filePath, args.filename, args.file, args.targetPath, ...(Array.isArray(args.files) ? args.files : [])]
            .map((value: any) => normaliseEvidencePath(value)).filter(Boolean);
        if (String(task?.tool || '') === 'scaffold_project') return !!args.structure && typeof args.structure === 'object' && Object.keys(args.structure).some((file: string) => isRunnableContractPath(file));
        if (['scaffold_full_stack', 'react_project', 'api_project', 'web_page_builder', 'mobile_builder'].includes(String(task?.tool || ''))) return true;
        return paths.some((file: string) => isRunnableContractPath(file));
    })());
    if (options.mode === 'greenfield' && (hasProjectRun || options.requireRunnableContract === true) && !hasRunnableCreationTask) {
        const blocker: PlanSanitiseBlocker = {
            code: 'missing_runnable_contract',
            message: 'الخطة تحتوي project_run لمساحة greenfield، لكنها لا تحتوي مهمة تنشئ package.json أو entrypoint قابلاً للتشغيل عبر أداة إنشاء مناسبة.',
            remedy: 'أضف مرحلة foundation صريحة تستخدم scaffold_project ببنية غير فارغة أو write_file/ai_write_file لإنشاء manifest وentrypoint، ثم ثبّت dependencies وشغّل المشروع بعد ذلك.',
        };
        blockers.push(blocker);
        notes.push(`[plan] أوقفتُ الخطة قبل live-run — ${blocker.message}`);
    }
    /**
     * A GREENFIELD BUILD LIVES IN ITS OWN DIRECTORY — NEVER IN THE WORKSPACE ROOT.
     *
     * Measured on the MyBudget field run: the planner emitted bare paths —
     * `src/main.ts`, `config/config.ts`, `tests/main.test.ts`, `deploy.sh` —
     * and every write tool resolves relative to the ACTIVE WORKSPACE ROOT, so
     * ten loose files and finally a package.json landed in `my-workspace/`
     * itself, beside twenty-four real projects. Discovery then read the whole
     * workspace as one ambiguous artifact, and the run ended with «no runnable
     * project named mybudget was found» — because the project was never given
     * a directory to exist in.
     *
     * The test for what to prefix is a SHAPE, not a domain: a path whose first
     * segment is project-internal layout (src, tests, config, public…) or a
     * bare root-level file is project furniture and moves inside the project's
     * own directory. A path that already starts with a bespoke folder name is
     * an intentional location and is left alone. Runs after the runnable
     * contract was judged, so this changes WHERE the plan writes, never
     * WHETHER it was accepted.
     */
    if (String(options.mode || '') === 'greenfield') {
        const WRITE_TOOLS = new Set(['ai_write_file', 'write_file', 'file_edit', 'file_edit_advanced', 'doc_generator', 'test_generator']);
        const INTERNAL_SEGMENTS = new Set(['src', 'test', 'tests', '__tests__', 'config', 'public', 'dist', 'build',
            'scripts', 'docs', 'lib', 'app', 'components', 'styles', 'assets', 'server', 'api', 'db', 'data', 'migrations']);
        let moved = 0;
        const prefixPath = (raw: unknown): string | null => {
            const p = normaliseEvidencePath(raw);
            if (!p || p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('..')) return null;
            if (p === dir || p.startsWith(`${dir}/`)) return null;
            const first = p.split('/')[0];
            if (p.includes('/') && !INTERNAL_SEGMENTS.has(first.toLowerCase())) return null;
            return `${dir}/${p}`;
        };
        for (const phase of out) {
            const everyTask = [...(Array.isArray(phase?.tasks) ? phase.tasks : []),
                ...(phase?.verificationTask ? [phase.verificationTask] : [])];
            for (const task of everyTask) {
                if (!WRITE_TOOLS.has(String(task?.tool || ''))) continue;
                const args = task.args || task.input || {};
                for (const key of ['path', 'filename', 'filePath'] as const) {
                    const next = prefixPath(args[key]);
                    if (next) { args[key] = next; moved++; }
                }
            }
        }
        if (moved) notes.push(`[plan] وجّهتُ ${moved} ملفاً إلى مجلد المشروع «${dir}/» — بناء جديد لا يكتب في جذر مساحة العمل نفسه.`);
    }
    return { phases: stampPlanDependencies(out, notes), notes, executableTasks, ...(blockers[0] ? { blocker: blockers[0] } : {}) };
}

/**
 * THE HYBRID CONTRACT: THE PLANNER DECIDES WHAT, THE PLAN ENFORCES WHEN.
 *
 * A model is a fine judge of whether a request needs a data service at all —
 * a static page plainly does not, and a UI on someone else's API must not
 * have a new server forced onto it. But once it HAS decided that this project
 * gets both a service and an interface, the order between them stops being a
 * matter of judgement: an interface that reads rows cannot be built and
 * verified before the thing that serves them exists.
 *
 * That guarantee used to live in a deterministic route which named
 * `api_project` then `react_project` with an explicit `dependsOn`. When the
 * route was replaced by an LLM planner the ordering went with it — a live
 * harness caught it immediately («…and an app with data gets its backend
 * BEFORE its interface»).
 *
 * So the decision stays with the planner and the RELATION is stamped here,
 * on whatever plan arrives. Nothing is added, nothing is invented: if there
 * is no data phase, or no interface phase, this does nothing at all.
 */
const DATA_PHASE_TOOLS = new Set(['api_project']);
const INTERFACE_PHASE_TOOLS = new Set(['react_project', 'web_page_builder']);

export function stampPlanDependencies(phases: any[], notes: string[] = []): any[] {
    const list = Array.isArray(phases) ? phases : [];
    const toolsOf = (phase: any): string[] =>
        (Array.isArray(phase?.tasks) ? phase.tasks : []).map((task: any) => String(task?.tool || ''));

    const dataIndex = list.findIndex(phase => toolsOf(phase).some(tool => DATA_PHASE_TOOLS.has(tool)));
    const interfaceIndex = list.findIndex(phase => toolsOf(phase).some(tool => INTERFACE_PHASE_TOOLS.has(tool)));
    // Only one of them present — the plan implies no relation to enforce.
    if (dataIndex < 0 || interfaceIndex < 0 || dataIndex === interfaceIndex) return list;

    const dataName = String(list[dataIndex]?.name || `Phase ${dataIndex + 1}`);
    const ordered = dataIndex < interfaceIndex
        ? list
        // The interface was planned first. Move the service ahead of it rather
        // than rewriting either phase — the planner's content is untouched.
        : (() => {
            const copy = [...list];
            const [service] = copy.splice(dataIndex, 1);
            copy.splice(interfaceIndex, 0, service);
            notes.push(`[plan] the data service «${dataName}» was moved ahead of the interface that depends on it`);
            return copy;
        })();

    return ordered.map(phase => {
        if (!toolsOf(phase).some(tool => INTERFACE_PHASE_TOOLS.has(tool))) return phase;
        const already = Array.isArray(phase?.dependsOn) ? phase.dependsOn.map(String) : [];
        if (already.includes(dataName)) return phase;
        return { ...phase, dependsOn: [...already, dataName] };
    });

}

/**
 * THE ARGUMENTS WERE WRITTEN FOR A TOOL THAT DOES NOT EXIST.
 *
 * Renaming «Git» to git_ops is only half the repair. The plan that said "Git"
 * also invented its arguments, and the first live run of the fix showed it
 * immediately:
 *
 *   [PhaseExecutor] ↪️ «Git» تعني git_ops
 *   [PhaseExecutor] ❌ Task 1 failed: git_ops — git: 'undefined' is not a git command
 *
 * The plan said `{ action: 'status' }`; git_ops takes `operation`. Nobody was
 * wrong about the intent and everybody was wrong about the spelling.
 *
 * So: rename the words models actually use into the words the tool declares,
 * and fill a required field that is still missing with the safest real value.
 * Nothing is deleted — an unknown extra key is harmless, a missing required one
 * is fatal.
 */
const ARG_SYNONYMS: Record<string, string[]> = {
    operation: ['action', 'op', 'subcommand', 'verb'],
    command: ['cmd', 'script', 'shell', 'run', 'commandLine'],
    path: ['file', 'filename', 'filePath', 'target', 'dest', 'destination'],
    filePath: ['file', 'filename', 'path', 'target', 'sourceFile'],
    content: ['text', 'body', 'data', 'source'],
    description: ['prompt', 'instruction', 'details', 'spec'],
    baseDir: ['dir', 'directory', 'folder', 'projectDir'],
    projectDescription: ['description', 'request', 'goal'],
    url: ['link', 'href', 'address'],
    packages: ['dependencies', 'deps', 'modules'],
    testType: ['type', 'test', 'testTypeName', 'test_type', 'testKind'],
    projectPath: ['path', 'cwd', 'dir', 'directory', 'projectDir', 'root'],
    name: ['projectName', 'appName', 'applicationName'],
};

/** When a required field is still missing, the least surprising real value. */
const REQUIRED_DEFAULTS: Record<string, Record<string, any>> = {
    git_ops: { operation: 'status' },
    npm_manager: { operation: 'install' },
    shell_execute: { command: 'npm run build' },
};

/**
 * AN AUDIT WITH NO ADDRESS AUDITS WHAT THIS SESSION JUST BUILT.
 *
 * «كوالتي تاسكس لا تعمل بشكل صحيح» — and it could not: the Quality phase was
 * planned as `browser_ui_audit` with `args: {}`, so the very first thing the
 * tool did was answer `no_url`. Every system build ended at 2/3 for that one
 * missing string, and the self-repair that followed sent a browser agent off
 * to «generate a URL» on the open web.
 *
 * The interface built moments earlier is already served, live, at this
 * session's own preview route. That is the address, and it is knowable without
 * asking anybody.
 */
export function builtPreviewUrl(sessionId: string): string {
    const key = String(sessionId || '').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!key) return '';
    try {
        const entry = ((global as any).joeProjects || {})[key];
        if (!entry?.dir) return '';
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require('path');
        // A running project_run server is the strongest live evidence. The
        // quality phase must audit the real app (including its API), not fail
        // merely because this run did not produce a static dist/ bundle.
        const liveUrl = String(entry.live?.url || '').trim();
        if (/^https?:\/\//i.test(liveUrl)) return liveUrl;
        // dist/ is the static preview fallback when no live server was kept.
        if (!fs.existsSync(path.join(entry.dir, 'dist', 'index.html'))) return '';
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { publicUrlFor } = require('../../shared/utils/publicUrl');
        return publicUrlFor(`/project-preview/${key}/index.html?v=${Date.now()}`);
    } catch { return ''; }
}

/** How long a builder's in-browser audit stands for the app it measured. */
export const FRESH_AUDIT_MS = 10 * 60_000;

/** Did the builder already audit this session's app in a real browser, recently? */
export function hasFreshBuilderAudit(sessionId: string): boolean {
    const key = String(sessionId || '').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!key) return false;
    const at = Number(((global as any).joeProjects || {})[key]?.lastAudit?.at || 0);
    return at > 0 && (Date.now() - at) < FRESH_AUDIT_MS;
}

/**
 * WHY there is no address — because `no_url` explains nothing.
 *
 * From his own machine: `❌ Quality (tasks: 0/1) — Error: no_url`, while the
 * app was being served at that session's preview route at that very second.
 * Three different failures print that same word, and the one line that could
 * have told us which was which said nothing at all.
 */
export function whyNoBuiltUrl(sessionId: string): string {
    const key = String(sessionId || '').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!key) return 'no_url: لا معرّف جلسة مع الطلب — لا أعرف أيّ مشروع أفحص.';
    const entry = ((global as any).joeProjects || {})[key];
    if (!entry?.dir) return `no_url: لا مشروع مبنيّ مسجّل لهذه الجلسة (${key}) — ابنِ أولاً ثم افحص.`;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require('path');
        const liveUrl = String(entry.live?.url || '').trim();
        if (/^https?:\/\//i.test(liveUrl)) return 'no_url: تعذّر استخدام عنوان الخادم الحي رغم أن المشروع سجّله.';
        const dist = path.join(String(entry.dir), 'dist', 'index.html');
        if (!fs.existsSync(dist)) return `no_url: المشروع مسجّل في ${entry.dir} لكن لا يوجد dist/index.html ولا خادم حي مسجّل — البناء أو التشغيل لم يكتمل.`;
    } catch (e: any) {
        return `no_url: تعذّر فحص مجلّد المشروع — ${e?.message || e}`;
    }
    return 'no_url: العنوان تعذّر تكوينه رغم وجود البناء.';
}

/** The browser tools that audit or read a page and cannot invent their own address. */
const NEEDS_BUILT_URL = new Set(['browser_ui_audit', 'browser_screenshot', 'browser_extract', 'browser_open']);

// These fields are injected by the trusted execution/session context after the
// plan is accepted. They are required by runtime schemas, but must not block a
// valid plan at sanitisation time; PlanningEngine.fillRequiredArgs uses the same
// contract. Business arguments (for example browser_run instructionText/actions)
// remain planner-required and are validated above.
const RUNTIME_SUPPLIED_PLAN_FIELDS = new Set([
    'sessionId', 'userId', 'workspaceId', 'context', '__userId', '__workspaceId',
]);

/**
 * Validate model-written arguments that use a closed action vocabulary.
 *
 * This is deliberately separate from JSON-schema validation: plans can be
 * loaded from old sessions or repair tickets and must be rejected before any
 * side-effecting tool executes.  The return value is a user-facing reason, not
 * a silent coercion; we never guess a migration operation from prose.
 */
export function plannedArgsIssue(toolName: string, args: any): string | null {
    /**
     * requiredAny is a real alternative-required contract, not documentation.
     * Validate it here as well as in PlanningEngine so plans loaded from old
     * sessions, repair reruns, and direct PhaseExecutor calls cannot send an
     * unusable task to a tool.  This check is intentionally generic: the
     * registry schema, not a search_text-specific branch, defines the aliases.
     */
    if (toolName === 'browser_run') {
        const instruction = String(args?.instructionText || '').trim();
        const actions = Array.isArray(args?.actions) ? args.actions.filter(Boolean) : [];
        if (!instruction && actions.length === 0) {
            return 'browser_run يحتاج instructionText أو actions غير فارغة؛ لم تُحدّد الخطة هدفاً أو إجراءً قابلاً للتنفيذ، لذلك أُوقفت قبل فتح المتصفح.';
        }
    }
    if (toolName === 'scaffold_project') {
        const structure = args?.structure;
        if (!structure || typeof structure !== 'object' || Array.isArray(structure) || Object.keys(structure).length === 0) {
            return 'scaffold_project يحتاج structure كائناً غير فارغاً يحدد مسارات الملفات والمجلدات؛ لم تُحدّد الخطة بنية قابلة للتنفيذ، لذلك أُوقفت قبل الكتابة.';
        }
    }
    if (toolName === 'npm_manager' && !String(args?.command || '').trim()) {
        return 'npm_manager يحتاج command صالحاً مثل «install» أو «run test»؛ لم تُحدّد الخطة أمراً، لذلك أُسقطت المهمة قبل التنفيذ.';
    }
    if (toolName === 'db_schema_migrator') {
        const action = norm(args?.action);
        const supported = ['migrate', 'push', 'reset', 'status'];
        if (!supported.includes(action)) {
            return `db_schema_migrator يحتاج action واحداً من ${supported.join(', ')}، لكن الخطة طلبت «${action || 'مفقود'}». يلزم إثبات محرك ومخطط البيانات قبل تشغيل هجرة.`;
        }
    }
    // DocumentationGeneratorTool can only transform an existing source file.
    // A model-written phase that says “document the project” without naming a
    // source file is not a file-not-found incident: it is an incomplete plan.
    // Reject it before execution so the recovery loop never fabricates a file
    // merely to satisfy an undefined path.
    if (toolName === 'doc_generator' && !String(args?.filePath || '').trim()) {
        return 'doc_generator يحتاج filePath لملف مصدر موجود ومثبت في الأدلة؛ لم تُحدّد الخطة ملفاً للتوثيق، لذلك أُسقطت المهمة قبل التنفيذ.';
    }
    // ai_write_file is a source-generation contract, not a vague instruction to
    // “write code”.  It must name exactly one relative destination and explain
    // the expected contents before the model is called.  Without both fields,
    // execution would only create a false code defect and trigger self-healing.
    if (toolName === 'ai_write_file') {
        const target = String(args?.path || '').trim();
        const brief = String(args?.description || '').trim();
        if (!target || !brief) {
            return 'ai_write_file يحتاج path نسبياً وdescription يوضح محتوى الملف؛ لم تُحدد الخطة عقد إنشاء مصدر مكتمل، لذلك أُسقطت المهمة قبل التنفيذ.';
        }
        if (isShellLikeWorkspacePath(target)) {
            return 'ai_write_file يحتاج مسار ملف واحداً؛ رفضتُ قيمة تبدو كأمر shell مثل node/npm قبل أي كتابة.';
        }
        if (target.startsWith('/') || target.includes('..')) {
            return 'ai_write_file يحتاج path نسبياً داخل مساحة العمل؛ رفضتُ مساراً قد يخرج من المشروع قبل أي كتابة.';
        }
    }
    // test_generator reads a real source file before it writes the matching test.
    // A phase-level request such as “test the console” is not an executable test
    // contract: without filePath the tool can only ask fs to read `undefined`,
    // then a planner mistakenly treats the resulting input error as a code bug.
    if (toolName === 'test_generator') {
        const source = String(args?.filePath || '').trim();
        if (!source || /^undefined$/i.test(source)) {
            return 'test_generator يحتاج filePath لملف مصدر محدد؛ لم تُثبت الخطة الملف المراد اختباره، لذلك أُسقطت المهمة قبل التنفيذ.';
        }
    }
    // CodeReviewerTool requires a concrete array. A phase-level phrase such as
    // “review quality” contains no reviewable evidence and must not turn into a
    // runtime exception or a speculative recovery loop.
    if (toolName === 'code_reviewer') {
        const files = Array.isArray(args?.files)
            ? args.files.map((value: any) => String(value || '').trim()).filter(Boolean)
            : [];
        if (files.length === 0 || files.some((file: string) => /^undefined$/i.test(file))) {
            return 'code_reviewer يحتاج files كمصفوفة لمسارات ملفات مصدر مثبتة؛ لم تحدد الخطة ما الذي سيُراجع، لذلك أُسقطت المهمة قبل التنفيذ.';
        }
    }
    // auto_tester has a closed test vocabulary.  A vague planned task such as
    // “run tests” must never reach the tool as `undefined`, because that is a
    // plan-contract defect rather than an executable verification result.
    if (toolName === 'auto_tester') {
        const testType = norm(args?.testType);
        const supported = ['syntax', 'build', 'unit', 'integration'];
        if (!supported.includes(testType)) {
            return `auto_tester يحتاج testType واحداً من ${supported.join(', ')}؛ لكن الخطة طلبت «${testType || 'مفقود'}».`;
        }
        const projectPath = String(args?.projectPath || '').trim();
        if (!projectPath || projectPath === 'undefined') {
            return 'auto_tester يحتاج projectPath نسبياً داخل مساحة العمل؛ لا يجوز أن يفترض جذر عملية Joe كأنه المشروع.';
        }
        if (testType === 'syntax') {
            const files = Array.isArray(args?.files)
                ? args.files.map((value: any) => String(value || '').trim()).filter(Boolean)
                : [];
            if (files.length === 0 || files.some((file: string) => /^undefined$/i.test(file))) {
                return 'auto_tester من نوع syntax يحتاج files كمصفوفة لمسارات مصدر مثبتة؛ لا يفحص جو مساحةً مجهولة أو ملفاً متخيلاً.';
            }
            const unsupported = files.filter((file: string) => syntaxFileKind(file) === null);
            if (unsupported.length > 0) {
                return `auto_tester من نوع syntax يدعم JavaScript/TypeScript وJSON فقط؛ استخدم مدققاً متخصصاً للملفات: ${unsupported.join(', ')}.`;
            }
        }
    }
    // browser_ui_audit has a deliberate runtime URL contract: when the builder
    // has already produced a preview, or when the audit is invoked inside a Joe
    // session, BrowserUiAuditTool resolves the URL from session context (and can
    // reuse a fresh builder audit). Requiring `url` in the model-written plan
    // would reject that valid execution path before the runtime can resolve it.
    // This exception is tool-specific and does not weaken browser_run or any
    // business/data tool's required-field contract.
    if (toolName === 'browser_ui_audit' && !String(args?.url || '').trim()) return null;

    // Apply the live registry's generic required-field contract only after
    // tool-specific validators. This preserves precise, established messages
    // (for example npm_manager's command and code_reviewer's files) while still
    // blocking newly registered tools such as auth_builder when a required field
    // is absent. The schema remains the source of truth; no tool is hard-coded.
    try {
        const { tools } = require('../../modules/tools/registry');
        const schema = (tools || []).find((candidate: any) => candidate?.name === toolName)?.inputSchema;
        const required: string[] = Array.isArray(schema?.required)
            ? schema.required.map(String)
            : [];
        const requiredAny: string[][] = Array.isArray(schema?.requiredAny)
            ? schema.requiredAny.filter((group: any) => Array.isArray(group) && group.length).map((group: any[]) => group.map(String))
            : [];
        const hasValue = (key: string) => {
            if (RUNTIME_SUPPLIED_PLAN_FIELDS.has(key)) return true;
            const value = args?.[key];
            return value !== undefined && value !== null && !(typeof value === 'string' && !value.trim()) && !(Array.isArray(value) && value.length === 0);
        };
        const missingRequired = required.find(key => !hasValue(key));
        if (missingRequired) {
            return `${toolName} يحتاج الحقل الإلزامي «${missingRequired}»؛ لم تُحدّد الخطة قيمة صالحة له، لذلك أُوقفت المهمة قبل التنفيذ.`;
        }
        const missingGroup = requiredAny.find(group => !group.some(hasValue));
        if (missingGroup) {
            return `${toolName} يحتاج واحداً من ${missingGroup.join(' أو ')}؛ لم تُحدّد الخطة قيمة صالحة لأي بديل، لذلك أُوقفت المهمة قبل التنفيذ.`;
        }
    } catch {
        // The registry can be mid-initialisation in isolated tests; specific
        // deterministic checks above still run and the executor remains safe.
    }
    return null;
}

/** Normalise only spacing for a strict, manifest-backed command comparison. */
export function normaliseShellCommand(command: unknown): string {
    return String(command || '').trim().replace(/\s+/g, ' ');
}

/**
 * A raw package-script command is executable only when discovery proved that
 * exact command exists in the selected project.  In a greenfield workspace,
 * `npm test` is not a test: it is an unsupported assumption that cannot verify
 * the files the plan has just produced.
 */
export function unprovenProjectCheckIssue(command: unknown, declaredChecks: Set<string>): string | null {
    const normalised = normaliseShellCommand(command);
    if (!/^(?:npm\s+(?:run\s+)?(?:test|build|lint|typecheck)|pnpm\s+(?:run\s+)?(?:test|build|lint|typecheck)|yarn\s+(?:test|build|lint|typecheck))(?:\s|$)/i.test(normalised)) return null;
    if (declaredChecks.has(normalised)) return null;
    return `أمر «${normalised}» ليس فحصاً معلناً في ملفات المشروع التي استكشفها Joe؛ لن يُشغَّل npm بافتراض وجود package.json أو script.`;
}

export function adaptPlannedArgs(toolName: string, args: any): any {
    const out: any = { ...(args || {}) };
    if (NEEDS_BUILT_URL.has(toolName) && !String(out.url || '').trim()) {
        const sid = out.sessionId || (args || {}).sessionId || '';
        // …unless the builder ALREADY audited this app in a real browser
        // moments ago. Filling in the address here is what sent the Quality
        // phase to open a second browser over a page that had just been
        // measured — «يشغل المتصفح دون فائدة». Left empty, the audit tool
        // reports the builder's own findings instead of re-opening anything.
        if (!(toolName === 'browser_ui_audit' && hasFreshBuilderAudit(sid))) {
            const url = builtPreviewUrl(sid);
            if (url) out.url = url;
        }
    }
    let schema: any = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { tools } = require('../../modules/tools/registry');
        schema = (tools || []).find((t: any) => t.name === toolName)?.inputSchema;
    } catch { /* registry mid-initialisation — leave the args as written */ }
    if (!schema?.properties) return out;

    for (const [want, saidInstead] of Object.entries(ARG_SYNONYMS)) {
        if (!(want in schema.properties)) continue;
        if (out[want] !== undefined && out[want] !== null && out[want] !== '') continue;
        for (const alt of saidInstead) {
            if (out[alt] !== undefined && out[alt] !== null && out[alt] !== '') { out[want] = out[alt]; break; }
        }
    }

    for (const req of (schema.required || [])) {
        if (out[req] === undefined || out[req] === null || out[req] === '') {
            const d = REQUIRED_DEFAULTS[toolName]?.[req];
            if (d !== undefined) out[req] = d;
        }
    }
    return out;
}

/**
 * Adapt a plan's arguments and fill only schema-defined semantic fields that
 * can be derived from the task sentence. This is shared by the planner,
 * PhaseExecutor, and repair reruns so an old plan cannot bypass the same
 * contract simply by entering through a different path.
 */
export function adaptPlannedArgsFromDescription(toolName: string, args: any, description: string): any {
    let out = adaptPlannedArgs(toolName, args);
    // A phase task often carries the browser intent in its human-readable
    // description while the model leaves `args` empty.  BrowserRunTool rightly
    // rejects a direct empty call; the plan adapter is the safe upstream place
    // to carry the already-declared task into its executable contract.  Do not
    // invent navigation or actions, and keep genuinely empty tasks invalid.
    if (toolName === 'browser_run') {
        const instruction = String(out?.instructionText || '').trim();
        const actions = Array.isArray(out?.actions) ? out.actions.filter(Boolean) : [];
        const taskDescription = String(description || '').trim();
        const genericDescription = /^(?:task\s+\d+|execute task)$/i.test(taskDescription);
        if (!instruction && actions.length === 0 && taskDescription && !genericDescription) {
            out.instructionText = taskDescription;
        }
    }
    try {
        const { tools } = require('../../modules/tools/registry');
        const definition = (tools || []).find((candidate: any) => candidate?.name === toolName);
        const schema = definition?.inputSchema || {};
        const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
        const requiredAny = Array.isArray(schema.requiredAny)
            ? schema.requiredAny.filter((group: any) => Array.isArray(group) && group.length).flat().map(String)
            : [];
        const needed = new Set([...required, ...requiredAny]);
        if (!needed.size) return out;
        const inferred = inferRequiredPlanArgs(schema, description);
        if (!inferred) return out;
        for (const key of needed) {
            const current = out?.[key];
            const missing = current === undefined || current === null || (typeof current === 'string' && !current.trim());
            if (missing && inferred[key] !== undefined) out[key] = inferred[key];
        }
        return adaptPlannedArgs(toolName, out);
    } catch {
        return out;
    }
}

/**
 * A STEP THAT CANNOT POSSIBLY WORK ON THIS MACHINE.
 *
 * From the same field log, after the plan died:
 *
 *   exec: git --version   →  exit=0
 *   exec=sudo apt-get install git -y  blocked=1
 *   ERROR: command_not_allowed
 *   ⚠️ Stopped at step "Install Git if it is not installed" — command_not_allowed
 *
 * The repair planner checked that git works, was told it works, and then tried
 * to install it — with a Linux package manager, on Windows, using sudo, which
 * the command allowlist correctly refuses. Three impossibilities in one line,
 * and the run ended on it.
 *
 * The allowlist was right to block it. What was missing is anyone noticing
 * BEFORE the attempt, so a step nobody could ever run is skipped instead of
 * retried until the run gives up.
 *
 * Returns a reason when the command cannot run here, or null when it can.
 */
export function unrunnableShellStep(command: any): string | null {
    const cmd = String(command || '').trim();
    if (!cmd) return null;
    const c = cmd.toLowerCase();
    const isWin = process.platform === 'win32';

    if (/(^|\s|&&|;|\|)sudo\s/.test(c)) {
        return 'sudo لا يعمل هنا (ولا يُسمح به) — تخطّيت الخطوة بدل تكرار محاولة مستحيلة.';
    }
    if (isWin && /(^|\s|&&|;|\|)(apt-get|apt|yum|dnf|pacman|zypper|snap|brew)\s/.test(c)) {
        return 'هذا مدير حزم لينكس/ماك والجهاز يعمل على ويندوز — الخطوة مستحيلة أصلاً.';
    }
    if (!isWin && /(^|\s|&&|;|\|)(choco|winget|scoop)\s/.test(c)) {
        return 'هذا مدير حزم ويندوز والجهاز ليس ويندوز — الخطوة مستحيلة أصلاً.';
    }

    // Installing something that is already on PATH.
    const m = c.match(/\b(?:apt-get|apt|yum|dnf|pacman|brew|choco|winget|scoop)\s+(?:-\S+\s+)*(?:install|add|-S)\s+(?:-\S+\s+)*([a-z0-9._+-]+)/);
    if (m && hasBinary(m[1])) {
        return `«${m[1]}» مثبَّت على الجهاز فعلاً — لا معنى لتثبيته من جديد.`;
    }
    return null;
}

/** Is this executable on PATH? Pure filesystem — no process is spawned to ask. */
export function hasBinary(name: string): boolean {
    return findBinary(name) !== null;
}

/**
 * WHERE that binary is — the full path, or null.
 *
 * `hasBinary` answers yes/no, which is enough to reject a plan step and not
 * enough to LAUNCH something: spawn resolves a bare name through PATH again,
 * and when that lookup fails it does not throw — it kills the process that
 * asked. Anything Joe spawns detached is resolved here first, so «not found»
 * is an answer instead of a corpse.
 */
export function findBinary(name: string): string | null {
    const bin = String(name || '').trim();
    if (!bin) return null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    // An absolute or relative path is not a PATH lookup at all.
    if (bin.includes('/') || bin.includes('\\')) {
        try { return fs.existsSync(bin) ? bin : null; } catch { return null; }
    }
    const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
    const exts = process.platform === 'win32'
        ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean)
        : [''];
    for (const dir of dirs) {
        for (const ext of exts) {
            const full = path.join(dir, bin + ext);
            try { if (fs.existsSync(full)) return full; } catch { /* unreadable PATH entry */ }
        }
    }
    return null;
}

/** The vocabulary block the planner prompt carries. */
export function plannerToolPrompt(): string {
    const lines = PLANNER_TOOL_CATALOGUE.map(t => `- ${t.tool}: ${t.purpose}`).join('\n');
    return [
        'AVAILABLE TOOLS — the ONLY values allowed in a task\'s "tool" field.',
        'Use the exact name. Never invent a name. Never name a product (Git, Jira, Docker) —',
        'name the tool. If a step needs no tool, use "manual".',
        '',
        lines,
        '',
        'Contract rules: every tool must receive the exact business args required by its implementation. Runtime context fields such as sessionId, userId, workspaceId, context, __userId, and __workspaceId are injected by the trusted executor and must not be invented in the plan; browser_run still needs instructionText or non-empty actions, and every other tool-specific business field remains mandatory. For scaffold_project, args.structure must be a non-empty object whose keys are safe workspace-relative file or directory paths and whose values are file contents or null for directories; args.baseDir names the project directory (projectName is an accepted alias); after scaffolding, project_run must use the registered project identity and a live URL must be proven. Do not use scaffold_project when the request has no explicit or evidence-backed stack — use exact file-level tools or stop honestly.',
        'scaffold_project FEW-SHOT PATTERN (learn the contract; do not copy this fixed app):',
        '{',
        '  "tool": "scaffold_project",',
        '  "args": {',
        '    "baseDir": "my-app",',
        '    "structure": {',
        '      "package.json": "{\\"name\\":\\"my-app\\",\\"version\\":\\"1.0.0\\",\\"scripts\\":{\\"start\\":\\"node src/index.js\\"}}",',
        '      "src/index.js": "const http = require(\\"http\\");\\nconst server = http.createServer((req, res) => { res.end(\\"Hello\\"); });\\nserver.listen(3000);",',
        '      "README.md": "# My App"',
        '    }',
        '  }',
        '}',
        'The important pattern is a non-empty structure with real source/config/test files, a runnable package/config, and exact workspace-relative paths under the named baseDir. A README, TXT note, or empty directory alone is not an implementation artifact. Adapt the paths and contents to the evidence-backed stack and user requirements; never return this example as a substitute for analysis.',
        '',
        'This system writes software. It cannot open tickets, book meetings, hire people,',
        'or use Jira/Trello/Slack/Figma. Do not plan steps that need a human organisation.',
    ].join('\n');
}
