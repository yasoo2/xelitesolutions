/**
 * A PLAN MAY ONLY NAME TOOLS THAT EXIST.
 *
 * The field log that produced this file:
 *
 *   [PhaseExecutor] Task 1/2: "Create project repository" ظ¤ executing tool: Git
 *   [PhaseExecutor] ظإî Task 1 failed: Git ظ¤ unknown_tool: "Git"
 *   [PhaseExecutor] Task 2/2: "Set up project management board" ظ¤ executing tool: Jira
 *   [PhaseExecutor] ظإî Task 2 failed: Jira ظ¤ unknown_tool: "Jira"
 *   ظؤ¤ ┘┘à ┘è┘╪ش╪ص ╪د┘╪ح╪╡┘╪د╪ص ╪د┘╪░╪د╪ز┘è ظ¤ ╪ث╪ز┘ê┘é┘ ╪ذ╪╡╪»┘é ╪╣┘╪» 0/8 ┘à╪▒╪د╪ص┘
 *
 * An eight-phase e-commerce build died on its first two tasks because the
 * planner asked a language model, in effect, "what would a senior project
 * manager do?" ظ¤ and never told it what this machine can actually do. The
 * model answered like a manager: open a repository in Git, open a board in
 * Jira. Both perfectly sensible. Neither is a tool that exists here, and
 * "Jira" is not a thing Joe will ever have, because Joe writes software, it
 * does not staff a department.
 *
 * The repo already forbids this in code ظ¤ an alias that points at nothing
 * fails the build (wiring-policy). The same law now covers what a MODEL
 * writes, because a plan is code the system is about to run.
 *
 * Three defences, in order:
 *   1. the planner is TOLD the vocabulary, so it rarely invents one
 *   2. whatever it returns is SNAPPED onto a real tool where a real
 *      equivalent exists ("Git" is git_ops; "npm install" is npm_manager)
 *   3. what cannot be snapped is DROPPED with a written reason, never
 *      executed and never allowed to fail a phase ظ¤ a task nobody can
 *      perform is not a failure of the build, it is a defect of the plan
 */
import { TOOL_ALIASES } from '../../modules/services/ToolService';
import { syntaxFileKind } from '../../shared/syntax-contract';
import { isVerificationTool } from '../quality/verification-ledger';

/**
 * Runtime-bound fields are the small, explicit exception to the planner's
 * strict schema contract. They may be omitted only while a prior task proves
 * the artifact root; PhaseExecutor supplies the trusted value later. Keep
 * this registry tool-specific so a new tool never inherits permissiveness by
 * accident.
 */
export const LATE_BOUND_PLAN_FIELDS: Record<string, readonly string[]> = {
    quality_run: ['path'],
    deploy_project: ['projectPath'],
    inspect_api: ['apiId'],
    validate_api: ['apiId'],
};

