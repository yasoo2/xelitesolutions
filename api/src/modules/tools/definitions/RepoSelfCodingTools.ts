import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

function getRepoRoot() {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === 'api' ? path.resolve(cwd, '..') : cwd;
}

function assertSafeRelativePath(rawPath: string) {
  const rel = String(rawPath || '').trim();
  if (!rel) throw new Error('path_required');
  if (path.isAbsolute(rel)) throw new Error('absolute_paths_not_allowed');
  if (rel.includes('\0')) throw new Error('invalid_path');
  const blocked = ['.env', '.env.local', '.env.production', '.env.development'];
  const normalized = rel.replace(/\\/g, '/');
  if (blocked.some(name => normalized === name || normalized.endsWith('/' + name))) {
    throw new Error('secrets_file_write_blocked');
  }
  const root = getRepoRoot();
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep) && full !== root) throw new Error('path_outside_repo');
  return { rel: normalized, full };
}

function walkFiles(dir: string, maxFiles = 500) {
  const root = getRepoRoot();
  const results: string[] = [];
  const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage']);

  function walk(current: string) {
    if (results.length >= maxFiles) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (ignored.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else results.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  }

  walk(dir);
  return results;
}

function makeUnifiedLikePreview(oldText: string, newText: string, maxLines = 120) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines: string[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max && lines.length < maxLines; i += 1) {
    const a = oldLines[i];
    const b = newLines[i];
    if (a === b) continue;
    if (typeof a !== 'undefined') lines.push(`- ${a}`);
    if (typeof b !== 'undefined') lines.push(`+ ${b}`);
  }
  return lines.join('\n');
}

function isAllowedCommand(raw: string) {
  const command = String(raw || '').trim();
  if (!command) return false;
  const lower = command.toLowerCase();
  const blockedFragments = ['rm ', 'rm -', 'sudo', 'curl ', 'wget ', '| sh', '| bash', 'chmod ', 'chown ', 'mkfs', 'dd ', ':(){', 'shutdown', 'reboot', 'docker system prune'];
  if (blockedFragments.some(fragment => lower.includes(fragment))) return false;
  const allowedPrefixes = [
    'npm test',
    'npm run test',
    'npm run build',
    'npm run lint',
    'npm run typecheck',
    'npx tsc --noemit',
    'npx tsc --noEmit',
    'tsc --noemit',
    'tsc --noEmit',
    'git diff',
    'git status',
    'git log'
  ];
  return allowedPrefixes.some(prefix => command === prefix || command.startsWith(prefix + ' '));
}

function runSafeCommand(command: string, cwd: string, timeoutMs: number) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { }
      resolve({ code: 124, stdout, stderr: stderr + '\ncommand_timeout' });
    }, timeoutMs);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr });
    });
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: String(err?.message || err) });
    });
  });
}

export class RepoReadFileTool extends BaseTool {
  name = 'repo_read_file';
  description = 'Read a UTF-8 file from the current repository using a safe relative path.';
  version = '1.0.0';
  tags = ['repo', 'self-coding', 'read'];
  inputSchema = { type: 'object' as const, properties: { path: { type: 'string' } }, required: ['path'] };
  permissions: ToolPermission[] = ['read'];
  sideEffects: ToolPermission[] = [];
  rateLimitPerMinute = 120;
  auditFields = ['path'];

  async execute(input: any) {
    const logs: string[] = [];
    try {
      const { rel, full } = assertSafeRelativePath(input?.path);
      if (!fs.existsSync(full)) return { ok: false, error: 'file_not_found', logs };
      if (!fs.statSync(full).isFile()) return { ok: false, error: 'not_a_file', logs };
      const content = fs.readFileSync(full, 'utf-8');
      logs.push(`read=${rel}`);
      return { ok: true, output: { path: rel, content, bytes: Buffer.byteLength(content, 'utf-8') }, logs };
    } catch (e: any) {
      return { ok: false, error: e.message, logs };
    }
  }
}

export class RepoSearchTool extends BaseTool {
  name = 'repo_search';
  description = 'Search repository files by text query with safe default ignores.';
  version = '1.0.0';
  tags = ['repo', 'self-coding', 'search'];
  inputSchema = { type: 'object' as const, properties: { query: { type: 'string' }, path: { type: 'string' }, maxResults: { type: 'number' } }, required: ['query'] };
  permissions: ToolPermission[] = ['read'];
  sideEffects: ToolPermission[] = [];
  rateLimitPerMinute = 60;
  auditFields = ['query', 'path'];

