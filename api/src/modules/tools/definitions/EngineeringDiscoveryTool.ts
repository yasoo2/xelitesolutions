import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { isWithinRoot, resolveToolPath } from '../utils';

export type VerificationStatus = 'passed' | 'failed' | 'blocked' | 'not_run' | 'not_applicable';
export type ExecutionStatus = 'succeeded' | 'failed' | 'blocked' | 'not_started';
export type DeliveryStatus = 'complete' | 'partial' | 'blocked' | 'failed';

export interface EngineeringEvidence {
    version: 1;
    mode: 'existing_workspace' | 'remote_repository' | 'greenfield' | 'ambiguous';
    workspaceRoot: string;
    selectedProject?: {
        root: string;
        projectKinds: Array<'node' | 'python' | 'go' | 'other'>;
        manifests: Array<{ path: string; kind: string; scripts?: Record<string, string> }>;
        git: { isRepository: boolean; branch?: string; remote?: string; dirty?: boolean };
        likelyEntrypoints: string[];
        /** Bounded source files discovered on disk; safe inputs for read/edit planning. */
        sourceFiles?: string[];
        /** Workspace-relative test files discovered on disk; never inferred from scripts alone. */
        testFiles?: string[];
        candidateChecks: Array<{ kind: 'test' | 'build' | 'lint' | 'typecheck'; command: string; source: string }>;
    };
    /**
     * Read-only projects discovered while the request creates a separate new
     * project. They are architectural references only, never a write target.
     */
    referenceProjects?: Array<{
        root: string;
        projectKinds: Array<'node' | 'python' | 'go' | 'other'>;
        manifests: Array<{ path: string; kind: string; scripts?: Record<string, string> }>;
        git: { isRepository: boolean; branch?: string; remote?: string; dirty?: boolean };
        likelyEntrypoints: string[];
        /** Bounded source files discovered on disk; safe inputs for read/edit planning. */
        sourceFiles?: string[];
        /** Workspace-relative test files discovered on disk; never inferred from scripts alone. */
        testFiles?: string[];
        candidateChecks: Array<{ kind: 'test' | 'build' | 'lint' | 'typecheck'; command: string; source: string }>;
    }>;
    /**
     * Read-only candidates for a user-requested local brief/specification.
     * Paths are deliberately workspace-relative: evidence is handed to the
     * planner, and an absolute host path is neither a requirement nor a safe
     * tool argument for a portable engineering plan.
     */
    instructionFiles: Array<{ relativePath: string; lineCount: number }>;
    constraints: {
        localOnly: boolean;
        forbidDeploy: boolean;
        userRequestedExistingProject: boolean;
        /** The request creates a new project; discovered projects are not its target. */
        createsNewProject: boolean;
    };
    facts: Array<{ id: string; source: 'request' | 'workspace' | 'tool'; statement: string }>;
    blockers: Array<{ code: string; message: string; remedy?: string }>;
}

type Candidate = NonNullable<EngineeringEvidence['selectedProject']>;

/**
 * Read-only discovery is the first engineering action for project work.
 * It deliberately does not infer an implementation stack from business words:
 * it reports what exists, which checks the project declares, and what evidence
 * is still missing for a safe plan.
 */