/**
 * The registry is read LAZILY and cached.
 *
 * registry ظْ tool definitions ظْ PhaseExecutorTool ظْ this file ظْ registry is a
 * cycle. Reading `tools` at module load worked under Jest's module graph and
 * threw ┬سCannot access 'tools' before initialization┬╗ the first time the real
 * process loaded it ظ¤ caught by the live proof, which is the only reason this
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
    { tool: 'decide_capability_route', purpose: 'make a read-only, inspectable least-setup local-versus-external capability decision before a provider is selected; never connects accounts, uses keys, pays, deploys, or mutates a workspace' },
    { tool: 'search_public_apis', purpose: 'search and deterministically rank cataloged public APIs for an external-data capability; use before choosing an API' },
    { tool: 'inspect_api', purpose: 'inspect auth, HTTPS, CORS, pricing, source, and cached health metadata for one discovered API' },
    { tool: 'validate_api', purpose: 'perform a bounded read-only SSRF-protected health check for one catalog API before integration' },
    { tool: 'web_page_builder', purpose: 'build a complete website/landing page' },
    { tool: 'ai_write_file', purpose: 'write one source file whose content must be generated' },
    { tool: 'write_file', purpose: 'write one file with content you already know exactly' },
    { tool: 'file_edit', purpose: 'change part of one existing file; REQUIRED args.filename is one safe workspace-relative file path, args.find is non-empty text to find, and args.replace is the replacement text; never invent a path' },
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
    { tool: 'db_schema_migrator', purpose: 'execute an existing database schema file or SQL migration; action is REQUIRED and must be exactly migrate, push, reset, or status. Use engine sqlite for an existing .sql migration (execute it against SQLite, never pass it to Prisma); use engine prisma only for an existing .prisma schema. This tool does not create or design schemas; do not use create, design, or generate as an actionظ¤write and verify the schema or SQL file first.' },
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
 * a capability Joe is missing ظ¤ it is a step that does not belong in a build,
 * and pretending otherwise is how ┬س0/8 phases┬╗ happens.
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
/** ┬سSet up Project Management Board┬╗ and ┬سset_up_project_management_board┬╗ are the same words. */
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
 * One free-text tool name from a plan ظْ a tool that exists, or an honest null.
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
    // ┬سSet up project management board┬╗ contains ┬سproject management board┬╗
    for (const phrase of NOT_SOFTWARE) {
        if (phrase.includes(' ') && k.includes(phrase)) return { tool: null, why: 'not_software' };
    }

    if (MEANS[k] && registered().has(MEANS[k])) return { tool: MEANS[k], how: 'meaning' };
    // a name that CONTAINS a known product: ┬سGit CLI┬╗, ┬سStripe API┬╗
    for (const [word, target] of Object.entries(MEANS)) {
        if (!registered().has(target)) continue;
        const re = new RegExp(`(^|[^a-z])${word.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&')}([^a-z]|$)`);
        if (re.test(k)) return { tool: target, how: 'meaning' };
    }

    // Last resort: a registered tool whose name is contained in what was asked.
    // Only accepted when it is unambiguous ظ¤ two candidates means we do not know.
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
 * Walk a plan and make every task runnable ظ¤ or gone.
 *
 * A phase left with no executable task is NOT deleted: it is given the one
 * thing Joe can honestly do for it, a written document, so the phase still
 * produces a deliverable instead of a red ظإî nobody can act on.
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
    /** Scope repair may edit an existing feature source path inside the selected project. */
    scopeRepairMode?: boolean;
    /** Explicit React/Vite requests must use the domain-aware React builder, not a generic placeholder scaffold. */
    preferReactBuilder?: boolean;
    /** Contract recovery may return an explicit, runnable scaffold; preserve it rather than rerouting it again. */
    preserveScaffoldBuilderChoice?: boolean;
    /** Original user request carried into an automatic builder reroute. */
    reactRequest?: string;
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
    /**
     * A scaffold's structure keys are plan-declared file outputs with the same
     * standing as write_file paths: the executor writes exactly these files
     * under baseDir. Null values are empty directories, not files. Mirror the
     * executor's repeated-prefix strip so evidence paths match what lands on
     * disk. Without this, manifests produced by scaffold_project are invisible
     * to every evidence gate below (CRITICAL-REAL-JOE-UI-001 run 3: a plan
     * that scaffolded package.json still had `npm test` dropped as unproven).
     */
    const scaffoldOutputPaths = (task: any): string[] => {
        const structure = task?.args?.structure ?? task?.input?.structure;
        if (!structure || typeof structure !== 'object' || Array.isArray(structure)) return [];
        const declaredBaseDir = String(
            task?.args?.baseDir || task?.args?.projectName || task?.args?.name
            || task?.input?.baseDir || task?.input?.projectName || task?.input?.name
            || '.',
        ).trim() || '.';
        const basePrefix = declaredBaseDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/u, '');
        const fileKeys = Object.entries(structure)
            .filter(([, contents]) => typeof contents === 'string')
            .map(([relativePath]) => String(relativePath).replace(/\\/g, '/'));
        if (!fileKeys.length) return [];
        const repeatedPrefix = basePrefix !== '.'
            && fileKeys.every(key => key === basePrefix || key.startsWith(`${basePrefix}/`));
        return fileKeys
            .map(key => {
                const stripped = repeatedPrefix
                    ? (key === basePrefix ? '' : key.slice(`${basePrefix}/`.length))
                    : key;
                if (!stripped) return '';
                return basePrefix === '.' ? stripped : `${basePrefix}/${stripped}`;
            })
            .filter(key => !!key && !unsafeWorkspacePath(key));
    };
    const taskOutputPaths = (tasks: any[]) => tasks
        .flatMap((task: any) => {
            const tool = String(task?.tool || '');
            if (tool === 'test_generator') return [testGeneratorOutputPath(task)];
            if (tool === 'scaffold_project') return scaffoldOutputPaths(task);
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
    // A quality gate is a late-bound operation: its project root is supplied by
    // PhaseExecutor only after a prior phase has produced an artifact. Keep the
    // planner's dependency proof semantic and tool-agnostic instead of inventing
    // a root from projectDir or from diagnostic text.
    const artifactProducingTools = new Set([
        'react_project', 'api_project', 'web_page_builder', 'scaffold_full_stack', 'mobile_builder',
    ]);
    const taskProducesArtifact = (task: any): boolean => {
        const tool = String(task?.tool || '');
        if (artifactProducingTools.has(tool)) return true;
        if (tool === 'scaffold_project') {
            const structure = task?.args?.structure || task?.input?.structure;
            return !!structure && typeof structure === 'object' && Object.keys(structure).some(isRunnableContractPath);
        }
        if (!['write_file', 'ai_write_file', 'file_edit', 'file_edit_advanced'].includes(tool)) return false;
        const candidate = normaliseEvidencePath(
            task?.args?.path || task?.args?.filePath || task?.args?.filename
            || task?.input?.path || task?.input?.filePath || task?.input?.filename,
        );
        return isRunnableContractPath(candidate);
    };

    let priorArtifactReady = false;
    let priorApiSelectionReady = false;
    const out = (Array.isArray(phases) ? phases : []).map((phase: any, pi: number) => {
        const phaseName = String(phase?.name || `Phase ${pi + 1}`);
        const tasks = Array.isArray(phase?.tasks) ? phase.tasks : [];
        const kept: any[] = [];
        const phaseBlockers: PlanSanitiseBlocker[] = [];
        let hadHardContractDrop = false;

        for (const task of tasks) {
            const asked = String(task?.tool || '').trim();
            const desc = String(task?.task || task?.description || 'task');
            // A task with no tool at all is the planner's own ┬سmanual┬╗ marker;
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
                            ? `╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ╪ز╪ص╪د┘ê┘ ╪ز╪س╪ذ┘è╪ز ${native} ╪╣╪ذ╪▒ shell_execute╪ؤ ┘ç╪░╪د ┘è╪ز╪ش╪د┘ê╪▓ ┘à┘ç┘╪ر ┘ê╪▒╪╡╪» npm ╪د┘╪ت┘à┘┘è┘.`
                            : `╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ╪د╪«╪ز╪د╪▒╪ز ${native} ╪د┘╪░┘è ┘é╪» ┘è╪ص╪ز╪د╪ش node-gyp ┘ê┘à╪ز╪▒╪ش┘à C/C++ ╪║┘è╪▒ ┘à╪س╪ذ╪ز╪ؤ ┘╪د ┘è┘à┘â┘ ╪د┘╪ز╪▒╪د╪╢ ┘é╪د╪ذ┘┘è╪ر ╪ذ┘╪د╪خ┘ç ┘à╪ص┘┘è╪د┘ï.`,
                        remedy: directNpmInstall
                            ? '╪ث╪╣╪» ╪ز╪«╪╖┘è╪╖ ╪د┘╪ز╪س╪ذ┘è╪ز ╪╣╪ذ╪▒ npm_manager ┘à╪╣ package manifest ┘ê╪ث╪»┘╪ر toolchain╪ؤ ┘╪د ╪ز╪│╪ز╪«╪»┘à shell_execute ┘╪ح╪«┘╪د╪ة ╪ز╪س╪ذ┘è╪ز dependency ╪»╪د╪«┘ ╪ث┘à╪▒ ┘à╪▒┘â╪ذ.'
                            : '╪د╪«╪ز╪▒ ╪ز╪ذ╪╣┘è╪ر portable ┘à╪»╪╣┘ê┘à╪ر ┘à┘ runtime ╪د┘╪ص╪د┘┘è (┘à╪س┘ node:sqlite ╪ث┘ê JSON fallback)╪î ╪ث┘ê ╪د╪░┘â╪▒ native dependency ╪╡╪▒╪د╪ص╪ر┘ï ┘à╪╣ ╪ز╪ص┘é┘é toolchain ┘é╪ذ┘ ╪د┘╪ز╪س╪ذ┘è╪ز.',
                    };
                    phaseBlockers.push(blocker);
                    notes.push(`[plan] ╪ث┘ê┘é┘╪ز┘ ┬س${desc}┬╗ ظ¤ ${blocker.message}`);
                    continue;
                }
                // A native builder is unsafe for a browser-delivered request, so
                // reroute it to the domain-aware React path. A scaffold may also
                // be rerouted, but only after its structure proves that it carries
                // a non-document implementation artifact. Empty or docs-only
                // scaffolds must reach their own contract/recovery path instead
                // of being silently hidden by a builder substitution.
                const scaffoldHasImplementation = r.tool !== 'scaffold_project'
                    || Object.entries(adaptedArgs?.structure || {}).some(([relativePath, contents]) =>
                        contents !== null
                        && Boolean(String(relativePath || '').trim())
                        && !/(?:^|[\\/])[^\\/]+\.(?:md|mdx|txt|rst|adoc)$/i.test(String(relativePath)));
                if ((r.tool === 'mobile_builder' || (r.tool === 'scaffold_project' && scaffoldHasImplementation && !options.preserveScaffoldBuilderChoice)) && options.preferReactBuilder) {
                    const request = String(options.reactRequest || adaptedArgs?.request || desc || projectDir).trim();
                    kept.push({
                        ...task,
                        tool: 'react_project',
                        args: { request },
                        input: undefined,
                    });
                    notes.push(`[plan] ┘ê╪ش┘ّ┘ç╪ز┘ ┬س${desc}┬╗ ┘à┘ ${r.tool} ╪ح┘┘ë react_project ┘╪ث┘ ╪د┘╪╖┘╪ذ ┘è╪ز╪╖┘╪ذ ╪ز╪╖╪ذ┘è┘é╪د┘ï ┘è┘╪«╪ز╪ذ╪▒ ┘┘è ╪د┘┘à╪ز╪╡┘╪ص╪ؤ ┘╪د ╪ث╪│╪ز╪«╪»┘à Expo/React Native ┘┘à╪┤╪▒┘ê╪╣ ┘ê┘è╪ذ ┘à╪ز╪ش╪د┘ê╪ذ.`);
                    continue;
                }
                if (r.tool === 'scaffold_project') {
                    const scaffoldIssue = plannedArgsIssue(r.tool, adaptedArgs);
                    if (scaffoldIssue) {
                        phaseBlockers.push({
                            code: 'scaffold_project_contract_invalid',
                            message: `╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ┘╪د ┘è┘à┘â┘ ╪ز┘┘┘è╪░┘ç╪د: ${scaffoldIssue}`,
                            remedy: '╪ص╪»┘ّ╪» structure ┘â╪د╪خ┘╪د┘ï ╪║┘è╪▒ ┘╪د╪▒╪║ ┘è╪ص╪ز┘ê┘è ╪د┘┘à╪│╪د╪▒╪د╪ز ┘ê╪د┘┘à┘┘╪د╪ز ╪د┘┘à╪╖┘┘ê╪ذ╪ر╪î ╪ث┘ê ╪د╪ذ╪»╪ث ╪ذ┘à╪▒╪ص┘╪ر ╪د╪│╪ز┘â╪┤╪د┘/╪│╪ج╪د┘ ╪ز┘é┘┘è ╪╡╪▒┘è╪ص ┘é╪ذ┘ ╪د┘╪ذ┘╪د╪ة.',
                        });
                        notes.push(`[plan] ╪ث┘ê┘é┘╪ز┘ ┬س${desc}┬╗ ظ¤ ${scaffoldIssue}`);
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
                            message: `╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ╪╖┘╪ذ╪ز scaffold_project ┘é╪ذ┘ ╪ح╪س╪ذ╪د╪ز ╪ز┘é┘┘è╪ر ╪ث┘ê ╪ح╪╖╪د╪▒ ╪╡╪▒┘è╪ص ┘┘à╪│╪د╪ص╪ر greenfield.`,
                            remedy: '╪د╪│╪ز╪«╪»┘à ╪ث╪»┘╪ر ╪د┘╪د╪│╪ز┘â╪┤╪د┘ ╪ث┘ê ┘é┘è╪»╪د┘ï ╪ز┘é┘┘è╪د┘ï ╪╡╪▒┘è╪ص╪د┘ï╪î ╪س┘à ╪ث╪▒╪│┘ structure ┘é╪د╪ذ┘╪د┘ï ┘┘╪ز┘┘┘è╪░╪ؤ ┘┘ ╪ث╪│╪ز╪ذ╪»┘ ╪░┘┘â ╪ذ┘ê╪س┘è┘é╪ر fallback.',
                        });
                    }
                    notes.push(`[plan] ╪ث╪│┘é╪╖╪ز┘ ┬س${desc}┬╗ ظ¤ ┘╪د ╪ز┘ê╪ش╪» ╪ز┘é┘┘è╪ر ╪ث┘ê ╪ح╪╖╪د╪▒ ┘à┘╪«╪ز╪د╪▒ ╪╡╪▒╪د╪ص╪ر┘ï ┘┘ç╪░┘ç ╪د┘┘à╪│╪د╪ص╪ر ╪د┘╪ش╪»┘è╪»╪ر╪ؤ ┘┘ ╪ث┘┘╪┤╪خ scaffold ╪د┘╪ز╪▒╪د╪╢┘è╪د┘ï.`);
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
                    notes.push(`[plan] ╪ث╪│┘é╪╖╪ز┘ ┬س${desc}┬╗ ظ¤ ╪د┘┘à╪│╪د╪▒ ┬س${unsafeFileArgument}┬╗ ┘┘è╪│ ┘à╪│╪د╪▒╪د┘ï ┘╪│╪ذ┘è╪د┘ï ╪ت┘à┘╪د┘ï ╪»╪د╪«┘ ┘à╪│╪د╪ص╪ر ╪د┘╪╣┘à┘╪ؤ ┘┘ ╪ث┘┘à╪▒┘ّ╪▒┘ç ╪ح┘┘ë ╪ث╪»╪د╪ر ╪د┘┘à┘┘╪د╪ز.`);
                    continue;
                }
                // Every source reference is provenance-bound. Keep this one
                // shared gate in front of all source-consuming tools so a model
                // cannot smuggle an invented path through `file`, `filename`,
                // or a plural `files` field after `path` itself was guarded.
                const taskReferencePaths = [
                    adaptedArgs?.path,
                    adaptedArgs?.filePath,
                    adaptedArgs?.file,
                    adaptedArgs?.filename,
                    ...(Array.isArray(adaptedArgs?.files) ? adaptedArgs.files : []),
                ].map(normaliseEvidencePath).filter(Boolean);
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
                const unprovenTaskReference = taskReferencePaths.find((candidate: string) =>
                    !knownPhaseOutputs.has(candidate) && !producedPaths.has(candidate) && !evidencedPaths.has(candidate),
                );
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
                // Scope repair is a bounded edit of an existing artifact, not a
                // greenfield regeneration pass. Allow its feature-source inputs
                // through the evidence gate only when every path is workspace-
                // relative and the planner is operating in an existing project.
                // Absolute, traversal, shell-like, and empty paths remain blocked.
                const boundedScopeRepair = Boolean(
                    options.scopeRepairMode
                    && options.mode === 'existing'
                    && sourcePaths.length > 0
                    && sourcePaths.every((candidate: string) => !unsafeWorkspacePath(candidate))
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
                        ? '┘╪د ┘è┘ê╪ش╪» script ╪ز┘â╪د┘à┘┘è ┘à╪╣┘┘ ┘ê┘é╪د╪ذ┘ ┘┘╪ز╪┤╪║┘è┘ ┘┘ç╪░╪د ╪د┘┘à╪┤╪▒┘ê╪╣'
                        : '┘è╪ص╪ز╪د╪ش ┘à┘┘ ╪د╪«╪ز╪ذ╪د╪▒ ╪»╪د╪«┘ ┘à╪│╪د╪▒ ╪د┘┘à╪┤╪▒┘ê╪╣ ╪ث┘ê test_generator ╪│╪د╪ذ┘é╪د┘ï╪ؤ scripts ╪د┘╪╣╪د┘à╪ر ┘ê╪ص╪»┘ç╪د ┘┘è╪│╪ز ╪»┘┘è┘╪د┘ï';
                    notes.push(`[plan] ╪ث╪│┘é╪╖╪ز┘ ┬س${desc}┬╗ ظ¤ auto_tester ┘à┘ ┘┘ê╪╣ ${requestedTestType} ${reason}.`);
                    continue;
                }
                if (sourceDependentTools.has(r.tool) && (unprovenSource || unprovenTaskReference) && !boundedRunnableRepair && !boundedScopeRepair) {
                    const unproven = unprovenTaskReference || unprovenSource;
                    notes.push(`[plan] ╪ث╪│┘é╪╖╪ز┘ ┬س${desc}┬╗ ظ¤ ${r.tool} ┘è╪ص╪ز╪د╪ش ┘â┘ ┘à╪▒╪ش╪╣ ┘à┘┘┘è ┘à╪س╪ذ╪ز╪د┘ï ┘┘è ╪د┘╪د╪│╪ز┘â╪┤╪د┘ ╪ث┘ê ┘╪د╪ز╪ش╪د┘ï ┘à┘ ┘à┘ç┘à╪ر ╪│╪د╪ذ┘é╪ر╪ؤ ┬س${unproven}┬╗ ╪║┘è╪▒ ┘à╪س╪ذ╪ز╪î ┘╪░╪د ┘┘ ╪ث╪ص┘ê┘ّ┘ ╪د╪│┘à╪د┘ï ┘à╪ز╪«┘è┘╪د┘ï ╪ح┘┘ë ╪ح╪╡┘╪د╪ص ╪░╪د╪ز┘è.`);
                    continue;
                }
                const argsIssue = plannedArgsIssue(r.tool, adaptedArgs);
                const shellIssue = r.tool === 'shell_execute'
                    ? unprovenProjectCheckIssue(adaptedArgs?.command, candidateCheckCommands)
                    : null;
                // A small registry, not a growing list of copied exceptions,
                // defines fields supplied by the trusted runtime after an earlier
                // builder has produced the artifact. Every other schema-required
                // field remains a hard planner error.
                const lateBoundField = (LATE_BOUND_PLAN_FIELDS[r.tool] || [])
                    .find(field => !String(adaptedArgs?.[field] || '').trim());
                const apiSelectionField = lateBoundField === 'apiId'
                    && (r.tool === 'inspect_api' || r.tool === 'validate_api');
                const lateBindingProven = apiSelectionField
                    ? priorApiSelectionReady || kept.some(previous => String(previous?.tool || '') === 'search_public_apis')
                    : priorArtifactReady || kept.some(taskProducesArtifact);
                const lateBoundIssue = lateBoundField
                    && lateBindingProven
                    && argsIssue
                    && argsIssue.startsWith(`${r.tool} ┘è╪ص╪ز╪د╪ش ╪د┘╪ص┘é┘ ╪د┘╪ح┘╪▓╪د┘à┘è ┬س${lateBoundField}┬╗`)
                    ? null
                    : argsIssue;
                if (lateBoundIssue || shellIssue) {
                    const issue = lateBoundIssue || shellIssue;
                    // A missing schema-required field is a hard plan-contract
                    // defect. It must not be disguised as an informational
                    // documentation phase when this was the only requested work.
                    if (argsIssue && (argsIssue.includes('┘è╪ص╪ز╪د╪ش') || /╪د┘╪ص┘é┘ ╪د┘╪ح┘╪▓╪د┘à┘è|┘ê╪د╪ص╪»╪د┘ï ┘à┘/.test(argsIssue))) {
                        hadHardContractDrop = true;
                        phaseBlockers.push({
                            code: 'tool_contract_invalid',
                            message: `╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ╪ز╪ص╪ز┘ê┘è ${r.tool} ╪ذ╪╣┘é╪» arguments ┘╪د┘é╪╡: ${argsIssue}`,
                            remedy: '╪ث┘â┘à┘ ╪ش┘à┘è╪╣ ╪د┘╪ص┘é┘ê┘ ╪د┘╪ح┘╪▓╪د┘à┘è╪ر ┘┘è ╪«╪╖╪ر ╪د┘╪ث╪»╪د╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░╪ؤ ┘╪د ╪ز┘┘╪┤╪خ Joe ┘à╪«╪▒╪ش╪د┘ï ╪ذ╪»┘è┘╪د┘ï ┘╪ح╪«┘╪د╪ة ┘┘é╪╡ ╪د┘╪╣┘é╪».',
                        });
                    }
                    notes.push(`[plan] ╪ث╪│┘é╪╖╪ز┘ ┬س${desc}┬╗ ظ¤ ${issue}`);
                    continue;
                }
                if (r.how !== 'exact') notes.push(`[plan] ┬س${asked}┬╗ ظْ ${r.tool} (${desc})`);
                kept.push({ ...task, tool: r.tool, args: adaptedArgs });
                executableTasks++;
                continue;
            }
            const why = 'why' in r ? r.why : 'unknown';
            notes.push(why === 'not_software'
                ? `[plan] ╪ث╪│┘é╪╖╪ز┘ ┬س${desc}┬╗ ظ¤ ┬س${asked}┬╗ ╪╣┘à┘ ╪ز┘╪╕┘è┘à┘è ╪ذ╪┤╪▒┘è╪î ┘╪د ╪┤┘è╪ة ┘è╪ذ┘┘è┘ç ╪ش┘ê ┘ç┘╪د.`
                : `[plan] ╪ث╪│┘é╪╖╪ز┘ ┬س${desc}┬╗ ظ¤ ┘╪د ╪ث╪»╪د╪ر ╪د╪│┘à┘ç╪د ┬س${asked}┬╗ ┘┘è ┘ç╪░╪د ╪د┘┘╪╕╪د┘à.`);
        }

        const runnable = kept.filter(t => String(t.tool || 'manual') !== 'manual');
        const nativeDependencyBlocker = phaseBlockers.find(blocker => blocker.code === 'unportable_native_dependency');
        if (nativeDependencyBlocker) {
            blockers.push(nativeDependencyBlocker);
            notes.push(`[plan] ╪ث┘ê┘é┘╪ز┘ ╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ╪ذ╪╣╪د╪خ┘é portability ╪╡╪▒┘è╪ص: ${nativeDependencyBlocker.message}`);
            return {
                ...phase,
                tasks: [],
                verificationTask: undefined,
                deliveryStatus: 'blocked',
                blocker: nativeDependencyBlocker,
            };
        }
        if (phaseBlockers.length && (runnable.length === 0 || (taskOutputPaths(kept).length === 0 && !kept.some(taskProducesArtifact)))) {
            const blocker = phaseBlockers[0];
            blockers.push(blocker);
            notes.push(`[plan] ╪ث┘ê┘é┘╪ز┘ ╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ╪ذ╪╣╪د╪خ┘é ╪ز╪«╪╖┘è╪╖ ╪╡╪▒┘è╪ص: ${blocker.message}`);
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
                message: `╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ┘┘é╪»╪ز ╪ص┘é┘╪د┘ï ╪ح┘╪▓╪د┘à┘è╪د┘ï ┘┘è ╪╣┘é╪» ╪ح╪ص╪»┘ë ╪د┘╪ث╪»┘ê╪د╪ز.`,
                remedy: '╪ث┘â┘à┘ arguments ╪د┘┘à╪╖┘┘ê╪ذ╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.',
            };
            blockers.push(blocker);
            notes.push(`[plan] ╪ث┘ê┘é┘╪ز┘ ╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ظ¤ ┘┘ ╪ث╪ص┘ê┘ ┘┘é╪╡ ╪╣┘é╪» ╪د┘╪ث╪»╪د╪ر ╪ح┘┘ë ┘ê╪س┘è┘é╪ر fallback.`);
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
            // Not a failure ظ¤ a deliverable. Write the phase down instead of
            // pretending it ran, and instead of letting it stop the build.
            /**
             * write_file, not ai_write_file, and that is deliberate.
             *
             * The first live run of this fallback produced: ┬س╪ز╪╣╪░┘ّ╪▒ ╪د┘┘ê╪╡┘ê┘ ╪ح┘┘ë
             * ┘à╪ص╪▒┘ّ┘â ╪د┘╪░┘â╪د╪ة (┘┘à ┘è╪│╪ز╪ش╪ذ ╪ث┘è ┘à╪▓┘ê┘ّ╪»)┬╗ ظ¤ the replacement for a failing
             * phase itself needed a model, so with no provider it failed too,
             * which is the same hole one layer down. Everything this document
             * should say is ALREADY KNOWN: the phase's name, its description,
             * its deliverables, and what was dropped from it. Writing what we
             * know needs nobody's permission and never fails.
             */
            const deliverables = Array.isArray(phase?.deliverables) ? phase.deliverables : [];
            const asked = tasks.map((t: any) => `- ${String(t?.task || t?.description || 'task')} (╪╖┘┘╪ذ╪ز ╪ث╪»╪د╪ر: ${String(t?.tool || 'ظ¤')})`);
            kept.push({
                task: `Document ┬س${phaseName}┬╗`,
                tool: 'write_file',
                args: {
                    // the phase's OWN number, not its position ظ¤ a plan that
                    // starts at phase 3 must not write a file called 01
                    path: `${dir}/docs/${String(Number(phase?.phaseNumber) || pi + 1).padStart(2, '0')}-${snake(phaseName) || 'phase'}.md`,
                    content: [
                        `# ${phaseName}`,
                        '',
                        String(phase?.description || '').trim(),
                        '',
                        '## ┘à╪د╪░╪د ┘â╪د┘ ┘à╪╖┘┘ê╪ذ╪د┘ï ┘┘è ┘ç╪░┘ç ╪د┘┘à╪▒╪ص┘╪ر',
                        ...(asked.length ? asked : ['- (┘╪د ┘à┘ç╪د┘à)']),
                        '',
                        '## ╪│╪ش┘ ╪د┘╪ز┘┘┘è╪░ ┘ê╪د┘╪ث╪»┘╪ر',
                        '┘ç╪░┘ç ╪د┘┘à╪▒╪ص┘╪ر ┘┘à ╪ز╪ز╪╢┘à┘ ┘à╪«╪▒╪ش╪د┘ï ┘à╪│╪د╪▒┘è╪د┘ï ┘à╪س╪ذ╪ز╪د┘ï ┘è┘à┘â┘ ╪د┘╪ز╪ص┘é┘é ┘à┘┘ç╪î ╪ث┘ê ╪د╪ص╪ز┘ê╪ز ╪ث╪»┘ê╪د╪ز ╪ز╪╣╪ز┘à╪» ╪╣┘┘ë ┘à┘┘ ┘à╪╡╪»╪▒ ╪║┘è╪▒ ┘à╪س╪ذ╪ز.',
                        '┘╪░┘┘â ╪│╪ش┘ّ┘ Joe ┘à╪د ╪╣╪▒┘┘ç ┘à┘ ╪د┘┘à┘ç╪د┘à ┘ê╪د┘┘é┘è┘ê╪» ┘┘è ┘ç╪░╪د ╪د┘┘à┘┘ ╪د┘╪ص╪ز┘à┘è╪î ╪ذ╪»┘╪د┘ï ┘à┘ ╪د╪»┘ّ╪╣╪د╪ة ╪ث┘ ┘à┘┘╪د┘ï ┘à╪ز╪«┘è┘╪د┘ï ┘à┘ê╪ش┘ê╪» ╪ث┘ê ╪ذ╪»╪ة ╪ح╪╡┘╪د╪ص ╪░╪د╪ز┘è ╪ز╪«┘à┘è┘┘è.',
                        '',
                        ...(deliverables.length ? ['## ╪د┘┘à╪«╪▒╪ش╪د╪ز ╪د┘┘à╪ز┘ê┘é┘ّ╪╣╪ر', ...deliverables.map((d: any) => `- ${String(d)}`)] : []),
                        '',
                    ].join('\n'),
                },
                priority: 'medium',
                realisticMinutes: 1,
            });
            executableTasks++;
            notes.push(`[plan] ╪د┘┘à╪▒╪ص┘╪ر ┬س${phaseName}┬╗ ┘┘à ┘è╪ذ┘é ┘┘è┘ç╪د ╪╣┘à┘ ┘é╪د╪ذ┘ ┘┘╪ز┘┘┘è╪░ ظ¤ ╪ص┘ê┘ّ┘╪ز┘┘ç╪د ╪ح┘┘ë ┘ê╪س┘è┘é╪ر ╪ص┘é┘è┘é┘è╪ر ╪ذ╪»┘ ┘à╪▒╪ص┘╪ر ┘╪د╪┤┘╪ر.`);
        }

        const phaseProducedPaths = taskOutputPaths(kept);
        phaseProducedPaths.forEach((candidate: string) => {
            producedPaths.add(candidate);
            generatedPaths.add(candidate);
        });
        // Builder tools can establish a runnable artifact without exposing a
        // model-written file path (for example react_project). Carry that proof
        // across phases so a later quality_run may receive its path from the
        // runtime-bound artifact rather than inventing one in the plan.
        if (kept.some(taskProducesArtifact)) priorArtifactReady = true;
        if (kept.some(task => String(task?.tool || '') === 'search_public_apis')) priorApiSelectionReady = true;
        for (const candidate of phaseProducedPaths) {
            if (/(?:^|\/)package\.json$/i.test(candidate)
                && generatedPackageLaunchEvidence(candidate, kept)) {
                generatedRunnableManifests.add(candidate);
            }
        }

        const v = phase?.verificationTask;
        let verification = v;
        const observedOutputPaths = phaseProducedPaths
            .map((candidate: string) => String(candidate || '').trim())
            .filter((candidate: string) => candidate && !candidate.startsWith('/') && !candidate.includes('..'));
        const observedOutputPath = observedOutputPaths[0];
        if (v && typeof v === 'object' && v.tool) {
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
            const verificationReferencePaths = [
                verificationArgs?.path,
                verificationArgs?.filePath,
                verificationArgs?.file,
                verificationArgs?.filename,
                ...(Array.isArray(verificationArgs?.files) ? verificationArgs.files : []),
            ].map(normaliseEvidencePath).filter(Boolean);
            const unprovenVerificationReference = verificationReferencePaths.find((candidate: string) =>
                !phaseProducedPaths.includes(candidate)
                && !producedPaths.has(candidate)
                && !evidencedPaths.has(candidate),
            );
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
            const referencesUnprovenFile = Boolean(unprovenVerificationReference);
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
                    ? '┘╪د ┘è┘ê╪ش╪» script ╪ز┘â╪د┘à┘┘è ┘à╪╣┘┘ ┘ê┘é╪د╪ذ┘ ┘┘╪ز╪┤╪║┘è┘ ┘┘ç╪░╪د ╪د┘┘à╪┤╪▒┘ê╪╣'
                    : '┘╪د ┘è┘ê╪ش╪» ┘à┘┘ ╪د╪«╪ز╪ذ╪د╪▒ ┘à╪س╪ذ╪ز ╪»╪د╪«┘ ┘à╪│╪د╪▒ ╪د┘┘à╪┤╪▒┘ê╪╣ ╪ث┘ê test_generator ╪│╪د╪ذ┘é';
                notes.push(`[plan] ╪ث╪▓┘╪ز┘ ╪ز╪ص┘é┘é auto_tester ┘à┘ ┘┘ê╪╣ ${verificationTestType} ╪║┘è╪▒ ╪د┘┘à╪»╪╣┘ê┘à ظ¤ ${reason}╪ؤ ┘┘ ╪ث╪»┘ّ╪╣┘è ┘╪ش╪د╪ص ╪د╪«╪ز╪ذ╪د╪▒ ╪║┘è╪▒ ┘à┘ê╪ش┘ê╪».`);
            } else {
                // A mid-phase shell_execute verification that is neither a recognized
                // checker contract (isVerificationTool) nor a package-script check
                // (unprovenProjectCheckIssue) is a runtime smoke command the planner
                // emitted to run the artifact it just wrote. The sanitizer trusted it
                // but the phase gate only accepts test-runner invocations as
                // shell_execute verifications, so the run died before the test
                // phases executed (CRITICAL-REAL-JOE-UI-001 run 4b). Rewrite it into
                // the same output-existence observation used for other unverifiable
                // checkers so execution continues to the genuine test phases.
                const shellSmokeWithoutCheckerContract = verificationTool === 'shell_execute'
                    && !isVerificationTool(verificationTool, verificationArgs, false, true)
                    && !unprovenProjectCheckIssue(verificationArgs?.command, candidateCheckCommands);

                if (!verificationTool || generatesInsteadOfObserving.has(verificationTool) || readsUnprovenPhaseOutput || referencesUnprovenFile || runsBeforeRunnableArtifact || shellSmokeWithoutCheckerContract) {
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
                const reason = readsUnprovenPhaseOutput || referencesUnprovenFile
                    ? '╪ز╪ص┘é┘é╪د┘ï ┘à┘ê┘┘ّ╪»╪د┘ï ┘è╪┤┘è╪▒ ╪ح┘┘ë ┘à┘┘╪د┘ï ╪║┘è╪▒ ┘à╪س╪ذ╪ز'
                    : shellSmokeWithoutCheckerContract
                        ? '╪ث┘à╪▒ ╪ز╪»╪«┘è┘ ┘ê┘ç┘à┘è╪د┘ï ┘╪د ┘è╪╖╪د╪ذ┘é ╪╣┘é╪»╪ر ╪ز╪ص┘é┘é ┘à╪╣╪▒┘ê┘╪ر'
                        : runsBeforeRunnableArtifact
                            ? '╪ز╪┤╪║┘è┘╪د┘ï ╪ص┘è╪د┘ï ┘é╪ذ┘ ╪ح┘╪ز╪د╪ش artifact ┘é╪د╪ذ┘ ┘┘╪ز╪┤╪║┘è┘'
                            : '╪ز╪ص┘é┘é╪د┘ï ┘à┘ê┘┘ّ╪»╪د┘ï';
                // Name the dropped smoke command so the next such rewrite is
                // diagnosable from the session log alone (run 4b needed a
                // run-evidence dig to recover `node index.js < sample.txt`).
                const droppedSmokeCommand = shellSmokeWithoutCheckerContract
                    ? String(verificationArgs?.command || '').trim().replace(/\s+/g, ' ').slice(0, 120)
                    : '';
                const smokeSuffix = droppedSmokeCommand ? ` ظ¤ ╪د┘╪ث┘à╪▒ ╪د┘┘à╪│┘é╪╖: ┬س${droppedSmokeCommand}┬╗` : '';
                notes.push(observedOutputPath
                    ? `[plan] ╪د╪│╪ز╪ذ╪»┘╪ز┘ ${reason} ╪ذ┘é╪▒╪د╪ة╪ر ╪د┘┘à╪«╪▒╪ش ╪د┘┘à╪س╪ذ╪ز ┬س${observedOutputPath}┬╗╪ؤ ╪د┘╪ز╪ص┘é┘é ┘è┘╪د╪ص╪╕ ╪د┘┘╪د╪ز╪ش ┘ê┘╪د ┘è┘╪┤╪خ ╪ث┘ê ┘è┘╪ز╪▒╪╢ ┘à┘┘╪د┘ï ┘à╪ز╪«┘è┘╪د┘ï.${smokeSuffix}`
                    : `[plan] ╪د╪│╪ز╪ذ╪»┘╪ز┘ ${reason} ╪ذ┘╪ص╪╡ ╪د┘┘à╪┤╪▒┘ê╪╣╪ؤ ┘╪د ┘è┘ê╪ش╪» ┘à╪«╪▒╪ش ┘à╪│╪د╪▒┘è ┘à╪س╪ذ╪ز ┘┘è ┘ç╪░┘ç ╪د┘┘à╪▒╪ص┘╪ر ┘╪ث┘╪ص╪╡┘ç.${smokeSuffix}`);
            } else {
                const planProducedPathsForCheck = [...generatedPaths, ...phaseProducedPaths];
                const verificationIssue = plannedArgsIssue(verificationTool, verificationArgs)
                    || (verificationTool === 'shell_execute'
                        ? unprovenProjectCheckIssueUnlessPlanProduced(verificationArgs?.command, candidateCheckCommands, planProducedPathsForCheck)
                        : null);
                // A browser verifier is itself the evidence boundary. Replacing
                // an invalid browser contract with project_detect would make an
                // unrun checker look like a passed verification. Preserve the
                // named browser verifier so PhaseExecutor can report
                // verification_unavailable honestly and never blame the product.
                verification = verificationIssue && verificationTool !== 'browser_run'
                    ? { task: 'Inspect phase output on disk', tool: 'project_detect', args: {} }
                    : { ...v, tool: verificationTool, args: verificationArgs };
                if (verificationIssue) notes.push(verificationTool === 'browser_run'
                    ? `[plan] ╪ث╪ذ┘é┘è╪ز┘ ╪ز╪ص┘é┘é browser_run ┘à╪╣ ╪╣╪د╪خ┘é ╪╣┘é╪» ┘à╪│┘à┘ّ┘ë ظ¤ ${verificationIssue}╪ؤ ┘┘ ╪ث╪│╪ز╪ذ╪»┘┘ç ╪ذ┘╪ص╪╡ ┘è┘ê╪ص┘è ╪ذ┘╪ش╪د╪ص ┘┘à ┘è╪ص╪»╪س.`
                    : `[plan] ╪د╪│╪ز╪ذ╪»┘╪ز┘ ┘à┘ç┘à╪ر ╪ز╪ص┘é┘é ╪║┘è╪▒ ┘à┘â╪ز┘à┘╪ر ╪ذ┘╪ص╪╡ ╪د┘┘à╪┤╪▒┘ê╪╣ ظ¤ ${verificationIssue}`);
            }
        }
        } else if (typeof v === 'string' && v.trim()) {
            const prose = v.trim();
            verification = observedOutputPath
                ? { task: `Verify phase output exists: ${observedOutputPath}`, tool: 'read_file', args: { path: observedOutputPath } }
                : { task: 'Inspect phase output on disk', tool: 'project_detect', args: {} };
            notes.push(observedOutputPath
                ? `[plan] ╪د╪│╪ز╪ذ╪»┘╪ز┘ ┘à┘ç┘à╪ر ╪ز╪ص┘é┘é ┘╪╡┘è╪ر ┬س${prose.slice(0, 120)}┬╗ ╪ذ┘é╪▒╪د╪ة╪ر ╪د┘┘à╪«╪▒╪ش ╪د┘┘à╪س╪ذ╪ز ┬س${observedOutputPath}┬╗╪ؤ ╪د┘╪ز╪ص┘é┘é ┘è┘╪د╪ص╪╕ ╪د┘┘╪د╪ز╪ش ┘ê┘╪د ┘è┘╪┤╪خ ╪ث┘ê ┘è┘╪ز╪▒╪╢ ┘à┘┘╪د┘ï ┘à╪ز╪«┘è┘╪د┘ï.`
                : `[plan] ╪د╪│╪ز╪ذ╪»┘╪ز┘ ┘à┘ç┘à╪ر ╪ز╪ص┘é┘é ┘╪╡┘è╪ر ┬س${prose.slice(0, 120)}┬╗ ╪ذ┘╪ص╪╡ ╪د┘┘à╪┤╪▒┘ê╪╣╪ؤ ┘╪د ┘è┘ê╪ش╪» ┘à╪«╪▒╪ش ┘à╪│╪د╪▒┘è ┘à╪س╪ذ╪ز ┘┘è ┘ç╪░┘ç ╪د┘┘à╪▒╪ص┘╪ر ┘╪ث┘╪ص╪╡┘ç.`);
        } else if (typeof v === 'string') {
            verification = undefined;
        }

        return { ...phase, tasks: kept, verificationTask: verification, verificationNote: typeof v === 'string' && v.trim() ? v : undefined };
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
            message: '╪د┘╪«╪╖╪ر ╪ز╪ص╪ز┘ê┘è project_run ┘┘à╪│╪د╪ص╪ر greenfield╪î ┘┘â┘┘ç╪د ┘╪د ╪ز╪ص╪ز┘ê┘è ┘à┘ç┘à╪ر ╪ز┘╪┤╪خ package.json ╪ث┘ê entrypoint ┘é╪د╪ذ┘╪د┘ï ┘┘╪ز╪┤╪║┘è┘ ╪╣╪ذ╪▒ ╪ث╪»╪د╪ر ╪ح┘╪┤╪د╪ة ┘à┘╪د╪│╪ذ╪ر.',
            remedy: '╪ث╪╢┘ ┘à╪▒╪ص┘╪ر foundation ╪╡╪▒┘è╪ص╪ر ╪ز╪│╪ز╪«╪»┘à scaffold_project ╪ذ╪ذ┘┘è╪ر ╪║┘è╪▒ ┘╪د╪▒╪║╪ر ╪ث┘ê write_file/ai_write_file ┘╪ح┘╪┤╪د╪ة manifest ┘êentrypoint╪î ╪س┘à ╪س╪ذ┘ّ╪ز dependencies ┘ê╪┤╪║┘ّ┘ ╪د┘┘à╪┤╪▒┘ê╪╣ ╪ذ╪╣╪» ╪░┘┘â.',
        };
        blockers.push(blocker);
        notes.push(`[plan] ╪ث┘ê┘é┘╪ز┘ ╪د┘╪«╪╖╪ر ┘é╪ذ┘ live-run ظ¤ ${blocker.message}`);
    }
    /**
     * A GREENFIELD BUILD LIVES IN ITS OWN DIRECTORY ظ¤ NEVER IN THE WORKSPACE ROOT.
     *
     * Measured on the MyBudget field run: the planner emitted bare paths ظ¤
     * `src/main.ts`, `config/config.ts`, `tests/main.test.ts`, `deploy.sh` ظ¤
     * and every write tool resolves relative to the ACTIVE WORKSPACE ROOT, so
     * ten loose files and finally a package.json landed in `my-workspace/`
     * itself, beside twenty-four real projects. Discovery then read the whole
     * workspace as one ambiguous artifact, and the run ended with ┬سno runnable
     * project named mybudget was found┬╗ ظ¤ because the project was never given
     * a directory to exist in.
     *
     * The test for what to prefix is a SHAPE, not a domain: a path whose first
     * segment is project-internal layout (src, tests, config, publicظخ) or a
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
        if (moved) notes.push(`[plan] ┘ê╪ش┘ّ┘ç╪ز┘ ${moved} ┘à┘┘╪د┘ï ╪ح┘┘ë ┘à╪ش┘╪» ╪د┘┘à╪┤╪▒┘ê╪╣ ┬س${dir}/┬╗ ظ¤ ╪ذ┘╪د╪ة ╪ش╪»┘è╪» ┘╪د ┘è┘â╪ز╪ذ ┘┘è ╪ش╪░╪▒ ┘à╪│╪د╪ص╪ر ╪د┘╪╣┘à┘ ┘┘╪│┘ç.`);
    }
    return { phases: stampPlanDependencies(out, notes), notes, executableTasks, ...(blockers[0] ? { blocker: blockers[0] } : {}) };
}

/**
 * THE HYBRID CONTRACT: THE PLANNER DECIDES WHAT, THE PLAN ENFORCES WHEN.
 *
 * A model is a fine judge of whether a request needs a data service at all ظ¤
 * a static page plainly does not, and a UI on someone else's API must not
 * have a new server forced onto it. But once it HAS decided that this project
 * gets both a service and an interface, the order between them stops being a
 * matter of judgement: an interface that reads rows cannot be built and
 * verified before the thing that serves them exists.
 *
 * That guarantee used to live in a deterministic route which named
 * `api_project` then `react_project` with an explicit `dependsOn`. When the
 * route was replaced by an LLM planner the ordering went with it ظ¤ a live
 * harness caught it immediately (┬سظخand an app with data gets its backend
 * BEFORE its interface┬╗).
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
    // Only one of them present ظ¤ the plan implies no relation to enforce.
    if (dataIndex < 0 || interfaceIndex < 0 || dataIndex === interfaceIndex) return list;

    const dataName = String(list[dataIndex]?.name || `Phase ${dataIndex + 1}`);
    const ordered = dataIndex < interfaceIndex
        ? list
        // The interface was planned first. Move the service ahead of it rather
        // than rewriting either phase ظ¤ the planner's content is untouched.
        : (() => {
            const copy = [...list];
            const [service] = copy.splice(dataIndex, 1);
            copy.splice(interfaceIndex, 0, service);
            notes.push(`[plan] the data service ┬س${dataName}┬╗ was moved ahead of the interface that depends on it`);
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
 * Renaming ┬سGit┬╗ to git_ops is only half the repair. The plan that said "Git"
 * also invented its arguments, and the first live run of the fix showed it
 * immediately:
 *
 *   [PhaseExecutor] ظزي╕ ┬سGit┬╗ ╪ز╪╣┘┘è git_ops
 *   [PhaseExecutor] ظإî Task 1 failed: git_ops ظ¤ git: 'undefined' is not a git command
 *
 * The plan said `{ action: 'status' }`; git_ops takes `operation`. Nobody was
 * wrong about the intent and everybody was wrong about the spelling.
 *
 * So: rename the words models actually use into the words the tool declares,
 * and fill a required field that is still missing with the safest real value.
 * Nothing is deleted ظ¤ an unknown extra key is harmless, a missing required one
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
 * ┬س┘â┘ê╪د┘╪ز┘è ╪ز╪د╪│┘â╪│ ┘╪د ╪ز╪╣┘à┘ ╪ذ╪┤┘â┘ ╪╡╪ص┘è╪ص┬╗ ظ¤ and it could not: the Quality phase was
 * planned as `browser_ui_audit` with `args: {}`, so the very first thing the
 * tool did was answer `no_url`. Every system build ended at 2/3 for that one
 * missing string, and the self-repair that followed sent a browser agent off
 * to ┬سgenerate a URL┬╗ on the open web.
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
 * WHY there is no address ظ¤ because `no_url` explains nothing.
 *
 * From his own machine: `ظإî Quality (tasks: 0/1) ظ¤ Error: no_url`, while the
 * app was being served at that session's preview route at that very second.
 * Three different failures print that same word, and the one line that could
 * have told us which was which said nothing at all.
 */
