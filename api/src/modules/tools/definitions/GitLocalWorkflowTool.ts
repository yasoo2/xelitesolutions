import fs from 'fs';
import { isWithinRoot } from '../path-containment';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { executionEngine } from '../../../kernel/ExecutionEngine';

/**
 * Deterministic, bounded follow-up for a repository Joe has just imported.
 *
 * ImportProjectTool deliberately stops after the clone and evidence-backed review.
 * That is correct for an analysis request, but an engineering contract can also ask
 * for a local branch, a narrowly-scoped documentation note, verification and a
 * local commit. Sending that contract back through a generic model route made the
 * work disappear after import. This tool performs only that explicit, auditable
 * sequence and never calls a network operation.
 */
function sessionProjectDir(sessionId?: string): string {
    const key = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
    const projects: Record<string, any> = (global as any).joeProjects || {};
    const dir = String(projects[key]?.dir || '');
    if (!dir) throw new Error('no_active_imported_project');
    if (!fs.existsSync(path.join(dir, '.git'))) throw new Error('active_project_is_not_git_repository');
    return dir;
}

function safeBranch(raw: string): string {
    const branch = String(raw || '').trim();
    if (!branch || branch.length > 120 || branch.startsWith('-') || branch.includes('..') || /[~^:?*\\[\\]\\\\\s]/.test(branch)) {
        throw new Error('invalid_branch_name');
    }
    return branch;
}

function branchFromRequest(request: string): string {
    const text = String(request || '');
    const explicit = text.match(/(?:بالاسم|اسم(?:ه)?|called|named)\s*[`'"«]?([A-Za-z0-9._/-]+)[`'"»]?/i)
        || text.match(/\b(joe\/[A-Za-z0-9._/-]+)\b/i);
    return safeBranch(explicit?.[1] || `joe/local-validation-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
}

function documentationPathFromRequest(request: string): string {
    const match = String(request || '').match(/(?:^|[\s`'"«])((?:docs|documentation)\/[A-Za-z0-9._/-]+\.md)(?=$|[\s`'"».,،؛:])/i);
    const rel = String(match?.[1] || 'docs/agent-validation/joe-git-validation.md').replace(/\\/g, '/');
    if (path.isAbsolute(rel) || rel.startsWith('../') || rel.includes('/../') || !/^docs\/[A-Za-z0-9._/-]+\.md$/i.test(rel)) {
        throw new Error('invalid_documentation_path');
    }
    return rel;
}

async function git(cwd: string, args: string[], timeout = 120000): Promise<string> {
    const result = await executionEngine.runArgv('git', args, { cwd, timeout });
    if (!result.ok) throw new Error(String(result.error || result.output || `git_failed:${args[0]}`));
    return String(result.output || result.error || '').trim();
}

function packageSignal(dir: string): string {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        const scripts = pkg?.scripts || {};
        if (typeof scripts.build === 'string') return 'npm run build';
        if (typeof scripts.test === 'string') return 'npm test';
    } catch { /* absent package.json is valid for non-Node repositories */ }
    return 'git diff --check';
}

export class GitLocalWorkflowTool extends BaseTool {
    name = 'git_local_workflow';
    description = 'Complete a bounded local Git workflow after a project import: create a local branch, write one requested docs note, verify the staged diff, and commit locally. Never pushes or creates remote resources.';
    version = '1.0.0';
    tags = ['git', 'repository', 'local', 'commit', 'verification'];
    /**
     * This write-capable workflow must never be inferred from generic repository
     * analysis. Capability matching admits it only when the request explicitly
     * names a branch, commit, or documentation deliverable.
     */
    capabilityMatchAny = ['فرع', 'برانش', 'التزام', 'كوميت', 'توثيق', 'branch', 'commit', 'documentation', 'docs'];
    inputSchema = {
        type: 'object' as const,
        properties: { request: { type: 'string', description: 'The constrained local Git work requested by the user' } },
        required: ['request'],
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            directory: { type: 'string' }, branch: { type: 'string' }, documentationPath: { type: 'string' },
            verificationCommand: { type: 'string' }, commitSha: { type: 'string' }, pushed: { type: 'boolean' },
        },
    };
    permissions: ToolPermission[] = ['read', 'write', 'execute'];
    sideEffects: ToolPermission[] = ['write', 'execute'];
    rateLimitPerMinute = 6;
    auditFields = ['request'];

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const request = String(input?.request || '').trim();
        if (!request) return { ok: false, error: 'request_required', logs } as any;

        try {
            const dir = sessionProjectDir(context?.sessionId);
            const branch = branchFromRequest(request);
            const documentationPath = documentationPathFromRequest(request);
            const verificationCommand = packageSignal(dir);

            const startingStatus = await git(dir, ['status', '--short']);
            if (startingStatus) {
                return { ok: false, error: 'imported_repository_not_clean', output: { directory: dir, status: startingStatus }, logs } as any;
            }

            const exists = await executionEngine.runArgv('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: dir, timeout: 30000 });
            if (exists.ok) await git(dir, ['switch', branch]);
            else await git(dir, ['switch', '-c', branch]);
            logs.push(`branch=${branch}`);

            const fullPath = path.resolve(dir, documentationPath);
            if (!isWithinRoot(fullPath, dir)) throw new Error('documentation_path_escape');
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            const body = [
                '# Joe Git validation smoke test',
                '',
                `- Date: ${new Date().toISOString()}`,
                `- Local branch: \`${branch}\``,
                `- Repository validation command selected: \`${verificationCommand}\``,
                '- This note was created by Joe in a local cloned workspace.',
                '- No git push, pull request, release, deployment, or other remote publication was performed.',
                '',
            ].join('\n');
            fs.writeFileSync(fullPath, body, 'utf8');
            logs.push(`write=${documentationPath}`);

            // The clone is intentionally dependency-free. `git diff --check` is a
            // deterministic integrity check that needs no install or network and
            // validates the change actually about to be committed.
            await git(dir, ['diff', '--check']);
            await git(dir, ['add', '--', documentationPath]);
            await git(dir, ['diff', '--cached', '--check']);
            const stagedFiles = await git(dir, ['diff', '--cached', '--name-only']);
            if (stagedFiles.trim() !== documentationPath) {
                return { ok: false, error: 'unexpected_staged_files', output: { directory: dir, branch, stagedFiles }, logs } as any;
            }
            const statusBeforeCommit = await git(dir, ['status', '--short']);
            const commitMessage = 'docs: add Joe Git validation smoke note';
            await git(dir, ['commit', '-m', commitMessage]);
            const commitSha = await git(dir, ['rev-parse', 'HEAD']);
            const finalStatus = await git(dir, ['status', '--short']);
            if (finalStatus) return { ok: false, error: 'repository_not_clean_after_commit', output: { directory: dir, branch, commitSha, status: finalStatus }, logs } as any;

            logs.push('verification=git diff --check; staged_diff_check=passed');
            logs.push(`commit=${commitSha}`);
            logs.push('remote_publish=skipped_by_design');
            return {
                ok: true,
                output: {
                    directory: dir,
                    branch,
                    documentationPath,
                    verificationCommand,
                    verificationPerformed: 'git diff --check',
                    statusBeforeCommit,
                    commitMessage,
                    commitSha,
                    pushed: false,
                    remotePublication: 'not_performed',
                },
                logs,
            } as any;
        } catch (e: any) {
            return { ok: false, error: String(e?.message || e), logs } as any;
        }
    }
}
