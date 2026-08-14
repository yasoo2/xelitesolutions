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
        candidateChecks: Array<{ kind: 'test' | 'build' | 'lint' | 'typecheck'; command: string; source: string }>;
    };
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
        const requestedExisting = /(?:repo(?:sitory)?|github|clone|import|existing|current|this\s+(?:project|codebase)|مستودع|جيت\s*هاب|استنسخ|استورد|المشروع\s*(?:الحالي|الموجود)|الكود\s*(?:الحالي|الموجود))/i.test(request);
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
        const buildsSomethingNew = PlanningEngine.looksLikeBuild(request)
            && !requestedExisting
            && !remoteUrl
            // «ابنِ على المشروع الحالي» / «أضف صفحة إلى الموقع» point AT
            // something that already exists — the noun is a target, not a
            // thing to be created.
            && !/(?:على|إلى|الى|in|into|to)\s+(?:هذا\s+)?(?:المشروع|المجلد|الموقع|التطبيق|النظام)\b/i.test(request);
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
        const visit = (dir: string, depth: number) => {
            if (depth > maxDepth || roots.size >= 24) return;
            let entries: fs.Dirent[] = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            const names = new Set(entries.map(entry => entry.name));
            if (names.has('package.json') || names.has('pyproject.toml') || names.has('requirements.txt') || names.has('go.mod')) roots.add(dir);
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
        let selectedProject: Candidate | undefined;
        if (candidates.length === 1) {
            selectedProject = candidates[0];
            facts.push({ id: 'workspace.selected_project', source: 'workspace', statement: `Exactly one project was detected at ${selectedProject.root}.` });
        } else if (candidates.length > 1 && !buildsSomethingNew) {
            blockers.push({
                code: 'multiple_projects',
                message: `Detected ${candidates.length} projects; no project was selected automatically.`,
                // The remedy has to name the input that carries the answer, or
                // it is an instruction with no wire behind it: the caller is
                // told to "select a project root" without being told how.
                remedy: 'Re-run discovery with `path` set to the project root, or name one project in the request, before writing files.',
            });
            facts.push({ id: 'workspace.multiple_projects', source: 'workspace', statement: `Detected project roots: ${candidates.map(candidate => candidate.root).join(', ')}` });
        } else if (candidates.length > 1) {
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

        const evidence: EngineeringEvidence = {
            version: 1,
            mode,
            workspaceRoot,
            selectedProject,
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

        const entryCandidates = ['src/index.ts', 'src/main.ts', 'src/main.tsx', 'src/index.tsx', 'index.ts', 'index.js', 'main.py', 'app.py', 'main.go'];
        const likelyEntrypoints = entryCandidates.filter(file => fs.existsSync(path.join(root, file))).map(file => path.join(root, file));
        const git = this.inspectGit(root);
        return { root: path.resolve(root), projectKinds: [...kinds], manifests, git, likelyEntrypoints, candidateChecks: checks };
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