export function whyNoBuiltUrl(sessionId: string): string {
    const key = String(sessionId || '').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!key) return 'no_url: ┘╪د ┘à╪╣╪▒┘ّ┘ ╪ش┘╪│╪ر ┘à╪╣ ╪د┘╪╖┘╪ذ ظ¤ ┘╪د ╪ث╪╣╪▒┘ ╪ث┘è┘ّ ┘à╪┤╪▒┘ê╪╣ ╪ث┘╪ص╪╡.';
    const entry = ((global as any).joeProjects || {})[key];
    if (!entry?.dir) return `no_url: ┘╪د ┘à╪┤╪▒┘ê╪╣ ┘à╪ذ┘┘è┘ّ ┘à╪│╪ش┘ّ┘ ┘┘ç╪░┘ç ╪د┘╪ش┘╪│╪ر (${key}) ظ¤ ╪د╪ذ┘┘ ╪ث┘ê┘╪د┘ï ╪س┘à ╪د┘╪ص╪╡.`;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require('path');
        const liveUrl = String(entry.live?.url || '').trim();
        if (/^https?:\/\//i.test(liveUrl)) return 'no_url: ╪ز╪╣╪░┘ّ╪▒ ╪د╪│╪ز╪«╪»╪د┘à ╪╣┘┘ê╪د┘ ╪د┘╪«╪د╪»┘à ╪د┘╪ص┘è ╪▒╪║┘à ╪ث┘ ╪د┘┘à╪┤╪▒┘ê╪╣ ╪│╪ش┘ّ┘┘ç.';
        const dist = path.join(String(entry.dir), 'dist', 'index.html');
        if (!fs.existsSync(dist)) return `no_url: ╪د┘┘à╪┤╪▒┘ê╪╣ ┘à╪│╪ش┘ّ┘ ┘┘è ${entry.dir} ┘┘â┘ ┘╪د ┘è┘ê╪ش╪» dist/index.html ┘ê┘╪د ╪«╪د╪»┘à ╪ص┘è ┘à╪│╪ش┘ّ┘ ظ¤ ╪د┘╪ذ┘╪د╪ة ╪ث┘ê ╪د┘╪ز╪┤╪║┘è┘ ┘┘à ┘è┘â╪ز┘à┘.`;
    } catch (e: any) {
        return `no_url: ╪ز╪╣╪░┘ّ╪▒ ┘╪ص╪╡ ┘à╪ش┘┘ّ╪» ╪د┘┘à╪┤╪▒┘ê╪╣ ظ¤ ${e?.message || e}`;
    }
    return 'no_url: ╪د┘╪╣┘┘ê╪د┘ ╪ز╪╣╪░┘ّ╪▒ ╪ز┘â┘ê┘è┘┘ç ╪▒╪║┘à ┘ê╪ش┘ê╪» ╪د┘╪ذ┘╪د╪ة.';
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