  async execute(input: any) {
    const logs: string[] = [];
    try {
      const query = String(input?.query || '');
      if (!query) return { ok: false, error: 'query_required', logs };
      const base = input?.path ? assertSafeRelativePath(input.path).full : getRepoRoot();
      const maxResults = Math.min(Number(input?.maxResults || 50), 100);
      const files = fs.statSync(base).isDirectory() ? walkFiles(base, 800) : [path.relative(getRepoRoot(), base).replace(/\\/g, '/')];
      const matches: any[] = [];
      for (const rel of files) {
        if (matches.length >= maxResults) break;
        const full = path.resolve(getRepoRoot(), rel);
        let content = '';
        try { content = fs.readFileSync(full, 'utf-8'); } catch { continue; }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i].includes(query)) {
            matches.push({ path: rel, line: i + 1, preview: lines[i].slice(0, 240) });
            if (matches.length >= maxResults) break;
          }
        }
      }
      logs.push(`search=${query} count=${matches.length}`);
      return { ok: true, output: { query, matches, count: matches.length }, logs };
    } catch (e: any) {
      return { ok: false, error: e.message, logs };
    }
  }
}

export class RepoApplyPatchTool extends BaseTool {
  name = 'repo_apply_patch';
  description = 'Apply a conservative find/replace patch to a repository file. Supports dryRun preview.';
  version = '1.0.0';
  tags = ['repo', 'self-coding', 'patch', 'write'];
  inputSchema = {
    type: 'object' as const,
    properties: {
      path: { type: 'string' },
      find: { type: 'string' },
      replace: { type: 'string' },
      dryRun: { type: 'boolean' }
    },
    required: ['path', 'find', 'replace']
  };
  permissions: ToolPermission[] = ['read', 'write'];
  sideEffects: ToolPermission[] = ['write'];
  rateLimitPerMinute = 30;
  auditFields = ['path'];

  async execute(input: any) {
    const logs: string[] = [];
    try {
      const { rel, full } = assertSafeRelativePath(input?.path);
      const find = String(input?.find ?? '');
      const replace = String(input?.replace ?? '');
      const dryRun = input?.dryRun !== false;
      if (!find) return { ok: false, error: 'find_required', logs };
      if (!fs.existsSync(full)) return { ok: false, error: 'file_not_found', logs };
      const before = fs.readFileSync(full, 'utf-8');
      if (!before.includes(find)) return { ok: false, error: 'find_text_not_found', logs };
      const after = before.replace(find, replace);
      const preview = makeUnifiedLikePreview(before, after);
      if (!dryRun) fs.writeFileSync(full, after);
      logs.push(`${dryRun ? 'patch_preview' : 'patch_applied'}=${rel}`);
      return { ok: true, output: { path: rel, dryRun, changed: before !== after, preview }, logs };
    } catch (e: any) {
      return { ok: false, error: e.message, logs };
    }
  }
}

export class RepoRunCommandTool extends BaseTool {
  name = 'repo_run_command';
  description = 'Run a whitelisted repository QA command such as build, test, lint, typecheck, git diff, or git status.';
  version = '1.0.0';
  tags = ['repo', 'self-coding', 'qa', 'command'];
  inputSchema = { type: 'object' as const, properties: { command: { type: 'string' }, cwd: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['command'] };
  permissions: ToolPermission[] = ['execute'];
  sideEffects: ToolPermission[] = ['execute'];
  rateLimitPerMinute = 30;
  auditFields = ['command', 'cwd'];

  async execute(input: any) {
    const logs: string[] = [];
    try {
      const command = String(input?.command || '').trim();
      if (!isAllowedCommand(command)) return { ok: false, error: 'command_not_allowed', logs };
      const cwd = input?.cwd ? assertSafeRelativePath(input.cwd).full : getRepoRoot();
      const timeoutMs = Math.min(Number(input?.timeoutMs || 120000), 300000);
      const result = await runSafeCommand(command, cwd, timeoutMs);
      logs.push(`command=${command} exit=${result.code}`);
      return {
        ok: result.code === 0,
        output: {
          command,
          exitCode: result.code,
          stdout: result.stdout.slice(-12000),
          stderr: result.stderr.slice(-12000)
        },
        error: result.code === 0 ? undefined : 'command_failed',
        logs
      };
    } catch (e: any) {
      return { ok: false, error: e.message, logs };
    }
  }
}

export class RepoDiffSummaryTool extends BaseTool {
  name = 'repo_diff_summary';
  description = 'Show a git status and diff summary for repository changes.';
  version = '1.0.0';
  tags = ['repo', 'self-coding', 'diff'];
  inputSchema = { type: 'object' as const, properties: {} };
  permissions: ToolPermission[] = ['read', 'execute'];
  sideEffects: ToolPermission[] = [];
  rateLimitPerMinute = 60;

  async execute() {
    const logs: string[] = [];
    const root = getRepoRoot();
    const status = await runSafeCommand('git status --short', root, 30000);
    const diff = await runSafeCommand('git diff --stat', root, 30000);
    logs.push('diff_summary');
    return {
      ok: status.code === 0 && diff.code === 0,
      output: {
        status: status.stdout,
        diffStat: diff.stdout,
        stderr: [status.stderr, diff.stderr].filter(Boolean).join('\n')
      },
      logs
    };
  }
}
