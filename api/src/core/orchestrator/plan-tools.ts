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
    { tool: 'scaffold_project', purpose: 'create a new project on disk (folders, package.json, entry files)' },
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
    { tool: 'db_schema_migrator', purpose: 'design or migrate a database schema' },
    { tool: 'auth_builder', purpose: 'add authentication (login, sessions, roles)' },
    { tool: 'payments_create_checkout_session', purpose: 'wire a real payment checkout' },
    { tool: 'i18n_translator', purpose: 'add or translate interface languages' },
    { tool: 'swagger_docs', purpose: 'generate API documentation' },
    { tool: 'doc_generator', purpose: 'write project documentation' },
    { tool: 'browser_run', purpose: 'open the built app in a real browser and check it' },
    { tool: 'browser_ui_audit', purpose: 'audit the built UI for visual and accessibility defects' },
    { tool: 'project_detect', purpose: 'verify what was actually created on disk' },
    { tool: 'project_run', purpose: 'start the built project and get a live URL' },
    { tool: 'deploy_project', purpose: 'deploy/publish the finished project' },
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
/** «Set up Project Management Board» and «set_up_project_management_board» are the same words. */
const key = (v: any) => norm(v).replace(/[_\-\s]+/g, ' ').replace(/[^a-z0-9. /]/g, '').trim();
const snake = (v: any) => norm(v).replace(/[\s\-.]+/g, '_').replace(/[^a-z0-9_]/g, '');

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

export interface SanitisedPlan {
    phases: any[];
    /** every change made, in the user's log, because a silent rewrite is its own lie */
    notes: string[];
    /** did anything executable survive? */
    executableTasks: number;
}

/**
 * Walk a plan and make every task runnable — or gone.
 *
 * A phase left with no executable task is NOT deleted: it is given the one
 * thing Joe can honestly do for it, a written document, so the phase still
 * produces a deliverable instead of a red ❌ nobody can act on.
 */
export function sanitisePlanPhases(phases: any[], projectDir = ''): SanitisedPlan {
    const notes: string[] = [];
    let executableTasks = 0;
    const dir = String(projectDir || '').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40) || 'project';

    const out = (Array.isArray(phases) ? phases : []).map((phase: any, pi: number) => {
        const phaseName = String(phase?.name || `Phase ${pi + 1}`);
        const tasks = Array.isArray(phase?.tasks) ? phase.tasks : [];
        const kept: any[] = [];

        for (const task of tasks) {
            const asked = String(task?.tool || '').trim();
            const desc = String(task?.task || task?.description || 'task');
            // A task with no tool at all is the planner's own «manual» marker;
            // the executor already skips those without failing.
            if (!asked || key(asked) === 'manual') { kept.push({ ...task, tool: 'manual' }); continue; }

            const r = resolvePlannedTool(asked);
            if (r.tool) {
                if (r.how !== 'exact') notes.push(`[plan] «${asked}» → ${r.tool} (${desc})`);
                kept.push({ ...task, tool: r.tool });
                executableTasks++;
                continue;
            }
            const why = 'why' in r ? r.why : 'unknown';
            notes.push(why === 'not_software'
                ? `[plan] أسقطتُ «${desc}» — «${asked}» عمل تنظيمي بشري، لا شيء يبنيه جو هنا.`
                : `[plan] أسقطتُ «${desc}» — لا أداة اسمها «${asked}» في هذا النظام.`);
        }

        const runnable = kept.filter(t => String(t.tool || 'manual') !== 'manual');
        if (runnable.length === 0) {
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
                        '## لماذا لا ينفّذها جو',
                        'كل ما طُلب هنا عمل تنظيمي بشري (اجتماعات، تذاكر، لوحات إدارة) وليس بناء برمجي.',
                        'جو يكتب البرمجيات؛ فسجّلتُ المرحلة كوثيقة بدل ادّعاء تنفيذ لم يحدث.',
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

        const v = phase?.verificationTask;
        let verification = v;
        if (v && v.tool) {
            const rv = resolvePlannedTool(v.tool);
            verification = rv.tool ? { ...v, tool: rv.tool } : { ...v, tool: 'project_detect', args: {} };
        }

        return { ...phase, tasks: kept, verificationTask: verification };
    });

    return { phases: out, notes, executableTasks };
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
    content: ['text', 'body', 'data', 'source'],
    description: ['prompt', 'instruction', 'details', 'spec'],
    baseDir: ['dir', 'directory', 'folder', 'projectDir'],
    projectDescription: ['description', 'request', 'goal'],
    url: ['link', 'href', 'address'],
    packages: ['dependencies', 'deps', 'modules'],
};

/** When a required field is still missing, the least surprising real value. */
const REQUIRED_DEFAULTS: Record<string, Record<string, any>> = {
    git_ops: { operation: 'status' },
    npm_manager: { operation: 'install' },
    shell_execute: { command: 'npm run build' },
};

export function adaptPlannedArgs(toolName: string, args: any): any {
    const out: any = { ...(args || {}) };
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
    const bin = String(name || '').trim();
    if (!bin) return false;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
    const exts = process.platform === 'win32'
        ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean)
        : [''];
    for (const dir of dirs) {
        for (const ext of exts) {
            try { if (fs.existsSync(path.join(dir, bin + ext))) return true; } catch { /* unreadable PATH entry */ }
        }
    }
    return false;
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
        'This system writes software. It cannot open tickets, book meetings, hire people,',
        'or use Jira/Trello/Slack/Figma. Do not plan steps that need a human organisation.',
    ].join('\n');
}