export class EngineeringDiscoveryTool extends BaseTool {
    name = 'engineering_discovery';
    version = '1.0.0';
    description = 'Read-only engineering discovery. Inspect the selected workspace for existing projects, manifests, Git facts, likely entrypoints, and declared local checks before planning any file changes.';
    tags = ['engineering', 'discovery', 'workspace', 'analysis', 'evidence'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'The user request whose constraints should be captured as evidence.' },
            path: { type: 'string', description: 'Workspace-relative root to inspect. Defaults to the active workspace root.' },
            maxDepth: { type: 'number', description: 'Maximum project-search depth, from 1 to 6. Defaults to 3.' },
        },
        required: [],
    };

    outputSchema = { type: 'object' as const, properties: { evidence: { type: 'object' as const } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 30;

    async execute(input: any, context?: any) {
        const request = String(input?.request || '').trim();
        const logs: string[] = [];
        let workspaceRoot: string;
        try {
            const contextualRoot = typeof context?.workspaceRoot === 'string' && context.workspaceRoot.trim()
                ? path.resolve(context.workspaceRoot)
                : undefined;
            if (contextualRoot && fs.existsSync(contextualRoot)) {
                const requested = String(input?.path || '');
                workspaceRoot = path.resolve(contextualRoot, requested);
                if (!isWithinRoot(workspaceRoot, contextualRoot)) throw new Error(`path_outside_workspace: ${workspaceRoot}`);
            } else {
                workspaceRoot = resolveToolPath(String(input?.path || ''), { workspaceId: context?.workspaceId });
            }
        } catch (error: any) {
            return { ok: false, error: String(error?.message || error), logs };
        }
        if (!fs.existsSync(workspaceRoot)) return { ok: false, error: 'workspace root not found', logs };

        const facts: EngineeringEvidence['facts'] = [];
        const blockers: EngineeringEvidence['blockers'] = [];
        const remoteUrl = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/i.test(request);
        /**
         * «مستودع» IS A WAREHOUSE BEFORE IT IS A REPOSITORY.
         *
         * This list carried «مستودع» beside `repo`, `github` and `clone`, as a
         * bare substring with no boundary. Measured on a freight brief naming
         * «المستودعات» among its domains: the word matched, the request was
         * read as «operate on an existing repository», `createsNewProject`
         * came back false — and the deterministic rescue that exists for
         * exactly that request never fired. A warehouse cost him the build.
         *
         * The English words in this list are unambiguous; the Arabic one is
         * not, and a word with two meanings has to be read in context. So
         * «مستودع» counts only where a Git signal stands beside it, and every
         * term is boundary-asserted — `\b` is meaningless for Arabic, so the
         * boundary is spelled out.
         */
        const AR = '\u0621-\u064A';
        const gitContext = /(?:git|github|جيت|repo(?:sitory)?|clone|استنسخ|استورد|https?:\/\/)/i.test(request);
        /**
         * Existing-project language is not, by itself, an existing-project
         * target. A greenfield brief often says "inspect the existing
         * architecture" or "reuse working infrastructure" as a constraint;
         * treating those words as the write target makes a multi-project
         * workspace look ambiguous and blocks a safe new directory.
         *
         * Only explicit repository operations, or a mutating verb that points
         * at an existing/current project, select an existing target. Read-only
         * verbs such as inspect/analyze/verify remain evidence gathering.
         */
        const explicitExistingMutation = request
            .split(/[.!?\n]+/)
            .some((sentence) => {
                const mutation = /\b(?:fix|improve|update|modify|extend|refactor|debug|repair|maintain|continue|edit|add|build|create|develop|implement|clone|import|checkout|open|work\s+on)\b/i.test(sentence);
                // Existing-project requests often name the artifact by lifecycle,
                // not by the bare word "project": "current generated project",
                // "active build", and "last app" are unambiguous write targets
                // when a session has one on record. The ownership/currentness word
                // is required; accepting "generated project" on its own would
                // misclassify a legitimate greenfield request such as "build a
                // new generated project" in a crowded workspace.
                // Allow at most two descriptive words between that word and the
                // project noun so this remains an existing-target guard.
                // Generic taxonomy is not an existing write target: “this class of
                // application” describes the kind of product being built, whereas
                // “this application” or “this project” names the thing to edit.
                // Keep the distinction evidence-bound so a quality brief cannot
                // turn a crowded workspace into an ambiguity blocker.
                const genericCategoryReference = /\bthis\s+(?:class|type|kind|sort|category|family|form)\s+of\s+/i.test(sentence);
                const target = !genericCategoryReference && /(?:\b(?:existing|current|this|active|last)\s+(?:[A-Za-z0-9_-]+\s+){0,2}(?:project|codebase|workspace|application|system|app|build|artifact)\b|\b(?:repo(?:sitory)?|github)\b)/i.test(sentence);
                return mutation && target;
            });
        const requestedExisting =
            /(?:\brepo(?:sitory)?\b|\bgithub\b|\bclone\b|\bimport\b)/i.test(request)
            || explicitExistingMutation
            || new RegExp(`(^|[^${AR}])(?:جيت\s*هاب|استنسخ|استورد)(?=$|[^${AR}])`).test(request)
            || new RegExp(`(^|[^${AR}])(?:المشروع|الكود)\s*(?:الحالي|الموجود)(?=$|[^${AR}])`).test(request)
            || (gitContext && new RegExp(`(^|[^${AR}])(?:ال)?مستودع(?=$|[^${AR}])`).test(request));
        const forbidDeploy = /(?:لا|ليس|بدون|غير|do\s+not|don't|without|no)\s+(?:(?:أي|any|external)\s+)?(?:نشر|رفع|استضافة|deploy|publish|host|go\s*live)/i.test(request);
        const localOnly = forbidDeploy || /(?:محلي|local(?:ly)?|على\s+(?:جهازي|الجهاز)|on\s+(?:my\s+)?machine)/i.test(request);

        /**
         * «WHICH OF YOUR PROJECTS DO YOU MEAN?» IS THE WRONG QUESTION TO ASK
         * SOMEONE WHO JUST SAID «BUILD ME A NEW ONE».
         *
         * Discovery counted the manifests in the workspace and, at two or
         * more, declared the situation `ambiguous` — which the pipeline turns
         * into a hard block. Measured on this machine: 0 projects → builds,
         * 1 project → builds, 2+ → refused, with the owner's own folder
         * holding 24. From his third project onward, every new build request
         * stopped with «select a project root» and wrote nothing.
         *
         * Ambiguity is real, but it belongs to an operation that must LAND on
         * one existing project — edit it, test it, run it. A request to
         * create something new names no project because there is none to
         * name; its write scope is a fresh directory that cannot collide with
         * anything discovered. Counting manifests answers a question this
         * request never asked.
         *
         * So the intent is read first, by shape, and it decides which
         * question is even relevant.
         */
        // Lazy require: PlanningEngine -> toolCatalog -> registry -> definitions
        // -> this file is a cycle if imported at module load.
        const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
        /**
         * «اكمل» POINTS AT WORK THAT EXISTS — IT NEVER OPENS A FRESH DIRECTORY.
         *
         * A bare continuation — the verb alone, or the verb plus «the work /
         * ما تبقى / من حيث توقفت», naming no new thing to build — was read by
         * looksLikeBuild as a build, so a session that had just produced a real
         * artifact answered «اكمل» by scaffolding api-myapp and react-myapp
         * beside it: the subject-less brand fallback, wearing a folder. The
         * shape is finite (continuation verbs of two languages); the demotion
         * is gated on the session actually KNOWING its artifact, so a genuine
         * first build in an empty session is untouched.
         */
        const bareContinuation = /^\s*(?:اكمل|أكمل|كمل|كمّل|تابع|استمر|واصل|استأنف|continue|resume|proceed|finish(?:\s+it)?|keep\s+going)[\s!.،؟]*(?:من\s+حيث\s+توقفت|ما\s+تبق[ىي]|التنفيذ|العمل|المشروع|البناء|the\s+(?:work|project|build)|where\s+you\s+left\s+off)?[\s!.،؟]*$/i.test(request);
        const sessionArtifactKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const sessionArtifact = (global as any).joeProjects?.[sessionArtifactKey];
        const knownArtifactRoot = sessionArtifact?.dir && fs.existsSync(String(sessionArtifact.dir))
            ? String(sessionArtifact.dir) : '';
        const continuesKnownArtifact = bareContinuation && !!knownArtifactRoot;
        // An explicit repair/continuation request may name the active artifact
        // rather than using the bare word "continue". When the session already
        // records a built project, bind that request to the same root; otherwise
        // a crowded workspace can turn "current generated project" into a new
        // greenfield scaffold or an ambiguity blocker.
        const targetsKnownArtifact = !!knownArtifactRoot && (continuesKnownArtifact || explicitExistingMutation);
        const buildsSomethingNew = PlanningEngine.looksLikeBuild(request)
            && !explicitExistingMutation
            && !remoteUrl
            && !targetsKnownArtifact
            // «ابنِ على المشروع الحالي» / «أضف صفحة إلى الموقع» point AT
            // something that already exists — the noun is a target, not a
            // thing to be created.
            && !/(?:على|إلى|الى|in|into|to)\s+(?:هذا\s+)?(?:المشروع|المجلد|الموقع|التطبيق|النظام)\b/i.test(request);
        if (continuesKnownArtifact) {
            facts.push({
                id: 'request.continues_known_artifact',
                source: 'request',
                statement: `The request is a bare continuation; the session's known artifact at ${knownArtifactRoot} is its target — no new project directory may be created for it.`,
            });
        }
        if (buildsSomethingNew) {
            facts.push({
                id: 'request.creates_new_project',
                source: 'request',
                statement: 'The request asks for a NEW project; its write scope is a fresh directory, so previously discovered projects cannot be affected.',
            });
        }

        facts.push({ id: 'workspace.root', source: 'workspace', statement: `Workspace root selected: ${workspaceRoot}` });
        if (request) facts.push({ id: 'request.goal', source: 'request', statement: request.slice(0, 500) });
        if (forbidDeploy) facts.push({ id: 'request.forbid_deploy', source: 'request', statement: 'The request explicitly forbids deployment or publishing.' });
        if (remoteUrl) facts.push({ id: 'request.remote_repository', source: 'request', statement: 'The request contains a GitHub repository URL.' });

        const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache', 'vendor']);
        const maxDepth = Number.isFinite(input?.maxDepth) ? Math.max(1, Math.min(6, Number(input.maxDepth))) : 3;
        const roots = new Set<string>();
        const instructionFiles: EngineeringEvidence['instructionFiles'] = [];
        const isInstructionFile = (name: string) => /\.(?:md|txt|rst)$/i.test(name);
        /**
         * A repair workspace can be a real project before its manifest exists.
         * Discovery used to see only package/pyproject/requirements/go manifests,
         * so a failed build that had already written `src/` and `tests/` became a
         * greenfield workspace on rediscovery. The repair planner then received
         * no concrete root and could not create the missing runnable contract.
         *
         * This is deliberately narrow: only the active workspace root or a Git
         * root with implementation/test signals qualifies, and it is selected
         * only for an existing-project request below. Greenfield requests still
         * ignore incomplete roots as write targets.
         */
        const hasImplementationSignal = (entries: fs.Dirent[]) => {
            const names = new Set(entries.map(entry => entry.name));
            return names.has('src') || names.has('app') || names.has('tests') || names.has('test') || names.has('__tests__')
                || entries.some(entry => entry.isFile() && /\.(?:[cm]?[jt]sx?|py|go)$/i.test(entry.name));
        };
        /**
         * Do not cap discovered project roots by an arbitrary count. A workspace
         * can legitimately contain more than 24 projects, and an explicitly
         * named target must remain discoverable even when it sorts later than
         * older projects. Search breadth is bounded by maxDepth and ignored
         * dependency/build directories instead; ambiguity is resolved only
         * after the complete bounded scan, never by truncating candidates.
         */
        const visit = (dir: string, depth: number) => {
            if (depth > maxDepth) return;
            let entries: fs.Dirent[] = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            const names = new Set(entries.map(entry => entry.name));
            const hasManifest = names.has('package.json') || names.has('pyproject.toml') || names.has('requirements.txt') || names.has('go.mod');
            const isIncompleteProjectRoot = !hasManifest
                && hasImplementationSignal(entries)
                && (depth === 0 || names.has('.git'));
            if (hasManifest || isIncompleteProjectRoot) roots.add(dir);
            for (const entry of entries) {
                const entryPath = path.join(dir, entry.name);
                if (entry.isFile() && isInstructionFile(entry.name) && instructionFiles.length < 32) {
                    try {
                        const lineCount = fs.readFileSync(entryPath, 'utf8').split('\n').length;
                        const relativePath = path.relative(workspaceRoot, entryPath).replace(/\\/g, '/');
                        // Discovery only emits paths that later tools may safely
                        // receive. `entryPath` is a host-local implementation
                        // detail, never planner evidence.
                        if (relativePath && !relativePath.startsWith('../') && !path.isAbsolute(relativePath)) {
                            instructionFiles.push({ relativePath, lineCount });
                        }
                    } catch { /* unreadable documents are not evidence */ }
                }
                if (!entry.isDirectory() || entry.name.startsWith('.') || ignored.has(entry.name)) continue;
                visit(entryPath, depth + 1);
            }
        };
        visit(workspaceRoot, 0);

        const candidates = [...roots].sort((a, b) => a.localeCompare(b)).map(root => this.inspectProject(root));
        for (const candidate of candidates) {
            if (candidate.manifests.length === 0 && (candidate.likelyEntrypoints.length > 0 || (candidate.testFiles || []).length > 0)) {
                facts.push({
                    id: 'workspace.incomplete_project',
                    source: 'workspace',
                    statement: `Implementation and/or tests were found at ${candidate.root}, but no project manifest is present; the root is repairable evidence, not a greenfield template target.`,
                });
            }
        }
        const requestText = request.toLowerCase();
        const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const normalizedRequest = normalized(request);
        // A phrase such as `project named react-weathergo-a587` is an explicit
        // write-target declaration. It must outrank a stale session artifact or
        // a sibling API candidate, while a name following `not` is exclusion
        // evidence and must never become the write target.
        const explicitlyNamedProjectNames = [...requestText.matchAll(/\b(?:named|called)\s+([a-z0-9][a-z0-9_-]*)/gi)]
            .map(match => normalized(match[1]));
        const isExplicitlyExcluded = (candidate: Candidate) => {
            const name = normalized(path.basename(candidate.root));
            return [
                `not ${name}`,
                `rather than ${name}`,
                `instead of ${name}`,
                `exclude ${name}`,
                `excluding ${name}`,
            ].some(phrase => normalizedRequest.includes(phrase));
        };
        const explicitlyNamedCandidate = candidates.find(candidate => {
            const name = normalized(path.basename(candidate.root));
            return explicitlyNamedProjectNames.includes(name) && !isExplicitlyExcluded(candidate);
        });
        let selectedProject: Candidate | undefined;
        if (explicitlyNamedCandidate) {
            selectedProject = explicitlyNamedCandidate;
            facts.push({ id: 'workspace.selected_project_by_explicit_name', source: 'request', statement: `The explicit project name in the request selected ${selectedProject.root}; excluded sibling names are not write targets.` });
        }
        // A continuation SELECTS the artifact the session already knows —
        // twenty-four other projects in the workspace are not ambiguity when
        // the target is on record.
        if (!selectedProject && targetsKnownArtifact) {
            selectedProject = candidates.find(c => path.resolve(c.root) === path.resolve(knownArtifactRoot))
                || this.inspectProject(knownArtifactRoot);
            facts.push({ id: 'workspace.selected_project', source: 'workspace', statement: `The request is bound to the session's known artifact at ${selectedProject.root}.` });
        } else if (!selectedProject && !buildsSomethingNew && requestedExisting && candidates.length > 1) {
            /**
             * A new browser chat does not inherit the previous chat's
             * sessionArtifact record.  An explicit repair request must still
             * be actionable when it names the artifact: "fix the existing
             * WeatherGo project" is not a reason to ask the user to choose
             * among every project in the workspace.
             *
             * Score only evidence present in the request and candidate root.
             * Prefer a runnable React application for an app/UI brief and a
             * runnable API for a server brief.  A tied score remains blocked;
             * Joe must never guess between equally named write targets.
             */
            const wordInRequest = (word: string) => word.length >= 3 && new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}(?=$|[^a-z0-9])`, 'i').test(requestText);
            const appBrief = /\b(?:app|application|frontend|front\s*end|react|ui|website|web|mobile|browser|page)\b/i.test(request);
            const apiBrief = /\b(?:api|backend|back\s*end|server|endpoint|database)\b/i.test(request);
            const scored = candidates.map(candidate => {
                const base = path.basename(candidate.root);
                const candidateName = normalized(base);
                const parts = candidateName.split(/\s+/).filter(Boolean);
                let score = 0;
                if (explicitlyNamedProjectNames.includes(candidateName)) score += 120;
                if (isExplicitlyExcluded(candidate)) score -= 300;
                if (wordInRequest(candidateName.replace(/\s+/g, ''))) score += 20;
                for (const part of parts) if (wordInRequest(part)) score += 10;
                if (appBrief && /(?:^|[-_])react(?:[-_]|$)/i.test(base)) score += 20;
                if (apiBrief && /(?:^|[-_])api(?:[-_]|$)/i.test(base)) score += 20;
                if (appBrief && /(?:^|[-_])api(?:[-_]|$)/i.test(base)) score -= 12;
                if (apiBrief && /(?:^|[-_])react(?:[-_]|$)/i.test(base)) score -= 12;
                if (candidate.manifests.length > 0) score += 4;
                if (candidate.candidateChecks.some(check => check.kind === 'build')) score += 4;
                if (candidate.candidateChecks.some(check => check.kind === 'test')) score += 4;
                return { candidate, score };
            }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.candidate.root.localeCompare(b.candidate.root));
            const best = scored[0];
            const runnerUp = scored[1];
            if (best && (!runnerUp || best.score > runnerUp.score)) {
                selectedProject = best.candidate;
                facts.push({ id: 'workspace.selected_project_by_name', source: 'request', statement: `The explicit project name in the request selected ${selectedProject.root} with evidence score ${best.score}; other projects remain untouched.` });
            }
        }
        if (!selectedProject && candidates.length === 1 && !buildsSomethingNew) {
            selectedProject = candidates[0];
            facts.push({ id: 'workspace.selected_project', source: 'workspace', statement: `Exactly one project was detected at ${selectedProject.root}.` });
        } else if (!selectedProject && candidates.length > 1 && !buildsSomethingNew) {
            blockers.push({
                code: 'multiple_projects',
                message: `Detected ${candidates.length} projects; no project was selected automatically.`,
                // The remedy has to name the input that carries the answer, or
                // it is an instruction with no wire behind it: the caller is
                // told to "select a project root" without being told how.
                remedy: 'Re-run discovery with `path` set to the project root, or name one project in the request, before writing files.',
            });
            facts.push({ id: 'workspace.multiple_projects', source: 'workspace', statement: `Detected project roots: ${candidates.map(candidate => candidate.root).join(', ')}` });
        } else if (!selectedProject && candidates.length > 1) {
            facts.push({
                id: 'workspace.other_projects_untouched',
                source: 'workspace',
                statement: `Detected ${candidates.length} existing projects; none of them is the target — this request creates a new one and will not modify them.`,
            });
        }

        let mode: EngineeringEvidence['mode'];
        if (remoteUrl && !selectedProject) {
            mode = 'remote_repository';
            blockers.push({ code: 'remote_not_cloned', message: 'The repository URL has not been cloned into the selected workspace.', remedy: 'Clone/import the repository, then run discovery on its local root.' });
        } else if (selectedProject && !buildsSomethingNew) {
            mode = 'existing_workspace';
        } else if (buildsSomethingNew) {
            // A new project is greenfield no matter what else is on the disk:
            // it writes into its own directory and reads nothing else.
            mode = 'greenfield';
        } else if (candidates.length > 1) {
            mode = 'ambiguous';
        } else {
            mode = 'greenfield';
            facts.push({ id: 'workspace.empty_of_known_projects', source: 'workspace', statement: 'No Node, Python, or Go project manifest was detected in the scanned workspace.' });
        }

        const referenceProjects = buildsSomethingNew ? candidates : undefined;
        if (referenceProjects?.length) {
            facts.push({
                id: 'workspace.reference_projects',
                source: 'workspace',
                statement: `The new project may use ${referenceProjects.length} discovered project(s) as read-only architecture and stack references; their files are not write targets.`,
            });
        }

        const evidence: EngineeringEvidence = {
            version: 1,
            mode,
            workspaceRoot,
            selectedProject,
            referenceProjects,
            instructionFiles: instructionFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
            constraints: { localOnly, forbidDeploy, userRequestedExistingProject: requestedExisting, createsNewProject: buildsSomethingNew },

            facts,
            blockers,
        };
        logs.push(`engineering_discovery.root=${workspaceRoot}`);
        logs.push(`engineering_discovery.mode=${mode}`);
        logs.push(`engineering_discovery.projects=${candidates.length}`);
        logs.push(`engineering_discovery.instruction_files=${instructionFiles.length}`);
        logs.push(`engineering_discovery.blockers=${blockers.length}`);
        return { ok: true, output: { evidence }, logs };
    }

    private inspectProject(root: string): Candidate {
        const manifests: Candidate['manifests'] = [];
        const kinds = new Set<Candidate['projectKinds'][number]>();
        const checks: Candidate['candidateChecks'] = [];
        const addCheck = (kind: 'test' | 'build' | 'lint' | 'typecheck', command: string, source: string) => {
            if (!checks.some(item => item.command === command && item.source === source)) checks.push({ kind, command, source });
        };
        const packagePath = path.join(root, 'package.json');
        if (fs.existsSync(packagePath)) {
            kinds.add('node');
            let scripts: Record<string, string> | undefined;
            try {
                const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                scripts = parsed && typeof parsed.scripts === 'object' ? parsed.scripts : undefined;
            } catch { /* The manifest still exists; planning records only facts that parsed. */ }
            manifests.push({ path: packagePath, kind: 'package.json', scripts });
            for (const [name, value] of Object.entries(scripts || {})) {
                if (typeof value !== 'string') continue;
                const lower = name.toLowerCase();
                if (/^(test|test:)/.test(lower)) addCheck('test', `npm run ${name}`, packagePath);
                else if (/^(build|build:)/.test(lower)) addCheck('build', `npm run ${name}`, packagePath);
                else if (/^(lint|lint:)/.test(lower)) addCheck('lint', `npm run ${name}`, packagePath);
                else if (/(typecheck|type-check|check:types)/.test(lower)) addCheck('typecheck', `npm run ${name}`, packagePath);
            }
        }
        for (const name of ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py']) {
            const manifestPath = path.join(root, name);
            if (!fs.existsSync(manifestPath)) continue;
            kinds.add('python');
            manifests.push({ path: manifestPath, kind: name });
        }
        if (kinds.has('python') && (fs.existsSync(path.join(root, 'tests')) || fs.existsSync(path.join(root, 'test')))) addCheck('test', 'python -m unittest discover -s tests', root);
        const goMod = path.join(root, 'go.mod');
        if (fs.existsSync(goMod)) {
            kinds.add('go');
            manifests.push({ path: goMod, kind: 'go.mod' });
            addCheck('test', 'go test ./...', goMod);
        }
        if (!kinds.size) kinds.add('other');

        const entryCandidates = ['src/index.ts', 'src/main.ts', 'src/main.tsx', 'src/index.tsx', 'src/App.tsx', 'src/App.jsx', 'index.ts', 'index.js', 'main.py', 'app.py', 'main.go'];
        const likelyEntrypoints = entryCandidates.filter(file => fs.existsSync(path.join(root, file))).map(file => path.join(root, file));
        const sourceFiles = this.inspectSourceFiles(root);
        const testFiles = this.inspectTestFiles(root);
        const git = this.inspectGit(root);
        return { root: path.resolve(root), projectKinds: [...kinds], manifests, git, likelyEntrypoints, sourceFiles, testFiles, candidateChecks: checks };
    }

    private inspectSourceFiles(root: string): string[] {
        const found: string[] = [];
        const skip = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache', '.turbo', 'vendor']);
        const sourceExtension = /\.(?:c|m)?(?:js|jsx|ts|tsx|py|go|java|rb|rs|vue|svelte|css|scss)$/i;
        const visit = (dir: string, depth: number) => {
            if (found.length >= 120 || depth > 6) return;
            let entries: fs.Dirent[];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
                if (found.length >= 120) return;
                if (entry.name.startsWith('.') || skip.has(entry.name)) continue;
                const absolute = path.join(dir, entry.name);
                if (entry.isDirectory()) visit(absolute, depth + 1);
                else if (entry.isFile() && sourceExtension.test(entry.name)) found.push(absolute);
            }
        };
        visit(root, 0);
        return found;
    }

    private inspectTestFiles(root: string): string[] {
        const found: string[] = [];
        const skip = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache', '.turbo']);
        const visit = (dir: string, depth: number) => {
            if (found.length >= 40 || depth > 6) return;
            let entries: fs.Dirent[];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
                if (found.length >= 40) return;
                if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
                const absolute = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!skip.has(entry.name)) visit(absolute, depth + 1);
                    continue;
                }
                if (!entry.isFile()) continue;
                const relative = path.relative(root, absolute).split(path.sep).join('/');
                if (/(?:^|\/)(?:__tests__|tests?|spec)(?:\/|$)/i.test(relative) || /(?:\.test|\.spec)\.[cm]?[jt]sx?$|_test\.py$|_test\.go$/i.test(relative)) {
                    found.push(absolute);
                }
            }
        };
        visit(root, 0);
        return found;
    }

    private inspectGit(root: string): Candidate['git'] {
        const gitPath = path.join(root, '.git');
        if (!fs.existsSync(gitPath)) return { isRepository: false };
        const gitDir = fs.statSync(gitPath).isDirectory() ? gitPath : '';
        if (!gitDir) return { isRepository: true };
        let branch: string | undefined;
        let remote: string | undefined;
        try {
            const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
            const ref = /^ref:\s+(.+)$/.exec(head)?.[1];
            branch = ref ? ref.split('/').pop() : undefined;
        } catch { /* Git metadata can be incomplete in a copied workspace. */ }
        try {
            const config = fs.readFileSync(path.join(gitDir, 'config'), 'utf8');
            remote = /^\s*url\s*=\s*(.+)$/m.exec(config)?.[1]?.trim();
        } catch { /* Remote is optional evidence. */ }
        return { isRepository: true, branch, remote };
    }
}
