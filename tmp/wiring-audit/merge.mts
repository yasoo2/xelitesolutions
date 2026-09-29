// MUSE wiring-audit grouping merge pass (checkpoint 5).
// Folds the 75 primary-tag clusters (target.json groupingDraft.clusters)
// into 19 purpose trunks. The mapping table below is the audit judgment —
// explicit, reviewable, and asserted for exact coverage (75/75 tags,
// 163/163 members). Grounded in registry descriptions (sweep1.json).
// This proposes HIGH_LEVEL candidate groups; it does NOT prove 19
// capabilities — each trunk still needs its own path/contract story.
// Run from repo root: node --experimental-strip-types tmp/wiring-audit/merge.mts
// (or via tsx from api/).
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const TRUNKS: Record<string, { why: string; tags: string[] }> = {
  browser_ui: { why: 'operate/inspect/repair pages in a real browser', tags: ['browser'] },
  code_understanding: { why: 'read, analyze, review and navigate code', tags: ['analysis', 'code', 'review', 'audit', 'refactor', 'engineering'] },
  files: { why: 'read/write/edit/list/archive workspace files', tags: ['fs', 'files', 'edit'] },
  vcs_repo: { why: 'version control and repository operations incl. GitHub', tags: ['repo', 'git', 'import', 'github'] },
  build_generate: { why: 'generate/scaffold/build projects, systems and templates', tags: ['build', 'scaffold', 'codegen', 'generation', 'templates', 'mobile', 'web', 'pipeline', 'auth', 'enterprise', 'orion'] },
  runtime_services: { why: 'run/stop/serve/deploy projects', tags: ['run', 'dev', 'deploy'] },
  shell_terminal: { why: 'shell commands, terminals and npm', tags: ['shell', 'npm'] },
  testing_qa: { why: 'generate and run tests, quality gates', tags: ['testing', 'quality'] },
  network_api: { why: 'HTTP/network/API interaction incl. search, accounts, payments', tags: ['network', 'api', 'search', 'payments', 'google'] },
  database_data: { why: 'databases, datastores and data query/transform', tags: ['database', 'data', 'orders'] },
  infra_ops: { why: 'containers, orchestration, IaC, CI and cost', tags: ['infrastructure', 'docker', 'ci', 'cost'] },
  observability: { why: 'logs, metrics, alerts and performance', tags: ['monitoring', 'logging', 'alerts', 'performance'] },
  security: { why: 'scan/audit secrets, deps and repos', tags: ['security'] },
  language_runtimes: { why: 'build/run Python, Go, Java', tags: ['python', 'go', 'java'] },
  media_images: { why: 'video/audio processing and image fill', tags: ['media', 'images'] },
  planning_orchestration: { why: 'plan, phase, route, recover and report engineering work', tags: ['planning', 'execution', 'project', 'capability', 'decision', 'joe', 'error'] },
  memory_knowledge: { why: 'remember, recall, cache and checkpoint across runs', tags: ['memory', 'knowledge', 'cache', 'state'] },
  interaction: { why: 'talk to / update / track for the user', tags: ['user', 'utility', 'communication', 'system', 'task', 'profile', 'forms', 'qa'] },
  documentation: { why: 'generate docs and translate content', tags: ['documentation', 'i18n'] },
};

function main() {
  const target = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp', 'wiring-audit', 'target.json'), 'utf8'));
  const clusters: Record<string, string[]> = target.groupingDraft.clusters;
  const allTags = Object.keys(clusters);
  const mappedTags = Object.values(TRUNKS).flatMap(t => t.tags);
  const missing = allTags.filter(t => !mappedTags.includes(t));
  const extra = mappedTags.filter(t => !allTags.includes(t));
  const dupes = mappedTags.filter((t, i) => mappedTags.indexOf(t) !== i);
  if (missing.length || extra.length || dupes.length) {
    console.error('MERGE_COVERAGE_FAIL', JSON.stringify({ missing, extra, dupes }));
    process.exit(1);
  }
  const trunks: Record<string, any> = {};
  let memberTotal = 0;
  for (const [trunk, spec] of Object.entries(TRUNKS)) {
    const members = spec.tags.flatMap(t => clusters[t]);
    memberTotal += members.length;
    trunks[trunk] = { why: spec.why, tags: spec.tags, count: members.length, members: members.slice().sort() };
  }
  const registered = allTags.reduce((n, t) => n + clusters[t].length, 0);
  if (memberTotal !== registered) {
    console.error('MERGE_COUNT_FAIL', JSON.stringify({ memberTotal, registered }));
    process.exit(1);
  }
  const out = {
    generatedAt: new Date().toISOString(),
    method: 'purpose-merge of 75 primary-tag clusters; mapping table in merge.mts (explicit judgment, grounded in sweep1 descriptions)',
    status: 'PROPOSED_TRUNKS_V1 — not proven capabilities; per-trunk path/contract stories pending',
    trunkCount: Object.keys(trunks).length,
    memberTotal,
    trunks,
  };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'merge.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    trunkCount: out.trunkCount, memberTotal,
    sizes: Object.entries(trunks).map(([k, v]: any) => `${k}=${v.count}`).join(' '),
  }, null, 1));
  console.log(`wrote ${jsonPath}`);
}

main();
