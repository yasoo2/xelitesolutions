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
export interface PlanSanitiseOptions {
    /** Greenfield work without a user-selected stack may create only explicit, file-level work. */
    disallowImplicitScaffold?: boolean;
}

export function sanitisePlanPhases(phases: any[], projectDir = '', options: PlanSanitiseOptions = {}): SanitisedPlan {
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
                // A greenfield request without an explicit stack is not permission
                // to invent one. A seed tool encodes a framework and dependency
                // decision; retain only precise file-level work until the user or
                // inspected evidence supplies that decision.
                const seedTools = new Set(['scaffold_project', 'scaffold_full_stack', 'react_project', 'api_project', 'web_page_builder', 'mobile_builder']);
                if (options.disallowImplicitScaffold && seedTools.has(r.tool)) {
                    notes.push(`[plan] أسقطتُ «${desc}» — لا توجد تقنية أو إطار مُختار صراحةً لهذه المساحة الجديدة؛ لن أُنشئ scaffold افتراضياً.`);
                    continue;
                }
                // A recognised name is still not automatically runnable: model
                // arguments must satisfy the real tool contract.  Otherwise an
                // invented action (for example `create` on a migrator that only
                // supports migrate/push/reset/status) reaches execution, fails,
                // and is wrongly treated as a code defect for self-healing.
                const adaptedArgs = adaptPlannedArgs(r.tool, { ...(task?.args || {}), ...(task?.input || {}) });
                const argsIssue = plannedArgsIssue(r.tool, adaptedArgs);
                if (argsIssue) {
                    notes.push(`[plan] أسقطتُ «${desc}» — ${argsIssue}`);
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

    return { phases: stampPlanDependencies(out, notes), notes, executableTasks };
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
        // dist/ and only dist/: that is exactly what the preview route serves,
        // and an address it cannot serve is no better than no address at all.
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
        const dist = path.join(String(entry.dir), 'dist', 'index.html');
        if (!fs.existsSync(dist)) return `no_url: المشروع مسجّل في ${entry.dir} لكن لا يوجد dist/index.html — البناء لم يكتمل.`;
    } catch (e: any) {
        return `no_url: تعذّر فحص مجلّد المشروع — ${e?.message || e}`;
    }
    return 'no_url: العنوان تعذّر تكوينه رغم وجود البناء.';
}

/** The browser tools that audit or read a page and cannot invent their own address. */
const NEEDS_BUILT_URL = new Set(['browser_ui_audit', 'browser_screenshot', 'browser_extract', 'browser_open']);

/**
 * Validate model-written arguments that use a closed action vocabulary.
 *
 * This is deliberately separate from JSON-schema validation: plans can be
 * loaded from old sessions or repair tickets and must be rejected before any
 * side-effecting tool executes.  The return value is a user-facing reason, not
 * a silent coercion; we never guess a migration operation from prose.
 */
export function plannedArgsIssue(toolName: string, args: any): string | null {
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
    return null;
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
        'This system writes software. It cannot open tickets, book meetings, hire people,',
        'or use Jira/Trello/Slack/Figma. Do not plan steps that need a human organisation.',
    ].join('\n');
}