/** The exact action names implemented by modules/browser/executor.ts. */
const BROWSER_ACTION_TYPES = new Set([
    'goto', 'click', 'type', 'fill', 'hover', 'key', 'evaluate', 'scroll', 'wait',
    'assert', 'ui_audit', 'back', 'forward', 'reload', 'screenshot', 'extract_text',
    'get_elements', 'scroll_to_element', 'click_coordinates', 'select', 'thought',
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
        const rawActions = args?.actions;
        if (rawActions !== undefined && rawActions !== null && !Array.isArray(rawActions)) {
            return 'browser_run ┘è╪ص╪ز╪د╪ش actions ┘â┘à╪╡┘┘ê┘╪ر ┘à┘ ┘â╪د╪خ┘╪د╪ز ╪د┘╪ح╪ش╪▒╪د╪ة╪د╪ز╪ؤ ╪د┘╪«╪╖╪ر ┘à╪▒┘ّ╪▒╪ز ┘é┘è┘à╪ر ┘┘è╪│╪ز ┘à╪╡┘┘ê┘╪ر╪î ┘╪░┘┘â ╪▒┘┘╪╢╪ز ┘é╪ذ┘ ┘╪ز╪ص ╪د┘┘à╪ز╪╡┘╪ص.';
        }
        const actions = Array.isArray(rawActions) ? rawActions : [];
        if (!instruction && actions.length === 0) {
            return 'browser_run ┘è╪ص╪ز╪د╪ش instructionText ╪ث┘ê actions ╪║┘è╪▒ ┘╪د╪▒╪║╪ر╪ؤ ┘┘à ╪ز┘╪ص╪»┘ّ╪» ╪د┘╪«╪╖╪ر ┘ç╪»┘╪د┘ï ╪ث┘ê ╪ح╪ش╪▒╪د╪ة┘ï ┘é╪د╪ذ┘╪د┘ï ┘┘╪ز┘┘┘è╪░╪î ┘╪░┘┘â ╪ث┘┘ê┘é┘╪ز ┘é╪ذ┘ ┘╪ز╪ص ╪د┘┘à╪ز╪╡┘╪ص.';
        }
        for (let i = 0; i < actions.length; i += 1) {
            const action = actions[i];
            if (!action || typeof action !== 'object' || Array.isArray(action)) {
                return `browser_run action #${i + 1} ┘è╪ش╪ذ ╪ث┘ ┘è┘â┘ê┘ ┘â╪د╪خ┘╪د┘ï ┘à┘╪│┘é╪د┘ï╪ؤ ╪د┘┘╪╡┘ê╪╡ ┘╪د ╪ز┘╪ص┘ê┘ّ┘ ╪ز┘┘é╪د╪خ┘è╪د┘ï ╪ح┘┘ë ╪ث┘╪╣╪د┘ ┘à╪ز╪╡┘╪ص╪î ┘╪░┘┘â ╪▒┘┘╪╢╪ز ╪د┘╪«╪╖╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.`;
            }
            const type = String(action.type || '').trim();
            if (!type) {
                return `browser_run action #${i + 1} ┘è┘╪ز┘é╪» type╪ؤ ┘╪د ┘è┘à┘â┘ ╪ز┘┘┘è╪░ ┘╪╣┘ ┘à╪ش┘ç┘ê┘╪î ┘╪░┘┘â ╪▒┘┘╪╢╪ز ╪د┘╪«╪╖╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.`;
            }
            if (!BROWSER_ACTION_TYPES.has(type)) {
                return `browser_run action #${i + 1} ┘è╪ص┘à┘ type ╪║┘è╪▒ ┘à╪»╪╣┘ê┘à ┬س${type}┬╗╪ؤ ╪د┘╪ث┘╪╣╪د┘ ╪د┘┘à╪»╪╣┘ê┘à╪ر: ${Array.from(BROWSER_ACTION_TYPES).join(', ')}.`;
            }
        }
    }
    if (toolName === 'scaffold_project') {
        const structure = args?.structure;
        if (!structure || typeof structure !== 'object' || Array.isArray(structure) || Object.keys(structure).length === 0) {
            return 'scaffold_project ┘è╪ص╪ز╪د╪ش structure ┘â╪د╪خ┘╪د┘ï ╪║┘è╪▒ ┘╪د╪▒╪║╪د┘ï ┘è╪ص╪»╪» ┘à╪│╪د╪▒╪د╪ز ╪د┘┘à┘┘╪د╪ز ┘ê╪د┘┘à╪ش┘╪»╪د╪ز╪ؤ ┘┘à ╪ز┘╪ص╪»┘ّ╪» ╪د┘╪«╪╖╪ر ╪ذ┘┘è╪ر ┘é╪د╪ذ┘╪ر ┘┘╪ز┘┘┘è╪░╪î ┘╪░┘┘â ╪ث┘┘ê┘é┘╪ز ┘é╪ذ┘ ╪د┘┘â╪ز╪د╪ذ╪ر.';
        }
    }
    if (toolName === 'npm_manager' && !String(args?.command || '').trim()) {
        return 'npm_manager ┘è╪ص╪ز╪د╪ش command ╪╡╪د┘╪ص╪د┘ï ┘à╪س┘ ┬سinstall┬╗ ╪ث┘ê ┬سrun test┬╗╪ؤ ┘┘à ╪ز┘╪ص╪»┘ّ╪» ╪د┘╪«╪╖╪ر ╪ث┘à╪▒╪د┘ï╪î ┘╪░┘┘â ╪ث┘╪│┘é╪╖╪ز ╪د┘┘à┘ç┘à╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.';
    }
    if (toolName === 'db_schema_migrator') {
        const action = norm(args?.action);
        const supported = ['migrate', 'push', 'reset', 'status'];
        if (!supported.includes(action)) {
            return `db_schema_migrator ┘è╪ص╪ز╪د╪ش action ┘ê╪د╪ص╪»╪د┘ï ┘à┘ ${supported.join(', ')}╪î ┘┘â┘ ╪د┘╪«╪╖╪ر ╪╖┘╪ذ╪ز ┬س${action || '┘à┘┘é┘ê╪»'}┬╗. ┘è┘╪▓┘à ╪ح╪س╪ذ╪د╪ز ┘à╪ص╪▒┘â ┘ê┘à╪«╪╖╪╖ ╪د┘╪ذ┘è╪د┘╪د╪ز ┘é╪ذ┘ ╪ز╪┤╪║┘è┘ ┘ç╪ش╪▒╪ر.`;
        }
    }
    // DocumentationGeneratorTool can only transform an existing source file.
    // A model-written phase that says ظ£document the projectظإ without naming a
    // source file is not a file-not-found incident: it is an incomplete plan.
    // Reject it before execution so the recovery loop never fabricates a file
    // merely to satisfy an undefined path.
    if (toolName === 'doc_generator' && !String(args?.filePath || '').trim()) {
        return 'doc_generator ┘è╪ص╪ز╪د╪ش filePath ┘┘à┘┘ ┘à╪╡╪»╪▒ ┘à┘ê╪ش┘ê╪» ┘ê┘à╪س╪ذ╪ز ┘┘è ╪د┘╪ث╪»┘╪ر╪ؤ ┘┘à ╪ز┘╪ص╪»┘ّ╪» ╪د┘╪«╪╖╪ر ┘à┘┘╪د┘ï ┘┘╪ز┘ê╪س┘è┘é╪î ┘╪░┘┘â ╪ث┘╪│┘é╪╖╪ز ╪د┘┘à┘ç┘à╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.';
    }
    // ai_write_file is a source-generation contract, not a vague instruction to
    // ظ£write codeظإ.  It must name exactly one relative destination and explain
    // the expected contents before the model is called.  Without both fields,
    // execution would only create a false code defect and trigger self-healing.
    if (toolName === 'ai_write_file') {
        const target = String(args?.path || '').trim();
        const brief = String(args?.description || '').trim();
        if (!target || !brief) {
            return 'ai_write_file ┘è╪ص╪ز╪د╪ش path ┘╪│╪ذ┘è╪د┘ï ┘êdescription ┘è┘ê╪╢╪ص ┘à╪ص╪ز┘ê┘ë ╪د┘┘à┘┘╪ؤ ┘┘à ╪ز┘╪ص╪»╪» ╪د┘╪«╪╖╪ر ╪╣┘é╪» ╪ح┘╪┤╪د╪ة ┘à╪╡╪»╪▒ ┘à┘â╪ز┘à┘╪î ┘╪░┘┘â ╪ث┘╪│┘é╪╖╪ز ╪د┘┘à┘ç┘à╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.';
        }
        if (isShellLikeWorkspacePath(target)) {
            return 'ai_write_file ┘è╪ص╪ز╪د╪ش ┘à╪│╪د╪▒ ┘à┘┘ ┘ê╪د╪ص╪»╪د┘ï╪ؤ ╪▒┘╪╢╪ز┘ ┘é┘è┘à╪ر ╪ز╪ذ╪»┘ê ┘â╪ث┘à╪▒ shell ┘à╪س┘ node/npm ┘é╪ذ┘ ╪ث┘è ┘â╪ز╪د╪ذ╪ر.';
        }
        if (target.startsWith('/') || target.includes('..')) {
            return 'ai_write_file ┘è╪ص╪ز╪د╪ش path ┘╪│╪ذ┘è╪د┘ï ╪»╪د╪«┘ ┘à╪│╪د╪ص╪ر ╪د┘╪╣┘à┘╪ؤ ╪▒┘╪╢╪ز┘ ┘à╪│╪د╪▒╪د┘ï ┘é╪» ┘è╪«╪▒╪ش ┘à┘ ╪د┘┘à╪┤╪▒┘ê╪╣ ┘é╪ذ┘ ╪ث┘è ┘â╪ز╪د╪ذ╪ر.';
        }
    }
    // test_generator reads a real source file before it writes the matching test.
    // A phase-level request such as ظ£test the consoleظإ is not an executable test
    // contract: without filePath the tool can only ask fs to read `undefined`,
    // then a planner mistakenly treats the resulting input error as a code bug.
    if (toolName === 'test_generator') {
        const source = String(args?.filePath || '').trim();
        if (!source || /^undefined$/i.test(source)) {
            return 'test_generator ┘è╪ص╪ز╪د╪ش filePath ┘┘à┘┘ ┘à╪╡╪»╪▒ ┘à╪ص╪»╪»╪ؤ ┘┘à ╪ز┘╪س╪ذ╪ز ╪د┘╪«╪╖╪ر ╪د┘┘à┘┘ ╪د┘┘à╪▒╪د╪» ╪د╪«╪ز╪ذ╪د╪▒┘ç╪î ┘╪░┘┘â ╪ث┘╪│┘é╪╖╪ز ╪د┘┘à┘ç┘à╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.';
        }
    }
    // CodeReviewerTool requires a concrete array. A phase-level phrase such as
    // ظ£review qualityظإ contains no reviewable evidence and must not turn into a
    // runtime exception or a speculative recovery loop.
    if (toolName === 'code_reviewer') {
        const files = Array.isArray(args?.files)
            ? args.files.map((value: any) => String(value || '').trim()).filter(Boolean)
            : [];
        if (files.length === 0 || files.some((file: string) => /^undefined$/i.test(file))) {
            return 'code_reviewer ┘è╪ص╪ز╪د╪ش files ┘â┘à╪╡┘┘ê┘╪ر ┘┘à╪│╪د╪▒╪د╪ز ┘à┘┘╪د╪ز ┘à╪╡╪»╪▒ ┘à╪س╪ذ╪ز╪ر╪ؤ ┘┘à ╪ز╪ص╪»╪» ╪د┘╪«╪╖╪ر ┘à╪د ╪د┘╪░┘è ╪│┘è┘╪▒╪د╪ش╪╣╪î ┘╪░┘┘â ╪ث┘╪│┘é╪╖╪ز ╪د┘┘à┘ç┘à╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.';
        }
    }
    // auto_tester has a closed test vocabulary.  A vague planned task such as
    // ظ£run testsظإ must never reach the tool as `undefined`, because that is a
    // plan-contract defect rather than an executable verification result.
    if (toolName === 'auto_tester') {
        const testType = norm(args?.testType);
        const supported = ['syntax', 'build', 'unit', 'integration'];
        if (!supported.includes(testType)) {
            return `auto_tester ┘è╪ص╪ز╪د╪ش testType ┘ê╪د╪ص╪»╪د┘ï ┘à┘ ${supported.join(', ')}╪ؤ ┘┘â┘ ╪د┘╪«╪╖╪ر ╪╖┘╪ذ╪ز ┬س${testType || '┘à┘┘é┘ê╪»'}┬╗.`;
        }
        const projectPath = String(args?.projectPath || '').trim();
        if (!projectPath || projectPath === 'undefined') {
            return 'auto_tester ┘è╪ص╪ز╪د╪ش projectPath ┘╪│╪ذ┘è╪د┘ï ╪»╪د╪«┘ ┘à╪│╪د╪ص╪ر ╪د┘╪╣┘à┘╪ؤ ┘╪د ┘è╪ش┘ê╪▓ ╪ث┘ ┘è┘╪ز╪▒╪╢ ╪ش╪░╪▒ ╪╣┘à┘┘è╪ر Joe ┘â╪ث┘┘ç ╪د┘┘à╪┤╪▒┘ê╪╣.';
        }
        if (testType === 'syntax') {
            const files = Array.isArray(args?.files)
                ? args.files.map((value: any) => String(value || '').trim()).filter(Boolean)
                : [];
            if (files.length === 0 || files.some((file: string) => /^undefined$/i.test(file))) {
                return 'auto_tester ┘à┘ ┘┘ê╪╣ syntax ┘è╪ص╪ز╪د╪ش files ┘â┘à╪╡┘┘ê┘╪ر ┘┘à╪│╪د╪▒╪د╪ز ┘à╪╡╪»╪▒ ┘à╪س╪ذ╪ز╪ر╪ؤ ┘╪د ┘è┘╪ص╪╡ ╪ش┘ê ┘à╪│╪د╪ص╪ر┘ï ┘à╪ش┘ç┘ê┘╪ر ╪ث┘ê ┘à┘┘╪د┘ï ┘à╪ز╪«┘è┘╪د┘ï.';
            }
            const unsupported = files.filter((file: string) => syntaxFileKind(file) === null);
            if (unsupported.length > 0) {
                return `auto_tester ┘à┘ ┘┘ê╪╣ syntax ┘è╪»╪╣┘à JavaScript/TypeScript ┘êJSON ┘┘é╪╖╪ؤ ╪د╪│╪ز╪«╪»┘à ┘à╪»┘é┘é╪د┘ï ┘à╪ز╪«╪╡╪╡╪د┘ï ┘┘┘à┘┘╪د╪ز: ${unsupported.join(', ')}.`;
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
            return `${toolName} ┘è╪ص╪ز╪د╪ش ╪د┘╪ص┘é┘ ╪د┘╪ح┘╪▓╪د┘à┘è ┬س${missingRequired}┬╗╪ؤ ┘┘à ╪ز┘╪ص╪»┘ّ╪» ╪د┘╪«╪╖╪ر ┘é┘è┘à╪ر ╪╡╪د┘╪ص╪ر ┘┘ç╪î ┘╪░┘┘â ╪ث┘┘ê┘é┘╪ز ╪د┘┘à┘ç┘à╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.`;
        }
        const missingGroup = requiredAny.find(group => !group.some(hasValue));
        if (missingGroup) {
            return `${toolName} ┘è╪ص╪ز╪د╪ش ┘ê╪د╪ص╪»╪د┘ï ┘à┘ ${missingGroup.join(' ╪ث┘ê ')}╪ؤ ┘┘à ╪ز┘╪ص╪»┘ّ╪» ╪د┘╪«╪╖╪ر ┘é┘è┘à╪ر ╪╡╪د┘╪ص╪ر ┘╪ث┘è ╪ذ╪»┘è┘╪î ┘╪░┘┘â ╪ث┘┘ê┘é┘╪ز ╪د┘┘à┘ç┘à╪ر ┘é╪ذ┘ ╪د┘╪ز┘┘┘è╪░.`;
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
    return `╪ث┘à╪▒ ┬س${normalised}┬╗ ┘┘è╪│ ┘╪ص╪╡╪د┘ï ┘à╪╣┘┘╪د┘ï ┘┘è ┘à┘┘╪د╪ز ╪د┘┘à╪┤╪▒┘ê╪╣ ╪د┘╪ز┘è ╪د╪│╪ز┘â╪┤┘┘ç╪د Joe╪ؤ ┘┘ ┘è┘╪┤╪║┘ّ┘┘ npm ╪ذ╪د┘╪ز╪▒╪د╪╢ ┘ê╪ش┘ê╪» package.json ╪ث┘ê script.`;
}

export function planProducedCheckProven(command: unknown, planProducedPaths: Iterable<string>): boolean {
    const normalised = normaliseShellCommand(command);
    const m = normalised.match(/^(?:npm|pnpm|yarn)\s+(?:run\s+)?([A-Za-z0-9:_-]+)/i);
    if (!m) return false;
    const script = m[1];
    for (const p of planProducedPaths) {
        if (/(?:^|\/)package\.json$/i.test(p)) return true;
    }
    return false;
}

export function unprovenProjectCheckIssueUnlessPlanProduced(command: unknown, declaredChecks: Set<string>, planProducedPaths: Iterable<string>): string | null {
    const issue = unprovenProjectCheckIssue(command, declaredChecks);
    if (!issue) return null;
    return planProducedCheckProven(command, planProducedPaths) ? null : issue;
}

export function adaptPlannedArgs(toolName: string, args: any): any {
    const out: any = { ...(args || {}) };
    if (NEEDS_BUILT_URL.has(toolName) && !String(out.url || '').trim()) {
        const sid = out.sessionId || (args || {}).sessionId || '';
        // ظخunless the builder ALREADY audited this app in a real browser
        // moments ago. Filling in the address here is what sent the Quality
        // phase to open a second browser over a page that had just been
        // measured ظ¤ ┬س┘è╪┤╪║┘ ╪د┘┘à╪ز╪╡┘╪ص ╪»┘ê┘ ┘╪د╪خ╪»╪ر┬╗. Left empty, the audit tool
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
    } catch { /* registry mid-initialisation ظ¤ leave the args as written */ }
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
 *   exec: git --version   ظْ  exit=0
 *   exec=sudo apt-get install git -y  blocked=1
 *   ERROR: command_not_allowed
 *   ظأبي╕ Stopped at step "Install Git if it is not installed" ظ¤ command_not_allowed
 *
 * The repair planner checked that git works, was told it works, and then tried
 * to install it ظ¤ with a Linux package manager, on Windows, using sudo, which
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
        return 'sudo ┘╪د ┘è╪╣┘à┘ ┘ç┘╪د (┘ê┘╪د ┘è┘╪│┘à╪ص ╪ذ┘ç) ظ¤ ╪ز╪«╪╖┘ّ┘è╪ز ╪د┘╪«╪╖┘ê╪ر ╪ذ╪»┘ ╪ز┘â╪▒╪د╪▒ ┘à╪ص╪د┘ê┘╪ر ┘à╪│╪ز╪ص┘è┘╪ر.';
    }
    if (isWin && /(^|\s|&&|;|\|)(apt-get|apt|yum|dnf|pacman|zypper|snap|brew)\s/.test(c)) {
        return '┘ç╪░╪د ┘à╪»┘è╪▒ ╪ص╪▓┘à ┘┘è┘┘â╪│/┘à╪د┘â ┘ê╪د┘╪ش┘ç╪د╪▓ ┘è╪╣┘à┘ ╪╣┘┘ë ┘ê┘è┘╪»┘ê╪▓ ظ¤ ╪د┘╪«╪╖┘ê╪ر ┘à╪│╪ز╪ص┘è┘╪ر ╪ث╪╡┘╪د┘ï.';
    }
    if (!isWin && /(^|\s|&&|;|\|)(choco|winget|scoop)\s/.test(c)) {
        return '┘ç╪░╪د ┘à╪»┘è╪▒ ╪ص╪▓┘à ┘ê┘è┘╪»┘ê╪▓ ┘ê╪د┘╪ش┘ç╪د╪▓ ┘┘è╪│ ┘ê┘è┘╪»┘ê╪▓ ظ¤ ╪د┘╪«╪╖┘ê╪ر ┘à╪│╪ز╪ص┘è┘╪ر ╪ث╪╡┘╪د┘ï.';
    }

    // Installing something that is already on PATH.
    const m = c.match(/\b(?:apt-get|apt|yum|dnf|pacman|brew|choco|winget|scoop)\s+(?:-\S+\s+)*(?:install|add|-S)\s+(?:-\S+\s+)*([a-z0-9._+-]+)/);
    if (m && hasBinary(m[1])) {
        return `┬س${m[1]}┬╗ ┘à╪س╪ذ┘┘ّ╪ز ╪╣┘┘ë ╪د┘╪ش┘ç╪د╪▓ ┘╪╣┘╪د┘ï ظ¤ ┘╪د ┘à╪╣┘┘ë ┘╪ز╪س╪ذ┘è╪ز┘ç ┘à┘ ╪ش╪»┘è╪».`;
    }
    return null;
}

/** Is this executable on PATH? Pure filesystem ظ¤ no process is spawned to ask. */
export function hasBinary(name: string): boolean {
    return findBinary(name) !== null;
}

/**
 * WHERE that binary is ظ¤ the full path, or null.
 *
 * `hasBinary` answers yes/no, which is enough to reject a plan step and not
 * enough to LAUNCH something: spawn resolves a bare name through PATH again,
 * and when that lookup fails it does not throw ظ¤ it kills the process that
 * asked. Anything Joe spawns detached is resolved here first, so ┬سnot found┬╗
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
        'AVAILABLE TOOLS ظ¤ the ONLY values allowed in a task\'s "tool" field.',
        'Use the exact name. Never invent a name. Never name a product (Git, Jira, Docker) ظ¤',
        'name the tool. If a step needs no tool, use "manual".',
        '',
        lines,
        '',
        'Contract rules: every tool must receive the exact business args required by its implementation. Runtime context fields such as sessionId, userId, workspaceId, context, __userId, and __workspaceId are injected by the trusted executor and must not be invented in the plan; browser_run still needs instructionText or non-empty actions, and every other tool-specific business field remains mandatory. For scaffold_project, args.structure must be a non-empty object whose keys are safe workspace-relative file or directory paths and whose values are file contents or null for directories; args.baseDir names the project directory (projectName is an accepted alias); after scaffolding, project_run must use the registered project identity and a live URL must be proven. Do not use scaffold_project when the request has no explicit or evidence-backed stack ظ¤ use exact file-level tools or stop honestly.',
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
