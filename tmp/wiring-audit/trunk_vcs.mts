// MUSE wiring-audit checkpoint 16: vcs_repo-trunk stories + LEVEL-4 live probes
// + static verification-compat partition.
// Part A: declarations + self-grounded selection for the 11 vcs_repo names
//   (git_local_workflow, git_ops, github_actions, github_pr,
//   github_repo_manager, import_project, repo_apply_patch, repo_diff_summary,
//   repo_read_file, repo_run_command, repo_search)
//   + isVerificationTool partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained fixtures (created +
//   removed by the probe; NO network legs; GitHub legs are no-credential
//   negatives or pre-network schema rejections with dummy tokens only).
// NOTE: RepoSelfCodingTools root at the JOE REPO itself (getRepoRoot), not the
//   session workspace — legs observe that design; the one real-write leg uses
//   a probe-created scratch file under tmp/ and removes it.
// NOTE: import_project persistence is isolated via JOE_CHAT_STORE_DIR pointing
//   at a probe-owned dir (removed after); the real api/data/db store is untouched.
// Run from api/: .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_vcs.mts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'git_local_workflow', 'git_ops', 'github_actions', 'github_pr',
  'github_repo_manager', 'import_project', 'repo_apply_patch', 'repo_diff_summary',
  'repo_read_file', 'repo_run_command', 'repo_search',
];
const TOKEN = 'WIRING_VCS_TOKEN_7c1a';
const CALL_TIMEOUT_MS = 25000;

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 14).join(',')}}`;
  return typeof v;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}

function rankOf(picks: Array<{ name: string; score: number }>, name: string): { rank: number; score: number } | null {
  const i = picks.findIndex(p => p.name === name);
  return i < 0 ? null : { rank: i + 1, score: picks[i].score };
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 60000 });
}

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`TRUNK_VCS_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_VCS_ABORT missing tool ${n}`); process.exit(1); }
  }

  const catalog: any = await imp(path.join(SRC, 'core', 'orchestrator', 'toolCatalog.ts'));
  const selectToolsFor = catalog.selectToolsFor as (goal: string, limit?: number) => Array<{ name: string; score: number }>;
  const excluded: Set<string> = catalog.ROUTER_EXCLUDED as Set<string>;
  let priority: Set<string> | null = null;
  try {
    const picker: any = await imp(path.join(SRC, 'core', 'llm', 'tool-picker.ts'));
    const names = picker.PRIORITY_TOOL_NAMES;
    if (Array.isArray(names)) priority = new Set(names.map(String));
  } catch { priority = null; }
  const fullLimit = tools.length;

  const ledger: any = await imp(path.join(SRC, 'core', 'quality', 'verification-ledger.ts'));
  const isVerificationTool = ledger.isVerificationTool as (t: string, a?: any, e?: boolean, x?: boolean, l?: boolean) => boolean;
  const verdictOf = ledger.verificationResultFromToolResult as (v: unknown) => string;

  // ---- Part A: declarations + selection + checker partition ----
  const decl: Record<string, any> = {};
  for (const n of TRUNK) {
    const t = byName.get(n);
    const desc: string = String(t?.description || '');
    const firstSentence = desc.split(/(?<=[.])\s/)[0].slice(0, 140).trim();
    const goals = [
      `use ${n.split('_').join(' ')} for this task`,
      firstSentence ? `I need: ${firstSentence}` : `use ${n.split('_').join(' ')}`,
    ];
    const ranks = goals.map(g => {
      const top30 = selectToolsFor(g, 30);
      const all = selectToolsFor(g, fullLimit);
      return { goal: g, rank30: rankOf(top30, n), rankFull: rankOf(all, n) };
    });
    const best30 = Math.min(...ranks.map(r => r.rank30?.rank ?? Infinity));
    const bestFull = Math.min(...ranks.map(r => r.rankFull?.rank ?? Infinity));
    decl[n] = {
      descriptionHead: desc.slice(0, 160),
      tags: Array.isArray(t?.tags) ? t.tags.map(String) : [],
      required: Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required : null,
      properties: t?.inputSchema?.properties && typeof t.inputSchema.properties === 'object' ? Object.keys(t.inputSchema.properties) : null,
      permissions: Array.isArray(t?.permissions) ? t.permissions.map(String) : t?.permissions ?? null,
      sideEffects: Array.isArray(t?.sideEffects) ? t.sideEffects.map(String) : t?.sideEffects ?? null,
      rateLimitPerMinute: t?.rateLimitPerMinute ?? null,
      routerExcluded: excluded ? excluded.has(n) : null,
      priorityListed: priority ? priority.has(n) : null,
      verdict: best30 <= 30 ? 'SELECTABLE_BY_KEYWORD' : (bestFull <= fullLimit ? 'LONG_TAIL_RANKED' : 'UNSELECTABLE_EVEN_SELF_GROUNDED'),
      bestRank30: best30 === Infinity ? null : best30,
      bestRankFull: bestFull === Infinity ? null : bestFull,
      top3SelfName: selectToolsFor(goals[0], 30).slice(0, 3).map(p => `${p.name}:${p.score}`),
      checkerTaskLevel: isVerificationTool(n, {}, false, false, false),
      checkerGateExistence: isVerificationTool(n, {}, false, true, false),
      checkerGateLive: isVerificationTool(n, {}, false, false, true),
    };
  }

  // ---- Part B: pure-function verdict table (source-grounded shapes) ----
  const verdictTable: Record<string, string> = {
    'git status-ok': verdictOf({ ok: true, output: { output: 'M file.ts\n?? new.ts\n' } }),
    'import no-url-guidance': verdictOf({ ok: true, output: { message: 'Give me the repository URL, e.g. "import https://github.com/user/repo".' } }),
    'import local-ok': verdictOf({ ok: true, output: { message: 'analysis…', dir: '/fx', analysis: {}, repositoryAudit: {} } }),
    'read seeded': verdictOf({ ok: true, output: { path: 'AGENTS.md', content: '# …', bytes: 12 } }),
    'search seeded': verdictOf({ ok: true, output: { query: 'q', matches: [{ path: 'a', line: 1 }], count: 1 } }),
    'patch dryrun': verdictOf({ ok: true, output: { path: 'f', dryRun: true, changed: true, preview: '- a\n+ b' } }),
    'patch applied': verdictOf({ ok: true, output: { path: 'f', dryRun: false, changed: true, preview: '- a\n+ b' } }),
    'runcmd git-ok': verdictOf({ ok: true, output: { command: 'git status --short', exitCode: 0, stdout: '', stderr: '' } }),
    'runcmd failed': verdictOf({ ok: false, error: 'command_failed', output: { command: 'git status --short', exitCode: 128, stdout: '', stderr: 'fatal' } }),
    'diff summary': verdictOf({ ok: true, output: { status: '', diffStat: '', stderr: '' } }),
    'actions generated': verdictOf({ ok: true, output: { success: true, workflowPath: '/w/node-ci.yml', workflowType: 'node-ci', message: 'created' } }),
    'pr listed': verdictOf({ ok: true, output: { success: true, prs: [], message: 'Listed 0 pull requests' } }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-vcs-fx');
  const FXGIT = path.join(FX, 'fxgit');
  const FXGIT2 = path.join(FX, 'fxgit2');
  const FXACTIONS = path.join(FX, 'fxactions');
  const FXPROJ = path.join(FX, 'fxproj');
  const OUTSIDE_DIR = path.join(os.tmpdir(), `wiring-vcs-outside-${TOKEN}`);
  const OUTSIDE_FILE = path.join(OUTSIDE_DIR, 'outside.txt');
  const OUTSIDE_GIT = path.join(OUTSIDE_DIR, 'ogit');
  const STORE = path.join(FX, 'fxstore');
  for (const d of [FXGIT, FXGIT2, FXACTIONS, FXPROJ, OUTSIDE_DIR, OUTSIDE_GIT, STORE]) fs.mkdirSync(d, { recursive: true });
  process.env.JOE_CHAT_STORE_DIR = STORE;
  const hadGithubTokenEnv = !!process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  // Normalize git identity/config resolution for probe- AND tool-spawned git:
  // the sandbox user cannot read the owner's global gitconfig/ignore (pilot:
  // dubious-ownership fatals + ignore warnings polluted repo-rooted legs).
  // Empty system/global configs + env-scoped safe.directory keep every leg
  // user-independent. Recorded, not hidden: see gitEnv in output.
  const GITENV = path.join(FX, 'fx-gitenv');
  fs.mkdirSync(GITENV, { recursive: true });
  fs.writeFileSync(path.join(GITENV, 'system'), '');
  fs.writeFileSync(path.join(GITENV, 'global'), '');
  process.env.HOME = GITENV;
  process.env.XDG_CONFIG_HOME = GITENV;
  process.env.GIT_CONFIG_SYSTEM = path.join(GITENV, 'system');
  process.env.GIT_CONFIG_GLOBAL = path.join(GITENV, 'global');
  process.env.GIT_CONFIG_COUNT = '1';
  process.env.GIT_CONFIG_KEY_0 = 'safe.directory';
  process.env.GIT_CONFIG_VALUE_0 = ROOT.replace(/\\/g, '/');
  const gitEnv = { homeIsolated: process.env.HOME === GITENV, safeDirectory: process.env.GIT_CONFIG_VALUE_0 };
  // Seeded git fixtures: FXGIT has 1 commit + 1 untracked file; FXGIT2 is clean.
  for (const d of [FXGIT, FXGIT2, OUTSIDE_GIT]) {
    git(d, ['init', '-q']);
    git(d, ['config', 'user.email', 'fx@joe.local']);
    git(d, ['config', 'user.name', 'fx']);
    git(d, ['config', 'commit.gpgsign', 'false']);
  }
  fs.writeFileSync(path.join(FXGIT, 'README.md'), `# fx ${TOKEN}\n`);
  git(FXGIT, ['add', '--', 'README.md']);
  git(FXGIT, ['commit', '-q', '-m', 'seed']);
  fs.writeFileSync(path.join(FXGIT, 'untracked.txt'), `untracked ${TOKEN}\n`);
  fs.writeFileSync(path.join(FXGIT2, 'README.md'), `# fx2 ${TOKEN}\n`);
  git(FXGIT2, ['add', '--', 'README.md']);
  git(FXGIT2, ['commit', '-q', '-m', 'seed2']);
  fs.writeFileSync(path.join(OUTSIDE_GIT, 'README.md'), `# outside ${TOKEN}\n`);
  git(OUTSIDE_GIT, ['add', '--', 'README.md']);
  git(OUTSIDE_GIT, ['commit', '-q', '-m', 'seed-out']);
  fs.writeFileSync(OUTSIDE_FILE, `outside marker ${TOKEN}\n`);
  // import_project fixture: package.json with a conventional test script but
  // NO node_modules -> audit must report skipped_dependencies_missing without
  // executing anything.
  fs.writeFileSync(path.join(FXPROJ, 'package.json'), JSON.stringify({ name: 'fx-proj', scripts: { test: 'jest' } }));
  fs.writeFileSync(path.join(FXPROJ, 'index.js'), `module.exports = '${TOKEN}';\n`);
  // repo_apply_patch scratch lives at the JOE REPO root (tool design); probe
  // creates + removes it.
  const PATCH_REL = 'tmp/wiring-vcs-patch-fx.txt';
  const PATCH_ABS = path.join(ROOT, PATCH_REL);
  const PATCH_BEFORE = `alpha AAA omega ${TOKEN}\n`;
  fs.writeFileSync(PATCH_ABS, PATCH_BEFORE);

  const live: Record<string, any> = {};
  const run = async (id: string, name: string, input: any, timeoutMs = CALL_TIMEOUT_MS) => {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool(name, input, ctx),
          { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' }),
        timeoutMs);
      if (raced.timedOut) { live[id] = { input: JSON.stringify(input).slice(0, 200), timeoutMs, timedOut: true }; return; }
      const r: any = (raced as any).value;
      const o = r?.output;
      live[id] = {
        input: JSON.stringify(input).slice(0, 200),
        ok: !!r?.ok,
        error: r?.error ? String(r.error).slice(0, 220) : null,
        outputShape: shape(o),
        outputPreview: typeof o === 'string' ? o.slice(0, 600)
          : (o && typeof o === 'object' ? JSON.stringify(o).slice(0, 1200) : null),
        log0: Array.isArray(r?.logs) && r.logs.length ? String(r.logs[0]).slice(0, 160) : null,
      };
    } catch (e: any) {
      live[id] = { input: JSON.stringify(input).slice(0, 200), threw: String(e?.message || e).slice(0, 220) };
    }
  };

  // git_ops: arbitrary argv git; cwd honored raw, default = no-arg active root.
  await run('git.status-seeded', 'git_ops', { operation: 'status', args: ['--short'], cwd: FXGIT });
  await run('git.invalid-op', 'git_ops', { operation: '!!!bogus', args: [], cwd: FXGIT });
  await run('git.missing-cwd', 'git_ops', { operation: 'status', args: ['--short'], cwd: path.join(FXGIT, 'nope') });
  await run('git.clone-noargs', 'git_ops', { operation: 'clone', args: [], cwd: FXGIT });
  await run('git.outside-cwd', 'git_ops', { operation: 'status', args: ['--short'], cwd: OUTSIDE_GIT });
  await run('git.default-cwd', 'git_ops', { operation: 'status', args: ['--short'] });
  await run('git.push-approval', 'git_ops', { operation: 'push', args: [], cwd: FXGIT });
  // git_local_workflow: session-bound imported project via global.joeProjects.
  await run('local.empty-request', 'git_local_workflow', { request: '' });
  await run('local.no-import', 'git_local_workflow', { request: 'create branch called joe/fx-audit-16 and documentation note' });
  (global as any).joeProjects = (global as any).joeProjects || {};
  (global as any).joeProjects['audit-sess'] = { dir: FXGIT2 };
  await run('local.positive', 'git_local_workflow', { request: 'create branch called joe/fx-audit-16 and documentation note docs/fx16/note.md' });
  let localVerify: any = null;
  try {
    localVerify = {
      branch: git(FXGIT2, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
      status: git(FXGIT2, ['status', '--short']).trim(),
      noteExists: fs.existsSync(path.join(FXGIT2, 'docs', 'fx16', 'note.md')),
      log1: git(FXGIT2, ['log', '--oneline', '-n', '1']).trim().slice(0, 120),
    };
  } catch (e: any) { localVerify = { threw: String(e?.message || e).slice(0, 160) }; }
  delete (global as any).joeProjects['audit-sess'];
  // import_project: URL guidance, path containment, local-folder positive.
  await run('import.no-url', 'import_project', { request: 'please import my project' });
  await run('import.missing-path', 'import_project', { request: 'open it', path: 'wiring-vcs-nope' });
  await run('import.outside-absolute', 'import_project', { request: 'open it', path: OUTSIDE_DIR });
  await run('import.local-positive', 'import_project', { request: 'open and review this project', path: 'wiring-vcs-fx/fxproj' });
  // repo_read_file: rooted at the JOE REPO (self-coding design).
  await run('read.seeded', 'repo_read_file', { path: 'AGENTS.md' });
  await run('read.missing', 'repo_read_file', { path: 'wiring-vcs-nope.txt' });
  await run('read.absolute', 'repo_read_file', { path: OUTSIDE_FILE });
  await run('read.env', 'repo_read_file', { path: '.env' });
  await run('read.escape', 'repo_read_file', { path: '../outside.txt' });
  // repo_search: rooted at the JOE REPO.
  await run('search.seeded', 'repo_search', { query: 'repo_run_command', path: 'api/src/modules/tools/definitions' });
  await run('search.empty-query', 'repo_search', { query: '' });
  await run('search.missing-base', 'repo_search', { query: 'x', path: 'wiring-vcs-nope' });
  // repo_apply_patch: dryRun defaults true; one real write on probe scratch.
  await run('patch.dryrun', 'repo_apply_patch', { path: PATCH_REL, find: 'AAA', replace: 'BBB' });
  const patchAfterDry = fs.readFileSync(PATCH_ABS, 'utf-8');
  await run('patch.find-missing', 'repo_apply_patch', { path: PATCH_REL, find: 'ZZZ-nope-16', replace: 'x' });
  await run('patch.env', 'repo_apply_patch', { path: '.env', find: 'a', replace: 'b' });
  await run('patch.real-write', 'repo_apply_patch', { path: PATCH_REL, find: 'AAA', replace: 'BBB', dryRun: false });
  const patchAfterWrite = fs.readFileSync(PATCH_ABS, 'utf-8');
  // repo_run_command: prefix allowlist; chaining/shape probes are read-only.
  await run('runcmd.git-status', 'repo_run_command', { command: 'git status --short' });
  await run('runcmd.blocked', 'repo_run_command', { command: 'rm -rf /tmp/x' });
  await run('runcmd.chain', 'repo_run_command', { command: 'git status --short && echo VCSSAFE16' });
  await run('runcmd.chain-small', 'repo_run_command', { command: 'git log --oneline -n 1 && echo VCSSAFE16' });
  const SHELLMARK = path.join(ROOT, 'wiring-vcs-shellmark.txt');
  try { fs.rmSync(SHELLMARK, { force: true }); } catch { /* best effort */ }
  await run('runcmd.redirect-shellmark', 'repo_run_command', { command: 'git status --short > wiring-vcs-shellmark.txt' });
  const shellmarkEvidence = {
    fileCreated: fs.existsSync(SHELLMARK),
    head: fs.existsSync(SHELLMARK) ? fs.readFileSync(SHELLMARK, 'utf-8').slice(0, 80) : null,
  };
  try { fs.rmSync(SHELLMARK, { force: true }); } catch { /* best effort */ }
  const shellmarkRemoved = !fs.existsSync(SHELLMARK);
  await run('runcmd.cwd-escape', 'repo_run_command', { command: 'git status --short', cwd: '../..' });
  // repo_diff_summary: git status + diff stat of the JOE REPO.
  await run('diff.summary', 'repo_diff_summary', {});
  // github_pr: no network; dummy token only reaches the pre-network switch.
  await run('pr.no-token', 'github_pr', { action: 'list', owner: 'o', repo: 'r' });
  await run('pr.merge-unknown', 'github_pr', { action: 'merge', owner: 'o', repo: 'r', token: 'dummy-no-network-token' });
  // github_repo_manager: auth gate + enum-vs-switch gap, no network.
  await run('mgr.no-token-no-repo', 'github_repo_manager', { action: 'analyze' });
  await run('mgr.push-unknown', 'github_repo_manager', { action: 'push', repoName: 'o/r', token: 'dummy-no-network-token' });
  // github_actions: local generator; containment + substitution + traversal.
  await run('actions.list-runs', 'github_actions', { action: 'list_runs', workflowType: 'node-ci', projectPath: FXACTIONS });
  await run('actions.missing-type', 'github_actions', { projectPath: FXACTIONS });
  await run('actions.seeded', 'github_actions', { workflowType: 'node-ci', projectPath: FXACTIONS });
  const seededYml = path.join(FXACTIONS, '.github', 'workflows', 'node-ci.yml');
  const seededHead = fs.existsSync(seededYml) ? fs.readFileSync(seededYml, 'utf-8').slice(0, 60) : null;
  await run('actions.bogus-type', 'github_actions', { workflowType: 'bogus-type-16', projectPath: FXACTIONS });
  const bogusYml = path.join(FXACTIONS, '.github', 'workflows', 'bogus-type-16.yml');
  const bogusHead = fs.existsSync(bogusYml) ? fs.readFileSync(bogusYml, 'utf-8').slice(0, 60) : null;
  await run('actions.traversal', 'github_actions', { workflowType: '../../traversal16', projectPath: FXACTIONS });
  const traversalLanded = path.join(FXACTIONS, 'traversal16.yml');
  const traversalInside = path.join(FXACTIONS, '.github', 'workflows', '..', '..', 'traversal16.yml');
  const traversalEvidence = {
    landedOutsideWorkflowsDir: fs.existsSync(traversalLanded),
    landedHead: fs.existsSync(traversalLanded) ? fs.readFileSync(traversalLanded, 'utf-8').slice(0, 60) : null,
    workflowsDirClean: fs.existsSync(path.join(FXACTIONS, '.github', 'workflows', 'traversal16.yml')) ? false : true,
    normalizedSame: path.normalize(traversalInside) === path.normalize(traversalLanded),
  };
  await run('actions.outside-write', 'github_actions', { workflowType: 'node-ci', projectPath: OUTSIDE_DIR });
  const outsideYml = path.join(OUTSIDE_DIR, '.github', 'workflows', 'node-ci.yml');
  const outsideWrote = fs.existsSync(outsideYml);

  const patchEvidence = {
    dryRunPreserved: patchAfterDry === PATCH_BEFORE,
    writeApplied: patchAfterWrite !== PATCH_BEFORE && patchAfterWrite.includes('BBB'),
  };
  let storeEvidence: any = null;
  try {
    storeEvidence = {
      storeFile: fs.existsSync(path.join(STORE, 'joe-projects.json')),
      storeKeys: fs.existsSync(path.join(STORE, 'joe-projects.json'))
        ? Object.keys(JSON.parse(fs.readFileSync(path.join(STORE, 'joe-projects.json'), 'utf-8'))).slice(0, 6)
        : null,
    };
  } catch (e: any) { storeEvidence = { threw: String(e?.message || e).slice(0, 160) }; }
  const realStore = path.join(ROOT, 'api', 'data', 'db', 'joe-projects.json');
  const realStoreEvidence = { exists: fs.existsSync(realStore) };

  for (const d of [FX, OUTSIDE_DIR]) fs.rmSync(d, { recursive: true, force: true });
  try { fs.rmSync(PATCH_ABS, { force: true }); } catch { /* best effort */ }
  const fxGone = ![FX, OUTSIDE_DIR, PATCH_ABS].some(d => fs.existsSync(d));

  const out = {
    generatedAt: new Date().toISOString(),
    trunk: 'vcs_repo',
    declarations: decl,
    verdictTable,
    live,
    sessionRoot,
    hadGithubTokenEnv,
    gitEnv,
    localVerify,
    patchEvidence,
    actionsEvidence: { seededHead, bogusHead, traversalEvidence, outsideWrote },
    storeEvidence,
    realStoreEvidence,
    shellmarkEvidence,
    shellmarkRemoved,
    fixtures: { removed: fxGone },
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'trunk_vcs.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    declVerdicts: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.verdict])),
    checkerTaskLevel: Object.fromEntries(Object.entries(decl).map(([k, v]: any) => [k, v.checkerTaskLevel])),
    verdictTable, live, hadGithubTokenEnv, gitEnv, localVerify, patchEvidence,
    seededHead, bogusHead, traversalEvidence, outsideWrote, storeEvidence,
    realStoreEvidence, shellmarkEvidence, shellmarkRemoved, fixturesRemoved: fxGone,
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
  process.exit(0);
}

main().catch(e => { console.error('TRUNK_VCS_FAILED', e); process.exit(1); });
